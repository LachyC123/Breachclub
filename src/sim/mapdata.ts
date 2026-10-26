// Static map model built from an authored ASCII tilemap. Per-round mutable state
// (soft panel HP, barricades, gadgets) lives in World, never here.
import {
  SPIN_CYCLE_ROWS,
  SPIN_CYCLE_ROOMS,
  SPIN_CYCLE_ENTRIES,
  SPIN_CYCLE_DEFENDER_SPAWNS,
  SPIN_CYCLE_META,
  type RoomDef,
  type EntryPoint,
} from '../content/spinCycle';
import type { Vec } from './types';

export enum CellKind {
  Floor = 0,
  Wall = 1,
  Soft = 2,
  Window = 3,
  Prop = 4,
  Door = 5,
}

export interface SoftGroup {
  index: number;
  id: string;
  cells: number[];
  rooms: [string, string];
  center: Vec;
  /** true when the panel runs along x (horizontal wall) */
  horizontal: boolean;
}

export interface DoorDef {
  index: number;
  id: string;
  cells: number[];
  rooms: [string, string];
  center: Vec;
  horizontal: boolean;
  protected: boolean;
}

export interface VaultLink {
  windowCells: number[];
  /** landing points on either side */
  a: Vec;
  b: Vec;
  center: Vec;
}

export interface MapData {
  id: string;
  name: string;
  w: number;
  h: number;
  kind: Uint8Array;
  prop: string[];
  softGroupOf: Int8Array;
  doorOf: Int8Array;
  roomOf: Int8Array;
  rooms: RoomDef[];
  softGroups: SoftGroup[];
  doors: DoorDef[];
  vaults: VaultLink[];
  console: { cells: number[]; center: Vec };
  entries: EntryPoint[];
  defenderSpawns: Vec[];
  objectiveRoom: string;
  /** cells defenders may not leave during prep / attackers may not enter */
  interior: Uint8Array;
}

export const idx = (m: { w: number }, x: number, y: number) => y * m.w + x;

