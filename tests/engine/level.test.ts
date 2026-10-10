/**
 * 字符网格解析器（parseLevel）测试
 */
import { describe, expect, it } from 'vitest';
import { parseLevel } from '../../src/engine';

describe('parseLevel', () => {
  it('基本解析：尺寸 / 墙 / 目标 / 物件 / 主角', () => {
    const cfg = parseLevel(['#####', '#PBo#', '#...#', '#####'], {
      optimalSteps: 1,
      maxSteps: 3,
    });
    expect(cfg.gridSize).toEqual([5, 4]);
    expect(cfg.playerStart).toEqual({ x: 1, y: 1 });
    expect(cfg.boxes[0]).toMatchObject({ id: 'b1', position: { x: 2, y: 1 } });
    expect(cfg.targets).toEqual([{ x: 3, y: 1 }]);
    expect(cfg.walls.length).toBeGreaterThan(0);
  });

  it('maxSteps 派生：魔鬼档 = optimalSteps + 1', () => {
    const cfg = parseLevel(['#####', '#PBo#', '#####'], {
      optimalSteps: 12,
      tier: 'devil',
      isDevil: true,
    });
    expect(cfg.meta.maxSteps).toBe(13);
    expect(cfg.meta.isDevil).toBe(true);
  });

  it('教学档派生（+10）与显式 maxSteps 优先', () => {
    const a = parseLevel(['#####', '#PBo#', '#####'], { optimalSteps: 5, tier: 'tutorial' });
    expect(a.meta.maxSteps).toBe(15);
    const b = parseLevel(['#####', '#PBo#', '#####'], { optimalSteps: 5, maxSteps: 9 });
    expect(b.meta.maxSteps).toBe(9);
  });

  it('物件数与目标数不一致时报错', () => {
    expect(() => parseLevel(['#####', '#PB.#', '#####'], { optimalSteps: 1 })).toThrow();
  });

  it('缺少主角起点时报错', () => {
    expect(() => parseLevel(['#####', '#.Bo#', '#####'], { optimalSteps: 1 })).toThrow();
  });

  it('未知字符时报错', () => {
    expect(() => parseLevel(['#####', '#PX.#', '#####'], { optimalSteps: 1 })).toThrow();
  });
});
