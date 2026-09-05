/**
 * 组装脚本:生成单文件 userscript
 *
 * 结构:
 *   1. 元数据头(含来源署名、远程安装/自动更新地址)
 *   2. datou-locals.js 词库(内联,定义 const I18N)
 *   3. datou-main.user.js 引擎主体(去掉原元数据头)
 *   4. cny-price.module.js 人民币价格模块(原创)
 *
 * 版本号规则:`<ourBase>.<buildNumber>`
 *   - ourBase:我们自己的功能版本,人工改动功能后手动递增
 *     (唯一权威来源是下方 OUR_BASE 常量;upstream.state.json 不再记录,
 *      避免出现 state 与构建脚本各存一份、日久漂移的双源问题)
 *   - buildNumber:upstream.state.json 中的构建号,上游词库每次实际更新时由
 *     scripts/check-upstream.mjs 自动 +1,保证脚本管理器能识别到新版本
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(root, name), 'utf8');

/* ====== 发布配置 ====== */
const REPO_OWNER = '3304711297';
const REPO_NAME = 'openrouter-chinese-plus';
const OUR_BASE = '1.3'; // 我们自己的功能版本号,有功能性改动时手动递增(本次:词库死重清理,无行为变化)

/**
 * 校验状态文件中的 buildNumber(纯函数,供单元测试)。
 * buildNumber 是产物版本号的组成部分,非法时必须中止构建、绝不回退默认值 1——
 * 否则本地直接 npm run build 会静默产出降版本号的脚本(如 1.3.2 → 1.3.1),
 * 脚本管理器会把降版视为"已是最新",用户从此收不到更新。
 * @returns {{ok: true, buildNumber: number} | {ok: false, reason: string}}
 */
function validateBuildNumber(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return { ok: false, reason: '状态文件顶层必须是对象' };
    }
    if (!Number.isInteger(state.buildNumber) || state.buildNumber < 1) {
        return {
            ok: false,
            reason: `buildNumber 非法(${JSON.stringify(state.buildNumber) ?? '缺失'}),必须是 >=1 的整数`,
        };
    }
    return { ok: true, buildNumber: state.buildNumber };
}

function stripUserscriptHeader(source) {
    const endMarker = '// ==/UserScript==';
    const idx = source.indexOf(endMarker);
    if (idx === -1) throw new Error('未找到 UserScript 头部结束标记');
    return source.slice(idx + endMarker.length).replace(/^\r?\n/, '');
}

function main() {
    const state = JSON.parse(readFileSync(join(root, 'upstream.state.json'), 'utf8'));
    const validated = validateBuildNumber(state);
    if (!validated.ok) {
        throw new Error(
            `状态文件 upstream.state.json 非法(${validated.reason}),中止构建。` +
            '请先运行 check-upstream 或修复 upstream.state.json,' +
            '拒绝以默认 buildNumber 构建以免版本倒退。'
        );
    }
    const BUILD_NUMBER = validated.buildNumber;
    const VERSION = `${OUR_BASE}.${BUILD_NUMBER}`;
    const UPSTREAM_DICT_VERSION =
        (state.sources && state.sources.datou1996 && state.sources.datou1996.versions?.dict) || '未知';
    const RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/openrouter-chinese-plus.user.js`;

    const HEADER = `// ==UserScript==
// @name         OpenRouter 中文化增强版
// @namespace    openrouter-chinese-plus
// @description  中文化 OpenRouter 全站界面,并为模型价格追加人民币参考价。翻译引擎与词库基于 datou1996/openrouter-chinese (MIT);人民币价格为原创实现,设计思路参考 LynnGuo666/OpenRouter_Chinese
// @version      ${VERSION}
// @author       openrouter-chinese-plus
// @license      MIT
// @icon         https://openrouter.ai/favicon.ico
// @match        https://openrouter.ai/*
// @noframes     页面内嵌 iframe 不注入,避免重复菜单命令与重复标注
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      query1.finance.yahoo.com
// @connect      api.frankfurter.dev
// @homepageURL  https://github.com/${REPO_OWNER}/${REPO_NAME}
// @supportURL   https://github.com/${REPO_OWNER}/${REPO_NAME}/issues
// @downloadURL  ${RAW_URL}
// @updateURL    ${RAW_URL}
// ==/UserScript==

/**
 * 来源与取舍说明(Three-way merge):
 *
 * 1. 翻译引擎与全站词库 —— 取自 datou1996/openrouter-chinese (脚本头声明 MIT)
 *    https://github.com/datou1996/openrouter-chinese
 *    选择理由:三者中覆盖面最广(20+ 页面类型)、迭代最活跃、排障菜单完善。
 *    改动一:词库由 @require 外链改为单文件内联,消除 Tampermonkey 词库缓存
 *    导致"更新后不生效"的问题(原项目 FAQ 的头号问题)。
 *    改动二:本仓库通过 GitHub Actions 定时检测上游更新并自动重组,
 *    上游快照已完整保存在 sources/ 目录,即使上游项目消失也不影响使用与维护。
 *    当前内联词库版本:v${UPSTREAM_DICT_VERSION}
 *
 * 2. 人民币价格增强 —— 本文件原创实现,仅设计思路参考
 *    LynnGuo666/OpenRouter_Chinese (PolyForm Noncommercial 1.0.0,未复制其任何代码)
 *    https://github.com/LynnGuo666/OpenRouter_Chinese
 *    保留官方美元价,追加 ≈¥ 参考价;汇率 Yahoo Finance 优先、Frankfurter 兜底,
 *    缓存 30 分钟,最长回退 72 小时;支持手动汇率;/chat 与 /fusion 不启用,
 *    SPA 路由进入后自动清除已显示的参考价标记。
 *
 * 3. isdoge/openrouter-chinese (MIT) —— 经评估未并入:
 *    其页面覆盖为 datou 版子集,且无独有功能,近一个月无更新。
 *    https://github.com/isdoge/openrouter-chinese
 *
 * 本合并作品按 MIT 许可证发布;上游词库内容版权归原作者所有。
 */

`;

    const locals = read('sources/datou-locals.js').trimEnd();
    const engine = stripUserscriptHeader(read('sources/datou-main.user.js')).trimEnd();
    const cny = read('cny-price.module.js').trimEnd();

    const banner = `/* ==== 词库(内联自 datou1996/openrouter-chinese locals.js v${UPSTREAM_DICT_VERSION})==== */\n`;
    const engineBanner = '\n/* ==== 翻译引擎(取自 datou1996/openrouter-chinese main.user.js)==== */\n';
    const cnyBanner = '\n';

    const output = HEADER + banner + locals + '\n' + engineBanner + engine + '\n' + cnyBanner + cny + '\n';

    const outPath = join(root, 'openrouter-chinese-plus.user.js');
    writeFileSync(outPath, output, 'utf8');
    console.log(`已生成: ${outPath} (${output.length} 字节,版本 ${VERSION},上游词库 v${UPSTREAM_DICT_VERSION})`);
}

/**
 * 仅在直接执行本脚本时运行 main(node build.mjs)。
 * 被测试文件 import 时绝不触发真实构建——与 scripts/check-upstream.mjs 的守卫模式一致。
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

export { validateBuildNumber };
