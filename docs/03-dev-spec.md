# 《云朵小镇·推推奇遇》开发文档

> 配套产品文档：`docs/01-product-spec.md` v3.0
> 配套流程图：`docs/02-flowcharts.md`
> 文档版本：v1.0 | 编写日期：2026 年 10 月

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
| 后端 | 微信云开发（云函数 + 云数据库） | — | 挑战赛数据量小，云开发免运维、免备案复杂度 |

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
  /** 已走步数 */
  steps: number;
  /** 历史状态栈（用于撤销，序列化后存储） */
  history: string[];
  /** 是否已胜利 */
  won: boolean;
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
  | { type: 'deadlock_detected' }
  | { type: 'level_won'; steps: number };

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
 * @returns 初始化后的不可变状态
 */
export function createState(config: LevelConfig): GameState;

/**
 * 执行一次移动（纯函数，不修改入参）
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
 * 序列化状态（用于撤销栈 / 挑战赛传输）
 */
export function serialize(state: GameState): string;

/** 反序列化 */
export function deserialize(raw: string): GameState;

/**
 * 撤销一步
 */
export function undo(
  state: GameState,
  config: LevelConfig
): MoveResult;

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
 */
export function computeOptimalSteps(config: LevelConfig): number;
```

### 3.3 move() 的执行顺序（关键）

```typescript
export function move(state: GameState, config: LevelConfig, dir: Direction): MoveResult {
  // ① 已胜利则拒绝
  if (state.won) return { state, events: [], rejected: true };

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

  // ⑩ 计步 + 压入历史
  next.steps += 1;
  next.history.push(serialize(state));

  // ⑪ 胜利判定
  if (checkWin(next, config)) {
    next.won = true;
    events.push({ type: 'level_won', steps: next.steps });
  } else if (detectDeadlock(next, config)) {
    events.push({ type: 'deadlock_detected' });
  }

  return { state: next, events, rejected: false };
}
```

**⚠️ 机关结算顺序是本项目最关键的设计决策之一。** 顺序写错会导致：
- 传送带和滑梯同时存在时，物件行为不可预测
- 单测难以覆盖组合场景

**建议：固定为 传送带 → 滑梯 → 弹簧 → 目标点，并在引擎层写死，关卡生成器据此验证。**

### 3.4 不可变性实现建议

- 生产环境用 **structuredClone**（现代内核支持）或 **手写深拷贝**（更快，需单测覆盖）
- **不要用 `JSON.parse(JSON.stringify())`** 做热路径拷贝（性能差）
- `history` 只存 `serialize()` 后的字符串，不存完整对象（省内存）

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
| `GameScene` | 核心游戏 | 棋盘渲染 + 输入 + 动画 |
| `ResultScene` | 结算 | 步数、对比、分享/挑战入口 |
| `ChallengeScene` | 挑战赛 | 挑战结果对比 |
| `RankScene` | 排行榜 | 好友最少步数榜 |

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
      // ⚠️ 降级：广告加载失败 → 走分享求助
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
| `onLoad` | 记录"广告可用"，UI 才显示"看广告"按钮 |
| `onError` | **降级为"分享求助"**，不能卡死流程 |
| `onClose` | **必须检查 `isEnded`**，`false` 时不发奖励 |

### 7.4 开放数据域（好友排行榜）

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

## 八、后端设计（挑战赛）

### 8.1 为什么用微信云开发

| 方案 | 优点 | 缺点 | 结论 |
|:---|:---|:---|:---|
| **微信云开发** | 免运维、免备案复杂度、免费额度够用 | 只能跑在微信生态 | ✅ **推荐** |
| 自建服务器 | 自由 | 需 ICP 备案 + 运维 | ❌ 前期不必要 |
| 纯本地 | 零后端 | 无法做异步 PK | ❌ 社交功能做不了 |

### 8.2 数据表设计

```typescript
/** 挑战记录 */
interface Challenge {
  _id: string;              // 挑战 ID（云数据库自动生成）
  levelId: number;
  creatorOpenId: string;    // 发起者
  creatorSteps: number;     // 发起者步数（**不返回给挑战者**）
  creatorNickname: string;
  creatorAvatar: string;
  createdAt: number;
  expiresAt: number;        // 24h 过期
  status: 'open' | 'finished' | 'expired';
}

