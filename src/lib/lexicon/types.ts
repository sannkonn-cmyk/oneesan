export const AXES = [
  "service_expectation",
  "photo_reliability",
  "authenticity",
  "landmine_risk",
] as const;
export type Axis = (typeof AXES)[number];

export const AXIS_LABEL: Record<Axis, string> = {
  service_expectation: "サービス期待度",
  photo_reliability: "写真の信頼度",
  authenticity: "本人が書いてる度",
  landmine_risk: "地雷リスク",
};

export const CATEGORY_LABEL: Record<string, string> = {
  over_claim: "過剰主張",
  euphemism: "婉曲・言い換え",
  omission: "欠落",
  economic: "需給シグナル",
  authorship: "文体",
  positive: "信頼シグナル",
};

export type MetaOp =
  | "lte" | "lt" | "gte" | "gt" | "eq" | "neq" | "is_true" | "is_false";

export interface MetaCondition {
  field: string;
  op: MetaOp;
  value?: number | boolean;
}

export interface LexiconEntry {
  id: string;
  category: string;
  label: string;
  patterns?: string[];
  absent_patterns?: string[];
  min_count?: number;
  meta?: MetaCondition[];
  require?: "all" | "any";
  hypothesis: string;
  context_check: string;
  affects: Partial<Record<Axis, number>>;
  prior: { alpha: number; beta: number };
}

export interface Lexicon {
  version: string;
  entries: LexiconEntry[];
}

/**
 * 本文からは取れない構造シグナル。
 * undefined は「未入力＝不明」。false（該当しない）とは明確に区別する。
 */
export interface ProfileMeta {
  photo_count?: number;
  review_count?: number;
  tenure_months?: number;
  diary_count_recent?: number;
  has_face_photo?: boolean;
  sizes_disclosed?: boolean;
  /** 総額（円） */
  price_yen?: number;
  /** コース時間（分）。price_yen と合わせて時間あたり単価を出す。 */
  duration_min?: number;
  /** 本文の文字数。呼び出し側で自動計算して埋める。 */
  profile_length?: number;
  /**
   * 入力時に選んだバケットの表示ラベル（例: photo_count → "2〜4枚"）。
   * 辞書は数値の代表値で判定するが、プロンプトにはこちらを見せる。
   * 代表値をそのまま渡すと「ちょうど3枚」と誤解されるため。
   */
  labels?: Record<string, string>;
}

export interface LexiconHit {
  entry: LexiconEntry;
  /** 本文中で実際にマッチした文字列（重複除去済み、最大5件） */
  matched: string[];
  /** absent_patterns による欠落検出でヒットしたか */
  byAbsence: boolean;
  /** meta 条件でヒットしたか */
  byMeta: boolean;
}

export interface EntryStat {
  lexiconId: string;
  /** 事後平均の的中率 0..1 */
  rate: number;
  /** 実測件数（事前分布ぶんは含まない） */
  observations: number;
  hits: number;
  misses: number;
  /** 95% 信用区間（正規近似。件数が少ないうちは広く出る） */
  ci: [number, number];
  /** 実測 0 件なら未検証 */
  unverified: boolean;
}
