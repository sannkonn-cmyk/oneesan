import type { z } from "zod";

export type LlmErrorKind =
  | "quota"    // Pro/Max の利用枠を使い切った、またはレート制限
  | "auth"     // 未ログイン / APIキー不正
  | "timeout"
  | "schema"   // 2回試しても指定した形式で返ってこなかった
  | "refusal"  // モデルが応答を拒否した
  | "notfound" // claude コマンドが見つからない
  | "unknown";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "LlmError";
  }

  /** 画面にそのまま出せる日本語の説明。 */
  get userMessage(): string {
    switch (this.kind) {
      case "quota":
        return "Claude の利用枠を使い切ったか、短時間に呼び出しすぎています。しばらく待ってから再実行してください。過去実績の一括登録中であれば、途中まで保存されているので後で続きから再開できます。";
      case "auth":
        return "Claude の認証が通っていません。ターミナルで `claude` を起動してログイン状態を確認してください（API 方式を使う場合は ANTHROPIC_API_KEY を設定してください）。";
      case "timeout":
        return "AI の応答が時間内に返りませんでした。もう一度試すか、.env.local の LLM_TIMEOUT_MS を延ばしてください。";
      case "schema":
        return "AI の応答が想定した形式になりませんでした。もう一度実行してみてください。繰り返す場合は本文が長すぎる可能性があります。";
      case "refusal":
        return "AI が応答を拒否しました。入力内容を見直してください。";
      case "notfound":
        return "claude コマンドが見つかりません。Claude Code がインストールされているか、.env.local の CLAUDE_BIN を確認してください。";
      default:
        return `AI の呼び出しに失敗しました: ${this.message}`;
    }
  }
}

export interface LlmRequest<T> {
  /** ログ表示用の名前（analyze / rereview / import） */
  label: string;
  system: string;
  user: string;
  /** 構造化出力を強制するための JSON Schema */
  jsonSchema: object;
  /** 受信後の検証 */
  zod: z.ZodType<T>;
}

export interface LlmResult<T> {
  data: T;
  raw: string;
  provider: string;
  model: string;
  durationMs: number;
  /** 相当額（サブスク枠利用時も参考値として返る） */
  costUsd?: number;
  /** 形式エラーで再試行した回数 */
  retries: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

export const llmConfig = () => ({
  provider: (process.env.LLM_PROVIDER ?? "claude-code").trim(),
  model: (process.env.LLM_MODEL ?? "claude-opus-5").trim(),
  effort: (process.env.LLM_EFFORT ?? "high").trim(),
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 240_000),
  claudeBin: (process.env.CLAUDE_BIN ?? "claude").trim(),
});

/**
 * 形式違反で再依頼するときの追記。
 * 元のプロンプトを丸ごと投げ直すのではなく、何が違反だったかを伝えて直させる。
 */
export function repairInstruction(errorText: string): string {
  return `

# 直前の出力が指定された形式に違反しました

検出されたエラー:
${errorText}

上記を修正し、指定された JSON スキーマに厳密に従って、もう一度出力してください。
説明文やコードブロックの記号は付けず、JSON だけを出力してください。`;
}
