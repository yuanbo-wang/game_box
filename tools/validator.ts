/**
 * 关卡校验器（docs/03-dev-spec.md 4.3 验收清单 + docs/04 D3）
 *
 * 每个关卡上线前必须通过：
 * ① 有解（求解器有结果）
 * ② 最优步数在目标区间
 * ③ maxSteps 已派生，且容错余量符合关卡类型（教学 +8~10 / 普通 +4~6 / 魔鬼 +1~2）
 * ④ 无"一开始就有物件在星光台上"的低质量初始状态
 * ⑤ 地图封闭（边界无缺口）
 * ⑥ meta.optimalSteps 与实际最优一致（声明与事实相符）
 */
import { TIER_MARGIN_RANGE, computeOptimalSteps } from '../src/engine';
import type { LevelConfig, MarginTier } from '../src/engine';

export interface ValidateOptions {
  /** 期望的余量档位（校验 maxSteps − optimal 的余量区间） */
  tier?: MarginTier;
  /** 期望的最优步数区间 */
  optimalRange?: [number, number];
  /** 是否要求包含传送带机制 */
  requireConveyor?: boolean;
}

export interface ValidateResult {
  ok: boolean;
  issues: string[];
  /** 实际最优步数（求解器结果；无解为 null） */
  optimalSteps: number | null;
}

const key = (x: number, y: number) => `${x},${y}`;

/** 校验一个关卡配置，返回全部问题清单 */
export function validateLevel(cfg: LevelConfig, options: ValidateOptions = {}): ValidateResult {
  const issues: string[] = [];
  const [w, h] = cfg.gridSize;
  const wallSet = new Set(cfg.walls.map((p) => key(p.x, p.y)));

  // ① 物件数与目标数一致
  if (cfg.boxes.length !== cfg.targets.length) {
    issues.push(`物件数（${cfg.boxes.length}）与星光台数（${cfg.targets.length}）不一致`);
  }

  // ② 边界封闭：四边必须全为墙
  let enclosed = true;
  for (let x = 0; x < w; x++) {
    if (!wallSet.has(key(x, 0)) || !wallSet.has(key(x, h - 1))) enclosed = false;
  }
  for (let y = 0; y < h; y++) {
    if (!wallSet.has(key(0, y)) || !wallSet.has(key(w - 1, y))) enclosed = false;
  }
  if (!enclosed) issues.push('地图不封闭：边界存在缺口');

  // ③ 初始无物件在星光台上
  for (const b of cfg.boxes) {
    if (cfg.targets.some((t) => t.x === b.position.x && t.y === b.position.y)) {
      issues.push(`初始状态物件 ${b.id} 已在星光台上（低质量初始局面）`);
    }
  }

  // ④ 主角起点合法
  const ps = cfg.playerStart;
  if (ps.x <= 0 || ps.y <= 0 || ps.x >= w - 1 || ps.y >= h - 1) {
    issues.push('主角起点不在内部区域');
  } else if (wallSet.has(key(ps.x, ps.y))) {
    issues.push('主角起点落在墙上');
  } else if (cfg.boxes.some((b) => b.position.x === ps.x && b.position.y === ps.y)) {
    issues.push('主角起点与物件重叠');
  }

  // ⑤ 可解性
  const optimal = computeOptimalSteps(cfg);
  if (optimal === null) {
    issues.push('求解器无解（或超出搜索上限）');
  }

  // ⑥ 声明一致：meta.optimalSteps 必须等于实际最优
  if (optimal !== null && cfg.meta.optimalSteps !== optimal) {
    issues.push(`meta.optimalSteps=${cfg.meta.optimalSteps} 与实际最优 ${optimal} 不一致`);
  }

  // ⑦ 最优步数区间
  if (optimal !== null && options.optimalRange) {
    const [lo, hi] = options.optimalRange;
    if (optimal < lo || optimal > hi) {
      issues.push(`最优步数 ${optimal} 不在目标区间 [${lo}, ${hi}]`);
    }
  }

  // ⑧ 容错余量档位
  if (optimal !== null && options.tier) {
    const [lo, hi] = TIER_MARGIN_RANGE[options.tier];
    const margin = cfg.meta.maxSteps - optimal;
    if (margin < lo || margin > hi) {
      issues.push(`容错余量 ${margin} 不符合 ${options.tier} 档区间 [${lo}, ${hi}]`);
    }
  }

  // ⑨ 传送带要求
  if (options.requireConveyor && cfg.conveyors.length === 0) {
    issues.push('要求包含传送带机制，但关卡未配置');
  }

  return { ok: issues.length === 0, issues, optimalSteps: optimal };
}
