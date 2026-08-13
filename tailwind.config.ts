import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d10",
        panel: "#14181d",
        edge: "#242b33",
        muted: "#8b98a5",
        accent: "#e0a458",
        good: "#5fb37a",
        warn: "#d9a441",
        bad: "#cf6b5c",
      },
    },
  },
  plugins: [],
} satisfies Config;
