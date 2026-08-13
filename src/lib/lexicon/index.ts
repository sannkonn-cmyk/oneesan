import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type {
  Lexicon,
  LexiconEntry,
  LexiconHit,
  MetaCondition,
  ProfileMeta,
} from "./types";

const LEXICON_PATH = path.join(process.cwd(), "src", "lib", "lexicon", "lexicon.yaml");

type Global = typeof globalThis & { __oneesanLexicon?: Lexicon };
const g = globalThis as Global;

function validate(lex: Lexicon): void {
  if (!lex?.version) throw new Error("lexicon.yaml: version がありません");
  if (!Array.isArray(lex.entries)) throw new Error("lexicon.yaml: entries がありません");

  const seen = new Set<string>();
  for (const e of lex.entries) {
    if (!e.id) throw new Error("lexicon.yaml: id の無いエントリがあります");
    if (seen.has(e.id)) throw new Error(`lexicon.yaml: id が重複しています: ${e.id}`);
    seen.add(e.id);

    if (!e.patterns?.length && !e.absent_patterns?.length && !e.meta?.length) {
      throw new Error(`lexicon.yaml: ${e.id} に判定条件がありません`);
    }
    // 正規表現の構文エラーは起動時に落とす。実行時に静かに無視されるより良い。
    for (const p of [...(e.patterns ?? []), ...(e.absent_patterns ?? [])]) {
      try {
        new RegExp(p, "gu");
      } catch {
        throw new Error(`lexicon.yaml: ${e.id} の正規表現が不正です: ${p}`);
      }
    }
    if (!e.prior || typeof e.prior.alpha !== "number" || typeof e.prior.beta !== "number") {
      throw new Error(`lexicon.yaml: ${e.id} の prior が不正です`);
    }
  }
}

export function loadLexicon(force = false): Lexicon {
  if (g.__oneesanLexicon && !force) return g.__oneesanLexicon;
  const lex = YAML.parse(fs.readFileSync(LEXICON_PATH, "utf8")) as Lexicon;
  validate(lex);
  g.__oneesanLexicon = lex;
  return lex;
}

export function getEntry(id: string): LexiconEntry | undefined {
  return loadLexicon().entries.find((e) => e.id === id);
}

function countMatches(text: string, patterns: string[]): string[] {
  const found: string[] = [];
  for (const p of patterns) {
    const re = new RegExp(p, "gu");
    for (const m of text.matchAll(re)) {
      if (m[0]) found.push(m[0]);
    }
  }
  return found;
}

/**
 * meta 条件の評価。
 * 未入力（undefined）は false ではなく null（判定不能）を返す。
 * 「写真枚数を入力していない」ことを「写真が1枚以下」と読み替えてはいけない。
 */
function evalMeta(cond: MetaCondition, meta: ProfileMeta): boolean | null {
  const v = (meta as Record<string, unknown>)[cond.field];
  if (v === undefined || v === null || v === "") return null;

  switch (cond.op) {
    case "is_true":
      return v === true;
    case "is_false":
      return v === false;
    default: {
      if (typeof v !== "number" || typeof cond.value !== "number") return null;
      switch (cond.op) {
        case "lte": return v <= cond.value;
        case "lt":  return v < cond.value;
        case "gte": return v >= cond.value;
        case "gt":  return v > cond.value;
        case "eq":  return v === cond.value;
        case "neq": return v !== cond.value;
        default:    return null;
      }
    }
  }
}

/**
 * 辞書マッチ。
 * 返すのは「疑いの候補」であって結論ではない。採否は LLM が文脈で決める。
 */
export function matchLexicon(rawText: string, rawMeta: ProfileMeta = {}): LexiconHit[] {
  const text = rawText ?? "";
  const meta: ProfileMeta = { ...rawMeta, profile_length: rawMeta.profile_length ?? text.length };
  const hits: LexiconHit[] = [];

  for (const entry of loadLexicon().entries) {
    const hasTextCond = Boolean(entry.patterns?.length || entry.absent_patterns?.length);
    const hasMetaCond = Boolean(entry.meta?.length);

    let matched: string[] = [];
    let byAbsence = false;
    let textOk: boolean | null = null;

    if (hasTextCond) {
      textOk = true;
      if (entry.patterns?.length) {
        matched = countMatches(text, entry.patterns);
        if (matched.length < (entry.min_count ?? 1)) textOk = false;
      }
      if (textOk && entry.absent_patterns?.length) {
        const present = countMatches(text, entry.absent_patterns);
        if (present.length > 0) textOk = false;
        else byAbsence = true;
      }
    }

    let metaOk: boolean | null = null;
    if (hasMetaCond) {
      const results = entry.meta!.map((c) => evalMeta(c, meta));
      // 1つでも判定不能があれば、このエントリ全体を判定不能にする
      if (results.some((r) => r === null)) metaOk = null;
      else metaOk = results.every((r) => r === true);
    }

    const parts = [textOk, metaOk].filter((r): r is boolean => r !== null);
    if (parts.length === 0) continue; // すべて判定不能 → ヒットさせない

    // require の既定は all。ただし片方が判定不能なら、判定できた側だけで決める。
    const require = entry.require ?? "all";
    const ok = require === "any" ? parts.some(Boolean) : parts.every(Boolean);
    if (!ok) continue;

    hits.push({
      entry,
      matched: [...new Set(matched)].slice(0, 5),
      byAbsence,
      byMeta: metaOk === true,
    });
  }

  return hits;
}
