/**
 * 的中率の再計算。
 *   npm run recompute
 *
 * lexicon_stat（集計値）を lexicon_evidence（根拠）から作り直す。
 * 誤った実績を入れてしまったときは、lexicon_evidence の該当行を消してから
 * これを走らせれば正しい値に戻る。集計値を直接いじる必要はない。
 */
import { recomputeAllStats } from "../src/lib/lexicon/stats";
import { getAllStats } from "../src/lib/lexicon/stats";

const touched = recomputeAllStats();
console.log(`\n${touched} 項目を再計算しました。\n`);

const verified = [...getAllStats().values()]
  .filter((s) => !s.unverified)
  .sort((a, b) => b.rate - a.rate);

if (verified.length === 0) {
  console.log("実績のある項目はまだありません。");
  console.log("判定→確認→再レビュー、または過去実績の登録で溜まっていきます。\n");
} else {
  console.log("実績のある項目:");
  for (const s of verified) {
    const pct = (s.rate * 100).toFixed(0).padStart(3);
    console.log(
      `  ${pct}%  ${s.lexiconId.padEnd(24)} 実績${String(s.observations).padStart(4)}件` +
        `（的中 ${s.hits} / 外れ ${s.misses}）`,
    );
  }
  console.log("");
}
