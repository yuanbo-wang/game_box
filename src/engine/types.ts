/**
 * 《云朵小镇·推推奇遇》引擎层 —— 类型定义
 *
 * 设计铁律（见 docs/03-dev-spec.md 第二章）：
 * 1. 本目录不 import 任何 Phaser 代码，保证可在 Node 环境 100% 单测；
 * 2. 所有状态不可变：`move()` 返回新状态 + 事件列表，渲染层据此播动画；
 * 3. 机关结算顺序固定：传送带 → 滑梯 → 弹簧 → 目标点（递归上限 5 层）。
 *
 * v4.0 核心规则：
 * - 限步通关：`maxSteps = optimalSteps + 容错余量`，步数耗尽未完成即失败；
 * - 步数锁死：撤销回退棋盘，但已消耗的步数**不返还**。
 */

/** 二维坐标（x = 列，y = 行，左上角为 0,0） */
export interface Position {
  x: number;
  y: number;
}

/** 可推动物件的类型 */
export type BoxType =
  | 'pumpkin' // 小南瓜
  | 'yarn' // 毛线球
  | 'gift' // 礼物盒
  | 'cake' // 小蛋糕
  | 'generic'; // 通用（代码绘制默认）

/** 地块类型 */
export type TileType =
  | 'floor' // 平地
  | 'wall' // 墙
  | 'target' // 星光台（目标点）
  | 'conveyor' // 传送带
  | 'slope' // 滑梯
  | 'spring' // 弹簧格
  | 'narrow' // 狭窄通道（主角不可通过，携 canSqueeze 的小伙伴可通过）
  | 'gap'; // 空洞（不可通行，物件也无法停留）

/** 移动方向 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 可推动物件 */
export interface Box {
  id: string;
  type: BoxType;
  position: Position;
}

/** 传送带配置 */
export interface ConveyorConfig {
  /** 传送带覆盖的格子（按顺序，最后一个为出口） */
  path: Position[];
  /** 出口方向（物件离开传送带后的朝向） */
  exitDirection: Direction;
}

/** 滑梯配置 */
export interface SlopeConfig {
  /** 滑梯入口格 */
  entry: Position;
  /** 滑行方向 */
  slideDirection: Direction;
  /** 滑行终点（可选；到达该格即停） */
  stopAt?: Position;
}

/** 弹簧配置 */
export interface SpringConfig {
  /** 弹簧所在格 */
  position: Position;
  /** 弹射方向 */
  direction: Direction;
  /** 弹射距离（格数） */
  power: number;
}

/** 小伙伴（可操控第二角色，v1.0） */
export interface PuppetConfig {
  id: string;
  position: Position;
  /** 是否可以通过狭窄通道（主角不能过而小伙伴能过） */
  canSqueeze: boolean;
}

/** 关卡元信息 */
export interface LevelMeta {
  /** 最优步数（关卡生成时由求解器算出） */
  optimalSteps: number;
  /**
   * 步数预算（v4.0 限步通关）
   * 派生规则：maxSteps = optimalSteps + 容错余量
   * 教学关 +8~10 / 普通关 +4~6 / 魔鬼关 +1~2
   */
  maxSteps: number;
  /** 是否为魔鬼关卡 */
  isDevil: boolean;
  /** 关卡名 */
  name: string;
  /** 教学提示文案（教学关用） */
  tutorial?: string;
}

/** 关卡配置（静态数据） */
export interface LevelConfig {
  id: number;
  chapter: number;
  /** [列数, 行数] */
  gridSize: [number, number];
  /** 墙的坐标列表 */
  walls: Position[];
  /** 地块覆盖（覆盖默认的 floor），key 为 "x,y" */
  tiles?: Record<string, TileType>;
  boxes: Box[];
  targets: Position[];
  conveyors: ConveyorConfig[];
  slopes: SlopeConfig[];
  springs: SpringConfig[];
  /** 主角初始位置 */
  playerStart: Position;
  puppets: PuppetConfig[];
  meta: LevelMeta;
}

/** 运行时游戏状态（不可变；每次操作产生新对象） */
export interface GameState {
  levelId: number;
  /** 主角当前位置 */
  playerPos: Position;
  /** 当前操控的角色 id（主角恒为 'player'） */
  activeActorId: string;
  /** 小伙伴位置映射 */
  puppetPositions: Record<string, Position>;
  /** 物件位置（按 id 索引） */
  boxes: Record<string, Box>;
  /**
   * 已消耗步数（v4.0：只增不减）
   * 每次有效移动 +1；撤销不回退；复活后继续累加
   */
  steps: number;
  /**
   * 本关步数预算（v4.0）
   * 初始 = config.meta.maxSteps；看广告复活后增加（如 +3）
   */
  stepBudget: number;
  /**
   * 棋盘快照栈（撤销用）
   * ⚠️ v4.0：只存棋盘快照（serializeBoard），不含 steps / stepBudget
   * 撤销 = 回退棋盘 + 步数保持不变
   */
  history: string[];
  /** 是否已胜利（在 stepBudget 内完成） */
  won: boolean;
  /** 是否已失败（steps >= stepBudget 且未完成） */
  failed: boolean;
}

/** 引擎事件（渲染层据此播动画） */
export type GameEvent =
  | { type: 'player_moved'; from: Position; to: Position }
  | { type: 'box_pushed'; boxId: string; from: Position; to: Position }
  | { type: 'box_on_target'; boxId: string; position: Position }
  | { type: 'box_left_target'; boxId: string; position: Position }
  | { type: 'conveyor_activated'; boxId: string; path: Position[] }
  | { type: 'slope_slided'; boxId: string; from: Position; to: Position }
  | { type: 'spring_bounced'; boxId: string; from: Position; to: Position }
  | { type: 'actor_switched'; from: string; to: string }
  | { type: 'undo_performed'; steps: number } // v4.0：撤销动画（步数不变）
  | { type: 'steps_exhausted'; steps: number } // v4.0：步数耗尽
  | { type: 'deadlock_detected' } // 死局软提示（启发式，不触发失败）
  | { type: 'level_won'; steps: number }
  | { type: 'level_failed'; steps: number }; // v4.0：关卡失败

/** move() / undo() 的返回值 */
export interface MoveResult {
  state: GameState;
  events: GameEvent[];
  /** 操作是否非法（撞墙等），非法时 state 不变 */
  rejected: boolean;
}

/** 容错余量档位（maxSteps 派生用） */
export type MarginTier = 'tutorial' | 'normal' | 'devil';
