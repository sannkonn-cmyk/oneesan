"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportedCase } from "@/lib/queries";

/**
 * 登録済みの過去実績。削除すると、そこから生まれた学習データも
 * 取り消して的中率を計算し直す（src/lib/service.ts の deletePastCase）。
 */
export function PastCaseList({ cases }: { cases: ImportedCase[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function remove(id: number) {
    setError("");
    setBusyId(id);
    try {
      const res = await fetch("/api/past-case", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "削除に失敗しました。");
        return;
      }
      setConfirmId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusyId(null);
    }
  }

  if (!cases.length) return null;

  return (
    <>
      <h2 className="sect">
        登録済み <span className="num font-normal text-dim">{cases.length}件</span>
      </h2>

      {error && <p className="mb-2 text-sm text-bad">{error}</p>}

      <div className="card space-y-3">
        {cases.map((c) => (
          <div key={c.id} className="border-t border-edgesoft pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-[13px]">
                  {c.girlName || "名前不明"}
                  <span className="ml-1.5 text-[11.5px] text-dim">{c.shopName}</span>
                </span>
                <div className="num mt-0.5 text-[10px] text-dim">
                  学習 {c.verdictCount}件
                  {c.recallConfidence != null &&
                    ` / 記憶の確度 ${Math.round(c.recallConfidence * 100)}%`}
                </div>
                {c.traits.length > 0 && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    {c.traits.join("、")}
                  </p>
                )}
              </div>

              {confirmId === c.id ? (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => remove(c.id)}
                    disabled={busyId === c.id}
                    className="bucket border-bad text-bad"
                  >
                    {busyId === c.id ? "削除中" : "削除する"}
                  </button>
                  <button onClick={() => setConfirmId(null)} className="bucket">
                    やめる
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(c.id)}
                  className="shrink-0 text-[11px] text-dim hover:text-bad"
                >
                  削除
                </button>
              )}
            </div>

            {confirmId === c.id && (
              <p className="hint mt-2">
                この登録と、ここから作られた学習データ {c.verdictCount} 件を取り消します。
                辞書の的中率は計算し直されます。
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="hint mt-3">
        記憶で入力した分は、実測データの半分の重み（0.5件分）で集計しています。
        同列に扱うと的中率が信用できなくなるためです。
      </p>
    </>
  );
}
