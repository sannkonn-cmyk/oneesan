import { getDb, nowIso } from "./db";

/**
 * 利用者が確認に使える手段。
 * これは「絞り込み」というより「AI に手段を散らさせる」ための一覧。
 * 既定は全部で、使わないものだけ外す運用を想定する。
 */
export const VERIFY_CHANNELS = [
  { id: "phone", label: "電話で聞く", hint: "予約電話でサービス内容などを確かめる" },
  { id: "diary", label: "写メ日記を読む", hint: "本人が書いているか、内容が具体的か" },
  { id: "review", label: "口コミを調べる", hint: "時期をずらして評価の変化を見る" },
  { id: "profile", label: "プロフィールを読み直す", hint: "他の嬢と見比べる、店の書き癖を見る" },
  { id: "sns", label: "店のサイト・SNS を見る", hint: "出勤状況、店側の推し方" },
  { id: "onsite", label: "当日その場で見る", hint: "受付の様子、写真との一致" },
] as const;

export type InstructionKind = "policy" | "glossary";

export const KIND_LABEL: Record<InstructionKind, string> = {
  glossary: "用語",
  policy: "方針",
};

export interface Instruction {
  id: number;
  kind: InstructionKind;
  text: string;
}

export interface Settings {
  channels: string[];
  instructions: Instruction[];
}

const CHANNELS_KEY = "verify_channels";
const ALL_CHANNELS: string[] = VERIFY_CHANNELS.map((c) => c.id);

interface SettingRow {
  value: string;
}

/** 有効な確認手段。未設定・空・壊れている場合はすべて有効として扱う。 */
export function getChannels(): string[] {
  const row = getDb()
    .prepare<[string], SettingRow>("SELECT value FROM setting WHERE key = ?")
    .get(CHANNELS_KEY);
  if (!row) return [...ALL_CHANNELS];

  try {
    const ids = JSON.parse(row.value) as unknown;
    if (!Array.isArray(ids)) return [...ALL_CHANNELS];
    const valid = ids.filter((i): i is string => typeof i === "string" && ALL_CHANNELS.includes(i));
    // 一つも選ばれていない状態は、確認事項が作れず道具として成立しない。
    // 画面側でも止めるが、ここでも保険をかける。
    return valid.length ? valid : [...ALL_CHANNELS];
  } catch {
    return [...ALL_CHANNELS];
  }
}

export function saveChannels(ids: string[]): void {
  const valid = ids.filter((i) => ALL_CHANNELS.includes(i));
  const value = JSON.stringify(valid.length ? valid : ALL_CHANNELS);
  getDb()
    .prepare(
      `INSERT INTO setting (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(CHANNELS_KEY, value, nowIso());
}

/** 用語を先に返す。プロンプトでも用語を先に置く（読み替えは前提条件なので）。 */
export function listInstructions(): Instruction[] {
  return getDb()
    .prepare<[], Instruction>(
      `SELECT id, kind, text FROM instruction
       ORDER BY CASE kind WHEN 'glossary' THEN 0 ELSE 1 END, id`,
    )
    .all();
}

export function addInstruction(kind: InstructionKind, text: string): number {
  const body = text.trim();
  if (!body) throw new Error("内容が空です");
  const info = getDb()
    .prepare("INSERT INTO instruction (created_at, kind, text) VALUES (?, ?, ?)")
    .run(nowIso(), kind, body);
  return Number(info.lastInsertRowid);
}

export function deleteInstruction(id: number): void {
  getDb().prepare("DELETE FROM instruction WHERE id = ?").run(id);
}

export function getSettings(): Settings {
  return { channels: getChannels(), instructions: listInstructions() };
}
