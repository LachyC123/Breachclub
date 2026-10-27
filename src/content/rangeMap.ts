// Training Grounds: shooting lanes (targets at ~5, 10 and 16 tiles), a breach house with
// three soft panels and a barricaded door that regenerate, and open floor for Hinge practice.
import type { MapDef } from './mapdef';

const ROWS: readonly string[] = [
  '####################################', // 0
  '#....................#.............#', // 1
  '#....................#.............#', // 2
  '#....................#....K........#', // 3
  '#....................#.............#', // 4
  '#....................#.............#', // 5
  '#....................#..####ccc##..#', // 6
  '#....................#..#.......#..#', // 7
  '#.....K........K.....#..#.......#..#', // 8
  '#....................#..b...CC..#..#', // 9
  '#....................#..b.......#..#', // 10
  '#.......................#.......#..#', // 11
  '#.......................#.......#..#', // 12
  '#.......................##aaa#11#..#', // 13
  '#....................#.............#', // 14
  '#....................#.............#', // 15
  '#....................#.....K.......#', // 16
  '#....................#.............#', // 17
  '#....................#.........K...#', // 18
  '#......K......K......#.............#', // 19
  '#......K......K......#.............#', // 20
  '#......K......K......#.............#', // 21
  '#....................#.............#', // 22
  '#....................#.............#', // 23
  '#....................#.............#', // 24
  '####################################', // 25
];

/** target homes: lane x = 3.5 / 10.5 / 17.5 at ~5, 10 and 16 tiles from the firing line */
export const RANGE_TARGETS: Array<{ x: number; y: number; strafe: boolean }> = [
  { x: 3.5, y: 17, strafe: false },
  { x: 10.5, y: 17, strafe: false },
  { x: 17.5, y: 17, strafe: false },
  { x: 3.5, y: 12, strafe: true },
  { x: 10.5, y: 12, strafe: false },
  { x: 17.5, y: 12, strafe: true },
  { x: 3.5, y: 6, strafe: false },
  { x: 10.5, y: 6, strafe: true },
  { x: 17.5, y: 6, strafe: false },
];

export const RANGE_MAP: MapDef = {
  id: 'range',
  name: 'Training Grounds',
  rows: ROWS,
  rooms: [
    { id: 'lanes', name: 'Firing lanes', rects: [[1, 1, 20, 24]], floor: 'lino', interior: true },
    { id: 'yard', name: 'Breach yard', rects: [[21, 11, 21, 13], [22, 1, 34, 5], [22, 14, 34, 24], [22, 6, 23, 13], [33, 6, 34, 13]], floor: 'concrete', interior: true },
    { id: 'house', name: 'Breach house', rects: [[25, 7, 31, 12]], floor: 'wood', interior: true },
  ],
  entries: [{ id: 'line', name: 'Firing line', room: 'lanes', spots: [[10.5, 22.5], [8.5, 23.5], [12.5, 23.5]] }],
  defenderSpawns: RANGE_TARGETS.map((t) => [t.x, t.y]),
  objectiveRoom: 'house',
  softGroupRooms: { a: ['yard', 'house'], b: ['yard', 'house'], c: ['yard', 'house'] },
  doorRooms: { '1': ['yard', 'house'] },
  protectedDoors: [],
};
