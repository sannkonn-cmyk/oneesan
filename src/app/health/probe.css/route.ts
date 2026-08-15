/**
 * 診断用の CSS。中身に意味は無く、届くかどうかだけを見る。
 *
 * `?big=1` を付けると、わざと大きくして返す。
 * 小さいものは届くのに大きいものが落ちる、という壊れ方が実際にあるため
 * （中継機や無線区間で、大きな通信だけが途切れる）。これを分けて見たい。
 */
export const dynamic = "force-dynamic";

/** 中継機由来の切断を見分けたいので、HTML より明確に大きくする。 */
const BIG_BYTES = 256 * 1024;

export async function GET(req: Request) {
  const big = new URL(req.url).searchParams.get("big") === "1";
  const rule = "#cssprobe{color:rgb(0,200,0)}\n";
  const body = big ? rule + `/*${"x".repeat(BIG_BYTES)}*/\n` : rule;

  return new Response(body, {
    headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
  });
}
