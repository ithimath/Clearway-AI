import type {
  NetworkResponse,
  Train,
  Block,
  ConflictRecord,
  SimulationState,
  MetricSummary,
  MaintenanceJob,
} from '../types';

const API_BASE = '/api';

export interface ScenarioRunResult {
  scenario_id: number;
  scenario_type: string;
  parameters: Record<string, any>;
  baseline: {
    conflict_count: number;
  };
  disrupted: {
    conflict_count: number;
    new_conflicts: number;
  };
  conflicts: ConflictRecord[];
  conflicts_count: number;
  explanation: string;
}

async function request<T>(endpoint: string, options?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorBody = '';
      try {
        errorBody = await res.text();
      } catch {
        errorBody = res.statusText;
      }

      if (res.status === 502) {
        throw new Error(
          'API Error 502: Bad Gateway. The backend service at 127.0.0.1:8000 is either offline or restarting.'
        );
      }
      if (res.status === 504) {
        throw new Error('API Error 504: Gateway Timeout. The operation took longer than the server allowed.');
      }

      throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
    }

    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please check if backend is responsive.`);
    }
    throw err;
  }
}

export const api = {
  // Health
  getHealth: () => request<{ status: string; version: string }>('/health', { timeoutMs: 5000 }),

  // Network & Infrastructure
  getNetwork: () => request<NetworkResponse>('/network'),
  getTrains: () => request<Train[]>('/trains'),
  getBlocks: () => request<Block[]>('/blocks'),

  // Conflicts
  getConflicts: (context: string = 'baseline') =>
    request<any>(`/conflicts/list?context=${context}`)
      .catch(() => request<any>(`/conflicts?context=${context}`))
      .then((res) => (Array.isArray(res) ? { conflicts: res, count: res.length } : res || { conflicts: [], count: 0 })),
  detectConflicts: (useRevised: boolean = false, context: string = 'baseline') =>
    request<{ conflicts: ConflictRecord[]; count: number }>(`/conflicts/detect?use_revised=${useRevised}&context=${context}`, {
      method: 'POST',
    }),

  // Simulation
  getSimState: () => request<SimulationState>('/simulation/state', { timeoutMs: 5000 }),
  startSim: () => request<{ status: string }>('/simulation/start', { method: 'POST' }),
  pauseSim: () => request<{ status: string }>('/simulation/pause', { method: 'POST' }),
  resetSim: (startTimeMin: number = 360) =>
    request<{ status: string; start_time_min: number }>(`/simulation/reset?start_time_min=${startTimeMin}`, {
      method: 'POST',
    }),
  stepSim: (steps: number = 1) =>
    request<{ status: string } & SimulationState>('/simulation/step', {
      method: 'POST',
      body: JSON.stringify({ steps }),
    }),
  setSimSpeed: (factor: number) =>
    request<{ status: string; speed_factor: number }>('/simulation/speed', {
      method: 'POST',
      body: JSON.stringify({ factor }),
    }),

  // Metrics & Analytics
  getMetrics: () => request<MetricSummary>('/metrics'),
  getEvents: (limit: number = 50) =>
    request<Array<{ id: number; category: string; level: string; message: string; occurred_at: string }>>(
      `/events?limit=${limit}`
    ),

  // Maintenance
  getMaintenanceJobs: () => request<MaintenanceJob[]>('/maintenance/jobs'),
  createMaintenanceJob: (job: Partial<MaintenanceJob>) =>
    request<MaintenanceJob>('/maintenance/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    }),
  optimizeMaintenance: (params?: { max_train_delay_min?: number; max_wait_penalty?: number }) =>
    request<{ job_id: string; status: string }>('/maintenance/optimize', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),

  // Schedule Optimizer (CP-SAT)
  optimizeSchedule: (params?: { max_delay_min?: number; time_limit_s?: number }) =>
    request<{ job_id: string; status: string }>('/optimize/schedule', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),

  // Jobs
  getJobStatus: (jobId: string) =>
    request<{ id: string; job_type: string; status: string; progress: number; result: any; error_message?: string }>(
      `/jobs/${jobId}`,
      { timeoutMs: 10000 }
    ),

  // Scenarios
  getScenarios: () => request<any[]>('/scenarios'),
  createScenario: (data: any) =>
    request<any>('/scenarios', {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 15000,
    }),
  runScenario: (scenarioId: number) =>
    request<ScenarioRunResult>(`/scenarios/${scenarioId}/run`, {
      method: 'POST',
      timeoutMs: 25000,
    }),
  applyScenario: (scenarioId: number) =>
    request<{ status: string; active_conflicts: number }>(`/scenarios/${scenarioId}/apply`, {
      method: 'POST',
      timeoutMs: 15000,
    }),
  resetScenario: () =>
    request<{ status: string; baseline_conflicts: number }>('/scenarios/reset', {
      method: 'POST',
      timeoutMs: 15000,
    }),
};
