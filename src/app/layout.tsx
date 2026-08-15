import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "お姉さん投資判定",
  description: "プロフィールを穿って読む自分専用の判定ツール",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0d10",
};

const NAV = [
  { href: "/", label: "判定" },
  { href: "/history", label: "履歴" },
  { href: "/import", label: "過去登録" },
  { href: "/lexicon", label: "辞書" },
  { href: "/settings", label: "設定" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
          <header className="mb-5 flex items-center justify-between">
            <Link href="/" className="text-sm font-bold tracking-wide text-accent">
              お姉さん投資判定
            </Link>
            <nav className="flex gap-1 text-xs">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-2 py-1 text-muted hover:bg-edge/60 hover:text-slate-100"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
