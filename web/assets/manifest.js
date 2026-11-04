// Слой загрузки моделей. Игра просит модель только по имени (assets.get(id, params)) и не знает,
// откуда она. Источник:
//   proc:имя            - построена кодом (web/assets/proc), params передаются построителю;
//   models/файл.glb      - модель из Blender: треугольники переводятся в воксели при загрузке,
//                          voxel - размер вокселя в метрах модели, solid - заполнить внутренность.
// Чтобы подставить модель из Blender, достаточно поменять src здесь: например
//   house: { src: 'models/house.glb', voxel: 0.25, solid: false },
export const MANIFEST = {
  voxel: 0.25,
  models: {
    house: { src: 'proc:house' },
    bridge: { src: 'proc:bridge' },
    fence: { src: 'proc:fence' },
    pole: { src: 'proc:pole' },
    tree: { src: 'proc:tree' },
    rock: { src: 'proc:rock' },
    car: { src: 'proc:car' },
    barrel: { src: 'proc:barrel' },
    crate: { src: 'proc:crate' },
    bulldozer: { src: 'proc:bulldozer' },
    crane: { src: 'proc:crane' },
    boom: { src: 'proc:boom' },
    ball: { src: 'proc:ball' },
    // предметы в руках: воксель 3 см
    'item.hammer': { src: 'proc:item.hammer', scale: 0.12 },
    'item.hands': { src: 'proc:item.hands', scale: 0.12 },
    'item.dynamite': { src: 'proc:item.dynamite', scale: 0.12 },
    'item.shotgun': { src: 'proc:item.shotgun', scale: 0.12 },
    'item.rocket': { src: 'proc:item.rocket', scale: 0.09 },
    'item.laser': { src: 'proc:item.laser', scale: 0.12 },
    'item.vehicle': { src: 'proc:item.vehicle', scale: 0.12 },
    // персонаж: скелет и части на костях (из Blender потом - тот же формат костей)
    character: { src: 'proc:character' },
  },
};
