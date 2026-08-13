-- 判定1回分。再レビューは round=2 以降の別行として積む（履歴を潰さない）。
CREATE TABLE IF NOT EXISTS analysis (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at         TEXT    NOT NULL,
  parent_analysis_id INTEGER REFERENCES analysis(id),
  root_analysis_id   INTEGER,          -- 系列の先頭。round=1 では自分自身
  round              INTEGER NOT NULL DEFAULT 1,
  shop_name          TEXT,
  girl_name          TEXT,
  raw_profile        TEXT    NOT NULL,
  meta_json          TEXT    NOT NULL, -- 写真枚数・口コミ数・料金などの構造シグナル
  result_json        TEXT    NOT NULL, -- LLM 出力そのまま
  provider           TEXT    NOT NULL,
  model              TEXT    NOT NULL,
  lexicon_version    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analysis_root    ON analysis(root_analysis_id, round);
CREATE INDEX IF NOT EXISTS idx_analysis_created ON analysis(created_at DESC);

-- 裏読み1件。lexicon_id ごとの集計を可能にするための正規化。
CREATE TABLE IF NOT EXISTS reading (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  lexicon_id  TEXT,
  quote       TEXT,
  skeptical   TEXT,
  confidence  REAL
);
CREATE INDEX IF NOT EXISTS idx_reading_analysis ON reading(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reading_lexicon  ON reading(lexicon_id);

-- 「確認すべきこと」とその結果。ここが再レビューの入力になる。
CREATE TABLE IF NOT EXISTS verification (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES analysis(id) ON DELETE CASCADE,
  question    TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'unchecked', -- unchecked|confirmed|denied|unknown
  note        TEXT,
  checked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_verification_analysis ON verification(analysis_id);

-- 過去実績の一括登録（記憶ベース）。
CREATE TABLE IF NOT EXISTS past_case (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at       TEXT    NOT NULL,
  raw_text         TEXT    NOT NULL, -- 入力された自由記述そのまま
  structured_json  TEXT    NOT NULL, -- AI が構造化した結果
  shop_name        TEXT,
  girl_name        TEXT,
  recall_confidence REAL             -- AI 自己申告の記憶の確からしさ
);

-- 登楼後の実績。analysis 由来（実測）と past_case 由来（記憶）の両方を受ける。
CREATE TABLE IF NOT EXISTS outcome (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL,
  analysis_id     INTEGER REFERENCES analysis(id) ON DELETE CASCADE,
  past_case_id    INTEGER REFERENCES past_case(id) ON DELETE CASCADE,
  visited_at      TEXT,
  satisfaction    INTEGER,  -- 1-5 総合
  service_rating  INTEGER,  -- 1-5 サービス
  photo_match     INTEGER,  -- 1-5 写真との一致
  attitude_rating INTEGER,  -- 1-5 接客態度
  note            TEXT,
  CHECK (analysis_id IS NOT NULL OR past_case_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_outcome_analysis ON outcome(analysis_id);

-- 学習の本体。表現ごとの的中/外れ。記憶ベースは 0.5 加算なので REAL。
CREATE TABLE IF NOT EXISTS lexicon_stat (
  lexicon_id TEXT PRIMARY KEY,
  hits       REAL NOT NULL DEFAULT 0,
  misses     REAL NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- 監査ログ。lexicon_stat は集計値で巻き戻せないため、根拠を残して再集計可能にする。
CREATE TABLE IF NOT EXISTS lexicon_evidence (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  lexicon_id TEXT NOT NULL,
  source     TEXT NOT NULL, -- rereview | outcome | recall
  verdict    TEXT NOT NULL, -- confirmed | refuted
  weight     REAL NOT NULL, -- recall は 0.5、実測は 1.0
  ref_table  TEXT,          -- analysis | past_case
  ref_id     INTEGER,
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_lexicon ON lexicon_evidence(lexicon_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_dedup
  ON lexicon_evidence(lexicon_id, source, ref_table, ref_id);
