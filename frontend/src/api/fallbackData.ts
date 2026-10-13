import type {
  NetworkResponse,
  Train,
  ConflictRecord,
  SimulationState,
  MetricSummary,
  MaintenanceJob,
} from '../types';

export const FALLBACK_NETWORK: NetworkResponse = {
  stations: [
    { id: 1, code: 'MS', name: 'Chennai Egmore', lat: 13.0827, lon: 80.2707, is_junction: true, has_passing_loop: false, platform_count: 11, provenance: 'ASSUMED' },
    { id: 2, code: 'TBM', name: 'Tambaram', lat: 12.9249, lon: 80.1278, is_junction: true, has_passing_loop: true, platform_count: 8, provenance: 'ASSUMED' },
    { id: 3, code: 'CGL', name: 'Chengalpattu Jn', lat: 12.6841, lon: 79.9836, is_junction: true, has_passing_loop: true, platform_count: 6, provenance: 'ASSUMED' },
    { id: 4, code: 'VM', name: 'Villupuram Jn', lat: 11.9398, lon: 79.492, is_junction: true, has_passing_loop: true, platform_count: 6, provenance: 'ASSUMED' },
    { id: 5, code: 'TPJ', name: 'Tiruchirappalli Jn', lat: 10.7905, lon: 78.7047, is_junction: true, has_passing_loop: true, platform_count: 8, provenance: 'ASSUMED' },
    { id: 6, code: 'DG', name: 'Dindigul Jn', lat: 10.3624, lon: 77.9695, is_junction: true, has_passing_loop: true, platform_count: 5, provenance: 'ASSUMED' },
    { id: 7, code: 'MDU', name: 'Madurai Jn', lat: 9.9195, lon: 78.1193, is_junction: true, has_passing_loop: false, platform_count: 8, provenance: 'ASSUMED' },
    { id: 8, code: 'TJ', name: 'Thanjavur Jn', lat: 10.787, lon: 79.1378, is_junction: true, has_passing_loop: true, platform_count: 5, provenance: 'ASSUMED' },
    { id: 9, code: 'SA', name: 'Salem Jn', lat: 11.6643, lon: 78.146, is_junction: true, has_passing_loop: true, platform_count: 6, provenance: 'ASSUMED' },
    { id: 10, code: 'KPD', name: 'Katpadi Jn', lat: 12.9796, lon: 79.1368, is_junction: true, has_passing_loop: true, platform_count: 6, provenance: 'ASSUMED' },
  ],
  sections: [
    { id: 1, from_station_id: 1, to_station_id: 3, from_station_code: 'MS', to_station_code: 'CGL', running_time_min: 55, distance_km: 55.0, is_double_track: true, headway_min: 3, provenance: 'ASSUMED' },
    { id: 2, from_station_id: 3, to_station_id: 4, from_station_code: 'CGL', to_station_code: 'VM', running_time_min: 90, distance_km: 90.0, is_double_track: false, headway_min: 5, provenance: 'ASSUMED' },
    { id: 3, from_station_id: 4, to_station_id: 5, from_station_code: 'VM', to_station_code: 'TPJ', running_time_min: 120, distance_km: 120.0, is_double_track: true, headway_min: 4, provenance: 'ASSUMED' },
    { id: 4, from_station_id: 5, to_station_id: 7, from_station_code: 'TPJ', to_station_code: 'MDU', running_time_min: 100, distance_km: 100.0, is_double_track: true, headway_min: 4, provenance: 'ASSUMED' },
    { id: 5, from_station_id: 5, to_station_id: 6, from_station_code: 'TPJ', to_station_code: 'DG', running_time_min: 65, distance_km: 65.0, is_double_track: false, headway_min: 5, provenance: 'ASSUMED' },
    { id: 6, from_station_id: 6, to_station_id: 7, from_station_code: 'DG', to_station_code: 'MDU', running_time_min: 45, distance_km: 45.0, is_double_track: false, headway_min: 5, provenance: 'ASSUMED' },
    { id: 7, from_station_id: 1, to_station_id: 8, from_station_code: 'MS', to_station_code: 'TJ', running_time_min: 180, distance_km: 180.0, is_double_track: true, headway_min: 4, provenance: 'ASSUMED' },
    { id: 8, from_station_id: 8, to_station_id: 7, from_station_code: 'TJ', to_station_code: 'MDU', running_time_min: 120, distance_km: 120.0, is_double_track: true, headway_min: 4, provenance: 'ASSUMED' },
    { id: 9, from_station_id: 3, to_station_id: 10, from_station_code: 'CGL', to_station_code: 'KPD', running_time_min: 90, distance_km: 90.0, is_double_track: true, headway_min: 4, provenance: 'ASSUMED' },
    { id: 10, from_station_id: 5, to_station_id: 9, from_station_code: 'TPJ', to_station_code: 'SA', running_time_min: 140, distance_km: 140.0, is_double_track: false, headway_min: 5, provenance: 'ASSUMED' },
  ],
  blocks: [
    { id: 1, code: 'BLK-MS-CGL-0', section_id: 1, section_from: 'MS', section_to: 'CGL', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 2, code: 'BLK-MS-CGL-1', section_id: 1, section_from: 'MS', section_to: 'CGL', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 3, code: 'BLK-CGL-VM-0', section_id: 2, section_from: 'CGL', section_to: 'VM', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 4, code: 'BLK-CGL-VM-1', section_id: 2, section_from: 'CGL', section_to: 'VM', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 5, code: 'BLK-VM-TPJ-0', section_id: 3, section_from: 'VM', section_to: 'TPJ', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 6, code: 'BLK-VM-TPJ-1', section_id: 3, section_from: 'VM', section_to: 'TPJ', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 7, code: 'BLK-TPJ-MDU-0', section_id: 4, section_from: 'TPJ', section_to: 'MDU', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 8, code: 'BLK-TPJ-MDU-1', section_id: 4, section_from: 'TPJ', section_to: 'MDU', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 9, code: 'BLK-TPJ-DG-0', section_id: 5, section_from: 'TPJ', section_to: 'DG', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 10, code: 'BLK-TPJ-DG-1', section_id: 5, section_from: 'TPJ', section_to: 'DG', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 11, code: 'BLK-DG-MDU-0', section_id: 6, section_from: 'DG', section_to: 'MDU', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 12, code: 'BLK-DG-MDU-1', section_id: 6, section_from: 'DG', section_to: 'MDU', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 13, code: 'BLK-MS-TJ-0', section_id: 7, section_from: 'MS', section_to: 'TJ', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 14, code: 'BLK-MS-TJ-1', section_id: 7, section_from: 'MS', section_to: 'TJ', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 15, code: 'BLK-TJ-MDU-0', section_id: 8, section_from: 'TJ', section_to: 'MDU', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 16, code: 'BLK-TJ-MDU-1', section_id: 8, section_from: 'TJ', section_to: 'MDU', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 17, code: 'BLK-CGL-KPD-0', section_id: 9, section_from: 'CGL', section_to: 'KPD', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 18, code: 'BLK-CGL-KPD-1', section_id: 9, section_from: 'CGL', section_to: 'KPD', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 19, code: 'BLK-TPJ-SA-0', section_id: 10, section_from: 'TPJ', section_to: 'SA', block_index: 0, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
    { id: 20, code: 'BLK-TPJ-SA-1', section_id: 10, section_from: 'TPJ', section_to: 'SA', block_index: 1, time_fraction: 0.5, state: 'available', provenance: 'ASSUMED' },
  ],
  junctions: [
    { id: 1, code: 'JN-MS', name: 'Chennai Egmore Junction', station_id: 1, section_ids_json: '["MS-CGL","MS-TJ"]', provenance: 'ASSUMED' },
    { id: 2, code: 'JN-CGL', name: 'Chengalpattu Junction', station_id: 3, section_ids_json: '["MS-CGL","CGL-VM","CGL-KPD"]', provenance: 'ASSUMED' },
    { id: 3, code: 'JN-VM', name: 'Villupuram Junction', station_id: 4, section_ids_json: '["CGL-VM","VM-TPJ"]', provenance: 'ASSUMED' },
    { id: 4, code: 'JN-TPJ', name: 'Tiruchirappalli Junction', station_id: 5, section_ids_json: '["VM-TPJ","TPJ-MDU","TPJ-DG","TPJ-SA"]', provenance: 'ASSUMED' },
    { id: 5, code: 'JN-MDU', name: 'Madurai Junction', station_id: 7, section_ids_json: '["TPJ-MDU","DG-MDU","TJ-MDU"]', provenance: 'ASSUMED' },
  ],
  loops: [
    { id: 1, code: 'LP-CGL', station_id: 3, capacity_trains: 2, provenance: 'ASSUMED' },
    { id: 2, code: 'LP-VM', station_id: 4, capacity_trains: 2, provenance: 'ASSUMED' },
    { id: 3, code: 'LP-TPJ', station_id: 5, capacity_trains: 3, provenance: 'ASSUMED' },
    { id: 4, code: 'LP-DG', station_id: 6, capacity_trains: 2, provenance: 'ASSUMED' },
    { id: 5, code: 'LP-TJ', station_id: 8, capacity_trains: 2, provenance: 'ASSUMED' },
  ],
  provenance_summary: {
    dataset: 'Southern Railway Corridor (Chennai - Madurai)',
    status: 'High-Fidelity Resilient Baseline',
    source: 'Clearway AI Domain Model'
  }
};

export const FALLBACK_TRAINS: Train[] = [
  {
    id: 1,
    train_number: '12635',
    name: 'Vaigai Superfast Express',
    train_type: 'Superfast',
    direction: 'up',
    priority: 1,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MS',
    destination: 'MDU',
    planned_departure_min: 360,
    planned_arrival_min: 780,
    stop_count: 5,
    stops: [
      { stop_sequence: 1, station_code: 'MS', planned_arrival_min: null, planned_departure_min: 360, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'CGL', planned_arrival_min: 415, planned_departure_min: 420, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'VM', planned_arrival_min: 510, planned_departure_min: 515, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 4, station_code: 'TPJ', planned_arrival_min: 635, planned_departure_min: 645, dwell_min: 10, provenance: 'ASSUMED' },
      { stop_sequence: 5, station_code: 'MDU', planned_arrival_min: 745, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  },
  {
    id: 2,
    train_number: '12636',
    name: 'Vaigai Superfast Express (Return)',
    train_type: 'Superfast',
    direction: 'down',
    priority: 1,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MDU',
    destination: 'MS',
    planned_departure_min: 420,
    planned_arrival_min: 840,
    stop_count: 5,
    stops: [
      { stop_sequence: 1, station_code: 'MDU', planned_arrival_min: null, planned_departure_min: 420, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'TPJ', planned_arrival_min: 520, planned_departure_min: 530, dwell_min: 10, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'VM', planned_arrival_min: 650, planned_departure_min: 655, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 4, station_code: 'CGL', planned_arrival_min: 745, planned_departure_min: 750, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 5, station_code: 'MS', planned_arrival_min: 805, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  },
  {
    id: 3,
    train_number: '22671',
    name: 'Tejas Express',
    train_type: 'Premium Express',
    direction: 'up',
    priority: 1,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MS',
    destination: 'MDU',
    planned_departure_min: 390,
    planned_arrival_min: 770,
    stop_count: 4,
    stops: [
      { stop_sequence: 1, station_code: 'MS', planned_arrival_min: null, planned_departure_min: 390, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'VM', planned_arrival_min: 525, planned_departure_min: 528, dwell_min: 3, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'TPJ', planned_arrival_min: 640, planned_departure_min: 645, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 4, station_code: 'MDU', planned_arrival_min: 740, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  },
  {
    id: 4,
    train_number: '12637',
    name: 'Pandian Superfast Express',
    train_type: 'Superfast',
    direction: 'up',
    priority: 2,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MS',
    destination: 'MDU',
    planned_departure_min: 450,
    planned_arrival_min: 880,
    stop_count: 5,
    stops: [
      { stop_sequence: 1, station_code: 'MS', planned_arrival_min: null, planned_departure_min: 450, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'CGL', planned_arrival_min: 508, planned_departure_min: 512, dwell_min: 4, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'VM', planned_arrival_min: 605, planned_departure_min: 610, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 4, station_code: 'TPJ', planned_arrival_min: 730, planned_departure_min: 740, dwell_min: 10, provenance: 'ASSUMED' },
      { stop_sequence: 5, station_code: 'MDU', planned_arrival_min: 840, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  },
  {
    id: 5,
    train_number: 'CONTR-801',
    name: 'Container Freight Rail',
    train_type: 'Freight',
    direction: 'up',
    priority: 4,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MS',
    destination: 'TPJ',
    planned_departure_min: 340,
    planned_arrival_min: 660,
    stop_count: 3,
    stops: [
      { stop_sequence: 1, station_code: 'MS', planned_arrival_min: null, planned_departure_min: 340, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'VM', planned_arrival_min: 515, planned_departure_min: 540, dwell_min: 25, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'TPJ', planned_arrival_min: 680, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  },
  {
    id: 6,
    train_number: '12653',
    name: 'Rockfort Express',
    train_type: 'Superfast',
    direction: 'up',
    priority: 2,
    is_active: true,
    provenance: 'ASSUMED',
    origin: 'MS',
    destination: 'TPJ',
    planned_departure_min: 480,
    planned_arrival_min: 790,
    stop_count: 4,
    stops: [
      { stop_sequence: 1, station_code: 'MS', planned_arrival_min: null, planned_departure_min: 480, dwell_min: 0, provenance: 'ASSUMED' },
      { stop_sequence: 2, station_code: 'CGL', planned_arrival_min: 535, planned_departure_min: 540, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 3, station_code: 'VM', planned_arrival_min: 630, planned_departure_min: 635, dwell_min: 5, provenance: 'ASSUMED' },
      { stop_sequence: 4, station_code: 'TPJ', planned_arrival_min: 755, planned_departure_min: null, dwell_min: 0, provenance: 'ASSUMED' },
    ]
  }
];

export const FALLBACK_CONFLICTS: ConflictRecord[] = [
  {
    id: 1,
    conflict_uid: 'CONF-HEADWAY-CGL-VM-01',
    conflict_type: 'opposing_movement',
    severity: 'critical',
    trains: ['12635', '12636'],
    train_1_number: '12635',
    train_2_number: '12636',
    block_code: 'BLK-CGL-VM-0',
    station_code: 'CGL',
    start_time_min: 510,
    end_time_min: 535,
    explanation: 'Single track opposing movement: Up train 12635 and Down train 12636 overlap on single-track section CGL-VM without passing loop clearance.',
    suggested_action: 'Hold train 12636 at Villupuram Jn (VM) loop for 18 minutes to allow high-priority 12635 pass.',
    provenance: 'ASSUMED',
    is_resolved: false
  },
  {
    id: 2,
    conflict_uid: 'CONF-JUNCTION-TPJ-02',
    conflict_type: 'junction_conflict',
    severity: 'major',
    trains: ['22671', 'CONTR-801'],
    train_1_number: '22671',
    train_2_number: 'CONTR-801',
    block_code: 'BLK-VM-TPJ-1',
    station_code: 'TPJ',
    start_time_min: 638,
    end_time_min: 648,
    explanation: 'Junction platform headway conflict at Tiruchirappalli Junction between passenger Tejas 22671 and Freight CONTR-801.',
    suggested_action: 'Reroute freight CONTR-801 to goods siding loop LP-TPJ; prioritize passenger express 22671.',
    provenance: 'ASSUMED',
    is_resolved: false
  },
  {
    id: 3,
    conflict_uid: 'CONF-BLOCK-VM-03',
    conflict_type: 'block_headway',
    severity: 'minor',
    trains: ['12635', '22671'],
    train_1_number: '12635',
    train_2_number: '22671',
    block_code: 'BLK-MS-CGL-1',
    station_code: 'VM',
    start_time_min: 418,
    end_time_min: 423,
    explanation: 'Headway violation: 22671 follows 12635 at 2.4 minutes interval, below mandatory 3.0 minute safety block headway.',
    suggested_action: 'Stagger departure of 22671 from Chennai Egmore by +3 minutes.',
    provenance: 'ASSUMED',
    is_resolved: false
  }
];

export const FALLBACK_METRICS: MetricSummary = {
  trains: {
    total: 12,
    active: 6,
    provenance: 'ASSUMED'
  },
  blocks: {
    total: 20,
    occupied: 4,
    available: 14,
    closed: 1,
    conflicted: 1,
    provenance: 'ASSUMED'
  },
  delays: {
    avg_min: 4.2,
    total_min: 50.4,
    on_time_pct: 94.6,
    provenance: 'ASSUMED'
  },
  conflicts: {
    total: 3,
    critical: 1,
    provenance: 'ASSUMED'
  }
};

export const FALLBACK_MAINTENANCE_JOBS: MaintenanceJob[] = [
  {
    id: 1,
    job_name: 'Overhead Traction OHE Wire Inspection',
    block_code: 'BLK-VM-TPJ-0',
    earliest_start_min: 480,
    latest_end_min: 600,
    duration_min: 60,
    priority: 2,
    status: 'scheduled',
    assigned_start_min: 490,
    assigned_end_min: 550,
    provenance: 'ASSUMED'
  },
  {
    id: 2,
    job_name: 'Automatic Signaling Sensor Calibration',
    block_code: 'BLK-MS-CGL-1',
    earliest_start_min: 600,
    latest_end_min: 780,
    duration_min: 45,
    priority: 1,
    status: 'requested',
    provenance: 'ASSUMED'
  },
  {
    id: 3,
    job_name: 'Track Tamping and Ballast Regulating',
    block_code: 'BLK-TPJ-DG-0',
    earliest_start_min: 700,
    latest_end_min: 900,
    duration_min: 90,
    priority: 3,
    status: 'requested',
    provenance: 'ASSUMED'
  }
];

export const FALLBACK_SIM_STATE: SimulationState = {
  initialized: true,
  current_time_min: 435,
  is_running: false,
  speed_factor: 1,
  step_count: 15,
  trains: {
    '12635': {
      train_number: '12635',
      name: 'Vaigai Superfast Express',
      direction: 'up',
      priority: 1,
      status: 'en_route',
      current_stop_idx: 2,
      delay_min: 0,
      current_block: 'BLK-CGL-VM-0',
      actual_departure_min: 360,
      actual_arrival_min: null
    },
    '12636': {
      train_number: '12636',
      name: 'Vaigai Superfast Express (Return)',
      direction: 'down',
      priority: 1,
      status: 'en_route',
      current_stop_idx: 1,
      delay_min: 3,
      current_block: 'BLK-VM-TPJ-1',
      actual_departure_min: 420,
      actual_arrival_min: null
    },
    '22671': {
      train_number: '22671',
      name: 'Tejas Express',
      direction: 'up',
      priority: 1,
      status: 'en_route',
      current_stop_idx: 1,
      delay_min: 0,
      current_block: 'BLK-MS-CGL-1',
      actual_departure_min: 390,
      actual_arrival_min: null
    },
    '12637': {
      train_number: '12637',
      name: 'Pandian Superfast Express',
      direction: 'up',
      priority: 2,
      status: 'waiting',
      current_stop_idx: 0,
      delay_min: 0,
      current_block: null,
      actual_departure_min: null,
      actual_arrival_min: null
    },
    'CONTR-801': {
      train_number: 'CONTR-801',
      name: 'Container Freight Rail',
      direction: 'up',
      priority: 4,
      status: 'at_station',
      current_stop_idx: 1,
      delay_min: 12,
      current_block: 'BLK-CGL-VM-1',
      actual_departure_min: 340,
      actual_arrival_min: null
    }
  },
  blocks: {
    'BLK-MS-CGL-0': { code: 'BLK-MS-CGL-0', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'MS', section_to: 'CGL' },
    'BLK-MS-CGL-1': { code: 'BLK-MS-CGL-1', state: 'occupied', current_train: '22671', reserved_entry_min: 420, expected_exit_min: 445, direction: 'up', section_from: 'MS', section_to: 'CGL' },
    'BLK-CGL-VM-0': { code: 'BLK-CGL-VM-0', state: 'occupied', current_train: '12635', reserved_entry_min: 425, expected_exit_min: 470, direction: 'up', section_from: 'CGL', section_to: 'VM' },
    'BLK-CGL-VM-1': { code: 'BLK-CGL-VM-1', state: 'reserved', current_train: 'CONTR-801', reserved_entry_min: 430, expected_exit_min: 490, direction: 'up', section_from: 'CGL', section_to: 'VM' },
    'BLK-VM-TPJ-0': { code: 'BLK-VM-TPJ-0', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'VM', section_to: 'TPJ' },
    'BLK-VM-TPJ-1': { code: 'BLK-VM-TPJ-1', state: 'occupied', current_train: '12636', reserved_entry_min: 425, expected_exit_min: 485, direction: 'down', section_from: 'VM', section_to: 'TPJ' },
    'BLK-TPJ-MDU-0': { code: 'BLK-TPJ-MDU-0', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'TPJ', section_to: 'MDU' },
    'BLK-TPJ-MDU-1': { code: 'BLK-TPJ-MDU-1', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'TPJ', section_to: 'MDU' },
    'BLK-TPJ-DG-0': { code: 'BLK-TPJ-DG-0', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'TPJ', section_to: 'DG' },
    'BLK-TPJ-DG-1': { code: 'BLK-TPJ-DG-1', state: 'available', current_train: null, reserved_entry_min: null, expected_exit_min: null, direction: null, section_from: 'TPJ', section_to: 'DG' },
  }
};
