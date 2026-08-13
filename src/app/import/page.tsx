import { ImportForm } from "@/components/ImportForm";
import { PastCaseList } from "@/components/PastCaseList";
import { listImportedCases } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cases = listImportedCases();

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-bold text-accent">過去のお姉さんを登録</h1>
        <span className="num text-[10.5px] text-dim">初期学習</span>
      </header>

      <ImportForm />
      <PastCaseList cases={cases} />
    </div>
  );
}
