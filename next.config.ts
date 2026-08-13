import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 はネイティブモジュールなので Next のバンドル対象から外す。
  // これを外すと `Module did not self-register` 系の実行時エラーになる。
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
