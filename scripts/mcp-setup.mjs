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

/**
 * **入っているかを判定しない。設定は常に書く。**
 *
 * 判定を誤ると「入っているのに登録されない」となり、利用者が自力で
 * 気づけない。逆に入っていない環境に残るのはファイル1つで、害が無い。
 * 損害の大きさが釣り合っていないので、判定に成否を委ねない。
 * （実際、入っているのに「入っていない」と出た報告があった。）
 */
let desktopDone = false;
const desktopFile = desktopConfigPath();
{
  const dir = path.dirname(desktopFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let config = {};
  if (fs.existsSync(desktopFile)) {
    const raw = fs.readFileSync(desktopFile, "utf8");
    try {
      config = JSON.parse(raw);
    } catch {
      say("Claude Desktop の設定ファイルが読めない形でした。触らずに中止します。");
      say(`手で直す場合の場所: ${desktopFile}`);
      process.exit(1);
    }
    // 壊したときに戻せるようにする。上書きより控えのほうが大事。
    fs.writeFileSync(`${desktopFile}.bak`, raw);
    say(`控えを取りました: ${desktopFile}.bak`);
  }

  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers[NAME] = serverSpec();

  fs.writeFileSync(desktopFile, JSON.stringify(config, null, 2) + "\n");
  say("Claude Desktop 用の設定を書きました。");
  say(`  ${desktopFile}`);
  desktopDone = true;
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
say("  設定を書きました。");
say();
say("  Claude Desktop を、いったん終了してから開き直してください。");
say("  起動したままでは設定が読み込まれません。");
say("  × で閉じても常駐が残ることがあるので、");
say("  画面右下の通知領域からも終了させてください。");
say();
say("  開き直したら、こう聞いてください。");
for (const l of ASK) say(l);
say();
if (codeDone) {
  say("  Claude Code（黒い画面）にも登録しました。");
  say("  claude と打って始めれば、同じように聞けます。");
  say();
}
say("  読み取り専用でつないでいるので、データが書き換わることはありません。");
say();
say("  ------------------------------------------");
say();
say("  ● 読み込まれない場合は、深追いしないでください。");
say();
say("    アプリの「履歴 → Claude に読ませる」から");
say("    MD ファイルを書き出して、Claude Desktop の入力欄に");
say("    貼り付けるか、保存した .md をドラッグして落とせば");
say("    同じことができます。設定は一切要りません。");
say();
if (!desktopInstalled()) {
  // 見つからなくても設定は書いてある。ここは参考情報にとどめる。
  say("    なお、Claude Desktop の本体は見つけられませんでした。");
  say("    設定は書いてあるので、入っていれば次の起動で読まれます。");
  say();
}
say("=".repeat(46));
say();
