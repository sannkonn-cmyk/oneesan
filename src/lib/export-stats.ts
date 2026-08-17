import { getDb } from "./db";
import { loadLexicon } from "./lexicon/index";

/**
 * 「当たった／外れた」の集計（lexicon_stat）とは別に、
 * **満足度と辞書項目の関係**を出す。
 *
 * 辞書の的中率は「疑いが当たったか」で、これは「結果が良かったか」。
 * 別物なので分けてある。例えば「名器アピール」の疑いが外れ続けていても、
 * 名器アピールのある嬢で満足度が高い傾向がある、という話は成立する。
 *
 * 外の Claude に渡して傾向を読ませるための材料であって、
 * アプリ内の判定には使っていない。
 */

export interface VerdictStat {
  verdict: string;
  count: number;
  avgSatisfaction: number;
}

export interface TraitCount {
  lexiconId: string;
  label: string;
  count: number;
}

export interface OutcomePatterns {
  /** 実績が入っている登楼の数。少ないうちは何を言っても参考程度。 */
  samples: number;
  byVerdict: VerdictStat[];
  hitWhenGood: TraitCount[];
  hitWhenBad: TraitCount[];
}

interface JoinRow {
  root_id: number;
  verdict: string;
  satisfaction: number;
  lexicon_ids: string | null;
}

/** 満足度が入っている登楼だけを、系列の初回判定に紐づけて集める。 */
function rows(): JoinRow[] {
  return getDb()
    .prepare<[], { root_id: number; result_json: string; satisfaction: number; lexicon_ids: string | null }>(
      `SELECT a.id AS root_id, a.result_json, o.satisfaction,
              (SELECT group_concat(r.lexicon_id)
                 FROM reading r WHERE r.analysis_id = a.id) AS lexicon_ids
         FROM analysis a
         JOIN outcome o ON o.analysis_id = a.id
        WHERE o.satisfaction IS NOT NULL`,
    )
    .all()
    .map((r) => {
      let verdict = "不明";
      try {
        verdict = (JSON.parse(r.result_json) as { verdict?: string }).verdict ?? "不明";
      } catch {
        /* 壊れた行は不明扱い */
      }
      return {
        root_id: r.root_id,
        verdict,
        satisfaction: r.satisfaction,
        lexicon_ids: r.lexicon_ids,
      };
    });
}

function countTraits(list: JoinRow[], labels: Map<string, string>): TraitCount[] {
  const n = new Map<string, number>();
  for (const row of list) {
    // 同じ嬢で同じ項目が複数回立っていても1回として数える
    const ids = new Set((row.lexicon_ids ?? "").split(",").filter(Boolean));
    for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  }
  return [...n.entries()]
    .map(([lexiconId, count]) => ({ lexiconId, label: labels.get(lexiconId) ?? lexiconId, count }))
    .sort((a, b) => b.count - a.count || a.lexiconId.localeCompare(b.lexiconId));
}

export function outcomePatterns(): OutcomePatterns {
  const all = rows();
  const labels = new Map(loadLexicon().entries.map((e) => [e.id, e.label]));

  const byVerdictMap = new Map<string, number[]>();
  for (const r of all) {
    const list = byVerdictMap.get(r.verdict) ?? [];
    list.push(r.satisfaction);
    byVerdictMap.set(r.verdict, list);
  }

  const byVerdict = [...byVerdictMap.entries()]
    .map(([verdict, sats]) => ({
      verdict,
      count: sats.length,
      avgSatisfaction: sats.reduce((a, b) => a + b, 0) / sats.length,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    samples: all.length,
    byVerdict,
    hitWhenGood: countTraits(
      all.filter((r) => r.satisfaction >= 4),
      labels,
    ),
    hitWhenBad: countTraits(
      all.filter((r) => r.satisfaction <= 2),
      labels,
    ),
  };
}
