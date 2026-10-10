/**
 * 创建初始游戏状态
 */
import { PLAYER_ID } from './constants';
import type { Box, GameState, LevelConfig, Position } from './types';

/**
 * 创建初始游戏状态
 * @param config 关卡配置
 * @returns 初始化后的不可变状态（stepBudget = config.meta.maxSteps）
 */
export function createState(config: LevelConfig): GameState {
  const boxes: Record<string, Box> = {};
  for (const b of config.boxes) {
    boxes[b.id] = { id: b.id, type: b.type, position: { ...b.position } };
  }
  const puppetPositions: Record<string, Position> = {};
  for (const p of config.puppets) {
    puppetPositions[p.id] = { ...p.position };
  }
  return {
    levelId: config.id,
    playerPos: { ...config.playerStart },
    activeActorId: PLAYER_ID,
    puppetPositions,
    boxes,
    steps: 0,
    stepBudget: config.meta.maxSteps,
    history: [],
    won: false,
    failed: false,
  };
}
