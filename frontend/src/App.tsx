import React, { useEffect, useState, useCallback } from 'react';
import './styles/index.css';
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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('corridor');
  const [network, setNetwork] = useState<NetworkResponse | null>(null);
  const [trains, setTrains] = useState<Train[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [simState, setSimState] = useState<SimulationState | null>(null);
  const [metrics, setMetrics] = useState<MetricSummary | null>(null);
  const [maintenanceJobs, setMaintenanceJobs] = useState<MaintenanceJob[]>([]);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);

  // Initial data loading
  const loadInitialData = useCallback(async () => {
    try {
      const [netData, trData, blkData, confData, metricData, jobsData, simData] = await Promise.all([
        api.getNetwork(),
        api.getTrains(),
        api.getBlocks(),
        api.getConflicts(),
        api.getMetrics(),
        api.getMaintenanceJobs().catch(() => []),
        api.getSimState(),
      ]);

      setNetwork(netData);
      setTrains(trData);
      setBlocks(blkData);
      setConflicts(confData.conflicts || []);
      setMetrics(metricData);
      setMaintenanceJobs(jobsData || []);
      setSimState(simData);
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
      const res = await api.detectConflicts();
      setConflicts(res.conflicts || []);
      const m = await api.getMetrics();
      setMetrics(m);
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
    const res = await api.optimizeMaintenance();
    // Poll job status
    const pollJob = setInterval(async () => {
      try {
        const status = await api.getJobStatus(res.job_id);
        if (status.status === 'completed') {
          clearInterval(pollJob);
          const updatedJobs = await api.getMaintenanceJobs();
          setMaintenanceJobs(updatedJobs);
          alert('Maintenance window optimization complete! Slots assigned with 0 conflicts.');
        } else if (status.status === 'failed') {
          clearInterval(pollJob);
          alert(`Maintenance optimizer failed: ${status.error_message}`);
        }
      } catch (err) {
        clearInterval(pollJob);
      }
    }, 1000);
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
          />
        )}

        {activeTab === 'conflicts' && (
          <ConflictRadar
            conflicts={conflicts}
            onRefreshConflicts={handleRefreshConflicts}
            onTriggerOptimizer={() => setActiveTab('optimizer')}
            isLoading={isLoadingConflicts}
          />
        )}

        {activeTab === 'maintenance' && (
          <MaintenancePlanner
            jobs={maintenanceJobs}
            network={network}
            onScheduleJob={handleScheduleJob}
            onRunOptimizer={handleRunMaintenanceOptimizer}
          />
        )}

        {activeTab === 'optimizer' && (
          <ScheduleOptimizer
            onOptimizationApplied={async () => {
              const [tr, conf, m] = await Promise.all([
                api.getTrains(),
                api.getConflicts(),
                api.getMetrics(),
              ]);
              setTrains(tr);
              setConflicts(conf.conflicts || []);
              setMetrics(m);
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

export default App;
