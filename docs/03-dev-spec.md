# 《云朵小镇·推推奇遇》开发文档

> 配套产品文档：`docs/01-product-spec.md` v4.0
> 配套流程图：`docs/02-flowcharts.md`
> 文档版本：v2.0 | 编写日期：2026 年 10 月
> v2.0 变更：引擎层引入**限步通关与步数锁死**（撤销不返还步数）、新增**小镇每日赛**后端设计（替代 1v1 挑战为主链路）、新增每日赛关卡预生成管线
> 修订：2026-10-10 与 PRD v1.2 同步（`DailyAttempt` 契约 / `usedRevive` 事实来源 / `beatPercent`+`total` 快照 / duration 下界校验 / 广告降级口径 / 每日赛余量档）

---

## 一、技术选型

| 维度 | 选择 | 版本 | 理由 |
|:---|:---|:---|:---|
| 游戏引擎 | Phaser 3 | ^3.80 | 纯 2D，社区成熟，渲染性能稳定，微信小游戏适配方案成熟 |
| 语言 | TypeScript | ^5.4 | 类型安全，解谜逻辑复杂，类型约束能减少大量运行时 bug |
| 构建 | Vite | ^5.0 | 快速 HMR；生产构建可输出 ES5 兼容包供微信小游戏使用 |
| 微信适配 | `minigame-adapter` | 微信官方 | 不要自己从零写适配层（DOM/Canvas/音频/存储 差异极多） |
| 单元测试 | Vitest | ^1.0 | 与 Vite 同源，零配置；**引擎层必须有单测** |
| 状态管理 | 纯函数模块（自研） | — | 逻辑与渲染解耦，便于撤销/回放/单测 |
| 后端 | 微信云开发（云函数 + 云数据库） | — | 每日赛数据量小，云开发免运维、成本为零 |

### 1.1 为什么不用 Cocos Creator

- Phaser 3 是**纯 2D + TS 原生**，包体更小、构建链路更简单
- Cocos 更适合复杂动画/3D，本项目用不到，反而增加包体和构建复杂度
- 若你已熟悉 Cocos（如 ProjectBreach 项目），也可以用，但本文档按 Phaser 3 编写

### 1.2 包体预算（硬约束）

| 项 | 预算 | 说明 |
|:---|:---|:---|
| 代码包 | ≤ 2.0 MB | 压缩后；TS 编译 + tree-shaking + 混淆 |
| 资源包 | ≤ 1.5 MB | 图片（WebP 优先）+ 音效（mp3/ogg，低码率） |
| **首包合计** | **≤ 3.5 MB** | 微信上限 4MB，留 0.5MB 余量 |
| 分包 | 按章节分包 | 第 2 章起按需加载 |

**体积控制手段**：

1. 核心元素用 **Phaser Graphics 程序化绘制**（零图片依赖）
2. 背景图 WebP + 按章节懒加载
3. 音效单一化：同一音效复用（变调处理代替多份文件）
4. 构建时剔除未使用代码（tree-shaking）

---

## 二、分层架构

```
┌─────────────────────────────────────────────────────┐
│  UI 层（Phaser Scene）                              │
│  BootScene / MenuScene / LevelSelectScene           │
│  GameScene / ResultScene / ChallengeScene / RankScene│
└──────────────────────┬──────────────────────────────┘
                       │ 只通过事件与状态通信
┌──────────────────────▼──────────────────────────────┐
│  逻辑层（Logic）                                    │
│  InputParser（滑动→方向） / HintSystem / UndoManager │
│  RewardManager / ProgressManager                     │
└──────────────────────┬──────────────────────────────┘
                       │ 纯函数调用（无副作用）
┌──────────────────────▼──────────────────────────────┐
│  引擎层（Engine · 纯函数 · 100% 可单测）             │
│  createState / move / checkWin / getHint            │
│  serialize / deserialize / detectDeadlock           │
└──────────────────────┬──────────────────────────────┘
                       │ 读写数据
┌──────────────────────▼──────────────────────────────┐
│  数据层（Data）                                     │
│  LevelConfig(JSON) / wx.storage / 开放数据域 / 云函数│
└─────────────────────────────────────────────────────┘
```

**铁律**：

1. **引擎层不得 import 任何 Phaser 代码**，保证可在 Node 环境单测
2. **UI 层不得直接修改状态**，只能通过 `move()` 返回新状态
3. **数据层不感知渲染**，严格单向依赖

---

## 三、引擎层 API 设计

### 3.1 类型定义

```typescript
/** 二维坐标（x = 列，y = 行，左上角为 0,0） */
export interface Position {
  x: number;
  y: number;
}

/** 可推动物件的类型 */
export type BoxType =
  | 'pumpkin'   // 小南瓜
  | 'yarn'      // 毛线球
  | 'gift'      // 礼物盒
  | 'cake'      // 小蛋糕
  | 'generic';  // 通用（代码绘制默认）

/** 地块类型 */
export type TileType =
  | 'floor'     // 平地
  | 'wall'      // 墙
  | 'target'    // 星光台（目标点）
  | 'conveyor'  // 传送带
  | 'slope'     // 滑梯
  | 'spring'    // 弹簧格
  | 'gap';      // 空洞（不可通行，物件也无法停留）

/** 方向 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** 物件 */
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
  direction: Direction;
  /** 滑行终点（撞到此格前停下） */
  stopAt?: Position;
}

/** 弹簧配置 */
export interface SpringConfig {
  position: Position;
  direction: Direction;
  /** 弹射距离（格数） */
  power: number;
}

/** 小伙伴（可操控第二角色） */
export interface PuppetConfig {
  id: string;
  position: Position;
  /** 是否可以通过狭窄通道（主角不能过而小伙伴能过） */
  canSqueeze: boolean;
}

/** 关卡配置 */
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
  /** 关卡元信息 */
  meta: {
    /** 最优步数（关卡生成时算出） */
    optimalSteps: number;
    /**
     * 步数预算（v4.0 新增 · 限步通关）
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
  };
}

/** 运行时游戏状态（不可变） */
export interface GameState {
  levelId: number;
  /** 主角当前位置 */
  playerPos: Position;
  /** 当前操控的角色 id（主角为 'player'） */
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
   * 本关步数预算（v4.0 新增）
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
  /** 是否已失败（steps >= stepBudget 且未完成，v4.0 新增） */
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
  | { type: 'undo_performed'; steps: number }        // v4.0：撤销动画（步数不变）
  | { type: 'steps_exhausted'; steps: number }       // v4.0：步数耗尽
  | { type: 'deadlock_detected' }
  | { type: 'level_won'; steps: number }
  | { type: 'level_failed'; steps: number };         // v4.0：关卡失败

/** move() 的返回值 */
export interface MoveResult {
  state: GameState;
  events: GameEvent[];
  /** 操作是否非法（撞墙等），非法时 state 不变 */
  rejected: boolean;
}
```

