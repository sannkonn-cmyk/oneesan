"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type State = "queued" | "running" | "done" | "failed";

interface Entry {
  text: string;
  state: State;
  message?: string;
}

const STORAGE_KEY = "oneesan.import.draft";

const EXAMPLE = `川崎の店の あやさん。名器アピールがすごかったけど実際はサービス丁寧で当たりだった。写真も本人。満足度5でリピートした。

吉原の りかさん。写真1枚だけで顔出しなし。実際も写真とだいぶ違った。接客は普通。満足度2。`;

/**
 * 過去実績の一括登録。
 *
 * まとめて1回のAPIに投げず、1件ずつ順に処理する。
 * 途中で利用枠が尽きても、そこまでの分は確実に保存されているため
 * 続きから再開できる。全部やり直しになるのを避けるための設計。
 */
export function ImportRunner() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [blocker, setBlocker] = useState("");

  // 入力途中の内容が事故で消えないよう控えておく
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setRaw(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, raw);
  }, [raw]);

  const split = (text: string): string[] =>
    text
      .split(/\n\s*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 5);

  const doneCount = entries.filter((e) => e.state === "done").length;
  const remaining = entries.filter((e) => e.state === "queued" || e.state === "failed").length;

  async function run(list: Entry[]) {
    setRunning(true);
    setStopped(false);
    setBlocker("");

    const next = [...list];
    for (let i = 0; i < next.length; i++) {
      if (next[i].state === "done") continue;

      next[i] = { ...next[i], state: "running" };
      setEntries([...next]);

      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: next[i].text }),
        });
        const json = await res.json();

        if (!json.ok) {
          next[i] = { ...next[i], state: "failed", message: json.error };
          setEntries([...next]);
          // 枠切れ・認証エラーは続けても無駄なので、そこで止めて再開できるようにする
          if (json.kind === "quota" || json.kind === "auth") {
            setBlocker(json.error);
            setStopped(true);
            setRunning(false);
            return;
          }
          continue;
        }

        const d = json.data;
        const who = [d.result.shop_name, d.result.girl_name].filter(Boolean).join(" ") || "名前不明";
        next[i] = {
          ...next[i],
          state: "done",
          message:
            d.evidenceCount > 0
              ? `${who} — 学習データ ${d.evidenceCount}件を記録`
              : `${who} — 記録のみ（辞書に結び付く記述が読み取れず、学習データは作成せず）`,
        };
        setEntries([...next]);
      } catch (e) {
        next[i] = {
          ...next[i],
          state: "failed",
          message: e instanceof Error ? e.message : "通信に失敗しました",
        };
        setEntries([...next]);
      }
    }

    setRunning(false);
    router.refresh();
  }

  function start() {
    const list = split(raw).map<Entry>((text) => ({ text, state: "queued" }));
    setEntries(list);
    if (list.length) void run(list);
  }

  const count = split(raw).length;

  return (
    <div className="space-y-3">
      <div className="card">
        <p className="mb-3 text-[13px] leading-relaxed">
          覚えている範囲を、文章のまま書いてください。整った形式にする必要はありません。
          <b className="text-accent">1人分ずつ空行で区切って</b>ください。
        </p>
        <textarea
          className="input"
          rows={9}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={EXAMPLE}
          disabled={running}
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="hint">
            10人分も入れれば、初日からある程度あなた好みに寄った判定が出ます。
          </p>
          {count > 0 && <span className="num shrink-0 text-[11px] text-accent">{count}人分</span>}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="card space-y-3">
          <div className="num flex items-center gap-2 text-[11px] text-muted">
            <span>
              {doneCount} / {entries.length} 件
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-edgesoft">
              <span
                className="block h-full bg-accent transition-all"
                style={{ width: `${(doneCount / entries.length) * 100}%` }}
              />
            </span>
            <span>{running ? "処理中" : stopped ? "中断" : "完了"}</span>
          </div>

          <div className="space-y-1 text-[12.5px] leading-relaxed">
            {entries.map((e, i) => (
              <div
                key={i}
                className={
                  e.state === "done"
                    ? "text-good"
                    : e.state === "failed"
                      ? "text-bad"
                      : e.state === "running"
                        ? "text-accent"
                        : "text-dim"
                }
              >
                {e.state === "done" && "✓ "}
                {e.state === "failed" && "× "}
                {e.state === "running" && "… "}
                {e.state === "queued" && "・"}
                {e.message ?? e.text.slice(0, 32) + (e.text.length > 32 ? "…" : "")}
              </div>
            ))}
          </div>
        </div>
      )}

      {blocker && (
        <div className="rounded-lg border border-[#6b5423] bg-[#1d1810] p-3 text-[12px] leading-relaxed text-[#e0c384]">
          {blocker}
          <br />
          処理済みの分は保存されています。最初からやり直す必要はありません。
        </div>
      )}

      {!running && remaining > 0 && entries.length > 0 ? (
        <button className="btn-primary" onClick={() => void run(entries)}>
          続きから再開（残り {remaining} 件）
        </button>
      ) : (
        <button className="btn-primary" onClick={start} disabled={running || count === 0}>
          {running ? "処理中…" : `${count || ""}人分をまとめて登録`}
        </button>
      )}
    </div>
  );
}
