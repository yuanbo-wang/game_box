/**
 * 序列化工具
 *
 * 两种粒度：
 * 1. serializeBoard / deserializeBoard —— 棋盘快照（撤销栈专用）：
 *    ⚠️ v4.0 只包含棋盘数据（角色 / 物件位置），不包含 steps / stepBudget / won / failed。
 *    原因：撤销不返还步数，步数不属于可回退的数据；同时省内存。
 * 2. serialize / deserialize —— 完整状态（存档 / 每日赛成绩校验用）。
 */
import type { Box, GameState, Position } from './types';

/** 棋盘快照的 JSON 结构（字段名做短化，减少撤销栈内存占用） */
interface BoardSnapshot {
  /** 主角位置 [x, y] */
  p: [number, number];
  /** 当前操控角色 id */
  a: string;
  /** 物件位置 { id: [x, y] } */
  b: Record<string, [number, number]>;
  /** 小伙伴位置 { id: [x, y] } */
  u: Record<string, [number, number]>;
}

/**
 * 序列化棋盘快照（撤销栈专用）
 * 输出稳定：物件/小伙伴按 id 排序，保证同一棋盘 → 同一字符串（可用于 BFS 去重）。
 */
export function serializeBoard(state: GameState): string {
  const boxes: Record<string, [number, number]> = {};
  for (const id of Object.keys(state.boxes).sort()) {
    const pos = state.boxes[id].position;
    boxes[id] = [pos.x, pos.y];
  }
  const puppets: Record<string, [number, number]> = {};
  for (const id of Object.keys(state.puppetPositions).sort()) {
    const pos = state.puppetPositions[id];
    puppets[id] = [pos.x, pos.y];
  }
  const snapshot: BoardSnapshot = {
    p: [state.playerPos.x, state.playerPos.y],
    a: state.activeActorId,
    b: boxes,
    u: puppets,
  };
  return JSON.stringify(snapshot);
}

/**
 * 反序列化棋盘快照：在 current 的基础上恢复棋盘数据
 * （steps / stepBudget / won / failed / history 均保持 current 的值）
 */
export function deserializeBoard(raw: string, current: GameState): GameState {
  const data = JSON.parse(raw) as BoardSnapshot;
  const boxes: Record<string, Box> = {};
  for (const id of Object.keys(data.b)) {
    const [x, y] = data.b[id];
    boxes[id] = { ...current.boxes[id], position: { x, y } };
  }
  const puppetPositions: Record<string, Position> = {};
  for (const id of Object.keys(data.u)) {
    const [x, y] = data.u[id];
    puppetPositions[id] = { x, y };
  }
  return {
    ...current,
    playerPos: { x: data.p[0], y: data.p[1] },
    activeActorId: data.a,
    boxes,
    puppetPositions,
  };
}

/** 序列化完整状态（存档 / 成绩校验） */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** 反序列化完整状态 */
export function deserialize(raw: string): GameState {
  return JSON.parse(raw) as GameState;
}
