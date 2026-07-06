"use client";

import type { DashboardTaskStatus } from "@prisma/client";
import { useRef, useState } from "react";
import { updateDashboardTaskStatusAction } from "@/app/(app)/dashboard2/actions";

type TaskStatusFormProps = {
  taskId: string;
  currentStatus: DashboardTaskStatus;
};

const statusOptions: Array<{ value: DashboardTaskStatus; label: string }> = [
  { value: "TODO", label: "Da fare" },
  { value: "IN_PROGRESS", label: "In corso" },
  { value: "DONE", label: "Completata" },
  { value: "ARCHIVED", label: "Archiviata" },
];

export function TaskStatusForm({ taskId, currentStatus }: TaskStatusFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      ref={formRef}
      action={updateDashboardTaskStatusAction}
      className="dashboard2-task-status-form"
      onSubmit={() => setIsSubmitting(true)}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <label>
        <span>Stato</span>
        <select
          name="status"
          defaultValue={currentStatus}
          disabled={isSubmitting}
          onChange={() => formRef.current?.requestSubmit()}
        >
          {statusOptions.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </label>
      {isSubmitting ? <small>Aggiorno...</small> : null}
    </form>
  );
}
