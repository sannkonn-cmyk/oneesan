import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildInfo } from "@/lib/build-info";
import { AUTH_COOKIE, hashPassword } from "@/middleware";

/**
 * 合言葉の入力。
 *
 * **JavaScript が無くても通る作りにしてある。** ここが通らないと何もできず、
 * しかも通らない理由（見た目も動きも来ていない）が画面から分からないため。
 * 素の form 送信で成立させ、ブラウザ側の処理には頼らない。
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const failed = (await searchParams).e === "1";
  const build = buildInfo();

  async function login(formData: FormData) {
    "use server";
    const pw = process.env.APP_PASSWORD;
    const input = String(formData.get("password") ?? "");
    if (!pw || input !== pw) redirect("/login?e=1");

    (await cookies()).set(AUTH_COOKIE, await hashPassword(pw), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    redirect("/");
  }

  return (
    <form action={login} className="mx-auto mt-16 max-w-xs space-y-3">
      <div className="card space-y-3">
        <label className="label" htmlFor="pw">
          合言葉
        </label>
        <input id="pw" name="password" type="password" className="input" autoFocus />
        {failed && <p className="text-sm text-bad">合言葉が違います。</p>}
        <button className="btn-primary" type="submit">
          開く
        </button>
      </div>
      <p className="hint text-center">.env.local の APP_PASSWORD に設定した文字列です</p>
      <p className="hint text-center">
        画面の色が付いていない・押しても反応しないときは{" "}
        <a href="/health" className="underline">
          接続診断
        </a>
      </p>
      <p className="hint text-center">
        版 {build.at} <span className="num">{build.id}</span>
      </p>
    </form>
  );
}
