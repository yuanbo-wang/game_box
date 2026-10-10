/**
 * 机关测试：传送带 / 滑梯 / 弹簧 / 跨机关链（固定结算顺序 + 递归上限 5）
 */
import { describe, expect, it } from 'vitest';
import { createState, move } from '../../src/engine';
import type { LevelConfig, MoveResult } from '../../src/engine';
import {
  levelConveyor,
  levelConveyorBlocked,
  levelConveyorChain,
  levelConveyorLoop,
  levelConveyorToSlope,
  levelSlope,
  levelSpring,
} from './fixtures';

/**
 * 通用动作：P 从 (1,1) 走到 (3,1)，再向下把 B(3,2) 推到 (3,3)
 * （各机关夹具的 B 都放在 (3,2)，机关布置在 (3,3) 及其后方）
 */
function pushBoxDown(cfg: LevelConfig): MoveResult {
  let s = createState(cfg);
  s = move(s, cfg, 'right').state; // P(2,1)
  s = move(s, cfg, 'right').state; // P(3,1)
  return move(s, cfg, 'down'); // 推 B(3,2) → (3,3)
}

describe('彩虹传送带', () => {
  it('物件推上传送带后自动运到出口方向下一格，并产生 conveyor_activated 事件', () => {
    const cfg = levelConveyor();
    const r = pushBoxDown(cfg);
    expect(r.rejected).toBe(false);
    expect(r.state.boxes['b1'].position).toEqual({ x: 5, y: 3 });
    const ev = r.events.find((e) => e.type === 'conveyor_activated');
    expect(ev?.type).toBe('conveyor_activated');
    if (ev?.type === 'conveyor_activated') {
      expect(ev.path[ev.path.length - 1]).toEqual({ x: 5, y: 3 });
    }
  });

  it('出口被墙堵住时，物件停在传送带末端', () => {
    const cfg = levelConveyorBlocked();
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 4, y: 3 });
  });

  it('传送带串联：A 送完后 B 接力（连锁 ≥2 次）', () => {
    const cfg = levelConveyorChain();
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 6, y: 3 });
    const count = r.events.filter((e) => e.type === 'conveyor_activated').length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('传送带互送环：递归上限 5 层，不死循环、不扣额外步数', () => {
    const cfg = levelConveyorLoop();
    const r = pushBoxDown(cfg);
    expect(r.state.steps).toBe(3); // 玩家 2 步 + 推 1 步；机关移动不计步
    const count = r.events.filter((e) => e.type === 'conveyor_activated').length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(5); // 上限 5 层
    const { x, y } = r.state.boxes['b1'].position;
    expect((x === 4 && y === 3) || (x === 5 && y === 3)).toBe(true);
  });
});

describe('滑梯与弹簧', () => {
  it('滑梯：物件被推上入口后沿方向滑到墙前停下', () => {
    const cfg = levelSlope();
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 6 });
    expect(r.events.some((e) => e.type === 'slope_slided')).toBe(true);
  });

  it('滑梯：配置 stopAt 时停在指定格', () => {
    const cfg = levelSlope();
    cfg.slopes[0].stopAt = { x: 3, y: 4 };
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 4 });
  });

  it('弹簧：物件被推上后沿方向弹射指定格数', () => {
    const cfg = levelSpring();
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 5, y: 3 });
    expect(r.events.some((e) => e.type === 'spring_bounced')).toBe(true);
  });

  it('跨机关链：传送带把物件送到滑梯入口，滑梯接着滑（固定顺序）', () => {
    const cfg = levelConveyorToSlope();
    const r = pushBoxDown(cfg);
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 6 });
    expect(r.events.some((e) => e.type === 'conveyor_activated')).toBe(true);
    expect(r.events.some((e) => e.type === 'slope_slided')).toBe(true);
  });
});
