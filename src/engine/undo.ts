/**
 * 撤销（v4.0：回退棋盘，但不返还步数）
 *
 * - 撤销无限次；每次回退一步棋盘（用于「救棋局」）；
 * - ⚠️ 步数锁死：steps / stepBudget 保持不变（已消耗的预算收不回来）；
 * - 胜利 / 失败态下不可撤销（失败后需 revive() 才能继续）。
 */
import { deserializeBoard } from './serialize';
import type { GameState, LevelConfig, MoveResult } from './types';

/**
 * 撤销一步
 * @returns 恢复棋盘后的状态；steps / stepBudget 保持不变
 */
export function undo(state: GameState, config: LevelConfig): MoveResult {
  // 参数 config 预留给未来的机关相关校验；当前撤销只需要棋盘快照
  void config;

  if (state.won || state.failed) return { state, events: [], rejected: true };
  if (state.history.length === 0) return { state, events: [], rejected: true };

  // ① 取出最近的棋盘快照
  const snapshot = state.history[state.history.length - 1];

  // ② 恢复棋盘（⚠️ steps / stepBudget 保持不变——步数锁死）
  const restored = deserializeBoard(snapshot, state);

  // ③ 快照出栈
  const next: GameState = {
    ...restored,
    steps: state.steps, // 不返还
    stepBudget: state.stepBudget, // 不变
    history: state.history.slice(0, -1),
    won: false,
    failed: false,
  };

  return {
    state: next,
    events: [{ type: 'undo_performed', steps: next.steps }],
    rejected: false,
  };
}
