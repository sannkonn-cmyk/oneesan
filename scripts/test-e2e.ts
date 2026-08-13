/**
 * 通しの動作確認。実際に Claude を呼ぶので利用枠を消費する。
 *   npm run test:e2e
 *
 * 一時DBを使うので本番のデータには触らない。
 * 見ているのは「動くか」ではなく「出力が使い物になるか」:
 *   - 引用が本文に実在するか（捏造していないか）
 *   - 穿った読みが根拠まで書けているか
 *   - 外れる条件が全件に付いているか
 *   - 確認事項が具体的な行動になっているか
 *   - 正のシグナルがあるのに「見送り」に倒れていないか（悲観バイアス検査）
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "oneesan-e2e-"));
process.env.DATABASE_PATH = path.join(TMP, "e2e.db");

const { runAnalyze } = await import("../src/lib/service");
const { getDb } = await import("../src/lib/db");
const { expandMetaSelection } = await import("../src/lib/meta");

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       → ${detail}` : ""}`);
  }
}

// 負のシグナルと正のシグナルを意図的に混ぜたプロフィール。
// 全部を疑って「見送り」に倒れないかを見るための材料。
const PROFILE = `はじめまして、ゆいです♡
業界最高峰のルックスって言われます！
締まりが良い名器と評判なので確かめに来てくださいね♡
マグロではありませんので安心してください！
アナル舐めは苦手なのでごめんなさい。最近サウナにハマってます。
本日ラスト1枠です、お急ぎください♡`;

// 写真1枚 / 在籍3ヶ月〜1年 / 口コミ0〜2件 / 日記なし / 顔出しなし / 3サイズ非公開
const { values, labels } = expandMetaSelection({
  photo_count: 0,
  tenure_months: 1,
  review_count: 0,
  diary_count_recent: 0,
  has_face_photo: 1,
  sizes_disclosed: 1,
});

/** 文末記号で数える。日本語なので「。」「！」「？」を境界とする。 */
const sentenceCount = (s: string): number =>
  s.split(/[。！？]/).map((x) => x.trim()).filter(Boolean).length;

const VAGUE = ["サービスを確認", "写真を確認", "口コミを確認", "調べる", "確認する。"];

console.log("\nClaude を1回呼び出します（サブスク枠を消費します）…\n");
const started = Date.now();

const { id, result } = await runAnalyze({
  profile: PROFILE,
  meta: { ...values, labels, price_yen: 28000, duration_min: 90 },
  shopName: "テスト店",
  girlName: "ゆい",
});

console.log(`所要 ${((Date.now() - started) / 1000).toFixed(1)}秒\n`);

console.log("[1] 出力の骨格");
check("要約がある", result.summary.length > 10, result.summary);
check(`裏読みが3件以上ある（${result.readings.length}件）`, result.readings.length >= 3);
check("総合判定が3択のいずれか", ["指名推奨", "条件付き", "見送り"].includes(result.verdict));
check("欠落が挙がっている", result.omissions.length > 0);
check(
  `確認事項が3件以上ある（${result.verification_questions.length}件）`,
  result.verification_questions.length >= 3,
);

console.log("\n[2] 引用の捏造チェック");
{
  // 構造情報だけを根拠にした読みは本文に無くてよいので、そこは除外して数える。
  const textQuotes = result.readings.filter(
    (r) => r.quote.length > 6 && !/枚|ヶ月|件|非公開|なし/.test(r.quote.slice(0, 8)),
  );
  const bad = textQuotes.filter((r) => !PROFILE.includes(r.quote.trim()));
  check(
    `本文からの引用が一字一句一致している（${textQuotes.length}件中${textQuotes.length - bad.length}件）`,
    bad.length === 0,
    bad.map((b) => b.quote).join(" / "),
  );
}

console.log("\n[3] 穿った読みの中身");
{
  const shallow = result.readings.filter((r) => sentenceCount(r.skeptical) < 3);
  check(
    "全ての読みが3文以上で書かれている",
    shallow.length === 0,
    shallow.map((r) => `${r.id}: ${sentenceCount(r.skeptical)}文`).join(" / "),
  );
  const noCounter = result.readings.filter((r) => r.counter_evidence.trim().length < 15);
  check(
    "全ての読みに『外れる条件』が付いている",
    noCounter.length === 0,
    noCounter.map((r) => r.id).join(" / "),
  );
  const badConf = result.readings.filter((r) => r.confidence < 0 || r.confidence > 1);
  check("確度が 0〜1 に収まっている", badConf.length === 0);
}

console.log("\n[4] 確認事項が具体的な行動になっているか");
{
  const vague = result.verification_questions.filter(
    (q) => q.length < 20 || VAGUE.some((v) => q.trim() === v),
  );
  check("曖昧な指示が混ざっていない", vague.length === 0, vague.join(" / "));
}

console.log("\n[5] 悲観バイアス検査");
{
  check(
    `正のシグナルがあるので『見送り』に倒れていない（判定: ${result.verdict}）`,
    result.verdict !== "見送り",
    "NG明記と固有名詞という正のシグナルがあるのに全否定している",
  );
  const limits = result.readings.find(
    (r) => r.lexicon_id === "states_limits" || r.quote.includes("苦手"),
  );
  check(
    "『できないことの明記』を信頼材料（trust）として扱っている",
    !limits || limits.stance === "trust" || limits.confidence <= 0.4,
    limits ? `stance=${limits.stance} 確度=${limits.confidence}` : "",
  );
  check(
    "信頼材料が1件以上挙がっている",
    result.readings.some((r) => r.stance === "trust"),
    "正のシグナルを一つも拾えていない（穿ちすぎ）",
  );
  const scores = result.scores;
  check(
    "全スコアが 0-100 に収まっている",
    Object.values(scores).every((v) => v >= 0 && v <= 100),
    JSON.stringify(scores),
  );
}

console.log("\n[6] 保存されているか");
{
  const db = getDb();
  const n = (sql: string): number => db.prepare<[], { n: number }>(sql).get()?.n ?? 0;
  check("analysis が1件", n("SELECT COUNT(*) AS n FROM analysis") === 1);
  check(
    `reading が保存されている（${n("SELECT COUNT(*) AS n FROM reading")}件）`,
    n("SELECT COUNT(*) AS n FROM reading") === result.readings.length,
  );
  check(
    "verification が保存されている（再レビューの入口になる）",
    n("SELECT COUNT(*) AS n FROM verification") === result.verification_questions.length,
  );
  const row = db
    .prepare<[number], { root_analysis_id: number; round: number }>(
      "SELECT root_analysis_id, round FROM analysis WHERE id = ?",
    )
    .get(id);
  check("初回は round=1 かつ root が自分自身", row?.round === 1 && row?.root_analysis_id === id);
}

console.log("\n---- 出力サンプル ----");
console.log(`判定: ${result.verdict}`);
console.log(`要約: ${result.summary}`);
console.log(`スコア: ${JSON.stringify(result.scores)}`);
console.log(`\n裏読み1件目:`);
console.log(`  引用: ${result.readings[0]?.quote}`);
console.log(`  読み: ${result.readings[0]?.skeptical}`);
console.log(`  外れる条件: ${result.readings[0]?.counter_evidence}`);
console.log(`\n確認すべきこと:`);
result.verification_questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
process.exit(failures === 0 ? 0 : 1);
