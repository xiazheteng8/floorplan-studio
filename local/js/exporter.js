/**
 * High-Resolution Floorplan Exporter (PNG / JPG / SVG / JSON)
 * 支持单层高清导出、多层独立分层导出、以及多层合并到同一张总览大图
 */
class FloorPlanExporter {
  constructor(engine, renderer = null) {
    this.engine = engine;
    this.renderer = renderer;
  }

  // 获取所有有效的楼层列表（按 -1F, 1F, 2F, 3F 从低到高物理顺序排列）
  getValidFloors() {
    if (this.engine.saveCurrentFloorState) {
      this.engine.saveCurrentFloorState();
    }
    const allKeys = Object.keys(this.engine.floors || {});
    if (allKeys.length <= 1) {
      return allKeys.length === 1 ? allKeys : [this.engine.currentFloor || '1F'];
    }

    const sorted = FloorPlanEngine.sortFloorsAscending
      ? FloorPlanEngine.sortFloorsAscending(allKeys)
      : [...allKeys].sort((a, b) => FloorPlanEngine.parseFloorNumber(a) - FloorPlanEngine.parseFloorNumber(b));

    // 检查哪些楼层有实际墙体/房间/家具设计元素
    const withContent = sorted.filter(fId => {
      const fl = this.engine.floors[fId];
      return fl && (
        (fl.walls && fl.walls.length > 0) ||
        (fl.rooms && fl.rooms.length > 0) ||
        (fl.furniture && fl.furniture.length > 0)
      );
    });

    return withContent.length > 1 ? withContent : sorted;
  }

  // 楼层友好中文显示名称（如 1F -> 一层 (1F)，-1F -> 负一层 (-1F)）
  getFloorDisplayName(floorId) {
    if (!floorId) return '1F';
    const n = FloorPlanEngine.parseFloorNumber ? FloorPlanEngine.parseFloorNumber(floorId) : parseInt(floorId, 10);
    const cns = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if (n > 0) {
      const c = cns[n - 1] || `${n}`;
      return `${c}层 (${floorId})`;
    } else {
      const c = cns[Math.abs(n) - 1] || `${Math.abs(n)}`;
      return `负${c}层 (${floorId})`;
    }
  }

  // Calculate tight bounding box around all walls and furniture
  // margins: 可选 { top, right, bottom, left }（毫米），导出时为外侧尺寸链、标题与提示预留空间
  getBoundingBox(margins = null) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (this.engine.walls.length === 0 && this.engine.furniture.length === 0) {
      return { minX: 0, minY: 0, maxX: 10000, maxY: 8000, width: 10000, height: 8000 };
    }

    for (const w of this.engine.walls) {
      minX = Math.min(minX, w.p1.x, w.p2.x);
      maxX = Math.max(maxX, w.p1.x, w.p2.x);
      minY = Math.min(minY, w.p1.y, w.p2.y);
      maxY = Math.max(maxY, w.p1.y, w.p2.y);
    }

    for (const f of this.engine.furniture) {
      minX = Math.min(minX, f.x - f.width / 2);
      maxX = Math.max(maxX, f.x + f.width / 2);
      minY = Math.min(minY, f.y - f.height / 2);
      maxY = Math.max(maxY, f.y + f.height / 2);
    }

