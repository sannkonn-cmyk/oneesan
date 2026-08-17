"use client";

import { useRef, useState } from "react";

/**
 * 書き出した Markdown を渡すための箱。
 *
 * **同じ画面でも、開き方によって使える手段が違う。**
 *   PC から      http://localhost:3000  → 「安全な文脈」扱い。clipboard が使える
 *   スマホから   http://192.168.x.x     → 安全な文脈ではない。clipboard は消される
 * 共有 API（navigator.share）も後者では使えない。
 *
 * そこで3段構えにする。
 *   1. navigator.clipboard        （PC で確実）
 *   2. document.execCommand       （非推奨だが http でも動く）
 *   3. 触ると全選択される textarea（どちらも駄目な端末向け。長押しでコピー）
 *
 * どの方式で成功したかは利用者に関係ないので、表示は変えない。
 */
export function CopyBox({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [msg, setMsg] = useState("");

  const ok = () => setMsg("コピーしました。Claude に貼り付けてください。");
  const ng = () =>
    setMsg(
      "この端末ではボタンでコピーできません。下の枠を長押しして「コピー」を選んでください（すでに全選択されています）。",
    );

  function selectAll() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }

  async function copy() {
    // 1. まともな経路。PC（localhost）ならこれで通る。
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        ok();
        return;
      } catch {
        // 権限を拒否された場合など。下の経路に落とす。
      }
    }

    // 2. 古い経路。スマホの LAN 接続でも動く。
    selectAll();
    try {
      if (document.execCommand("copy")) {
        ok();
        return;
      }
    } catch {
      /* 3 に落とす */
    }

    // 3. 全選択だけはできているので、手でコピーしてもらう。
    ng();
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
        onFocus={selectAll}
        className="input font-mono text-[11px] leading-relaxed"
      />
      <p className="hint">
        枠を触ると全選択されます。うまくいかないときは、下の「ファイルで保存」から
        保存して Claude に添付してください。
      </p>
    </div>
  );
}
