import { ImportRunner } from "@/components/ImportRunner";
import { listImportedCases } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cases = listImportedCases();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-accent">過去のお姉さんを登録</h1>
        <span className="num text-[10.5px] text-dim">初期学習</span>
      </header>

      <ImportRunner />

      {cases.length > 0 && (
        <>
          <h2 className="sect">
            登録済み <span className="num font-normal text-dim">{cases.length}件</span>
          </h2>
          <div className="card space-y-3">
            {cases.map((c) => (
              <div key={c.id} className="border-t border-edgesoft pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px]">
                    {c.girlName || "名前不明"}
                    <span className="ml-1.5 text-[11.5px] text-dim">{c.shopName}</span>
                  </span>
                  <span className="num shrink-0 text-[10px] text-dim">
                    学習 {c.verdictCount}件
                    {c.recallConfidence != null &&
                      ` / 記憶の確度 ${Math.round(c.recallConfidence * 100)}%`}
                  </span>
                </div>
                {c.traits.length > 0 && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    {c.traits.join("、")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="hint">
            記憶で入力した分は、実測データの半分の重み（0.5件分）で集計しています。
            同列に扱うと的中率が信用できなくなるためです。
          </p>
        </>
      )}
    </div>
  );
}
