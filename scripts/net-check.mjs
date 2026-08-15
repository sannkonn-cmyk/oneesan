/**
 * スマホから開けないときの点検。
 *
 *   network-fix.bat / network-fix.command から呼ばれる（npm run net:check でも可）
 *
 * 原因は毎回だいたい決まっている。多い順に、
 *   1. Windows の防火壁が外からの接続を止めている
 *   2. ネットワークの種類が「パブリック」になっている（この場合 1 の許可も効かない）
 *   3. スマホと PC が別のネットワークにいる
 *   4. ルーターの端末間通信が禁止されている（プライバシーセパレータ）
 * 順番に潰せるように、分かるところは自動で見て、残りは確認手順を出す。
 */
import net from "node:net";
import { spawnSync } from "node:child_process";
import { PORT, addresses, lanAddresses } from "./net-info.mjs";

/** network-fix.bat が付ける規則の名前。変えるときは両方直すこと。 */
const RULE_NAME = "Oneesan (port 3000)";

const line = (s = "") => console.log(`  ${s}`);
const win = process.platform === "win32";

/** アプリが動いているか。動いていなければ、その先を調べても意味が無い。 */
function listening() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port: Number(PORT) });
    const done = (v) => {
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(1500);
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
  });
}

/** 防火壁に許可が入っているか。 */
function hasFirewallRule() {
  if (!win) return null;
  const byName = spawnSync(
    "netsh",
    ["advfirewall", "firewall", "show", "rule", `name=${RULE_NAME}`],
    { encoding: "utf8" },
  );
  if (byName.status === 0) return true;

  // 名前での問い合わせは引用符の扱いで空振りすることがあるので、
  // 見つからなかったときは全件から探し直す。表示は環境の言語に左右されるが、
  // 規則の名前は自分で付けたものなので、これは言語に依らない。
  const all = spawnSync("netsh", ["advfirewall", "firewall", "show", "rule", "name=all", "dir=in"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return String(all.stdout ?? "").includes("Oneesan");
}

/**
 * ネットワークの種類。
 * 「パブリック」だと、家庭内向けの許可が効かず外から一切繋がらない。
 */
function networkCategories() {
  if (!win) return [];
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      // 日本語のインターフェイス名が文字化けしないよう、出力を UTF-8 に揃える
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
        "Get-NetConnectionProfile | ForEach-Object { $_.InterfaceAlias + '=' + $_.NetworkCategory }",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) return [];
  return String(r.stdout)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.lastIndexOf("=");
      return { name: s.slice(0, i), category: s.slice(i + 1) };
    });
}

async function main() {
  console.log("");
  line("=".repeat(46));
  line("");
  line("  スマホから開けないときの点検");
  line("");

  // 1. アプリが動いているか
  const up = await listening();
  line(up ? `  [OK]  アプリは動いています（ポート ${PORT}）` : "  [NG]  アプリが動いていません");
  if (!up) {
    line("");
    line("    先に start.bat / start.command で起動してから、");
    line("    もう一度この点検を実行してください。");
    line("");
    line("=".repeat(46));
    console.log("");
    return;
  }

  // 2. 防火壁
  const rule = hasFirewallRule();
  if (rule === true) line("  [OK]  防火壁に許可が入っています");
  else if (rule === false) line("  [NG]  防火壁に許可がありません");

  // 3. ネットワークの種類
  const cats = networkCategories();
  const publicOnes = cats.filter((c) => c.category === "Public");
  if (cats.length) {
    if (publicOnes.length === cats.length) {
      line("  [NG]  ネットワークの種類が「パブリック」です");
    } else if (publicOnes.length) {
      line("  [--]  一部のネットワークが「パブリック」です");
    } else {
      line("  [OK]  ネットワークの種類は「プライベート」です");
    }
  }

  const lan = lanAddresses();
  line("");
  line("  スマホで開く宛先");
  if (lan.length === 0) {
    line("    家庭内 LAN の住所が見つかりませんでした。");
    const vpn = addresses();
    for (const a of vpn) line(`    http://${a.address}:${PORT}   [${a.name}]`);
  } else {
    for (const a of lan) line(`    http://${a.address}:${PORT}   [${a.name}]`);
  }

  // 直せるものが残っていれば、それを最優先で出す
  if (rule === false || publicOnes.length) {
    line("");
    line("  やること");
    if (publicOnes.length) {
      line("");
      line("   1) ネットワークを「プライベート」に変える");
      line("      設定 → ネットワークとインターネット → イーサネット");
      line("      →「ネットワーク プロファイルの種類」を");
      line("        「プライベート ネットワーク」に変更");
      for (const c of publicOnes) line(`        （対象: ${c.name}）`);
      line("");
      line("      家のネットワークなら、これが正しい設定です。");
      line("      パブリックは「外のフリー Wi-Fi 用」の意味です。");
    }
    if (rule === false) {
      line("");
      line(`   ${publicOnes.length ? "2" : "1"}) network-fix.bat を右クリック →「管理者として実行」`);
      line("      ポート 3000 への接続を許可します。");
    }
  } else {
    line("");
    line("  PC 側の設定は問題ありません。それでも開けない場合は、");
    line("");
    line("   1) スマホの IP アドレスを見る");
    line("      Wi-Fi 設定 → 接続中のネットワーク → IP アドレス");
    if (lan[0]) {
      const prefix = lan[0].address.split(".").slice(0, 3).join(".");
      line(`      → ${prefix}.◯◯ になっていますか？`);
      line("        違う番号なら、PC とスマホが別のネットワークにいます。");
      line("        （中継機やゲスト用 Wi-Fi につないでいませんか）");
    }
    line("");
    line("   2) ルーターの「プライバシーセパレータ」を切る");
    line("      端末どうしの通信を禁止する設定です。");
    line("      入っていると、何をしても繋がりません。");
    line("");
    line("   3) スマホの VPN を切る");
    line("      通信が家の外へ回されて、PC に届きません。");
  }

  line("");
  line("  PC が有線でスマホが Wi-Fi でも、同じルーターなら繋がります。");
  line("  有線であること自体は原因になりません。");
  line("");
  line("=".repeat(46));
  console.log("");
}

void main();
