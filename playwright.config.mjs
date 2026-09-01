// Playwright E2E 冒烟测试配置
// - 断言不依赖固定模型/价格/页面文案,只依赖引擎自身的稳定标识与结构性中文节点
// - 本地复跑可设 PLAYWRIGHT_CHANNEL=msedge-dev 用已装的 Edge Dev,避免下载 chromium
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    timeout: 180_000,
    expect: { timeout: 60_000 },
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'https://openrouter.ai',
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        headless: true,
        viewport: { width: 1440, height: 900 },
        locale: 'en-US',
        actionTimeout: 30_000,
        navigationTimeout: 60_000,
    },
    outputDir: './test-results',
});
