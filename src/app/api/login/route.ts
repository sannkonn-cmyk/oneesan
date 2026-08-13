import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, hashPassword } from "@/middleware";

export async function POST(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  const body = (await req.json()) as { password?: string };

  if (!pw || body.password !== pw) {
    return NextResponse.json({ ok: false, error: "合言葉が違います。" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await hashPassword(pw), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
