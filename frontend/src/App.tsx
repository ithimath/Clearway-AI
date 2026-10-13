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

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('corridor');
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [simState, setSimState] = useState<SimulationState | null>(null);
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);
  const [maintenanceJobs, setMaintenanceJobs] = useState<MaintenanceJob[]>([]);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [isOptimizingMaintenance, setIsOptimizingMaintenance] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(null);

  // Initial data loading
  const loadInitialData = useCallback(async () => {
    try {
      const [netData, trData, blkData, confData, metricData, jobsData, simData] = await Promise.all([
        api.getNetwork().catch((e) => { console.error('getNetwork failed:', e); return null; }),
        api.getTrains().catch((e) => { console.error('getTrains failed:', e); return []; }),
        api.getBlocks().catch((e) => { console.error('getBlocks failed:', e); return []; }),
        api.getConflicts().catch((e) => { console.error('getConflicts failed:', e); return { conflicts: [], count: 0 }; }),
        api.getMetrics().catch((e) => { console.error('getMetrics failed:', e); return null; }),
        api.getMaintenanceJobs().catch((e) => { console.error('getMaintenanceJobs failed:', e); return []; }),
        api.getSimState().catch((e) => { console.error('getSimState failed:', e); return null; }),
      ]);

      if (netData) setNetwork(netData);
      if (trData) setTrains(trData);
      if (blkData) setBlocks(blkData);
      if (confData) {
        setConflicts(Array.isArray(confData) ? confData : (confData.conflicts || []));
      }
      if (metricData) setMetrics(metricData);
      if (jobsData) setMaintenanceJobs(jobsData);
      if (simData) setSimState(simData);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Simulation Polling loop
  useEffect(() => {
    const pollInterval = simState?.is_running ? 1000 : 3500;
    const interval = setInterval(async () => {
      try {
        const state = await api.getSimState();
        setSimState(state);
      } catch (err) {
        // quiet ignore polling glitch
      }
    }, pollInterval);

    return () => clearInterval(interval);
  }, [simState?.is_running]);

  // Simulation handlers
  const handleStartSim = async () => {
    await api.startSim();
    setSimState((prev) => prev ? { ...prev, is_running: true } : null);
  };

  const handlePauseSim = async () => {
    await api.pauseSim();
    setSimState((prev) => prev ? { ...prev, is_running: false } : null);
  };

  const handleResetSim = async (time: number = 360) => {
    await api.resetSim(time);
    const state = await api.getSimState();
    setSimState(state);
  };

  const handleStepSim = async (steps: number = 1) => {
    const updated = await api.stepSim(steps);
    setSimState(updated);
  };

  const handleSetSpeed = async (factor: number) => {
    await api.setSimSpeed(factor);
    setSimState((prev) => prev ? { ...prev, speed_factor: factor } : null);
  };

  // Conflict scanning
  const handleRefreshConflicts = async () => {
    setIsLoadingConflicts(true);
    try {
      const res = await api.detectConflicts(true, 'baseline');
      const loaded = res.conflicts || [];
      setConflicts(loaded);
      setSelectedConflict((prev) => {
        if (!prev) return null;
        return loaded.find((c: ConflictRecord) => c.conflict_uid === prev.conflict_uid) || null;
      });
      const [m, tr, blk] = await Promise.all([
        api.getMetrics().catch(() => null),
        api.getTrains().catch(() => []),
        api.getBlocks().catch(() => []),
      ]);
      if (m) setMetrics(m);
      if (tr.length) setTrains(tr);
      if (blk.length) setBlocks(blk);
    } catch (err) {
      console.error('Failed to detect conflicts:', err);
    } finally {
      setIsLoadingConflicts(false);
    }
  };

  // Maintenance handlers
  const handleScheduleJob = async (job: Partial<MaintenanceJob>) => {
    const created = await api.createMaintenanceJob(job);
    setMaintenanceJobs((prev) => [...prev, created]);
  };

  const handleRunMaintenanceOptimizer = async () => {
    setIsOptimizingMaintenance(true);
    try {
      const res = await api.optimizeMaintenance();
      const pollJob = setInterval(async () => {
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
  };

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        simState={simState}
        onStartSim={handleStartSim}
        onPauseSim={handlePauseSim}
        onResetSim={handleResetSim}
        onStepSim={handleStepSim}
        onSetSpeed={handleSetSpeed}
        conflictCount={conflicts.length}
      />

      <main className="main-content">
        {activeTab === 'corridor' && (
          <CorridorMap 
            network={network} 
            simState={simState} 
          />
        )}

        {activeTab === 'stringline' && (
          <StringlineDiagram
            network={network}
            trains={trains}
            conflicts={conflicts}
            currentTimeMin={simState?.current_time_min ?? 360}
            selectedConflictId={selectedConflict?.conflict_uid || (selectedConflict?.id ? String(selectedConflict.id) : null)}
            onSelectConflict={setSelectedConflict}
          />
        )}

        {activeTab === 'conflicts' && (
          <ConflictRadar
            conflicts={conflicts}
            onRefreshConflicts={handleRefreshConflicts}
            onTriggerOptimizer={() => setActiveTab('optimizer')}
            isLoading={isLoadingConflicts}
            selectedConflictId={selectedConflict?.conflict_uid || (selectedConflict?.id ? String(selectedConflict.id) : null)}
            onSelectConflict={setSelectedConflict}
            onNavigateToStringline={() => setActiveTab('stringline')}
          />
        )}

        {activeTab === 'maintenance' && (
          <MaintenancePlanner
            jobs={maintenanceJobs}
            network={network}
            onScheduleJob={handleScheduleJob}
            onRunOptimizer={handleRunMaintenanceOptimizer}
            isLoading={isOptimizingMaintenance}
          />
        )}

        {activeTab === 'optimizer' && (
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
        )}

        {activeTab === 'sandbox' && (
          <ScenarioSandbox
            trains={trains}
            blocks={blocks}
            onScenarioRan={handleRefreshConflicts}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            metrics={metrics}
          />
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
