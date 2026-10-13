import React from 'react';
import type { MetricSummary } from '../types';
import { 
  BarChart3, 
  Download, 
  FileText, 
  ShieldCheck, 
  Database, 
  Layers, 
  Train,
  Calendar
} from 'lucide-react';

interface AnalyticsViewProps {
  metrics: MetricSummary | null;
}

const AnalyticsViewComponent: React.FC<AnalyticsViewProps> = ({ metrics }) => {
  const downloadFile = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const provenanceTable = [
    { entity: 'Station Coordinates & Geometry', tag: 'ASSUMED', color: 'provenance-assumed', note: 'Approximated lat/lon along Southern Railway Chennai-Madurai corridor' },
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
        <div className="glass-panel interactive-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Fleet Operations
            </span>
            <Train size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 8 }}>
            {metrics?.trains.active ?? 12} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {metrics?.trains.total ?? 12}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="provenance-tag provenance-derived">DERIVED ACTIVE TRAINS</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Track Block Capacity
            </span>
            <Layers size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: 8 }}>
            {metrics?.blocks.available ?? 18} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>/ {metrics?.blocks.total ?? 20}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="provenance-tag provenance-assumed">ASSUMED BLOCKS</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              On-Time Performance
            </span>
            <ShieldCheck size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-emerald)', marginTop: 8 }}>
            {metrics?.delays.on_time_pct ?? 100.0}%
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="provenance-tag provenance-derived">DERIVED KPI</span>
          </div>
        </div>

        <div className="glass-panel interactive-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Average Dispatch Delay
            </span>
            <BarChart3 size={18} color="var(--accent-amber)" />
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--accent-amber)', marginTop: 8 }}>
            {metrics?.delays.avg_min ?? 0.0} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>mins</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span className="provenance-tag provenance-derived">DERIVED AVERAGE</span>
          </div>
        </div>
      </div>

      {/* Provenance Matrix & Export Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* Provenance Ledger */}
        <div className="glass-panel" style={{ padding: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <Database size={18} color="var(--accent-cyan)" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Data Provenance & Scientific Transparency Matrix
            </h3>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
            Every data entity in Clearway AI is classified by source authenticity to ensure research transparency.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Data Entity</th>
                  <th>Classification</th>
                  <th>Methodology / Source</th>
                </tr>
              </thead>
              <tbody>
                {provenanceTable.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.entity}</td>
                    <td>
                      <span className={`provenance-tag ${row.color}`}>{row.tag}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Export Data Actions */}
        <div className="glass-panel" style={{ padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Download size={18} color="var(--accent-primary)" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Corridor Data Exports
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 18 }}>
              Download real CSV datasets generated by the backend database and solver engines.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                className="interactive-card"
                onClick={() => downloadFile('/api/export/timetable', 'timetable_export.csv')}
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={18} color="var(--accent-cyan)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>Export Timetable CSV</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>12 Train schedules & stop sequences</div>
                  </div>
                </div>
                <Download size={15} color="var(--text-muted)" />
              </div>

              <div
                className="interactive-card"
                onClick={() => downloadFile('/api/export/conflicts', 'conflicts_export.csv')}
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={18} color="var(--accent-amber)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>Export Conflict Audit CSV</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Formal safety violation records</div>
                  </div>
                </div>
                <Download size={15} color="var(--text-muted)" />
              </div>

              <div
                className="interactive-card"
                onClick={() => downloadFile('/api/export/maintenance-plan', 'maintenance_plan_export.csv')}
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Calendar size={18} color="var(--accent-emerald)" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>Export Maintenance Plan CSV</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Assigned possession slots & tracks</div>
                  </div>
                </div>
                <Download size={15} color="var(--text-muted)" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AnalyticsView = React.memo(AnalyticsViewComponent);
