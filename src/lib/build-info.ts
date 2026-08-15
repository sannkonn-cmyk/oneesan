import fs from "node:fs";
import path from "node:path";

/**
 * いま動いている版。
 *
 * 「更新したはずなのに古い画面が出る」を、憶測でなく画面で確かめられるようにする。
 * 組み立て結果に付く識別子と、その組み立て時刻を見る。
 */
export function buildInfo(): { id: string; at: string } {
  try {
    const p = path.join(process.cwd(), ".next", "BUILD_ID");
    const id = fs.readFileSync(p, "utf8").trim().slice(0, 8);
    const at = fs.statSync(p).mtime.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return { id, at };
  } catch {
    return { id: "不明", at: "" };
  }
}
