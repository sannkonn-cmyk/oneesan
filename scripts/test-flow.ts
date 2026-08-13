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

const PROFILE = `はじめまして、ゆいです♡
業界最高峰のルックスって言われます！
締まりが良い名器と評判なので確かめに来てくださいね♡
アナル舐めは苦手なのでごめんなさい。最近サウナにハマってます。
本日ラスト1枠です、お急ぎください♡`;

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
  for (const p of ["/", "/history", "/import", "/lexicon"]) {
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

  console.log("\n[4] 判定");
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
      console.log(`       → 判定「${res.verdict}」 裏読み${res.readings.length}件`);
    }
  }

  console.log("\n[5] 詳細画面");
  if (analysisId) {
    const res = await getPage(`/analysis/${analysisId}`);
    check("詳細が表示される", res.status === 200, `HTTP ${res.status}`);
  }

  console.log("\n[6] 再レビュー");
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

  console.log("\n[7] 登楼実績の記録と学習");
  if (analysisId) {
    const r = await api("/api/outcome", {
      analysis_id: analysisId,
      satisfaction: 5,
      service_rating: 5,
      photo_match: 2,
      attitude_rating: 4,
      note: "受入テスト",
    });
    check(
      "実績が保存できる",
      r.status === 200 && r.json.ok === true,
      r.json.error ?? JSON.stringify(r.json).slice(0, 300),
    );
    if (r.json.ok) {
      console.log(`       → 学習データ ${r.json.data.evidenceCount} 件を記録`);
    }
  }

  console.log("\n[8] 学習が辞書に反映されているか");
  {
    const html = (await getPage("/lexicon")).text;
    const verified = html.match(/実績\s*[\d.]+件/g) ?? [];
    check(
      `辞書に実績が付いた項目がある（${verified.length}件）`,
      importOk ? verified.length > 0 : true,
      "過去登録・実績入力をしても未検証のまま",
    );
  }

  console.log("\n[9] 過去登録の削除と、学習の巻き戻し");
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

  console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