### 3.2 核心函数签名

```typescript
/**
 * 创建初始游戏状态
 * @param config 关卡配置
 * @returns 初始化后的不可变状态（stepBudget = config.meta.maxSteps）
 */
export function createState(config: LevelConfig): GameState;

/**
 * 执行一次移动（纯函数，不修改入参）
 * v4.0：每次有效移动消耗 1 步；步数耗尽且未完成 → failed = true
 * @param state 当前状态
 * @param config 关卡配置（机关参数需要）
 * @param direction 移动方向
 * @returns 新状态 + 事件列表
 */
export function move(
  state: GameState,
  config: LevelConfig,
  direction: Direction
): MoveResult;

/**
 * 切换操控角色（主角 ↔ 小伙伴）
 */
export function switchActor(
  state: GameState,
  config: LevelConfig,
  actorId: string
): MoveResult;

/**
 * 胜利判定：所有物件都在目标点上
 */
export function checkWin(state: GameState, config: LevelConfig): boolean;

/**
 * 获取提示（推荐下一步）
 * 使用 BFS 在状态空间搜索最近的可达"有意义的状态"
 */
export function getHint(
  state: GameState,
  config: LevelConfig
): { direction: Direction; actorId: string } | null;

/**
 * 序列化完整状态（用于存档 / 每日赛成绩校验）
 */
export function serialize(state: GameState): string;

/** 反序列化完整状态 */
export function deserialize(raw: string): GameState;

/**
 * 序列化棋盘快照（撤销栈专用，v4.0）
 * ⚠️ 只包含棋盘数据（角色 / 物件位置），不包含 steps / stepBudget
 * 原因：撤销不返还步数，步数不属于可回退的数据
 */
export function serializeBoard(state: GameState): string;

/** 反序列化棋盘快照（在 current 基础上恢复棋盘） */
export function deserializeBoard(raw: string, current: GameState): GameState;

/**
 * 撤销一步（v4.0：回退棋盘，但不返还步数）
 * @returns 恢复棋盘后的状态；steps / stepBudget 保持不变
 */
export function undo(
  state: GameState,
  config: LevelConfig
): MoveResult;

/**
 * 剩余步数 = stepBudget - steps（UI 常驻显示）
 */
export function getRemainingSteps(state: GameState): number;

/**
 * 复活：步数耗尽后看广告加步（v4.0）
 * @param extraSteps 增加的步数（如 3）
 * @returns failed = false、stepBudget + extraSteps 的新状态；
 *          未处于失败态时原样返回
 */
export function revive(state: GameState, extraSteps: number): GameState;

/**
 * 死局检测：判断当前局面是否已无解
 * 采用简化判定：BFS 有限深度搜索（深度上限 = 10）
 * 注意：这是"尽力而为"的检测，不追求 100% 准确
 */
export function detectDeadlock(
  state: GameState,
  config: LevelConfig
): boolean;

/**
 * 计算某关卡的最优步数（关卡生成 / 验收时使用，不在运行时调用）
 * BFS 全状态空间搜索，有状态数上限保护
 * 同时用于派生 maxSteps = optimalSteps + 容错余量
 */
export function computeOptimalSteps(config: LevelConfig): number;
```

### 3.3 move() 的执行顺序（关键）

```typescript
export function move(state: GameState, config: LevelConfig, dir: Direction): MoveResult {
  // ① 已胜利或已失败则拒绝（v4.0：失败后需 revive() 才能继续）
  if (state.won || state.failed) return { state, events: [], rejected: true };

  // ② 计算目标格
  const from = getActorPosition(state);
  const to = offset(from, dir);

  // ③ 越界 / 撞墙 → 拒绝
  if (isBlocked(to, config, state)) return { state, events: [], rejected: true };

  const events: GameEvent[] = [];
  const next = cloneState(state);

  // ④ 判断目标格是否有物件
  const box = getBoxAt(state, to);
  if (box) {
    // ⑤ 物件需要被推：检查物件能否移动
    const boxTo = offset(to, dir);
    if (!canBoxEnter(boxTo, config, state)) {
      // ⑥ 特殊：滑梯入口处的物件，推动后进入滑行流程
      if (isSlope(boxTo, config)) {
        // 允许推送，随后由滑行逻辑接管
      } else if (isSpring(to, config)) {
        // 弹簧上的物件：不推动，而是直接弹射
      } else {
        return { state, events: [], rejected: true }; // 推不动
      }
    }
    // ⑦ 执行推动
    events.push({ type: 'box_pushed', boxId: box.id, from: to, to: boxTo });
    moveBox(next, box.id, boxTo);
  }

  // ⑧ 移动角色
  moveActor(next, from, to);
  events.push({ type: 'player_moved', from, to });

  // ⑨ 触发机关连锁（顺序敏感，必须固定顺序）
  resolveConveyors(next, config, events);   // 传送带优先
  resolveSlopes(next, config, events);      // 滑梯
  resolveSprings(next, config, events);     // 弹簧
  resolveTargets(next, config, events);     // 目标点状态变化

  // ⑩ 计步 + 压入棋盘快照（v4.0）
  // ⚠️ steps 只增不减；history 只存棋盘快照（serializeBoard），不含步数
  next.steps += 1;
  next.history.push(serializeBoard(state));

  // ⑪ 结算判定：胜利优先 → 步数耗尽 → 死局（v4.0 顺序敏感）
  // ⚠️ 最后一步完成时必须判胜利，不能判失败
  if (checkWin(next, config)) {
    next.won = true;
    events.push({ type: 'level_won', steps: next.steps });
  } else if (next.steps >= next.stepBudget) {
    next.failed = true;
    events.push({ type: 'steps_exhausted', steps: next.steps });
    events.push({ type: 'level_failed', steps: next.steps });
  } else if (detectDeadlock(next, config)) {
    events.push({ type: 'deadlock_detected' });
  }

  return { state: next, events, rejected: false };
}
```

