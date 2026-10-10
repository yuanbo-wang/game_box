/**
 * 第一章关卡产物测试（D4）
 *
 * 验证三件事：
 * ① 产物与生成器一致（确定性，防"手改 JSON 与生成器失联"）；
 * ② 10 关全量通过校验器（可解 / 区间 / 余量档 / 封闭性 / 声明一致）；
 * ③ 档位分布正确（教学 3 / 传送带 4 / 魔鬼 1 / 挑战 2）。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHAPTER1_SPECS, buildChapter1 } from '../../tools/generator';
import { validateLevel } from '../../tools/validator';
import type { LevelConfig } from '../../src/engine';

const fileUrl = new URL('../../src/levels/chapter1.json', import.meta.url);
const onDisk = JSON.parse(readFileSync(fileUrl, 'utf-8')) as LevelConfig[];
/** 生成器重放一次（确定性验证的基准） */
const rebuilt = buildChapter1();

function specFor(id: number) {
  const s = CHAPTER1_SPECS.find((x) => x.id === id);
  if (!s) throw new Error(`未找到关卡规格 id=${id}`);
  return s;
}

describe('第一章关卡产物（chapter1.json）', () => {
  it('共 10 关，id 连续 1~10', () => {
    expect(onDisk).toHaveLength(10);
    expect(onDisk.map((lv) => lv.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('全部通过校验器（可解性 / 声明一致 / 封闭性 / 无初始归位 / 区间 / 余量档）', () => {
    for (const cfg of onDisk) {
      const spec = specFor(cfg.id);
      const r = validateLevel(cfg, {
        tier: spec.tier,
        optimalRange: spec.optimalRange,
        requireConveyor: spec.conveyor,
      });
      expect(r.ok, `《${cfg.meta.name}》：${r.issues.join('；')}`).toBe(true);
    }
  });

  it('档位分布正确：1~3 教学（余量 8~10）· 4~7 含传送带 · 8 魔鬼（余量 1~2）', () => {
    for (const cfg of onDisk) {
      const spec = specFor(cfg.id);
      const margin = cfg.meta.maxSteps - cfg.meta.optimalSteps;

      if (spec.tier === 'tutorial') {
        expect(margin, `《${cfg.meta.name}》教学档余量`).toBeGreaterThanOrEqual(8);
        expect(margin).toBeLessThanOrEqual(10);
        expect(cfg.meta.optimalSteps, '教学关最优步数 ≤ 10').toBeLessThanOrEqual(10);
        expect(cfg.conveyors.length).toBe(0);
      }

      if (spec.conveyor) {
        expect(cfg.conveyors.length, `《${cfg.meta.name}》应含传送带`).toBeGreaterThanOrEqual(1);
        expect(margin).toBeGreaterThanOrEqual(4);
        expect(margin).toBeLessThanOrEqual(6);
      }

      if (cfg.id === 8) {
        expect(cfg.meta.isDevil).toBe(true);
        expect(margin, '魔鬼关余量').toBeGreaterThanOrEqual(1);
        expect(margin).toBeLessThanOrEqual(2);
      }
    }
  });

  it('生成确定性：磁盘产物与 buildChapter1() 逐字段一致（产物未被手改）', () => {
    expect(JSON.parse(JSON.stringify(rebuilt))).toEqual(onDisk);
  });

  it('同种子可复现：再次生成结果与基准一致', () => {
    expect(JSON.parse(JSON.stringify(buildChapter1()))).toEqual(JSON.parse(JSON.stringify(rebuilt)));
  });
});
