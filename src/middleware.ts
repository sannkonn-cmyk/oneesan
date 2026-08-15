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
 * 簡易ログインゲート。
 * APP_PASSWORD が未設定なら素通しする（自宅で自分しか触らない場合を想定）。
 * 源氏名や所感を保存するアプリなので、外から触れる場所に置くなら必ず設定すること。
 */
export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // /health は接続診断。ログインできない状態でも開けなければ意味が無い。
  // 個人データは一切出さない作りにしてある。
  if (pathname === "/login" || pathname === "/api/login" || pathname.startsWith("/health")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && token === (await hashPassword(pw))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
