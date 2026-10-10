/**
 * 死局检测（简化版 · 尽力而为）
 *
 * 完整死局判定是 PSPACE 难度；此处做有限深度 BFS（深度上限 10，见 docs/03 3.2），
 * 结果表达为「可能卡住了」的软提示：**不改变状态机、不触发失败**。
 * 搜索空间有防御性上限（DEADLOCK_NODE_LIMIT），超出即视为「不确定」返回未卡住。
 */
import { DIRECTIONS } from './board';
import { DEADLOCK_BFS_DEPTH, DEADLOCK_NODE_LIMIT } from './constants';
import { applyMoveCore } from './core';
import { checkWin } from './checkWin';
import { serializeBoard } from './serialize';
import type { GameState, LevelConfig } from './types';

/**
 * 判断当前局面是否已「无解」
 * @returns true = 有限深度内找不到任何可达胜利路径（可能卡住了）
 */
export function detectDeadlock(state: GameState, config: LevelConfig): boolean {
  if (checkWin(state, config)) return false;

  const seen = new Set<string>([serializeBoard(state)]);
  let frontier: GameState[] = [state];

  for (let depth = 0; depth < DEADLOCK_BFS_DEPTH; depth++) {
    const nextFrontier: GameState[] = [];
    for (const s of frontier) {
      for (const dir of DIRECTIONS) {
        const r = applyMoveCore(s, config, dir);
        if (r.rejected) continue;

        const key = serializeBoard(r.state);
        if (seen.has(key)) continue;

        // 深度内找到可达胜利 → 未卡死
        if (checkWin(r.state, config)) return false;

        seen.add(key);
        if (seen.size > DEADLOCK_NODE_LIMIT) {
          return false; // 超出状态上限：不确定，按未卡死处理（宁可漏报，不可误报）
        }
        nextFrontier.push(r.state);
      }
    }
    if (nextFrontier.length === 0) break; // 无新状态可达
    frontier = nextFrontier;
  }

  return true; // 深度内穷尽仍无可达胜利路径
}
