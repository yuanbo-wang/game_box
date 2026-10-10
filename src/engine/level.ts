/**
 * 字符网格 → LevelConfig 解析器（关卡编写 / 测试夹具用）
 *
 * 字符表（docs/03-dev-spec.md 4.1）：
 *   #  墙        .  平地      o  星光台（目标）
 *   B  物件      P  主角起点   ~  空洞（空格视同空洞）
 *
 * 机关（传送带 / 滑梯 / 弹簧 / 小伙伴）结构较复杂，不做字符化，以配置对象传入；
 * 难度余量档位（tier）用于派生 maxSteps = optimalSteps + 容错余量。
 */
import { MARGIN_BY_TIER, PLAYER_ID } from './constants';
import type {
  Box,
  BoxType,
  ConveyorConfig,
  LevelConfig,
  MarginTier,
  Position,
  PuppetConfig,
  SlopeConfig,
  SpringConfig,
  TileType,
} from './types';

/** parseLevel 的可选参数 */
export interface ParseLevelOptions {
  id?: number;
  chapter?: number;
  name?: string;
  /** 容错余量档位（缺省 normal：+5） */
  tier?: MarginTier;
  /** 最优步数（与 tier 一起派生 maxSteps；或与 maxSteps 二选一提供） */
  optimalSteps?: number;
  /** 显式指定步数预算（优先于 optimalSteps + tier 派生） */
  maxSteps?: number;
  isDevil?: boolean;
  tutorial?: string;
  /** 按出现顺序指定 B 的物件类型（缺省 generic） */
  boxTypes?: BoxType[];
  conveyors?: ConveyorConfig[];
  slopes?: SlopeConfig[];
  springs?: SpringConfig[];
  puppets?: PuppetConfig[];
}

/**
 * 将字符网格解析为 LevelConfig
 * @param rows 网格行（每行长度须一致）
 * @param options 元信息与机关配置
 */
export function parseLevel(rows: string[], options: ParseLevelOptions = {}): LevelConfig {
  if (rows.length === 0) throw new Error('关卡网格不能为空');

  const width = rows[0].length;
  const walls: Position[] = [];
  const targets: Position[] = [];
  const boxes: Box[] = [];
  const tiles: Record<string, TileType> = {};
  let playerStart: Position | null = null;

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`网格第 ${y} 行长度 ${row.length} 与首行 ${width} 不一致`);
    }
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      switch (ch) {
        case '#':
          walls.push({ x, y });
          break;
        case '.':
          break;
        case 'o':
          targets.push({ x, y });
          break;
        case 'B':
          boxes.push({
            id: `b${boxes.length + 1}`,
            type: options.boxTypes?.[boxes.length] ?? 'generic',
            position: { x, y },
          });
          break;
        case 'P':
          playerStart = { x, y };
          break;
        case '~':
        case ' ':
          tiles[`${x},${y}`] = 'gap';
          break;
        default:
          throw new Error(`未知网格字符 "${ch}"（位置 ${x},${y}）`);
      }
    }
  });

  if (!playerStart) throw new Error('关卡缺少主角起点（P）');
  if (boxes.length !== targets.length) {
    throw new Error(`物件数（${boxes.length}）与星光台数（${targets.length}）不一致`);
  }

  const optimal = options.optimalSteps;
  const maxSteps =
    options.maxSteps ?? (optimal !== undefined ? optimal + MARGIN_BY_TIER[options.tier ?? 'normal'] : undefined);
  if (optimal === undefined || maxSteps === undefined) {
    throw new Error('需要提供 optimalSteps（配合 tier 派生 maxSteps）或直接提供 maxSteps + optimalSteps');
  }

  return {
    id: options.id ?? 0,
    chapter: options.chapter ?? 1,
    gridSize: [width, rows.length],
    walls,
    tiles: Object.keys(tiles).length > 0 ? tiles : undefined,
    boxes,
    targets,
    conveyors: options.conveyors ?? [],
    slopes: options.slopes ?? [],
    springs: options.springs ?? [],
    playerStart,
    puppets: options.puppets ?? [],
    meta: {
      optimalSteps: optimal,
      maxSteps,
      isDevil: options.isDevil ?? false,
      name: options.name ?? '未命名关卡',
      tutorial: options.tutorial,
    },
  };
}

/** 当前操控角色是否为小伙伴（辅助：校验 canSqueeze 等场景用） */
export function isPuppet(actorId: string): boolean {
  return actorId !== PLAYER_ID;
}
