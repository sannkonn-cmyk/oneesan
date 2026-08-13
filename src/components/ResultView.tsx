import { AXIS_LABEL, type Axis, type EntryStat } from "@/lib/lexicon/types";
import type { AnalyzeResult, RereviewResult } from "@/lib/schemas";

const VERDICT_STYLE: Record<string, string> = {
  指名推奨: "bg-good/15 text-good border-good/40",
  条件付き: "bg-warn/15 text-warn border-warn/40",
  見送り: "bg-bad/15 text-bad border-bad/40",
};

export function VerdictBadge({ verdict }: { verdict: string }) {
  return (
    <span
      className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${
        VERDICT_STYLE[verdict] ?? "border-edge text-slate-200"
      }`}
    >
      {verdict}
    </span>
  );
}

/** landmine_risk だけは「高い＝悪い」なので、バーの色の判定を反転させる。 */
function barColor(axis: Axis, value: number): string {
  const good = axis === "landmine_risk" ? value <= 35 : value >= 65;
  const bad = axis === "landmine_risk" ? value >= 65 : value <= 35;
  return good ? "bg-good" : bad ? "bg-bad" : "bg-warn";
}

export function ScoreBars({ scores }: { scores: AnalyzeResult["scores"] }) {
  return (
    <div className="space-y-2">
      {(Object.keys(AXIS_LABEL) as Axis[]).map((axis) => {
        const v = scores[axis];
        return (
          <div key={axis} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-muted">
              {AXIS_LABEL[axis]}
              {axis === "landmine_risk" && (
                <span className="ml-1 text-[10px] text-bad">↑危険</span>
              )}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-edge">
              <div className={`h-full ${barColor(axis, v)}`} style={{ width: `${v}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-300">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatChip({ stat }: { stat?: EntryStat }) {
  if (!stat) return null;
  if (stat.unverified) {
    return (
      <span className="chip border-dashed">
        未検証（実績0件・辞書の初期値 {(stat.rate * 100).toFixed(0)}%）
      </span>
    );
  }
  const width = ((stat.ci[1] - stat.ci[0]) * 100).toFixed(0);
  return (
    <span className="chip">
      この観点の的中率 {(stat.rate * 100).toFixed(0)}%（実績{stat.observations}件
      {Number(width) > 30 ? "・まだ振れ幅大" : ""}）
    </span>
  );
}

export function ReadingCard({
  reading,
  stat,
}: {
  reading: AnalyzeResult["readings"][number];
  stat?: EntryStat;
}) {
  const pct = Math.round(reading.confidence * 100);
  const tone = pct >= 65 ? "text-bad" : pct >= 40 ? "text-warn" : "text-muted";

  return (
    <article className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <blockquote className="border-l-2 border-accent/60 pl-3 text-sm italic text-slate-300">
          {reading.quote}
        </blockquote>
        <span className={`shrink-0 text-xs font-bold tabular-nums ${tone}`}>確度 {pct}%</span>
      </div>

      <div>
        <p className="label">額面どおりの意味</p>
        <p className="text-sm text-slate-400">{reading.surface}</p>
      </div>

      <div>
        <p className="label">穿った読み</p>
        <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed text-slate-100">
          {reading.skeptical}
        </p>
      </div>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-accent hover:underline">
          この読みが外れる条件を見る
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-ink/60 p-3 text-sm leading-relaxed text-slate-300">
          {reading.counter_evidence}
        </p>
      </details>

      {reading.lexicon_id && (
        <div className="flex flex-wrap gap-2 pt-1">
          <span className="chip">{reading.lexicon_id}</span>
          <StatChip stat={stat} />
        </div>
      )}
    </article>
  );
}

export function ChangeList({ changes }: { changes: RereviewResult["changes"] }) {
  if (!changes.length) return null;
  return (
    <section className="card border-accent/40">
      <h2 className="mb-3 text-sm font-bold text-accent">前回の判定からの変化</h2>
      <ul className="space-y-3">
        {changes.map((c, i) => {
          const before = Math.round(c.before_confidence * 100);
          const after = Math.round(c.after_confidence * 100);
          const down = after < before;
          return (
            <li key={i} className="text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs tabular-nums">
                <span className="chip">{c.reading_id}</span>
                <span className="text-muted">確度 {before}%</span>
                <span className={down ? "text-good" : "text-bad"}>→ {after}%</span>
                <span className={down ? "text-good" : "text-bad"}>{down ? "▼" : "▲"}</span>
              </div>
              <p className="leading-relaxed text-slate-300">{c.why}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ResultView({
  result,
  stats,
}: {
  result: AnalyzeResult | RereviewResult;
  stats: Map<string, EntryStat>;
}) {
  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[0.95rem] leading-relaxed text-slate-100">{result.summary}</p>
          <VerdictBadge verdict={result.verdict} />
        </div>
        <ScoreBars scores={result.scores} />
        <p className="border-t border-edge pt-3 text-sm leading-relaxed text-slate-400">
          {result.rationale}
        </p>
      </section>

      {"changes" in result && <ChangeList changes={result.changes} />}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300">
          裏読み <span className="text-muted">（{result.readings.length}件）</span>
        </h2>
        {result.readings.map((r) => (
          <ReadingCard key={r.id} reading={r} stat={stats.get(r.lexicon_id)} />
        ))}
      </section>

      {result.omissions.length > 0 && (
        <section className="card">
          <h2 className="mb-1 text-sm font-bold text-slate-300">書かれていないこと</h2>
          <p className="mb-3 text-xs text-muted">
            欠落は最も情報量が多い部分です。これらが分からないまま判断していることを意識してください。
          </p>
          <ul className="space-y-2">
            {result.omissions.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                <span className="text-bad">–</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
