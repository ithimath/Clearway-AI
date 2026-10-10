import React, { useState } from 'react';
import type { MaintenanceJob, NetworkResponse } from '../types';
import { Wrench, Plus, Play, MapPin } from 'lucide-react';

interface MaintenancePlannerProps {
  jobs: MaintenanceJob[];
  network: NetworkResponse | null;
  onScheduleJob: (job: Partial<MaintenanceJob>) => Promise<void>;
  onRunOptimizer: () => Promise<void>;
  isLoading?: boolean;
}

export const MaintenancePlanner: React.FC<MaintenancePlannerProps> = ({
  jobs,
  network,
  onScheduleJob,
  onRunOptimizer,
  isLoading = false,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newJobName, setNewJobName] = useState('Track Tamping & Inspection');
  const [selectedBlock, setSelectedBlock] = useState('BLK_NDLS_NZM_0');
  const [durationMin, setDurationMin] = useState(60);
  const [earliestStart, setEarliestStart] = useState(360); // 06:00
  const [latestEnd, setLatestEnd] = useState(720); // 12:00
  const [priority, setPriority] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatMin = (m: number | null | undefined) => {
    if (m === null || m === undefined) return '—';
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onScheduleJob({
        job_name: newJobName,
        block_code: selectedBlock,
        duration_min: durationMin,
        earliest_start_min: earliestStart,
        latest_end_min: latestEnd,
        priority: priority,
        status: 'requested',
      });
      setShowAddModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const blocks = network?.blocks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Maintenance Window Optimizer & Block Possession Planner</span>
            <span className="provenance-tag provenance-assumed">CP-SAT INTERVAL SCHEDULING</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Schedule civil engineering and overhead electrification (OHE) track blocks with zero-overlap safety and minimal train passenger delay.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={14} />
            <span>Request Work Window</span>
          </button>

          <button 
            className="btn btn-primary"
            onClick={onRunOptimizer}
            disabled={isLoading}
          >
            <Play size={14} className={isLoading ? 'pulse-active' : ''} />
            <span>Optimize Windows (CP-SAT)</span>
          </button>
        </div>
      </div>

      {/* Maintenance Jobs Grid */}
      <div className="glass-panel" style={{ padding: 20 }}>
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Wrench size={44} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>No Maintenance Blocks Configured</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 6 }}>
              Add a maintenance job request to let the CP-SAT optimizer allocate non-conflicting time slots.
            </p>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 16 }}
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={14} />
              <span>Create First Job Request</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {jobs.map((job, idx) => {
              const isScheduled = job.status === 'scheduled';

              return (
                <div
                  key={idx}
                  className="interactive-card"
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 12,
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    borderColor: isScheduled ? 'rgba(16, 185, 129, 0.3)' : undefined
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 600, color: '#f8fafc' }}>
                        {job.job_name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        <MapPin size={12} color="#38bdf8" />
                        <span>Block {job.block_code || 'NDLS-NZM'}</span>
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: isScheduled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isScheduled ? '#6ee7b7' : '#fbbf24',
                      border: `1px solid ${isScheduled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                    }}>
                      {job.status}
                    </span>
                  </div>

                  {/* Window Times */}
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Window Request</span>
                      <span style={{ fontWeight: 600 }}>
                        {formatMin(job.earliest_start_min)} – {formatMin(job.latest_end_min)}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Duration</span>
                      <span style={{ fontWeight: 600, color: '#38bdf8' }}>{job.duration_min} mins</span>
                    </div>

                    {isScheduled && (
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Optimal Slot</span>
                        <span style={{ fontWeight: 700, color: '#34d399' }}>
                          {formatMin(job.assigned_start_min)} – {formatMin(job.assigned_end_min)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    <span>Priority: Level {job.priority}</span>
                    <span className="provenance-tag provenance-assumed">ASSUMED JOB</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal for adding a job */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 20
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1.1rem', fontWeight: 600 }}>
              Request Maintenance Track Block
            </h3>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Work Description
                </label>
                <input
                  type="text"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    outline: 'none',
                    fontSize: '0.85rem'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Target Track Block
                </label>
                <select
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: '#0e1422',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    outline: 'none',
                    fontSize: '0.85rem'
                  }}
                >
                  {blocks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} ({b.section_from || 'Section'} → {b.section_to || 'Section'})
                    </option>
                  ))}
                  {blocks.length === 0 && (
                    <option value="BLK_NDLS_NZM_0">BLK_NDLS_NZM_0</option>
                  )}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Earliest Start (min from 00:00)
                  </label>
                  <input
                    type="number"
                    value={earliestStart}
                    onChange={(e) => setEarliestStart(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      outline: 'none',
                      fontSize: '0.85rem'
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatMin(earliestStart)}</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Latest Finish (min from 00:00)
                  </label>
                  <input
                    type="number"
                    value={latestEnd}
                    onChange={(e) => setLatestEnd(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      outline: 'none',
                      fontSize: '0.85rem'
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{formatMin(latestEnd)}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Block Duration (minutes)
                  </label>
                  <input
                    type="number"
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    min={15}
                    max={360}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      outline: 'none',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Priority (1=Lowest, 10=Emergency)
                  </label>
                  <input
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    min={1}
                    max={10}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      outline: 'none',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
