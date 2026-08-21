'use strict';
/**
 * cny-price.module.js 单元测试(node:test 内置运行器,零依赖)
 *
 * 运行:node --test tests/
 *
 * 模块在 CommonJS 环境(Node)下只导出内部函数、跳过浏览器启动逻辑,
 * 因此这里用最小全局桩(GM_* / window / Node)驱动真实模块代码,
 * 覆盖改坏后 CI 仍可能绿的高风险纯逻辑:价格解析、格式化、汇率校验与
 * 缓存、标注去重判断、页面启用范围。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'cny-price.module.js');

/** 每个用例重新加载模块,获得互不污染的 state 与 GM 存储 */
function freshLoad({ gm = {}, pathname = '/models' } = {}) {
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.GM_getValue = (key, defaultValue) => (key in gm ? gm[key] : defaultValue);
    globalThis.GM_setValue = (key, value) => { gm[key] = value; };
    globalThis.GM_xmlhttpRequest = () => {};
    globalThis.GM_registerMenuCommand = () => 1;
    globalThis.GM_unregisterMenuCommand = () => {};
    globalThis.Node = { TEXT_NODE: 3 };
    globalThis.window = { location: { pathname } };
    return require(MODULE_PATH);
}

describe('parseUsd(美元价格文本解析)', () => {
    const mod = freshLoad();

    test('整数金额', () => {
        assert.strictEqual(mod.parseUsd('$3'), 3);
    });

    test('小数金额', () => {
        assert.strictEqual(mod.parseUsd('$0.15'), 0.15);
    });

    test('千分位逗号', () => {
        assert.strictEqual(mod.parseUsd('$1,250'), 1250);
    });

    test('带前后缀文本(from $3 /M tokens)', () => {
        assert.strictEqual(mod.parseUsd('from $3 /M tokens'), 3);
    });

    test('美元符后允许空格', () => {
        assert.strictEqual(mod.parseUsd('$ 4.20'), 4.2);
    });

    test('无价格返回 null', () => {
        assert.strictEqual(mod.parseUsd('no price here'), null);
    });

    test('零与负数无效', () => {
        assert.strictEqual(mod.parseUsd('$0'), null);
        assert.strictEqual(mod.parseUsd('$-5'), null);
    });
});

describe('formatCny(人民币格式化)', () => {
    const mod = freshLoad();
    mod.applyRate(7.2, '测试');

    test('小额保留两位小数', () => {
        assert.strictEqual(mod.formatCny(0.15), '≈¥1.08');
    });

    test('中额一位小数', () => {
        assert.strictEqual(mod.formatCny(15), '≈¥108.0');
    });

    test('大额取整', () => {
        assert.strictEqual(mod.formatCny(200), '≈¥1440');
    });

    test('极小额保留 3 位有效数字', () => {
        assert.strictEqual(mod.formatCny(0.001), '≈¥0.0072');
    });

    test('非正结果返回 null', () => {
        assert.strictEqual(mod.formatCny(0), null);
    });
});

describe('applyRate(汇率校验与生效)', () => {
    test('接受合理汇率并更新 state', () => {
        const mod = freshLoad();
        assert.strictEqual(mod.applyRate(7.25, 'Yahoo'), true);
        assert.strictEqual(mod.state.rate, 7.25);
        assert.strictEqual(mod.state.rateSource, 'Yahoo');
    });

    test('拒绝 0、负数、NaN 与 >=100 的值', () => {
        const mod = freshLoad();
        for (const bad of [0, -1, NaN, 100, 150]) {
            assert.strictEqual(mod.applyRate(bad, 'x'), false);
        }
    });
});

describe('loadCachedRate/saveRateCache(汇率缓存)', () => {
    test('保存后可读回', () => {
        const mod = freshLoad();
        mod.saveRateCache(7.19);
        const cache = mod.loadCachedRate();
        assert.strictEqual(cache.usdCny, 7.19);
        assert.strictEqual(typeof cache.ts, 'number');
    });

    test('缓存损坏时返回 null 而不是抛错', () => {
        const mod = freshLoad({ gm: { cny_rate_cache: '{broken json' } });
        assert.strictEqual(mod.loadCachedRate(), null);
    });
});

describe('isMarked(去重标记检测)', () => {
    const mod = freshLoad();

    test('已标注的文本节点', () => {
        const node = { nextSibling: { nodeType: 3, data: ' ≈¥1.08' } };
        assert.strictEqual(mod.isMarked(node), true);
    });

    test('兄弟节点不是 ≈¥ 文本', () => {
        const node = { nextSibling: { nodeType: 3, data: ' other' } };
        assert.ok(!mod.isMarked(node));
    });

    test('无兄弟节点', () => {
        // 短路求值返回 null 等假值;生产中仅在布尔上下文使用
        assert.ok(!mod.isMarked({ nextSibling: null }));
    });

    test('兄弟节点是元素而非文本', () => {
        const node = { nextSibling: { nodeType: 1, data: '' } };
        assert.ok(!mod.isMarked(node));
    });
});

describe('priceEnabledHere(页面启用范围)', () => {
    test('/models 默认启用', () => {
        const mod = freshLoad({ pathname: '/models' });
        assert.strictEqual(mod.priceEnabledHere(), true);
    });

    test('/chat 不启用', () => {
        const mod = freshLoad({ pathname: '/chat/c/abc' });
        assert.strictEqual(mod.priceEnabledHere(), false);
    });

    test('/fusion 不启用', () => {
        const mod = freshLoad({ pathname: '/fusion' });
        assert.strictEqual(mod.priceEnabledHere(), false);
    });

    test('菜单关闭后一律不启用', () => {
        const mod = freshLoad({ pathname: '/models' });
        mod.state.enabled = false;
        assert.strictEqual(mod.priceEnabledHere(), false);
    });
});

test('Node 环境加载模块只导出测试接口,不触发启动副作用', () => {
    const mod = freshLoad();
    assert.strictEqual(typeof mod.parseUsd, 'function');
    assert.strictEqual(typeof mod.formatCny, 'function');
    assert.ok(Number.isFinite(mod.state.rate));
});
