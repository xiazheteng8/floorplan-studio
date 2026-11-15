/**
 * High-Resolution Floorplan Exporter (PNG / JPG / SVG / JSON)
 */
class FloorPlanExporter {
  constructor(engine, renderer = null) {
    this.engine = engine;
    this.renderer = renderer;
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
      title = '户型图'
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

    // 核心修复：同步主渲染器已加载的高清逼真家具贴图与纹理，确保下载导出与主画布实物模型完全一致！
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
    const specsTmpl = t('dl_specs_area', '建筑/套内面积: ~{area} ㎡  |  绘制日期: {date}');
    const specsText = specsTmpl.replace('{area}', areaVal).replace('{date}', dateStr);
    ctx.fillStyle = '#64748b';
    ctx.font = `${Math.round(canvasWidth * 0.013)}px "PingFang SC", sans-serif`;
    ctx.fillText(specsText, titleX, canvasHeight * 0.085);

    // Architectural CAD Compass (参考户型标准图例：圆环 + 黑白实心北向指针 + 上方N字母)
    if (showCompass) {
      const crX = canvasWidth * 0.055;
      const crY = canvasHeight * 0.082;
      const crR = canvasWidth * 0.022;

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
      ctx.rotate((this.engine.compass.angle || 0) * Math.PI / 180);

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
      ctx.lineTo(0, crR * 0.15);
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

  // Download Image File (PNG or JPG)
  downloadImage(format = 'png', options = {}) {
    const canvas = this.generateImageCanvas(options);
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.92 : 1.0;
    const ext = format === 'jpg' ? 'jpg' : 'png';

    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${options.title || '户型图'}_${options.style || 'color'}_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, mimeType, quality);
  }

  // Export as Pure Vector SVG File
  exportSVG(options = {}) {
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
    URL.revokeObjectURL(url);
  }

  // Export JSON Project File
  exportJSON(title = '户型工程') {
    const data = {
      title,
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
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
    URL.revokeObjectURL(url);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FloorPlanExporter };
}
