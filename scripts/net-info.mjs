/**
 * スマホから開くための宛先を割り出す共通部分。
 * lan-url.mjs（起動時の案内）と net-check.mjs（繋がらないときの点検）で使う。
 */
import os from "node:os";

export const PORT = process.env.PORT ?? "3000";

/**
 * 100.64.0.0/10 は Tailscale などが使う範囲。
 * 家の Wi-Fi では届かないので、家庭内 LAN と混ぜない。
 */
function isTailscaleRange(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

/** 家庭内 LAN でよく使われる範囲を優先して並べる。 */
function rank(ip) {
  if (isTailscaleRange(ip)) return 8;
  if (ip.startsWith("192.168.")) return 0;
  if (ip.startsWith("10.")) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
  return 3;
}

/** 家のネットワークで使えそうな IPv4 を、確からしい順に返す。 */
export function addresses() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list ?? []).map((i) => ({ ...i, name })))
    .filter((i) => i.family === "IPv4" && !i.internal)
    // 仮想ネットワークは家の Wi-Fi ではないので後ろに回す
    .filter((i) => !/^(docker|br-|veth|vbox|vmnet|utun|tun|tap)/i.test(i.name))
    .map((i) => ({ ...i, vpn: isTailscaleRange(i.address) }))
    .sort((a, b) => rank(a.address) - rank(b.address));
}

/** 家庭内 LAN と思われるものだけ。 */
export function lanAddresses() {
  return addresses().filter((a) => !a.vpn);
}
