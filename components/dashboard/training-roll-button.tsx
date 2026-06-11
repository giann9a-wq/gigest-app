"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TrainingRollButtonProps = {
  trainingId: string;
};

export function TrainingRollButton({ trainingId }: TrainingRollButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function confirmTraining() {
    setError("");

    startTransition(async () => {
      const response = await fetch(`/api/risorse/personale/training/${trainingId}/roll`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Errore conferma formazione");
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
        onClick={confirmTraining}
        disabled={isPending}
      >
        {isPending ? "Valido..." : "Valida e ripianifica"}
      </button>
      {error ? <span className="dashboard-maintenance-error">{error}</span> : null}
    </span>
  );
}
