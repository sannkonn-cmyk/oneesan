/**
 * 構造情報の入力定義。
 *
 * 辞書側は「1枚以下」「5枚以上」「3ヶ月以上」といった大まかな閾値でしか
 * この値を使っていない。正確な数値を入力させる意味は無いので、
 * 閾値の境界にぴったり合うバケットを選ばせて、代表値に変換する。
 * これで数値キーボードを開かずに1タップで済む。
 *
 * バケットの境界は辞書の meta 条件と一致させること。ずれると
 * 「2〜3ヶ月」のような、どちらの条件にも入りうる曖昧な選択肢ができてしまう。
 */

export interface MetaOption {
  label: string;
  /** undefined は「不明」。false（該当しない）とは区別される。 */
  value: number | boolean | undefined;
}

export interface MetaField {
  key: string;
  label: string;
  hint?: string;
  options: MetaOption[];
}

const UNKNOWN: MetaOption = { label: "不明", value: undefined };

export const META_FIELDS: MetaField[] = [
  {
    key: "photo_count",
    label: "写真",
    // 辞書の閾値: <=1 で photo_single / >=5 で photo_rich
    options: [
      { label: "1枚だけ", value: 1 },
      { label: "2〜4枚", value: 3 },
      { label: "5枚以上", value: 6 },
      UNKNOWN,
    ],
  },
  {
    key: "tenure_months",
    label: "在籍期間",
    // 辞書の閾値: <=2 で new_but_top_ranked / >=3 で long_running_newbie / >=12 で long_tenure
    options: [
      { label: "〜2ヶ月", value: 2 },
      { label: "3ヶ月〜1年", value: 6 },
      { label: "1年以上", value: 18 },
      UNKNOWN,
    ],
  },
  {
    key: "review_count",
    label: "口コミ",
    // 辞書の閾値: <=2 で few_reviews
    options: [
      { label: "0〜2件", value: 1 },
      { label: "3件以上", value: 10 },
      UNKNOWN,
    ],
  },
  {
    key: "diary_count_recent",
    label: "写メ日記",
    hint: "直近2週間",
    // 辞書の閾値: ==0 で no_recent_diary / >=3 で diary_active
    options: [
      { label: "なし", value: 0 },
      { label: "1〜2件", value: 2 },
      { label: "3件以上", value: 5 },
      UNKNOWN,
    ],
  },
  {
    key: "has_face_photo",
    label: "顔出し",
    options: [
      { label: "あり", value: true },
      { label: "なし", value: false },
      UNKNOWN,
    ],
  },
  {
    key: "sizes_disclosed",
    label: "3サイズ",
    options: [
      { label: "公開", value: true },
      { label: "非公開", value: false },
      UNKNOWN,
    ],
  },
];

/**
 * コース時間の選択肢。20分から180分まで10分刻み。
 * 店ごとにコース設定がまちまちなので、代表的な数字だけ並べても
 * 「近いものが無い」状態になりやすい。刻みを細かくして必ず一致させる。
 */
export const DURATION_OPTIONS = Array.from({ length: 17 }, (_, i) => 20 + i * 10);

/** 料金入力の刻み。円単位で上下させても意味が無いので千円単位にする。 */
export const PRICE_STEP = 1000;

/**
 * フォームの選択（バケットの index）を、辞書が読む数値と
 * 人間向けラベルの両方に展開する。
 * ラベルはプロンプトに載せる。代表値をそのまま見せると
 * 「写真がちょうど3枚」と誤解されるため。
 */
export function expandMetaSelection(
  selection: Record<string, number | undefined>,
): { values: Record<string, number | boolean>; labels: Record<string, string> } {
  const values: Record<string, number | boolean> = {};
  const labels: Record<string, string> = {};

  for (const field of META_FIELDS) {
    const idx = selection[field.key];
    if (idx === undefined || idx < 0 || idx >= field.options.length) continue;
    const opt = field.options[idx];
    if (opt.value === undefined) continue; // 不明はキーごと入れない
    values[field.key] = opt.value;
    labels[field.key] = opt.label;
  }
  return { values, labels };
}

/** 総額とコース時間から時間あたり単価を出す。比較の土台を揃えるため。 */
export function pricePerHour(priceYen?: number, durationMin?: number): number | undefined {
  if (!priceYen || !durationMin) return undefined;
  return Math.round((priceYen / durationMin) * 60);
}
