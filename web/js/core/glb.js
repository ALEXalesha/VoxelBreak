// Модель из Blender (.glb) -> воксели. Свой разбор GLB без библиотек: сетки, узлы с
// перемещением/поворотом/масштабом, цвет материала. Материал вокселя: если материал в Blender
// назван как материал игры (brick, glass, metal…) - он, иначе ближайший по цвету.
// Треугольники переводятся в воксели проверкой «треугольник пересекает кубик» (теорема
// о разделяющей оси); solid - залить внутренность (иначе только оболочка).
import { VoxelModel } from './model.js';
import { byName, nearestMaterial } from './materials.js';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGlb(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 20) throw new Error('GLB: слишком короткий файл');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB: нет подписи glTF');
  if (dv.getUint32(4, true) !== 2) throw new Error('GLB: нужна версия 2');
  let json = null, bin = null;
  for (let off = 12; off + 8 <= u8.length;) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = u8.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error('GLB: нет описания');
  const accessor = (i) => {
    const a = json.accessors[i];
    const view = json.bufferViews[a.bufferView];
    const T = COMP[a.componentType];
    const n = SIZE[a.type];
    const stride = view.byteStride || T.BYTES_PER_ELEMENT * n;
    const out = new Float64Array(a.count * n);
    const base = bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0);
    const d = new DataView(bin.buffer);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let i2 = 0; i2 < a.count; i2++)
      for (let k = 0; k < n; k++) {
        let v = d[get](base + i2 * stride + k * T.BYTES_PER_ELEMENT, true);
        if (a.normalized) v /= { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType] || 1;
        out[i2 * n + k] = v;
      }
    return out;
  };
  // треугольники в координатах сцены: [ax, ay, az, bx, ..., cz], цвет и имя материала
  const tris = [];
  const visit = (ni, parent) => {
    const node = json.nodes[ni];
    const m = mul(parent, nodeMatrix(node));
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const pos = accessor(prim.attributes.POSITION);
        const idx = prim.indices != null ? accessor(prim.indices) : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
        const mat = prim.material != null ? json.materials[prim.material] : null;
        const f = mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor || [0.8, 0.8, 0.8, 1];
        const color = f.slice(0, 3).map((c) => Math.round(linearToSrgb(c) * 255));
        const name = mat && mat.name ? String(mat.name).toLowerCase().replace(/\.\d+$/, '') : '';
        for (let i = 0; i < idx.length; i += 3) {
          const t = [];
          for (let k = 0; k < 3; k++) {
            const j = idx[i + k] * 3;
            t.push(...apply(m, pos[j], pos[j + 1], pos[j + 2]));
          }
          tris.push({ p: t, color, name });
        }
      }
    }
    for (const c of node.children || []) visit(c, m);
  };
  const scene = json.scenes ? json.scenes[json.scene || 0] : { nodes: json.nodes.map((_, i) => i) };
  for (const ni of scene.nodes) visit(ni, IDENT);
  return tris;
}

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// матрицы по столбцам, как в glTF
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const apply = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

// треугольники -> модель; voxel - размер вокселя в единицах модели (метрах), scale - множитель модели
export function voxelize(tris, { voxel = 0.25, solid = false, scale = 1 } = {}) {
  if (!tris.length) throw new Error('GLB: в модели нет треугольников');
  const k = scale / voxel;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (let i = 0; i < 9; i++) { t.p[i] *= k; lo[i % 3] = Math.min(lo[i % 3], t.p[i]); hi[i % 3] = Math.max(hi[i % 3], t.p[i]); }
  const size = [0, 1, 2].map((a) => Math.max(1, Math.ceil(hi[a] - lo[a] - 1e-9)));
  if (size[0] * size[1] * size[2] > 16e6) throw new Error('GLB: модель слишком большая для этого размера вокселя');
  const m = new VoxelModel(size[0], size[1], size[2]);
  for (const t of tris) {
    const p = t.p.map((v, i) => v - lo[i % 3]);
    const mat = (byName(t.name) && !byName(t.name).anchor && t.name !== 'air' ? byName(t.name).id : 0) || nearestMaterial(...t.color);
    const b0 = [0, 1, 2].map((a) => Math.max(0, Math.floor(Math.min(p[a], p[a + 3], p[a + 6]))));
    const b1 = [0, 1, 2].map((a) => Math.min(size[a] - 1, Math.floor(Math.max(p[a], p[a + 3], p[a + 6]))));
    for (let y = b0[1]; y <= b1[1]; y++)
      for (let z = b0[2]; z <= b1[2]; z++)
        for (let x = b0[0]; x <= b1[0]; x++)
          if (triBox(p, x + 0.5, y + 0.5, z + 0.5)) m.set(x, y, z, mat);
  }
  if (solid) fillInside(m);
  return m;
}

// всё, куда не дотекает воздух снаружи, - внутри; заливается материалом ближайшей стенки по x
function fillInside(m) {
  const { sx, sy, sz, data } = m;
  const out = new Uint8Array(data.length);
  const stack = [];
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++)
    if ((x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1) && !data[m.idx(x, y, z)]) { out[m.idx(x, y, z)] = 1; stack.push(x, y, z); }
  while (stack.length) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = x + dx, b = y + dy, c = z + dz;
      if (!m.inside(a, b, c)) continue;
      const i = m.idx(a, b, c);
      if (out[i] || data[i]) continue;
      out[i] = 1; stack.push(a, b, c);
    }
  }
  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
    let wall = 0;
    for (let x = 0; x < sx; x++) {
      const i = m.idx(x, y, z);
      if (data[i]) wall = data[i];
      else if (!out[i] && wall) data[i] = wall;
    }
  }
}

// пересекает ли треугольник (9 чисел) кубик 1×1×1 с центром c (теорема о разделяющей оси)
export function triBox(t, cx, cy, cz) {
  const h = 0.5;
  const v0 = [t[0] - cx, t[1] - cy, t[2] - cz], v1 = [t[3] - cx, t[4] - cy, t[5] - cz], v2 = [t[6] - cx, t[7] - cy, t[8] - cz];
  for (let a = 0; a < 3; a++) if (Math.min(v0[a], v1[a], v2[a]) > h || Math.max(v0[a], v1[a], v2[a]) < -h) return false;
  const e = [sub(v1, v0), sub(v2, v1), sub(v0, v2)];
  const n = cross3(e[0], e[1]);
  const d = dot3(n, v0);
  const r = h * (Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]));
  if (Math.abs(d) > r) return false;
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const ed of e)
    for (const ax of axes) {
      const L = cross3(ed, ax);
      if (!L[0] && !L[1] && !L[2]) continue;
      const p0 = dot3(L, v0), p1 = dot3(L, v1), p2 = dot3(L, v2);
      const rr = h * (Math.abs(L[0]) + Math.abs(L[1]) + Math.abs(L[2]));
      if (Math.min(p0, p1, p2) > rr || Math.max(p0, p1, p2) < -rr) return false;
    }
  return true;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function glbToModel(bytes, opts) {
  const m = voxelize(parseGlb(bytes), opts);
  m.pivot = [m.sx / 2, 0, m.sz / 2];
  return m;
}
