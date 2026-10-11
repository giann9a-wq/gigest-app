"use client";

import { useState } from "react";
import type { CostImportGroup } from "@/lib/cost-import-preview";
import { formatCurrency } from "@/lib/number-format";
import { CostImportValidation } from "./cost-import-validation";

type JobOrder = { id: string; name: string };
type PreparedSession = { id: string; status: string };

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita");
  return data;
}

export function CostImportWizard({ jobOrders, onSessionChange }: { jobOrders: JobOrder[]; onSessionChange?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<CostImportGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unassigned, setUnassigned] = useState(0);
  const [sessions, setSessions] = useState<Record<string, PreparedSession>>({});
  const [activeJob, setActiveJob] = useState("");
  const accounts = groups.flatMap((group) => group.accounts);
  const chosen = accounts.filter((account) => selected.includes(account.code));
  const selectedGroups = groups.filter((group) => group.accounts.some((account) => selected.includes(account.code)));
  const locked = Object.keys(sessions).length > 0;
  const destinations = [...new Set(selectedGroups.map((group) => mapping[group.code]).filter(Boolean))];
  const ready = selectedGroups.length > 0 && selectedGroups.every((group) => mapping[group.code]);
  const total = chosen.reduce((sum, account) => sum + account.amount, 0);
  const count = chosen.reduce((sum, account) => sum + account.rows, 0);

  function selectCodes(codes: string[], include: boolean) {
    setSelected((current) => include ? [...new Set([...current, ...codes])] : current.filter((code) => !codes.includes(code)));
  }

  async function analyze() {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const form = new FormData(); form.set("file", file);
      const data = await readResponse(await fetch("/api/admin/import-costi/preview", { method: "POST", body: form }));
      setGroups(data.groups); setUnassigned(data.unassignedRows);
      setSelected(data.groups.flatMap((group: CostImportGroup) => group.accounts.map((account) => account.code)));
      setMapping({}); setSessions({});
    } catch (err) { setError(err instanceof Error ? err.message : "Errore leggendo il file"); }
    finally { setBusy(false); }
  }

  function codesForJob(jobId: string) {
    return selectedGroups.filter((group) => mapping[group.code] === jobId)
      .flatMap((group) => group.accounts.filter((account) => selected.includes(account.code)));
  }

  async function validate(jobId: string) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      let prepared = sessions[jobId];
      if (!prepared) {
        const form = new FormData();
        form.set("file", file); form.set("jobOrderId", jobId);
        form.set("sourceAccountCodes", JSON.stringify(codesForJob(jobId).map((account) => account.code)));
        const data = await readResponse(await fetch("/api/admin/import-costi", { method: "POST", body: form }));
        prepared = { id: data.sessionId, status: "PARSED" };
        setSessions((current) => ({ ...current, [jobId]: prepared }));
        onSessionChange?.();
      }
      setActiveJob(jobId);
    } catch (err) { setError(err instanceof Error ? err.message : "Errore preparando la validazione"); }
    finally { setBusy(false); }
  }

  async function returnToList() {
    const prepared = sessions[activeJob];
    setBusy(true); setError("");
    try {
      const data = await readResponse(await fetch(`/api/admin/import-costi/${prepared.id}`));
      setSessions((current) => ({ ...current, [activeJob]: { ...prepared, status: data.status } }));
      setActiveJob("");
      onSessionChange?.();
    } catch (err) { setError(err instanceof Error ? err.message : "Errore aggiornando la sessione"); }
    finally { setBusy(false); }
  }

  return (
    <div className="cost-import-wizard">
      <section className="card">
        <p className="dashboard-kicker">File completo del gestionale</p>
        <h2 style={{ margin: 0 }}>Importa i costi per commessa</h2>
        <p className="mobile-section-subtitle">Scegli i codici, abbinali alle commesse e conferma i nuovi costi una commessa alla volta.</p>
        <ol className="cost-wizard-steps" aria-label="Passaggi importazione">
          {["Scegli i codici", "Abbina le commesse", "Valida i costi"].map((label, index) => (
            <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step === index + 1 ? "is-active" : ""}>
              <span>{index + 1}</span>{label}
            </li>
          ))}
        </ol>
        {groups.length > 0 ? (
          <div className="cost-wizard-summary">
            <div><span>File</span><strong className="cost-wizard-filename">{file?.name}</strong></div>
            <div><span>Codici selezionati</span><strong>{selectedGroups.length} / {groups.length}</strong></div>
            <div><span>Movimenti selezionati</span><strong>{count}</strong></div>
            <div><span>Importo selezionato</span><strong>{formatCurrency(total)}</strong></div>
          </div>
        ) : null}
        {error ? <div className="scad-error" role="alert">{error}</div> : null}
      </section>

      {step === 1 ? <section className="card">
        {!groups.length ? <>
          <label className="mobile-data-field">
            <span className="mobile-data-label">Export contabile completo (.xls / .xlsx)</span>
            <input type="file" accept=".xls,.xlsx" disabled={busy} className="admin-password-input" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} />
          </label>
          <div className="cost-wizard-actions"><button className="button" disabled={!file || busy} onClick={analyze}>{busy ? "Lettura del file…" : "Leggi i codici del file"}</button></div>
        </> : <>
          <h3>Scegli cosa importare</h3>
          <p className="muted">Togli la spunta a un codice per escludere tutti i suoi costi. Apri i sottoconti per una selezione più precisa.</p>
          {unassigned > 0 ? <div className="admin-note">{unassigned} movimenti senza codice riconosciuto esclusi dal percorso. Verifica il file di origine.</div> : null}
          <div className="cost-wizard-actions">
            <button className="mobile-button-secondary" onClick={() => setSelected(accounts.map((account) => account.code))}>Seleziona tutti</button>
            <button className="mobile-button-secondary" onClick={() => setSelected([])}>Escludi tutti</button>
            <span>{accounts.length - selected.length} sottoconti esclusi</span>
          </div>
          <div className="cost-wizard-groups">
            {groups.map((group) => {
              const included = group.accounts.filter((account) => selected.includes(account.code));
              return <div key={group.code} className={`cost-wizard-group${included.length ? "" : " is-excluded"}`}>
                <label className="cost-wizard-group-head">
                  <input type="checkbox" checked={included.length > 0} ref={(node) => { if (node) node.indeterminate = included.length > 0 && included.length < group.accounts.length; }} onChange={(event) => selectCodes(group.accounts.map((account) => account.code), event.target.checked)} />
                  <strong>{group.code}</strong>
                  <span>{included.length ? `${included.reduce((sum, account) => sum + account.rows, 0)} movimenti selezionati` : "Escluso"}</span>
                  <strong>{formatCurrency(included.reduce((sum, account) => sum + account.amount, 0))}</strong>
                </label>
                <details><summary>{group.accounts.length} sottoconti · {group.accounts[0]?.description}</summary>
                  {group.accounts.map((account) => <label key={account.code} className="cost-wizard-account">
                    <input type="checkbox" checked={selected.includes(account.code)} onChange={(event) => selectCodes([account.code], event.target.checked)} />
                    <span><strong>{account.code}</strong><br />{account.description}{account.invalidRows > 0 ? <small>{account.invalidRows} movimenti da correggere in validazione</small> : null}</span>
                    <span>{account.rows} movimenti</span><strong>{formatCurrency(account.amount)}</strong>
                  </label>)}
                </details>
              </div>;
            })}
          </div>
          <div className="cost-wizard-actions">
            <button className="mobile-button-secondary" onClick={() => { setGroups([]); setSelected([]); setError(""); }}>Cambia file</button>
            <button className="button" disabled={!chosen.length} onClick={() => setStep(2)}>Abbina {selectedGroups.length} codici alle commesse</button>
          </div>
        </>}
      </section> : null}

      {step === 2 ? <section className="card">
        <h3>Abbina i codici alle commesse Gigest</h3>
        <p className="muted">Tutti i sottoconti selezionati di un codice vanno alla stessa commessa. Puoi abbinare più codici alla stessa commessa.</p>
        {!jobOrders.length ? <div className="scad-error">Nessuna commessa attiva disponibile.</div> : null}
        {selectedGroups.map((group) => <div key={group.code} className="cost-wizard-mapping">
          <div><strong>{group.code}</strong><small>{group.accounts.filter((account) => selected.includes(account.code)).map((account) => account.description).join(" · ")}</small></div>
          <label className="mobile-data-field"><span className="mobile-data-label">Commessa Gigest per {group.code}</span>
            <select className="mobile-data-select" value={mapping[group.code] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [group.code]: event.target.value }))}>
              <option value="">Seleziona commessa</option>{jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}
            </select>
          </label>
        </div>)}
        <div className="cost-wizard-actions"><button className="mobile-button-secondary" onClick={() => setStep(1)}>Indietro ai codici</button><button className="button" disabled={!ready} onClick={() => setStep(3)}>Rivedi {destinations.length} commesse</button></div>
      </section> : null}

      {step === 3 && !activeJob ? <section className="card">
        <h3>Valida una commessa alla volta</h3>
        <p className="muted">Gli importi sotto sono quelli del file. Aprendo la validazione vedrai i costi nuovi, quelli già registrati e le righe da verificare. Conferma solo i costi da aggiungere.</p>
        {destinations.map((jobId) => {
          const jobAccounts = codesForJob(jobId);
          const session = sessions[jobId];
          return <div key={jobId} className="cost-wizard-destination">
            <div><strong>{jobOrders.find((job) => job.id === jobId)?.name}</strong><small>Codici: {selectedGroups.filter((group) => mapping[group.code] === jobId).map((group) => group.code).join(", ")}</small></div>
            <div><strong>{formatCurrency(jobAccounts.reduce((sum, account) => sum + account.amount, 0))}</strong><small>{jobAccounts.reduce((sum, account) => sum + account.rows, 0)} movimenti nel file</small></div>
            <span>{session?.status === "APPLIED" ? "Confermata" : session ? "Da completare" : "Da validare"}</span>
            <button className="button" disabled={busy} onClick={() => validate(jobId)}>{busy ? "Attendi…" : session?.status === "APPLIED" ? "Rivedi esito" : session ? "Riprendi validazione" : "Valida questa commessa"}</button>
          </div>;
        })}
        <div className="cost-wizard-actions">{!locked ? <button className="mobile-button-secondary" onClick={() => setStep(2)}>Modifica abbinamenti</button> : destinations.every((id) => sessions[id]?.status === "APPLIED") ? <button className="mobile-button-secondary" onClick={() => { setFile(null); setGroups([]); setSelected([]); setMapping({}); setSessions({}); setError(""); setStep(1); }}>Importa un altro file</button> : <span className="muted">Le sessioni preparate sono salvate anche in “Sessioni recenti”. Completa queste commesse prima di caricare un altro file.</span>}</div>
      </section> : null}

      {activeJob && sessions[activeJob] ? <>
        <section className="card"><button className="mobile-button-secondary" disabled={busy} onClick={returnToList}>{busy ? "Aggiornamento…" : "Torna all’elenco commesse"}</button><p className="mobile-section-subtitle">Stai verificando solo i codici {codesForJob(activeJob).map((account) => account.code).join(", ")}.</p></section>
        <CostImportValidation key={sessions[activeJob].id} sessionId={sessions[activeJob].id} />
      </> : null}
    </div>
  );
}
