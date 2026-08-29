'use strict';
/**
 * cny-price.module.js 单元测试(node:test 内置运行器,零依赖)
 *
 * 运行:node --test tests/cny-price.test.cjs
 *
 * 模块在 CommonJS 环境(Node)下只导出内部函数、跳过浏览器启动逻辑,
 * 因此这里用最小全局桩(GM_* / window / Node)驱动真实模块代码。
 * 覆盖两类高风险逻辑:
 *   1. 纯函数:价格解析、格式化、汇率校验与缓存、页面启用范围;
 *   2. SPA 生命周期(最小伪 DOM):标注生成带 data-openrouter-cny 的 span、
 *      路由进入 /chat|/fusion 后旧标记被清除、切回后恢复、
 *      清理只删本模块节点不碰页面原生同形文本、价格更新后标记刷新。
 */
const { test, describe, afterAll } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', 'cny-price.module.js');

/**
 * 每个用例重新加载模块,获得互不污染的 state 与 GM 存储。
 * dom 传入伪 DOM 时模块会执行真实启动路径(initCny),用于生命周期测试。
 */
function freshLoad({ gm = {}, pathname = '/models', dom = null } = {}) {
    delete require.cache[require.resolve(MODULE_PATH)];
    globalThis.GM_getValue = (key, defaultValue) => (key in gm ? gm[key] : defaultValue);
    globalThis.GM_setValue = (key, value) => { gm[key] = value; };
    globalThis.GM_xmlhttpRequest = () => {};
    globalThis.GM_registerMenuCommand = () => 1;
    globalThis.GM_unregisterMenuCommand = () => {};
    globalThis.Node = { TEXT_NODE: 3 };
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.MutationObserver = class { observe() {} };
    if (dom) {
        globalThis.window = dom.window;
        globalThis.document = dom.document;
    } else {
        globalThis.window = { location: { pathname } };
        delete globalThis.document; // 上一个用例可能注入过,必须清掉
    }
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
    const attr = mod.MARK_ATTR;

    test('已标注:紧邻兄弟是本模块标记元素', () => {
        const node = { nextSibling: { nodeType: 1, hasAttribute: (k) => k === attr } };
        assert.strictEqual(mod.isMarked(node), true);
    });

    test('裸 ≈¥ 文本兄弟不再视为标注(旧式同形误判已移除)', () => {
        const node = { nextSibling: { nodeType: 3, data: ' ≈¥1.08' } };
        assert.strictEqual(mod.isMarked(node), false);
    });

    test('无兄弟节点返回假值', () => {
        // 短路求值返回 undefined 等假值;生产中仅在布尔上下文使用
        assert.ok(!mod.isMarked({ nextSibling: null }));
    });

    test('普通元素兄弟不视为标注', () => {
        const node = { nextSibling: { nodeType: 1, hasAttribute: () => false } };
        assert.strictEqual(mod.isMarked(node), false);
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

/**
 * 最小伪 DOM:只实现模块实际用到的能力——
 * TreeWalker 深度优先遍历文本节点、closest(SKIP_SELECTOR)、
 * insertBefore/appendChild/lastChild、querySelectorAll([attr])、remove。
 */
function makeFakeDom() {
    let uid = 0;

    function matchesSkip(node, selector) {
        return selector.split(',').some((raw) => {
            const part = raw.trim();
            if (part.startsWith('[')) {
                const m = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
                if (!m) return false;
                if (!(m[1] in node._attrs)) return false;
                return m[2] === undefined || node._attrs[m[1]] === m[2];
            }
            return node.tagName === part.toLowerCase();
        });
    }

    function makeNode(type, tagOrData) {
        const node = type === 1
            ? { nodeType: 1, tagName: tagOrData.toLowerCase(), _attrs: {} }
            : { nodeType: 3, data: tagOrData };
        node._children = [];
        node._uid = ++uid;
        node.parent = null;
        Object.defineProperty(node, 'firstChild', {
            get() { return this._children[0] || null; },
        });
        Object.defineProperty(node, 'lastChild', {
            get() { return this._children[this._children.length - 1] || null; },
        });
        Object.defineProperty(node, 'nextSibling', {
            get() {
                if (!this.parent) return null;
                const i = this.parent._children.indexOf(this);
                return this.parent._children[i + 1] || null;
            },
        });
        Object.defineProperty(node, 'parentElement', {
            get() { return this.parent && this.parent.nodeType === 1 ? this.parent : null; },
        });
        Object.defineProperty(node, 'parentNode', {
            get() { return this.parent; },
        });
        node.setAttribute = (k, v) => { node._attrs[k] = String(v); };
        node.hasAttribute = (k) => k in node._attrs;
        node.appendChild = (c) => { c.parent = node; node._children.push(c); return c; };
        node.insertBefore = (c, ref) => {
            c.parent = node;
            const i = ref ? node._children.indexOf(ref) : -1;
            if (i === -1) node._children.push(c);
            else node._children.splice(i, 0, c);
            return c;
        };
        node.remove = () => {
            if (!node.parent) return;
            const i = node.parent._children.indexOf(node);
            if (i !== -1) node.parent._children.splice(i, 1);
            node.parent = null;
        };
        node.closest = (selector) => {
            let cur = node;
            while (cur) {
                if (cur.nodeType === 1 && matchesSkip(cur, selector)) return cur;
                cur = cur.parent;
            }
            return null;
        };
        return node;
    }

    function collect(root, filter) {
        const out = [];
        (function walk(n) {
            for (const c of n._children) {
                if (filter(c)) out.push(c);
                if (c.nodeType === 1) walk(c);
            }
        })(root);
        return out;
    }

    const body = makeNode(1, 'body');
    const document = {
        // 'loading' 让模块的自动启动挂起在 DOMContentLoaded 上(伪 DOM 永不触发),
        // 从而不创建 MutationObserver 与周期定时器;被测函数全部手动调用
        readyState: 'loading',
        body,
        createElement: (tag) => makeNode(1, tag),
        createTextNode: (data) => makeNode(3, data),
        createTreeWalker: (root) => {
            const list = collect(root, (n) => n.nodeType === 3);
            let i = 0;
            return { nextNode: () => list[i++] || null };
        },
        querySelectorAll: (sel) => {
            const m = sel.match(/^\[([^\]]+)\]$/);
            if (!m) throw new Error(`伪 DOM 未实现的查询: ${sel}`);
            return collect(body, (n) => n.nodeType === 1 && m[1] in n._attrs);
        },
        addEventListener: () => {},
    };

    return { document, window: { location: { pathname: '/models' } }, body };
}

describe('SPA 路由与标记生命周期(最小伪 DOM)', () => {
    const dom = makeFakeDom();
    const mod = freshLoad({ dom });
    mod.applyRate(7.2, '测试');
    const attr = mod.MARK_ATTR;

    const p = dom.document.createElement('p');
    const priceText = dom.document.createTextNode('$0.15');
    p.appendChild(priceText);
    dom.body.appendChild(p);

    test('启用页扫描后生成带标记的参考价 span', () => {
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);
        const mark = p._children[1];
        assert.ok(mark.hasAttribute(attr));
        assert.strictEqual(mark.textContent, ' ≈¥1.08');
        assert.strictEqual(mod.isMarked(priceText), true);
    });

    test('路由进入 /chat 后残留标记被清除', () => {
        dom.window.location.pathname = '/chat/c/abc';
        mod.rescanAll();
        assert.strictEqual(dom.document.querySelectorAll(`[${attr}]`).length, 0);
        assert.strictEqual(p._children.length, 1); // 只剩原始价格文本
    });

    test('路由切回 /models 后重新标注', () => {
        dom.window.location.pathname = '/models';
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);
        assert.strictEqual(p._children[1].textContent, ' ≈¥1.08');
    });

    test('价格数字更新后标记同步刷新而非重复添加', () => {
        priceText.data = '$0.30';
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);
        assert.strictEqual(p._children[1].textContent, ' ≈¥2.16');
    });

    test('菜单关闭只删除本模块标记,页面原生 ≈¥ 文本不受影响', () => {
        const nativeP = dom.document.createElement('p');
        nativeP.appendChild(dom.document.createTextNode('≈¥123'));
        dom.body.appendChild(nativeP);

        mod.state.enabled = false;
        mod.rescanAll();
        assert.strictEqual(dom.document.querySelectorAll(`[${attr}]`).length, 0);
        assert.strictEqual(p._children.length, 1);          // 本模块标记已删
        assert.strictEqual(nativeP._children.length, 1);     // 原生文本原样保留
        assert.strictEqual(nativeP._children[0].data, '≈¥123');

        mod.state.enabled = true;
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);           // 重新启用后恢复标注
    });

    test('跳过容器内的价格不标注', () => {
        const codeEl = dom.document.createElement('code');
        codeEl.appendChild(dom.document.createTextNode('$9.99'));
        dom.body.appendChild(codeEl);
        mod.rescanAll();
        assert.strictEqual(codeEl._children.length, 1);
    });
});

