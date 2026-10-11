import Link from "next/link";
export function PreventiviTabs({ current }: { current: "quotes" | "calculator" }) {
  return <nav className="job-order-tabs" aria-label="Sezione Preventivi">
    <Link href="/preventivi" className={`job-order-tab ${current === "quotes" ? "job-order-tab-active" : ""}`} aria-current={current === "quotes" ? "page" : undefined}>Preventivi</Link>
    <Link href="/preventivi/calcolatore-sconti" className={`job-order-tab ${current === "calculator" ? "job-order-tab-active" : ""}`} aria-current={current === "calculator" ? "page" : undefined}>Calcolatore Sconti</Link>
  </nav>;
}