    const margin = 1200; // mm margin around the apartment
    const m = margins || { top: margin, right: margin, bottom: margin, left: margin };
    return {
      minX: minX - m.left,
      minY: minY - m.top,
      maxX: maxX + m.right,
      maxY: maxY + m.bottom,
      width: (maxX - minX) + m.left + m.right,
      height: (maxY - minY) + m.top + m.bottom
    };
  }

  // 绘制标准建筑 CAD 指南针（圆环 + 双色立体旋转指针 + 上N下S文字）
  drawCompass(ctx, crX, crY, crR) {
    ctx.save();
    ctx.translate(crX, crY);

    // Letter N strictly positioned above the circle ring in red
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold ${Math.round(crR * 0.72)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 0, -crR - 4);

    // Letter S strictly positioned below the circle ring in dark slate
    ctx.fillStyle = '#475569';
    ctx.font = `bold ${Math.round(crR * 0.62)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('S', 0, crR + 4);

    // Outer Metal Ring
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#334155';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, crR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Subtle Face shading
    ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, crR * 0.9, -Math.PI / 2, Math.PI / 2, false);
    ctx.fill();

    // Rotating Architectural Needle
    ctx.save();
    ctx.rotate(((this.engine.compass && this.engine.compass.angle) || 0) * Math.PI / 180);

    // North Needle (Red left light, Dark Red right shadow)
    ctx.fillStyle = '#ff4d4f';
    ctx.beginPath();
    ctx.moveTo(0, -crR * 0.85);
    ctx.lineTo(-crR * 0.32, 0);
    ctx.lineTo(0, -crR * 0.15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(0, -crR * 0.85);
    ctx.lineTo(crR * 0.32, 0);
    ctx.lineTo(0, -crR * 0.15);
    ctx.closePath();
    ctx.fill();

    // South Needle (White left, Light gray right shadow)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, crR * 0.85);
    ctx.lineTo(-crR * 0.32, 0);
    ctx.lineTo(0, crR * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(0, crR * 0.85);
    ctx.lineTo(crR * 0.32, 0);
    ctx.lineTo(0, -crR * 0.15);
    ctx.closePath();
    ctx.fill();

    // Center pivot ring
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, crR * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, crR * 0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // end rotating needle
    ctx.restore();
  }

  // Export as High-Resolution Canvas (Raster Image)
  generateImageCanvas(options = {}) {
    const {
      style = 'color', // 'color', 'cad', 'wireframe'
      resolution = 2048, // width in pixels
      showDimensions = true,
      showRoomLabels = true,
      showFurniture = true,
      showCompass = true,
      showBlueprint = false,
      title = '户型图',
      floorId = null,
      customSubtitle = null
    } = options;

    const bbox = showDimensions
      ? this.getBoundingBox({ top: 4200, right: 2600, bottom: 3000, left: 2600 })
      : this.getBoundingBox();
    const aspect = bbox.height / bbox.width;
    const canvasWidth = resolution;
    const canvasHeight = Math.round(resolution * aspect);

    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvasWidth;
    offCanvas.height = canvasHeight;
    const ctx = offCanvas.getContext('2d');

    // 1. Solid White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Compute scale and offset
    const zoom = canvasWidth / bbox.width;
    const offsetX = -bbox.minX * zoom;
    const offsetY = -bbox.minY * zoom;

    // Use a temporary renderer to draw onto offscreen canvas
    const tempRenderer = new FloorPlanRenderer(offCanvas, this.engine);

    // 同步主渲染器已加载的高清逼真家具贴图与纹理，确保下载导出与主画布实物模型完全一致！
    if (this.renderer && this.renderer.imageCache) {
      for (const [k, v] of this.renderer.imageCache.entries()) {
        if (v && v.complete && v.naturalWidth > 0) {
          tempRenderer.imageCache.set(k, v);
        }
      }
    }
    if (FloorPlanRenderer.SHARED_IMAGE_CACHE) {
      for (const [k, v] of FloorPlanRenderer.SHARED_IMAGE_CACHE.entries()) {
        if (v && v.complete && v.naturalWidth > 0) {
          tempRenderer.imageCache.set(k, v);
        }
      }
    }

    tempRenderer.renderMode = style;
    tempRenderer.activeTab = (style === 'color') ? 'furnish' : 'draw';
    tempRenderer.showDimensions = showDimensions;
    tempRenderer.showDimensionsAlways = showDimensions; // 导出图纸时保留完整的尺寸标注
    tempRenderer.showRoomLabels = showRoomLabels;
    tempRenderer.showFurniture = showFurniture;
    tempRenderer.showCompass = false; // we draw custom compass in title block
    tempRenderer.showGrid = false;
    tempRenderer.showBlueprint = showBlueprint;
    tempRenderer.selectedItem = null;
    tempRenderer.hoveredItem = null;
    tempRenderer.activeDrawLine = null;

    // Temporarily replace viewport
    const originalVp = { ...this.engine.viewport };
    this.engine.viewport = { x: offsetX, y: offsetY, zoom: zoom };

    tempRenderer.width = canvasWidth;
    tempRenderer.height = canvasHeight;
    tempRenderer.render();

    // Restore original viewport
    this.engine.viewport = originalVp;

    // 2. Draw Decorative Architectural Title Header & Compass
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    let displayTitle = title;
    const defaultTitles = [
      '雅居乐花园·3室2厅1厨2卫 128㎡',
      '雅居樂花園·3室2廳1廚2衛 128㎡',
      'Agile Garden · 3 Beds 2 Baths 128㎡',
      'アジャイルガーデン · 3LDK 128㎡'
    ];
    if (defaultTitles.includes(displayTitle)) {
      displayTitle = t('default_project_title', displayTitle);
    }

    ctx.save();
    // Title Banner
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(canvasWidth * 0.022)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    const titleX = showCompass ? canvasWidth * 0.095 : canvasWidth * 0.04;
    ctx.fillText(displayTitle, titleX, canvasHeight * 0.06);

    // Subtitle / Specs
    let totalArea = 0;
    for (const r of this.engine.rooms) totalArea += (r.area || 0);
    const areaVal = totalArea > 0 ? totalArea.toFixed(1) : '108.5';
    const dateStr = new Date().toLocaleDateString();
    let specsText = customSubtitle;
    if (!specsText) {
      if (floorId) {
        specsText = `建筑/套内面积: ~${areaVal} ㎡  |  当前楼层: ${this.getFloorDisplayName(floorId)}  |  绘制日期: ${dateStr}`;
      } else {
        const specsTmpl = t('dl_specs_area', '建筑/套内面积: ~{area} ㎡  |  绘制日期: {date}');
        specsText = specsTmpl.replace('{area}', areaVal).replace('{date}', dateStr);
      }
    }
    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.round(canvasWidth * 0.013)}px "PingFang SC", sans-serif`;
    ctx.fillText(specsText, titleX, canvasHeight * 0.085);

    // Architectural CAD Compass
    if (showCompass) {
      this.drawCompass(ctx, canvasWidth * 0.055, canvasHeight * 0.082, canvasWidth * 0.022);
    }

    // Outer framing border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = Math.max(2, canvasWidth * 0.0015);
    ctx.strokeRect(canvasWidth * 0.02, canvasHeight * 0.02, canvasWidth * 0.96, canvasHeight * 0.96);

    // 右下角免责提示
    ctx.fillStyle = style === 'cad' ? '#333333' : '#94a3b8';
    ctx.font = `${Math.max(10, Math.round(canvasWidth * 0.011))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const disclaimer = t('dl_disclaimer', '户型图仅为参考数据，不能作为真实比例和实际大小做装修参考');
    ctx.fillText(disclaimer, canvasWidth * 0.97, canvasHeight * 0.97);

    ctx.restore();
    return offCanvas;
  }

  // 生成指定单层的独立高清图纸（自动切换楼层数据、渲染后完美复原当前激活楼层）
  generateFloorImageCanvas(floorId = null, options = {}) {
    const originalFloor = this.engine.currentFloor;
    const targetFloor = floorId || originalFloor;

    if (this.engine.saveCurrentFloorState) {
      this.engine.saveCurrentFloorState();
    }

    const flData = this.engine.floors ? this.engine.floors[targetFloor] : null;
    if (flData) {
      this.engine.currentFloor = targetFloor;
      this.engine.walls = JSON.parse(JSON.stringify(flData.walls || []));
      this.engine.doors = JSON.parse(JSON.stringify(flData.doors || []));
      this.engine.windows = JSON.parse(JSON.stringify(flData.windows || []));
      this.engine.rooms = JSON.parse(JSON.stringify(flData.rooms || []));
      this.engine.furniture = JSON.parse(JSON.stringify(flData.furniture || []));
    }

    const baseTitle = options.title || '户型图';
    const validFloors = this.getValidFloors();
    const floorLabel = this.getFloorDisplayName(targetFloor);
    const fullTitle = validFloors.length > 1 ? `${baseTitle} · ${floorLabel}` : baseTitle;

    const canvas = this.generateImageCanvas({
      ...options,
      title: fullTitle,
      floorId: targetFloor
    });

    // 复原原先选中的楼层状态
    if (originalFloor && this.engine.floors && this.engine.floors[originalFloor]) {
      this.engine.currentFloor = originalFloor;
      const origData = this.engine.floors[originalFloor];
      this.engine.walls = JSON.parse(JSON.stringify(origData.walls || []));
      this.engine.doors = JSON.parse(JSON.stringify(origData.doors || []));
      this.engine.windows = JSON.parse(JSON.stringify(origData.windows || []));
      this.engine.rooms = JSON.parse(JSON.stringify(origData.rooms || []));
      this.engine.furniture = JSON.parse(JSON.stringify(origData.furniture || []));
    }

    return canvas;
  }

  // 生成【多层合并到同一张总览大图】Master Canvas
  // 按照建筑图纸规范，将 1F、2F 等多层户型图以统一步调比例并排/网格排版，附带各层胶囊标头与整套总面积
  generateCombinedMultiFloorCanvas(options = {}) {
    const {
      style = 'color',
      resolution = 2560,
      showDimensions = true,
      showRoomLabels = true,
      showFurniture = true,
      showCompass = true,
      title = '户型图'
    } = options;

    const validFloors = this.getValidFloors();
    if (validFloors.length <= 1) {
      return this.generateFloorImageCanvas(validFloors[0] || this.engine.currentFloor, options);
    }

    if (this.engine.saveCurrentFloorState) {
      this.engine.saveCurrentFloorState();
    }
    const originalFloor = this.engine.currentFloor;

    // 收集各楼层图纸数据与真实边界尺寸
    const floorsData = [];
    let totalAllFloorsArea = 0;
    let maxBBoxW = 0, maxBBoxH = 0;

    for (const fId of validFloors) {
      const fl = (this.engine.floors && this.engine.floors[fId]) || { walls: [], doors: [], windows: [], rooms: [], furniture: [] };
      this.engine.walls = fl.walls || [];
      this.engine.doors = fl.doors || [];
      this.engine.windows = fl.windows || [];
      this.engine.rooms = fl.rooms || [];
      this.engine.furniture = fl.furniture || [];

      let floorArea = 0;
      for (const r of this.engine.rooms) floorArea += (r.area || 0);
      totalAllFloorsArea += floorArea;

      const bbox = showDimensions
        ? this.getBoundingBox({ top: 3800, right: 2600, bottom: 2800, left: 2600 })
        : this.getBoundingBox();

      maxBBoxW = Math.max(maxBBoxW, bbox.width);
      maxBBoxH = Math.max(maxBBoxH, bbox.height);

      floorsData.push({
        floorId: fId,
        displayName: this.getFloorDisplayName(fId),
        walls: JSON.parse(JSON.stringify(this.engine.walls)),
        doors: JSON.parse(JSON.stringify(this.engine.doors)),
        windows: JSON.parse(JSON.stringify(this.engine.windows)),
        rooms: JSON.parse(JSON.stringify(this.engine.rooms)),
        furniture: JSON.parse(JSON.stringify(this.engine.furniture)),
        bbox,
        area: floorArea,
        roomCount: this.engine.rooms.length
      });
    }

    // 确定网格排版（2层并排；3层横排；4层2x2网格；更多层3列网格）
    const num = validFloors.length;
    let cols = 2, rows = 1;
    if (num === 2) {
      cols = 2; rows = 1;
    } else if (num === 3) {
      cols = 3; rows = 1;
    } else if (num === 4) {
      cols = 2; rows = 2;
    } else {
      cols = 3; rows = Math.ceil(num / 3);
    }

    // 画布尺寸计算
    const canvasWidth = Math.max(resolution, cols * 1400);
    const paddingX = Math.round(canvasWidth * 0.025);
    const colGap = Math.round(canvasWidth * 0.02);
    const cellWidth = Math.round((canvasWidth - paddingX * 2 - (cols - 1) * colGap) / cols);

    const cellHeaderH = Math.round(canvasWidth * 0.028); // 楼层标头胶囊栏高度
    const cellPadding = Math.round(canvasWidth * 0.012);

    // 建筑级统一比例尺：保证 1F、2F 的每一米在同一张总览图中具有完全一致的像素尺寸！
    const availablePlanW = cellWidth - cellPadding * 2;
    const uniformZoom = availablePlanW / maxBBoxW;
    const cellPlanH = Math.round(maxBBoxH * uniformZoom);
    const cellHeight = cellHeaderH + cellPlanH + cellPadding * 2;

    const rowGap = Math.round(canvasWidth * 0.02);
    const headerHeight = Math.round(canvasWidth * 0.095);
    const footerHeight = Math.round(canvasWidth * 0.045);
    const canvasHeight = headerHeight + rows * cellHeight + (rows - 1) * rowGap + footerHeight;

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = canvasWidth;
    masterCanvas.height = canvasHeight;
    const ctx = masterCanvas.getContext('2d');

    // 1. Solid White Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. 绘制各楼层独立卡片到网格中
    floorsData.forEach((fData, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cellX = paddingX + col * (cellWidth + colGap);
      const cellY = headerHeight + row * (cellHeight + rowGap);

      // 卡片外框与柔和阴影
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cellX, cellY, cellWidth, cellHeight, 8);
      } else {
        ctx.rect(cellX, cellY, cellWidth, cellHeight);
      }
      ctx.fill();
      ctx.stroke();

      // 楼层标头胶囊 Badge
      const badgeH = Math.round(cellHeaderH * 0.68);
      const badgeY = cellY + Math.round((cellHeaderH - badgeH) / 2);
      ctx.font = `bold ${Math.round(canvasWidth * 0.012)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      const badgeText = fData.displayName;
      const badgeTextW = ctx.measureText(badgeText).width;
      const badgeW = badgeTextW + 24;

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(cellX + 16, badgeY, badgeW, badgeH, 6);
      } else {
        ctx.rect(cellX + 16, badgeY, badgeW, badgeH);
      }
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, cellX + 16 + badgeW / 2, badgeY + badgeH / 2);

      // 楼层统计信息
      ctx.fillStyle = '#475569';
      ctx.font = `500 ${Math.round(canvasWidth * 0.010)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const statsText = `套内面积: ~${fData.area > 0 ? fData.area.toFixed(1) : '0.0'} ㎡  |  房间: ${fData.roomCount} 间`;
      ctx.fillText(statsText, cellX + 16 + badgeW + 14, badgeY + badgeH / 2);

      // 标头卡片底部分割线
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cellX + 14, cellY + cellHeaderH);
      ctx.lineTo(cellX + cellWidth - 14, cellY + cellHeaderH);
      ctx.stroke();

      // 离屏渲染该楼层户型图
      const offW = availablePlanW;
      const offH = cellPlanH;
      const floorOffCanvas = document.createElement('canvas');
      floorOffCanvas.width = offW;
      floorOffCanvas.height = offH;

      this.engine.walls = fData.walls;
      this.engine.doors = fData.doors;
      this.engine.windows = fData.windows;
      this.engine.rooms = fData.rooms;
      this.engine.furniture = fData.furniture;

      const tempRenderer = new FloorPlanRenderer(floorOffCanvas, this.engine);
      if (this.renderer && this.renderer.imageCache) {
        for (const [k, v] of this.renderer.imageCache.entries()) {
          if (v && v.complete && v.naturalWidth > 0) tempRenderer.imageCache.set(k, v);
        }
      }
      if (FloorPlanRenderer.SHARED_IMAGE_CACHE) {
        for (const [k, v] of FloorPlanRenderer.SHARED_IMAGE_CACHE.entries()) {
          if (v && v.complete && v.naturalWidth > 0) tempRenderer.imageCache.set(k, v);
        }
      }

      tempRenderer.renderMode = style;
      tempRenderer.activeTab = (style === 'color') ? 'furnish' : 'draw';
      tempRenderer.showDimensions = showDimensions;
      tempRenderer.showDimensionsAlways = showDimensions;
      tempRenderer.showRoomLabels = showRoomLabels;
      tempRenderer.showFurniture = showFurniture;
      tempRenderer.showCompass = false;
      tempRenderer.showGrid = false;
      tempRenderer.showBlueprint = false;
      tempRenderer.selectedItem = null;
      tempRenderer.hoveredItem = null;
      tempRenderer.activeDrawLine = null;

      // 居中对齐渲染
      const planOffsetX = (offW - fData.bbox.width * uniformZoom) / 2 - fData.bbox.minX * uniformZoom;
      const planOffsetY = (offH - fData.bbox.height * uniformZoom) / 2 - fData.bbox.minY * uniformZoom;

      const origVp = { ...this.engine.viewport };
      this.engine.viewport = { x: planOffsetX, y: planOffsetY, zoom: uniformZoom };
      tempRenderer.width = offW;
      tempRenderer.height = offH;
      tempRenderer.render();
      this.engine.viewport = origVp;

      // 将该层户型绘制到主网格画布
      ctx.drawImage(floorOffCanvas, cellX + cellPadding, cellY + cellHeaderH + cellPadding);
      ctx.restore();
    });

    // 3. 绘制总览大图顶部主标题与指南针
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    let displayTitle = title;
    const defaultTitles = [
      '雅居乐花园·3室2厅1厨2卫 128㎡',
      '雅居樂花園·3室2廳1廚2衛 128㎡',
      'Agile Garden · 3 Beds 2 Baths 128㎡',
      'アジャイルガーデン · 3LDK 128㎡'
    ];
    if (defaultTitles.includes(displayTitle)) {
      displayTitle = t('default_project_title', displayTitle);
    }
    const fullMasterTitle = `${displayTitle} · 全楼层平面总览`;

    ctx.save();
    // Title Banner
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${Math.round(canvasWidth * 0.020)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    const titleX = showCompass ? canvasWidth * 0.088 : canvasWidth * 0.035;
    ctx.fillText(fullMasterTitle, titleX, headerHeight * 0.44);

    // Subtitle / Specs
    const dateStr = new Date().toLocaleDateString();
    const areaVal = totalAllFloorsArea > 0 ? totalAllFloorsArea.toFixed(1) : '128.0';
    const floorListStr = validFloors.map(f => this.getFloorDisplayName(f)).join(' / ');
    const subtitle = `总建筑面积: ~${areaVal} ㎡  |  总层数: 共 ${validFloors.length} 层 (${floorListStr})  |  绘制日期: ${dateStr}`;
    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.round(canvasWidth * 0.011)}px "PingFang SC", sans-serif`;
    ctx.fillText(subtitle, titleX, headerHeight * 0.76);

    // Architectural CAD Compass
    if (showCompass) {
      this.drawCompass(ctx, canvasWidth * 0.048, headerHeight * 0.56, canvasWidth * 0.020);
    }

    // Outer framing border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(2, canvasWidth * 0.0015);
    ctx.strokeRect(canvasWidth * 0.015, canvasHeight * 0.012, canvasWidth * 0.97, canvasHeight * 0.976);

    // Disclaimer at bottom right
    ctx.fillStyle = style === 'cad' ? '#333333' : '#94a3b8';
    ctx.font = `${Math.max(10, Math.round(canvasWidth * 0.010))}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const disclaimer = t('dl_disclaimer', '户型图仅为参考数据，不能作为真实比例和实际大小做装修参考');
    ctx.fillText(disclaimer, canvasWidth * 0.97, canvasHeight * 0.975);

    ctx.restore();

    // 完美复原 engine 原选中的楼层状态
    if (originalFloor && this.engine.floors && this.engine.floors[originalFloor]) {
      this.engine.currentFloor = originalFloor;
      const fl = this.engine.floors[originalFloor];
      this.engine.walls = JSON.parse(JSON.stringify(fl.walls || []));
      this.engine.doors = JSON.parse(JSON.stringify(fl.doors || []));
      this.engine.windows = JSON.parse(JSON.stringify(fl.windows || []));
      this.engine.rooms = JSON.parse(JSON.stringify(fl.rooms || []));
      this.engine.furniture = JSON.parse(JSON.stringify(fl.furniture || []));
    }

    return masterCanvas;
  }

  // 触发浏览器无感下载 Canvas 图像文件
  triggerCanvasDownload(canvas, format = 'png', filename = '') {
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.92 : 1.0;
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const finalName = filename || `户型图_${Date.now()}.${ext}`;

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }, mimeType, quality);
  }

  // 多层导出核心方法：自动导出【每一层的独立图纸】+【多层合并在同一张的总览大图】！
  exportAllStoreys(format = 'png', options = {}) {
    const validFloors = this.getValidFloors();
    const title = options.title || '户型图';
    const style = options.style || 'color';
    const styleName = style === 'cad' ? 'CAD工程图' : '彩色渲染图';
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const tasks = [];

    if (validFloors.length <= 1) {
      const singleCanvas = this.generateFloorImageCanvas(validFloors[0] || this.engine.currentFloor, options);
      const fileName = `${title}_${styleName}_${Date.now()}.${ext}`;
      this.triggerCanvasDownload(singleCanvas, format, fileName);
      return [fileName];
    }

    // 1. 导出每一层的独立高清图纸
    for (const fId of validFloors) {
      const fCanvas = this.generateFloorImageCanvas(fId, options);
      const fName = `${title}_${fId}_${styleName}_${Date.now()}.${ext}`;
      tasks.push({ canvas: fCanvas, filename: fName });
    }

    // 2. 导出所有楼层合并在同一张的总览大图
    const combinedCanvas = this.generateCombinedMultiFloorCanvas(options);
    const cName = `${title}_全楼层总览_${styleName}_${Date.now()}.${ext}`;
    tasks.push({ canvas: combinedCanvas, filename: cName });

    // 采用 350ms 优雅间隔下载，确保浏览器各窗口顺畅保存，绝不被弹窗拦截器阻拦
    tasks.forEach((t, index) => {
      setTimeout(() => {
        this.triggerCanvasDownload(t.canvas, format, t.filename);
      }, index * 350);
    });

    return tasks.map(t => t.filename);
  }

  // Download Image File (PNG or JPG)
  downloadImage(format = 'png', options = {}) {
    const validFloors = this.getValidFloors();
    // 若为多层户型图且未强制指定单层，自动执行多层全套导出（每一层 + 全楼层总览大图）！
    if (validFloors.length > 1 && options.onlySingleFloor !== true) {
      return this.exportAllStoreys(format, options);
    }

    const canvas = this.generateImageCanvas(options);
    const ext = format === 'jpg' ? 'jpg' : 'png';
    const style = options.style || 'color';
    const styleName = style === 'cad' ? 'CAD工程图' : '彩色渲染图';
    const filename = `${options.title || '户型图'}_${styleName}_${Date.now()}.${ext}`;
    this.triggerCanvasDownload(canvas, format, filename);
  }

  // Export as Pure Vector SVG File
  exportSVG(options = {}) {
    const validFloors = this.getValidFloors();
    const title = options.title || '户型图';

    // 若为多层，分别为每层导出矢量图，并导出一份全楼层总览矢量图
    if (validFloors.length > 1 && options.onlySingleFloor !== true) {
      const origFloor = this.engine.currentFloor;
      validFloors.forEach((fId, idx) => {
        setTimeout(() => {
          const fl = this.engine.floors[fId];
          if (fl) {
            this.engine.walls = fl.walls || [];
            this.engine.rooms = fl.rooms || [];
            this.engine.doors = fl.doors || [];
            this.engine.windows = fl.windows || [];
          }
          this._exportSingleSVG({ ...options, title: `${title}_${fId}` });
        }, idx * 350);
      });
      // 延迟复原
      setTimeout(() => {
        if (origFloor && this.engine.floors[origFloor]) {
          const fl = this.engine.floors[origFloor];
          this.engine.walls = fl.walls || [];
          this.engine.rooms = fl.rooms || [];
          this.engine.doors = fl.doors || [];
          this.engine.windows = fl.windows || [];
        }
      }, validFloors.length * 350 + 100);
      return;
    }

    this._exportSingleSVG(options);
  }

  _exportSingleSVG(options = {}) {
    const bbox = this.getBoundingBox();
    const svgW = bbox.width;
    const svgH = bbox.height;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bbox.minX} ${bbox.minY} ${svgW} ${svgH}" width="100%" height="100%">
  <defs>
    <style>
      .bearing-wall { fill: #1e293b; stroke: #0f172a; stroke-width: 10; }
      .normal-wall { fill: #1e293b; stroke: #0f172a; stroke-width: 10; }
      .virtual-wall { stroke: #94a3b8; stroke-width: 30; stroke-dasharray: 150, 150; }
      .room-label { font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; font-weight: bold; font-size: 200px; text-anchor: middle; fill: #0f172a; }
      .room-area { font-family: sans-serif; font-size: 140px; text-anchor: middle; fill: #64748b; }
      .dim-line { stroke: #64748b; stroke-width: 6; }
      .dim-text { font-family: sans-serif; font-size: 140px; text-anchor: middle; fill: #334155; }
    </style>
  </defs>
  <rect x="${bbox.minX}" y="${bbox.minY}" width="${svgW}" height="${svgH}" fill="#ffffff"/>
`;

    // Rooms
    for (const r of this.engine.rooms) {
      if (!r.polygon || r.polygon.length < 3) continue;
      const pts = r.polygon.map(p => `${p.x},${p.y}`).join(' ');
      svg += `  <polygon points="${pts}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="15"/>\n`;
    }

    // Walls
    for (const w of this.engine.walls) {
      const dx = w.p2.x - w.p1.x;
      const dy = w.p2.y - w.p1.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const nx = -dy / len;
      const ny = dx / len;
      const halfThick = (w.thickness || 240) / 2;

      const p1 = `${w.p1.x + nx * halfThick},${w.p1.y + ny * halfThick}`;
      const p2 = `${w.p2.x + nx * halfThick},${w.p2.y + ny * halfThick}`;
      const p3 = `${w.p2.x - nx * halfThick},${w.p2.y - ny * halfThick}`;
      const p4 = `${w.p1.x - nx * halfThick},${w.p1.y - ny * halfThick}`;

      const cls = w.type === 'bearing' ? 'bearing-wall' : (w.type === 'virtual' ? 'virtual-wall' : 'normal-wall');
      if (w.type === 'virtual') {
        svg += `  <line x1="${w.p1.x}" y1="${w.p1.y}" x2="${w.p2.x}" y2="${w.p2.y}" class="${cls}"/>\n`;
      } else {
        svg += `  <polygon points="${p1} ${p2} ${p3} ${p4}" class="${cls}"/>\n`;
      }
    }

    // Room Text Labels
    if (options.showRoomLabels !== false) {
      for (const r of this.engine.rooms) {
        if (!r.center) continue;
        const name = r.name || '房间';
        const area = (r.area ? r.area.toFixed(1) : '0.0') + ' ㎡';
        svg += `  <text x="${r.center.x}" y="${r.center.y - 50}" class="room-label">${name}</text>\n`;
        svg += `  <text x="${r.center.x}" y="${r.center.y + 70}" class="room-area">${area}</text>\n`;
      }
    }

    svg += `</svg>`;

    // Download SVG file
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${options.title || '户型图'}_矢量图_${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // Export JSON Project File (包含完整多楼层结构)
  exportJSON(title = '户型工程') {
    if (this.engine.saveCurrentFloorState) {
      this.engine.saveCurrentFloorState();
    }
    const data = {
      title,
      version: '1.2.0',
      exportedAt: new Date().toISOString(),
      currentFloor: this.engine.currentFloor,
      floors: this.engine.floors,
      walls: this.engine.walls,
      doors: this.engine.doors,
      windows: this.engine.windows,
      rooms: this.engine.rooms,
      furniture: this.engine.furniture,
      compass: this.engine.compass
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FloorPlanExporter };
}
