const PLANNER_DATABASE_URL = 'http://127.0.0.1:43110/v1/state';

export type PlannerDatabaseState<Task, Settings> = {
  initialized: boolean;
  revision: number;
  tasks: Task[];
  settings: Settings | null;
  theme: 'day' | 'night';
  updatedAt: string;
};

type SavePlannerState<Task, Settings> = {
  expectedRevision: number;
  tasks: Task[];
  settings: Settings;
  theme: 'day' | 'night';
  migrationSource?: string;
};

async function databaseRequest<Task, Settings>(init?: RequestInit) {
  const response = await fetch(PLANNER_DATABASE_URL, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json() as PlannerDatabaseState<Task, Settings> | { error: string };
  if (!response.ok && response.status !== 409) {
    const message = 'error' in body ? body.error : `Database request failed (${response.status})`;
    throw new Error(message);
  }
  return { state: body as PlannerDatabaseState<Task, Settings>, conflicted: response.status === 409 };
}

export async function loadPlannerState<Task, Settings>() {
  return (await databaseRequest<Task, Settings>()).state;
}

export async function savePlannerState<Task, Settings>(state: SavePlannerState<Task, Settings>) {
  return databaseRequest<Task, Settings>({ method: 'PUT', body: JSON.stringify(state) });
}
