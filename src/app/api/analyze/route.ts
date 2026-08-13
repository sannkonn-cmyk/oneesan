import type { NextRequest } from "next/server";
import { handle, parseMeta } from "@/lib/api-util";
import { runAnalyze } from "@/lib/service";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const profile = String(body.profile ?? "").trim();
    if (profile.length < 10) {
      throw new Error("プロフィール本文を貼り付けてください（10文字以上）");
    }
    return runAnalyze({
      profile,
      meta: parseMeta(body),
      shopName: String(body.shop_name ?? "").trim(),
      girlName: String(body.girl_name ?? "").trim(),
    });
  });
}
