import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite 接続のシングルトン。
 * Next.js の開発サーバーはモジュールを再評価するので globalThis に載せて
 * 接続とマイグレーションが多重に走らないようにする。
 */
const MIGRATIONS_DIR = path.join(process.cwd(), "src", "db", "migrations");

type Global = typeof globalThis & { __oneesanDb?: Database.Database };
const g = globalThis as Global;

function applyMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migration (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    db.prepare<[], { name: string }>("SELECT name FROM _migration").all().map((r) => r.name),
  );

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()
    : [];

  const record = db.prepare("INSERT INTO _migration (name, applied_at) VALUES (?, ?)");
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    // マイグレーション1本を1トランザクションに収める。途中で落ちても半端に適用されない。
    db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    })();
  }
}

export function getDb(): Database.Database {
  if (g.__oneesanDb) return g.__oneesanDb;

  const dbPath = process.env.DATABASE_PATH ?? "./data/oneesan.db";

  /**
   * 読み取り専用で開く経路。MCP サーバー（Claude Desktop から読ませる口）が使う。
   * 「書く道具を用意していない」だけでは不十分で、SQLite の側で書けないように
   * しておく。学習データは手で入力した資産なので、外から壊せる余地を残さない。
   */
  if (process.env.ONEESAN_READONLY === "1") {
    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `データベースが見つかりません: ${path.resolve(dbPath)}\n` +
          "一度アプリを起動してから、もう一度お試しください。",
      );
    }
    // journal_mode の変更は書き込みになるので触らない。移行も走らせない。
    const ro = new Database(dbPath, { readonly: true });
    g.__oneesanDb = ro;
    return ro;
  }

  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);

  g.__oneesanDb = db;
  return db;
}

export const nowIso = (): string => new Date().toISOString();
