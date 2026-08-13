import { AnthropicApiProvider } from "./anthropic-api";
import { ClaudeCodeProvider } from "./claude-code";
import { LlmError, llmConfig, type LlmProvider } from "./provider";

export * from "./provider";

type Global = typeof globalThis & { __oneesanLlm?: LlmProvider };
const g = globalThis as Global;

export function getLlm(): LlmProvider {
  if (g.__oneesanLlm) return g.__oneesanLlm;

  const { provider } = llmConfig();
  let impl: LlmProvider;
  switch (provider) {
    case "claude-code":
      impl = new ClaudeCodeProvider();
      break;
    case "api":
      impl = new AnthropicApiProvider();
      break;
    default:
      throw new LlmError(
        "unknown",
        `LLM_PROVIDER の値が不正です: ${provider}（claude-code か api を指定してください）`,
      );
  }

  g.__oneesanLlm = impl;
  return impl;
}