**撤销与复活（v4.0 步数锁死）**：

```typescript
export function undo(state: GameState, config: LevelConfig): MoveResult {
  if (state.won || state.failed) return { state, events: [], rejected: true };
  if (state.history.length === 0) return { state, events: [], rejected: true };

  // ① 取出最近的棋盘快照
  const snapshot = state.history[state.history.length - 1];

  // ② 恢复棋盘（⚠️ steps / stepBudget 保持不变——步数锁死）
  const restored = deserializeBoard(snapshot, state);

  // ③ 快照出栈
  const next: GameState = {
    ...restored,
    steps: state.steps,             // 不返还
    stepBudget: state.stepBudget,   // 不变
    history: state.history.slice(0, -1),
  };

  return {
    state: next,
    events: [{ type: 'undo_performed', steps: next.steps }],
    rejected: false,
  };
}

export function revive(state: GameState, extraSteps: number): GameState {
  // 未处于失败态：原样返回
  if (!state.failed) return state;

  // 失败 → 解除失败态，预算 +extraSteps（棋盘不动，继续挑战）
  return {
    ...state,
    failed: false,
    stepBudget: state.stepBudget + extraSteps,
  };
}
```

**⚠️ 机关结算顺序是本项目最关键的设计决策之一。** 顺序写错会导致：
- 传送带和滑梯同时存在时，物件行为不可预测
- 单测难以覆盖组合场景

**建议：固定为 传送带 → 滑梯 → 弹簧 → 目标点，并在引擎层写死，关卡生成器据此验证。**

### 3.4 不可变性实现建议

- 生产环境用 **structuredClone**（现代内核支持）或 **手写深拷贝**（更快，需单测覆盖）
- **不要用 `JSON.parse(JSON.stringify())`** 做热路径拷贝（性能差）
- `history` 只存 `serializeBoard()` 的棋盘快照字符串，不含 `steps` / `stepBudget`——v4.0 步数不属于可回退数据，同时省内存

---

## 四、关卡数据结构与生成

### 4.1 关卡存储格式

采用 **JSON + 字符网格** 的双表示，便于人工编辑与程序读取：

```json
{
  "id": 8,
  "chapter": 1,
  "gridSize": [6, 6],
  "grid": [
    "######",
    "#..o.#",
    "#.B..#",
    "#..C.#",
    "#..o.#",
    "######"
  ],
  "legend": {
    "#": "wall",
    ".": "floor",
    "o": "target",
    "B": "box",
    "C": "conveyor"
  },
  "meta": { "optimalSteps": 23, "isDevil": true, "name": "就差一步" }
}
```

**字符网格规则**：

| 字符 | 含义 | 字符 | 含义 |
|:---|:---|:---|:---|
| `#` | 墙 | `P` | 主角起点 |
| `.` | 平地 | `o` | 星光台（目标） |
| `B` | 物件（通用） | `C` | 传送带 |
| `S` | 滑梯 | `J` | 弹簧 |
| `Q` | 小伙伴起点 | `~` | 空洞 |

编辑器写字符网格 → 构建时编译成 `LevelConfig`。

### 4.2 关卡生成策略

**原文档"逆向构造 + 贪心验证"方向正确，但要注意：逆向构造对传送带/滑梯/弹簧/小伙伴是失效的。**

修正后的分机制策略：

| 机制 | 生成方式 | 原因 |
|:---|:---|:---|
| 纯推箱子 | ✅ 反向构造（从终局"拉物件"生成初局） | 经典 Sokoban 生成法，成熟有效 |
| 传送带 | ⚠️ 半自动：先按纯推箱子生成，再手工插入传送带并重算最优步数 | 传送带叠加会破坏反向构造的合法性 |
| 滑梯 / 弹簧 | ⚠️ 半自动：同上 | 同理 |
| 小伙伴 | ❌ 手工设计 | 双角色状态空间复杂，算法生成容易出无解关 |

**结论：50 关里预计 60% 可自动生成 + 40% 需人工设计。不要指望全自动。**

### 4.3 关卡验收清单

每个关卡上线前必须通过：

- [ ] `computeOptimalSteps()` 有结果（即**有解**）
- [ ] 最优步数在目标区间（教学关 ≤10 步，普通关 10-25 步，挑战关 25-40 步）
- [ ] **`maxSteps` 已派生**（v4.0）：`maxSteps = optimalSteps + 容错余量`
- [ ] **容错余量符合关卡类型**（v4.0）：教学 +8~10 / 普通 +4~6 / 魔鬼 +1~2
- [ ] 无"一开始就有物件在目标点上"的低质量初始状态
- [ ] 魔鬼关卡：人工验证"看似能过"（见 `docs/02-flowcharts.md` 第 7 节自检流程）
- [ ] 通过引擎单测（无非法状态泄漏）

