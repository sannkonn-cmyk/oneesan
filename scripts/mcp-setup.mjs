/**
 * Claude Desktop / Claude Code に、このアプリを「読める場所」として登録する。
 *
 *   mcp-setup.bat / mcp-setup.command から呼ばれる
 *
 * 本来は設定ファイル（JSON）を手で編集する作業。そこが唯一の難所なので、
 * ここで代わりに書き換える。**書き換える前に必ず控えを取る。**
 * 設定ファイルを壊すと Claude Desktop 自体が起動しなくなるため。
 *
 * 既にある他のサーバーの登録には触らない。oneesan の項目だけを足す。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAME = "oneesan";

const say = (s = "") => console.log(s ? `  ${s}` : "");

/** Claude Desktop の設定ファイルの置き場。OS ごとに違う。 */
function desktopConfigPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

/**
 * 起動の指定。
 *
 * tsx を経由するのは、サーバー本体が TypeScript で、画面側と同じ組み立てを
 * 使い回しているため。同じものを二重に書かないための代償。
 * `node` を直に指定しているのは、Windows の `.cmd` 経由だと起動できない
 * ことがあるため（この件で以前つまずいている）。
 */
function serverSpec() {
  return {
    command: process.execPath,
    args: ["--import", "tsx", path.join(ROOT, "scripts", "mcp-server.ts")],
    env: { DATABASE_PATH: path.join(ROOT, "data", "oneesan.db"), ONEESAN_READONLY: "1" },
  };
}

// ---------------------------------------------------------------- 事前確認

if (!fs.existsSync(path.join(ROOT, "node_modules", "tsx"))) {
  say();
  say("準備がまだ終わっていません。");
  say("先に start.bat / start.command で一度起動してください。");
  say();
  process.exit(1);
}

if (!fs.existsSync(path.join(ROOT, "data", "oneesan.db"))) {
  say();
  say("データがまだありません。");
  say("先に start.bat / start.command で一度起動してください。");
  say();
  process.exit(1);
}

// ---------------------------------------------------------------- Claude Desktop

let desktopDone = false;
{
  const file = desktopConfigPath();
  const dir = path.dirname(file);

  if (!fs.existsSync(dir)) {
    say("Claude Desktop が見つかりませんでした。登録を省略します。");
    say(`（探した場所: ${file}）`);
  } else {
    let config = {};
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      try {
        config = JSON.parse(raw);
      } catch {
        say("Claude Desktop の設定ファイルが読めない形でした。触らずに中止します。");
        say(`手で直す場合の場所: ${file}`);
        process.exit(1);
      }
      // 壊したときに戻せるようにする。上書きより控えのほうが大事。
      const backup = `${file}.bak`;
      fs.writeFileSync(backup, raw);
      say(`控えを取りました: ${backup}`);
    }

    config.mcpServers = config.mcpServers ?? {};
    const existed = Boolean(config.mcpServers[NAME]);
    config.mcpServers[NAME] = serverSpec();

    fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
    say(existed ? "Claude Desktop の登録を更新しました。" : "Claude Desktop に登録しました。");
    desktopDone = true;
  }
}

// ---------------------------------------------------------------- Claude Code

let codeDone = false;
{
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const spec = serverSpec();
  const probe = spawnSync(bin, ["--version"], { shell: true, encoding: "utf8" });

  if (probe.status !== 0) {
    say("Claude Code が見つかりませんでした。登録を省略します。");
  } else {
    // 登録済みなら消してから入れ直す（二重登録を避ける）
    spawnSync(bin, ["mcp", "remove", NAME], { shell: true, encoding: "utf8" });
    const r = spawnSync(
      bin,
      [
        "mcp",
        "add",
        NAME,
        "--env",
        `DATABASE_PATH=${spec.env.DATABASE_PATH}`,
        "--env",
        "ONEESAN_READONLY=1",
        "--",
        spec.command,
        ...spec.args,
      ],
      { shell: true, encoding: "utf8" },
    );
    if (r.status === 0) {
      say("Claude Code に登録しました。");
      codeDone = true;
    } else {
      say("Claude Code への登録に失敗しました。");
      say(String(r.stderr ?? r.stdout ?? "").trim().slice(0, 300));
    }
  }
}

// ---------------------------------------------------------------- 結果

say();
say("=".repeat(46));
say();
if (!desktopDone && !codeDone) {
  say("  どちらにも登録できませんでした。");
  say();
  say("  Claude Desktop を入れているか確認してください。");
  say("  https://claude.ai/download");
} else {
  say("  登録しました。");
  say();
  if (desktopDone) {
    say("  Claude Desktop を、いったん終了してから開き直してください。");
    say("  起動したままでは設定が読み込まれません。");
    say();
  }
  say("  次のように聞けば読み込みます。");
  say();
  say("    「お姉さん投資判定の私の判断基準を見て、");
  say("      いま溜まっているデータから傾向を教えて」");
  say();
  say("  読み取り専用でつないでいるので、データが書き換わることはありません。");
}
say();
say("=".repeat(46));
say();
