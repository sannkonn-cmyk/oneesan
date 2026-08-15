/**
 * スマホから開くための URL を表示する。
 * IP アドレスを自分で調べさせないのが目的。
 * OS ごとのコマンドの違いを避けるため Node の API で取得する。
 */
import { PORT, addresses } from "./net-info.mjs";

const list = addresses();
const line = (s) => console.log(`  ${s}`);

console.log("");
line("=".repeat(46));
line("");
line("  この PC で開く");
line(`    http://localhost:${PORT}`);
line("");

if (list.length === 0) {
  line("  スマホから開く");
  line("    ネットワークが見つかりませんでした。");
  line("    Wi-Fi に接続してから起動し直してください。");
} else {
  line("  スマホから開く（PC と同じルーターにつないでください）");
  for (const a of list.slice(0, 3)) {
    line(`    http://${a.address}:${PORT}   [${a.name}]${a.vpn ? "  ← VPN 用" : ""}`);
  }
  if (list.length > 1) {
    line("");
    line("    ※ 複数ある場合は上から順に試してください");
  }
  line("");
  line("  開けないときは");
  if (process.platform === "win32") {
    line("    network-fix.bat を右クリック →「管理者として実行」");
    line("    Windows の防火壁がスマホからの接続を止めているのが");
    line("    いちばん多い原因です。");
  } else {
    line("    npm run net:check で原因を調べられます");
  }
}

line("");
line("  止めるときは  Ctrl + C");
line("");
line("=".repeat(46));
console.log("");
