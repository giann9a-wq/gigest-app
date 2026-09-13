"use client";

import { useEffect, useState } from "react";

type Version = { id: string; name: string; sourceLabel: string | null; status: string; itemCount: number; importedAt: string | null; createdAt: string };

export function PriceListImportPanel() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [name, setName] = useState("Prezzario Regione Lombardia 2026");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() { const response = await fetch("/api/admin/prezzario"); const data = await response.json(); if (!response.ok) throw new Error(data.error); setVersions(data.versions); }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const XLSX = await import("xlsx");
      const JSZip = (await import("jszip")).default;
      const selected = Array.from(files ?? []);
      const workbooks: Array<{ name: string; data: ArrayBuffer }> = [];
      for (const file of selected) {
        if (/\.zip$/i.test(file.name)) {
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          for (const entry of Object.values(zip.files)) if (!entry.dir && /(^|\/)[ACEF]\)[^/]*\.xlsx$/i.test(entry.name)) workbooks.push({ name: entry.name.split("/").pop()!, data: (await entry.async("uint8array")).buffer as ArrayBuffer });
        } else if (/^[ACEF]\).*\.xlsx$/i.test(file.name)) workbooks.push({ name: file.name, data: await file.arrayBuffer() });
      }
      if (!workbooks.length) throw new Error("Nessun file A, C, E o F trovato nel caricamento.");
      const start = await fetch("/api/admin/prezzario/chunk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", name }) });
      const startData = await start.json(); if (!start.ok) throw new Error(startData.error);
      let imported = 0;
      for (const source of workbooks) {
        const workbook = XLSX.read(source.data, { type: "array", dense: true }); const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }); const headers = (rows[0] ?? []).map((value) => String(value ?? "").trim());
        const ci = headers.indexOf("Codice"), di = headers.indexOf("Declaratoria"), ri = headers.indexOf("Declaratoria Regione"), ddi = headers.indexOf("Declaratoria Regione Dettaglio"), pi = headers.indexOf("Prezzo"), ui = headers.findIndex((v) => v === "U.M." || v === "U. M."), gi = headers.indexOf("Descr. Liv. 1");
        const parsed = rows.slice(1).map((row) => {
          const legacyDescription = String(row[di] ?? "").replace(/\s+/g, " ").trim();
          const regionalDescription = String(row[ri >= 0 ? ri : di] ?? "").replace(/\s+/g, " ").trim();
          const detailDescription = ddi >= 0 ? String(row[ddi] ?? "").replace(/\s+/g, " ").trim() : "";
          return { code: String(row[ci] ?? "").trim(), description: [regionalDescription, detailDescription].filter(Boolean).join("\n") || legacyDescription, regionalDescription, detailDescription, unit: String(row[ui] ?? "").replace(/^1\s+/, "").trim(), price: Number(row[pi]), sourceFile: source.name, category: gi >= 0 ? String(row[gi] ?? "").trim() : "" };
        }).filter((row) => row.code && row.description && Number.isFinite(row.price));
        for (let index = 0; index < parsed.length; index += 400) {
          const response = await fetch("/api/admin/prezzario/chunk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "batch", versionId: startData.versionId, rows: parsed.slice(index, index + 400) }) });
          const data = await response.json(); if (!response.ok) throw new Error(data.error); imported += Math.min(400, parsed.length - index); setMessage(`Importazione in corso: ${imported.toLocaleString("it-IT")} voci elaborate...`);
        }
      }
      const finish = await fetch("/api/admin/prezzario/chunk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", versionId: startData.versionId }) });
      const data = await finish.json(); if (!finish.ok) throw new Error(data.error);
      setMessage(`Listino attivato: ${data.itemCount.toLocaleString("it-IT")} voci da ${workbooks.length} file.`); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Import non riuscito"); } finally { setBusy(false); }
  }

  return <div className="admin-stack">
    <section className="card"><div className="mobile-section-header"><div><p className="dashboard-kicker">Listino edilizia</p><h1 className="mobile-section-title">Aggiorna prezzario</h1><p className="mobile-section-subtitle">Carica insieme i file A, C, E e F del pacchetto regionale. La nuova versione diventa attiva solo a import completato; la precedente resta archiviata.</p></div></div>
      {message && <div className="job-dashboard-success">{message}</div>}{error && <div className="job-dashboard-error">{error}</div>}
      <form className="price-list-import-form" onSubmit={submit}><label><span>Nome versione</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label><label><span>ZIP completo oppure file XLSX</span><input type="file" accept=".zip,.xlsx,.xls" multiple onChange={(e) => setFiles(e.target.files)} required /></label><button className="button" disabled={busy}>{busy ? "Importazione in corso..." : "Importa e attiva listino"}</button></form>
    </section>
    <section className="card"><h2 className="quotes-section-title">Versioni caricate</h2><div className="price-list-versions">{versions.map((version) => <article key={version.id}><div><strong>{version.name}</strong><span>{version.itemCount.toLocaleString("it-IT")} voci · {new Date(version.importedAt ?? version.createdAt).toLocaleString("it-IT")}</span></div><span className={`price-list-status ${version.status.toLowerCase()}`}>{version.status === "ACTIVE" ? "Attivo" : version.status === "ARCHIVED" ? "Archiviato" : version.status}</span></article>)}</div></section>
  </div>;
}
