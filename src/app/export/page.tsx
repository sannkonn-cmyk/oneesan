import Link from "next/link";
import { CopyBox } from "@/components/CopyBox";
import {
  EXPORT_SCOPES,
  SCOPE_HINT,
  SCOPE_LABEL,
  buildMarkdown,
  type ExportScope,
} from "@/lib/markdown";
import { listHistory } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** 嬢を選ぶ必要がある単位。 */
const NEEDS_IDS: ExportScope[] = ["analysis", "compare"];

/**
 * Claude に読ませるための書き出し。
 *
 * スマホの Claude アプリに渡すのが主な用途。設定を一切必要としない経路として、
 * 「画面に出して選択・コピー」と「ファイルで保存して添付」の2つを用意する。
 *
 * 画面は素の GET フォームで作ってある（JavaScript が要るのはコピーボタンだけ）。
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; ids?: string | string[]; anon?: string }>;
}) {
  const params = await searchParams;
  const scope: ExportScope = EXPORT_SCOPES.includes(params.scope as ExportScope)
    ? (params.scope as ExportScope)
    : "context";
  const anon = params.anon === "1";

  const rawIds = Array.isArray(params.ids) ? params.ids : params.ids ? [params.ids] : [];
  const ids = rawIds
    .flatMap((s) => s.split(","))
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const history = listHistory(50);
  const markdown = buildMarkdown(scope, ids, { anonymize: anon });

  const query = new URLSearchParams({ scope, ...(anon ? { anon: "1" } : {}) });
  if (ids.length) query.set("ids", ids.join(","));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="sect">Claude に読ませる</h2>
        <p className="hint">
          溜まったデータを Markdown で書き出します。Claude に貼り付けるか、
          ファイルで保存して添付してください。
        </p>
        <p className="hint">
          貼り付けた内容は Anthropic に送られます。店名と源氏名を伏せたい場合は、
          下の「名前を伏せる」を使ってください。
        </p>

        <form action="/export" method="get" className="card space-y-4">
          <div className="space-y-2">
            <p className="label">何を出すか</p>
            {EXPORT_SCOPES.map((s) => (
              <label key={s} className="flex items-start gap-2.5 text-[13px]">
                <input
                  type="radio"
                  name="scope"
                  value={s}
                  defaultChecked={s === scope}
                  className="mt-0.5"
                />
                <span>
                  {SCOPE_LABEL[s]}
                  <span className="block text-[11.5px] text-dim">{SCOPE_HINT[s]}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2.5 border-t border-edgesoft pt-3 text-[13px]">
            <input type="checkbox" name="anon" value="1" defaultChecked={anon} className="mt-0.5" />
            <span>
              名前を伏せる
              <span className="block text-[11.5px] text-dim">
                店名を「店1」、源氏名を「嬢A」に置き換えます。本文中に出てくる名前も
                まとめて置き換えます。
              </span>
            </span>
          </label>

          {history.length > 0 && (
            <div className="space-y-2 border-t border-edgesoft pt-3">
              <p className="label">誰を出すか</p>
              <p className="hint">
                「1人分」と「候補を並べて」のときだけ使います。1人分は最初の1人だけ出します。
              </p>
              {history.map((h) => (
                <label key={h.rootId} className="flex items-start gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    name="ids"
                    value={h.latestId}
                    defaultChecked={ids.includes(h.latestId)}
                    className="mt-0.5"
                  />
                  <span>
                    {h.girlName || "名前未入力"}
                    <span className="ml-1.5 text-[11.5px] text-dim">
                      {h.shopName || "店名未入力"}
                    </span>
                    {/* 同じ嬢を何度も判定していると見分けが付かないので日時を出す */}
                    <span className="num block text-[10.5px] text-dim">
                      {h.createdAt.slice(0, 16).replace("T", " ")} / {h.verdict}
                      {h.satisfaction != null && ` / 満足度${h.satisfaction}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <button className="btn-primary" type="submit">
            作り直す
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="sect">
          {SCOPE_LABEL[scope]}
          {NEEDS_IDS.includes(scope) && ids.length > 0 && (
            <span className="num ml-1.5 font-normal text-dim">{ids.length}人</span>
          )}
        </h2>

        {NEEDS_IDS.includes(scope) && ids.length === 0 && (
          <p className="hint">上の「誰を出すか」で選んでから「作り直す」を押してください。</p>
        )}

        <CopyBox text={markdown} />

        <a className="btn-ghost" href={`/export/md?${query}&download=1`}>
          ファイルで保存する
        </a>
        <a className="hint block text-center underline" href={`/export/md?${query}`}>
          別の画面で開く（PC で全選択するとき）
        </a>
      </section>

      <section className="card space-y-2">
        <p className="label">Claude への渡し方</p>
        <p className="hint">
          <strong>スマホのアプリ</strong>
          <br />
          コピーして入力欄に貼り付ける。うまくいかなければ「ファイルで保存」して添付。
        </p>
        <p className="hint">
          <strong>PC の Claude Desktop</strong>
          <br />
          コピーして入力欄に貼り付ける。または「ファイルで保存」して、
          ダウンロードフォルダにできた <span className="num">.md</span> を
          入力欄に<strong>ドラッグして落とす</strong>。
        </p>
        <p className="hint">
          長い場合は「1人分」や「私の判断基準だけ」に分けて渡すと通ります。
        </p>
      </section>

      <Link href="/history" className="hint block text-center underline">
        履歴に戻る
      </Link>
    </div>
  );
}
