"use client";

/**
 * 1.0〜5.0 を 0.1 刻みで入れる。
 *
 * 0.1 刻みは 41 段階あるので、これまでのボタンの並びでは表せない。
 * かといって数字を打たせると数値キーボードが開く。このアプリは
 * 「タップだけで入る」ことを通してきたので、そこは崩さない。
 *
 * 指で大まかに合わせて、±0.1 で詰める。値は大きく出す。
 *
 * **空（未入力）と 1.0 は別物として扱う。** 分からないものを最低評価に
 * すると、辞書の的中率に嘘が混ざる。空のままにできる作りにしてある。
 */
export function ScoreSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const set = (v: number) => onChange(Math.round(Math.min(5, Math.max(1, v)) * 10) / 10);
  const on = value > 0;

  return (
    <div className="border-t border-edgesoft pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[12.5px] text-muted">
          {label}
          {hint && <span className="ml-1.5 text-[11px] text-dim">{hint}</span>}
        </p>
        {on ? (
          <span className="num text-[17px] font-bold text-accent">{value.toFixed(1)}</span>
        ) : (
          <span className="text-[11px] text-dim">未入力</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="bucket num w-11 shrink-0"
          onClick={() => set((on ? value : 3) - 0.1)}
          aria-label={`${label}を0.1下げる`}
        >
          −
        </button>

        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={on ? value : 3}
          onChange={(e) => set(Number(e.target.value))}
          className="h-9 flex-1 accent-[#5eead4]"
          aria-label={label}
        />

        <button
          type="button"
          className="bucket num w-11 shrink-0"
          onClick={() => set((on ? value : 3) + 0.1)}
          aria-label={`${label}を0.1上げる`}
        >
          ＋
        </button>
      </div>

      {on && (
        <button
          type="button"
          className="mt-1 text-[10.5px] text-dim underline hover:text-bad"
          onClick={() => onChange(0)}
        >
          未入力に戻す
        </button>
      )}
    </div>
  );
}
