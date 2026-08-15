import fs from "node:fs";
import path from "node:path";

/**
 * 自己診断ページ。
 *
 *   http://<PCのIP>:3000/health
 *
 * 画面が崩れる・ボタンが効かない、という症状は、見た目（CSS）と
 * 動き（JS）を入れている `/_next/static/…` が端末に届いていないときに出る。
 * それを端末自身に確かめさせるためのページ。
 *
 * このページは **外部ファイルを一切読まない**。
 * 見た目は書き込みの style、判定は書き込みの script でやる。
 * 「壊れているものを使って壊れ方を調べる」ことにならないようにするため。
 *
 * 合言葉のゲートからは外してある（middleware.ts）。ログインできない状態でも
 * 開けなければ意味が無いため。店名や源氏名は一切出さない。
 */
export const dynamic = "force-dynamic";

/** 実際に配っている資産の URL を、置いてあるファイルから拾う。 */
function assetUrls(): string[] {
  const base = path.join(process.cwd(), ".next", "static");
  const pick = (dir: string, count: number) => {
    const full = path.join(base, dir);
    if (!fs.existsSync(full)) return [];
    return fs
      .readdirSync(full, { withFileTypes: true })
      .filter((e) => e.isFile())
      .slice(0, count)
      .map((e) => `/_next/static/${dir}/${e.name}`);
  };
  return [...pick("css", 2), ...pick("chunks", 2)];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function GET(req: Request) {
  const urls = assetUrls();
  const host = req.headers.get("host") ?? "";

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>接続診断</title>
<style>
  body { background:#0b0d10; color:#e2e8f0; font-family:system-ui,sans-serif;
         margin:0; padding:20px; line-height:1.7; font-size:15px; }
  h1 { font-size:17px; margin:0 0 4px; }
  p.sub { color:#94a3b8; font-size:13px; margin:0 0 20px; }
  .box { border:1px solid #1e293b; border-radius:10px; padding:14px; margin-bottom:14px; }
  .row { display:flex; gap:10px; align-items:baseline; padding:4px 0;
         border-top:1px solid #16202e; font-size:13px; }
  .row:first-child { border-top:0; }
  .u { color:#94a3b8; word-break:break-all; flex:1; }
  .s { font-weight:700; white-space:nowrap; }
  .ok { color:#4ade80; } .ng { color:#f87171; } .wait { color:#94a3b8; }
  #verdict { font-size:15px; font-weight:700; }
  .k { color:#94a3b8; font-size:12px; }
  code { background:#111a26; padding:1px 5px; border-radius:4px; font-size:12px; }
</style>
</head>
<body>
<h1>接続診断</h1>
<p class="sub">この画面は色が付いています。付いていなければ、端末の表示設定の問題です。</p>

<div class="box">
  <div id="verdict" class="wait">調べています…</div>
  <div id="advice" class="k" style="margin-top:6px"></div>
</div>

<div class="box" id="list">
  <div class="k" style="margin-bottom:6px">見た目と動きのファイルが届くか</div>
</div>

<div id="cssprobe" style="display:none">css probe</div>

<div class="box">
  <div class="k">接続先</div>
  <div style="font-size:13px">${esc(host)}</div>
  <div class="k" style="margin-top:8px">この端末</div>
  <div style="font-size:12px;color:#94a3b8" id="ua"></div>
</div>

<p class="k">うまくいかないときは、この画面をそのまま撮って送ってください。</p>

<script>
(function () {
  var nextUrls = ${JSON.stringify(urls)};
  var list = document.getElementById("list");
  var total = 0, done = 0, badNext = 0, badOwn = 0;

  document.getElementById("ua").textContent = navigator.userAgent;

  function row(label) {
    var el = document.createElement("div");
    el.className = "row";
    var name = document.createElement("span");
    name.className = "u";
    name.textContent = label;
    var st = document.createElement("span");
    st.className = "s wait";
    st.textContent = "…";
    el.appendChild(name);
    el.appendChild(st);
    list.appendChild(el);
    total++;
    return function (ok, text, isNext) {
      st.className = "s " + (ok ? "ok" : "ng");
      st.textContent = text;
      if (!ok) { if (isNext) badNext++; else badOwn++; }
      if (++done === total) finish();
    };
  }

  function finish() {
    var v = document.getElementById("verdict");
    var a = document.getElementById("advice");
    if (badNext === 0 && badOwn === 0) {
      v.className = "ok";
      v.textContent = "異常なし";
      a.textContent = "ファイルは全て届いています。画面がまだ崩れている場合は、"
        + "ブラウザで引っぱって更新してください。古い状態が残っているだけです。";
    } else if (badNext > 0 && badOwn === 0) {
      v.className = "ng";
      v.textContent = "見た目と動きのファイルだけが止められています";
      a.textContent = "通信そのものは通っているので、防火壁より先の問題です。"
        + "PC の保護ソフト（ウイルス対策）の Web 保護、または"
        + "スマホ側の広告ブロック・フィルタが疑わしいです。"
        + "この画面を撮って送ってください。";
    } else {
      v.className = "ng";
      v.textContent = "ファイルが届いていません";
      a.textContent = "画面が崩れる・ボタンが効かない直接の原因です。"
        + "PC 側で network-fix.bat を管理者として実行してください。"
        + "直らなければ、この画面を撮って送ってください。";
    }
  }

  // 1. このアプリ自身が配る CSS。link タグで実際に読ませて、効いたかを見る。
  //    fetch は通るのに表示に使われない、という止められ方も拾える。
  var doneCss = row("このアプリの CSS（link）");
  var l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "/health/probe.css?t=" + Date.now();
  l.onload = function () {
    var c = getComputedStyle(document.getElementById("cssprobe")).color;
    var hit = c.replace(/\\s/g, "") === "rgb(0,200,0)";
    doneCss(hit, hit ? "効いた" : "効かない", false);
  };
  l.onerror = function () { doneCss(false, "届かない", false); };
  document.head.appendChild(l);

  // 2. このアプリ自身が配る JS。script タグで実際に実行させる。
  var doneJs = row("このアプリの JS（script）");
  var s = document.createElement("script");
  s.src = "/health/probe.js?t=" + Date.now();
  s.onload = function () {
    var hit = window.__oneesanProbe === true;
    doneJs(hit, hit ? "動いた" : "動かない", false);
  };
  s.onerror = function () { doneJs(false, "届かない", false); };
  document.head.appendChild(s);

  // 3. 本物の資産。ここだけ落ちるなら、置き場を狙って止められている。
  if (!nextUrls.length) {
    row("組み立て結果")(false, "見つからない", true);
  }
  nextUrls.forEach(function (u) {
    var d = row(u);
    // キャッシュ済みの結果ではなく、いま届くかを見たい
    fetch(u + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { d(r.ok, r.ok ? "届いた" : "HTTP " + r.status, true); })
      .catch(function (e) {
        var m = String((e && e.message) || e);
        // ブラウザの文言は英語で出るので、よくあるものは日本語にする
        d(false, /fetch|network/i.test(m) ? "届かない" : m.slice(0, 24), true);
      });
  });
})();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
