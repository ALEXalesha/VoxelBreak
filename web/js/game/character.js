// Движения персонажа без окна: углы костей по скорости, прыжку и приседу. Шаг - синус по пройденному
// пути, руки и ноги в противофазе; стоя - лёгкое дыхание. Окно только ставит эти углы на кости.

export function checkRig(rig) {
  const names = new Set();
  for (const b of rig.bones) {
    if (names.has(b.name)) return `кость «${b.name}» повторяется`;
    if (b.parent !== null && !names.has(b.parent)) return `у кости «${b.name}» нет родителя «${b.parent}» выше по списку`;
    names.add(b.name);
  }
  for (const p of rig.parts) if (!names.has(p.bone)) return `часть на несуществующей кости «${p.bone}»`;
  return null;
}

// state: { phase } (накапливается), p - игрок; вернёт углы { кость: [x, y, z] } в радианах
export function pose(state, p, dt) {
  const speed = Math.hypot(p.vx || 0, p.vz || 0);
  const k = Math.min(1, speed / 18);
  state.phase = (state.phase || 0) + speed * dt * 0.32;
  state.t = (state.t || 0) + dt;
  const swing = Math.sin(state.phase) * 0.75 * k;
  const air = !p.onGround && !p.flying;
  const breathe = Math.sin(state.t * 1.6) * 0.03 * (1 - k);
  const out = {
    hips: [0, 0, 0],
    spine: [p.crouch ? 0.35 : breathe, 0, 0],
    head: [-(p.pitch || 0) * 0.6, 0, 0],
    'arm.L': [swing, 0, air ? -0.5 : 0.05],
    'arm.R': [-swing, 0, air ? 0.5 : -0.05],
    'leg.L': [-swing + (air ? -0.4 : 0) + (p.crouch ? -0.6 : 0), 0, 0],
    'leg.R': [swing + (air ? 0.25 : 0) + (p.crouch ? -0.6 : 0), 0, 0],
  };
  return out;
}
