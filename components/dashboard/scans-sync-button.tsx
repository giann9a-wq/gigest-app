"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function readJsonResponse(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore sincronizzazione Gmail");
  }

  return data as { imported?: number; skipped?: number; errors?: number };
}

export function ScansSyncButton() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function syncScans() {
    setSyncing(true);
    setMessage("");
    setError("");

    try {
      const data = await readJsonResponse(
        await fetch("/api/integrations/gmail/scansioni/sync", { method: "POST" })
      );
      setMessage(`Importate ${data.imported ?? 0}, saltate ${data.skipped ?? 0}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sincronizzazione Gmail");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="dashboard-sync-control">
      <button type="button" className="dashboard-sync-button" onClick={() => void syncScans()} disabled={syncing}>
        {syncing ? "Sync..." : "Sync Gmail"}
      </button>
      {message ? <span className="dashboard-sync-message">{message}</span> : null}
      {error ? <span className="dashboard-sync-error">{error}</span> : null}
    </div>
  );
}
