/**
 * Canvas 2D Floor Plan High-DPI Rendering Pipeline
 */

// Canvas roundRect Polyfill for universal browser compatibility
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii = 0) {
    let r = typeof radii === 'number' ? radii : (Array.isArray(radii) ? radii[0] : 0);
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

class FloorPlanRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;

    // Rendering options
    this.showBlueprint = true;
    this.showGrid = true;
    this.showDimensions = true;
    this.showDimensionsAlways = false; // 画布平时不全屏标注墙体，仅在绘制或选中墙体时显示参考
    this.showRuler = false; // 比例尺标尺刻度
    this.showRoomLabels = true;
    this.showFurniture = true;
    this.showCompass = false; // Only keep the modern floating DOM compass widget
    this.activeTab = 'draw'; // 'draw', 'furnish', 'library'
    this.renderMode = 'color'; // 'color', 'cad', 'wireframe'
    this.floorPreviewMode = false; // 临时预览家具模式地板材质
    this.floorTransparencyMode = 'transparent'; // 'transparent' | 'hidden' | 'opaque'
    this.blueprintBlendMode = 'multiply'; // 'multiply' | 'source-over'

    // Interaction selection states
    this.selectedItem = null; // { type: 'wall'|'door'|'window'|'furniture'|'room'|'blueprint', id: ... }
    this.hoveredItem = null;
    this.activeDrawLine = null; // { p1, p2, valid }
    this.activeDrawRect = null; // { p1, p2, thickness, type }
    this.snapIndicator = null; // { x, y, type }
    this.alignmentGuide = null; // { x1, y1, x2, y2 }
    this.calibrationPoints = []; // for scale calibration mode
    this.dragGhost = null; // { type: 'furniture'|'opening', ... }
    this.rotationSnapInfo = null; // { x, y, angle, type, isHorizontal, item }

    this.imageCache = new Map();
    // 继承已加载完成的全局共享家具图片缓存，确保导出或离屏渲染时 100% 同步拥有真实家具模型
    if (!FloorPlanRenderer.SHARED_IMAGE_CACHE) {
      FloorPlanRenderer.SHARED_IMAGE_CACHE = new Map();
    }
    for (const [k, img] of FloorPlanRenderer.SHARED_IMAGE_CACHE.entries()) {
      if (img && img.complete && img.naturalWidth > 0) {
        this.imageCache.set(k, img);
      }
    }

    this.initPatterns();
    this.initImageCache();
  }

  initImageCache() {
    if (!FloorPlanRenderer.SHARED_IMAGE_CACHE) {
      FloorPlanRenderer.SHARED_IMAGE_CACHE = new Map();
    }

    if (typeof FURNITURE_CATALOG !== 'undefined') {
      FURNITURE_CATALOG.forEach(item => {
        if (item.url) {
          const cached = FloorPlanRenderer.SHARED_IMAGE_CACHE.get(item.id);
          if (cached && cached.complete && cached.naturalWidth > 0) {
            this.imageCache.set(item.id, cached);
            return;
          }

          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            FloorPlanRenderer.SHARED_IMAGE_CACHE.set(item.id, img);
            this.imageCache.set(item.id, img);
            this.render();
          };
          img.onerror = () => {
            // 若某些 CDN 跨域限制，尝试常规加载
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
              FloorPlanRenderer.SHARED_IMAGE_CACHE.set(item.id, fallbackImg);
              this.imageCache.set(item.id, fallbackImg);
              this.render();
            };
            fallbackImg.src = item.url;
          };
          img.src = item.url;
          FloorPlanRenderer.SHARED_IMAGE_CACHE.set(item.id, img);
          this.imageCache.set(item.id, img);
        }
      });
    }
  }

  initPatterns() {
    this.patterns = {};

    const makePattern = (w, h, drawFn) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      drawFn(c.getContext('2d'), w, h);
      return this.ctx.createPattern(c, 'repeat');
    };

    // 1. tile_cream: 现代暖米抛光砖 (图1 第1行第1列)
    this.patterns.tile_cream = makePattern(600, 600, (ctx, w, h) => {
      ctx.fillStyle = '#f7eedb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(2, 2, w - 4, h - 4);
      ctx.strokeStyle = '#e6dcce';
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });

    // 2. tile_carrara: 卡拉拉大理石柔光地砖 (图1 第1行第2列)
    this.patterns.tile_carrara = makePattern(1200, 1200, (ctx, w, h) => {
      ctx.fillStyle = '#fbfbfa';
      ctx.fillRect(0, 0, w, h);
      const drawVein = (x1, y1, x2, y2, color, width) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2 + 30, (y1 + y2) / 2 - 20, x2, y2);
        ctx.stroke();
      };
      drawVein(100, 50, 450, 550, 'rgba(215, 210, 205, 0.28)', 16);
      drawVein(100, 50, 450, 550, 'rgba(185, 175, 165, 0.40)', 5);
      drawVein(700, 150, 1150, 450, 'rgba(215, 210, 205, 0.28)', 14);
      drawVein(700, 150, 1150, 450, 'rgba(180, 170, 160, 0.35)', 4);
      drawVein(200, 800, 550, 1150, 'rgba(210, 205, 200, 0.28)', 12);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, 600, 600);
      ctx.strokeRect(600.5, 0.5, 600, 600);
      ctx.strokeRect(0.5, 600.5, 600, 600);
      ctx.strokeRect(600.5, 600.5, 600, 600);
    });
    this.patterns.tile_white = this.patterns.tile_carrara;

    // 3. tile_checkered: 经典棋盘浅格砖 (图1 第1行第3列)
    this.patterns.tile_checkered = makePattern(600, 600, (ctx, w, h) => {
      ctx.fillStyle = '#f9f3e3';
      ctx.fillRect(0, 0, w, h);
      const sz = 150;
      for (let y = 0; y < h; y += sz) {
        for (let x = 0; x < w; x += sz) {
          if (((x / sz) + (y / sz)) % 2 === 0) {
            ctx.fillStyle = '#f0e6ce';
            ctx.fillRect(x + 1, y + 1, sz - 2, sz - 2);
          }
        }
      }
      ctx.strokeStyle = '#dfd6c0';
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= w; x += sz) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += sz) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    });

    // 4. tile_grey: 现代素水泥浅灰砖 (图1 第2行第1列)
    this.patterns.tile_grey = makePattern(600, 600, (ctx, w, h) => {
      ctx.fillStyle = '#eaeff4';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(180, 195, 210, 0.2)';
      for (let i = 0; i < 200; i++) {
        ctx.fillRect((i * 37) % w, (i * 73) % h, 3, 3);
      }
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });

    // 5. tile_hex: 卫浴浅灰微纹理小方砖 (图1 第2行第2列)
    this.patterns.tile_hex = makePattern(300, 300, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= 300; x += 150) {
        for (let y = 0; y <= 300; y += 150) {
          ctx.strokeRect(x, y, 150, 150);
          ctx.fillStyle = 'rgba(241, 245, 249, 0.6)';
          ctx.fillRect(x + 2, y + 2, 146, 146);
        }
      }
    });

    // 6. tile_travertine: 洞石米黄大理石 (图1 第2行第3列)
    this.patterns.tile_travertine = makePattern(600, 600, (ctx, w, h) => {
      ctx.fillStyle = '#f5e9d3';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(215, 195, 160, 0.25)';
      for (let y = 20; y < h; y += 45) {
        ctx.fillRect(0, y, w, 6);
      }
      ctx.strokeStyle = '#dfceb4';
      ctx.lineWidth = 2;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });

    // 7. wood_light: 浅原木色地板 (图1 第3行第1列)
    this.patterns.wood_light = makePattern(800, 400, (ctx, w, h) => {
      ctx.fillStyle = '#f2e8dc';
      ctx.fillRect(0, 0, w, h);
      const pH = 80;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#ded0bf';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, w, pH);
      }
    });

    // 8. wood_warm: 经典暖橡木实木复合地板 (图1 第3行第2列)
    this.patterns.wood_warm = makePattern(1200, 600, (ctx, w, h) => {
      ctx.fillStyle = '#bc8253';
      ctx.fillRect(0, 0, w, h);
      const plankH = 100;
      const plankW = 400;
      const colors = ['#bc8253', '#b37a4d', '#c28859', '#b87f52'];
      let ci = 0;
      for (let y = 0; y < h; y += plankH) {
        const offset = ((y / plankH) % 3) * 133;
        for (let x = -offset; x < w + plankW; x += plankW) {
          ctx.fillStyle = colors[ci++ % colors.length];
          ctx.fillRect(x + 1, y + 1, plankW - 2, plankH - 2);
          ctx.strokeStyle = '#a46f44';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, plankW - 1, plankH - 1);
        }
      }
    });

    // 9. wood_plank: 直纹细拼木地板 (图1 第3行第3列)
    this.patterns.wood_plank = makePattern(800, 400, (ctx, w, h) => {
      ctx.fillStyle = '#dfd3c3';
      ctx.fillRect(0, 0, w, h);
      const pH = 50;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#c8bcab';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, y, w, pH);
      }
    });

    // 10. wood_parquet: 人字拼花实木地板 (图2 第2行第1列)
    this.patterns.wood_parquet = makePattern(400, 400, (ctx, w, h) => {
      ctx.fillStyle = '#edd49d';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(215, 185, 125, 0.3)';
      for (let y = 0; y < h; y += 40) {
        for (let x = 0; x < w; x += 80) {
          ctx.fillRect(x, y, 38, 38);
        }
      }
      ctx.strokeStyle = '#d4bb82';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, w, h);
    });

    // 11. wood_wide: 宽板实木复合地板 (图2 第2行第2列)
    this.patterns.wood_wide = makePattern(1200, 600, (ctx, w, h) => {
      ctx.fillStyle = '#cba880';
      ctx.fillRect(0, 0, w, h);
      const pH = 120;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#af8d65';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, y, w, pH);
      }
    });
    this.patterns.deck_wood = this.patterns.wood_wide;

    // 12. wood_walnut: 深胡桃木地板 (图2 第2行第3列)
    this.patterns.wood_walnut = makePattern(1200, 600, (ctx, w, h) => {
      ctx.fillStyle = '#9c6d48';
      ctx.fillRect(0, 0, w, h);
      const pH = 100;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#805636';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(0, y, w, pH);
      }
    });

    // 13. wood_grey: 现代灰橡木地板 (图2 第3行第1列)
    this.patterns.wood_grey = makePattern(1200, 600, (ctx, w, h) => {
      ctx.fillStyle = '#a3978a';
      ctx.fillRect(0, 0, w, h);
      const pH = 100;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#8c8074';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(0, y, w, pH);
      }
    });

    // 14. wood_bleached: 白橡复古实木地板 (图2 第3行第2列)
    this.patterns.wood_bleached = makePattern(1200, 600, (ctx, w, h) => {
      ctx.fillStyle = '#e8dfd3';
      ctx.fillRect(0, 0, w, h);
      const pH = 100;
      for (let y = 0; y < h; y += pH) {
        ctx.strokeStyle = '#cfc6bb';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(0, y, w, pH);
      }
    });

    // 15. outdoor_lawn: 户外庭院绿草地 (图2 第3行第3列，院子/花园专属)
    this.patterns.outdoor_lawn = makePattern(400, 400, (ctx, w, h) => {
      ctx.fillStyle = '#4ba237';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#55b340';
      for (let i = 0; i < 600; i++) {
        const rx = (i * 29) % w;
        const ry = (i * 53) % h;
        ctx.fillRect(rx, ry, 3, 5);
      }
      ctx.fillStyle = '#3f8c2e';
      for (let i = 0; i < 400; i++) {
        const rx = (i * 47) % w;
        const ry = (i * 31) % h;
        ctx.fillRect(rx, ry, 2, 4);
      }
    });
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(100, rect.width || (window.innerWidth - 330));
    const h = Math.max(100, rect.height || (window.innerHeight - 84));
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    if (this.ctx.resetTransform) {
      this.ctx.resetTransform();
    } else {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.ctx.scale(dpr, dpr);
    this.width = w;
    this.height = h;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const engine = this.engine;
    const vp = engine.viewport;

    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Grid Background
    if (this.showGrid) {
      this.renderGrid(ctx, vp);
    }

    // Apply Viewport Transform to World Coordinates (in mm)
    ctx.save();
    ctx.translate(vp.x, vp.y);
    ctx.scale(vp.zoom, vp.zoom);

    // 2. Rooms & Flooring (先渲染房间地板)
    if (this.showRooms !== false) {
      this.renderRooms(ctx);
    }

    // 3. Blueprint (底图) Image - 置于房间地板之上、墙体/门窗之下，确保临摹封闭外墙后底图线条完全清晰可见
    if (this.showBlueprint && engine.blueprint.image && engine.blueprint.visible) {
      this.renderBlueprint(ctx, engine.blueprint);
    }

    // 4. Walls
    this.renderWalls(ctx);

    // 5. Openings (Doors & Windows)
    this.renderOpenings(ctx);

    // 6. Furniture
    if (this.showFurniture) {
      this.renderFurniture(ctx);
    }

    // 7. Dimensions & Annotations
    if (this.showDimensions) {
      this.renderDimensions(ctx);
    }

    // 8. Room Name & Area Badges
    if (this.showRoomLabels) {
      this.renderRoomLabels(ctx);
    }

    // 9. Active Drawing Previews & Snapping Guides
    this.renderDrawingFeedback(ctx);

    ctx.restore(); // Exit World Transform

    // 10. Compass Rose in Screen Space
    if (this.showCompass) {
      this.renderCompass(ctx);
    }

    // 11. Scale Calibration Markers
    if (this.calibrationPoints.length > 0) {
      this.renderCalibrationFeedback(ctx);
    }

    // 12. Canvas Dynamic Ruler / Coordinate Axis (比例尺)
    if (this.showRuler) {
      this.renderRuler(ctx);
    }

    ctx.restore();

    // 自动激活入户门动态引导循环（虚线流光 + 人物迈步）
    const hasEntrance = this.engine && this.engine.doors && this.engine.doors.some(d => d.type === 'entry_door' || d.isEntrance);
    if (hasEntrance && !this.isAnimating) {
      this.startEntranceAnimation();
    }
  }

  renderGrid(ctx, vp) {
    const gridSize = 1000 * vp.zoom; // 1 meter grid in screen px
    if (gridSize < 12) return; // don't render if too dense

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;

    const startX = vp.x % gridSize;
    const startY = vp.y % gridSize;

    ctx.beginPath();
    for (let x = startX; x < this.width; x += gridSize) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
    }
    for (let y = startY; y < this.height; y += gridSize) {
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // Major 5-meter grid lines
    const majorGrid = gridSize * 5;
    const mStartX = vp.x % majorGrid;
    const mStartY = vp.y % majorGrid;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = mStartX; x < this.width; x += majorGrid) {
      ctx.moveTo(x, 0); ctx.lineTo(x, this.height);
    }
    for (let y = mStartY; y < this.height; y += majorGrid) {
      ctx.moveTo(0, y); ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  renderBlueprint(ctx, bp) {
    ctx.save();
    ctx.globalAlpha = bp.opacity !== undefined ? bp.opacity : 0.5;

    // 采用正片叠底 (multiply) 混合模式，底图的白色背景与下层地板通透融合，深色线条与文字标注100%高清清晰浮现于地板上方
    if (this.blueprintBlendMode === 'source-over') {
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'multiply';
    }

    ctx.translate(bp.x, bp.y);
    ctx.rotate(bp.rotation * Math.PI / 180);
    // Draw scaled by mmPerPixel
    const scaleFactor = bp.scale * bp.mmPerPixel;
    ctx.scale(scaleFactor, scaleFactor);
    ctx.drawImage(bp.image, 0, 0);

    // If selected, draw blueprint boundary box
    if (this.selectedItem && this.selectedItem.type === 'blueprint') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3 / scaleFactor;
      ctx.setLineDash([8 / scaleFactor, 8 / scaleFactor]);
      ctx.strokeRect(0, 0, bp.image.width, bp.image.height);
    }
    ctx.restore();
  }

  renderRooms(ctx) {
    const engine = this.engine;

    // 用户明确要求：
    // 1. 家具页面(furnish) 或 修改地板临时预览(floorPreviewMode)：保持原来的彩绘效果，完整显示真实地板纹理与图案
    // 2. 画户型图页面(draw / library)：平时地板保持完全透明，绝不遮挡底图，方便临摹与继续绘制隔墙
    const isFurnishMode = (this.renderMode === 'color') && (this.activeTab === 'furnish' || !this.activeTab || this.floorPreviewMode);

    if (!isFurnishMode) {
      // 画户型/临摹页面：房间内部保持透明，绝不遮挡底图！
      // 仅在有房间被选中时，绘制轻量选中轮廓与高亮
      for (const r of engine.rooms) {
        if (!r.polygon || r.polygon.length < 3) continue;
        if (this.selectedItem && (this.selectedItem.type === 'room' || this.selectedItem.type === 'room_label') && this.selectedItem.id === r.id) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(r.polygon[0].x, r.polygon[0].y);
          for (let i = 1; i < r.polygon.length; i++) {
            ctx.lineTo(r.polygon[i].x, r.polygon[i].y);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
          ctx.fill();
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 30;
          ctx.stroke();
          ctx.restore();
        }
      }
      return;
    }

    // 家具页面 (furnish)：保持原来的效果，100% 完整显示真实地板！
    for (const r of engine.rooms) {
      if (!r.polygon || r.polygon.length < 3) continue;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(r.polygon[0].x, r.polygon[0].y);
      for (let i = 1; i < r.polygon.length; i++) {
        ctx.lineTo(r.polygon[i].x, r.polygon[i].y);
      }
      ctx.closePath();

      const pattern = this.patterns[r.floorTexture] || this.patterns.wood_warm;
      ctx.fillStyle = pattern;
      ctx.fill();
      // Subtle ambient inner border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.lineWidth = 20;
      ctx.stroke();

      // Highlight selected room
      if (this.selectedItem && (this.selectedItem.type === 'room' || this.selectedItem.type === 'room_label') && this.selectedItem.id === r.id) {
        ctx.fillStyle = 'rgba(2, 132, 199, 0.15)';
        ctx.fill();
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 40;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  getWallPoly(w) {
    const dx = w.p2.x - w.p1.x;
    const dy = w.p2.y - w.p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return null;
    const nx = -dy / len;
    const ny = dx / len;
    const halfThick = (w.thickness || 240) / 2;
    return {
      poly: [
        { x: w.p1.x + nx * halfThick, y: w.p1.y + ny * halfThick },
        { x: w.p2.x + nx * halfThick, y: w.p2.y + ny * halfThick },
        { x: w.p2.x - nx * halfThick, y: w.p2.y - ny * halfThick },
        { x: w.p1.x - nx * halfThick, y: w.p1.y - ny * halfThick }
      ],
      len, nx, ny, halfThick
    };
  }

  // Calculate flush face segments and corner extensions for seamless wall joins
  getWallFaceSegments(w) {
    const info = this.getWallPoly(w);
    if (!info) return null;
    const { poly } = info;
    const dx = w.p2.x - w.p1.x;
    const dy = w.p2.y - w.p1.y;
    const len = info.len;
    const ux = dx / len;
    const uy = dy / len;

    let ext1 = 0;
    let ext2 = 0;
    if (this.engine && this.engine.walls) {
      for (const other of this.engine.walls) {
        if (other.id === w.id || other.type === 'virtual') continue;
        const otherHalf = (other.thickness || 240) / 2;
        if (FloorPlanEngine.dist(w.p1, other.p1) < 80 || FloorPlanEngine.dist(w.p1, other.p2) < 80) {
          ext1 = Math.max(ext1, otherHalf);
        }
        if (FloorPlanEngine.dist(w.p2, other.p1) < 80 || FloorPlanEngine.dist(w.p2, other.p2) < 80) {
          ext2 = Math.max(ext2, otherHalf);
        }
      }
    }

    return {
      face1: {
        x1: poly[0].x - ux * ext1,
        y1: poly[0].y - uy * ext1,
        x2: poly[1].x + ux * ext2,
        y2: poly[1].y + uy * ext2
      },
      face2: {
        x1: poly[3].x - ux * ext1,
        y1: poly[3].y - uy * ext1,
        x2: poly[2].x + ux * ext2,
        y2: poly[2].y + uy * ext2
      },
      info,
      ext1,
      ext2
    };
  }

  isEndpointConnected(pt, wallId) {
    const engine = this.engine;
    for (const other of engine.walls) {
      if (other.id === wallId || other.type === 'virtual') continue;
      const d1 = FloorPlanEngine.dist(pt, other.p1);
      const d2 = FloorPlanEngine.dist(pt, other.p2);
      if (d1 < 100 || d2 < 100) return true;
      const proj = FloorPlanEngine.projectPointToSegment(pt, other.p1, other.p2);
      if (proj.dist < (other.thickness || 240) / 2 + 30 && proj.t > 0.01 && proj.t < 0.99) {
        return true;
      }
    }
    return false;
  }

  renderWalls(ctx) {
    const engine = this.engine;

    // 1. Pass 1: Soft Building Footprint Drop Shadow in Color Mode
    if (this.renderMode === 'color') {
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 20;
      ctx.fillStyle = '#1e293b';

      for (const w of engine.walls) {
        if (w.type === 'virtual') continue;
        const info = this.getWallPoly(w);
        if (!info) continue;
        const poly = info.poly;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w.p1.x, w.p1.y, info.halfThick, 0, Math.PI * 2);
        ctx.arc(w.p2.x, w.p2.y, info.halfThick, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flush square miter corners for shadow pass
      const shadowCorners = new Set();
      for (const w of engine.walls) {
        if (w.type === 'virtual') continue;
        for (const p of [w.p1, w.p2]) {
          const ckey = `${Math.round(p.x / 50) * 50}_${Math.round(p.y / 50) * 50}`;
          if (shadowCorners.has(ckey)) continue;
          shadowCorners.add(ckey);
          const connected = engine.walls.filter(other =>
            other.type !== 'virtual' &&
            (FloorPlanEngine.dist(p, other.p1) < 80 || FloorPlanEngine.dist(p, other.p2) < 80)
          );
          if (connected.length >= 2) {
            const maxHalf = Math.max(...connected.map(cw => (cw.thickness || 240) / 2));
            ctx.fillRect(p.x - maxHalf, p.y - maxHalf, maxHalf * 2, maxHalf * 2);
          }
        }
      }

      ctx.restore();
    }

    // 2. Pass 2: Seamless Solid Wall Fills
    // A. Normal partition & low walls
    for (const w of engine.walls) {
      if (w.type === 'virtual' || w.type === 'bearing') continue;
      const info = this.getWallPoly(w);
      if (!info) continue;
      ctx.fillStyle = w.type === 'low' ? '#cbd5e1' : ((this.renderMode === 'cad' || this.renderMode === 'wireframe') ? '#000000' : '#1e293b');
      ctx.beginPath();
      ctx.moveTo(info.poly[0].x, info.poly[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(info.poly[i].x, info.poly[i].y);
      ctx.closePath();
      ctx.fill();
      // Fillet round corner caps for seamless joining
      ctx.beginPath();
      ctx.arc(w.p1.x, w.p1.y, info.halfThick, 0, Math.PI * 2);
      ctx.arc(w.p2.x, w.p2.y, info.halfThick, 0, Math.PI * 2);
      ctx.fill();
    }

    // B. Bearing walls (solid dark architectural slate)
    for (const w of engine.walls) {
      if (w.type !== 'bearing') continue;
      const info = this.getWallPoly(w);
      if (!info) continue;
      ctx.fillStyle = (this.renderMode === 'cad' || this.renderMode === 'wireframe') ? '#000000' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(info.poly[0].x, info.poly[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(info.poly[i].x, info.poly[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w.p1.x, w.p1.y, info.halfThick, 0, Math.PI * 2);
      ctx.arc(w.p2.x, w.p2.y, info.halfThick, 0, Math.PI * 2);
      ctx.fill();
    }

    // C. Seamless Flush Square Miter Joints at all connected corners
    const fillCorners = new Set();
    for (const w of engine.walls) {
      if (w.type === 'virtual') continue;
      for (const p of [w.p1, w.p2]) {
        const ckey = `${Math.round(p.x / 50) * 50}_${Math.round(p.y / 50) * 50}`;
        if (fillCorners.has(ckey)) continue;
        fillCorners.add(ckey);
        const connected = engine.walls.filter(other =>
          other.type !== 'virtual' &&
          (FloorPlanEngine.dist(p, other.p1) < 80 || FloorPlanEngine.dist(p, other.p2) < 80)
        );
        if (connected.length >= 2) {
          const hasBearing = connected.some(cw => cw.type === 'bearing');
          ctx.fillStyle = hasBearing ? ((this.renderMode === 'cad' || this.renderMode === 'wireframe') ? '#000000' : '#1e293b') : '#1e293b';
          const maxHalf = Math.max(...connected.map(cw => (cw.thickness || 240) / 2));
          ctx.fillRect(p.x - maxHalf, p.y - maxHalf, maxHalf * 2, maxHalf * 2);
        }
      }
    }

    // 3. Pass 3: Clean Wall Face Outlines (No internal intersecting lines!)
    for (const w of engine.walls) {
      const isSelected = this.selectedItem && this.selectedItem.type === 'wall' && this.selectedItem.id === w.id;
      const isHovered = this.hoveredItem && this.hoveredItem.type === 'wall' && this.hoveredItem.id === w.id;

      if (w.type === 'virtual') {
        ctx.save();
        ctx.strokeStyle = isSelected ? '#0284c7' : '#94a3b8';
        ctx.lineWidth = 24;
        ctx.setLineDash([120, 120]);
        ctx.beginPath();
        ctx.moveTo(w.p1.x, w.p1.y);
        ctx.lineTo(w.p2.x, w.p2.y);
        ctx.stroke();
        ctx.restore();
        continue;
      }

      const faceSegs = this.getWallFaceSegments(w);
      if (!faceSegs) continue;
      const { face1, face2, info } = faceSegs;
      const { poly } = info;

      ctx.save();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 10;
      ctx.lineJoin = 'miter';
      ctx.miterLimit = 4;

      // Longitudinal face 1 with corner extension
      ctx.beginPath();
      ctx.moveTo(face1.x1, face1.y1);
      ctx.lineTo(face1.x2, face1.y2);
      ctx.stroke();

      // Longitudinal face 2 with corner extension
      ctx.beginPath();
      ctx.moveTo(face2.x1, face2.y1);
      ctx.lineTo(face2.x2, face2.y2);
      ctx.stroke();

      // End cap at p1 (v3 -> v0): only stroke if endpoint is NOT connected to another wall
      if (!this.isEndpointConnected(w.p1, w.id)) {
        ctx.beginPath();
        ctx.moveTo(poly[3].x, poly[3].y);
        ctx.lineTo(poly[0].x, poly[0].y);
        ctx.stroke();
      }

      // End cap at p2 (v1 -> v2): only stroke if endpoint is NOT connected to another wall
      if (!this.isEndpointConnected(w.p2, w.id)) {
        ctx.beginPath();
        ctx.moveTo(poly[1].x, poly[1].y);
        ctx.lineTo(poly[2].x, poly[2].y);
        ctx.stroke();
      }

      // Highlight selected / hovered wall
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = 28;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.stroke();

        // Draw interactive vertex drag handles (端点拖拽把手)
        [w.p1, w.p2].forEach(p => {
          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 16;
          ctx.shadowColor = 'rgba(2, 132, 199, 0.45)';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 85, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        });

        // Midpoint drag handle (中点平移整段墙体把手)
        const mx = (w.p1.x + w.p2.x) / 2;
        const my = (w.p1.y + w.p2.y) / 2;
        ctx.save();
        ctx.fillStyle = '#0284c7';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 12;
        ctx.shadowColor = 'rgba(2, 132, 199, 0.35)';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(mx, my, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    }
  }

  drawOpeningSymbol(ctx, type, halfW, wallThick, width) {
    if (type === 'single_door' || type === 'entry_door') {
      // Door swing arc (90 degrees) - modern cyan-blue or clean dark
      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(-halfW, -wallThick/2, width, 0, Math.PI / 2);
      ctx.stroke();

      // Door leaf line
      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : '#1e293b';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(-halfW, -wallThick/2);
      ctx.lineTo(-halfW, -wallThick/2 + width);
      ctx.stroke();

      // Door handle knob in color mode
      if (this.renderMode === 'color') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(-halfW + 28, -wallThick/2 + width * 0.82, 18, 0, Math.PI * 2);
        ctx.fill();
      }

      // Door frame stops
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-halfW - 25, -wallThick/2, 25, wallThick);
      ctx.fillRect(halfW, -wallThick/2, 25, wallThick);
    } else if (type === 'double_door') {
      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : '#38bdf8';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(-halfW, -wallThick/2, halfW, 0, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(halfW, -wallThick/2, halfW, Math.PI / 2, Math.PI); ctx.stroke();

      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : '#1e293b';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(-halfW, -wallThick/2); ctx.lineTo(-halfW, -wallThick/2 + halfW); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(halfW, -wallThick/2); ctx.lineTo(halfW, -wallThick/2 + halfW); ctx.stroke();
    } else if (type === 'sliding_door') {
      const paneW = width * 0.55;
      if (this.renderMode === 'color') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.fillRect(-halfW, -wallThick * 0.3, paneW, wallThick * 0.25);
        ctx.fillRect(-halfW + width * 0.45, wallThick * 0.05, paneW, wallThick * 0.25);
      }
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 12;
      ctx.strokeRect(-halfW, -wallThick * 0.3, paneW, wallThick * 0.25);
      ctx.strokeRect(-halfW + width * 0.45, wallThick * 0.05, paneW, wallThick * 0.25);
    } else if (type === 'opening' || type === 'doorway') {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 10;
      ctx.setLineDash([40, 40]);
      ctx.beginPath();
      ctx.moveTo(-halfW, -wallThick/2); ctx.lineTo(-halfW, wallThick/2);
      ctx.moveTo(halfW, -wallThick/2); ctx.lineTo(halfW, wallThick/2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (type === 'bay_window') {
      const ledge = 450;
      ctx.fillStyle = this.renderMode === 'color' ? '#fafaf9' : '#ffffff';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-halfW, -wallThick/2);
      ctx.lineTo(-halfW * 0.8, -wallThick/2 - ledge);
      ctx.lineTo(halfW * 0.8, -wallThick/2 - ledge);
      ctx.lineTo(halfW, -wallThick/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (this.renderMode === 'color') {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.beginPath();
        ctx.moveTo(-halfW, -wallThick/2);
        ctx.lineTo(-halfW * 0.8, -wallThick/2 - ledge);
        ctx.lineTo(halfW * 0.8, -wallThick/2 - ledge);
        ctx.lineTo(halfW, -wallThick/2);
        ctx.closePath();
        ctx.fill();
      }

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-halfW * 0.8, -wallThick/2 - ledge + 50);
      ctx.lineTo(halfW * 0.8, -wallThick/2 - ledge + 50);
      ctx.stroke();
    } else if (type === 'french_window' || type === 'window') {
      if (this.renderMode === 'color') {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.fillRect(-halfW, -wallThick/2, width, wallThick);
      }
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-halfW, -wallThick/2); ctx.lineTo(halfW, -wallThick/2);
      ctx.moveTo(-halfW, wallThick/2); ctx.lineTo(halfW, wallThick/2);
      ctx.stroke();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(-halfW, -wallThick/6); ctx.lineTo(halfW, -wallThick/6);
      ctx.moveTo(-halfW, wallThick/6); ctx.lineTo(halfW, wallThick/6);
      ctx.stroke();
    }
  }

  // --- 入户门标记避让组件计算 (避免与室内家具/构件重叠) ---
  calculateSafeEntranceDist(op, wall, entrySide) {
    const baseDist = 680;
    if (!this.engine || !this.engine.furniture || !this.engine.furniture.length) {
      return baseDist;
    }

    const cx = wall.p1.x + op.t * (wall.p2.x - wall.p1.x);
    const cy = wall.p1.y + op.t * (wall.p2.y - wall.p1.y);
    const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    const wallThick = wall.thickness || 240;
    const sign = entrySide ? 1 : -1;

    // 胶囊卡片半宽半高（带安全外扩边距，确保绝对不重叠）
    const cardHalfW = 620;
    const cardHalfH = 260;

    let safeDist = baseDist;
    const maxTestDist = 1800;
    const step = 80;

    // 检查候选距离 dist 下，卡片是否与任何家具组件碰撞
    const checkCollision = (testDist) => {
      const markerDist = sign * (wallThick / 2 + testDist);
      const mx = cx - markerDist * Math.sin(angle);
      const my = cy + markerDist * Math.cos(angle);

      for (const f of this.engine.furniture) {
        const rad = (f.rotation || 0) * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const fHalfW = ((f.width || 600) * cos + (f.height || 600) * sin) / 2 + 60;
        const fHalfH = ((f.width || 600) * sin + (f.height || 600) * cos) / 2 + 60;

        // AABB 碰撞检测
        const overlapX = Math.abs(mx - f.x) < (cardHalfW + fHalfW);
        const overlapY = Math.abs(my - f.y) < (cardHalfH + fHalfH);
        if (overlapX && overlapY) {
          return true; // 发生碰撞
        }
      }
      return false;
    };

    // 如果基准距离发生碰撞，向远离门方向逐步自适应延伸寻找开阔安全区
    if (checkCollision(safeDist)) {
      let found = false;
      for (let d = baseDist + step; d <= maxTestDist; d += step) {
        if (!checkCollision(d)) {
          safeDist = d;
          found = true;
          break;
        }
      }
      // 如果向外无法找到，尝试往靠近门方向微调
      if (!found) {
        for (let d = baseDist - step; d >= 500; d -= step) {
          if (!checkCollision(d)) {
            safeDist = d;
            break;
          }
        }
      }
    }

    return safeDist;
  }

  // --- 入户门动态引导循环 (虚线流光与人物走动动画) ---
  startEntranceAnimation() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    const loop = (timestamp) => {
      this.animTime = timestamp;
      const hasEntrance = this.engine && this.engine.doors && this.engine.doors.some(d => d.type === 'entry_door' || d.isEntrance);
      if (hasEntrance) {
        this.render();
        this._animReqId = requestAnimationFrame(loop);
      } else {
        this.isAnimating = false;
        this._animReqId = null;
      }
    };
    this._animReqId = requestAnimationFrame(loop);
  }

  getEntranceMarkerMetrics(op, wall, flipY) {
    const wallThick = (wall && wall.thickness) || 240;
    const doorWidth = (op && op.width) || 900;
    const sign = flipY ? 1 : -1;

    // 门扇开启方向判定：在 drawOpeningSymbol 中，未翻转(flipY=false)时门扇向 +y 展开；翻转(flipY=true)时向 -y 展开
    const doorSwingSign = (op && op.flipY) ? -1 : 1;
    const isSameSideAsDoorSwing = (sign === doorSwingSign);

    const chevronSpacing = 160;
    const chevronCount = 2;
    const chevronW = 320;      // 粗大折角箭头展开宽度 (显著放大至 320px)
    const chevronThick = 75;   // 箭头厚度
    const chevronDepth = 95;   // 折角进深

    // 第一枚折角箭头的起始距离 (折角顶点离门最近)
    let arrowStartDist;
    if (isSameSideAsDoorSwing) {
      // 同侧避让：门扇展开扫掠半径为 doorWidth (900~1000mm)
      // 必须彻底跳出门扇开启弧线与门板，第一枚箭头的尖端距离门中心大于 doorWidth + wallThick/2 + 80
      arrowStartDist = doorWidth + wallThick / 2 + chevronDepth + 120;
    } else {
      // 室外迎宾侧：紧凑优雅，第一枚箭头顶点离墙面 100mm
      arrowStartDist = wallThick / 2 + chevronDepth + 100;
    }

    // 第二枚箭头最远底端距离
    const arrowFarDist = arrowStartDist + (chevronCount - 1) * chevronSpacing + chevronDepth;

    // 胶囊徽章尺寸预估：水平文字长条展开约 1160px，由于胶囊跟随文字端正水平放置，法线投影半宽最大为 580px
    const badgeHalfExtent = 580;

    // 胶囊中心距离：严格大于 arrowFarDist + badgeHalfExtent + 80，彻底消除胶囊对箭头的遮盖，保证留出通透呼吸净空！
    let badgeDist = arrowFarDist + badgeHalfExtent + 85;

    // 智能家具避让：检查室内侧是否有家具阻挡，若有则自动平滑外推，绝不与任何室内组件重叠
    if (this.engine && this.engine.furniture && op && wall) {
      const cx = wall.p1.x + op.t * (wall.p2.x - wall.p1.x);
      const cy = wall.p1.y + op.t * (wall.p2.y - wall.p1.y);
      const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

      for (const f of this.engine.furniture) {
        const halfFW = (f.width || 800) / 2 + 80;
        const halfFH = (f.height || 600) / 2 + 80;
        const badgeWorldX = cx - sign * badgeDist * Math.sin(angle);
        const badgeWorldY = cy + sign * badgeDist * Math.cos(angle);
        if (Math.abs(badgeWorldX - f.x) <= halfFW && Math.abs(badgeWorldY - f.y) <= halfFH) {
          const extraPush = Math.hypot(halfFW, halfFH) + 100;
          arrowStartDist += extraPush;
          const newFar = arrowStartDist + (chevronCount - 1) * chevronSpacing + chevronDepth;
          badgeDist = newFar + badgeHalfExtent + 85;
          break;
        }
      }
    }

    return {
      sign,
      dir: -sign, // 箭头尖端朝向门槛
      wallThick,
      doorWidth,
      isSameSideAsDoorSwing,
      chevronCount,
      chevronSpacing,
      chevronW,
      chevronThick,
      chevronDepth,
      arrowStartDist,
      badgeDist
    };
  }

  // 高保真体量感饱满的动态健步小人矢量绘制
  drawWalkingPerson(ctx, x, y, h, animTime, color = '#dc2626') {
    ctx.save();
    ctx.translate(x, y);

    // 步频周期 (连续自然健步迈进)
    const walkCycle = (animTime * 0.007) % (Math.PI * 2);
    // 自然上下起伏呼吸律动
    const bob = Math.abs(Math.sin(walkCycle)) * (h * 0.03);
    ctx.translate(0, -bob);

    const legSwing = Math.sin(walkCycle) * (h * 0.15);
    const armSwing = Math.cos(walkCycle) * (h * 0.14);

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. 头部 (饱满实心大圆)
    const headR = h * 0.13;
    ctx.beginPath();
    ctx.arc(0, -h * 0.34, headR, 0, Math.PI * 2);
    ctx.fill();

    // 2. 躯干 (厚实饱满前倾躯干，充满体量感)
    ctx.lineWidth = h * 0.18;
    ctx.beginPath();
    ctx.moveTo(-h * 0.02, -h * 0.18);
    ctx.lineTo(h * 0.04, h * 0.08);
    ctx.stroke();

    // 3. 手臂 (前后交替有力摆动)
    ctx.lineWidth = h * 0.10;
    // 后臂 (向后摆动)
    ctx.beginPath();
    ctx.moveTo(-h * 0.02, -h * 0.12);
    ctx.lineTo(-h * 0.06 - armSwing * 0.8, -h * 0.02);
    ctx.lineTo(-h * 0.08 - armSwing * 0.9, h * 0.10);
    ctx.stroke();
    // 前臂 (向前挥动)
    ctx.beginPath();
    ctx.moveTo(-h * 0.02, -h * 0.12);
    ctx.lineTo(h * 0.08 + armSwing * 0.85, -h * 0.02);
    ctx.lineTo(h * 0.16 + armSwing * 0.95, h * 0.06);
    ctx.stroke();

    // 4. 双腿 (健步交替大跨步走动)
    ctx.lineWidth = h * 0.12;
    // 后腿 (带蹬地发力感)
    ctx.beginPath();
    ctx.moveTo(h * 0.04, h * 0.08);
    ctx.lineTo(h * 0.01 - legSwing * 0.6, h * 0.28);
    ctx.lineTo(-h * 0.04 - legSwing * 0.95, h * 0.46);
    ctx.stroke();
    // 前腿 (向前跨出健步)
    ctx.beginPath();
    ctx.moveTo(h * 0.04, h * 0.08);
    ctx.lineTo(h * 0.08 + legSwing * 0.65, h * 0.28);
    ctx.lineTo(h * 0.14 + legSwing * 1.05, h * 0.46);
    ctx.stroke();

    ctx.restore();
  }

  drawEntranceMarker(ctx, angle, wallThick, flipY, isHovered = false, op = null, wall = null) {
    const metrics = this.getEntranceMarkerMetrics(op, wall, flipY);
    const {
      sign,
      dir,
      chevronCount,
      chevronSpacing,
      chevronW,
      chevronThick,
      chevronDepth,
      arrowStartDist,
      badgeDist
    } = metrics;
    const now = this.animTime || performance.now();

    ctx.save();

    // 1. 绘制粗大 Chevron 折角引导大箭头（放大至 320px 展开宽，带流光推进动画）
    const animPhase = (now * 0.0055) % (Math.PI * 2);
    for (let i = 0; i < chevronCount; i++) {
      const cy = sign * (arrowStartDist + i * chevronSpacing);
      const wave = Math.sin(animPhase - i * 1.4);
      const alpha = 0.42 + 0.58 * Math.max(0, wave);

      ctx.fillStyle = isHovered 
        ? `rgba(239, 68, 68, ${Math.min(1, alpha + 0.28)})` 
        : `rgba(239, 68, 68, ${alpha})`;
      ctx.shadowColor = isHovered ? 'rgba(239, 68, 68, 0.55)' : 'rgba(239, 68, 68, 0.25)';
      ctx.shadowBlur = isHovered ? 20 : 10;

      ctx.beginPath();
      // 顶点（朝向 dir）
      ctx.moveTo(0, cy + dir * chevronDepth);
      // 左翼尖
      ctx.lineTo(-chevronW / 2, cy - dir * (chevronDepth - chevronThick));
      // 左翼底角
      ctx.lineTo(-chevronW / 2, cy - dir * chevronDepth);
      // 内凹底心
      ctx.lineTo(0, cy - dir * (chevronDepth - chevronThick));
      // 右翼底角
      ctx.lineTo(chevronW / 2, cy - dir * chevronDepth);
      // 右翼尖
      ctx.lineTo(chevronW / 2, cy - dir * (chevronDepth - chevronThick));
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowColor = 'transparent';

    // 2. 绘制外侧主徽章：[ 🚶 动态小人 + 320px 大字“入户” + ⇄ 反转按键 ]
    // 位置严格保证在折角箭头外侧，且在门扇同侧时越过门扇圆弧，绝对零重叠！
    const textDist = sign * badgeDist;
    ctx.save();
    ctx.translate(0, textDist);
    ctx.rotate(-angle); // 保持文字水平端正，易于识别

    const labelText = (window.i18n ? window.i18n.t('door_entrance_label', '入户') : '入户');
    // 与房间名称默认字体一致且放大至 bold 320px
    const labelFont = 'bold 320px "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';
    ctx.font = labelFont;
    const textMetrics = ctx.measureText(labelText);
    const textW = textMetrics.width;

    // 内部各元素宽度规划
    const personAreaW = 200;
    const personH = 280;
    const itemGap = 35;
    const flipIconW = 110;
    const totalInnerW = personAreaW + itemGap + textW + itemGap + flipIconW;

    const badgeW = totalInnerW + 150;
    const badgeH = 420; // 匹配 320px 大字与 280px 饱满小人

    // 胶囊背景与边框
    ctx.fillStyle = isHovered ? 'rgba(254, 242, 242, 0.98)' : 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = isHovered ? '#ef4444' : 'rgba(239, 68, 68, 0.88)';
    ctx.lineWidth = isHovered ? 14 : 10;
    ctx.shadowColor = isHovered ? 'rgba(239, 68, 68, 0.45)' : 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = isHovered ? 25 : 12;

    ctx.beginPath();
    ctx.roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    const startX = -totalInnerW / 2;

    // A. 绘制经典动态行走小人 🚶 (保留且饱满有型)
    const personCenterX = startX + personAreaW / 2;
    this.drawWalkingPerson(ctx, personCenterX, 0, personH, now, isHovered ? '#ef4444' : '#dc2626');

    // B. 绘制 320px 大字“入户”
    const textCenterX = startX + personAreaW + itemGap + textW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#dc2626';
    ctx.fillText(labelText, textCenterX, 0);

    // C. 绘制翻转方向小提示图标 ⇄
    const flipIconCenterX = startX + personAreaW + itemGap + textW + itemGap + flipIconW / 2;
    ctx.font = 'bold 200px sans-serif';
    ctx.fillStyle = isHovered ? '#ef4444' : '#b91c1c';
    ctx.fillText('⇄', flipIconCenterX, 0);

    ctx.restore();
    ctx.restore();
  }

  renderOpeningDistanceBadges(ctx, wall, t, width) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen <= 0) return;
    const halfW = width / 2;
    const s = t * wallLen;
    const s1 = s - halfW;
    const s2 = s + halfW;
    const d1 = Math.round(Math.max(0, s1));
    const d2 = Math.round(Math.max(0, wallLen - s2));

    const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    const nx = -(wall.p2.y - wall.p1.y) / wallLen;
    const ny = (wall.p2.x - wall.p1.x) / wallLen;
    const offset = (wall.thickness || 240) / 2 + 180;

    const ux = (wall.p2.x - wall.p1.x) / wallLen;
    const uy = (wall.p2.y - wall.p1.y) / wallLen;

    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.fillStyle = '#0284c7';
    ctx.lineWidth = 6;
    ctx.font = 'bold 130px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const tick = 40;

    // 1. Distance d1 (from wall.p1 to start jamb)
    if (d1 > 60) {
      const p1_start = { x: wall.p1.x + nx * offset, y: wall.p1.y + ny * offset };
      const p1_end = { x: wall.p1.x + ux * s1 + nx * offset, y: wall.p1.y + uy * s1 + ny * offset };
      ctx.beginPath();
      ctx.moveTo(p1_start.x, p1_start.y);
      ctx.lineTo(p1_end.x, p1_end.y);
      ctx.stroke();

      [p1_start, p1_end].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x - tick, p.y + tick);
        ctx.lineTo(p.x + tick, p.y - tick);
        ctx.stroke();
      });

      const midX = (p1_start.x + p1_end.x) / 2;
      const midY = (p1_start.y + p1_end.y) / 2;
      const text1 = d1 + ' mm';
      const tw1 = ctx.measureText(text1).width;

      ctx.save();
      ctx.translate(midX, midY);
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-tw1/2 - 20, -70, tw1 + 40, 140, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0284c7';
      ctx.fillText(text1, 0, 0);
      ctx.restore();
    }

    // 2. Distance d2 (from end jamb to wall.p2)
    if (d2 > 60) {
      const p2_start = { x: wall.p1.x + ux * s2 + nx * offset, y: wall.p1.y + uy * s2 + ny * offset };
      const p2_end = { x: wall.p2.x + nx * offset, y: wall.p2.y + ny * offset };
      ctx.beginPath();
      ctx.moveTo(p2_start.x, p2_start.y);
      ctx.lineTo(p2_end.x, p2_end.y);
      ctx.stroke();

      [p2_start, p2_end].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x - tick, p.y + tick);
        ctx.lineTo(p.x + tick, p.y - tick);
        ctx.stroke();
      });

      const midX = (p2_start.x + p2_end.x) / 2;
      const midY = (p2_start.y + p2_end.y) / 2;
      const text2 = d2 + ' mm';
      const tw2 = ctx.measureText(text2).width;

      ctx.save();
      ctx.translate(midX, midY);
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-tw2/2 - 20, -70, tw2 + 40, 140, 20);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0284c7';
      ctx.fillText(text2, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  renderOpenings(ctx) {
    const engine = this.engine;
    const allOpenings = [...engine.doors, ...engine.windows];

    for (const op of allOpenings) {
      const wall = engine.walls.find(w => w.id === op.wallId);
      if (!wall) continue;

      const isSelected = this.selectedItem && this.selectedItem.id === op.id;
      const isHovered = this.hoveredItem && this.hoveredItem.id === op.id;

      ctx.save();
      // Calculate center position on wall
      const cx = wall.p1.x + op.t * (wall.p2.x - wall.p1.x);
      const cy = wall.p1.y + op.t * (wall.p2.y - wall.p1.y);
      const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
      const halfW = op.width / 2;
      const wallThick = wall.thickness || 240;

      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // 1. Cut hole in wall (fill background with floor/white)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-halfW, -wallThick/2 - 2, op.width, wallThick + 4);

      // 2. Draw opening symbol (taking flipX & flipY into account)
      ctx.save();
      if (op.flipX) ctx.scale(-1, 1);
      if (op.flipY) ctx.scale(1, -1);
      this.drawOpeningSymbol(ctx, op.type, halfW, wallThick, op.width);
      ctx.restore();

      // Entrance marker (Walking person 🚶 + dashed arrow)
      // 业务解耦：入户方向只由 op.entranceFlipSide 独立决定，绝不使用门扇自身的 flipY
      if (op.type === 'entry_door' || op.isEntrance) {
        const isHoveredMarker = (this.hoveredItem && this.hoveredItem.type === 'entrance_marker' && this.hoveredItem.id === op.id);
        const entrySide = Boolean(op.entranceFlipSide);
        this.drawEntranceMarker(ctx, angle, wallThick, entrySide, isHoveredMarker, op, wall);
      }

      // Highlight box if selected or hovered
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = 20;
        ctx.strokeRect(-halfW - 15, -wallThick/2 - 15, op.width + 30, wallThick + 30);
      }

      // 3. Selection Handles (Jamb resize handles, direction flip button, width badge)
      if (isSelected) {
        const handleR = 45;

        // Left jamb resize handle
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(-halfW, 0, handleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Right jamb resize handle
        ctx.beginPath();
        ctx.arc(halfW, 0, handleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Direction Flip Button (rendered unscaled so text is always crisp & upright)
        const isEnt = (op.type === 'entry_door' || op.isEntrance);
        const flipBtnX = isEnt ? (-halfW - 160) : 0;
        const flipY = -wallThick/2 - 180;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.roundRect(flipBtnX - 140, flipY - 50, 280, 100, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0284c7';
        ctx.font = 'bold 90px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⟲ 翻转方向', flipBtnX, flipY);

        // Opening width badge
        const widthText = Math.round(op.width) + ' mm';
        ctx.font = 'bold 110px sans-serif';
        const wtw = ctx.measureText(widthText).width;
        const badgeY = wallThick/2 + 130;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(-wtw/2 - 25, badgeY - 55, wtw + 50, 110, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(widthText, 0, badgeY);
        ctx.restore();
      }

      ctx.restore();

      // Render live distance badges to wall corners
      if (isSelected || isHovered) {
        this.renderOpeningDistanceBadges(ctx, wall, op.t, op.width);
      }
    }
  }

  renderFurniture(ctx) {
    const engine = this.engine;
    for (const f of engine.furniture) {
      const isSelected = this.selectedItem && this.selectedItem.type === 'furniture' && this.selectedItem.id === f.id;
      const isHovered = this.hoveredItem && this.hoveredItem.type === 'furniture' && this.hoveredItem.id === f.id;

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rotation * Math.PI / 180);
      if (f.flipH) ctx.scale(-1, 1);
      if (f.flipV) ctx.scale(1, -1);

      const catalogItem = typeof FURNITURE_CATALOG !== 'undefined' ? FURNITURE_CATALOG.find(it => it.id === f.type) : null;
      const img = this.imageCache.get(f.type);

      // In color mode: render realistic contact drop shadow
      if (this.renderMode === 'color' && f.category !== 'structure') {
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
        ctx.shadowBlur = 36;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 20;
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -f.width/2, -f.height/2, f.width, f.height);
        } else {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
          ctx.fillRect(-f.width/2, -f.height/2, f.width, f.height);
        }
        ctx.restore();
      }

      // In color mode: render realistic top-down texture from 3DNest CDN
      if (this.renderMode === 'color' && img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -f.width/2, -f.height/2, f.width, f.height);
      } else if (catalogItem && catalogItem.draw) {
        // Architectural CAD vector representation
        catalogItem.draw(ctx, f.width, f.height, this.renderMode === 'color');
      } else {
        // Fallback box
        ctx.fillStyle = this.renderMode === 'color' ? '#e2e8f0' : '#ffffff';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-f.width/2, -f.height/2, f.width, f.height);
        ctx.strokeRect(-f.width/2, -f.height/2, f.width, f.height);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.name || '家具', 0, 40);
      }

      // Highlight border & transform handles when selected
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#0284c7' : '#38bdf8';
        ctx.lineWidth = 25;
        const halfW = f.width / 2 + 20;
        const halfH = f.height / 2 + 20;
        ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

        if (isSelected) {
          // 1. Rotation handle & dedicated Rotate Button (独立旋转按钮)
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.moveTo(0, -halfH);
          ctx.lineTo(0, -halfH - 220);
          ctx.stroke();

          // Outer button circle
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 14;
          ctx.beginPath();
          ctx.arc(0, -halfH - 220, 75, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Circular rotating arrow icon inside button
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.arc(0, -halfH - 220, 42, -Math.PI * 0.7, Math.PI * 0.85, false);
          ctx.stroke();
          // Arrow tip
          const tipAngle = Math.PI * 0.85;
          const arrowX = 42 * Math.cos(tipAngle);
          const arrowY = -halfH - 220 + 42 * Math.sin(tipAngle);
          ctx.fillStyle = '#0284c7';
          ctx.beginPath();
          ctx.moveTo(arrowX - 25, arrowY - 10);
          ctx.lineTo(arrowX + 25, arrowY + 10);
          ctx.lineTo(arrowX - 5, arrowY + 35);
          ctx.closePath();
          ctx.fill();

          // Text tag above rotate button
          ctx.font = 'bold 90px "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.fillStyle = '#0284c7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('⟲ 旋转', 0, -halfH - 310);

          // 2. 8-direction Resize handles (边缘尺寸调节控点)
          const handleR = 50;
          const handles = [
            [-halfW, -halfH], [0, -halfH], [halfW, -halfH],
            [halfW, 0], [halfW, halfH], [0, halfH],
            [-halfW, halfH], [-halfW, 0]
          ];

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 14;

          handles.forEach(([hx, hy]) => {
            ctx.beginPath();
            ctx.arc(hx, hy, handleR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });

          // 3. Size badge below furniture
          const sizeText = `${Math.round(f.width)} × ${Math.round(f.height)} mm`;
          ctx.font = 'bold 120px sans-serif';
          const tw = ctx.measureText(sizeText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.beginPath();
          ctx.roundRect(-tw/2 - 30, halfH + 40, tw + 60, 160, 20);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(sizeText, 0, halfH + 115);
        }
      }

      ctx.restore();
    }
  }

  renderDimensions(ctx) {
    const engine = this.engine;

    // 生成户型图（导出 / 预览）时：采用外侧尺寸链标注，墙体长度统一放在户型图外侧
    if (this.showDimensionsAlways) {
      this.renderExteriorDimensions(ctx);
    }

    ctx.save();
    ctx.font = 'bold 240px "Segoe UI", -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const w of engine.walls) {
      if (w.type === 'virtual') continue;

      // 画布本身不需要标注墙体长度，仅在绘制或选中/悬停墙体时显示做参考
      const isSelected = this.selectedItem && (this.selectedItem.id === w.id || (this.selectedItem.wall && this.selectedItem.wall.id === w.id));
      const isHovered = this.hoveredItem && (this.hoveredItem.id === w.id || (this.hoveredItem.wall && this.hoveredItem.wall.id === w.id));
      if (!isSelected && !isHovered) {
        continue;
      }

      const dx = w.p2.x - w.p1.x;
      const dy = w.p2.y - w.p1.y;
      const len = Math.hypot(dx, dy);
      if (len < 100) continue;

      const mx = (w.p1.x + w.p2.x) / 2;
      const my = (w.p1.y + w.p2.y) / 2;
      const angle = Math.atan2(dy, dx);
      const nx = -dy / len;
      const ny = dx / len;
      const offset = (w.thickness / 2) + 260;

      const dimP1 = { x: w.p1.x + nx * offset, y: w.p1.y + ny * offset };
      const dimP2 = { x: w.p2.x + nx * offset, y: w.p2.y + ny * offset };

      // Dimension line
      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : '#0284c7';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(dimP1.x, dimP1.y);
      ctx.lineTo(dimP2.x, dimP2.y);
      ctx.stroke();

      // Tick slashes (45 deg)
      const tick = 70;
      [dimP1, dimP2].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x - tick, p.y + tick);
        ctx.lineTo(p.x + tick, p.y - tick);
        ctx.stroke();
      });

      // Text label
      const textX = (dimP1.x + dimP2.x) / 2;
      const textY = (dimP1.y + dimP2.y) / 2;
      const text = Math.round(len).toString();

      ctx.save();
      ctx.translate(textX, textY);
      // Keep text readable (not upside down)
      let textAngle = angle;
      if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) {
        textAngle += Math.PI;
      }
      ctx.rotate(textAngle);

      // Pill backdrop for readability
      const metrics = ctx.measureText(text);
      const bw = metrics.width + 120;
      const bh = 240;

      ctx.fillStyle = this.renderMode === 'cad' ? '#ffffff' : 'rgba(255, 255, 255, 0.96)';
      ctx.beginPath();
      ctx.roundRect(-bw/2, -bh/2, bw, bh, 24);
      ctx.fill();

      ctx.strokeStyle = this.renderMode === 'cad' ? '#000000' : 'rgba(2, 132, 199, 0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = this.renderMode === 'cad' ? '#000000' : '#0284c7';
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- 外侧尺寸链标注（参考标准户型图：上下左右四边，墙体长度全部标注在户型外侧） ---
  getExteriorDimensionData() {
    const walls = (this.engine.walls || []).filter(w => w.type !== 'virtual');
    if (walls.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxThick = 0;
    for (const w of walls) {
      minX = Math.min(minX, w.p1.x, w.p2.x); maxX = Math.max(maxX, w.p1.x, w.p2.x);
      minY = Math.min(minY, w.p1.y, w.p2.y); maxY = Math.max(maxY, w.p1.y, w.p2.y);
      maxThick = Math.max(maxThick, w.thickness || 240);
    }
    if (maxX - minX < 100 || maxY - minY < 100) return null;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const top = [minX, maxX], bottom = [minX, maxX], left = [minY, maxY], right = [minY, maxY];
    for (const w of walls) {
      const dx = Math.abs(w.p2.x - w.p1.x), dy = Math.abs(w.p2.y - w.p1.y);
      if (dx < 30 && dy > 100) {
        // 竖向墙体：在上/下尺寸链中提供分段点
        const x = (w.p1.x + w.p2.x) / 2;
        if (Math.min(w.p1.y, w.p2.y) < cy) top.push(x);
        if (Math.max(w.p1.y, w.p2.y) > cy) bottom.push(x);
      } else if (dy < 30 && dx > 100) {
        // 横向墙体：在左/右尺寸链中提供分段点
        const y = (w.p1.y + w.p2.y) / 2;
        if (Math.min(w.p1.x, w.p2.x) < cx) left.push(y);
        if (Math.max(w.p1.x, w.p2.x) > cx) right.push(y);
      }
    }
    const uniq = arr => {
      const s = arr.map(v => Math.round(v)).sort((a, b) => a - b);
      const out = [];
      for (const v of s) if (out.length === 0 || v - out[out.length - 1] > 150) out.push(v);
      return out;
    };
    return { minX, minY, maxX, maxY, maxThick, top: uniq(top), bottom: uniq(bottom), left: uniq(left), right: uniq(right) };
  }

  renderExteriorDimensions(ctx) {
    const d = this.getExteriorDimensionData();
    if (!d) return;
    const isCad = this.renderMode === 'cad';
    const lineColor = isCad ? '#000000' : '#64748b';
    const textColor = isCad ? '#000000' : '#1e293b';
    const outer = d.maxThick / 2;     // 外墙外缘距中心线
    const gap1 = outer + 800;         // 第一道：分段尺寸
    const gap2 = outer + 1400;        // 第二道：总尺寸
    const extStart = outer + 200;     // 尺寸界线起点（离墙留白）
    const tick = 110;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.font = '210px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';

    // side: 'top' | 'bottom' | 'left' | 'right'
    const drawChain = (side, positions, gap, drawExt) => {
      if (positions.length < 2) return;
      const horiz = side === 'top' || side === 'bottom';
      const sign = (side === 'top' || side === 'left') ? -1 : 1;
      const base = horiz ? (sign < 0 ? d.minY : d.maxY) : (sign < 0 ? d.minX : d.maxX);
      const lineAt = base + sign * gap;
      const P = (along, across) => horiz ? { x: along, y: across } : { x: across, y: along };

      ctx.strokeStyle = lineColor;

      // 尺寸线
      ctx.lineWidth = 10;
      const a = P(positions[0], lineAt), b = P(positions[positions.length - 1], lineAt);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

      for (const pos of positions) {
        // 尺寸界线（从墙外侧引出）
        if (drawExt) {
          ctx.lineWidth = 6;
          const e1 = P(pos, base + sign * extStart), e2 = P(pos, lineAt + sign * 120);
          ctx.beginPath(); ctx.moveTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.stroke();
        }
        // 端点短竖线
        ctx.lineWidth = 12;
        const t1 = P(pos, lineAt - tick), t2 = P(pos, lineAt + tick);
        ctx.beginPath(); ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y); ctx.stroke();
      }

      // 数字（位于尺寸线外侧）
      ctx.fillStyle = textColor;
      for (let i = 0; i < positions.length - 1; i++) {
        const len = positions[i + 1] - positions[i];
        if (len < 250) continue;
        const mid = (positions[i] + positions[i + 1]) / 2;
        const tp = P(mid, lineAt + sign * 60);
        ctx.save();
        ctx.translate(tp.x, tp.y);
        if (!horiz) ctx.rotate(sign < 0 ? -Math.PI / 2 : Math.PI / 2);
        // 文字始终位于尺寸线外侧：底边用 top 基线，其余（含旋转后的左右两边）用 bottom 基线
        ctx.textBaseline = side === 'bottom' ? 'top' : 'bottom';
        ctx.fillText(String(Math.round(len)), 0, 0);
        ctx.restore();
      }
    };

    drawChain('top', d.top, gap1, true);
    drawChain('bottom', d.bottom, gap1, true);
    drawChain('left', d.left, gap1, true);
    drawChain('right', d.right, gap1, true);

    // 第二道总尺寸（仅当分段多于一段时）
    if (d.top.length > 2) drawChain('top', [d.minX, d.maxX], gap2, false);
    if (d.bottom.length > 2) drawChain('bottom', [d.minX, d.maxX], gap2, false);
    if (d.left.length > 2) drawChain('left', [d.minY, d.maxY], gap2, false);
    if (d.right.length > 2) drawChain('right', [d.minY, d.maxY], gap2, false);

    ctx.restore();
  }

  renderRoomLabels(ctx) {
    const engine = this.engine;
    ctx.save();
    for (const r of engine.rooms) {
      if (!r.center) continue;
      const rx = (r.labelPos ? r.labelPos.x : r.center.x);
      const ry = (r.labelPos ? r.labelPos.y : r.center.y);

      // Draw dashed leader line if label has been dragged away from geometric center
      if (r.labelPos && FloorPlanEngine.dist(r.labelPos, r.center) > 350) {
        ctx.save();
        ctx.strokeStyle = this.renderMode === 'color' ? 'rgba(2, 132, 199, 0.55)' : 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 20]);
        ctx.beginPath();
        ctx.moveTo(r.center.x, r.center.y);
        ctx.lineTo(rx, ry);
        ctx.stroke();

        ctx.fillStyle = this.renderMode === 'color' ? '#0284c7' : '#000000';
        ctx.beginPath();
        ctx.arc(r.center.x, r.center.y, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const rawName = r.name || '房间';
      const name = (window.i18n ? window.i18n.translateRoomName(rawName) : rawName);
      const areaVal = r.area ? r.area.toFixed(2) : '0.00';
      const areaText = (window.i18n ? window.i18n.formatRoomArea(areaVal) : `约${areaVal}㎡`);

      ctx.save();
      ctx.translate(rx, ry);

      const isSelected = this.selectedItem && (this.selectedItem.type === 'room' || this.selectedItem.type === 'room_label') && this.selectedItem.id === r.id;
      const isHovered = this.hoveredItem && (this.hoveredItem.type === 'room_label' || this.hoveredItem.type === 'room') && this.hoveredItem.id === r.id;

      // Two-line typography matching reference image media_1793939946993_ff0d8941.jpg
      const nameFont = 'bold 320px "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';
      const areaFont = '500 230px "PingFang SC", "Microsoft YaHei", -apple-system, sans-serif';

      ctx.font = nameFont;
      const nameW = ctx.measureText(name).width;
      ctx.font = areaFont;
      const areaW = ctx.measureText(areaText).width;

      const boxW = Math.max(nameW, areaW) + 260;
      const boxH = 680;
      r._labelWidth = boxW;
      r._labelHeight = boxH;

      // When hovered or selected, show subtle drag/selection bounding capsule
      if (isSelected || isHovered) {
        ctx.save();
        ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.08)' : 'rgba(241, 245, 249, 0.75)';
        ctx.strokeStyle = isSelected ? '#0284c7' : 'rgba(148, 163, 184, 0.6)';
        ctx.lineWidth = isSelected ? 8 : 4;
        ctx.beginPath();
        ctx.roundRect(-boxW/2, -boxH/2, boxW, boxH, 24);
        ctx.fill();
        ctx.stroke();

        // Draggable grip dots
        ctx.fillStyle = isSelected ? '#0284c7' : '#94a3b8';
        ctx.font = 'bold 200px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⠿', -boxW/2 + 65, 0);
        ctx.restore();
      }

      // Line 1: Room Name (centered horizontally at y = -120)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.renderMode === 'cad' ? '#000000' : '#0f172a';
      ctx.font = nameFont;
      ctx.fillText(name, 0, -120);

      // Line 2: Area (centered horizontally at y = +130)
      ctx.fillStyle = this.renderMode === 'cad' ? '#333333' : '#334155';
      ctx.font = areaFont;
      ctx.fillText(areaText, 0, 130);

      ctx.restore();
    }
    ctx.restore();
  }

  // --- Dynamic Coordinate Axis & Ruler (比例尺) ---
  renderRuler(ctx) {
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const vp = this.engine.viewport;
    const rulerSize = 24;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Pure screen coordinates

    // Top ruler background
    ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
    ctx.fillRect(0, 0, w, rulerSize);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerSize);
    ctx.lineTo(w, rulerSize);
    ctx.stroke();

    // Left ruler background
    ctx.fillStyle = 'rgba(248, 250, 252, 0.95)';
    ctx.fillRect(0, 0, rulerSize, h);
    ctx.beginPath();
    ctx.moveTo(rulerSize, 0);
    ctx.lineTo(rulerSize, h);
    ctx.stroke();

    // Corner box (0,0)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, rulerSize, rulerSize);
    ctx.strokeStyle = '#94a3b8';
    ctx.strokeRect(0, 0, rulerSize, rulerSize);

    // Calculate step in world coordinates
    const rawStep = 80 / vp.zoom; // in mm
    let step = 1000; // default 1m
    if (rawStep <= 200) step = 200;
    else if (rawStep <= 500) step = 500;
    else if (rawStep <= 1000) step = 1000;
    else if (rawStep <= 2000) step = 2000;
    else if (rawStep <= 5000) step = 5000;
    else step = 10000;

    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;

    // Top ruler tick marks
    const startWorldX = Math.floor(this.engine.screenToWorld(rulerSize, 0).x / step) * step;
    const endWorldX = Math.ceil(this.engine.screenToWorld(w, 0).x / step) * step;

    for (let wx = startWorldX; wx <= endWorldX; wx += step) {
      const sx = this.engine.worldToScreen(wx, 0).x;
      if (sx < rulerSize || sx > w) continue;
      ctx.beginPath();
      ctx.moveTo(sx, rulerSize - 8);
      ctx.lineTo(sx, rulerSize);
      ctx.stroke();

      const label = Math.abs(wx) >= 1000 ? `${wx / 1000}m` : `${wx}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, sx, 3);
    }

    // Left ruler tick marks
    const startWorldY = Math.floor(this.engine.screenToWorld(0, rulerSize).y / step) * step;
    const endWorldY = Math.ceil(this.engine.screenToWorld(0, h).y / step) * step;

    for (let wy = startWorldY; wy <= endWorldY; wy += step) {
      const sy = this.engine.worldToScreen(0, wy).y;
      if (sy < rulerSize || sy > h) continue;
      ctx.beginPath();
      ctx.moveTo(rulerSize - 8, sy);
      ctx.lineTo(rulerSize, sy);
      ctx.stroke();

      const label = Math.abs(wy) >= 1000 ? `${wy / 1000}m` : `${wy}`;
      ctx.save();
      ctx.translate(3, sy);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  renderDrawingFeedback(ctx) {
    // 1. Active Drawing Line
    if (this.activeDrawLine) {
      const { p1, p2 } = this.activeDrawLine;
      const dist = Math.round(FloorPlanEngine.dist(p1, p2));
      const angle = (FloorPlanEngine.angle(p1, p2) * 180 / Math.PI).toFixed(1);

      const previewThick = (this.activeDrawLine && this.activeDrawLine.thickness) || (this.engine && this.engine.defaultWallThickness) || 240;
      ctx.save();
      // 实体建筑墙体厚度预览（外墙承重墙 240mm 深墨色，内隔墙 120mm）
      ctx.strokeStyle = (this.activeDrawLine.type === 'normal' || previewThick <= 120) ? 'rgba(30, 41, 59, 0.85)' : '#0f172a';
      ctx.lineWidth = previewThick; // 临摹时实时显示 240mm 承重墙全厚度
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // 居中轴线指示线 (蓝色高亮)
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = Math.min(24, previewThick / 8);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Dimension bubble at midpoint
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      const text = `${dist} mm | ${angle}°`;
      ctx.font = 'bold 160px sans-serif';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(mx - tw/2 - 40, my - 140, tw + 80, 240, 30);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, mx, my - 20);
      ctx.restore();
    }

    // 1b. Active Drawing Rectangle Room
    if (this.activeDrawRect) {
      const { p1, p2, thickness = 240 } = this.activeDrawRect;
      const x1 = Math.min(p1.x, p2.x);
      const x2 = Math.max(p1.x, p2.x);
      const y1 = Math.min(p1.y, p2.y);
      const y2 = Math.max(p1.y, p2.y);
      const w = x2 - x1;
      const h = y2 - y1;
      const area = ((w * h) / 1000000).toFixed(1);

      ctx.save();
      // Translucent preview fill
      ctx.fillStyle = 'rgba(2, 132, 199, 0.12)';
      ctx.fillRect(x1, y1, w, h);

      // 4 Wall outlines with thickness preview
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = thickness;
      ctx.strokeRect(x1, y1, w, h);

      // Outer dashed guide
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 14;
      ctx.setLineDash([60, 40]);
      ctx.strokeRect(x1 - thickness/2, y1 - thickness/2, w + thickness, h + thickness);
      ctx.setLineDash([]);

      // Top Dimension Badge (Width)
      if (w > 300) {
        const topText = `${Math.round(w)} mm`;
        ctx.font = 'bold 140px sans-serif';
        const tw = ctx.measureText(topText).width;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect((x1 + x2)/2 - tw/2 - 30, y1 - thickness/2 - 180, tw + 60, 150, 24);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(topText, (x1 + x2)/2, y1 - thickness/2 - 105);
      }

      // Left Dimension Badge (Height)
      if (h > 300) {
        const leftText = `${Math.round(h)} mm`;
        ctx.font = 'bold 140px sans-serif';
        const th = ctx.measureText(leftText).width;
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.roundRect(x1 - thickness/2 - th - 90, (y1 + y2)/2 - 75, th + 60, 150, 24);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(leftText, x1 - thickness/2 - th/2 - 60, (y1 + y2)/2);
      }

      // Center Area Badge
      const centerText = `矩形建房 · ${area} ㎡`;
      ctx.font = 'bold 160px "PingFang SC", "Microsoft YaHei", sans-serif';
      const cw = ctx.measureText(centerText).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect((x1 + x2)/2 - cw/2 - 40, (y1 + y2)/2 - 90, cw + 80, 180, 30);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(centerText, (x1 + x2)/2, (y1 + y2)/2);

      ctx.restore();
    }

    // 2. Alignment Guide Lines (支持多条水平/垂直对齐吸附参考线与源点指示)
    const guides = this.alignmentGuides && this.alignmentGuides.length > 0
      ? this.alignmentGuides
      : (this.alignmentGuide ? [this.alignmentGuide] : []);

    if (guides.length > 0) {
      ctx.save();
      for (const g of guides) {
        if (g.kind === 'ortho') continue; // 正交绘制线已有 activeDrawLine
        const isFlush = g.kind === 'flush';
        ctx.strokeStyle = isFlush ? '#0284c7' : '#f97316';
        ctx.lineWidth = isFlush ? 14 : 10;
        ctx.setLineDash(isFlush ? [120, 60] : [80, 50]);
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();

        // 在对齐参考源点处绘制靶心圆点
        ctx.setLineDash([]);
        ctx.fillStyle = isFlush ? '#0284c7' : '#f97316';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(g.x1, g.y1, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 绘制悬停持平提示标签
        if (g.label) {
          const midX = (g.x1 + g.x2) / 2;
          const midY = (g.y1 + g.y2) / 2;
          const badgeText = `🧲 ${g.label}`;
          ctx.font = 'bold 110px "PingFang SC", "Microsoft YaHei", sans-serif';
          const tw = ctx.measureText(badgeText).width;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.beginPath();
          ctx.roundRect(midX - tw / 2 - 25, midY - 65, tw + 50, 130, 20);
          ctx.fill();
          ctx.strokeStyle = isFlush ? '#38bdf8' : '#fb923c';
          ctx.lineWidth = 6;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, midX, midY);
        }
      }
      ctx.restore();
    }

    // 3. Snap Point Marker (吸附点磁吸反馈指示)
    if (this.snapIndicator) {
      ctx.save();
      const isVertex = this.snapIndicator.type === 'vertex';
      const isWall = this.snapIndicator.type === 'wall';
      const isFlush = this.snapIndicator.type === 'flush';
      const snapColor = isFlush ? '#0284c7' : (isVertex ? '#22c55e' : (isWall ? '#06b6d4' : '#f97316'));

      // 外光晕圈
      ctx.fillStyle = isFlush ? 'rgba(2, 132, 199, 0.25)' : (isVertex ? 'rgba(34, 197, 94, 0.25)' : 'rgba(6, 182, 212, 0.25)');
      ctx.beginPath();
      ctx.arc(this.snapIndicator.x, this.snapIndicator.y, 90, 0, Math.PI * 2);
      ctx.fill();

      // 实心双色吸附靶心
      ctx.fillStyle = snapColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.arc(this.snapIndicator.x, this.snapIndicator.y, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 4. Furniture rotation orthogonal magnetic hover feedback (物品旋转垂直/水平悬停磁吸反馈)
    if (this.rotationSnapInfo) {
      const rinfo = this.rotationSnapInfo;
      ctx.save();
      const rayLen = 4000;
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 14;
      ctx.setLineDash([100, 60]);
      ctx.beginPath();
      if (rinfo.isHorizontal) {
        ctx.moveTo(rinfo.x - rayLen, rinfo.y);
        ctx.lineTo(rinfo.x + rayLen, rinfo.y);
      } else {
        ctx.moveTo(rinfo.x, rinfo.y - rayLen);
        ctx.lineTo(rinfo.x, rinfo.y + rayLen);
      }
      ctx.stroke();

      // 中心磁吸光晕环
      ctx.fillStyle = 'rgba(2, 132, 199, 0.22)';
      ctx.beginPath();
      ctx.arc(rinfo.x, rinfo.y, 160, 0, Math.PI * 2);
      ctx.fill();

      // 悬停提示气泡
      const badgeText = `🧲 ${rinfo.type} (${rinfo.angle}°)`;
      ctx.font = 'bold 130px "PingFang SC", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(badgeText).width;
      const fH = rinfo.item ? (rinfo.item.height || 800) : 800;
      const badgeY = rinfo.y - (fH / 2 + 320);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(rinfo.x - tw / 2 - 30, badgeY - 80, tw + 60, 160, 24);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, rinfo.x, badgeY);
      ctx.restore();
    }

    // 5. Drag Ghost Preview for Opening and Furniture
    if (this.dragGhost) {
      this.renderDragGhost(ctx);
    }
  }

  renderDragGhost(ctx) {
    const ghost = this.dragGhost;
    if (!ghost) return;

    if (ghost.type === 'furniture' && ghost.item) {
      ctx.save();
      ctx.translate(ghost.x, ghost.y);
      if (ghost.rotation) {
        ctx.rotate((ghost.rotation || 0) * Math.PI / 180);
      }
      ctx.globalAlpha = 0.88;

      const img = this.imageCache.get(ghost.item.id);
      if (this.renderMode === 'color' && img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, -ghost.width/2, -ghost.height/2, ghost.width, ghost.height);
      } else if (ghost.item.draw) {
        ghost.item.draw(ctx, ghost.width, ghost.height, this.renderMode === 'color');
      }

      // Drag preview bounding box & size badge
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 20;
      ctx.setLineDash([40, 30]);
      ctx.strokeRect(-ghost.width/2 - 15, -ghost.height/2 - 15, ghost.width + 30, ghost.height + 30);
      ctx.setLineDash([]);

      const sizeText = `${ghost.item.name || '家具'} (${Math.round(ghost.width)} × ${Math.round(ghost.height)} mm) · 单击放置 · R旋转`;
      ctx.font = 'bold 130px "PingFang SC", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(sizeText).width;
      ctx.fillStyle = 'rgba(2, 132, 199, 0.9)';
      ctx.beginPath();
      ctx.roundRect(-tw/2 - 35, ghost.height/2 + 30, tw + 70, 160, 24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sizeText, 0, ghost.height/2 + 110);
      ctx.restore();
    } else if (ghost.type === 'opening') {
      if (ghost.wall) {
        const wall = ghost.wall;
        const cx = wall.p1.x + ghost.t * (wall.p2.x - wall.p1.x);
        const cy = wall.p1.y + ghost.t * (wall.p2.y - wall.p1.y);
        const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
        const halfW = ghost.width / 2;
        const wallThick = wall.thickness || 240;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);

        // Preview cut hole
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-halfW, -wallThick/2 - 4, ghost.width, wallThick + 8);

        // Preview outline
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 22;
        ctx.setLineDash([40, 30]);
        ctx.strokeRect(-halfW - 15, -wallThick/2 - 15, ghost.width + 30, wallThick + 30);
        ctx.setLineDash([]);

        // Preview opening symbol (with flip)
        ctx.save();
        if (ghost.flipX) ctx.scale(-1, 1);
        if (ghost.flipY) ctx.scale(1, -1);
        this.drawOpeningSymbol(ctx, ghost.opType, halfW, wallThick, ghost.width);
        ctx.restore();

        // Preview entrance marker in ghost
        if (ghost.opType === 'entry_door' || ghost.isEntrance) {
          const entrySide = Boolean(ghost.entranceFlipSide);
          this.drawEntranceMarker(ctx, angle, wallThick, entrySide, false);
        }

        ctx.restore();

        // Preview distance badges to corners
        this.renderOpeningDistanceBadges(ctx, wall, ghost.t, ghost.width);
      } else if (ghost.x !== undefined && ghost.y !== undefined) {
        ctx.save();
        ctx.translate(ghost.x, ghost.y);
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 14;
        ctx.strokeRect(-450, -120, 900, 240);

        ctx.fillStyle = 'rgba(2, 132, 199, 0.88)';
        ctx.beginPath();
        ctx.roundRect(-450, 160, 900, 160, 24);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 120px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('移动至墙体放置门窗 · ESC取消', 0, 240);
        ctx.restore();
      }
    }
  }

  renderCompass(ctx) {
    const cx = this.width - 70;
    const cy = 70;
    const r = 32;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((this.engine.compass.angle || 0) * Math.PI / 180);

    // Compass dial circle
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // North Needle (Red)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -r + 6);
    ctx.lineTo(-7, 2);
    ctx.lineTo(0, -3);
    ctx.closePath();
    ctx.fill();

    // South Needle (Dark slate)
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(0, r - 6);
    ctx.lineTo(7, -2);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();

    // "N" Label
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 0, -r + 2);

    ctx.restore();
  }

  renderCalibrationFeedback(ctx) {
    ctx.save();
    for (let i = 0; i < this.calibrationPoints.length; i++) {
      const pt = this.calibrationPoints[i];
      const scr = this.engine.worldToScreen(pt.x, pt.y);

      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i === 0 ? 'A' : 'B', scr.x, scr.y);
    }

    if (this.calibrationPoints.length === 2) {
      const p1 = this.engine.worldToScreen(this.calibrationPoints[0].x, this.calibrationPoints[0].y);
      const p2 = this.engine.worldToScreen(this.calibrationPoints[1].x, this.calibrationPoints[1].y);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FloorPlanRenderer };
}
