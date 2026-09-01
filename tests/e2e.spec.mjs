/**
 * E2E 冒烟测试(定位:冒烟,不承担完整功能测试)
 *
 * 注入方式:page.addInitScript 以 document-start 语义注入仓库构建产物,
 * 与用户脚本管理器的实际注入时序一致。
 *
 * 断言纪律(OpenRouter 为动态站点,严禁脆弱断言):
 *   - 不依赖固定模型、固定价格或固定页面文案
 *   - 只用结构性中文节点计数 + 引擎自身日志/属性等稳定标识
 *   - ≈¥ 参考价不断言具体金额,只断言存在与格式合法
 *   - 汇率服务不可用时引擎自身回落默认汇率,价格标记仍会出现,测试不因汇率失败
 */
import { test, expect } from '@playwright/test';

test('冒烟:/models 注入脚本后出现关键中文节点与 ≈¥ 参考价', async ({ page }) => {
    const logs = [];
    page.on('console', (m) => logs.push(m.text()));
    page.on('pageerror', (e) => logs.push('PAGEERROR: ' + String(e)));

    // ① 先注入最小 GM_* 垫片:datou 引擎对部分 API 是直接引用(在脚本管理器内必然存在,
    //    裸页面没有),垫片模拟脚本管理器环境;GM_xmlhttpRequest 特意不给——
    //    cny 模块有 try/catch,会走默认汇率兜底,恰好验证汇率容错路径
    await page.addInitScript(() => {
        const store = Object.create(null);
        window.GM_getValue = (k, d) => (k in store ? store[k] : d);
        window.GM_setValue = (k, v) => { store[k] = v; };
        window.GM_registerMenuCommand = () => 0;
        window.GM_unregisterMenuCommand = () => {};
        window.GM_info = { script: { version: 'e2e-shim' } };
    });
    // ② document-start 语义注入构建产物(与用户脚本管理器时序一致)
    await page.addInitScript({ path: 'openrouter-chinese-plus.user.js' });
    await page.goto('/models', { waitUntil: 'domcontentloaded' });

    // 1) 引擎加载日志:证明脚本注入、词库解析成功
    await expect
        .poll(() => logs.some((t) => t.includes('[OpenRouter 中文化插件] 脚本 v')), { timeout: 30_000 })
        .toBe(true);

    // 2) 关键中文节点:页面内出现足够数量的中文(站内默认无中文,出现即为本脚本产出;
    //    只看数量不看具体文案)
    await expect
        .poll(
            async () =>
                page.evaluate(() => (document.body.innerText.match(/[\u4e00-\u9fa5]/g) || []).length),
            { timeout: 60_000 }
        )
        .toBeGreaterThan(30);

    // 3) 人民币参考价:引擎自有的稳定属性标记;汇率服务失败时模块回落默认汇率,标记仍出现
    await expect
        .poll(async () => page.locator('[data-openrouter-cny]').count(), { timeout: 60_000 })
        .toBeGreaterThan(5);

    // 4) 人民币格式合法(≈¥ + 数字),不断言具体金额
    const sample = (await page.locator('[data-openrouter-cny]').first().innerText()).trim();
    expect(sample).toMatch(/≈\s*¥\s*[\d.]/);

    // 截图产出为 CI artifact(不进 README)
    await page.screenshot({ path: 'test-results/e2e-models.png' });
});