export function buildSpinCycle(): MapData {
  const rows = SPIN_CYCLE_ROWS;
  const h = rows.length;
  const w = rows[0].length;
  const n = w * h;
  const kind = new Uint8Array(n);
  const prop: string[] = new Array(n).fill('');
  const softGroupOf = new Int8Array(n).fill(-1);
  const doorOf = new Int8Array(n).fill(-1);
  const roomOf = new Int8Array(n).fill(-1);
  const interior = new Uint8Array(n);

  const softIds: string[] = [];
  const doorIds: string[] = [];
  const consoleCells: number[] = [];
  const windowCells: number[] = [];

  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Map row ${y} has width ${rows[y].length}, expected ${w}`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const i = y * w + x;
      switch (ch) {
        case ' ':
        case '.':
          kind[i] = CellKind.Floor;
          break;
        case '#':
          kind[i] = CellKind.Wall;
          break;
        case 'a':
        case 'b':
        case 'c': {
          kind[i] = CellKind.Soft;
          let gi = softIds.indexOf(ch);
          if (gi < 0) {
            softIds.push(ch);
            gi = softIds.length - 1;
          }
          softGroupOf[i] = gi;
          break;
        }
        case 'W':
          kind[i] = CellKind.Window;
          windowCells.push(i);
          break;
        case '1':
        case '2':
        case '4':
        case 'P':
        case 'Q':
        case 'R': {
          kind[i] = CellKind.Door;
          let di = doorIds.indexOf(ch);
          if (di < 0) {
            doorIds.push(ch);
            di = doorIds.length - 1;
          }
          doorOf[i] = di;
          break;
        }
        case 'C':
          kind[i] = CellKind.Prop;
          prop[i] = 'console';
          consoleCells.push(i);
          break;
        case 'M':
          kind[i] = CellKind.Prop;
          prop[i] = 'washer';
          break;
        case 'D':
          kind[i] = CellKind.Prop;
          prop[i] = 'desk';
          break;
        case 'K':
          kind[i] = CellKind.Prop;
          prop[i] = 'cart';
          break;
        case 'B':
          kind[i] = CellKind.Prop;
          prop[i] = 'shelf';
          break;
        case 'T':
          kind[i] = CellKind.Prop;
          prop[i] = 'table';
          break;
        case 'X':
          kind[i] = CellKind.Prop;
          prop[i] = 'car';
          break;
        case 'U':
          kind[i] = CellKind.Prop;
          prop[i] = 'bins';
          break;
        default:
          throw new Error(`Unknown map glyph '${ch}' at ${x},${y}`);
      }
    }
  }

  const rooms = SPIN_CYCLE_ROOMS;
  rooms.forEach((r, ri) => {
    for (const [x0, y0, x1, y1] of r.rects)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * w + x;
          roomOf[i] = ri;
          if (r.interior) interior[i] = 1;
        }
  });
  // Building shell (walls, panels, doors, windows) counts as interior for prep confinement.
  for (let y = 2; y <= 22; y++) for (let x = 2; x <= 31; x++) interior[y * w + x] = 1;

  const centerOf = (cells: number[]): Vec => {
    let sx = 0;
    let sy = 0;
    for (const c of cells) {
      sx += (c % w) + 0.5;
      sy += Math.floor(c / w) + 0.5;
    }
    return { x: sx / cells.length, y: sy / cells.length };
  };
  const isHorizontal = (cells: number[]) => {
    const ys = new Set(cells.map((c) => Math.floor(c / w)));
    return ys.size === 1 && cells.length > 1;
  };

  const softGroups: SoftGroup[] = softIds.map((id, index) => {
    const cells: number[] = [];
    for (let i = 0; i < n; i++) if (softGroupOf[i] === index) cells.push(i);
    return {
      index,
      id,
      cells,
      rooms: SPIN_CYCLE_META.softGroupRooms[id],
      center: centerOf(cells),
      horizontal: isHorizontal(cells),
    };
  });

  const doors: DoorDef[] = doorIds.map((id, index) => {
    const cells: number[] = [];
    for (let i = 0; i < n; i++) if (doorOf[i] === index) cells.push(i);
    return {
      index,
      id,
      cells,
      rooms: SPIN_CYCLE_META.doorRooms[id],
      center: centerOf(cells),
      horizontal: isHorizontal(cells),
      protected: id === 'P' || id === 'Q' || id === 'R',
    };
  });

  // The single authored vault link: alley (west) <-> service through the window.
  const wc = centerOf(windowCells);
  const vaults: VaultLink[] = [
    {
      windowCells,
      a: { x: wc.x - 1.1, y: wc.y },
      b: { x: wc.x + 1.1, y: wc.y },
      center: wc,
    },
  ];

  return {
    id: SPIN_CYCLE_META.id,
    name: SPIN_CYCLE_META.name,
    w,
    h,
    kind,
    prop,
    softGroupOf,
    doorOf,
    roomOf,
    rooms,
    softGroups,
    doors,
    vaults,
    console: { cells: consoleCells, center: centerOf(consoleCells) },
    entries: SPIN_CYCLE_ENTRIES,
    defenderSpawns: SPIN_CYCLE_DEFENDER_SPAWNS.map(([x, y]) => ({ x, y })),
    objectiveRoom: SPIN_CYCLE_META.objectiveRoom,
    interior,
  };
}

export function roomAt(m: MapData, p: Vec): RoomDef | undefined {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return undefined;
  const r = m.roomOf[y * m.w + x];
  if (r >= 0) return m.rooms[r];
  // Wall/door/panel cells: nearest room among 4-neighbours.
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
    const rr = m.roomOf[ny * m.w + nx];
    if (rr >= 0) return m.rooms[rr];
  }
  return undefined;
}