---

## 五、五大机制实现要点（首发 3 个）

### 5.1 彩虹传送带 ✅

**规则**：物件被推到传送带上 → 自动沿 `path` 运送到最后一个格子 → 从 `exitDirection` 方向再推进一格（若可推进）。

**实现要点**：

1. 传送带触发时机：**在物件落位之后**，且只对"刚被推动的物件"触发（避免静止在传送带上的物件每步都触发）
2. 连锁：物件传送后可能落到另一条传送带上 → **需要允许递归，但设置递归深度上限（如 5 层）防止死循环**
3. 终点被占用：若出口格有墙或物件，物件停在传送带末端（视为"堵塞"）

```typescript
function resolveConveyors(state, config, events) {
  const MAX_CHAIN = 5;
  let depth = 0;
  let moved = true;
  while (moved && depth < MAX_CHAIN) {
    moved = false;
    for (const conveyor of config.conveyors) {
      // 只处理"位于传送带路径上"且"本步刚移动"的物件
      const box = findRecentlyMovedBoxOnPath(state, conveyor, events);
      if (!box) continue;
      const dest = computeConveyorDest(state, config, conveyor, box);
      if (!dest) continue;
      moveBox(state, box.id, dest);
      events.push({ type: 'conveyor_activated', boxId: box.id, path: [...conveyor.path, dest] });
      moved = true;
    }
    depth++;
  }
}
```

### 5.2 滑梯与弹簧 ✅

**滑梯规则**：物件被推到滑梯入口 → 沿 `direction` 一直滑行，直到：
- 撞到墙 → 停在最后一格
- 撞到另一个物件 → 停在被撞物件前一格
- 到达 `stopAt`（若配置）→ 停在该格
- 滑出边界 → **不允许，关卡生成时需保证有阻挡**

**弹簧规则**：弹簧上的物件被"踩到"（玩家推入）或物件落到弹簧上 → 沿 `direction` 弹射 `power` 格；弹射路径上遇阻则停在阻挡物前。

**实现要点**：

1. 滑行必须**逐格检测**，不能一次算终点（要判断路径上每一格的可通行性）
2. 滑行与弹射可能**把物件送出到另一机关上** → 需要再次触发机关链，递归深度上限 5
3. 滑梯既是"地形"也是"触发器"：物件**停在滑梯上**不会被滑走，只有**被推动**时才触发滑行

```typescript
function slideBox(state, config, boxId, direction, events) {
  const box = state.boxes[boxId];
  let cur = box.position;
  while (true) {
    const next = offset(cur, direction);
    if (isWall(next, config) || !inBounds(next, config)) break;
    if (getBoxAt(state, next)) break;
    cur = next;
    if (isStopTile(next, config)) break;
  }
  if (!samePos(cur, box.position)) {
    events.push({ type: 'slope_slided', boxId, from: box.position, to: cur });
    moveBox(state, boxId, cur);
  }
}
```

### 5.3 小伙伴合作 ✅

**规则**：玩家可切换操控主角 / 小伙伴。小伙伴可穿过"狭窄通道"（`canSqueeze: true`），主角不可。

**实现要点**：

1. **状态机复用**：`move()` 内部用 `activeActorId` 决定移动哪个角色，其余逻辑完全复用（这是选择"纯函数引擎"的最大收益）
2. **切换不消耗步数**（否则玩家会为了省步数而不切换，破坏玩法）
3. **UI 必须有明显的角色高亮**，否则玩家会不知道自己在下哪个角色
4. `switchActor` 返回的事件 `actor_switched` 让渲染层播切换动画

```typescript
export function move(state, config, dir) {
  const actorId = state.activeActorId;
  const isPlayer = actorId === 'player';
  const from = isPlayer ? state.playerPos : state.puppetPositions[actorId];

  // 狭窄通道判定
  if (isNarrow(from, dir, config) && isPlayer) {
    return { state, events: [], rejected: true }; // 主角过不去
  }
  // ... 其余逻辑与主角移动统一
}
```

### 5.4 音乐花丛 ⏸️（延后至 v1.1）

**若要做，必须提供视觉替代**（颜色 / 光晕变化），不能只靠声音——否则静音环境下不可玩。

### 5.5 镜子小屋 ⏸️（延后至 v1.1）

**若要做，建议做成独立"镜屋模式"**，不混入主线。状态空间翻倍会让关卡设计成本剧增。

---

## 六、渲染层设计

### 6.1 场景划分

| 场景 | 职责 | 关键点 |
|:---|:---|:---|
| `BootScene` | 加载公共资源、初始化 | 显示"云朵"加载动画 |
| `MenuScene` | 主菜单 | 主角待机动画、入口按钮 |
| `LevelSelectScene` | 选关地图 | 按章节分区，显示星级 |
| `GameScene` | 核心游戏 | 棋盘渲染 + 剩余步数 HUD + 输入 + 动画 |
| `ResultScene` | 结算（胜/败共用） | 胜利：步数与分享入口；**失败：加步复活入口**（v4.0） |
| `DailyScene` | 每日赛 | 今日关卡、一次机会判定、结果与海报（v4.0） |
| `RankScene` | 排行榜 | 好友数据（v1.1） |

### 6.2 渲染优化

| 手段 | 实现 |
|:---|:---|
| **脏标记重绘** | 只重绘发生变化的格子，不做全屏重绘 |
| **对象池** | 粒子效果（星星、脚印）预创建 30 个，循环复用 |
| **静态层** | 墙、地板、网格线合并为一张静态纹理（RenderTexture） |
| **精灵复用** | 物件的纹理按 `BoxType` 缓存，不重复创建 |

