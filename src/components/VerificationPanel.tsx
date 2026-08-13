"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { VerificationRow } from "@/lib/queries";

type Status = "unchecked" | "confirmed" | "denied" | "unknown";

const OPTIONS: { value: Status; label: string }[] = [
  { value: "confirmed", label: "確認できた" },
  { value: "denied", label: "違った" },
  { value: "unknown", label: "分からず" },
];

/**
 * 確認すべきことのチェックリスト。
 * ここに結果を入れて再レビューすると、推測が事実に置き換わって確度が動く。
 * 同時に「読みが当たったか」の学習データもここで発生する。
 */
export function VerificationPanel({
  analysisId,
  items,
  readOnly,
}: {
  analysisId: number;
  items: VerificationRow[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<number, { status: Status; note: string }>>(
    Object.fromEntries(
      items.map((i) => [i.id, { status: (i.status as Status) ?? "unchecked", note: i.note ?? "" }]),
    ),
  );
  const [freeNote, setFreeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const answeredCount =
    Object.values(answers).filter((a) => a.status !== "unchecked" || a.note).length +
    (freeNote.trim() ? 1 : 0);

  async function rereview() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/rereview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          analysis_id: analysisId,
          free_note: freeNote,
          answers: items.map((i) => ({
            question: i.question,
            status: answers[i.id]?.status ?? "unchecked",
            note: answers[i.id]?.note ?? "",
          })),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "再レビューに失敗しました。");
        return;
      }
      router.push(`/analysis/${json.data.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="sect">
        確認すべきこと <span className="num font-normal text-dim">{items.length}件</span>
      </h2>

      <div className="card">
        <p className="hint mb-1">
          検証価値の高い順です。
          {!readOnly && "結果を入れて「もう一度読み直す」を押すと、判定が更新されます。"}
        </p>

        {items.map((item, idx) => {
          const a = answers[item.id];
          return (
            <div
              key={item.id}
              className="border-t border-edgesoft py-3 first:border-t-0 first:pt-1"
            >
              <p className="mb-2 text-[13.5px] leading-relaxed">
                <span className="num mr-1.5 text-[11px] text-accent">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {item.question}
              </p>

              <div className="mb-2 flex gap-1.5">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    disabled={readOnly}
                    onClick={() =>
                      setAnswers((s) => ({
                        ...s,
                        [item.id]: {
                          note: s[item.id]?.note ?? "",
                          status: s[item.id]?.status === o.value ? "unchecked" : o.value,
                        },
                      }))
                    }
                    className={`bucket flex-1 ${a?.status === o.value ? "bucket-on" : ""}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <input
                className="input text-[13px]"
                disabled={readOnly}
                value={a?.note ?? ""}
                onChange={(e) =>
                  setAnswers((s) => ({
                    ...s,
                    [item.id]: { status: s[item.id]?.status ?? "unchecked", note: e.target.value },
                  }))
                }
                placeholder="メモ（任意）"
              />
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <>
          <div className="card">
            <label className="label" htmlFor="freenote">
              その他に気づいたこと
            </label>
            <textarea
              id="freenote"
              className="input"
              rows={2}
              value={freeNote}
              onChange={(e) => setFreeNote(e.target.value)}
              placeholder="電話の対応が丁寧だった、など"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm leading-relaxed text-bad">
              {error}
            </div>
          )}

          <button className="btn-primary" onClick={rereview} disabled={busy || !answeredCount}>
            {busy ? "読み直しています…" : "もう一度読み直す"}
          </button>
          {!answeredCount && (
            <p className="hint text-center">
              確認結果を1つ以上入力すると押せるようになります
            </p>
          )}
        </>
      )}
    </section>
  );
}
