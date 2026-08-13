import Anthropic from "@anthropic-ai/sdk";
import {
  LlmError,
  llmConfig,
  repairInstruction,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider";

/**
 * Anthropic API を直接叩くプロバイダ（従量課金）。
 * Claude Code の枠が足りない・動作が不安定なときの逃げ道。
 * .env.local で LLM_PROVIDER=api にすると切り替わる。
 */
export class AnthropicApiProvider implements LlmProvider {
  readonly name = "api";
  readonly model: string;
  private readonly cfg = llmConfig();
  private readonly client: Anthropic;

  constructor() {
    this.model = this.cfg.model;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LlmError("auth", "LLM_PROVIDER=api には ANTHROPIC_API_KEY が必要です");
    }
    this.client = new Anthropic();
  }

  async complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
    const started = Date.now();
    let retries = 0;
    let user = req.user;
    let lastError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      // output_config（effort と structured outputs）は API では利用できるが、
      // インストール済み SDK の型定義がまだ追いついていない。
      // ボディの未知フィールドはそのまま送信されるので、ここだけ型を緩める。
      const params = {
        model: this.model,
        max_tokens: 16000,
        system: req.system,
        output_config: {
          effort: this.cfg.effort,
          format: { type: "json_schema", schema: req.jsonSchema },
        },
        messages: [{ role: "user" as const, content: user }],
      };

      let response;
      try {
        response = await this.client.messages.create(
          params as unknown as Anthropic.MessageCreateParamsNonStreaming,
        );
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) {
          throw new LlmError("quota", "API のレート制限に達しました");
        }
        if (e instanceof Anthropic.AuthenticationError) {
          throw new LlmError("auth", "ANTHROPIC_API_KEY が不正です");
        }
        throw new LlmError("unknown", e instanceof Error ? e.message : String(e));
      }

      // content を読む前に必ず stop_reason を見る。拒否時は content が空になりうる。
      if (response.stop_reason === "refusal") {
        throw new LlmError("refusal", "モデルが応答を拒否しました");
      }

      const text = response.content.find((b) => b.type === "text");
      const raw = text && "text" in text ? text.text : "";

      let candidate: unknown;
      try {
        candidate = JSON.parse(raw);
      } catch {
        lastError = "JSON として解釈できませんでした";
        user = req.user + repairInstruction(lastError);
        retries++;
        continue;
      }

      const parsed = req.zod.safeParse(candidate);
      if (parsed.success) {
        const u = response.usage;
        return {
          data: parsed.data,
          raw,
          provider: this.name,
          model: this.model,
          durationMs: Date.now() - started,
          // Opus 5 の公開価格 $5 / $25 per MTok で概算
          costUsd: (u.input_tokens * 5 + u.output_tokens * 25) / 1_000_000,
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
