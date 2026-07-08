import { DashboardTaskStatus } from "@prisma/client";
import { createDashboardTaskAction, deleteDashboardTaskAction } from "@/app/(app)/dashboard2/actions";
import { ScansSyncButton } from "@/components/dashboard/scans-sync-button";
import { TaskStatusForm } from "@/components/dashboard/task-status-form";
import {
  getUserDisplayName,
  type DashboardTaskRow,
  type DashboardTaskUserOption,
} from "@/lib/dashboard-tasks";

type DashboardTasksCardProps = {
  tasks: DashboardTaskRow[];
  users: DashboardTaskUserOption[];
  activeUserId: string;
  showArchived: boolean;
};

const statusLabels: Record<DashboardTaskStatus, string> = {
  TODO: "Da fare",
  IN_PROGRESS: "In corso",
  DONE: "Completata",
  ARCHIVED: "Archiviata",
};

const visibleSections: Array<{ status: DashboardTaskStatus; title: string }> = [
  { status: DashboardTaskStatus.TODO, title: "Da fare" },
  { status: DashboardTaskStatus.IN_PROGRESS, title: "In corso" },
  { status: DashboardTaskStatus.DONE, title: "Completate" },
];

function formatDate(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function TaskRow({ task }: { task: DashboardTaskRow }) {
  const owner = getUserDisplayName(task.owner);
  const assignee = task.assignee ? getUserDisplayName(task.assignee) : owner;

  return (
    <article className={`dashboard2-task-row dashboard2-task-row-${task.status.toLowerCase()}`}>
      <div className="dashboard2-task-main">
        <div className="dashboard2-task-topline">
          <span>{statusLabels[task.status]}</span>
          <time dateTime={task.createdAt.toISOString()}>Creata {formatDate(task.createdAt)}</time>
        </div>
        <p>{task.description}</p>
        <div className="dashboard2-task-meta">
          <span>Owner: {owner}</span>
          <span>Assegnata: {assignee}</span>
          <span>Scadenza: {formatDate(task.dueDate)}</span>
        </div>
      </div>
      <div className="dashboard2-task-actions">
        <TaskStatusForm taskId={task.id} currentStatus={task.status} />
        <form action={deleteDashboardTaskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <button className="dashboard2-task-delete-button" type="submit" title="Elimina task" aria-label="Elimina task">
            <TrashIcon />
          </button>
        </form>
      </div>
    </article>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
      <path d="M6 9h12l-1 11H7L6 9Zm4 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" />
    </svg>
  );
}

export function DashboardTasksCard({
  tasks,
  users,
  activeUserId,
  showArchived,
}: DashboardTasksCardProps) {
  const activeTasks = tasks.filter((task) => task.status !== DashboardTaskStatus.ARCHIVED);
  const archivedTasks = tasks.filter((task) => task.status === DashboardTaskStatus.ARCHIVED);

  return (
    <section className="card dashboard2-card dashboard2-task-card">
      <div className="dashboard-card-head">
        <div>
          <p className="dashboard-kicker">Le mie task</p>
          <strong>Attivita personali e assegnate</strong>
        </div>
        <div className="dashboard2-task-head-actions">
          <details className="dashboard2-task-create">
            <summary className="dashboard2-task-top-button">Nuova task</summary>
            <form action={createDashboardTaskAction} className="dashboard2-task-form">
              <label className="dashboard2-task-description-field">
                <span>Descrizione</span>
                <textarea name="description" rows={2} maxLength={500} required placeholder="Nuova task" />
              </label>
              <label>
                <span>Scadenza</span>
                <input name="dueDate" type="date" />
              </label>
              <label>
                <span>Assegna a</span>
                <select name="assigneeId" defaultValue={activeUserId}>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {getUserDisplayName(user)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button">
                Crea task
              </button>
            </form>
          </details>
          {showArchived ? (
            <a className="dashboard2-task-top-button" href="/dashboard">
              Nascondi archiviate
            </a>
          ) : (
            <a className="dashboard2-task-top-button" href="/dashboard?archiviate=1">
              Vedi Archiviate
            </a>
          )}
          <ScansSyncButton />
          <span className="dashboard-pill">{activeTasks.length}</span>
        </div>
      </div>

      <div className="dashboard2-task-sections">
        {activeTasks.length === 0 ? (
          <p className="muted">Nessuna task aperta.</p>
        ) : (
          visibleSections.map((section) => {
            const sectionTasks = activeTasks.filter((task) => task.status === section.status);
            return (
              <section key={section.status} className="dashboard2-task-section">
                <div className="dashboard2-task-section-head">
                  <div>
                    <strong>{section.title}</strong>
                    {sectionTasks.length === 0 ? <small>Nessuna task.</small> : null}
                  </div>
                  <span>{sectionTasks.length}</span>
                </div>
                {sectionTasks.length > 0 ? (
                  <div className="dashboard2-task-list">
                    {sectionTasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })
        )}

        {showArchived ? (
          <section className="dashboard2-task-section dashboard2-task-section-archived">
            <div className="dashboard2-task-section-head">
              <div>
                <strong>Archiviate</strong>
                {archivedTasks.length === 0 ? <small>Nessuna task archiviata.</small> : null}
              </div>
              <span>{archivedTasks.length}</span>
            </div>
            {archivedTasks.length > 0 ? (
              <div className="dashboard2-task-list">
                {archivedTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}
