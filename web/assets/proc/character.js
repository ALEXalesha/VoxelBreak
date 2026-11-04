// Персонаж кодом: скелет (кости с родителями и точками вращения) и воксельные части, каждая жёстко
// на своей кости. Размер вокселя персонажа - 1/2 вокселя мира (12,5 см), рост 1,8 м = 14 вокселей мира.
// Формат тот же, каким будет модель из Blender: bones [{ name, parent, pivot }], parts [{ bone, model, at }].
// pivot и at - в вокселях персонажа от точки между ступнями.
import { VoxelModel } from '../../js/core/model.js';
import { M } from '../../js/core/materials.js';

const block = (sx, sy, sz, mat, paint) => {
  const m = new VoxelModel(sx, sy, sz);
  m.box(0, 0, 0, sx, sy, sz, mat);
  if (paint) paint(m);
  m.pivot = [0, 0, 0];
  return m;
};

export function character({ shirt = 'paint_blue', pants = 'asphalt' } = {}) {
  const S = M[shirt.toUpperCase()] || M.PAINT_BLUE, P = M[pants.toUpperCase()] || M.ASPHALT;
  const skin = M.PLASTER, boots = M.RUBBER;
  const bones = [
    { name: 'hips', parent: null, pivot: [0, 6.5, 0] },
    { name: 'spine', parent: 'hips', pivot: [0, 7, 0] },
    { name: 'head', parent: 'spine', pivot: [0, 11, 0] },
    { name: 'arm.L', parent: 'spine', pivot: [-2.5, 11, 0] },
    { name: 'arm.R', parent: 'spine', pivot: [2.5, 11, 0] },
    { name: 'leg.L', parent: 'hips', pivot: [-1, 6.5, 0] },
    { name: 'leg.R', parent: 'hips', pivot: [1, 6.5, 0] },
  ];
  const parts = [
    { bone: 'hips', at: [-2, 5.5, -1], model: block(4, 2, 2, P) },
    { bone: 'spine', at: [-2, 7, -1], model: block(4, 4, 2, S) },
    { bone: 'head', at: [-1.5, 11, -1.5], model: block(3, 3, 3, skin, (m) => { m.box(0, 2, 0, 3, 3, 3, M.WOOD); m.set(0, 1, 0, M.RUBBER); m.set(2, 1, 0, M.RUBBER); }) },
    { bone: 'arm.L', at: [-3.5, 7, -0.5], model: block(1, 4, 1, S, (m) => m.set(0, 0, 0, skin)) },
    { bone: 'arm.R', at: [2.5, 7, -0.5], model: block(1, 4, 1, S, (m) => m.set(0, 0, 0, skin)) },
    { bone: 'leg.L', at: [-2, 0, -1], model: block(2, 6, 2, P, (m) => m.box(0, 0, 0, 2, 1, 2, boots)) },
    { bone: 'leg.R', at: [0, 0, -1], model: block(2, 6, 2, P, (m) => m.box(0, 0, 0, 2, 1, 2, boots)) },
  ];
  return { rig: true, voxel: 0.5, height: 14, bones, parts };
}
