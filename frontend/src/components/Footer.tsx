import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-banner">
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        <span>Engine: FastAPI + OR-Tools CP-SAT + NetworkX</span>
        <span>•</span>
        <span>Corridor: Chennai Egmore – Madurai Trunk (Southern Railway / Tamil Nadu)</span>
        <span>•</span>
        <span>Simulation: Deterministic Discrete Event Simulator</span>
      </div>
    </footer>
  );
};
