"use client";

import { useRef, useState } from "react";

/**
 * 書き出した Markdown を渡すための箱。
 *
 * **navigator.clipboard は使えない。** スマホから http://192.168.x.x で
 * 開いている限り「安全な文脈」ではないので、ブラウザが機能自体を出さない。
 * 共有 API（navigator.share）も同じ理由で使えない。
 *
 * そこで古い document.execCommand("copy") を使う。非推奨だが http でも動く。
 * それも駄目な端末向けに、触ると全選択される textarea を必ず置いておく
 * （長押しメニューの「コピー」で取れる）。
 */
export function CopyBox({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState("");

  function copy() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    setMsg(
      ok
        ? "コピーしました。Claude に貼り付けてください。"
        : "この端末ではボタンでコピーできません。下の枠を長押しして「コピー」を選んでください（すでに全選択されています）。",
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary flex-1" onClick={copy}>
          コピーする
        </button>
        <span className="num text-[10.5px] text-dim">{text.length.toLocaleString()}文字</span>
      </div>

      {msg && <p className="hint">{msg}</p>}

      <textarea
        ref={ref}
        readOnly
        value={text}
        rows={14}
        onFocus={(e) => e.currentTarget.select()}
        className="input font-mono text-[11px] leading-relaxed"
      />
      <p className="hint">
        枠を触ると全選択されます。うまくいかないときは、下の「ファイルで保存」から
        保存して Claude に添付してください。
      </p>
    </div>
  );
}
