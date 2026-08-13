import { getDb } from "./db";
import type { SimilarCase } from "./prompts";

interface PastCaseRow {
  id: number;
  shop_name: string | null;
  girl_name: string | null;
  structured_json: string;
  satisfaction: number | null;
  note: string | null;
}

interface LoggedRow {
  id: number;
  shop_name: string | null;
  girl_name: string | null;
  satisfaction: number | null;
  note: string | null;
  lexicon_ids: string | null;
}

/**
 * 同じ辞書項目が立っていた過去事例を探す。
 * 埋め込みベクトルは使わない。件数が数百程度なら辞書タグの重なりで十分機能し、
 * 「なぜ似ていると判断したか」が説明できる利点のほうが大きい。
 */
export function findSimilarCases(
  lexiconIds: string[],
  opts: { limit?: number; excludeAnalysisId?: number } = {},
): SimilarCase[] {
  if (!lexiconIds.length) return [];
  const db = getDb();
  const target = new Set(lexiconIds);
  const scored: { score: number; c: SimilarCase }[] = [];

  // 1. 記憶ベースの過去登録
  const pastRows = db
    .prepare<[], PastCaseRow>(
      `SELECT p.id, p.shop_name, p.girl_name, p.structured_json,
              o.satisfaction, o.note
       FROM past_case p
       LEFT JOIN outcome o ON o.past_case_id = p.id`,
    )
    .all();

  for (const row of pastRows) {
    let traits: string[] = [];
    let ids: string[] = [];
    try {
      const s = JSON.parse(row.structured_json) as {
        recalled_traits?: string[];
        reading_verdicts?: { lexicon_id: string }[];
      };
      traits = s.recalled_traits ?? [];
      ids = (s.reading_verdicts ?? []).map((v) => v.lexicon_id);
    } catch {
      continue;
    }
    const score = ids.filter((i) => target.has(i)).length;
    if (score === 0) continue;
    scored.push({
      score,
      c: {
        girlName: row.girl_name ?? "",
        shopName: row.shop_name ?? "",
        traits,
        satisfaction: row.satisfaction ?? 0,
        note: row.note ?? "",
        source: "recall",
      },
    });
  }

  // 2. 実測（このアプリで判定し、登楼実績まで入力済みのもの）
  const loggedRows = db
    .prepare<[], LoggedRow>(
      `SELECT a.id, a.shop_name, a.girl_name, o.satisfaction, o.note,
              (SELECT group_concat(r.lexicon_id)
                 FROM reading r WHERE r.analysis_id = a.id) AS lexicon_ids
       FROM analysis a
       JOIN outcome o ON o.analysis_id = a.id`,
    )
    .all();

  for (const row of loggedRows) {
    if (opts.excludeAnalysisId && row.id === opts.excludeAnalysisId) continue;
    const ids = (row.lexicon_ids ?? "").split(",").filter(Boolean);
    const overlap = ids.filter((i) => target.has(i));
    if (!overlap.length) continue;
    scored.push({
      // 実測は記憶より信頼できるので、同じ重なり数なら優先されるよう少し嵩上げする
      score: overlap.length + 0.5,
      c: {
        girlName: row.girl_name ?? "",
        shopName: row.shop_name ?? "",
        traits: overlap,
        satisfaction: row.satisfaction ?? 0,
        note: row.note ?? "",
        source: "logged",
      },
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 3)
    .map((s) => s.c);
}
