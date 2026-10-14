import React, { useState } from 'react';
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
  Moon,
  Menu,
  X
} from 'lucide-react';
import type { SimulationState } from '../types';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/client';

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

const HeaderComponent: React.FC<HeaderProps> = ({
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
  const [connectionMode, setConnectionMode] = React.useState<'connected' | 'standalone'>(api.getConnectionMode());
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  React.useEffect(() => {
    const unsub = api.onConnectionModeChange(setConnectionMode);
    return () => {
      unsub();
    };
  }, []);

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
          {/* Logo, Title & Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 auto' }}>
            <div style={{
              width: 42,
              height: 42,
              minWidth: 42,
              borderRadius: 10,
              background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-primary) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px var(--accent-primary-glow)',
              overflow: 'hidden'
            }}>
              <img src="/favicon.svg" alt="Clearway AI Mark" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h1 
                  className="page-heading truncate-label" 
                  style={{ 
                    fontFamily: 'var(--font-display)', 
                    fontSize: '1.6rem', 
                    fontWeight: 700, 
                    letterSpacing: '-0.01em', 
                    lineHeight: 1.2, 
                    margin: 0,
                    color: 'var(--text-primary)'
                  }}
                  title="Clearway AI Railway Block Planning System"
                >
                  Clearway AI
                </h1>
                {connectionMode === 'connected' ? (
                  <>
                    <span className="signal-live" title="FastAPI Backend Live & Operational"></span>
                    <span className="provenance-tag provenance-observed" title="FastAPI Backend Connected">BACKEND LIVE</span>
                  </>
                ) : (
                  <>
                    <span 
                      style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        background: 'var(--accent-cyan)', 
                        display: 'inline-block',
                        boxShadow: '0 0 8px var(--accent-cyan)' 
                      }} 
                      title="Standalone Resilient Simulator Active"
                    />
                    <span className="provenance-tag provenance-derived" title="Standalone Resilient Simulator Active" style={{ color: 'var(--accent-cyan)' }}>STANDALONE</span>
                  </>
                )}
                <span className="provenance-tag provenance-derived" title="Decision Support System">DECISION SUPPORT</span>
              </div>
              <p 
                className="truncate-label" 
                style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}
                title="Southern Railway (Chennai–Madurai Corridor) Block Planning & Timetable Optimizer"
              >
                Southern Railway (Chennai–Madurai Corridor) Block Planning & Timetable Optimizer
              </p>
            </div>
          </div>

          {/* Right Controls: Sim Clock + Controls + Theme Switcher + Mobile Nav Toggle */}
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
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Sim Clock {isRunning && <span style={{ color: 'var(--accent-emerald)' }}>● Live</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span 
                    className="clock-time tabular-nums" 
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-cyan)' }}
                  >
                    {formatTime(currentMinutes)}
                  </span>
                  <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                    aria-label="Pause Simulation"
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
                    aria-label="Run Simulation"
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
                  aria-label="Advance 1 Minute"
                >
                  <FastForward size={14} />
                  <span>+1m</span>
                </button>

                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '6px 10px' }} 
                  onClick={() => onResetSim(360)}
                  title="Reset Sim to 06:00"
                  aria-label="Reset Sim to 06:00"
                >
                  <RotateCcw size={14} />
                </button>

                {/* Speed selector */}
                <select
                  value={simState?.speed_factor ?? 1}
                  onChange={(e) => onSetSpeed(Number(e.target.value))}
                  style={{
                    padding: '6px 8px',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                  title="Simulation Speed"
                  aria-label="Simulation Speed"
                >
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1.0x</option>
                  <option value={2}>2.0x</option>
                  <option value={5}>5.0x</option>
                  <option value={10}>10.0x</option>
                </select>
              </div>
            </div>

            {/* Theme Toggle Button (accessible >= 44x44px target) */}
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

            {/* Mobile Nav Toggle Button */}
            <button
              className="mobile-nav-toggle"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              title={isMobileNavOpen ? 'Close Menu' : 'Open Navigation Menu'}
              aria-label={isMobileNavOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              aria-expanded={isMobileNavOpen}
            >
              {isMobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer (Visible on < 768px when toggled) */}
        {isMobileNavOpen && (
          <nav className="mobile-nav-drawer" aria-label="Mobile Navigation">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsMobileNavOpen(false);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Icon size={18} />
                    <span className="truncate-label" title={tab.label}>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && (
                    <span style={{
                      background: 'var(--accent-rose)',
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      padding: '2px 8px',
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
        )}

        {/* Desktop / Tablet Navigation Tabs Bar (Visible on >= 768px) */}
        <nav className="nav-tabs desktop-nav-tabs" aria-label="Main Navigation">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`nav-tab-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
              >
                <Icon size={16} />
                <span className="truncate-label">{tab.label}</span>
                {tab.badge !== undefined && (
                  <span style={{
                    background: 'var(--accent-rose)',
                    color: '#ffffff',
                    fontSize: '0.75rem',
                    padding: '2px 6px',
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

export const Header = React.memo(HeaderComponent);
