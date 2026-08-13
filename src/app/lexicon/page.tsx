import { CATEGORY_LABEL } from "@/lib/lexicon/types";
import { getLearningSummary, listLexiconWithStats, type LexiconView } from "@/lib/queries";

export const dynamic = "force-dynamic";

const CATEGORY_ORDER = [
  "over_claim",
  "euphemism",
  "omission",
  "economic",
  "authorship",
  "positive",
];

function rateColor(v: LexiconView): string {
  if (v.stat.unverified) return "text-dim";
  if (v.entry.category === "positive") return v.stat.rate >= 0.65 ? "text-good" : "text-warn";
  if (v.stat.rate >= 0.65) return "text-bad";
  if (v.stat.rate >= 0.45) return "text-warn";
  return "text-good";
}

function Row({ v }: { v: LexiconView }) {
  const pct = Math.round(v.stat.rate * 100);
  const lo = Math.round(v.stat.ci[0] * 100);
  const hi = Math.round(v.stat.ci[1] * 100);

  return (
    <div className="flex items-center gap-3 border-t border-edgesoft py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px]">{v.entry.label}</div>
        <div className="num text-[10px] text-dim">{v.entry.id}</div>
        {/* 薄い帯＝まだこのくらい振れうる幅。件数が少ないほど広くなる。 */}
        <div className="relative mt-1.5 h-1 w-full rounded-full bg-edgesoft">
          <span
            className="absolute h-full rounded-full bg-accentdim"
            style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 1)}%` }}
          />
          <span className="absolute h-full w-0.5 bg-accent" style={{ left: `${pct}%` }} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={`num text-[15px] ${rateColor(v)}`}>{pct}%</div>
        <div className="num text-[9.5px] text-dim">
          {v.stat.unverified ? "未検証" : `実績 ${v.stat.observations}件`}
        </div>
      </div>
    </div>
  );
}

export default async function Page() {
  const all = listLexiconWithStats();
  const s = getLearningSummary();

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABEL[cat] ?? cat,
    items: all.filter((v) => v.entry.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-accent">裏読み辞書</h1>
        <span className="num text-[10.5px] text-dim">
          {s.totalEntries}項目 / {s.verifiedEntries}検証済
        </span>
      </header>

      <div className="card-flat">
        <p className="hint">
          あなたの実績で育った的中率です。縦線がいまの値、薄い帯は「まだこのくらい振れうる」幅。
          件数が少ないうちは帯が広く、信用できないことが見た目で分かります。
        </p>
      </div>

      {byCategory.map((g) => (
        <section key={g.cat}>
          <p className="num mb-1 mt-4 text-[9.5px] uppercase tracking-widest text-dim">{g.label}</p>
          <div className="card py-1">
            {g.items.map((v) => (
              <Row key={v.entry.id} v={v} />
            ))}
          </div>
        </section>
      ))}

      <div className="card-flat">
        <p className="hint">
          辞書はメモ帳で開ける1枚のファイルです（<code className="text-accent">src/lib/lexicon/lexicon.yaml</code>）。
          新しい言い回しに気づいたら、自分で書き足せます。書き方はファイル冒頭のコメントにあります。
        </p>
      </div>
    </div>
  );
}
