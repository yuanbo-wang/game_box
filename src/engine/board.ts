/**
 * 棋盘基础工具：坐标运算、格子/角色/物件查询、状态克隆
 * 全部为纯函数（除标记为「写入」的辅助函数外），不修改入参。
 */
import { PLAYER_ID } from './constants';
import type { Box, Direction, GameState, LevelConfig, Position, TileType } from './types';

/** 四个方向（固定顺序，供 BFS 遍历使用） */
export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

/** 坐标偏移 */
export function offset(pos: Position, dir: Direction): Position {
  switch (dir) {
    case 'up':
      return { x: pos.x, y: pos.y - 1 };
    case 'down':
      return { x: pos.x, y: pos.y + 1 };
    case 'left':
      return { x: pos.x - 1, y: pos.y };
    case 'right':
      return { x: pos.x + 1, y: pos.y };
  }
}

/** 坐标是否相同 */
export function samePos(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/** "x,y" 形式的格子 key（与 LevelConfig.tiles 的键一致） */
export function posKey(pos: Position): string {
  return `${pos.x},${pos.y}`;
}

/** 坐标是否在界内 */
export function inBounds(config: LevelConfig, pos: Position): boolean {
  return pos.x >= 0 && pos.y >= 0 && pos.x < config.gridSize[0] && pos.y < config.gridSize[1];
}

/** 读取某格的生效地块类型（tiles 覆盖优先，其次墙列表，否则 floor） */
export function tileAt(config: LevelConfig, pos: Position): TileType {
  const override = config.tiles?.[posKey(pos)];
  if (override) return override;
  if (config.walls.some((w) => samePos(w, pos))) return 'wall';
  return 'floor';
}

/** 是否为不可通行的地形（墙 / 空洞） */
export function isBlockedTerrain(config: LevelConfig, pos: Position): boolean {
  const t = tileAt(config, pos);
  return t === 'wall' || t === 'gap';
}

/** 获取某格上的物件（无则 undefined） */
export function getBoxAt(state: GameState, pos: Position): Box | undefined {
  for (const id of Object.keys(state.boxes)) {
    if (samePos(state.boxes[id].position, pos)) return state.boxes[id];
  }
  return undefined;
}

/** 获取某格上的角色 id（主角或小伙伴；无则 undefined） */
export function getActorAt(state: GameState, pos: Position): string | undefined {
  if (samePos(state.playerPos, pos)) return PLAYER_ID;
  for (const id of Object.keys(state.puppetPositions)) {
    if (samePos(state.puppetPositions[id], pos)) return id;
  }
  return undefined;
}

/** 读取角色当前位置 */
export function getActorPosition(state: GameState, actorId: string): Position {
  if (actorId === PLAYER_ID) return state.playerPos;
  return state.puppetPositions[actorId];
}

/** 写入角色位置（仅用于对「下一步状态副本」进行操作） */
export function setActorPosition(state: GameState, actorId: string, pos: Position): void {
  if (actorId === PLAYER_ID) {
    state.playerPos = { ...pos };
  } else {
    state.puppetPositions[actorId] = { ...pos };
  }
}

/** 写入物件位置（仅用于对「下一步状态副本」进行操作） */
export function setBoxPosition(state: GameState, boxId: string, pos: Position): void {
  const box = state.boxes[boxId];
  if (box) box.position = { ...pos };
}

/** 物件是否可以进入某格（墙/空洞/狭窄/其他物件/角色 均不可） */
export function canBoxEnter(state: GameState, config: LevelConfig, pos: Position): boolean {
  if (!inBounds(config, pos)) return false;
  const t = tileAt(config, pos);
  if (t === 'wall' || t === 'gap' || t === 'narrow') return false;
  if (getBoxAt(state, pos)) return false;
  if (getActorAt(state, pos)) return false;
  return true;
}

/**
 * 角色是否可以进入某格
 * - 主角：不可进狭窄通道；
 * - 小伙伴：canSqueeze = true 时可进狭窄通道；
 * - 角色之间互相阻挡。
 */
export function canActorEnter(
  state: GameState,
  config: LevelConfig,
  actorId: string,
  pos: Position,
): boolean {
  if (!inBounds(config, pos)) return false;
  const t = tileAt(config, pos);
  if (t === 'wall' || t === 'gap') return false;
  if (t === 'narrow') {
    if (actorId === PLAYER_ID) return false;
    const puppet = config.puppets.find((p) => p.id === actorId);
    if (!puppet?.canSqueeze) return false;
  }
  const occupant = getActorAt(state, pos);
  if (occupant && occupant !== actorId) return false;
  return true;
}

/** 深拷贝游戏状态（手写深拷贝，热路径不用 JSON 序列化） */
export function cloneState(state: GameState): GameState {
  const boxes: Record<string, Box> = {};
  for (const id of Object.keys(state.boxes)) {
    const b = state.boxes[id];
    boxes[id] = { id: b.id, type: b.type, position: { ...b.position } };
  }
  const puppetPositions: Record<string, Position> = {};
  for (const id of Object.keys(state.puppetPositions)) {
    puppetPositions[id] = { ...state.puppetPositions[id] };
  }
  return {
    ...state,
    playerPos: { ...state.playerPos },
    boxes,
    puppetPositions,
    history: [...state.history],
  };
}
