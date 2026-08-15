import { CATEGORY_LABEL } from "./lexicon/types";
import type { EntryStat, LexiconHit, ProfileMeta } from "./lexicon/types";
import { pricePerHour } from "./meta";
import type { AnalyzeResult } from "./schemas";
import { VERIFY_CHANNELS, type Settings } from "./settings";

// ---------------------------------------------------------------- 共通の役割定義

const CORE_ROLE = `あなたは風俗（ソープランド等）の店選びを支援する分析官です。分析対象は
シティヘブン等の情報サイトに掲載された嬢のプロフィールです。

最重要の前提: プロフィールは広告文です。店または嬢が集客のために書いた
売り手のポジショントークであり、中立的な事実の記述ではありません。したがって
価値ある情報は「何が書いてあるか」ではなく、次の2点にあります。

  1. なぜその表現を選んだのか（何を訴求できるか＝裏返せば何を訴求できないか）
  2. 何が書かれていないのか（欠落は最も情報量が多い）

あなたの仕事は、この2点を手がかりに広告表現を剥がし、利用者が自分で判断できる
材料を提示することです。`;

const CORE_RULES = `# 守るべきこと

## 断定しない
すべての読みは仮説です。確度（0.0〜1.0）を付け、さらに「この読みが外れる条件」
（counter_evidence）を必ず書いてください。読者が自分で最終判断できる形にすることが
目的であって、あなたが結論を出すことが目的ではありません。

## 引用は改変しない
quote には本文に実在する文字列を一字一句そのまま入れてください。要約・言い換え・
存在しない文言の創作は禁止です。引用できる該当箇所が無い読み（構造情報だけを
根拠とする読みなど）は、quote に該当する事実を短く書いてください（例:「写真1枚」）。

## 読みは3文以上、根拠と文脈判断まで書く
skeptical には最低3文を書いてください。点数よりもこの本文が読者にとっての価値です。
  (1) 何を疑うのか（trust の場合はなぜ信頼できるのか）
  (2) なぜそう読めるのか（本文中のどこを根拠にしているか）
  (3) 今回の文脈でその解釈を採る／採らない理由
同じ表現でもプロフィール全体の構成次第で読みは変わります。その判断過程を書いてください。

## 立場（stance）を正しく使い分ける
各 reading には stance を付けます。
  suspicion : この記述を疑う。confidence は「疑いが当たっている確度」
  trust     : この記述は信頼できる材料として扱う。confidence は「信頼してよい確度」
正のシグナル（できないことの明記、具体的な固有名詞、サービス内容の具体記述など）は
trust にしてください。信頼できる材料に無理やり疑いの体裁を与えて確度を下げると、
読み手には「褒めているのに確度が低い」という意味不明な表示になります。
強く信頼できるものは trust で高い confidence を付けてください。

## 悲観に倒れない — これは同じくらい重要です
穿つことが目的化すると全員が「見送り」になり、道具として使い物になりません。
  - 信頼できるシグナルは、はっきり信頼できると書いてください。とくに「できないこと」
    「苦手なこと」を明記しているプロフィールは、売り手が自ら不利な情報を開示している
    という強い誠実さの証拠です。この場合は他の記述の信頼度も連動して上げてください。
  - 辞書のヒットは「疑いの候補」にすぎません。文脈から見て的外れなら採用せず、
    readings に含めないでください。全ヒットを機械的に列挙しないでください。
  - 決定的な問題が無いプロフィールに無理やり欠点を見つけようとしないでください。
  - verdict は「指名推奨」「条件付き」「見送り」から選びます。「見送り」は、
    重大な負のシグナルが複数重なっている場合にのみ選んでください。

## 確認すべきことは「行動」で書く
verification_questions は、利用者が登楼前に実行できる具体的な行動にしてください。
  悪い例: 「サービス内容を確認する」「写真が本物か確認する」
  良い例: 「写メ日記の直近2週間を開き、店長コメントと文体が違うかを見る」
        「口コミを在籍3ヶ月目より前の日付で検索し、評価が変わっていないか見る」
        「同じ店の他の嬢のプロフィールを3人分開き、同じ言い回しが使われていないか見る」
        「電話予約時に『マットは対応可能ですか』と聞き、即答かどうかを見る」
最も検証価値の高いもの（判定が大きく動くもの）から順に、3〜6件挙げてください。

**手段を散らしてください。** 同じ手段ばかりを並べると、一度の行動で分かることが
偏り、確かめられる範囲が狭くなります。とくに「店に電話して聞く」は手軽に思いつく
ぶん偏りやすいので、意識して他の手段を混ぜてください。3件以上出すときは、
必ず2種類以上の手段にまたがらせてください。

## 点数の意味
  service_expectation : サービスへの期待度 0-100（高いほど良い）
  photo_reliability   : 写真の信頼度 0-100（高いほど良い）
  authenticity        : 本人が書いている度合い 0-100（高いほど良い）
  landmine_risk       : 地雷リスク 0-100（**高いほど危険**。他と向きが逆）
情報が不足していて判断できない軸は、悪い点ではなく中央（50前後）に置いてください。
情報が無いことと悪いことは違います。`;

