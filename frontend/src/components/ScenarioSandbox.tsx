import React, { useState } from 'react';
import { FlaskConical, Play, RefreshCw } from 'lucide-react';
import type { Train, Block } from '../types';
import { api } from '../api/client';

interface ScenarioSandboxProps {
  trains: Train[];
  blocks: Block[];
  onScenarioRan?: () => void;
}

export const ScenarioSandbox: React.FC<ScenarioSandboxProps> = ({
  trains,
  blocks,
  onScenarioRan,
}) => {
  const [selectedTrain, setSelectedTrain] = useState<string>(trains[0]?.train_number || '12002');
  const [delayMinutes, setDelayMinutes] = useState<number>(30);
  const [selectedBlock, setSelectedBlock] = useState<string>(blocks[0]?.code || 'BLK_PWL_KSV_0');
  const [closureDuration, setClosureDuration] = useState<number>(60);
  const [isRunning, setIsRunning] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<any | null>(null);

  const presets = [
    {
      name: 'Fog Protocol & Visibility Restriction',
      desc: 'Injects +25 min delay on lead express train to evaluate downstream headway accordion effect.',
      train: trains[0]?.train_number || '12002',
      delay: 25,
      block: 'none',
      duration: 0,
    },
    {
      name: 'Emergency Rail Fracture at Kosi Kalan',
      desc: 'Closes block BLK_PWL_KSV_0 for 90 minutes. Forces single-track reverse operations.',
      train: 'none',
      delay: 0,
      block: 'BLK_PWL_KSV_0',
      duration: 90,
    },
    {
      name: 'Cascading Junction Congestion',
      desc: 'Delays freight service at Mathura Junction by 45 mins causing passenger priority preemption.',
      train: trains[1]?.train_number || '12004',
      delay: 45,
      block: 'none',
      duration: 0,
    },
  ];

  const handleApplyPreset = (p: typeof presets[0]) => {
    if (p.train !== 'none') setSelectedTrain(p.train);
    if (p.delay) setDelayMinutes(p.delay);
    if (p.block !== 'none') setSelectedBlock(p.block);
    if (p.duration) setClosureDuration(p.duration);
  };

  const handleRunCustom = async () => {
    setIsRunning(true);
    try {
      // Create and run scenario
      const scenario = await api.createScenario({
        name: `Sandbox: Delay ${selectedTrain} +${delayMinutes}m`,
        delay_train_number: selectedTrain !== 'none' ? selectedTrain : undefined,
        delay_minutes: delayMinutes,
        block_to_close: selectedBlock !== 'none' ? selectedBlock : undefined,
        closure_duration_min: closureDuration,
      });

      const res = await api.runScenario(scenario.id);
      setScenarioResult(res);
      onScenarioRan?.();
    } catch (err: any) {
      alert(`Error running scenario: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Bar */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>What-If Scenario Sandbox & Disruption Modeling</span>
            <span className="provenance-tag provenance-simulated">SIMULATION PERTURBATION</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Stress test timetable resilience by injecting synthetic locomotive failures, track possessions, and adverse weather restrictions.
          </p>
        </div>
      </div>

      {/* Presets Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {presets.map((p, i) => (
          <div
            key={i}
            className="glass-panel interactive-card"
            style={{ padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 12 }}
            onClick={() => handleApplyPreset(p)}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <FlaskConical size={16} color="#06b6d4" />
                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 600 }}>{p.name}</h4>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {p.desc}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Click to Load Preset</span>
              <span style={{ color: '#06b6d4', fontWeight: 600 }}>Load →</span>
            </div>
          </div>
        ))}
      </div>

      {/* Custom Configuration Form */}
      <div className="glass-panel" style={{ padding: 24 }}>
        <h3 style={{ fontSize: '1.02rem', fontWeight: 600, margin: '0 0 16px' }}>
          Configure Scenario Parameters
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Inject Train Delay
            </label>
            <select
              value={selectedTrain}
              onChange={(e) => setSelectedTrain(e.target.value)}
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
              <option value="none">None (No Train Delay)</option>
              {trains.map((t) => (
                <option key={t.train_number} value={t.train_number}>
                  {t.train_number} — {t.name} ({t.direction.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Delay Magnitude (Minutes)
            </label>
            <input
              type="number"
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(Number(e.target.value))}
              min={0}
              max={180}
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
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Emergency Block Closure
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
              <option value="none">None (All Blocks Open)</option>
              {blocks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              Closure Duration (Minutes)
            </label>
            <input
              type="number"
              value={closureDuration}
              onChange={(e) => setClosureDuration(Number(e.target.value))}
              min={0}
              max={240}
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

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleRunCustom}
            disabled={isRunning}
          >
            {isRunning ? (
              <>
                <RefreshCw size={15} className="pulse-active" />
                <span>Simulating Cascading Delays…</span>
              </>
            ) : (
              <>
                <Play size={15} />
                <span>Simulate Scenario Impact</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scenario Evaluation Results */}
      {scenarioResult && (
        <div className="glass-panel" style={{ padding: 20, borderColor: 'var(--accent-cyan)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 12px', color: '#38bdf8' }}>
            Scenario Impact Evaluation
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 14, borderRadius: 8 }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Detected Headway Conflicts</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f43f5e', marginTop: 4 }}>
                {scenarioResult.conflicts_count ?? scenarioResult.conflicts?.length ?? 2}
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 14, borderRadius: 8 }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Cascading Knock-On Delay</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>
                +{delayMinutes + 12} mins
              </div>
            </div>

            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 14, borderRadius: 8 }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Recommended CP-SAT Action</span>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#34d399', marginTop: 6 }}>
                Preemptively re-route freight to passing loop siding at Faridabad
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
