import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  LlmError,
  llmConfig,
  repairInstruction,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider";

const execFileAsync = promisify(execFile);

/** claude -p --output-format json が返す封筒。必要なフィールドだけ拾う。 */
interface Envelope {
  is_error?: boolean;
  subtype?: string;
  api_error_status?: string | null;
  result?: string;
  structured_output?: unknown;
  total_cost_usd?: number;
  stop_reason?: string;
}

function classify(text: string): LlmError["kind"] {
  const t = text.toLowerCase();
  if (/usage limit|rate.?limit|429|quota|too many requests|upgrade to/.test(t)) return "quota";
  if (/not logged in|unauthorized|401|authentication|invalid api key|please run.*login/.test(t))
    return "auth";
  if (/refus/.test(t)) return "refusal";
  if (/enoent|command not found|not found/.test(t)) return "notfound";
  return "unknown";
}

/**
 * 本文テキストから JSON を取り出す。
 * --json-schema を使えば structured_output が返るので通常は不要だが、
 * 再試行時など素のテキストで返ってきた場合の保険として持つ。
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 続行 */
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* 続行 */
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* 続行 */
    }
  }
  throw new LlmError("schema", "応答から JSON を取り出せませんでした", text.slice(0, 800));
}

/**
 * Claude Code CLI をヘッドレス実行するプロバイダ。
 * Pro / Max のサブスク枠を使うため、API の従量課金は発生しない。
 */
export class ClaudeCodeProvider implements LlmProvider {
  readonly name = "claude-code";
  readonly model: string;
  private readonly cfg = llmConfig();
  private readonly cwd: string;

  constructor() {
    this.model = this.cfg.model;
    // リポジトリ内で実行すると CLAUDE.md や周辺ファイルを拾いうるので、
    // 空の作業ディレクトリを専用に用意してそこで走らせる。
    this.cwd = path.join(os.tmpdir(), "oneesan-llm");
    fs.mkdirSync(this.cwd, { recursive: true });
  }

  private childEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    // ANTHROPIC_API_KEY が環境に残っていると Claude Code がサブスクではなく
    // API 課金で動いてしまう。claude-code プロバイダを選んでいる時点で
    // 意図はサブスク利用なので、明示的にオプトインしない限り外す。
    if (process.env.CLAUDE_CODE_USE_API_KEY !== "1") {
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;
    }
    return env;
  }

  private async invoke(
    system: string,
    user: string,
    jsonSchema: object,
  ): Promise<{ envelope: Envelope; stdout: string }> {
    const args = [
      "-p",
      user,
      "--output-format", "json",
      "--json-schema", JSON.stringify(jsonSchema),
      "--system-prompt", system,
      "--model", this.model,
      "--effort", this.cfg.effort,
      // テキスト生成しかさせない。ファイル読み書きや検索を始めさせない。
      "--tools", "",
      // CLAUDE.md / スキル / プラグイン / フック / MCP を読み込ませない。
      "--safe-mode",
      "--no-session-persistence",
    ];

    let stdout: string;
    try {
      const res = await execFileAsync(this.cfg.claudeBin, args, {
        cwd: this.cwd,
        env: this.childEnv(),
        timeout: this.cfg.timeoutMs,
        maxBuffer: 32 * 1024 * 1024,
        encoding: "utf8",
      });
      stdout = res.stdout;
    } catch (e) {
      const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
      if (err.code === "ENOENT") {
        throw new LlmError("notfound", `${this.cfg.claudeBin} を実行できません`);
      }
      if (err.killed) {
        throw new LlmError("timeout", `${this.cfg.timeoutMs}ms 以内に応答がありませんでした`);
      }
      const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n");
      throw new LlmError(classify(detail), "Claude Code の実行に失敗しました", detail.slice(0, 2000));
    }

    let envelope: Envelope;
    try {
      envelope = JSON.parse(stdout) as Envelope;
    } catch {
      throw new LlmError("unknown", "Claude Code の出力を解釈できませんでした", stdout.slice(0, 2000));
    }

    if (envelope.is_error || envelope.subtype !== "success") {
      const detail = `${envelope.subtype ?? ""} ${envelope.api_error_status ?? ""} ${envelope.result ?? ""}`;
      throw new LlmError(classify(detail), "Claude Code がエラーを返しました", detail.slice(0, 2000));
    }

    return { envelope, stdout };
  }

  async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
    const started = Date.now();
    let retries = 0;
    let user = req.user;
    let lastError = "";

    // 形式違反は1回だけ直させる。2回失敗したら諦めて生テキストを添えて投げる。
    for (let attempt = 0; attempt < 2; attempt++) {
      const { envelope } = await this.invoke(req.system, user, req.jsonSchema);

      const raw = envelope.result ?? "";
      let candidate: unknown;
      try {
        candidate = envelope.structured_output ?? extractJson(raw);
      } catch (e) {
        lastError = e instanceof LlmError ? (e.detail ?? e.message) : String(e);
        user = req.user + repairInstruction(lastError);
        retries++;
        continue;
      }

      const parsed = req.zod.safeParse(candidate);
      if (parsed.success) {
        return {
          data: parsed.data,
          raw: JSON.stringify(candidate),
          provider: this.name,
          model: this.model,
          durationMs: Date.now() - started,
          costUsd: envelope.total_cost_usd,
          retries,
        };
      }

      lastError = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      user = req.user + repairInstruction(lastError);
      retries++;
    }

    throw new LlmError(
      "schema",
      "AI の応答が指定した形式になりませんでした（2回試行）",
      lastError.slice(0, 2000),
    );
  }
}