// ---------------------------------------------------------------- 入力の組み立て

const META_LABEL: Record<string, string> = {
  photo_count: "写真",
  tenure_months: "在籍期間",
  review_count: "口コミ",
  diary_count_recent: "写メ日記（直近2週）",
  has_face_photo: "顔出し",
  sizes_disclosed: "3サイズ",
};

function renderMeta(meta: ProfileMeta): string {
  const lines: string[] = [];
  for (const [key, label] of Object.entries(META_LABEL)) {
    const v = (meta as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === "") continue;
    // 入力時のバケット名をそのまま見せる。代表値（例: 3）を渡すと
    // 「ちょうど3枚」と誤解されるため。
    const shown = meta.labels?.[key] ?? (typeof v === "boolean" ? (v ? "あり" : "なし") : String(v));
    lines.push(`- ${label}: ${shown}`);
  }

  if (meta.price_yen) {
    const perHour = pricePerHour(meta.price_yen, meta.duration_min);
    lines.push(
      meta.duration_min
        ? `- 料金: ${meta.price_yen.toLocaleString()}円 / ${meta.duration_min}分（時間あたり約 ${perHour?.toLocaleString()}円）`
        : `- 料金: ${meta.price_yen.toLocaleString()}円`,
    );
  }

  const unknown = Object.entries(META_LABEL)
    .filter(([k]) => {
      const v = (meta as Record<string, unknown>)[k];
      return v === undefined || v === null || v === "";
    })
    .map(([, label]) => label);

  let out = lines.length ? lines.join("\n") : "（すべて未入力）";
  if (unknown.length) {
    out += `\n\n未入力（不明であって「無い」ではない。これらを根拠に断定しないこと）: ${unknown.join("、")}`;
  }
  return out;
}