```typescript
// 脏标记示例
class BoardRenderer {
  private dirtyTiles = new Set<string>();

  markDirty(pos: Position) {
    this.dirtyTiles.add(`${pos.x},${pos.y}`);
  }

  render() {
    for (const key of this.dirtyTiles) {
      this.redrawTile(parseKey(key));
    }
    this.dirtyTiles.clear();
  }
}
```

### 6.3 输入处理

| 操作 | 实现 | 注意 |
|:---|:---|:---|
| **滑动** | `pointerdown` → `pointerup`，位移阈值 30px | 必须处理"斜向滑动"，取主方向 |
| **长按** | `pointerdown` + 500ms 计时 | 高亮可推物件范围 |
| **双指缩放** | `pointermove` 双指距离比 | 视野缩放 |
| **撤销按钮** | UI 按钮 | 无限次 |

```typescript
function resolveSwipe(dx: number, dy: number): Direction | null {
  const THRESHOLD = 30;
  if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return null;
  return Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? 'right' : 'left')
    : (dy > 0 ? 'down' : 'up');
}
```

---

## 七、微信小游戏适配

### 7.1 平台差异清单

| 能力 | Web | 微信小游戏 | 处理 |
|:---|:---|:---|:---|
| Canvas | `document.createElement` | `wx.createCanvas()` | 用 `minigame-adapter` 抹平 |
| 触摸事件 | DOM 事件 | `wx.onTouchStart` 等 | 同上 |
| 存储 | `localStorage` | `wx.setStorageSync` | 封装 `StorageAdapter` |
| 音频 | `Audio` | `wx.createInnerAudioContext()` | 封装 `AudioAdapter` |
| 分享 | — | `wx.shareAppMessage` | `ShareAdapter` |
| 广告 | — | `wx.createRewardedVideoAd` | `AdAdapter` |
| 开放数据域 | — | `wx.getOpenDataContext()` | 单独子域渲染排行榜 |

### 7.2 适配层设计

统一出口，避免平台判断散落各处：

```typescript
// adapters/index.ts
export interface PlatformAdapter {
  storage: StorageAdapter;
  audio: AudioAdapter;
  share: ShareAdapter;
  ad: AdAdapter;
  system: SystemAdapter;
}

// 通过构建变量切换
export const adapter: PlatformAdapter =
  import.meta.env.VITE_PLATFORM === 'wx' ? WeChatAdapter : WebAdapter;
```

> **建议用环境变量控制平台（如 `VITE_PLATFORM=wx|web`）**，开发时用 Web 调试，构建时切微信包。参考你惯用的 `VITE_USE_MOCK_LOGIN` 那套思路。

### 7.3 广告接入（关键）

```typescript
export class AdAdapterImpl implements AdAdapter {
  private rewardedAd: any;

  init() {
    if (typeof wx === 'undefined') return;
    this.rewardedAd = wx.createRewardedVideoAd({ adUnitId: 'YOUR_AD_UNIT_ID' });

    this.rewardedAd.onLoad(() => this.onLoadCb?.());
    this.rewardedAd.onError((err: any) => {
      // ⚠️ 降级：广告加载失败 → 按阶段降级（MVP-2「稍后再试」轻提示 / v1.0 起「分享求助」）
      this.onErrorCb?.(err);
    });
    this.rewardedAd.onClose((res: any) => {
      // ⚠️⚠️ 必须检查 isEnded，用户跳过不发放奖励
      const completed = res && res.isEnded === true;
      this.onCloseCb?.(completed);
    });
  }

  async show(): Promise<boolean> {
    try {
      await this.rewardedAd.show();
      return true;
    } catch {
      // 加载失败则重新拉取再试一次
      await this.rewardedAd.load();
      try {
        await this.rewardedAd.show();
        return true;
      } catch {
        return false;
      }
    }
  }
}
```

**三个必须处理的事件**：

| 事件 | 处理 |
|:---|:---|
| `onLoad` | 记录"广告可用"，UI 才显示"看广告"按钮（开始拉取后 **3s 内既无 `onLoad` 也无 `onError`** 视为静默失败 → 按"广告不可用"处理） |
| `onError` | **按阶段降级**（与 PRD FR-15 一致）：MVP-2「稍后再试」轻提示 / v1.0 起「分享求助」，不能卡死流程 |
| `onClose` | **必须检查 `isEnded`**，`false` 时不发奖励 |

> **降级口径（与 PRD v1.2 / FR-15 对齐）**：`onError` 与"3s 静默失败"统一走**阶段化降级**——MVP-2 为「稍后再试」轻提示、v1.0 起为「分享求助」，均不阻塞主流程。旧表述"一律降级为分享求助"已废弃。

### 7.4 开放数据域（好友排行榜 · v1.1）

```typescript
// 主域：设置要展示的数据
wx.setUserCloudStorage({
  KVDataList: [
    { key: 'minSteps_lv8', value: '23' },      // 第 8 关最少步数
    { key: 'progress', value: '30' },          // 已通关数
  ],
});

// 子域（open-data-context 独立包）：渲染排行榜
const openDataContext = wx.getOpenDataContext();
const sharedCanvas = openDataContext.canvas; // 主域绘制到自己的 canvas 上
```

**注意**：

- KV 数据 key 命名建议 `{指标}_{关卡}`，便于扩展
- 开放数据域是**独立运行环境**，不能访问主域变量
- 数据更新有延迟，不要频繁写入

---

## 八、后端设计（v4.0：小镇每日赛）

### 8.1 为什么用微信云开发

