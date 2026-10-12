import { DiscountCalculator } from "@/components/preventivi/discount-calculator";

export default async function DiscountSimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiscountCalculator key={id} simulationId={id} />;
}
