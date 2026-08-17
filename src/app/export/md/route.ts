import type { NextRequest } from "next/server";
import { EXPORT_SCOPES, buildMarkdown, markdownFilename, type ExportScope } from "@/lib/markdown";

export const dynamic = "force-dynamic";

/**
 * Markdown を返す。
 *
 *   /export/md?scope=compare&ids=3,7&anon=1
 *   /export/md?scope=overview&download=1   ← ファイルとして保存させる
 *
 * ブラウザで開いたときは画面に出したいので、既定では添付にしない。
 * text/markdown だと端末によっては勝手に保存されるので、
 * 画面表示のときは text/plain で返す。
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const scope = (q.get("scope") ?? "context") as ExportScope;
  if (!EXPORT_SCOPES.includes(scope)) {
    return new Response("scope が不正です", { status: 400 });
  }

  const ids = (q.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const body = buildMarkdown(scope, ids, { anonymize: q.get("anon") === "1" });
  const download = q.get("download") === "1";

  return new Response(body, {
    headers: {
      "content-type": download
        ? "text/markdown; charset=utf-8"
        : "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...(download
        ? { "content-disposition": `attachment; filename="${markdownFilename(scope)}"` }
        : {}),
    },
  });
}