| 方案 | 优点 | 缺点 | 结论 |
|:---|:---|:---|:---|
| **微信云开发** | 免运维、免费额度够用、天然拿到 openid | 只能跑在微信生态 | ✅ **推荐** |
| 自建服务器 | 自由 | 需 ICP 备案 + 运维 | ❌ 前期不必要 |
| 纯本地 | 零后端 | 每日赛（全服同题、防作弊）做不了 | ❌ 核心玩法做不了 |

### 8.2 数据表设计

```typescript
/** 每日赛关卡（预生成管线写入，每天一条） */
interface DailyChallenge {
  _id: string;
  date: string;             // 'YYYY-MM-DD'（唯一索引）
  levelId: number;
  config: LevelConfig;      // 完整关卡配置（含 meta.maxSteps）
  createdAt: number;
}

/** 每日赛挑战（一次机会的服务端载体；进入即写入） */
interface DailyAttempt {
  _id: string;
  date: string;             // 开始日的服务端日期（'YYYY-MM-DD'；跨零点提交按此计入）
  openId: string;
  startedAt: number;
  usedRevive: boolean;      // 是否用过加步复活（每日 1 次，服务端权威，客户端入参不采用）
  // 唯一约束：(date, openId) —— 一次机会 + 堵死"打几步→退出→重进"的变相重开
}

/** 每日赛成绩 */
interface DailyResult {
  _id: string;
  date: string;             // 与 DailyChallenge / DailyAttempt 对应（= 开始日）
  openId: string;
  steps: number;            // 消耗步数（越少越好）
  duration: number;         // 用时（秒，步数并列时比较用；客户端上报）
  usedRevive: boolean;      // 是否用过加步复活（快照自 DailyAttempt，每日 1 次）
  beatPercent: number;      // 击败百分比（提交成功时快照落库，此后固定不变）
  total: number;            // 当日提交总人数（提交时快照；用于判定是否降级展示）
  submittedAt: number;
  // 唯一约束：(date, openId)
}

/** 求助记录（用于防骚扰计数） */
interface HelpRequest {
  _id: string;
  fromOpenId: string;
  toOpenId: string;
  levelId: number;
  createdAt: number;
  helped: boolean;
}

/** v1.1 扩展：1v1 挑战（保留 v3.0 结构） */
interface Challenge {
  _id: string;
  levelId: number;
  creatorOpenId: string;
  creatorSteps: number;     // **不返回给挑战者**
  createdAt: number;
  expiresAt: number;        // 24h 过期
  status: 'open' | 'finished' | 'expired';
}
```

### 8.3 云函数设计（每日赛）

| 云函数 | 职责 | 关键逻辑 |
|:---|:---|:---|
| `getDailyChallenge` | 获取今日赛信息 | 按 `date` 查关卡；依 `DailyAttempt` 判定状态（无记录=未挑战 / 有记录未提交=挑战中·当日可续玩 / 已提交=已提交）；已提交用户返回 `{mySteps, beatPercent, total}`（**快照值**）；**不返回他人成绩** |
| `submitDailyResult` | 提交成绩 | 校验链（见下，含幂等）；写入 `DailyResult`（提交时快照 `beatPercent` / `total`）；返回 `{mySteps, beatPercent, total}` |
| `sendHelp` | 发起求助 | **校验每日 3 次 + 好友 24h 冷却** |
| `dailySettlement`（定时触发） | 每日结算 | 00:00 激活当天预生成关卡、归档昨日分布 |

**`submitDailyResult` 校验链（关键）**：

```typescript
// ⓪ 载入本次挑战的服务端记录：以 attemptId 定位（不采用客户端 date 作检索键，防伪造 / 跨零点歧义）
const attempt = await getAttemptById(attemptId);
if (!attempt || attempt.openId !== openId) return { error: 'NO_ATTEMPT' };   // 未开始 / 非本人
//   备用：若客户端未回传 attemptId，服务端按 openId 取"当日最近一条未提交 attempt"；一律忽略客户端 date
// ⓪-1 时效界：仅允许在"开始日当日"或"跨零点次日"提交；更早的未提交 attempt 视为作废（防延迟补交刷旧日榜）
const srvToday = today();                                                   // 服务端日期
if (attempt.date !== srvToday && attempt.date !== formatDate(addDays(srvToday, -1)))
  return { error: 'EXPIRED' };
// ⓪' 幂等：该 attempt 已有成绩 → 直接返回既有成绩（重试不消耗第二次机会）
const existing = await getResult(attempt.date, openId);
if (existing) return { status: 'ok', ...existing, idempotent: true };

// ① 日期一律取开始日的服务端日期（attempt.date；跨零点提交按开始日计，防伪造历史成绩）
const submitDate = attempt.date;

// ② 步数必须在合法区间（服务端用关卡配置重算，不信任客户端）
const cfg = await getChallengeByDate(attempt.date);
const { optimalSteps, maxSteps } = cfg.meta;
const budget = maxSteps + (attempt.usedRevive ? 3 : 0);    // 复活 +3（以服务端 attempt.usedRevive 为准）
if (steps < optimalSteps || steps > budget) {
  return { error: 'INVALID_STEPS' };
}

// ③ 每日一次机会（(date, openId) 数据库唯一索引强制；重复提交已由 ⓪' 幂等早返回覆盖，无需再查）
// ④ 复活次数校验（每日 1 次）——以服务端 DailyAttempt.usedRevive 为准，客户端入参 usedRevive 一律不采用

// ⑤ duration 下界一致性（duration ≥ steps × 0.3s；阈值服务端配置下发，可热调）
const MIN_STEP_MS = await getServerConfig('MIN_STEP_MS', 300);   // 默认 0.3s/步
const durationSuspect = duration * 1000 < steps * MIN_STEP_MS;   // 疑似异常 → 标记待复核（不阻断提交）
```

