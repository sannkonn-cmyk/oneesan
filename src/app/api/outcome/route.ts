import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-util";
import { saveOutcome } from "@/lib/service";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const analysisId = Number(body.analysis_id);
    if (!Number.isFinite(analysisId)) throw new Error("analysis_id が不正です");

    const rating = (v: unknown): number => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
    };

    return saveOutcome({
      analysisId,
      visitedAt: String(body.visited_at ?? "").trim(),
      satisfaction: rating(body.satisfaction),
      serviceRating: rating(body.service_rating),
      photoMatch: rating(body.photo_match),
      attitudeRating: rating(body.attitude_rating),
      note: String(body.note ?? "").trim(),
    });
  });
}
