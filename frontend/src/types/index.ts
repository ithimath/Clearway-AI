export interface Station {
  id: number;
  code: string;
  name: string;
  lat: number;
  lon: number;
  is_junction: boolean;
  has_passing_loop: boolean;
  platform_count: number;
  provenance: string;
}

export interface TrackSection {
  id: number;
  from_station_id: number;
  to_station_id: number;
  from_station_code?: string;
  to_station_code?: string;
  running_time_min: number;
  distance_km: number;
  is_double_track: boolean;
  headway_min: number;
  provenance: string;
}

export type BlockState = 'available' | 'occupied' | 'reserved' | 'closed' | 'conflicted';

export interface Block {
  id: number;
  code: string;
  section_id: number;
  block_index: number;
  time_fraction: number;
  state: BlockState;
  provenance: string;
  section_from?: string;
  section_to?: string;
}

export interface Junction {
  id: number;
  code: string;
  name: string;
  station_id?: number;
  section_ids_json: string;
  provenance: string;
}

export interface PassingLoop {
  id: number;
  code: string;
  station_id: number;
  capacity_trains: number;
  provenance: string;
}

export interface NetworkResponse {
  stations: Station[];
  sections: TrackSection[];
  blocks: Block[];
  junctions: Junction[];
  loops: PassingLoop[];
  provenance_summary: Record<string, string>;
}

export interface StopTime {
  id?: number;
  train_id?: number;
  station_id?: number;
  station_code?: string;
  stop_sequence: number;
  planned_arrival_min: number | null;
  planned_departure_min: number | null;
  revised_arrival_min?: number | null;
  revised_departure_min?: number | null;
  dwell_min: number;
  provenance: string;
}

export interface Train {
  id: number;
  train_number: string;
  name: string;
  train_type: string;
  direction: 'up' | 'down';
  priority: number;
  is_active: boolean;
  provenance: string;
  stops?: StopTime[];
}

export interface TrainSimState {
  train_number: string;
  name: string;
  direction: 'up' | 'down';
  priority: number;
  status: 'waiting' | 'en_route' | 'at_station' | 'arrived' | 'held';
  current_stop_idx: number;
  delay_min: number;
  current_block: string | null;
  actual_departure_min: number | null;
  actual_arrival_min: number | null;
}

export interface BlockSimState {
  code: string;
  state: BlockState;
  current_train: string | null;
  reserved_entry_min: number | null;
  expected_exit_min: number | null;
  direction: string | null;
  section_from: string;
  section_to: string;
}

export interface SimulationState {
  initialized: boolean;
  current_time_min: number;
  is_running: boolean;
  speed_factor: number;
  step_count: number;
  trains: Record<string, TrainSimState>;
  blocks: Record<string, BlockSimState>;
}

export type ConflictSeverity = 'critical' | 'major' | 'minor';
export type ConflictType = 
  | 'single_track_head_on' 
  | 'block_headway' 
  | 'junction_headway' 
  | 'maintenance_overlap'
  | 'station_capacity';

export interface ConflictRecord {
  id?: number;
  conflict_type: ConflictType;
  severity: ConflictSeverity;
  block_code: string | null;
  station_code: string | null;
  train_1_number: string;
  train_2_number: string;
  start_time_min: number;
  end_time_min: number;
  explanation: string;
  suggested_action?: string;
  provenance: string;
  is_resolved?: boolean;
}

export interface MetricSummary {
  trains: {
    total: number;
    active: number;
    provenance: string;
  };
  blocks: {
    total: number;
    occupied: number;
    available: number;
    closed: number;
    conflicted: number;
    provenance: string;
  };
  delays: {
    avg_min: number;
    total_min: number;
    on_time_pct: number;
    provenance: string;
  };
  conflicts: {
    total: number;
    critical: number;
    provenance: string;
  };
}

export interface MaintenanceJob {
  id?: number;
  job_name: string;
  section_id?: number;
  block_code?: string;
  earliest_start_min: number;
  latest_end_min: number;
  duration_min: number;
  priority: number;
  status: 'requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  assigned_start_min?: number | null;
  assigned_end_min?: number | null;
  provenance: string;
}

export interface ScenarioDefinition {
  id?: number;
  name: string;
  description?: string;
  delay_train_number?: string;
  delay_minutes?: number;
  block_to_close?: string;
  closure_duration_min?: number;
  created_at?: string;
}