> **校验链要点（与 PRD v1.2 §11.3 对齐）**：以 **`attemptId` 定位服务端 `DailyAttempt`**（不采用客户端 `date`），日期 / `usedRevive` 均取自该记录而非客户端入参；**新增时效界（仅当日/跨零点次日可提交）**；重复提交幂等；duration 下界一致性校验（仅标记，不参与绝对胜负判定，残余风险见 PRD §11.3）。

**`submitDailyResult` 的返回**：

```typescript
{
  status: 'ok',
  mySteps: 5,
  beatPercent: 87,     // "击败 87% 的镇民"（提交成功时快照落库到 DailyResult，此后固定不变）
  total: 1024,         // 当日提交总人数（提交时快照；<20 时客户端降级为"今日已有 N 位镇民完成"）
  // ⚠️ 不返回任何个人排名、不返回他人步数——只给百分比 / 聚合人数
}
```

### 8.4 防作弊（基础）

| 风险 | 措施 |
|:---|:---|
| 客户端伪造步数 | 服务端用关卡配置**重算最优步数**，`steps < optimalSteps` 或 `> 预算` → 拒绝 |
| 重复提交刷分 | `(date, openId)` 唯一约束 + 一次机会判定；服务端口径，不信任客户端 |
| 复活次数刷取 | 以服务端 `DailyAttempt.usedRevive` 为准（每日 1 次，客户端入参不采用） |
| 刷求助次数 | 服务端计数，不信任客户端 |

> **目标边界（与 PRD v1.2 §11.3 对齐）**：本版本为 **区间校验 + 一次机会 + 服务端计数** 的"防作弊基础校验链"，**不承诺完全防刷**（服务端不重放操作，`steps` 与棋盘快照为客户端权威）；已知残余风险与后续加固方向见 PRD §11.3。

### 8.5 每日赛关卡预生成管线（v4.0 新增）

```typescript
// tools/dailyGenerator.ts 伪代码
async function generateDailyChallenges(days: number) {
  for (let d = 0; d < days; d++) {
    const date = formatDate(addDays(today(), d));
    if (await existsChallenge(date)) continue;   // ⚠️ 幂等：不覆盖已生成

    let cfg: LevelConfig;
    do {
      cfg = reverseGenerate({ gridSize: [6, 6], boxes: 2 });
    } while (!validateDailyLevel(cfg));          // 校验不通过则重生成

    cfg = deriveDailyBudget(cfg);                // 派生 maxSteps 并写入 meta（PRD v1.2）
    await insertChallenge({ date, levelId: cfg.id, config: cfg });
  }
}

/** 每日赛关卡硬约束（与主线不同：宁易勿难） */
function validateDailyLevel(cfg: LevelConfig): boolean {
  const optimal = computeOptimalSteps(cfg);
  return (
    optimal >= 6 && optimal <= 15 &&        // 日常难度区间
    !hasBoxOnTargetInitially(cfg) &&         // 初始质量
    isEnclosed(cfg)                          // 地图封闭
  );
}

/**
 * 每日赛步数预算派生（PRD v1.2）：maxSteps = optimalSteps + 每日赛余量(+4~6)
 * 每日赛单列"每日赛档"，不套用教学/普通/魔鬼三档；写入 meta 供服务端计算步数上界
 */
function deriveDailyBudget(cfg: LevelConfig): LevelConfig {
  const optimal = computeOptimalSteps(cfg);
  cfg.meta.optimalSteps = optimal;
  cfg.meta.maxSteps = optimal + DAILY_TOLERANCE;   // DAILY_TOLERANCE ∈ [4, 6]
  return cfg;
}
```

**运行要求**：

- **幂等**：重复执行不覆盖已存在的日期（防误删重跑）
- **提前量**：始终保持 ≥30 天预生成余量；断供时客户端降级"昨日关卡重玩"
- **步数预算派生（PRD v1.2）**：入库前 `maxSteps = optimalSteps + 每日赛余量(+4~6)`（**每日赛档**），写入 `config.meta.maxSteps`；服务端据此计算步数上界（见 8.3 校验链②）
- **人工抽检**：每周抽检 1-2 关，重点看"直觉解法是否是陷阱"（每日赛不宜过度魔鬼化）

---

## 九、性能预算

| 指标 | 目标 | 测量方式 |
|:---|:---|:---|
| 首屏加载 | ≤ 3 秒（4G） | 微信开发者工具 Performance |
| 单次移动响应 | ≤ 50ms | 真机打点 |
| 帧率 | 稳定 60 FPS（中端机 ≥50） | 真机 FPS 面板 |
| 内存峰值 | ≤ 200MB | 微信开发者工具 Memory |
| 包体 | ≤ 3.5MB（首包） | 构建产物大小 |

---

## 十、测试策略

### 10.1 引擎层单测（必须 100% 覆盖）

