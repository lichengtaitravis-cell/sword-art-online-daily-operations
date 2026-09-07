const DEADLINE_EVENTS_URL = 'http://127.0.0.1:43110/v1/deadline-events';

export type DeadlineEvent = {
  id: number;
  taskId: string;
  changedAt: string;
  oldDueAt: string;
  newDueAt: string;
  priorityAtChange: 'must' | 'high' | 'medium' | 'low';
};

export async function loadDeadlineEvents() {
  const response = await fetch(DEADLINE_EVENTS_URL, { cache: 'no-store' });
  const body = await response.json() as DeadlineEvent[] | { error: string };
  if (!response.ok) throw new Error('error' in body ? body.error : `Deadline event request failed (${response.status})`);
  return body as DeadlineEvent[];
}
