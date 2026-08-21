/**
 * 上游词库检查与同步
 *
 * 职责:
 *   1. 按 upstream.config.json 逐个尝试上游仓库(含镜像),拉取词库与引擎文件
 *   2. 与 upstream.state.json 中记录的哈希比对,判断是否有更新
 *   3. 有更新 → 覆盖 sources/ 下的本地快照,递增 buildNumber,记录新版本号
 *   4. 上游不可用(删除/断网/改名)→ 记录状态并正常退出,绝不改动本地快照
 *
 * 设计原则:本仓库的 sources/ 是完整的 vendored 快照,上游消失只影响"能否跟进新词库",
 * 不影响本项目继续构建、发布和维护。工作流因此永远不会因上游挂掉而变红。
 *
 * 退出码:0 = 无需处理(无更新或上游不可用);10 = 快照已更新,需要重新构建。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(projectRoot, 'upstream.config.json');
const STATE_PATH = join(projectRoot, 'upstream.state.json');

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

function loadState() {
    try {
        return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
    } catch (e) {
        return { buildNumber: 1, sources: {} };
    }
}

function saveState(state) {
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

const UA = 'openrouter-chinese-plus-updater';

async function fetchText(url) {
    // 优先直接请求(CI 环境直连);失败后回退 curl —— curl 自动遵循
    // http_proxy/https_proxy 环境变量,兼容本地开发环境代理上网的场景
    try {
        const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA } });
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
                versions,
                lastError: null,
            };
            anyChanged = true;
            stateDirty = true;
            console.log(`[upstream] ✓ "${source.name}" 检测到更新: 词库 v${prev.versions?.dict || '?'} → v${versions.dict},buildNumber → ${state.buildNumber}`);
        }
    }

    if (stateDirty) saveState(state);
    process.exitCode = anyChanged ? 10 : 0;
}

main().catch((e) => {
    // 网络异常等意外错误同样不视为失败:保持快照不动,由下次调度重试
    console.error('[upstream] 检查过程发生异常(不影响现有构建):', e);
    process.exit(0);
});