```typescript
describe('SokobanEngine', () => {
  it('撞墙时拒绝移动，状态不变', () => {
    const cfg = parseLevel(wallLevel);
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'up');
    expect(r.rejected).toBe(true);
    expect(r.state).toEqual(s0);
  });

  it('物件被推动时产生 box_pushed 事件', () => {
    const cfg = parseLevel(pushLevel);
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'right');
    expect(r.events).toContainEqual({
      type: 'box_pushed', boxId: expect.any(String),
      from: expect.any(Object), to: expect.any(Object),
    });
  });

  it('所有物件归位时判定胜利', () => {
    // ...
  });

  it('撤销恢复棋盘，但步数不返还', () => {
    // ⚠️ v4.0 核心语义：steps 不回退
    const cfg = parseLevel(pushLevel);
    let s = createState(cfg);
    s = move(s, cfg, 'right').state;
    s = move(s, cfg, 'up').state;
    const stepsBeforeUndo = s.steps;
    const r = undo(s, cfg);
    expect(r.state.steps).toBe(stepsBeforeUndo);   // 步数锁死
    expect(r.state.playerPos).toEqual(/* 上一步位置 */);
  });

  it('步数耗尽时进入失败态，且此后 move 被拒绝', () => {
    // ⚠️ v4.0 限步用例
    const cfg = parseLevel(tightBudgetLevel);      // maxSteps = 3
    let s = createState(cfg);
    s = move(s, cfg, 'right').state;   // 1 步
    s = move(s, cfg, 'left').state;    // 2 步（来回走）
    s = move(s, cfg, 'right').state;   // 3 步 → 预算用尽
    expect(s.failed).toBe(true);
    expect(move(s, cfg, 'left').rejected).toBe(true);
  });

  it('最后一步完成时判定为胜利而非失败', () => {
    // ⚠️ v4.0 边界：结算判定顺序敏感（胜利优先于失败）
  });

  it('revive() 解除失败态并增加预算', () => {
    // ⚠️ v4.0：复活广告
    const s1 = revive(s0AtFailed, 3);
    expect(s1.failed).toBe(false);
    expect(s1.stepBudget).toBe(s0AtFailed.stepBudget + 3);
  });

  it('机关结算顺序：传送带优先于滑梯', () => {
    // 组合场景测试，这是最容易出 bug 的地方
  });
});
```

### 10.2 测试重点（按风险排序）

| 优先级 | 测试项 | 原因 |
|:---|:---|:---|
| P0 | `move()` 的不可变性 | 状态泄漏会导致撤销/回放全部崩坏 |
| P0 | **步数锁死语义**（撤销不回步） | v4.0 核心规则，写错会毁掉整个玩法 |
| P0 | **结算判定顺序**（胜利 → 失败 → 死局） | 最后一步完成误判为失败 = 灾难 |
| P0 | 机关结算顺序 | 组合场景最容易出 bug |
| P0 | 机关连锁的递归上限 | 防止死循环卡死游戏 |
| P1 | 撤销/重置 | 玩家高频使用 |
| P1 | 关卡求解器 + maxSteps 派生 | 关卡质量与难度把关 |
| P1 | **每日赛成绩校验**（服务端） | 防作弊是竞技公平的生命线 |
| P2 | 1v1 挑战（v1.1） | 扩展功能 |

---

## 十一、目录结构（建议）

```
game_box/
├── docs/                          # 本文档所在目录
│   ├── 01-product-spec.md
│   ├── 02-flowcharts.md
│   ├── 03-dev-spec.md
│   └── 04-task-breakdown.md
├── prototype/                     # 高保真交互稿（HTML）
│   └── index.html
├── src/
│   ├── engine/                    # 引擎层（纯函数，零 Phaser 依赖）
│   │   ├── types.ts               # 含 maxSteps / stepBudget / failed（v4.0）
│   │   ├── createState.ts
│   │   ├── move.ts                # 含限步判定与失败结算（v4.0）
│   │   ├── undo.ts                # 回退棋盘 · 步数锁死（v4.0）
│   │   ├── revive.ts              # 加步复活（v4.0）
│   │   ├── mechanisms/            # 机关实现
│   │   │   ├── conveyor.ts
│   │   │   ├── slope.ts
│   │   │   └── spring.ts
│   │   ├── hint.ts
│   │   ├── deadlock.ts
│   │   ├── solver.ts              # 最优步数计算 + maxSteps 派生
│   │   └── index.ts
│   ├── levels/                    # 关卡数据
│   │   ├── chapter1.json
│   │   ├── chapter2.json
│   │   └── chapter3.json
│   ├── scenes/                    # Phaser 场景（含 DailyScene 每日赛）
│   ├── ui/                        # UI 组件（剩余步数 HUD / 结果海报）
│   ├── adapters/                  # 平台适配层（含 AdAdapter 复活广告）
│   ├── assets/                    # 美术/音频资源
│   └── main.ts
├── cloudfunctions/                # 微信云开发（v4.0）
│   ├── getDailyChallenge/
│   ├── submitDailyResult/
│   └── sendHelp/
├── tests/                         # 单测
│   └── engine/
├── tools/                         # 关卡生成/校验脚本
│   ├── generator.ts
│   ├── validator.ts
│   └── dailyGenerator.ts          # 每日赛 30 天预生成（幂等）
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 十二、风险与技术债提示

| 风险点 | 说明 | 应对 |
|:---|:---|:---|
| **步数锁死的规则感知** | 玩家可能不理解"撤销为什么不让步数变回来" | UI 明示（撤销按钮旁标注 + "步数不返还"轻提示 + 首次触发时强提示） |
| **结算判定顺序误写** | 最后一步胜利被误判为失败 → 玩家愤怒 | 单测固化顺序：胜利 → 失败 → 死局 |
| 机关组合爆炸 | 3 个机制两两组合就是 3 种交叉场景，都要测 | 引擎层先写组合单测，再做关卡 |
| `detectDeadlock` 不准确 | 完整死局判定是 PSPACE 难度 | 只做有限深度搜索，**不承诺 100% 准确**，UI 上表达为"可能卡住了" |
| `getHint` 性能 | BFS 全状态空间可能很慢 | **限制搜索深度** + 预计算最优路径缓存 |
| **每日赛关卡质量** | 每天一关且不可重试，差关卡直接伤害当日全部用户 | 预生成管线强制校验 + 人工抽检；客户端断供降级"昨日重玩" |
| 包体超限 | 美术资源容易超 | 每加一个资源就测包体，别到最后才发现 |
| 微信 API 变更 | 适配层可能有 breaking change | 适配层隔离，最多改一个文件 |

---

*文档版本：v1.0 | 编写日期：2026 年 10 月*
