"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { salesFetch } from "@/components/sales/sales-client";
export function SalesApproveButton({ id }: { id: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div><button className="mobile-button-secondary" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { await salesFetch(`/api/admin/vendite/acconti/${id}/approva`, { method: "POST" }); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Errore approvazione"); } finally { setBusy(false); }
  }}>{busy ? "Approvazione…" : "Approva e genera acconto"}</button>{error && <p role="alert">{error} <a href="/admin/vendite">Apri Vendite e sblocca l’area admin</a></p>}</div>;
}
