/**
 * 3DNest FloorPlan Studio - 1:1 Official Replicated Application Controller
 */
class FloorPlanApp {
  constructor() {
    this.engine = new FloorPlanEngine();
    this.canvas = document.getElementById('mainCanvas');
    this.renderer = new FloorPlanRenderer(this.canvas, this.engine);
    this.exporter = new FloorPlanExporter(this.engine, this.renderer);

    // Tools & interaction state
    this.currentTool = 'select'; // 'select', 'move', 'draw_wall', 'draw_rect', 'delete'
    this.currentSidebarTab = 'draw';
    this.currentWallType = 'bearing';
    this.currentWallThickness = 240;
    this.renderer.activeTab = 'draw';
    this.renderer.renderMode = 'color';
    this.pendingOpeningType = null;
    this.pendingComponentType = null;
    this.pendingFurnitureItem = null;
    this.isMouseDown = false;
    this.isPanning = false;
    this.isSpacePressed = false;
    this.dragStart = { x: 0, y: 0 };
    this.panStart = { x: 0, y: 0 };

    // Drawing state
    this.wallDrawStart = null;
    this.rectDrawStart = null;
    this.draggingItem = null;
    this.dragItemOffset = { x: 0, y: 0 };
    this.activeTransform = null; // { mode: 'resize'|'rotate', handle, item, startW, startH, ... }
    this.isMovingAll = false;
    this.moveAllStart = { x: 0, y: 0 };

    // Scale calibration state
    this.isCalibrating = false;
    this.calibrationStep = 0;
    this.calibA = null;
    this.calibB = null;

    // Active rotate tab
    this.activeRotateTab = 'floorplan'; // 'floorplan' or 'bitmap'

    // Empty state card visibility control (仅在新建户型和初次打开时允许显示)
    this.allowEmptyStateCard = true;

    // Interactive onboarding tour
    this.initTour();

    this.init();
  }

  init() {
    if (window.i18n) {
      window.i18n.applyTranslations();
      document.title = window.i18n.t('app_title', '瞎折腾吧户型绘制工具');
    }
    this.setupWindowShortcuts();
    this.setupCanvasEvents();
    this.setupMenuEvents();
    this.setupSidebarEvents();
    this.setupBottomToolEvents();
    this.setupModalEvents();
    this.setupCompassInteraction();
    this.populateFurnitureCatalog();
    this.startAutoSave();

    // Initial resize & render
    window.addEventListener('resize', () => this.renderer.resize());
    setTimeout(() => {
      this.renderer.resize();
      this.loadDemoHouse();
      this.checkEmptyState();
    }, 100);

    // 初次使用网站时自动打开试用引导 (若尚未标记展示过)
    try {
      const tourShown = localStorage.getItem('floorplan_tour_shown');
      if (!tourShown) {
        setTimeout(() => {
          this.startTour(0);
        }, 600);
      }
    } catch (e) {
      console.warn('Tour check error:', e);
    }
  }

  startAutoSave() {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = setInterval(() => {
      this.autoSave();
    }, 10000);
  }

  autoSave() {
    try {
      this.engine.saveCurrentFloorState();
      const projectData = {
        title: (document.getElementById('projectTitle')?.textContent || '').trim() || '未命名户型',
        targetArea: this.engine.targetArea,
        currentFloor: this.engine.currentFloor,
        floors: this.engine.floors,
        compass: this.engine.compass,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('floorplan_autosave_data', JSON.stringify(projectData));

      const indicator = document.getElementById('autoSaveIndicator');
      if (indicator) {
        const d = new Date();
        const timeStr = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        indicator.textContent = `已自动保存 ${timeStr}`;
        indicator.style.color = '#10b981';
      }
    } catch (e) {
      console.warn("AutoSave failed:", e);
    }
  }

  // --- Keyboard Shortcuts (左手人体工学键位: Q墙体, W房间, E选择, A单开门, S双开门, D推拉门, F窗户, Z垭口) ---
  setupWindowShortcuts() {
    window.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return;
      }

      // Ctrl shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.openDownloadModal();
        return;
      }

      // 空格: 画布居中
      if (e.code === 'Space') {
        e.preventDefault();
        this.zoomToFit();
        return;
      }

