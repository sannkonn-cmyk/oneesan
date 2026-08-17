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
import fs from "node:fs";
import path from "node:path";
import {
  DB_PATH,
  NAME,
  TSX_CLI,
  desktopConfigPath,
  desktopInstalled,
  serverSpec,
} from "./mcp-spec.mjs";
import { exec, sh } from "./proc.mjs";

const say = (s = "") => console.log(s ? `  ${s}` : "");

// ---------------------------------------------------------------- 事前確認

if (!fs.existsSync(TSX_CLI)) {
  say();
  say("準備がまだ終わっていません。");
  say("先に start.bat / start.command で一度起動してください。");
  say();
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  say();
  say("データがまだありません。");
  say("先に start.bat / start.command で一度起動してください。");
  say();
  process.exit(1);
}

// ---------------------------------------------------------------- Claude Desktop

let desktopDone = false;
let desktopMissing = false;
{
  const file = desktopConfigPath();
  const dir = path.dirname(file);
  const app = desktopInstalled();

  if (!fs.existsSync(dir) && !app) {
    desktopMissing = true;
    say("Claude Desktop は入っていないようです。登録を省略します。");
  } else {
    // 入れた直後だと設定フォルダがまだ無い。こちらで作ってしまってよい。
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      say(`設定フォルダを作りました: ${dir}`);
    }
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
  /**
   * 実行ファイルの絶対パスを先に突き止める。
   * Windows の claude は .cmd の中継なので、シェルを介さないと呼べない。
   * 一方、引数を渡す本番の呼び出しはシェルを通したくない
   * （空白を含むパスが壊れる。実際このアプリのパスには空白が入り得る）。
   * だから探索だけシェルで行い、実行は絶対パスに切り替える。
   */
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const spec = serverSpec();

  const lookup =
    process.platform === "win32" ? sh(`where ${bin}`) : sh(`command -v ${bin}`);
  const found = String(lookup.stdout ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const claudePath =
    found.find((p) => p.toLowerCase().endsWith(".exe")) ?? found[0] ?? null;

  if (!claudePath || exec(claudePath, ["--version"]).status !== 0) {
    say("Claude Code が見つかりませんでした。登録を省略します。");
  } else {
    // 登録済みなら消してから入れ直す（二重登録を避ける）
    exec(claudePath, ["mcp", "remove", "--scope", "user", NAME]);
    exec(claudePath, ["mcp", "remove", NAME]);

    // scope は user にする。既定の local だと「このフォルダで claude を
    // 起動したときだけ使える」登録になり、別の場所から使えない。
    const r = exec(claudePath, [
      "mcp",
      "add",
      "--scope",
      "user",
      NAME,
      "--env",
      `DATABASE_PATH=${DB_PATH}`,
      "--env",
      "ONEESAN_READONLY=1",
      "--",
      spec.command,
      ...spec.args,
    ]);
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

const ASK = [
  "    「お姉さん投資判定の私の判断基準を見て、",
  "      いま溜まっているデータから傾向を教えて」",
];

say();
say("=".repeat(46));
say();

if (!desktopDone && !codeDone) {
  say("  どちらにも登録できませんでした。");
  say();
  say("  Claude Desktop を入れてから、もう一度このファイルを");
  say("  実行してください。");
  say("    https://claude.ai/download");
} else {
  if (desktopDone) {
    say("  Claude Desktop に登録しました。");
    say();
    say("  Claude Desktop を、いったん終了してから開き直してください。");
    say("  起動したままでは設定が読み込まれません。");
    say();
    say("  開き直したら、こう聞いてください。");
    for (const l of ASK) say(l);
  }

  if (desktopMissing) {
    // Claude Code だけ登録できた場合。何ができて何ができないかを分けて言う。
    say("  Claude Desktop は入っていないので、登録できたのは");
    say("  Claude Code（黒い画面）だけです。");
    say();
    say("  ● いま使えること");
    say("      黒い画面で claude と打って始め、こう聞く。");
    for (const l of ASK) say(l);
    say();
    say("  ● スマホの Claude アプリで使いたい場合");
    say("      アプリ側からこの PC は見えないので、");
    say("      画面の「履歴 → Claude に読ませる」から書き出して、");
    say("      コピーか添付で渡してください。設定は要りません。");
    say();
    say("  ● PC の Claude Desktop で使いたい場合");
    say("      入れてから、このファイルをもう一度実行してください。");
    say("        https://claude.ai/download");
  } else if (codeDone && !desktopDone) {
    say("  Claude Code に登録しました。");
    say();
    say("  黒い画面で claude と打って始め、こう聞いてください。");
    for (const l of ASK) say(l);
  }

  say();
  say("  読み取り専用でつないでいるので、データが書き換わることはありません。");
}
say();
say("=".repeat(46));
say();
