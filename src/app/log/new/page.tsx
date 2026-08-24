import Link from "next/link";
import { OutcomeForm } from "@/components/OutcomeForm";

export const dynamic = "force-dynamic";

/** 判定を通していない相手の記録。行ったのに残せない、を無くすための入口。 */
export default function Page() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-sm font-bold text-accent">記録を書く</h1>
        <p className="hint mt-1">
          事前に判定していない相手の記録です。読みが無いので辞書の的中率には
          反映されませんが、記録としては残り、Claude への書き出しにも載ります。
        </p>
      </header>

      <OutcomeForm analysisId={0} solo />

      <Link href="/log" className="hint block text-center underline">
        記録の一覧に戻る
      </Link>
    </div>
  );
}
