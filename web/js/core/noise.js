// Шум значений на решётке: гладкий, без состояния, зависит только от зерна и координат.
import { hash01 } from './rng.js';

const smooth = (t) => t * t * (3 - 2 * t);

export function valueNoise2(seed, x, z) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const tx = smooth(x - x0), tz = smooth(z - z0);
  const a = hash01(seed, x0, z0), b = hash01(seed, x0 + 1, z0);
  const c = hash01(seed, x0, z0 + 1), d = hash01(seed, x0 + 1, z0 + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

// сумма октав в [0, 1)
export function fbm2(seed, x, z, octaves = 4) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2(seed + i * 1013, x * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
