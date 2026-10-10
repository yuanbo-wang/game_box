/**
 * 胜利判定：所有星光台（目标点）上都有物件
 * （关卡校验器保证物件数 === 目标点数）
 */
import { getBoxAt } from './board';
import type { GameState, LevelConfig } from './types';

export function checkWin(state: GameState, config: LevelConfig): boolean {
  return config.targets.every((t) => !!getBoxAt(state, t));
}
