/**
 * 第一章关卡构建脚本
 *
 * 运行：node node_modules/vite-node/vite-node.mjs tools/buildLevels.ts
 * 产物：src/levels/chapter1.json（确定性生成，请勿手改）
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChapter1 } from './generator';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(here, '../src/levels/chapter1.json');

const levels = buildChapter1();
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(levels, null, 2) + '\n', 'utf-8');

console.log(`✅ 已生成 ${levels.length} 关 → ${outFile}`);
console.table(
  levels.map((lv) => ({
    id: lv.id,
    名称: lv.meta.name,
    最优: lv.meta.optimalSteps,
    预算: lv.meta.maxSteps,
    余量: lv.meta.maxSteps - lv.meta.optimalSteps,
    传送带: lv.conveyors.length,
    魔鬼: lv.meta.isDevil ? '★' : '',
  })),
);
