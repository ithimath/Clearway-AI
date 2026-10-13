import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  FastForward, 
  AlertTriangle, 
  Map, 
  Wrench, 
  Cpu, 
  FlaskConical, 
  BarChart3, 
  GitCommit,
  Sun,
  Moon
} from 'lucide-react';
import type { SimulationState } from '../types';
import { useTheme } from '../context/ThemeContext';

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
  const { theme, toggleTheme } = useTheme();

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
      <div className="header-bar">
        <div 
          className="header-top-row" 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 14 }}
        >
          {/* Logo & Subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-primary) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px var(--accent-primary-glow)',
              overflow: 'hidden'
            }}>
              <img src="/favicon-48x48.png" alt="Clearway AI Logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                  Clearway AI
                </h1>
                <span className="signal-live" title="Backend Live & Operational"></span>
                <span className="provenance-tag provenance-derived">DECISION SUPPORT</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Southern Railway (Chennai–Madurai Corridor) Block Planning & Timetable Optimizer
              </p>
            </div>
          </div>

          {/* Right Controls: Simulation Controls + Clock + Theme Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Simulation Clock & Controls */}
            <div 
              className="clock-widget" 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--bg-card-subtle)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginRight: 4 }}>
                <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Sim Clock {isRunning && <span style={{ color: 'var(--accent-emerald)' }}>● Live</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                    {formatTime(currentMinutes)}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
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
                    <Pause size={14} color="var(--accent-amber)" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    style={{ padding: '6px 12px' }} 
                    onClick={onStartSim}
                    title="Run Simulation"
                  >
                    <Play size={14} />
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
                    padding: '6px 8px',
                    fontSize: '0.76rem',
                    cursor: 'pointer'
                  }}
                  title="Simulation Speed"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1.0x</option>
                  <option value={2}>2.0x</option>
                  <option value={5}>5.0x</option>
                  <option value={10}>10.0x</option>
                </select>
              </div>
            </div>

            {/* Theme Toggle Button */}
            <button 
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? (
                <Sun size={18} color="var(--accent-amber)" />
              ) : (
                <Moon size={18} color="var(--accent-primary)" />
              )}
            </button>
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
                    background: 'var(--accent-rose)',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
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
