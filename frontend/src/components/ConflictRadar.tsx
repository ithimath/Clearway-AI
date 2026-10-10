import React, { useState } from 'react';
import type { ConflictRecord, ConflictSeverity } from '../types';
import { ShieldCheck, RefreshCw, Zap, Clock, MapPin } from 'lucide-react';

interface ConflictRadarProps {
  conflicts: ConflictRecord[];
  onRefreshConflicts: () => void;
  onTriggerOptimizer: () => void;
  isLoading?: boolean;
}

export const ConflictRadar: React.FC<ConflictRadarProps> = ({
  conflicts,
  onRefreshConflicts,
  onTriggerOptimizer,
  isLoading = false,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | ConflictSeverity>('all');
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);

  const formatMin = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  const filteredConflicts = conflicts.filter((c) => {
    if (severityFilter === 'all') return true;
    return c.severity === severityFilter;
  });

  const getSeverityBadge = (severity: ConflictSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', border: '1px solid rgba(244, 63, 94, 0.35)', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
            CRITICAL
          </span>
        );
      case 'major':
        return (
          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.35)', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
            MAJOR
          </span>
        );
      case 'minor':
      default:
        return (
          <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.35)', padding: '2px 8px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600 }}>
            MINOR
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Conflict Radar & Safety Rule Violation Feed</span>
            <span className="provenance-tag provenance-derived">RULE ENGINE EVALUATION</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Real-time conflict detection across headway rules, single-track oppositions, junction bottlenecks, and maintenance conflicts.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            className="btn btn-secondary" 
            onClick={onRefreshConflicts}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'pulse-active' : ''} />
            <span>Scan Timetable</span>
          </button>

          <button 
            className="btn btn-primary"
            onClick={onTriggerOptimizer}
          >
            <Zap size={14} />
            <span>Resolve via CP-SAT</span>
          </button>
        </div>
      </div>

      {/* Filters and Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div 
          className="glass-panel interactive-card"
          style={{ padding: 16, cursor: 'pointer', borderColor: severityFilter === 'all' ? 'var(--accent-cyan)' : undefined }}
          onClick={() => setSeverityFilter('all')}
        >
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Conflicts</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
            {conflicts.length}
          </div>
        </div>

        <div 
          className="glass-panel interactive-card"
          style={{ padding: 16, cursor: 'pointer', borderColor: severityFilter === 'critical' ? '#f43f5e' : undefined }}
          onClick={() => setSeverityFilter('critical')}
        >
          <div style={{ fontSize: '0.74rem', color: '#f43f5e', textTransform: 'uppercase' }}>Critical Violations</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f43f5e', marginTop: 4 }}>
            {conflicts.filter(c => c.severity === 'critical').length}
          </div>
        </div>

        <div 
          className="glass-panel interactive-card"
          style={{ padding: 16, cursor: 'pointer', borderColor: severityFilter === 'major' ? '#f59e0b' : undefined }}
          onClick={() => setSeverityFilter('major')}
        >
          <div style={{ fontSize: '0.74rem', color: '#f59e0b', textTransform: 'uppercase' }}>Major Violations</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: 4 }}>
            {conflicts.filter(c => c.severity === 'major').length}
          </div>
        </div>

        <div 
          className="glass-panel interactive-card"
          style={{ padding: 16, cursor: 'pointer', borderColor: severityFilter === 'minor' ? '#38bdf8' : undefined }}
          onClick={() => setSeverityFilter('minor')}
        >
          <div style={{ fontSize: '0.74rem', color: '#38bdf8', textTransform: 'uppercase' }}>Minor Headway Issues</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#38bdf8', marginTop: 4 }}>
            {conflicts.filter(c => c.severity === 'minor').length}
          </div>
        </div>
      </div>

      {/* Main Conflict List & Inspector Split */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedConflict ? '1fr 380px' : '1fr', gap: 20 }}>
        <div className="glass-panel" style={{ padding: 20 }}>
          {filteredConflicts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <ShieldCheck size={48} color="#10b981" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>
                No Active Conflicts Detected
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                The timetable adheres to minimum headway buffers, junction margins, and single-track exclusive reservations.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredConflicts.map((c, i) => (
                <div
                  key={i}
                  className="interactive-card"
                  onClick={() => setSelectedConflict(c)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 10,
                    padding: 16,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    borderColor: selectedConflict === c ? 'var(--accent-cyan)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {getSeverityBadge(c.severity)}
                      <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>
                        {c.conflict_type.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        Trains {c.train_1_number} & {c.train_2_number}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {c.explanation}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, textAlign: 'right' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <Clock size={12} />
                        <span>{formatMin(c.start_time_min)} – {formatMin(c.end_time_min)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#38bdf8', marginTop: 4, justifyContent: 'flex-end' }}>
                        <MapPin size={12} />
                        <span>{c.block_code || c.station_code || 'Network Section'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Conflict Detail Panel */}
        {selectedConflict && (
          <div className="glass-panel" style={{ padding: 20, height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
                Conflict Details & Remedy
              </h3>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                onClick={() => setSelectedConflict(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.82rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Type:</span>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{selectedConflict.conflict_type.replace(/_/g, ' ')}</div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Involved Trains:</span>
                <div style={{ marginTop: 2, display: 'flex', gap: 8 }}>
                  <span style={{ background: 'rgba(56, 189, 248, 0.2)', padding: '2px 8px', borderRadius: 4, fontWeight: 600, color: '#38bdf8' }}>
                    {selectedConflict.train_1_number}
                  </span>
                  <span style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '2px 8px', borderRadius: 4, fontWeight: 600, color: '#f59e0b' }}>
                    {selectedConflict.train_2_number}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Location / Resource:</span>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginTop: 2 }}>
                  {selectedConflict.block_code ? `Block ${selectedConflict.block_code}` : `Station ${selectedConflict.station_code}`}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Suggested Dispatch Action:</span>
                <div style={{ background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: 8, padding: 12, marginTop: 4, color: '#67e8f9' }}>
                  {selectedConflict.suggested_action || 'Hold lower-priority train at preceding passing loop station to allow clear passage.'}
                </div>
              </div>

              <button 
                className="btn btn-primary"
                style={{ marginTop: 8 }}
                onClick={onTriggerOptimizer}
              >
                <Zap size={14} />
                <span>Auto-Reschedule with CP-SAT</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
