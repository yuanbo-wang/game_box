/**
 * 切换操控角色（主角 ↔ 小伙伴，v1.0）
 *
 * - 切换**不消耗步数**（否则玩家会为了省步数而不切换，破坏玩法）；
 * - 胜利 / 失败态下拒绝；目标角色不存在时拒绝。
 */
import { PLAYER_ID } from './constants';
import type { GameState, LevelConfig, MoveResult } from './types';

/**
 * 切换当前操控角色
 * @param actorId 目标角色 id（'player' 或小伙伴 id）
 */
export function switchActor(state: GameState, config: LevelConfig, actorId: string): MoveResult {
  // 参数 config 预留（未来可做角色可用性校验）；当前仅依赖状态
  void config;

  if (state.won || state.failed) return { state, events: [], rejected: true };
  if (actorId === state.activeActorId) return { state, events: [], rejected: true };
  if (actorId !== PLAYER_ID && !state.puppetPositions[actorId]) {
    return { state, events: [], rejected: true };
  }

  return {
    state: { ...state, activeActorId: actorId },
    events: [{ type: 'actor_switched', from: state.activeActorId, to: actorId }],
    rejected: false,
  };
}
