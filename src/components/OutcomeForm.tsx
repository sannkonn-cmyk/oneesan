"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ScoreSlider } from "@/components/ScoreSlider";
import type { OutcomeRow } from "@/lib/queries";

const SCORES = [
  { key: "satisfaction", label: "総合満足度", hint: "このアプリ独自。学習の要" },
  { key: "girl_rating", label: "女の子" },
  { key: "service_rating", label: "プレイ" },
  { key: "price_rating", label: "料金" },
  { key: "photo_match", label: "写真" },
] as const;

type Key = (typeof SCORES)[number]["key"];

export interface VisitFormValues {
  visited_at: string;
  shop_name: string;
  girl_name: string;
  review_title: string;
  about_her: string;
  play_detail: string;
  note: string;
}

/**
 * 登楼記録の入力。並びはシティヘブンの口コミに合わせてある。
 *
 * 点数から「どの読みが当たったか」を自動判定して辞書の的中率に反映する
 * （src/lib/service.ts の deriveVerdicts）。使うのは総合・プレイ・写真の3つで、
 * 女の子と料金は対応する辞書の軸が無いため記録だけ。無理に紐づけると
 * 根拠の無い数字が的中率に混ざる。
 *
 * `analysisId` が 0 なら単独の記録（判定を通していない相手）。
 */
export function OutcomeForm({
  analysisId,
  visitId,
  existing,
  solo,
}: {
  analysisId: number;
  visitId?: number;
  existing?: OutcomeRow & { shop_name?: string; girl_name?: string };
  solo?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(existing) || Boolean(solo));
  const [scores, setScores] = useState<Record<Key, number>>({
    satisfaction: existing?.satisfaction ?? 0,
    girl_rating: existing?.girl_rating ?? 0,
    service_rating: existing?.service_rating ?? 0,
    price_rating: existing?.price_rating ?? 0,
    photo_match: existing?.photo_match ?? 0,
  });
  const [v, setV] = useState<VisitFormValues>({
    visited_at: existing?.visited_at ?? "",
    shop_name: existing?.shop_name ?? "",
    girl_name: existing?.girl_name ?? "",
    review_title: existing?.review_title ?? "",
    about_her: existing?.about_her ?? "",
    play_detail: existing?.play_detail ?? "",
    note: existing?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  const set = (k: keyof VisitFormValues, value: string) => setV((s) => ({ ...s, [k]: value }));

  async function save() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/outcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysis_id: analysisId, visit_id: visitId, ...v, ...scores }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "保存に失敗しました。");
        return;
      }
      setSaved(json.data.evidenceCount ?? 0);
      if (solo && !visitId) router.push("/log");
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
        登楼記録を書く
      </button>
    );
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-[12.5px] font-bold text-muted">登楼記録</h2>
        <p className="hint mt-1">
          {analysisId
            ? "点数から「どの読みが当たったか」を自動で判定し、辞書の的中率に反映します。"
            : "判定を通していない相手の記録です。読みが無いので、辞書の的中率には反映されません。"}
          分からない項目は空のままで構いません。
        </p>
      </div>

      {solo && (
        <div className="space-y-2">
          <div>
            <label className="label" htmlFor="shop">
              店名
            </label>
            <input
              id="shop"
              className="input"
              value={v.shop_name}
              onChange={(e) => set("shop_name", e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="girl">
              源氏名
            </label>
            <input
              id="girl"
              className="input"
              value={v.girl_name}
              onChange={(e) => set("girl_name", e.target.value)}
            />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="visited">
          登楼日
        </label>
        <input
          id="visited"
          type="date"
          className="input"
          value={v.visited_at}
          onChange={(e) => set("visited_at", e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {SCORES.map((s) => (
          <ScoreSlider
            key={s.key}
            label={s.label}
            hint={"hint" in s ? s.hint : undefined}
            value={scores[s.key]}
            onChange={(n) => setScores((v2) => ({ ...v2, [s.key]: n }))}
          />
        ))}
      </div>

      <div>
        <label className="label" htmlFor="title">
          口コミタイトル
        </label>
        <input
          id="title"
          className="input"
          value={v.review_title}
          onChange={(e) => set("review_title", e.target.value)}
          placeholder="いちゃらぶ最高でした"
        />
      </div>

      <div>
        <label className="label" htmlFor="about">
          お相手の女性について
        </label>
        <textarea
          id="about"
          className="input"
          rows={3}
          value={v.about_her}
          onChange={(e) => set("about_her", e.target.value)}
          placeholder="写真より可愛い。よく笑う。会話が途切れない、など"
        />
      </div>

      <div>
        <label className="label" htmlFor="play">
          プレイ内容
        </label>
        <textarea
          id="play"
          className="input"
          rows={4}
          value={v.play_detail}
          onChange={(e) => set("play_detail", e.target.value)}
          placeholder="実際に何があったか。伏せ字にせず、そのまま書いてください"
        />
        {/* ここが口コミサイトとの一番の違い。伏せると資料としての価値が落ちる。 */}
        <p className="hint mt-1">
          <strong>伏せ字にしないでください。</strong>
          この欄はあなたの PC の中だけに残ります。外に出るのは、自分で書き出して
          Claude に貼ったときだけです。次に読み解くときの材料として一番効きます。
        </p>
      </div>

      <div>
        <label className="label" htmlFor="onote">
          今回の総評
        </label>
        <textarea
          id="onote"
          className="input"
          rows={3}
          value={v.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="また行くか、次は何を確かめるか、など"
        />
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      {saved !== null && (
        <div className="card-flat">
          <p className="hint">
            保存しました。
            {saved > 0 ? (
              <>
                この記録から <span className="num text-accent">{saved}</span> 件の学習データを
                記録し、辞書の的中率に反映しました。
              </>
            ) : analysisId ? (
              <>
                評価が「3（どちらとも言えない）」中心だったため、
                今回は学習データを記録していません。判断がつかないものを的中扱いすると
                数字が信用できなくなるためです。
              </>
            ) : (
              <>記録として残しました。</>
            )}
          </p>
        </div>
      )}

      <button className="btn-primary" onClick={save} disabled={busy}>
        {busy ? "保存中…" : existing ? "記録を更新する" : "記録を保存する"}
      </button>
    </section>
  );
}
