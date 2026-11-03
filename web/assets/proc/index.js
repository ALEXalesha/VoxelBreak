// Все построители моделей кодом по именам из манифеста (src: 'proc:имя').
import { house, bridge, fence, pole } from './buildings.js';
import { tree, rock } from './nature.js';
import { car, barrel, crate } from './props.js';

export const BUILDERS = { house, bridge, fence, pole, tree, rock, car, barrel, crate };
