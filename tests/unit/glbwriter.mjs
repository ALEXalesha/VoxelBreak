// Маленький писатель GLB для законов: ящики с материалами и узлами, как их выгрузил бы Blender.
export function boxMesh(w, h, d) {
  const x = w / 2, z = d / 2;
  const P = [-x, 0, -z, x, 0, -z, x, h, -z, -x, h, -z, -x, 0, z, x, 0, z, x, h, z, -x, h, z];
  const I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  return { positions: P, indices: I };
}

// parts: [{ positions, indices, material: { name, color: [r, g, b] }, node: { translation, rotation, scale } }]
export function makeGlb(parts, { shortIndex = true } = {}) {
  const bins = [];
  let offset = 0;
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], materials: [], accessors: [], bufferViews: [], buffers: [] };
  const push = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer.slice(0));
    const pad = (4 - (bytes.length % 4)) % 4;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    bins.push(bytes, new Uint8Array(pad));
    offset += bytes.length + pad;
    return json.bufferViews.length - 1;
  };
  parts.forEach((p, i) => {
    const pos = new Float32Array(p.positions);
    const idx = shortIndex ? new Uint16Array(p.indices) : new Uint32Array(p.indices);
    const pv = push(pos, 34962), iv = push(idx, 34963);
    json.accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3' });
    json.accessors.push({ bufferView: iv, componentType: shortIndex ? 5123 : 5125, count: idx.length, type: 'SCALAR' });
    json.materials.push({ name: p.material?.name || `m${i}`, pbrMetallicRoughness: { baseColorFactor: [...(p.material?.color || [0.8, 0.8, 0.8]), 1] } });
    json.meshes.push({ primitives: [{ attributes: { POSITION: json.accessors.length - 2 }, indices: json.accessors.length - 1, material: i }] });
    json.nodes.push({ mesh: i, ...(p.node || {}) });
    json.scenes[0].nodes.push(i);
  });
  const bin = new Uint8Array(offset);
  let o = 0;
  for (const b of bins) { bin.set(b, o); o += b.length; }
  json.buffers.push({ byteLength: bin.length });
  let text = new TextEncoder().encode(JSON.stringify(json));
  const tpad = (4 - (text.length % 4)) % 4;
  text = Uint8Array.from([...text, ...new Array(tpad).fill(32)]);
  const total = 12 + 8 + text.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, text.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20);
  const b0 = 20 + text.length;
  dv.setUint32(b0, bin.length, true); dv.setUint32(b0 + 4, 0x004e4942, true); out.set(bin, b0 + 8);
  return out;
}
