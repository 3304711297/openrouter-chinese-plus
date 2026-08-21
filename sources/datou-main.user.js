// ==UserScript==
// @name         OpenRouter 中文化插件
// @namespace    https://openrouter.ai/
// @description  中文化 OpenRouter 界面的部分菜单及内容。实现方式参考 https://github.com/maboloshi/github-chinese
// @version      1.5.22
// @author       openrouter-chinese
// @license      MIT
// @icon         https://openrouter.ai/favicon.ico
// @match        https://openrouter.ai/*
// @require      https://raw.githubusercontent.com/datou1996/openrouter-chinese/main/locals.js?v1.5.7
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @supportURL   https://github.com/datou1996/openrouter-chinese/issues
// ==/UserScript==

/**
 * OpenRouter 中文化插件
 *
 * 实现方式参考 github-chinese(https://github.com/maboloshi/github-chinese):
 *   1. 词库文件(locals.js)与主脚本分离,便于更新词库
 *   2. 通过 URL 识别页面类型,加载对应的页面词条
 *   3. 使用 MutationObserver 监听 DOM 变化,自动翻译动态加载的内容
 *   4. 使用 TreeWalker 遍历节点,仅修改文本节点,避免破坏 React 组件结构
 *   5. 静态词典精确匹配 + 正则规则模糊匹配,未命中则跳过
 *   6. 通过忽略规则保护代码块、输入框、用户内容等不应翻译的区域
 */

