import { getDb, nowIso } from "./db";
import { getLlm } from "./llm";
import { loadLexicon, matchLexicon } from "./lexicon/index";
import {
  getAllStats,
  recomputeAllStats,
  recordEvidenceBatch,
  type EvidenceInput,
} from "./lexicon/stats";
import type { Axis, ProfileMeta } from "./lexicon/types";
import {
  buildAnalyzePrompt,
  buildImportPrompt,
  buildRereviewPrompt,
  type VerificationAnswer,
} from "./prompts";
import {
  ANALYZE_JSON_SCHEMA,
  AnalyzeResultSchema,
  IMPORT_JSON_SCHEMA,
  ImportResultSchema,
  REREVIEW_JSON_SCHEMA,
  RereviewResultSchema,
  normalizeAnalyze,
  type AnalyzeResult,
  type ImportResult,
  type RereviewResult,
} from "./schemas";
import { findSimilarCases } from "./similar";

// ---------------------------------------------------------------- 保存の下請け

interface AnalysisRow {
  id: number;
  created_at: string;
  parent_analysis_id: number | null;
  root_analysis_id: number;
  round: number;
  shop_name: string | null;
  girl_name: string | null;
  raw_profile: string;
  meta_json: string;
  result_json: string;
  provider: string;
  model: string;
  lexicon_version: string;
}