describe('双价文本与孤儿标记链(pruneOrphanMarks 回收)', () => {
    /** 每个用例独立伪 DOM + 独立模块实例 */
    function setup() {
        const dom = makeFakeDom();
        const mod = freshLoad({ dom });
        mod.applyRate(7.2, '测试');
        return { dom, mod };
    }

    test('同一文本节点含两个美元价时逐个标注', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        p.appendChild(dom.document.createTextNode('$3 /M input · $15 /M output'));
        dom.body.appendChild(p);
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3); // 价格文本 + 两个标记
        assert.strictEqual(p._children[1].textContent, ' ≈¥21.60');
        assert.strictEqual(p._children[2].textContent, ' ≈¥108.0');
    });

    test('价格数量变少时多余标记被移除', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        const priceText = p.appendChild(dom.document.createTextNode('$3 /M input · $15 /M output'));
        dom.body.appendChild(p);
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3);

        priceText.data = '$3 /M input';
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);
        assert.strictEqual(p._children[1].textContent, ' ≈¥21.60');
    });

    test('多标记链的锚点(价格文本)被 React 移除后整条链回收', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        const priceText = p.appendChild(dom.document.createTextNode('$3 · $15'));
        dom.body.appendChild(p);
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3);

        priceText.remove();
        mod.rescanAll();
        assert.strictEqual(p._children.length, 0);
    });

    test('多标记链中间节点不因前驱是标记而误删', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        p.appendChild(dom.document.createTextNode('$3 · $15'));
        dom.body.appendChild(p);
        mod.rescanAll();
        // 第二个标记的前驱是第一个标记(链内节点),必须保留
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3);
        assert.strictEqual(p._children[2].textContent, ' ≈¥108.0');
    });
});

