/**
 * MCP サーバー。Claude Desktop / Claude Code から、このアプリのデータを
 * **書き出さずに直接**読ませるための口。
 *
 *   node --import tsx scripts/mcp-server.ts
 *   （実際の登録は mcp-setup.bat / mcp-setup.command が行う）
 *
 * ネットワークは一切使わない。標準入出力でつながるので、
 * データが LAN の外へ出ることはない。
 *
 * 読み取り専用で開く。学習データは手入力の資産なので、外から壊せる余地を残さない。
 *
 * 注意: import は動的にしてある。ライブラリ側が起動時の作業フォルダを見て
 * 辞書と DB の場所を決めるため、**先に chdir を済ませる必要がある**。
 * 静的 import は巻き上げられるので、それでは間に合わない。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
process.env.ONEESAN_READONLY = "1";
process.env.DATABASE_PATH ??= path.join(ROOT, "data", "oneesan.db");

const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = await import("zod");

const {
  buildAnalysisMarkdown,
  buildContextMarkdown,
  buildLexiconMarkdown,
  buildOverviewMarkdown,
  buildCompareMarkdown,
} = await import("../src/lib/markdown.js");
const { listHistory } = await import("../src/lib/queries.js");
const { getDb } = await import("../src/lib/db.js");

const server = new McpServer({ name: "oneesan", version: "1.0.0" });

/** 道具の返り値はすべて Markdown。画面と同じ組み立てを使い回している。 */
const text = (body: string) => ({ content: [{ type: "text" as const, text: body }] });

server.registerTool(
  "get_context",
  {
    title: "利用者の判断基準を読む",
    description:
      "この利用者の申し送り（店ごとの言い回し・見方）、辞書項目ごとの的中率、" +
      "過去の登楼実績と満足度の傾向を返す。他の道具を使う前に、まずこれを読むこと。" +
      "ここに書かれた数字はこの利用者ひとりの実績であって、世間の相場ではない。",
    inputSchema: {},
  },
  async () => text(buildContextMarkdown()),
);

server.registerTool(
  "list_history",
  {
    title: "判定の履歴を一覧する",
    description:
      "これまでに判定した嬢の一覧。源氏名・店名・判定・再レビューの有無・満足度を返す。" +
      "個別の内容を見るには get_analysis に id を渡す。",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  },
  async ({ limit }) => {
    const items = listHistory(limit ?? 50);
    if (!items.length) return text("まだ判定がありません。");
    return text(
      [
        "| id | 日時 | 嬢 | 店 | 判定 | 再レビュー | 満足度 |",
        "|---|---|---|---|---|---|---|",
        ...items.map(
          (h) =>
            `| ${h.latestId} | ${h.createdAt.slice(0, 16)} | ${h.girlName || "-"} | ` +
            `${h.shopName || "-"} | ${h.verdict} | ${h.rounds > 1 ? `${h.rounds - 1}回` : "なし"} | ` +
            `${h.satisfaction ?? "未入力"} |`,
        ),
      ].join("\n"),
    );
  },
);

server.registerTool(
  "get_analysis",
  {
    title: "判定1件の全部を読む",
    description:
      "判定・裏読み・書かれていないこと・確認事項とその結果・再レビューの経緯・" +
      "登楼実績を返す。id は list_history で調べる。",
    inputSchema: { id: z.number().int().positive() },
  },
  async ({ id }) => text(buildAnalysisMarkdown(id)),
);

server.registerTool(
  "compare_candidates",
  {
    title: "候補を並べて比べる",
    description:
      "複数の判定を並べ、利用者の判断基準を添えて返す。どの嬢に行くべきかの相談用。",
    inputSchema: { ids: z.array(z.number().int().positive()).min(1).max(8) },
  },
  async ({ ids }) => text(buildCompareMarkdown(ids)),
);

server.registerTool(
  "get_lexicon",
  {
    title: "裏読み辞書の育ち具合を読む",
    description:
      "辞書項目ごとの的中率・信用区間・実績件数。項目の追加や書き換えを相談する用。",
    inputSchema: {},
  },
  async () => text(buildLexiconMarkdown()),
);

server.registerTool(
  "get_overview",
  {
    title: "全体の傾向を読む",
    description: "判定の履歴と実績をまとめて返す。利用者の癖を読む用。",
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  },
  async ({ limit }) => text(buildOverviewMarkdown({ limit: limit ?? 100 })),
);

server.registerTool(
  "search",
  {
    title: "源氏名・店名・本文で探す",
    description: "プロフィール本文、源氏名、店名を部分一致で検索し、該当する判定を返す。",
    inputSchema: { query: z.string().min(1) },
  },
  async ({ query }) => {
    const like = `%${query}%`;
    const rows = getDb()
      .prepare<[string, string, string], { id: number; girl_name: string | null; shop_name: string | null; created_at: string }>(
        `SELECT id, girl_name, shop_name, created_at FROM analysis
          WHERE girl_name LIKE ? OR shop_name LIKE ? OR raw_profile LIKE ?
          ORDER BY created_at DESC LIMIT 30`,
      )
      .all(like, like, like);

    if (!rows.length) return text(`「${query}」に一致する判定はありませんでした。`);
    return text(
      [
        `「${query}」に一致した判定 ${rows.length}件`,
        "",
        ...rows.map(
          (r) =>
            `- id ${r.id} … ${r.girl_name || "名前なし"}（${r.shop_name || "店名なし"}） ` +
            r.created_at.slice(0, 16),
        ),
      ].join("\n"),
    );
  },
);

await server.connect(new StdioServerTransport());
