// Жадное построение сетки. Вход - решётка с каймой в один воксель (чанк 34³ или сетка тела),
// индекс x + px * (z + pz * y). Грань рисуется, где твёрдый непрозрачный воксель смотрит
// в воздух или в стекло; стекло - отдельной сеткой и только в воздух. Соседние грани с тем же
// материалом и тем же затенением углов сливаются в один прямоугольник.
import { MATERIALS, M } from './materials.js';

const AO_LIGHT = [0.42, 0.62, 0.8, 1];
const GLASS = M.GLASS;
const opaque = (m) => m !== 0 && m !== GLASS && m !== 255;

class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.vary = []; this.idx = []; this.quads = 0; }
  pack() {
    return {
      positions: new Float32Array(this.pos), normals: new Int8Array(this.nrm),
      colors: new Uint8Array(this.col), vary: new Uint8Array(this.vary),
      indices: new Uint32Array(this.idx), quads: this.quads,
    };
  }
}

// dims - размер без каймы [sx, sy, sz]
export function greedyMesh(grid, dims) {
  const [sx, sy, sz] = dims;
  const px = sx + 2, pz = sz + 2;
  const at = (x, y, z) => grid[(x + 1) + px * ((z + 1) + pz * (y + 1))];
  const out = { opaque: new Buf(), glass: new Buf() };
  const n = [sx, sy, sz];
  const p = [0, 0, 0], q = [0, 0, 0];
  const get3 = (c) => at(c[0], c[1], c[2]);

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const nu = n[u], nv = n[v];
    const mask = new Int32Array(nu * nv);
    for (let dir = -1; dir <= 1; dir += 2) {
      for (let s = 0; s < n[d]; s++) {
        // маска слоя: ключ = материал | затенение 4 углов << 8 | стекло << 16; 0 - грани нет
        let any = false;
        for (let j = 0; j < nv; j++)
          for (let i = 0; i < nu; i++) {
            p[d] = s; p[u] = i; p[v] = j;
            const a = get3(p);
            let key = 0;
            if (a !== 0 && a !== 255) {
              q[d] = s + dir; q[u] = i; q[v] = j;
              const b = get3(q);
              const isGlass = a === GLASS;
              const show = isGlass ? b === 0 || b === 255 : !opaque(b);
              if (show) {
                key = a | (isGlass ? 1 << 16 : 0);
                if (!isGlass) {
                  // затенение: три соседа перед гранью у каждого угла
                  let ao = 0;
                  for (let k = 0; k < 4; k++) {
                    const du = k === 1 || k === 2 ? 1 : -1, dv = k >= 2 ? 1 : -1;
                    q[d] = s + dir;
                    q[u] = i + du; q[v] = j; const s1 = opaque(get3(q)) ? 1 : 0;
                    q[u] = i; q[v] = j + dv; const s2 = opaque(get3(q)) ? 1 : 0;
                    q[u] = i + du; q[v] = j + dv; const c = opaque(get3(q)) ? 1 : 0;
                    const lv = s1 && s2 ? 0 : 3 - (s1 + s2 + c);
                    ao |= lv << (k * 2);
                  }
                  key |= ao << 8;
                } else key |= 0xff << 8;
                any = true;
              }
            }
            mask[i + j * nu] = key;
          }
        if (!any) continue;
        // слияние прямоугольников
        for (let j = 0; j < nv; j++)
          for (let i = 0; i < nu;) {
            const key = mask[i + j * nu];
            if (!key) { i++; continue; }
            let w = 1;
            while (i + w < nu && mask[i + w + j * nu] === key) w++;
            let h = 1;
            grow: while (j + h < nv) {
              for (let k = 0; k < w; k++) if (mask[i + k + (j + h) * nu] !== key) break grow;
              h++;
            }
            for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) mask[i + ii + (j + jj) * nu] = 0;
            emit(key & 0x10000 ? out.glass : out.opaque, d, u, v, dir, s, i, j, w, h, key);
            i += w;
          }
      }
    }
  }
  return { opaque: out.opaque.pack(), glass: out.glass.pack() };
}

function emit(buf, d, u, v, dir, s, i, j, w, h, key) {
  const mat = MATERIALS[key & 0xff];
  const plane = dir > 0 ? s + 1 : s;
  const base = buf.pos.length / 3;
  const corners = [[i, j], [i + w, j], [i + w, j + h], [i, j + h]];
  const ao = [];
  for (let k = 0; k < 4; k++) {
    const c = [0, 0, 0];
    c[d] = plane; c[u] = corners[k][0]; c[v] = corners[k][1];
    buf.pos.push(c[0], c[1], c[2]);
    const nn = [0, 0, 0]; nn[d] = dir;
    buf.nrm.push(nn[0], nn[1], nn[2]);
    const lv = (key >> 8) & 0xff;
    const a = lv === 0xff ? 3 : (lv >> (k * 2)) & 3;
    ao.push(a);
    const f = AO_LIGHT[a];
    buf.col.push(Math.round(mat.color[0] * f), Math.round(mat.color[1] * f), Math.round(mat.color[2] * f));
    buf.vary.push(Math.round(mat.vary * 255));
  }
  // диагональ - по затенению, чтобы оно не ложилось полосой; обход против часовой снаружи
  const flip = ao[0] + ao[2] < ao[1] + ao[3];
  const tri = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
  if (dir < 0) tri.reverse();
  for (const t of tri) buf.idx.push(base + t);
  buf.quads++;
}

// сетка тела (или модели) -> решётка с каймой воздуха для построителя
export function padGrid(data, sx, sy, sz) {
  const px = sx + 2, pz = sz + 2;
  const out = new Uint8Array(px * (sy + 2) * pz);
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const m = data[x + sx * (z + sz * y)];
        if (m !== 255) out[(x + 1) + px * ((z + 1) + pz * (y + 1))] = m;
      }
  return out;
}
