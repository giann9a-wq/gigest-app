"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [error, setError] = useState("");
  const syncingRef = useRef(false);

  const syncScans = useCallback(async ({ showLoading = true } = {}) => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    setSyncing(true);
    if (showLoading) {
      setError("");
    }

    try {
      await readJsonResponse(
        await fetch("/api/integrations/gmail/scansioni/sync", { method: "POST" })
      );
      router.refresh();
    } catch (err) {
      if (showLoading) {
        setError(err instanceof Error ? err.message : "Errore sincronizzazione Gmail");
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    void syncScans({ showLoading: false });

    const intervalId = window.setInterval(() => {
      void syncScans({ showLoading: false });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [syncScans]);

  return (
    <div className="dashboard-sync-control">
      <button type="button" className="dashboard-sync-button" onClick={() => void syncScans()} disabled={syncing}>
        {syncing ? "Sync..." : "Sync Gmail"}
      </button>
      {error ? <span className="dashboard-sync-error">{error}</span> : null}
    </div>
  );
}
