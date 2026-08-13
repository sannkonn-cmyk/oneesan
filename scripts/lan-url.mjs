/**
 * スマホから開くための URL を表示する。
 * IP アドレスを自分で調べさせないのが目的。
 * OS ごとのコマンドの違いを避けるため Node の API で取得する。
 */
import os from "node:os";

const PORT = process.env.PORT ?? "3000";

/** 家庭内 LAN でよく使われる範囲を優先して並べる。 */
function rank(ip) {
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

const addresses = Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).map((i) => ({ ...i, name })))
  .filter((i) => i.family === "IPv4" && !i.internal)
  // 仮想ネットワークは家のWi-Fiではないので後ろに回す
  .filter((i) => !/^(docker|br-|veth|vbox|vmnet|utun|tun|tap)/i.test(i.name))
  .sort((a, b) => rank(a.address) - rank(b.address));

const line = (s) => console.log(`  ${s}`);

console.log("");
line("=".repeat(46));
line("");
line("  この PC で開く");
line(`    http://localhost:${PORT}`);
line("");

if (addresses.length === 0) {
  line("  スマホから開く");
  line("    ネットワークが見つかりませんでした。");
  line("    Wi-Fi に接続してから起動し直してください。");
} else {
  line("  スマホから開く（同じ Wi-Fi につないでください）");
  for (const a of addresses.slice(0, 3)) {
    line(`    http://${a.address}:${PORT}   [${a.name}]`);
  }
  if (addresses.length > 1) {
    line("");
    line("    ※ 複数ある場合は上から順に試してください");
  }
}

line("");
line("  止めるときは  Ctrl + C");
line("");
line("=".repeat(46));
console.log("");
