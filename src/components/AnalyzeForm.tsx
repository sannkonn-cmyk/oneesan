"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DURATION_OPTIONS, META_FIELDS, pricePerHour } from "@/lib/meta";

export function AnalyzeForm() {
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [shopName, setShopName] = useState("");
  const [girlName, setGirlName] = useState("");
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const perHour = pricePerHour(Number(price) || undefined, Number(duration) || undefined);

  // 同じ選択肢をもう一度押したら解除して「不明」に戻せるようにする。
  const pick = (key: string, idx: number) =>
    setSelection((s) => {
      const next = { ...s };
      if (next[key] === idx) delete next[key];
      else next[key] = idx;
      return next;
    });

  async function submit() {
    setError("");
    if (profile.trim().length < 10) {
      setError("プロフィール本文を貼り付けてください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile,
          shop_name: shopName,
          girl_name: girlName,
          meta_selection: selection,
          price_yen: price,
          duration_min: duration,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "判定に失敗しました。");
        return;
      }
      router.push(`/analysis/${json.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <label className="label" htmlFor="profile">
          プロフィール本文
        </label>
        <textarea
          id="profile"
          className="input"
          rows={7}
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="シティヘブン等のプロフィール本文をコピーして貼り付けてください"
        />
        <p className="hint mt-2">サイトからの自動取得はしません。コピペのみです。</p>
      </div>

      <div className="card space-y-4">
        <span className="label">補助情報（分かる範囲で。全部わかる必要はありません）</span>

        {META_FIELDS.map((field) => (
          <div key={field.key}>
            <p className="mb-1.5 text-[11.5px] text-muted">
              {field.label}
              {field.hint && <span className="ml-1 text-dim">{field.hint}</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {field.options.map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pick(field.key, i)}
                  className={`bucket flex-1 ${selection[field.key] === i ? "bucket-on" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div>
          <p className="mb-1.5 text-[11.5px] text-muted">
            料金 <span className="ml-1 text-dim">総額と時間から、時間あたりを自動計算します</span>
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              type="number"
              inputMode="numeric"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="総額"
            />
            <select
              className="input flex-1"
              value={duration}
              onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">コース時間</option>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}分
                </option>
              ))}
            </select>
          </div>
          {perHour !== undefined && (
            <p className="hint mt-1.5">
              時間あたり <span className="num text-accent">{perHour.toLocaleString()}</span> 円
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="shop">
              店名
            </label>
            <input
              id="shop"
              className="input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="girl">
              源氏名
            </label>
            <input
              id="girl"
              className="input"
              value={girlName}
              onChange={(e) => setGirlName(e.target.value)}
            />
          </div>
        </div>

        <p className="hint">
          選ばなかった項目は「不明」として扱います。「該当なし」とは区別するので、
          分からないものは空のままで構いません。
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm leading-relaxed text-bad">
          {error}
        </div>
      )}

      <button className="btn-primary" onClick={submit} disabled={busy}>
        {busy ? "読んでいます…" : "穿って読む"}
      </button>
      <p className="hint text-center">
        {busy
          ? "1〜3分かかります。この画面を閉じないでください。"
          : "1〜3分かかります（じっくり読ませているため）"}
      </p>
    </div>
  );
}