(function (window, document, undefined) {
    'use strict';

    /* =========================== 全局配置常量 =========================== */
    const CONFIG = {
        LANG: 'zh-CN', // 默认语言
        DEV: false, // 默认不开启开发者模式
        OBSERVER_CONFIG: { // MutationObserver 配置
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: ['placeholder', 'aria-label', 'title', 'value'],
        },
    };

    /* =========================== 状态管理器 =========================== */
    const State = {
        // 功能开关(通过 GM_setValue 持久化)
        featureSet: {
            enable_RegExp: GM_getValue('enable_RegExp', true),
            enable_dev: GM_getValue('enable_dev', false),
        },

        // 当前运行时状态
        pageConfig: null, // 当前页面配置
        currentURL: window.location.href, // 当前页面 URL
        mutationObserver: null, // DOM 变化观察器
        urlChangeHandler: null, // URL 变化处理器
        menuIds: {}, // 菜单 ID 记录
    };

    /* =========================== 安全检查 =========================== */

    /**
     * 检查词库文件是否加载 — 未加载则提示并中止
     */
    function checkI18NLoaded() {
        if (typeof I18N === 'undefined') {
            alert('OpenRouter 汉化插件:词库文件 locals.js 未加载,脚本无法运行!\n请检查 @require 引用的词库地址是否正确。');
            throw new Error('[OpenRouter 中文化插件] 词库文件 locals.js 未加载');
        }
    }

    /**
     * 错误边界 — 包裹关键函数,避免异常阻断页面正常使用
     */
    function safe(fn, label) {
        return function (...args) {
            try {
                return fn.apply(this, args);
            } catch (e) {
                console.error(`[OpenRouter 中文化插件] ${label} 出错:`, e);
            }
        };
    }

    /* =========================== 初始化入口 =========================== */
    function init() {
        checkI18NLoaded();
        // 输出版本信息,便于确认是否加载了最新词库
        // 脚本版本从 @version 动态读取,避免硬编码过期
        const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || 'unknown';
        console.info('[OpenRouter 中文化插件] 脚本 v' + scriptVersion + ' / 词库 v' + I18N.version + ' / 公共词条数: ' + Object.keys(I18N['zh-CN'].public.static).length);
        initLangEnv();
        setupMenuCommands();
        setupInitTrans();
        setupUrlChangeListener();
    }

    /**
     * 设置中文语言环境
     */
    function initLangEnv() {
        document.documentElement.lang = CONFIG.LANG;
    }

    /**
     * 设置初始翻译
     * 即使 @run-at document-start,脚本注入也可能晚于 DOMContentLoaded,
     * 因此根据 readyState 决定立即执行还是等待事件。
     */
    function setupInitTrans() {
        function doInitTrans() {
            updatePageConfig('首次载入');
            if (State.pageConfig) {
                safe(traverseNode, '首次遍历')(document.body);
                safe(transTitle, '标题翻译')();
            }
            setupMutationObserver(); // 设置 DOM 变化观察器
            setupLazyContentSweep(); // 设置懒加载内容清扫
        }

        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            doInitTrans();
        } else {
            window.addEventListener('DOMContentLoaded', doInitTrans, { once: true });
        }
    }

    /**
     * 设置懒加载内容清扫
     *
     * OpenRouter 为 Next.js 应用,大量内容(排行榜分区、图表等)通过滚动/观察器
     * 懒加载挂载,且 React 重渲染会恢复英文原文。仅依赖 MutationObserver 可能
     * 漏掉部分节点(如 body 被替换、mutation 批量处理中断等),因此:
      *   1. 监听滚动(防抖)后整页重扫 —— 覆盖滚动懒加载的内容
     *   2. 周期性整页重扫 —— 覆盖其他时机挂载/被 React 恢复的内容
     *   3. 检测 body 被替换 —— 替换后重建观察器,避免观察失效
     *   4. 主动查询兜底 —— 直接遍历文本节点搜索已知模式,确保不遗漏
     */
    function setupLazyContentSweep() {
        // 滚动防抖重扫(800ms)
        let scrollTimer = null;
        window.addEventListener('scroll', () => {
            if (scrollTimer) clearTimeout(scrollTimer);
            scrollTimer = setTimeout(() => {
                if (State.pageConfig) {
                    safe(traverseNode, '滚动重扫')(document.body);
                    safe(transTitle, '标题翻译')();
                    safe(patchMissedNodes, '兜底扫描')();
                }
            }, 800);
        }, { passive: true });

        // 周期性重扫(6 秒,基准页额外 2.5 秒快速重扫防 React 重渲染回退)与 body 替换检测
        setInterval(() => {
            // body 被替换时重建观察器
            if (State.mutationObserver && !document.contains(State.mutationObserver.target)) {
                console.warn('[OpenRouter 中文化插件] 检测到 body 被替换,重建观察器');
                State.mutationObserver.disconnect();
                State.mutationObserver = null;
                setupMutationObserver();
                // body 被替换后延迟执行兜底扫描,等 React 渲染完成
                setTimeout(() => {
                    if (State.pageConfig) safe(patchMissedNodes, '兜底扫描(body替换)')();
                }, 1500);
            }
            if (State.pageConfig) {
                safe(traverseNode, '周期重扫')(document.body);
                safe(transTitle, '标题翻译')();
                safe(patchMissedNodes, '兜底扫描')();
            }
        }, 6000);

        // 基准测试页快速重扫:每 2.5 秒整页重扫,对抗 React 重渲染回退
        if (State.pageConfig?.currentPageType === 'benchmarks') {
            setInterval(() => {
                if (State.pageConfig?.currentPageType === 'benchmarks') {
                    safe(traverseNode, '基准页快速重扫')(document.body);
                    safe(patchMissedNodes, '基准页兜底扫描')();
                }
            }, 2500);
        }
    }

    /**
     * 主动查询兜底:直接遍历 body 下所有文本节点搜索已知模式的顽固未翻译项,
     * 这些节点可能因虚拟列表复用、React Portal 等复杂原因从未被 TreeWalker 访问
     */
    function patchMissedNodes() {
        let hit = 0;
        try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.data;
            // 限制长度,避免处理 AI 回复等长文本
            if (!text || text.length > 500) continue;
            // 基准测试页内容动态渲染,对所有英文文本尝试翻译;其他页仅处理已知顽固模式
            const isBenchmarks = State.pageConfig?.currentPageType === 'benchmarks';
            if (isBenchmarks || /selected/i.test(text)) {
                hit++;
                const result = transText(text);
                if (result) node.data = result;
            }
        }
        } catch (e) { console.error('[OpenRouter 中文化插件] 兜底扫描 异常:', e); }
        // React 可能在此次翻译后立即重渲染回退英文,1s/2.5s 后追加两次快速重扫
        if (hit > 0) {
            setTimeout(() => safe(patchMissedNodes, '兜底重扫1'), 1000);
            setTimeout(() => safe(patchMissedNodes, '兜底重扫2'), 2500);
        }
    }

    /* =========================== URL 变化监听 =========================== */
    /**
     * 设置 URL 变化监听器
     * Tampermonkey 环境使用 onurlchange 事件,其他环境回退到 MutationObserver URL 检测
     */
    function setupUrlChangeListener() {
        if (window.onurlchange === null) {
            State.urlChangeHandler = function () {
                handleUrlChange();
            };
            window.addEventListener('urlchange', State.urlChangeHandler);
        }
    }

    /**
     * 处理 URL 变化(Next.js 客户端路由跳转)
     */
    function handleUrlChange() {
        const currentURL = window.location.href;
        if (currentURL === State.currentURL) return;

        State.currentURL = currentURL;
        updatePageConfig('URL 变化');

        if (State.mutationObserver) {
            State.mutationObserver.disconnect();
        }

        if (State.pageConfig) {
            safe(traverseNode, 'URL 变化遍历')(document.body);
            safe(transTitle, '标题翻译')();
        }

        setupMutationObserver();
    }

    /* =========================== 页面配置管理 =========================== */

    /**
     * 更新页面配置 — 页面类型变化时重建 State.pageConfig
     */
    function updatePageConfig(trigger) {
        const newType = detectPageType();
        if (!newType) {
            State.pageConfig = null;
        } else if (newType !== State.pageConfig?.currentPageType) {
            State.pageConfig = buildPageConfig(newType);
        }
        if (CONFIG.DEV) console.log(`【Debug】${trigger}触发,页面类型为 ${State.pageConfig?.currentPageType}`);
    }

    /**
     * 构建页面配置对象
     */
    function buildPageConfig(pageType) {
        const pageI18n = I18N[CONFIG.LANG][pageType] || {};

        return {
            currentPageType: pageType, // 当前页面类型
            titleStaticDict: pageI18n.title?.static || {},
            titleRegexpRules: pageI18n.title?.regexp || [],
            staticDict: { // 合并公共和页面特定的静态词典
                ...I18N[CONFIG.LANG].public.static,
                ...(pageI18n.static || {})
            },
            regexpRules: [ // 合并页面特定和公共的正则规则(页面优先)
                ...(pageI18n.regexp || []),
                ...(I18N[CONFIG.LANG].public.regexp || [])
            ],
            ignoreMutationSelectors: [ // 忽略的突变选择器
                ...(I18N.conf.ignoreMutationSelectorPage['*'] || []),
                ...(I18N.conf.ignoreMutationSelectorPage[pageType] || [])
            ].join(', '),
            ignoreSelectors: [ // 忽略的选择器
                ...(I18N.conf.ignoreSelectorPage['*'] || []),
                ...(I18N.conf.ignoreSelectorPage[pageType] || [])
            ].join(', '),
            characterData: (I18N.conf.characterDataPage || []).includes(pageType), // 是否监视文本节点变化
            maxTextLength: pageType === 'benchmarks' ? 2000 : 500, // 文本节点长度上限(基准测试页含长段落介绍)
        };
    }

    /* =========================== 页面类型检测 =========================== */

    /**
     * 检测当前页面类型
     * @returns {string|boolean} 页面类型或 false(如果无法识别)
     */
    function detectPageType() {
        const { pathname } = window.location;

        let pageType;
        if (pathname === '/' || pathname === '/workspaces' || pathname.startsWith('/workspaces/')) {
            pageType = pathname.startsWith('/workspaces') ? 'workspaces' : 'home';
        } else if (pathname === '/models') {
            pageType = 'models';
        } else if (pathname.startsWith('/models/')) {
            pageType = 'model';
        } else if (pathname === '/chat' || pathname.startsWith('/chat/')) {
            pageType = 'chat';
        } else if (pathname === '/rankings' || pathname.startsWith('/rankings/')) {
            pageType = 'rankings';
        } else if (pathname === '/apps' || pathname.startsWith('/apps/')) {
            pageType = 'apps';
        } else if (pathname === '/providers' || pathname.startsWith('/providers/')) {
            pageType = 'providers';
        } else if (pathname === '/pricing') {
            pageType = 'pricing';
        } else if (pathname === '/benchmarks' || pathname.startsWith('/benchmarks/')) {
            pageType = 'benchmarks';
        } else if (pathname === '/labs' || pathname.startsWith('/labs/')) {
            pageType = 'labs';
        } else if (pathname === '/spawn') {
            pageType = 'spawn';
        } else if (pathname === '/fusion') {
            pageType = 'fusion';
        } else if (pathname === '/discover') {
            pageType = 'discover';
        } else if (pathname === '/activity' || pathname.startsWith('/activity/')) {
            pageType = 'activity';
        } else if (pathname === '/logs' || pathname.startsWith('/logs/')) {
            pageType = 'logs';
        } else if (pathname === '/compare' || pathname.startsWith('/compare/')) {
            pageType = 'compare';
        } else if (pathname === '/docs' || pathname.startsWith('/docs/') || pathname === '/developers') {
            pageType = 'docs';
        } else if (pathname.startsWith('/settings')) {
            pageType = 'settings';
        } else if (/^\/(signin|signup|login|register|auth)/.test(pathname)) {
            pageType = 'signin';
        } else if (pathname.startsWith('/blog')) {
            pageType = 'blog';
        } else if (/^\/[a-z0-9-]+\/[a-z0-9.\-]+$/.test(pathname)) {
            // 厂商/模型 形式的模型详情页,如 /sakana/sakana-namazu、/deepseek/deepseek-v4-flash-0731
            pageType = 'model';
        } else {
            pageType = 'misc';
        }

        // 验证页面类型是否有效
        if (!I18N[CONFIG.LANG]?.[pageType]) {
            console.warn('[OpenRouter 汉化] 词库中缺少 "' + pageType + '" 页面的翻译', {
                url: window.location.href,
                pathname,
            });
            return false;
        }

        return pageType;
    }

    /* =========================== MutationObserver =========================== */

    /**
     * 设置 DOM 变化观察器
     */
    function setupMutationObserver() {
        // 缓存当前页面的 URL
        let previousURL = window.location.href;

        if (State.mutationObserver) {
            State.mutationObserver.disconnect();
        }

        State.mutationObserver = new MutationObserver(
            safe((mutations) => {
                const currentURL = window.location.href;
                // 当没有 onurlchange 支持时,通过观察器检测 URL 变化
                if (!State.urlChangeHandler && currentURL !== previousURL) {
                    previousURL = currentURL;
                    State.currentURL = currentURL;
                    updatePageConfig('URL 变化 (MutationObserver)');
                }

                // 处理 DOM 变化
                if (State.pageConfig) {
                    processMutations(mutations);
                }
            }, 'MutationObserver')
        );

        // 开始观察页面主体
        State.mutationObserver.observe(document.body, CONFIG.OBSERVER_CONFIG);
    }

    /**
     * 判断节点是否应忽略突变处理
     */
    function shouldIgnoreMutationNode(node) {
        const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
        if (!element) return true;

        const ignoredSelectors = State.pageConfig?.ignoreMutationSelectors;
        if (ignoredSelectors && element.closest?.(ignoredSelectors)) return true;

        return false;
    }

    /**
     * 处理 MutationObserver 检测到的变化
     * 收集突变节点、过滤忽略选择器、对祖先-后代关系去重,仅遍历顶层节点
     */
    function processMutations(mutations) {
        const nodesToProcess = new Set();

        // 收集需要处理的节点
        mutations.forEach(({ target, addedNodes, type }) => {
            if (type === 'childList' && addedNodes.length > 0) {
                // 处理新增节点
                addedNodes.forEach(node => {
                    if (!shouldIgnoreMutationNode(node)) {
                        nodesToProcess.add(node);
                    }
                });
            } else if (type === 'attributes') {
                // 处理属性变化,target 就是元素
                if (!shouldIgnoreMutationNode(target)) {
                    nodesToProcess.add(target);
                }
            } else if (type === 'characterData' && State.pageConfig.characterData) {
                // 处理文本变化,target 是文本节点,取其父元素
                if (!shouldIgnoreMutationNode(target)) {
                    nodesToProcess.add(target);
                }
            }
        });

        // 过滤掉祖先已在集合中的后代节点,避免重复遍历
        const topNodes = new Set();
        nodesToProcess.forEach(node => {
            let ancestor = node.parentElement;
            while (ancestor) {
                if (nodesToProcess.has(ancestor)) return;
                ancestor = ancestor.parentElement;
            }
            topNodes.add(node);
        });

        // 仅遍历顶层节点
        topNodes.forEach(node => {
            traverseNode(node);
        });
    }

    /* =========================== DOM 遍历与节点处理 =========================== */

    /**
     * 遍历节点树并进行翻译
     * @param {Node} rootNode - 要遍历的根节点
     */
    function traverseNode(rootNode) {
        if (!rootNode) return;

        // 文本节点直接处理
        if (rootNode.nodeType === Node.TEXT_NODE) {
            handleTextNode(rootNode);
            return;
        }

        if (rootNode.nodeType !== Node.ELEMENT_NODE) return;

        // 根节点自身先处理属性(不受忽略规则限制,保证 placeholder/aria-label 等仍可翻译)
        handleElementNode(rootNode);

        // 若根节点命中忽略规则,则不再遍历其子树(如代码块、输入框等)
        if (State.pageConfig?.ignoreSelectors && rootNode.matches(State.pageConfig.ignoreSelectors)) return;

        // 创建 TreeWalker 遍历节点树
        const treeWalker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (node.nodeType === Node.ELEMENT_NODE
                        && State.pageConfig?.ignoreSelectors
                        && node.matches(State.pageConfig.ignoreSelectors)) {
                        // 被忽略的元素仍翻译其属性(如 textarea 的 placeholder、按钮的 aria-label),
                        // 但其子树(如代码块、输入内容)不参与翻译
                        handleElementNode(node);
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT; // 接受其他节点
                }
            }
        );

        let currentNode;
        while ((currentNode = treeWalker.nextNode())) {
            if (currentNode.nodeType === Node.ELEMENT_NODE) {
                handleElementNode(currentNode);
            } else if (currentNode.nodeType === Node.TEXT_NODE) {
                handleTextNode(currentNode);
            }
        }
    }

    /**
     * 处理文本节点
     * @param {Node} node - 文本节点
     */
    function handleTextNode(node) {
        if (node.length > State.pageConfig.maxTextLength) return; // 跳过长文本节点(AI 回复等)
        transTextNode(node);
    }

    /**
     * 处理元素节点
     * @param {Element} node - 元素节点
     */
    function handleElementNode(node) {
        const tag = node.tagName;
        if (!tag) return;

        // 翻译 aria-label(OpenRouter 大量使用图标按钮,依赖 aria-label 提供提示)
        if (node.hasAttribute('aria-label')) {
            transElementAttr(node, 'aria-label');
        }

        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            // 输入框和文本域
            if (['button', 'submit', 'reset'].includes(node.type)) {
                transElementAttr(node, 'value'); // 按钮类输入框的值
            } else {
                transElementAttr(node, 'placeholder'); // 占位符
            }
            return;
        }

        if (tag === 'OPTGROUP') {
            transElementAttr(node, 'label');
            return;
        }

        if (tag === 'BUTTON') {
            transElementAttrs(node, ['title', 'cancelConfirmText']);
            transElementAttrs(node.dataset, [
                'confirm', // 确认文本
                'confirmText', // 确认按钮文本
                'confirmCancelText', // 取消按钮文本
                'disableWith', // 禁用提示
                'visibleText',
            ]);
        }

        if (tag === 'A' || tag === 'SPAN') {
            transElementAttr(node, 'title');
            transElementAttr(node.dataset, 'visibleText');
        }
    }

    /* =========================== 翻译功能 =========================== */

    /**
     * 翻译页面标题
     */
    function transTitle() {
        const text = document.title;
        let result = State.pageConfig.titleStaticDict[text] || '';

        // 尝试静态翻译
        if (!result) {
            // 尝试正则表达式翻译
            for (const [pattern, replacement] of State.pageConfig.titleRegexpRules) {
                result = text.replace(pattern, replacement);
                if (result !== text) break;
            }
        }

        // 应用翻译结果
        if (result) {
            document.title = result;
        }
    }

    /**
     * 翻译单个文本节点
     * @param {Node} node - 文本节点
     */
    function transTextNode(node) {
        const text = node.data;
        const result = transText(text);
        if (result) {
            node.data = result;
        }
    }

    /**
     * 翻译元素的单个属性
     * 注意:元素属性需使用 getAttribute/setAttribute(带连字符的属性名如 aria-label
     * 无法通过 element['aria-label'] 属性访问),data-* 数据集则使用属性访问
     * @param {Object} target - 元素对象或元素数据集(dataset)
     * @param {string} attrName - 要翻译的属性名
     */
    function transElementAttr(target, attrName) {
        const isElement = typeof target.getAttribute === 'function';
        const text = isElement ? target.getAttribute(attrName) : target[attrName];
        if (!text || text.length > 500) return;

        const result = transText(text);
        if (result) {
            if (isElement) {
                target.setAttribute(attrName, result);
            } else {
                target[attrName] = result;
            }
        }
    }

    /**
     * 批量翻译元素的多个属性
     */
    function transElementAttrs(target, attrs) {
        const attrList = Array.isArray(attrs) ? attrs : [attrs];
        attrList.forEach(attrName => transElementAttr(target, attrName));
    }

    /**
     * 翻译文本内容
     * @param {string} text - 要翻译的文本
     * @returns {string|boolean} 翻译后的文本或 false
     */
    function transText(text) {
        // 跳过不需要翻译的文本:
        // 1. 空文本(含空白字符)或纯数字
        // 2. 纯中文字符
        // 3. 不包含英文字母和 , . 符号的文本
        if (typeof text !== 'string') return false;
        if (/^[\s0-9]*$/.test(text) ||
            /^[\u4e00-\u9fa5]+$/.test(text) ||
            !/[a-zA-Z,.]/.test(text)) {
            return false;
        }

        // 清理文本:去除首尾空格和多余空白,并剥离零宽字符(React 渲染常混入 \u200b 等)
        const trimmedText = text.trim();
        const cleanedText = trimmedText
            .replace(/\xa0|[\s]+/g, ' ')
            .replace(/[\u200b\u200c\u200d\ufeff]/g, '');

        // 获取翻译
        const result = fetchTransResult(cleanedText);
        if (result && result !== cleanedText) {
            return text.replace(trimmedText, result);
        }

        return false;
    }

    /**
     * 从词库获取翻译
     * @param {string} text - 要翻译的文本
     * @returns {string|boolean} 翻译结果或 false
     */
    function fetchTransResult(text) {
        if (!State.pageConfig) return false;

        // 静态词典查找(精确匹配)
        const staticResult = State.pageConfig.staticDict[text];
        if (typeof staticResult === 'string') {
            return staticResult;
        }

        // 正则规则查找
        if (State.featureSet.enable_RegExp) {
            for (const [pattern, replacement] of State.pageConfig.regexpRules) {
                const result = text.replace(pattern, replacement);
                if (result !== text) {
                    return result;
                }
            }
        }

        // 开发者模式下记录未命中词条,便于完善词库
        if (State.featureSet.enable_dev) {
            recordMissedTerm(text);
        }

        return false;
    }

    /* =========================== 未命中词条记录 =========================== */

    /**
     * 记录未命中的英文词条(仅开发者模式)
     */
    function recordMissedTerm(text) {
        if (text.length < 2 || text.length > 100) return;
        if (/[\u4e00-\u9fa5]/.test(text)) return; // 含中文则跳过

        const list = JSON.parse(GM_getValue('missed_terms', '[]'));
        if (list.length >= 500) list.shift();
        const entry = { text, page: State.pageConfig.currentPageType, url: window.location.pathname };
        if (!list.some(item => item.text === text)) {
            list.push(entry);
            GM_setValue('missed_terms', JSON.stringify(list));
            console.log('[OpenRouter 汉化] 未翻译词条:', text, '(', State.pageConfig.currentPageType, ')');
        }
    }

    /* =========================== 菜单命令 =========================== */

    /**
     * 设置菜单命令(Tampermonkey 菜单)
     */
    function setupMenuCommands() {
        // 先注销旧菜单,避免重复注册
        Object.values(State.menuIds).forEach(id => {
            if (id) GM_unregisterMenuCommand(id);
        });
        State.menuIds = {};

        State.menuIds.toggleRegexp = GM_registerMenuCommand(
            (State.featureSet.enable_RegExp ? '✓ ' : '') + '正则翻译(切换)',
            () => {
                State.featureSet.enable_RegExp = !State.featureSet.enable_RegExp;
                GM_setValue('enable_RegExp', State.featureSet.enable_RegExp);
                setupMenuCommands(); // 刷新菜单显示
            }
        );

        State.menuIds.toggleDev = GM_registerMenuCommand(
            (State.featureSet.enable_dev ? '✓ ' : '') + '开发者模式(记录未翻译词条)',
            () => {
                State.featureSet.enable_dev = !State.featureSet.enable_dev;
                GM_setValue('enable_dev', State.featureSet.enable_dev);
                setupMenuCommands();
            }
        );

        State.menuIds.diag = GM_registerMenuCommand(
            '诊断:扫描未翻译词条',
            () => {
                diagScan();
            }
        );
    }

    /**
     * 诊断扫描:查找页面上疑似未翻译的文本节点
     * 输出节点的精确内容(含字节码)与词库匹配结果,用于排查词条不命中的原因
     */
    function diagScan() {
        const patterns = [/%\s*off/i, /UTF-8/i, /unlimited/i, /middle-out/i, /head-to-head/i];
        const hits = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.data;
            if (!text || text.length > 200) continue;
            if (patterns.some(p => p.test(text))) {
                const trimmed = text.trim();
                const cleaned = trimmed.replace(/\xa0|[\s]+/g, ' ').replace(/[\u200b\u200c\u200d\ufeff]/g, '');
                const result = fetchTransResult(cleaned);
                hits.push({
                    text,
                    hex: Array.from(text).map(c => c.charCodeAt(0).toString(16)).join(' '),
                    cleaned,
                    matched: result && result !== cleaned ? result : null,
                    parent: node.parentElement ? node.parentElement.tagName + '.' + String(node.parentElement.className).slice(0, 60) : ''
                });
            }
        }
        console.info('[OpenRouter 中文化插件] 诊断扫描完成,发现 ' + hits.length + ' 个相关节点:');
        hits.slice(0, 30).forEach(h => {
            console.info('节点: ' + JSON.stringify(h.text), '| 字节: ' + h.hex, '| 匹配: ' + (h.matched || '无'), '| 位置: ' + h.parent);
        });
        if (!hits.length) console.info('未发现 % off/UTF-8/unlimited/middle-out/head-to-head 相关节点');
    }

    /* =========================== 启动 =========================== */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})(window, document, undefined);

