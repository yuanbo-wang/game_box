/**
 * 滑梯（首发机制二）
 *
 * 规则（docs/03-dev-spec.md 5.2）：
 * - 物件被推到滑梯入口格后 → 沿 slideDirection 逐格滑行；
 * - 撞墙 / 越界 → 停在最后一格；撞到另一物件 → 停在被撞物件前一格；
 * - 到达 stopAt（若配置）→ 停在该格；
 * - 物件「停在」滑梯上不会被滑走，只有被推动（本步刚移动）时才触发滑行。
 */
import { canBoxEnter, offset, samePos, setBoxPosition } from '../board';
import type { GameEvent, GameState, LevelConfig } from '../types';

/**
 * 处理滑梯机关（由 core.resolveMechanisms 调用）
 * @param candidates 本轮需要检查的物件 id
 * @param movedOut   输出：本机制实际移动的物件 id
 */
export function resolveSlopes(
  state: GameState,
  config: LevelConfig,
  events: GameEvent[],
  candidates: Set<string>,
  movedOut: Set<string>,
): void {
  for (const slope of config.slopes) {
    for (const boxId of candidates) {
      if (movedOut.has(boxId)) continue;
      const box = state.boxes[boxId];
      if (!box) continue;
      if (!samePos(box.position, slope.entry)) continue;

      // 逐格滑行（必须逐格检测，不能一次算终点：路径上每一格的可通行性都要判断）
      let cur = { ...box.position };
      while (true) {
        const nxt = offset(cur, slope.slideDirection);
        if (!canBoxEnter(state, config, nxt)) break; // 撞墙 / 越界 / 撞物件 → 停在 cur
        cur = nxt;
        if (slope.stopAt && samePos(nxt, slope.stopAt)) break; // 到达配置终点
      }

      if (!samePos(cur, box.position)) {
        events.push({
          type: 'slope_slided',
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
