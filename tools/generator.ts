/**
 * 关卡生成器（反向构造法，见 docs/03-dev-spec.md 4.2）
 *
 * 原理：推箱子的"反向操作" = 拉物件。
 * 从「终局」（物件都摆在星光台上）出发，执行 N 次随机「拉」操作，
 * 得到的局面**必然有解**——把拉的序列反过来推回去即可。
 * 最后用求解器算出真实最优步数，并按档位派生步数预算。
 *
 * 传送带关卡采用「半自动」策略（docs/03 4.2：先生成纯推箱子，再插入传送带并重算最优）：
 * 优先把传送带布置成"直道末端恰为星光台"（推上带子 → 直接送到台子），
 * 注入后重新求解校验；不满足则重试。
 *
 * 全流程使用种子化伪随机数（mulberry32）：**同一种子 → 同一关卡**，产物可复现。
 */
import {
  DIRECTIONS,
  MARGIN_BY_TIER,
  computeOptimalSteps,
} from '../src/engine';
import type { Direction, LevelConfig, MarginTier, Position } from '../src/engine';

/* ------------------------------------------------------------------ */
/* 种子化随机数                                                        */
/* ------------------------------------------------------------------ */

/** mulberry32：轻量确定性伪随机数生成器（同种子同序列） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从数组随机取一个元素 */
function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 原地洗牌（Fisher-Yates，用 rng 驱动） */
function shuffle<T>(rng: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* 反向构造（拉物件）                                                  */
/* ------------------------------------------------------------------ */

const key = (p: Position) => `${p.x},${p.y}`;
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

function vec(dir: Direction): Position {
  switch (dir) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

/** 构造过程中的草稿状态 */
interface Draft {
  width: number;
  height: number;
  walls: Set<string>;
  boxes: Position[];
  targets: Position[];
  player: Position;
}

/** 某格是否空闲（在内部、非墙、无其他物件） */
function isFreeCell(draft: Draft, pos: Position, ignoreBoxIdx = -1): boolean {
  if (pos.x < 1 || pos.y < 1 || pos.x > draft.width - 2 || pos.y > draft.height - 2) return false;
  if (draft.walls.has(key(pos))) return false;
  return !draft.boxes.some((b, i) => i !== ignoreBoxIdx && same(b, pos));
}

/** 玩家能否在不推箱的前提下走到目标格（BFS；物件与墙为障碍） */
function canWalkTo(draft: Draft, from: Position, to: Position): boolean {
  if (same(from, to)) return true;
  const visited = new Set<string>([key(from)]);
  const queue: Position[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const dir of DIRECTIONS) {
      const d = vec(dir);
      const nxt = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(nxt);
      if (visited.has(k)) continue;
      if (!isFreeCell(draft, nxt)) continue;
      if (same(nxt, to)) return true;
      visited.add(k);
      queue.push(nxt);
    }
  }
  return false;
}

/**
 * 枚举当前局面的全部合法「拉」操作
 * 两次「拉」之间允许玩家自由走动（不推箱），因此要求玩家能走到预备位置。
 */
function enumeratePulls(draft: Draft): Array<{ boxIdx: number; dir: Direction }> {
  const result: Array<{ boxIdx: number; dir: Direction }> = [];
  for (let i = 0; i < draft.boxes.length; i++) {
    const b = draft.boxes[i];
    for (const dir of DIRECTIONS) {
      const d = vec(dir);
      // 预备位置：玩家须能走到物件"反向"一侧（物件 = 预备位置 + d）
      const pre = { x: b.x - d.x, y: b.y - d.y };
      if (!isFreeCell(draft, pre, i)) continue;
      // 玩家身后（拉完后的站位 = 物件 - 2d）必须空闲
      const behind = { x: b.x - 2 * d.x, y: b.y - 2 * d.y };
      if (!isFreeCell(draft, behind, i)) continue;
      if (!canWalkTo(draft, draft.player, pre)) continue;
      result.push({ boxIdx: i, dir });
    }
  }
  return result;
}

/** 执行一次「拉」：物件拉到玩家格，玩家退到身后格 */
function applyPull(draft: Draft, pull: { boxIdx: number; dir: Direction }): void {
  const b = draft.boxes[pull.boxIdx];
  const d = vec(pull.dir);
  const behind = { x: b.x - 2 * d.x, y: b.y - 2 * d.y };
  draft.boxes[pull.boxIdx] = { x: b.x - d.x, y: b.y - d.y };
  draft.player = behind;
}

/**
 * 生成一个纯推箱子候选局面（反向构造）
 * @returns 关卡配置草稿（meta 待外层填充）；构造失败返回 null
 */
export function generateCandidate(
  rng: () => number,
  opts: { boxes: number; pulls: number; innerWalls: number; size: [number, number] },
): LevelConfig | null {
  const [width, height] = opts.size;
  const walls = new Set<string>();

  // ① 外墙（地图封闭）
  for (let x = 0; x < width; x++) {
    walls.add(`${x},0`);
    walls.add(`${x},${height - 1}`);
  }
  for (let y = 0; y < height; y++) {
    walls.add(`0,${y}`);
    walls.add(`${width - 1},${y}`);
  }

  // ② 内部随机墙
  const innerCells: Position[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) innerCells.push({ x, y });
  }
  for (let i = 0; i < opts.innerWalls && innerCells.length > 0; i++) {
    const idx = Math.floor(rng() * innerCells.length);
    walls.add(key(innerCells[idx]));
    innerCells.splice(idx, 1);
  }

  const floors = innerCells.filter((c) => !walls.has(key(c)));
  if (floors.length < opts.boxes + 2) return null;

  // ③ 选星光台（= 初始物件位，反向构造的起点是"已通关"局面）
  const shuffled = shuffle(rng, floors);
  const targets = shuffled.slice(0, opts.boxes).map((p) => ({ ...p }));
  const boxes = targets.map((p) => ({ ...p }));

  // ④ 玩家落点（任一空格）
  const player = { ...shuffled[opts.boxes] };

  const draft: Draft = { width, height, walls, boxes, targets, player };

  // ⑤ 随机「拉」N 次
  for (let i = 0; i < opts.pulls; i++) {
    const pulls = enumeratePulls(draft);
    if (pulls.length === 0) return null; // 拉不动了，换种子重来
    applyPull(draft, pick(rng, pulls));
  }

  // ⑥ 质量检查：不能有物件仍停在星光台上（否则该格开局即完成）
  if (boxes.some((b) => targets.some((t) => same(t, b)))) return null;

  // ⑦ 组装
  return {
    id: 0,
    chapter: 1,
    gridSize: [width, height],
    walls: [...walls].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    }),
    boxes: boxes.map((position, i) => ({ id: `b${i + 1}`, type: 'generic' as const, position })),
    targets,
    conveyors: [],
    slopes: [],
    springs: [],
    puppets: [],
    playerStart: player,
    meta: { optimalSteps: 0, maxSteps: 0, isDevil: false, name: 'draft' },
  };
}

