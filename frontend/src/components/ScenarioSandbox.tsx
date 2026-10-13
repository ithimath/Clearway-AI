import React, { useState } from 'react';
import { 
  FlaskConical, 
  Play, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import type { Train, Block } from '../types';
import { api, type ScenarioRunResult } from '../api/client';

interface ScenarioSandboxProps {
  trains: Train[];
  blocks: Block[];
  onScenarioRan?: () => void;
}

const ScenarioSandboxComponent: React.FC<ScenarioSandboxProps> = ({
  trains,
  blocks,
  onScenarioRan,
}) => {
  const [selectedTrain, setSelectedTrain] = useState<string>(trains[0]?.train_number || '20606');
  const [delayMinutes, setDelayMinutes] = useState<number>(30);
  const [selectedBlock, setSelectedBlock] = useState<string>(blocks[0]?.code || 'BLK-CGL-VM-0');
  const [closureDuration, setClosureDuration] = useState<number>(60);
  const [isRunning, setIsRunning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioRunResult | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<number | null>(null);
  const [isAppliedToLive, setIsAppliedToLive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const presets = [
    {
      name: 'Northeast Monsoon Rain Protocol (Southern Railway)',
      desc: 'Injects +30 min delay on lead express service (20606 Vande Bharat Dn) between Villupuram and Chengalpattu to analyze cascading block ripple effects.',
      train: trains[0]?.train_number || '20606',
      delay: 30,
      block: 'none',
      duration: 0,
      badge: 'WEATHER RESTRICTION',
    },
    {
      name: 'Emergency Rail Fracture near Villupuram Junction',
      desc: 'Closes single-track block BLK-CGL-VM-0 for 75 minutes. Stresses opposing train conflict resolution and passing loop capacity at Tambaram / Chengalpattu.',
      train: 'none',
      delay: 0,
      block: 'BLK-CGL-VM-0',
      duration: 75,
      badge: 'INFRASTRUCTURE BREAKDOWN',
    },
    {
      name: 'Cascading Tiruchirappalli Junction Congestion',
      desc: 'Delays trailing express service (12638 Pandian SF) by 45 mins behind slower freight movements, creating tight headway compression on Madurai route.',
      train: trains[1]?.train_number || '12638',
      delay: 45,
      block: 'none',
      duration: 0,
      badge: 'JUNCTION PREEMPTION',
    },
    {
      name: 'High-Speed Overtake Preemption at Dindigul',
      desc: 'Applies priority holding of regional passenger service 56830 at Dindigul passing loop to clear path for 12636 Vaigai Superfast.',
      train: trains[2]?.train_number || '56830',
      delay: 20,
      block: 'none',
      duration: 0,
      badge: 'LOOP PREEMPTION',
    },
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    setSelectedTrain(p.train);
    setDelayMinutes(p.delay);
    setSelectedBlock(p.block);
    setClosureDuration(p.duration);
    setErrorMessage(null);
  };

  const handleRunSimulation = async () => {
    setIsRunning(true);
    setErrorMessage(null);
    setIsAppliedToLive(false);

    try {
      const trainParam = selectedTrain !== 'none' ? selectedTrain : undefined;
      const blockParam = selectedBlock !== 'none' ? selectedBlock : undefined;

      const scenario = await api.createScenario({
        name: `Sandbox Disruption: ${trainParam ? `Train ${trainParam} (+${delayMinutes}m)` : ''} ${blockParam ? `Block ${blockParam} (${closureDuration}m)` : ''}`.trim(),
        delay_train_number: trainParam,
        delay_minutes: delayMinutes,
        block_to_close: blockParam,
        closure_duration_min: closureDuration,
      });

      setActiveScenarioId(scenario.id);
      const res = await api.runScenario(scenario.id);
      setScenarioResult(res);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute scenario evaluation');
    } finally {
      setIsRunning(false);
    }
  };

  const handleApplyToLive = async () => {
    if (!activeScenarioId) return;
    setIsApplying(true);
    setErrorMessage(null);

    try {
      await api.applyScenario(activeScenarioId);
      setIsAppliedToLive(true);
      onScenarioRan?.();
    } catch (err: any) {
      setErrorMessage(`Failed to apply scenario to live dashboard: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleResetBaseline = async () => {
    setIsResetting(true);
    setErrorMessage(null);

    try {
      await api.resetScenario();
      setScenarioResult(null);
      setActiveScenarioId(null);
      setIsAppliedToLive(false);
      onScenarioRan?.();
    } catch (err: any) {
      setErrorMessage(`Failed to reset network baseline: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  const formatMin = (m: number | undefined | null) => {
    if (m === undefined || m === null) return '—';
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>What-If Scenario Sandbox & Disruption Modeling</span>
            <span className="provenance-tag provenance-simulated">SIMULATION PERTURBATION</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Stress test corridor robustness by injecting synthetic locomotive delays, track possession blockages, and visibility restrictions.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={handleResetBaseline}
            disabled={isResetting || isRunning}
            title="Revert all train delays and block closures back to default timetable"
          >
            <RotateCcw size={14} className={isResetting ? 'pulse-active' : ''} />
            <span>Reset to Baseline Timetable</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {errorMessage && (
        <div style={{
          background: 'var(--accent-rose-subtle)',
          border: '1px solid var(--accent-rose)',
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: '0.86rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} color="var(--accent-rose)" />
            <span>{errorMessage}</span>
          </div>
          <button 
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.78rem' }}
            onClick={handleRunSimulation}
          >
            Retry
          </button>
        </div>
      )}

      {/* Preset Scenario Cards */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Sparkles size={16} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '0.92rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            Preset Stress Test Scenarios
          </h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {presets.map((p, i) => (
            <div
              key={i}
              className="glass-panel interactive-card"
              style={{
                padding: 18,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 14,
                background: 'var(--bg-card)'
              }}
              onClick={() => handleApplyPreset(p)}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FlaskConical size={16} color="var(--accent-cyan)" />
                    <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {p.name}
                    </h4>
                  </div>
                </div>

                <span style={{
                  display: 'inline-block',
                  fontSize: '0.66rem',
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-cyan)',
                  marginBottom: 8
                }}>
                  {p.badge}
                </span>

                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {p.desc}
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Click to Load Preset</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Load Preset <ArrowRight size={13} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Form */}
      <div className="glass-panel" style={{ padding: 24, background: 'var(--bg-surface)' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 16px', color: 'var(--text-primary)' }}>
          Configure Custom Scenario Perturbations
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {/* Train Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Select Train to Delay
            </label>
            <select
              value={selectedTrain}
              onChange={(e) => setSelectedTrain(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="none">None (No Train Delay)</option>
              {trains.map((t) => (
                <option key={t.train_number} value={t.train_number}>
                  {t.train_number} — {t.name} ({t.direction.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* Delay Magnitude */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Delay Magnitude (Minutes)
            </label>
            <input
              type="number"
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(Math.max(0, Number(e.target.value)))}
              min={0}
              max={240}
              disabled={selectedTrain === 'none'}
              style={{ width: '100%' }}
            />
          </div>

          {/* Block Selection */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Emergency Track Block Closure
            </label>
            <select
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="none">None (All Blocks Open)</option>
              {blocks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code} ({b.section_from || 'MS'} → {b.section_to || 'MDU'})
                </option>
              ))}
            </select>
          </div>

          {/* Closure Duration */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Closure Duration (Minutes)
            </label>
            <input
              type="number"
              value={closureDuration}
              onChange={(e) => setClosureDuration(Math.max(0, Number(e.target.value)))}
              min={0}
              max={360}
              disabled={selectedBlock === 'none'}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button
            className="btn btn-primary"
            onClick={handleRunSimulation}
            disabled={isRunning || (selectedTrain === 'none' && selectedBlock === 'none')}
          >
            <Play size={15} className={isRunning ? 'pulse-active' : ''} />
            <span>{isRunning ? 'Evaluating Rule Violations & Cascades…' : 'Simulate Scenario Impact'}</span>
          </button>
        </div>
      </div>

      {/* Real Scenario Results Display */}
      {scenarioResult && (
        <div className="glass-panel" style={{ padding: 24, borderColor: 'var(--border-bright)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} color="var(--accent-emerald)" />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Evaluated Disruption Impact Assessment
                </h3>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {scenarioResult.explanation}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                className={`btn ${isAppliedToLive ? 'btn-success' : 'btn-primary'}`}
                onClick={handleApplyToLive}
                disabled={isApplying || isAppliedToLive}
              >
                {isAppliedToLive ? (
                  <>
                    <CheckCircle2 size={15} />
                    <span>Applied to Active Dashboard</span>
                  </>
                ) : (
                  <>
                    <Play size={15} className={isApplying ? 'pulse-active' : ''} />
                    <span>Apply Disruption to Live Corridor</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div style={{ background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Baseline Conflicts
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 4 }}>
                {scenarioResult.baseline?.conflict_count ?? 2}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Normal timetable state</span>
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Disrupted Conflicts
              </span>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: scenarioResult.disrupted?.conflict_count > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', marginTop: 4 }}>
                {scenarioResult.disrupted?.conflict_count ?? 0}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--accent-rose)' }}>
                +{scenarioResult.disrupted?.new_conflicts ?? 0} newly generated
              </span>
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Injected Perturbation
              </span>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 6 }}>
                {scenarioResult.parameters?.train_number ? `Train ${scenarioResult.parameters.train_number} (+${scenarioResult.parameters.delay_min}m)` : ''}
                {scenarioResult.parameters?.block_code ? `Block ${scenarioResult.parameters.block_code}` : ''}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Applied parameters</span>
            </div>

            <div style={{ background: 'var(--bg-card-subtle)', padding: 16, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Recommended Recovery Action
              </span>
              <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--accent-emerald)', marginTop: 6, lineHeight: 1.4 }}>
                {scenarioResult.disrupted?.new_conflicts > 0 
                  ? 'Run CP-SAT Schedule Optimizer to re-sequence block intervals' 
                  : 'Timetable margins successfully absorbed the disturbance'}
              </div>
            </div>
          </div>

          {/* Real Detected Conflicts List */}
          {scenarioResult.conflicts && scenarioResult.conflicts.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <ShieldAlert size={16} color="var(--accent-rose)" />
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  Detailed Conflict Violations Detected ({scenarioResult.conflicts.length})
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {scenarioResult.conflicts.map((c, idx) => (
                  <div
                    key={c.conflict_uid || idx}
                    style={{
                      background: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 12
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: c.severity === 'critical' ? 'var(--accent-rose-subtle)' : 'var(--accent-amber-subtle)',
                          color: c.severity === 'critical' ? 'var(--accent-rose)' : 'var(--accent-amber)',
                          border: `1px solid ${c.severity === 'critical' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`
                        }}>
                          {c.severity}
                        </span>

                        <span style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                          {c.conflict_type.replace(/_/g, ' ').toUpperCase()}
                        </span>

                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          Resource: {c.resource_code || c.block_code || c.station_code}
                        </span>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {c.explanation}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        Window: {formatMin(c.interval_start_min)} – {formatMin(c.interval_end_min)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        Trains: {(c.trains || []).join(', ') || 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ScenarioSandbox = React.memo(ScenarioSandboxComponent);
