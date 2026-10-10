/**
 * 撤销（v4.0 步数锁死）与序列化测试
 */
import { describe, expect, it } from 'vitest';
import {
  createState,
  deserialize,
  deserializeBoard,
  move,
  serialize,
  serializeBoard,
  undo,
} from '../../src/engine';
import { levelOnePush, levelRoom, levelRoomTight } from './fixtures';

describe('撤销（v4.0 步数锁死）', () => {
  it('撤销恢复棋盘位置，但步数保持不变（核心语义）', () => {
    const cfg = levelRoom();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state; // 1：推 B 到 (3,1)，P 到 (3,2)
    s = move(s, cfg, 'right').state; // 2：P 到 (4,2)
    expect(s.steps).toBe(2);

    const r = undo(s, cfg);
    expect(r.rejected).toBe(false);
    expect(r.state.playerPos).toEqual({ x: 3, y: 2 }); // 棋盘回退一步
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 1 });
    expect(r.state.steps).toBe(2); // ⚠️ 步数不返还
    expect(r.events).toContainEqual({ type: 'undo_performed', steps: 2 });
  });

  it('连续撤销到初始棋盘，步数保持累加值', () => {
    const cfg = levelRoom();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state;
    s = move(s, cfg, 'right').state;
    s = undo(s, cfg).state;
    s = undo(s, cfg).state;
    expect(s.playerPos).toEqual({ x: 3, y: 3 }); // 回到初始位置
    expect(s.boxes['b1'].position).toEqual({ x: 3, y: 2 });
    expect(s.steps).toBe(2); // 步数保持累加值，不回升
    expect(s.history.length).toBe(0);
  });

  it('无历史时撤销被拒绝', () => {
    const cfg = levelRoom();
    const s0 = createState(cfg);
    const r = undo(s0, cfg);
    expect(r.rejected).toBe(true);
    expect(r.state).toBe(s0);
  });

  it('失败态下撤销被拒绝（失败后需 revive）', () => {
    const cfg = levelRoomTight();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state;
    expect(s.failed).toBe(true);
    const r = undo(s, cfg);
    expect(r.rejected).toBe(true);
  });

  it('胜利态下撤销被拒绝', () => {
    const cfg = levelOnePush();
    let s = createState(cfg);
    s = move(s, cfg, 'right').state;
    expect(s.won).toBe(true);
    const r = undo(s, cfg);
    expect(r.rejected).toBe(true);
  });
});

describe('序列化', () => {
  it('serializeBoard / deserializeBoard 往返一致', () => {
    const cfg = levelRoom();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state;
    const snap = serializeBoard(s);
    const restored = deserializeBoard(snap, s);
    expect(restored.playerPos).toEqual(s.playerPos);
    expect(restored.boxes['b1'].position).toEqual(s.boxes['b1'].position);
    expect(restored.steps).toBe(s.steps); // 快照不含步数 → 保持 current 值
    expect(restored.stepBudget).toBe(s.stepBudget);
    expect(restored.history).toEqual(s.history);
  });

  it('棋盘快照不含步数字段（v4.0：步数不属于可回退数据）', () => {
    const cfg = levelRoom();
    const s0 = createState(cfg);
    const parsed = JSON.parse(serializeBoard(s0)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['a', 'b', 'p', 'u']);
  });

  it('serialize / deserialize 完整状态往返一致', () => {
    const cfg = levelRoom();
    let s = createState(cfg);
    s = move(s, cfg, 'up').state;
    const restored = deserialize(serialize(s));
    expect(restored.steps).toBe(s.steps);
    expect(restored.playerPos).toEqual(s.playerPos);
    expect(restored.boxes['b1'].position).toEqual(s.boxes['b1'].position);
    expect(restored.history).toEqual(s.history);
  });
});
