/**
 * 書き出しの単体確認。AI を呼ばないので何度でも走らせてよい。
 *
 *   npm run test:markdown
 *
 * 読み手はこのアプリを何も知らない外部の Claude なので、
 * 「数字の意味」と「何件に基づくか」が本文に入っていることが要点。
 * 少ない実績から一般化されるのが一番困る。
 */
import {
  EXPORT_SCOPES,
  buildMarkdown,
  markdownFilename,
  type ExportScope,
} from "../src/lib/markdown";
import { listHistory } from "../src/lib/queries";

let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       → ${detail}` : ""}`);
  }
}

const history = listHistory(5);
const ids = history.map((h) => h.latestId);

console.log("\n[1] どの単位でも落ちないこと");
for (const scope of EXPORT_SCOPES) {
  let md = "";
  let err = "";
  try {
    md = buildMarkdown(scope, ids);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  check(`${scope} が作れる`, md.length > 0 && !err, err);
  check(`${scope} に読み手への注意がある`, md.includes("この利用者ひとりの実績"), md.slice(0, 80));
}

console.log("\n[2] 対象が空でも落ちないこと（使い始めの状態）");
for (const scope of EXPORT_SCOPES) {
  let ok = false;
  let err = "";
  try {
    ok = buildMarkdown(scope, []).length > 0;
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }
  check(`${scope} が空でも作れる`, ok, err);
}

console.log("\n[3] 前提が付いていること");
{
  // 候補だけ見せても、外の Claude はこの利用者の基準を知らない
  const compare = buildMarkdown("compare", ids);
  const overview = buildMarkdown("overview", []);
  check("compare に判断基準が入る", compare.includes("# 私の判断基準"));
  check("overview に判断基準が入る", overview.includes("# 私の判断基準"));
  check("compare は基準が候補より前にある", compare.indexOf("# 私の判断基準") < compare.indexOf("# 今回の候補"));
  check("compare に相談内容が書かれている", compare.includes("# 相談したいこと"));
}

console.log("\n[4] 件数の少なさを隠さないこと");
{
  const context = buildMarkdown("context", []);
  const hasNote = /まだ\d+件|まだ0件|件。傾向の芽/.test(context);
  check("標本数の注記が入る", hasNote, context.slice(0, 400));
}

console.log("\n[5] 匿名化");
if (history.length) {
  const target = history.find((h) => h.girlName) ?? history[0];
  const named = buildMarkdown("analysis", [target.latestId]);
  const anon = buildMarkdown("analysis", [target.latestId], { anonymize: true });

  if (target.girlName) {
    check("そのままだと源氏名が出る", named.includes(target.girlName));
    check("伏せると源氏名が消える", !anon.includes(target.girlName), "名前が残っている");
    check("伏せ名に置き換わる", /嬢[A-Z]/.test(anon), anon.slice(0, 200));
  }
  if (target.shopName) {
    check("伏せると店名が消える", !anon.includes(target.shopName), "店名が残っている");
  }
  // 名前以外は消してはいけない。判定の中身が失われては意味が無い
  check("判定の中身は残る", anon.includes("## 総合判定"), anon.slice(0, 200));
} else {
  console.log("  （判定がまだ無いので飛ばします）");
}

console.log("\n[6] ファイル名");
for (const scope of EXPORT_SCOPES) {
  const name = markdownFilename(scope as ExportScope);
  check(`${scope} の名前が妥当`, /^oneesan-[a-z]+-\d{4}-\d{2}-\d{2}\.md$/.test(name), name);
}

console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
process.exit(failures === 0 ? 0 : 1);
