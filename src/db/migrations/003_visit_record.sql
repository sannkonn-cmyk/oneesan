-- 登楼記録をシティヘブンの口コミに寄せて広げる。
--
-- 表を作り直しているのは、ALTER TABLE では CHECK 制約を外せないため。
-- 判定を通していない子の記録も残せるようにするので、
-- 「analysis か past_case のどちらかに必ず紐づく」という縛りを解く必要がある。
--
-- 点数は 0.1 刻みになるので REAL で宣言し直す。SQLite は型に緩いので
-- 実害は無いが、INTEGER と書いてあるのに小数が入っていると読む人が誤解する。
--
-- 既存の行はそのまま写す。この移行は1本でトランザクションに入るので
-- （src/lib/db.ts の applyMigrations）、途中で落ちても半端に適用されない。

CREATE TABLE outcome_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT NOT NULL,

  -- 判定に紐づく記録なら analysis_id、記憶で入れた過去分なら past_case_id。
  -- どちらも無い「単独の記録」も許す。その場合は下の名前欄を使う。
  analysis_id     INTEGER REFERENCES analysis(id)  ON DELETE CASCADE,
  past_case_id    INTEGER REFERENCES past_case(id) ON DELETE CASCADE,
  shop_name       TEXT,
  girl_name       TEXT,

  visited_at      TEXT,

  -- 1.0〜5.0（0.1 刻み）。空は「未入力」で、悪い評価とは区別する。
  satisfaction    REAL,  -- 総合満足度（このアプリ独自。学習の要）
  girl_rating     REAL,  -- 女の子
  service_rating  REAL,  -- プレイ
  price_rating    REAL,  -- 料金
  photo_match     REAL,  -- 写真
  attitude_rating REAL,  -- 接客態度（入力欄からは外したが、既存の記録のために残す）

  review_title    TEXT,  -- 口コミタイトル
  about_her       TEXT,  -- お相手の女性について
  play_detail     TEXT,  -- プレイ内容（口コミサイトの検閲を受けない、そのままの記述）
  note            TEXT   -- 今回の総評
);

INSERT INTO outcome_new
  (id, created_at, analysis_id, past_case_id, visited_at,
   satisfaction, service_rating, photo_match, attitude_rating, note)
SELECT
   id, created_at, analysis_id, past_case_id, visited_at,
   satisfaction, service_rating, photo_match, attitude_rating, note
FROM outcome;

DROP TABLE outcome;
ALTER TABLE outcome_new RENAME TO outcome;

CREATE INDEX IF NOT EXISTS idx_outcome_analysis ON outcome(analysis_id);
CREATE INDEX IF NOT EXISTS idx_outcome_visited  ON outcome(visited_at DESC, id DESC);
