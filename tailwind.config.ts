import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 夜に片手で使う道具。地は青寄りの黒、アクセントは湯気のティール。
        // 内容は生温かい世界だが、道具の側は醒めている、という対比。
        ink: "#0b0f14",
        panel: "#141a23",
        panel2: "#1a222d",
        edge: "#25303d",
        edgesoft: "#1e2731",
        muted: "#8496aa", // 青寄りに振ったグレー
        dim: "#5d6d80",
        accent: "#63b3ad",
        accentdim: "#2f5f5d",
        // 判定色はアクセントと分離する
        good: "#4fb286",
        warn: "#d9a441",
        bad: "#d9615a",
      },
      fontFamily: {
        sans: [
          "Hiragino Kaku Gothic ProN",
          "Hiragino Sans",
          "Yu Gothic",
          "Noto Sans JP",
          "system-ui",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SF Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
