import { getDb, nowIso } from "../db";
import { loadLexicon } from "./index";
import type { EntryStat } from "./types";

/** 記憶ベースの過去実績は精度が粗いので、実測の半分の重みしか与えない。 */
export const WEIGHT: Record<EvidenceSource, number> = {
  rereview: 1.0,
  outcome: 1.0,
  recall: 0.5,
};

export type EvidenceSource = "rereview" | "outcome" | "recall";
export type Verdict = "confirmed" | "refuted";

export interface EvidenceInput {
  lexiconId: string;
  source: EvidenceSource;
  verdict: Verdict;
  refTable: "analysis" | "past_case";
  refId: number;
  note?: string;
}

/**
 * lexicon_stat は lexicon_evidence から導出される集計値。
 * 直接足し込まず必ず再計算するので、誤入力を消せば数字も戻る。
 */
function recomputeOne(lexiconId: string): void {
  const db = getDb();
  const row = db
    .prepare<[string], { hits: number | null; misses: number | null }>(
      `SELECT
         SUM(CASE WHEN verdict = 'confirmed' THEN weight ELSE 0 END) AS hits,
         SUM(CASE WHEN verdict = 'refuted'   THEN weight ELSE 0 END) AS misses
       FROM lexicon_evidence WHERE lexicon_id = ?`,
    )
    .get(lexiconId);

  db.prepare(
    `INSERT INTO lexicon_stat (lexicon_id, hits, misses, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(lexicon_id) DO UPDATE SET
       hits = excluded.hits, misses = excluded.misses, updated_at = excluded.updated_at`,
  ).run(lexiconId, row?.hits ?? 0, row?.misses ?? 0, nowIso());
}

/**
 * 学習シグナルを1件記録する。
 * 同じ根拠（同じ判定・同じ表現）を二重にカウントしないよう UNIQUE 制約で弾き、
 * 判定が変わった場合は上書きする。
 */
export function recordEvidence(input: EvidenceInput): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO lexicon_evidence
       (created_at, lexicon_id, source, verdict, weight, ref_table, ref_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(lexicon_id, source, ref_table, ref_id) DO UPDATE SET
       verdict = excluded.verdict, weight = excluded.weight,
       note = excluded.note, created_at = excluded.created_at`,
  ).run(
    nowIso(),
    input.lexiconId,
    input.source,
    input.verdict,
    WEIGHT[input.source],
    input.refTable,
    input.refId,
    input.note ?? null,
  );
  recomputeOne(input.lexiconId);
}

export function recordEvidenceBatch(inputs: EvidenceInput[]): void {
  const db = getDb();
  db.transaction(() => {
    for (const i of inputs) recordEvidence(i);
  })();
}

/** lexicon_evidence から lexicon_stat を全件再構築する（`npm run recompute`）。 */
export function recomputeAllStats(): number {
  const db = getDb();
  const ids = db
    .prepare<[], { lexicon_id: string }>("SELECT DISTINCT lexicon_id FROM lexicon_evidence")
    .all();
  db.transaction(() => {
    db.prepare("DELETE FROM lexicon_stat").run();
    for (const { lexicon_id } of ids) recomputeOne(lexicon_id);
  })();
  return ids.length;
}

function toStat(
  lexiconId: string,
  hits: number,
  misses: number,
  prior: { alpha: number; beta: number },
): EntryStat {
  const a = prior.alpha + hits;
  const b = prior.beta + misses;
  const n = a + b;
  const rate = a / n;
  // ベータ分布の正規近似。件数が少ないうちは区間が広く出るので、
  // 「まだ信用できない」ことが数字の見た目で伝わる。
  const sd = Math.sqrt((a * b) / (n * n * (n + 1)));
  const lo = Math.max(0, rate - 1.96 * sd);
  const hi = Math.min(1, rate + 1.96 * sd);
  const observations = hits + misses;
  return {
    lexiconId,
    rate,
    observations,
    hits,
    misses,
    ci: [lo, hi],
    unverified: observations === 0,
  };
}

export function getAllStats(): Map<string, EntryStat> {
  const db = getDb();
  const rows = db
    .prepare<[], { lexicon_id: string; hits: number; misses: number }>(
      "SELECT lexicon_id, hits, misses FROM lexicon_stat",
    )
    .all();
  const byId = new Map(rows.map((r) => [r.lexicon_id, r]));

  const out = new Map<string, EntryStat>();
  for (const entry of loadLexicon().entries) {
    const r = byId.get(entry.id);
    out.set(entry.id, toStat(entry.id, r?.hits ?? 0, r?.misses ?? 0, entry.prior));
  }
  return out;
}

export function getStat(lexiconId: string): EntryStat | undefined {
  return getAllStats().get(lexiconId);
}
