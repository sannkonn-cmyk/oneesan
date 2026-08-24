"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 単独記録の削除。判定に紐づく記録はここから消せない（判定側から消す）。 */
export function VisitDelete({ id }: { id: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/outcome", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "削除に失敗しました。");
        return;
      }
      router.push("/log");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        className="block w-full text-center text-[11px] text-dim underline hover:text-bad"
        onClick={() => setConfirming(true)}
      >
        この記録を削除する
      </button>
    );
  }

  return (
    <div className="card space-y-2">
      <p className="hint">この記録を消します。元に戻せません。</p>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-1.5">
        <button onClick={remove} disabled={busy} className="bucket flex-1 border-bad text-bad">
          {busy ? "削除中" : "削除する"}
        </button>
        <button onClick={() => setConfirming(false)} className="bucket flex-1">
          やめる
        </button>
      </div>
    </div>
  );
}
