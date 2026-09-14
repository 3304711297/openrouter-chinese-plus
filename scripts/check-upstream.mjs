/**
 * 上游词库检查与同步
 *
 * 职责:
 *   1. 按 upstream.config.json 逐个尝试上游仓库(含镜像),拉取词库与引擎文件
 *   2. 校验本地快照文件未被人工改动:实际 sha256 必须等于 state 里 snapshotHashes
 *      记录值,不符即以退出码 30 报错退出(人工裁剪快照属有意改动,必须显式重录哈希)
 *   3. 与 upstream.state.json 中记录的哈希比对,判断是否有更新
 *   4. 有更新 → 覆盖 sources/ 下的本地快照,递增 buildNumber,记录新版本号
 *   5. 上游不可用(删除/断网/改名)→ 记录状态并正常退出,绝不改动本地快照
 *
 * 设计原则:本仓库的 sources/ 是完整的 vendored 快照,上游消失只影响"能否跟进新词库",
 * 不影响本项目继续构建、发布和维护。工作流因此永远不会因上游挂掉而变红。
 *
 * 退出码:0 = 无需处理(无更新或上游不可用);10 = 快照已更新,需要重新构建;
 *       20 = 本仓库自身状态异常(如 upstream.state.json 缺失/损坏)——绝不能静默,
 *       否则重算会从默认 buildNumber 起步、产物版本号倒退,脚本管理器将不再提示更新;
 *       30 = 本地快照与本仓库记录(snapshotHashes)不符——人工改动过 sources/ 却未重录哈希。
 *       与 20 分开是因为人工处置方式不同(20:从 git 历史恢复 state;30:先判断改动是否有意),
 *       且必须中止本次同步:继续跑只会让上游更新整文件覆盖掉人工改动而不留痕迹。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(projectRoot, 'upstream.config.json');
const STATE_PATH = join(projectRoot, 'upstream.state.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

const EXIT_OK = 0;
const EXIT_UPDATED = 10;
const EXIT_UNEXPECTED = 20;
const EXIT_DRIFT = 30;

/** 标记"本仓库自身状态异常"的错误:必须让工作流变红,不允许当作网络问题静默放过 */
class UnexpectedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnexpectedError';
        this.unexpected = true;
    }
}

/**
 * 标记"本地快照与 snapshotHashes 记录不符"的错误。
 * 与 UnexpectedError 分开分类:处置方式不同——状态文件损坏是从 git 历史恢复 state,
 * 而快照漂移要先判断"人工改动是否有意",再决定重录哈希还是恢复文件。
 */
class SnapshotDriftError extends Error {
    constructor(message, mismatches) {
        super(message);
        this.name = 'SnapshotDriftError';
        this.drift = true;
        this.mismatches = mismatches;
    }
}

/**
 * 校验状态文件内容(纯函数,供单元测试)。
 * buildNumber 是产物版本号的基准,缺失/非法时宁可选择失败也绝不静默回退到默认值——
 * 一旦从默认值重算,哪怕上游内容没变,版本号也会从 1.2.2 倒退成 x.1,
 * 脚本管理器会把降版视为"已是最新",用户从此收不到更新。
 * @returns {{ok: true, state: object} | {ok: false, reason: string}}
 */
function parseStateText(raw) {
    let state;
    try {
        state = JSON.parse(raw);
    } catch (e) {
        return { ok: false, reason: `JSON 解析失败: ${e.message}` };
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
        return { ok: false, reason: '顶层必须是对象' };
    }
    if (!Number.isInteger(state.buildNumber) || state.buildNumber < 1) {
        return { ok: false, reason: `buildNumber 非法(${JSON.stringify(state.buildNumber)}),必须是 >=1 的整数` };
    }
    if (typeof state.sources !== 'object' || state.sources === null || Array.isArray(state.sources)) {
        return { ok: false, reason: 'sources 缺失或类型非法' };
    }
    return { ok: true, state };
}

function loadState() {
    let raw;
    try {
        raw = readFileSync(STATE_PATH, 'utf8');
    } catch (e) {
        throw new UnexpectedError(
            `无法读取状态文件 upstream.state.json(${e.message})。` +
            '该文件随仓库提交,缺失说明仓库被改动;拒绝以默认 buildNumber 重建以免版本号倒退,请先恢复该文件。'
        );
    }
    const parsed = parseStateText(raw);
    if (!parsed.ok) {
        throw new UnexpectedError(
            `状态文件 upstream.state.json 已损坏(${parsed.reason})。` +
            '拒绝自动重建以免版本号倒退,请从 git 历史恢复该文件。'
        );
    }
    return parsed.state;
}