function renderHits(hits: LexiconHit[], stats: Map<string, EntryStat>): string {
  if (!hits.length) return "（辞書のヒットはありません。本文から直接読み取ってください）";

  return hits
    .map((h) => {
      const e = h.entry;
      const s = stats.get(e.id);
      const rate = s
        ? s.unverified
          ? `未検証（辞書の初期値 ${(s.rate * 100).toFixed(0)}%。実績0件なので鵜呑みにしないこと）`
          : `過去の的中率 ${(s.rate * 100).toFixed(0)}%（実績${s.observations}件: 的中${s.hits} / 外れ${s.misses}）`
        : "未検証";

      const how = h.byAbsence
        ? "検出理由: 該当する記述が本文に一つも無い（欠落）"
        : h.byMeta && !h.matched.length
          ? "検出理由: 構造情報の条件に合致"
          : `本文中のヒット: ${h.matched.join(" / ")}`;

      return [
        `### ${e.id} [${CATEGORY_LABEL[e.category] ?? e.category}] ${e.label}`,
        how,
        `${rate}`,
        `疑い: ${e.hypothesis.trim()}`,
        `見るべき点: ${e.context_check.trim()}`,
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * 再レビュー用の圧縮版。
 * 辞書の疑いの内容や着眼点は前回の判定にすでに織り込まれているので、
 * 同じ解説を再送すると入力が膨らみ、思考時間だけが伸びる。
 * ここでは的中率の参照に必要な最小限だけ渡す。
 */
function renderHitsCompact(hits: LexiconHit[], stats: Map<string, EntryStat>): string {
  if (!hits.length) return "（辞書のヒットはありません）";
  return hits
    .map((h) => {
      const s = stats.get(h.entry.id);
      const rate = !s
        ? "未検証"
        : s.unverified
          ? `未検証（初期値 ${(s.rate * 100).toFixed(0)}%）`
          : `的中率 ${(s.rate * 100).toFixed(0)}%（実績${s.observations}件）`;
      return `- ${h.entry.id}（${h.entry.label}）${rate}`;
    })
    .join("\n");
}

/**
 * 利用者からの申し送りを system プロンプトに載せる形にする。
 *
 * 用語と方針を**別の見出しに分ける**のが肝心。
 * 用語（VIPサービス＝中出し、など）は利用者が実地で得た事実であって要望ではない。
 * これを「尊重してください」と渡すと、AI が忖度の一種として扱い、読みの根拠に
 * ならない。事実として渡してはじめて、確度の計算に効く。
 */
function renderPolicy(settings: Settings): string {
  // 手段が空だと確認事項が一つも作れない。保存側でも防いでいるが、
  // 組み立ての最後でも受け止めておく。ここが壊れると判定が丸ごと無意味になる。
  const picked = VERIFY_CHANNELS.filter((c) => settings.channels.includes(c.id));
  const channels = picked.length ? picked : VERIFY_CHANNELS;
  const glossary = settings.instructions.filter((i) => i.kind === "glossary");
  const policy = settings.instructions.filter((i) => i.kind === "policy");

  const blocks: string[] = [];

  const excluded = VERIFY_CHANNELS.filter((c) => !channels.includes(c));

  blocks.push(`## 使う確認手段

利用者が使う手段は次のとおりです。ここに複数ある以上、
**特定の手段に偏らせないでください**。

${channels.map((c) => `- ${c.label} — ${c.hint}`).join("\n")}${
    excluded.length
      ? `

### 使わない手段

次の手段は利用者が使いません。**これらを前提にした確認事項は一つも出さないで
ください。**どれだけ有益な確認であっても、実行できないので価値がゼロです。

${excluded.map((c) => `- ${c.label}`).join("\n")}`
      : ""
  }`);

  if (glossary.length) {
    blocks.push(`## この界隈での言い回し（利用者からの申し送り）

本文に次の語が出てきたら、この意味として読んでください。額面どおりに受け取っては
いけません。これは利用者が実際に足を運んで得た事実であり、要望ではありません。

${glossary.map((g, i) => `${i + 1}. ${g.text}`).join("\n")}

その語が何を指すか分かるのですから、**なぜその語をあえて選んだのか**まで読んで
ください（言い換えて濁しているのか、店の建前なのか、本人の売りなのか）。
言い換えの存在自体が、そのプロフィールの書き手についての情報です。`);
  }

  if (policy.length) {
    blocks.push(`## 利用者からの指示

${policy.map((p, i) => `${i + 1}. ${p.text}`).join("\n")}

これらは出力の方針として尊重してください。ただし、事実に反する記述や、
根拠のない断定はしないでください。`);
  }

  return `\n\n# この利用者の事情（必ず守ること）\n\n${blocks.join("\n\n")}`;
}

/** 確認結果の表示名。過去事例の表示と再レビューの入力で共有する。 */
const STATUS_LABEL: Record<string, string> = {
  confirmed: "確認できた（そのとおりだった）",
  denied: "確認したが違った",
  unknown: "確認したが分からなかった",
  unchecked: "未確認",
};

export interface SimilarCheck {
  question: string;
  status: string;
  note: string;
}

export interface SimilarCase {
  girlName: string;
  shopName: string;
  traits: string[];
  satisfaction: number;
  note: string;
  checks: SimilarCheck[];
  source: "recall" | "logged";
}

function renderSimilar(cases: SimilarCase[]): string {
  if (!cases.length) return "";
  const body = cases
    .map((c, i) => {
      const src = c.source === "recall" ? "記憶ベース・精度は粗い" : "実測";
      const sat = c.satisfaction > 0 ? `満足度 ${c.satisfaction}/5` : "満足度 不明";
      // 過去に実際に確かめた結果は、この利用者にしか無い材料。
      // 「何を確かめたら何が分かったか」が次の確認事項の作り方に効く。
      const checks = c.checks.length
        ? `\n   確認したこと:\n` +
          c.checks
            .map(
              (v) =>
                `     - ${v.question} → ${STATUS_LABEL[v.status] ?? v.status}` +
                `${v.note ? `（${v.note}）` : ""}`,
            )
            .join("\n")
        : "";
      return `${i + 1}. ${c.shopName || "店名不明"} / ${c.girlName || "名前不明"}（${src}、${sat}）
   プロフィールの特徴: ${c.traits.join("、") || "記録なし"}
   所感: ${c.note || "なし"}${checks}`;
    })
    .join("\n");

  return `

# 参考: この利用者の過去の類似事例

同じ辞書項目が立っていた過去の登楼記録です。この利用者固有の傾向を読み取る材料に
してください。ただし件数が少ないので、これだけで断定しないでください。

${body}`;
}

// ---------------------------------------------------------------- 1. 初回判定

export interface AnalyzeInput {
  profile: string;
  meta: ProfileMeta;
  hits: LexiconHit[];
  stats: Map<string, EntryStat>;
  similar: SimilarCase[];
  settings: Settings;
}

export function buildAnalyzePrompt(input: AnalyzeInput): { system: string; user: string } {
  const system = `${CORE_ROLE}

${CORE_RULES}${renderPolicy(input.settings)}

出力は指定された JSON スキーマに従ってください。日本語で書いてください。`;

  const user = `以下のプロフィールを分析してください。

# プロフィール本文

\`\`\`
${input.profile}
\`\`\`

# 構造情報（本文からは読み取れない情報）

${renderMeta(input.meta)}

# 辞書が反応した項目

これは「疑いの候補」であって結論ではありません。文脈から見て的外れなものは
採用せず、readings に含めないでください。逆に、辞書に無い読みを見つけたら
lexicon_id を空文字にして自由に追加してください。

${renderHits(input.hits, input.stats)}${renderSimilar(input.similar)}`;

  return { system, user };
}

// ---------------------------------------------------------------- 2. 再レビュー

export interface VerificationAnswer {
  question: string;
  status: "confirmed" | "denied" | "unknown" | "unchecked";
  note: string;
}

export interface RereviewInput extends AnalyzeInput {
  previous: AnalyzeResult;
  answers: VerificationAnswer[];
  freeNote: string;
}

export function buildRereviewPrompt(input: RereviewInput): { system: string; user: string } {
  const system = `${CORE_ROLE}

${CORE_RULES}${renderPolicy(input.settings)}

# 今回は再レビューです

一度出した判定に対して、利用者が実際に確認した結果が返ってきました。
推測だった部分が事実に置き換わるので、判定を更新してください。

  - 事実で裏付けられた読みは確度を上げ、否定された読みは確度を下げるか readings から外す
  - 確認結果から新たに見えた懸念があれば追加してよい
  - 未確認の項目については、前回の判断を維持する（勝手に動かさない）
  - changes に、変化した読みとその理由を書く
  - resolved_readings に、白黒がついた辞書項目だけを挙げる。これは学習データとして
    記録されるので、決着していないものを推測で埋めないこと。曖昧なら含めない
  - verification_questions は、まだ残っている確認事項に更新する。すべて解消したなら
    当日その場で見るべき点（受付での様子、写真との一致など）を挙げる

出力は指定された JSON スキーマに従ってください。日本語で書いてください。`;

  const answered = input.answers
    .map(
      (a, i) =>
        `${i + 1}. ${a.question}\n   → ${STATUS_LABEL[a.status] ?? a.status}${a.note ? `\n   → メモ: ${a.note}` : ""}`,
    )
    .join("\n");

  const prevReadings = input.previous.readings
    .map(
      (r) =>
        `- [${r.id}] (確度 ${(r.confidence * 100).toFixed(0)}%, lexicon: ${r.lexicon_id || "なし"})
  引用: ${r.quote}
  読み: ${r.skeptical}`,
    )
    .join("\n");

  const user = `# プロフィール本文

\`\`\`
${input.profile}
\`\`\`

# 構造情報

${renderMeta(input.meta)}

# 前回の判定

総合: ${input.previous.verdict}
要約: ${input.previous.summary}

裏読み:
${prevReadings}

# 利用者が確認してきた結果

${answered || "（個別項目の回答なし）"}

${input.freeNote ? `# 利用者の追記メモ\n\n${input.freeNote}` : ""}

# 辞書項目の現在の的中率（参考）

${renderHitsCompact(input.hits, input.stats)}${renderSimilar(input.similar)}`;

  return { system, user };
}

// ---------------------------------------------------------------- 3. 過去実績の構造化

export interface ImportInput {
  rawText: string;
  lexiconCatalog: { id: string; label: string; hypothesis: string }[];
}

export function buildImportPrompt(input: ImportInput): { system: string; user: string } {
  const system = `${CORE_ROLE}

# 今回の作業

利用者が過去に登楼した嬢について、記憶で書いた文章を渡します。これを構造化して、
学習データに変換してください。

最も重要なのは reading_verdicts です。「プロフィールにこういう特徴があり、実際は
こうだった」という対応が記述から読み取れる場合にだけ、該当する辞書項目を
confirmed（疑いが的中）または refuted（疑いが外れた）として挙げてください。

  - **推測で埋めないでください。** 記述に無いことを補完してはいけません。
    挙げられる項目が1つも無いなら空配列で構いません。それが正しい答えです。
  - 与えられた辞書一覧に存在する id だけを使ってください。新しい id を作らないでください。
  - confirmed / refuted の判断は「辞書の疑いの内容」に対して行います。
    例: 辞書「名器アピール → サービスが薄い疑い」に対して、
        記述が「名器と書いてあったが実際サービスは丁寧だった」なら refuted。
        「名器と書いてあって実際サービスは淡白だった」なら confirmed。

confidence_in_recall には、この記述がどれだけ具体的で信頼できるかを 0.0〜1.0 で
入れてください。「なんとなく微妙だった」程度なら低く、具体的な事実が並んで
いれば高く。この値は学習の重み付けに使われます。

出力は指定された JSON スキーマに従ってください。日本語で書いてください。`;

  const catalog = input.lexiconCatalog
    .map((e) => `- ${e.id} : ${e.label} — ${e.hypothesis.replace(/\s+/g, " ").trim()}`)
    .join("\n");

  const user = `# 利用者が書いた過去の記録

\`\`\`
${input.rawText}
\`\`\`

# 使用できる辞書項目の一覧

${catalog}`;

  return { system, user };
}
