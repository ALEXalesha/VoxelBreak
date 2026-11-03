// Мир - решётка чанков 32³. Пустой чанк не хранится. Ниже нуля - коренная порода (тела не
// проваливаются), за краями по сторонам и сверху - воздух (там и ниже нуля пусто: улетевшее падает).
import { M } from './materials.js';

export const CS = 32;
export const CS3 = CS * CS * CS;
export const lidx = (x, y, z) => x | (z << 5) | (y << 10);

export class Chunk {
  constructor(cx, cy, cz) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.data = new Uint8Array(CS3);
    this.count = 0;
    this.version = 0;       // растёт при каждой правке: сетка знает, устарела ли
    this.modified = false;  // правка после генерации - чанк попадёт в сохранение
  }
}

export class World {
  constructor({ sx = 12, sy = 3, sz = 12 } = {}) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.nx = sx * CS; this.ny = sy * CS; this.nz = sz * CS;
    this.chunks = new Array(sx * sy * sz).fill(null);
    this.dirty = new Set();
  }

  chunkIndex(cx, cy, cz) { return cx + this.sx * (cz + this.sz * cy); }
  inChunks(cx, cy, cz) { return cx >= 0 && cy >= 0 && cz >= 0 && cx < this.sx && cy < this.sy && cz < this.sz; }
  chunk(cx, cy, cz) { return this.inChunks(cx, cy, cz) ? this.chunks[this.chunkIndex(cx, cy, cz)] : null; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.nx && y < this.ny && z < this.nz; }

  get(x, y, z) {
    if (x < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 0;
    if (y < 0) return M.BEDROCK;
    const c = this.chunks[(x >> 5) + this.sx * ((z >> 5) + this.sz * (y >> 5))];
    return c ? c.data[lidx(x & 31, y & 31, z & 31)] : 0;
  }

  // вернёт прежний материал; gen = true - запись генератора (не правка игрока)
  set(x, y, z, m, gen = false) {
    if (!this.inside(x, y, z)) return 0;
    const cx = x >> 5, cy = y >> 5, cz = z >> 5;
    const ci = this.chunkIndex(cx, cy, cz);
    let c = this.chunks[ci];
    if (!c) {
      if (m === 0) return 0;
      c = this.chunks[ci] = new Chunk(cx, cy, cz);
    }
    const i = lidx(x & 31, y & 31, z & 31);
    const old = c.data[i];
    if (old === m) return old;
    c.data[i] = m;
    c.count += (m !== 0) - (old !== 0);
    c.version++;
    if (!gen) c.modified = true;
    this.markDirty(x, y, z);
    return old;
  }

  // сетка чанка зависит и от соседних вокселей (грани и затенение углов): у края помечаются
  // и соседние чанки, включая диагональные
  markDirty(x, y, z) {
    const lx = x & 31, ly = y & 31, lz = z & 31;
    const cx = x >> 5, cy = y >> 5, cz = z >> 5;
    const dx0 = lx === 0 ? -1 : 0, dx1 = lx === 31 ? 1 : 0;
    const dy0 = ly === 0 ? -1 : 0, dy1 = ly === 31 ? 1 : 0;
    const dz0 = lz === 0 ? -1 : 0, dz1 = lz === 31 ? 1 : 0;
    for (let dy = dy0; dy <= dy1; dy++)
      for (let dz = dz0; dz <= dz1; dz++)
        for (let dx = dx0; dx <= dx1; dx++)
          if (this.inChunks(cx + dx, cy + dy, cz + dz)) this.dirty.add(this.chunkIndex(cx + dx, cy + dy, cz + dz));
  }

  takeDirty() {
    const list = [...this.dirty].sort((a, b) => a - b);
    this.dirty.clear();
    return list;
  }

  totalCount() {
    let n = 0;
    for (const c of this.chunks) if (c) n += c.count;
    return n;
  }

  // копия чанка с каймой в один воксель со всех сторон: вход построителя сетки
  padded(cx, cy, cz) {
    const P = CS + 2;
    const out = new Uint8Array(P * P * P);
    const x0 = cx * CS - 1, y0 = cy * CS - 1, z0 = cz * CS - 1;
    const c = this.chunk(cx, cy, cz);
    for (let y = 0; y < P; y++)
      for (let z = 0; z < P; z++) {
        const row = (z + P * y) * P;
        if (y > 0 && y < P - 1 && z > 0 && z < P - 1) {
          if (c) {
            const base = lidx(0, y - 1, z - 1);
            out.set(c.data.subarray(base, base + CS), row + 1);
          }
          out[row] = this.get(x0, y0 + y, z0 + z);
          out[row + P - 1] = this.get(x0 + P - 1, y0 + y, z0 + z);
        } else {
          for (let x = 0; x < P; x++) out[row + x] = this.get(x0 + x, y0 + y, z0 + z);
        }
      }
    return out;
  }

  // проход луча по вокселям (DDA). Возвращает первый твёрдый воксель и грань входа.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, solid = (m) => m !== 0) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 4096 && t <= maxDist; i++) {
      const m = this.get(x, y, z);
      if (solid(m)) return { x, y, z, nx, ny, nz, t, m, px: ox + dx * t, py: oy + dy * t, pz: oz + dz * t };
      if (tmx < tmy && tmx < tmz) { x += stepX; t = tmx; tmx += tdx; nx = -stepX; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += stepY; t = tmy; tmy += tdy; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -stepZ; }
    }
    return null;
  }
}
