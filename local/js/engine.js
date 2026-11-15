/**
 * Geometric & Floorplan State Engine
 */
class FloorPlanEngine {
  constructor() {
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.rooms = [];
    this.furniture = [];
    this.blueprint = {
      image: null,
      imgElement: null,
      x: 0,
      y: 0,
      scale: 1.0,
      rotation: 0, // degrees
      opacity: 0.5,
      visible: true,
      locked: false,
      mmPerPixel: 10.0 // default 10mm per pixel
    };
    this.compass = {
      x: 100,
      y: 100,
      angle: 0 // degrees
    };

    // History stack for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;

    // Viewport transform
    this.viewport = {
      x: 100,
      y: 100,
      zoom: 0.12 // screen pixels per world mm
    };

    // Settings
    this.snapDistance = 200; // mm
    this.orthoEnabled = true;
    this.gridSize = 100; // mm
    this.defaultWallThickness = 240; // mm
    this.defaultWallType = 'bearing';
    this.targetArea = null; // target building area in m² for proportional scale

    // Multi-floor management
    this.currentFloor = '1F';
    this.floors = {
      '1F': { walls: [], doors: [], windows: [], rooms: [], furniture: [] }
    };
  }

  // --- Multi-floor Management (楼层管理：向上添加+1F、向下添加-1F，不包含0楼层) ---
  static parseFloorNumber(floorStr) {
    if (!floorStr) return 1;
    const match = String(floorStr).trim().match(/^(-?\d+)/);
    if (!match) return 1;
    const n = parseInt(match[1], 10);
    return n === 0 ? 1 : n;
  }

  static getFloorUp(currentFloorStr) {
    const n = FloorPlanEngine.parseFloorNumber(currentFloorStr);
    let next = n + 1;
    if (next === 0) next = 1; // 跳过 0 楼层
    return `${next}F`;
  }

  static getFloorDown(currentFloorStr) {
    const n = FloorPlanEngine.parseFloorNumber(currentFloorStr);
    let next = n - 1;
    if (next === 0) next = -1; // 跳过 0 楼层
    return `${next}F`;
  }

  static sortFloors(floorList) {
    return [...floorList].sort((a, b) => {
      const na = FloorPlanEngine.parseFloorNumber(a);
      const nb = FloorPlanEngine.parseFloorNumber(b);
      return nb - na; // 从高层到低层排序：如 3F, 2F, 1F, -1F, -2F
    });
  }

  static sortFloorsAscending(floorList) {
    return [...floorList].sort((a, b) => {
      const na = FloorPlanEngine.parseFloorNumber(a);
      const nb = FloorPlanEngine.parseFloorNumber(b);
      return na - nb; // 从低层到高层排序：如 -1F, 1F, 2F, 3F
    });
  }

  saveCurrentFloorState() {
    this.floors[this.currentFloor] = {
      walls: JSON.parse(JSON.stringify(this.walls)),
      doors: JSON.parse(JSON.stringify(this.doors)),
      windows: JSON.parse(JSON.stringify(this.windows)),
      rooms: JSON.parse(JSON.stringify(this.rooms)),
      furniture: JSON.parse(JSON.stringify(this.furniture))
    };
  }

  switchFloor(floorId) {
    if (this.currentFloor === floorId) return;
    this.saveCurrentFloorState();
    if (!this.floors[floorId]) {
      this.floors[floorId] = { walls: [], doors: [], windows: [], rooms: [], furniture: [] };
    }
    this.currentFloor = floorId;
    const fl = this.floors[floorId];
    this.walls = JSON.parse(JSON.stringify(fl.walls || []));
    this.doors = JSON.parse(JSON.stringify(fl.doors || []));
    this.windows = JSON.parse(JSON.stringify(fl.windows || []));
    this.rooms = JSON.parse(JSON.stringify(fl.rooms || []));
    this.furniture = JSON.parse(JSON.stringify(fl.furniture || []));
    this.autoDetectRooms();
    this.enforceOuterWallRules();
    this.recordHistory();
  }

  addFloor(floorId, copyFromFloor = null) {
    this.saveCurrentFloorState();
    if (copyFromFloor && this.floors[copyFromFloor]) {
      this.floors[floorId] = JSON.parse(JSON.stringify(this.floors[copyFromFloor]));
    } else {
      this.floors[floorId] = { walls: [], doors: [], windows: [], rooms: [], furniture: [] };
    }
    this.switchFloor(floorId);
  }

  deleteFloor(floorId) {
    const keys = Object.keys(this.floors);
    if (keys.length <= 1) return false;
    delete this.floors[floorId];
    if (this.currentFloor === floorId) {
      const remaining = Object.keys(this.floors);
      this.currentFloor = remaining[0];
      const fl = this.floors[this.currentFloor];
      this.walls = JSON.parse(JSON.stringify(fl.walls || []));
      this.doors = JSON.parse(JSON.stringify(fl.doors || []));
      this.windows = JSON.parse(JSON.stringify(fl.windows || []));
      this.rooms = JSON.parse(JSON.stringify(fl.rooms || []));
      this.furniture = JSON.parse(JSON.stringify(fl.furniture || []));
      this.autoDetectRooms();
      this.enforceOuterWallRules();
    }
    this.recordHistory();
    return true;
  }

  copyFloorTo(sourceFloorId, targetFloorId) {
    this.saveCurrentFloorState();
    if (!this.floors[sourceFloorId]) return false;
    this.floors[targetFloorId] = JSON.parse(JSON.stringify(this.floors[sourceFloorId]));
    this.switchFloor(targetFloorId);
    return true;
  }