/** 挑战成绩 */
interface ChallengeResult {
  _id: string;
  challengeId: string;
  openId: string;
  steps: number;
  duration: number;         // 用时（秒）
  submittedAt: number;
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
```

### 8.3 云函数设计

| 云函数 | 职责 | 关键逻辑 |
|:---|:---|:---|
| `createChallenge` | 创建挑战 | 校验 levelId 合法，写入 `Challenge` |
| `joinChallenge` | 加入挑战 | **返回关卡配置，不返回 creatorSteps** |
| `submitResult` | 提交成绩 | 写入 `ChallengeResult`，返回对比结果 |
| `sendHelp` | 发起求助 | **校验每日 3 次 + 好友 24h 冷却** |
| `getRank` | 拉取排行 | 从开放数据域 / 云数据库读 |

**`submitResult` 的返回（关键）**：

```typescript
// 挑战尚未结束（对方还没提交）→ 不透露成绩
{ status: 'waiting' }

// 双方都已提交 → 揭晓
{
  status: 'finished',
  mySteps: 19,
  opponentSteps: 23,
  diff: 4,
  iWin: true,
  // 仅当差距 ≤2 时才返回这个标记，用于触发"再挑战"
  nearMiss: false
}
```

### 8.4 防作弊（基础）

| 风险 | 措施 |
|:---|:---|
| 客户端伪造步数 | 服务端用关卡配置**重算最优步数**，若提交步数 < 最优步数 → 判定异常 |
| 重复提交刷分 | 每个 `(challengeId, openId)` 只保留最优一条 |
| 刷求助次数 | 服务端计数，不信任客户端 |

```typescript
// submitResult 内的基础校验
const optimal = LEVEL_CACHE[levelId].meta.optimalSteps;
if (steps < optimal) {
  return { error: 'INVALID_STEPS' }; // 不可能的步数
}
```

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

  it('撤销能恢复到上一步状态', () => {
    // ...
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
| P0 | 机关结算顺序 | 组合场景最容易出 bug |
| P0 | 机关连锁的递归上限 | 防止死循环卡死游戏 |
| P1 | 撤销/重置 | 玩家高频使用 |
| P1 | 关卡求解器 | 关卡质量把关 |
| P2 | 挑战赛成绩对比 | 社交核心 |

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
│   │   ├── types.ts
│   │   ├── createState.ts
│   │   ├── move.ts
│   │   ├── mechanisms/            # 机关实现
│   │   │   ├── conveyor.ts
│   │   │   ├── slope.ts
│   │   │   └── spring.ts
│   │   ├── hint.ts
│   │   ├── deadlock.ts
│   │   ├── solver.ts              # 最优步数计算
│   │   └── index.ts
│   ├── levels/                    # 关卡数据
│   │   ├── chapter1.json
│   │   ├── chapter2.json
│   │   └── chapter3.json
│   ├── scenes/                    # Phaser 场景
│   ├── ui/                        # UI 组件
│   ├── adapters/                  # 平台适配层
│   ├── assets/                    # 美术/音频资源
│   └── main.ts
├── tests/                         # 单测
│   └── engine/
├── tools/                         # 关卡生成/校验脚本
│   ├── generator.ts
│   └── validator.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 十二、风险与技术债提示

| 风险点 | 说明 | 应对 |
|:---|:---|:---|
| 机关组合爆炸 | 3 个机制两两组合就是 3 种交叉场景，都要测 | 引擎层先写组合单测，再做关卡 |
| `detectDeadlock` 不准确 | 完整死局判定是 PSPACE 难度 | 只做有限深度搜索，**不承诺 100% 准确**，UI 上表达为"可能卡住了" |
| `getHint` 性能 | BFS 全状态空间可能很慢 | **限制搜索深度** + 预计算最优路径缓存 |
| 包体超限 | 美术资源容易超 | 每加一个资源就测包体，别到最后才发现 |
| 微信 API 变更 | 适配层可能有 breaking change | 适配层隔离，最多改一个文件 |

---

*文档版本：v1.0 | 编写日期：2026 年 10 月*
