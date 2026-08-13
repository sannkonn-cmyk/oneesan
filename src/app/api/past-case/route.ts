import type { NextRequest } from "next/server";
import { handle } from "@/lib/api-util";
import { deletePastCase } from "@/lib/service";

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json()) as { id?: unknown };
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw new Error("id が不正です");
    return deletePastCase(id);
  });
}
