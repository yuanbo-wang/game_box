/**
 * 弹簧格（首发机制二）
 *
 * 规则（docs/03-dev-spec.md 5.2）：
 * - 物件被「踩到」（玩家推入）或物件落到弹簧上 → 沿 direction 弹射 power 格；
 * - 弹射路径上遇阻（墙 / 空洞 / 物件）则停在阻挡物前；
 * - 与滑梯一致：停在弹簧上的物件不触发，只有被移动时触发。
 */
import { canBoxEnter, offset, samePos, setBoxPosition } from '../board';
import type { GameEvent, GameState, LevelConfig } from '../types';

/**
 * 处理弹簧机关（由 core.resolveMechanisms 调用）
 * @param candidates 本轮需要检查的物件 id
 * @param movedOut   输出：本机制实际移动的物件 id
 */
export function resolveSprings(
  state: GameState,
  config: LevelConfig,
  events: GameEvent[],
  candidates: Set<string>,
  movedOut: Set<string>,
): void {
  for (const spring of config.springs) {
    for (const boxId of candidates) {
      if (movedOut.has(boxId)) continue;
      const box = state.boxes[boxId];
      if (!box) continue;
      if (!samePos(box.position, spring.position)) continue;

      // 沿方向逐格弹射，最多 power 格；遇阻停在被阻前
      let cur = { ...box.position };
      for (let i = 0; i < spring.power; i++) {
        const nxt = offset(cur, spring.direction);
        if (!canBoxEnter(state, config, nxt)) break;
        cur = nxt;
      }

      if (!samePos(cur, box.position)) {
        events.push({
          type: 'spring_bounced',
          boxId,
          from: { ...box.position },
          to: { ...cur },
        });
        setBoxPosition(state, boxId, cur);
        movedOut.add(boxId);
      }
    }
  }
}
