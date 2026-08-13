/**
 * 辞書エンジンの動作確認。
 *   npm run test:lexicon
 * DB もネットワークも使わないので、いつでも安全に実行できる。
 */
import { loadLexicon, matchLexicon } from "../src/lib/lexicon/index";
import type { ProfileMeta } from "../src/lib/lexicon/types";

let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function ids(text: string, meta: ProfileMeta = {}): string[] {
  return matchLexicon(text, meta).map((h) => h.entry.id);
}

console.log("\n[1] 辞書の読み込みと検証");
const lex = loadLexicon(true);
check(`version が取得できる (${lex.version})`, Boolean(lex.version));
check(`エントリが十分にある (${lex.entries.length}件)`, lex.entries.length >= 25);
const cats = new Set(lex.entries.map((e) => e.category));
check(
  `6カテゴリすべて存在する (${[...cats].join(", ")})`,
  ["over_claim", "euphemism", "omission", "economic", "authorship", "positive"].every((c) =>
    cats.has(c),
  ),
);

console.log("\n[2] 過剰主張のマッチ");
{
  const got = ids("締まりが良い名器です♡業界最高峰の癒しをお届け！");
  check("名器アピールを検出", got.includes("meiki_claim"), got.join(","));
  check("最上級の煽りを検出", got.includes("superlative_hype"), got.join(","));
}

console.log("\n[3] 婉曲・否定形のマッチ");
{
  const got = ids("愛嬌抜群の癒し系です。マグロではありませんのでご安心を。ぽっちゃりしてます。");
  check("愛嬌・癒し系を検出", got.includes("aikyou_substitute"), got.join(","));
  check("否定形の自己弁護を検出", got.includes("negation_tell"), got.join(","));
  check("体型の婉曲表現を検出", got.includes("body_hedge"), got.join(","));
}

console.log("\n[4] 欠落の検出（absent_patterns）");
{
  const thin = "はじめまして！よろしくお願いします♡ 一緒に楽しい時間を過ごしましょう！";
  const got = ids(thin);
  check("サービス具体記述の欠落を検出", got.includes("no_service_detail"), got.join(","));

  const rich = "オプションは一通り対応可能です。マット・密着・洗体が得意です。";
  const got2 = ids(rich);
  check("具体記述があれば欠落は検出しない", !got2.includes("no_service_detail"), got2.join(","));
  check("サービス具体性を正シグナルとして検出", got2.includes("service_detail_rich"), got2.join(","));
}

console.log("\n[5] 未入力メタは『判定不能』として扱う（false ではない）");
{
  const text = "よろしくお願いします";
  const unknown = ids(text, {});
  check(
    "写真枚数が未入力なら photo_single を出さない",
    !unknown.includes("photo_single"),
    unknown.join(","),
  );
  const known = ids(text, { photo_count: 1 });
  check("写真枚数1と入力されれば検出する", known.includes("photo_single"), known.join(","));
  const many = ids(text, { photo_count: 6 });
  check("写真6枚なら正シグナル photo_rich", many.includes("photo_rich"), many.join(","));
  check("写真6枚なら photo_single は出さない", !many.includes("photo_single"), many.join(","));
}

console.log("\n[6] patterns と meta の組み合わせ（require: all）");
{
  const t = "新人です！よろしくお願いします";
  const short = ids(t, { tenure_months: 1 });
  check("在籍1ヶ月なら新人表記は問題視しない", !short.includes("long_running_newbie"));
  const long = ids(t, { tenure_months: 8 });
  check("在籍8ヶ月で新人表記なら検出", long.includes("long_running_newbie"), long.join(","));
}

console.log("\n[7] min_count（回数しきい値）");
{
  const once = ids("本日は割引あります");
  check("割引の言及1回では反応しない", !once.includes("heavy_discount"), once.join(","));
  const twice = ids("本日は割引あります。さらに半額イベント価格！");
  check("2回以上で検出", twice.includes("heavy_discount"), twice.join(","));
}

console.log("\n[8] 信頼シグナル（穿ちすぎ防止の逆張り）");
{
  const honest =
    "アナル舐めは苦手なのでご遠慮ください。最近サウナにハマってます。オプションは対応可能、マットと密着が得意です。";
  const got = ids(honest, { photo_count: 6, diary_count_recent: 5, tenure_months: 18 });
  check("できないことの明記を検出", got.includes("states_limits"), got.join(","));
  check("具体的な固有名詞を検出", got.includes("concrete_specifics"), got.join(","));
  check("長期在籍を検出", got.includes("long_tenure"), got.join(","));
  check("日記活発を検出", got.includes("diary_active"), got.join(","));

  const positives = matchLexicon(honest, {
    photo_count: 6,
    diary_count_recent: 5,
    tenure_months: 18,
  }).filter((h) => h.entry.category === "positive");
  check(`正シグナルが複数立つ (${positives.length}件)`, positives.length >= 4);
}

console.log(
  failures === 0
    ? `\n全て成功しました。\n`
    : `\n${failures} 件失敗しました。\n`,
);
process.exit(failures === 0 ? 0 : 1);
