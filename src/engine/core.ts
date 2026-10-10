/**
 * 单步棋盘动作核心（不含计步 / 历史 / 胜负结算）
 *
 * - 对外 move() 与「求解器 / 死局检测 BFS」共用本核心，保证规则只有一份；
 * - 机关结算顺序**固定**：传送带 → 滑梯 → 弹簧 → 目标点（递归上限 5 层）。
 *   ⚠️ 顺序写错会导致组合场景行为不可预测（docs/03 3.3），此处为引擎铁律。
 */
import {
  canActorEnter,
  canBoxEnter,
  cloneState,
  getActorPosition,
  getBoxAt,
  offset,
  samePos,
  setActorPosition,
  setBoxPosition,
} from './board';
import { MAX_MECHANISM_CHAIN } from './constants';
import { resolveConveyors } from './mechanisms/conveyor';
import { resolveSlopes } from './mechanisms/slope';
import { resolveSprings } from './mechanisms/spring';
import type { Direction, GameEvent, GameState, LevelConfig, MoveResult } from './types';

/** 某物件当前是否位于星光台上 */
function onTarget(state: GameState, config: LevelConfig, boxId: string): boolean {
  const box = state.boxes[boxId];
  return config.targets.some((t) => samePos(t, box.position));
}

/** 目标点变化事件：对比动作前后，找出「刚上台 / 刚离台」的物件 */
function pushTargetEvents(
  before: GameState,
  after: GameState,
  config: LevelConfig,
  events: GameEvent[],
): void {
  for (const boxId of Object.keys(after.boxes)) {
    const was = onTarget(before, config, boxId);
    const now = onTarget(after, config, boxId);
    if (!was && now) {
      events.push({
        type: 'box_on_target',
        boxId,
        position: { ...after.boxes[boxId].position },
      });
    }
    if (was && !now) {
      events.push({
        type: 'box_left_target',
        boxId,
        position: { ...after.boxes[boxId].position },
      });
    }
  }
}

/**
 * 机关链：固定顺序（传送带 → 滑梯 → 弹簧）+ 递归上限 5 层
 * @param initialBoxIds 触发机关链的起始物件（本步被推动的物件）
 */
export function resolveMechanisms(
  state: GameState,
  config: LevelConfig,
  events: GameEvent[],
  initialBoxIds: string[],
): void {
  let pending = new Set(initialBoxIds);
  let depth = 0;

  while (pending.size > 0 && depth < MAX_MECHANISM_CHAIN) {
    const movedThisRound = new Set<string>();

    // ① 传送带优先
    resolveConveyors(state, config, events, new Set(pending), movedThisRound);
    // ② 滑梯（处理 pending + 本轮已被传送带移动的物件）
    resolveSlopes(state, config, events, new Set([...pending, ...movedThisRound]), movedThisRound);
    // ③ 弹簧（同样叠加本轮已移动的物件）
    resolveSprings(state, config, events, new Set([...pending, ...movedThisRound]), movedThisRound);

    pending = movedThisRound;
    depth += 1;
  }
}

/**
 * 纯棋盘动作核心：执行一次移动/推动 + 机关链 + 目标点事件
 * - 不含计步、历史、胜负结算（由 move() 负责）；
 * - 撞墙 / 越界 / 推不动等非法操作返回 rejected，状态不变。
 */
export function applyMoveCore(state: GameState, config: LevelConfig, dir: Direction): MoveResult {
  const actorId = state.activeActorId;
  const from = getActorPosition(state, actorId);
  const to = offset(from, dir);

  // ① 角色能否进入目标格（墙 / 空洞 / 狭窄通道 / 其他角色）
  if (!canActorEnter(state, config, actorId, to)) {
    return { state, events: [], rejected: true };
  }

  const events: GameEvent[] = [];
  const next = cloneState(state);

  // ② 目标格有物件 → 尝试推动
  const pushedBoxIds: string[] = [];
  const box = getBoxAt(state, to);
  if (box) {
    const boxTo = offset(to, dir);
    if (!canBoxEnter(state, config, boxTo)) {
      return { state, events: [], rejected: true }; // 推不动：拒绝，不扣步数
    }
    setBoxPosition(next, box.id, boxTo);
    pushedBoxIds.push(box.id);
    events.push({
      type: 'box_pushed',
      boxId: box.id,
      from: { ...to },
      to: { ...boxTo },
    });
  }

  // ③ 移动角色
  setActorPosition(next, actorId, to);
  events.push({ type: 'player_moved', from: { ...from }, to: { ...to } });

  // ④ 机关链（固定顺序 + 上限 5 层）
  resolveMechanisms(next, config, events, pushedBoxIds);

  // ⑤ 目标点状态变化（对比动作前后）
  pushTargetEvents(state, next, config, events);

  return { state: next, events, rejected: false };
}
