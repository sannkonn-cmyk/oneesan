import { NextResponse } from "next/server";
import { LlmError } from "./llm/provider";

/**
 * API ルート共通のエラー処理。
 * 利用枠切れなどを黙って 500 で潰さず、画面に出せる日本語の理由を返す。
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json({ ok: true, data: await fn() });
  } catch (e) {
    if (e instanceof LlmError) {
      const status = e.kind === "quota" ? 429 : e.kind === "auth" ? 401 : 502;
      console.error(`[llm:${e.kind}] ${e.message}\n${e.detail ?? ""}`);
      return NextResponse.json(
        { ok: false, kind: e.kind, error: e.userMessage, detail: e.detail ?? null },
        { status },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api]", e);
    return NextResponse.json({ ok: false, kind: "unknown", error: message }, { status: 500 });
  }
}

const num = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const bool = (v: unknown): boolean | undefined => {
  if (v === true || v === "true" || v === "yes") return true;
  if (v === false || v === "false" || v === "no") return false;
  return undefined;
};

/**
 * フォームから来た構造情報を型に整える。
 * 空欄は undefined のままにする。0 や false に落とすと
 * 「未入力」が「該当しない」にすり替わってしまう。
 */
export function parseMeta(raw: Record<string, unknown>): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  const numeric = [
    "photo_count",
    "review_count",
    "tenure_months",
    "shifts_per_week",
    "price_yen",
    "diary_count_recent",
  ] as const;
  for (const k of numeric) {
    const v = num(raw[k]);
    if (v !== undefined) out[k] = v;
  }
  const boolean = ["has_face_photo", "sizes_disclosed", "age_disclosed"] as const;
  for (const k of boolean) {
    const v = bool(raw[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
