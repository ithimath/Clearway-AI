import React, { useState } from 'react';
import type { 
  NetworkResponse, 
  SimulationState
} from '../types';
import { Train as TrainIcon, X, Info } from 'lucide-react';

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
        <p style={{ color: 'var(--text-secondary)' }}>Loading network corridor infrastructure…</p>
      </div>
    );
  }

  const { stations, blocks } = network;
  const simBlocks = simState?.blocks || {};
  const simTrains = simState?.trains || {};

  // Sort stations geographically along the corridor (Chennai to Madurai)
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
      case 'occupied': return 'var(--accent-cyan)';
      case 'reserved': return 'var(--accent-amber)';
      case 'closed': return 'var(--accent-rose)';
      case 'conflicted': return 'var(--accent-rose)';
      case 'available':
      default: return 'var(--accent-emerald)';
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Controls & Status Legend */}
      <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Corridor Schematic & Dynamic Block Visualizer</span>
            <span className="provenance-tag provenance-assumed">ASSUMED BLOCKS (2/SECTION)</span>
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Real-time block occupancy, signal reservations, and train progression along Southern Railway (Chennai Egmore – Madurai). Click any block or station for inspector details.
          </p>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.76rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-emerald)' }}></span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Available</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-cyan)' }}></span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Occupied</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-amber)' }}></span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Reserved</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent-rose)' }}></span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Maintenance Closed</span>
          </div>
        </div>
      </div>

      {/* Main Schematic Corridor Canvas */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedElement ? '1fr 340px' : '1fr', gap: 20 }}>
        <div className="glass-panel" style={{ padding: 24, overflowX: 'auto', background: 'var(--bg-surface)' }}>
          <div style={{ minWidth: 860, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {sortedStations.map((station, idx) => {
              const isLast = idx === sortedStations.length - 1;
              const nextStation = !isLast ? sortedStations[idx + 1] : null;

              // Find section blocks connecting to next station
              const interBlocks = nextStation 
                ? getSectionBlocks(station.code, nextStation.code)
                : [];

              // Active trains dwelling SPECIFICALLY at this station
              const dwellingTrains = Object.values(simTrains).filter((tr: any) => {
                if (tr.status !== 'at_station') return false;
                if (tr.current_station_code) {
                  return tr.current_station_code === station.code;
                }
                // fallback if station not yet tagged
                return tr.current_stop_idx === 0 && station.code === 'MS';
              });

              const isSelected = selectedElement?.type === 'station' && selectedElement.data.code === station.code;

              return (
                <div key={station.code} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Station Node Box */}
                  <div 
                    onClick={() => setSelectedElement({ type: 'station', data: station })}
                    className="interactive-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
                      border: `1.5px solid ${isSelected ? 'var(--border-bright)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 18px',
                      cursor: 'pointer',
                      boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 38,
                        height: 38,
                        borderRadius: 'var(--radius-sm)',
                        background: station.is_junction ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-primary))' : 'var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        color: station.is_junction ? '#ffffff' : 'var(--text-primary)',
                      }}>
                        {station.code}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
                            {station.name}
                          </span>
                          {station.is_junction && (
                            <span style={{ fontSize: '0.66rem', background: 'var(--accent-cyan-subtle)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
                              JUNCTION
                            </span>
                          )}
                          {station.has_passing_loop && (
                            <span style={{ fontSize: '0.66rem', background: 'var(--accent-emerald-subtle)', color: 'var(--accent-emerald)', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
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
                      {dwellingTrains.map((tr: any) => (
                        <div
                          key={tr.train_number}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedElement({ type: 'train', data: tr });
                            onInspectTrain?.(tr.train_number);
                          }}
                          style={{
                            background: 'var(--accent-cyan-subtle)',
                            border: '1px solid var(--accent-cyan)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          <TrainIcon size={14} color="var(--accent-cyan)" />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tr.train_number}</span>
                          <span style={{ color: tr.delay_min > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)', fontSize: '0.7rem', fontWeight: 600 }}>
                            {tr.delay_min > 0 ? `+${tr.delay_min}m` : 'On-Time'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Inter-station Track Blocks (Up & Down lines) */}
                  {!isLast && nextStation && (
                    <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: 68, textTransform: 'uppercase', fontWeight: 600 }}>
                          Section Tracks
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: 10 }}>
                          {interBlocks.map((blk) => {
                            const simBlk = simBlocks[blk.code];
                            const blockColor = getBlockColor(blk.code);
                            const occupyingTrain = simBlk?.current_train ? simTrains[simBlk.current_train] : null;
                            const isBlockSelected = selectedElement?.type === 'block' && selectedElement.data.code === blk.code;

                            return (
                              <div
                                key={blk.code}
                                onClick={() => {
                                  setSelectedElement({ type: 'block', data: { ...blk, live: simBlk } });
                                  onInspectBlock?.(blk.code);
                                }}
                                className="interactive-card"
                                style={{
                                  flex: 1,
                                  background: 'var(--bg-card-subtle)',
                                  border: isBlockSelected ? '2px solid var(--accent-cyan)' : `1.5px solid ${blockColor}`,
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  boxShadow: simBlk?.state === 'occupied' ? `0 0 12px ${blockColor}40` : undefined
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: blockColor }}>
                                      {blk.code}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                    {simBlk?.state ? simBlk.state.toUpperCase() : 'AVAILABLE'}
                                  </span>
                                </div>

                                {occupyingTrain ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent-cyan-subtle)', padding: '2px 6px', borderRadius: 4 }}>
                                    <TrainIcon size={12} color="var(--accent-cyan)" />
                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                      {occupyingTrain.train_number}
                                    </span>
                                  </div>
                                ) : (
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: blockColor }}></span>
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

        {/* Selected Element Inspector Drawer */}
        {selectedElement && (
          <div className="glass-panel" style={{ padding: 20, height: 'fit-content', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={16} color="var(--accent-cyan)" />
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Element Inspector
                </h3>
              </div>
              <button 
                onClick={() => setSelectedElement(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            {selectedElement.type === 'station' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.82rem' }}>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Station Name:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedElement.data.name} ({selectedElement.data.code})
                  </div>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Type & Facilities:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedElement.data.is_junction ? 'Junction Station' : 'Standard Station'} • {selectedElement.data.platform_count} Platform(s)
                  </div>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Passing Loop Siding:</span>
                  <div style={{ fontWeight: 600, color: selectedElement.data.has_passing_loop ? 'var(--accent-emerald)' : 'var(--text-muted)', marginTop: 2 }}>
                    {selectedElement.data.has_passing_loop ? 'Available for train preemption' : 'No Loop'}
                  </div>
                </div>
                <div style={{ padding: '8px 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Coordinates (Assumed):</span>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {selectedElement.data.lat.toFixed(4)}°N, {selectedElement.data.lon.toFixed(4)}°E
                  </div>
                </div>
              </div>
            )}

            {selectedElement.type === 'block' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.82rem' }}>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Block Code:</span>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', marginTop: 2 }}>
                    {selectedElement.data.code}
                  </div>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Current Status:</span>
                  <div style={{ fontWeight: 600, color: getBlockColor(selectedElement.data.code), marginTop: 2, textTransform: 'uppercase' }}>
                    {selectedElement.data.live?.state || 'AVAILABLE'}
                  </div>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Section Segment:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                    {selectedElement.data.section_from} → {selectedElement.data.section_to}
                  </div>
                </div>
                {selectedElement.data.live?.current_train && (
                  <div style={{ padding: '8px 0' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Occupying Train:</span>
                    <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 2 }}>
                      Train {selectedElement.data.live.current_train}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedElement.type === 'train' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.82rem' }}>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Train Service:</span>
                  <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 2 }}>
                    {selectedElement.data.train_number} — {selectedElement.data.name}
                  </div>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status & Direction:</span>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, textTransform: 'capitalize' }}>
                    {selectedElement.data.status.replace('_', ' ')} • {selectedElement.data.direction.toUpperCase()} Bound
                  </div>
                </div>
                <div style={{ padding: '8px 0' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Accrued Delay:</span>
                  <div style={{ fontWeight: 700, color: selectedElement.data.delay_min > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)', marginTop: 2 }}>
                    {selectedElement.data.delay_min > 0 ? `+${selectedElement.data.delay_min} mins` : 'On-Time'}
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
