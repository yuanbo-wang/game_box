import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * 文件级串行执行（fileParallelism: false）
     *
     * 原因：vitest 并行 worker 之间会向系统临时目录写"模块拉取缓存"，
     * 在受限文件系统环境（沙箱 / 代理文件系统 / 部分企业安全软件）下可能被拦截，
     * 表现为偶发的 "Unhandled Error（EPERM）" 并导致个别测试文件不被加载。
     * 本项目第 1 段测试量小（6 个文件 / 47 用例），串行执行仅增加约 2-3 秒，
     * 换取跨环境稳定复现。测试规模明显增大后可评估恢复并行（true）。
     */
    fileParallelism: false,
  },
});
