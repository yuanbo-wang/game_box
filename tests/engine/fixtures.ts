/**
 * 测试夹具：常用关卡（全部用字符网格 + 显式步数预算构造）
 */
import { parseLevel } from '../../src/engine';
import type { LevelConfig } from '../../src/engine';

/** 一步通关：P 直接把 B 推进星光台（最优 1 步） */
export function levelOnePush(): LevelConfig {
  return parseLevel(['#####', '#PBo#', '#####'], {
    id: 1,
    name: '一步通关',
    optimalSteps: 1,
    maxSteps: 3,
  });
}

/**
 * 小房间关（最优 4 步）：
 * P(3,3) 上推 B(3,2)→(3,1)，绕到 (4,1) 再左推 B→(2,1) 星光台
 */
export function levelRoom(): LevelConfig {
  return parseLevel(
    ['######', '#.o..#', '#..B.#', '#..P.#', '######'],
    { id: 2, name: '小房间', optimalSteps: 4, maxSteps: 8 },
  );
}

/** 小房间关·预算不足版（赢需要 4 步，预算只有 1 步 → 一步推完必失败） */
export function levelRoomTight(): LevelConfig {
  return parseLevel(
    ['######', '#.o..#', '#..B.#', '#..P.#', '######'],
    { id: 3, name: '预算不足', optimalSteps: 4, maxSteps: 1 },
  );
}

/** 小房间关·恰好预算版（第 4 步完成 → 应判胜利而非失败） */
export function levelRoomExact(): LevelConfig {
  return parseLevel(
    ['######', '#.o..#', '#..B.#', '#..P.#', '######'],
    { id: 4, name: '恰好预算', optimalSteps: 4, maxSteps: 4 },
  );
}

/** 无解关：B 被卡在角落（初始即死局） */
export function levelUnsolvable(): LevelConfig {
  return parseLevel(['#####', '#B..#', '#P..#', '#..o#', '#####'], {
    id: 5,
    name: '无解关',
    optimalSteps: 0,
    maxSteps: 10,
  });
}

/** 传送带基本关：B 被推下到传送带起点 (3,3)，运到出口 (5,3) */
export function levelConveyor(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#.....#', '#....o#', '#######'],
    {
      id: 6,
      name: '传送带',
      optimalSteps: 3,
      maxSteps: 8,
      conveyors: [{ path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], exitDirection: 'right' }],
    },
  );
}

/** 传送带出口被堵：出口 (5,3) 是墙 → 物件停在传送带末端 (4,3) */
export function levelConveyorBlocked(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#....##', '#....o#', '#######'],
    {
      id: 7,
      name: '传送带堵塞',
      optimalSteps: 3,
      maxSteps: 8,
      conveyors: [{ path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], exitDirection: 'right' }],
    },
  );
}

/** 传送带串联：A 送 B、B 再送一程（连锁递归） */
export function levelConveyorChain(): LevelConfig {
  return parseLevel(
    ['########', '#P.....#', '#..B...#', '#......#', '#.....o#', '########'],
    {
      id: 8,
      name: '传送带串联',
      optimalSteps: 3,
      maxSteps: 8,
      conveyors: [
        { path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], exitDirection: 'right' },
        { path: [{ x: 5, y: 3 }, { x: 6, y: 3 }], exitDirection: 'right' },
      ],
    },
  );
}

/** 传送带对撞环：A→B→A 互相送（验证递归上限 5 层不死循环） */
export function levelConveyorLoop(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#.....#', '#....o#', '#######'],
    {
      id: 9,
      name: '传送带环',
      optimalSteps: 3,
      maxSteps: 8,
      conveyors: [
        { path: [{ x: 3, y: 3 }, { x: 4, y: 3 }], exitDirection: 'right' },
        { path: [{ x: 5, y: 3 }], exitDirection: 'left' },
      ],
    },
  );
}

/** 滑梯关：B 被推下到滑梯入口 (3,3)，沿 down 滑到墙前 (3,6) */
export function levelSlope(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#.....#', '#.....#', '#.....#', '#....o#', '#######'],
    {
      id: 10,
      name: '滑梯',
      optimalSteps: 3,
      maxSteps: 8,
      slopes: [{ entry: { x: 3, y: 3 }, slideDirection: 'down' }],
    },
  );
}

/** 弹簧关：B 被推下到弹簧 (3,3)，向右弹射 2 格到 (5,3) */
export function levelSpring(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#.....#', '#....o#', '#######'],
    {
      id: 11,
      name: '弹簧',
      optimalSteps: 3,
      maxSteps: 8,
      springs: [{ position: { x: 3, y: 3 }, direction: 'right', power: 2 }],
    },
  );
}

/** 跨机关链：传送带把 B 送到滑梯入口 → 滑梯接着滑 */
export function levelConveyorToSlope(): LevelConfig {
  return parseLevel(
    ['#######', '#P....#', '#..B..#', '#.....#', '#.....#', '#.....#', '#....o#', '#######'],
    {
      id: 12,
      name: '传送带接滑梯',
      optimalSteps: 3,
      maxSteps: 8,
      conveyors: [{ path: [{ x: 3, y: 3 }], exitDirection: 'down' }],
      slopes: [{ entry: { x: 3, y: 4 }, slideDirection: 'down' }],
    },
  );
}

/** 小伙伴 + 狭窄通道关 */
export function levelPuppet(): LevelConfig {
  return parseLevel(['######', '#P...#', '#....#', '######'], {
    id: 13,
    name: '小伙伴',
    optimalSteps: 1,
    maxSteps: 5,
    puppets: [{ id: 'rabbit', position: { x: 3, y: 2 }, canSqueeze: true }],
  });
}
