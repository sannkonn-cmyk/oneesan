import Link from "next/link";
import { listVisits, type VisitRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SCORES: { key: keyof VisitRow; label: string }[] = [
  { key: "satisfaction", label: "総合" },
  { key: "girl_rating", label: "女の子" },
  { key: "service_rating", label: "プレイ" },
  { key: "price_rating", label: "料金" },
  { key: "photo_match", label: "写真" },
];

function Scores({ v }: { v: VisitRow }) {
  const shown = SCORES.filter((s) => typeof v[s.key] === "number" && (v[s.key] as number) > 0);
  if (!shown.length) return null;
  return (
    <div className="num mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-dim">
      {shown.map((s) => (
        <span key={s.key}>
          {s.label} <span className="text-accent">{(v[s.key] as number).toFixed(1)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * 登楼記録の一覧。
 * 判定に紐づく記録と、判定を通していない単独の記録が同じ流れに並ぶ。
 * どちらも「行った事実」なので、見返すときに分かれている必要が無い。
 */
export default async function Page() {
  const visits = listVisits();

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-accent">登楼記録</h1>
        <span className="num text-[10.5px] text-dim">{visits.length}件</span>
      </header>

      <Link href="/log/new" className="btn-ghost">
        記録を書く（判定を通していない相手）
      </Link>

      {visits.length === 0 && (
        <p className="hint">
          まだ記録がありません。判定した相手なら判定の画面から、
          そうでなければ上のボタンから書けます。
        </p>
      )}

      {visits.map((v) => (
        <Link
          key={v.id}
          href={v.analysis_id ? `/analysis/${v.analysis_id}` : `/log/${v.id}`}
          className="card block transition hover:border-accent/40"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 flex-1 text-[13px] font-bold">
              {v.girl_name || "名前未入力"}
              <span className="ml-1.5 text-[11.5px] font-normal text-dim">{v.shop_name}</span>
            </span>
            <span className="num shrink-0 text-[10px] text-dim">
              {(v.visited_at || v.created_at).slice(0, 10).replace(/-/g, "/")}
            </span>
          </div>

          {v.review_title && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-200">{v.review_title}</p>
          )}
          {!v.review_title && v.note && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{v.note}</p>
          )}

          <Scores v={v} />

          <div className="num mt-2 flex flex-wrap gap-2 text-[10px] text-dim">
            {v.analysis_id ? <span>判定あり</span> : <span>判定なし</span>}
            {v.play_detail && <span className="text-accent">プレイ内容あり</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
