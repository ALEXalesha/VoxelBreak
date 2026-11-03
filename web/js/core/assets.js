// Загрузчик моделей по манифесту (web/assets/manifest.js). proc: - построитель кодом,
// иначе - файл GLB, который переводится в воксели (glbToModel). Модели из файлов грузятся заранее
// (preload), дальше get() синхронный: генератор мира не ждёт сети.

export class Assets {
  constructor(manifest, builders, { fetchBytes = null, glbToModel = null } = {}) {
    this.manifest = manifest;
    this.builders = builders;
    this.fetchBytes = fetchBytes;
    this.glbToModel = glbToModel;
    this.loaded = new Map();
  }

  entry(id) {
    const e = this.manifest.models[id];
    if (!e) throw new Error(`нет модели «${id}» в манифесте`);
    return e;
  }

  has(id) { return Object.hasOwn(this.manifest.models, id); }

  async preload() {
    for (const [id, e] of Object.entries(this.manifest.models)) {
      if (e.src.startsWith('proc:') || this.loaded.has(id)) continue;
      if (!this.fetchBytes || !this.glbToModel) throw new Error(`модель «${id}» из файла, а загрузчика файлов нет`);
      const bytes = await this.fetchBytes(e.src);
      this.loaded.set(id, this.glbToModel(bytes, { voxel: e.voxel ?? this.manifest.voxel, solid: !!e.solid, scale: e.scale ?? 1 }));
    }
  }

  get(id, params = {}, rng = null) {
    const e = this.entry(id);
    if (e.src.startsWith('proc:')) {
      const build = this.builders[e.src.slice(5)];
      if (!build) throw new Error(`нет построителя «${e.src}»`);
      return build({ ...(e.params || {}), ...params }, rng);
    }
    const m = this.loaded.get(id);
    if (!m) throw new Error(`модель «${id}» не загружена: сначала preload()`);
    return m;
  }
}
