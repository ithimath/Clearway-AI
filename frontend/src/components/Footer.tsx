import React from 'react';
import { AlertTriangle } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-banner">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f59e0b', fontWeight: 600 }}>
        <AlertTriangle size={15} />
        <span>Academic/Hackathon Decision Support Prototype</span>
      </div>
      <div>
        Clearway AI is designed for academic research, planning analysis, and hackathon demonstration. It is <strong>NOT</strong> a certified railway signalling, interlocking, or vital safety system. Never use this software to control real-world trains or track circuits.
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 4, color: 'var(--text-muted)', fontSize: '0.74rem' }}>
        <span>Engine: FastAPI + OR-Tools CP-SAT + NetworkX</span>
        <span>•</span>
        <span>Corridor: Delhi–Agra (Northern Railway / North Central Railway)</span>
        <span>•</span>
        <span>Simulation: Deterministic Discrete Event Simulator</span>
      </div>
    </footer>
  );
};
