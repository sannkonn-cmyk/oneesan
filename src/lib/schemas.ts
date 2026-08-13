import { z } from "zod";

/**
 * LLM 出力の形。Zod と JSON Schema を並べて持つ。
 *
 * JSON Schema 側は意図的に保守的に書いてある：
 *  - null 型を使わない（「不明」は空文字か 0 で表す）
 *  - minimum / maxLength などの制約キーワードを使わない
 *  - additionalProperties: false と required は全オブジェクトに付ける
 * Claude Code CLI の --json-schema と Anthropic API の structured outputs で
 * サポート範囲が違う可能性があるため、両方で確実に通る最小構成に寄せている。
 * 値域（confidence が 0..1 など）は受信後にコード側で丸める。
 */

// ---------------------------------------------------------------- 共通

export const VERDICTS = ["指名推奨", "条件付き", "見送り"] as const;

const zScores = z.object({
  service_expectation: z.number(),
  photo_reliability: z.number(),
  authenticity: z.number(),
  landmine_risk: z.number(),
});

const jsScores = {
  type: "object",
  properties: {
    service_expectation: { type: "integer", description: "サービスへの期待度 0-100。高いほど良い" },
    photo_reliability: { type: "integer", description: "写真の信頼度 0-100。高いほど良い" },
    authenticity: { type: "integer", description: "本人が書いている度合い 0-100。高いほど良い" },
    landmine_risk: { type: "integer", description: "地雷リスク 0-100。高いほど危険" },
  },
  required: ["service_expectation", "photo_reliability", "authenticity", "landmine_risk"],
  additionalProperties: false,
} as const;

const zReading = z.object({
  id: z.string(),
  quote: z.string(),
  surface: z.string(),
  skeptical: z.string(),
  confidence: z.number(),
  lexicon_id: z.string(),
  counter_evidence: z.string(),
});

