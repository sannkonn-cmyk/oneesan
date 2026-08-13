import { NextResponse } from "next/server";
import type { ProfileMeta } from "./lexicon/types";
import { LlmError } from "./llm/provider";
import { expandMetaSelection } from "./meta";

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
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * フォームから来た構造情報を型に整える。
 *
 * 受け取るのは「どのバケットを選んだか」の index であって生の数値ではない
 * （src/lib/meta.ts 参照）。未選択のキーはそもそも入れない。
 * 0 や false に落とすと「未入力」が「該当しない」にすり替わってしまう。
 */
export function parseMeta(raw: Record<string, unknown>): ProfileMeta {
  const selection: Record<string, number | undefined> = {};
  const sel = (raw.meta_selection ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(sel)) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) selection[k] = n;
  }

  const { values, labels } = expandMetaSelection(selection);
  const meta: ProfileMeta = { ...values, labels };

  const price = num(raw.price_yen);
  const duration = num(raw.duration_min);
  if (price) meta.price_yen = price;
  if (duration) meta.duration_min = duration;

  return meta;
}
