
/* =========================== 人民币价格模块 =========================== */
/**
 * 人民币价格增强(原创实现)
 *
 * 设计思路参考 LynnGuo666/OpenRouter_Chinese,代码为全新编写:
 *   1. 保留官方美元价原文,在价格文本节点后追加独立的 "≈¥xx" 参考价文本节点
 *      —— 不改写原节点数据,避免与上方翻译引擎的词典/正则处理互相干扰
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

    // 不启用价格增强的页面(对话与生成结果属于用户内容区)
    const DISABLED_PATH_PREFIXES = ['/chat', '/fusion'];

    // 不参与换算的容器:输入类元素与代码块中的 $ 示例不做价格标注
    const SKIP_SELECTOR = 'input, textarea, select, script, style, code, pre, [contenteditable="true"], [contenteditable=""]';

    // 匹配美元金额:$3、$0.15、$1,250、from $3 等。
    // 单位后缀(/M、/K、tokens 等)不参与匹配——无论按什么计价单位,数字本身都是美元金额
    const USD_PRICE_RE = /\$\s?([\d,]+(?:\.\d+)?)/;

    const state = {
        enabled: GM_getValue('cny_enabled', true),
        rateMode: GM_getValue('cny_rate_mode', 'auto'), // 'auto' | 'manual'
        manualRate: Number(GM_getValue('cny_manual_rate', DEFAULT_RATE)),
        rate: DEFAULT_RATE,
        rateSource: '默认',
        menuIds: {},
        scanTimer: null,
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
            applyRate(state.manualRate, '手动');
            return;
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

    function isMarked(node) {
        return node.nextSibling
            && node.nextSibling.nodeType === Node.TEXT_NODE
            && /^\s?≈¥[\d.,]+$/.test(String(node.nextSibling.data));
    }

    function annotateNode(node) {
        const text = node.data;
        if (!text || text.length > 300) return;
        if (node.parentElement && node.parentElement.closest(SKIP_SELECTOR)) return;

        // 情形一:$ 与金额在同一文本节点
        if (text.indexOf('$') !== -1) {
            const usd = parseUsd(text);
            if (usd !== null) {
                annotateWithUsd(node, usd);
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

                const last = parent.lastChild;
                if (last && last.nodeType === Node.TEXT_NODE && /^\s?≈¥[\d.,]+$/.test(last.data)) {
                    // 已标注:价格数字被 React 更新时同步刷新参考价
                    const want = ' ' + label;
                    if (last.data !== want) last.data = want;
                    return;
                }
                parent.appendChild(document.createTextNode(' ' + label));
            }
        }
    }

    /**
     * 在 hostNode 之后追加(或同步更新)人民币参考价文本节点
     */
    function annotateWithUsd(hostNode, usd) {
        if (!Number.isFinite(usd) || usd <= 0) return;
        const label = formatCny(usd);
        if (!label) return;

        if (isMarked(hostNode)) {
            // 已标注:价格数字被 React 更新时同步刷新参考价
            const want = ' ' + label;
            if (hostNode.nextSibling.data !== want) hostNode.nextSibling.data = want;
            return;
        }
        const tail = document.createTextNode(' ' + label);
        hostNode.parentNode.insertBefore(tail, hostNode.nextSibling);
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
        try { scanRoot(document.body); } catch (e) { /* 忽略单次扫描异常 */ }
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
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        const targets = [];
        let n;
        while ((n = walker.nextNode())) {
            if (/^\s?≈¥[\d.,]+$/.test(n.data)) targets.push(n);
        }
        targets.forEach((t) => t.remove());
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
            setInterval(rescanAll, RESCAN_INTERVAL_MS);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }

        console.info('[OpenRouter 中文化增强版] 价格模块 v' + CNY_VERSION + ' / 汇率(' + state.rateSource + '):' + state.rate);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCny, { once: true });
    } else {
        initCny();
    }
})(window, document, undefined);
