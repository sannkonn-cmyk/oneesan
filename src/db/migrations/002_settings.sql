-- 選択式の設定。項目が増えても表を足さずに済むよう key-value で持つ。
CREATE TABLE IF NOT EXISTS setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- AI への申し送り。1件ずつ足して消せるようにするため行で持つ。
--
-- kind を分けているのは、性質が違うものを同じ枠で渡すと効かないため。
--   glossary : 「VIPサービス＝中出し」のような言い回しの読み替え。**事実**
--   policy   : 「日記の内容を重く見てほしい」のような好み。**要望**
-- 事実を「尊重してください」と渡すと忖度として扱われ、読みの根拠にならない。
CREATE TABLE IF NOT EXISTS instruction (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'policy',
  text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_instruction_kind ON instruction(kind, id);
