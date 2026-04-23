export type TaskCategory = "School" | "Work" | "Certification" | "Personal";
export type TaskPriority = "Low" | "Medium" | "High" | "Critical";
// `completed` is the canonical VYBE completion flag (mapped by the
// vybe_project_tasks view); `done` is retained for backwards compat
// with any pre-Wave-2 data that used it.
export type TaskStatus = "pending" | "in_progress" | "done" | "completed";
export type AppMode = "student" | "work";

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
}

export interface FocusSession {
  id: string;
  taskId: string;
  startAt: string;
  durationMinutes: number;
  breakMinutes: number;
  completed: boolean;
}

export interface Task {
  id: string;
  userEmail: string;
  title: string;
  category: TaskCategory;
  deadline: string; // ISO
  estimatedMinutes: number;
  priority: TaskPriority;
  mode: AppMode;
  status: TaskStatus;
  completedMinutes: number;
  notes?: string | null;
  projectId?: string | null;
  description?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  subtasks: Subtask[];
  sessions: FocusSession[];
}

export function isTaskCompleted(t: Pick<Task, "status">): boolean {
  return t.status === "completed" || t.status === "done";
}

export interface UserPrefs {
  userEmail: string;
  mode: AppMode;
  aggressiveAlerts: boolean;
  notificationsEnabled: boolean;
}

export interface TaskInput {
  title: string;
  category: TaskCategory;
  deadline: string;
  estimatedMinutes: number;
  priority: TaskPriority;
  mode: AppMode;
  notes?: string;
  subtasks?: string[];
  projectId?: string | null;
}

export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  Low: 1,
  Medium: 1.5,
  High: 2.25,
  Critical: 3.5,
};

export interface UrgencyResult {
  score: number; // 0-100
  level: "chill" | "early" | "soon" | "now" | "overdue";
  label: string;
  ratio: number; // estimated / remaining — Infinity when overdue, NaN when estimatedMinutes === 0
  minutesRemaining: number;
  optimalStart: Date; // when user should start
  behind: boolean;
}

/**
 * Compute an urgency score (0-100) factoring:
 *  - ratio of required time to remaining time
 *  - user priority weighting
 *  - deadline proximity
 */
export function computeUrgency(task: Pick<Task, "deadline" | "estimatedMinutes" | "priority" | "completedMinutes" | "status">, now: Date = new Date()): UrgencyResult {
  const deadline = new Date(task.deadline);
  const minutesRemaining = Math.max(0, Math.round((deadline.getTime() - now.getTime()) / 60000));
  const remainingWork = Math.max(0, task.estimatedMinutes - task.completedMinutes);
  const weight = PRIORITY_WEIGHT[task.priority];

  if (task.status === "done") {
    return { score: 0, level: "chill", label: "Done", ratio: 0, minutesRemaining, optimalStart: now, behind: false };
  }

  if (minutesRemaining <= 0) {
    return {
      score: 100,
      level: "overdue",
      label: "Overdue",
      ratio: Infinity,
      minutesRemaining: 0,
      optimalStart: now,
      behind: true,
    };
  }

  // When estimatedMinutes is 0, there's no work-to-time ratio. Score purely by priority + proximity.
  if (task.estimatedMinutes <= 0) {
    const priorityBoost = (weight - 1) * 12;
    const proximityBoost = minutesRemaining < 60 * 6 ? 30 : minutesRemaining < 60 * 24 ? 15 : 5;
    const raw = priorityBoost + proximityBoost;
    const score = Math.max(0, Math.min(100, raw));
    const optimalStart = new Date(deadline.getTime() - 15 * 60000);
    const behind = optimalStart.getTime() <= now.getTime();
    let level: UrgencyResult["level"];
    let label: string;
    if (score >= 70 || behind) { level = "now"; label = "Start Now"; }
    else if (score >= 45) { level = "soon"; label = "Start Soon"; }
    else if (score >= 20) { level = "early"; label = "On Track"; }
    else { level = "chill"; label = "Plenty of Time"; }
    return { score, level, label, ratio: NaN, minutesRemaining, optimalStart, behind };
  }

  const ratio = remainingWork / Math.max(1, minutesRemaining); // 1 = just enough time
  // Base score: ratio toward 1 pushes urgency up rapidly
  const ratioScore = Math.min(1, ratio) * 70 + Math.max(0, ratio - 1) * 20; // > 1 means not enough time
  const priorityBoost = (weight - 1) * 12;
  const proximityBoost = minutesRemaining < 60 * 6 ? 10 : minutesRemaining < 60 * 24 ? 5 : 0;

  const raw = ratioScore + priorityBoost + proximityBoost;
  const score = Math.max(0, Math.min(100, raw));

  // Optimal start: deadline - (remainingWork * priority buffer)
  const bufferMinutes = remainingWork * (1 + (weight - 1) * 0.15);
  const optimalStart = new Date(deadline.getTime() - bufferMinutes * 60000);
  const behind = optimalStart.getTime() <= now.getTime();

  let level: UrgencyResult["level"];
  let label: string;
  if (ratio >= 1) {
    level = "now";
    label = "Start Now";
  } else if (score >= 70 || behind) {
    level = "now";
    label = "Start Now";
  } else if (score >= 45) {
    level = "soon";
    label = "Start Soon";
  } else if (score >= 20) {
    level = "early";
    label = "On Track";
  } else {
    level = "chill";
    label = "Plenty of Time";
  }

  return { score, level, label, ratio, minutesRemaining, optimalStart, behind };
}

