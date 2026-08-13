import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-util";
import type { VerificationAnswer } from "@/lib/prompts";
import { runRereview } from "@/lib/service";

export const maxDuration = 300;

const STATUSES = new Set(["confirmed", "denied", "unknown", "unchecked"]);

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const analysisId = Number(body.analysis_id);
    if (!Number.isFinite(analysisId)) throw new Error("analysis_id が不正です");

    const answers: VerificationAnswer[] = Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>[]).map((a) => ({
          question: String(a.question ?? ""),
          status: (STATUSES.has(String(a.status)) ? a.status : "unchecked") as
            VerificationAnswer["status"],
          note: String(a.note ?? ""),
        }))
      : [];

    const freeNote = String(body.free_note ?? "").trim();

    const answered = answers.filter((a) => a.status !== "unchecked" || a.note);
    if (!answered.length && !freeNote) {
      throw new Error(
        "確認結果が1件も入力されていません。チェックを付けるか、メモを書いてから再レビューしてください。",
      );
    }

    return runRereview({ analysisId, answers, freeNote });
  });
}
