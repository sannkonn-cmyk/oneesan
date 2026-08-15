/**
 * 診断用の CSS。中身に意味は無く、届くかどうかだけを見る。
 * `/_next/` 配下の資産が届かないとき、それが「その置き場だけの問題」なのか
 * 「見た目のファイル全般が止められている」のかを分けるために使う。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("#cssprobe{color:rgb(0,200,0)}\n", {
    headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
  });
}
