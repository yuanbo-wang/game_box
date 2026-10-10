/**
 * 彩虹传送带（首发机制一）
 *
 * 规则（docs/03-dev-spec.md 5.1）：
 * - 物件被推到传送带上 → 自动沿 path 运送至最后一个格子 → 朝 exitDirection 再推进一格（若可推进）；
 * - 只对「本步刚被移动的物件」触发（静止在传送带上的物件不触发）；
 * - 连锁：物件传送后可能落到另一条传送带上 → 由 core 的机关链循环处理（递归上限 5 层）；
 * - 终点被占用：若出口格有墙 / 物件，物件停在传送带末端（视为「堵塞」）。
 */
import { canBoxEnter, offset, samePos, setBoxPosition } from '../board';
import type { ConveyorConfig, GameEvent, GameState, LevelConfig, Position } from '../types';

/** 物件是否位于该传送带的路径上 */
function isOnPath(pos: Position, conveyor: ConveyorConfig): boolean {
  return conveyor.path.some((p) => samePos(p, pos));
}

/**
 * 计算物件被传送带运送的目的地
 * @returns 目的地坐标；物件应停在原地（末端且出口堵塞）时返回 null
 */
export function computeConveyorDest(
  state: GameState,
  config: LevelConfig,
  conveyor: ConveyorConfig,
  boxId: string,
): Position | null {
  const box = state.boxes[boxId];
  const end = conveyor.path[conveyor.path.length - 1];
  const exitCell = offset(end, conveyor.exitDirection);

  // 出口可推进 → 送到出口方向下一格
  if (canBoxEnter(state, config, exitCell)) {
    return samePos(box.position, exitCell) ? null : exitCell;
  }
  // 出口被堵 → 停在传送带末端（若已停在末端则不动）
  return samePos(box.position, end) ? null : end;
}

/**
 * 处理传送带机关（由 core.resolveMechanisms 调用）
 * @param candidates 本轮需要检查的物件 id（「刚被移动过」的物件）
 * @param movedOut   输出：本机制实际移动的物件 id（供后续机关链继续传递）
 */
export function resolveConveyors(
  state: GameState,
  config: LevelConfig,
  events: GameEvent[],
  candidates: Set<string>,
  movedOut: Set<string>,
): void {
  for (const conveyor of config.conveyors) {
    for (const boxId of candidates) {
      if (movedOut.has(boxId)) continue;
      const box = state.boxes[boxId];
      if (!box) continue;
      if (!isOnPath(box.position, conveyor)) continue;

      const dest = computeConveyorDest(state, config, conveyor, boxId);
      if (!dest) continue;

      events.push({
        type: 'conveyor_activated',
        boxId,
        path: [...conveyor.path.map((p) => ({ ...p })), { ...dest }],
      });
      setBoxPosition(state, boxId, dest);
      movedOut.add(boxId);
    }
  }
}
