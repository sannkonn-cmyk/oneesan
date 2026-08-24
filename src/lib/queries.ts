import { getDb } from "./db";
import { loadLexicon } from "./lexicon/index";
import { getAllStats } from "./lexicon/stats";
import { CATEGORY_LABEL } from "./lexicon/types";
import type { EntryStat, LexiconEntry } from "./lexicon/types";
import type { AnalyzeResult } from "./schemas";

export interface HistoryItem {
  rootId: number;
  latestId: number;
  createdAt: string;
  shopName: string;
  girlName: string;
  verdict: string;
  summary: string;
  rounds: number;
  hasOutcome: boolean;
  satisfaction: number | null;
}

/** 履歴一覧。系列（初回＋再レビュー）を1行にまとめて最新の判定を見せる。 */
export function listHistory(limit = 100): HistoryItem[] {
  const rows = getDb()
    .prepare<[number], {
      root_id: number;
      latest_id: number;
      created_at: string;
      shop_name: string | null;
      girl_name: string | null;
      result_json: string;
      rounds: number;
      satisfaction: number | null;
    }>(
      `SELECT a.root_analysis_id AS root_id,
              a.id               AS latest_id,
              a.created_at,
              a.shop_name, a.girl_name, a.result_json,
              (SELECT COUNT(*) FROM analysis x WHERE x.root_analysis_id = a.root_analysis_id) AS rounds,
              (SELECT o.satisfaction FROM outcome o WHERE o.analysis_id = a.root_analysis_id) AS satisfaction
       FROM analysis a
       WHERE a.round = (SELECT MAX(y.round) FROM analysis y WHERE y.root_analysis_id = a.root_analysis_id)
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .all(limit);

  return rows.map((r) => {
    const result = JSON.parse(r.result_json) as AnalyzeResult;
    return {
      rootId: r.root_id,
      latestId: r.latest_id,
      createdAt: r.created_at,
      shopName: r.shop_name ?? "",
      girlName: r.girl_name ?? "",
      verdict: result.verdict,
      summary: result.summary,
      rounds: r.rounds,
      hasOutcome: r.satisfaction != null,
      satisfaction: r.satisfaction,
    };
  });
}

export interface VerificationRow {
  id: number;
  question: string;
  status: string;
  note: string | null;
}

export function listVerifications(analysisId: number): VerificationRow[] {
  return getDb()
    .prepare<[number], VerificationRow>(
      "SELECT id, question, status, note FROM verification WHERE analysis_id = ? ORDER BY id",
    )
    .all(analysisId);
}

export interface ChainItem {
  id: number;
  round: number;
  createdAt: string;
}

export function listChain(rootId: number): ChainItem[] {
  return getDb()
    .prepare<[number], { id: number; round: number; created_at: string }>(
      "SELECT id, round, created_at FROM analysis WHERE root_analysis_id = ? ORDER BY round",
    )
    .all(rootId)
    .map((r) => ({ id: r.id, round: r.round, createdAt: r.created_at }));
}

export interface OutcomeRow {
  id: number;
  visited_at: string | null;
  satisfaction: number | null;
  girl_rating: number | null;
  service_rating: number | null;
  price_rating: number | null;
  photo_match: number | null;
  attitude_rating: number | null;
  review_title: string | null;
  about_her: string | null;
  play_detail: string | null;
  note: string | null;
}

const OUTCOME_COLUMNS = `id, visited_at, satisfaction, girl_rating, service_rating,
  price_rating, photo_match, attitude_rating, review_title, about_her, play_detail, note`;

export function getOutcome(rootId: number): OutcomeRow | undefined {
  return getDb()
    .prepare<[number], OutcomeRow>(
      `SELECT ${OUTCOME_COLUMNS} FROM outcome WHERE analysis_id = ?`,
    )
    .get(rootId);
}

export interface VisitRow extends OutcomeRow {
  created_at: string;
  analysis_id: number | null;
  shop_name: string;
  girl_name: string;
}

/**
 * 登楼記録の一覧。
 *
 * 判定に紐づく記録と、判定を通していない単独の記録の両方を返す。
 * 名前は、判定に紐づくならそちらを優先する（判定側で直したら記録も直る）。
 * 記憶で入れた過去登録（past_case）は、性質が違うので混ぜない。
 */
export function listVisits(limit = 200): VisitRow[] {
  return getDb()
    .prepare<[number], VisitRow>(
      `SELECT o.id, o.created_at, o.analysis_id, o.visited_at,
              COALESCE(NULLIF(a.shop_name, ''), o.shop_name, '') AS shop_name,
              COALESCE(NULLIF(a.girl_name, ''), o.girl_name, '') AS girl_name,
              o.satisfaction, o.girl_rating, o.service_rating, o.price_rating,
              o.photo_match, o.attitude_rating,
              o.review_title, o.about_her, o.play_detail, o.note
         FROM outcome o
         LEFT JOIN analysis a ON a.id = o.analysis_id
        WHERE o.past_case_id IS NULL
        ORDER BY COALESCE(o.visited_at, o.created_at) DESC, o.id DESC
        LIMIT ?`,
    )
    .all(limit);
}

export function getVisit(id: number): VisitRow | undefined {
  return listVisits(500).find((v) => v.id === id);
}

export interface LexiconView {
  entry: LexiconEntry;
  categoryLabel: string;
  stat: EntryStat;
}

/** 辞書一覧画面用。学習がどこまで進んでいるかを可視化する。 */
export function listLexiconWithStats(): LexiconView[] {
  const stats = getAllStats();
  return loadLexicon()
    .entries.map((entry) => ({
      entry,
      categoryLabel: CATEGORY_LABEL[entry.category] ?? entry.category,
      stat: stats.get(entry.id)!,
    }))
    .sort((a, b) => {
      // 実績のあるものを上に、その中では的中率の高い順に
      if (a.stat.unverified !== b.stat.unverified) return a.stat.unverified ? 1 : -1;
      return b.stat.rate - a.stat.rate;
    });
}

export interface ImportedCase {
  id: number;
  createdAt: string;
  shopName: string;
  girlName: string;
  rawText: string;
  traits: string[];
  verdictCount: number;
  recallConfidence: number | null;
}

export function listImportedCases(limit = 200): ImportedCase[] {
  return getDb()
    .prepare<[number], {
      id: number;
      created_at: string;
      shop_name: string | null;
      girl_name: string | null;
      raw_text: string;
      structured_json: string;
      recall_confidence: number | null;
    }>(
      `SELECT id, created_at, shop_name, girl_name, raw_text, structured_json, recall_confidence
       FROM past_case ORDER BY id DESC LIMIT ?`,
    )
    .all(limit)
    .map((r) => {
      let traits: string[] = [];
      let verdictCount = 0;
      try {
        const s = JSON.parse(r.structured_json) as {
          recalled_traits?: string[];
          reading_verdicts?: unknown[];
        };
        traits = s.recalled_traits ?? [];
        verdictCount = (s.reading_verdicts ?? []).length;
      } catch {
        /* 壊れた行は空扱い */
      }
      return {
        id: r.id,
        createdAt: r.created_at,
        shopName: r.shop_name ?? "",
        girlName: r.girl_name ?? "",
        rawText: r.raw_text,
        traits,
        verdictCount,
        recallConfidence: r.recall_confidence,
      };
    });
}

export interface LearningSummary {
  analyses: number;
  rereviews: number;
  outcomes: number;
  pastCases: number;
  evidence: number;
  verifiedEntries: number;
  totalEntries: number;
}

export function getLearningSummary(): LearningSummary {
  const db = getDb();
  const one = (sql: string): number =>
    (db.prepare<[], { n: number }>(sql).get()?.n ?? 0);

  const stats = getAllStats();
  return {
    analyses: one("SELECT COUNT(*) AS n FROM analysis WHERE round = 1"),
    rereviews: one("SELECT COUNT(*) AS n FROM analysis WHERE round > 1"),
    outcomes: one("SELECT COUNT(*) AS n FROM outcome WHERE analysis_id IS NOT NULL"),
    pastCases: one("SELECT COUNT(*) AS n FROM past_case"),
    evidence: one("SELECT COUNT(*) AS n FROM lexicon_evidence"),
    verifiedEntries: [...stats.values()].filter((s) => !s.unverified).length,
    totalEntries: stats.size,
  };
}
