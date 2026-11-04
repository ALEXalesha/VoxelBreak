// Все построители моделей кодом по именам из манифеста (src: 'proc:имя').
import { house, bridge, fence, pole } from './buildings.js';
import { tree, rock } from './nature.js';
import { car, barrel, crate } from './props.js';
import { bulldozer, crane, boom, ball } from './vehicles.js';
import * as items from './items.js';

export const BUILDERS = { house, bridge, fence, pole, tree, rock, car, barrel, crate, bulldozer, crane, boom, ball,
  'item.hammer': items.hammer, 'item.hands': items.hands, 'item.dynamite': items.dynamite, 'item.shotgun': items.shotgun,
  'item.rocket': items.rocket, 'item.laser': items.laser, 'item.vehicle': items.remote };
