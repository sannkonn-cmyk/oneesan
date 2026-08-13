"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Page() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "ログインに失敗しました。");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-16 max-w-xs space-y-3">
      <div className="card space-y-3">
        <label className="label" htmlFor="pw">
          合言葉
        </label>
        <input
          id="pw"
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="text-sm text-bad">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? "確認中…" : "開く"}
        </button>
      </div>
      <p className="hint text-center">.env.local の APP_PASSWORD に設定した文字列です</p>
    </form>
  );
}
