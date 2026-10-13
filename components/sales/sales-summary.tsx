import type { SalesView } from "@/lib/property-sales";
import { formatCurrency } from "@/lib/number-format";
export function SalesSummary({ view }: { view: SalesView }) {
  return <div className="job-revenue-summary-grid">
    <article><span>Controvalore listino</span><strong>{formatCurrency(view.listTotal)}</strong><small>{view.units.length} unità immobiliari</small></article>
    <article><span>Venduto concordato</span><strong>{formatCurrency(view.soldTotal)}</strong><small>{view.units.filter(row => row.sale).length} unità vendute</small></article>
    <article><span>Residuo da vendere a listino</span><strong>{formatCurrency(view.remainingListTotal)}</strong><small>Valore delle unità disponibili</small></article>
  </div>;
}
export function SalesTable({ view }: { view: SalesView }) {
  return <div className="job-premium-table-wrap"><table className="job-premium-detail-table"><thead><tr>
    <th>Unità immobiliare</th><th>Listino</th><th>Stato / Cliente</th><th>Vendita concordata</th><th>Acconti</th>
  </tr></thead><tbody>{view.units.length === 0 ? <tr><td colSpan={5}>Nessuna unità immobiliare nel listino.</td></tr> : view.units.map(unit => <tr key={unit.id}>
    <td><strong>{unit.code}</strong><small>{unit.description}</small></td><td>{formatCurrency(unit.listPrice)}</td>
    <td>{unit.sale ? unit.sale.customerName : "Disponibile"}</td><td>{unit.sale ? formatCurrency(unit.sale.agreedPrice) : "—"}</td>
    <td>{unit.sale ? `${unit.sale.installments.filter(row => row.advanceId).length} approvati / ${unit.sale.installments.length} pianificati` : "—"}</td>
  </tr>)}</tbody></table></div>;
}
