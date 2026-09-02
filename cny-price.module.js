
/* =========================== 人民币价格模块 =========================== */
/**
 * 人民币价格增强(原创实现)
 *
 * 设计思路参考 LynnGuo666/OpenRouter_Chinese,代码为全新编写:
 *   1. 保留官方美元价原文,在价格文本节点后追加带 data-openrouter-cny 标记的
 *      "≈¥xx" 参考价 span 节点——不改写原节点数据,避免与上方翻译引擎的词典/正则
 *      处理互相干扰;SPA 路由进入 /chat、/fusion 时自动清除本模块全部标记
 *   2. 汇率来源:Yahoo Finance 优先,失败回退 Frankfurter,再回退本地缓存或手动值
 *   3. 行情缓存 30 分钟;请求失败时可继续使用最多 72 小时内的旧汇率
 *   4. 纯本地换算,不发送任何页面数据;/chat 与 /fusion 用户内容区不启用
 */
(function (window, document, undefined) {
    'use strict';

    const CNY_VERSION = '1.0.0';
    const DEFAULT_RATE = 7.2;
    const RATE_TTL_MS = 30 * 60 * 1000;        // 汇率缓存有效期 30 分钟
    const RATE_STALE_MS = 72 * 60 * 60 * 1000; // 过期缓存最长回退时限 72 小时
    const RESCAN_INTERVAL_MS = 6000;           // 周期重扫,与主引擎节奏一致
    const SCAN_DEBOUNCE_MS = 400;
    const MARK = '≈¥';
    // 本模块生成节点的唯一标识:清理时只删带此属性的节点,
    // 绝不按"长得像 ≈¥数字"全页匹配,避免误删页面原生同形文本
    const MARK_ATTR = 'data-openrouter-cny';

    // 不启用价格增强的页面(对话与生成结果属于用户内容区)
    const DISABLED_PATH_PREFIXES = ['/chat', '/fusion'];

    // 不参与换算的容器:输入类元素与代码块中的 $ 示例不做价格标注
    const SKIP_SELECTOR = 'input, textarea, select, script, style, code, pre, [contenteditable="true"], [contenteditable=""]';

    // 匹配美元金额:$3、$0.15、$1,250、from $3 等。
    // 单位后缀(/M、/K、tokens 等)不参与匹配——无论按什么计价单位,数字本身都是美元金额
    const USD_PRICE_RE = /\$\s?([\d,]+(?:\.\d+)?)/;
    // 全局版:同一文本节点可能含多个价格("$3 /M input · $15 /M output"),逐个标注
    const USD_PRICE_RE_GLOBAL = /\$\s?([\d,]+(?:\.\d+)?)/g;

    const storedManualRate = Number(GM_getValue('cny_manual_rate', DEFAULT_RATE));
    const state = {
        enabled: GM_getValue('cny_enabled', true),
        rateMode: GM_getValue('cny_rate_mode', 'auto'), // 'auto' | 'manual'
        // 存量存储值可能是历史 bug 写入的非数字:非法时回退默认值,
        // 否则 manualRate=NaN 会让手动汇率静默失效,用户以为设了汇率实际一直用默认值
        manualRate: Number.isFinite(storedManualRate) && storedManualRate > 0 && storedManualRate < 100
            ? storedManualRate : DEFAULT_RATE,
        rate: DEFAULT_RATE,
        rateSource: '默认',
        menuIds: {},
        scanTimer: null,
        rescanInterval: null,
        observer: null,
    };

    /* ---------- 汇率获取与缓存 ---------- */

    function loadCachedRate() {
        try {
            const cache = JSON.parse(GM_getValue('cny_rate_cache', 'null'));
            if (cache && Number.isFinite(cache.usdCny) && cache.usdCny > 0) return cache;
        } catch (e) { /* 缓存损坏则视为无缓存 */ }
        return null;
    }

    function saveRateCache(usdCny) {
        GM_setValue('cny_rate_cache', JSON.stringify({ usdCny, ts: Date.now() }));
    }

    function applyRate(usdCny, source) {
        if (!Number.isFinite(usdCny) || usdCny <= 0 || usdCny >= 100) return false;
        state.rate = usdCny;
        state.rateSource = source;
        return true;
    }

    function initRate() {
        if (state.rateMode === 'manual') {
            // 手动值非法时静默回退自动流程,而不是卡在无效手动汇率
            if (applyRate(state.manualRate, '手动')) return;
        }
        const cache = loadCachedRate();
        if (cache) {
            const age = Date.now() - cache.ts;
            if (age <= RATE_TTL_MS) {
                applyRate(cache.usdCny, '缓存');
                return; // 新鲜缓存,不发请求
            }
            if (age <= RATE_STALE_MS) {
                applyRate(cache.usdCny, '过期缓存'); // 先用旧值兜底,后台继续刷新
            }
        }
        fetchRate();
    }

    function gmFetchJson(url, cb) {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 8000,
                onload: (res) => {
                    try { cb(JSON.parse(res.responseText)); } catch (e) { cb(null); }
                },
                onerror: () => cb(null),
                ontimeout: () => cb(null),
            });
        } catch (e) { cb(null); }
    }

    function fetchYahoo(done) {
        gmFetchJson('https://query1.finance.yahoo.com/v8/finance/chart/CNY=X?interval=1d&range=1d', (data) => {
            const price = data && data.chart && data.chart.result && data.chart.result[0]
                ? data.chart.result[0].meta.regularMarketPrice : null;
            if (applyRate(Number(price), 'Yahoo')) {
                saveRateCache(state.rate);
                rescanAll();
                done(true);
            } else {
                done(false);
            }
        });
    }

    function fetchFrankfurter(done) {
        gmFetchJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY', (data) => {
            const price = data && data.rates ? data.rates.CNY : null;
            if (applyRate(Number(price), 'Frankfurter')) {
                saveRateCache(state.rate);
                rescanAll();
                done(true);
            } else {
                done(false);
            }
        });
    }

    function fetchRate() {
        fetchYahoo((ok) => {
            if (!ok) {
                fetchFrankfurter((ok2) => {
                    if (!ok2) console.warn('[OpenRouter 中文化增强版] 汇率获取失败,继续使用', state.rateSource, '汇率', state.rate);
                });
            }
        });
    }

    /* ---------- 价格识别与格式化 ---------- */

    function parseUsd(text) {
        const m = text.match(USD_PRICE_RE);
        if (!m) return null;
        const value = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(value) || value <= 0) return null;
        return value;
    }

    function formatCny(usd) {
        const cny = usd * state.rate;
        if (!(cny > 0)) return null;
        let text;
        if (cny >= 1000) text = String(Math.round(cny));
        else if (cny >= 100) text = cny.toFixed(1);
        else if (cny >= 1) text = cny.toFixed(2);
        else text = String(parseFloat(cny.toPrecision(3))); // 小额价格保留 3 位有效数字
        return MARK + text;
    }

    /* ---------- DOM 扫描与标注 ---------- */

    /* ---------- 标记节点(带 data-openrouter-cny 的 span)---------- */

    function isElementMark(el) {
        return !!(el && el.nodeType === 1
            && typeof el.hasAttribute === 'function'
            && el.hasAttribute(MARK_ATTR));
    }

    function isMarked(node) {
        return isElementMark(node.nextSibling);
    }

    function createMark(label) {
        const span = document.createElement('span');
        span.setAttribute(MARK_ATTR, '');
        span.textContent = ' ' + label;
        if (span.style) {
            span.style.opacity = '0.85';
            span.style.fontSize = '0.92em';
            span.style.fontWeight = '500';
            span.style.letterSpacing = '-0.01em';
        }
        return span;
    }

    function refreshMark(markEl, label) {
        const want = ' ' + label;
        if (markEl.textContent !== want) markEl.textContent = want;
    }

    function annotateNode(node) {
        const text = node.data;
        if (!text || text.length > 300) return;
        if (node.parentElement && node.parentElement.closest(SKIP_SELECTOR)) return;

        // 情形一:$ 与金额在同一文本节点(可能含多个价格,如 "$3 /M input · $15 /M output")
        if (text.indexOf('$') !== -1) {
            if (/\$\s?[\d,]/.test(text)) {
                annotateWithUsdAll(node);
                return;
            }
            // 情形二:React 渲染把价格拆成多个文本节点,"$" 单独成节点,
            // 紧随的兄弟文本节点以金额开头(如 [$]["0.044"]["/M input tokens"])。
            // 标注追加到父元素末尾,保证显示在完整价格串(含单位)之后
            if (/^\s?\$\s?$/.test(text)) {
                const parent = node.parentElement;
                const numNode = node.nextSibling;
                if (!parent || !numNode || numNode.nodeType !== Node.TEXT_NODE || numNode.data.length > 300) return;
                const m = numNode.data.match(/^\s?([\d,]+(?:\.\d+)?)/);
                if (!m) return;
                const numUsd = Number(m[1].replace(/,/g, ''));
                if (!(numUsd > 0)) return;
                const label = formatCny(numUsd);
                if (!label) return;

                if (isElementMark(parent.lastChild)) {
                    // 已标注:价格数字被 React 更新时同步刷新参考价
                    refreshMark(parent.lastChild, label);
                    return;
                }
                parent.appendChild(createMark(label));
            }
        }
    }

    /**
     * 在 hostNode 之后维护人民币参考价标记串:文本节点含几个美元价就保持几个
     * 连续标记(React 更新数字时逐个刷新;价格数量变少时移除多余标记)
     */
    function annotateWithUsdAll(hostNode) {
        const matches = [];
        let m;
        USD_PRICE_RE_GLOBAL.lastIndex = 0;
        while ((m = USD_PRICE_RE_GLOBAL.exec(hostNode.data)) !== null) {
            const usd = Number(m[1].replace(/,/g, ''));
            if (Number.isFinite(usd) && usd > 0) matches.push(usd);
        }
        if (matches.length === 0) return;

        // 收集紧随 hostNode 的连续标记(可能是一次标注多个价格的结果)
        const marks = [];
        let node = hostNode.nextSibling;
        while (isElementMark(node)) { marks.push(node); node = node.nextSibling; }

        for (let i = 0; i < matches.length; i++) {
            const label = formatCny(matches[i]);
            if (!label) break;
            if (i < marks.length) {
                refreshMark(marks[i], label);
            } else {
                const mark = createMark(label);
                const ref = marks.length ? marks[marks.length - 1].nextSibling : hostNode.nextSibling;
                hostNode.parentNode.insertBefore(mark, ref);
                marks.push(mark);
            }
        }
        for (let i = marks.length - 1; i >= matches.length; i--) marks[i].remove();
    }

    function priceEnabledHere() {
        if (!state.enabled) return false;
        const path = window.location.pathname;
        return !DISABLED_PATH_PREFIXES.some((p) => path.startsWith(p));
    }

    function scanRoot(root) {
        if (!root || !priceEnabledHere()) return;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node;
        while ((node = walker.nextNode())) {
            annotateNode(node);
        }
    }

    function rescanAll() {
        try {
            // SPA 路由切换进入 /chat、/fusion 时,旧页面残留的参考价标记不会
            // 随组件卸载必然消失(共享侧栏等持久 DOM),必须主动清除;
            // 路由切回启用页后,下一次扫描自然恢复标注
            if (!priceEnabledHere()) {
                removeAllMarks();
                return;
            }
            pruneOrphanMarks();
            scanRoot(document.body);
        } catch (e) { /* 忽略单次扫描异常 */ }
    }

    function scheduleScan() {
        if (state.scanTimer) return;
        state.scanTimer = setTimeout(() => {
            state.scanTimer = null;
            rescanAll();
        }, SCAN_DEBOUNCE_MS);
    }

    function removeAllMarks() {
        if (!document.body) return;
        // 只移除本模块生成的标记节点,页面原生文本一律不动
        document.querySelectorAll('[' + MARK_ATTR + ']').forEach((el) => el.remove());
    }

    /**
     * 回收孤儿标记:React 重渲染可能直接移除/替换作为锚点的价格文本节点,
     * 但它不知道标记 span 的存在,删除后标记残留,同页随后会再标一次,
     * 出现双份 ≈¥ 直到路由切换才被清除。每次扫描前校验每个标记的前驱兄弟
     * 仍是锚点——价格文本(情形一/二),或同一价格产生的连续标记链中的前一个
     * 标记(多价格标注);链条头失锚被移除后,后续标记的前驱自动还原为价格
     * 文本或同样失锚,逐次扫描自愈。失锚标记移除后,扫描会在正确位置重新标注。
     */
    function pruneOrphanMarks() {
        document.querySelectorAll('[' + MARK_ATTR + ']').forEach((el) => {
            const prev = el.previousSibling;
            let anchored = false;
            if (prev && prev.nodeType === Node.TEXT_NODE
                && typeof prev.data === 'string' && prev.data.length <= 300) {
                anchored = parseUsd(prev.data) !== null || /^\s?[\d,]+(?:\.\d+)?/.test(prev.data);
            } else if (isElementMark(prev)) {
                anchored = true; // 多价格标记链的链内节点,由链条头决定去留
            }
            if (!anchored) el.remove();
        });
    }

    /* ---------- 菜单命令 ---------- */

    function setupMenu() {
        Object.values(state.menuIds).forEach((id) => {
            if (id) GM_unregisterMenuCommand(id);
        });
        state.menuIds = {};

        state.menuIds.toggle = GM_registerMenuCommand(
            (state.enabled ? '✓ ' : '') + '人民币价格显示(切换)',
            () => {
                state.enabled = !state.enabled;
                GM_setValue('cny_enabled', state.enabled);
                if (!state.enabled) removeAllMarks();
                else rescanAll();
                setupMenu();
            }
        );

        state.menuIds.manual = GM_registerMenuCommand(
            (state.rateMode === 'manual' ? '✓ ' : '') + '设置手动汇率',
            () => {
                const input = prompt('输入 USD/CNY 汇率\n(当前' + state.rateSource + '汇率:' + state.rate + ')', String(state.manualRate));
                if (input === null) return;
                const value = Number(input);
                if (Number.isFinite(value) && value > 0 && value < 100) {
                    state.manualRate = value;
                    state.rateMode = 'manual';
                    GM_setValue('cny_manual_rate', value);
                    GM_setValue('cny_rate_mode', 'manual');
                    applyRate(value, '手动');
                    setupMenu();
                    rescanAll();
                } else {
                    alert('汇率无效,请输入 0-100 之间的数字');
                }
            }
        );

        state.menuIds.auto = GM_registerMenuCommand(
            (state.rateMode === 'auto' ? '✓ ' : '') + '恢复自动汇率(Yahoo/Frankfurter)',
            () => {
                state.rateMode = 'auto';
                GM_setValue('cny_rate_mode', 'auto');
                const cache = loadCachedRate();
                if (cache) applyRate(cache.usdCny, '缓存');
                fetchRate();
                setupMenu();
                rescanAll();
            }
        );
    }

    /* ---------- 启动 ---------- */

    function initCny() {
        initRate();
        setupMenu();

        const start = () => {
            rescanAll();
            state.observer = new MutationObserver(scheduleScan);
            // characterData 必须监听:React 会事后修正价格数字(如四舍五入),
            // 否则已追加的参考价会与更新后的美元价不一致,最长滞后一个重扫周期
            state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            state.rescanInterval = setInterval(rescanAll, RESCAN_INTERVAL_MS);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        console.info('[OpenRouter 中文化增强版] 价格模块 v' + CNY_VERSION + ' / 汇率(' + state.rateSource + '):' + state.rate);
    }

    /* ---------- 测试导出(Node 单元测试专用)---------- */
    // 仅在 CommonJS 环境(Node)下导出内部函数供单元测试;
    // 浏览器/userscript 环境没有 module,此分支永远不生效。
    // Node 下 document 为 undefined,下方自动启动逻辑整体跳过,
    // 不会创建 MutationObserver/setInterval,也不会发起汇率请求。

    if (typeof document !== 'undefined' && document) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCny, { once: true });
        } else {
            initCny();
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            state,
            MARK_ATTR,
            parseUsd,
            formatCny,
            applyRate,
            loadCachedRate,
            saveRateCache,
            isMarked,
            priceEnabledHere,
            removeAllMarks,
            pruneOrphanMarks,
            rescanAll,
        };
    }
})(
    typeof window !== 'undefined' ? window : globalThis,
    typeof document !== 'undefined' ? document : undefined,
    undefined
);
