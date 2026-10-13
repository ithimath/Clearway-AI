import React, { useState } from 'react';
import type { MaintenanceJob, NetworkResponse } from '../types';
import { Wrench, Plus, Play, MapPin, X, CheckCircle2, AlertTriangle } from 'lucide-react';

interface MaintenancePlannerProps {
  jobs: MaintenanceJob[];
  network: NetworkResponse | null;
  onScheduleJob: (job: Partial<MaintenanceJob>) => Promise<void>;
  onRunOptimizer: () => Promise<void>;
  isLoading?: boolean;
}

const MaintenancePlannerComponent: React.FC<MaintenancePlannerProps> = ({
  jobs,
  network,
  onScheduleJob,
  onRunOptimizer,
  isLoading = false,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newJobName, setNewJobName] = useState('Track Tamping & Rail Ultrasonic Inspection');
  const [selectedBlock, setSelectedBlock] = useState('BLK-CGL-VM-0');
  const [durationMin, setDurationMin] = useState(60);
  const [earliestStart, setEarliestStart] = useState(360); // 06:00
  const [latestEnd, setLatestEnd] = useState(720); // 12:00
  const [priority, setPriority] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const formatMin = (m: number | null | undefined) => {
    if (m === null || m === undefined) return '—';
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setNotification(null);
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
      setNotification({ type: 'success', message: `Maintenance job "${newJobName}" successfully requested.` });
    } catch (err: any) {
      setNotification({ type: 'error', message: `Failed to request job: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const blocks = network?.blocks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Maintenance Window Optimizer & Block Possession Planner</span>
            <span className="provenance-tag provenance-assumed">CP-SAT INTERVAL SCHEDULING</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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
            <span>{isLoading ? 'Solving Optimal Slots…' : 'Optimize Windows (CP-SAT)'}</span>
          </button>
        </div>
      </div>

      {notification && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          background: notification.type === 'success' ? 'var(--accent-emerald-subtle)' : 'var(--accent-rose-subtle)',
          border: `1px solid ${notification.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          {notification.type === 'success' ? <CheckCircle2 size={16} color="var(--accent-emerald)" /> : <AlertTriangle size={16} color="var(--accent-rose)" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Maintenance Jobs Grid */}
      <div className="glass-panel" style={{ padding: 20 }}>
        {jobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Wrench size={44} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>No Maintenance Blocks Configured</h3>
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
                  key={job.id || idx}
                  className="interactive-card"
                  style={{
                    background: 'var(--bg-card)',
                    border: `1.5px solid ${isScheduled ? 'var(--accent-emerald)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {job.job_name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        <MapPin size={12} color="var(--accent-cyan)" />
                        <span>Block {job.block_code || 'BLK-MS-CGL-0'}</span>
                      </div>
                    </div>

                    <span style={{
                      padding: '3px 8px',
                      borderRadius: 4,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: isScheduled ? 'var(--accent-emerald-subtle)' : 'var(--accent-amber-subtle)',
                      color: isScheduled ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                      border: `1px solid ${isScheduled ? 'var(--accent-emerald)' : 'var(--accent-amber)'}`
                    }}>
                      {isScheduled ? 'SCHEDULED' : 'PENDING'}
                    </span>
                  </div>

                  {/* Window Times */}
                  <div style={{
                    background: 'var(--bg-card-subtle)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Window Request</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatMin(job.earliest_start_min)} – {formatMin(job.latest_end_min)}
                      </span>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)', display: 'block' }}>Duration</span>
                      <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{job.duration_min} mins</span>
                    </div>

                    {isScheduled && (
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Optimal Slot</span>
                        <span style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
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
          background: 'var(--bg-overlay)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          padding: 20
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: 480, padding: 24, background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Request Maintenance Track Block
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Work Description
                </label>
                <input
                  type="text"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  style={{ width: '100%' }}
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
                  style={{ width: '100%' }}
                >
                  {blocks.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} ({b.section_from || 'Section'} → {b.section_to || 'Section'})
                    </option>
                  ))}
                  {blocks.length === 0 && (
                    <option value="BLK-CGL-VM-0">BLK-CGL-VM-0 (Chengalpattu → Villupuram)</option>
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
                    style={{ width: '100%' }}
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
                    style={{ width: '100%' }}
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
                    style={{ width: '100%' }}
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
                    style={{ width: '100%' }}
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

export const MaintenancePlanner = React.memo(MaintenancePlannerComponent);
