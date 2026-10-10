/**
 * 复活与剩余步数（v4.0）
 */
import type { GameState } from './types';

/**
 * 复活：步数耗尽后看激励视频加步（引擎层只管数值变化，广告流程在适配层）
 *
 * - 未处于失败态时原样返回（幂等保护）；
 * - 解除失败态、stepBudget += extraSteps；
 * - 棋盘不动、已消耗步数继续累加（复活后继续当前棋盘）。
 *
 * @param extraSteps 增加的步数（如 3）
 */
export function revive(state: GameState, extraSteps: number): GameState {
  if (!state.failed) return state;
  return {
    ...state,
    failed: false,
    stepBudget: state.stepBudget + extraSteps,
  };
}

/**
 * 剩余步数 = stepBudget - steps
 * UI 常驻显示（最醒目），剩余 ≤2 进入告急态（PRD FR-03）
 */
export function getRemainingSteps(state: GameState): number {
  return Math.max(0, state.stepBudget - state.steps);
}
