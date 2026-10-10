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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API Error ${res.status}: ${errorBody || res.statusText}`);
  }

  return res.json();
}

export const api = {
  // Health
  getHealth: () => request<{ status: string; version: string }>('/health'),

  // Network & Infrastructure
  getNetwork: () => request<NetworkResponse>('/network'),
  getTrains: () => request<Train[]>('/trains'),
  getBlocks: () => request<Block[]>('/blocks'),

  // Conflicts
  getConflicts: () => request<{ conflicts: ConflictRecord[]; count: number }>('/conflicts/list'),
  detectConflicts: () => request<{ conflicts: ConflictRecord[]; count: number }>('/conflicts/detect', { method: 'POST' }),

  // Simulation
  getSimState: () => request<SimulationState>('/simulation/state'),
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
      `/jobs/${jobId}`
    ),

  // Scenarios
  getScenarios: () => request<any[]>('/scenarios'),
  createScenario: (data: any) =>
    request<any>('/scenarios', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  runScenario: (scenarioId: number) =>
    request<any>(`/scenarios/${scenarioId}/run`, {
      method: 'POST',
    }),
};
