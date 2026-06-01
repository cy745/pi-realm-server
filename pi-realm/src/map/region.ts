// Region / Location system with hierarchical address resolution

import type { LocationData, LocationType } from './types.ts';

export class RegionTree {
  private locations = new Map<string, LocationData>();

  add(loc: LocationData): void {
    this.locations.set(loc.id, loc);
    // Register with parent
    if (loc.parentId) {
      const parent = this.locations.get(loc.parentId);
      if (parent && !parent.childrenIds.includes(loc.id)) {
        parent.childrenIds.push(loc.id);
      }
    }
  }

  get(id: string): LocationData | undefined {
    return this.locations.get(id);
  }

  all(): LocationData[] {
    return Array.from(this.locations.values());
  }

  getRoots(): LocationData[] {
    return this.all().filter((l) => l.parentId === null);
  }

  /** Resolve address for a coordinate: sorted by area descending */
  resolveAddress(x: number, y: number): LocationData[] {
    const hits: LocationData[] = [];
    for (const loc of this.locations.values()) {
      const halfW = loc.width / 2;
      const halfH = loc.height / 2;
      if (x >= loc.x - halfW && x <= loc.x + halfW &&
          y >= loc.y - halfH && y <= loc.y + halfH) {
        hits.push(loc);
      }
    }
    // Sort by area descending (largest first = most general)
    hits.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return hits;
  }

  /** Get address as string: "Town-Village-Tavern-Room" */
  getAddressString(x: number, y: number): string {
    const hits = this.resolveAddress(x, y);
    if (hits.length === 0) return 'Wilderness';
    return hits.map((l) => l.stateOverride ?? l.name).join(' › ');
  }

  /** Get the nearest named location (for orientation) */
  getNearestNamed(x: number, y: number, minType?: LocationType): LocationData | null {
    let nearest: LocationData | null = null;
    let nearestDist = Infinity;
    for (const loc of this.locations.values()) {
      if (minType && loc.type === minType) continue;
      const dist = Math.sqrt((loc.x - x) ** 2 + (loc.y - y) ** 2);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = loc;
      }
    }
    return nearest;
  }

  /** Get orientation relative to nearest location */
  getOrientation(x: number, y: number): string {
    const nearest = this.getNearestNamed(x, y);
    if (!nearest) return 'middle of nowhere';

    const dx = x - nearest.x;
    const dy = y - nearest.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Direction
    let dir: string;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle > -22.5 && angle <= 22.5) dir = 'east';
    else if (angle > 22.5 && angle <= 67.5) dir = 'northeast';
    else if (angle > 67.5 && angle <= 112.5) dir = 'north';
    else if (angle > 112.5 && angle <= 157.5) dir = 'northwest';
    else if (angle > 157.5 || angle <= -157.5) dir = 'west';
    else if (angle > -157.5 && angle <= -112.5) dir = 'southwest';
    else if (angle > -112.5 && angle <= -67.5) dir = 'south';
    else dir = 'southeast';

    return `${dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`} ${dir} of ${nearest.stateOverride ?? nearest.name}`;
  }

  /** Update a location's state (e.g., destroyed by event) */
  updateState(id: string, stateOverride: string): void {
    const loc = this.locations.get(id);
    if (loc) loc.stateOverride = stateOverride;
  }
}

// ── Demo Locations ────────────────────────────────
// These will be replaced by AI-generated data

export function createDemoLocations(terrainSeed: number): RegionTree {
  const tree = new RegionTree();
  const s = terrainSeed; // used for deterministic placement

  // World continent (covers the demo area)
  tree.add({
    id: 'continent',
    name: 'Aeloria',
    type: 'continent',
    x: 0, y: 0,
    width: 200_000, height: 200_000,
    parentId: null,
    childrenIds: [],
    state: 'The continent of Aeloria, a land of diverse landscapes and ancient mysteries.',
    tags: ['world'],
  });

  // ── Towns & Villages ─────────────────────────

  tree.add({
    id: 'region-lake',
    name: 'Lake District',
    type: 'region',
    x: 500, y: 500,
    width: 8_000, height: 6_000,
    parentId: 'continent',
    childrenIds: [],
    state: 'A fertile region surrounding the central lake.',
    tags: ['region', 'fertile'],
  });

  tree.add({
    id: 'town-raven',
    name: 'Raven\'s Hollow',
    type: 'town',
    x: 500, y: 800,
    width: 2_000, height: 1_500,
    parentId: 'region-lake',
    childrenIds: [],
    state: 'A quiet market town with cobblestone streets and a central fountain.',
    tags: ['town', 'market'],
  });

  tree.add({
    id: 'village-oak',
    name: 'Oakwood',
    type: 'village',
    x: -1200, y: 300,
    width: 400, height: 300,
    parentId: 'region-lake',
    childrenIds: [],
    state: 'A small farming village surrounded by wheat fields.',
    tags: ['village', 'farming'],
  });

  // ── Locations in Raven's Hollow ──────────────

  tree.add({
    id: 'raven-square',
    name: 'Market Square',
    type: 'district',
    x: 500, y: 800,
    width: 200, height: 150,
    parentId: 'town-raven',
    childrenIds: [],
    state: 'The bustling market square of Raven\'s Hollow.',
    tags: ['district', 'market'],
  });

  tree.add({
    id: 'tavern-crown',
    name: 'The Crown & Sword',
    type: 'building',
    x: 520, y: 780,
    width: 30, height: 25,
    parentId: 'town-raven',
    childrenIds: [],
    state: 'A warm tavern with a roaring fireplace and the smell of roasted meat.',
    tags: ['tavern', 'inn'],
  });

  tree.add({
    id: 'blacksmith-raven',
    name: 'Hollow Forge',
    type: 'building',
    x: 470, y: 830,
    width: 20, height: 18,
    parentId: 'town-raven',
    childrenIds: [],
    state: 'The town smithy, glowing with forge-fire at all hours.',
    tags: ['blacksmith'],
  });

  tree.add({
    id: 'inn-crown-room1',
    name: 'Private Room',
    type: 'room',
    x: 522, y: 778,
    width: 6, height: 5,
    parentId: 'tavern-crown',
    childrenIds: [],
    state: 'A modest room with a straw bed and a small window.',
    tags: ['room', 'inn'],
  });

  tree.add({
    id: 'inn-crown-toilet',
    name: 'Toilet',
    type: 'room',
    x: 518, y: 776,
    width: 2, height: 1.5,
    parentId: 'tavern-crown',
    childrenIds: [],
    state: 'A small, simple outhouse in the back.',
    tags: ['room', 'utility'],
  });

  // ── Ruins ────────────────────────────────────

  tree.add({
    id: 'ruins-old',
    name: 'Old Crypt Ruins',
    type: 'building',
    x: -1800, y: 2000,
    width: 150, height: 100,
    parentId: 'region-lake',
    childrenIds: [],
    state: 'Crumbling stone walls overgrown with ivy. Strange symbols are carved into the remaining pillars.',
    tags: ['ruins', 'ancient'],
  });

  // ── Forest ───────────────────────────────────

  tree.add({
    id: 'forest-dark',
    name: 'Darkwood Forest',
    type: 'region',
    x: 8000, y: 7000,
    width: 12_000, height: 10_000,
    parentId: 'continent',
    childrenIds: [],
    state: 'A dense, ancient forest where sunlight barely reaches the forest floor.',
    tags: ['forest', 'dangerous'],
  });

  return tree;
}
