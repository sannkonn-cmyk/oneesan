import Link from "next/link";
import { notFound } from "next/navigation";
import { OutcomeForm } from "@/components/OutcomeForm";
import { VisitDelete } from "@/components/VisitDelete";
import { getVisit } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** 単独記録の詳細。判定に紐づく記録は判定の画面に出るので、ここには来ない。 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const visit = getVisit(Number(id));
  if (!visit || visit.analysis_id) notFound();

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-accent">
            {visit.girl_name || "名前未入力"}
          </h1>
          <p className="truncate text-[11.5px] text-dim">{visit.shop_name || "店名未入力"}</p>
        </div>
        <span className="num shrink-0 text-[10.5px] text-dim">
          {(visit.visited_at || visit.created_at).slice(0, 10).replace(/-/g, "/")}
        </span>
      </header>

      <OutcomeForm analysisId={0} visitId={visit.id} existing={visit} solo />

      <VisitDelete id={visit.id} />

      <Link href="/log" className="hint block text-center underline">
        記録の一覧に戻る
      </Link>
    </div>
  );
}
