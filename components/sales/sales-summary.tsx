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
  return <div className="sales-table-frame"><table className="sales-table" aria-label="Listino e vendite delle unità immobiliari"><thead><tr>
    <th scope="col">Unità immobiliare</th><th scope="col" className="sales-table-money">Prezzo di listino</th><th scope="col">Stato e cliente</th><th scope="col" className="sales-table-money">Vendita concordata</th><th scope="col">Acconti</th>
  </tr></thead><tbody>{view.units.length === 0 ? <tr><td colSpan={5} className="sales-table-empty">Nessuna unità immobiliare nel listino.</td></tr> : view.units.map(unit => {
    const approved = unit.sale?.installments.filter(row => row.advanceId).length ?? 0;
    const planned = unit.sale?.installments.length ?? 0;
    return <tr key={unit.id}>
      <td data-label="Unità immobiliare"><div className="sales-table-cell"><strong>{unit.code}</strong>{unit.description && <small>{unit.description}</small>}</div></td>
      <td data-label="Prezzo di listino" className="sales-table-money">{formatCurrency(unit.listPrice)}</td>
      <td data-label="Stato e cliente"><div className="sales-table-cell"><span className={`sales-status ${unit.sale ? "sales-status-sold" : "sales-status-available"}`}>{unit.sale ? "Venduto" : "Disponibile"}</span>{unit.sale && <span className="sales-table-customer">{unit.sale.customerName}</span>}</div></td>
      <td data-label="Vendita concordata" className="sales-table-money">{unit.sale ? <strong>{formatCurrency(unit.sale.agreedPrice)}</strong> : <span className="sales-table-muted">—</span>}</td>
      <td data-label="Acconti"><div className="sales-table-cell">{unit.sale ? planned > 0 ? <><strong>{approved} {approved === 1 ? "approvato" : "approvati"} su {planned}</strong><small>{planned} {planned === 1 ? "acconto pianificato" : "acconti pianificati"}</small></> : <span className="sales-table-muted">Nessun acconto pianificato</span> : <span className="sales-table-muted">—</span>}</div></td>
    </tr>;
  })}</tbody></table></div>;
}
