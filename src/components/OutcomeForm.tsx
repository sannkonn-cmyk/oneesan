"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutcomeRow } from "@/lib/queries";

const AXES = [
  { key: "satisfaction", label: "総合満足度" },
  { key: "service_rating", label: "サービス" },
  { key: "photo_match", label: "写真との一致" },
  { key: "attitude_rating", label: "接客態度" },
] as const;

type Key = (typeof AXES)[number]["key"];

/**
 * 登楼実績の入力。
 * ここで入れた5段階評価から、辞書の各項目が当たっていたかを自動判定して
 * 学習データに変換する（src/lib/service.ts の deriveVerdicts）。
 */
export function OutcomeForm({
  analysisId,
  existing,
}: {
  analysisId: number;
  existing?: OutcomeRow;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(existing));
  const [values, setValues] = useState<Record<Key, number>>({
    satisfaction: existing?.satisfaction ?? 0,
    service_rating: existing?.service_rating ?? 0,
    photo_match: existing?.photo_match ?? 0,
    attitude_rating: existing?.attitude_rating ?? 0,
  });
  const [visitedAt, setVisitedAt] = useState(existing?.visited_at ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  async function save() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis_id: analysisId, visited_at: visitedAt, note, ...values }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "保存に失敗しました。");
        return;
      }
      setSaved(json.data.evidenceCount);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        登楼実績を入力する
      </button>
    );
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-[12.5px] font-bold text-muted">登楼実績</h2>
        <p className="hint mt-1">
          入れた評価から「どの読みが当たったか」を自動で判定し、辞書の的中率に反映します。
          分からない項目は空のままで構いません。
        </p>
      </div>

      {AXES.map((axis) => (
        <div key={axis.key}>
          <p className="mb-1.5 text-[11.5px] text-muted">{axis.label}</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() =>
                  setValues((v) => ({ ...v, [axis.key]: v[axis.key] === n ? 0 : n }))
                }
                className={`bucket num flex-1 ${values[axis.key] === n ? "bucket-on" : ""}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div>
        <label className="label" htmlFor="visited">
          登楼日
        </label>
        <input
          id="visited"
          type="date"
          className="input"
          value={visitedAt}
          onChange={(e) => setVisitedAt(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="onote">
          所感
        </label>
        <textarea
          id="onote"
          className="input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="写真とは別人だったが接客は良かった、など"
        />
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      {saved !== null && (
        <div className="card-flat">
          <p className="hint">
            保存しました。
            {saved > 0 ? (
              <>
                この実績から <span className="num text-accent">{saved}</span> 件の学習データを
                記録し、辞書の的中率に反映しました。
              </>
            ) : (
              <>
                評価が「3（どちらとも言えない）」中心だったため、
                今回は学習データを記録していません。判断がつかないものを的中扱いすると
                数字が信用できなくなるためです。
              </>
            )}
          </p>
        </div>
      )}

      <button className="btn-primary" onClick={save} disabled={busy}>
        {busy ? "保存中…" : existing ? "実績を更新する" : "実績を保存する"}
      </button>
    </section>
  );
}
