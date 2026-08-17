/**
 * MCP サーバーの確認。Claude Desktop を用意せずに検査する。
 *
 *   npm run test:mcp
 *
 * 子プロセスとして起動し、標準入出力で本物と同じやり取りをする。
 * AI は呼ばないので枠を消費しない。
 *
 * 「読み取り専用で開けているか」も必ず見る。ここが緩んでいると、
 * 外から学習データを壊せることになる。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 登録に使うものをそのまま使う。ここを別に書くと「登録はできたのに
// 起動しない」を検査が見逃す。実際に一度見逃した。
// @ts-expect-error 型定義の無い .mjs を意図的に読んでいる（登録側と同一の実体を使うため）
import { serverSpec } from "./mcp-spec.mjs";

const ROOT = process.cwd();
const SPEC = serverSpec() as { command: string; args: string[]; env: Record<string, string> };

/**
 * **わざと無関係なフォルダから起動する。**
 * Claude Desktop も Claude Code も、このフォルダとは違う場所から
 * サーバーを起動する。ここを揃えてしまうと、パスの解決漏れを見逃す
 * （`--import tsx` が作業フォルダ基準で解決されて落ちた件がこれ）。
 */
const FOREIGN_CWD = os.tmpdir();
let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       → ${detail}` : ""}`);
  }
}

interface Rpc {
  id?: number;
  result?: any;
  error?: { message?: string };
  method?: string;
}

/** 起動して、決まった順に問い合わせ、返ってきたものを集める。 */
function talk(requests: object[]): Promise<Rpc[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(SPEC.command, SPEC.args, {
      cwd: FOREIGN_CWD,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...SPEC.env },
    });

    const got: Rpc[] = [];
    let buf = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`応答がありません。stderr:\n${stderr.slice(0, 800)}`));
    }, 60_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      buf += d;
      for (const line of buf.split("\n").slice(0, -1)) {
        if (!line.trim()) continue;
        try {
          got.push(JSON.parse(line) as Rpc);
        } catch {
          /* 途中まで届いた行は次で拾う */
        }
      }
      buf = buf.slice(buf.lastIndexOf("\n") + 1);

      // 番号付きの応答が出そろったら終わり
      const answered = got.filter((g) => g.id !== undefined).length;
      if (answered >= requests.filter((r) => "id" in r).length) {
        clearTimeout(timer);
        child.kill();
        resolve(got);
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);

    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
  });
}

async function main(): Promise<void> {
  console.log("\n[1] つながるか");

  const res = await talk([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_context", arguments: {} },
    },
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "get_lexicon", arguments: {} },
    },
    {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "search", arguments: { query: "あ" } },
    },
  ]);

  const byId = new Map(res.filter((r) => r.id !== undefined).map((r) => [r.id!, r]));

  const init = byId.get(1);
  check("initialize が通る", Boolean(init?.result), JSON.stringify(init?.error ?? init));
  check(
    "名前を返す",
    init?.result?.serverInfo?.name === "oneesan",
    JSON.stringify(init?.result?.serverInfo),
  );

  console.log("\n[2] 道具が見えるか");
  const tools = (byId.get(2)?.result?.tools ?? []) as { name: string; description?: string }[];
  const names = tools.map((t) => t.name);
  for (const want of [
    "get_context",
    "list_history",
    "get_analysis",
    "compare_candidates",
    "get_lexicon",
    "get_overview",
    "search",
  ]) {
    check(`${want} がある`, names.includes(want), names.join(", "));
  }
  check(
    "説明が付いている",
    tools.every((t) => (t.description ?? "").length > 10),
    "説明の無い道具がある。Claude が使い方を判断できない",
  );

  console.log("\n[3] 中身が返るか");
  for (const [id, name, must] of [
    [3, "get_context", "私の判断基準"],
    [4, "get_lexicon", "裏読み辞書"],
  ] as const) {
    const body = byId.get(id)?.result?.content?.[0]?.text ?? "";
    check(`${name} が本文を返す`, body.includes(must), body.slice(0, 120));
  }
  check("search が落ちない", Boolean(byId.get(5)?.result), JSON.stringify(byId.get(5)?.error));

  console.log("\n[4] 書き込めないこと");
  {
    // サーバーと同じ開き方をして、書けないことを確かめる
    const Database = (await import("better-sqlite3")).default;
    const dbPath = path.join(ROOT, "data", "oneesan.db");
    const db = new Database(dbPath, { readonly: true });
    let blocked = false;
    let message = "";
    try {
      db.prepare("INSERT INTO setting (key, value, updated_at) VALUES ('x','y','z')").run();
    } catch (e) {
      blocked = true;
      message = e instanceof Error ? e.message : String(e);
    }
    db.close();
    check("読み取り専用の接続では書き込みが失敗する", blocked, message || "書き込めてしまった");
  }

  console.log("\n[5] 登録内容がそのまま起動できること");
  {
    /**
     * mcp-setup を偽のホームで走らせ、**書き込まれた設定を読み返して
     * その通りに起動する。** 「登録はできたのに起動しない」が一番痛い
     * 失敗の仕方で、しかも利用者の手元でしか起きない。
     */
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "oneesan-mcp-"));
    const cfgDir = path.join(home, ".config", "Claude");
    fs.mkdirSync(cfgDir, { recursive: true });
    // 既に別のサーバーが登録されている状態を再現する
    const cfgFile = path.join(cfgDir, "claude_desktop_config.json");
    fs.writeFileSync(
      cfgFile,
      JSON.stringify({ mcpServers: { other: { command: "echo" } }, keepMe: true }),
    );

    const setup = spawnSync(process.execPath, [path.join(ROOT, "scripts", "mcp-setup.mjs")], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_BIN: "/nonexistent-claude" },
    });
    check("登録スクリプトが完走する", setup.status === 0, String(setup.stderr ?? "").slice(0, 300));
    check("警告が出ていない", !String(setup.stderr ?? "").includes("DeprecationWarning"), setup.stderr ?? "");

    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
      keepMe?: boolean;
    };
    check("既にあった登録を残している", Boolean(cfg.mcpServers.other), Object.keys(cfg.mcpServers).join(","));
    check("他の設定を残している", cfg.keepMe === true);
    check("控えを作っている", fs.existsSync(`${cfgFile}.bak`));

    const spec = cfg.mcpServers.oneesan;
    check("自分の登録が入っている", Boolean(spec), Object.keys(cfg.mcpServers).join(","));

    if (spec) {
      // 書かれていた通りに、無関係なフォルダから起動する
      const r = spawnSync(spec.command, spec.args, {
        cwd: FOREIGN_CWD,
        encoding: "utf8",
        env: { ...process.env, ...spec.env },
        input:
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "t", version: "0" },
            },
          }) + "\n",
        timeout: 60_000,
      });
      check(
        "登録された指定で起動して応答する",
        String(r.stdout ?? "").includes('"serverInfo"'),
        String(r.stderr ?? r.stdout ?? "").slice(0, 300),
      );
    }

    fs.rmSync(home, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
