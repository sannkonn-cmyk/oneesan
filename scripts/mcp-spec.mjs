import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * MCP サーバーの起動方法と、置き場の情報。
 *
 * 登録する側（mcp-setup.mjs）と検査する側（test-mcp.ts）で同じものを使う。
 * ここを分けて書くと、「登録はできたのに起動しない」を検査が見逃す。
 * 実際に一度見逃した（作業フォルダ基準で tsx を解決していて落ちた）。
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NAME = "oneesan";

export const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
export const SERVER = path.join(ROOT, "scripts", "mcp-server.ts");
export const DB_PATH = path.join(ROOT, "data", "oneesan.db");

/**
 * 起動の指定。
 *
 * tsx を経由するのは、サーバー本体が TypeScript で、画面側と同じ組み立てを
 * 使い回しているため。同じものを二重に書かないための代償。
 *
 * tsx は**絶対パスのファイルとして**渡す。`--import tsx` のような名前指定だと
 * 起動時の作業フォルダから探しに行くので、別の場所から起動されると失敗する。
 * Claude Desktop も Claude Code も、このフォルダとは無関係な場所から起動する。
 *
 * `node` を直に指定しているのは、Windows で `.cmd` 中継を経由すると
 * 起動できないことがあるため（この件で以前つまずいている）。
 */
export function serverSpec() {
  return {
    command: process.execPath,
    args: [TSX_CLI, SERVER],
    env: { DATABASE_PATH: DB_PATH, ONEESAN_READONLY: "1" },
  };
}

/** Claude Desktop の設定ファイルの置き場。OS ごとに違う。 */
export function desktopConfigPath() {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(home, "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  return path.join(home, ".config", "Claude", "claude_desktop_config.json");
}

/**
 * Claude Desktop が入っているか。
 *
 * 設定ファイルの有無では判定できない。**入れた直後・一度も起動していない
 * 状態では、設定フォルダがまだ作られていない。** それを「入っていない」と
 * 扱うと、入れたのに登録できないという分かりにくい状態になる。
 * だから本体の場所を探す。
 */
export function desktopInstalled() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  const candidates =
    process.platform === "win32"
      ? [
          path.join(local, "AnthropicClaude"),
          path.join(local, "Programs", "Claude"),
          path.join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Claude"),
        ]
      : process.platform === "darwin"
        ? ["/Applications/Claude.app", path.join(home, "Applications", "Claude.app")]
        : [];

  return candidates.find((p) => fs.existsSync(p)) ?? null;
}
