/**
 * 关卡数据入口
 *
 * 产物由 `tools/buildLevels.ts` 确定性生成（请勿手改 chapter1.json）。
 */
import type { LevelConfig } from '../engine';
import chapter1Json from './chapter1.json';

/** 第一章《搬新家》：10 关（MVP-1 验证版，全部通过校验器） */
export const chapter1 = chapter1Json as unknown as LevelConfig[];

/** 按 id 查找关卡（1 起始） */
export function getLevelById(id: number): LevelConfig | undefined {
  return chapter1.find((lv) => lv.id === id);
}
