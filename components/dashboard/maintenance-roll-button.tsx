"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type MaintenanceRollButtonProps = {
  maintenanceId: string;
};

export function MaintenanceRollButton({ maintenanceId }: MaintenanceRollButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function confirmMaintenance() {
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/risorse/mezzi/maintenance/${maintenanceId}/roll`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Errore conferma manutenzione");
        return;
      }

      router.refresh();
    });
  }

  return (
    <span className="dashboard-maintenance-action-wrap">
      <button
        type="button"
        className="dashboard-work-alert-action dashboard-work-alert-button"
        onClick={confirmMaintenance}
        disabled={isPending}
      >
        {isPending ? "Confermo..." : "Conferma e ripianifica"}
      </button>
      {error ? <span className="dashboard-maintenance-error">{error}</span> : null}
    </span>
  );
}