      // 回车: 确认当前工具或弹窗
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmCurrentAction();
        return;
      }

      // < 或 , : 逆时针旋转
      if (e.key === '<' || e.key === ',' || (e.shiftKey && e.key === '<')) {
        e.preventDefault();
        this.rotateSelectedOrFloorplan(-1);
        return;
      }

      // > 或 . : 顺时针旋转
      if (e.key === '>' || e.key === '.' || (e.shiftKey && e.key === '>')) {
        e.preventDefault();
        this.rotateSelectedOrFloorplan(1);
        return;
      }

      // - : 缩小
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        this.engine.viewport.zoom = Math.max(0.015, this.engine.viewport.zoom * 0.88);
        document.getElementById('vpZoomRatio').textContent = Math.round(this.engine.viewport.zoom * 800) + '%';
        this.renderer.render();
        return;
      }

      // + : 放大
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.engine.viewport.zoom = Math.min(1.5, this.engine.viewport.zoom * 1.15);
        document.getElementById('vpZoomRatio').textContent = Math.round(this.engine.viewport.zoom * 800) + '%';
        this.renderer.render();
        return;
      }

      // 方向键快捷键：上下左右移动选中的摆件 (1px, Ctrl+方向键 10px, Shift+方向键 贴墙摆放)
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
          const furn = this.engine.furniture.find(f => f.id === this.renderer.selectedItem.id);
          if (furn) {
            e.preventDefault();
            const zoom = this.engine.viewport.zoom || 0.1;
            if (e.shiftKey) {
              // Shift + 方向键：向该方向最近的墙体贴墙摆放
              let dir = 'up';
              if (e.key === 'ArrowDown') dir = 'down';
              else if (e.key === 'ArrowLeft') dir = 'left';
              else if (e.key === 'ArrowRight') dir = 'right';
              this.snapFurnitureToNearestWall(furn, dir);
            } else {
              // 方向键移动 1 像素点，Ctrl + 方向键移动 10 像素点 (转换为世界坐标毫米: px / zoom)
              const pixelStep = (e.ctrlKey || e.metaKey) ? 10 : 1;
              const worldStep = pixelStep / zoom;
              if (e.key === 'ArrowUp') furn.y -= worldStep;
              else if (e.key === 'ArrowDown') furn.y += worldStep;
              else if (e.key === 'ArrowLeft') furn.x -= worldStep;
              else if (e.key === 'ArrowRight') furn.x += worldStep;
            }
            this.syncPropertyCardFurnitureInputs(furn);
            this.engine.saveCurrentFloorState();
            this.engine.recordHistory();
            this.renderer.render();
            return;
          }
        }
      }

      const key = e.key.toLowerCase();

      if (key === 'q') {
        // Q: 墙体
        this.setTool('draw_wall');
      } else if (key === 'w') {
        // W: 房间 (矩形建房)
        this.setTool('draw_rect');
      } else if (key === 'e' || key === 'v') {
        // E / V: 选择
        this.setTool('select');
      } else if (key === 'a') {
        // A: 单开门
        this.selectOpeningForPlacement('single_door');
      } else if (key === 's') {
        // S: 双开门
        this.selectOpeningForPlacement('double_door');
      } else if (key === 'd') {
        // D: 推拉门
        this.selectOpeningForPlacement('sliding_door');
      } else if (key === 'f') {
        // F: 窗户 (若当前已选中门窗则翻转，否则切至窗户放置)
        if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'opening') {
          e.preventDefault();
          if (e.shiftKey) this.flipOpening('Y');
          else this.flipOpening('X');
        } else {
          this.selectOpeningForPlacement('window');
        }
      } else if (key === 'z') {
        // Z: 垭口
        this.selectOpeningForPlacement('opening');
      } else if (key === 'm') {
        // M: 移动户型图
        this.setTool('move');
      } else if (key === 'r') {
        // R: 旋转跟随中的家具摆件或当前选中的摆件
        if (this.renderer.dragGhost && this.renderer.dragGhost.type === 'furniture') {
          e.preventDefault();
          this.renderer.dragGhost.rotation = ((this.renderer.dragGhost.rotation || 0) + 90) % 360;
          this.renderer.render();
        } else if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
          e.preventDefault();
          const f = this.engine.furniture.find(item => item.id === this.renderer.selectedItem.id);
          if (f) {
            f.rotation = ((f.rotation || 0) + 90) % 360;
            this.engine.recordHistory();
            this.updateSelectionPropertyCard(this.renderer.selectedItem);
            this.renderer.render();
          }
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
      } else if (e.key === 'Escape') {
        this.cancelActiveOperation();
      }
    });

    window.addEventListener('keyup', e => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.canvas.parentElement.classList.remove('cursor-panning');
      }
    });

    // Close floating popovers when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('#btnMenuRotate') && !e.target.closest('#panelRotate')) {
        document.getElementById('panelRotate').classList.remove('open');
      }
      if (!e.target.closest('#btnMenuScale') && !e.target.closest('#panelScale')) {
        document.getElementById('panelScale').classList.remove('open');
      }
      if (!e.target.closest('#toolVisible') && !e.target.closest('#popoverVisible')) {
        document.getElementById('popoverVisible').classList.remove('open');
      }
      if (!e.target.closest('#toolBeautify') && !e.target.closest('#popoverBeautify')) {
        document.getElementById('popoverBeautify').classList.remove('open');
      }
      if (!e.target.closest('#storeyWidget') && !e.target.closest('#panelStoreyManager') && !e.target.closest('#modalCopyFloorTo')) {
        const psm = document.getElementById('panelStoreyManager');
        if (psm) psm.style.display = 'none';
        const sw = document.getElementById('storeyWidget');
        if (sw) sw.classList.remove('active');
      }
      if (!e.target.closest('#btnLangDropdown') && !e.target.closest('#panelLangDropdown')) {
        const pld = document.getElementById('panelLangDropdown');
        if (pld) pld.classList.remove('open');
      }
    });
  }

  confirmCurrentAction() {
    const modalInfo = document.getElementById('modalProjectInfo');
    if (modalInfo && modalInfo.style.display !== 'none') {
      this.confirmProjectInfo(false);
      return;
    }
    const modalDl = document.getElementById('modalDownload');
    if (modalDl && modalDl.style.display !== 'none') {
      this.downloadCard('color');
      return;
    }
    if (this.currentTool === 'draw_wall' && this.wallDrawStart) {
      this.wallDrawStart = null;
      this.renderer.activeDrawLine = null;
      this.setTool('select');
      this.renderer.render();
      return;
    }
    if (this.currentTool === 'draw_rect' && this.rectDrawStart) {
      this.rectDrawStart = null;
      this.renderer.activeDrawRect = null;
      this.setTool('select');
      this.renderer.render();
      return;
    }
    this.openDownloadModal();
  }

  rotateSelectedOrFloorplan(dir = 1) {
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
      const f = this.engine.furniture.find(it => it.id === this.renderer.selectedItem.id);
      if (f) {
        f.rotation = (f.rotation + dir * 15 + 360) % 360;
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        this.engine.recordHistory();
        this.renderer.render();
        return;
      }
    }
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'opening') {
      this.flipOpening('X');
      return;
    }
    this.quickRotate(dir * 90);
  }

  // --- Canvas Interaction Pipeline ---
  setupCanvasEvents() {
    const canvas = this.canvas;
    canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
    window.addEventListener('mousemove', e => this.handleMouseMove(e));
    window.addEventListener('mouseup', e => this.handleMouseUp(e));
    canvas.addEventListener('wheel', e => this.handleWheel(e), { passive: false });

    // Double-click to directly edit room name
    canvas.addEventListener('dblclick', e => {
      const { sx, sy } = this.getCanvasCoords(e);
      const worldPt = this.engine.screenToWorld(sx, sy);
      for (const r of this.engine.rooms) {
        if (r.polygon && FloorPlanEngine.isPointInPolygon(worldPt, r.polygon)) {
          this.startInlineRoomNameEdit(r);
          return;
        }
      }
    });

    // Right-click: prevent browser context menu & cancel current tool, switch to Select
    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.cancelActiveOperation();
    });
    canvas.parentElement.addEventListener('contextmenu', e => {
      e.preventDefault();
      this.cancelActiveOperation();
    });

    // Drag and drop blueprint, furniture & opening onto canvas
    const handleDragOver = e => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

      const { sx, sy } = this.getCanvasCoords(e);
      const worldPt = this.engine.screenToWorld(sx, sy);

      let dragItem = this.draggingSidebarItem;
      if (!dragItem && e.dataTransfer) {
        try {
          const raw = e.dataTransfer.getData('application/json');
          if (raw) dragItem = JSON.parse(raw);
        } catch (err) {}
      }

      if (dragItem) {
        if (dragItem.type === 'opening') {
          // Snap opening to nearest wall within tolerance
          let minD = Infinity;
          let targetWall = null;
          let projT = 0.5;
          for (const w of this.engine.walls) {
            const proj = FloorPlanEngine.projectPointToSegment(worldPt, w.p1, w.p2);
            if (proj.dist < minD) {
              minD = proj.dist;
              targetWall = w;
              projT = proj.t;
            }
          }

          let defaultW = 900;
          const opType = dragItem.opType;
          if (['double_door', 'sliding_door', 'bay_window', 'french_window'].includes(opType)) defaultW = 1500;
          if (opType === 'opening') defaultW = 2000;
          if (opType === 'doorway') defaultW = 1200;

          if (targetWall && minD < (targetWall.thickness || 240) + 600) {
            const wallLen = Math.hypot(targetWall.p2.x - targetWall.p1.x, targetWall.p2.y - targetWall.p1.y);
            const halfWRatio = (defaultW / 2) / wallLen;
            projT = Math.max(Math.min(0.5, halfWRatio), Math.min(Math.max(0.5, 1 - halfWRatio), projT));

            const dx = targetWall.p2.x - targetWall.p1.x;
            const dy = targetWall.p2.y - targetWall.p1.y;
            const yLocal = ((worldPt.y - targetWall.p1.y) * dx - (worldPt.x - targetWall.p1.x) * dy) / (wallLen || 1);
            const flipY = (opType === 'bay_window') ? (yLocal > 0) : (yLocal < 0);

            this.renderer.dragGhost = {
              type: 'opening',
              opType,
              wall: targetWall,
              t: projT,
              width: defaultW,
              flipY: flipY
            };
          } else {
            this.renderer.dragGhost = {
              type: 'opening',
              opType,
              wall: null,
              x: worldPt.x,
              y: worldPt.y,
              width: defaultW,
              flipY: false
            };
          }
          this.renderer.render();
        } else if (dragItem.type === 'furniture') {
          const catItem = FURNITURE_CATALOG.find(it => it.id === dragItem.id);
          if (catItem) {
            this.renderer.dragGhost = {
              type: 'furniture',
              item: catItem,
              x: worldPt.x,
              y: worldPt.y,
              width: catItem.width,
              height: catItem.height
            };
            this.renderer.render();
          }
        }
      }
    };

    const handleDragLeave = e => {
      this.renderer.dragGhost = null;
      this.renderer.render();
    };

    canvas.addEventListener('dragover', handleDragOver);
    canvas.addEventListener('dragleave', handleDragLeave);
    canvas.addEventListener('drop', e => this.handleCanvasDrop(e));
    canvas.parentElement.addEventListener('dragover', handleDragOver);
    canvas.parentElement.addEventListener('dragleave', handleDragLeave);
    canvas.parentElement.addEventListener('drop', e => this.handleCanvasDrop(e));

    // Compass dial rotation
    const compassDial = document.getElementById('compassDial');
    if (compassDial) {
      compassDial.onclick = () => {
        this.engine.compass.angle = (this.engine.compass.angle + 45) % 360;
        const needleGroup = document.getElementById('compassNeedleGroup');
        if (needleGroup) needleGroup.setAttribute('transform', `rotate(${this.engine.compass.angle} 28 38)`);
        this.renderer.render();
      };
    }
  }

  handleCanvasDrop(e) {
    if (e.preventDefault) e.preventDefault();

    let dragData = this.draggingSidebarItem;
    if (!dragData && e.dataTransfer) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.loadBlueprintFile(e.dataTransfer.files[0]);
        this.renderer.dragGhost = null;
        this.draggingSidebarItem = null;
        return null;
      }
      try {
        const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text');
        if (raw) dragData = JSON.parse(raw);
      } catch (err) {}
    }

    const { sx, sy } = this.getCanvasCoords(e);
    const worldPt = this.engine.screenToWorld(sx, sy);

    if (dragData) {
      if (dragData.type === 'furniture' && dragData.id) {
        const furn = this.engine.addFurniture(dragData.id, Math.round(worldPt.x), Math.round(worldPt.y));
        this.setTool('select');
        this.renderer.dragGhost = null;
        this.draggingSidebarItem = null;
        this.renderer.selectedItem = { type: 'furniture', id: furn.id, obj: furn };
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        this.renderer.render();
        return furn;
      } else if (dragData.type === 'opening' && dragData.opType) {
        // Find nearest wall
        let minD = Infinity;
        let targetWall = null;
        let projT = 0.5;
        for (const w of this.engine.walls) {
          const proj = FloorPlanEngine.projectPointToSegment(worldPt, w.p1, w.p2);
          if (proj.dist < minD) {
            minD = proj.dist;
            targetWall = w;
            projT = proj.t;
          }
        }

        let defaultW = 900;
        const opType = dragData.opType;
        if (['double_door', 'sliding_door', 'bay_window', 'french_window'].includes(opType)) defaultW = 1500;
        if (opType === 'opening') defaultW = 2000;
        if (opType === 'doorway') defaultW = 1200;

        if (targetWall && minD < (targetWall.thickness || 240) + 800) {
          const wallLen = Math.hypot(targetWall.p2.x - targetWall.p1.x, targetWall.p2.y - targetWall.p1.y);
          const halfWRatio = (defaultW / 2) / wallLen;
          projT = Math.max(Math.min(0.5, halfWRatio), Math.min(Math.max(0.5, 1 - halfWRatio), projT));

          const dx = targetWall.p2.x - targetWall.p1.x;
          const dy = targetWall.p2.y - targetWall.p1.y;
          const yLocal = ((worldPt.y - targetWall.p1.y) * dx - (worldPt.x - targetWall.p1.x) * dy) / (wallLen || 1);
          const flipY = (opType === 'bay_window') ? (yLocal > 0) : (yLocal < 0);

          const op = this.engine.addOpening(opType, targetWall.id, projT, defaultW);
          op.flipY = flipY;
          if (opType === 'entry_door') {
            this.engine.doors.forEach(d => { d.isEntrance = false; });
            op.isEntrance = true;
          }

          this.setTool('select');
          this.renderer.dragGhost = null;
          this.draggingSidebarItem = null;
          this.renderer.selectedItem = { type: 'opening', id: op.id, obj: op };
          this.updateSelectionPropertyCard(this.renderer.selectedItem);
          this.renderer.render();
          return op;
        }
      }
    }

    this.renderer.dragGhost = null;
    this.draggingSidebarItem = null;
    this.renderer.render();
    return null;
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top
    };
  }

  handleMouseDown(e) {
    const { sx, sy } = this.getCanvasCoords(e);
    const worldPt = this.engine.screenToWorld(sx, sy);

    // Right click (button === 2): start canvas pan, if drag distance is tiny on mouseUp it cancels tool
    if (e.button === 2) {
      e.preventDefault();
      this.isRightMouseDown = true;
      this.rightDownScreen = { x: sx, y: sy };
      this.isPanning = true;
      this.panStart = { x: sx - this.engine.viewport.x, y: sy - this.engine.viewport.y };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    this.isMouseDown = true;
    this.dragStart = { x: sx, y: sy };

    if (this.renderer.floorPreviewMode) {
      if (this.currentTool !== 'select' || this.pendingOpeningType || this.pendingFurnitureItem || this.pendingComponentType) {
        this.renderer.floorPreviewMode = false;
      }
    }

    // Pan with Space or middle click
    if (this.isSpacePressed || e.button === 1) {
      this.isPanning = true;
      this.panStart = { x: sx - this.engine.viewport.x, y: sy - this.engine.viewport.y };
      return;
    }

    // Scale calibration mode
    if (this.isCalibrating) {
      this.handleCalibrationClick(worldPt);
      return;
    }

    // Placing pending furniture (Click to pick, follow mouse, click to place)
    if (this.pendingFurnitureItem) {
      this.placePendingFurniture(worldPt);
      return;
    }

    // Placing pending opening (door / window)
    if (this.pendingOpeningType) {
      this.placePendingOpening(worldPt);
      return;
    }

    // Placing pending component (pillar)
    if (this.pendingComponentType) {
      this.placePendingComponent(worldPt);
      return;
    }

    // Check if clicking on resize or flip handle of currently selected opening
    if (this.currentTool === 'select' && this.renderer.selectedItem && this.renderer.selectedItem.type === 'opening') {
      const op = this.engine.doors.concat(this.engine.windows).find(d => d.id === this.renderer.selectedItem.id);
      if (op) {
        const wall = this.engine.walls.find(w => w.id === op.wallId);
        const handle = this.getOpeningHandleAt(worldPt, op);
        if (handle === 'flip') {
          this.flipOpening('X');
          return;
        } else if (handle === 'left_jamb' || handle === 'right_jamb') {
          this.activeTransform = {
            mode: 'resize_opening',
            handle: handle,
            op: op,
            wall: wall,
            startW: op.width,
            startT: op.t
          };
          return;
        } else if (handle === 'body') {
          this.draggingItem = {
            type: 'opening',
            id: op.id,
            obj: op,
            wall: wall
          };
          return;
        }
      }
    }

    // Check if clicking on resize or rotate handle of currently selected furniture
    if (this.currentTool === 'select' && this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
      const furn = this.engine.furniture.find(f => f.id === this.renderer.selectedItem.id);
      if (furn) {
        const handle = this.getFurnitureHandleAt(worldPt, furn);
        if (handle) {
          if (handle === 'rotate') {
            this.activeTransform = {
              mode: 'rotate',
              item: furn,
              startAngle: furn.rotation || 0,
              startPointerAngle: Math.atan2(worldPt.y - furn.y, worldPt.x - furn.x) * 180 / Math.PI,
              startClient: { x: e.clientX, y: e.clientY },
              hasDragged: false
            };
          } else {
            this.activeTransform = {
              mode: 'resize',
              handle: handle,
              item: furn,
              startW: furn.width,
              startH: furn.height,
              startX: furn.x,
              startY: furn.y,
              rad: (furn.rotation || 0) * Math.PI / 180
            };
          }
          return;
        }
      }
    }

    // Tool: Move entire floorplan (移动户型图)
    if (this.currentTool === 'move') {
      this.isMovingAll = true;
      this.moveAllStart = { x: worldPt.x, y: worldPt.y };
      return;
    }

    // Tool: Draw Wall
    if (this.currentTool === 'draw_wall') {
      const snapped = this.engine.snapPoint(worldPt, this.wallDrawStart);
      if (!this.wallDrawStart) {
        this.wallDrawStart = { x: snapped.x, y: snapped.y };
        this.wallChainStart = { x: snapped.x, y: snapped.y };
      } else {
        const prevRoomCount = this.engine.rooms.length;
        const w = this.engine.addWall(this.wallDrawStart, snapped, this.currentWallThickness, this.currentWallType);
        if (w) {
          this.engine.splitWallsAtIntersections();
          this.engine.syncRoomsWithWalls();
          this.engine.autoDetectRooms();
          this.engine.enforceOuterWallRules();
          this.checkEmptyState();
          // 回到起点、围合出新房间或搭接到已有墙体/端点并形成分割时，自动结束本次连续画墙，保持在画墙模式方便继续画下一道墙
          const cs = this.wallChainStart;
          const closedChain = cs && Math.hypot(snapped.x - cs.x, snapped.y - cs.y) < 1;
          const formedNewRoom = this.engine.rooms.length > prevRoomCount;
          if (closedChain || formedNewRoom || snapped.type === 'wall') {
            this.wallDrawStart = null;
            this.wallChainStart = null;
            this.renderer.activeDrawLine = null;
            this.renderer.alignmentGuide = null;
            this.renderer.alignmentGuides = [];
          } else {
            this.wallDrawStart = { x: snapped.x, y: snapped.y };
          }
        }
      }
      this.renderer.render();
      return;
    }

    // Tool: Draw Rect Room
    if (this.currentTool === 'draw_rect') {
      const snapped = this.engine.snapPoint(worldPt);
      if (!this.rectDrawStart) {
        this.rectDrawStart = { x: snapped.x, y: snapped.y };
      } else {
        const dist = Math.hypot(snapped.x - this.rectDrawStart.x, snapped.y - this.rectDrawStart.y);
        if (dist > 400) {
          this.engine.addRectangularRoom(this.rectDrawStart, snapped, this.currentWallThickness, this.currentWallType);
          this.checkEmptyState();
        }
        this.rectDrawStart = null;
        this.renderer.activeDrawRect = null;
        this.renderer.activeDrawLine = null;
        this.setTool('select');
        this.renderer.render();
      }
      return;
    }

    // Tool: Select
    if (this.currentTool === 'select') {
      const hit = this.hitTest(worldPt);
      this.renderer.selectedItem = hit;
      this.updateSelectionPropertyCard(hit);

      if (hit && hit.type === 'entrance_marker') {
        const op = hit.obj;
        // 关键业务解耦：仅反转独立的入户进门方向，绝对不修改门扇本身的 flipY / flipX 开闭朝向
        op.entranceFlipSide = !op.entranceFlipSide;
        this.engine.saveCurrentFloorState();
        this.engine.recordHistory();
        this.renderer.selectedItem = { type: 'opening', id: op.id, obj: op };
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        this.renderer.render();
        const toastMsg = window.i18n ? window.i18n.t('toast_entrance_flipped', '🔄 已切换入户方向') : '🔄 已切换入户方向';
        if (typeof this.showToast === 'function') {
          this.showToast(toastMsg);
        }
        return;
      }

      if (hit && hit.type === 'wall_endpoint') {
        this.renderer.selectedItem = { type: 'wall', id: hit.wall.id, obj: hit.wall };
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        const targetPt = { x: hit.pt.x, y: hit.pt.y };
        const connectedWalls = [];
        const connectedWallIds = new Set();
        const connectedRooms = [];
        for (const other of this.engine.walls) {
          if (FloorPlanEngine.dist(other.p1, targetPt) < 160) {
            connectedWalls.push({ wall: other, key: 'p1', orig: { x: other.p1.x, y: other.p1.y } });
            connectedWallIds.add(other.id);
          }
          if (FloorPlanEngine.dist(other.p2, targetPt) < 160) {
            connectedWalls.push({ wall: other, key: 'p2', orig: { x: other.p2.x, y: other.p2.y } });
            connectedWallIds.add(other.id);
          }
        }
        // 仅收集使用了该墙角的房间顶点 (Strictly only rooms that have this corner vertex)
        for (const r of this.engine.rooms) {
          if (r.polygon) {
            for (let i = 0; i < r.polygon.length; i++) {
              if (FloorPlanEngine.dist(r.polygon[i], targetPt) < 160) {
                connectedRooms.push({ room: r, index: i, orig: { x: r.polygon[i].x, y: r.polygon[i].y } });
              }
            }
          }
        }
        const connectedOpenings = this.engine.doors.concat(this.engine.windows)
          .filter(op => connectedWallIds.has(op.wallId))
          .map(op => {
            const ow = this.engine.walls.find(w => w.id === op.wallId);
            return {
              op,
              wallId: op.wallId,
              worldCenter: ow ? {
                x: ow.p1.x + op.t * (ow.p2.x - ow.p1.x),
                y: ow.p1.y + op.t * (ow.p2.y - ow.p1.y)
              } : null
            };
          });

        this.draggingItem = {
          type: 'wall_endpoint',
          wall: hit.wall,
          pointKey: hit.pointKey,
          connected: connectedWalls,
          connectedWallIds,
          connectedRooms,
          connectedOpenings,
          startPt: targetPt
        };
      } else if (hit && hit.type === 'wall') {
        this.renderer.selectedItem = hit;
        this.updateSelectionPropertyCard(hit);
        const w = hit.obj;
        // Simplify collinear vertices on straight room edges before starting wall drag
        for (const r of this.engine.rooms) {
          if (r.polygon && r.polygon.length >= 3) {
            r.polygon = FloorPlanEngine.simplifyCollinearPolygon(r.polygon);
          }
        }
        const isHorizontal = Math.abs(w.p2.x - w.p1.x) >= Math.abs(w.p2.y - w.p1.y);
        this.draggingItem = {
          type: 'wall_body',
          wallId: w.id,
          wall: w,
          isHorizontal,
          startMouse: { x: worldPt.x, y: worldPt.y },
          origWall: { p1: { x: w.p1.x, y: w.p1.y }, p2: { x: w.p2.x, y: w.p2.y } },
          origWalls: this.engine.walls.map(item => ({
            id: item.id,
            p1: { x: item.p1.x, y: item.p1.y },
            p2: { x: item.p2.x, y: item.p2.y }
          })),
          origRooms: this.engine.rooms.map(r => ({
            id: r.id,
            polygon: r.polygon ? r.polygon.map(pt => ({ x: pt.x, y: pt.y })) : []
          })),
          origOpenings: this.engine.doors.concat(this.engine.windows).map(op => {
            const ow = this.engine.walls.find(item => item.id === op.wallId);
            return {
              op,
              wallId: op.wallId,
              origT: op.t,
              worldCenter: ow ? {
                x: ow.p1.x + op.t * (ow.p2.x - ow.p1.x),
                y: ow.p1.y + op.t * (ow.p2.y - ow.p1.y)
              } : null
            };
          })
        };
      } else if (hit && hit.type === 'room_label') {
        const r = hit.obj;
        this.renderer.selectedItem = hit;
        this.updateSelectionPropertyCard(hit);
        this.draggingItem = {
          type: 'room_label',
          room: r,
          startMouse: { x: worldPt.x, y: worldPt.y },
          startPos: { x: (r.labelPos ? r.labelPos.x : r.center.x), y: (r.labelPos ? r.labelPos.y : r.center.y) },
          hasMoved: false
        };
      } else if (hit && hit.type === 'room') {
        this.renderer.selectedItem = hit;
        this.updateSelectionPropertyCard(hit);
        // Inline edit room name on click
        const r = hit.obj;
        if (r && r.center) {
          const distToCenter = FloorPlanEngine.dist(worldPt, r.center);
          if (distToCenter < 1400) {
            this.startInlineRoomNameEdit(r);
          }
        }
      } else if (hit && hit.type === 'opening') {
        const op = hit.obj;
        const wall = this.engine.walls.find(w => w.id === op.wallId);
        this.draggingItem = { type: 'opening', id: op.id, obj: op, wall: wall };
      } else if (hit && (hit.type === 'furniture' || hit.type === 'blueprint')) {
        this.draggingItem = hit;
        if (hit.type === 'furniture') {
          const furn = this.engine.furniture.find(f => f.id === hit.id);
          if (furn) {
            this.dragItemOffset = { x: worldPt.x - furn.x, y: worldPt.y - furn.y };
          }
        } else if (hit.type === 'blueprint' && !this.engine.blueprint.locked) {
          this.dragItemOffset = { x: worldPt.x - this.engine.blueprint.x, y: worldPt.y - this.engine.blueprint.y };
        }
      }
      this.renderer.render();
    }
  }

  handleMouseMove(e) {
    const { sx, sy } = this.getCanvasCoords(e);
    const worldPt = this.engine.screenToWorld(sx, sy);

    if (this.isPanning) {
      this.engine.viewport.x = sx - this.panStart.x;
      this.engine.viewport.y = sy - this.panStart.y;
      this.renderer.render();
      return;
    }

    // --- 0. Pending Placement Follow-Mouse Mode (点击后跟随鼠标移动，再次点击放置) ---
    if (!this.isMouseDown) {
      if (this.pendingFurnitureItem) {
        const catItem = this.pendingFurnitureItem;
        const prevRot = (this.renderer.dragGhost && this.renderer.dragGhost.rotation) || 0;
        const dummyFurn = { width: catItem.width, height: catItem.height, rotation: prevRot };
        const snapped = (!e.altKey) ? this.snapFurnitureToWalls(dummyFurn, worldPt.x, worldPt.y) : { x: worldPt.x, y: worldPt.y };
        this.renderer.dragGhost = {
          type: 'furniture',
          item: catItem,
          x: Math.round(snapped.x),
          y: Math.round(snapped.y),
          width: catItem.width,
          height: catItem.height,
          rotation: prevRot
        };
        this.renderer.alignmentGuide = snapped.guide || null;
        this.renderer.render();
        return;
      }

      if (this.pendingComponentType) {
        const catItem = FURNITURE_CATALOG.find(it => it.id === this.pendingComponentType);
        const w = catItem ? catItem.width : 400;
        const h = catItem ? catItem.height : 400;
        const prevRot = (this.renderer.dragGhost && this.renderer.dragGhost.rotation) || 0;
        const dummyFurn = { width: w, height: h, rotation: prevRot };
        const snapped = (!e.altKey) ? this.snapFurnitureToWalls(dummyFurn, worldPt.x, worldPt.y) : { x: worldPt.x, y: worldPt.y };
        this.renderer.dragGhost = {
          type: 'furniture',
          item: catItem || { id: this.pendingComponentType, name: '构件', width: w, height: h },
          x: Math.round(snapped.x),
          y: Math.round(snapped.y),
          width: w,
          height: h,
          rotation: prevRot
        };
        this.renderer.alignmentGuide = snapped.guide || null;
        this.renderer.render();
        return;
      }

      if (this.pendingOpeningType) {
        let minD = Infinity;
        let targetWall = null;
        let projT = 0.5;

        for (const w of this.engine.walls) {
          const proj = FloorPlanEngine.projectPointToSegment(worldPt, w.p1, w.p2);
          if (proj.dist < minD) {
            minD = proj.dist;
            targetWall = w;
            projT = proj.t;
          }
        }

        let defaultW = 900;
        const opType = this.pendingOpeningType;
        if (['double_door', 'sliding_door', 'bay_window', 'french_window'].includes(opType)) defaultW = 1500;
        if (opType === 'opening') defaultW = 2000;
        if (opType === 'doorway') defaultW = 1200;

        if (targetWall && minD < (targetWall.thickness || 240) + 700) {
          const wallLen = Math.hypot(targetWall.p2.x - targetWall.p1.x, targetWall.p2.y - targetWall.p1.y);
          const halfWRatio = (defaultW / 2) / wallLen;
          projT = Math.max(Math.min(0.5, halfWRatio), Math.min(Math.max(0.5, 1 - halfWRatio), projT));

          const dx = targetWall.p2.x - targetWall.p1.x;
          const dy = targetWall.p2.y - targetWall.p1.y;
          const yLocal = ((worldPt.y - targetWall.p1.y) * dx - (worldPt.x - targetWall.p1.x) * dy) / (wallLen || 1);
          const flipY = (opType === 'bay_window') ? (yLocal > 0) : (yLocal < 0);

          this.renderer.dragGhost = {
            type: 'opening',
            opType,
            wall: targetWall,
            t: projT,
            width: defaultW,
            flipY: flipY
          };
        } else {
          this.renderer.dragGhost = {
            type: 'opening',
            opType,
            wall: null,
            x: worldPt.x,
            y: worldPt.y,
            width: defaultW,
            flipY: false
          };
        }
        this.renderer.render();
        return;
      }
    }

    // Active transform: resize opening
    if (this.isMouseDown && this.activeTransform && this.activeTransform.mode === 'resize_opening') {
      const { handle, op, wall, startW, startT } = this.activeTransform;
      if (wall) {
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        const proj = FloorPlanEngine.projectPointToSegment(worldPt, wall.p1, wall.p2);

        if (handle === 'left_jamb') {
          const fixedRightS = startT * wallLen + startW / 2;
          const curLeftS = Math.max(0, Math.min(fixedRightS - 300, proj.t * wallLen));
          const newW = fixedRightS - curLeftS;
          const newCenterS = (curLeftS + fixedRightS) / 2;
          op.width = Math.round(newW);
          op.t = newCenterS / wallLen;
        } else if (handle === 'right_jamb') {
          const fixedLeftS = startT * wallLen - startW / 2;
          const curRightS = Math.min(wallLen, Math.max(fixedLeftS + 300, proj.t * wallLen));
          const newW = curRightS - fixedLeftS;
          const newCenterS = (fixedLeftS + curRightS) / 2;
          op.width = Math.round(newW);
          op.t = newCenterS / wallLen;
        }
        const editOpW = document.getElementById('editOpW');
        if (editOpW && document.activeElement !== editOpW) editOpW.value = op.width;
        this.renderer.render();
      }
      return;
    }

    // Active transform: resize or rotate furniture
    if (this.isMouseDown && this.activeTransform) {
      if (this.activeTransform.mode === 'rotate') {
        const startC = this.activeTransform.startClient || { x: e.clientX, y: e.clientY };
        if (Math.hypot(e.clientX - startC.x, e.clientY - startC.y) > 5) {
          this.activeTransform.hasDragged = true;
        }
        const f = this.activeTransform.item;
        const currentPointerAngle = Math.atan2(worldPt.y - f.y, worldPt.x - f.x) * 180 / Math.PI;
        let deltaAngle = currentPointerAngle - this.activeTransform.startPointerAngle;
        let rawRot = (this.activeTransform.startAngle + deltaAngle) % 360;
        if (rawRot < 0) rawRot += 360;

        let finalRot = Math.round(rawRot);
        let snappedOrthogonal = false;

        // 水平与垂直正交磁吸悬停 (0°, 90°, 180°, 270°)
        const snapThreshold = 7; // ±7度吸附悬停阈值
        const orthoAngles = [
          { target: 0, label: '水平对齐', isHoriz: true },
          { target: 90, label: '垂直对齐', isHoriz: false },
          { target: 180, label: '水平对齐', isHoriz: true },
          { target: 270, label: '垂直对齐', isHoriz: false },
          { target: 360, label: '水平对齐', isHoriz: true }
        ];

        for (const o of orthoAngles) {
          const diff = Math.abs(rawRot - o.target);
          if (diff <= snapThreshold) {
            finalRot = o.target % 360;
            snappedOrthogonal = true;
            this.renderer.rotationSnapInfo = {
              x: f.x,
              y: f.y,
              angle: finalRot,
              type: o.label,
              isHorizontal: o.isHoriz,
              item: f
            };
            break;
          }
        }

        if (!snappedOrthogonal) {
          this.renderer.rotationSnapInfo = null;
          if (e.shiftKey) {
            finalRot = Math.round(finalRot / 15) * 15;
          }
        }

        f.rotation = finalRot;
        this.syncPropertyCardFurnitureInputs(f);
        this.renderer.render();
        return;
      }

      if (this.activeTransform.mode === 'resize') {
        const { handle, item: f, startW, startH, startX, startY, rad } = this.activeTransform;
        const dx = worldPt.x - startX;
        const dy = worldPt.y - startY;
        const cos = Math.cos(-rad);
        const sin = Math.sin(-rad);
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;

        const hW = startW / 2;
        const hH = startH / 2;

        let newW = startW;
        let newH = startH;
        let localDeltaCenterX = 0;
        let localDeltaCenterY = 0;

        if (handle === 'e') {
          newW = Math.max(200, Math.round(lx + hW));
          localDeltaCenterX = (newW - startW) / 2;
        } else if (handle === 'w') {
          newW = Math.max(200, Math.round(hW - lx));
          localDeltaCenterX = -(newW - startW) / 2;
        } else if (handle === 's') {
          newH = Math.max(200, Math.round(ly + hH));
          localDeltaCenterY = (newH - startH) / 2;
        } else if (handle === 'n') {
          newH = Math.max(200, Math.round(hH - ly));
          localDeltaCenterY = -(newH - startH) / 2;
        } else if (handle === 'se') {
          newW = Math.max(200, Math.round(lx + hW));
          newH = Math.max(200, Math.round(ly + hH));
          localDeltaCenterX = (newW - startW) / 2;
          localDeltaCenterY = (newH - startH) / 2;
        } else if (handle === 'sw') {
          newW = Math.max(200, Math.round(hW - lx));
          newH = Math.max(200, Math.round(ly + hH));
          localDeltaCenterX = -(newW - startW) / 2;
          localDeltaCenterY = (newH - startH) / 2;
        } else if (handle === 'ne') {
          newW = Math.max(200, Math.round(lx + hW));
          newH = Math.max(200, Math.round(hH - ly));
          localDeltaCenterX = (newW - startW) / 2;
          localDeltaCenterY = -(newH - startH) / 2;
        } else if (handle === 'nw') {
          newW = Math.max(200, Math.round(hW - lx));
          newH = Math.max(200, Math.round(hH - ly));
          localDeltaCenterX = -(newW - startW) / 2;
          localDeltaCenterY = -(newH - startH) / 2;
        }

        const worldDeltaX = localDeltaCenterX * Math.cos(rad) - localDeltaCenterY * Math.sin(rad);
        const worldDeltaY = localDeltaCenterX * Math.sin(rad) + localDeltaCenterY * Math.cos(rad);

        f.width = newW;
        f.height = newH;
        f.x = Math.round(startX + worldDeltaX);
        f.y = Math.round(startY + worldDeltaY);

        this.syncPropertyCardFurnitureInputs(f);
        this.renderer.render();
        return;
      }
    }

    // Move all elements
    if (this.isMouseDown && this.isMovingAll) {
      const dx = worldPt.x - this.moveAllStart.x;
      const dy = worldPt.y - this.moveAllStart.y;
      this.moveAllStart = { x: worldPt.x, y: worldPt.y };
      for (const w of this.engine.walls) {
        w.p1.x += dx; w.p1.y += dy;
        w.p2.x += dx; w.p2.y += dy;
      }
      for (const r of this.engine.rooms) {
        if (r.polygon) {
          for (const pt of r.polygon) { pt.x += dx; pt.y += dy; }
        }
        if (r.center) { r.center.x += dx; r.center.y += dy; }
        if (r.labelPos) { r.labelPos.x += dx; r.labelPos.y += dy; }
      }
      for (const f of this.engine.furniture) {
        f.x += dx; f.y += dy;
      }
      this.renderer.render();
      return;
    }

    // Dragging single item
    if (this.isMouseDown && this.draggingItem) {
      if (this.draggingItem.type === 'wall_endpoint') {
        const { connected, connectedWallIds, connectedRooms, connectedOpenings } = this.draggingItem;
        const snapped = this.engine.snapPoint(worldPt, null, connectedWallIds);
        connected.forEach(item => {
          item.wall[item.key].x = Math.round(snapped.x);
          item.wall[item.key].y = Math.round(snapped.y);
        });
        if (connectedRooms) {
          const touchedRooms = new Set();
          connectedRooms.forEach(item => {
            if (item.room.polygon && item.room.polygon[item.index]) {
              item.room.polygon[item.index].x = Math.round(snapped.x);
              item.room.polygon[item.index].y = Math.round(snapped.y);
              touchedRooms.add(item.room);
            }
          });
          touchedRooms.forEach(r => {
            r.area = FloorPlanEngine.polygonArea(r.polygon) / 1000000;
            r.center = FloorPlanEngine.polygonCentroid(r.polygon);
          });
        }
        // 门窗在世界坐标系中位置保持绝对固定，不对已经摆放的组件做联动位移
        if (connectedOpenings) {
          connectedOpenings.forEach(item => {
            if (!item.worldCenter) return;
            const curWall = this.engine.walls.find(w => w.id === item.wallId);
            if (curWall) {
              const wallLen = Math.hypot(curWall.p2.x - curWall.p1.x, curWall.p2.y - curWall.p1.y);
              if (wallLen > 1) {
                const proj = FloorPlanEngine.projectPointToSegment(item.worldCenter, curWall.p1, curWall.p2);
                const halfWRatio = ((item.op.width || 800) / 2) / wallLen;
                const minT = Math.min(0.5, halfWRatio);
                const maxT = Math.max(0.5, 1 - halfWRatio);
                item.op.t = Math.max(minT, Math.min(maxT, proj.t));
              }
            }
          });
        }
        this.renderer.alignmentGuides = snapped.guides || [];
        this.renderer.alignmentGuide = snapped.guide || null;
        this.renderer.snapIndicator = snapped.snapped ? { x: snapped.x, y: snapped.y, type: snapped.type } : null;
        this.renderer.render();
        return;
      } else if (this.draggingItem.type === 'room_label') {
        const dx = worldPt.x - this.draggingItem.startMouse.x;
        const dy = worldPt.y - this.draggingItem.startMouse.y;
        if (Math.hypot(dx, dy) > 20) {
          this.draggingItem.hasMoved = true;
          this.draggingItem.room.userMovedLabel = true;
        }
        const r = this.draggingItem.room;
        r.labelPos = {
          x: Math.round(this.draggingItem.startPos.x + dx),
          y: Math.round(this.draggingItem.startPos.y + dy)
        };
        this.canvas.style.cursor = 'grabbing';
        this.renderer.render();
        return;
      } else if (this.draggingItem.type === 'wall_body') {
        this.applyWallBodyDrag(this.draggingItem, worldPt);
        this.renderer.render();
        return;
      } else if (this.draggingItem.type === 'opening') {
        const op = this.draggingItem.obj;
        // 用户需求：鼠标拖拽门可以移动门窗，也要可以越过内墙限制，到其他房间的墙体上面
        let minD = Infinity;
        let bestWall = null;
        let bestProj = null;

        for (const w of this.engine.walls) {
          if (Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y) < 300) continue;
          const proj = FloorPlanEngine.projectPointToSegment(worldPt, w.p1, w.p2);
          if (proj.dist < minD) {
            minD = proj.dist;
            bestWall = w;
            bestProj = proj;
          }
        }

        if (bestWall) {
          if (bestWall.id !== op.wallId) {
            op.wallId = bestWall.id;
            this.draggingItem.wall = bestWall;
          }
          const wallLen = Math.hypot(bestWall.p2.x - bestWall.p1.x, bestWall.p2.y - bestWall.p1.y);
          const halfWRatio = (op.width / 2) / wallLen;
          const minT = Math.min(0.5, halfWRatio);
          const maxT = Math.max(0.5, 1 - halfWRatio);
          op.t = Math.max(minT, Math.min(maxT, bestProj.t));

          // 用户需求：过拽门（飘窗）到墙内外来改变门的方向
          const dx = bestWall.p2.x - bestWall.p1.x;
          const dy = bestWall.p2.y - bestWall.p1.y;
          const yLocal = ((worldPt.y - bestWall.p1.y) * dx - (worldPt.x - bestWall.p1.x) * dy) / (wallLen || 1);

          if (Math.abs(yLocal) > 20) {
            if (op.type === 'bay_window') {
              op.flipY = (yLocal > 0);
            } else {
              op.flipY = (yLocal < 0);
            }
          }

          this.renderer.render();
          return;
        }
      } else if (this.draggingItem.type === 'furniture') {
        const furn = this.engine.furniture.find(f => f.id === this.draggingItem.id);
        if (furn) {
          let rawX = Math.round(worldPt.x - this.dragItemOffset.x);
          let rawY = Math.round(worldPt.y - this.dragItemOffset.y);

          // 用户需求：手动移动家具组件时保留贴墙磁吸吸附功能，同时允许自由跨越空间穿墙到其他房间
          // 默认开启贴墙磁吸吸附（靠近墙面自动贴靠对齐），Alt 键可临时关闭吸附
          // 当鼠标拉离超过吸附阈值（260mm）时，自动自然脱离，允许随意穿过墙体跨房间移动！
          if (!e.altKey) {
            const snapped = this.snapFurnitureToWalls(furn, rawX, rawY);
            furn.x = snapped.x;
            furn.y = snapped.y;
            this.renderer.alignmentGuide = snapped.guide || null;
          } else {
            furn.x = rawX;
            furn.y = rawY;
            this.renderer.alignmentGuide = null;
          }
          this.renderer.render();
          return;
        }
      } else if (this.draggingItem.type === 'blueprint' && !this.engine.blueprint.locked) {
        this.engine.blueprint.x = Math.round(worldPt.x - this.dragItemOffset.x);
        this.engine.blueprint.y = Math.round(worldPt.y - this.dragItemOffset.y);
        this.renderer.render();
        return;
      }
    }

    // Wall drawing feedback
    if (this.currentTool === 'draw_wall' && this.wallDrawStart) {
      const snapped = this.engine.snapPoint(worldPt, this.wallDrawStart);
      this.renderer.activeDrawLine = {
        p1: this.wallDrawStart,
        p2: { x: snapped.x, y: snapped.y },
        thickness: this.currentWallThickness || (this.engine && this.engine.defaultWallThickness) || 240,
        type: this.currentWallType || (this.engine && this.engine.defaultWallType) || 'bearing'
      };
      this.renderer.snapIndicator = snapped.snapped ? { x: snapped.x, y: snapped.y, type: snapped.type } : null;
      this.renderer.alignmentGuides = snapped.guides || [];
      this.renderer.alignmentGuide = snapped.guide;
      this.renderer.render();
      return;
    }

    // Rect room drawing feedback
    if (this.currentTool === 'draw_rect' && this.rectDrawStart) {
      const snapped = this.engine.snapPoint(worldPt);
      this.renderer.activeDrawRect = {
        p1: this.rectDrawStart,
        p2: { x: snapped.x, y: snapped.y },
        thickness: this.currentWallThickness,
        type: this.currentWallType
      };
      this.renderer.snapIndicator = snapped.snapped ? { x: snapped.x, y: snapped.y, type: snapped.type } : null;
      this.renderer.alignmentGuides = snapped.guides || [];
      this.renderer.alignmentGuide = snapped.guide;
      this.renderer.render();
      return;
    }

    // Hover feedback
    if ((this.currentTool === 'draw_wall' && !this.wallDrawStart) || (this.currentTool === 'draw_rect' && !this.rectDrawStart)) {
      const snapped = this.engine.snapPoint(worldPt);
      this.renderer.snapIndicator = snapped.snapped ? { x: snapped.x, y: snapped.y, type: snapped.type } : null;
      this.renderer.alignmentGuides = snapped.guides || [];
      this.renderer.alignmentGuide = snapped.guide;
      this.renderer.render();
      return;
    }

    if (this.currentTool === 'select' && !this.isMouseDown) {
      // Check handles hover on selected opening
      if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'opening') {
        const op = this.engine.doors.concat(this.engine.windows).find(d => d.id === this.renderer.selectedItem.id);
        if (op) {
          const handle = this.getOpeningHandleAt(worldPt, op);
          if (handle === 'flip') {
            this.canvas.style.cursor = 'pointer';
            return;
          } else if (handle === 'left_jamb' || handle === 'right_jamb') {
            this.canvas.style.cursor = 'ew-resize';
            return;
          } else if (handle === 'body') {
            this.canvas.style.cursor = 'grab';
            return;
          }
        }
      }

      // Check handles hover on selected furniture
      if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
        const furn = this.engine.furniture.find(f => f.id === this.renderer.selectedItem.id);
        if (furn) {
          const handle = this.getFurnitureHandleAt(worldPt, furn);
          if (handle) {
            this.canvas.style.cursor = this.getHandleCursor(handle, furn.rotation || 0);
            return;
          }
        }
      }
      this.canvas.style.cursor = '';

      const hit = this.hitTest(worldPt);
      if (this.renderer.hoveredItem !== hit) {
        this.renderer.hoveredItem = hit;
        this.renderer.render();
      }
      if (hit) {
        if (hit.type === 'entrance_marker') {
          this.canvas.style.cursor = 'pointer';
        } else if (hit.type === 'room_label') {
          this.canvas.style.cursor = 'grab';
        } else if (hit.type === 'wall_endpoint') {
          this.canvas.style.cursor = 'crosshair';
        } else if (hit.type === 'wall') {
          const w = hit.obj;
          const isHoriz = Math.abs(w.p2.x - w.p1.x) >= Math.abs(w.p2.y - w.p1.y);
          this.canvas.style.cursor = isHoriz ? 'ns-resize' : 'ew-resize';
        } else if (hit.type === 'furniture' || hit.type === 'opening') {
          this.canvas.style.cursor = 'move';
        } else {
          this.canvas.style.cursor = 'pointer';
        }
      } else {
        this.canvas.style.cursor = '';
      }
    }
  }

  handleMouseUp(e) {
    if (e.button === 2) {
      e.preventDefault();
      this.isPanning = false;
      this.isRightMouseDown = false;
      this.canvas.style.cursor = '';
      const { sx, sy } = this.getCanvasCoords(e);
      const dist = Math.hypot(sx - (this.rightDownScreen ? this.rightDownScreen.x : sx), sy - (this.rightDownScreen ? this.rightDownScreen.y : sy));
      if (dist < 6) {
        this.cancelActiveOperation();
      }
      return;
    }

    this.isMouseDown = false;
    this.isPanning = false;

    if (this.activeTransform) {
      if (this.activeTransform.mode === 'rotate' && !this.activeTransform.hasDragged) {
        // 单击独立旋转按钮：顺时针旋转90°
        const f = this.activeTransform.item;
        if (f) {
          f.rotation = Math.round(((f.rotation || 0) + 90) % 360);
          this.syncPropertyCardFurnitureInputs(f);
          this.engine.saveCurrentFloorState();
        }
      }
      this.activeTransform = null;
      this.engine.recordHistory();
    }
    if (this.isMovingAll) {
      this.isMovingAll = false;
      this.engine.recordHistory();
    }
    if (this.draggingItem) {
      if (this.draggingItem.type === 'room_label') {
        if (!this.draggingItem.hasMoved) {
          this.startInlineRoomNameEdit(this.draggingItem.room);
        } else {
          this.engine.saveCurrentFloorState();
          this.engine.recordHistory();
        }
      } else if (this.draggingItem.type === 'wall_endpoint' || this.draggingItem.type === 'wall_body') {
        if (this.draggingItem.type === 'wall_body') {
          this.engine.splitWallsAtIntersections();
          this.engine.insertWallJunctionsIntoRoomPolygons();
          this.engine.syncRoomsWithWalls();
          this.engine.enforceOuterWallRules();
        }
        if (this.draggingItem.type === 'wall_endpoint') {
          // 拖动墙角后可能新形成封闭空间，自动补全房间名称
          this.engine.splitWallsAtIntersections();
          this.engine.syncRoomsWithWalls();
          this.engine.enforceOuterWallRules();
        }
        this.engine.autoDetectRooms();
        this.engine.saveCurrentFloorState();
        this.engine.recordHistory();
      } else {
        this.engine.recordHistory();
      }
      this.draggingItem = null;
    }
    this.renderer.alignmentGuide = null; this.renderer.alignmentGuides = [];
    this.renderer.rotationSnapInfo = null;
    this.renderer.snapIndicator = null;
    this.renderer.render();
  }

  // --- Wall Body Drag with Exact Room Edge Adaptation ---
  applyWallBodyDrag(dragState, worldPt) {
    const wallMap = new Map();
    for (const w of this.engine.walls) wallMap.set(w.id, w);
    for (const ow of dragState.origWalls) {
      const w = wallMap.get(ow.id);
      if (w) {
        w.p1.x = ow.p1.x; w.p1.y = ow.p1.y;
        w.p2.x = ow.p2.x; w.p2.y = ow.p2.y;
      }
    }
    const targetWall = wallMap.get(dragState.wallId);
    if (!targetWall) return;

    if (dragState.isHorizontal) {
      const rawDy = Math.round(worldPt.y - dragState.startMouse.y);
      const y0 = Math.round((dragState.origWall.p1.y + dragState.origWall.p2.y) / 2);
      let targetY = y0 + rawDy;

      // 收集相邻墙体与相邻房间边界的持平候选位置 (Flush Alignment Hover Candidates)
      const zoom = (this.engine.viewport && this.engine.viewport.zoom) || 0.05;
      const snapDist = Math.max(180, 14 / zoom);
      const candidateYs = [];

      for (const ow of dragState.origWalls) {
        if (ow.id === dragState.wallId) continue;
        const isHoriz = Math.abs(ow.p2.x - ow.p1.x) >= Math.abs(ow.p2.y - ow.p1.y);
        if (isHoriz) {
          candidateYs.push({
            y: Math.round((ow.p1.y + ow.p2.y) / 2),
            minX: Math.min(ow.p1.x, ow.p2.x),
            maxX: Math.max(ow.p1.x, ow.p2.x),
            label: '与相邻墙体持平对齐'
          });
        }
      }

      for (const rm of this.engine.rooms) {
        if (!rm.polygon || rm.polygon.length < 3) continue;
        const poly = rm.polygon;
        const rName = rm.name || '相邻房间';
        for (let i = 0; i < poly.length; i++) {
          const next = (i + 1) % poly.length;
          const p1 = poly[i];
          const p2 = poly[next];
          if (Math.abs(p1.y - p2.y) < 20) {
            candidateYs.push({
              y: Math.round((p1.y + p2.y) / 2),
              minX: Math.min(p1.x, p2.x),
              maxX: Math.max(p1.x, p2.x),
              label: `与【${rName}】边线持平对齐`
            });
          }
          candidateYs.push({
            y: Math.round(p1.y),
            minX: p1.x,
            maxX: p1.x,
            label: `与【${rName}】墙角持平对齐`
          });
        }
      }

      let bestCandY = null;
      let minDiffY = snapDist;
      for (const c of candidateYs) {
        const diff = Math.abs(targetY - c.y);
        if (diff < minDiffY) {
          minDiffY = diff;
          bestCandY = c;
        }
      }

      const wx1 = Math.min(dragState.origWall.p1.x, dragState.origWall.p2.x);
      const wx2 = Math.max(dragState.origWall.p1.x, dragState.origWall.p2.x);

      if (bestCandY) {
        targetY = bestCandY.y;
        this.renderer.alignmentGuides = [{
          x1: Math.min(wx1, bestCandY.minX) - 500,
          y1: targetY,
          x2: Math.max(wx2, bestCandY.maxX) + 500,
          y2: targetY,
          kind: 'flush',
          label: bestCandY.label
        }];
        this.renderer.snapIndicator = {
          x: (wx1 + wx2) / 2,
          y: targetY,
          type: 'flush'
        };
      } else {
        this.renderer.alignmentGuides = [];
        this.renderer.snapIndicator = null;
      }

      const dy = targetY - y0;
      const newY = targetY;

      targetWall.p1.y = dragState.origWall.p1.y + dy;
      targetWall.p2.y = dragState.origWall.p2.y + dy;

      const hasStationaryHorizAt = (endX) => {
        const pt = { x: endX, y: y0 };
        return dragState.origWalls.some(ow => {
          if (ow.id === dragState.wallId) return false;
          const isHoriz = Math.abs(ow.p2.x - ow.p1.x) >= Math.abs(ow.p2.y - ow.p1.y);
          if (!isHoriz) return false;
          const pr = FloorPlanEngine.projectPointToSegment(pt, ow.p1, ow.p2);
          return pr.dist < 180;
        });
      };
      const statAtX1 = hasStationaryHorizAt(wx1);
      const statAtX2 = hasStationaryHorizAt(wx2);

      // Update connected vertical walls
      for (const ow of dragState.origWalls) {
        if (ow.id === dragState.wallId) continue;
        const isVert = Math.abs(ow.p2.x - ow.p1.x) < Math.abs(ow.p2.y - ow.p1.y);
        if (!isVert) continue;
        const w = wallMap.get(ow.id);
        if (!w) continue;

        for (const key of ['p1', 'p2']) {
          const pt = ow[key];
          const otherPt = key === 'p1' ? ow.p2 : ow.p1;
          const pr = FloorPlanEngine.projectPointToSegment(pt, dragState.origWall.p1, dragState.origWall.p2);
          if (pr.dist < 200 && pr.t >= -0.05 && pr.t <= 1.05) {
            const hasStat = (Math.abs(pt.x - wx1) < 180 && statAtX1) || (Math.abs(pt.x - wx2) < 180 && statAtX2);
            if (!hasStat) {
              w[key].y = newY;
            } else {
              // Ensure vertical wall covers both y0 (stationary neighbor) and newY (moved wall)
              if (otherPt.y > y0) {
                w[key].y = Math.min(y0, newY);
              } else if (otherPt.y < y0) {
                w[key].y = Math.max(y0, newY);
              } else {
                w[key].y = newY;
              }
            }
          }
        }
      }

      // Update only rooms whose horizontal edge overlaps targetWall
      for (const oroom of dragState.origRooms) {
        const r = this.engine.rooms.find(rm => rm.id === oroom.id);
        if (!r || !oroom.polygon || oroom.polygon.length < 3) continue;
        const origPoly = oroom.polygon;
        const n = origPoly.length;
        const newVertices = origPoly.map(p => [{ x: p.x, y: p.y }]);
        let modified = false;

        for (let i = 0; i < n; i++) {
          const next = (i + 1) % n;
          const pA = origPoly[i];
          const pB = origPoly[next];
          if (Math.abs(pA.y - y0) < 180 && Math.abs(pB.y - y0) < 180 && Math.abs(pA.x - pB.x) > 50) {
            const ex1 = Math.min(pA.x, pB.x);
            const ex2 = Math.max(pA.x, pB.x);
            const ov1 = Math.max(ex1, wx1);
            const ov2 = Math.min(ex2, wx2);
            if (ov2 - ov1 > 50) {
              modified = true;
              if (pA.x < pB.x) {
                if (ov1 <= ex1 + 120) {
                  newVertices[i][newVertices[i].length - 1].y = newY;
                } else {
                  newVertices[i].push({ x: ov1, y: pA.y }, { x: ov1, y: newY });
                }
                if (ov2 >= ex2 - 120) {
                  newVertices[next][0].y = newY;
                } else {
                  newVertices[i].push({ x: ov2, y: newY }, { x: ov2, y: pB.y });
                }
              } else {
                if (ov2 >= ex2 - 120) {
                  newVertices[i][newVertices[i].length - 1].y = newY;
                } else {
                  newVertices[i].push({ x: ov2, y: pA.y }, { x: ov2, y: newY });
                }
                if (ov1 <= ex1 + 120) {
                  newVertices[next][0].y = newY;
                } else {
                  newVertices[i].push({ x: ov1, y: newY }, { x: ov1, y: pB.y });
                }
              }
            }
          }
        }

        if (modified) {
          r.polygon = newVertices.flat();
          r.area = FloorPlanEngine.polygonArea(r.polygon) / 1000000;
          r.center = FloorPlanEngine.polygonCentroid(r.polygon);
        } else {
          r.polygon = origPoly.map(p => ({ x: p.x, y: p.y }));
        }
      }
    } else {
      // Vertical wall moved horizontally
      const rawDx = Math.round(worldPt.x - dragState.startMouse.x);
      const x0 = Math.round((dragState.origWall.p1.x + dragState.origWall.p2.x) / 2);
      let targetX = x0 + rawDx;

      // 收集相邻墙体与相邻房间边界的持平候选位置 (Flush Alignment Hover Candidates)
      const zoom = (this.engine.viewport && this.engine.viewport.zoom) || 0.05;
      const snapDist = Math.max(180, 14 / zoom);
      const candidateXs = [];

      for (const ow of dragState.origWalls) {
        if (ow.id === dragState.wallId) continue;
        const isVert = Math.abs(ow.p2.x - ow.p1.x) < Math.abs(ow.p2.y - ow.p1.y);
        if (isVert) {
          candidateXs.push({
            x: Math.round((ow.p1.x + ow.p2.x) / 2),
            minY: Math.min(ow.p1.y, ow.p2.y),
            maxY: Math.max(ow.p1.y, ow.p2.y),
            label: '与相邻墙体持平对齐'
          });
        }
      }

      for (const rm of this.engine.rooms) {
        if (!rm.polygon || rm.polygon.length < 3) continue;
        const poly = rm.polygon;
        const rName = rm.name || '相邻房间';
        for (let i = 0; i < poly.length; i++) {
          const next = (i + 1) % poly.length;
          const p1 = poly[i];
          const p2 = poly[next];
          if (Math.abs(p1.x - p2.x) < 20) {
            candidateXs.push({
              x: Math.round((p1.x + p2.x) / 2),
              minY: Math.min(p1.y, p2.y),
              maxY: Math.max(p1.y, p2.y),
              label: `与【${rName}】边线持平对齐`
            });
          }
          candidateXs.push({
            x: Math.round(p1.x),
            minY: p1.y,
            maxY: p1.y,
            label: `与【${rName}】墙角持平对齐`
          });
        }
      }

      let bestCandX = null;
      let minDiffX = snapDist;
      for (const c of candidateXs) {
        const diff = Math.abs(targetX - c.x);
        if (diff < minDiffX) {
          minDiffX = diff;
          bestCandX = c;
        }
      }

      const wy1 = Math.min(dragState.origWall.p1.y, dragState.origWall.p2.y);
      const wy2 = Math.max(dragState.origWall.p1.y, dragState.origWall.p2.y);

      if (bestCandX) {
        targetX = bestCandX.x;
        this.renderer.alignmentGuides = [{
          x1: targetX,
          y1: Math.min(wy1, bestCandX.minY) - 500,
          x2: targetX,
          y2: Math.max(wy2, bestCandX.maxY) + 500,
          kind: 'flush',
          label: bestCandX.label
        }];
        this.renderer.snapIndicator = {
          x: targetX,
          y: (wy1 + wy2) / 2,
          type: 'flush'
        };
      } else {
        this.renderer.alignmentGuides = [];
        this.renderer.snapIndicator = null;
      }

      const dx = targetX - x0;
      const newX = targetX;

      targetWall.p1.x = dragState.origWall.p1.x + dx;
      targetWall.p2.x = dragState.origWall.p2.x + dx;

      const hasStationaryVertAt = (endY) => {
        const pt = { x: x0, y: endY };
        return dragState.origWalls.some(ow => {
          if (ow.id === dragState.wallId) return false;
          const isVert = Math.abs(ow.p2.x - ow.p1.x) < Math.abs(ow.p2.y - ow.p1.y);
          if (!isVert) return false;
          const pr = FloorPlanEngine.projectPointToSegment(pt, ow.p1, ow.p2);
          return pr.dist < 180;
        });
      };
      const statAtY1 = hasStationaryVertAt(wy1);
      const statAtY2 = hasStationaryVertAt(wy2);

      // Update connected horizontal walls
      for (const ow of dragState.origWalls) {
        if (ow.id === dragState.wallId) continue;
        const isHoriz = Math.abs(ow.p2.x - ow.p1.x) >= Math.abs(ow.p2.y - ow.p1.y);
        if (!isHoriz) continue;
        const w = wallMap.get(ow.id);
        if (!w) continue;

        for (const key of ['p1', 'p2']) {
          const pt = ow[key];
          const otherPt = key === 'p1' ? ow.p2 : ow.p1;
          const pr = FloorPlanEngine.projectPointToSegment(pt, dragState.origWall.p1, dragState.origWall.p2);
          if (pr.dist < 200 && pr.t >= -0.05 && pr.t <= 1.05) {
            const hasStat = (Math.abs(pt.y - wy1) < 180 && statAtY1) || (Math.abs(pt.y - wy2) < 180 && statAtY2);
            if (!hasStat) {
              w[key].x = newX;
            } else {
              if (otherPt.x > x0) {
                w[key].x = Math.min(x0, newX);
              } else if (otherPt.x < x0) {
                w[key].x = Math.max(x0, newX);
              } else {
                w[key].x = newX;
              }
            }
          }
        }
      }

      // Update only rooms whose vertical edge overlaps targetWall
      for (const oroom of dragState.origRooms) {
        const r = this.engine.rooms.find(rm => rm.id === oroom.id);
        if (!r || !oroom.polygon || oroom.polygon.length < 3) continue;
        const origPoly = oroom.polygon;
        const n = origPoly.length;
        const newVertices = origPoly.map(p => [{ x: p.x, y: p.y }]);
        let modified = false;

        for (let i = 0; i < n; i++) {
          const next = (i + 1) % n;
          const pA = origPoly[i];
          const pB = origPoly[next];
          if (Math.abs(pA.x - x0) < 180 && Math.abs(pB.x - x0) < 180 && Math.abs(pA.y - pB.y) > 50) {
            const ey1 = Math.min(pA.y, pB.y);
            const ey2 = Math.max(pA.y, pB.y);
            const ov1 = Math.max(ey1, wy1);
            const ov2 = Math.min(ey2, wy2);
            if (ov2 - ov1 > 50) {
              modified = true;
              if (pA.y < pB.y) {
                if (ov1 <= ey1 + 120) {
                  newVertices[i][newVertices[i].length - 1].x = newX;
                } else {
                  newVertices[i].push({ x: pA.x, y: ov1 }, { x: newX, y: ov1 });
                }
                if (ov2 >= ey2 - 120) {
                  newVertices[next][0].x = newX;
                } else {
                  newVertices[i].push({ x: newX, y: ov2 }, { x: pB.x, y: ov2 });
                }
              } else {
                if (ov2 >= ey2 - 120) {
                  newVertices[i][newVertices[i].length - 1].x = newX;
                } else {
                  newVertices[i].push({ x: pA.x, y: ov2 }, { x: newX, y: ov2 });
                }
                if (ov1 <= ey1 + 120) {
                  newVertices[next][0].x = newX;
                } else {
                  newVertices[i].push({ x: newX, y: ov1 }, { x: pB.x, y: ov1 });
                }
              }
            }
          }
        }

        if (modified) {
          r.polygon = newVertices.flat();
          r.area = FloorPlanEngine.polygonArea(r.polygon) / 1000000;
          r.center = FloorPlanEngine.polygonCentroid(r.polygon);
        } else {
          r.polygon = origPoly.map(p => ({ x: p.x, y: p.y }));
        }
      }
    }

    // 保持房间内侧已摆放门窗物理绝对坐标固定，仅作房间扩展，不做联动平移（被拖动调整的墙体除外）
    if (dragState.origOpenings) {
      for (const item of dragState.origOpenings) {
        if (item.wallId === dragState.wallId) {
          // 被调整的墙体自身：其上的门窗跟随此墙整体位移，保持在原相对位置
          continue;
        }
        if (item.worldCenter) {
          const curWall = wallMap.get(item.wallId);
          if (curWall) {
            const wallLen = Math.hypot(curWall.p2.x - curWall.p1.x, curWall.p2.y - curWall.p1.y);
            if (wallLen > 1) {
              const proj = FloorPlanEngine.projectPointToSegment(item.worldCenter, curWall.p1, curWall.p2);
              const halfWRatio = ((item.op.width || 800) / 2) / wallLen;
              const minT = Math.min(0.5, halfWRatio);
              const maxT = Math.max(0.5, 1 - halfWRatio);
              item.op.t = Math.max(minT, Math.min(maxT, proj.t));
            }
          }
        }
      }
    }
  }

  // --- Opening Interaction & Transform Helpers ---
  getOpeningLocalCoords(worldPt, op, wall) {
    const cx = wall.p1.x + op.t * (wall.p2.x - wall.p1.x);
    const cy = wall.p1.y + op.t * (wall.p2.y - wall.p1.y);
    const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    const dx = worldPt.x - cx;
    const dy = worldPt.y - cy;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    return {
      lx: dx * cos - dy * sin,
      ly: dx * sin + dy * cos
    };
  }

  getOpeningHandleAt(worldPt, op) {
    const wall = this.engine.walls.find(w => w.id === op.wallId);
    if (!wall) return null;
    const { lx, ly } = this.getOpeningLocalCoords(worldPt, op, wall);
    const halfW = op.width / 2;
    const wallThick = wall.thickness || 240;

    const zoom = this.engine.viewport.zoom || 0.1;
    const hitR = Math.max(80, Math.min(300, 18 / zoom));

    // 1. Flip handle (offset to side if entrance door to not overlap walker icon)
    const isEnt = (op.type === 'entry_door' || op.isEntrance);
    const flipBtnX = isEnt ? (-halfW - 160) : 0;
    if (Math.abs(lx - flipBtnX) <= 160 && Math.abs(ly - (-wallThick/2 - 180)) <= 70) {
      return 'flip';
    }

    // 2. Left jamb handle at (-halfW, 0)
    if (Math.hypot(lx - (-halfW), ly - 0) <= hitR * 1.3) {
      return 'left_jamb';
    }

    // 3. Right jamb handle at (halfW, 0)
    if (Math.hypot(lx - halfW, ly - 0) <= hitR * 1.3) {
      return 'right_jamb';
    }

    // 4. Opening body
    if (Math.abs(lx) <= halfW + 40 && Math.abs(ly) <= wallThick/2 + 50) {
      return 'body';
    }

    return null;
  }

  // --- Furniture Transform Helpers ---
  getFurnitureLocalCoords(worldPt, f) {
    const dx = worldPt.x - f.x;
    const dy = worldPt.y - f.y;
    const rad = (f.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(-rad);
    const sin = Math.sin(-rad);
    return {
      lx: dx * cos - dy * sin,
      ly: dx * sin + dy * cos
    };
  }

  getFurnitureHandleAt(worldPt, f) {
    const { lx, ly } = this.getFurnitureLocalCoords(worldPt, f);
    const halfW = f.width / 2 + 20;
    const halfH = f.height / 2 + 20;

    const zoom = this.engine.viewport.zoom || 0.1;
    const hitR = Math.max(120, Math.min(450, 20 / zoom));

    // 1. Rotation handle & dedicated button at (0, -halfH - 220)
    if (Math.hypot(lx - 0, ly - (-halfH - 220)) <= Math.max(160, hitR * 1.5)) {
      return 'rotate';
    }

    // 2. 8 resize handles
    const handleMap = [
      { name: 'nw', x: -halfW, y: -halfH },
      { name: 'n',  x: 0,      y: -halfH },
      { name: 'ne', x: halfW,  y: -halfH },
      { name: 'e',  x: halfW,  y: 0 },
      { name: 'se', x: halfW,  y: halfH },
      { name: 's',  x: 0,      y: halfH },
      { name: 'sw', x: -halfW, y: halfH },
      { name: 'w',  x: -halfW, y: 0 }
    ];

    for (const h of handleMap) {
      if (Math.hypot(lx - h.x, ly - h.y) <= hitR) {
        return h.name;
      }
    }

    return null;
  }

  // --- 家具靠近墙体自动磁吸与对齐 (Magnetic Wall Snapping) ---
  snapFurnitureToWalls(furn, targetX, targetY) {
    const SNAP_DIST = 260; // 260mm 舒适磁吸阈值：靠近时贴紧，稍用力一拉即可脱离吸附穿墙
    let bestDist = SNAP_DIST;
    let bestSnap = { x: targetX, y: targetY };

    // 计算旋转后的真实包围盒半宽半高
    const rad = (furn.rotation || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const curW = (furn.width || 800) * cos + (furn.height || 800) * sin;
    const curH = (furn.width || 800) * sin + (furn.height || 800) * cos;
    const wHalf = curW / 2;
    const hHalf = curH / 2;

    for (const wall of this.engine.walls) {
      if (wall.type === 'virtual') continue;
      const isWallHoriz = Math.abs(wall.p2.x - wall.p1.x) >= Math.abs(wall.p2.y - wall.p1.y);
      const wallThickHalf = (wall.thickness || 240) / 2;

      if (isWallHoriz) {
        // 水平墙体：沿Y轴磁吸贴墙，对齐水平朝向
        const wallY = (wall.p1.y + wall.p2.y) / 2;
        const minX = Math.min(wall.p1.x, wall.p2.x) - wHalf;
        const maxX = Math.max(wall.p1.x, wall.p2.x) + wHalf;

        if (targetX >= minX && targetX <= maxX) {
          const dy = targetY - wallY;
          const distToFace = Math.abs(dy) - (wallThickHalf + hHalf);
          if (distToFace >= -150 && distToFace < bestDist) {
            bestDist = distToFace;
            const sign = dy >= 0 ? 1 : -1;
            bestSnap = {
              x: targetX,
              y: Math.round(wallY + sign * (wallThickHalf + hHalf + 10)),
              guide: {
                type: 'snap_wall',
                x1: wall.p1.x, y1: wall.p1.y,
                x2: wall.p2.x, y2: wall.p2.y
              }
            };
          }
        }
      } else {
        // 垂直墙体：沿X轴磁吸贴墙
        const wallX = (wall.p1.x + wall.p2.x) / 2;
        const minY = Math.min(wall.p1.y, wall.p2.y) - hHalf;
        const maxY = Math.max(wall.p1.y, wall.p2.y) + hHalf;

        if (targetY >= minY && targetY <= maxY) {
          const dx = targetX - wallX;
          const distToFace = Math.abs(dx) - (wallThickHalf + wHalf);
          if (distToFace >= -150 && distToFace < bestDist) {
            bestDist = distToFace;
            const sign = dx >= 0 ? 1 : -1;
            bestSnap = {
              x: Math.round(wallX + sign * (wallThickHalf + wHalf + 10)),
              y: targetY,
              guide: {
                type: 'snap_wall',
                x1: wall.p1.x, y1: wall.p1.y,
                x2: wall.p2.x, y2: wall.p2.y
              }
            };
          }
        }
      }
    }

    return bestSnap;
  }

  // --- Shift + 方向键：向指定方向最近的墙体贴墙摆放 ---
  snapFurnitureToNearestWall(furn, direction) {
    const walls = this.engine.walls.filter(w => w.type !== 'virtual');
    if (!walls.length) return;

    const rad = (furn.rotation || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const bbHalfW = (furn.width * cos + furn.height * sin) / 2;
    const bbHalfH = (furn.width * sin + furn.height * cos) / 2;

    let bestTargetCoord = null;
    let bestDist = Infinity;

    if (direction === 'up' || direction === 'down') {
      const isUp = direction === 'up';
      for (const w of walls) {
        const isHoriz = Math.abs(w.p2.x - w.p1.x) >= Math.abs(w.p2.y - w.p1.y);
        if (!isHoriz) continue;
        const wallY = (w.p1.y + w.p2.y) / 2;
        const minX = Math.min(w.p1.x, w.p2.x) - bbHalfW;
        const maxX = Math.max(w.p1.x, w.p2.x) + bbHalfW;
        const wallThickHalf = (w.thickness || 240) / 2;

        if (furn.x >= minX && furn.x <= maxX) {
          if (isUp && wallY < furn.y) {
            const targetY = wallY + wallThickHalf + bbHalfH + 10;
            const dist = furn.y - targetY;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetY;
            }
          } else if (!isUp && wallY > furn.y) {
            const targetY = wallY - wallThickHalf - bbHalfH - 10;
            const dist = targetY - furn.y;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetY;
            }
          }
        }
      }

      // 如果水平区间内没有墙体，向该方向寻找全局最近水平墙体
      if (bestTargetCoord === null) {
        for (const w of walls) {
          const isHoriz = Math.abs(w.p2.x - w.p1.x) >= Math.abs(w.p2.y - w.p1.y);
          if (!isHoriz) continue;
          const wallY = (w.p1.y + w.p2.y) / 2;
          const wallThickHalf = (w.thickness || 240) / 2;
          if (isUp && wallY < furn.y) {
            const targetY = wallY + wallThickHalf + bbHalfH + 10;
            const dist = furn.y - targetY;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetY;
            }
          } else if (!isUp && wallY > furn.y) {
            const targetY = wallY - wallThickHalf - bbHalfH - 10;
            const dist = targetY - furn.y;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetY;
            }
          }
        }
      }

      if (bestTargetCoord !== null) {
        furn.y = Math.round(bestTargetCoord);
      }
    } else if (direction === 'left' || direction === 'right') {
      const isLeft = direction === 'left';
      for (const w of walls) {
        const isVert = Math.abs(w.p2.y - w.p1.y) > Math.abs(w.p2.x - w.p1.x);
        if (!isVert) continue;
        const wallX = (w.p1.x + w.p2.x) / 2;
        const minY = Math.min(w.p1.y, w.p2.y) - bbHalfH;
        const maxY = Math.max(w.p1.y, w.p2.y) + bbHalfH;
        const wallThickHalf = (w.thickness || 240) / 2;

        if (furn.y >= minY && furn.y <= maxY) {
          if (isLeft && wallX < furn.x) {
            const targetX = wallX + wallThickHalf + bbHalfW + 10;
            const dist = furn.x - targetX;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetX;
            }
          } else if (!isLeft && wallX > furn.x) {
            const targetX = wallX - wallThickHalf - bbHalfW - 10;
            const dist = targetX - furn.x;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetX;
            }
          }
        }
      }

      // 如果垂直区间内没有墙体，向该方向寻找全局最近垂直墙体
      if (bestTargetCoord === null) {
        for (const w of walls) {
          const isVert = Math.abs(w.p2.y - w.p1.y) > Math.abs(w.p2.x - w.p1.x);
          if (!isVert) continue;
          const wallX = (w.p1.x + w.p2.x) / 2;
          const wallThickHalf = (w.thickness || 240) / 2;
          if (isLeft && wallX < furn.x) {
            const targetX = wallX + wallThickHalf + bbHalfW + 10;
            const dist = furn.x - targetX;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetX;
            }
          } else if (!isLeft && wallX > furn.x) {
            const targetX = wallX - wallThickHalf - bbHalfW - 10;
            const dist = targetX - furn.x;
            if (dist >= 0 && dist < bestDist) {
              bestDist = dist;
              bestTargetCoord = targetX;
            }
          }
        }
      }

      if (bestTargetCoord !== null) {
        furn.x = Math.round(bestTargetCoord);
      }
    }
  }

  getHandleCursor(handle, rotation = 0) {
    if (handle === 'rotate') return 'grab';

    const baseAngles = {
      'e': 0,
      'se': 45,
      's': 90,
      'sw': 135,
      'w': 180,
      'nw': 225,
      'n': 270,
      'ne': 315
    };

    const angle = (baseAngles[handle] + rotation) % 360;
    const norm = (angle + 360) % 180;

    if (norm >= 22.5 && norm < 67.5) {
      return 'nwse-resize';
    } else if (norm >= 67.5 && norm < 112.5) {
      return 'ns-resize';
    } else if (norm >= 112.5 && norm < 157.5) {
      return 'nesw-resize';
    } else {
      return 'ew-resize';
    }
  }

  syncPropertyCardFurnitureInputs(f) {
    const editFW = document.getElementById('editFW');
    const editFH = document.getElementById('editFH');
    const editFRot = document.getElementById('editFRot');
    if (editFW && document.activeElement !== editFW) editFW.value = Math.round(f.width);
    if (editFH && document.activeElement !== editFH) editFH.value = Math.round(f.height);
    if (editFRot && document.activeElement !== editFRot) editFRot.value = Math.round(f.rotation);
  }

  handleWheel(e) {
    e.preventDefault();
    const { sx, sy } = this.getCanvasCoords(e);
    const worldBefore = this.engine.screenToWorld(sx, sy);

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.max(0.015, Math.min(1.5, this.engine.viewport.zoom * zoomFactor));

    this.engine.viewport.zoom = newZoom;
    this.engine.viewport.x = sx - worldBefore.x * newZoom;
    this.engine.viewport.y = sy - worldBefore.y * newZoom;

    document.getElementById('vpZoomRatio').textContent = Math.round(newZoom * 800) + '%';
    this.renderer.render();
  }

  // --- Hit Testing ---
  hitTest(pt) {
    // 0. Entrance Door Direction Marker (入户门动态小人与粗折角大箭头：点击切换入户方向)
    for (const op of this.engine.doors) {
      if (op.type === 'entry_door' || op.isEntrance) {
        const wall = this.engine.walls.find(w => w.id === op.wallId);
        if (!wall) continue;
        const entrySide = Boolean(op.entranceFlipSide);
        const metrics = this.renderer.getEntranceMarkerMetrics 
          ? this.renderer.getEntranceMarkerMetrics(op, wall, entrySide)
          : { sign: entrySide ? 1 : -1, badgeDist: 700, arrowStartDist: 380, chevronSpacing: 135 };

        const cx = wall.p1.x + op.t * (wall.p2.x - wall.p1.x);
        const cy = wall.p1.y + op.t * (wall.p2.y - wall.p1.y);
        const angle = Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

        // 胶囊徽章世界坐标位置 (🚶 动态小人 + 320px 大字“入户” + ⇄ 反转)
        const badgeDist = metrics.sign * metrics.badgeDist;
        const bx = cx - badgeDist * Math.sin(angle);
        const by = cy + badgeDist * Math.cos(angle);

        // 折角粗箭头世界坐标中心
        const arrowMidDist = metrics.sign * (metrics.arrowStartDist + metrics.chevronSpacing * 0.5);
        const ax = cx - arrowMidDist * Math.sin(angle);
        const ay = cy + arrowMidDist * Math.cos(angle);

        // 点击在胶囊徽章或折角大箭头区域均可精准切换入户方向
        const dBadge = Math.hypot(pt.x - bx, pt.y - by);
        const dArrow = Math.hypot(pt.x - ax, pt.y - ay);
        if (dBadge <= 620 || dArrow <= 350) {
          return { type: 'entrance_marker', id: op.id, obj: op, wall: wall };
        }
      }
    }

    // 1. Room Labels (always clickable & draggable)
    for (const r of this.engine.rooms) {
      if (!r.center) continue;
      const lx = r.labelPos ? r.labelPos.x : r.center.x;
      const ly = r.labelPos ? r.labelPos.y : r.center.y;
      const bw = r._labelWidth || 1200;
      const bh = r._labelHeight || 650;
      if (Math.abs(pt.x - lx) <= bw / 2 && Math.abs(pt.y - ly) <= bh / 2) {
        return { type: 'room_label', id: r.id, obj: r };
      }
    }

    // 2. Furniture & Components (PRIORITY OVER OPENINGS & WALLS)
    // 解决“点击组件容易点到门上导致无法拖动”问题：在家具组件可视区域内绝对优先选中组件
    for (let i = this.engine.furniture.length - 1; i >= 0; i--) {
      const f = this.engine.furniture[i];
      const { lx, ly } = this.getFurnitureLocalCoords(pt, f);
      if (Math.abs(lx) <= f.width / 2 + 30 && Math.abs(ly) <= f.height / 2 + 30) {
        return { type: 'furniture', id: f.id, obj: f };
      }
    }

    // 3. Openings (Doors & Windows) - 精准墙面几何检测，绝不向室内外滥判定
    for (const op of [...this.engine.doors, ...this.engine.windows]) {
      const wall = this.engine.walls.find(w => w.id === op.wallId);
      if (!wall) continue;

      const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
      if (wallLen < 1) continue;

      const proj = FloorPlanEngine.projectPointToSegment(pt, wall.p1, wall.p2);
      const wallThickness = wall.thickness || 240;

      // 必须贴在墙体厚度范围内 (<= 墙厚/2 + 35mm)
      if (proj.dist <= (wallThickness / 2 + 35)) {
        // 投影位置 t 必须落在门窗宽度的一半范围内
        const halfWidthRatio = (op.width / 2) / wallLen;
        if (Math.abs(proj.t - op.t) <= halfWidthRatio + 0.03) {
          return { type: 'opening', id: op.id, obj: op };
        }
      }
    }

    // 4. Wall Endpoints (Vertices for dragging corners)
    for (const w of this.engine.walls) {
      if (w.type === 'virtual') continue;
      if (FloorPlanEngine.dist(pt, w.p1) < 260) {
        return { type: 'wall_endpoint', wall: w, pointKey: 'p1', pt: w.p1, id: w.id };
      }
      if (FloorPlanEngine.dist(pt, w.p2) < 260) {
        return { type: 'wall_endpoint', wall: w, pointKey: 'p2', pt: w.p2, id: w.id };
      }
    }

    // 5. Walls (Body)
    for (const w of this.engine.walls) {
      const proj = FloorPlanEngine.projectPointToSegment(pt, w.p1, w.p2);
      if (proj.dist <= (w.thickness / 2) + 120 && proj.t >= 0 && proj.t <= 1) {
        return { type: 'wall', id: w.id, obj: w };
      }
    }

    // 6. Rooms
    for (const r of this.engine.rooms) {
      if (r.polygon && FloorPlanEngine.isPointInPolygon(pt, r.polygon)) {
        return { type: 'room', id: r.id, obj: r };
      }
    }

    // Blueprint
    const bp = this.engine.blueprint;
    if (bp.image && bp.visible && !bp.locked) {
      const scaleFactor = bp.scale * bp.mmPerPixel;
      const bpW = bp.image.width * scaleFactor;
      const bpH = bp.image.height * scaleFactor;
      if (pt.x >= bp.x && pt.x <= bp.x + bpW && pt.y >= bp.y && pt.y <= bp.y + bpH) {
        return { type: 'blueprint', id: 'bp', obj: bp };
      }
    }

    return null;
  }

  setTool(tool) {
    this.currentTool = tool;
    if (tool !== 'select' && this.renderer.floorPreviewMode) {
      this.renderer.floorPreviewMode = false;
      this.closePropCard();
    }
    this.pendingOpeningType = null;
    this.pendingComponentType = null;
    this.pendingFurnitureItem = null;
    this.wallDrawStart = null;
    this.rectDrawStart = null;
    this.renderer.activeDrawLine = null;
    this.renderer.dragGhost = null;
    this.renderer.snapIndicator = null;
    this.renderer.alignmentGuide = null; this.renderer.alignmentGuides = [];
    document.querySelectorAll('.furnish-card').forEach(c => c.classList.remove('active'));

    // Update menu button active states
    document.querySelectorAll('.menu-btn').forEach(btn => btn.classList.remove('active'));
    if (tool === 'select') document.getElementById('btnToolSelect').classList.add('active');
    if (tool === 'move') document.getElementById('btnToolMove').classList.add('active');

    // Update draw item active states in sidebar
    document.querySelectorAll('.draw-item[data-action]').forEach(item => {
      item.classList.toggle('active', item.dataset.action === tool);
    });

    const wrapper = this.canvas.parentElement;
    wrapper.classList.remove('cursor-draw', 'cursor-move');
    this.canvas.style.cursor = '';
    if (tool === 'draw_wall' || tool === 'draw_rect') {
      if (!this.currentWallThickness) this.currentWallThickness = 240;
      if (!this.currentWallType) this.currentWallType = 'bearing';
      wrapper.classList.add('cursor-draw');
    } else if (tool === 'move') {
      wrapper.classList.add('cursor-move');
    }

    this.renderer.render();
  }

  cancelActiveOperation() {
    // 若正在连续画墙，按 Esc / 右键先断掉当前连线并保持在画墙工具中；再次按才退出到选择工具
    if (this.currentTool === 'draw_wall' && this.wallDrawStart) {
      this.wallDrawStart = null;
      this.wallChainStart = null;
      this.renderer.activeDrawLine = null;
      this.renderer.snapIndicator = null;
      this.renderer.alignmentGuide = null;
      this.renderer.alignmentGuides = [];
      this.renderer.render();
      return;
    }
    this.wallDrawStart = null;
    this.wallChainStart = null;
    this.rectDrawStart = null;
    this.pendingOpeningType = null;
    this.pendingComponentType = null;
    this.pendingFurnitureItem = null;
    this.draggingSidebarItem = null;
    this.isCalibrating = false;
    this.draggingItem = null;
    this.activeTransform = null;
    this.isMovingAll = false;
    this.renderer.dragGhost = null;
    this.renderer.calibrationPoints = [];
    this.renderer.activeDrawLine = null;
    this.renderer.snapIndicator = null;
    this.renderer.alignmentGuide = null; this.renderer.alignmentGuides = [];
    this.renderer.rotationSnapInfo = null;
    this.renderer.selectedItem = null;
    this.closePropCard();
    document.querySelectorAll('.draw-item, .furnish-card').forEach(i => i.classList.remove('active'));

    // Close any open popovers
    document.querySelectorAll('.menu-floating-panel').forEach(p => p.classList.remove('open'));
    const popVisible = document.getElementById('popoverVisible');
    if (popVisible) popVisible.classList.remove('open');
    const popBeautify = document.getElementById('popoverBeautify');
    if (popBeautify) popBeautify.classList.remove('open');

    // Switch tool to 'select'
    this.setTool('select');
    this.canvas.style.cursor = '';
    this.renderer.render();
  }

  // --- Openings & Components Placement (Click to pick, follow mouse, click to place) ---
  selectOpeningForPlacement(type) {
    this.setTool('select');
    this.pendingOpeningType = type;
    this.pendingComponentType = null;
    this.pendingFurnitureItem = null;
    document.querySelectorAll('.draw-item').forEach(item => {
      item.classList.toggle('active', item.dataset.opening === type);
    });
    document.querySelectorAll('.furnish-card').forEach(c => c.classList.remove('active'));
    this.canvas.style.cursor = 'crosshair';
  }

  placePendingOpening(worldPt) {
    let minD = Infinity;
    let targetWall = null;
    let projT = 0.5;

    for (const w of this.engine.walls) {
      const proj = FloorPlanEngine.projectPointToSegment(worldPt, w.p1, w.p2);
      if (proj.dist < minD) {
        minD = proj.dist;
        targetWall = w;
        projT = proj.t;
      }
    }

    if (targetWall && minD < (targetWall.thickness || 240) + 700) {
      let defaultW = 900;
      const opType = this.pendingOpeningType;
      if (['double_door', 'sliding_door', 'bay_window', 'french_window'].includes(opType)) defaultW = 1500;
      if (opType === 'opening') defaultW = 2000;
      if (opType === 'doorway') defaultW = 1200;

      const wallLen = Math.hypot(targetWall.p2.x - targetWall.p1.x, targetWall.p2.y - targetWall.p1.y);
      const halfWRatio = (defaultW / 2) / wallLen;
      projT = Math.max(Math.min(0.5, halfWRatio), Math.min(Math.max(0.5, 1 - halfWRatio), projT));

      const dx = targetWall.p2.x - targetWall.p1.x;
      const dy = targetWall.p2.y - targetWall.p1.y;
      const yLocal = ((worldPt.y - targetWall.p1.y) * dx - (worldPt.x - targetWall.p1.x) * dy) / (wallLen || 1);
      const flipY = (opType === 'bay_window') ? (yLocal > 0) : (yLocal < 0);

      const op = this.engine.addOpening(opType, targetWall.id, projT, defaultW);
      op.flipY = flipY;
      if (opType === 'entry_door') {
        this.engine.doors.forEach(d => { d.isEntrance = false; });
        op.isEntrance = true;
      }

      this.renderer.selectedItem = { type: 'opening', id: op.id, obj: op };
      this.updateSelectionPropertyCard(this.renderer.selectedItem);
      this.pendingOpeningType = null;
      this.renderer.dragGhost = null;
      document.querySelectorAll('.draw-item').forEach(i => i.classList.remove('active'));
      this.canvas.style.cursor = 'default';
      this.renderer.render();
    }
  }

  selectComponentForPlacement(type) {
    this.setTool('select');
    this.pendingComponentType = type;
    this.pendingOpeningType = null;
    this.pendingFurnitureItem = null;
    document.querySelectorAll('.draw-item').forEach(item => {
      item.classList.toggle('active', item.dataset.component === type);
    });
    document.querySelectorAll('.furnish-card').forEach(c => c.classList.remove('active'));
    this.canvas.style.cursor = 'crosshair';
  }

  placePendingComponent(worldPt) {
    const type = this.pendingComponentType;
    const rot = (this.renderer.dragGhost && this.renderer.dragGhost.rotation) || 0;
    const posX = this.renderer.dragGhost ? this.renderer.dragGhost.x : Math.round(worldPt.x);
    const posY = this.renderer.dragGhost ? this.renderer.dragGhost.y : Math.round(worldPt.y);
    const furn = this.engine.addFurniture(type, posX, posY, rot);
    this.pendingComponentType = null;
    this.renderer.dragGhost = null;
    this.renderer.alignmentGuide = null;
    document.querySelectorAll('.draw-item').forEach(i => i.classList.remove('active'));
    this.canvas.style.cursor = 'default';
    if (furn) {
      this.renderer.selectedItem = { type: 'furniture', id: furn.id, obj: furn };
      this.updateSelectionPropertyCard(this.renderer.selectedItem);
    }
    this.renderer.render();
  }

  selectFurnitureForPlacement(itemId) {
    this.setTool('select');
    const catItem = FURNITURE_CATALOG.find(it => it.id === itemId);
    if (!catItem) return;
    this.pendingFurnitureItem = catItem;
    this.pendingOpeningType = null;
    this.pendingComponentType = null;
    document.querySelectorAll('.draw-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.furnish-card').forEach(c => {
      c.classList.toggle('active', c.dataset.id === itemId);
    });
    this.canvas.style.cursor = 'crosshair';
    this.renderer.render();
  }

  placePendingFurniture(worldPt) {
    if (!this.pendingFurnitureItem) return;
    const catItem = this.pendingFurnitureItem;
    const rot = (this.renderer.dragGhost && this.renderer.dragGhost.rotation) || 0;
    const posX = this.renderer.dragGhost ? this.renderer.dragGhost.x : Math.round(worldPt.x);
    const posY = this.renderer.dragGhost ? this.renderer.dragGhost.y : Math.round(worldPt.y);
    const furn = this.engine.addFurniture(catItem.id, posX, posY, rot);
    this.pendingFurnitureItem = null;
    this.renderer.dragGhost = null;
    this.renderer.alignmentGuide = null;
    document.querySelectorAll('.furnish-card').forEach(c => c.classList.remove('active'));
    this.canvas.style.cursor = 'default';
    if (furn) {
      this.renderer.selectedItem = { type: 'furniture', id: furn.id, obj: furn };
      this.updateSelectionPropertyCard(this.renderer.selectedItem);
    }
    this.renderer.render();
  }

  // --- Top Menu Events (#menu) ---
  setupMenuEvents() {
    // Select tool
    document.getElementById('btnToolSelect').onclick = () => this.setTool('select');
    // Move floorplan tool
    document.getElementById('btnToolMove').onclick = () => this.setTool('move');

    // Rotate button & floating panel
    const btnMenuRotate = document.getElementById('btnMenuRotate');
    const panelRotate = document.getElementById('panelRotate');
    btnMenuRotate.onclick = e => {
      e.stopPropagation();
      panelRotate.classList.toggle('open');
      document.getElementById('panelScale').classList.remove('open');
    };

    // Rotate tabs (户型图旋转 / 底图旋转)
    const tabRotateFloorplan = document.getElementById('tabRotateFloorplan');
    const tabRotateBitmap = document.getElementById('tabRotateBitmap');
    tabRotateFloorplan.onclick = () => {
      this.activeRotateTab = 'floorplan';
      tabRotateFloorplan.classList.add('active');
      tabRotateBitmap.classList.remove('active');
    };
    tabRotateBitmap.onclick = () => {
      this.activeRotateTab = 'bitmap';
      tabRotateBitmap.classList.add('active');
      tabRotateFloorplan.classList.remove('active');
    };

    // Quick rotate buttons
    document.getElementById('btnQuickRotMinus90').onclick = () => this.quickRotate(-90);
    document.getElementById('btnQuickRot90').onclick = () => this.quickRotate(90);
    document.getElementById('btnQuickRot180').onclick = () => this.quickRotate(180);
    document.getElementById('btnConfirmRotate').onclick = () => this.applyRotate();

    // Scale button & floating panel
    const btnMenuScale = document.getElementById('btnMenuScale');
    const panelScale = document.getElementById('panelScale');
    btnMenuScale.onclick = e => {
      e.stopPropagation();
      panelScale.classList.toggle('open');
      document.getElementById('panelRotate').classList.remove('open');
    };
    document.getElementById('btnConfirmScale').onclick = () => this.applyScale();

    // Flip horizontal & vertical
    document.getElementById('btnFlipH').onclick = () => this.flipFloorplan('H');
    document.getElementById('btnFlipV').onclick = () => this.flipFloorplan('V');

    // Undo, Redo, Save, Clear
    document.getElementById('btnUndo').onclick = () => this.undo();
    document.getElementById('btnRedo').onclick = () => this.redo();
    document.getElementById('btnSave').onclick = () => {
      this.autoSave();
      alert("户型图已保存成功！系统已启用每10秒全自动保存。");
    };
    document.getElementById('btnClear').onclick = () => {
      this.openDangerClearModal();
    };

    // Top Bar Parameter Badges & Actions (新建户型 | 调整当前户型 | 比例尺)
    const btnNew = document.getElementById('btnNewFloorplanTrigger');
    if (btnNew) btnNew.onclick = () => this.openNewFloorplanModal();
    const btnAdjust = document.getElementById('btnAdjustCurrentLayout');
    if (btnAdjust) btnAdjust.onclick = () => this.openAdjustCurrentLayoutModal();
    const btnRuler = document.getElementById('btnToggleRuler');
    if (btnRuler) btnRuler.onclick = () => this.toggleRuler();
    const btnEditInfo = document.getElementById('btnEditProjectInfo');
    if (btnEditInfo) btnEditInfo.onclick = () => this.openProjectInfoModal();
    const badgeCommunity = document.getElementById('badgeCommunity');
    if (badgeCommunity) badgeCommunity.onclick = () => this.openProjectInfoModal();
    const badgeLayout = document.getElementById('badgeLayout');
    if (badgeLayout) badgeLayout.onclick = () => this.openProjectInfoModal();
    const btnSubEditParams = document.getElementById('btnSubEditParams');
    if (btnSubEditParams) btnSubEditParams.onclick = () => this.openProjectInfoModal();
    const projectTitle = document.getElementById('projectTitle');
    if (projectTitle) projectTitle.onclick = () => this.openProjectInfoModal();
    const badgeTargetArea = document.getElementById('badgeTargetArea');
    if (badgeTargetArea) badgeTargetArea.onclick = () => this.openProjectInfoModal();
    const btnAutoFurnishAll = document.getElementById('btnAutoFurnishAll');
    if (btnAutoFurnishAll) btnAutoFurnishAll.onclick = () => this.autoFurnishAllRooms();

    // Storey Manager bindings (楼层管理：向上添加+1F、向下添加-1F，不含0层，复制户型图到指定楼层)
    const storeyWidget = document.getElementById('storeyWidget');
    if (storeyWidget) storeyWidget.onclick = (e) => { e.stopPropagation(); this.toggleStoreyManager(); };
    const btnQuickCopyFloor = document.getElementById('btnQuickCopyFloor');
    if (btnQuickCopyFloor) btnQuickCopyFloor.onclick = (e) => { e.stopPropagation(); this.openCopyFloorModal(); };
    const btnAddFloorUp = document.getElementById('btnAddFloorUp');
    if (btnAddFloorUp) btnAddFloorUp.onclick = () => this.addStoreyDirectional('up');
    const btnAddFloorDown = document.getElementById('btnAddFloorDown');
    if (btnAddFloorDown) btnAddFloorDown.onclick = () => this.addStoreyDirectional('down');
    const btnCopyFloorToTarget = document.getElementById('btnCopyFloorToTarget');
    if (btnCopyFloorToTarget) btnCopyFloorToTarget.onclick = () => {
      this.closeStoreyManager();
      this.openCopyFloorModal();
    };

    // Empty state card buttons
    const btnEmptyCreate = document.getElementById('btnEmptyCreate');
    if (btnEmptyCreate) btnEmptyCreate.onclick = () => this.openProjectInfoModal();
    const btnEmptyLoad = document.getElementById('btnEmptyLoadDemo');
    if (btnEmptyLoad) btnEmptyLoad.onclick = () => this.loadDemoHouse();

    // Right Menu Actions: Download, Generate, Rules, Info (无需登录及退出功能)
    const btnDownload = document.getElementById('btnDownload');
    if (btnDownload) btnDownload.onclick = () => this.openDownloadModal();
    const btnExit = document.getElementById('btnExit');
    if (btnExit) {
      btnExit.onclick = () => {
        if (confirm("确定要退出平面图编辑器吗？")) {
          window.close();
        }
      };
    }
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate) {
      btnGenerate.onclick = () => {
        if (this.engine.saveCurrentFloorState) this.engine.saveCurrentFloorState();
        const validFloors = this.exporter.getValidFloors();
        if (validFloors.length > 1) {
          alert(`🏢 多层平面图生成成功！共 ${validFloors.length} 层（${validFloors.join('、')}）。\n导出时将包含【每一层的独立图纸】+【多层合并在同一张的总览大图】！`);
        } else {
          alert("平面图已成功生成并校验！您可点击【下载】导出高清图纸。");
        }
        this.openDownloadModal();
      };
    }
    const btnVR = document.getElementById('btnVR');
    if (btnVR) {
      btnVR.onclick = () => {
        alert("当前为独立免 VR 户型绘制模式，已全面解除对三维点云与VR全景源文件的依赖！");
      };
    }
    document.getElementById('btnDrawRule').onclick = () => {
      alert("【绘制规则小贴士】\n1. 快捷键适用左手人体工学: Q墙体, W房间, E选择, A单门, S双门, D推拉门, F窗户, Z垭口。\n2. 矩形建房按住拖拽或两点点击即可生成标准闭合房间。\n3. 右键按住拖拽可随时漫游画布，单击右键立即取消工具。");
    };
    document.getElementById('btnPlanInfo').onclick = () => {
      let area = 0;
      for (const r of this.engine.rooms) area += (r.area || 0);
      alert(`【平面图信息】\n户型名称: ${document.getElementById('projectTitle').textContent}\n模型版本: 2026-11-06\n总使用面积: ${area.toFixed(1)} ㎡\n墙体数量: ${this.engine.walls.length} 面\n房间数量: ${this.engine.rooms.length} 间`);
    };
    const btnOpenTour = document.getElementById('btnOpenTour');
    if (btnOpenTour) {
      btnOpenTour.onclick = () => this.startTour(0);
    }

    // Multi-language dropdown (右上角多国语言切换)
    const btnLangDropdown = document.getElementById('btnLangDropdown');
    const panelLangDropdown = document.getElementById('panelLangDropdown');
    if (btnLangDropdown && panelLangDropdown) {
      btnLangDropdown.onclick = (e) => {
        e.stopPropagation();
        panelLangDropdown.classList.toggle('open');
      };

      document.querySelectorAll('.lang-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const lang = item.dataset.lang;
          if (window.i18n) {
            window.i18n.setLocale(lang);
          }
          panelLangDropdown.classList.remove('open');
        };
      });
    }
  }

  // --- Rotate & Scale Operations ---
  quickRotate(deg) {
    document.getElementById('inputRotateDeg').value = deg;
    this.applyRotate();
  }

  applyRotate() {
    const deg = parseFloat(document.getElementById('inputRotateDeg').value) || 0;
    const rad = deg * Math.PI / 180;
    document.getElementById('panelRotate').classList.remove('open');

    if (this.activeRotateTab === 'bitmap') {
      // Rotate reference blueprint
      this.engine.blueprint.rotation = (this.engine.blueprint.rotation + deg) % 360;
      this.renderer.render();
      return;
    }

    // Rotate all floorplan elements around center
    const bbox = this.exporter.getBoundingBox();
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    const rotPoint = (pt) => {
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return {
        x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
      };
    };

    for (const w of this.engine.walls) {
      w.p1 = rotPoint(w.p1);
      w.p2 = rotPoint(w.p2);
    }
    for (const r of this.engine.rooms) {
      if (r.polygon) r.polygon = r.polygon.map(rotPoint);
      if (r.center) r.center = rotPoint(r.center);
    }
    for (const f of this.engine.furniture) {
      const p = rotPoint({ x: f.x, y: f.y });
      f.x = p.x;
      f.y = p.y;
      f.rotation = (f.rotation + deg) % 360;
    }

    this.engine.recordHistory();
    this.renderer.render();
  }

  applyScale() {
    const ratio = parseFloat(document.getElementById('inputScaleRatio').value) || 1.0;
    if (ratio <= 0) return;
    document.getElementById('panelScale').classList.remove('open');

    const linearScale = Math.sqrt(ratio);
    const bbox = this.exporter.getBoundingBox();
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    const scalePoint = (pt) => ({
      x: cx + (pt.x - cx) * linearScale,
      y: cy + (pt.y - cy) * linearScale
    });

    for (const w of this.engine.walls) {
      w.p1 = scalePoint(w.p1);
      w.p2 = scalePoint(w.p2);
    }
    for (const r of this.engine.rooms) {
      if (r.polygon) r.polygon = r.polygon.map(scalePoint);
      if (r.center) r.center = scalePoint(r.center);
    }
    for (const f of this.engine.furniture) {
      const p = scalePoint({ x: f.x, y: f.y });
      f.x = p.x;
      f.y = p.y;
      f.width *= linearScale;
      f.height *= linearScale;
    }

    this.engine.autoDetectRooms();
    this.engine.recordHistory();
    this.renderer.render();
  }

  flipFloorplan(axis) {
    const bbox = this.exporter.getBoundingBox();
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;

    for (const w of this.engine.walls) {
      if (axis === 'H') {
        w.p1.x = 2 * cx - w.p1.x;
        w.p2.x = 2 * cx - w.p2.x;
      } else {
        w.p1.y = 2 * cy - w.p1.y;
        w.p2.y = 2 * cy - w.p2.y;
      }
    }
    for (const r of this.engine.rooms) {
      if (r.polygon) {
        r.polygon.forEach(pt => {
          if (axis === 'H') pt.x = 2 * cx - pt.x;
          else pt.y = 2 * cy - pt.y;
        });
      }
      if (r.center) {
        if (axis === 'H') r.center.x = 2 * cx - r.center.x;
        else r.center.y = 2 * cy - r.center.y;
      }
    }
    for (const f of this.engine.furniture) {
      if (axis === 'H') {
        f.x = 2 * cx - f.x;
        f.flipH = !f.flipH;
      } else {
        f.y = 2 * cy - f.y;
        f.flipV = !f.flipV;
      }
    }

    this.engine.autoDetectRooms();
    this.engine.recordHistory();
    this.renderer.render();
  }

  undo() {
    if (this.engine.undo()) this.renderer.render();
  }

  redo() {
    if (this.engine.redo()) this.renderer.render();
  }

  // --- Left Sidebar (Layout 2) Events ---
  switchSidebarTab(tab) {
    if (this.renderer.floorPreviewMode) {
      this.renderer.floorPreviewMode = false;
    }
    this.currentSidebarTab = tab;
    this.renderer.activeTab = tab;
    document.querySelectorAll('.app-sidebar-tab-item').forEach(b => {
      b.classList.toggle('app-sidebar-tab-item--active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.sidebar-panel-view').forEach(p => p.classList.remove('active'));
    this.renderer.renderMode = 'color'; // 始终保持纯正彩绘建筑质感，墙体宽度与质感无论在直接绘制、临摹还是家具模式下完全一致
    if (tab === 'draw') {
      document.getElementById('sidebarPanelDraw')?.classList.add('active');
    } else if (tab === 'furnish') {
      document.getElementById('sidebarPanelFurnish')?.classList.add('active');
    } else if (tab === 'library') {
      document.getElementById('sidebarPanelLibrary')?.classList.add('active');
      // 进入临摹面板：默认直接激活 240mm 承重外墙画墙工具，与直接绘制保持100%一致逻辑与外观
      this.currentWallType = 'bearing';
      this.currentWallThickness = 240;
      this.engine.defaultWallType = 'bearing';
      this.engine.defaultWallThickness = 240;
      document.querySelectorAll('.wall-type-item').forEach(i => {
        i.classList.toggle('active', i.dataset.wtype === 'bearing');
      });
      document.querySelectorAll('.draw-item[data-action="draw_wall"]').forEach(b => {
        b.classList.add('active');
      });
      document.querySelectorAll('.draw-item[data-action="draw_rect"]').forEach(b => {
        b.classList.remove('active');
      });
      this.setTool('draw_wall');
    }
    this.renderer.render();
  }

  setupSidebarEvents() {
    // Tab switching
    document.querySelectorAll('.app-sidebar-tab-item').forEach(btn => {
      btn.onclick = () => {
        this.switchSidebarTab(btn.dataset.tab);
      };
    });

    // Draw tools (draw_wall, draw_rect)
    document.querySelectorAll('.draw-item[data-action]').forEach(item => {
      item.onclick = () => {
        const action = item.dataset.action;
        this.setTool(action);
      };
    });

    // Wall types (bearing 240, normal 120, low 100, virtual)
    document.querySelectorAll('.wall-type-item').forEach(item => {
      item.onclick = () => {
        const wtype = item.dataset.wtype;
        document.querySelectorAll('.wall-type-item').forEach(i => {
          i.classList.toggle('active', i.dataset.wtype === wtype);
        });
        this.engine.defaultWallType = wtype;
        let thick = 240;
        if (wtype === 'bearing') thick = 240;
        else if (wtype === 'normal') thick = 120;
        else if (wtype === 'low') thick = 100;
        else if (wtype === 'virtual') thick = 100;
        this.engine.defaultWallThickness = thick;
        this.currentWallType = wtype;
        this.currentWallThickness = thick;
      };
    });

    // Openings (singleDoor, etc.) - support both click and drag onto wall
    document.querySelectorAll('.draw-item[data-opening]').forEach(item => {
      item.setAttribute('draggable', 'true');
      item.onclick = () => {
        const opType = item.dataset.opening;
        this.selectOpeningForPlacement(opType);
      };
      item.addEventListener('dragstart', e => {
        const opType = item.dataset.opening;
        const payload = JSON.stringify({ type: 'opening', opType });
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copy';
        this.draggingSidebarItem = { type: 'opening', opType };
      });
      item.addEventListener('dragend', () => {
        this.draggingSidebarItem = null;
        this.renderer.dragGhost = null;
        this.renderer.render();
      });
    });

    // Components (pillar / stairs) - 支持点击放置与拖拽放置
    document.querySelectorAll('.draw-item[data-component]').forEach(item => {
      item.setAttribute('draggable', 'true');
      item.onclick = () => {
        const compType = item.dataset.component;
        this.selectComponentForPlacement(compType);
      };
      item.addEventListener('dragstart', e => {
        const payload = JSON.stringify({ type: 'furniture', id: item.dataset.component });
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copy';
        this.draggingSidebarItem = { type: 'furniture', id: item.dataset.component };
      });
      item.addEventListener('dragend', () => {
        this.draggingSidebarItem = null;
        this.renderer.dragGhost = null;
        this.renderer.render();
      });
    });

    // Reference Blueprint Tracing Section
    const btnUpload = document.getElementById('btnUploadLocalBp');
    if (btnUpload) {
      btnUpload.onclick = () => document.getElementById('blueprintFileInput').click();
    }
    const dropArea = document.getElementById('bpDropArea');
    if (dropArea) {
      dropArea.ondragover = e => { e.preventDefault(); dropArea.style.borderColor = '#0284c7'; };
      dropArea.ondragleave = e => { e.preventDefault(); dropArea.style.borderColor = '#94a3b8'; };
      dropArea.ondrop = e => {
        e.preventDefault();
        dropArea.style.borderColor = '#94a3b8';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.loadBlueprintFile(e.dataTransfer.files[0]);
        }
      };
    }
    const fileInput = document.getElementById('blueprintFileInput');
    if (fileInput) {
      fileInput.onchange = e => {
        if (e.target.files.length > 0) this.loadBlueprintFile(e.target.files[0]);
      };
    }
    const btnTest = document.getElementById('btnLoadTestBp');
    if (btnTest) {
      btnTest.onclick = () => this.loadSampleBlueprint();
    }
    const btnCalib = document.getElementById('btnCalibrateScale');
    if (btnCalib) {
      btnCalib.onclick = () => this.startScaleCalibration();
    }

    const btnFloorTrans = document.getElementById('btnToggleFloorTransparency');
    if (btnFloorTrans) {
      btnFloorTrans.onclick = () => {
        const modes = ['transparent', 'hidden', 'opaque'];
        const labels = {
          'transparent': window.i18n ? window.i18n.t('bp_floor_mode_trans', '地板透视: 开') : '地板透视: 开',
          'hidden': window.i18n ? window.i18n.t('bp_floor_mode_hidden', '地板: 隐藏') : '地板: 隐藏',
          'opaque': window.i18n ? window.i18n.t('bp_floor_mode_opaque', '地板: 正常') : '地板: 正常'
        };
        const curMode = this.renderer.floorTransparencyMode || 'transparent';
        const nextIdx = (modes.indexOf(curMode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        this.renderer.floorTransparencyMode = nextMode;
        btnFloorTrans.textContent = labels[nextMode];
        this.renderer.render();
      };
    }

    document.getElementById('bpOpacityRange').oninput = e => {
      const val = parseInt(e.target.value) / 100;
      this.engine.blueprint.opacity = val;
      document.getElementById('bpOpacityText').textContent = e.target.value + '%';
      this.renderer.render();
    };
    document.getElementById('btnRotateBp').onclick = () => {
      this.engine.blueprint.rotation = (this.engine.blueprint.rotation + 90) % 360;
      this.renderer.render();
    };
    document.getElementById('btnLockBp').onclick = e => {
      this.engine.blueprint.locked = !this.engine.blueprint.locked;
      e.target.textContent = this.engine.blueprint.locked ? '解锁底图' : '锁定底图';
      this.renderer.render();
    };
    document.getElementById('btnToggleBp').onclick = e => {
      this.engine.blueprint.visible = !this.engine.blueprint.visible;
      e.target.textContent = this.engine.blueprint.visible ? '隐藏底图' : '显示底图';
      this.renderer.render();
    };
  }

  // --- Bottom-Right Tools & Viewport Events ---
  setupBottomToolEvents() {
    // Viewport controls
    document.getElementById('vpZoomIn').onclick = () => {
      this.engine.viewport.zoom = Math.min(1.5, this.engine.viewport.zoom * 1.25);
      document.getElementById('vpZoomRatio').textContent = Math.round(this.engine.viewport.zoom * 800) + '%';
      this.renderer.render();
    };
    document.getElementById('vpZoomOut').onclick = () => {
      this.engine.viewport.zoom = Math.max(0.015, this.engine.viewport.zoom * 0.8);
      document.getElementById('vpZoomRatio').textContent = Math.round(this.engine.viewport.zoom * 800) + '%';
      this.renderer.render();
    };
    document.getElementById('vpFit').onclick = () => this.zoomToFit();

    // Visible popover
    const toolVisible = document.getElementById('toolVisible');
    const popoverVisible = document.getElementById('popoverVisible');
    toolVisible.onclick = e => {
      e.stopPropagation();
      popoverVisible.classList.toggle('open');
      document.getElementById('popoverBeautify').classList.remove('open');
    };

    document.getElementById('chkDim').onchange = e => { this.renderer.showDimensions = e.target.checked; this.renderer.render(); };
    document.getElementById('chkRoom').onchange = e => { this.renderer.showRoomLabels = e.target.checked; this.renderer.render(); };
    document.getElementById('chkGrid').onchange = e => { this.renderer.showGrid = e.target.checked; this.renderer.render(); };
    document.getElementById('chkFloor').onchange = e => { this.renderer.render(); };
    document.getElementById('chkFurn').onchange = e => { this.renderer.showFurniture = e.target.checked; this.renderer.render(); };
    document.getElementById('chkBp').onchange = e => { this.renderer.showBlueprint = e.target.checked; this.renderer.render(); };

    // Beautify popover
    const toolBeautify = document.getElementById('toolBeautify');
    const popoverBeautify = document.getElementById('popoverBeautify');
    toolBeautify.onclick = e => {
      e.stopPropagation();
      popoverBeautify.classList.toggle('open');
      document.getElementById('popoverVisible').classList.remove('open');
    };

    document.getElementById('btnApplyBeautify').onclick = () => {
      const outer = parseInt(document.getElementById('beautifyOuter').value) || 240;
      const inner = parseInt(document.getElementById('beautifyInner').value) || 120;
      for (const w of this.engine.walls) {
        if (w.type === 'bearing') w.thickness = outer;
        else if (w.type === 'normal') w.thickness = inner;
      }
      popoverBeautify.classList.remove('open');
      this.engine.recordHistory();
      this.renderer.render();
      alert("已成功按照指定厚度一键美化外墙与内隔墙！");
    };

    // Check tool
    document.getElementById('toolCheck').onclick = () => {
      let issues = [];
      if (this.engine.walls.length === 0) issues.push("当前画布暂无墙体数据");
      if (this.engine.doors.length === 0) issues.push("未设置入户门或开门洞口");
      if (issues.length === 0) {
        alert("✨ 智能检测通过！户型闭合完整，开门与空间采光达标。");
      } else {
        alert("⚠️ 智能检测提示：\n" + issues.join("\n"));
      }
    };

    // Selected Property Card close
    document.getElementById('btnClosePropCard').onclick = () => this.closePropCard();
  }

  // --- Dynamic Selected Property Card ---
  updateSelectionPropertyCard(hit) {
    const card = document.getElementById('selectedPropCard');
    const body = document.getElementById('propCardBody');
    const title = document.getElementById('propCardTitle');

    if (!hit) {
      card.style.display = 'none';
      if (this.renderer.floorPreviewMode) {
        this.renderer.floorPreviewMode = false;
        this.renderer.render();
      }
      return;
    }

    if (hit.type !== 'room' && this.renderer.floorPreviewMode) {
      this.renderer.floorPreviewMode = false;
      this.renderer.render();
    }

    card.style.display = 'block';

    if (hit.type === 'wall') {
      const w = this.engine.walls.find(item => item.id === hit.id);
      if (!w) return;
      const len = Math.round(Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y));
      title.textContent = "墙体属性";
      body.innerHTML = `
        <div class="prop-card-row">
          <span>类型:</span>
          <select id="editWType">
            <option value="bearing" ${w.type === 'bearing' ? 'selected' : ''}>承重墙</option>
            <option value="normal" ${w.type === 'normal' ? 'selected' : ''}>普通墙</option>
            <option value="low" ${w.type === 'low' ? 'selected' : ''}>矮墙</option>
            <option value="virtual" ${w.type === 'virtual' ? 'selected' : ''}>虚拟墙</option>
          </select>
        </div>
        <div class="prop-card-row">
          <span>厚度:</span>
          <input type="number" id="editWThick" value="${w.thickness}"> mm
        </div>
        <div class="prop-card-row">
          <span>长度:</span>
          <b>${len} mm</b>
        </div>
        <button class="btn-prop-del" onclick="app.deleteSelected()">删除墙体</button>
      `;
      document.getElementById('editWType').onchange = e => {
        w.type = e.target.value;
        if (w.type === 'bearing') w.thickness = 240;
        else if (w.type === 'normal') w.thickness = 120;
        else if (w.type === 'low') w.thickness = 100;
        else if (w.type === 'virtual') w.thickness = 100;
        w._userSpecifiedType = true;
        this.engine.enforceOuterWallRules();
        const thickInput = document.getElementById('editWThick');
        if (thickInput) thickInput.value = w.thickness;
        this.engine.recordHistory();
        this.renderer.render();
      };
      document.getElementById('editWThick').oninput = e => {
        w.thickness = parseInt(e.target.value) || 240;
        w._userSpecifiedType = true;
        this.engine.recordHistory();
        this.renderer.render();
      };
    } else if (hit.type === 'opening') {
      const op = this.engine.doors.concat(this.engine.windows).find(d => d.id === hit.id);
      if (!op) return;
      title.textContent = "门窗属性";
      const isDoor = ['single_door', 'double_door', 'sliding_door', 'entry_door'].includes(op.type);
      const isEnt = (op.type === 'entry_door' || op.isEntrance);
      body.innerHTML = `
        <div class="prop-card-row">
          <span>宽度:</span>
          <input type="number" id="editOpW" value="${op.width}"> mm
        </div>
        <div class="prop-card-row" style="margin-top: 6px;">
          <button class="unit-btn" style="flex:1;" onclick="app.flipOpening('X')">左右翻转</button>
          <button class="unit-btn" style="flex:1;" onclick="app.flipOpening('Y')">内外翻转</button>
        </div>
        ${isDoor ? `
        <div class="prop-card-row" style="margin-top: 6px;">
          <button class="unit-btn ${isEnt ? 'active' : ''}" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:${isEnt ? '#0284c7' : '#f1f5f9'}; color:${isEnt ? '#fff' : '#0f172a'}; font-weight:600; border:1px solid ${isEnt ? '#0284c7' : '#cbd5e1'};" onclick="app.toggleEntranceDoor('${op.id}')">
            🚶 ${isEnt ? '已设为主入户门 (动线开启)' : '设为主入户门 (人行动线)'}
          </button>
        </div>` : ''}
        <button class="btn-prop-del" onclick="app.deleteSelected()">删除构件</button>
      `;
      document.getElementById('editOpW').oninput = e => {
        op.width = parseInt(e.target.value) || 900;
        this.engine.recordHistory();
        this.renderer.render();
      };
    } else if (hit.type === 'room') {
      const r = this.engine.rooms.find(item => item.id === hit.id);
      if (!r) return;
      title.textContent = "房间功能间";
      body.innerHTML = `
        <div class="prop-card-row">
          <span>名称:</span>
          <div style="display: flex; gap: 6px; flex: 1;">
            <input type="text" id="editRName" value="${r.name || '房间'}" style="flex: 1;">
            <button type="button" class="unit-btn" style="padding: 4px 8px; font-size: 12px; font-weight: 600; white-space: nowrap; color: #0284c7; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 4px; cursor: pointer;" onclick="app.openRoomNamePickerModal(app.engine.rooms.find(x => x.id === '${r.id}'))">🏷️ 选择</button>
          </div>
        </div>
        <div class="prop-card-row">
          <span>面积:</span>
          <b style="color:var(--zq-primary);">${r.area ? r.area.toFixed(1) : '0.0'} ㎡</b>
        </div>
        <div class="prop-card-row align-items-center" style="margin-top: 8px;">
          <span style="font-size: 13px; color: #475569;" data-i18n="prop_floor_material">地面材质:</span>
          <div class="prop-floor-preview-box d-flex align-items-center gap-2 flex-fill" onclick="app.openFloorLibraryModal(app.engine.rooms.find(x => x.id === '${r.id}'))" style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 5px 8px; cursor: pointer; transition: all 0.2s;" title="点击打开地板库更换地面材质">
            <canvas id="propFloorThumbCanvas" width="36" height="36" style="width: 36px; height: 36px; border-radius: 6px; border: 1px solid #e2e8f0; flex-shrink: 0; display: block;"></canvas>
            <div style="flex: 1; min-width: 0;">
              <div id="propFloorNameLabel" style="font-size: 13px; font-weight: 600; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.getFloorTextureDisplayName(r.floorTexture)}</div>
              <div style="font-size: 11px; color: #0284c7; font-weight: 500;">点击更换材质 🎨</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </div>
        </div>
        ${this.renderer.activeTab !== 'furnish' ? `
        <div class="prop-floor-preview-hint" style="margin-top: 8px; padding: 6px 10px; background: ${this.renderer.floorPreviewMode ? '#f0fdf4' : '#f8fafc'}; border: 1px dashed ${this.renderer.floorPreviewMode ? '#86efac' : '#cbd5e1'}; border-radius: 6px; font-size: 11.5px; color: ${this.renderer.floorPreviewMode ? '#166534' : '#64748b'}; line-height: 1.4; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <span style="font-size: 13px;">${this.renderer.floorPreviewMode ? '👁️' : '💡'}</span>
            <span>${this.renderer.floorPreviewMode ? '已临时开启家具预览模式' : '效果请在家具分类页面查看'}</span>
          </div>
          ${this.renderer.floorPreviewMode ? `
          <button type="button" style="border: none; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; cursor: pointer;" onclick="app.exitFloorPreview(event)">恢复绘制</button>
          ` : ''}
        </div>` : ''}
      `;
      // 绘制右侧属性卡片中的地板材质实时缩略图
      this.drawFloorThumbnailToCanvas('propFloorThumbCanvas', r.floorTexture);

      document.getElementById('editRName').oninput = e => {
        r.name = e.target.value;
        r.floorTexture = this.getDefaultFloorForRoom(r.name);
        const nameLbl = document.getElementById('propFloorNameLabel');
        if (nameLbl) nameLbl.textContent = this.getFloorTextureDisplayName(r.floorTexture);
        this.drawFloorThumbnailToCanvas('propFloorThumbCanvas', r.floorTexture);
        if (this.renderer.activeTab !== 'furnish') {
          this.renderer.floorPreviewMode = true;
          const hint = document.querySelector('.prop-floor-preview-hint');
          if (hint) {
            hint.style.background = '#f0fdf4';
            hint.style.borderColor = '#86efac';
            hint.style.color = '#166534';
            hint.innerHTML = `
              <div style="display: flex; align-items: center; gap: 5px;">
                <span style="font-size: 13px;">👁️</span>
                <span>已临时开启家具预览模式</span>
              </div>
              <button type="button" style="border: none; background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; cursor: pointer;" onclick="app.exitFloorPreview(event)">恢复绘制</button>
            `;
          }
        }
        this.renderer.render();
      };
    } else if (hit.type === 'furniture') {
      const f = this.engine.furniture.find(item => item.id === hit.id);
      if (!f) return;
      title.textContent = f.name || "家具构件";
      body.innerHTML = `
        <div class="prop-card-row">
          <span>宽度:</span>
          <input type="number" id="editFW" value="${Math.round(f.width)}" step="50" min="100"> mm
        </div>
        <div class="prop-card-row">
          <span>深度:</span>
          <input type="number" id="editFH" value="${Math.round(f.height)}" step="50" min="100"> mm
        </div>
        <div class="prop-card-row">
          <span>角度:</span>
          <input type="number" id="editFRot" value="${Math.round(f.rotation)}" min="0" max="360"> °
        </div>
        <div class="prop-card-row">
          <button class="unit-btn" style="flex:1;" onclick="app.rotateFurniture(90)">顺时针 90°</button>
          <button class="unit-btn" style="flex:1;" onclick="app.flipFurniture()">水平镜像</button>
        </div>
        <button class="btn-prop-del" onclick="app.deleteSelected()">删除家具</button>
      `;
      document.getElementById('editFW').oninput = e => {
        f.width = Math.max(100, parseInt(e.target.value) || 200);
        this.renderer.render();
      };
      document.getElementById('editFW').onchange = () => this.engine.recordHistory();

      document.getElementById('editFH').oninput = e => {
        f.height = Math.max(100, parseInt(e.target.value) || 200);
        this.renderer.render();
      };
      document.getElementById('editFH').onchange = () => this.engine.recordHistory();

      document.getElementById('editFRot').oninput = e => {
        f.rotation = (parseInt(e.target.value) || 0) % 360;
        this.renderer.render();
      };
      document.getElementById('editFRot').onchange = () => this.engine.recordHistory();
    }
  }

  flipOpening(axis) {
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'opening') {
      const op = this.engine.doors.concat(this.engine.windows).find(d => d.id === this.renderer.selectedItem.id);
      if (op) {
        if (axis === 'X') op.flipX = !op.flipX;
        if (axis === 'Y') op.flipY = !op.flipY;
        this.engine.recordHistory();
        this.renderer.render();
      }
    }
  }

  toggleEntranceDoor(id) {
    const op = this.engine.doors.concat(this.engine.windows).find(d => d.id === id);
    if (!op) return;
    const isCurrentlyEntrance = (op.type === 'entry_door' || op.isEntrance);
    if (isCurrentlyEntrance) {
      op.isEntrance = false;
      if (op.type === 'entry_door') op.type = 'single_door';
    } else {
      this.engine.doors.forEach(d => { d.isEntrance = false; });
      op.isEntrance = true;
    }
    this.engine.recordHistory();
    this.updateSelectionPropertyCard(this.renderer.selectedItem);
    this.renderer.render();
  }

  rotateFurniture(angle) {
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
      const f = this.engine.furniture.find(it => it.id === this.renderer.selectedItem.id);
      if (f) {
        f.rotation = (f.rotation + angle) % 360;
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        this.engine.recordHistory();
        this.renderer.render();
      }
    }
  }

  flipFurniture() {
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'furniture') {
      const f = this.engine.furniture.find(it => it.id === this.renderer.selectedItem.id);
      if (f) {
        f.flipH = !f.flipH;
        this.engine.recordHistory();
        this.renderer.render();
      }
    }
  }

  deleteSelected() {
    if (!this.renderer.selectedItem) return;
    const item = this.renderer.selectedItem;
    if (item.type === 'wall') this.engine.deleteWall(item.id);
    else if (item.type === 'opening') this.engine.deleteOpening(item.id);
    else if (item.type === 'furniture') this.engine.deleteFurniture(item.id);

    if (this.renderer.floorPreviewMode) {
      this.renderer.floorPreviewMode = false;
    }
    this.renderer.selectedItem = null;
    this.closePropCard();
    this.renderer.render();
  }

  closePropCard() {
    document.getElementById('selectedPropCard').style.display = 'none';
    if (this.renderer.floorPreviewMode) {
      this.renderer.floorPreviewMode = false;
      this.renderer.render();
    }
  }

  exitFloorPreview(e) {
    if (e) e.stopPropagation();
    this.renderer.floorPreviewMode = false;
    this.renderer.render();
    if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'room') {
      this.updateSelectionPropertyCard(this.renderer.selectedItem);
    }
  }

  // --- Furniture Catalog Population ---
  populateFurnitureCatalog(targetCat = null) {
    const container = document.getElementById('furnishList');
    if (!container) return;
    if (targetCat) this.currentFurnitureCategory = targetCat;
    if (!this.currentFurnitureCategory) this.currentFurnitureCategory = 'all';

    const cat = this.currentFurnitureCategory;
    container.innerHTML = '';
    const list = cat === 'all'
      ? FURNITURE_CATALOG.filter(it => it.category !== 'structure')
      : FURNITURE_CATALOG.filter(it => it.category === cat);

    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);

    list.forEach(item => {
      const displayName = t(`furn_${item.id}`, item.name);
      const tipTemplate = t('furn_card_tip', '拖拽或点击将【{name}】添加到户型图中');
      const tip = tipTemplate.replace('{name}', displayName);

      const card = document.createElement('div');
      card.className = 'furnish-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('title', tip);
      card.innerHTML = `
        <div class="furnish-thumb">
          <img src="${item.url}" alt="${displayName}" onerror="this.style.display='none'">
        </div>
        <span>${displayName}</span>
      `;

      // 1. Drag & Drop into canvas
      card.addEventListener('dragstart', e => {
        const payload = JSON.stringify({ type: 'furniture', id: item.id });
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
        e.dataTransfer.effectAllowed = 'copy';
        this.draggingSidebarItem = { type: 'furniture', id: item.id };
      });
      card.addEventListener('dragend', () => {
        this.draggingSidebarItem = null;
        this.renderer.dragGhost = null;
        this.renderer.render();
      });

      card.dataset.id = item.id;

      // 2. Click to pick & follow mouse across canvas, click canvas to place
      card.onclick = () => {
        this.selectFurnitureForPlacement(item.id);
      };
      container.appendChild(card);
    });

    if (!this._furnishCatBound) {
      this._furnishCatBound = true;
      document.querySelectorAll('.furnish-cat-btn').forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll('.furnish-cat-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.currentFurnitureCategory = btn.dataset.cat;
          this.populateFurnitureCatalog(btn.dataset.cat);
        };
      });
    }

    // Ensure active class matches current category
    document.querySelectorAll('.furnish-cat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === this.currentFurnitureCategory);
    });
  }

  // --- Reference Blueprint (免VR源文件，上传描摹) ---
  loadBlueprintFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this.engine.blueprint.image = img;
        this.engine.blueprint.x = 0;
        this.engine.blueprint.y = 0;
        this.engine.blueprint.visible = true;
        this.engine.blueprint.locked = false;
        this.zoomToFit();
        this.renderer.render();
        setTimeout(() => {
          if (confirm("户型图底图已加载！是否现在标定物理比例尺？(点击已知尺寸的两端即可 1:1 毫米级对齐)")) {
            this.startScaleCalibration();
          }
        }, 200);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  loadSampleBlueprint() {
    const img = new Image();
    img.onload = () => {
      this.engine.blueprint.image = img;
      this.engine.blueprint.x = 0;
      this.engine.blueprint.y = 0;
      this.engine.blueprint.visible = true;
      this.engine.blueprint.locked = false;
      this.engine.blueprint.mmPerPixel = 10.0;
      this.zoomToFit();
      this.renderer.render();
      alert("标准测试户型图底图已载入！比例尺已标定 (12.00m)。您可以直接切换到【画直线墙】沿着底图描画！");
    };
    img.src = "sample_blueprint.png";
  }

  startScaleCalibration() {
    if (!this.engine.blueprint.image) {
      alert("请先上传或载入一张户型底图后再标定比例尺！");
      return;
    }
    this.isCalibrating = true;
    this.calibrationStep = 1;
    this.calibA = null;
    this.calibB = null;
    this.renderer.calibrationPoints = [];
    alert("【标定比例尺】\n第 1 步：请在底图已知墙体线段的起点点击【点 A】；\n第 2 步：在终点点击【点 B】；\n第 3 步：输入该线段的实际物理长度。");
  }

  handleCalibrationClick(worldPt) {
    if (this.calibrationStep === 1) {
      this.calibA = { x: worldPt.x, y: worldPt.y };
      this.renderer.calibrationPoints = [this.calibA];
      this.calibrationStep = 2;
      this.renderer.render();
    } else if (this.calibrationStep === 2) {
      this.calibB = { x: worldPt.x, y: worldPt.y };
      this.renderer.calibrationPoints = [this.calibA, this.calibB];
      this.calibrationStep = 0;
      this.isCalibrating = false;
      this.renderer.render();
      document.getElementById('modalCalibrate').style.display = 'flex';
    }
  }

  confirmCalibration() {
    const val = parseFloat(document.getElementById('calibrateDistInput').value);
    const unit = document.getElementById('calibrateUnitSelect').value;
    const realMm = unit === 'm' ? val * 1000 : val;

    if (realMm > 0 && this.calibA && this.calibB) {
      this.engine.calibrateScale(this.calibA, this.calibB, realMm);
      document.getElementById('modalCalibrate').style.display = 'none';
      this.renderer.calibrationPoints = [];
      this.renderer.render();
      alert("比例尺标定完成！底图已自动 1:1 毫米级对齐。");
    }
  }

  cancelCalibration() {
    document.getElementById('modalCalibrate').style.display = 'none';
    this.renderer.calibrationPoints = [];
    this.renderer.render();
  }

  // --- Download Modal Preview Flow (先预览，然后下载和关闭) ---
  setupModalEvents() {
    this.currentDownloadStyle = 'color';
    this.currentDownloadFloor = 'all'; // 'all' (合并总览) 或特定楼层 (如 '1F')
    const selFmt = document.getElementById('downloadFormatSelect');
    if (selFmt) selFmt.onchange = () => this.renderDownloadPreview();
    const selRes = document.getElementById('downloadResSelect');
    if (selRes) selRes.onchange = () => this.renderDownloadPreview();
  }

  openDownloadModal() {
    const modal = document.getElementById('modalDownload');
    if (modal) modal.style.display = 'flex';
    if (this.engine.saveCurrentFloorState) this.engine.saveCurrentFloorState();
    this.initDownloadFloorTabs();
    this.renderDownloadPreview();
  }

  closeDownloadModal() {
    const modal = document.getElementById('modalDownload');
    if (modal) modal.style.display = 'none';
  }

  initDownloadFloorTabs() {
    const tabsContainer = document.getElementById('downloadFloorTabs');
    const buttonsContainer = document.getElementById('downloadFloorTabButtons');
    const btnExec = document.getElementById('btnExecuteDownload');
    if (!tabsContainer || !buttonsContainer) return;

    const validFloors = this.exporter.getValidFloors();
    if (validFloors.length <= 1) {
      tabsContainer.style.display = 'none';
      this.currentDownloadFloor = this.engine.currentFloor || '1F';
      if (btnExec) {
        btnExec.innerHTML = '📥 下载户型图';
        btnExec.title = '导出当前户型图高清图纸';
      }
      return;
    }

    // 多层项目：显示楼层切换标签栏，默认选中全楼层合并总览
    tabsContainer.style.display = 'flex';
    this.currentDownloadFloor = 'all';
    if (btnExec) {
      btnExec.innerHTML = '📥 下载全部图纸 (各层单图 + 全楼层总览)';
      btnExec.title = `将同时导出每一层的独立高清图纸与多层合并总览大图（共 ${validFloors.length + 1} 张）`;
    }

    let html = `
      <button type="button" class="btn-download-floor-tab active" data-floor="all" onclick="app.switchDownloadFloor('all')">
        🏢 全楼层总览 (多层合并)
      </button>
    `;

    validFloors.forEach(fId => {
      const name = this.exporter.getFloorDisplayName(fId);
      html += `
        <button type="button" class="btn-download-floor-tab" data-floor="${fId}" onclick="app.switchDownloadFloor('${fId}')">
          ${name}
        </button>
      `;
    });

    buttonsContainer.innerHTML = html;
  }

  switchDownloadFloor(floorKey) {
    this.currentDownloadFloor = floorKey;
    document.querySelectorAll('.btn-download-floor-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.floor === floorKey);
    });
    this.renderDownloadPreview();
  }

  switchDownloadStyle(style) {
    this.currentDownloadStyle = style;
    const btnColor = document.getElementById('btnPreviewStyleColor');
    const btnCad = document.getElementById('btnPreviewStyleCad');
    if (btnColor) btnColor.classList.toggle('active', style === 'color');
    if (btnCad) btnCad.classList.toggle('active', style === 'cad');
    this.renderDownloadPreview();
  }

  renderDownloadPreview() {
    const previewCanvas = document.getElementById('largePreviewCanvas');
    if (!previewCanvas) return;
    if (this.engine.saveCurrentFloorState) this.engine.saveCurrentFloorState();
    const title = document.getElementById('projectTitle')?.textContent?.trim() || '户型图';
    const validFloors = this.exporter.getValidFloors();

    let offCanvas;
    if (validFloors.length > 1 && (this.currentDownloadFloor === 'all' || !this.currentDownloadFloor)) {
      // 预览多层合并总览大图
      offCanvas = this.exporter.generateCombinedMultiFloorCanvas({
        style: this.currentDownloadStyle || 'color',
        resolution: 1800,
        showDimensions: true,
        showRoomLabels: true,
        showFurniture: true,
        showCompass: true,
        title
      });
    } else {
      // 预览指定单层或单层项目
      const targetFloor = (validFloors.length > 1 && this.currentDownloadFloor && this.currentDownloadFloor !== 'all')
        ? this.currentDownloadFloor
        : (this.engine.currentFloor || '1F');

      offCanvas = this.exporter.generateFloorImageCanvas(targetFloor, {
        style: this.currentDownloadStyle || 'color',
        resolution: 1600,
        showDimensions: true,
        showRoomLabels: true,
        showFurniture: true,
        showCompass: true,
        title
      });
    }

    previewCanvas.width = offCanvas.width;
    previewCanvas.height = offCanvas.height;
    const ctx = previewCanvas.getContext('2d');
    ctx.drawImage(offCanvas, 0, 0);
  }

  executeCurrentDownload() {
    if (this.engine.saveCurrentFloorState) this.engine.saveCurrentFloorState();
    const format = document.getElementById('downloadFormatSelect')?.value || 'png';
    const res = parseInt(document.getElementById('downloadResSelect')?.value) || 2560;
    const title = document.getElementById('projectTitle')?.textContent?.trim() || '户型图';
    const style = this.currentDownloadStyle || 'color';
    const validFloors = this.exporter.getValidFloors();

    if (validFloors.length > 1) {
      if (format === 'svg') {
        this.exporter.exportSVG({ title, showRoomLabels: true });
        alert(`📥 正在导出各楼层矢量图 (${validFloors.join('、')})，请留意浏览器下载提示。`);
      } else if (format === 'json') {
        this.exporter.exportJSON(title);
      } else {
        // 多层导出核心流程：每一层的独立图纸 + 多层放到同一张里面的全楼层总览大图！
        const files = this.exporter.exportAllStoreys(format, {
          style,
          resolution: res,
          showDimensions: true,
          showRoomLabels: true,
          showFurniture: true,
          showCompass: true,
          title
        });
        alert(`📥 多层户型图已启动全套导出！\n正在依次为您下载：\n1. 各单层独立图纸 (${validFloors.join('、')})\n2. 全楼层合并总览大图 (多层放在同一张)\n共 ${validFloors.length + 1} 张高清图纸，请留意浏览器下载窗口。`);
      }
    } else {
      // 单层标准导出
      if (format === 'svg') {
        this.exporter.exportSVG({ title, showRoomLabels: true });
      } else if (format === 'json') {
        this.exporter.exportJSON(title);
      } else {
        this.exporter.downloadImage(format, {
          style,
          resolution: res,
          showDimensions: true,
          showRoomLabels: true,
          showFurniture: true,
          showCompass: true,
          title
        });
      }
    }
  }

  toggleRuler() {
    this.renderer.showRuler = !this.renderer.showRuler;
    const btn = document.getElementById('btnToggleRuler');
    if (btn) {
      btn.classList.toggle('active', this.renderer.showRuler);
    }
    this.renderer.render();
  }

  updateDownloadPreviews() {
    this.renderDownloadPreview();
  }

  previewCard(style) {
    this.switchDownloadStyle(style);
    this.openDownloadModal();
  }

  downloadCard(style) {
    this.currentDownloadStyle = style;
    this.executeCurrentDownload();
  }

  downloadAll() {
    this.downloadCard('color');
    setTimeout(() => this.downloadCard('cad'), 500);
  }

  // --- Demo House Loader & Viewport Fit ---
  loadDemoHouse() {
    this.engine.loadProjectData(DEMO_HOUSE_DATA);
    document.getElementById('projectTitle').textContent = DEMO_HOUSE_DATA.title;
    this.engine.targetArea = 128;
    const badge = document.getElementById('badgeTargetArea');
    if (badge) {
      document.getElementById('textTargetArea').textContent = '128';
      badge.style.display = 'inline-block';
    }
    this.checkEmptyState();
    this.zoomToFit();
    this.renderer.render();
  }

  // --- Canvas Empty State Check ---
  checkEmptyState() {
    const emptyState = document.getElementById('canvasEmptyState');
    if (!emptyState) return;
    const hasWalls = this.engine.walls && this.engine.walls.length > 0;
    const hasBlueprint = this.engine.blueprint && this.engine.blueprint.image && this.engine.blueprint.visible;

    if (this.allowEmptyStateCard && !hasWalls && !hasBlueprint) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // --- Storey Management (楼层管理：向上添加+1F、向下添加-1F，不含0层，复制户型图到指定楼层) ---
  toggleStoreyManager() {
    const panel = document.getElementById('panelStoreyManager');
    if (!panel) return;
    const isShown = panel.style.display !== 'none';
    if (isShown) {
      this.closeStoreyManager();
    } else {
      this.openStoreyManager();
    }
  }

  openStoreyManager() {
    const panel = document.getElementById('panelStoreyManager');
    if (!panel) return;
    this.renderStoreyList();
    panel.style.display = 'flex';
    const widget = document.getElementById('storeyWidget');
    if (widget) widget.classList.add('active');
  }

  closeStoreyManager() {
    const panel = document.getElementById('panelStoreyManager');
    if (panel) panel.style.display = 'none';
    const widget = document.getElementById('storeyWidget');
    if (widget) widget.classList.remove('active');
  }

  // 智能寻找下一个可用（未被占用）的楼层号（不含 0 楼层）
  getNextAvailableFloor(direction = 'up') {
    const cur = this.engine.currentFloor || '1F';
    const existing = new Set(Object.keys(this.engine.floors));
    let cand = direction === 'up' ? FloorPlanEngine.getFloorUp(cur) : FloorPlanEngine.getFloorDown(cur);
    while (existing.has(cand)) {
      cand = direction === 'up' ? FloorPlanEngine.getFloorUp(cand) : FloorPlanEngine.getFloorDown(cand);
    }
    return cand;
  }

  renderStoreyList() {
    const container = document.getElementById('storeyListContainer');
    if (!container) return;
    container.innerHTML = '';

    const floors = FloorPlanEngine.sortFloors(Object.keys(this.engine.floors));
    const curFloor = this.engine.currentFloor;

    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    const countEl = document.getElementById('storeyCountText');
    if (countEl) countEl.textContent = `${t('storey_total_prefix', '共 ')}${floors.length}${t('storey_total_suffix', ' 层')}`;
    const labelEl = document.getElementById('currentStoreyLabel');
    if (labelEl) labelEl.textContent = curFloor;
    const badgeEl = document.getElementById('badgeCurrentStorey');
    if (badgeEl) badgeEl.textContent = `${t('storey_cur_prefix', '当前: ')}${curFloor}`;

    // 更新向上 / 向下添加按钮文案
    const nextUp = this.getNextAvailableFloor('up');
    const nextDown = this.getNextAvailableFloor('down');
    const textUp = document.getElementById('textAddFloorUp');
    if (textUp) textUp.textContent = `${t('storey_add_up', '🔼 向上添加')} (${nextUp})`;
    const textDown = document.getElementById('textAddFloorDown');
    if (textDown) textDown.textContent = `${t('storey_add_down', '🔽 向下添加')} (${nextDown})`;

    floors.forEach(fId => {
      const isCur = fId === curFloor;
      const flData = this.engine.floors[fId] || {};
      const roomCnt = (flData.rooms || []).length;
      const wallCnt = (flData.walls || []).length;
      let totalArea = 0;
      (flData.rooms || []).forEach(r => { totalArea += (r.area || 0); });

      const item = document.createElement('div');
      item.className = `storey-item ${isCur ? 'active' : ''}`;
      
      let summaryText = '空白层';
      if (roomCnt > 0) {
        summaryText = `${roomCnt}个房间 · 约${totalArea.toFixed(1)}㎡`;
      } else if (wallCnt > 0) {
        summaryText = `${wallCnt}段墙体`;
      }

      item.innerHTML = `
        <div class="d-flex align-items-center gap-2" style="min-width:0; flex:1;">
          <span style="font-weight:700; font-size:14px; min-width:32px;">${isCur ? '✓ ' : ''}${fId}</span>
          <span style="font-size:11px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${summaryText}</span>
        </div>
        <div class="storey-item-actions">
          ${!isCur ? `<button class="storey-item-btn" title="将当前【${curFloor}】复制到【${fId}】" onclick="event.stopPropagation(); app.copyCurrentToFloor('${fId}')">📋</button>` : ''}
          ${floors.length > 1 ? `<button class="storey-item-btn btn-del" title="删除该楼层" onclick="event.stopPropagation(); app.deleteStorey('${fId}')">🗑️</button>` : ''}
        </div>
      `;
      item.onclick = () => {
        this.switchStorey(fId);
        this.closeStoreyManager();
      };
      container.appendChild(item);
    });
  }

  showToast(message, type = 'info') {
    let toast = document.getElementById('appGlobalToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appGlobalToast';
      toast.style.cssText = `
        position: fixed;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: rgba(24, 29, 41, 0.95);
        color: #fff;
        padding: 10px 22px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        z-index: 10000;
        opacity: 0;
        pointer-events: none;
        transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(255,255,255,0.1);
      `;
      document.body.appendChild(toast);
    }
    const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
    }, 2800);
  }

  // 向上添加 / 向下添加楼层（不含0楼层）
  addStoreyDirectional(direction = 'up') {
    const cur = this.engine.currentFloor || '1F';
    const targetFloor = this.getNextAvailableFloor(direction);
    const copyCur = document.getElementById('chkAutoCopyStructure')?.checked ?? true;

    this.allowEmptyStateCard = false; // 创建楼层不应该提示“尚未创建户型图”，可以直接绘制
    this.engine.addFloor(targetFloor, copyCur ? cur : null);
    this.renderStoreyList();
    this.closeStoreyManager();
    this.checkEmptyState();
    if (!copyCur || !this.engine.walls.length) {
      this.setTool('draw_wall'); // 直接进入画墙绘制模式
    }
    this.zoomToFit();
    this.renderer.render();

    const tip = copyCur
      ? `已成功创建并复制【${cur}】户型到【${targetFloor}】！`
      : `已成功创建空白楼层【${targetFloor}】！可以直接开始绘制。`;
    this.showToast(tip, 'success');
  }

  // 直接将当前楼层复制到已存在的某层
  copyCurrentToFloor(targetFloor) {
    const cur = this.engine.currentFloor;
    if (targetFloor === cur) return;
    if (!confirm(`确定将当前【${cur}】的户型图完整复制并覆盖到【${targetFloor}】吗？`)) {
      return;
    }
    this.engine.copyFloorTo(cur, targetFloor);
    this.renderStoreyList();
    this.closeStoreyManager();
    this.checkEmptyState();
    this.zoomToFit();
    this.renderer.render();
    this.showToast(`已成功将【${cur}】户型图覆盖复制到【${targetFloor}】！`, 'success');
  }

  // 打开“复制户型图到指定楼层”专用弹窗
  openCopyFloorModal(defaultTarget = null) {
    this.closeStoreyManager();
    const cur = this.engine.currentFloor || '1F';
    const sourceBadge = document.getElementById('copyModalSourceFloor');
    if (sourceBadge) sourceBadge.textContent = cur;

    const curData = this.engine.floors[cur] || { walls: this.engine.walls, rooms: this.engine.rooms };
    const roomCnt = (curData.rooms || []).length;
    const wallCnt = (curData.walls || []).length;
    let totalArea = 0;
    (curData.rooms || []).forEach(r => { totalArea += (r.area || 0); });
    const descEl = document.getElementById('copyModalSourceDesc');
    if (descEl) {
      descEl.textContent = `包含 ${wallCnt} 段墙体，${roomCnt} 个房间，建筑总面积约 ${totalArea.toFixed(1)} ㎡`;
    }

    // 预填目标楼层输入框
    const nextUp = this.getNextAvailableFloor('up');
    const targetInput = document.getElementById('copyModalTargetInput');
    if (targetInput) targetInput.value = defaultTarget || nextUp;

    // 动态生成快捷标签：向上+1、向下-1、及其他已有楼层
    const tagsContainer = document.getElementById('copyModalQuickTags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      const existing = Object.keys(this.engine.floors);
      const nextDown = this.getNextAvailableFloor('down');
      
      const tagList = [
        { label: `🔼 上一层 (${nextUp})`, value: nextUp },
        { label: `🔽 下一层 (${nextDown})`, value: nextDown }
      ];
      // 已有楼层标签（覆盖已有楼层）
      existing.forEach(f => {
        if (f !== cur) tagList.push({ label: `${f} (覆盖原有)`, value: f });
      });

      tagList.forEach(item => {
        const span = document.createElement('span');
        span.className = 'quick-floor-tag' + (item.value === targetInput.value ? ' active' : '');
        span.textContent = item.label;
        span.onclick = () => {
          targetInput.value = item.value;
          document.querySelectorAll('.quick-floor-tag').forEach(t => t.classList.remove('active'));
          span.classList.add('active');
        };
        tagsContainer.appendChild(span);
      });
    }

    const modal = document.getElementById('modalCopyFloorTo');
    if (modal) modal.style.display = 'block';
  }

  closeCopyFloorModal() {
    const modal = document.getElementById('modalCopyFloorTo');
    if (modal) modal.style.display = 'none';
  }

  // 确认复制户型图到指定楼层
  confirmCopyFloor() {
    const cur = this.engine.currentFloor || '1F';
    const targetInput = document.getElementById('copyModalTargetInput');
    const rawTarget = (targetInput?.value || '').trim().toUpperCase();

    if (!rawTarget) {
      this.showToast("请输入目标楼层名称！", "error");
      return;
    }

    // 格式化：如用户输入 2 或 2f，自动标准化为 2F
    let cleanTarget = rawTarget;
    if (/^-?\d+$/.test(cleanTarget)) {
      cleanTarget += 'F';
    }

    // 校验：不能为 0F 或 0 层（不包含0楼层）
    const num = FloorPlanEngine.parseFloorNumber(cleanTarget);
    if (num === 0 || cleanTarget === '0F' || cleanTarget === '0') {
      this.showToast("楼层编号不包含 0 楼层！地上请使用 1F、2F，地下请使用 -1F、-2F。", "error");
      return;
    }

    if (cleanTarget === cur) {
      this.showToast(`目标楼层不能与当前楼层【${cur}】相同！`, "error");
      return;
    }

    // 如果目标楼层已存在，确认覆盖
    if (this.engine.floors[cleanTarget]) {
      if (typeof window !== 'undefined' && window.confirm && !confirm(`目标楼层【${cleanTarget}】已存在，确认将其户型覆盖替换为当前【${cur}】的户型吗？`)) {
        return;
      }
    }

    const switchAfter = document.getElementById('chkSwitchAfterCopy')?.checked ?? true;

    // 执行复制
    this.engine.copyFloorTo(cur, cleanTarget);

    if (!switchAfter) {
      // 若用户不想切换到目标楼层，切回源楼层
      this.engine.switchFloor(cur);
    }

    this.closeCopyFloorModal();
    this.renderStoreyList();
    this.checkEmptyState();
    this.zoomToFit();
    this.renderer.render();

    this.showToast(`成功将【${cur}】户型图复制到【${cleanTarget}】！${switchAfter ? `已自动切换至 ${cleanTarget}。` : ''}`, 'success');
  }

  switchStorey(floorId) {
    this.allowEmptyStateCard = false; // 切换楼层不弹空状态提示
    this.engine.switchFloor(floorId);
    const label = document.getElementById('currentStoreyLabel');
    if (label) label.textContent = floorId;
    this.renderStoreyList();
    this.checkEmptyState();
    this.zoomToFit();
    this.renderer.render();
  }

  deleteStorey(floorId) {
    if (confirm(`确定要删除楼层【${floorId}】吗？删除后该层所有墙体和家具都将被清空。`)) {
      const ok = this.engine.deleteFloor(floorId);
      if (ok) {
        this.renderStoreyList();
        this.checkEmptyState();
        this.zoomToFit();
        this.renderer.render();
      } else {
        alert("至少需保留一个楼层！");
      }
    }
  }

  // --- Community & Floorplan Info Modal ---
  openNewFloorplanModal() {
    this.projectInfoMode = 'new';
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    const titleEl = document.querySelector('#modalProjectInfo .modal-title');
    if (titleEl) titleEl.textContent = t('modal_new_project_title', '新建户型信息');
    const applyBtn = document.querySelector('#modalProjectInfo .unit-btn-download');
    if (applyBtn) applyBtn.textContent = t('modal_confirm_create', '确认并新建空白户型');

    const inputName = document.getElementById('infoInputName');
    if (inputName) inputName.value = t('modal_unnamed_community', '未命名小区');
    const inputArea = document.getElementById('infoInputArea');
    if (inputArea) inputArea.value = 120;
    if (document.getElementById('infoRoomBed'))     document.getElementById('infoRoomBed').value     = 3;
    if (document.getElementById('infoRoomLiving'))  document.getElementById('infoRoomLiving').value  = 1;
    if (document.getElementById('infoRoomDining'))  document.getElementById('infoRoomDining').value  = 1;
    if (document.getElementById('infoRoomKitchen')) document.getElementById('infoRoomKitchen').value = 1;
    if (document.getElementById('infoRoomBath'))    document.getElementById('infoRoomBath').value    = 2;
    this.projectInfoExtras = [];
    document.querySelectorAll('#extraRoomTags .extra-room-tag').forEach(tag => {
      tag.classList.remove('active');
      const name = tag.dataset.name || tag.textContent.replace(/^[\u2713+]\s*/, '').trim();
      tag.textContent = '+ ' + name;
    });
    this.updateAutoNamePreview();

    const modal = document.getElementById('modalProjectInfo');
    if (modal) modal.style.display = 'flex';
  }

  openAdjustCurrentLayoutModal() {
    this.projectInfoMode = 'adjust';
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    const titleEl = document.querySelector('#modalProjectInfo .modal-title');
    if (titleEl) titleEl.textContent = t('modal_adjust_project_title', '调整当前户型信息');
    const applyBtn = document.querySelector('#modalProjectInfo .unit-btn-download');
    if (applyBtn) applyBtn.textContent = t('modal_confirm_apply', '确认并应用');

    this._populateProjectInfoModal();
    const modal = document.getElementById('modalProjectInfo');
    if (modal) modal.style.display = 'flex';
  }

  openProjectInfoModal() {
    // Default to adjust mode when opened from title/badges
    if (!this.projectInfoMode || this.projectInfoMode === 'new') {
      this.projectInfoMode = 'adjust';
      const titleEl = document.querySelector('#modalProjectInfo .modal-title');
      if (titleEl) titleEl.textContent = '调整当前户型信息';
      const applyBtn = document.querySelector('#modalProjectInfo .unit-btn-download');
      if (applyBtn) applyBtn.textContent = '确认并应用';
    }

    this._populateProjectInfoModal();
    const modal = document.getElementById('modalProjectInfo');
    if (modal) modal.style.display = 'flex';
  }

  _populateProjectInfoModal() {
    // ---- 社区名称 ----
    const pi = this.engine.projectInfo || {};
    const titleText = (document.getElementById('projectTitle')?.textContent || '').trim();
    const titleParts = titleText.split('·');
    const commName = pi.communityName || titleParts[0] || '雅居乐花园';

    const inputName = document.getElementById('infoInputName');
    if (inputName) inputName.value = commName;

    // ---- 建筑总面积 ----
    const inputArea = document.getElementById('infoInputArea');
    if (inputArea) inputArea.value = pi.targetArea || this.engine.targetArea || 128;

    // ---- 格局室厅厨卫 ----
    const bed     = pi.bed     !== undefined ? pi.bed     : this._parseLayoutCountFromTitle('室', titleParts[1], 3);
    const living  = pi.living  !== undefined ? pi.living  : this._parseLayoutCountFromTitle('厅', titleParts[1], 1, true);
    const dining  = pi.dining  !== undefined ? pi.dining  : this._parseLayoutCountFromTitle('厅', titleParts[1], 1, false, true);
    const kitchen = pi.kitchen !== undefined ? pi.kitchen : this._parseLayoutCountFromTitle('厨', titleParts[1], 1);
    const bath    = pi.bath    !== undefined ? pi.bath    : this._parseLayoutCountFromTitle('卫', titleParts[1], 2);

    if (document.getElementById('infoRoomBed'))     document.getElementById('infoRoomBed').value     = bed;
    if (document.getElementById('infoRoomLiving'))  document.getElementById('infoRoomLiving').value  = living;
    if (document.getElementById('infoRoomDining'))  document.getElementById('infoRoomDining').value  = dining;
    if (document.getElementById('infoRoomKitchen')) document.getElementById('infoRoomKitchen').value = kitchen;
    if (document.getElementById('infoRoomBath'))    document.getElementById('infoRoomBath').value     = bath;

    // ---- 功能间标签 ----
    const activeTags = pi.extraTags || [];
    document.querySelectorAll('#extraRoomTags .extra-room-tag').forEach(tag => {
      const type = tag.dataset.type;
      const name = tag.dataset.name || tag.textContent.replace(/^[✓+]\s*/, '').trim();
      if (activeTags.includes(type)) {
        tag.classList.add('active');
        tag.textContent = '✓ ' + name;
      } else {
        tag.classList.remove('active');
        tag.textContent = '+ ' + name;
      }
    });

    this.updateAutoNamePreview();
  }

  _parseLayoutCountFromTitle(char, layoutStr, defaultVal, splitLiving = false, splitDining = false) {
    if (!layoutStr) return defaultVal;
    const m = layoutStr.match(/(\d+)\s*厅/);
    if (char === '厅' && m) {
      const totalTing = parseInt(m[1], 10);
      if (splitLiving) return totalTing >= 2 ? 1 : totalTing;
      if (splitDining) return totalTing >= 2 ? totalTing - 1 : 0;
    }
    const rm = layoutStr.match(new RegExp('(\\d+)\\s*' + char));
    return rm ? parseInt(rm[1], 10) : defaultVal;
  }

  closeProjectInfoModal() {
    const modal = document.getElementById('modalProjectInfo');
    if (modal) modal.style.display = 'none';
  }

  adjustCounter(id, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    let val = parseInt(el.value, 10) || 0;
    val = Math.max(0, val + delta);
    el.value = val;
    this.updateAutoNamePreview();
  }

  toggleExtraRoomTag(el, name) {
    el.classList.toggle('active');
    if (el.classList.contains('active')) {
      el.textContent = '✓ ' + name;
    } else {
      el.textContent = '+ ' + name;
    }
    this.updateAutoNamePreview();
  }

  generateStandardName() {
    const communityName = (document.getElementById('infoInputName')?.value || '').trim() || '雅居乐花园';
    const areaVal = parseFloat(document.getElementById('infoInputArea')?.value) || 0;
    const bed = parseInt(document.getElementById('infoRoomBed')?.value, 10) || 0;
    const living = parseInt(document.getElementById('infoRoomLiving')?.value, 10) || 0;
    const dining = parseInt(document.getElementById('infoRoomDining')?.value, 10) || 0;
    const kitchen = parseInt(document.getElementById('infoRoomKitchen')?.value, 10) || 0;
    const bath = parseInt(document.getElementById('infoRoomBath')?.value, 10) || 0;

    let parts = [];
    if (bed > 0) parts.push(`${bed}室`);
    const totalTing = living + dining;
    if (totalTing > 0) parts.push(`${totalTing}厅`);
    if (kitchen > 0) parts.push(`${kitchen}厨`);
    if (bath > 0) parts.push(`${bath}卫`);

    const layoutStr = parts.length > 0 ? parts.join('') : '3室2厅1厨2卫';
    const areaStr = areaVal > 0 ? ` ${areaVal}㎡` : '';

    return {
      communityName,
      layoutStr,
      areaVal,
      fullName: `${communityName}·${layoutStr}${areaStr}`
    };
  }

  updateAutoNamePreview() {
    const preview = document.getElementById('previewAutoName');
    if (preview) {
      preview.textContent = this.generateStandardName().fullName;
    }
  }

  confirmProjectInfo(startDrawing = true) {
    const info = this.generateStandardName();

    // Collect extra tag state
    const extraTags = [];
    document.querySelectorAll('#extraRoomTags .extra-room-tag').forEach(tag => {
      if (tag.classList.contains('active')) extraTags.push(tag.dataset.type);
    });

    // Persist full projectInfo to engine
    this.engine.projectInfo = {
      communityName: info.communityName,
      targetArea: info.areaVal,
      bed:     parseInt(document.getElementById('infoRoomBed')?.value,     10) || 0,
      living:  parseInt(document.getElementById('infoRoomLiving')?.value,  10) || 0,
      dining:  parseInt(document.getElementById('infoRoomDining')?.value,  10) || 0,
      kitchen: parseInt(document.getElementById('infoRoomKitchen')?.value, 10) || 0,
      bath:    parseInt(document.getElementById('infoRoomBath')?.value,    10) || 0,
      extraTags
    };

    // Update title
    const titleEl = document.getElementById('projectTitle');
    if (titleEl) titleEl.textContent = info.fullName;

    // Update community badge
    const textComm = document.getElementById('textCommunity');
    if (textComm) textComm.textContent = info.communityName;

    // Update layout badge
    const textLayout = document.getElementById('textLayout');
    if (textLayout) textLayout.textContent = info.layoutStr;

    if (this.projectInfoMode === 'new' && !startDrawing) {
      // 仅保存信息：不清空画布
      if (info.areaVal > 0) {
        this.engine.targetArea = info.areaVal;
        const textArea = document.getElementById('textTargetArea');
        if (textArea) textArea.textContent = this.engine.targetArea;
      }
      this.closeProjectInfoModal();
      this.renderer.render();
      return;
    }

    if (this.projectInfoMode === 'new') {
      // 新建户型：清空当前画布，重置工程
      this.engine.clear();
      this.engine.targetArea = info.areaVal || 120;
      const textArea = document.getElementById('textTargetArea');
      if (textArea) textArea.textContent = this.engine.targetArea;
      const badge = document.getElementById('badgeTargetArea');
      if (badge) badge.style.display = 'inline-flex';

      this.closeProjectInfoModal();
      this.checkEmptyState();
      this.setTool('draw_wall');
      this.renderer.render();
      return;
    }

    // 调整当前户型：若面积变化，执行全局等比缩放
    if (info.areaVal > 0) {
      if (this.engine.walls.length > 0 && Math.abs((this.engine.targetArea || 0) - info.areaVal) > 0.1) {
        this.engine.scaleToTargetArea(info.areaVal);
      }
      this.engine.targetArea = info.areaVal;
      const textArea = document.getElementById('textTargetArea');
      if (textArea) textArea.textContent = info.areaVal;
      const badge = document.getElementById('badgeTargetArea');
      if (badge) badge.style.display = 'inline-flex';
    }

    this.closeProjectInfoModal();
    this.checkEmptyState();
    this.engine.saveCurrentFloorState();
    this.engine.recordHistory();
    this.zoomToFit();
    this.renderer.render();
  }

  // --- Inline Room Name Edit & Default Floor Presets ---
  getDefaultFloorForRoom(roomName) {
    return FloorPlanEngine.getDefaultFloorForRoom(roomName);
  }

  startInlineRoomNameEdit(room) {
    this.openRoomNamePickerModal(room);
  }

  // --- Room Function & Name Dual Window Modal (内置常见功能间 vs 自定义输入) ---
  openRoomNamePickerModal(room) {
    if (!room) return;
    this.currentEditingRoom = room;
    const modal = document.getElementById('modalRoomNamePicker');
    if (!modal) return;

    const sub = document.getElementById('roomPickerSubtitle');
    if (sub) {
      const area = room.area ? room.area.toFixed(1) : (room.polygon ? (FloorPlanEngine.polygonArea(room.polygon) / 1000000).toFixed(1) : '0.0');
      const dName = window.i18n ? window.i18n.translateRoomName(room.name) : (room.name || '未命名');
      const tmpl = window.i18n ? window.i18n.t('modal_room_picker_sub', '当前空间：{name} · 面积约 {area} ㎡') : '当前空间：{name} · 面积约 {area} ㎡';
      sub.textContent = tmpl.replace('{name}', dName).replace('{area}', area);
    }

    this.renderPresetRoomsGrid(room.name);
    this.renderCustomChipsList();

    const input = document.getElementById('customRoomNameInput');
    if (input) {
      input.value = room.name || '';
      if (!input._hasEnterListener) {
        input._hasEnterListener = true;
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.confirmCustomRoomName();
          }
        });
      }
    }

    this.switchRoomPickerTab('preset');
    modal.style.display = 'flex';
  }

  closeRoomNamePickerModal() {
    const modal = document.getElementById('modalRoomNamePicker');
    if (modal) modal.style.display = 'none';
    this.currentEditingRoom = null;
  }

  switchRoomPickerTab(tab) {
    const tabBtnPreset = document.getElementById('tabBtnPreset');
    const tabBtnCustom = document.getElementById('tabBtnCustom');
    const panelPreset = document.getElementById('roomPickerPanelPreset');
    const panelCustom = document.getElementById('roomPickerPanelCustom');
    if (!tabBtnPreset || !tabBtnCustom) return;

    if (tab === 'custom') {
      tabBtnPreset.classList.remove('active');
      tabBtnCustom.classList.add('active');
      if (panelPreset) panelPreset.style.display = 'none';
      if (panelCustom) panelCustom.style.display = 'block';
      setTimeout(() => {
        const input = document.getElementById('customRoomNameInput');
        if (input) { input.focus(); input.select(); }
      }, 50);
    } else {
      tabBtnCustom.classList.remove('active');
      tabBtnPreset.classList.add('active');
      if (panelCustom) panelCustom.style.display = 'none';
      if (panelPreset) panelPreset.style.display = 'block';
    }
  }

  renderPresetRoomsGrid(currentName = '') {
    const grid = document.getElementById('presetRoomsGrid');
    if (!grid) return;

    // 内置常见功能键：客厅，餐厅，卧室，厨房，卫生间，书房，衣帽间，储物间，院子，阳台等
    const presets = [
      { name: '客厅', icon: '🛋️' },
      { name: '餐厅', icon: '🍽️' },
      { name: '卧室', icon: '🛏️' },
      { name: '主卧', icon: '🛌' },
      { name: '次卧', icon: '🛏️' },
      { name: '厨房', icon: '🍳' },
      { name: '卫生间', icon: '🚿' },
      { name: '主卫', icon: '🛁' },
      { name: '次卫', icon: '🚽' },
      { name: '书房', icon: '📚' },
      { name: '衣帽间', icon: '👔' },
      { name: '储物间', icon: '📦' },
      { name: '院子', icon: '🌿' },
      { name: '阳台', icon: '☀️' },
      { name: '玄关', icon: '🚪' },
      { name: '儿童房', icon: '🧸' },
      { name: '客房', icon: '🪑' },
      { name: '洗衣房', icon: '🧺' },
      { name: '露台', icon: '🪴' },
      { name: '多功能室', icon: '✨' }
    ];

    grid.innerHTML = presets.map(p => {
      const isCur = p.name === currentName;
      const displayName = window.i18n ? window.i18n.translateRoomName(p.name) : p.name;
      return `
        <button type="button" class="preset-room-item-btn ${isCur ? 'current' : ''}" onclick="app.selectPresetRoomName('${p.name}')">
          <span class="room-icon">${p.icon}</span>
          <span class="room-name">${displayName}</span>
        </button>
      `;
    }).join('');
  }

  renderCustomChipsList() {
    const list = document.getElementById('customChipsList');
    if (!list) return;
    const chips = [
      { key: '茶室', icon: '🍵' },
      { key: '健身房', icon: '🏃' },
      { key: '影音室', icon: '🎬' },
      { key: '阳光房', icon: '☀️' },
      { key: '琴房', icon: '🎹' },
      { key: '酒窖', icon: '🍷' },
      { key: '画室', icon: '🎨' },
      { key: '宠物房', icon: '🐱' },
      { key: '娱乐室', icon: '🎮' }
    ];
    list.innerHTML = chips.map(c => {
      const dName = window.i18n ? window.i18n.translateRoomName(c.key) : c.key;
      return `<span class="custom-suggest-chip" onclick="app.applyCustomSuggest('${c.key}')">${c.icon} ${dName}</span>`;
    }).join('');
  }

  selectPresetRoomName(newName) {
    if (!this.currentEditingRoom || !newName) return;
    const room = this.currentEditingRoom;
    room.name = newName;
    room.floorTexture = FloorPlanEngine.getDefaultFloorForRoom(newName);
    this.engine.saveCurrentFloorState();
    this.engine.recordHistory();
    if (this.renderer.activeTab !== 'furnish') {
      this.renderer.floorPreviewMode = true;
    }
    this.renderer.render();
    this.updateSelectionPropertyCard({ type: 'room', id: room.id, obj: room });
    this.closeRoomNamePickerModal();
  }

  confirmCustomRoomName() {
    if (!this.currentEditingRoom) return;
    const input = document.getElementById('customRoomNameInput');
    const newName = input ? input.value.trim() : '';
    if (!newName) {
      if (input) input.focus();
      return;
    }
    const room = this.currentEditingRoom;
    room.name = newName;
    room.floorTexture = FloorPlanEngine.getDefaultFloorForRoom(newName);
    this.engine.saveCurrentFloorState();
    this.engine.recordHistory();
    if (this.renderer.activeTab !== 'furnish') {
      this.renderer.floorPreviewMode = true;
    }
    this.renderer.render();
    this.updateSelectionPropertyCard({ type: 'room', id: room.id, obj: room });
    this.closeRoomNamePickerModal();
  }

  applyCustomSuggest(name) {
    const input = document.getElementById('customRoomNameInput');
    if (input) input.value = name;
    this.confirmCustomRoomName();
  }

  // --- Floor Material Library Modal (地板库) ---
  // --- Floor Material Library Modal (地板库) ---
  getFloorTextureDisplayName(textureId) {
    const map = {
      'tile_cream': '暖米抛光砖',
      'tile_carrara': '卡拉拉白理石',
      'tile_checkered': '经典棋盘砖',
      'tile_grey': '素水泥灰砖',
      'tile_hex': '卫浴微纹砖',
      'tile_travertine': '洞石米黄',
      'wood_light': '浅原木地板',
      'wood_warm': '暖橡木地板',
      'wood_plank': '直纹实木板',
      'wood_parquet': '人字拼花地板',
      'wood_wide': '宽板橡木板',
      'wood_walnut': '深胡桃木地板',
      'wood_grey': '现代灰木地板',
      'wood_bleached': '白橡复古地板',
      'outdoor_lawn': '户外绿草地'
    };
    return map[textureId] || '标准木地板';
  }

  drawFloorThumbnailToCanvas(canvasIdOrEl, textureId) {
    const canvas = typeof canvasIdOrEl === 'string' ? document.getElementById(canvasIdOrEl) : canvasIdOrEl;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pat = (this.renderer && this.renderer.patterns && this.renderer.patterns[textureId]) || (this.renderer && this.renderer.patterns && this.renderer.patterns.wood_warm);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  openFloorLibraryModal(room = null) {
    const targetRoom = room || this.currentEditingRoom || (this.renderer.selectedItem && this.renderer.selectedItem.type === 'room' ? this.renderer.selectedItem.obj : null) || this.engine.rooms[0];
    if (!targetRoom) return;
    this.currentEditingRoom = targetRoom;
    this._origFloorTexture = targetRoom.floorTexture;
    const modal = document.getElementById('modalFloorLibrary');
    if (!modal) return;
    this.renderFloorLibraryGrid(targetRoom.floorTexture);
    modal.style.display = 'flex';
    if (this.renderer.activeTab !== 'furnish') {
      this.renderer.floorPreviewMode = true;
      this.renderer.render();
      if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'room') {
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
      }
    }
  }

  closeFloorLibraryModal() {
    const modal = document.getElementById('modalFloorLibrary');
    if (modal) modal.style.display = 'none';
    if (this.currentEditingRoom && this._origFloorTexture) {
      this.currentEditingRoom.floorTexture = this._origFloorTexture;
    }
    this._origFloorTexture = null;
    if (this.renderer.activeTab !== 'furnish') {
      this.renderer.floorPreviewMode = false;
      this.renderer.render();
      if (this.renderer.selectedItem && this.renderer.selectedItem.type === 'room') {
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
      }
    } else {
      this.renderer.render();
    }
  }

  selectFloorTexture(textureId) {
    if (!this.currentEditingRoom || !textureId) return;
    const room = this.currentEditingRoom;
    room.floorTexture = textureId;
    this._origFloorTexture = null;
    this.engine.saveCurrentFloorState();
    this.engine.recordHistory();
    if (this.renderer.activeTab !== 'furnish') {
      this.renderer.floorPreviewMode = true;
    }
    this.renderer.render();
    this.updateSelectionPropertyCard({ type: 'room', id: room.id, obj: room });
    const modal = document.getElementById('modalFloorLibrary');
    if (modal) modal.style.display = 'none';
  }

  renderFloorLibraryGrid(currentTexture = '') {
    const grid = document.getElementById('floorLibGrid');
    if (!grid) return;

    const materials = [
      { id: 'tile_cream', name: '暖米抛光砖' },
      { id: 'tile_carrara', name: '卡拉拉白理石' },
      { id: 'tile_checkered', name: '经典棋盘砖' },
      { id: 'tile_grey', name: '素水泥灰砖' },
      { id: 'tile_hex', name: '卫浴微纹砖' },
      { id: 'tile_travertine', name: '洞石米黄' },
      { id: 'wood_light', name: '浅原木地板' },
      { id: 'wood_warm', name: '暖橡木地板' },
      { id: 'wood_plank', name: '直纹实木板' },
      { id: 'wood_parquet', name: '人字拼花地板' },
      { id: 'wood_wide', name: '宽板橡木板' },
      { id: 'wood_walnut', name: '深胡桃木地板' },
      { id: 'wood_grey', name: '现代灰木地板' },
      { id: 'wood_bleached', name: '白橡复古地板' },
      { id: 'outdoor_lawn', name: '户外绿草地' }
    ];

    grid.innerHTML = '';
    // 鼠标离开网格时，恢复原先材质预览
    grid.onmouseleave = () => {
      if (this.currentEditingRoom && this._origFloorTexture) {
        this.currentEditingRoom.floorTexture = this._origFloorTexture;
        this.renderer.render();
      }
    };

    for (const mat of materials) {
      const item = document.createElement('div');
      item.className = `floor-lib-item ${mat.id === currentTexture ? 'active' : ''}`;
      item.dataset.floor = mat.id;
      item.title = mat.name;

      // 实时悬停预览：鼠标划过任何材质块，主画布房间实时预览该材质！
      item.onmouseenter = () => {
        if (this.currentEditingRoom) {
          this.currentEditingRoom.floorTexture = mat.id;
          this.renderer.render();
        }
      };

      // 点击确认应用
      item.onclick = () => this.selectFloorTexture(mat.id);

      // 高清满铺缩略图，纯粹质感无文字遮挡
      const thumb = document.createElement('canvas');
      thumb.width = 120;
      thumb.height = 120;
      const tctx = thumb.getContext('2d');
      const pat = (this.renderer && this.renderer.patterns && this.renderer.patterns[mat.id]) || (this.renderer && this.renderer.patterns && this.renderer.patterns.wood_warm);
      if (pat) {
        tctx.fillStyle = pat;
        tctx.fillRect(0, 0, 120, 120);
      }
      item.appendChild(thumb);

      grid.appendChild(item);
    }
  }

  // --- Smart One-Click Auto Furnishing ---
  autoFurnishRoom(room) {
    if (!room || !room.polygon || room.polygon.length < 3) return;
    const name = (room.name || '').trim();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of room.polygon) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const W = maxX - minX;
    const H = maxY - minY;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const roomDoors = this.engine.doors.filter(d => {
      const wall = this.engine.walls.find(w => w.id === d.wallId);
      if (!wall) return false;
      const dx = wall.p1.x + d.t * (wall.p2.x - wall.p1.x);
      const dy = wall.p1.y + d.t * (wall.p2.y - wall.p1.y);
      return FloorPlanEngine.dist({ x: dx, y: dy }, { x: cx, y: cy }) < Math.max(W, H) * 0.95;
    });

    const canPlace = (itemType, x, y, rot = 0) => {
      const cat = FURNITURE_CATALOG.find(f => f.id === itemType);
      if (!cat) return false;
      const rad = (rot || 0) * Math.PI / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const effW = cat.width * cos + cat.height * sin;
      const effH = cat.width * sin + cat.height * cos;

      // Check bounding box
      const margin = 40;
      if (x - effW/2 < minX + margin || x + effW/2 > maxX - margin) return false;
      if (y - effH/2 < minY + margin || y + effH/2 > maxY - margin) return false;

      // Check corners in room polygon
      const corners = [
        { x: x - effW/2, y: y - effH/2 },
        { x: x + effW/2, y: y - effH/2 },
        { x: x + effW/2, y: y + effH/2 },
        { x: x - effW/2, y: y + effH/2 }
      ];
      for (const pt of corners) {
        if (!FloorPlanEngine.isPointInPolygon(pt, room.polygon)) return false;
      }

      // Door clearance >= 950mm
      for (const d of roomDoors) {
        const wall = this.engine.walls.find(w => w.id === d.wallId);
        if (wall) {
          const dx = wall.p1.x + d.t * (wall.p2.x - wall.p1.x);
          const dy = wall.p1.y + d.t * (wall.p2.y - wall.p1.y);
          if (FloorPlanEngine.dist({ x, y }, { x: dx, y: dy }) < 1000) return false;
        }
      }

      // No furniture collision
      for (const f of this.engine.furniture) {
        const fCat = FURNITURE_CATALOG.find(c => c.id === f.type);
        const fw = f.width || (fCat ? fCat.width : 1000);
        const fh = f.height || (fCat ? fCat.height : 1000);
        const fRad = (f.rotation || 0) * Math.PI / 180;
        const feffW = fw * Math.abs(Math.cos(fRad)) + fh * Math.abs(Math.sin(fRad));
        const feffH = fw * Math.abs(Math.sin(fRad)) + fh * Math.abs(Math.cos(fRad));

        const overlapX = Math.abs(x - f.x) < (effW + feffW) / 2 + 80;
        const overlapY = Math.abs(y - f.y) < (effH + feffH) / 2 + 80;
        if (overlapX && overlapY) return false;
      }

      return true;
    };

    const tryPlace = (itemType, candidates) => {
      for (const cand of candidates) {
        if (canPlace(itemType, cand.x, cand.y, cand.rot || 0)) {
          this.engine.addFurniture(itemType, cand.x, cand.y, cand.rot || 0);
          return true;
        }
      }
      return false;
    };

    // Auto furnish based on room classification
    if (name.includes('卧') || name.includes('房') || (name.includes('室') && !name.includes('浴室') && !name.includes('起居'))) {
      const bedType = (W < 3200 || H < 3000) ? 'bed_single' : 'bed_double';
      tryPlace(bedType, [
        { x: cx, y: minY + 1200, rot: 0 },
        { x: cx, y: maxY - 1200, rot: 180 },
        { x: minX + 1200, y: cy, rot: 90 },
        { x: maxX - 1200, y: cy, rot: 270 }
      ]);
      tryPlace('wardrobe', [
        { x: maxX - 400, y: cy, rot: 270 },
        { x: minX + 400, y: cy, rot: 90 },
        { x: cx, y: maxY - 400, rot: 180 },
        { x: cx, y: minY + 400, rot: 0 }
      ]);
      tryPlace('study_desk', [
        { x: minX + 800, y: maxY - 500, rot: 180 },
        { x: maxX - 800, y: maxY - 500, rot: 180 },
        { x: minX + 500, y: cy, rot: 90 }
      ]);
    } else if (name.includes('客') || name.includes('起居')) {
      if (W >= H) {
        tryPlace('sofa_3p', [
          { x: cx, y: minY + 550, rot: 0 },
          { x: cx, y: maxY - 550, rot: 180 }
        ]);
        tryPlace('coffee_table', [
          { x: cx, y: cy, rot: 0 }
        ]);
        tryPlace('tv_cabinet', [
          { x: cx, y: maxY - 300, rot: 180 },
          { x: cx, y: minY + 300, rot: 0 }
        ]);
      } else {
        tryPlace('sofa_3p', [
          { x: minX + 550, y: cy, rot: 90 },
          { x: maxX - 550, y: cy, rot: 270 }
        ]);
        tryPlace('coffee_table', [
          { x: cx, y: cy, rot: 90 }
        ]);
        tryPlace('tv_cabinet', [
          { x: maxX - 300, y: cy, rot: 270 },
          { x: minX + 300, y: cy, rot: 90 }
        ]);
      }
    } else if (name.includes('餐')) {
      tryPlace('dining_table_6', [
        { x: cx, y: cy, rot: W >= H ? 0 : 90 }
      ]);
      tryPlace('fridge_double', [
        { x: minX + 550, y: minY + 550, rot: 0 },
        { x: maxX - 550, y: minY + 550, rot: 0 }
      ]);
    } else if (name.includes('厨')) {
      tryPlace('gas_stove', [
        { x: minX + 550, y: cy, rot: 90 },
        { x: cx, y: minY + 400, rot: 0 }
      ]);
      tryPlace('kitchen_sink', [
        { x: maxX - 500, y: cy, rot: 270 },
        { x: cx, y: maxY - 400, rot: 180 }
      ]);
      tryPlace('fridge_double', [
        { x: minX + 550, y: minY + 500, rot: 0 },
        { x: maxX - 550, y: minY + 500, rot: 0 }
      ]);
    } else if (name.includes('卫') || name.includes('浴') || name.includes('厕')) {
      tryPlace('shower_room', [
        { x: minX + 600, y: minY + 600, rot: 0 },
        { x: maxX - 600, y: minY + 600, rot: 0 },
        { x: maxX - 600, y: maxY - 600, rot: 0 }
      ]);
      tryPlace('toilet', [
        { x: minX + 450, y: cy, rot: 90 },
        { x: maxX - 450, y: cy, rot: 270 },
        { x: cx, y: maxY - 450, rot: 180 }
      ]);
      tryPlace('vanity_sink', [
        { x: cx, y: minY + 380, rot: 0 },
        { x: cx, y: maxY - 380, rot: 180 },
        { x: maxX - 380, y: cy, rot: 270 }
      ]);
    } else if (name.includes('阳台') || name.includes('露台')) {
      tryPlace('washing_machine', [
        { x: minX + 450, y: cy, rot: 90 },
        { x: maxX - 450, y: cy, rot: 270 },
        { x: cx, y: minY + 450, rot: 0 }
      ]);
      tryPlace('plant_large', [
        { x: maxX - 450, y: cy, rot: 0 },
        { x: minX + 450, y: maxY - 450, rot: 0 }
      ]);
    } else if (name.includes('书')) {
      tryPlace('study_desk', [
        { x: cx, y: minY + 450, rot: 0 },
        { x: cx, y: maxY - 450, rot: 180 }
      ]);
      tryPlace('wardrobe', [
        { x: minX + 400, y: cy, rot: 90 },
        { x: maxX - 400, y: cy, rot: 270 }
      ]);
    }
  }

  autoFurnishAllRooms() {
    if (!this.engine.rooms || this.engine.rooms.length === 0) {
      alert("请先绘制或加载户型房间，系统将根据各房间类型智能自动布置成套家具！");
      return;
    }
    const prevCount = this.engine.furniture.length;
    for (const r of this.engine.rooms) {
      this.autoFurnishRoom(r);
    }
    const addedCount = this.engine.furniture.length - prevCount;
    this.engine.saveCurrentFloorState();
    this.engine.recordHistory();
    this.renderer.render();

    alert(`🛋️ 一键布置完成！\n已根据所有房间类型（卧室、客厅、餐厅、厨房、卫浴等）沿墙贴边放置了成套家具，且智能避开了墙体与门扇开启区域！\n共新增布置 ${addedCount} 件家具。`);
  }

  // --- Proportional Scaling To Target Area ---
  scaleToTargetArea() {
    let target = this.engine.targetArea;
    if (!target || target <= 0) {
      const input = prompt("请输入目标建筑总面积 (㎡):", "128");
      if (!input) return;
      target = parseFloat(input);
      if (!target || target <= 0) return;
      this.engine.targetArea = target;
      document.getElementById('textTargetArea').textContent = target;
      document.getElementById('badgeTargetArea').style.display = 'inline-block';
    }

    let curArea = 0;
    for (const r of this.engine.rooms) {
      if (r.area) curArea += r.area;
    }

    const msg = `当前已绘制房间总面积: ${curArea.toFixed(1)} ㎡\n目标设定建筑总面积: ${target} ㎡\n\n系统将以平面图中心为基准，保持所有房间相对比例与墙体规格整体等比缩放！\n确定立即缩放吗？`;
    if (!confirm(msg)) return;

    const res = this.engine.scaleToTargetArea(target);
    if (res) {
      this.zoomToFit();
      this.renderer.render();
      alert(`🎉 等比缩放成功！\n原总面积: ${res.oldArea.toFixed(1)} ㎡ ➔ 新总面积: ${res.newArea.toFixed(1)} ㎡\n全局比例系数: ${(res.scale * 100).toFixed(1)}%`);
    } else {
      alert("缩放提示：当前楼层尚未绘制包含有效面积的封闭房间，请先绘制房间！");
    }
  }

  // --- Upgraded SVG Compass Interaction ---
  setupCompassInteraction() {
    const dial = document.getElementById('compassDial');
    const needleGroup = document.getElementById('compassNeedleGroup');
    const badge = document.getElementById('compassAngleBadge');
    if (!dial) return;

    // Initialize needle to default 0° (North Up, South Down)
    if (needleGroup) {
      const angle = this.engine.compass.angle || 0;
      needleGroup.setAttribute('transform', `rotate(${angle} 28 38)`);
    }

    let isDraggingCompass = false;
    let startPointerAngle = 0;
    let startCompassAngle = 0;
    let hasMoved = false;

    dial.addEventListener('mousedown', e => {
      e.stopPropagation();
      isDraggingCompass = true;
      hasMoved = false;
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      startPointerAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      startCompassAngle = this.engine.compass.angle || 0;
      if (badge) {
        badge.style.display = 'block';
        badge.textContent = `${startCompassAngle}°`;
      }
    });

    window.addEventListener('mousemove', e => {
      if (!isDraggingCompass) return;
      const rect = dial.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const curAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
      let delta = curAngle - startPointerAngle;
      if (Math.abs(delta) > 3) hasMoved = true;
      let newAngle = Math.round((startCompassAngle + delta) % 360);
      if (newAngle < 0) newAngle += 360;
      this.engine.compass.angle = newAngle;
      if (needleGroup) needleGroup.setAttribute('transform', `rotate(${newAngle} 28 38)`);
      if (badge) {
        badge.textContent = `${newAngle}°`;
      }
      this.renderer.render();
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingCompass) {
        isDraggingCompass = false;
        if (badge) badge.style.display = 'none';
        if (!hasMoved) {
          // Quick click: step by 45 degrees
          let angle = ((this.engine.compass.angle || 0) + 45) % 360;
          this.engine.compass.angle = angle;
          if (needleGroup) needleGroup.setAttribute('transform', `rotate(${angle} 28 38)`);
          this.renderer.render();
        }
      }
    });

    // Double click to instantly reset North up (0°)
    dial.addEventListener('dblclick', e => {
      e.stopPropagation();
      this.engine.compass.angle = 0;
      if (needleGroup) needleGroup.setAttribute('transform', 'rotate(0 28 38)');
      this.renderer.render();
    });
  }

  zoomToFit() {
    const bbox = this.exporter.getBoundingBox();
    const margin = 120;
    const availW = this.canvas.width / (window.devicePixelRatio || 1) - margin * 2;
    const availH = this.canvas.height / (window.devicePixelRatio || 1) - margin * 2;

    const scaleX = availW / bbox.width;
    const scaleY = availH / bbox.height;
    const zoom = Math.min(scaleX, scaleY, 0.22);

    this.engine.viewport.zoom = zoom;
    this.engine.viewport.x = (this.canvas.width / (window.devicePixelRatio || 1) - bbox.width * zoom) / 2 - bbox.minX * zoom;
    this.engine.viewport.y = (this.canvas.height / (window.devicePixelRatio || 1) - bbox.height * zoom) / 2 - bbox.minY * zoom;

    document.getElementById('vpZoomRatio').textContent = Math.round(zoom * 800) + '%';
    this.renderer.render();
  }

  // --- Interactive Onboarding Tour (试用引导系统：新建户型 ➔ 房源资料 ➔ 绘制操作 ➔ 添加家具 ➔ 调整家具 ➔ 导入临摹) ---
  initTour() {
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    this.tourSteps = [
      {
        title: t('tour_s1_title', '✨ 1. 新建户型与楼层管理'),
        target: '#btnNewFloorplanTrigger',
        clickTarget: '#btnNewFloorplanTrigger',
        sidebarTab: 'draw',
        hintText: t('tour_click_hint', '👆 点击新建户型'),
        cardPlacement: 'bottom-left',
        body: t('tour_s1_body', '点击左上方【新建户型】按钮，可随时创建全新空白设计画板。<br>画布左上角还提供<b>楼层管理</b>（向上添加 2F、向下添加 -1F，严格遵循无 0 层规范），可随时向上/向下加层或复制户型图。新楼层无需多余提示，可直接画墙！')
      },
      {
        title: t('tour_s2_title', '📋 2. 填写房源资料'),
        target: '#btnEditProjectInfo',
        targetBox: '.menu-title-text .d-flex.align-items-center.gap-2',
        clickTarget: '#btnEditProjectInfo',
        sidebarTab: 'draw',
        hintText: t('tour_click_hint', '👆 点击编辑房源资料'),
        cardPlacement: 'bottom-left',
        body: t('tour_s2_body', '点击户型标题右侧的【编辑图标】（或双击户型标题），可随时完善房源档案：<br>录入小区名称、几室几厅几卫、房屋朝向与目标建筑面积，数据将自动同步并呈现在图纸外侧与导出卡片中。')
      },
      {
        title: t('tour_s3_title', '📐 3. 绘制基本操作'),
        target: '[data-action="draw_wall"]',
        clickTarget: '[data-action="draw_wall"]',
        sidebarTab: 'draw',
        hintText: t('tour_click_hint', '👆 点击激活画直线墙'),
        cardPlacement: 'right-top',
        body: t('tour_s3_body', '• <b>直线墙 (Q)</b>：支持智能端点磁吸、垂直/水平正交对齐与相邻墙体持平悬停，绘制实时闭合生成房间。<br>• <b>矩形房间 (W)</b>：两点点击或拖拽极速建房。<br>• 封闭空间自动计算真实面积并智能赋予房间名称。')
      },
      {
        title: t('tour_s4_title', '🛋️ 4. 添加家具组件'),
        target: 'button[data-tab="furnish"]',
        clickTarget: 'button[data-tab="furnish"]',
        sidebarTab: 'furnish',
        hintText: t('tour_click_hint', '👆 点击展开家具分类'),
        cardPlacement: 'right-sidebar',
        body: t('tour_s4_body', '点击左侧【家具分类】选项卡，素材库内置了卧室床具、客厅沙发、餐厅餐桌、厨房卫浴及<b>双向双跑楼梯</b>等丰富组件。<br>一键点击或直接拖入画布房间内即可快速布置。')
      },
      {
        title: t('tour_s5_title', '🔄 5. 调整家具与快捷键'),
        targetType: 'canvas_furniture',
        sidebarTab: 'furnish',
        hintText: t('tour_s5_title', '🎯 选定家具：拖拽/旋转/快捷键'),
        cardPlacement: 'right-center',
        body: t('tour_s5_body', '• <b>拖拽移动</b>：点击摆件主体仅保留拖拽平移功能，不会误旋转；<br>• <b>尺寸调节</b>：拖拉边缘 8 向蓝色控点自由缩放；<br>• <b>独立旋转按钮</b>：点击正上方按钮顺时针转 90°，拖拽支持水平/垂直正交磁吸；<br>• <b>快捷键</b>：方向键微调 1 像素，Ctrl+方向键移动 10 像素，Shift+方向键向该方向自动贴墙摆放！')
      },
      {
        title: t('tour_s6_title', '🖼️ 6. 户型图临摹与标尺校准'),
        target: '#btnUploadLocalBp',
        fallbackTarget: 'button[data-tab="library"]',
        clickTarget: '#btnUploadLocalBp',
        sidebarTab: 'library',
        hintText: t('tour_click_hint', '👆 点击上传本地户型图'),
        cardPlacement: 'right-sidebar',
        body: t('tour_s6_body', '点击左侧【户型临摹】切换至底图面板，点击【上传本地户型图】载入已有纸质图纸或 CAD 图片。<br>利用双点标尺校准精准设定真实尺寸，结合透明度与旋转调节，助您快速描摹复刻标准矢量图！')
      }
    ];
    this.currentTourStep = 0;
  }

  startTour(stepIndex = 0) {
    if (!this.tourSteps) {
      this.initTour();
    }
    this.currentTourStep = Math.max(0, Math.min(stepIndex, this.tourSteps.length - 1));
    const overlay = document.getElementById('tourOverlay');
    if (!overlay) return;
    overlay.style.display = 'block';
    this.renderTourStep(this.currentTourStep);
  }

  renderTourStep(index) {
    if (!this.tourSteps || !this.tourSteps[index]) return;
    this.currentTourStep = index;
    const step = this.tourSteps[index];

    // 1. 自动切换左侧边栏对应 Tab，确保目标元素可见并居于准确的屏幕坐标
    if (step.sidebarTab) {
      this.switchSidebarTab(step.sidebarTab);
    }

    // 2. 步骤徽章与文字内容
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    const badge = document.getElementById('tourStepBadge');
    if (badge) badge.textContent = `${t('tour_step', '步骤')} ${index + 1} / ${this.tourSteps.length}`;
    const title = document.getElementById('tourTitle');
    if (title) title.innerHTML = step.title;
    const body = document.getElementById('tourBody');
    if (body) body.innerHTML = step.body;

    // 3. 步骤指示圆点
    const dotsContainer = document.getElementById('tourDots');
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      this.tourSteps.forEach((s, i) => {
        const dot = document.createElement('div');
        dot.className = 'tour-dot' + (i === index ? ' active' : '');
        dot.title = `${t('tour_step', '步骤')} ${i + 1}`;
        dot.onclick = () => this.renderTourStep(i);
        dotsContainer.appendChild(dot);
      });
    }

    // 4. 上一步 / 下一步 / 跳过按钮状态
    const btnSkip = document.querySelector('.btn-tour-skip');
    if (btnSkip) btnSkip.textContent = t('tour_skip', '跳过演示');
    const btnPrev = document.getElementById('btnTourPrev');
    if (btnPrev) {
      btnPrev.textContent = t('tour_prev', '上一步');
      btnPrev.disabled = index === 0;
      btnPrev.style.opacity = index === 0 ? '0.4' : '1';
    }
    const btnNext = document.getElementById('btnTourNext');
    if (btnNext) {
      btnNext.textContent = index === this.tourSteps.length - 1 ? t('tour_finish', '完成体验 🎉') : t('tour_next', '下一步 →');
    }

    // 5. 聚光灯框与引导卡片精确定位
    const spotlight = document.getElementById('tourSpotlight');
    const hint = document.getElementById('tourSpotlightHint');
    const card = document.getElementById('tourCard');
    if (!spotlight || !card) return;

    if (hint) {
      hint.textContent = step.hintText || '👆 点击此处体验';
    }

    // 绑定高亮区域点击事件：支持直接触发实际按钮动作并进入下一步
    spotlight.onclick = (e) => {
      e.stopPropagation();
      if (step.clickTarget) {
        const el = document.querySelector(step.clickTarget);
        if (el) el.click();
      }
      this.nextTourStep();
    };

    let rect = null;

    if (step.targetType === 'canvas_furniture') {
      const sofa = this.engine.furniture.find(f => f.id === 'f1') || this.engine.furniture[0];
      if (sofa) {
        this.renderer.selectedItem = { type: 'furniture', id: sofa.id, obj: sofa };
        this.updateSelectionPropertyCard(this.renderer.selectedItem);
        this.renderer.render();

        const canvasRect = this.canvas.getBoundingClientRect();
        const screenPos = this.engine.worldToScreen(sofa.x, sofa.y);
        const zoom = this.engine.viewport.zoom || 0.1;
        const w = (sofa.width + 40) * zoom;
        const h = (sofa.height + 40) * zoom;
        const rotH = 320 * zoom; // 包含正上方旋转按钮及标签
        rect = {
          left: Math.round(canvasRect.left + screenPos.x - w / 2),
          top: Math.round(canvasRect.top + screenPos.y - h / 2 - rotH),
          width: Math.round(w),
          height: Math.round(h + rotH)
        };
      }
    } else {
      let targetEl = null;
      if (step.targetBox) {
        targetEl = document.querySelector(step.targetBox);
      }
      if (!targetEl || targetEl.offsetParent === null) {
        targetEl = step.target ? document.querySelector(step.target) : null;
      }
      if ((!targetEl || targetEl.offsetParent === null) && step.fallbackTarget) {
        targetEl = document.querySelector(step.fallbackTarget);
      }

      if (targetEl && targetEl.offsetParent !== null) {
        const r = targetEl.getBoundingClientRect();
        rect = {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        };
      }
    }

    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 6;
      spotlight.style.display = 'block';
      const spotLeft = Math.max(4, rect.left - pad);
      const spotTop = Math.max(4, rect.top - pad);
      const spotWidth = rect.width + pad * 2;
      const spotHeight = rect.height + pad * 2;

      spotlight.style.left = `${spotLeft}px`;
      spotlight.style.top = `${spotTop}px`;
      spotlight.style.width = `${spotWidth}px`;
      spotlight.style.height = `${spotHeight}px`;

      // 引导卡片精准定位，绝对不遮挡高亮按钮
      const cardW = 420;
      const cardH = 260;
      let cardLeft = spotLeft;
      let cardTop = spotTop + spotHeight + 16;

      if (step.cardPlacement === 'right-sidebar') {
        // 侧边栏展开时，卡片放置在侧边栏右侧 (x > 330)
        cardLeft = Math.max(spotLeft + spotWidth + 20, 340);
        cardTop = Math.max(20, Math.min(window.innerHeight - cardH - 20, spotTop - 20));
      } else if (step.cardPlacement === 'right-top' || step.cardPlacement === 'right-center') {
        cardLeft = spotLeft + spotWidth + 20;
        cardTop = Math.max(20, Math.min(window.innerHeight - cardH - 20, spotTop - 20));
        if (cardLeft + cardW > window.innerWidth - 20) {
          cardLeft = Math.max(20, spotLeft - cardW - 20);
        }
      } else {
        // 默认卡片位于高亮按钮正下方
        cardLeft = Math.max(20, Math.min(window.innerWidth - cardW - 20, spotLeft));
        cardTop = spotTop + spotHeight + 16;
        if (cardTop + cardH > window.innerHeight - 20) {
          cardTop = Math.max(20, spotTop - cardH - 16);
        }
      }

      card.style.top = `${cardTop}px`;
      card.style.left = `${cardLeft}px`;
      card.style.transform = 'none';
    } else {
      // 找不到目标时居中回退
      spotlight.style.display = 'none';
      card.style.top = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
    }
  }

  nextTourStep() {
    if (!this.tourSteps) return;
    if (this.currentTourStep < this.tourSteps.length - 1) {
      this.renderTourStep(this.currentTourStep + 1);
    } else {
      this.skipTour();
    }
  }

  prevTourStep() {
    if (!this.tourSteps) return;
    if (this.currentTourStep > 0) {
      this.renderTourStep(this.currentTourStep - 1);
    }
  }

  skipTour() {
    const overlay = document.getElementById('tourOverlay');
    if (overlay) overlay.style.display = 'none';
    try {
      localStorage.setItem('floorplan_tour_shown', 'true');
    } catch(e) {}
  }

  // --- Multi-Language Change Callback ---

  loadSampleBlueprintAsync() {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        this.engine.blueprint.image = img;
        this.engine.blueprint.x = 0;
        this.engine.blueprint.y = 0;
        this.engine.blueprint.visible = true;
        this.engine.blueprint.locked = false;
        this.engine.blueprint.mmPerPixel = 10.0;
        this.zoomToFit();
        this.renderer.render();
        resolve(true);
      };
      img.onerror = () => {
        // Fallback: draw a procedural sample houseplan into a canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1200;
        tempCanvas.height = 900;
        const c = tempCanvas.getContext('2d');
        c.fillStyle = '#ffffff';
        c.fillRect(0, 0, 1200, 900);
        c.strokeStyle = '#1e293b';
        c.lineWidth = 12;
        c.strokeRect(100, 100, 1000, 700);
        c.beginPath();
        c.moveTo(500, 100); c.lineTo(500, 800);
        c.moveTo(500, 450); c.lineTo(1100, 450);
        c.stroke();
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          this.engine.blueprint.image = fallbackImg;
          this.engine.blueprint.visible = true;
          this.engine.blueprint.mmPerPixel = 10.0;
          this.zoomToFit();
          this.renderer.render();
          resolve(true);
        };
        fallbackImg.src = tempCanvas.toDataURL();
      };
      img.src = 'sample_blueprint.png';
    });
  }

  // --- Danger Clear Canvas (双重防误删危险确认) ---
  openDangerClearModal() {
    this.dangerClearStep = 1;
    const modal = document.getElementById('modalDangerClear');
    if (modal) modal.style.display = 'flex';
    this.updateDangerClearUI();
  }

  closeDangerClearModal() {
    this.dangerClearStep = 1;
    const modal = document.getElementById('modalDangerClear');
    if (modal) modal.style.display = 'none';
  }

  handleDangerClearClick() {
    if (this.dangerClearStep === 1) {
      this.dangerClearStep = 2;
      this.updateDangerClearUI();
    } else if (this.dangerClearStep === 2) {
      this.executeClearCanvas();
      this.closeDangerClearModal();
    }
  }

  updateDangerClearUI() {
    const btn = document.getElementById('btnConfirmDangerClear');
    const hint = document.getElementById('dangerClearStepHint');
    const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
    if (!btn || !hint) return;

    if (this.dangerClearStep === 1) {
      btn.className = 'unit-btn btn-danger-action';
      btn.textContent = t('btn_clear_step1', '⚠️ 确认清空 (1/2)');
      hint.className = 'danger-step-hint mt-3';
      hint.textContent = t('modal_clear_step1_hint', '请点击下方危险按钮确认第 1 次 (步骤 1/2)');
    } else {
      btn.className = 'unit-btn btn-danger-action step2-armed';
      btn.textContent = t('btn_clear_step2', '🔥 再次点击彻底清空 (2/2)');
      hint.className = 'danger-step-hint mt-3 active-step2';
      hint.textContent = t('modal_clear_step2_hint', '⚠️ 请再次点击红色按钮以彻底执行清空 (步骤 2/2)');
    }
  }

  executeClearCanvas() {
    this.cancelActiveOperation();
    this.engine.clear();
    this.renderer.selectedItem = null;
    this.renderer.hoveredItem = null;
    this.renderer.dragGhost = null;
    this.pendingOpeningType = null;
    this.draggingItem = null;
    this.activeTransform = null;
    this.hidePropertyCard();
    this.checkEmptyState();
    this.renderer.render();

    const msg = window.i18n ? window.i18n.t('toast_clear_success', '当前楼层已彻底清空') : '当前楼层已彻底清空';
    this.showToast ? this.showToast(msg) : console.log(msg);
  }

  onLanguageChange(lang) {
    this.initTour();
    const overlay = document.getElementById('tourOverlay');
    if (overlay && overlay.style.display !== 'none') {
      this.renderTourStep(this.currentTourStep);
    }

    if (window.i18n) {
      document.title = window.i18n.t('app_title', '极简户型绘制工具');
      
      // Update default project title if not custom renamed
      const titleEl = document.getElementById('projectTitle');
      if (titleEl) {
        const curTitle = (titleEl.textContent || '').trim();
        const defaultTitles = [
          '雅居乐花园·3室2厅1厨2卫 128㎡',
          '雅居樂花園·3室2廳1廚2衛 128㎡',
          'Agile Garden · 3 Beds 2 Baths 1 Kitchen 128㎡',
          'アジャイルガーデン · 3LDK 128㎡'
        ];
        if (defaultTitles.includes(curTitle) || curTitle.startsWith('雅居乐花园') || curTitle.startsWith('雅居樂花園') || curTitle.startsWith('Agile Garden') || curTitle.startsWith('アジャイルガーデン')) {
          titleEl.textContent = window.i18n.t('default_project_title', '雅居乐花园·3室2厅1厨2卫 128㎡');
        }
      }
    }

    // Re-populate furniture catalog with translated titles
    this.populateFurnitureCatalog();

    // Update storey panel labels
    this.renderStoreyList();

    // Update Project Info modal if currently open
    const modalProjectInfo = document.getElementById('modalProjectInfo');
    if (modalProjectInfo && modalProjectInfo.style.display !== 'none') {
      const t = (k, fb) => (window.i18n ? window.i18n.t(k, fb) : fb);
      const titleEl = document.querySelector('#modalProjectInfo .modal-title');
      const applyBtn = document.querySelector('#modalProjectInfo .unit-btn-download');
      if (this.projectInfoMode === 'new') {
        if (titleEl) titleEl.textContent = t('modal_new_project_title', '新建户型信息');
        if (applyBtn) applyBtn.textContent = t('modal_confirm_create', '确认并新建空白户型');
      } else {
        if (titleEl) titleEl.textContent = t('modal_adjust_project_title', '调整当前户型信息');
        if (applyBtn) applyBtn.textContent = t('modal_confirm_apply', '确认并应用');
      }
      this.updateAutoNamePreview();
    }

    // Update Download modal preview if currently open
    const modalDownload = document.getElementById('modalDownload');
    if (modalDownload && modalDownload.style.display !== 'none') {
      this.renderDownloadPreview();
    }

    // Update Danger modal if currently open
    const modalDanger = document.getElementById('modalDangerClear');
    if (modalDanger && modalDanger.style.display !== 'none') {
      this.updateDangerClearUI();
    }

    // Re-render canvas with translated room names and area immediately
    this.renderer.render();
  }

}

// Instantiate application on window ready
function initApp() {
  const instance = new FloorPlanApp();
  try {
    delete window.app;
  } catch(e) {}
  Object.defineProperty(window, 'app', {
    value: instance,
    writable: true,
    configurable: true
  });
  window.floorPlanApp = instance;
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
