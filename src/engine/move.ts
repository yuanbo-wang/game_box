/**
 * 对外移动接口（v4.0 限步通关）
 *
 * 在棋盘动作核心（applyMoveCore）之上叠加三层：
 * ① 计步：每次有效移动 +1（非法操作不扣步数）；
 * ② 棋盘快照入历史（撤销用；⚠️ 快照不含步数——步数锁死）；
 * ③ 结算判定（顺序敏感，勿改）：胜利 → 步数耗尽失败 → 死局软提示。
 */
import { checkWin } from './checkWin';
import { applyMoveCore } from './core';
import { detectDeadlock } from './deadlock';
import { serializeBoard } from './serialize';
import type { Direction, GameState, LevelConfig, MoveResult } from './types';

/**
 * 执行一次移动（纯函数，不修改入参）
 * v4.0：每次有效移动消耗 1 步；步数耗尽且未完成 → failed = true
 */
export function move(state: GameState, config: LevelConfig, dir: Direction): MoveResult {
  // ① 已胜利 / 已失败 → 冻结（v4.0：失败后需 revive() 才能继续）
  if (state.won || state.failed) {
    return { state, events: [], rejected: true };
  }

  // ② 棋盘动作核心（非法操作不消耗步数）
  const core = applyMoveCore(state, config, dir);
  if (core.rejected) {
    return { state, events: [], rejected: true };
  }

  // ③ 计步 + 历史快照（快照记录的是「本次移动前」的棋盘）
  const next: GameState = {
    ...core.state,
    steps: state.steps + 1,
    history: [...state.history, serializeBoard(state)],
  };

  // ④ 结算判定（顺序敏感）
  if (checkWin(next, config)) {
    // 最后一步完成归位 → 必须判胜利（绝不能判失败）
    next.won = true;
    core.events.push({ type: 'level_won', steps: next.steps });
  } else if (next.steps >= next.stepBudget) {
    // 步数耗尽且未完成 → 失败（v4.0 核心：失败是常态，是"加步复活"的入口）
    next.failed = true;
    core.events.push({ type: 'steps_exhausted', steps: next.steps });
    core.events.push({ type: 'level_failed', steps: next.steps });
  } else if (detectDeadlock(next, config)) {
    // 死局：仅软提示（启发式，不改变状态机、不触发失败）
    core.events.push({ type: 'deadlock_detected' });
  }

  return { state: next, events: core.events, rejected: false };
}
