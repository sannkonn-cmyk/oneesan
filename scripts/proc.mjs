import { spawnSync } from "node:child_process";

/**
 * 子プロセスの起動をひとまとめにする。
 *
 * **shell: true と引数配列を同時に使わない**のが要点。
 * この組み合わせは Node が非推奨の警告を出す（DEP0190）。引数が
 * 引用符で囲まれず、そのまま連結されてコマンド行になるためで、
 * 利用者の画面に毎回警告が出るうえ、空白を含むパスで実際に壊れる。
 *
 * そこで用途を2つに分ける。
 *   sh()   … 固定の文字列だけを、シェル経由で流す（探索用）
 *   exec() … 実行ファイルの絶対パスに、引数を配列で渡す（実行用）
 */

/**
 * 固定のコマンド行をシェルで実行する。
 * **利用者の入力を混ぜてはいけない。** 探索（where / npm root -g）専用。
 * shell オプションを使わず、シェル自体を明示的に起動して警告を避ける。
 */
export function sh(commandLine, opts = {}) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", commandLine]]
      : ["/bin/sh", ["-c", commandLine]];
  return spawnSync(cmd, args, { encoding: "utf8", shell: false, ...opts });
}

/** 実行ファイルを直接起動する。引数は配列のまま渡るので引用符の心配が無い。 */
export function exec(file, args = [], opts = {}) {
  return spawnSync(file, args, { encoding: "utf8", shell: false, ...opts });
}