  // --- Vector Math Utilities ---
  static dist(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static angle(p1, p2) {
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  static projectPointToSegment(p, a, b) {
    const l2 = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
    if (l2 === 0) return { point: { x: a.x, y: a.y }, t: 0, dist: FloorPlanEngine.dist(p, a) };
    let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const proj = {
      x: a.x + t * (b.x - a.x),
      y: a.y + t * (b.y - a.y)
    };
    return { point: proj, t, dist: FloorPlanEngine.dist(p, proj) };
  }

  static polygonArea(points) {
    if (!points || points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return Math.abs(area / 2.0);
  }

  static polygonCentroid(points) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    let cx = 0, cy = 0;
    for (let p of points) {
      cx += p.x;
      cy += p.y;
    }
    return { x: cx / points.length, y: cy / points.length };
  }

  static isPointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) &&
        (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  static getSegmentIntersection(a1, a2, b1, b2) {
    const dax = a2.x - a1.x, day = a2.y - a1.y;
    const dbx = b2.x - b1.x, dby = b2.y - b1.y;
    const denom = dax * dby - day * dbx;
    if (Math.abs(denom) < 1e-5) return null;
    const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
    const u = ((b1.x - a1.x) * day - (b1.y - a1.y) * dax) / denom;
    if (t >= -0.01 && t <= 1.01 && u >= -0.01 && u <= 1.01) {
      return { x: Math.round(a1.x + t * dax), y: Math.round(a1.y + t * day) };
    }
    return null;
  }

  // --- Viewport Coordinate Conversion ---
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewport.x) / this.viewport.zoom,
      y: (sy - this.viewport.y) / this.viewport.zoom
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.viewport.zoom + this.viewport.x,
      y: wy * this.viewport.zoom + this.viewport.y
    };
  }

  // --- Snapping Helper ---
  // 自动吸附 + 对齐吸附：
  //   1) 端点吸附（墙角）  2) 墙线吸附（T 形接头）  3) 正交锁定（0/90/45°）
  //   4) 对齐吸附（与已有墙角 X/Y 对齐，显示橙色虚线辅助线）  5) 长度/网格取整（50mm）
  snapPoint(pt, activeWallStart = null, excludeWallIds = null) {
    const result = { x: pt.x, y: pt.y, snapped: false, type: null, guide: null, guides: [] };
    const zoom = (this.viewport && this.viewport.zoom) || 0.05;
    // 吸附阈值以屏幕像素计算，缩放时手感保持一致
    const tol = Math.max(this.snapDistance || 200, 14 / zoom);
    const alignTol = Math.max(120, 10 / zoom);
    const walls = this.walls.filter(w => !(excludeWallIds && excludeWallIds.has(w.id)));

    // 候选墙角点与房间顶点
    const corners = [];
    for (const w of walls) { corners.push(w.p1, w.p2); }
    if (this.rooms) {
      for (const r of this.rooms) {
        if (r.polygon) {
          for (const p of r.polygon) corners.push(p);
        }
      }
    }
    if (activeWallStart) corners.push(activeWallStart);

    // ---- 1. 端点吸附（最高优先级） ----
    let best = null, bestD = tol;
    for (const c of corners) {
      if (activeWallStart && c === activeWallStart) continue;
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best) {
      result.x = best.x; result.y = best.y;
      result.snapped = true; result.type = 'vertex';
      return result;
    }

    // ---- 2. 正交锁定 ----
    let lockAxis = null; // 'h' => y 固定, 'v' => x 固定, 'd' => 45°
    if (activeWallStart && this.orthoEnabled) {
      const dx = pt.x - activeWallStart.x, dy = pt.y - activeWallStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const deg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const angDiff = t => Math.min(Math.abs(deg - t), 360 - Math.abs(deg - t));
        if (angDiff(0) < 10 || angDiff(180) < 10) {
          lockAxis = 'h'; result.y = activeWallStart.y;
        } else if (angDiff(90) < 10 || angDiff(270) < 10) {
          lockAxis = 'v'; result.x = activeWallStart.x;
        } else {
          for (const t of [45, 135, 225, 315]) {
            if (angDiff(t) < 5) {
              const a = t * Math.PI / 180;
              const proj = dx * Math.cos(a) + dy * Math.sin(a);
              result.x = activeWallStart.x + Math.cos(a) * proj;
              result.y = activeWallStart.y + Math.sin(a) * proj;
              lockAxis = 'd';
              break;
            }
          }
        }
        if (lockAxis) {
          result.snapped = true; result.type = 'ortho';
        }
      }
    }

    // ---- 3. 墙线吸附（落在已有墙体中心线上，形成 T 形接头） ----
    let wallHit = null, wallD = tol * 0.8;
    for (const w of walls) {
      const len = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
      if (len < 1) continue;
      let q = null;
      if (lockAxis === 'h' || lockAxis === 'v') {
        // 沿正交方向与墙体求交，保证仍然横平竖直
        const isWallVert = Math.abs(w.p2.x - w.p1.x) < 1;
        const isWallHoriz = Math.abs(w.p2.y - w.p1.y) < 1;
        if (lockAxis === 'h' && isWallVert) {
          const ymin = Math.min(w.p1.y, w.p2.y), ymax = Math.max(w.p1.y, w.p2.y);
          if (result.y >= ymin && result.y <= ymax) q = { x: w.p1.x, y: result.y };
        } else if (lockAxis === 'v' && isWallHoriz) {
          const xmin = Math.min(w.p1.x, w.p2.x), xmax = Math.max(w.p1.x, w.p2.x);
          if (result.x >= xmin && result.x <= xmax) q = { x: result.x, y: w.p1.y };
        }
      } else if (!lockAxis) {
        const proj = FloorPlanEngine.projectPointToSegment(result, w.p1, w.p2);
        if (proj.t > 0 && proj.t < 1) q = { x: proj.point.x, y: proj.point.y };
      }
      if (!q) continue;
      const d = Math.hypot(result.x - q.x, result.y - q.y);
      if (d < wallD) { wallD = d; wallHit = q; }
    }
    if (wallHit) {
      result.x = Math.round(wallHit.x); result.y = Math.round(wallHit.y);
      result.snapped = true; result.type = 'wall';
      if (activeWallStart) result.guide = { x1: activeWallStart.x, y1: activeWallStart.y, x2: result.x, y2: result.y };
      result.guides = result.guide ? [result.guide] : [];
      return result;
    }

    // ---- 4. 对齐吸附（与已有墙角在 X / Y 方向对齐） ----
    let alignX = null, alignY = null, dxBest = alignTol, dyBest = alignTol;
    if (lockAxis !== 'd') {
      for (const c of corners) {
        if (lockAxis !== 'v') { // x 可调
          const d = Math.abs(result.x - c.x);
          if (d < dxBest && !(activeWallStart && lockAxis === 'h' && c === activeWallStart)) { dxBest = d; alignX = c; }
        }
        if (lockAxis !== 'h') { // y 可调
          const d = Math.abs(result.y - c.y);
          if (d < dyBest && !(activeWallStart && lockAxis === 'v' && c === activeWallStart)) { dyBest = d; alignY = c; }
        }
      }
    }
    if (alignX) {
      result.x = alignX.x;
      result.guides.push({ x1: alignX.x, y1: alignX.y, x2: alignX.x, y2: result.y, kind: 'align', label: '与相邻房间持平对齐' });
    }
    if (alignY) {
      result.y = alignY.y;
      result.guides.push({ x1: alignY.x, y1: alignY.y, x2: result.x, y2: alignY.y, kind: 'align', label: '与相邻房间持平对齐' });
    }
    if (alignX || alignY) {
      result.snapped = true;
      result.type = result.type === 'ortho' ? 'ortho_align' : 'align';
    }

    // ---- 5. 长度 / 网格取整（50mm 标准模数） ----
    const step = 50;
    if (activeWallStart && (lockAxis === 'h' || lockAxis === 'v')) {
      if (lockAxis === 'h' && !alignX) {
        result.x = activeWallStart.x + Math.round((result.x - activeWallStart.x) / step) * step;
      }
      if (lockAxis === 'v' && !alignY) {
        result.y = activeWallStart.y + Math.round((result.y - activeWallStart.y) / step) * step;
      }
    } else if (lockAxis !== 'd') {
      if (!alignX) result.x = Math.round(result.x / step) * step;
      if (!alignY) result.y = Math.round(result.y / step) * step;
    }
    result.x = Math.round(result.x);
    result.y = Math.round(result.y);
    // 对齐辅助线终点跟随最终落点
    for (const g of result.guides) {
      if (g.x1 === g.x2) g.y2 = result.y; else g.x2 = result.x;
    }

    if (lockAxis && activeWallStart) {
      result.guides.unshift({ x1: activeWallStart.x, y1: activeWallStart.y, x2: result.x, y2: result.y, kind: 'ortho' });
    }
    result.guide = result.guides[0] || null;
    if (!result.snapped) result.type = 'grid';
    return result;
  }

  // --- Wall Management ---
  addWall(p1, p2, thickness = this.defaultWallThickness, type = this.defaultWallType) {
    if (FloorPlanEngine.dist(p1, p2) < 200) return null; // minimum 200mm wall
    const wall = {
      id: 'w_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      p1: { x: Math.round(p1.x), y: Math.round(p1.y) },
      p2: { x: Math.round(p2.x), y: Math.round(p2.y) },
      thickness: thickness || 240,
      type: type || 'bearing'
    };
    this.walls.push(wall);
    this.syncRoomsWithWalls();
    this.autoDetectRooms();
    this.enforceOuterWallRules();
    this.recordHistory();
    return wall;
  }

  deleteWall(wallId) {
    this.walls = this.walls.filter(w => w.id !== wallId);
    this.doors = this.doors.filter(d => d.wallId !== wallId);
    this.windows = this.windows.filter(wn => wn.wallId !== wallId);
    this.syncRoomsWithWalls();
    this.autoDetectRooms();
    this.enforceOuterWallRules();
    this.recordHistory();
  }

  // Add rectangular room quickly with automatic room polygon creation
  addRectangularRoom(p1, p2, thickness = 240, type = 'bearing') {
    const x1 = Math.min(p1.x, p2.x);
    const x2 = Math.max(p1.x, p2.x);
    const y1 = Math.min(p1.y, p2.y);
    const y2 = Math.max(p1.y, p2.y);

    if (Math.abs(x2 - x1) < 500 || Math.abs(y2 - y1) < 500) return null;

    this._suspendRoomSync = true;
    const w1 = this.addWall({ x: x1, y: y1 }, { x: x2, y: y1 }, thickness, type);
    const w2 = this.addWall({ x: x2, y: y1 }, { x: x2, y: y2 }, thickness, type);
    const w3 = this.addWall({ x: x2, y: y2 }, { x: x1, y: y2 }, thickness, type);
    const w4 = this.addWall({ x: x1, y: y2 }, { x: x1, y: y1 }, thickness, type);
    this._suspendRoomSync = false;

    // Create room object inside the rectangular boundary
    const assignedName = this.nextAutoRoomName();
    const newRoom = {
      id: 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: assignedName,
      type: 'room',
      auto: true,
      floorTexture: FloorPlanEngine.getDefaultFloorForRoom(assignedName),
      polygon: [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 }
      ],
      center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
      labelPos: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    };
    this.rooms.push(newRoom);
    // 新矩形若切分了已有空间，其余封闭空间同样自动命名
    this.syncRoomsWithWalls();
    this.autoDetectRooms();
    this.enforceOuterWallRules();
    this.saveCurrentFloorState();
    this.recordHistory();
    return newRoom;
  }

  // --- Openings (Doors & Windows) Management ---
  addOpening(type, wallId, t, width = 900) {
    const isDoor = ['single_door', 'double_door', 'sliding_door', 'opening', 'doorway', 'entry_door'].includes(type);
    const opening = {
      id: (isDoor ? 'd_' : 'wn_') + Date.now() + '_' + Math.floor(Math.random() * 1000),
      wallId,
      t: Math.max(0.02, Math.min(0.98, t)),
      width: width,
      type,
      flipX: false,
      flipY: false
    };

    if (isDoor) {
      this.doors.push(opening);
    } else {
      this.windows.push(opening);
    }
    this.recordHistory();
    return opening;
  }

  deleteOpening(id) {
    this.doors = this.doors.filter(d => d.id !== id);
    this.windows = this.windows.filter(wn => wn.id !== id);
    this.recordHistory();
  }

  // --- Furniture Management ---
  addFurniture(itemType, x, y, rotation = 0) {
    const catalogItem = FURNITURE_CATALOG.find(f => f.id === itemType);
    if (!catalogItem) return null;

    const furn = {
      id: 'f_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      type: itemType,
      name: catalogItem.name,
      category: catalogItem.category,
      x: Math.round(x),
      y: Math.round(y),
      width: catalogItem.width,
      height: catalogItem.height,
      rotation: rotation || 0,
      flipH: false,
      flipV: false
    };
    this.furniture.push(furn);
    this.recordHistory();
    return furn;
  }

  deleteFurniture(id) {
    this.furniture = this.furniture.filter(f => f.id !== id);
    this.recordHistory();
  }

  // --- Room Auto Detection & Default Floor Material ---
  static getDefaultFloorForRoom(roomName) {
    if (!roomName) return 'wood_warm';
    const name = String(roomName).toLowerCase();
    // 1. 厨房、卫生间使用小方砖
    if (name.includes('厨') || name.includes('卫') || name.includes('浴') || name.includes('厕') || name.includes('洗手') || name.includes('盥洗')) {
      return 'tile_hex';
    }
    // 2. 院子、草坪、花园使用绿草地
    if (name.includes('院') || name.includes('草坪') || name.includes('花园')) {
      return 'outdoor_lawn';
    }
    // 3. 阳台、露台、洗衣房类的使用灰砖 / 户外砖
    if (name.includes('阳台') || name.includes('露台') || name.includes('洗衣') || name.includes('家政') || name.includes('生活台') || name.includes('设备')) {
      return 'tile_grey';
    }
    // 3. 客厅、餐厅、x厅类的使用大理石
    if (name.includes('厅') || name.includes('玄关') || name.includes('过道') || name.includes('走廊') || name.includes('入户')) {
      return 'tile_carrara';
    }
    // 4. 卧室、书房、衣帽间等默认使用木地板
    return 'wood_warm';
  }

  // 从当前所有墙体中自动提取所有封闭多边形空间 (Planar Face Finding)
  detectClosedPolygonsFromWalls() {
    const validWalls = (this.walls || []).filter(w => w && w.p1 && w.p2 && w.type !== 'virtual');
    if (validWalls.length < 3) return [];

    const segs = validWalls.map(w => ({
      p1: { x: Math.round(w.p1.x), y: Math.round(w.p1.y) },
      p2: { x: Math.round(w.p2.x), y: Math.round(w.p2.y) }
    })).filter(s => Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) > 80);

    const points = [];
    function getOrCreatePt(p, tol = 50) {
      for (const pt of points) {
        if (Math.hypot(pt.x - p.x, pt.y - p.y) < tol) return pt;
      }
      const np = { x: Math.round(p.x), y: Math.round(p.y) };
      points.push(np);
      return np;
    }

    segs.forEach(s => { s.a = getOrCreatePt(s.p1); s.b = getOrCreatePt(s.p2); });

    // 交叉相交与 T 形接头切分
    const cuts = segs.map(s => [s.a, s.b]);
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s1 = segs[i], s2 = segs[j];
        const inter = FloorPlanEngine.getSegmentIntersection(s1.a, s1.b, s2.a, s2.b);
        if (inter) {
          const pt = getOrCreatePt(inter);
          if (!cuts[i].includes(pt)) cuts[i].push(pt);
          if (!cuts[j].includes(pt)) cuts[j].push(pt);
        }
      }
    }

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      const l2 = dx * dx + dy * dy;
      if (l2 < 100) continue;
      for (const p of points) {
        if (cuts[i].includes(p)) continue;
        const t = ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / l2;
        if (t > 0.01 && t < 0.99) {
          const px = s.a.x + t * dx, py = s.a.y + t * dy;
          if (Math.hypot(p.x - px, p.y - py) < 80) {
            cuts[i].push(p);
          }
        }
      }
    }

    const atomicEdges = [];
    cuts.forEach((cList, i) => {
      const s = segs[i];
      cList.sort((p1, p2) => {
        const d1 = (p1.x - s.a.x) * (s.b.x - s.a.x) + (p1.y - s.a.y) * (s.b.y - s.a.y);
        const d2 = (p2.x - s.a.x) * (s.b.x - s.a.x) + (p2.y - s.a.y) * (s.b.y - s.a.y);
        return d1 - d2;
      });
      for (let k = 0; k < cList.length - 1; k++) {
        const u = cList[k], v = cList[k + 1];
        if (u !== v && Math.hypot(u.x - v.x, u.y - v.y) > 60) {
          const exists = atomicEdges.some(e => (e.u === u && e.v === v) || (e.u === v && e.v === u));
          if (!exists) atomicEdges.push({ u, v });
        }
      }
    });

    const adj = new Map();
    points.forEach(p => adj.set(p, []));
    atomicEdges.forEach(e => {
      adj.get(e.u).push({ from: e.u, to: e.v, angle: Math.atan2(e.v.y - e.u.y, e.v.x - e.u.x) });
      adj.get(e.v).push({ from: e.v, to: e.u, angle: Math.atan2(e.u.y - e.v.y, e.u.x - e.v.x) });
    });

    for (const [p, edList] of adj.entries()) {
      edList.sort((a, b) => a.angle - b.angle);
    }

    const visited = new Set();
    const faces = [];

    for (const [u, edges] of adj.entries()) {
      for (const e0 of edges) {
        const k0 = `${e0.from.x},${e0.from.y}->${e0.to.x},${e0.to.y}`;
        if (visited.has(k0)) continue;

        const path = [];
        let cur = e0;
        let closed = false;

        for (let step = 0; step < 200; step++) {
          const ek = `${cur.from.x},${cur.from.y}->${cur.to.x},${cur.to.y}`;
          if (visited.has(ek)) {
            if (cur.from === path[0]) closed = true;
            break;
          }
          visited.add(ek);
          path.push(cur.from);

          const v = cur.to;
          if (v === path[0]) {
            closed = true;
            break;
          }

          const outEdges = adj.get(v);
          if (!outEdges || outEdges.length === 0) break;

          let nextEdge = null;
          for (let i = 0; i < outEdges.length; i++) {
            if (outEdges[i].to === cur.from) {
              nextEdge = outEdges[(i + 1) % outEdges.length];
              break;
            }
          }
          if (!nextEdge) break;
          cur = nextEdge;
        }

        if (closed && path.length >= 3) {
          let area2 = 0;
          for (let i = 0; i < path.length; i++) {
            const j = (i + 1) % path.length;
            area2 += path[i].x * path[j].y - path[j].x * path[i].y;
          }
          // 逆时针环在屏幕坐标系 (Y向下) 下 area2 < 0，代表封闭内表面（房间）
          if (area2 < -2000000) {
            const areaSqM = Math.abs(area2 / 2000000);
            if (areaSqM < 1000) {
              faces.push({
                polygon: path.map(p => ({ x: p.x, y: p.y })),
                area: parseFloat(areaSqM.toFixed(2)),
                center: FloorPlanEngine.polygonCentroid(path)
              });
            }
          }
        }
      }
    }
    return faces;
  }

  // 仅更新房间几何属性（面积 / 中心点），不增删房间
  autoDetectRooms() {
    for (const r of this.rooms) {
      if (r.polygon && r.polygon.length >= 3) {
        r.area = FloorPlanEngine.polygonArea(r.polygon) / 1000000; // to m²
        r.center = FloorPlanEngine.polygonCentroid(r.polygon);
      }
    }
  }

  // 建筑外圈与内隔墙规则判定（直接绘制与临摹绘制保持100%一致）：
  // 1. 最外圈墙体（建筑外轮廓包络线上的边界墙）：严格默认为 240mm 承重墙 (thickness: 240, type: 'bearing')
  // 2. 内隔墙（两个房间之间或房屋内部划分墙）：默认普通墙 120mm (thickness: 120, type: 'normal')
  // 3. 用户显式设置过墙体属性（_userSpecifiedType 或 _userCustomThickness）时，严格尊重用户设置
  // 4. 特殊墙体（virtual 虚拟墙、low 矮墙）始终保持原属性
  // 5. 绘制中途/未闭合墙体：严格保留用户当前选择绘制的类型与厚度，绝不擅自将内隔墙变承重墙
  enforceOuterWallRules() {
    if (!this.walls || this.walls.length === 0) return;

    const validWalls = this.walls.filter(w => w && w.p1 && w.p2 && w.type !== 'virtual' && w.type !== 'low');
    if (validWalls.length < 3) {
      for (const w of this.walls) {
        if (w.type === 'virtual' || w.type === 'low') continue;
        if (w.type === 'bearing') {
          w.thickness = Math.max(w.thickness || 0, w._userCustomThickness || 240);
        } else if (w.type === 'normal') {
          if (!w._userCustomThickness) w.thickness = 120;
        }
      }
      return;
    }

    // 1. 将墙体转为线段
    const segs = validWalls.map(w => ({
      p1: { x: Math.round(w.p1.x), y: Math.round(w.p1.y) },
      p2: { x: Math.round(w.p2.x), y: Math.round(w.p2.y) },
      wall: w
    })).filter(s => Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) > 60);

    const points = [];
    function getOrCreatePt(p, tol = 50) {
      for (const pt of points) {
        if (Math.hypot(pt.x - p.x, pt.y - p.y) < tol) return pt;
      }
      const np = { x: Math.round(p.x), y: Math.round(p.y) };
      points.push(np);
      return np;
    }
    segs.forEach(s => { s.a = getOrCreatePt(s.p1); s.b = getOrCreatePt(s.p2); });

    // 2. 计算交点
    const cuts = segs.map(s => [s.a, s.b]);
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const s1 = segs[i], s2 = segs[j];
        const denom = (s1.b.x - s1.a.x) * (s2.b.y - s2.a.y) - (s1.b.y - s1.a.y) * (s2.b.x - s2.a.x);
        if (Math.abs(denom) < 1e-5) continue;
        const t1 = ((s2.a.x - s1.a.x) * (s2.b.y - s2.a.y) - (s2.a.y - s1.a.y) * (s2.b.x - s2.a.x)) / denom;
        const t2 = ((s2.a.x - s1.a.x) * (s1.b.y - s1.a.y) - (s2.a.y - s1.a.y) * (s1.b.x - s1.a.x)) / denom;
        if (t1 > 0.05 && t1 < 0.95 && t2 > 0.05 && t2 < 0.95) {
          const ip = getOrCreatePt({ x: s1.a.x + t1 * (s1.b.x - s1.a.x), y: s1.a.y + t1 * (s1.b.y - s1.a.y) });
          cuts[i].push(ip);
          cuts[j].push(ip);
        }
      }
    }

    const atomicEdges = [];
    segs.forEach((s, idx) => {
      const cList = cuts[idx];
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      cList.sort((p, q) => {
        const d1 = (p.x - s.a.x) * dx + (p.y - s.a.y) * dy;
        const d2 = (q.x - s.a.x) * dx + (q.y - s.a.y) * dy;
        return d1 - d2;
      });
      for (let k = 0; k < cList.length - 1; k++) {
        const u = cList[k], v = cList[k + 1];
        if (u !== v && Math.hypot(u.x - v.x, u.y - v.y) > 50) {
          atomicEdges.push({ u, v, wall: s.wall });
        }
      }
    });

    const adj = new Map();
    points.forEach(p => adj.set(p, []));
    atomicEdges.forEach(e => {
      adj.get(e.u).push({ from: e.u, to: e.v, angle: Math.atan2(e.v.y - e.u.y, e.v.x - e.u.x), edge: e });
      adj.get(e.v).push({ from: e.v, to: e.u, angle: Math.atan2(e.u.y - e.v.y, e.u.x - e.v.x), edge: e });
    });
    for (const [p, edList] of adj.entries()) {
      edList.sort((a, b) => a.angle - b.angle);
    }

    const visited = new Set();
    const allFaces = [];
    for (const [u, edges] of adj.entries()) {
      for (const e0 of edges) {
        const k0 = `${e0.from.x},${e0.from.y}->${e0.to.x},${e0.to.y}`;
        if (visited.has(k0)) continue;
        const path = [];
        const edgePath = [];
        let cur = e0;
        let closed = false;
        for (let step = 0; step < 200; step++) {
          const ek = `${cur.from.x},${cur.from.y}->${cur.to.x},${cur.to.y}`;
          if (visited.has(ek)) { if (cur.from === path[0]) closed = true; break; }
          visited.add(ek);
          path.push(cur.from);
          edgePath.push(cur);
          const v = cur.to;
          if (v === path[0]) { closed = true; break; }
          const outEdges = adj.get(v);
          if (!outEdges || outEdges.length === 0) break;
          let nextEdge = null;
          for (let i = 0; i < outEdges.length; i++) {
            if (outEdges[i].to === cur.from) {
              nextEdge = outEdges[(i + 1) % outEdges.length];
              break;
            }
          }
          if (!nextEdge) break;
          cur = nextEdge;
        }
        if (closed && path.length >= 3) {
          let area2 = 0;
          for (let i = 0; i < path.length; i++) {
            const j = (i + 1) % path.length;
            area2 += path[i].x * path[j].y - path[j].x * path[i].y;
          }
          allFaces.push({ path, area2, edges: edgePath });
        }
      }
    }

    // 筛选最外层外轮廓面 (Y轴向下屏幕坐标系中面积 area2 > 2000000 的顺时针封闭环为外部包络)
    const exteriorFaces = allFaces.filter(f => f.area2 > 2000000);
    const exteriorWallIds = new Set();
    for (const ef of exteriorFaces) {
      for (const he of ef.edges) {
        if (he.edge && he.edge.wall) {
          exteriorWallIds.add(he.edge.wall.id);
        }
      }
    }

    const hasExteriorEnvelope = exteriorWallIds.size > 0;

    for (const w of this.walls) {
      if (w.type === 'virtual' || w.type === 'low') continue;

      if (hasExteriorEnvelope && exteriorWallIds.has(w.id)) {
        // 处于真实外部轮廓包络线上的墙体：严格保持 240 承重墙
        w.type = 'bearing';
        w.thickness = Math.max(w.thickness || 0, w._userCustomThickness || 240);
      } else if (hasExteriorEnvelope && !exteriorWallIds.has(w.id)) {
        // 处于建筑内部的分割墙：
        if (!w._userSpecifiedType) {
          w.type = 'normal';
          w.thickness = w._userCustomThickness || 120;
        } else if (w.type === 'bearing') {
          w.thickness = w._userCustomThickness || 240;
        } else {
          w.thickness = w._userCustomThickness || 120;
        }
      } else {
        // 未形成完整闭合包络时（正在绘制中途）：严格保持用户设定的绘制类型
        if (w.type === 'bearing') {
          w.thickness = Math.max(w.thickness || 0, w._userCustomThickness || 240);
        } else if (w.type === 'normal') {
          if (!w._userCustomThickness) w.thickness = 120;
        }
      }
    }
  }

  // 取多边形内部一个可靠点（凹多边形的顶点平均值可能落在外部）
  static polygonInteriorPoint(poly) {
    const c = FloorPlanEngine.polygonCentroid(poly);
    if (FloorPlanEngine.isPointInPolygon(c, poly)) return c;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    let best = null, bestD = -1;
    const N = 16;
    for (let i = 1; i < N; i++) {
      for (let j = 1; j < N; j++) {
        const q = { x: minX + (maxX - minX) * i / N, y: minY + (maxY - minY) * j / N };
        if (!FloorPlanEngine.isPointInPolygon(q, poly)) continue;
        let d = Infinity;
        for (let k = 0; k < poly.length; k++) {
          d = Math.min(d, FloorPlanEngine.projectPointToSegment(q, poly[k], poly[(k + 1) % poly.length]).dist);
        }
        if (d > bestD) { bestD = d; best = q; }
      }
    }
    return best || c;
  }

  // 为新房间挑选一个未被使用的标准名称
  nextAutoRoomName() {
    const used = new Set(this.rooms.map(r => r.name));
    const names = ['客厅', '主卧', '次卧', '厨房', '卫生间', '餐厅', '书房', '阳台', '玄关', '储藏室', '衣帽间', '客房', '儿童房', '洗衣房'];
    for (const n of names) if (!used.has(n)) return n;
    let i = this.rooms.length + 1;
    while (used.has(`房间${i}`)) i++;
    return `房间${i}`;
  }

  // 根据墙体识别所有封闭空间，保证每个封闭空间都有房间名称
  //  - 已有房间（含示例户型、手动命名的房间）保持不变
  //  - 自动生成的房间（auto）随墙体分割 / 合并而更新
  //  - 未被任何房间覆盖的新封闭空间自动创建房间并命名
  syncRoomsWithWalls() {
    if (this._suspendRoomSync) return;
    const faces = this.detectClosedPolygonsFromWalls();
    faces.forEach(f => { f.ip = FloorPlanEngine.polygonInteriorPoint(f.polygon); });

    // 1. 更新自动房间：选取其所在的主封闭面（新建房间优先，避免被旧的大房间抢占）
    const claimed = new Set();
    const keepSet = new Set();
    for (const r of [...this.rooms].reverse()) {
      if (!r.auto) { keepSet.add(r); continue; }
      const anchor = r.labelPos || r.center || (r.polygon && r.polygon.length >= 3 ? FloorPlanEngine.polygonInteriorPoint(r.polygon) : null);
      let primary = null;
      if (anchor) primary = faces.find(f => !claimed.has(f) && FloorPlanEngine.isPointInPolygon(anchor, f.polygon));
      if (!primary && r.polygon && r.polygon.length >= 3) {
        // 标签点不在任何面内时，取被原房间覆盖的最大面
        const inside = faces.filter(f => !claimed.has(f) && FloorPlanEngine.isPointInPolygon(f.ip, r.polygon));
        inside.sort((a, b) => b.area - a.area);
        primary = inside[0] || null;
      }
      if (!primary) continue; // 空间不再封闭 / 已被合并 -> 移除该自动房间
      claimed.add(primary);
      const areaChanged = Math.abs((r.area || 0) - primary.area) > 0.05;
      r.polygon = primary.polygon;
      r.area = primary.area;
      r.center = primary.center;
      if (!r.userMovedLabel || areaChanged || !r.labelPos || !FloorPlanEngine.isPointInPolygon(r.labelPos, primary.polygon)) {
        r.labelPos = { ...primary.ip };
      }
      keepSet.add(r);
    }
    this.rooms = this.rooms.filter(r => keepSet.has(r));

    // 2. 为没有被任何房间覆盖的封闭面创建新房间
    for (const f of faces) {
      if (claimed.has(f)) continue;
      const covered = this.rooms.some(r => r.polygon && r.polygon.length >= 3 &&
        (FloorPlanEngine.isPointInPolygon(f.ip, r.polygon) ||
         (r.labelPos && FloorPlanEngine.isPointInPolygon(r.labelPos, f.polygon))));
      if (covered) continue;
      const name = this.nextAutoRoomName();
      this.rooms.push({
        id: 'r_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
        name,
        type: 'room',
        auto: true,
        floorTexture: FloorPlanEngine.getDefaultFloorForRoom(name),
        polygon: f.polygon,
        area: f.area,
        center: f.center,
        labelPos: { ...f.ip }
      });
    }

    this.autoDetectRooms();
    this.enforceOuterWallRules();
  }

  static simplifyCollinearPolygon(poly) {
    if (!poly || poly.length < 3) return poly ? poly.map(p => ({ x: p.x, y: p.y })) : [];
    // 1. Remove consecutive duplicates
    let pts = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = pts.length > 0 ? pts[pts.length - 1] : poly[poly.length - 1];
      if (FloorPlanEngine.dist(cur, prev) > 10) {
        pts.push({ x: cur.x, y: cur.y });
      }
    }
    if (pts.length < 3) return poly.map(p => ({ x: p.x, y: p.y }));

    // 2. Remove collinear intermediate vertices
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length; i++) {
        const pPrev = pts[(i - 1 + pts.length) % pts.length];
        const pCur = pts[i];
        const pNext = pts[(i + 1) % pts.length];
        const pr = FloorPlanEngine.projectPointToSegment(pCur, pPrev, pNext);
        if (pr.dist < 15 && pr.t > 0.01 && pr.t < 0.99) {
          pts.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return pts;
  }

  insertWallJunctionsIntoRoomPolygons() {
    const endpoints = [];
    for (const w of this.walls) {
      endpoints.push(w.p1, w.p2);
    }
    for (const r of this.rooms) {
      if (!r.polygon || r.polygon.length < 3) continue;
      let changed = true;
      let iter = 0;
      while (changed && iter < 20) {
        changed = false;
        iter++;
        for (let i = 0; i < r.polygon.length; i++) {
          const pA = r.polygon[i];
          const pB = r.polygon[(i + 1) % r.polygon.length];
          let bestPt = null;
          let minT = 1;
          for (const ep of endpoints) {
            if (FloorPlanEngine.dist(ep, pA) < 50 || FloorPlanEngine.dist(ep, pB) < 50) continue;
            const pr = FloorPlanEngine.projectPointToSegment(ep, pA, pB);
            if (pr.dist < 30 && pr.t > 0.02 && pr.t < 0.98) {
              if (pr.t < minT) {
                minT = pr.t;
                bestPt = { x: Math.round(pr.point.x), y: Math.round(pr.point.y) };
              }
            }
          }
          if (bestPt) {
            r.polygon.splice(i + 1, 0, bestPt);
            changed = true;
            break;
          }
        }
      }
    }
  }

  // --- History & State Restoration ---
  recordHistory() {
    // Truncate forward history if any
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    const snapshot = JSON.stringify({
      walls: this.walls,
      doors: this.doors,
      windows: this.windows,
      rooms: this.rooms,
      furniture: this.furniture,
      compass: this.compass
    });

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.historyIndex = this.history.length - 1;
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.applySnapshot(this.history[this.historyIndex]);
      return true;
    }
    return false;
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.applySnapshot(this.history[this.historyIndex]);
      return true;
    }
    return false;
  }

  applySnapshot(jsonStr) {
    try {
      const state = JSON.parse(jsonStr);
      this.walls = state.walls || [];
      this.doors = state.doors || [];
      this.windows = state.windows || [];
      this.rooms = state.rooms || [];
      this.furniture = state.furniture || [];
      if (state.compass) this.compass = state.compass;
      this.autoDetectRooms();
    } catch (e) {
      console.error("Failed to restore history snapshot:", e);
    }
  }

  // Load complete project data (e.g. demo house)
  loadProjectData(data) {
    this.walls = JSON.parse(JSON.stringify(data.walls || []));
    this.doors = JSON.parse(JSON.stringify(data.doors || []));
    this.windows = JSON.parse(JSON.stringify(data.windows || []));
    this.rooms = JSON.parse(JSON.stringify(data.rooms || []));
    this.furniture = JSON.parse(JSON.stringify(data.furniture || []));

    // Automatically split walls at all T-junctions so every room edge is an individual movable wall segment
    this.splitWallsAtIntersections();

    this.floors['1F'] = {
      walls: JSON.parse(JSON.stringify(this.walls)),
      doors: JSON.parse(JSON.stringify(this.doors)),
      windows: JSON.parse(JSON.stringify(this.windows)),
      rooms: JSON.parse(JSON.stringify(this.rooms)),
      furniture: JSON.parse(JSON.stringify(this.furniture))
    };
    this.currentFloor = '1F';
    this.autoDetectRooms();
    this.syncRoomsWithWalls();
    this.enforceOuterWallRules();
    this.recordHistory();
  }

  splitWallsAtIntersections() {
    const openings = [...this.doors, ...this.windows];
    openings.forEach(op => {
      const parentWall = this.walls.find(w => w.id === op.wallId);
      if (parentWall) {
        op._abs = {
          x: parentWall.p1.x + op.t * (parentWall.p2.x - parentWall.p1.x),
          y: parentWall.p1.y + op.t * (parentWall.p2.y - parentWall.p1.y)
        };
      }
    });

    let changed = true;
    let iterations = 0;
    while (changed && iterations < 60) {
      changed = false;
      iterations++;

      for (let i = 0; i < this.walls.length; i++) {
        const w = this.walls[i];
        let splitPoint = null;
        let minT = 1;

        for (let j = 0; j < this.walls.length; j++) {
          if (i === j) continue;
          const other = this.walls[j];
          for (const pt of [other.p1, other.p2]) {
            const pr = FloorPlanEngine.projectPointToSegment(pt, w.p1, w.p2);
            if (pr.dist < 120 && pr.t > 0.03 && pr.t < 0.97) {
              if (pr.t < minT) {
                minT = pr.t;
                splitPoint = { x: Math.round(pr.point.x), y: Math.round(pr.point.y), t: pr.t };
              }
            }
          }
        }

        if (splitPoint) {
          const seg1 = {
            id: w.id + '_a',
            p1: { x: w.p1.x, y: w.p1.y },
            p2: { x: splitPoint.x, y: splitPoint.y },
            thickness: w.thickness,
            type: w.type,
            _userSpecifiedType: w._userSpecifiedType,
            _userCustomThickness: w._userCustomThickness
          };
          const seg2 = {
            id: w.id + '_b',
            p1: { x: splitPoint.x, y: splitPoint.y },
            p2: { x: w.p2.x, y: w.p2.y },
            thickness: w.thickness,
            type: w.type,
            _userSpecifiedType: w._userSpecifiedType,
            _userCustomThickness: w._userCustomThickness
          };

          openings.forEach(op => {
            if (op.wallId === w.id && op._abs) {
              const pr1 = FloorPlanEngine.projectPointToSegment(op._abs, seg1.p1, seg1.p2);
              const pr2 = FloorPlanEngine.projectPointToSegment(op._abs, seg2.p1, seg2.p2);
              if (pr1.dist <= pr2.dist && pr1.t >= 0 && pr1.t <= 1) {
                op.wallId = seg1.id;
                op.t = pr1.t;
              } else {
                op.wallId = seg2.id;
                op.t = pr2.t;
              }
            }
          });

          this.walls.splice(i, 1, seg1, seg2);
          changed = true;
          break;
        }
      }
    }
    this.enforceOuterWallRules();
  }

  clear() {
    this.walls = [];
    this.doors = [];
    this.windows = [];
    this.rooms = [];
    this.furniture = [];
    this.saveCurrentFloorState();
    this.recordHistory();
  }

  // Proportional scaling of entire floorplan so drawn rooms equal targetAreaM2
  scaleToTargetArea(targetAreaM2) {
    if (!targetAreaM2 || targetAreaM2 <= 0) return null;

    let currentArea = 0;
    for (const r of this.rooms) {
      if (r.area) currentArea += r.area;
    }

    // If no rooms with calculated area, check bounding box
    if (currentArea <= 0) {
      if (this.walls.length === 0) return null;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const w of this.walls) {
        minX = Math.min(minX, w.p1.x, w.p2.x);
        maxX = Math.max(maxX, w.p1.x, w.p2.x);
        minY = Math.min(minY, w.p1.y, w.p2.y);
        maxY = Math.max(maxY, w.p1.y, w.p2.y);
      }
      currentArea = ((maxX - minX) * (maxY - minY)) / 1000000;
    }

    if (currentArea <= 0) return null;

    const s = Math.sqrt(targetAreaM2 / currentArea);

    // Bounding box center for scaling origin
    let cx = 0, cy = 0, ptCount = 0;
    for (const w of this.walls) {
      cx += w.p1.x + w.p2.x;
      cy += w.p1.y + w.p2.y;
      ptCount += 2;
    }
    if (ptCount > 0) {
      cx /= ptCount;
      cy /= ptCount;
    }

    // Scale walls
    for (const w of this.walls) {
      w.p1.x = Math.round(cx + (w.p1.x - cx) * s);
      w.p1.y = Math.round(cy + (w.p1.y - cy) * s);
      w.p2.x = Math.round(cx + (w.p2.x - cx) * s);
      w.p2.y = Math.round(cy + (w.p2.y - cy) * s);
    }

    // Scale rooms
    for (const r of this.rooms) {
      if (r.polygon) {
        for (const pt of r.polygon) {
          pt.x = Math.round(cx + (pt.x - cx) * s);
          pt.y = Math.round(cy + (pt.y - cy) * s);
        }
      }
      if (r.center) {
        r.center.x = Math.round(cx + (r.center.x - cx) * s);
        r.center.y = Math.round(cy + (r.center.y - cy) * s);
      }
    }

    // Scale furniture positions
    for (const f of this.furniture) {
      f.x = Math.round(cx + (f.x - cx) * s);
      f.y = Math.round(cy + (f.y - cy) * s);
    }

    this.autoDetectRooms();
    this.saveCurrentFloorState();
    this.recordHistory();
    return { scale: s, oldArea: currentArea, newArea: targetAreaM2 };
  }

  // --- Scale Calibration ---
  calibrateScale(pointA, pointB, actualRealDistanceMm) {
    const worldDist = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
    if (worldDist <= 0 || actualRealDistanceMm <= 0) return false;

    // Convert world distance back to image pixel distance on the blueprint image
    const currentMmPerPixel = this.blueprint.mmPerPixel || 10.0;
    const currentScale = this.blueprint.scale || 1.0;
    const imagePixelDist = worldDist / (currentScale * currentMmPerPixel);
    if (imagePixelDist <= 0) return false;

    // mm per pixel on the blueprint calibrated 1:1 to real-world dimensions
    this.blueprint.mmPerPixel = actualRealDistanceMm / imagePixelDist;
    return this.blueprint.mmPerPixel;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FloorPlanEngine };
}
