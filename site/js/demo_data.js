/**
 * Pre-configured realistic 3-bedroom luxury apartment layout
 * Total Area: ~108.5 sqm (3 Rooms, 2 Living, 2 Baths, 1 Balcony)
 * Coordinates in world millimeters (mm)
 */
const DEMO_HOUSE_DATA = {
  title: "雅居乐花园·3室2厅1厨2卫 128㎡",
  scaleUnit: "mm",
  walls: [
    // Exterior perimeter
    { id: 'w1', p1: {x: 0, y: 0}, p2: {x: 12000, y: 0}, thickness: 240, type: 'bearing' },
    { id: 'w2', p1: {x: 12000, y: 0}, p2: {x: 12000, y: 9000}, thickness: 240, type: 'bearing' },
    { id: 'w3', p1: {x: 12000, y: 9000}, p2: {x: 0, y: 9000}, thickness: 240, type: 'bearing' },
    { id: 'w4', p1: {x: 0, y: 9000}, p2: {x: 0, y: 0}, thickness: 240, type: 'bearing' },

    // Left Column Separator (between Kitchen/Foyer/Bed2 and Dining/Living)
    { id: 'w5', p1: {x: 2800, y: 0}, p2: {x: 2800, y: 3400}, thickness: 120, type: 'normal' },
    { id: 'w6', p1: {x: 0, y: 3400}, p2: {x: 2800, y: 3400}, thickness: 120, type: 'normal' },
    { id: 'w7', p1: {x: 0, y: 5600}, p2: {x: 2800, y: 5600}, thickness: 120, type: 'normal' },
    { id: 'w8', p1: {x: 2800, y: 5600}, p2: {x: 2800, y: 9000}, thickness: 120, type: 'normal' },

    // Public Bathroom divider inside Left Column
    { id: 'w9', p1: {x: 0, y: 4500}, p2: {x: 2800, y: 4500}, thickness: 120, type: 'normal' },

    // Center Column (Dining & Living soft partition, Balcony sliding divider)
    { id: 'w10', p1: {x: 2800, y: 3800}, p2: {x: 7600, y: 3800}, thickness: 100, type: 'virtual' },
    { id: 'w11', p1: {x: 2800, y: 7200}, p2: {x: 7600, y: 7200}, thickness: 120, type: 'normal' },

    // Right Column Separator (between Living/Dining and Master/Bed3)
    { id: 'w12', p1: {x: 7600, y: 0}, p2: {x: 7600, y: 9000}, thickness: 120, type: 'normal' },

    // Master Bedroom & Bed 3 horizontal divider
    { id: 'w13', p1: {x: 7600, y: 4800}, p2: {x: 12000, y: 4800}, thickness: 120, type: 'normal' },

    // Master Bathroom inside Master Suite
    { id: 'w14', p1: {x: 9800, y: 0}, p2: {x: 9800, y: 2400}, thickness: 120, type: 'normal' },
    { id: 'w15', p1: {x: 9800, y: 2400}, p2: {x: 12000, y: 2400}, thickness: 120, type: 'normal' }
  ],
  doors: [
    // Main Entry door on left foyer
    { id: 'd1', wallId: 'w4', t: 0.42, width: 1000, type: 'entry_door', flipX: false, flipY: false },
    // Kitchen sliding glass door
    { id: 'd2', wallId: 'w5', t: 0.65, width: 1400, type: 'sliding_door', flipX: false, flipY: false },
    // Public Bath door
    { id: 'd3', wallId: 'w9', t: 0.7, width: 800, type: 'single_door', flipX: false, flipY: false },
    // Bedroom 2 door
    { id: 'd4', wallId: 'w8', t: 0.25, width: 900, type: 'single_door', flipX: true, flipY: false },
    // Balcony 4-panel sliding door
    { id: 'd5', wallId: 'w11', t: 0.5, width: 3200, type: 'sliding_door', flipX: false, flipY: false },
    // Master suite entrance door
    { id: 'd6', wallId: 'w12', t: 0.42, width: 900, type: 'single_door', flipX: false, flipY: true },
    // Master bath door
    { id: 'd7', wallId: 'w15', t: 0.4, width: 800, type: 'single_door', flipX: false, flipY: false },
    // Bedroom 3 entrance door
    { id: 'd8', wallId: 'w12', t: 0.65, width: 900, type: 'single_door', flipX: false, flipY: false }
  ],
  windows: [
    // Kitchen window
    { id: 'wn1', wallId: 'w1', t: 0.12, width: 1500, type: 'window', flipX: false, flipY: false },
    // Dining room window
    { id: 'wn2', wallId: 'w1', t: 0.42, width: 1800, type: 'window', flipX: false, flipY: false },
    // Master bedroom luxury bay window
    { id: 'wn3', wallId: 'w1', t: 0.72, width: 2200, type: 'bay_window', flipX: false, flipY: false },
    // Master bathroom window
    { id: 'wn4', wallId: 'w2', t: 0.14, width: 1000, type: 'window', flipX: false, flipY: false },
    // Bedroom 3 window
    { id: 'wn5', wallId: 'w2', t: 0.75, width: 2000, type: 'window', flipX: false, flipY: false },
    // Balcony full-view French window
    { id: 'wn6', wallId: 'w3', t: 0.43, width: 3600, type: 'french_window', flipX: false, flipY: false },
    // Bedroom 2 window
    { id: 'wn7', wallId: 'w3', t: 0.12, width: 1600, type: 'window', flipX: false, flipY: false }
  ],
  rooms: [
    {
      id: 'r1',
      name: '客厅',
      type: 'living',
      floorTexture: 'tile_carrara',
      polygon: [{x: 2800, y: 3800}, {x: 7600, y: 3800}, {x: 7600, y: 7200}, {x: 2800, y: 7200}],
      center: {x: 6400, y: 6200}
    },
    {
      id: 'r2',
      name: '餐厅',
      type: 'dining',
      floorTexture: 'tile_carrara',
      polygon: [{x: 2800, y: 0}, {x: 7600, y: 0}, {x: 7600, y: 3800}, {x: 2800, y: 3800}],
      center: {x: 6500, y: 1500}
    },
    {
      id: 'r3',
      name: '主卧',
      type: 'bedroom',
      floorTexture: 'wood_warm',
      polygon: [{x: 7600, y: 0}, {x: 9800, y: 0}, {x: 9800, y: 2400}, {x: 12000, y: 2400}, {x: 12000, y: 4800}, {x: 7600, y: 4800}],
      center: {x: 10400, y: 3800}
    },
    {
      id: 'r4',
      name: '主卫',
      type: 'bathroom',
      floorTexture: 'tile_hex',
      polygon: [{x: 9800, y: 0}, {x: 12000, y: 0}, {x: 12000, y: 2400}, {x: 9800, y: 2400}],
      center: {x: 10400, y: 1200}
    },
    {
      id: 'r5',
      name: '书房',
      type: 'bedroom',
      floorTexture: 'wood_warm',
      polygon: [{x: 7600, y: 4800}, {x: 12000, y: 4800}, {x: 12000, y: 9000}, {x: 7600, y: 9000}],
      center: {x: 8800, y: 7600}
    },
    {
      id: 'r6',
      name: '次卧',
      type: 'bedroom',
      floorTexture: 'wood_warm',
      polygon: [{x: 0, y: 5600}, {x: 2800, y: 5600}, {x: 2800, y: 9000}, {x: 0, y: 9000}],
      center: {x: 2100, y: 6200}
    },
    {
      id: 'r7',
      name: '厨房',
      type: 'kitchen',
      floorTexture: 'tile_hex',
      polygon: [{x: 0, y: 0}, {x: 2800, y: 0}, {x: 2800, y: 3400}, {x: 0, y: 3400}],
      center: {x: 1400, y: 2200}
    },
    {
      id: 'r8',
      name: '公卫',
      type: 'bathroom',
      floorTexture: 'tile_hex',
      polygon: [{x: 0, y: 4500}, {x: 2800, y: 4500}, {x: 2800, y: 5600}, {x: 0, y: 5600}],
      center: {x: 1400, y: 4750}
    },
    {
      id: 'r9',
      name: '景观阳台',
      type: 'balcony',
      floorTexture: 'tile_grey',
      polygon: [{x: 2800, y: 7200}, {x: 7600, y: 7200}, {x: 7600, y: 9000}, {x: 2800, y: 9000}],
      center: {x: 5200, y: 8100}
    },
    {
      id: 'r10',
      name: '玄关',
      type: 'entry',
      floorTexture: 'tile_carrara',
      polygon: [{x: 0, y: 3400}, {x: 2800, y: 3400}, {x: 2800, y: 4500}, {x: 0, y: 4500}],
      center: {x: 1400, y: 3950}
    }
  ],
  furniture: [
    // Living room
    { id: 'f1', type: 'sofa_3p', name: '三人沙发', x: 5200, y: 4700, width: 2400, height: 900, rotation: 0 },
    { id: 'f2', type: 'coffee_table', name: '茶几', x: 5200, y: 5600, width: 1300, height: 650, rotation: 0 },
    { id: 'f3', type: 'tv_cabinet', name: '电视柜', x: 5200, y: 6900, width: 2200, height: 400, rotation: 0 },
    { id: 'f4', type: 'plant_large', name: '大型室内绿植', x: 3300, y: 4400, width: 600, height: 600, rotation: 0 },
    { id: 'f4b', type: 'air_conditioner', name: '立式空调', x: 7100, y: 6800, width: 500, height: 400, rotation: 0 },

    // Dining room
    { id: 'f5', type: 'dining_table_6', name: '六人餐桌椅', x: 5200, y: 1900, width: 1800, height: 1400, rotation: 0 },

    // Master Bedroom
    { id: 'f6', type: 'bed_double', name: '1.8米双人床', x: 9200, y: 3200, width: 2000, height: 2200, rotation: 0 },
    { id: 'f7', type: 'wardrobe', name: '大衣柜', x: 8000, y: 3200, width: 2000, height: 600, rotation: 90 },

    // Master Bathroom
    { id: 'f8', type: 'shower_room', name: '淋浴房', x: 10400, y: 600, width: 1000, height: 1000, rotation: 0 },
    { id: 'f9', type: 'toilet', name: '坐便马桶', x: 11500, y: 600, width: 500, height: 750, rotation: 180 },
    { id: 'f10', type: 'vanity_sink', name: '浴室洗手台', x: 11200, y: 1900, width: 900, height: 550, rotation: 0 },

    // Bedroom 3 / Study
    { id: 'f11', type: 'bed_double', name: '1.5米大床', x: 10800, y: 7600, width: 1800, height: 2100, rotation: 90 },
    { id: 'f12', type: 'study_desk', name: '书桌与办公椅', x: 8800, y: 5500, width: 1400, height: 900, rotation: 0 },

    // Bedroom 2
    { id: 'f13', type: 'bed_single', name: '1.2米单人床', x: 1400, y: 8000, width: 1300, height: 2100, rotation: 0 },
    { id: 'f14', type: 'wardrobe', name: '大衣柜', x: 600, y: 6600, width: 1800, height: 600, rotation: 90 },

    // Kitchen
    { id: 'f15', type: 'gas_stove', name: '燃气灶台', x: 500, y: 1200, width: 900, height: 600, rotation: 90 },
    { id: 'f16', type: 'kitchen_sink', name: '厨房水槽', x: 1400, y: 400, width: 850, height: 550, rotation: 0 },
    { id: 'f17', type: 'fridge_double', name: '双开门冰箱', x: 2300, y: 500, width: 1000, height: 700, rotation: 0 },

    // Public Bathroom
    { id: 'f18', type: 'toilet', name: '坐便马桶', x: 800, y: 5050, width: 500, height: 750, rotation: 90 },
    { id: 'f19', type: 'vanity_sink', name: '浴室洗手台', x: 2100, y: 5050, width: 900, height: 550, rotation: 270 },

    // Balcony
    { id: 'f20', type: 'washing_machine', name: '滚筒洗衣机', x: 3300, y: 8300, width: 650, height: 650, rotation: 0 }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEMO_HOUSE_DATA };
}
