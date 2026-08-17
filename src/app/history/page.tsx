import Link from "next/link";
import { getLearningSummary, listHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

const VERDICT_STYLE: Record<string, string> = {
  指名推奨: "text-good border-[#2c6a52] bg-[#10241c]",
  条件付き: "text-warn border-[#6b5423] bg-[#241d10]",
  見送り: "text-bad border-[#6b3330] bg-[#241211]",
};

export default async function Page() {
  const items = listHistory();
  const s = getLearningSummary();

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-accent">履歴</h1>
        <div className="flex items-center gap-3">
          <Link href="/export" className="text-[11px] text-dim underline hover:text-accent">
            Claude に読ませる
          </Link>
          <span className="num text-[10.5px] text-dim">{items.length}件</span>
        </div>
      </header>

      <div className="card-flat">
        <div className="grid grid-cols-3 text-center">
          <div>
            <div className="num text-[19px]">{s.analyses}</div>
            <div className="hint">判定</div>
          </div>
          <div>
            <div className="num text-[19px]">{s.outcomes}</div>
            <div className="hint">実績入力済</div>
          </div>
          <div>
            <div className="num text-[19px] text-accent">
              {s.verifiedEntries}
              <span className="text-[12px] text-dim">/{s.totalEntries}</span>
            </div>
            <div className="hint">検証済の辞書</div>
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <div className="card">
          <p className="text-sm leading-relaxed text-muted">まだ判定がありません。</p>
          <p className="hint mt-2">
            <Link href="/" className="text-accent underline">
              判定画面
            </Link>
            からプロフィールを貼り付けてください。先に{" "}
            <Link href="/import" className="text-accent underline">
              過去のお姉さんを登録
            </Link>
            しておくと、初回から精度が上がります。
          </p>
        </div>
      )}

      {items.map((it) => (
        <Link
          key={it.rootId}
          href={`/analysis/${it.latestId}`}
          className="block rounded-xl border border-edge bg-panel p-3 hover:border-accentdim"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="truncate text-[13.5px] font-bold">
              {it.girlName || "名前未入力"}
              <span className="ml-1.5 text-[11.5px] font-normal text-dim">{it.shopName}</span>
            </span>
            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-[10.5px] ${
                VERDICT_STYLE[it.verdict] ?? "border-edge text-muted"
              }`}
            >
              {it.verdict}
            </span>
          </div>
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted">{it.summary}</p>
          <div className="num mt-2 flex flex-wrap gap-2 text-[10px] text-dim">
            <span>{it.createdAt.slice(5, 10).replace("-", "/")}</span>
            {it.rounds > 1 && <span>再レビュー済</span>}
            {it.hasOutcome ? (
              <span className="text-good">実績 ★{it.satisfaction}</span>
            ) : (
              <span>実績未入力</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
