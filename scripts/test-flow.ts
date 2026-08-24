/**
 * 受け入れテスト。起動中のサーバーに対して、利用者と同じ経路（HTTP）で
 * 一通りの流れを通す。
 *
 *   npm run go            （別のウィンドウで起動しておく）
 *   npm run test:flow
 *
 * 単体テストと違い、ここは「画面から押したときに本当に動くか」を見る。
 * ライブラリを直接呼ぶテストだけだと、起動経路や API 層の食い違いを
 * 見逃す（実際に一度見逃した）。
 *
 * Claude を3回呼ぶので利用枠を消費する。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

function readPin(): string {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8").match(/^APP_PASSWORD=(.*)$/m)?.[1]?.trim() ?? "";
}

let failures = 0;
let cookie = "";

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       → ${detail}` : ""}`);
  }
}

/**
 * node:http を直に使う。
 * Node の fetch（undici）は応答ヘッダを5分までしか待たないため、
 * 判定や再レビューのような長い処理では本体が正常でもクライアント側で切れる。
 */
function request(
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + pathname);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const setCookie = res.headers["set-cookie"];
        if (setCookie?.length) cookie = setCookie[0].split(";")[0];
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (text += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.setTimeout(20 * 60_000, () => {
      req.destroy(new Error("20分待っても応答がありませんでした"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * サーバーアクションのフォームを、ブラウザと同じ形（multipart）で送る。
 * 設定画面は JavaScript を使わない素の form なので、こちらも素で送らないと
 * 「利用者と同じ経路を通す」というこのテストの意味が無くなる。
 */
function postForm(pathname: string, fields: [string, string][]): Promise<{ status: number; text: string }> {
  const boundary = "----oneesan" + Math.random().toString(16).slice(2);
  const body =
    fields
      .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
      .join("") + `--${boundary}--\r\n`;

  return new Promise((resolve, reject) => {
    const url = new URL(BASE + pathname);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": Buffer.byteLength(body),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (d) => (text += d));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.setTimeout(60_000, () => req.destroy(new Error("フォーム送信が返りませんでした")));
    req.write(body);
    req.end();
  });
}

/** 同じ画面に複数のフォームがあるので、目印の入力欄で見分ける。 */
function actionIdFor(html: string, marker: string): string {
  for (const chunk of html.split("<form").slice(1)) {
    const form = chunk.slice(0, chunk.indexOf("</form>"));
    if (!form.includes(`name="${marker}"`)) continue;
    const id = form.match(/name="(\$ACTION_ID_[^"]+)"/)?.[1];
    if (id) return id;
  }
  throw new Error(`${marker} を含むフォームが見つかりません`);
}

async function api(pathname: string, body?: unknown): Promise<{ status: number; json: any }> {
  const { status, text } = await request(body === undefined ? "GET" : "POST", pathname, body);
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status, json };
}

/** 画面の HTML を取る。 */
const getPage = async (pathname: string) => request("GET", pathname);

/**
 * 過去登録の件数を画面から読む。
 * 記入例に嬢の名前が入っているので、名前の有無では消えたか判定できない。
 * また既存の登録が残っていることもあるので、件数の増減で見る。
 */
async function pastCaseCount(): Promise<number> {
  // React は数値と文字列の境目に <!-- --> を挟むので、先に取り除く。
  const html = (await getPage("/import")).text.replace(/<!--[\s\S]*?-->/g, "");
  const m = html.match(/登録済み[\s\S]{0,120}?(\d+)件/);
  return m ? Number(m[1]) : 0;
}

/**
 * 電話の項目に印が付いているか。
 * React は属性を書いた順に出さない（checked が value より前に来る）ので、
 * input タグ全体を取り出してから見る。
 */
async function phoneChecked(): Promise<boolean> {
  const html = (await getPage("/settings")).text;
  const box = html.match(/<input[^>]*value="phone"[^>]*>/)?.[0] ?? "";
  return box.includes("checked");
}

const PROFILE = `はじめまして、ゆいです♡
業界最高峰のルックスって言われます！
締まりが良い名器と評判なので確かめに来てくださいね♡
VIPサービスもご案内できますので聞いてくださいね♡
アナル舐めは苦手なのでごめんなさい。最近サウナにハマってます。
本日ラスト1枠です、お急ぎください♡`;

/**
 * 用語の申し送りが効いているかを見るための言葉。本文には書かれていない。
 * 画面の記入例にも似た文が出るので、一覧に載ったかどうかは目印で判定する。
 */
const MARK = "ZZ受入テストZZ";
const GLOSSARY = `この店で「VIPサービス」と書いてあるのは中出しのこと ${MARK}`;
const POLICY = `写メ日記の文体から本人が書いているかを見てほしい ${MARK}`;

const PAST_CASE = `広島の店の ひよりさん。プロフィールは名器アピールが強めだったけど、
実際は淫語もいちゃいちゃも上手くて当たりだった。写真も本人だった。満足度5。`;

async function main(): Promise<void> {
  console.log(`\n対象: ${BASE}\n`);

  console.log("[1] ログイン");
  {
    const pin = readPin();
    if (!pin) {
      console.log("  （合言葉なしの設定。ログインは省略）");
    } else {
      const r = await api("/api/login", { password: pin });
      check("正しい合言葉で入れる", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));
    }
  }

  console.log("\n[2] 画面が開く");
  for (const p of ["/", "/history", "/log", "/import", "/lexicon", "/settings", "/health"]) {
    const res = await getPage(p);
    check(`${p} が表示される`, res.status === 200, `HTTP ${res.status}`);
  }

  console.log("\n[3] 過去のお姉さん登録（前回ここで失敗した経路）");
  let importOk = false;
  let pastCaseId = 0;
  {
    const r = await api("/api/import", { text: PAST_CASE });
    check(
      "登録が成功する",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 300),
    );
    if (r.json.ok) {
      importOk = true;
      pastCaseId = r.json.data.id;
      const d = r.json.data;
      check("嬢の名前が読み取れている", Boolean(d.result.girl_name), JSON.stringify(d.result.girl_name));
      check("記憶の確度が入っている", typeof d.result.confidence_in_recall === "number");
      console.log(
        `       → ${d.result.shop_name || "店名不明"} / ${d.result.girl_name} ` +
          `満足度${d.result.outcome.satisfaction} 学習データ${d.evidenceCount}件`,
      );
    }
  }

  // 判定より先に設定する。判定結果に効いているかを [4] で見るため。
  console.log("\n[4] AI への申し送り");
  const addedInstructionIds: string[] = [];
  {
    const idsOf = (html: string) =>
      [...html.matchAll(/name="id" value="(\d+)"/g)].map((m) => m[1]);

    const before = idsOf((await getPage("/settings")).text);

    for (const [kind, text] of [
      ["glossary", GLOSSARY],
      ["policy", POLICY],
    ] as const) {
      const page = (await getPage(`/settings?kind=${kind}`)).text;
      const res = await postForm(`/settings?kind=${kind}`, [
        ["kind", kind],
        ["text", text],
        [actionIdFor(page, "text"), ""],
      ]);
      check(`${kind} を追加できる`, res.status === 303 || res.status === 200, `HTTP ${res.status}`);
    }

    const after = (await getPage("/settings")).text;
    addedInstructionIds.push(...idsOf(after).filter((i) => !before.includes(i)));
    // 件数は削除ボタンの数で見る。本文の出現回数だと、画面に出ている分と
    // React が埋め込む復元用のデータとで二重に数えてしまう。
    check(
      "用語と方針が一覧に出る",
      addedInstructionIds.length === 2 && after.includes(MARK),
      `増えた件数 ${addedInstructionIds.length}`,
    );

    // 電話を外し、外した手段が確認事項に出てこないことを [4] で見る
    const chPage = (await getPage("/settings")).text;
    const keep = ["diary", "review", "profile", "sns", "onsite"];
    const res = await postForm("/settings", [
      ...keep.map((c) => ["channel", c] as [string, string]),
      [actionIdFor(chPage, "channel"), ""],
    ]);
    check("確認手段を保存できる", res.status === 303 || res.status === 200, `HTTP ${res.status}`);

    check("電話のチェックが外れている", !(await phoneChecked()), "電話が有効なままになっている");
  }

  console.log("\n[5] 判定");
  let analysisId = 0;
  {
    const r = await api("/api/analyze", {
      profile: PROFILE,
      shop_name: "受入テスト店",
      girl_name: "ゆい",
      meta_selection: { photo_count: 0, tenure_months: 1, review_count: 0, diary_count_recent: 0 },
      price_yen: "28000",
      duration_min: "90",
    });
    check(
      "判定が成功する",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 300),
    );
    if (r.json.ok) {
      analysisId = r.json.data.id;
      const res = r.json.data.result;
      check("裏読みが返る", res.readings.length >= 3, `${res.readings.length}件`);
      check("確認事項が返る", res.verification_questions.length >= 3);
      check("信頼材料を拾えている", res.readings.some((x: any) => x.stance === "trust"));

      // 用語の申し送りが効いていれば、本文に無い「中出し」の話が出てくるはず
      const body = JSON.stringify(res);
      check(
        "登録した用語の意味で読んでいる",
        body.includes("中出し"),
        "VIPサービスを額面どおりに読んでいる可能性がある",
      );

      // 外した手段を前提にした確認事項が出ていないこと
      const phone = res.verification_questions.filter((q: any) =>
        String(q.question ?? q).includes("電話"),
      );
      check(
        "外した手段（電話）の確認事項が無い",
        phone.length === 0,
        phone.map((q: any) => q.question ?? q).join(" / "),
      );

      console.log(`       → 判定「${res.verdict}」 裏読み${res.readings.length}件`);
    }
  }

  console.log("\n[6] 詳細画面");
  if (analysisId) {
    const res = await getPage(`/analysis/${analysisId}`);
    check("詳細が表示される", res.status === 200, `HTTP ${res.status}`);
  }

  console.log("\n[7] 再レビュー");
  let rereviewId = 0;
  if (analysisId) {
    const r = await api("/api/rereview", {
      analysis_id: analysisId,
      free_note: "電話で確認したところ、サービス内容を具体的に即答してくれた。",
      answers: [],
    });
    check(
      "再レビューが成功する",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 300),
    );
    if (r.json.ok) {
      rereviewId = r.json.data.id;
      const res = r.json.data.result;
      check("2回目として保存される", rereviewId !== analysisId);
      console.log(
        `       → 判定「${res.verdict}」 変化${res.changes.length}件 ` +
          `決着した読み${res.resolved_readings.length}件`,
      );
    }
  }

  console.log("\n[8] 登楼記録と学習");
  if (analysisId) {
    const r = await api("/api/outcome", {
      analysis_id: analysisId,
      visited_at: "2026-08-18",
      // 0.1 刻み。整数に丸められないことを後で確かめる。
      satisfaction: 4.7,
      girl_rating: 4.3,
      service_rating: 4.9,
      price_rating: 3.8,
      photo_match: 2.2,
      review_title: "受入テストの口コミ",
      about_her: "受入テスト・お相手について",
      play_detail: `受入テスト・プレイ内容 ${MARK}`,
      note: "受入テスト",
    });
    check(
      "記録が保存できる",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 300),
    );
    if (r.json.ok) {
      console.log(`       → 学習データ ${r.json.data.evidenceCount} 件を記録`);
    }

    const detail = (await getPage(`/analysis/${analysisId}`)).text;
    check("0.1 刻みが丸められない", detail.includes("4.7"), "総合 4.7 が見当たらない");
    check("口コミタイトルが残る", detail.includes("受入テストの口コミ"));
    check("プレイ内容が残る", detail.includes(MARK), "プレイ内容が保存されていない");
  }

  console.log("\n[9] 登楼記録の一覧と、判定を通していない記録");
  let soloId = 0;
  {
    const list = (await getPage("/log")).text;
    check("/log が開く", list.includes("登楼記録"));
    check("判定に紐づく記録が並ぶ", list.includes("受入テストの口コミ"));

    const r = await api("/api/outcome", {
      shop_name: "受入テスト店（単独）",
      girl_name: `もな${MARK}`,
      visited_at: "2026-08-18",
      satisfaction: 4.7,
      review_title: "判定なしの記録",
      play_detail: "単独記録のプレイ内容",
    });
    check(
      "判定なしでも記録できる",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 200),
    );
    soloId = r.json?.data?.id ?? 0;

    const after = (await getPage("/log")).text;
    check("単独記録が一覧に出る", after.includes("判定なしの記録"));
    check("単独記録の点数も 0.1 刻み", after.includes("4.7"));

    // 名前も店名も無い記録は、後から誰の話か分からなくなる
    const bad = await api("/api/outcome", { satisfaction: 5 });
    check("名前も店名も無いと断られる", bad.json.ok === false, JSON.stringify(bad.json).slice(0, 150));
  }

  console.log("\n[10] 学習が辞書に反映されているか");
  {
    const html = (await getPage("/lexicon")).text;
    const verified = html.match(/実績\s*[\d.]+件/g) ?? [];
    check(
      `辞書に実績が付いた項目がある（${verified.length}件）`,
      importOk ? verified.length > 0 : true,
      "過去登録・実績入力をしても未検証のまま",
    );
  }

  console.log("\n[11] 過去登録の削除と、学習の巻き戻し");
  if (pastCaseId) {
    const before = (await getPage("/lexicon")).text;
    const beforeCount = (before.match(/実績\s*[\d.]+件/g) ?? []).length;
    const listBefore = await pastCaseCount();

    const del = await request("DELETE", "/api/past-case", { id: pastCaseId });
    let delJson: any = null;
    try {
      delJson = JSON.parse(del.text);
    } catch {
      delJson = { raw: del.text.slice(0, 200) };
    }
    check(
      "削除が成功する",
      del.status === 200 && delJson.ok === true,
      delJson.error ?? JSON.stringify(delJson).slice(0, 200),
    );

    const listAfter = await pastCaseCount();
    check(
      "一覧から消えている",
      listAfter === listBefore - 1,
      `削除前${listBefore}件 → 削除後${listAfter}件`,
    );

    const after = (await getPage("/lexicon")).text;
    const afterCount = (after.match(/実績\s*[\d.]+件/g) ?? []).length;
    check(
      "辞書の的中率が計算し直されている",
      afterCount <= beforeCount,
      `削除前${beforeCount}項目 → 削除後${afterCount}項目`,
    );
  }

  console.log("\n[12] Claude に読ませる書き出し");
  {
    const page = await getPage("/export");
    check("/export が開く", page.status === 200, `HTTP ${page.status}`);

    const ctx = await request("GET", "/export/md?scope=context");
    check("Markdown が返る", ctx.status === 200 && ctx.text.includes("# 私の判断基準"), ctx.text.slice(0, 120));
    check("読み手への注意が入っている", ctx.text.includes("この利用者ひとりの実績"));

    if (analysisId) {
      const one = await request("GET", `/export/md?scope=analysis&ids=${analysisId}`);
      check("1人分に判定が入る", one.text.includes("## 総合判定"), one.text.slice(0, 120));
      check("1人分に源氏名が入る", one.text.includes("ゆい"), "嬢の名前が出ていない");

      const anon = await request("GET", `/export/md?scope=analysis&ids=${analysisId}&anon=1`);
      check("伏せると源氏名が消える", !anon.text.includes("ゆい"), "伏せたのに名前が残っている");
      check("伏せても判定は残る", anon.text.includes("## 総合判定"));

      check("書き出しにプレイ内容が載る", one.text.includes(MARK), "プレイ内容が書き出されていない");
      check("書き出しに口コミタイトルが載る", one.text.includes("受入テストの口コミ"));
      check("点数が 0.1 刻みで書き出される", one.text.includes("4.7"), "総合 4.7 が見当たらない");

      const cmp = await request("GET", `/export/md?scope=compare&ids=${analysisId}`);
      check("壁打ち用に基準が前置きされる", cmp.text.indexOf("# 私の判断基準") < cmp.text.indexOf("# 今回の候補"));
    }

    // 保存経路（スマホで Claude に添付するとき）
    const dl = await new Promise<{ status: number; disposition: string; type: string }>((resolve, reject) => {
      const url = new URL(`${BASE}/export/md?scope=lexicon&download=1`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: "GET",
          headers: cookie ? { cookie } : {},
        },
        (res) => {
          res.resume();
          resolve({
            status: res.statusCode ?? 0,
            disposition: String(res.headers["content-disposition"] ?? ""),
            type: String(res.headers["content-type"] ?? ""),
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
    check("ファイルとして保存できる", dl.disposition.includes("attachment"), dl.disposition || "指定なし");
    check("拡張子が md になっている", /\.md"/.test(dl.disposition), dl.disposition);
  }

  // テストが利用者の設定を書き換えたままにしない。
  console.log("\n[13] 申し送りの削除と、設定の復旧");
  {
    for (const id of addedInstructionIds) {
      const page = (await getPage("/settings")).text;
      await postForm("/settings", [
        ["id", id],
        [actionIdFor(page, "id"), ""],
      ]);
    }
    const after = (await getPage("/settings")).text;
    check("申し送りが一覧から消えている", !after.includes(MARK), "消したはずの記録が残っている");

    const page = (await getPage("/settings")).text;
    await postForm("/settings", [
      ...["phone", "diary", "review", "profile", "sns", "onsite"].map(
        (c) => ["channel", c] as [string, string],
      ),
      [actionIdFor(page, "channel"), ""],
    ]);
    check("確認手段が元に戻っている", await phoneChecked(), "電話が無効のままになっている");

    // 単独記録は残しておくと次回の検査で邪魔になる
    if (soloId) {
      const del = await request("DELETE", "/api/outcome", { id: soloId });
      let ok = false;
      try {
        ok = JSON.parse(del.text).ok === true;
      } catch {
        ok = false;
      }
      check("単独記録を削除できる", ok, del.text.slice(0, 150));
      const list = (await getPage("/log")).text;
      check("単独記録が一覧から消える", !list.includes("判定なしの記録"));
    }
  }

  console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