export function urgencyColor(level: UrgencyResult["level"]): string {
  switch (level) {
    case "overdue":
      return "bg-red-600 text-white";
    case "now":
      return "bg-red-500 text-white";
    case "soon":
      return "bg-orange-500 text-white";
    case "early":
      return "bg-yellow-500 text-black";
    case "chill":
      return "bg-emerald-500 text-white";
  }
}

export function urgencyBar(level: UrgencyResult["level"]): string {
  switch (level) {
    case "overdue":
      return "bg-red-600";
    case "now":
      return "bg-red-500";
    case "soon":
      return "bg-orange-500";
    case "early":
      return "bg-yellow-500";
    case "chill":
      return "bg-emerald-500";
  }
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total === 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total - h * 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatRemaining(minutes: number): string {
  if (minutes <= 0) return "Overdue";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Split a task into focus sessions (Pomodoro-ish).
 * Default 50m work / 10m break, last chunk may be shorter.
 */
export function generateSessions(
  task: Pick<Task, "id" | "estimatedMinutes" | "completedMinutes" | "deadline">,
  opts: { workBlock?: number; breakBlock?: number; start?: Date } = {},
): Array<{ startAt: Date; durationMinutes: number; breakMinutes: number }> {
  const workBlock = opts.workBlock ?? 50;
  const breakBlock = opts.breakBlock ?? 10;
  const remaining = Math.max(0, task.estimatedMinutes - task.completedMinutes);
  if (remaining <= 0) return [];

  const deadline = new Date(task.deadline);
  const now = opts.start ?? new Date();
  const urgency = computeUrgency({ ...task, priority: "Medium", status: "pending" });
  const start = urgency.optimalStart.getTime() < now.getTime() ? now : urgency.optimalStart;

  const sessions: Array<{ startAt: Date; durationMinutes: number; breakMinutes: number }> = [];
  let cursor = new Date(start);
  let left = remaining;
  while (left > 0 && cursor.getTime() < deadline.getTime()) {
    const dur = Math.min(workBlock, left);
    sessions.push({ startAt: new Date(cursor), durationMinutes: dur, breakMinutes: breakBlock });
    cursor = new Date(cursor.getTime() + (dur + breakBlock) * 60000);
    left -= dur;
  }
  return sessions;
}