// Жадное построение сетки. Вход - решётка с каймой в один воксель (чанк 34³ или сетка тела),
// индекс x + px * (z + pz * y). Грань рисуется, где твёрдый непрозрачный воксель смотрит
// в воздух или в стекло; стекло - отдельной сеткой и только в воздух. Соседние грани с тем же
// материалом и тем же затенением углов сливаются в один прямоугольник.
import { MATERIALS, M } from './materials.js';

const AO_LIGHT = [0.42, 0.62, 0.8, 1];
const GLASS = M.GLASS;

class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.vary = []; this.idx = []; this.ao = []; this.mats = []; this.quads = 0; }
  pack() {
    return {
      positions: new Float32Array(this.pos), normals: new Int8Array(this.nrm),
      colors: new Uint8Array(this.col), vary: new Uint8Array(this.vary),
      indices: new Uint32Array(this.idx), ao: new Uint8Array(this.ao), mats: new Uint8Array(this.mats), quads: this.quads,
    };
  }
}

// dims - размер без каймы [sx, sy, sz]
const OPAQUE = new Uint8Array(256).map((_, m) => (m !== 0 && m !== GLASS && m !== 255 ? 1 : 0));

export function greedyMesh(grid, dims) {
  const [sx, sy, sz] = dims;
  const px = sx + 2, pz = sz + 2;
  const out = { opaque: new Buf(), glass: new Buf() };
  const n = [sx, sy, sz];
  const st = [1, px * pz, px];                 // шаг индекса по x, y, z
  const origin = 1 + px + px * pz;

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const nu = n[u], nv = n[v];
    const sd = st[d], su = st[u], sv = st[v];
    const mask = new Int32Array(nu * nv);
    for (let dir = -1; dir <= 1; dir += 2) {
      const front = dir * sd;
      for (let s = 0; s < n[d]; s++) {
        // маска слоя: ключ = материал | затенение 4 углов << 8 | стекло << 16; 0 - грани нет
        let any = false;
        for (let j = 0; j < nv; j++) {
          let ai = origin + s * sd + j * sv;
          for (let i = 0; i < nu; i++, ai += su) {
            const a = grid[ai];
            let key = 0;
            if (a !== 0 && a !== 255) {
              const b = grid[ai + front];
              if (a === GLASS) {
                if (b === 0 || b === 255) key = a | (1 << 16) | (0xff << 8);
              } else if (!OPAQUE[b]) {
                // затенение: три соседа перед гранью у каждого угла
                const f = ai + front;
                const um = OPAQUE[grid[f - su]], up = OPAQUE[grid[f + su]], vm = OPAQUE[grid[f - sv]], vp = OPAQUE[grid[f + sv]];
                const c0 = OPAQUE[grid[f - su - sv]], c1 = OPAQUE[grid[f + su - sv]], c2 = OPAQUE[grid[f + su + sv]], c3 = OPAQUE[grid[f - su + sv]];
                const l0 = um && vm ? 0 : 3 - (um + vm + c0);
                const l1 = up && vm ? 0 : 3 - (up + vm + c1);
                const l2 = up && vp ? 0 : 3 - (up + vp + c2);
                const l3 = um && vp ? 0 : 3 - (um + vp + c3);
                key = a | ((l0 | (l1 << 2) | (l2 << 4) | (l3 << 6)) << 8);
              }
              if (key) any = true;
            }
            mask[i + j * nu] = key;
          }
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
            for (let jj = 0; jj < h; jj++) mask.fill(0, i + (j + jj) * nu, i + w + (j + jj) * nu);
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
    buf.ao.push(a);
    const f = AO_LIGHT[a];
    buf.col.push(Math.round(mat.color[0] * f), Math.round(mat.color[1] * f), Math.round(mat.color[2] * f));
    buf.vary.push(Math.round(mat.vary * 255));
  }
  // диагональ - по затенению, чтобы оно не ложилось полосой; обход против часовой снаружи
  const flip = ao[0] + ao[2] < ao[1] + ao[3];
  const tri = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
  if (dir < 0) tri.reverse();
  for (const t of tri) buf.idx.push(base + t);
  buf.mats.push(key & 0xff);
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
