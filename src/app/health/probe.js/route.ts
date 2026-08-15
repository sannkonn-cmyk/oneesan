/**
 * 診断用の JS。読み込まれたことだけを知らせる。
 * これが届いて `/_next/` の JS が届かないなら、置き場を狙って
 * 止められている（PC 側の保護ソフトなどが疑わしい）と分かる。
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("window.__oneesanProbe = true;\n", {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
