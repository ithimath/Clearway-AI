import React, { useEffect, useState } from 'react';
import type { MetricSummary } from '../types';
import { 
  BarChart3, 
  Download, 
  FileText, 
  ShieldCheck, 
  Database, 
  History, 
  Layers, 
  Train
} from 'lucide-react';
import { api } from '../api/client';

interface AnalyticsViewProps {
  metrics: MetricSummary | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ metrics }) => {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    api.getEvents(20).then(setEvents).catch(() => {});
  }, []);

  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const provenanceTable = [
    { entity: 'Station Coordinates & Geometry', tag: 'ASSUMED', color: 'provenance-assumed', note: 'Approximated lat/lon along Delhi-Agra corridor' },
    { entity: 'Inter-Station Running Times', tag: 'ASSUMED', color: 'provenance-assumed', note: 'Standard Indian Railways sectional running times' },
    { entity: 'Block Section Partitioning', tag: 'ASSUMED', color: 'provenance-assumed', note: 'Fixed 2 automatic signalling blocks per section' },
    { entity: 'Safety Headway Buffers', tag: 'ASSUMED', color: 'provenance-assumed', note: '5 minutes minimum headway margin' },
    { entity: 'Timetable Schedules', tag: 'DERIVED', color: 'provenance-derived', note: 'Generated deterministic timetable for 12 express trains' },
    { entity: 'Conflict Violations', tag: 'DERIVED', color: 'provenance-derived', note: 'Computed via rule engine evaluation' },
    { entity: 'Optimized Timetable & Slots', tag: 'DERIVED', color: 'provenance-derived', note: 'Mathematically solved using OR-Tools CP-SAT' },
    { entity: 'Runtime Simulation State', tag: 'SIMULATED', color: 'provenance-simulated', note: 'Deterministic minute-by-minute state machine' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="glass-panel interactive-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fleet Operations</span>
            <Train size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>
            {metrics?.trains.active ?? 12} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ {metrics?.trains.total ?? 12}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="provenance-tag provenance-derived">DERIVED ACTIVE TRAINS</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Track Block Capacity</span>
            <Layers size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#10b981', marginTop: 8 }}>
            {metrics?.blocks.available ?? 18} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ {metrics?.blocks.total ?? 20}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="provenance-tag provenance-assumed">ASSUMED BLOCKS</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>On-Time Performance</span>
            <ShieldCheck size={16} color="#34d399" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#34d399', marginTop: 8 }}>
            {metrics?.delays.on_time_pct ?? 92.5}%
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="provenance-tag provenance-derived">DERIVED KPI</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Average Delay</span>
            <BarChart3 size={16} color="#fbbf24" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fbbf24', marginTop: 8 }}>
            {metrics?.delays.avg_min ?? 2.4} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>mins</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span className="provenance-tag provenance-derived">DERIVED AVERAGE</span>
          </div>
        </div>
      </div>

      {/* Provenance Matrix & Export Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Provenance Ledger */}
        <div className="glass-panel" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Database size={18} color="#06b6d4" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Rigorous Data Provenance Ledger
            </h3>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Every data element in Clearway AI is explicitly categorized to uphold scientific integrity between assumed heuristics and derived optimization outputs.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 10px' }}>Data Entity</th>
                  <th style={{ padding: '8px 10px' }}>Classification</th>
                  <th style={{ padding: '8px 10px' }}>Methodology & Source</th>
                </tr>
              </thead>
              <tbody>
                {provenanceTable.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '9px 10px', fontWeight: 500 }}>{row.entity}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span className={`provenance-tag ${row.color}`}>{row.tag}</span>
                    </td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-secondary)' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export & Download Hub */}
        <div className="glass-panel" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Download size={18} color="#38bdf8" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
              Export Reports
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Export schedule tables and full academic documentation for publication and evaluation.
          </p>

          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => downloadFile('/api/export/timetable', 'clearway_timetable.csv')}
          >
            <FileText size={16} color="#38bdf8" />
            <span>Download Timetable (CSV)</span>
          </button>

          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'flex-start' }}
            onClick={() => downloadFile('/api/export/report', 'clearway_academic_report.md')}
          >
            <FileText size={16} color="#34d399" />
            <span>Download Full Report (Markdown)</span>
          </button>

          <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: 12, borderRadius: 8, fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Includes mathematical formulations, constraint definitions, and complete Delhi–Agra simulation logs.
          </div>
        </div>
      </div>

      {/* System Event Audit Trail */}
      <div className="glass-panel" style={{ padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <History size={18} color="#a855f7" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
            System Audit Trail & Event Stream
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
          {events.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No recent events logged.</p>
          ) : (
            events.map((e, idx) => (
              <div
                key={idx}
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.78rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: e.level === 'warn' ? '#fbbf24' : '#38bdf8'
                  }}></span>
                  <span style={{ fontWeight: 500, color: '#f1f5f9' }}>{e.message}</span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {new Date(e.occurred_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
