import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  AlertTriangle, 
  Map, 
  Activity, 
  Wrench, 
  Cpu, 
  FlaskConical, 
  BarChart3, 
  GitCommit 
} from 'lucide-react';
import type { SimulationState } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  simState: SimulationState | null;
  onStartSim: () => void;
  onPauseSim: () => void;
  onResetSim: (time?: number) => void;
  onStepSim: (steps?: number) => void;
  onSetSpeed: (speed: number) => void;
  conflictCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  simState,
  onStartSim,
  onPauseSim,
  onResetSim,
  onStepSim,
  onSetSpeed,
  conflictCount,
}) => {
  // Format minutes from midnight to HH:MM
  const formatTime = (totalMin: number = 0) => {
    const hours = Math.floor(totalMin / 60) % 24;
    const mins = totalMin % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  };

  const tabs = [
    { id: 'corridor', label: 'Corridor & Live Sim', icon: Map },
    { id: 'stringline', label: 'Stringline Diagram', icon: GitCommit },
    { 
      id: 'conflicts', 
      label: 'Conflict Radar', 
      icon: AlertTriangle, 
      badge: conflictCount > 0 ? conflictCount : undefined 
    },
    { id: 'maintenance', label: 'Maintenance Planner', icon: Wrench },
    { id: 'optimizer', label: 'Schedule Optimizer (CP-SAT)', icon: Cpu },
    { id: 'sandbox', label: 'What-If Sandbox', icon: FlaskConical },
    { id: 'analytics', label: 'Analytics & Provenance', icon: BarChart3 },
  ];

  const currentMinutes = simState?.current_time_min ?? 360;
  const isRunning = simState?.is_running ?? false;

  return (
    <header>
      {/* Top Academic Disclaimer Banner */}
      <div className="disclaimer-banner">
        <AlertTriangle size={14} />
        <span>Academic/Hackathon Decision Support Prototype — NOT a certified signalling or safety critical system. Do not use to control real trains.</span>
      </div>

      <div className="header-bar">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          {/* Logo & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(6, 182, 212, 0.45)'
            }}>
              <Activity size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                  Clearway AI
                </h1>
                <span className="signal-live" title="Backend Live"></span>
                <span className="provenance-tag provenance-derived">DECISION SUPPORT</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Delhi–Agra Corridor Block Planning & Maintenance Window Optimizer
              </p>
            </div>
          </div>

          {/* Simulation Controls & Clock Widget */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '6px 14px',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 6 }}>
              <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sim Clock
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.25rem', fontWeight: 700, color: '#38bdf8' }}>
                  {formatTime(currentMinutes)}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  ({currentMinutes}m)
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isRunning ? (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 12px' }} 
                  onClick={onPauseSim}
                  title="Pause Simulation"
                >
                  <Pause size={15} color="#f59e0b" />
                  <span>Pause</span>
                </button>
              ) : (
                <button 
                  className="btn btn-primary" 
                  style={{ padding: '6px 12px' }} 
                  onClick={onStartSim}
                  title="Run Simulation"
                >
                  <Play size={15} />
                  <span>Run</span>
                </button>
              )}

              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 10px' }} 
                onClick={() => onStepSim(1)}
                title="Advance 1 Minute"
              >
                <FastForward size={14} />
                <span>+1m</span>
              </button>

              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px 10px' }} 
                onClick={() => onResetSim(360)}
                title="Reset Sim to 06:00"
              >
                <RotateCcw size={14} />
              </button>

              {/* Speed selector */}
              <select
                value={simState?.speed_factor ?? 1}
                onChange={(e) => onSetSpeed(Number(e.target.value))}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontSize: '0.78rem',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={0.5} style={{ background: '#0e1422' }}>0.5x</option>
                <option value={1} style={{ background: '#0e1422' }}>1x</option>
                <option value={2} style={{ background: '#0e1422' }}>2x</option>
                <option value={5} style={{ background: '#0e1422' }}>5x</option>
                <option value={10} style={{ background: '#0e1422' }}>10x</option>
              </select>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="nav-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span style={{
                    background: '#f43f5e',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: 10,
                    fontWeight: 700
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
