/**
 * 限步通关与失败 / 复活测试（v4.0 核心规则）
 */
import { describe, expect, it } from 'vitest';
import { createState, getRemainingSteps, move, revive } from '../../src/engine';
import { levelRoom, levelRoomExact, levelRoomTight } from './fixtures';

describe('限步通关（v4.0）', () => {
  it('每次有效移动步数正确累加', () => {
    const cfg = levelRoom();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state; // 推动 B 上移（1 步）
    s = move(s, cfg, 'right').state; // 走一步（2 步）
    expect(s.steps).toBe(2);
    expect(getRemainingSteps(s)).toBe(cfg.meta.maxSteps - 2);
  });

  it('步数达到 stepBudget 且未胜利 → failed = true，并发出 steps_exhausted + level_failed', () => {
    const cfg = levelRoomTight(); // 预算 1 步，但通关需要 4 步
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'up'); // 唯一一步：推动 B，但远未完成
    expect(r.rejected).toBe(false);
    expect(r.state.steps).toBe(1);
    expect(r.state.failed).toBe(true);
    expect(r.state.won).toBe(false);
    expect(r.events.some((e) => e.type === 'steps_exhausted')).toBe(true);
    expect(r.events.some((e) => e.type === 'level_failed')).toBe(true);
  });

  it('failed 状态下 move() 被拒绝（棋盘冻结）', () => {
    const cfg = levelRoomTight();
    const s0 = createState(cfg);
    const s1 = move(s0, cfg, 'up').state;
    expect(s1.failed).toBe(true);
    const r2 = move(s1, cfg, 'right');
    expect(r2.rejected).toBe(true);
    expect(r2.state).toBe(s1);
  });

  it('最后一步完成时判定为胜利而非失败（边界，胜利优先）', () => {
    const cfg = levelRoomExact(); // 预算恰好等于最优 4 步
    let s = createState(cfg);
    s = move(s, cfg, 'up').state; // 1
    s = move(s, cfg, 'right').state; // 2
    s = move(s, cfg, 'up').state; // 3
    const r = move(s, cfg, 'left'); // 4：最后一步完成归位
    expect(r.state.won).toBe(true);
    expect(r.state.failed).toBe(false);
    expect(r.state.steps).toBe(4);
    expect(r.events.some((e) => e.type === 'level_won')).toBe(true);
    expect(r.events.some((e) => e.type === 'level_failed')).toBe(false);
  });

  it('revive() 解除失败态、预算 +3，且可继续移动', () => {
    const cfg = levelRoomTight();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state; // 失败
    expect(s.failed).toBe(true);

    s = revive(s, 3);
    expect(s.failed).toBe(false);
    expect(s.stepBudget).toBe(cfg.meta.maxSteps + 3);
    expect(getRemainingSteps(s)).toBe(cfg.meta.maxSteps + 3 - 1); // 已消耗步数不重置

    const r = move(s, cfg, 'right'); // 复活后可继续
    expect(r.rejected).toBe(false);
    expect(r.state.steps).toBe(2);
  });

  it('revive() 在非失败态为幂等（原样返回）', () => {
    const cfg = levelRoom();
    const s0 = createState(cfg);
    expect(revive(s0, 3)).toBe(s0);
  });

  it('复活后再次耗尽仍会失败（预算是消耗品）', () => {
    const cfg = levelRoomTight(); // 预算 1
    let s = createState(cfg);
    s = move(s, cfg, 'up').state; // 步 1 → 失败
    s = revive(s, 1); // 预算 → 2
    s = move(s, cfg, 'right').state; // 步 2 → 再次失败
    expect(s.failed).toBe(true);
    expect(s.steps).toBe(2);
  });

  it('getRemainingSteps 不会为负（展示用）', () => {
    const cfg = levelRoomTight();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state;
    expect(getRemainingSteps(s)).toBe(0);
  });
});
