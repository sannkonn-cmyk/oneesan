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
import { sh } from "./proc.mjs";

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

/**
 * claude / npm はシェル経由でないと呼べないことがある（Windows の .cmd 中継）。
 * ただし引数配列と shell: true を混ぜると Node が警告を出すので、
 * コマンド行を組んでシェルに渡す形にする。ここに来る文字列は
 * すべてこのファイル内の固定値で、利用者の入力は混ざらない。
 */
const run = (cmd, args = [], opts = {}) =>
  sh([cmd, ...args].join(" "), opts);

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

// ---------------------------------------------------------------- 3. 実体の特定
/**
 * 直接起動できる実行ファイルの絶対パスを探す。
 *
 * Windows で npm から入れた claude は claude.cmd という中継ファイルになる。
 * Node がシェルを介さずにプロセスを起動する場合、Windows は .cmd を
 * 起動できず「見つからない」となる。ここで実体（.exe）を突き止めておき、
 * アプリ側は絶対パスで起動する。シェルを使わないのは、貼り付けられた
 * プロフィール本文がコマンドとして解釈される事故を防ぐため。
 */
function resolveExecutable() {
  const tried = [];

  if (process.platform !== "win32") {
    const r = run("command", ["-v", bin]);
    const p = (r.stdout ?? "").trim().split("\n")[0];
    tried.push(`command -v ${bin}`);
    return { path: r.status === 0 && p ? p : null, tried };
  }

  const where = run("where", [bin]);
  const found = (where.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  tried.push(`where ${bin} -> ${found.join(", ") || "(なし)"}`);

  const exe = found.find((p) => p.toLowerCase().endsWith(".exe"));
  if (exe) return { path: exe, tried };

  // 中継ファイルしか無い場合は、グローバル install 先から実体を探す
  const root = (run("npm", ["root", "-g"]).stdout ?? "").trim();
  tried.push(`npm root -g -> ${root || "(取得できず)"}`);
  if (root) {
    const scope = path.join(root, "@anthropic-ai");
    const candidates = [path.join(scope, "claude-code", "bin", "claude.exe")];
    if (fs.existsSync(scope)) {
      for (const dir of fs.readdirSync(scope)) {
        candidates.push(path.join(scope, dir, "bin", "claude.exe"));
        candidates.push(path.join(scope, dir, "claude.exe"));
      }
    }
    for (const c of candidates) {
      if (fs.existsSync(c)) return { path: c, tried };
    }
    tried.push(`${scope} 配下に claude.exe が見つからず`);
  }
  return { path: null, tried };
}

const { path: exePath, tried } = resolveExecutable();

if (!exePath) {
  say();
  say("Claude Code の実行ファイルを特定できませんでした。");
  say("探した場所:");
  for (const t of tried) say(`  - ${t}`);
  say();
  say("この内容を開発者に伝えてください。");
  say();
  process.exit(1);
}

// シェルを介さずに本当に起動できるかを、アプリと同じ方法で確かめる。
// ここを省くと「起動時は通るのに判定時だけ失敗する」状態を見逃す。
const direct = spawnSync(exePath, ["--version"], { encoding: "utf8", shell: false });
if (direct.status !== 0) {
  say();
  say("実行ファイルは見つかりましたが、直接起動できませんでした。");
  say(`  パス: ${exePath}`);
  say(`  内容: ${(direct.stderr || direct.error?.message || "").slice(0, 200)}`);
  say();
  process.exit(1);
}

// アプリが迷わないよう .env.local に絶対パスを控える
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  let body = fs.readFileSync(envPath, "utf8");
  const line = `CLAUDE_BIN=${exePath}`;
  body = /^\s*#?\s*CLAUDE_BIN=.*$/m.test(body)
    ? body.replace(/^\s*#?\s*CLAUDE_BIN=.*$/m, line)
    : `${body.replace(/\s*$/, "")}\n${line}\n`;
  fs.writeFileSync(envPath, body);
}

say(`Claude Code の準備ができています。（${direct.stdout.trim()}）`);
