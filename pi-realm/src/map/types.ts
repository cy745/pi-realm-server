// Map-specific types for the coordinate-based map system

export type LocationType = 'continent' | 'region' | 'town' | 'village' | 'district' | 'building' | 'room';

export interface LocationData {
  id: string;
  name: string;
  type: LocationType;
  // Bounding rectangle in world coordinates (meters)
  x: number;          // center x
  y: number;          // center y
  width: number;      // in meters
  height: number;     // in meters
  // Hierarchy
  parentId: string | null;
  childrenIds: string[];
  // Terrain at this location's center
  terrainType?: string;
  // State (can be modified by events)
  state: string;       // default description
  stateOverride?: string;  // modified by events (e.g. "destroyed")
  // Metadata
  tags: string[];
}