/* ------------------------------------------------------------------ */
/* 传送带注入（半自动）                                                */
/* ------------------------------------------------------------------ */

/** 注入传送带：优先"直道末端恰为星光台"（2 格直道 + 出口=星光台） */
function tryInjectConveyor(rng: () => number, cfg: LevelConfig): boolean {
  const occupied = new Set<string>([
    ...cfg.boxes.map((b) => key(b.position)),
    key(cfg.playerStart),
  ]);
  const isFree = (p: Position) => !occupied.has(key(p)) && !isWallCell(cfg, p);

  // 候选一：a, b = a+d 为两格空地，出口格 a+2d 恰为星光台
  const meaningful: Array<{ path: Position[]; exit: Direction }> = [];
  for (const t of cfg.targets) {
    for (const dir of DIRECTIONS) {
      const d = vec(dir);
      const b = { x: t.x - d.x, y: t.y - d.y };
      const a = { x: t.x - 2 * d.x, y: t.y - 2 * d.y };
      if (isFree(a) && isFree(b)) meaningful.push({ path: [a, b], exit: dir });
    }
  }

  if (meaningful.length > 0) {
    const chosen = pick(rng, meaningful);
    cfg.conveyors.push({ path: chosen.path, exitDirection: chosen.exit });
    return true;
  }

  return false; // 找不到"有意义"的位置就放弃这次注入（外层换种子重试）
}

/** 校验坐标是否为墙（含界外） */
function isWallCell(cfg: LevelConfig, p: Position): boolean {
  const [w, h] = cfg.gridSize;
  if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) return true;
  return cfg.walls.some((wl) => same(wl, p));
}

/* ------------------------------------------------------------------ */
/* 关卡规格与批量构建                                                  */
/* ------------------------------------------------------------------ */

/** 关卡规格（第一章 10 关） */
export interface LevelSpec {
  id: number;
  name: string;
  tier: MarginTier;
  isDevil?: boolean;
  tutorial?: string;
  /** 求解器最优步数的目标区间（验证依据） */
  optimalRange: [number, number];
  /** 反向构造的「拉」次数区间 */
  pullRange: [number, number];
  /** 是否注入传送带机制 */
  conveyor?: boolean;
  /** 随机种子（决定产物，勿随意改动） */
  seed: number;
  /** 内部随机墙数量（缺省按尝试次数取 0~2 个） */
  innerWalls?: number;
  /** 物件数量（缺省 2） */
  boxes?: number;
}

