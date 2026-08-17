import { outcomePatterns } from "./export-stats";
import { AXIS_LABEL, type Axis } from "./lexicon/types";
import {
  getLearningSummary,
  getOutcome,
  listChain,
  listHistory,
  listLexiconWithStats,
  listVerifications,
} from "./queries";
import type { AnalyzeResult, RereviewResult } from "./schemas";
import { getAnalysis } from "./service";
import { KIND_LABEL, getSettings } from "./settings";

/**
 * 溜まったデータを Markdown にする。
 *
 * 目的は**外の Claude に読ませること**。アプリの画面と違い、読み手は
 * このアプリの前提を何も知らないので、数字だけ渡しても一般論しか返ってこない。
 * だから「何を意味する数字か」「何件の実績に基づくか」を本文に書き込む。
 *
 * 出力は MCP サーバー（scripts/mcp-server.mjs）とも共有する。
 * 同じものを二度書かないため、組み立てはすべてここに集めてある。
 */

export const EXPORT_SCOPES = ["analysis", "compare", "context", "overview", "lexicon"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export const SCOPE_LABEL: Record<ExportScope, string> = {
  analysis: "1人分を深掘り",
  compare: "候補を並べて壁打ち",
  context: "私の判断基準だけ",
  overview: "全体の傾向",
  lexicon: "辞書の育ち具合",
};

export const SCOPE_HINT: Record<ExportScope, string> = {
  analysis: "その嬢の判定・裏読み・確認結果・実績をすべて出します。",
  compare: "選んだ嬢を並べ、私の基準も添えます。どれに行くか相談する用。",
  context: "申し送りと辞書の的中率、過去の傾向。他の話をするときの前置きに。",
  overview: "これまでの判定と実績を一覧にします。自分の癖を読ませる用。",
  lexicon: "辞書項目ごとの的中率。項目の追加・削除を相談する用。",
};

export interface MarkdownOptions {
  /** 店名・源氏名を伏せる */
  anonymize?: boolean;
  /** overview で並べる件数の上限 */
  limit?: number;
}

// ---------------------------------------------------------------- 小道具

const STATUS_LABEL: Record<string, string> = {
  confirmed: "確認できた",
  denied: "違った",
  unknown: "分からなかった",
  unchecked: "未確認",
};

/**
 * 匿名化。番号は「出てきた順」に振る。
 * 名前を単に消すと誰の話か追えなくなり、複数人を並べたときに壊れる。
 */
class Namer {
  private shops = new Map<string, string>();
  private girls = new Map<string, string>();
  constructor(private readonly on: boolean) {}

  shop(name: string): string {
    if (!this.on) return name || "店名未入力";
    if (!name) return "店名未入力";
    if (!this.shops.has(name)) this.shops.set(name, `店${this.shops.size + 1}`);
    return this.shops.get(name)!;
  }

  girl(name: string): string {
    if (!this.on) return name || "名前未入力";
    if (!name) return "名前未入力";
    if (!this.girls.has(name)) this.girls.set(name, `嬢${String.fromCharCode(65 + this.girls.size)}`);
    return this.girls.get(name)!;
  }

  /** 本文に紛れ込んだ名前も置き換える。引用の中に源氏名が出ることがある。 */
  scrub(text: string): string {
    if (!this.on) return text;
    let out = text;
    for (const [real, alias] of [...this.shops, ...this.girls]) {
      if (real.length >= 2) out = out.split(real).join(alias);
    }
    return out;
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 少ない件数から断定されないよう、標本数を必ず添える。 */
function sampleNote(n: number, what: string): string {
  if (n === 0) return `（${what}はまだ0件です。傾向は出せません）`;
  if (n < 5) return `（${what}はまだ${n}件です。傾向として読まず、参考程度に扱ってください）`;
  if (n < 15) return `（${what}は${n}件。傾向の芽が見える程度で、断定はできません）`;
  return `（${what}は${n}件）`;
}

const HEAD = `<!-- お姉さん投資判定 からの書き出し -->

> このファイルは風俗嬢のプロフィールを穿って読むための個人用ツールが出力したものです。
> 中身は利用者本人の記録です。読み手（AI）への注意: ここに書かれた数字は
> **この利用者ひとりの実績**から出ています。世間一般の相場ではありません。
> 件数が少ない項目から一般化しないでください。`;

// ---------------------------------------------------------------- 私の判断基準

/**
 * 壁打ちの前提。これが無いと、外の Claude はこの利用者の基準を知らないまま
 * 一般論を返すことになる。
 */
export function buildContextMarkdown(opts: MarkdownOptions = {}): string {
  const settings = getSettings();
  const glossary = settings.instructions.filter((i) => i.kind === "glossary");
  const policy = settings.instructions.filter((i) => i.kind === "policy");
  const lex = listLexiconWithStats();
  const verified = lex.filter((v) => !v.stat.unverified);
  const patterns = outcomePatterns();
  const summary = getLearningSummary();

  const out: string[] = ["# 私の判断基準"];

  out.push(`## 私が知っている言い回し（${KIND_LABEL.glossary}）

プロフィールに出てくる語の、実際の意味です。私が実地で確かめたものです。`);
  out.push(
    glossary.length
      ? glossary.map((g) => `- ${g.text}`).join("\n")
      : "（まだ登録していません）",
  );

  out.push(`## 私の見方（${KIND_LABEL.policy}）`);
  out.push(policy.length ? policy.map((p) => `- ${p.text}`).join("\n") : "（まだ登録していません）");

  out.push(`## 私の実績で検証済みの読み

「疑いが当たった率」です。${sampleNote(summary.evidence, "学習データ")}`);

  if (verified.length) {
    out.push(
      [
        "| 項目 | 疑いの内容 | 的中率 | 実績 |",
        "|---|---|---|---|",
        ...verified.map(
          (v) =>
            `| ${v.entry.label} | ${v.entry.hypothesis.replace(/\s+/g, " ").trim()} | ` +
            `${pct(v.stat.rate)} | ${v.stat.observations}件 |`,
        ),
      ].join("\n"),
    );
    out.push(
      `未検証の項目が ${lex.length - verified.length} 件あります（実績0件）。` +
        `そちらは辞書の初期値のままなので、数字に意味はありません。`,
    );
  } else {
    out.push("（まだ検証済みの項目がありません。使い始めたばかりです）");
  }

  out.push(`## 判定と実際の満足度の対応

${sampleNote(patterns.samples, "実績を入力した登楼")}`);

  if (patterns.byVerdict.length) {
    out.push(
      [
        "| アプリの判定 | 件数 | 実際の平均満足度（5点満点） |",
        "|---|---|---|",
        ...patterns.byVerdict.map(
          (v) => `| ${v.verdict} | ${v.count} | ${v.avgSatisfaction.toFixed(1)} |`,
        ),
      ].join("\n"),
    );
  }

  if (patterns.hitWhenGood.length || patterns.hitWhenBad.length) {
    out.push(`### 当たりだった嬢に立っていた辞書項目（満足度4以上）`);
    out.push(
      patterns.hitWhenGood.length
        ? patterns.hitWhenGood.map((t) => `- ${t.label} … ${t.count}件`).join("\n")
        : "（該当なし）",
    );
    out.push(`### 外れだった嬢に立っていた辞書項目（満足度2以下）`);
    out.push(
      patterns.hitWhenBad.length
        ? patterns.hitWhenBad.map((t) => `- ${t.label} … ${t.count}件`).join("\n")
        : "（該当なし）",
    );
    out.push(
      "この2つは「疑いが当たったか」とは別の数字です。" +
        "項目が立っていたこと自体と、結果が良かったかの対応にすぎません。",
    );
  }

  void opts;
  return out.join("\n\n");
}

// ---------------------------------------------------------------- 1人分

function readingBlock(
  r: AnalyzeResult["readings"][number],
  namer: Namer,
  idx: number,
): string {
  const trust = r.stance === "trust";
  return [
    `### ${idx + 1}. ${trust ? "信頼できる材料" : "穿った読み"}（${
      trust ? "信頼度" : "確度"
    } ${pct(r.confidence)}）`,
    `- 引用: 「${namer.scrub(r.quote)}」`,
    `- 額面どおりの意味: ${namer.scrub(r.surface)}`,
    `- 読み: ${namer.scrub(r.skeptical)}`,
    `- ${trust ? "この信頼を撤回すべき条件" : "この読みが外れる条件"}: ${namer.scrub(
      r.counter_evidence,
    )}`,
    r.lexicon_id ? `- 辞書項目: ${r.lexicon_id}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 1件の判定を、系列（再レビュー）と実績まで含めて出す。 */
export function buildAnalysisMarkdown(id: number, opts: MarkdownOptions = {}): string {
  const analysis = getAnalysis(id);
  if (!analysis) return `# 判定 #${id} は見つかりませんでした`;

  const namer = new Namer(Boolean(opts.anonymize));
  const girl = namer.girl(analysis.girl_name ?? "");
  const shop = namer.shop(analysis.shop_name ?? "");
  const result = analysis.result;
  const chain = listChain(analysis.root_analysis_id);
  const outcome = getOutcome(analysis.root_analysis_id);
  const verifications = listVerifications(analysis.id);

  const out: string[] = [`# ${girl}（${shop}）の判定`];

  out.push(
    `- 判定日時: ${analysis.created_at}\n` +
      `- ${analysis.round === 1 ? "初回判定" : `${analysis.round}回目（再レビュー済み）`}` +
      `${chain.length > 1 ? ` / この嬢の判定は全${chain.length}回` : ""}`,
  );

  out.push(`## 総合判定: ${result.verdict}

${namer.scrub(result.summary)}

理由: ${namer.scrub(result.rationale)}`);

  out.push(
    [
      "| 観点 | 点数 |",
      "|---|---|",
      ...(Object.keys(AXIS_LABEL) as Axis[]).map(
        (axis) =>
          `| ${AXIS_LABEL[axis]}${axis === "landmine_risk" ? "（高いほど危険）" : "（高いほど良い）"} | ` +
          `${result.scores[axis]} |`,
      ),
    ].join("\n"),
  );

  out.push("## プロフィール本文（原文）");
  out.push("```\n" + namer.scrub(analysis.raw_profile) + "\n```");

  out.push(`## 裏読み（${result.readings.length}件）`);
  out.push(result.readings.map((r, i) => readingBlock(r, namer, i)).join("\n\n"));

  if (result.omissions.length) {
    out.push("## 書かれていないこと");
    out.push(result.omissions.map((o) => `- ${namer.scrub(o)}`).join("\n"));
  }

  if (verifications.length) {
    out.push("## 確認すべきことと、その結果");
    out.push(
      verifications
        .map(
          (v) =>
            `- ${namer.scrub(v.question)}\n  - 結果: ${STATUS_LABEL[v.status] ?? v.status}` +
            (v.note ? `\n  - メモ: ${namer.scrub(v.note)}` : ""),
        )
        .join("\n"),
    );
  }

  const changes = (result as RereviewResult).changes;
  if (changes?.length) {
    out.push("## 再レビューで動いたところ");
    out.push(
      changes
        .map(
          (c) =>
            `- ${c.reading_id}: 確度 ${pct(c.before_confidence)} → ${pct(c.after_confidence)}\n` +
            `  - 理由: ${namer.scrub(c.why)}`,
        )
        .join("\n"),
    );
  }

  if (outcome) {
    out.push(`## 実際に行った結果

| 観点 | 5段階 |
|---|---|
| 総合満足度 | ${outcome.satisfaction ?? "-"} |
| サービス | ${outcome.service_rating ?? "-"} |
| 写真との一致 | ${outcome.photo_match ?? "-"} |
| 接客態度 | ${outcome.attitude_rating ?? "-"} |

所感: ${outcome.note ? namer.scrub(outcome.note) : "なし"}`);
  } else {
    out.push("## 実際に行った結果\n\nまだ行っていません（または実績を未入力）。");
  }

  return out.join("\n\n");
}

// ---------------------------------------------------------------- 候補を並べる

/** 複数の候補を並べる。壁打ち用なので、私の基準を前に付ける。 */
export function buildCompareMarkdown(ids: number[], opts: MarkdownOptions = {}): string {
  if (!ids.length) return `${HEAD}\n\n# 候補が選ばれていません`;

  const namer = new Namer(Boolean(opts.anonymize));
  const rows: string[] = [];
  const details: string[] = [];

  for (const id of ids) {
    const a = getAnalysis(id);
    if (!a) continue;
    const girl = namer.girl(a.girl_name ?? "");
    const shop = namer.shop(a.shop_name ?? "");
    const r = a.result;
    const open = listVerifications(a.id).filter((v) => v.status === "unchecked");

    rows.push(
      `| ${girl} | ${shop} | ${r.verdict} | ${r.scores.service_expectation} | ` +
        `${r.scores.photo_reliability} | ${r.scores.authenticity} | ${r.scores.landmine_risk} |`,
    );

    details.push(
      [
        `### ${girl}（${shop}）`,
        `判定「${r.verdict}」 — ${namer.scrub(r.summary)}`,
        "",
        "強い読み（確度の高い順に3件）:",
        r.readings
          .slice()
          .sort((x, y) => y.confidence - x.confidence)
          .slice(0, 3)
          .map(
            (x) =>
              `- ${x.stance === "trust" ? "◎" : "△"} ${pct(x.confidence)} 「${namer.scrub(
                x.quote,
              )}」→ ${namer.scrub(x.skeptical)}`,
          )
          .join("\n"),
        "",
        open.length
          ? `未確認の確認事項:\n${open.map((v) => `- ${namer.scrub(v.question)}`).join("\n")}`
          : "確認事項はすべて確認済みです。",
      ].join("\n"),
    );
  }

  return [
    HEAD,
    buildContextMarkdown(opts),
    "# 今回の候補",
    "点数は 0-100。地雷リスクだけ高いほど悪いので向きが逆です。",
    [
      "| 嬢 | 店 | 判定 | サービス期待 | 写真信頼 | 本人度 | 地雷リスク |",
      "|---|---|---|---|---|---|---|",
      ...rows,
    ].join("\n"),
    details.join("\n\n"),
    `# 相談したいこと

上の候補のうち、どれに行くべきか一緒に考えてください。
私の基準（このファイルの前半）を踏まえて、次を教えてください。

1. あなたなら誰を選ぶか、その理由
2. 私の読みで見落としていそうな点
3. 行く前に確かめるべきこと（私が使える手段は前半に書いてあります）`,
  ].join("\n\n");
}

// ---------------------------------------------------------------- 全体の傾向

export function buildOverviewMarkdown(opts: MarkdownOptions = {}): string {
  const limit = opts.limit ?? 100;
  const namer = new Namer(Boolean(opts.anonymize));
  const history = listHistory(limit);
  const s = getLearningSummary();

  const out: string[] = [HEAD, buildContextMarkdown(opts), "# これまでの判定"];

  out.push(`判定 ${s.analyses}件 / 再レビュー ${s.rereviews}件 / 実績入力 ${s.outcomes}件 /
記憶で登録した過去分 ${s.pastCases}件`);

  if (history.length) {
    out.push(
      [
        "| 日時 | 嬢 | 店 | 判定 | 再レビュー | 満足度 |",
        "|---|---|---|---|---|---|",
        ...history.map(
          (h) =>
            `| ${h.createdAt.slice(0, 10)} | ${namer.girl(h.girlName)} | ${namer.shop(h.shopName)} | ` +
            `${h.verdict} | ${h.rounds > 1 ? `${h.rounds - 1}回` : "なし"} | ` +
            `${h.satisfaction ?? "未入力"} |`,
        ),
      ].join("\n"),
    );
    if (history.length >= limit) {
      out.push(`（${limit}件で打ち切っています。これより古い分は含まれていません）`);
    }
  } else {
    out.push("（まだ判定がありません）");
  }

  out.push(`# 相談したいこと

私の判定と実際の満足度のずれから、次を教えてください。

1. 私が何を過大評価／過小評価しがちか
2. 判定が「条件付き」のときの当たり外れに、何か共通点はあるか
3. 辞書に足したほうがよい観点`);

  return out.join("\n\n");
}

// ---------------------------------------------------------------- 辞書

export function buildLexiconMarkdown(): string {
  const lex = listLexiconWithStats();
  const s = getLearningSummary();

  return [
    HEAD,
    "# 裏読み辞書の育ち具合",
    `全 ${s.totalEntries} 項目のうち、実績が付いているのは ${s.verifiedEntries} 項目です。
的中率は「その疑いが当たった率」で、幅は95%信用区間です。件数が少ないほど幅が広くなります。`,
    [
      "| 項目 | 分類 | 疑いの内容 | 的中率 | 幅 | 実績 |",
      "|---|---|---|---|---|---|",
      ...lex.map((v) =>
        v.stat.unverified
          ? `| ${v.entry.label} | ${v.categoryLabel} | ${v.entry.hypothesis
              .replace(/\s+/g, " ")
              .trim()} | 未検証 | — | 0件 |`
          : `| ${v.entry.label} | ${v.categoryLabel} | ${v.entry.hypothesis
              .replace(/\s+/g, " ")
              .trim()} | ${pct(v.stat.rate)} | ${pct(v.stat.ci[0])}〜${pct(
              v.stat.ci[1],
            )} | ${v.stat.observations}件 |`,
      ),
    ].join("\n"),
    `# 相談したいこと

1. 的中率が低いまま件数が溜まっている項目は、疑いの立て方が悪いのでは？
   どう書き換えるべきか
2. 未検証のまま残っている項目は、そもそも検出条件が厳しすぎるのでは？
3. この一覧に足りていない観点はあるか

辞書は1項目あたり次の形で書きます。書き換え案はこの形で出してください。

\`\`\`yaml
- id: 英数字の名札
  category: over_claim | euphemism | omission | economic | authorship | positive
  label: 表示名
  patterns: ["本文に出る文字列", "正規表現も可"]
  hypothesis: 何を疑うのか
  context_check: AI に見てほしい観点
  affects: { service_expectation: -2, landmine_risk: 2 }
  prior: { alpha: 2, beta: 2 }
\`\`\``,
  ].join("\n\n");
}

// ---------------------------------------------------------------- 入口

export function buildMarkdown(
  scope: ExportScope,
  ids: number[],
  opts: MarkdownOptions = {},
): string {
  switch (scope) {
    case "analysis":
      return ids.length
        ? [HEAD, buildAnalysisMarkdown(ids[0], opts)].join("\n\n")
        : `${HEAD}\n\n# 嬢が選ばれていません`;
    case "compare":
      return buildCompareMarkdown(ids, opts);
    case "context":
      return [HEAD, buildContextMarkdown(opts)].join("\n\n");
    case "overview":
      return buildOverviewMarkdown(opts);
    case "lexicon":
      return buildLexiconMarkdown();
  }
}

/** 保存するときのファイル名。日付を入れて上書きを避ける。 */
export function markdownFilename(scope: ExportScope): string {
  const d = new Date().toISOString().slice(0, 10);
  return `oneesan-${scope}-${d}.md`;
}
