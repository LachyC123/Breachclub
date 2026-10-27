// Authored map definition shared by every map (ASCII tilemap + room/entry metadata).
export interface RoomDef {
  id: string;
  name: string;
  /** inclusive tile rectangles */
  rects: Array<[number, number, number, number]>;
  floor: 'tile' | 'wood' | 'concrete' | 'asphalt' | 'cobble' | 'lino';
  interior: boolean;
}

export interface EntryPoint {
  id: string;
  name: string;
  room: string;
  /** tile-space positions for up to three attackers */
  spots: Array<[number, number]>;
}

export interface MapDef {
  id: string;
  name: string;
  rows: readonly string[];
  rooms: RoomDef[];
  entries: EntryPoint[];
  defenderSpawns: Array<[number, number]>;
  objectiveRoom: string;
  softGroupRooms: Record<string, [string, string]>;
  doorRooms: Record<string, [string, string]>;
  /** door ids that can never be barricaded */
  protectedDoors: string[];
  /** extra inclusive rectangle treated as building interior for prep confinement */
  shell?: [number, number, number, number];
}
