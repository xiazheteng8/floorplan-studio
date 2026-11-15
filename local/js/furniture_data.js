/**
 * 3DNest / Architectural Floorplan Furniture Catalog
 * Contains vector rendering functions and 3DNest CDN URLs
 */
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

const FURNITURE_CATALOG = [
  // --- 客厅 Living Room ---
  {
    id: 'sofa_3p',
    name: '三人沙发',
    category: 'living',
    width: 2400,
    height: 900,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E4%B8%89%E4%BA%BA%E6%B2%99%E5%8F%91.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const baseFill = colorMode ? '#e2e8f0' : '#ffffff';
      const seatFill = colorMode ? '#cbd5e1' : '#ffffff';
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      // Main frame
      ctx.fillStyle = baseFill;
      ctx.beginPath();
      ctx.roundRect(-w/2, -h/2, w, h, 8);
      ctx.fill();
      ctx.stroke();
      // Backrest
      ctx.fillStyle = seatFill;
      ctx.beginPath();
      ctx.roundRect(-w/2 + 10, -h/2 + 10, w - 20, h * 0.3, 4);
      ctx.fill();
      ctx.stroke();
      // 3 Cushions
      const cushionW = (w - 40) / 3;
      for (let i = 0; i < 3; i++) {
        const cx = -w/2 + 20 + i * cushionW;
        ctx.beginPath();
        ctx.roundRect(cx + 4, -h/2 + h * 0.35, cushionW - 8, h * 0.55, 6);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  {
    id: 'sofa_l',
    name: 'L型组合沙发',
    category: 'living',
    width: 3000,
    height: 2000,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%B2%99%E5%8F%91%E7%BB%84%E5%90%88.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const baseFill = colorMode ? '#e2e8f0' : '#ffffff';
      const seatFill = colorMode ? '#cbd5e1' : '#ffffff';
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      // L shape polygon
      const chaiseW = w * 0.35;
      const mainH = h * 0.45;
      ctx.fillStyle = baseFill;
      ctx.beginPath();
      ctx.moveTo(-w/2, -h/2);
      ctx.lineTo(w/2, -h/2);
      ctx.lineTo(w/2, -h/2 + mainH);
      ctx.lineTo(-w/2 + chaiseW, -h/2 + mainH);
      ctx.lineTo(-w/2 + chaiseW, h/2);
      ctx.lineTo(-w/2, h/2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Backrests
      ctx.fillStyle = seatFill;
      ctx.fillRect(-w/2 + 10, -h/2 + 10, w - 20, 30);
      ctx.strokeRect(-w/2 + 10, -h/2 + 10, w - 20, 30);
      ctx.fillRect(-w/2 + 10, -h/2 + 40, 30, h - 50);
      ctx.strokeRect(-w/2 + 10, -h/2 + 40, 30, h - 50);
      ctx.restore();
    }
  },
  {
    id: 'coffee_table',
    name: '茶几',
    category: 'living',
    width: 1300,
    height: 650,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E8%8C%B6%E5%87%A0.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#64748b' : '#000000';
      ctx.fillStyle = colorMode ? '#f1f5f9' : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-w/2, -h/2, w, h, 6);
      ctx.fill();
      ctx.stroke();
      // Inset bevel
      ctx.strokeRect(-w/2 + 12, -h/2 + 12, w - 24, h - 24);
      ctx.restore();
    }
  },
  {
    id: 'tv_cabinet',
    name: '电视柜',
    category: 'living',
    width: 2200,
    height: 400,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E7%94%B5%E8%A7%86%E6%9F%9C-%E9%95%BF.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#e2e8f0' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Center TV screen icon
      ctx.fillStyle = colorMode ? '#1e293b' : '#000000';
      ctx.fillRect(-w*0.3, -h*0.15, w*0.6, h*0.3);
      ctx.restore();
    }
  },

  // --- 卧室 Bedroom ---
  {
    id: 'bed_double',
    name: '1.8米双人床',
    category: 'bedroom',
    width: 2000,
    height: 2200,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E5%8F%8C%E4%BA%BA%E5%BA%8A.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const stroke = colorMode ? '#475569' : '#000000';
      const mattressFill = colorMode ? '#f8fafc' : '#ffffff';
      const duvetFill = colorMode ? '#e2e8f0' : '#ffffff';
      const headboardFill = colorMode ? '#cbd5e1' : '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      // Headboard
      ctx.fillStyle = headboardFill;
      ctx.fillRect(-w/2, -h/2, w, 140);
      ctx.strokeRect(-w/2, -h/2, w, 140);
      // Mattress frame
      ctx.fillStyle = mattressFill;
      ctx.beginPath();
      ctx.roundRect(-w/2 + 20, -h/2 + 140, w - 40, h - 150, 8);
      ctx.fill();
      ctx.stroke();
      // Pillows
      const pW = (w - 120) / 2;
      const pH = 350;
      ctx.fillStyle = colorMode ? '#ffffff' : '#ffffff';
      [-w/4, w/4].forEach(px => {
        ctx.beginPath();
        ctx.roundRect(px - pW/2, -h/2 + 180, pW, pH, 10);
        ctx.fill();
        ctx.stroke();
      });
      // Folded duvet line
      ctx.fillStyle = duvetFill;
      ctx.beginPath();
      ctx.roundRect(-w/2 + 20, -h/2 + 600, w - 40, h - 610, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  {
    id: 'bed_single',
    name: '1.2米单人床',
    category: 'bedroom',
    width: 1300,
    height: 2100,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E5%8D%95%E4%BA%BA%E5%BA%8A.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      ctx.fillStyle = colorMode ? '#cbd5e1' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, 120);
      ctx.strokeRect(-w/2, -h/2, w, 120);
      ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
      ctx.roundRect(-w/2 + 15, -h/2 + 120, w - 30, h - 130, 6);
      ctx.fill();
      ctx.stroke();
      // Single Pillow
      ctx.fillStyle = '#ffffff';
      ctx.roundRect(-w/3, -h/2 + 160, w*0.66, 320, 8);
      ctx.fill();
      ctx.stroke();
      // Duvet
      ctx.fillStyle = colorMode ? '#e2e8f0' : '#ffffff';
      ctx.roundRect(-w/2 + 15, -h/2 + 550, w - 30, h - 560, 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  {
    id: 'wardrobe',
    name: '大衣柜',
    category: 'bedroom',
    width: 2000,
    height: 600,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E8%A1%A3%E6%9F%9C.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#f1f5f9' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Sliding doors or doors split
      const doors = 3;
      const dw = w / doors;
      for (let i = 1; i < doors; i++) {
        ctx.beginPath();
        ctx.moveTo(-w/2 + i * dw, -h/2);
        ctx.lineTo(-w/2 + i * dw, h/2);
        ctx.stroke();
      }
      // Clothing rail symbol or diagonal cross
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-w/2 + 10, -h/2 + 10);
      ctx.lineTo(w/2 - 10, h/2 - 10);
      ctx.moveTo(w/2 - 10, -h/2 + 10);
      ctx.lineTo(-w/2 + 10, h/2 - 10);
      ctx.stroke();
      ctx.restore();
    }
  },

  // --- 餐厅 Dining Room ---
  {
    id: 'dining_table_6',
    name: '六人餐桌椅',
    category: 'dining',
    width: 1800,
    height: 1400,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E5%85%AD%E4%BA%BA%E9%A4%90%E6%A1%8C.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      // Table in center
      const tw = w * 0.85;
      const th = h * 0.55;
      ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-tw/2, -th/2, tw, th, 8);
      ctx.fill();
      ctx.stroke();
      // 6 Chairs
      const chairW = tw * 0.24;
      const chairH = 160;
      ctx.fillStyle = colorMode ? '#e2e8f0' : '#ffffff';
      // 3 on top, 3 on bottom
      [-tw*0.3, 0, tw*0.3].forEach(cx => {
        // top chair
        ctx.beginPath();
        ctx.roundRect(cx - chairW/2, -h/2, chairW, chairH, 4);
        ctx.fill();
        ctx.stroke();
        // bottom chair
        ctx.beginPath();
        ctx.roundRect(cx - chairW/2, h/2 - chairH, chairW, chairH, 4);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }
  },
  {
    id: 'dining_table_round',
    name: '圆形餐桌',
    category: 'dining',
    width: 1500,
    height: 1500,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E5%9B%9B%E4%BA%BA%E9%A4%90%E6%A1%8C.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      const r = w * 0.35;
      ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // 4 chairs around
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = colorMode ? '#e2e8f0' : '#ffffff';
        ctx.beginPath();
        ctx.roundRect(-150, -w/2, 300, 150, 4);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  },

  // --- 厨房 Kitchen ---
  {
    id: 'fridge_double',
    name: '双开门冰箱',
    category: 'kitchen',
    width: 1000,
    height: 700,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E5%8F%8C%E5%BC%80%E5%86%B0%E7%AE%B1.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#e2e8f0' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Split line
      ctx.beginPath();
      ctx.moveTo(0, -h/2);
      ctx.lineTo(0, h/2);
      ctx.stroke();
      // Handles
      ctx.strokeRect(-30, h*0.2, 15, 60);
      ctx.strokeRect(15, h*0.2, 15, 60);
      ctx.restore();
    }
  },
  {
    id: 'gas_stove',
    name: '燃气灶台',
    category: 'kitchen',
    width: 900,
    height: 600,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E4%B8%80%E5%AD%97%E6%A9%B1%E6%9F%9C.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#334155' : '#000000';
      ctx.fillStyle = colorMode ? '#1e293b' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Two burner rings
      [-w*0.24, w*0.24].forEach(bx => {
        ctx.strokeStyle = colorMode ? '#94a3b8' : '#000000';
        ctx.beginPath();
        ctx.arc(bx, 0, 110, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx, 0, 45, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }
  },
  {
    id: 'kitchen_sink',
    name: '厨房水槽',
    category: 'kitchen',
    width: 850,
    height: 550,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%B4%97%E6%89%8B%E6%B1%A0.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#f1f5f9' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Double basin
      const bw = w * 0.42;
      const bh = h * 0.75;
      [-w*0.23, w*0.23].forEach(bx => {
        ctx.beginPath();
        ctx.roundRect(bx - bw/2, -bh/2, bw, bh, 6);
        ctx.stroke();
      });
      // Faucet
      ctx.beginPath();
      ctx.arc(0, -h*0.35, 18, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },

  // --- 卫生间 Bathroom ---
  {
    id: 'toilet',
    name: '坐便马桶',
    category: 'bathroom',
    width: 500,
    height: 750,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E9%A9%AC%E6%A1%B6.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#ffffff' : '#ffffff';
      // Water tank
      ctx.fillRect(-w/2, -h/2, w, 220);
      ctx.strokeRect(-w/2, -h/2, w, 220);
      // Oval bowl
      ctx.beginPath();
      ctx.ellipse(0, h * 0.18, w * 0.45, h * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Inner hole
      ctx.beginPath();
      ctx.ellipse(0, h * 0.22, w * 0.25, h * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
  {
    id: 'vanity_sink',
    name: '浴室洗手台',
    category: 'bathroom',
    width: 900,
    height: 550,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%B4%97%E6%89%8B%E6%B1%A0.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Ceramic basin
      ctx.beginPath();
      ctx.roundRect(-w*0.35, -h*0.35, w*0.7, h*0.7, 10);
      ctx.stroke();
      // Faucet
      ctx.beginPath();
      ctx.arc(0, -h*0.25, 12, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },
  {
    id: 'shower_room',
    name: '淋浴房',
    category: 'bathroom',
    width: 1000,
    height: 1000,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%B7%8B%E6%B5%B4%E9%97%B4.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#38bdf8' : '#000000';
      ctx.fillStyle = colorMode ? 'rgba(224, 242, 254, 0.4)' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Diagonal floor drain pattern
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-w/2, -h/2);
      ctx.lineTo(w/2, h/2);
      ctx.moveTo(w/2, -h/2);
      ctx.lineTo(-w/2, h/2);
      ctx.stroke();
      // Drain in center
      ctx.setLineDash([]);
      ctx.fillStyle = colorMode ? '#64748b' : '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  },
  {
    id: 'washing_machine',
    name: '滚筒洗衣机',
    category: 'bathroom',
    width: 650,
    height: 650,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%B4%97%E8%A1%A3%E6%9C%BA.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#f1f5f9' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.strokeRect(-w/2, -h/2, w, h);
      // Top circular drum window
      ctx.beginPath();
      ctx.arc(0, h * 0.05, w * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, h * 0.05, w * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  // --- 书房与办公 Study / Office ---
  {
    id: 'study_desk',
    name: '书桌与办公椅',
    category: 'study',
    width: 1400,
    height: 900,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E4%B9%A6%E6%A1%8C%E7%BB%84%E5%90%88.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      const stroke = colorMode ? '#475569' : '#000000';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stroke;
      // Desk
      const dh = h * 0.65;
      ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
      ctx.fillRect(-w/2, -h/2, w, dh);
      ctx.strokeRect(-w/2, -h/2, w, dh);
      // Laptop / monitor
      ctx.fillStyle = colorMode ? '#334155' : '#000000';
      ctx.fillRect(-180, -h/2 + 60, 360, 30);
      // Ergonomic Chair behind
      ctx.fillStyle = colorMode ? '#cbd5e1' : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-220, h/2 - 260, 440, 240, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  },

  // --- 阳台与绿植 Balcony & Other ---
  {
    id: 'plant_large',
    name: '大型室内绿植',
    category: 'other',
    width: 600,
    height: 600,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E6%A4%8D%E7%89%A91.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#15803d' : '#000000';
      ctx.fillStyle = colorMode ? '#86efac' : '#ffffff';
      // Center pot
      ctx.beginPath();
      ctx.arc(0, 0, w*0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Leaves radiating out
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4;
        ctx.save();
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.ellipse(w*0.32, 0, w*0.18, w*0.08, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  },
  {
    id: 'air_conditioner',
    name: '立式空调',
    category: 'other',
    width: 500,
    height: 400,
    url: 'https://material.3dnest.cn/houseplan_editor/zq/furniture/%E7%BD%AE%E7%89%A9%E5%8F%B01.png',
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = colorMode ? '#475569' : '#000000';
      ctx.fillStyle = colorMode ? '#f1f5f9' : '#ffffff';
      ctx.beginPath();
      ctx.roundRect(-w/2, -h/2, w, h, 8);
      ctx.fill();
      ctx.stroke();
      // Grille slits
      for (let y = -h*0.2; y <= h*0.25; y += 40) {
        ctx.beginPath();
        ctx.moveTo(-w*0.35, y);
        ctx.lineTo(w*0.35, y);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  // --- 结构构件：柱子 / 楼梯（纯矢量绘制，彩色与 CAD 图均可用） ---
  {
    id: 'pillar',
    name: '柱子',
    category: 'structure',
    width: 400,
    height: 400,
    draw: (ctx, w, h, colorMode) => {
      ctx.save();
      ctx.fillStyle = colorMode ? '#1e293b' : '#000000';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  },
  {
    id: 'stairs_straight',
    name: '直跑楼梯',
    category: 'structure',
    width: 1000,
    height: 3300,
    draw: (ctx, w, h, colorMode) => StairDraw.straight(ctx, w, h, colorMode)
  },
  {
    id: 'stairs_l',
    name: 'L型转角楼梯',
    category: 'structure',
    width: 2400,
    height: 2800,
    draw: (ctx, w, h, colorMode) => StairDraw.lShape(ctx, w, h, colorMode)
  },
  {
    id: 'stairs_u',
    name: 'U型双跑楼梯',
    category: 'structure',
    width: 2400,
    height: 3000,
    draw: (ctx, w, h, colorMode) => StairDraw.uShape(ctx, w, h, colorMode)
  },
  {
    id: 'stairs_spiral',
    name: '旋转楼梯',
    category: 'structure',
    width: 1800,
    height: 1800,
    draw: (ctx, w, h, colorMode) => StairDraw.spiral(ctx, w, h, colorMode)
  }
];

// 楼梯矢量绘制工具（坐标单位：毫米，原点为构件中心）
const StairDraw = {
  style(ctx, colorMode) {
    ctx.fillStyle = colorMode ? '#f8fafc' : '#ffffff';
    ctx.strokeStyle = colorMode ? '#334155' : '#000000';
    ctx.lineWidth = 16;
    ctx.lineJoin = 'miter';
  },
  // 行走线 + 箭头 + “上”字
  walkLine(ctx, pts, colorMode, upAt) {
    ctx.save();
    ctx.strokeStyle = colorMode ? '#0284c7' : '#000000';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // 起点圆点
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, 45, 0, Math.PI * 2);
    ctx.fill();
    // 终点箭头
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const L = 170, W = 85;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - L * Math.cos(ang) + W * Math.sin(ang), b.y - L * Math.sin(ang) - W * Math.cos(ang));
    ctx.lineTo(b.x - L * Math.cos(ang) - W * Math.sin(ang), b.y - L * Math.sin(ang) + W * Math.cos(ang));
    ctx.closePath();
    ctx.fill();
    if (upAt) {
      ctx.font = 'bold 200px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = colorMode ? '#0f172a' : '#000000';
      ctx.fillText('上', upAt.x, upAt.y);
    }
    ctx.restore();
  },
  treads(ctx, x1, y1, x2, y2, count, horizontalLines) {
    // 在矩形 (x1,y1)-(x2,y2) 内画 count 段踏步线
    ctx.beginPath();
    for (let i = 1; i < count; i++) {
      if (horizontalLines) {
        const y = y1 + (y2 - y1) * i / count;
        ctx.moveTo(x1, y); ctx.lineTo(x2, y);
      } else {
        const x = x1 + (x2 - x1) * i / count;
        ctx.moveTo(x, y1); ctx.lineTo(x, y2);
      }
    }
    ctx.stroke();
  },
  straight(ctx, w, h, colorMode) {
    ctx.save();
    StairDraw.style(ctx, colorMode);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    const n = Math.max(3, Math.round(h / 270));
    ctx.lineWidth = 10;
    StairDraw.treads(ctx, -w / 2, -h / 2, w / 2, h / 2, n, true);
    StairDraw.walkLine(ctx, [{ x: 0, y: h / 2 - 260 }, { x: 0, y: -h / 2 + 140 }], colorMode, { x: 0, y: h / 2 - 110 });
    ctx.restore();
  },
  lShape(ctx, w, h, colorMode) {
    ctx.save();
    StairDraw.style(ctx, colorMode);
    const sw = Math.min(w, h) * 0.42; // 梯段宽
    const L = -w / 2, T = -h / 2, R = w / 2, B = h / 2;
    // L 形轮廓：左侧竖向梯段 + 顶部横向梯段
    ctx.beginPath();
    ctx.moveTo(L, B); ctx.lineTo(L, T); ctx.lineTo(R, T); ctx.lineTo(R, T + sw);
    ctx.lineTo(L + sw, T + sw); ctx.lineTo(L + sw, B); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 10;
    // 转角平台分隔线
    ctx.beginPath(); ctx.moveTo(L, T + sw); ctx.lineTo(L + sw, T + sw); ctx.lineTo(L + sw, T); ctx.stroke();
    const n1 = Math.max(3, Math.round((h - sw) / 270));
    const n2 = Math.max(3, Math.round((w - sw) / 270));
    StairDraw.treads(ctx, L, T + sw, L + sw, B, n1, true);
    StairDraw.treads(ctx, L + sw, T, R, T + sw, n2, false);
    const cx = L + sw / 2, cy = T + sw / 2;
    StairDraw.walkLine(ctx, [{ x: cx, y: B - 140 }, { x: cx, y: cy }, { x: R - 120, y: cy }], colorMode, { x: cx + sw * 0.75, y: B - 220 });
    ctx.restore();
  },
  uShape(ctx, w, h, colorMode) {
    ctx.save();
    StairDraw.style(ctx, colorMode);
    const gap = Math.max(80, w * 0.05); // 梯井
    const fw = (w - gap) / 2;           // 单跑宽度
    const land = Math.min(fw, h * 0.4); // 休息平台进深
    const L = -w / 2, T = -h / 2, R = w / 2, B = h / 2;
    ctx.fillRect(L, T, w, h);
    ctx.strokeRect(L, T, w, h);
    ctx.lineWidth = 10;
    // 平台线 + 梯井
    ctx.beginPath(); ctx.moveTo(L, T + land); ctx.lineTo(R, T + land); ctx.stroke();
    ctx.strokeRect(L + fw, T + land, gap, h - land);
    const n = Math.max(3, Math.round((h - land) / 270));
    StairDraw.treads(ctx, L, T + land, L + fw, B, n, true);
    StairDraw.treads(ctx, L + fw + gap, T + land, R, B, n, true);
    const cl = L + fw / 2, cr = R - fw / 2, cy = T + land / 2;
    StairDraw.walkLine(ctx, [{ x: cl, y: B - 140 }, { x: cl, y: cy }, { x: cr, y: cy }, { x: cr, y: B - 120 }], colorMode, { x: cl, y: B - 360 });
    ctx.restore();
  },
  spiral(ctx, w, h, colorMode) {
    ctx.save();
    StairDraw.style(ctx, colorMode);
    const r = Math.min(w, h) / 2, rc = r * 0.16;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 10;
    const n = 14;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / n;
      ctx.moveTo(Math.cos(a) * rc, Math.sin(a) * rc);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.stroke();
    ctx.fillStyle = colorMode ? '#64748b' : '#000000';
    ctx.beginPath(); ctx.arc(0, 0, rc, 0, Math.PI * 2); ctx.fill();
    // 弧形行走线
    const rw = (r + rc) / 2, a0 = Math.PI / 2 + 0.25, a1 = a0 + Math.PI * 1.6;
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * i / 24; pts.push({ x: Math.cos(a) * rw, y: Math.sin(a) * rw }); }
    StairDraw.walkLine(ctx, pts, colorMode, null);
    ctx.restore();
  }
};


if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FURNITURE_CATALOG };
}
