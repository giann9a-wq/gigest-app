"use client";
import { useState } from "react";
export function SchedulePdfButton({ url, data, disabled = false, label = "Esporta PDF" }: { url: string; data?: unknown; disabled?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : { cache: "no-store" });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Esportazione non riuscita"); }
      const blob = await response.blob(); const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = objectUrl; link.download = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "gantt.pdf";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (e) { setError(e instanceof Error ? e.message : "Esportazione non riuscita"); } finally { setBusy(false); }
  }
  return <span className="gantt-pdf-action"><button type="button" className="mobile-button-secondary" disabled={disabled || busy} onClick={download}>{busy ? "Creo PDF…" : label}</button>{error && <span role="alert">{error}</span>}</span>;
}
