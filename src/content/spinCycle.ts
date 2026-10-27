// Spin Cycle — authored tilemap for the first slice map (docs/08_MAPS.md).
// 36x28 tiles at 16px. Legend:
//   ' ' exterior ground      '.' interior floor        '#' structural wall
//   'a' 'b' 'c' soft panel groups (breachable, reinforceable)
//   'W' window (sight + shots pass, vault only)
//   '1' '2' '4' barricadable doorway cells (door id = digit)
//   'P' 'Q' 'R' protected doorway cells (never barricaded/plugged): with the always-open
//   service window these guarantee two walking routes from the alley to the office.
//   'M' washing machine   'D' desk   'K' laundry cart   'B' stock shelving
//   'C' archive console   'T' folding table   'X' street car   'U' bins
import type { MapDef, RoomDef, EntryPoint } from './mapdef';

export const SPIN_CYCLE_ROWS: readonly string[] = [
  '                                    ', // 0  north alley
  '                                    ', // 1
  '  ######ccc#####################    ', // 2
  '  #.............#..............#    ', // 3  office | stock
  '  #.......DDD...#..BB..........#    ', // 4
  '  #..CC.........#..BB....BB....R    ', // 5
  '  #.............Q........BB....R    ', // 6
  '  #.............Q........BB....#    ', // 7
  '  #.............#..............#    ', // 8
  '  #...........T.#..BB....BBB...#    ', // 9
  '  #.............#..............#    ', // 10
  '  ##PP####aaa#######bbb####44###    ', // 11
  '  #....#.......................#    ', // 12 service | shop
  '  #....#.......................#    ', // 13
  '  W....#...MMMMM......MMMMM....#    ', // 14
  '  W....#...MMMMM...K..MMMMM....#    ', // 15
  '  #....#.......................#    ', // 16
  '  #....2.......................#    ', // 17
  '  #....2...MMMM........MMMM..K.#    ', // 18
  '  #....#.......................#    ', // 19
  '  #....#.......TT..............#    ', // 20
  '  #....#.......................#    ', // 21
  '  ###############111############    ', // 22
  '                                    ', // 23 street
  '        XXXX                  UU    ', // 24
  '        XXXX                        ', // 25
  '                                    ', // 26
  '                                    ', // 27
];

export const SPIN_CYCLE_ROOMS: RoomDef[] = [
  { id: 'office', name: 'Office', rects: [[3, 3, 15, 10]], floor: 'wood', interior: true },
  { id: 'stock', name: 'Stockroom', rects: [[17, 3, 30, 10]], floor: 'concrete', interior: true },
  { id: 'service', name: 'Service', rects: [[3, 12, 6, 21]], floor: 'lino', interior: true },
  { id: 'shop', name: 'Shop', rects: [[8, 12, 30, 21]], floor: 'tile', interior: true },
  { id: 'street', name: 'Street', rects: [[0, 23, 35, 27]], floor: 'asphalt', interior: false },
  {
    id: 'alley',
    name: 'Alley',
    rects: [
      [0, 0, 35, 1],
      [0, 2, 1, 22],
      [32, 2, 35, 22],
    ],
    floor: 'cobble',
    interior: false,
  },
];

export const SPIN_CYCLE_ENTRIES: EntryPoint[] = [
  { id: 'front', name: 'Front doors', room: 'street', spots: [[17.5, 25.5], [19.5, 26.2], [15.5, 26.2]] },
  { id: 'window', name: 'Service window', room: 'alley', spots: [[0.9, 17.5], [0.9, 19.5], [0.9, 21.2]] },
  { id: 'rear', name: 'Rear stock door', room: 'alley', spots: [[33.5, 8.5], [34.5, 10.5], [33.5, 12.5]] },
];

export const SPIN_CYCLE_DEFENDER_SPAWNS: Array<[number, number]> = [
  [8.5, 7.5],
  [12.5, 5.5],
  [20.5, 6.5],
];

export const SPIN_CYCLE_META = {
  id: 'spin_cycle',
  name: 'Spin Cycle',
  objectiveRoom: 'office',
  softGroupRooms: {
    a: ['shop', 'office'],
    b: ['shop', 'stock'],
    c: ['alley', 'office'],
  } as Record<string, [string, string]>,
  doorRooms: {
    '1': ['street', 'shop'],
    '2': ['service', 'shop'],
    '4': ['shop', 'stock'],
    R: ['stock', 'alley'],
    P: ['service', 'office'],
    Q: ['office', 'stock'],
  } as Record<string, [string, string]>,
  /** service->alley window vault */
  windowRooms: ['alley', 'service'] as [string, string],
};

export const SPIN_CYCLE: MapDef = {
  id: SPIN_CYCLE_META.id,
  name: SPIN_CYCLE_META.name,
  rows: SPIN_CYCLE_ROWS,
  rooms: SPIN_CYCLE_ROOMS,
  entries: SPIN_CYCLE_ENTRIES,
  defenderSpawns: SPIN_CYCLE_DEFENDER_SPAWNS,
  objectiveRoom: SPIN_CYCLE_META.objectiveRoom,
  softGroupRooms: SPIN_CYCLE_META.softGroupRooms,
  doorRooms: SPIN_CYCLE_META.doorRooms,
  protectedDoors: ['P', 'Q', 'R'],
  shell: [2, 2, 31, 22],
  // explosive barrels: street, alley, shop, stock, service and one in the office
  barrels: [
    [13.5, 24.5],
    [24.5, 24.5],
    [22.5, 0.8],
    [29.5, 16.5],
    [18.5, 19.5],
    [28.5, 9.5],
    [20.5, 13.5],
    [4.5, 19.5],
    [10.5, 9.5],
  ],
};
