import React, { useState, useMemo } from 'react';
import type { NetworkResponse, Train, ConflictRecord } from '../types';
import { Layers, Clock, AlertTriangle } from 'lucide-react';

interface StringlineDiagramProps {
  network: NetworkResponse | null;
  trains: Train[];
  conflicts: ConflictRecord[];
  currentTimeMin?: number;
  selectedConflictId?: string | null;
  onSelectConflict?: (conflict: ConflictRecord | null) => void;
  onSelectTrain?: (trainNumber: string | null) => void;
}

type CorridorKey = 'chennai_madurai_main' | 'chennai_delta_chord' | 'all';
type SpacingMode = 'distance' | 'sequence';
type TimeWindowKey = 'full' | 'morning' | 'evening';

export const StringlineDiagram: React.FC<StringlineDiagramProps> = ({
  network,
  trains,
  conflicts,
  currentTimeMin = 360,
  selectedConflictId = null,
  onSelectConflict,
  onSelectTrain,
}) => {
  const [selectedCorridor, setSelectedCorridor] = useState<CorridorKey>('chennai_madurai_main');
  const [spacingMode, setSpacingMode] = useState<SpacingMode>('distance');
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>('full');
  const [hoveredTrain, setHoveredTrain] = useState<string | null>(null);
  const [hoveredConflict, setHoveredConflict] = useState<ConflictRecord | null>(null);

  // Time window bounds (minutes from midnight)
  const { timeStart, timeEnd } = useMemo(() => {
    switch (timeWindow) {
      case 'morning':
        return { timeStart: 300, timeEnd: 840 }; // 05:00 to 14:00
      case 'evening':
        return { timeStart: 840, timeEnd: 1380 }; // 14:00 to 23:00
      case 'full':
      default:
        return { timeStart: 300, timeEnd: 1380 }; // 05:00 to 23:00
    }
  }, [timeWindow]);

  // Corridor station sequence definitions
  const corridorStations = useMemo(() => {
    if (!network || !network.stations || network.stations.length === 0) return [];

    const stationMap = new Map(network.stations.map((s) => [s.code, s]));

    let targetCodes: string[] = [];
    if (selectedCorridor === 'chennai_madurai_main') {
      targetCodes = ['MS', 'CGL', 'VM', 'TPJ', 'MDU'];
    } else if (selectedCorridor === 'chennai_delta_chord') {
      targetCodes = ['MS', 'TJ', 'MDU'];
    } else {
      // All stations: keep MS at top, then main corridor, then delta and western branches
      const priorityOrder = ['MS', 'TBM', 'CGL', 'VM', 'TPJ', 'DG', 'MDU', 'TJ', 'SA', 'KPD'];
      targetCodes = priorityOrder.filter((code) => stationMap.has(code));
    }

    return targetCodes.map((code) => stationMap.get(code)!).filter(Boolean);
  }, [network, selectedCorridor]);

  // Compute cumulative distance along the selected corridor
  const { stationsWithDistance, totalCorridorDistance } = useMemo(() => {
    if (corridorStations.length === 0) return { stationsWithDistance: [], totalCorridorDistance: 0 };
    if (!network || !network.sections) {
      return {
        stationsWithDistance: corridorStations.map((st, i) => ({ station: st, cumDistanceKm: i * 40, distFromPrevKm: 40 })),
        totalCorridorDistance: (corridorStations.length - 1) * 40,
      };
    }

    // Map section distances
    const secDist = new Map<string, number>();
    network.sections.forEach((s) => {
      // Find station codes
      const fSt = network.stations.find((st) => st.id === s.from_station_id)?.code;
      const tSt = network.stations.find((st) => st.id === s.to_station_id)?.code;
      if (fSt && tSt) {
        secDist.set(`${fSt}->${tSt}`, s.distance_km);
        secDist.set(`${tSt}->${fSt}`, s.distance_km);
      }
    });

    let cumDist = 0;
    const res = corridorStations.map((st, i) => {
      let stepDist = 0;
      if (i > 0) {
        const prevCode = corridorStations[i - 1].code;
        stepDist = secDist.get(`${prevCode}->${st.code}`) || 35.0; // fallback reasonable km
        cumDist += stepDist;
      }
      return {
        station: st,
        cumDistanceKm: cumDist,
        distFromPrevKm: stepDist,
      };
    });

    return { stationsWithDistance: res, totalCorridorDistance: Math.max(cumDist, 1) };
  }, [corridorStations, network]);

  if (!network || !network.stations || network.stations.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
        <Clock size={32} color="var(--accent-cyan)" style={{ margin: '0 auto 12px' }} />
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Loading Railway Infrastructure…</h3>
        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Fetching station topology, interstation distances, and block sections.
        </p>
      </div>
    );
  }

  // Dimensions
  const width = Math.max(1200, (timeEnd - timeStart) * 1.55);
  const height = 580;
  const paddingLeft = 180;
  const paddingRight = 60;
  const paddingTop = 50;
  const paddingBottom = 60;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const timeToX = (t: number) => {
    const clamped = Math.max(timeStart, Math.min(timeEnd, t));
    return paddingLeft + ((clamped - timeStart) / (timeEnd - timeStart)) * chartWidth;
  };

  const stationToY = (stationCode: string) => {
    const idx = stationsWithDistance.findIndex((item) => item.station.code === stationCode);
    if (idx === -1) return null;

    if (spacingMode === 'sequence' || stationsWithDistance.length <= 1) {
      return paddingTop + (idx / Math.max(stationsWithDistance.length - 1, 1)) * chartHeight;
    }

    // Distance-scaled
    const item = stationsWithDistance[idx];
    return paddingTop + (item.cumDistanceKm / totalCorridorDistance) * chartHeight;
  };

  const formatMin = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  };

  // Time ticks: every 30 mins
  const timeTicks: number[] = [];
  for (let t = timeStart; t <= timeEnd; t += 30) {
    timeTicks.push(t);
  }

  // Active corridor station code set
  const corridorStationCodes = new Set(corridorStations.map((s) => s.code));

  // Determine trains on this corridor
  const trainTrajectories = trains
    .map((tr) => {
      const stops = tr.stops || [];
      if (stops.length < 2) return null;

      // Filter to stops on this corridor in route order
      const matchedStops = stops.filter((st) => st.station_code && corridorStationCodes.has(st.station_code));
      if (matchedStops.length < 2) return null;

      const points: { x: number; y: number; time: number; type: 'arr' | 'dep'; station: string }[] = [];

      for (const st of matchedStops) {
        const y = stationToY(st.station_code!);
        if (y === null) continue;

        const arr = st.revised_arrival_min ?? st.planned_arrival_min ?? st.planned_departure_min;
        const dep = st.revised_departure_min ?? st.planned_departure_min ?? st.planned_arrival_min;

        if (arr !== null && arr !== undefined) {
          points.push({ x: timeToX(arr), y, time: arr, type: 'arr', station: st.station_code! });
        }
        if (dep !== null && dep !== undefined && dep !== arr) {
          points.push({ x: timeToX(dep), y, time: dep, type: 'dep', station: st.station_code! });
        }
      }

      if (points.length < 2) return null;

      // Build continuous SVG path
      const pathData = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');

      const isUp = tr.direction === 'up';

      // Check if train is involved in the selected conflict
      const isConflicted = selectedConflictId
        ? conflicts.some(
            (c) =>
              (c.conflict_uid === selectedConflictId || String(c.id) === selectedConflictId) &&
              ((c.trains && c.trains.includes(tr.train_number)) ||
                c.train_1_number === tr.train_number ||
                c.train_2_number === tr.train_number)
          )
        : false;

      return {
        train: tr,
        points,
        pathData,
        isUp,
        isConflicted,
        firstPoint: points[0],
        lastPoint: points[points.length - 1],
      };
    })
    .filter(Boolean);

  // Position conflict markers on the chart
  const conflictMarkers = conflicts
    .map((c) => {
      const time = c.interval_start_min ?? c.start_time_min;
      if (time === undefined || time === null) return null;
      if (time < timeStart || time > timeEnd) return null;

      const x = timeToX(time);
      let y: number | null = null;

      // 1. If station conflict
      if (c.station_code && corridorStationCodes.has(c.station_code)) {
        y = stationToY(c.station_code);
      }
      // 2. If block conflict, determine section
      else if (c.block_code || c.resource_code) {
        const code = c.block_code || c.resource_code || '';
        const clean = code.replace('-REV', '');
        const parts = clean.includes('_') ? clean.split('_') : clean.split('-');
        if (parts.length >= 3) {
          const fromSt = parts[1];
          const toSt = parts[2];
          const y1 = stationToY(fromSt);
          const y2 = stationToY(toSt);
          if (y1 !== null && y2 !== null) {
            y = (y1 + y2) / 2; // Midpoint of section
          } else if (y1 !== null) {
            y = y1;
          } else if (y2 !== null) {
            y = y2;
          }
        }
      }

      // If not located on this corridor, skip
      if (y === null) return null;

      const isSelected = selectedConflictId
        ? c.conflict_uid === selectedConflictId || String(c.id) === selectedConflictId
        : false;

      return {
        conflict: c,
        x,
        y,
        isSelected,
      };
    })
    .filter(Boolean);

  const currentX = timeToX(currentTimeMin);

  return (
    <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Time–Distance Stringline Trajectory Diagram</span>
            <span className="provenance-tag provenance-derived">MAREY TRAJECTORY PROJECTION</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Physical train movements across{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {selectedCorridor === 'chennai_madurai_main'
                ? 'Chennai–Madurai Main Trunk (MS–CGL–VM–TPJ–MDU)'
                : selectedCorridor === 'chennai_delta_chord'
                ? 'Cavery Delta Chord (MS–TJ–MDU)'
                : 'Complete Southern Railway Network'}
            </strong>
            . Continuous trajectories calculated from verified timetable stops.
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, fontSize: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: 'var(--accent-primary)', borderRadius: 2 }}></span>
            <span>Up Trains (Chennai → Madurai)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 14, height: 3, background: 'var(--accent-secondary)', borderRadius: 2 }}></span>
            <span>Down Trains (Madurai → Chennai)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-rose)', boxShadow: '0 0 6px var(--accent-rose)' }}></span>
            <span>Conflict Event</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Corridor Selector, Scale Mode, Time Window */}
      <div
        style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Layers size={14} color="var(--accent-primary)" />
          <span style={{ color: 'var(--text-muted)' }}>Corridor:</span>
          <select
            value={selectedCorridor}
            onChange={(e) => setSelectedCorridor(e.target.value as CorridorKey)}
            style={{
              background: 'var(--bg-input)',
              border: '1.5px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: '0.78rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="chennai_madurai_main">Chennai–Madurai Main (MS → CGL → VM → TPJ → MDU)</option>
            <option value="chennai_delta_chord">Cavery Delta Chord (MS → TJ → MDU)</option>
            <option value="all">All Southern Network Stations</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Spacing Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Y-Axis Scale:</span>
            <div style={{ display: 'inline-flex', background: 'var(--bg-card-subtle)', borderRadius: 6, padding: 2, border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setSpacingMode('distance')}
                style={{
                  background: spacingMode === 'distance' ? 'var(--accent-primary)' : 'transparent',
                  color: spacingMode === 'distance' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Distance (km)
              </button>
              <button
                onClick={() => setSpacingMode('sequence')}
                style={{
                  background: spacingMode === 'sequence' ? 'var(--accent-primary)' : 'transparent',
                  color: spacingMode === 'sequence' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Station Sequence
              </button>
            </div>
          </div>

          {/* Time Window Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} color="var(--accent-primary)" />
            <span style={{ color: 'var(--text-muted)' }}>Time Window:</span>
            <div style={{ display: 'inline-flex', background: 'var(--bg-card-subtle)', borderRadius: 6, padding: 2, border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setTimeWindow('full')}
                style={{
                  background: timeWindow === 'full' ? 'var(--accent-primary)' : 'transparent',
                  color: timeWindow === 'full' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Full Day (05:00–23:00)
              </button>
              <button
                onClick={() => setTimeWindow('morning')}
                style={{
                  background: timeWindow === 'morning' ? 'var(--accent-primary)' : 'transparent',
                  color: timeWindow === 'morning' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Morning (05:00–14:00)
              </button>
              <button
                onClick={() => setTimeWindow('evening')}
                style={{
                  background: timeWindow === 'evening' ? 'var(--accent-primary)' : 'transparent',
                  color: timeWindow === 'evening' ? '#ffffff' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Evening (14:00–23:00)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Diagram Canvas */}
      <div
        style={{
          overflowX: 'auto',
          background: 'var(--chart-bg)',
          borderRadius: 12,
          border: '1px solid var(--border-subtle)',
          padding: 8,
          position: 'relative',
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${width}px`, minWidth: '100%', height: `${height}px`, display: 'block' }}
        >
          {/* Axis Titles */}
          <text
            x={paddingLeft / 2 - 10}
            y={24}
            fill="var(--text-muted)"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            letterSpacing="0.05em"
          >
            {spacingMode === 'distance' ? 'STATIONS & DISTANCE (KM)' : 'STATION SEQUENCE'}
          </text>
          <text
            x={width / 2}
            y={height - 12}
            fill="var(--text-muted)"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            letterSpacing="0.05em"
          >
            TIMELINE (HOURS : MINUTES FROM MIDNIGHT)
          </text>

          {/* Station horizontal grid lines & labels */}
          {stationsWithDistance.map((item) => {
            const y = stationToY(item.station.code);
            if (y === null) return null;
            const isFirst = item.station.code === stationsWithDistance[0].station.code;
            const isLast = item.station.code === stationsWithDistance[stationsWithDistance.length - 1].station.code;

            return (
              <g key={item.station.code}>
                {/* Station Line */}
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke={isFirst || isLast ? 'var(--border-bright)' : 'var(--chart-grid)'}
                  strokeWidth={isFirst || isLast ? '1.5' : '1'}
                  strokeDasharray={item.station.is_junction ? undefined : '3,3'}
                />

                {/* Left Station Name & Distance Tag */}
                <text
                  x={paddingLeft - 14}
                  y={y - 2}
                  fill="var(--chart-station-text)"
                  fontSize="11.5"
                  textAnchor="end"
                  fontFamily="Inter, sans-serif"
                  fontWeight={item.station.is_junction ? 600 : 500}
                >
                  {item.station.name} ({item.station.code})
                </text>
                <text
                  x={paddingLeft - 14}
                  y={y + 12}
                  fill="var(--text-muted)"
                  fontSize="9.5"
                  textAnchor="end"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {spacingMode === 'distance'
                    ? `${item.cumDistanceKm.toFixed(0)} km`
                    : `Seq #${stationsWithDistance.indexOf(item) + 1}`}
                  {item.station.is_junction ? ' · Jct' : ''}
                </text>
              </g>
            );
          })}

          {/* Time vertical grid lines & labels */}
          {timeTicks.map((t) => {
            const x = timeToX(t);
            const isHour = t % 60 === 0;

            return (
              <g key={t}>
                <line
                  x1={x}
                  y1={paddingTop}
                  x2={x}
                  y2={height - paddingBottom}
                  stroke={isHour ? 'var(--chart-grid-hour)' : 'var(--chart-grid)'}
                  strokeWidth={isHour ? '1' : '0.75'}
                  strokeDasharray={isHour ? undefined : '2,2'}
                />
                {isHour && (
                  <text
                    x={x}
                    y={height - paddingBottom + 20}
                    fill="var(--chart-text)"
                    fontSize="10.5"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="500"
                  >
                    {formatMin(t)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Simulation Current Time Indicator */}
          {currentTimeMin >= timeStart && currentTimeMin <= timeEnd && (
            <g>
              <line
                x1={currentX}
                y1={paddingTop - 12}
                x2={currentX}
                y2={height - paddingBottom}
                stroke="var(--accent-primary)"
                strokeWidth="2"
                strokeDasharray="4,3"
              />
              <rect
                x={currentX - 32}
                y={paddingTop - 24}
                width="64"
                height="18"
                rx="4"
                fill="var(--accent-primary)"
              />
              <text
                x={currentX}
                y={paddingTop - 11}
                fill="#ffffff"
                fontSize="10"
                textAnchor="middle"
                fontWeight="700"
                fontFamily="JetBrains Mono, monospace"
              >
                {formatMin(currentTimeMin)}
              </text>
            </g>
          )}

          {/* Train Trajectory Curves */}
          {trainTrajectories.length === 0 ? (
            <text
              x={width / 2}
              y={height / 2}
              fill="var(--text-muted)"
              fontSize="14"
              textAnchor="middle"
              fontFamily="Inter, sans-serif"
            >
              No scheduled train trajectories on the selected corridor and time window.
            </text>
          ) : (
            trainTrajectories.map((item) => {
              if (!item) return null;
              const isHovered = hoveredTrain === item.train.train_number;
              const baseColor = item.isUp ? '#f59e0b' : '#38bdf8';
              const strokeColor = item.isConflicted ? '#f43f5e' : baseColor;

              let strokeWidth = 2;
              let opacity = 0.85;

              if (hoveredTrain) {
                if (isHovered) {
                  strokeWidth = 3.8;
                  opacity = 1;
                } else {
                  opacity = 0.2;
                }
              } else if (selectedConflictId) {
                if (item.isConflicted) {
                  strokeWidth = 3.8;
                  opacity = 1;
                } else {
                  opacity = 0.3;
                }
              }

              return (
                <g
                  key={item.train.train_number}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => {
                    setHoveredTrain(item.train.train_number);
                    if (onSelectTrain) onSelectTrain(item.train.train_number);
                  }}
                  onMouseLeave={() => {
                    setHoveredTrain(null);
                    if (onSelectTrain) onSelectTrain(null);
                  }}
                >
                  {/* Invisible wide hit area for easy mouse interaction */}
                  <path d={item.pathData} fill="none" stroke="transparent" strokeWidth="14" />

                  {/* Main Line */}
                  <path
                    d={item.pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'stroke-width 0.15s, stroke-opacity 0.15s' }}
                  />

                  {/* Station stop knots along path */}
                  {item.points.map((pt, pIdx) => (
                    <circle
                      key={pIdx}
                      cx={pt.x}
                      cy={pt.y}
                      r={isHovered ? 3.5 : 2}
                      fill={strokeColor}
                      opacity={opacity}
                    />
                  ))}

                  {/* Start and End Train Number Labels */}
                  {item.firstPoint && (
                    <text
                      x={item.firstPoint.x}
                      y={item.firstPoint.y - 6}
                      fill={strokeColor}
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace"
                      opacity={opacity}
                    >
                      {item.train.train_number}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Conflict Markers */}
          {conflictMarkers.map((cm, i) => {
            if (!cm) return null;
            const c = cm.conflict;
            const isSelected = cm.isSelected;
            const isHovered = hoveredConflict?.conflict_uid === c.conflict_uid;

            let markerColor = '#f43f5e';
            if (c.severity === 'major' || c.severity === 'high') markerColor = '#f59e0b';
            if (c.severity === 'minor' || c.severity === 'low') markerColor = '#38bdf8';

            return (
              <g
                key={c.conflict_uid || i}
                transform={`translate(${cm.x}, ${cm.y})`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (onSelectConflict) {
                    onSelectConflict(isSelected ? null : c);
                  }
                }}
                onMouseEnter={() => setHoveredConflict(c)}
                onMouseLeave={() => setHoveredConflict(null)}
              >
                {/* Pulse Ring */}
                <circle
                  r={isSelected || isHovered ? 14 : 9}
                  fill={markerColor}
                  fillOpacity={isSelected ? 0.35 : 0.2}
                  className="pulse-active"
                />

                {/* Target Pin */}
                <circle
                  r={isSelected ? 5.5 : 4}
                  fill={markerColor}
                  stroke="var(--bg-deep)"
                  strokeWidth="1.5"
                />

                {/* Selection indicator label */}
                {(isSelected || isHovered) && (
                  <g transform="translate(0, -18)">
                    <rect
                      x="-55"
                      y="-16"
                      width="110"
                      height="20"
                      rx="4"
                      fill="var(--bg-surface-elevated)"
                      stroke={markerColor}
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="-3"
                      fill="var(--text-primary)"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                      fontFamily="Inter, sans-serif"
                    >
                      {c.conflict_type.replace(/_/g, ' ').toUpperCase()}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Trajectory / Conflict Inspection Details Bar */}
      {hoveredTrain && (
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            padding: '12px 18px',
            borderRadius: 8,
            border: '1px solid var(--border-bright)',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                background: 'var(--accent-cyan-subtle)',
                color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)',
                padding: '3px 8px',
                borderRadius: 4,
                fontWeight: 700,
                fontSize: '0.85rem',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              TRAIN {hoveredTrain}
            </span>
            {(() => {
              const tr = trains.find((t) => t.train_number === hoveredTrain);
              if (!tr) return null;
              return (
                <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)' }}>
                  <span>
                    <strong style={{ color: 'var(--text-primary)' }}>{tr.name}</strong>
                  </span>
                  <span>
                    Type: <strong style={{ textTransform: 'capitalize' }}>{tr.train_type}</strong>
                  </span>
                  <span>
                    Direction:{' '}
                    <strong style={{ color: tr.direction === 'up' ? 'var(--accent-primary)' : 'var(--accent-secondary)' }}>
                      {tr.direction.toUpperCase()}
                    </strong>
                  </span>
                  <span>
                    Route: {tr.origin} → {tr.destination}
                  </span>
                  <span>
                    Dep: {tr.planned_departure_min !== null && tr.planned_departure_min !== undefined ? formatMin(tr.planned_departure_min) : 'N/A'} · Arr:{' '}
                    {tr.planned_arrival_min !== null && tr.planned_arrival_min !== undefined ? formatMin(tr.planned_arrival_min) : 'N/A'}
                  </span>
                </div>
              );
            })()}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Hovering trajectory line · Continuous interstation slope
          </div>
        </div>
      )}

      {hoveredConflict && !hoveredTrain && (
        <div
          style={{
            background: 'var(--bg-surface-elevated)',
            padding: '12px 18px',
            borderRadius: 8,
            border: '1px solid var(--accent-rose)',
            fontSize: '0.82rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={16} color="var(--accent-rose)" />
            <div>
              <strong style={{ color: 'var(--accent-rose)', textTransform: 'uppercase' }}>
                {hoveredConflict.conflict_type.replace(/_/g, ' ')}
              </strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
                Trains: {hoveredConflict.train_1_number} & {hoveredConflict.train_2_number} ·{' '}
                {formatMin(hoveredConflict.start_time_min ?? hoveredConflict.interval_start_min ?? 0)}–
                {formatMin(hoveredConflict.end_time_min ?? hoveredConflict.interval_end_min ?? 0)} ·{' '}
                {hoveredConflict.block_code || hoveredConflict.station_code || hoveredConflict.resource_code}
              </span>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
            Click marker to lock selection and highlight trains
          </div>
        </div>
      )}
    </div>
  );
};
