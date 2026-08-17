import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeForm } from "@/components/OutcomeForm";
import { ResultView } from "@/components/ResultView";
import { VerificationPanel } from "@/components/VerificationPanel";
import { getAllStats } from "@/lib/lexicon/stats";
import { getOutcome, listChain, listVerifications } from "@/lib/queries";
import { getAnalysis } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = getAnalysis(Number(id));
  if (!analysis) notFound();

  const chain = listChain(analysis.root_analysis_id);
  const isLatest = analysis.round === Math.max(...chain.map((c) => c.round));
  const verifications = listVerifications(analysis.id);
  const outcome = getOutcome(analysis.root_analysis_id);
  const stats = getAllStats();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-accent">
            {analysis.girl_name || "名前未入力"}
          </h1>
          <p className="truncate text-[11.5px] text-dim">{analysis.shop_name || "店名未入力"}</p>
        </div>
        <span className="num shrink-0 text-[10.5px] text-dim">
          {analysis.round === 1 ? "1回目" : `${analysis.round}回目・再レビュー`}
        </span>
      </header>

      {chain.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {chain.map((c) => (
            <Link
              key={c.id}
              href={`/analysis/${c.id}`}
              className={`bucket ${c.id === analysis.id ? "bucket-on" : ""}`}
            >
              {c.round === 1 ? "初回" : `再${c.round - 1}`}
            </Link>
          ))}
        </div>
      )}

      <ResultView result={analysis.result} stats={stats} />

      <VerificationPanel
        analysisId={analysis.id}
        items={verifications}
        readOnly={!isLatest}
      />

      {!isLatest && (
        <p className="hint text-center">
          これは過去のラウンドです。確認結果の入力は最新のラウンドで行ってください。
        </p>
      )}

      <div className="pt-2">
        <OutcomeForm analysisId={analysis.root_analysis_id} existing={outcome} />
      </div>

      <Link
        href={`/export?scope=analysis&ids=${analysis.id}`}
        className="btn-ghost"
      >
        この判定を Claude に読ませる
      </Link>

      <details className="card">
        <summary className="cursor-pointer text-[11.5px] text-dim">
          このとき投入したプロフィール本文を見る
        </summary>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-ink/60 p-3 text-[12.5px] leading-relaxed text-slate-400">
          {analysis.raw_profile}
        </pre>
      </details>
    </div>
  );
}
