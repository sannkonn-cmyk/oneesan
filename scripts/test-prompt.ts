/**
 * プロンプト組み立ての単体確認。AI は呼ばないので何度でも走らせてよい。
 *
 *   npm run test:prompt
 *
 * ここで見たいのは「利用者の申し送りが、意図した形で AI に渡るか」。
 * 用語と方針は渡し方が違う（事実 / 要望）ので、混ざっていないことを確かめる。
 */
import { buildAnalyzePrompt } from "../src/lib/prompts";
import type { Settings } from "../src/lib/settings";
import { VERIFY_CHANNELS } from "../src/lib/settings";

let failures = 0;

function check(name: string, cond: boolean, detail = ""): void {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `\n       → ${detail}` : ""}`);
  }
}

const BASE = {
  profile: "はじめまして♡ VIPサービスもやってます。締まりが良いと言われます。",
  meta: { labels: {} },
  hits: [],
  stats: new Map(),
  similar: [],
} as unknown as Parameters<typeof buildAnalyzePrompt>[0];

const GLOSSARY = "この地域の「VIPサービス」は中出しのこと";
const POLICY = "写メ日記の内容を重く見てほしい";

function build(settings: Settings): string {
  return buildAnalyzePrompt({ ...BASE, settings }).system;
}

console.log("\n[1] 確認手段");
{
  const all = build({ channels: VERIFY_CHANNELS.map((c) => c.id), instructions: [] });
  check("全部有効なら全部並ぶ", VERIFY_CHANNELS.every((c) => all.includes(c.label)));
  check("偏らせるなと書いてある", all.includes("偏らせないでください"));

  const noPhone = build({
    channels: VERIFY_CHANNELS.filter((c) => c.id !== "phone").map((c) => c.id),
    instructions: [],
  });
  const [usable, unusable] = noPhone
    .slice(noPhone.indexOf("## 使う確認手段"))
    .split("### 使わない手段");

  check("外した手段は使う側に出ない", !usable.includes("- 電話で聞く"), usable.slice(0, 200));
  check("残した手段は使う側に出る", usable.includes("- 写メ日記を読む"));
  // 黙って一覧から消すだけでは足りない。名指しで禁じないと出してくる
  check("外した手段は名指しで禁じている", (unusable ?? "").includes("- 電話で聞く"));
  check("使わない手段の節が出る", Boolean(unusable));

  const allOn = build({ channels: VERIFY_CHANNELS.map((c) => c.id), instructions: [] });
  check("全部使うなら禁止の節は出ない", !allOn.includes("### 使わない手段"));

  // 一つも選ばれていない状態は、確認事項が作れず道具にならない
  const none = build({ channels: [], instructions: [] });
  check("全部外したら全部有効として扱う", VERIFY_CHANNELS.every((c) => none.includes(c.label)));
}

console.log("\n[2] 用語と方針の渡し分け");
{
  const s = build({
    channels: VERIFY_CHANNELS.map((c) => c.id),
    instructions: [
      { id: 1, kind: "glossary", text: GLOSSARY },
      { id: 2, kind: "policy", text: POLICY },
    ],
  });

  check("用語がそのままの言葉で載る", s.includes(GLOSSARY));
  check("方針がそのままの言葉で載る", s.includes(POLICY));

  const gAt = s.indexOf(GLOSSARY);
  const pAt = s.indexOf(POLICY);
  const gHead = s.indexOf("## この界隈での言い回し");
  const pHead = s.indexOf("## 利用者からの指示");

  check("見出しが両方ある", gHead > 0 && pHead > 0);
  check("用語は言い回しの見出しの下にある", gAt > gHead && gAt < pHead, `${gHead}/${gAt}/${pHead}`);
  check("方針は指示の見出しの下にある", pAt > pHead);

  // 用語を「尊重してください」の枠に入れると、事実ではなく忖度として扱われる
  const respectAt = s.indexOf("出力の方針として尊重");
  check("尊重の指示は方針側にだけ掛かる", respectAt > gAt, `尊重${respectAt} / 用語${gAt}`);
}

console.log("\n[3] 何も設定していないとき");
{
  const s = build({ channels: VERIFY_CHANNELS.map((c) => c.id), instructions: [] });
  check("言い回しの見出しは出ない", !s.includes("## この界隈での言い回し"));
  check("指示の見出しは出ない", !s.includes("## 利用者からの指示"));
  check("確認手段は常に出る", s.includes("## 使う確認手段"));
}

console.log(failures === 0 ? "\n全て成功しました。\n" : `\n${failures} 件失敗しました。\n`);
process.exit(failures === 0 ? 0 : 1);
