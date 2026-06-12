"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

async function readJsonResponse(response: Response) {
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || "Errore sincronizzazione Gmail");
    (error as Error & { nextAllowedAt?: string }).nextAllowedAt = data.nextAllowedAt;
    throw error;
  }

  return data as {
    imported?: number;
    skipped?: number;
    errors?: number;
    throttled?: boolean;
    skippedReason?: string;
    nextAllowedAt?: string;
  };
}

function formatRetryTime(value?: string) {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ScansSyncButton() {
  const router = useRouter();
  const syncingRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const syncScans = useCallback(async (options: { force?: boolean; showFeedback?: boolean } = {}) => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    if (options.showFeedback) {
      setIsSyncing(true);
      setMessage("");
      setErrorMessage("");
    }

    try {
      const url = options.force
        ? "/api/integrations/gmail/scansioni/sync?force=1"
        : "/api/integrations/gmail/scansioni/sync";
      const result = await readJsonResponse(
        await fetch(url, { method: "POST" })
      );

      if (options.showFeedback) {
        if (result.throttled) {
          const retryLabel = formatRetryTime(result.nextAllowedAt);
          setMessage(
            result.skippedReason === "gmail-rate-limit" && retryLabel
              ? `Gmail in pausa temporanea fino alle ${retryLabel}.`
              : "Sync gia recente: riprovo automaticamente tra poco."
          );
        } else {
          setMessage(`Sync completato: ${result.imported ?? 0} nuove scansioni.`);
        }
      }

      router.refresh();
    } catch (err) {
      const nextAllowedAt =
        err instanceof Error ? (err as Error & { nextAllowedAt?: string }).nextAllowedAt : undefined;
      const retryLabel = formatRetryTime(nextAllowedAt);
      const text =
        err instanceof Error ? err.message : "Errore sincronizzazione Gmail";

      if (options.showFeedback) {
        setErrorMessage(retryLabel ? `${text} Riprova dopo le ${retryLabel}.` : text);
      } else {
        console.error(retryLabel ? `${text} Riprova dopo le ${retryLabel}.` : text);
      }
    } finally {
      syncingRef.current = false;
      if (options.showFeedback) {
        setIsSyncing(false);
      }
    }
  }, [router]);

  return (
    <div className="dashboard-sync-control">
      <button
        type="button"
        className="dashboard-sync-button"
        onClick={() => void syncScans({ force: true, showFeedback: true })}
        disabled={isSyncing}
      >
        {isSyncing ? "Sync in corso..." : "Sync Gmail"}
      </button>
      {message ? <span className="dashboard-sync-message">{message}</span> : null}
      {errorMessage ? <span className="dashboard-sync-error">{errorMessage}</span> : null}
    </div>
  );
}
