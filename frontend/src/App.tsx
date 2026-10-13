import React, { useEffect, useState, useCallback } from 'react';
import './styles/index.css';
import { ThemeProvider } from './context/ThemeContext';
import { Header } from './components/Header';
import { CorridorMap } from './components/CorridorMap';
import { StringlineDiagram } from './components/StringlineDiagram';
import { ConflictRadar } from './components/ConflictRadar';
import { MaintenancePlanner } from './components/MaintenancePlanner';
import { ScheduleOptimizer } from './components/ScheduleOptimizer';
import { ScenarioSandbox } from './components/ScenarioSandbox';
import { AnalyticsView } from './components/AnalyticsView';
import { Footer } from './components/Footer';
import { api } from './api/client';
import type { 
  NetworkResponse, 
  Train, 
  Block, 
  ConflictRecord, 
  SimulationState, 
  MetricSummary, 
  MaintenanceJob 
} from './types';

import { RefreshCw, AlertTriangle } from 'lucide-react';

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('corridor');
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['corridor']));
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [simState, setSimState] = useState<SimulationState | null>(null);
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);
  const [maintenanceJobs, setMaintenanceJobs] = useState<MaintenanceJob[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [isOptimizingMaintenance, setIsOptimizingMaintenance] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);

  // Tab switching with lazy rendering & DOM caching
  const handleSelectTab = useCallback((tab: string) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  // Initial data loading (deduplicated, avoiding redundant blocks request)
  const loadInitialData = useCallback(async () => {
    setIsInitialLoading(true);
    setInitialLoadError(null);
    try {
      let netError: string | null = null;
      const [netData, trData, confData, metricData, jobsData, simData] = await Promise.all([
        api.getNetwork(true).catch((e) => {
          console.error('getNetwork failed:', e);
          netError = e.message;
          return null;
        }),
        api.getTrains().catch(() => []),
        api.getConflicts().catch(() => ({ conflicts: [], count: 0 })),
        api.getMetrics().catch(() => null),
        api.getMaintenanceJobs().catch(() => []),
        api.getSimState().catch(() => null),
      ]);

      if (netData) {
        setNetwork(netData);
        if (netData.blocks) setBlocks(netData.blocks);
        setInitialLoadError(null);
      } else {
        setInitialLoadError(netError || 'Unable to load railway network infrastructure. Verify backend is running at http://127.0.0.1:8000.');
      }

      if (trData && trData.length > 0) setTrains(trData);
      if (confData) {
        setConflicts(Array.isArray(confData) ? confData : (confData.conflicts || []));
      }
      if (metricData) setMetrics(metricData);
      if (jobsData) setMaintenanceJobs(jobsData);
      if (simData) setSimState(simData);
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
      setInitialLoadError(err.message || 'Failed to connect to backend server.');
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Simulation Polling loop (optimized with document.hidden guard & reference equality check)
  useEffect(() => {
    let isMounted = true;
    const pollInterval = simState?.is_running ? 1000 : 3500;
    const interval = setInterval(async () => {
      // Pause polling when browser tab is inactive to save CPU and network
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const state = await api.getSimState();
        if (!isMounted) return;

        setSimState((prev) => {
          if (!prev) return state;
          // Prevent unnecessary re-renders across the entire tree if state did not change
          if (
            prev.is_running === state.is_running &&
            prev.current_time_min === state.current_time_min &&
            prev.speed_factor === state.speed_factor &&
            prev.step_count === state.step_count &&
            JSON.stringify(prev.blocks) === JSON.stringify(state.blocks) &&
            JSON.stringify(prev.trains) === JSON.stringify(state.trains)
          ) {
            return prev;
          }
          return state;
        });
      } catch {
        // Quiet ignore polling glitch
      }
    }, pollInterval);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [simState?.is_running]);

  // Simulation handlers (memoized with useCallback)
  const handleStartSim = useCallback(async () => {
    await api.startSim();
    setSimState((prev) => prev ? { ...prev, is_running: true } : null);
  }, []);

  const handlePauseSim = useCallback(async () => {
    await api.pauseSim();
    setSimState((prev) => prev ? { ...prev, is_running: false } : null);
  }, []);

  const handleResetSim = useCallback(async (time: number = 360) => {
    await api.resetSim(time);
    const state = await api.getSimState();
    setSimState(state);
  }, []);

  const handleStepSim = useCallback(async (steps: number = 1) => {
    const updated = await api.stepSim(steps);
    setSimState(updated);
  }, []);

  const handleSetSpeed = useCallback(async (factor: number) => {
    await api.setSimSpeed(factor);
    setSimState((prev) => prev ? { ...prev, speed_factor: factor } : null);
  }, []);

  // Conflict scanning
  const handleRefreshConflicts = useCallback(async () => {
    setIsLoadingConflicts(true);
    try {
      const res = await api.detectConflicts(true, 'baseline');
      const loaded = res.conflicts || [];
      setConflicts(loaded);
      setSelectedConflict((prev) => {
        if (!prev) return null;
        return loaded.find((c: ConflictRecord) => c.conflict_uid === prev.conflict_uid) || null;
      });
      const [m, tr] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getTrains().catch(() => []),
      ]);
      if (m) setMetrics(m);
      if (tr.length) setTrains(tr);
    } catch (err) {
      console.error('Failed to detect conflicts:', err);
    } finally {
      setIsLoadingConflicts(false);
    }
  }, []);

  // Maintenance handlers
  const handleScheduleJob = useCallback(async (job: Partial<MaintenanceJob>) => {
    const created = await api.createMaintenanceJob(job);
    setMaintenanceJobs((prev) => [...prev, created]);
  }, []);

  const handleRunMaintenanceOptimizer = useCallback(async () => {
    setIsOptimizingMaintenance(true);
    try {
      const res = await api.optimizeMaintenance();
      let attempts = 0;
      const maxAttempts = 45; // ~45 second guard
      const pollJob = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
          clearInterval(pollJob);
          setIsOptimizingMaintenance(false);
          return;
        }

        try {
          const status = await api.getJobStatus(res.job_id);
          if (status.status === 'completed') {
            clearInterval(pollJob);
            const updatedJobs = await api.getMaintenanceJobs();
            setMaintenanceJobs(updatedJobs);
            setIsOptimizingMaintenance(false);
          } else if (status.status === 'failed') {
            clearInterval(pollJob);
            setIsOptimizingMaintenance(false);
          }
        } catch {
          clearInterval(pollJob);
          setIsOptimizingMaintenance(false);
        }
      }, 1000);
    } catch {
      setIsOptimizingMaintenance(false);
    }
  }, []);

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        simState={simState}
        onStartSim={handleStartSim}
        onPauseSim={handlePauseSim}
        onResetSim={handleResetSim}
        onStepSim={handleStepSim}
        onSetSpeed={handleSetSpeed}
        conflictCount={conflicts.length}
      />

      <main className="main-content">
        {/* Connection Error Banner with Retry */}
        {initialLoadError && (
          <div 
            className="glass-panel" 
            style={{ 
              padding: '16px 20px', 
              marginBottom: 20, 
              border: '1.5px solid var(--accent-rose)', 
              background: 'var(--accent-rose-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AlertTriangle size={20} color="var(--accent-rose)" />
              <div>
                <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Server Connection Issue</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{initialLoadError}</p>
              </div>
            </div>
            <button 
              className="btn btn-primary" 
              onClick={loadInitialData}
              disabled={isInitialLoading}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} className={isInitialLoading ? 'pulse-active' : ''} />
              <span>{isInitialLoading ? 'Connecting…' : 'Retry Connection'}</span>
            </button>
          </div>
        )}

        {/* Tab views with lazy-mounting and persistent cached DOM */}
        {visitedTabs.has('corridor') && (
          <div style={{ display: activeTab === 'corridor' ? 'block' : 'none' }}>
            <CorridorMap 
              network={network} 
              simState={simState} 
            />
          </div>
        )}

        {visitedTabs.has('stringline') && (
          <div style={{ display: activeTab === 'stringline' ? 'block' : 'none' }}>
            <StringlineDiagram
              network={network}
              trains={trains}
              conflicts={conflicts}
              currentTimeMin={simState?.current_time_min ?? 360}
              selectedConflictId={selectedConflict?.conflict_uid || (selectedConflict?.id ? String(selectedConflict.id) : null)}
              onSelectConflict={setSelectedConflict}
            />
          </div>
        )}

        {visitedTabs.has('conflicts') && (
          <div style={{ display: activeTab === 'conflicts' ? 'block' : 'none' }}>
            <ConflictRadar
              conflicts={conflicts}
              onRefreshConflicts={handleRefreshConflicts}
              onTriggerOptimizer={() => handleSelectTab('optimizer')}
              isLoading={isLoadingConflicts}
              selectedConflictId={selectedConflict?.conflict_uid || (selectedConflict?.id ? String(selectedConflict.id) : null)}
              onSelectConflict={setSelectedConflict}
              onNavigateToStringline={() => handleSelectTab('stringline')}
            />
          </div>
        )}

        {visitedTabs.has('maintenance') && (
          <div style={{ display: activeTab === 'maintenance' ? 'block' : 'none' }}>
            <MaintenancePlanner
              jobs={maintenanceJobs}
              network={network}
              onScheduleJob={handleScheduleJob}
              onRunOptimizer={handleRunMaintenanceOptimizer}
              isLoading={isOptimizingMaintenance}
            />
          </div>
        )}

        {visitedTabs.has('optimizer') && (
          <div style={{ display: activeTab === 'optimizer' ? 'block' : 'none' }}>
            <ScheduleOptimizer
              onOptimizationApplied={async () => {
                const [tr, conf, m] = await Promise.all([
                  api.getTrains().catch(() => []),
                  api.getConflicts('baseline').catch(() => ({ conflicts: [], count: 0 })),
                  api.getMetrics().catch(() => null),
                ]);
                if (tr.length) setTrains(tr);
                if (conf) setConflicts(Array.isArray(conf) ? conf : (conf.conflicts || []));
                if (m) setMetrics(m);
              }}
            />
          </div>
        )}

        {visitedTabs.has('sandbox') && (
          <div style={{ display: activeTab === 'sandbox' ? 'block' : 'none' }}>
            <ScenarioSandbox
              trains={trains}
              blocks={blocks}
              onScenarioRan={handleRefreshConflicts}
            />
          </div>
        )}

        {visitedTabs.has('analytics') && (
          <div style={{ display: activeTab === 'analytics' ? 'block' : 'none' }}>
            <AnalyticsView
              metrics={metrics}
            />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;
