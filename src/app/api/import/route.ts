import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-util";
import { runImport } from "@/lib/service";

export const maxDuration = 300;

/**
 * 過去実績を1件だけ処理する。
 * 一括登録は画面側から1件ずつ順に呼ぶ。まとめて処理しないのは、
 * 途中で利用枠が尽きても、そこまでの分が確実に保存されるようにするため。
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const text = String(body.text ?? "").trim();
    if (text.length < 5) throw new Error("記録の内容が短すぎます");
    return runImport(text);
  });
}