function persistAnalysis(args: {
  parentId?: number;
  rootId?: number;
  round: number;
  shopName: string;
  girlName: string;
  profile: string;
  meta: ProfileMeta;
  result: AnalyzeResult;
  provider: string;
  model: string;
}): number {
  const db = getDb();
  const lex = loadLexicon();

  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO analysis
           (created_at, parent_analysis_id, root_analysis_id, round, shop_name, girl_name,
            raw_profile, meta_json, result_json, provider, model, lexicon_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nowIso(),
        args.parentId ?? null,
        args.rootId ?? 0, // 直後に自分自身で埋める
        args.round,
        args.shopName || null,
        args.girlName || null,
        args.profile,
        JSON.stringify(args.meta),
        JSON.stringify(args.result),
        args.provider,
        args.model,
        lex.version,
      );

    const id = Number(info.lastInsertRowid);
    const rootId = args.rootId ?? id;
    db.prepare("UPDATE analysis SET root_analysis_id = ? WHERE id = ?").run(rootId, id);

    const insReading = db.prepare(
      `INSERT INTO reading (analysis_id, lexicon_id, quote, skeptical, confidence)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const r of args.result.readings) {
      insReading.run(id, r.lexicon_id || null, r.quote, r.skeptical, r.confidence);
    }

    const insVerification = db.prepare(
      "INSERT INTO verification (analysis_id, question) VALUES (?, ?)",
    );
    for (const q of args.result.verification_questions) insVerification.run(id, q);

    return id;
  })();
}

export function getAnalysis(id: number): (AnalysisRow & { result: AnalyzeResult }) | undefined {
  const row = getDb()
    .prepare<[number], AnalysisRow>("SELECT * FROM analysis WHERE id = ?")
    .get(id);
  if (!row) return undefined;
  return { ...row, result: JSON.parse(row.result_json) as AnalyzeResult };
}

// ---------------------------------------------------------------- 1. 初回判定

export interface AnalyzeArgs {
  profile: string;
  meta: ProfileMeta;
  shopName?: string;
  girlName?: string;
}

export async function runAnalyze(args: AnalyzeArgs): Promise<{ id: number; result: AnalyzeResult }> {
  const hits = matchLexicon(args.profile, args.meta);
  const stats = getAllStats();
  const similar = findSimilarCases(hits.map((h) => h.entry.id));

  const { system, user } = buildAnalyzePrompt({
    profile: args.profile,
    meta: args.meta,
    hits,
    stats,
    similar,
  });

  const llm = getLlm();
  const res = await llm.complete({
    label: "analyze",
    system,
    user,
    jsonSchema: ANALYZE_JSON_SCHEMA,
    zod: AnalyzeResultSchema,
  });

  const result = normalizeAnalyze(res.data);
  const id = persistAnalysis({
    round: 1,
    shopName: args.shopName ?? "",
    girlName: args.girlName ?? "",
    profile: args.profile,
    meta: args.meta,
    result,
    provider: res.provider,
    model: res.model,
  });

  return { id, result };
}

// ---------------------------------------------------------------- 2. 再レビュー

export interface RereviewArgs {
  analysisId: number;
  answers: VerificationAnswer[];
  freeNote?: string;
}

export async function runRereview(
  args: RereviewArgs,
): Promise<{ id: number; result: RereviewResult }> {
  const prev = getAnalysis(args.analysisId);
  if (!prev) throw new Error(`判定 #${args.analysisId} が見つかりません`);

  const meta = JSON.parse(prev.meta_json) as ProfileMeta;
  const hits = matchLexicon(prev.raw_profile, meta);
  const stats = getAllStats();
  const similar = findSimilarCases(hits.map((h) => h.entry.id), {
    excludeAnalysisId: prev.root_analysis_id,
  });

  const { system, user } = buildRereviewPrompt({
    profile: prev.raw_profile,
    meta,
    hits,
    stats,
    similar,
    previous: prev.result,
    answers: args.answers,
    freeNote: args.freeNote ?? "",
  });

  const llm = getLlm();
  const res = await llm.complete({
    label: "rereview",
    system,
    user,
    jsonSchema: REREVIEW_JSON_SCHEMA,
    zod: RereviewResultSchema,
  });

  const result = normalizeAnalyze(res.data);

  const db = getDb();
  // 回答内容を元の判定に書き戻す（履歴として残す）
  db.transaction(() => {
    const upd = db.prepare(
      "UPDATE verification SET status = ?, note = ?, checked_at = ? WHERE analysis_id = ? AND question = ?",
    );
    for (const a of args.answers) {
      upd.run(a.status, a.note || null, nowIso(), args.analysisId, a.question);
    }
  })();

  const id = persistAnalysis({
    parentId: prev.id,
    rootId: prev.root_analysis_id,
    round: prev.round + 1,
    shopName: prev.shop_name ?? "",
    girlName: prev.girl_name ?? "",
    profile: prev.raw_profile,
    meta,
    result,
    provider: res.provider,
    model: res.model,
  });

  // 白黒がついた読みを学習シグナルとして記録する。
  // ref_id に root を使うことで、同じ嬢を何度再レビューしても二重計上されない。
  const known = new Set(loadLexicon().entries.map((e) => e.id));
  const evidence: EvidenceInput[] = result.resolved_readings
    .filter((r) => known.has(r.lexicon_id))
    .map((r) => ({
      lexiconId: r.lexicon_id,
      source: "rereview" as const,
      verdict: r.verdict,
      refTable: "analysis" as const,
      refId: prev.root_analysis_id,
      note: r.why,
    }));
  if (evidence.length) recordEvidenceBatch(evidence);

  return { id, result };
}

// ---------------------------------------------------------------- 3. 過去実績の一括登録

export async function runImport(
  rawText: string,
): Promise<{ id: number; result: ImportResult; evidenceCount: number }> {
  const catalog = loadLexicon().entries.map((e) => ({
    id: e.id,
    label: e.label,
    hypothesis: e.hypothesis,
  }));

  const { system, user } = buildImportPrompt({ rawText, lexiconCatalog: catalog });
  const llm = getLlm();
  const res = await llm.complete({
    label: "import",
    system,
    user,
    jsonSchema: IMPORT_JSON_SCHEMA,
    zod: ImportResultSchema,
  });

  const result = res.data;
  const db = getDb();

  const pastCaseId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO past_case
           (created_at, raw_text, structured_json, shop_name, girl_name, recall_confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nowIso(),
        rawText,
        JSON.stringify(result),
        result.shop_name || null,
        result.girl_name || null,
        result.confidence_in_recall,
      );
    const id = Number(info.lastInsertRowid);

    const o = result.outcome;
    if (o.satisfaction || o.service || o.photo_match || o.attitude) {
      db.prepare(
        `INSERT INTO outcome
           (created_at, past_case_id, satisfaction, service_rating, photo_match, attitude_rating, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        nowIso(),
        id,
        o.satisfaction || null,
        o.service || null,
        o.photo_match || null,
        o.attitude || null,
        result.note || null,
      );
    }
    return id;
  })();

  const known = new Set(catalog.map((c) => c.id));
  const evidence: EvidenceInput[] = result.reading_verdicts
    .filter((v) => known.has(v.lexicon_id))
    .map((v) => ({
      lexiconId: v.lexicon_id,
      source: "recall" as const, // 重み 0.5。実測と同列にはしない
      verdict: v.verdict,
      refTable: "past_case" as const,
      refId: pastCaseId,
      note: v.why,
    }));
  if (evidence.length) recordEvidenceBatch(evidence);

  return { id: pastCaseId, result, evidenceCount: evidence.length };
}

/**
 * 過去登録を1件消す。
 *
 * 元の記録を消すだけでは的中率に反映済みの分が残ってしまうので、
 * そこから生まれた学習データも取り消して集計を作り直す。
 * lexicon_stat は lexicon_evidence から毎回導出しているので、
 * 根拠を消して再計算すれば正しい値に戻る。
 */
export function deletePastCase(id: number): { removedEvidence: number } {
  const db = getDb();

  const removed = db.transaction(() => {
    const n = db
      .prepare<[number], { n: number }>(
        "SELECT COUNT(*) AS n FROM lexicon_evidence WHERE ref_table = 'past_case' AND ref_id = ?",
      )
      .get(id)?.n ?? 0;

    db.prepare("DELETE FROM lexicon_evidence WHERE ref_table = 'past_case' AND ref_id = ?").run(id);
    // outcome は past_case への外部キーで連鎖削除される
    db.prepare("DELETE FROM past_case WHERE id = ?").run(id);
    return n;
  })();

  recomputeAllStats();
  return { removedEvidence: removed };
}

// ---------------------------------------------------------------- 4. 登楼実績の記録

export interface OutcomeArgs {
  analysisId: number;
  visitedAt?: string;
  satisfaction: number;
  serviceRating: number;
  photoMatch: number;
  attitudeRating: number;
  note?: string;
}

/** 5段階評価を good / bad / neutral に落とす。3 は情報なしとして扱う。 */
function judge(rating: number): "good" | "bad" | null {
  if (!rating) return null;
  if (rating <= 2) return "bad";
  if (rating >= 4) return "good";
  return null;
}

const AXIS_TO_RATING: Partial<Record<Axis, (o: OutcomeArgs) => number>> = {
  service_expectation: (o) => o.serviceRating,
  photo_reliability: (o) => o.photoMatch,
  // authenticity には対応する実測項目が無いので学習に使わない
  landmine_risk: (o) => o.satisfaction,
};

/**
 * 登楼実績から「その読みが当たっていたか」を機械的に判定する。
 *
 * 辞書項目は affects で「どの軸をどちらに動かすか」を宣言している。
 * 例: meiki_claim は service_expectation を下げる（＝サービスが薄いと予測）。
 *     実際の service_rating が低ければ予測的中 confirmed、高ければ外れ refuted。
 * landmine_risk だけは向きが逆（高いほど危険）なので符号を反転して扱う。
 * 判断が割れた場合と、3（どちらとも言えない）しか無い場合は記録しない。
 */
function deriveVerdicts(
  args: OutcomeArgs,
  lexiconIds: string[],
): { lexiconId: string; verdict: "confirmed" | "refuted"; note: string }[] {
  const entries = loadLexicon().entries;
  const out: { lexiconId: string; verdict: "confirmed" | "refuted"; note: string }[] = [];

  for (const id of [...new Set(lexiconIds)]) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) continue;

    let confirmed = 0;
    let refuted = 0;
    const reasons: string[] = [];

    for (const [axis, weight] of Object.entries(entry.affects) as [Axis, number][]) {
      const getter = AXIS_TO_RATING[axis];
      if (!getter || !weight) continue;
      const rating = getter(args);
      const j = judge(rating);
      if (!j) continue;

      // landmine_risk は「高い＝悪い」なので、予測の向きを反転させて他の軸と揃える
      const predictsBad = axis === "landmine_risk" ? weight > 0 : weight < 0;
      const actualBad = j === "bad";

      if (predictsBad === actualBad) {
        confirmed++;
        reasons.push(`${axis}: 予測どおり（実績 ${rating}/5）`);
      } else {
        refuted++;
        reasons.push(`${axis}: 予測と逆（実績 ${rating}/5）`);
      }
    }

    if (confirmed === refuted) continue; // 判断が割れた、または材料なし
    out.push({
      lexiconId: id,
      verdict: confirmed > refuted ? "confirmed" : "refuted",
      note: `登楼実績から自動判定 — ${reasons.join(" / ")}`,
    });
  }
  return out;
}

export function saveOutcome(args: OutcomeArgs): { evidenceCount: number } {
  const db = getDb();
  const analysis = getAnalysis(args.analysisId);
  if (!analysis) throw new Error(`判定 #${args.analysisId} が見つかりません`);

  db.transaction(() => {
    db.prepare("DELETE FROM outcome WHERE analysis_id = ?").run(analysis.root_analysis_id);
    db.prepare(
      `INSERT INTO outcome
         (created_at, analysis_id, visited_at, satisfaction, service_rating,
          photo_match, attitude_rating, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      nowIso(),
      analysis.root_analysis_id,
      args.visitedAt || null,
      args.satisfaction || null,
      args.serviceRating || null,
      args.photoMatch || null,
      args.attitudeRating || null,
      args.note || null,
    );
  })();

  // 学習は「その系列で最後に出た判定」の読みに対して行う。
  // 再レビューで取り下げられた読みまで採点してしまわないようにするため。
  const latest = db
    .prepare<[number], { id: number }>(
      "SELECT id FROM analysis WHERE root_analysis_id = ? ORDER BY round DESC LIMIT 1",
    )
    .get(analysis.root_analysis_id);

  const lexiconIds = db
    .prepare<[number], { lexicon_id: string }>(
      "SELECT lexicon_id FROM reading WHERE analysis_id = ? AND lexicon_id IS NOT NULL",
    )
    .all(latest?.id ?? analysis.id)
    .map((r) => r.lexicon_id);

  const verdicts = deriveVerdicts(args, lexiconIds);
  if (verdicts.length) {
    recordEvidenceBatch(
      verdicts.map((v) => ({
        lexiconId: v.lexiconId,
        source: "outcome" as const,
        verdict: v.verdict,
        refTable: "analysis" as const,
        refId: analysis.root_analysis_id,
        note: v.note,
      })),
    );
  }
  return { evidenceCount: verdicts.length };
}
