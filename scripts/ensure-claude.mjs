/**
 * Claude Code の用意を自動で済ませる。
 *
 * 利用者にコマンドを打たせないための下ごしらえ:
 *   1. claude コマンドが無ければ npm で入れる
 *   2. 未ログインなら --claudeai（サブスク）を明示してログインさせる
 *
 * ログイン方式を --claudeai で固定しているのが要点。対話メニューから
 * 選ばせると「Anthropic Console（API 従量課金）」を誤って選べてしまい、
 * 意図せず課金が発生する。ここで選択肢ごと消しておく。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const bin = process.env.CLAUDE_BIN ?? "claude";

/** .env.local を軽く読む（このスクリプトは Next の外で動くため）。 */
function readEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { shell: true, encoding: "utf8", ...opts });

const say = (s = "") => console.log(s ? `  ${s}` : "");

const env = readEnvLocal();
const provider = process.env.LLM_PROVIDER ?? env.LLM_PROVIDER ?? "claude-code";

if (provider !== "claude-code") {
  say(`AI の呼び出しは ${provider} 方式です。Claude Code の確認は省略します。`);
  process.exit(0);
}

// ---------------------------------------------------------------- 1. 存在確認
let installed = run(bin, ["--version"]).status === 0;

if (!installed) {
  say();
  say("==============================================");
  say("  Claude Code が入っていないので、いま入れます");
  say("==============================================");
  say();
  say("数分かかります。そのままお待ちください。");
  say();

  const r = run("npm", ["install", "-g", "@anthropic-ai/claude-code"], { stdio: "inherit" });
  if (r.status !== 0) {
    say();
    say("Claude Code のインストールに失敗しました。");
    say("上に出ているメッセージを開発者に伝えてください。");
    say();
    process.exit(1);
  }

  installed = run(bin, ["--version"]).status === 0;
  if (!installed) {
    // インストール直後は PATH が現在のウィンドウに反映されないことがある
    say();
    say("インストールは終わりましたが、まだコマンドを認識できません。");
    say("この黒い画面を一度閉じて、開き直してからもう一度実行してください。");
    say();
    process.exit(1);
  }
  say();
  say("Claude Code を入れました。");
}

// ---------------------------------------------------------------- 2. ログイン確認
function loggedIn() {
  const r = run(bin, ["auth", "status"]);
  if (r.status !== 0 || !r.stdout) return false;
  try {
    return JSON.parse(r.stdout).loggedIn === true;
  } catch {
    return false;
  }
}

if (!loggedIn()) {
  say();
  say("==============================================");
  say("  Claude へのログインが必要です");
  say("==============================================");
  say();
  say("ブラウザが開きます。いつも Claude を使っている");
  say("アカウントでログインしてください。");
  say();
  say("※ Pro / Max のサブスク枠を使う設定で開きます。");
  say("  API の従量課金は発生しません。");
  say();

  run(bin, ["auth", "login", "--claudeai"], { stdio: "inherit" });

  if (!loggedIn()) {
    say();
    say("ログインが完了していません。");
    say("もう一度 start.bat（Mac は start.command）を実行してください。");
    say();
    process.exit(1);
  }
  say();
  say("ログインできました。");
}

say("Claude Code の準備ができています。");
