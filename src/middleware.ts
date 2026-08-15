import { NextResponse, type NextRequest } from "next/server";

export const AUTH_COOKIE = "oneesan_auth";

/** 合言葉そのものをクッキーに残さないよう、ハッシュで照合する。 */
export async function hashPassword(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 画面（HTML）は絶対に溜め込ませない。
 *
 * HTML には、そのとき組み立てた CSS と JS のファイル名が焼き込まれている。
 * アプリを更新すると名前が変わるので、古い HTML が端末に残っていると、
 * もう存在しないファイルを読みに行って**見た目も動きも来ない**状態になる。
 * 更新したのに古い画面のまま、という症状の正体がこれ。
 *
 * CSS と JS 自体は名前に中身の指紋が入っているので、溜め込ませたままでよい
 * （middleware は /_next/static を対象外にしてある）。
 */
function pass(req: NextRequest) {
  const res = NextResponse.next();
  if (req.headers.get("accept")?.includes("text/html")) {
    res.headers.set("Cache-Control", "no-store, must-revalidate");
  }
  return res;
}

/**
 * 簡易ログインゲート。
 * APP_PASSWORD が未設定なら素通しする（自宅で自分しか触らない場合を想定）。
 * 源氏名や所感を保存するアプリなので、外から触れる場所に置くなら必ず設定すること。
 */
export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return pass(req);

  const { pathname } = req.nextUrl;
  // /health は接続診断。ログインできない状態でも開けなければ意味が無い。
  // 個人データは一切出さない作りにしてある。
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/health")) {
    return pass(req);
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await hashPassword(pw))) return pass(req);

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
