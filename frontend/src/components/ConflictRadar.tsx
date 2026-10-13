import React, { useState, useMemo } from 'react';
import type { ConflictRecord } from '../types';
import { ShieldCheck, RefreshCw, Zap, Clock, MapPin, Search, Compass, AlertOctagon, AlertTriangle, Info, ArrowRight } from 'lucide-react';

interface ConflictRadarProps {
  conflicts: ConflictRecord[];
  onRefreshConflicts: () => void;
  onTriggerOptimizer: () => void;
  isLoading?: boolean;
  selectedConflictId?: string | null;
  onSelectConflict?: (conflict: ConflictRecord | null) => void;
  onNavigateToStringline?: () => void;
}

export const ConflictRadar: React.FC<ConflictRadarProps> = ({
  conflicts,
  onRefreshConflicts,
  onTriggerOptimizer,
  isLoading = false,
  selectedConflictId = null,
  onSelectConflict,
  onNavigateToStringline,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'major' | 'minor'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchTrain, setSearchTrain] = useState<string>('');
  const [radarHoveredConflict, setRadarHoveredConflict] = useState<ConflictRecord | null>(null);

  const formatMin = (m?: number | null) => {
    if (m === undefined || m === null) return '--:--';
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  const getNormalizedSeverity = (c: ConflictRecord): 'critical' | 'major' | 'minor' => {
    const s = String(c.severity).toLowerCase();
    if (s === 'critical') return 'critical';
    if (s === 'major' || s === 'high') return 'major';
    return 'minor';
  };

  const criticalCount = useMemo(() => conflicts.filter((c) => getNormalizedSeverity(c) === 'critical').length, [conflicts]);
  const majorCount = useMemo(() => conflicts.filter((c) => getNormalizedSeverity(c) === 'major').length, [conflicts]);
  const minorCount = useMemo(() => conflicts.filter((c) => getNormalizedSeverity(c) === 'minor').length, [conflicts]);

  const filteredConflicts = useMemo(() => {
    return conflicts.filter((c) => {
      const normSev = getNormalizedSeverity(c);
      if (severityFilter !== 'all' && normSev !== severityFilter) return false;

      if (typeFilter !== 'all' && c.conflict_type !== typeFilter) return false;

      if (searchTrain.trim()) {
        const query = searchTrain.trim().toLowerCase();
        const t1 = (c.train_1_number || '').toLowerCase();
        const t2 = (c.train_2_number || '').toLowerCase();
        const trains = (c.trains || []).join(' ').toLowerCase();
        if (!t1.includes(query) && !t2.includes(query) && !trains.includes(query)) return false;
      }

      return true;
    });
  }, [conflicts, severityFilter, typeFilter, searchTrain]);

  const selectedConflict = useMemo(() => {
    if (!selectedConflictId) return null;
    return conflicts.find((c) => c.conflict_uid === selectedConflictId || String(c.id) === selectedConflictId) || null;
  }, [conflicts, selectedConflictId]);

  const handleSelect = (c: ConflictRecord | null) => {
    if (onSelectConflict) {
      if (c && (c.conflict_uid === selectedConflictId || String(c.id) === selectedConflictId)) {
        onSelectConflict(null); // toggle off
      } else {
        onSelectConflict(c);
      }
    }
  };

  const getSeverityBadge = (severity: string) => {
    const norm = String(severity).toLowerCase();
    if (norm === 'critical') {
      return (
        <span
          style={{
            background: 'rgba(244, 63, 94, 0.15)',
            color: '#f43f5e',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.72rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <AlertOctagon size={11} /> CRITICAL
        </span>
      );
    }
    if (norm === 'major' || norm === 'high') {
      return (
        <span
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.72rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <AlertTriangle size={11} /> MAJOR
        </span>
      );
    }
    return (
      <span
        style={{
          background: 'rgba(56, 189, 248, 0.15)',
          color: '#38bdf8',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: '0.72rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Info size={11} /> MINOR
      </span>
    );
  };

  // Radar Scope Dimensions & Polar Coordinates
  const radarSize = 340;
  const radarRadius = (radarSize - 40) / 2;
  const radarCenter = radarSize / 2;

  // Convert conflict to polar coordinates on radar scope
  const radarBlips = useMemo(() => {
    return conflicts.map((c, idx) => {
      const startTime = c.interval_start_min ?? c.start_time_min ?? 360;
      // Map time (05:00 to 22:00 = 300 to 1320 min) to angle (0 to 360 deg)
      const minTime = 300;
      const maxTime = 1320;
      const fraction = Math.max(0, Math.min(1, (startTime - minTime) / (maxTime - minTime)));
      const angle = fraction * 2 * Math.PI - Math.PI / 2; // top is morning 05:00

      // Map severity / resource to radius:
      // Critical -> innermost rings (most urgent), Major -> middle, Minor -> outer
      const normSev = getNormalizedSeverity(c);
      let rRatio = 0.4;
      if (normSev === 'major') rRatio = 0.65;
      if (normSev === 'minor') rRatio = 0.88;

      // Slight deterministic jitter by idx so overlapping times separate slightly
      const r = radarRadius * (rRatio + (idx % 3) * 0.05);

      const x = radarCenter + r * Math.cos(angle);
      const y = radarCenter + r * Math.sin(angle);

      return {
        conflict: c,
        x,
        y,
        normSev,
        isSelected: c.conflict_uid === selectedConflictId || String(c.id) === selectedConflictId,
      };
    });
  }, [conflicts, selectedConflictId, radarRadius, radarCenter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '18px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.18rem',
              fontWeight: 600,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>Conflict Radar & Safety Rule Violation Feed</span>
            <span className="provenance-tag provenance-derived">REAL-TIME SAFETY AUDIT</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Continuous scan across block headway constraints, single-track opposing train paths, junction convergence, and maintenance closures.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={onRefreshConflicts}
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} className={isLoading ? 'pulse-active' : ''} />
            <span>{isLoading ? 'Scanning Network…' : 'Scan Timetable'}</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={onTriggerOptimizer}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Zap size={14} />
            <span>Resolve via CP-SAT</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <div
          className="glass-panel interactive-card"
          style={{
            padding: 16,
            cursor: 'pointer',
            borderColor: severityFilter === 'all' ? 'var(--accent-cyan)' : undefined,
            background: severityFilter === 'all' ? 'rgba(56, 189, 248, 0.05)' : undefined,
          }}
          onClick={() => setSeverityFilter('all')}
        >
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Detected Conflicts
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {conflicts.length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {conflicts.length === 0 ? 'Network is conflict-free' : 'Across corridor schedule'}
          </div>
        </div>

        <div
          className="glass-panel interactive-card"
          style={{
            padding: 16,
            cursor: 'pointer',
            borderColor: severityFilter === 'critical' ? '#f43f5e' : undefined,
            background: severityFilter === 'critical' ? 'rgba(244, 63, 94, 0.05)' : undefined,
          }}
          onClick={() => setSeverityFilter('critical')}
        >
          <div style={{ fontSize: '0.74rem', color: '#f43f5e', textTransform: 'uppercase', fontWeight: 600 }}>
            Critical Safety Violations
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#f43f5e', marginTop: 4 }}>
            {criticalCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Single-track opposing / block overlaps
          </div>
        </div>

        <div
          className="glass-panel interactive-card"
          style={{
            padding: 16,
            cursor: 'pointer',
            borderColor: severityFilter === 'major' ? '#f59e0b' : undefined,
            background: severityFilter === 'major' ? 'rgba(245, 158, 11, 0.05)' : undefined,
          }}
          onClick={() => setSeverityFilter('major')}
        >
          <div style={{ fontSize: '0.74rem', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 600 }}>
            Major Headway Issues
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
            {majorCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Below minimum block headway
          </div>
        </div>

        <div
          className="glass-panel interactive-card"
          style={{
            padding: 16,
            cursor: 'pointer',
            borderColor: severityFilter === 'minor' ? '#38bdf8' : undefined,
            background: severityFilter === 'minor' ? 'rgba(56, 189, 248, 0.05)' : undefined,
          }}
          onClick={() => setSeverityFilter('minor')}
        >
          <div style={{ fontSize: '0.74rem', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 600 }}>
            Minor / Junction Alerts
          </div>
          <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#38bdf8', marginTop: 4 }}>
            {minorCount}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Junction clearance & dwell warnings
          </div>
        </div>
      </div>

      {/* Main Radar Layout: Radar Scope + Conflict Feed + Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
        {/* Radar Scope Column */}
        <div className="glass-panel" style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600 }}>
              <Compass size={15} color="var(--accent-cyan)" />
              <span>Spatial Radar Scope</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              Angle = Time · Ring = Severity
            </span>
          </div>

          {/* SVG Radar Display */}
          <div style={{ position: 'relative', width: radarSize, height: radarSize }}>
            <svg width={radarSize} height={radarSize} style={{ display: 'block' }}>
              {/* Radar Background circle */}
              <circle cx={radarCenter} cy={radarCenter} r={radarRadius} fill="#060c18" stroke="#1e293b" strokeWidth="1.5" />

              {/* Concentric Range Rings */}
              <circle cx={radarCenter} cy={radarCenter} r={radarRadius * 0.4} fill="none" stroke="rgba(244, 63, 94, 0.25)" strokeDasharray="3,3" />
              <circle cx={radarCenter} cy={radarCenter} r={radarRadius * 0.65} fill="none" stroke="rgba(245, 158, 11, 0.2)" strokeDasharray="3,3" />
              <circle cx={radarCenter} cy={radarCenter} r={radarRadius * 0.88} fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeDasharray="3,3" />

              {/* Ring Labels */}
              <text x={radarCenter} y={radarCenter - radarRadius * 0.4 + 11} fill="rgba(244, 63, 94, 0.7)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">
                CRITICAL ZONE
              </text>
              <text x={radarCenter} y={radarCenter - radarRadius * 0.65 + 11} fill="rgba(245, 158, 11, 0.7)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">
                MAJOR ZONE
              </text>
              <text x={radarCenter} y={radarCenter - radarRadius * 0.88 + 11} fill="rgba(56, 189, 248, 0.7)" fontSize="8" textAnchor="middle" fontFamily="JetBrains Mono">
                MINOR ZONE
              </text>

              {/* Crosshair Axes */}
              <line x1={radarCenter} y1={20} x2={radarCenter} y2={radarSize - 20} stroke="var(--chart-grid)" />
              <line x1={20} y1={radarCenter} x2={radarSize - 20} y2={radarCenter} stroke="var(--chart-grid)" />

              {/* Direction Time Labels */}
              <text x={radarCenter} y={15} fill="var(--text-muted)" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">05:00</text>
              <text x={radarSize - 12} y={radarCenter + 3} fill="var(--text-muted)" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">09:00</text>
              <text x={radarCenter} y={radarSize - 6} fill="var(--text-muted)" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">14:00</text>
              <text x={12} y={radarCenter + 3} fill="var(--text-muted)" fontSize="9" textAnchor="start" fontFamily="JetBrains Mono">20:00</text>

              {/* Sweeping Radar Beam Animation */}
              <g transform={`rotate(45, ${radarCenter}, ${radarCenter})`}>
                <line x1={radarCenter} y1={radarCenter} x2={radarCenter} y2={radarCenter - radarRadius} stroke="var(--accent-primary)" strokeWidth="1.5" strokeOpacity="0.5" />
              </g>

              {/* Conflict Blips */}
              {radarBlips.map((b, i) => {
                const color = b.normSev === 'critical' ? 'var(--accent-rose)' : b.normSev === 'major' ? 'var(--accent-amber)' : 'var(--accent-primary)';
                return (
                  <g
                    key={b.conflict.conflict_uid || i}
                    transform={`translate(${b.x}, ${b.y})`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSelect(b.conflict)}
                    onMouseEnter={() => setRadarHoveredConflict(b.conflict)}
                    onMouseLeave={() => setRadarHoveredConflict(null)}
                  >
                    <circle r={b.isSelected ? 10 : 6} fill={color} fillOpacity={b.isSelected ? 0.4 : 0.25} className="pulse-active" />
                    <circle r={b.isSelected ? 4.5 : 3.5} fill={color} stroke="var(--bg-deep)" strokeWidth="1" />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Radar Hover / Selection Indicator */}
          <div style={{ marginTop: 12, width: '100%', fontSize: '0.76rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
            {radarHoveredConflict ? (
              <div style={{ background: 'var(--bg-surface-elevated)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{radarHoveredConflict.conflict_type.replace(/_/g, ' ').toUpperCase()}</strong>
                <div>Trains {radarHoveredConflict.train_1_number} & {radarHoveredConflict.train_2_number} · {formatMin(radarHoveredConflict.start_time_min ?? radarHoveredConflict.interval_start_min)}</div>
              </div>
            ) : (
              <span>Click any radar blip to inspect and highlight on stringline.</span>
            )}
          </div>
        </div>

        {/* Conflict List & Inspector Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Filters Toolbar */}
          <div
            className="glass-panel"
            style={{
              padding: '10px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--text-muted)' }}>Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1.5px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">All Conflict Types</option>
                <option value="opposing_movement">Opposing Movement (Single Track)</option>
                <option value="headway_violation">Headway Violation</option>
                <option value="reservation_overlap">Reservation Overlap</option>
                <option value="closure_conflict">Maintenance Closure Overlap</option>
                <option value="junction_conflict">Junction Clearance Conflict</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Filter by train # (e.g. 20606)"
                value={searchTrain}
                onChange={(e) => setSearchTrain(e.target.value)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1.5px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  outline: 'none',
                  width: 170,
                }}
              />
            </div>
          </div>

          {/* Selected Conflict Detail Card (if one is selected) */}
          {selectedConflict && (
            <div
              className="glass-panel"
              style={{
                padding: 18,
                border: '1.5px solid var(--accent-primary)',
                background: 'var(--bg-surface-elevated)',
                borderRadius: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {getSeverityBadge(selectedConflict.severity)}
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                    {selectedConflict.conflict_type.replace(/_/g, ' ').toUpperCase()}
                  </h3>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={() => handleSelect(null)}
                >
                  Deselect
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Involved Trains:</span>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8 }}>
                    <span style={{ background: 'var(--accent-cyan-subtle)', border: '1px solid var(--accent-primary)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, color: 'var(--accent-primary)' }}>
                      {selectedConflict.train_1_number}
                    </span>
                    {selectedConflict.train_2_number && (
                      <span style={{ background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber)', padding: '2px 8px', borderRadius: 4, fontWeight: 700, color: 'var(--accent-amber)' }}>
                        {selectedConflict.train_2_number}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Location / Resource:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                    {selectedConflict.block_code ? `Block ${selectedConflict.block_code}` : selectedConflict.station_code ? `Station ${selectedConflict.station_code}` : selectedConflict.resource_code || 'Network Section'}
                  </div>
                </div>

                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Occupancy Interval:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                    {formatMin(selectedConflict.start_time_min ?? selectedConflict.interval_start_min)} – {formatMin(selectedConflict.end_time_min ?? selectedConflict.interval_end_min)}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Detailed Explanation:</span>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {selectedConflict.explanation}
                </p>
              </div>

              <div style={{ marginTop: 12, fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Recommended Dispatch Remedy:</span>
                <div style={{ background: 'var(--accent-cyan-subtle)', border: '1px solid var(--border-medium)', borderRadius: 8, padding: 10, marginTop: 4, color: 'var(--text-primary)' }}>
                  {selectedConflict.suggested_action || (selectedConflict.suggested_actions && selectedConflict.suggested_actions[0]) || 'Hold lower-priority train at preceding passing loop station to allow clear passage.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                {onNavigateToStringline && (
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem' }}
                    onClick={onNavigateToStringline}
                  >
                    <span>View on Stringline Trajectory</span>
                    <ArrowRight size={13} />
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem' }}
                  onClick={onTriggerOptimizer}
                >
                  <Zap size={13} />
                  <span>Auto-Reschedule with CP-SAT</span>
                </button>
              </div>
            </div>
          )}

          {/* Conflict Items List */}
          <div className="glass-panel" style={{ padding: 18, minHeight: 280 }}>
            {filteredConflicts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <ShieldCheck size={48} color="var(--accent-emerald)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                  {conflicts.length === 0 ? 'Verified Conflict-Free Timetable' : 'No Conflicts Match Selected Filter'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 6, maxWidth: 460, margin: '6px auto 0' }}>
                  {conflicts.length === 0
                    ? 'All scheduled train trajectories satisfy headway safety separation, single-track exclusive reservations, and junction clearance margins.'
                    : 'Try clearing the severity or type filter to view all detected conflicts.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredConflicts.map((c, i) => {
                  const isSelected = selectedConflict?.conflict_uid === c.conflict_uid || selectedConflict?.id === c.id;
                  return (
                    <div
                      key={c.conflict_uid || i}
                      className="interactive-card"
                      onClick={() => handleSelect(c)}
                      style={{
                        background: isSelected ? 'var(--accent-cyan-subtle)' : 'var(--bg-card-subtle)',
                        border: isSelected ? '1.5px solid var(--accent-cyan)' : '1px solid var(--border-subtle)',
                        borderRadius: 8,
                        padding: '12px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 16,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {getSeverityBadge(c.severity)}
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {c.conflict_type.replace(/_/g, ' ').toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Trains {c.train_1_number} {c.train_2_number ? `& ${c.train_2_number}` : ''}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {c.explanation}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'right', flexShrink: 0 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)', justifyContent: 'flex-end' }}>
                            <Clock size={12} />
                            <span>
                              {formatMin(c.start_time_min ?? c.interval_start_min)} – {formatMin(c.end_time_min ?? c.interval_end_min)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--accent-cyan)', marginTop: 3, justifyContent: 'flex-end', fontWeight: 600 }}>
                            <MapPin size={12} />
                            <span>{c.block_code || c.station_code || c.resource_code || 'Corridor Block'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
