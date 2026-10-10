/**
 * 引擎层常量
 */
import type { MarginTier } from './types';

/** 主角的固定 actor id */
export const PLAYER_ID = 'player';

/**
 * 机关连锁递归深度上限（层）
 * 防止"传送带接传送带"等组合场景出现死循环，见 docs/03-dev-spec.md 5.1
 */
export const MAX_MECHANISM_CHAIN = 5;

/**
 * 死局检测（启发式）的 BFS 深度上限
 * 完整死局判定是 PSPACE 难度，此处为"尽力而为"，不承诺 100% 准确
 */
export const DEADLOCK_BFS_DEPTH = 10;

/** 死局检测 BFS 的最大状态数（防御性上限，超出即视为"不确定"，返回未卡住） */
export const DEADLOCK_NODE_LIMIT = 50_000;

/**
 * 求解器（computeOptimalSteps）的最大搜索状态数
 * 超出上限返回 null（视为"未能解出"，关卡生成管线会拒绝该关卡）
 */
export const SOLVER_NODE_LIMIT = 200_000;

/** 容错余量档位 → 建议余量（关卡管线派生 maxSteps 时使用） */
export const MARGIN_BY_TIER: Record<MarginTier, number> = {
  tutorial: 10, // 教学关 +8~10
  normal: 5, // 普通关 +4~6（取中值）
  devil: 1, // 魔鬼关 +1~2（取最紧）
};

/** 容错余量档位 → 允许的余量区间（关卡校验器使用） */
export const TIER_MARGIN_RANGE: Record<MarginTier, [number, number]> = {
  tutorial: [8, 10],
  normal: [4, 6],
  devil: [1, 2],
};
