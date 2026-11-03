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
  },
};
