/**
 * 最优步数求解器（关卡生成 / 验收时使用，不在运行时调用）
 *
 * - BFS 全状态空间搜索（状态 = 棋盘：角色 + 物件位置，忽略步数）；
 * - 同时用于派生 maxSteps = optimalSteps + 容错余量；
 * - 搜索状态数上限 SOLVER_NODE_LIMIT，超出或穷尽无解 → 返回 null。
 */
import { DIRECTIONS } from './board';
import { SOLVER_NODE_LIMIT } from './constants';
import { applyMoveCore } from './core';
import { createState } from './createState';
import { checkWin } from './checkWin';
import { serializeBoard } from './serialize';
import type { GameState, LevelConfig } from './types';

/**
 * 计算某关卡的最优步数
 * @returns 最少通关步数；无解或超出搜索上限时返回 null
 */
export function computeOptimalSteps(config: LevelConfig): number | null {
  const start = createState(config);
  if (checkWin(start, config)) return 0;

  const seen = new Set<string>([serializeBoard(start)]);
  let frontier: GameState[] = [start];
  let depth = 0;

  while (frontier.length > 0) {
    depth += 1;
    const nextFrontier: GameState[] = [];

    for (const s of frontier) {
      for (const dir of DIRECTIONS) {
        const r = applyMoveCore(s, config, dir);
        if (r.rejected) continue;

        const key = serializeBoard(r.state);
        if (seen.has(key)) continue;
        seen.add(key);

        if (checkWin(r.state, config)) return depth; // BFS 首次到达即最优
        if (seen.size > SOLVER_NODE_LIMIT) return null; // 超出搜索上限

        nextFrontier.push(r.state);
      }
    }

    frontier = nextFrontier;
  }

  return null; // 全状态空间穷尽仍无解
}
