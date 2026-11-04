// Очередь сеток: задания уходят в Worker (если он есть), ответы со старой версией выбрасываются.
// Без Worker (или если он не завёлся) сетки строятся тут же, понемногу за кадр.
import { greedyMesh } from '../core/mesher.js';

export class MeshQueue {
  constructor({ useWorker = true, inFlight = 6 } = {}) {
    this.inFlight = inFlight;
    this.busy = 0;
    this.waiting = new Map();   // id -> { version, grid, dims, onDone }
    this.order = [];
    this.worker = null;
    this.latest = new Map();    // id -> последняя запрошенная версия
    this.callbacks = new Map();
    this.built = 0;
    if (useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this.done(e.data);
        this.worker.onerror = () => { this.worker = null; this.busy = 0; };
      } catch { this.worker = null; }
    }
  }

  // id - строка ('c:12', 'b:5'); новая просьба заменяет старую в очереди
  request(id, version, grid, dims, onDone, urgent = false) {
    this.latest.set(id, version);
    this.callbacks.set(id, onDone);
    if (!this.waiting.has(id)) { if (urgent) this.order.unshift(id); else this.order.push(id); }
    this.waiting.set(id, { version, grid, dims });
  }

  pending() { return this.waiting.size + this.busy; }

  // за кадр: отправить в Worker или построить сразу (budget мс без Worker)
  pump(budgetMs = 6) {
    const t0 = performance.now();
    while (this.order.length) {
      if (this.worker && this.busy >= this.inFlight) break;
      if (!this.worker && performance.now() - t0 > budgetMs) break;
      const id = this.order.shift();
      const job = this.waiting.get(id);
      this.waiting.delete(id);
      if (!job) continue;
      if (this.worker) {
        this.busy++;
        this.worker.postMessage({ id, version: job.version, grid: job.grid, dims: job.dims }, [job.grid.buffer]);
      } else {
        this.done({ id, version: job.version, mesh: greedyMesh(job.grid, job.dims) }, true);
      }
    }
  }

  done({ id, version, mesh }, local = false) {
    if (!local) this.busy = Math.max(0, this.busy - 1);
    if (this.latest.get(id) !== version) return;      // устарело
    this.built++;
    const cb = this.callbacks.get(id);
    if (cb) cb(mesh, version);
  }

  forget(id) { this.latest.delete(id); this.callbacks.delete(id); this.waiting.delete(id); }
}