const jsReading = {
  type: "object",
  properties: {
    id: { type: "string", description: "この読みの識別子。r1, r2, r3 ... と順に振る" },
    quote: {
      type: "string",
      description: "プロフィール本文から一字一句そのまま引用した文字列。要約や言い換えは禁止",
    },
    surface: { type: "string", description: "その表現の額面どおりの意味。1文" },
    skeptical: {
      type: "string",
      description:
        "穿った読み。最低3文。(1)何を疑うのか (2)なぜそう読めるのか本文中の根拠 (3)今回の文脈でその解釈を採る/採らない理由、を必ず含める",
    },
    confidence: { type: "number", description: "この読みが当たっている確度。0.0〜1.0" },
    lexicon_id: {
      type: "string",
      description: "対応する辞書項目の id。辞書に無い独自の読みなら空文字",
    },
    counter_evidence: {
      type: "string",
      description: "この読みが外れる条件。どんな事実が確認できればこの疑いを取り下げるか",
    },
  },
  required: ["id", "quote", "surface", "skeptical", "confidence", "lexicon_id", "counter_evidence"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------- 初回判定

export const AnalyzeResultSchema = z.object({
  summary: z.string(),
  readings: z.array(zReading),
  omissions: z.array(z.string()),
  verification_questions: z.array(z.string()),
  scores: zScores,
  verdict: z.enum(VERDICTS),
  rationale: z.string(),
});
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>;

export const ANALYZE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "広告表現を剥がしたあと、結局どういう嬢なのかを1〜2文で",
    },
    readings: { type: "array", items: jsReading, description: "裏読み。3〜8件" },
    omissions: {
      type: "array",
      items: { type: "string" },
      description: "プロフィールに書かれていない重要情報。それが無いと何が判断できないかも書く",
    },
    verification_questions: {
      type: "array",
      items: { type: "string" },
      description:
        "登楼前に実行できる具体的な確認行動。『サービスを確認する』のような曖昧なものは禁止。『電話予約時に◯◯オプションの対応可否を聞く』のように、誰が・どこで・何を確認するかが分かる形で書く",
    },
    scores: jsScores,
    verdict: { type: "string", enum: [...VERDICTS] },
    rationale: { type: "string", description: "総合判断の理由。2〜4文" },
  },
  required: ["summary", "readings", "omissions", "verification_questions", "scores", "verdict", "rationale"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------- 再レビュー

export const RereviewResultSchema = AnalyzeResultSchema.extend({
  changes: z.array(
    z.object({
      reading_id: z.string(),
      before_confidence: z.number(),
      after_confidence: z.number(),
      why: z.string(),
    }),
  ),
  resolved_readings: z.array(
    z.object({
      lexicon_id: z.string(),
      verdict: z.enum(["confirmed", "refuted"]),
      why: z.string(),
    }),
  ),
});
export type RereviewResult = z.infer<typeof RereviewResultSchema>;

export const REREVIEW_JSON_SCHEMA = {
  type: "object",
  properties: {
    ...ANALYZE_JSON_SCHEMA.properties,
    changes: {
      type: "array",
      description: "前回の判定から変化した読み。変化が無ければ空配列",
      items: {
        type: "object",
        properties: {
          reading_id: { type: "string", description: "前回の判定の reading の id" },
          before_confidence: { type: "number" },
          after_confidence: { type: "number" },
          why: { type: "string", description: "確認結果のどこがこの変化を生んだのか" },
        },
        required: ["reading_id", "before_confidence", "after_confidence", "why"],
        additionalProperties: false,
      },
    },
    resolved_readings: {
      type: "array",
      description:
        "確認によって白黒がついた読み。confirmed=疑いが裏付けられた、refuted=疑いが否定された。決着がつかないものは含めない",
      items: {
        type: "object",
        properties: {
          lexicon_id: { type: "string", description: "辞書項目の id。辞書に無いものは含めない" },
          verdict: { type: "string", enum: ["confirmed", "refuted"] },
          why: { type: "string" },
        },
        required: ["lexicon_id", "verdict", "why"],
        additionalProperties: false,
      },
    },
  },
  required: [...ANALYZE_JSON_SCHEMA.required, "changes", "resolved_readings"],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------- 過去実績の構造化

export const ImportResultSchema = z.object({
  shop_name: z.string(),
  girl_name: z.string(),
  recalled_traits: z.array(z.string()),
  outcome: z.object({
    satisfaction: z.number(),
    service: z.number(),
    photo_match: z.number(),
    attitude: z.number(),
  }),
  reading_verdicts: z.array(
    z.object({
      lexicon_id: z.string(),
      verdict: z.enum(["confirmed", "refuted"]),
      why: z.string(),
    }),
  ),
  confidence_in_recall: z.number(),
  note: z.string(),
});
export type ImportResult = z.infer<typeof ImportResultSchema>;

export const IMPORT_JSON_SCHEMA = {
  type: "object",
  properties: {
    shop_name: { type: "string", description: "店名。記述に無ければ空文字" },
    girl_name: { type: "string", description: "源氏名。記述に無ければ空文字" },
    recalled_traits: {
      type: "array",
      items: { type: "string" },
      description: "プロフィールの特徴として述べられている点",
    },
    outcome: {
      type: "object",
      properties: {
        satisfaction: { type: "integer", description: "総合満足度 1-5。記述から読み取れなければ 0" },
        service: { type: "integer", description: "サービス面 1-5。不明なら 0" },
        photo_match: { type: "integer", description: "写真との一致 1-5。不明なら 0" },
        attitude: { type: "integer", description: "接客態度 1-5。不明なら 0" },
      },
      required: ["satisfaction", "service", "photo_match", "attitude"],
      additionalProperties: false,
    },
    reading_verdicts: {
      type: "array",
      description:
        "この事例で白黒がついた辞書項目。プロフィールにその特徴があり、かつ実際どうだったかが記述から判断できるものだけを挙げる。推測で埋めない",
      items: {
        type: "object",
        properties: {
          lexicon_id: { type: "string", description: "与えられた辞書一覧に存在する id のみ" },
          verdict: {
            type: "string",
            enum: ["confirmed", "refuted"],
            description: "confirmed=辞書の疑いが的中した、refuted=疑いは外れた",
          },
          why: { type: "string" },
        },
        required: ["lexicon_id", "verdict", "why"],
        additionalProperties: false,
      },
    },
    confidence_in_recall: {
      type: "number",
      description:
        "この記述がどれだけ具体的で信頼できるか 0.0〜1.0。曖昧な記憶や伝聞なら低く、具体的な事実が並んでいれば高く",
    },
    note: { type: "string", description: "補足。無ければ空文字" },
  },
  required: [
    "shop_name",
    "girl_name",
    "recalled_traits",
    "outcome",
    "reading_verdicts",
    "confidence_in_recall",
    "note",
  ],
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------- 後処理

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;

/** 値域はスキーマで縛れないので受信後に丸める。 */
export function normalizeAnalyze<T extends AnalyzeResult>(r: T): T {
  return {
    ...r,
    readings: r.readings.map((x, i) => ({
      ...x,
      id: x.id || `r${i + 1}`,
      confidence: clamp(x.confidence, 0, 1),
    })),
    scores: {
      service_expectation: Math.round(clamp(r.scores.service_expectation, 0, 100)),
      photo_reliability: Math.round(clamp(r.scores.photo_reliability, 0, 100)),
      authenticity: Math.round(clamp(r.scores.authenticity, 0, 100)),
      landmine_risk: Math.round(clamp(r.scores.landmine_risk, 0, 100)),
    },
  };
}
