import React, { useState } from 'react';
import type { 
  NetworkResponse, 
  SimulationState
} from '../types';
import { Train as TrainIcon, Navigation } from 'lucide-react';

interface CorridorMapProps {
  network: NetworkResponse | null;
  simState: SimulationState | null;
  onInspectTrain?: (trainNumber: string) => void;
  onInspectBlock?: (blockCode: string) => void;
}

export const CorridorMap: React.FC<CorridorMapProps> = ({
  network,
  simState,
  onInspectTrain,
  onInspectBlock,
}) => {
  const [selectedElement, setSelectedElement] = useState<{
    type: 'station' | 'block' | 'train';
    data: any;
  } | null>(null);

  if (!network) {
    return (
      <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading network corridor data…</p>
      </div>
    );
  }

  const { stations, blocks } = network;
  const simBlocks = simState?.blocks || {};
  const simTrains = simState?.trains || {};

  // Sort stations geographically along the corridor (e.g. Delhi to Agra)
  const sortedStations = [...stations].sort((a, b) => b.lat - a.lat);

  // Group blocks by section
  const getSectionBlocks = (fromCode: string, toCode: string) => {
    return blocks.filter(
      (b) =>
        (b.section_from === fromCode && b.section_to === toCode) ||
        (b.section_from === toCode && b.section_to === fromCode)
    ).sort((a, b) => a.block_index - b.block_index);
  };

  const getBlockColor = (code: string) => {
    const live = simBlocks[code];
    const state = live ? live.state : 'available';
    switch (state) {
      case 'occupied': return '#38bdf8'; // Blue
      case 'reserved': return '#f59e0b'; // Amber
      case 'closed': return '#ef4444';   // Red
      case 'conflicted': return '#ec4899'; // Magenta
      case 'available':
      default: return '#10b981'; // Green
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Controls & Status Legend */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Corridor Schematic & Dynamic Block Visualizer</span>
            <span className="provenance-tag provenance-assumed">ASSUMED BLOCKS (2/SECTION)</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Real-time block occupancy, signal reservations, and train progression along Delhi–Agra. Click any block or station for inspector details.
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#10b981' }}></span>
            <span>Available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#38bdf8' }}></span>
            <span>Occupied</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f59e0b' }}></span>
            <span>Reserved</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ef4444' }}></span>
            <span>Maintenance Closed</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#ec4899' }}></span>
            <span>Conflicted</span>
          </div>
        </div>
      </div>

      {/* Main Schematic Corridor Canvas / Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedElement ? '1fr 340px' : '1fr', gap: 20 }}>
        <div className="glass-panel" style={{ padding: 24, overflowX: 'auto' }}>
          <div style={{ minWidth: 900, display: 'flex', flexDirection: 'column', gap: 32 }}>
            {sortedStations.map((station, idx) => {
              const isLast = idx === sortedStations.length - 1;
              const nextStation = !isLast ? sortedStations[idx + 1] : null;

              // Find section blocks connecting to next station
              const interBlocks = nextStation 
                ? getSectionBlocks(station.code, nextStation.code)
                : [];

              // Active trains currently dwelling at this station
              const dwellingTrains = Object.values(simTrains).filter(
                (tr) => tr.status === 'at_station' && !tr.current_block
              );

              return (
                <div key={station.code} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Station Node Box */}
                  <div 
                    onClick={() => setSelectedElement({ type: 'station', data: station })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '12px 20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedElement?.data?.code === station.code ? '0 0 16px rgba(56, 189, 248, 0.3)' : undefined
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)')}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: station.is_junction ? '#3b82f6' : '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        color: '#ffffff'
                      }}>
                        {station.code}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>{station.name}</span>
                          {station.is_junction && (
                            <span style={{ fontSize: '0.68rem', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '2px 6px', borderRadius: 4 }}>
                              JUNCTION
                            </span>
                          )}
                          {station.has_passing_loop && (
                            <span style={{ fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', padding: '2px 6px', borderRadius: 4 }}>
                              PASSING LOOP
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {station.platform_count} Platform(s) • Provenance: {station.provenance}
                        </span>
                      </div>
                    </div>

                    {/* Dwelling train tags */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {dwellingTrains.map((tr) => (
                        <div
                          key={tr.train_number}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement({ type: 'train', data: tr });
                            onInspectTrain?.(tr.train_number);
                          }}
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            borderRadius: 6,
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          <TrainIcon size={14} color="#38bdf8" />
                          <span style={{ fontWeight: 600, color: '#e0f2fe' }}>{tr.train_number}</span>
                          <span style={{ color: tr.delay_min > 0 ? '#fbbf24' : '#34d399', fontSize: '0.7rem' }}>
                            {tr.delay_min > 0 ? `+${tr.delay_min}m` : 'On-Time'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inter-station Track Blocks (Up & Down lines) */}
                  {!isLast && nextStation && (
                    <div style={{ padding: '0 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 64, textTransform: 'uppercase' }}>
                          Down Line
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: 10 }}>
                          {interBlocks.map((blk) => {
                            const simBlk = simBlocks[blk.code];
                            const blockColor = getBlockColor(blk.code);
                            const occupyingTrain = simBlk?.current_train ? simTrains[simBlk.current_train] : null;

                            return (
                              <div
                                key={blk.code}
                                onClick={() => {
                                  setSelectedElement({ type: 'block', data: { ...blk, live: simBlk } });
                                  onInspectBlock?.(blk.code);
                                }}
                                style={{
                                  flex: 1,
                                  background: 'rgba(0, 0, 0, 0.4)',
                                  border: `1.5px solid ${blockColor}`,
                                  borderRadius: 8,
                                  padding: '10px 14px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  boxShadow: simBlk?.state === 'occupied' ? `0 0 14px ${blockColor}40` : undefined
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                                onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.78rem', fontWeight: 600, color: blockColor }}>
                                      {blk.code}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                      Idx {blk.block_index}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    {simBlk?.state?.toUpperCase() || 'AVAILABLE'}
                                  </div>
                                </div>

                                {occupyingTrain && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: 'rgba(56, 189, 248, 0.2)',
                                    padding: '4px 8px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(56, 189, 248, 0.4)'
                                  }}>
                                    <Navigation size={12} color="#38bdf8" style={{ transform: occupyingTrain.direction === 'down' ? 'rotate(180deg)' : 'none' }} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#ffffff' }}>
                                      {occupyingTrain.train_number}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Element Details Drawer */}
        {selectedElement && (
          <div className="glass-panel" style={{ padding: 20, height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, textTransform: 'capitalize' }}>
                {selectedElement.type} Inspector
              </h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={() => setSelectedElement(null)}
              >
                Close
              </button>
            </div>

            {selectedElement.type === 'block' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Block Code:</span>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: '#38bdf8' }}>{selectedElement.data.code}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
                  <div style={{ fontWeight: 600, color: getBlockColor(selectedElement.data.code), textTransform: 'uppercase' }}>
                    {selectedElement.data.live?.state || 'AVAILABLE'}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Occupying Train:</span>
                  <div>{selectedElement.data.live?.current_train || 'None (Track Clear)'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Data Provenance:</span>
                  <div>
                    <span className="provenance-tag provenance-assumed">{selectedElement.data.provenance || 'ASSUMED'}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedElement.type === 'station' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Station Name:</span>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{selectedElement.data.name} ({selectedElement.data.code})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Platforms:</span>
                  <div>{selectedElement.data.platform_count}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Junction:</span>
                  <div>{selectedElement.data.is_junction ? 'Yes' : 'No'}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Passing Loop Siding:</span>
                  <div>{selectedElement.data.has_passing_loop ? 'Available' : 'None'}</div>
                </div>
              </div>
            )}

            {selectedElement.type === 'train' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.82rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Train:</span>
                  <div style={{ fontWeight: 600, fontSize: '1rem', color: '#38bdf8' }}>
                    {selectedElement.data.train_number} — {selectedElement.data.name}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <div style={{ textTransform: 'uppercase', fontWeight: 600 }}>{selectedElement.data.status}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Direction:</span>
                  <div style={{ textTransform: 'capitalize' }}>{selectedElement.data.direction}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Delay:</span>
                  <div style={{ color: selectedElement.data.delay_min > 0 ? '#fbbf24' : '#34d399', fontWeight: 600 }}>
                    {selectedElement.data.delay_min > 0 ? `+${selectedElement.data.delay_min} mins` : 'On Time'}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
