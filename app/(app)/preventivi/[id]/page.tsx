import { PreventiviWorkspace } from "@/components/preventivi/preventivi-workspace";

export default async function ModificaPreventivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PreventiviWorkspace mode="form" quoteId={id} />;
}
