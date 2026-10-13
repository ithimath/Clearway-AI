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

const inFlightGetRequests = new Map<string, Promise<any>>();
let networkMemoryCache: NetworkResponse | null = null;

async function request<T>(endpoint: string, options?: RequestInit & { timeoutMs?: number; bypassDedupe?: boolean }): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const method = (options?.method || 'GET').toUpperCase();
  const timeoutMs = options?.timeoutMs ?? (method === 'GET' ? 12000 : 30000);

  // Return existing in-flight promise for concurrent identical GET requests
  const isIdempotentGet = method === 'GET' && !options?.bypassDedupe;
  if (isIdempotentGet && inFlightGetRequests.has(url)) {
    return inFlightGetRequests.get(url) as Promise<T>;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fetchPromise = (async () => {
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
            'API 502: Bad Gateway. Clearway AI backend service at 127.0.0.1:8000 is unreachable.'
          );
        }
        if (res.status === 504) {
          throw new Error('API 504: Gateway Timeout. Server took too long to complete operation.');
        }

        throw new Error(`API ${res.status}: ${errorBody || res.statusText}`);
      }

      return await res.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s. Please check if the backend is responsive.`);
      }
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        throw new Error('Unable to connect to Clearway AI backend at http://127.0.0.1:8000. Is the server running?');
      }
      throw err;
    } finally {
      if (isIdempotentGet) {
        inFlightGetRequests.delete(url);
      }
    }
  })();

  if (isIdempotentGet) {
    inFlightGetRequests.set(url, fetchPromise);
  }

  return fetchPromise;
}

export const api = {
  // Health
  getHealth: () => request<{ status: string; version: string }>('/health', { timeoutMs: 4000 }),

  // Network & Infrastructure (caches static network topology)
  getNetwork: async (forceRefresh: boolean = false): Promise<NetworkResponse> => {
    if (!forceRefresh && networkMemoryCache) {
      return networkMemoryCache;
    }
    const data = await request<NetworkResponse>('/network', { timeoutMs: 10000 });
    networkMemoryCache = data;
    return data;
  },
  getTrains: () => request<Train[]>('/trains', { timeoutMs: 10000 }),
  getBlocks: () => request<Block[]>('/blocks', { timeoutMs: 10000 }),

  // Conflicts
  getConflicts: (context: string = 'baseline') =>
    request<any>(`/conflicts/list?context=${context}`, { timeoutMs: 12000 })
      .catch((err) => {
        // Only fallback to legacy endpoint if 404
        if (err.message?.includes('404')) {
          return request<any>(`/conflicts?context=${context}`, { timeoutMs: 12000 });
        }
        throw err;
      })
      .then((res) => (Array.isArray(res) ? { conflicts: res, count: res.length } : res || { conflicts: [], count: 0 })),
  detectConflicts: (useRevised: boolean = false, context: string = 'baseline') =>
    request<{ conflicts: ConflictRecord[]; count: number }>(`/conflicts/detect?use_revised=${useRevised}&context=${context}`, {
      method: 'POST',
      timeoutMs: 20000,
    }),

  // Simulation
  getSimState: () => request<SimulationState>('/simulation/state', { timeoutMs: 4000, bypassDedupe: true }),
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
