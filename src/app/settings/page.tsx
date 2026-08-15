import { revalidatePath } from "next/cache";
import {
  KIND_LABEL,
  VERIFY_CHANNELS,
  addInstruction,
  deleteInstruction,
  getSettings,
  saveChannels,
  type InstructionKind,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * AI への申し送り。
 *
 * 判定は毎回まっさらな状態から始まるので、利用者が持っている知識
 * （店ごとの言い回し、自分の好み）は、ここに置かないと毎回失われる。
 * 過去登録と同じく「1件ずつ足して、一覧から消す」形にしてある。
 *
 * 画面側の処理を使わず、素の form 送信（サーバーアクション）で作ってある。
 * AI を呼ばないので必要が無いのと、JavaScript が届かない端末でも触れるようにするため。
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; e?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  // 追加後も同じ種別で書き続けられるよう、選んだ種別を URL に持たせる
  const kind: InstructionKind = params.kind === "policy" ? "policy" : "glossary";

  const glossary = settings.instructions.filter((i) => i.kind === "glossary");
  const policy = settings.instructions.filter((i) => i.kind === "policy");

  async function saveChannelsAction(formData: FormData) {
    "use server";
    saveChannels(formData.getAll("channel").map(String));
    revalidatePath("/settings");
  }

  async function addAction(formData: FormData) {
    "use server";
    const k: InstructionKind = formData.get("kind") === "policy" ? "policy" : "glossary";
    const text = String(formData.get("text") ?? "").trim();
    if (text.length < 2) return;
    addInstruction(k, text);
    revalidatePath("/settings");
  }

  async function deleteAction(formData: FormData) {
    "use server";
    deleteInstruction(Number(formData.get("id")));
    revalidatePath("/settings");
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="sect">確認手段</h2>
        <form action={saveChannelsAction} className="card space-y-3">
          <p className="hint">
            使う手段にチェックを入れてください。ここで選んだ手段の中から、
            AI が偏らないように確認事項を作ります。
          </p>

          {VERIFY_CHANNELS.map((c) => (
            <label key={c.id} className="flex items-start gap-2.5 text-[13px]">
              <input
                type="checkbox"
                name="channel"
                value={c.id}
                defaultChecked={settings.channels.includes(c.id)}
                className="mt-0.5"
              />
              <span>
                {c.label}
                <span className="block text-[11.5px] text-dim">{c.hint}</span>
              </span>
            </label>
          ))}

          <button className="btn-primary" type="submit">
            保存する
          </button>
          <p className="hint">
            すべて外すと確認事項が作れなくなるので、その場合は全部有効として扱います。
          </p>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="sect">AI への申し送り</h2>

        <form action={addAction} className="card space-y-3">
          <input type="hidden" name="kind" value={kind} />

          <div className="flex gap-1.5">
            {(["glossary", "policy"] as const).map((k) => (
              <a
                key={k}
                href={`/settings?kind=${k}`}
                className={`bucket flex-1 text-center ${kind === k ? "bucket-on" : ""}`}
              >
                {KIND_LABEL[k]}
              </a>
            ))}
          </div>

          <p className="hint">
            {kind === "glossary"
              ? "店や地域の言い回しを教えます。AI は「そう書いてある事実」として読みます。ここが一番効きます。"
              : "自分の事情や好みを伝えます。AI は「そうしてほしい要望」として扱います。"}
          </p>

          <textarea
            name="text"
            className="input"
            rows={3}
            placeholder={
              kind === "glossary"
                ? "例）この地域の「VIPサービス」は中出しのこと"
                : "例）写メ日記の内容を重く見てほしい。文章の癖から本人かどうかを判断したい"
            }
          />

          <button className="btn-primary" type="submit">
            追加する
          </button>
        </form>

        {[
          { k: "glossary" as const, items: glossary },
          { k: "policy" as const, items: policy },
        ].map(({ k, items }) =>
          items.length ? (
            <div key={k} className="space-y-2">
              <h3 className="sect">
                {KIND_LABEL[k]} <span className="num font-normal text-dim">{items.length}件</span>
              </h3>
              <div className="card space-y-3">
                {items.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-start justify-between gap-3 border-t border-edgesoft pt-3 first:border-t-0 first:pt-0"
                  >
                    <p className="min-w-0 flex-1 text-[13px] leading-relaxed">{i.text}</p>
                    <form action={deleteAction} className="shrink-0">
                      <input type="hidden" name="id" value={i.id} />
                      <button type="submit" className="text-[11px] text-dim hover:text-bad">
                        削除
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null,
        )}

        <p className="hint">
          ここに書いたことは、判定と再レビューのたびに毎回 AI へ渡されます。
          増えるほど入力が長くなるので、効かなくなった項目は消してください。
        </p>
        <p className="hint">
          「この表現が出たらこれを疑え」という<strong>仮説</strong>は、辞書
          （<span className="num">lexicon.yaml</span>）側に書きます。
          そちらは当たり外れが記録されて的中率が育ちます。
          用語の読み替えには当たり外れが無いので、こちらに書いてください。
        </p>
      </section>
    </div>
  );
}
