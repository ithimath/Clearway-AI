"""NetworkX graph builder for the railway network.

Pure Python — no FastAPI or SQLAlchemy imports.
Works from the database row dicts provided by the service layer.

Node attributes  : code, name, lat, lon, is_junction, has_passing_loop
Edge attributes  : section_id, running_time_min, headway_min, is_double_track,
                   blocks (list of block codes in traversal order)

Units: times in minutes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import networkx as nx


@dataclass
class NetworkGraph:
    """Wrapper around a NetworkX DiGraph with helper accessors."""

    graph: nx.DiGraph = field(default_factory=nx.DiGraph)

    # -----------------------------------------------------------------------
    # Queries
    # -----------------------------------------------------------------------

    def get_route_blocks(self, from_station: str, to_station: str) -> list[str]:
        """Return ordered list of block codes traversed on the shortest path.

        Uses running_time_min as edge weight.
        Returns empty list if no path exists.
        """
        try:
            path = nx.shortest_path(
                self.graph, from_station, to_station, weight="running_time_min"
            )
        except nx.NetworkXNoPath:
            return []

        blocks: list[str] = []
        for u, v in zip(path[:-1], path[1:]):
            edge_data = self.graph[u][v]
            blocks.extend(edge_data.get("blocks", []))
        return blocks

    def station_codes(self) -> list[str]:
        return list(self.graph.nodes)

    def section_edges(self) -> list[tuple[str, str, dict]]:
        return [(u, v, d) for u, v, d in self.graph.edges(data=True)]

    def neighbors(self, station_code: str) -> list[str]:
        return list(self.graph.successors(station_code))

    def is_single_track(self, from_code: str, to_code: str) -> bool:
        """True if the section between these two stations is single-track."""
        if not self.graph.has_edge(from_code, to_code):
            return False
        return not self.graph[from_code][to_code].get("is_double_track", False)


def build_graph(
    stations: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    blocks: list[dict[str, Any]],
) -> NetworkGraph:
    """Build a directed NetworkX graph from DB row dicts.

    Args:
        stations: list of dicts with keys: code, name, lat, lon,
                  is_junction, has_passing_loop.
        sections: list of dicts with keys: from_station_code, to_station_code,
                  running_time_min, headway_min, is_double_track.
        blocks:   list of dicts with keys: code, section_from, section_to,
                  block_index, time_fraction.

    Returns:
        NetworkGraph wrapping a DiGraph.
    """
    g = nx.DiGraph()

    for st in stations:
        g.add_node(
            st["code"],
            name=st["name"],
            lat=st["lat"],
            lon=st["lon"],
            is_junction=st.get("is_junction", False),
            has_passing_loop=st.get("has_passing_loop", False),
            platform_count=st.get("platform_count", 1),
        )

    # Index blocks by (from, to) → ordered list of codes
    block_index: dict[tuple[str, str], list[str]] = {}
    for blk in sorted(blocks, key=lambda b: (b["section_from"], b["section_to"], b["block_index"])):
        key = (blk["section_from"], blk["section_to"])
        block_index.setdefault(key, []).append(blk["code"])

    for sec in sections:
        frm = sec["from_station_code"]
        to_ = sec["to_station_code"]
        blk_list = block_index.get((frm, to_), [])
        g.add_edge(
            frm, to_,
            section_id=sec.get("section_id", 0),
            running_time_min=sec["running_time_min"],
            headway_min=sec.get("headway_min", 5),
            is_double_track=sec.get("is_double_track", False),
            distance_km=sec.get("distance_km", 0.0),
            blocks=blk_list,
        )

    return NetworkGraph(graph=g)