/** 第一章《搬新家》规格表：教学 3 + 传送带 4 + 魔鬼 1 + 挑战 2 */
export const CHAPTER1_SPECS: LevelSpec[] = [
  {
    id: 1,
    name: '搬新家',
    tier: 'tutorial',
    tutorial: '滑动屏幕（或点方向键）移动小狐狸，把所有物件推到星光台上吧～',
    optimalRange: [3, 8],
    pullRange: [4, 8],
    seed: 1101,
  },
  {
    id: 2,
    name: '小试身手',
    tier: 'tutorial',
    tutorial: '卡住了？点「↩」撤销——棋盘会退回去，但步数不返还哦',
    optimalRange: [4, 9],
    pullRange: [5, 9],
    seed: 1102,
  },
  {
    id: 3,
    name: '绕个弯',
    tier: 'tutorial',
    tutorial: '星光台要全部点亮才算完成，留意右上角的剩余步数～',
    optimalRange: [5, 10],
    pullRange: [6, 10],
    seed: 1103,
  },
  {
    id: 4,
    name: '彩虹快递',
    tier: 'normal',
    conveyor: true,
    tutorial: '彩虹传送带会自动把物件送到远处——先想好再用它！',
    optimalRange: [8, 15],
    pullRange: [8, 14],
    seed: 1104,
  },
  { id: 5, name: '弯道小心', tier: 'normal', conveyor: true, optimalRange: [8, 15], pullRange: [8, 14], seed: 1105 },
  { id: 6, name: '顺流而下', tier: 'normal', conveyor: true, optimalRange: [8, 15], pullRange: [8, 14], seed: 1106 },
  {
    id: 7,
    name: '传送带派对',
    tier: 'normal',
    conveyor: true,
    optimalRange: [9, 16],
    pullRange: [9, 15],
    seed: 1107,
  },
  {
    id: 8,
    name: '就差一步',
    tier: 'devil',
    isDevil: true,
    optimalRange: [6, 14],
    pullRange: [7, 13],
    seed: 1108,
    innerWalls: 1,
  },
  { id: 9, name: '最后一里', tier: 'normal', optimalRange: [12, 20], pullRange: [10, 16], seed: 1109 },
  { id: 10, name: '圆满收尾', tier: 'normal', optimalRange: [12, 20], pullRange: [10, 16], seed: 1110 },
];

/**
 * 按规格生成一关（确定性：同规格 → 同关卡）
 * @throws 连续 500 次尝试仍构造不出满足区间要求的局面时抛错（说明规格需要调整）
 */
export function generateLevelForSpec(spec: LevelSpec): LevelConfig {
  for (let attempt = 0; attempt < 500; attempt++) {
    const rng = mulberry32(spec.seed + attempt * 7919);
    const pulls =
      spec.pullRange[0] + Math.floor(rng() * (spec.pullRange[1] - spec.pullRange[0] + 1));

    const cfg = generateCandidate(rng, {
      boxes: spec.boxes ?? 2,
      pulls,
      innerWalls: spec.innerWalls ?? attempt % 3,
      size: [6, 6],
    });
    if (!cfg) continue;

    // 传送带注入（半自动）
    if (spec.conveyor && !tryInjectConveyor(rng, cfg)) continue;

    // 求解 + 区间校验（不满足就换种子重试）
    const optimal = computeOptimalSteps(cfg);
    if (optimal === null || optimal <= 0) continue;
    if (optimal < spec.optimalRange[0] || optimal > spec.optimalRange[1]) continue;

    cfg.id = spec.id;
    cfg.chapter = 1;
    cfg.meta = {
      optimalSteps: optimal,
      maxSteps: optimal + MARGIN_BY_TIER[spec.tier],
      isDevil: spec.isDevil ?? false,
      name: spec.name,
      tutorial: spec.tutorial,
    };
    return cfg;
  }
  throw new Error(
    `关卡 ${spec.id}《${spec.name}》生成失败：500 次尝试内未找到最优步数落在 [${spec.optimalRange[0]}, ${spec.optimalRange[1]}] 的局面`,
  );
}

/** 构建第一章全部 10 关（确定性产物） */
export function buildChapter1(): LevelConfig[] {
  return CHAPTER1_SPECS.map((spec) => generateLevelForSpec(spec));
}
