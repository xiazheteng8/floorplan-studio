const { FloorPlanEngine } = require('./js/engine.js');
const engine = new FloorPlanEngine();

// The layout in the screenshot:
// Perimeter:
// Balcony top: (4400, -2279) to (8800, -2279)
// Balcony right: (8800, -2279) to (8800, 0)
// Bed3 top: (8800, 0) to (12000, 0)
// Right wall: (12000, 0) to (12000, 9000)
// Bottom wall: (12000, 9000) to (0, 9000)
// Left wall: (0, 9000) to (0, 0)
// Study top: (0, 0) to (4400, 0)
// Balcony left: (4400, 0) to (4400, -2279)

const perimeter = [
  {p1: {x: 4400, y: -2279}, p2: {x: 8800, y: -2279}},
  {p1: {x: 8800, y: -2279}, p2: {x: 8800, y: 0}},
  {p1: {x: 8800, y: 0}, p2: {x: 12000, y: 0}},
  {p1: {x: 12000, y: 0}, p2: {x: 12000, y: 9000}},
  {p1: {x: 12000, y: 9000}, p2: {x: 0, y: 9000}},
  {p1: {x: 0, y: 9000}, p2: {x: 0, y: 0}},
  {p1: {x: 0, y: 0}, p2: {x: 4400, y: 0}},
  {p1: {x: 4400, y: 0}, p2: {x: 4400, y: -2279}},
];

perimeter.forEach(w => engine.addWall(w.p1, w.p2, 240, 'bearing'));

// Interior walls:
// Living-Balcony partition: (4400, 0) to (8800, 0)
engine.addWall({x: 4400, y: 0}, {x: 8800, y: 0}, 120, 'normal');

// Study-Living divider: (4400, 0) to (4400, 4800)
engine.addWall({x: 4400, y: 0}, {x: 4400, y: 4800}, 120, 'normal');

// Study-Master divider: (0, 4800) to (4400, 4800)
engine.addWall({x: 0, y: 4800}, {x: 4400, y: 4800}, 120, 'normal');

engine.splitWallsAtIntersections();
engine.syncRoomsWithWalls();
engine.autoDetectRooms();
engine.enforceOuterWallRules();

console.log('--- Walls inspection ---');
engine.walls.forEach(w => {
  console.log(w.id, 'p1:', w.p1, 'p2:', w.p2, 'type:', w.type, 'thickness:', w.thickness);
});
