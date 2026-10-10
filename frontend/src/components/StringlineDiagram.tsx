import React, { useState } from 'react';
import type { NetworkResponse, Train, ConflictRecord } from '../types';

interface StringlineDiagramProps {
  network: NetworkResponse | null;
  trains: Train[];
  conflicts: ConflictRecord[];
  currentTimeMin?: number;
}

export const StringlineDiagram: React.FC<StringlineDiagramProps> = ({
  network,
  trains,
  conflicts,
  currentTimeMin = 360,
}) => {
  const [hoveredTrain, setHoveredTrain] = useState<string | null>(null);

  if (!network || stationsCount(network) === 0) {
    return <div className="glass-panel" style={{ padding: 32 }}>Loading stations…</div>;
  }

  function stationsCount(net: NetworkResponse) {
    return net.stations ? net.stations.length : 0;
  }

  const stations = network.stations;
  // Canvas dimensions
  const width = 1100;
  const height = 550;
  const paddingLeft = 110;
  const paddingRight = 40;
  const paddingTop = 40;
  const paddingBottom = 60;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Time range: 05:00 (300m) to 14:00 (840m)
  const timeStart = 300;
  const timeEnd = 840;

  const timeToX = (t: number) => {
    const clamped = Math.max(timeStart, Math.min(timeEnd, t));
    return paddingLeft + ((clamped - timeStart) / (timeEnd - timeStart)) * chartWidth;
  };

  const stationToY = (index: number) => {
    return paddingTop + (index / (stations.length - 1)) * chartHeight;
  };

  const formatMin = (m: number) => {
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  // Time grid ticks every 60 minutes
  const timeTicks = [];
  for (let t = timeStart; t <= timeEnd; t += 60) {
    timeTicks.push(t);
  }

  // Pre-generate SVG paths for each train
  const trainPaths = trains.map((tr) => {
    const stops = tr.stops || [];
    if (stops.length < 2) return null;

    const points: { x: number; y: number }[] = [];

    stops.forEach((st) => {
      const stIdx = stations.findIndex((s) => s.code === st.station_code || s.id === st.station_id);
      if (stIdx === -1) return;

      const y = stationToY(stIdx);
      const arr = st.planned_arrival_min ?? st.planned_departure_min ?? 0;
      const dep = st.planned_departure_min ?? st.planned_arrival_min ?? 0;

      if (arr) points.push({ x: timeToX(arr), y });
      if (dep && dep !== arr) points.push({ x: timeToX(dep), y });
    });

    if (points.length < 2) return null;

    const pathData = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
    const isUp = tr.direction === 'up';

    return {
      train: tr,
      pathData,
      isUp,
    };
  }).filter(Boolean);

  const currentX = timeToX(currentTimeMin);

  return (
    <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Time-Distance Stringline Trajectory Diagram</span>
            <span className="provenance-tag provenance-derived">TIME-DISTANCE PROJECTION</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Timetable trajectories across Delhi–Agra. Slopes indicate train velocity; intersections on shared track indicate potential crossing conflicts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 14, fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2.5, background: '#38bdf8' }}></span>
            <span>Down Trains (Delhi → Agra)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 2.5, background: '#f59e0b' }}></span>
            <span>Up Trains (Agra → Delhi)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f43f5e' }}></span>
            <span>Conflict Crossing</span>
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: 'rgba(5, 8, 15, 0.6)', borderRadius: 12, padding: 12 }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: 900, height: 'auto', display: 'block' }}>
          {/* Station horizontal grid lines */}
          {stations.map((st, i) => {
            const y = stationToY(i);
            return (
              <g key={st.code}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray={st.is_junction ? undefined : "3,3"}
                />
                <text
                  x={paddingLeft - 12}
                  y={y + 4}
                  fill="var(--text-secondary)"
                  fontSize="11"
                  textAnchor="end"
                  fontFamily="Inter, sans-serif"
                  fontWeight={st.is_junction ? 600 : 400}
                >
                  {st.name} ({st.code})
                </text>
              </g>
            );
          })}

          {/* Time vertical grid lines */}
          {timeTicks.map((t) => {
            const x = timeToX(t);
            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke="rgba(255, 255, 255, 0.06)"
                />
                <text
                  x={x}
                  y={height - paddingBottom + 20}
                  fill="var(--text-muted)"
                  fontSize="11"
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatMin(t)}
                </text>
              </g>
            );
          })}

          {/* Current simulation time line */}
          {currentTimeMin >= timeStart && currentTimeMin <= timeEnd && (
            <g>
              <line
                x1={currentX}
                y1={paddingTop}
                x2={currentX}
                y2={height - paddingBottom}
                stroke="#06b6d4"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
              <circle cx={currentX} cy={paddingTop} r="3" fill="#06b6d4" />
              <text
                x={currentX}
                y={paddingTop - 8}
                fill="#06b6d4"
                fontSize="10"
                textAnchor="middle"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                NOW ({formatMin(currentTimeMin)})
              </text>
            </g>
          )}

          {/* Train Trajectory Curves */}
          {trainPaths.map((tp) => {
            if (!tp) return null;
            const isHovered = hoveredTrain === tp.train.train_number;
            const strokeColor = tp.isUp ? '#f59e0b' : '#38bdf8';

            return (
              <g key={tp.train.train_number}>
                <path
                  d={tp.pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHovered ? 3.5 : 2}
                  strokeOpacity={hoveredTrain && !isHovered ? 0.25 : 0.85}
                  style={{ cursor: 'pointer', transition: 'stroke-width 0.2s, stroke-opacity 0.2s' }}
                  onMouseEnter={() => setHoveredTrain(tp.train.train_number)}
                  onMouseLeave={() => setHoveredTrain(null)}
                />
              </g>
            );
          })}

          {/* Conflict markers */}
          {conflicts.map((c, i) => {
            const x = timeToX(c.start_time_min);
            const y = (paddingTop + chartHeight / 2) + ((i % 3) * 20 - 20);

            return (
              <g key={i} transform={`translate(${x}, ${y})`}>
                <circle r="7" fill="#f43f5e" fillOpacity="0.3" className="pulse-active" />
                <circle r="3.5" fill="#f43f5e" />
                <title>{`${c.conflict_type}: Trains ${c.train_1_number} & ${c.train_2_number} (${c.explanation})`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Trajectory Train Hover Information Card */}
      {hoveredTrain && (
        <div style={{
          background: 'rgba(14, 20, 34, 0.95)',
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid #38bdf8',
          fontSize: '0.82rem',
          display: 'flex',
          gap: 20
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Train:</span>{' '}
            <strong style={{ color: '#38bdf8' }}>{hoveredTrain}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Type:</span> Superfast Express
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Status:</span> Active Timetable Run
          </div>
        </div>
      )}
    </div>
  );
};