function saveState(state) {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 校验本地快照文件与 state 里 snapshotHashes 记录是否一致(纯函数,供单元测试)。
 *
 * 为什么需要这一步:sources/ 是上游快照,但允许人工裁剪(如 2026-09 的词库死重清理)。
 * 人工改动后必须把新哈希重录进 snapshotHashes,否则 state 不再描述被跟踪的文件,
 * 漂移对同步机制永久隐形、任何 CI 都不报;而一旦上游真更新,整文件覆盖会静默回填
 * 被删内容,清理成果无声丢失。这里把它变成显式可检测。
 *
 * 语义与 hashes 严格分离:hashes 是"上次拉取的上游内容哈希",只用于更新检测,
 * 本函数绝不读它;snapshotHashes 是"当前本地快照文件哈希",只用于漂移检测。
 *
 * 校验前不写任何文件、不发任何请求;无漂移时行为与原实现完全一致(仅多读一次文件)。
 * @param {object} state 已通过 parseStateText 校验的状态对象
 * @param {object} [conf=config] 上游配置(默认上游配置,测试可注入)
 * @param {(localPath: string) => string} [readUtf8] 文件读取器(默认读仓库内实际文件)
 * @returns {{ok: true} | {ok: false, reason: string, mismatches: Array<{file: string, expected: string|null, actual: string|null, kind: 'drift'|'unrecorded'|'unreadable'}>}}
 */
function verifySnapshotHashes(state, conf = config, readUtf8 = (p) => readFileSync(join(projectRoot, p), 'utf8')) {
    const mismatches = [];

    for (const source of conf.sources) {
        const entry = state.sources?.[source.name];
        // 从未同步过该来源(如首次部署前的 state):无从谈起漂移,交给后续流程处理
        if (!entry) continue;

        const recorded = entry.snapshotHashes;
        const recordedOk = recorded && typeof recorded === 'object' && !Array.isArray(recorded);

        for (const f of source.files) {
            const expected = recordedOk && typeof recorded[f.local] === 'string' ? recorded[f.local] : null;

            let actual;
            try {
                actual = sha256(readUtf8(f.local));
            } catch {
                // 文件缺失/不可读:优先报这一条,因为它比"内容不符"更根本
                mismatches.push({ file: f.local, expected, actual: null, kind: 'unreadable' });
                continue;
            }

            if (expected === null) {
                mismatches.push({ file: f.local, expected: null, actual, kind: 'unrecorded' });
            } else if (actual !== expected) {
                mismatches.push({ file: f.local, expected, actual, kind: 'drift' });
            }
        }
    }

    if (mismatches.length === 0) return { ok: true };

    const detail = mismatches
        .map((m) => {
            if (m.kind === 'unreadable') return `${m.file}: 文件缺失/不可读(记录值 ${m.expected})`;
            if (m.kind === 'unrecorded') return `${m.file}: state 无 snapshotHashes 记录(实际 ${m.actual})`;
            return `${m.file}: 记录 ${m.expected} ≠ 实际 ${m.actual}`;
        })
        .join('; ');

    return {
        ok: false,
        reason:
            `本地快照与 upstream.state.json 的 snapshotHashes 记录不符: ${detail}。` +
            'sources/ 的快照被人工改动后,必须把新哈希写入 snapshotHashes 才算显式生效;' +
            '否则上游下次更新会整文件覆盖、静默回填被删内容。' +
            '请确认改动是否有意:有意 → 重录 snapshotHashes;无意 → 从 git 恢复文件。',
        mismatches,
    };
}

const UA = 'openrouter-chinese-plus-updater';

async function fetchText(url) {
    // 优先直接请求(CI 环境直连);失败后回退 curl —— curl 自动遵循
    // http_proxy/https_proxy 环境变量,兼容本地开发环境代理上网的场景
    try {
        // AbortSignal.timeout:Node fetch 默认无请求超时,最坏情况可挂数分钟;
        // 与 curl 回退的 --max-time 30 对齐
        const res = await fetch(url, {
            redirect: 'follow',
            headers: { 'user-agent': UA },
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.text();
    } catch (directError) {
        // -f:HTTP >= 400 视为失败(仓库不存在/已删除时返回 404 页面而非内容,
        // 绝不能把 404 页面当成上游文件写进快照)
        const { stdout } = await execFileAsync(
            'curl',
            ['-sSLf', '--max-time', '30', '-A', UA, url],
            { maxBuffer: 20 * 1024 * 1024 }
        );
        if (!stdout) throw directError;
        return stdout;
    }
}

/** 从 locals.js 内容提取词库版本号 */
function extractDictVersion(localsText) {
    const m = localsText.match(/version:\s*'([^']+)'/);
    return m ? m[1] : null;
}

/** 从引擎脚本提取 @version */
function extractEngineVersion(engineText) {
    const m = engineText.match(/@version\s+(\S+)/);
    return m ? m[1] : null;
}

/**
 * 尝试从一组候选仓库拉取一个 source 的全部文件
 * @returns {{ok: boolean, repoUsed?: string, files?: Object<string,string>, error?: Error}}
 */
async function fetchSource(source) {
    const candidates = [source.repo, ...(source.mirrors || [])];
    let lastError = null;
    for (const repo of candidates) {
        try {
            const files = {};
            for (const f of source.files) {
                files[f.local] = await fetchText(
                    `https://raw.githubusercontent.com/${repo}/${source.branch}/${f.remote}`
                );
            }
            return { ok: true, repoUsed: repo, files };
        } catch (e) {
            lastError = e;
            console.warn(`[upstream] 候选仓库不可用: ${repo} (${e.message})`);
        }
    }
    return { ok: false, error: lastError };
}

async function main() {
    const state = loadState();
    state.sources = state.sources || {};
    let anyChanged = false;   // 上游内容有实质更新(需要重新构建)
    let stateDirty = false;   // 状态文件需要落盘(内容有实质变化才写,避免时间戳churn)

    // 先做本地自检:快照漂移(人工改了 sources/ 却没重录哈希)必须在拉取上游之前拦下。
    // 否则下方"检测到更新"分支会直接用上游原文整文件覆盖快照,把人工改动冲掉且不留痕迹。
    // 这条校验只读本地文件、不发网络请求,无漂移时对后续流程零影响。
    const drift = verifySnapshotHashes(state);
    if (!drift.ok) throw new SnapshotDriftError(drift.reason, drift.mismatches);

    for (const source of config.sources) {
        const prev = state.sources[source.name] || {};
        const result = await fetchSource(source);
        const now = new Date().toISOString();

        if (!result.ok) {
            // 上游全部候选仓库不可用:保留本地快照原样,仅记录状态
            const entry = {
                ...prev,
                status: 'unavailable',
                checkedAt: now,
                lastError: result.error ? String(result.error.message || result.error) : 'unknown',
            };
            // 与上次状态完全一致则不落盘(上游长期消失时避免每次调度都产生提交)
            if (JSON.stringify(entry) !== JSON.stringify(prev)) {
                state.sources[source.name] = entry;
                stateDirty = true;
            }
            console.warn(
                `[upstream] ⚠ 上游 "${source.name}" 全部候选仓库均不可用,` +
                `继续使用本地快照(构建不受影响)。上次已知版本: ${prev.versions?.dict || '未知'}`
            );
            continue;
        }

        const hashes = {};
        for (const [local, text] of Object.entries(result.files)) {
            hashes[local] = sha256(text);
        }
        const versions = {
            dict: extractDictVersion(result.files[source.files[0].local]),
            engine: extractEngineVersion(result.files[source.files.find(f => f.remote.endsWith('.user.js'))?.local] || ''),
        };

        const unchanged =
            prev.hashes && Object.entries(hashes).every(([k, v]) => prev.hashes[k] === v);

        if (unchanged) {
            // 无更新:不落盘(时间戳等易变字段不写入),工作流不会因此产生空提交
            console.log(`[upstream] "${source.name}" 无更新 (词库 v${versions.dict})`);
        } else {
            // 写入新快照并递增构建号,驱动产物版本号上涨以触发用户端自动更新
            for (const [local, text] of Object.entries(result.files)) {
                writeFileSync(join(projectRoot, local), text, 'utf8');
            }
            state.buildNumber = (state.buildNumber || 0) + 1;
            state.sources[source.name] = {
                ...prev,
                status: 'updated',
                repoUsed: result.repoUsed,
                checkedAt: now,
                lastChangedAt: now,
                hashes,
                // 快照刚由上游原文整文件重写,本地内容 === 上游内容:
                // 同步重录 snapshotHashes,使下一次自检认为"无漂移"
                snapshotHashes: hashes,
                versions,
                lastError: null,
            };
            anyChanged = true;
            stateDirty = true;
            console.log(`[upstream] ✓ "${source.name}" 检测到更新: 词库 v${prev.versions?.dict || '?'} → v${versions.dict},buildNumber → ${state.buildNumber}`);
        }
    }

    if (stateDirty) saveState(state);
    process.exitCode = anyChanged ? EXIT_UPDATED : EXIT_OK;
}

/**
 * 仅在直接执行本脚本时运行 main(node scripts/check-upstream.mjs)。
 * 被测试文件 import 时绝不触发网络请求——此前 main() 在模块顶层无条件执行,
 * 任何针对本文件的单元测试都会变成一次真实的上游拉取。
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((e) => {
        if (e && e.drift) {
            // 本地快照被人工改动却没重录 snapshotHashes:以专用退出码 30 失败。
            // 必须中止本次同步——继续跑只会让上游更新整文件覆盖掉人工改动,清理成果无声丢失。
            console.error('[upstream] ✗ 本地快照漂移,需要人工确认:', e.message);
            process.exit(EXIT_DRIFT);
        }
        if (e && e.unexpected) {
            // 本仓库自身状态异常(状态文件缺失/损坏等):以非 0/10 退出码失败,
            // 工作流据此变红报警——这类问题静默放过会导致版本号倒退或词库停更无人察觉
            console.error('[upstream] ✗ 本仓库状态异常,需要人工介入:', e.message);
            process.exit(EXIT_UNEXPECTED);
        }
        // 网络异常等环境性错误:保持快照不动,由下次调度重试,不视为失败
        console.error('[upstream] 检查过程发生网络异常(不影响现有构建):', e);
        process.exit(EXIT_OK);
    });
}

export {
    extractDictVersion,
    extractEngineVersion,
    sha256,
    parseStateText,
    verifySnapshotHashes,
    UnexpectedError,
    SnapshotDriftError,
    EXIT_OK,
    EXIT_UPDATED,
    EXIT_UNEXPECTED,
    EXIT_DRIFT,
};
