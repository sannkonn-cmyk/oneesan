"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "oneesan.import.draft";

const PLACEHOLDER = `シティヘブンのプロフィールをそのまま貼り付けて、
最後にご自身の評価を書き添えてください。

例）
広島ブルームーンの ひよりさん
（ここにプロフィールを貼り付け）

私の評価：淫語が良き、いちゃらぶえっちが楽しい。
写真も本人。満足度5でリピートした。`;

interface Done {
  who: string;
  satisfaction: number;
  evidenceCount: number;
  traits: string[];
}

/**
 * 過去実績の登録。1人ずつ処理する。
 *
 * 以前は空行区切りで複数人をまとめて処理していたが、
 * シティヘブンのプロフィールをそのまま貼ると本文中に空行が入るため、
 * 1人が複数人に割れてしまう。貼り付け方を利用者に合わせるほうが正しい。
 */
export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  // 長文を打ち込んだ直後の事故で消えないよう控えておく
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setText(saved);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, text);
  }, [text]);

  async function submit() {
    setError("");
    setDone(null);
    if (text.trim().length < 5) {
      setError("内容を貼り付けてください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!json.ok) {
        // 失敗時は入力を消さない。書き直しをやり直させないため。
        setError(json.error ?? "登録に失敗しました。");
        return;
      }
      const d = json.data;
      setDone({
        who: [d.result.shop_name, d.result.girl_name].filter(Boolean).join(" ") || "名前不明",
        satisfaction: d.result.outcome.satisfaction,
        evidenceCount: d.evidenceCount,
        traits: d.result.recalled_traits ?? [],
      });
      // 成功したら次の1人をすぐ貼れるように空にする
      setText("");
      localStorage.removeItem(STORAGE_KEY);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <p className="mb-3 text-[13px] leading-relaxed">
          <b className="text-accent">1人ずつ</b>登録します。プロフィールをそのまま貼り付けて、
          最後にご自身の評価（良かった点・満足度など）を書き添えてください。
        </p>
        <textarea
          className="input"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          disabled={busy}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="hint">
            10人分も入れれば、初日からある程度あなた好みに寄った判定が出ます。
          </p>
          {text.trim().length > 0 && (
            <span className="num shrink-0 text-[11px] text-dim">{text.length}文字</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm leading-relaxed text-bad">
          {error}
          <p className="mt-1 text-[11.5px] text-bad/80">
            入力内容は残してあります。そのままもう一度お試しください。
          </p>
        </div>
      )}

      {done && (
        <div className="card-flat space-y-1">
          <p className="text-[13px]">
            <span className="text-good">登録しました</span> — {done.who}
            {done.satisfaction > 0 && (
              <span className="num ml-2 text-dim">満足度 {done.satisfaction}/5</span>
            )}
          </p>
          {done.traits.length > 0 && (
            <p className="hint">読み取った特徴: {done.traits.join("、")}</p>
          )}
          <p className="hint">
            {done.evidenceCount > 0 ? (
              <>
                学習データ <span className="num text-accent">{done.evidenceCount}</span> 件を
                辞書に反映しました。
              </>
            ) : (
              <>
                辞書に結び付く記述が読み取れなかったため、学習データは作っていません。
                プロフィールの特徴と実際どうだったかの対応が書かれていると精度が上がります。
              </>
            )}
          </p>
        </div>
      )}

      <button className="btn-primary" onClick={submit} disabled={busy || !text.trim()}>
        {busy ? "読み取っています…" : "この1人を登録する"}
      </button>
      {busy && <p className="hint text-center">1〜3分かかります</p>}
    </div>
  );
}
