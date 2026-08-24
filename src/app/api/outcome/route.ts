import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-util";
import { deleteVisit, saveOutcome, saveSoloVisit, updateSoloVisit, type OutcomeArgs } from "@/lib/service";

/**
 * 点数の受け取り。
 * 1.0〜5.0 の範囲に収め、0.1 刻みに丸める。範囲外と未入力は 0（＝未入力）。
 * **0 と 1.0 は別物**として扱う。分からないものを最低評価にすると、
 * 辞書の的中率に嘘が混ざる。
 */
const rating = (v: unknown): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 0;
  return Math.round(n * 10) / 10;
};

const text = (v: unknown): string => String(v ?? "").trim();

function toArgs(body: Record<string, unknown>): OutcomeArgs {
  return {
    analysisId: Number(body.analysis_id) || 0,
    shopName: text(body.shop_name),
    girlName: text(body.girl_name),
    visitedAt: text(body.visited_at),
    satisfaction: rating(body.satisfaction),
    girlRating: rating(body.girl_rating),
    serviceRating: rating(body.service_rating),
    priceRating: rating(body.price_rating),
    photoMatch: rating(body.photo_match),
    attitudeRating: rating(body.attitude_rating),
    reviewTitle: text(body.review_title),
    aboutHer: text(body.about_her),
    playDetail: text(body.play_detail),
    note: text(body.note),
  };
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const args = toArgs(body);
    const visitId = Number(body.visit_id) || 0;

    // 判定に紐づかない記録。事前に判定していない相手でも残せるようにする。
    if (!args.analysisId) {
      if (visitId) {
        updateSoloVisit(visitId, args);
        return { id: visitId, evidenceCount: 0 };
      }
      const { id } = saveSoloVisit(args);
      return { id, evidenceCount: 0 };
    }

    return saveOutcome(args);
  });
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw new Error("id が不正です");
    deleteVisit(id);
    return { ok: true };
  });
}