describe('手动汇率存量值防护', () => {
    test('存储的手动汇率是非数字时回退默认值而不是 NaN', () => {
        const mod = freshLoad({ gm: { cny_manual_rate: 'not-a-number', cny_rate_mode: 'manual' } });
        assert.strictEqual(mod.state.manualRate, 7.2);
        // 无效手动值不应卡死在 NaN 汇率上:applyRate 拒绝 NaN,initRate 回退自动
        assert.strictEqual(mod.state.rate > 0, true);
    });

    test('存储的手动汇率超范围时回退默认值', () => {
        const mod = freshLoad({ gm: { cny_manual_rate: 500, cny_rate_mode: 'manual' } });
        assert.strictEqual(mod.state.manualRate, 7.2);
    });
});

describe('pruneOrphanMarks(孤儿标记回收)', () => {
    /** 每个用例独立伪 DOM + 独立模块实例 */
    function setup() {
        const dom = makeFakeDom();
        const mod = freshLoad({ dom });
        mod.applyRate(7.2, '测试');
        return { dom, mod };
    }

    test('React 删除价格节点后,失锚标记在下次扫描被回收', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        const priceText = dom.document.createTextNode('$0.15');
        p.appendChild(priceText);
        dom.body.appendChild(p);
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2); // [$0.15, mark]

        // React 直接移除作为锚点的价格文本节点(它不知道标记的存在)
        priceText.remove();
        mod.rescanAll();
        assert.strictEqual(p._children.length, 0);
        assert.strictEqual(dom.document.querySelectorAll(`[${mod.MARK_ATTR}]`).length, 0);
    });

    test('React 把价格换成非价格文本,旧标记回收且不会重复出现双份 ≈¥', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        const priceText = dom.document.createTextNode('$0.15');
        p.appendChild(priceText);
        dom.body.appendChild(p);
        mod.rescanAll();

        // React 原地替换:旧价格节点删掉,新节点(非价格)插到标记之前
        const replacement = dom.document.createTextNode('N/A');
        p.insertBefore(replacement, p._children[1]);
        priceText.remove();
        mod.rescanAll();
        assert.strictEqual(dom.document.querySelectorAll(`[${mod.MARK_ATTR}]`).length, 0);
    });

    test('React 换成新价格文本:锚点仍然有效,标记保留并刷新为新参考价', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        const priceText = dom.document.createTextNode('$0.15');
        p.appendChild(priceText);
        dom.body.appendChild(p);
        mod.rescanAll();

        const newText = dom.document.createTextNode('$0.30');
        p.insertBefore(newText, p._children[1]);
        priceText.remove();
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2);
        assert.strictEqual(p._children[1].textContent, ' ≈¥2.16');
    });

    test('情形二:金额兄弟节点被 React 换成非金额文本,父元素末尾标记回收', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        p.appendChild(dom.document.createTextNode('$'));
        const numNode = dom.document.createTextNode('0.044');
        p.appendChild(numNode);
        dom.body.appendChild(p);
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3); // [$, 0.044, mark]

        const replacement = dom.document.createTextNode('N/A');
        p.insertBefore(replacement, p._children[2]);
        numNode.remove();
        mod.rescanAll();
        assert.strictEqual(p._children.length, 2); // [$, N/A],孤儿标记已回收
        assert.strictEqual(dom.document.querySelectorAll(`[${mod.MARK_ATTR}]`).length, 0);
    });

    test('情形二:金额兄弟节点换成新金额,标记保留并刷新', () => {
        const { dom, mod } = setup();
        const p = dom.document.createElement('p');
        p.appendChild(dom.document.createTextNode('$'));
        const numNode = dom.document.createTextNode('0.044');
        p.appendChild(numNode);
        dom.body.appendChild(p);
        mod.rescanAll();

        const replacement = dom.document.createTextNode('0.05');
        p.insertBefore(replacement, p._children[2]);
        numNode.remove();
        mod.rescanAll();
        assert.strictEqual(p._children.length, 3);
        assert.strictEqual(p._children[2].textContent, ' ≈¥0.36');
    });
});
