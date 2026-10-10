/**
 * 引擎层统一出口
 *
 * 铁律：本目录零 Phaser 依赖，可在 Node 环境完整单测（docs/03 第二章）。
 * 引擎 API：createState / move / checkWin / getHint* / serialize / undo / revive /
 *           detectDeadlock / computeOptimalSteps / switchActor
 * （* getHint 属逻辑层增强，第 1 段暂未纳入）
 */
export * from './types';
export * from './constants';
export * from './board';
export * from './serialize';
export * from './createState';
export * from './checkWin';
export * from './core';
export * from './move';
export * from './undo';
export * from './revive';
export * from './switchActor';
export * from './deadlock';
export * from './solver';
export * from './level';
