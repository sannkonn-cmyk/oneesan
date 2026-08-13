/**
 * 最新版への入れ替え。
 *
 *   update.bat / update.command をダブルクリック
 *
 * GitHub から最新のソースを取ってきて、この フォルダの中身を入れ替える。
 * **学習データと設定は残す。**（data/ と .env.local には一切触らない）
 *
 * 全部消してから入れ直すのではなく、src/ と scripts/ だけ「同期」する。
 * 上書きコピーだけだと、新しい版で削除されたファイルが残ってしまい、
 * 型チェックで落ちる。逆に丸ごと消すと、消してはいけないものまで巻き込む。
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "sannkonn-cmyk/oneesan";
const BRANCH = process.env.ONEESAN_BRANCH ?? "claude/adult-profile-analysis-ai-gq6mri";
const ZIP_URL = `https://codeload.github.com/${REPO}/zip/refs/heads/${BRANCH}`;

/** 絶対に触らないもの。個人データ・設定・自動生成物。 */
const KEEP = new Set(["data", ".env.local", ".env", "node_modules", ".git", ".next"]);

/**
 * 更新の実行中に、自分自身（この処理を起動したファイル）を書き換えない。
 * cmd.exe も bash も、実行中のスクリプトを読みながら進むので、
 * 途中で中身が変わると動作が壊れる。
 */
const SELF = new Set(["update.bat", "update.command"]);

/** 中のファイルまで見て差分を消す対象。 */
const MIRROR = new Set(["src", "scripts"]);

const say = (s = "") => console.log(s);

function fail(message, detail = "") {
  say();
  say(`  更新できませんでした。`);
  say(`  ${message}`);
  if (detail) say(`  （${detail}）`);
  say();
  say(`  何度も失敗する場合は、GitHub から ZIP を落として`);
  say(`  中身を差し替えてください。data フォルダと .env.local は残してください。`);
  say();
  process.exit(1);
}

/** 中のファイルを相対パスで全部並べる。 */
function listFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else out.push(path.relative(base, full));
  }
  return out;
}

function sha(file) {
  if (!fs.existsSync(file)) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function download(dest) {
  const res = await fetch(ZIP_URL);
  if (!res.ok) {
    fail(
      res.status === 404
        ? "配布元が見つかりませんでした。"
        : "配布元から取得できませんでした。",
      `HTTP ${res.status}`,
    );
  }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function unzip(zip, dest) {
  const r =
    process.platform === "win32"
      ? spawnSync(
          "powershell",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${dest}' -Force`,
          ],
          { stdio: "pipe" },
        )
      : spawnSync("unzip", ["-q", "-o", zip, "-d", dest], { stdio: "pipe" });

  if (r.status !== 0) {
    fail("ダウンロードしたファイルを展開できませんでした。", String(r.stderr ?? "").slice(0, 200));
  }
}

/** 新しい版に無いファイルを消してから、上書きする。 */
function mirror(from, to) {
  if (fs.existsSync(to)) {
    for (const rel of listFiles(to)) {
      if (!fs.existsSync(path.join(from, rel))) fs.rmSync(path.join(to, rel));
    }
  }
  fs.cpSync(from, to, { recursive: true, force: true });
}

async function main() {
  say();
  say("  最新版を取ってきています…");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oneesan-update-"));
  const zip = path.join(tmp, "src.zip");
  const out = path.join(tmp, "out");

  try {
    await download(zip);
  } catch (e) {
    fail("インターネットに繋がりませんでした。", e instanceof Error ? e.message : "");
  }

  unzip(zip, out);

  const inner = fs
    .readdirSync(out, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(out, e.name));

  const fresh = inner[0];
  // 落とし損ねた中身で上書きすると壊すので、形を確かめてから進む。
  if (
    inner.length !== 1 ||
    !fs.existsSync(path.join(fresh, "package.json")) ||
    !fs.existsSync(path.join(fresh, "src"))
  ) {
    fail("ダウンロードした中身が壊れていました。");
  }

  const lockBefore = sha(path.join(ROOT, "package-lock.json"));
  const pending = [];

  say("  入れ替えています…");
  for (const e of fs.readdirSync(fresh, { withFileTypes: true })) {
    const name = e.name;
    if (KEEP.has(name)) continue;

    const from = path.join(fresh, name);
    const to = path.join(ROOT, name);

    if (SELF.has(name)) {
      // 中身が同じなら書く必要が無い。違うときだけ隣に置いて知らせる。
      if (sha(from) !== sha(to)) {
        fs.copyFileSync(from, `${to}.new`);
        pending.push(name);
      }
      continue;
    }

    if (MIRROR.has(name) && e.isDirectory()) mirror(from, to);
    else fs.cpSync(from, to, { recursive: true, force: true });
  }

  // 前回の組み立て結果が残っていると、消したはずの画面が出ることがある。
  fs.rmSync(path.join(ROOT, ".next"), { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  const lockAfter = sha(path.join(ROOT, "package-lock.json"));
  if (lockBefore !== lockAfter || !fs.existsSync(path.join(ROOT, "node_modules"))) {
    say();
    say("  部品の入れ替えが必要です。数分かかります…");
    say();
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (r.status !== 0) fail("部品の入れ替えに失敗しました。");
  }

  say();
  say("  ==============================================");
  say();
  say("    更新しました。");
  say();
  say("    学習データと合言葉はそのまま残っています。");
  say();
  if (pending.length) {
    say("    ※ 更新用ファイル自体が新しくなっています。");
    for (const name of pending) {
      say(`       ${name} を消して、${name}.new を ${name} に名前変更してください。`);
    }
    say();
  }
  say("    この画面を閉じて、いつもどおり起動してください。");
  say();
  say("  ==============================================");
  say();
}

void main();
