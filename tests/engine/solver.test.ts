/**
 * 求解器（computeOptimalSteps）与死局检测（detectDeadlock）测试
 */
import { describe, expect, it } from 'vitest';
import { computeOptimalSteps, createState, detectDeadlock, move } from '../../src/engine';
import { levelOnePush, levelRoom, levelUnsolvable } from './fixtures';

describe('computeOptimalSteps（BFS 求解器）', () => {
  it('一步通关关：最优步数 = 1', () => {
    expect(computeOptimalSteps(levelOnePush())).toBe(1);
  });

  it('小房间关：最优步数 = 4（BFS 最短路径）', () => {
    expect(computeOptimalSteps(levelRoom())).toBe(4);
  });

  it('无解关：返回 null', () => {
    expect(computeOptimalSteps(levelUnsolvable())).toBeNull();
  });
});

describe('detectDeadlock（启发式死局检测）', () => {
  it('初始即死局的关卡：返回 true', () => {
    const cfg = levelUnsolvable();
    expect(detectDeadlock(createState(cfg), cfg)).toBe(true);
  });

  it('可解关卡：初始状态不判死局', () => {
    const cfg = levelRoom();
    expect(detectDeadlock(createState(cfg), cfg)).toBe(false);
  });

  it('死局时 move() 产生 deadlock_detected 软提示，且不触发失败', () => {
    const cfg = levelUnsolvable();
    const s0 = createState(cfg);
    // 玩家向右走一步（P(1,2) → (2,2)），局面仍无解
    const r = move(s0, cfg, 'right');
    expect(r.rejected).toBe(false);
    expect(r.events.some((e) => e.type === 'deadlock_detected')).toBe(true);
    expect(r.state.failed).toBe(false); // 死局只是软提示
    expect(r.state.won).toBe(false);
    expect(r.state.steps).toBe(1); // 死局不返还、也不额外扣步
  });
});
