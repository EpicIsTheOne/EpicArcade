// levels/index.js — level registry
import { COAST } from './coast.js';
import { FOUNDRY } from './foundry.js';
import { SKYFORGE } from './skyforge.js';

export const LEVELS = [COAST, FOUNDRY, SKYFORGE];
export function getLevelDef(id) {
  return LEVELS.find(l => l.id === id) || COAST;
}
