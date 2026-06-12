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
  const syncingRef = useRef(false);

  const syncScans = useCallback(async () => {
    if (syncingRef.current) return;

    syncingRef.current = true;

    try {
      await readJsonResponse(
        await fetch("/api/integrations/gmail/scansioni/sync", { method: "POST" })
      );
      router.refresh();
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Errore sincronizzazione Gmail");
    } finally {
      syncingRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    void syncScans();

    const intervalId = window.setInterval(() => {
      void syncScans();
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [syncScans]);

  return null;
}
