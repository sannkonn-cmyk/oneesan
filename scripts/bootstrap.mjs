/**
 * 起動前の下ごしらえ。
 * .env.local が無ければ作り、合言葉を自動発行する。
 * 手で設定ファイルを書かせないのが目的。
 */
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const examplePath = path.join(root, ".env.example");

if (fs.existsSync(envPath)) {
  process.exit(0);
}

// スマホで打つので数字6桁。自宅のWi-Fi内で使う前提の強度。
// 外から繋げるようにするときは必ず長い文字列に変えること。
const pin = String(randomInt(100000, 1000000));

let body = fs.existsSync(examplePath)
  ? fs.readFileSync(examplePath, "utf8")
  : "APP_PASSWORD=\nLLM_PROVIDER=claude-code\nLLM_MODEL=claude-opus-5\nLLM_EFFORT=high\nDATABASE_PATH=./data/oneesan.db\n";

body = body.replace(/^APP_PASSWORD=.*$/m, `APP_PASSWORD=${pin}`);
fs.writeFileSync(envPath, body);

// 罫線素片はコマンドプロンプトの既定フォントで化けるため、記号は ASCII に留める。
console.log("");
console.log("  ================================");
console.log(`     合言葉は  ${pin}  です`);
console.log("  ================================");
console.log("");
console.log("  設定ファイル .env.local を作りました。");
console.log("  この合言葉は、ブラウザとスマホで最初に一度だけ聞かれます。");
console.log("  忘れたら .env.local の APP_PASSWORD を見てください。");
console.log("");
