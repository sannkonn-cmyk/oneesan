/**
 * LLM Provider 層の動作確認。
 *
 *   npm run test:llm           スタブを使ったオフライン検証のみ（枠を消費しない）
 *   npm run test:llm -- --live 実際に Claude Code を1回呼ぶ（枠を少し消費する）
 *
 * オフライン検証では CLAUDE_BIN を偽の実行ファイルに差し替え、
 * 「1回目は壊れた出力、2回目は正しい出力」を返させて再試行の挙動を確かめる。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ClaudeCodeProvider } from "../src/lib/llm/claude-code";
import { LlmError } from "../src/lib/llm/provider";

let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "oneesan-test-"));

/** 引数を無視して固定の出力を返す偽 claude を作る。 */
function makeStub(name: string, body: string): string {
  const file = path.join(TMP, name);
  fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return file;
}

const Schema = z.object({ greeting: z.string(), lang: z.string() });
const JSON_SCHEMA = {
  type: "object",
  properties: { greeting: { type: "string" }, lang: { type: "string" } },
  required: ["greeting", "lang"],
  additionalProperties: false,
} as const;

const req = {
  label: "test",
  system: "テスト用",
  user: "挨拶を返してください",
  jsonSchema: JSON_SCHEMA,
  zod: Schema,
};

function envelope(structured: unknown): string {
  return JSON.stringify({
    is_error: false,
    subtype: "success",
    result: JSON.stringify(structured),
    structured_output: structured,
    total_cost_usd: 0.01,
  });
}

async function main(): Promise<void> {
  console.log("\n[1] 正常系（1回で成功、再試行なし）");
  {
    const stub = makeStub(
      "ok.js",
      `console.log(${JSON.stringify(envelope({ greeting: "こんにちは", lang: "ja" }))});`,
    );
    process.env.CLAUDE_BIN = stub;
    const p = new ClaudeCodeProvider();
    const r = await p.complete(req);
    check("結果が取得できる", r.data.greeting === "こんにちは", JSON.stringify(r.data));
    check("再試行していない", r.retries === 0, `retries=${r.retries}`);
    check("相当額が取れる", r.costUsd === 0.01, String(r.costUsd));
  }

  console.log("\n[2] 形式違反 → 1回だけ再試行して成功");
  {
    const counter = path.join(TMP, "count.txt");
    fs.writeFileSync(counter, "0");
    const bad = envelope({ greeting: "こんにちは" }); // lang が欠けている
    const good = envelope({ greeting: "こんにちは", lang: "ja" });
    const stub = makeStub(
      "retry.js",
      `const fs=require("fs");
const f=${JSON.stringify(counter)};
const n=Number(fs.readFileSync(f,"utf8"))+1;
fs.writeFileSync(f,String(n));
console.log(n===1 ? ${JSON.stringify(bad)} : ${JSON.stringify(good)});`,
    );
    process.env.CLAUDE_BIN = stub;
    const p = new ClaudeCodeProvider();
    const r = await p.complete(req);
    check("最終的に成功する", r.data.lang === "ja", JSON.stringify(r.data));
    check("再試行は1回だけ", r.retries === 1, `retries=${r.retries}`);
    check("実際の呼び出しは2回", fs.readFileSync(counter, "utf8") === "2");
  }

  console.log("\n[3] 2回とも形式違反 → schema エラーで諦める");
  {
    const counter = path.join(TMP, "count2.txt");
    fs.writeFileSync(counter, "0");
    const stub = makeStub(
      "alwaysbad.js",
      `const fs=require("fs");
const f=${JSON.stringify(counter)};
fs.writeFileSync(f,String(Number(fs.readFileSync(f,"utf8"))+1));
console.log(${JSON.stringify(envelope({ wrong: true }))});`,
    );
    process.env.CLAUDE_BIN = stub;
    const p = new ClaudeCodeProvider();
    let err: unknown;
    try {
      await p.complete(req);
    } catch (e) {
      err = e;
    }
    check("LlmError が投げられる", err instanceof LlmError);
    check("kind が schema", (err as LlmError)?.kind === "schema", (err as LlmError)?.kind);
    check("3回目は呼ばない", fs.readFileSync(counter, "utf8") === "2");
  }

  console.log("\n[4] 利用枠の上限を quota として分類する");
  {
    const stub = makeStub(
      "quota.js",
      `console.log(JSON.stringify({is_error:true,subtype:"error",result:"Claude usage limit reached. Your limit will reset at 3pm."}));`,
    );
    process.env.CLAUDE_BIN = stub;
    const p = new ClaudeCodeProvider();
    let err: unknown;
    try {
      await p.complete(req);
    } catch (e) {
      err = e;
    }
    check("kind が quota", (err as LlmError)?.kind === "quota", (err as LlmError)?.kind);
    check(
      "画面に出せる日本語の説明がある",
      Boolean((err as LlmError)?.userMessage?.includes("利用枠")),
    );
  }

  console.log("\n[5] コマンドが存在しない場合");
  {
    process.env.CLAUDE_BIN = path.join(TMP, "does-not-exist");
    const p = new ClaudeCodeProvider();
    let err: unknown;
    try {
      await p.complete(req);
    } catch (e) {
      err = e;
    }
    check("kind が notfound", (err as LlmError)?.kind === "notfound", (err as LlmError)?.kind);
  }

  if (process.argv.includes("--live")) {
    console.log("\n[6] 実機（Claude Code を実際に呼び出します）");
    delete process.env.CLAUDE_BIN;
    const p = new ClaudeCodeProvider();
    const r = await p.complete({
      ...req,
      user: "太郎さん向けの短い挨拶を日本語で返してください。",
    });
    check("実機で結果が返る", r.data.greeting.length > 0, JSON.stringify(r.data));
    check("言語が ja", r.data.lang === "ja", r.data.lang);
    console.log(
      `       → ${JSON.stringify(r.data)} (${r.durationMs}ms, 相当額 $${r.costUsd?.toFixed(4)})`,
    );
  } else {
    console.log("\n[6] 実機テストはスキップしました（実行するには --live を付けてください）");
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
