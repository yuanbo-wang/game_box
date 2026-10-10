/**
 * 基础移动与推动测试（对应 docs/04 2.2 必测清单）
 */
import { describe, expect, it } from 'vitest';
import { createState, move, parseLevel, switchActor } from '../../src/engine';
import { levelOnePush, levelPuppet, levelRoom } from './fixtures';

describe('基础移动与推动', () => {
  it('撞墙时拒绝移动，状态不变（不可变性）', () => {
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    // P(1,1) 向上是墙 (1,0)
    const r = move(s0, cfg, 'up');
    expect(r.rejected).toBe(true);
    expect(r.state).toBe(s0); // 引用相等：非法操作返回原状态
    expect(s0.playerPos).toEqual({ x: 1, y: 1 });
    expect(s0.steps).toBe(0);
  });

  it('越界移动被拒绝', () => {
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    // P(1,1) 向左是墙 (0,1)，等价越界语义
    const r = move(s0, cfg, 'left');
    expect(r.rejected).toBe(true);
    expect(r.state).toBe(s0);
  });

  it('推动物件产生 box_pushed 事件，物件与角色各移动一格，步数 +1', () => {
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'right'); // P 把 B 从 (2,1) 推到 (3,1) 星光台
    expect(r.rejected).toBe(false);
    expect(r.events).toContainEqual({
      type: 'box_pushed',
      boxId: 'b1',
      from: { x: 2, y: 1 },
      to: { x: 3, y: 1 },
    });
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 1 });
    expect(r.state.playerPos).toEqual({ x: 2, y: 1 });
    expect(r.state.steps).toBe(1);
  });

  it('物件推到目标点产生 box_on_target 事件', () => {
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'right');
    expect(r.events.some((e) => e.type === 'box_on_target' && e.boxId === 'b1')).toBe(true);
  });

  it('全部物件归位时判定胜利（level_won，且不含 level_failed）', () => {
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'right');
    expect(r.state.won).toBe(true);
    expect(r.state.failed).toBe(false);
    expect(r.events.some((e) => e.type === 'level_won')).toBe(true);
    expect(r.events.some((e) => e.type === 'level_failed')).toBe(false);
  });

  it('一步只能推一个物件：箱后还有箱时拒绝', () => {
    // 手工构造：B1(2,1) 被推到 (3,1) 时 (3,1) 已有 B2
    const cfg = levelOnePush();
    const s0 = createState(cfg);
    s0.boxes['b2'] = { id: 'b2', type: 'generic', position: { x: 3, y: 1 } };
    const r = move(s0, cfg, 'right');
    expect(r.rejected).toBe(true);
    expect(r.state).toBe(s0);
  });

  it('非法操作不消耗步数（撞墙后 steps 保持 0）', () => {
    const cfg = levelRoom();
    const s0 = createState(cfg);
    const r = move(s0, cfg, 'down'); // P(3,3) 向下 (3,4) 是墙
    expect(r.rejected).toBe(true);
    expect(s0.steps).toBe(0);
  });

  it('move() 不修改入参状态（纯函数）', () => {
    const cfg = levelRoom();
    const s0 = createState(cfg);
    const before = JSON.stringify(s0);
    move(s0, cfg, 'right');
    move(s0, cfg, 'up');
    expect(JSON.stringify(s0)).toBe(before);
  });

  it('物件离开目标点产生 box_left_target 事件', () => {
    const cfg = parseLevel(['######', '#.oBP#', '######'], { optimalSteps: 1, maxSteps: 5 });
    const s0 = createState(cfg);
    s0.boxes['b1'].position = { x: 2, y: 1 }; // 把箱子摆到星光台上
    s0.playerPos = { x: 1, y: 1 };
    const r = move(s0, cfg, 'right'); // 把箱子从台上推走
    expect(r.rejected).toBe(false);
    expect(r.state.boxes['b1'].position).toEqual({ x: 3, y: 1 });
    expect(r.events.some((e) => e.type === 'box_left_target' && e.boxId === 'b1')).toBe(true);
  });
});

describe('小伙伴与狭窄通道（v1.0 预置能力）', () => {
  it('切换角色不消耗步数，并产生 actor_switched 事件', () => {
    const cfg = levelPuppet();
    const s0 = createState(cfg);
    const r = switchActor(s0, cfg, 'rabbit');
    expect(r.rejected).toBe(false);
    expect(r.state.activeActorId).toBe('rabbit');
    expect(r.state.steps).toBe(0); // 切换不耗步
    expect(r.events).toContainEqual({ type: 'actor_switched', from: 'player', to: 'rabbit' });
  });

  it('主角不能进狭窄通道，小伙伴（canSqueeze）可以', () => {
    const cfg = levelPuppet();
    cfg.tiles = { '2,2': 'narrow' };
    const s0 = createState(cfg);
    s0.playerPos = { x: 2, y: 1 }; // 主角在狭窄通道上方
    const rPlayer = move(s0, cfg, 'down');
    expect(rPlayer.rejected).toBe(true); // 主角不可通过

    const s1 = createState(cfg);
    s1.activeActorId = 'rabbit';
    s1.puppetPositions['rabbit'] = { x: 3, y: 2 };
    const r1 = move(s1, cfg, 'left'); // 兔子 (3,2) → (2,2) 狭窄通道
    expect(r1.rejected).toBe(false);
    expect(r1.state.puppetPositions['rabbit']).toEqual({ x: 2, y: 2 });
  });
});
