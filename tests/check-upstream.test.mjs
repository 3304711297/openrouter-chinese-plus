/**
 * check-upstream.mjs 纯函数单元测试(node:test 内置运行器,零依赖)
 *
 * 运行:node --test tests/check-upstream.test.mjs
 *
 * 只测可导出的纯函数;主流程(main)在直接执行时才运行,
 * import 本模块不会发起任何网络请求。
 * 重点守护:parseStateText 拒绝缺失/损坏的状态文件——
 * 一旦静默回退到默认 buildNumber,产物版本号会倒退,脚本管理器将不再提示更新。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    extractDictVersion,
    extractEngineVersion,
    sha256,
    parseStateText,
    UnexpectedError,
    verifySnapshotHashes,
    SnapshotDriftError,
    EXIT_DRIFT,
} from '../scripts/check-upstream.mjs';

describe('extractDictVersion(词库版本提取)', () => {
    test('提取 version 字段', () => {
        assert.strictEqual(extractDictVersion("const I18N = { version: '1.5.22' };"), '1.5.22');
    });

    test('无 version 返回 null', () => {
        assert.strictEqual(extractDictVersion('no version here'), null);
    });
});

describe('extractEngineVersion(引擎 @version 提取)', () => {
    test('提取 @version', () => {
        assert.strictEqual(extractEngineVersion('// @version 1.5.22'), '1.5.22');
    });

    test('无头部返回 null', () => {
        assert.strictEqual(extractEngineVersion('no header'), null);
    });
});

describe('sha256', () => {
    test('与已知摘要一致', () => {
        assert.strictEqual(
            sha256('abc'),
            'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });
});

describe('parseStateText(状态文件校验——防 buildNumber 倒退)', () => {
    test('合法状态通过校验', () => {
        const r = parseStateText(JSON.stringify({ buildNumber: 2, sources: { datou1996: {} } }));
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.state.buildNumber, 2);
    });

    test('损坏 JSON 被拒绝并给出原因', () => {
        const r = parseStateText('{broken json');
        assert.strictEqual(r.ok, false);
        assert.match(r.reason, /JSON 解析失败/);
    });

    test('buildNumber 缺失、为 0、非整数、为字符串一律拒绝', () => {
        for (const bad of [
            JSON.stringify({ sources: {} }),
            JSON.stringify({ buildNumber: 0, sources: {} }),
            JSON.stringify({ buildNumber: '2', sources: {} }),
            JSON.stringify({ buildNumber: 1.5, sources: {} }),
        ]) {
            assert.strictEqual(parseStateText(bad).ok, false, `应拒绝: ${bad}`);
        }
    });

    test('sources 缺失或类型非法被拒绝', () => {
        assert.strictEqual(parseStateText(JSON.stringify({ buildNumber: 2 })).ok, false);
        assert.strictEqual(parseStateText(JSON.stringify({ buildNumber: 2, sources: [] })).ok, false);
    });

    test('顶层非对象(null/数组)被拒绝', () => {
        assert.strictEqual(parseStateText('null').ok, false);
        assert.strictEqual(parseStateText('[1,2]').ok, false);
    });
});

describe('UnexpectedError(仓库自身异常的分类标记)', () => {
    test('带 unexpected 标记,供退出码分流为失败', () => {
        const e = new UnexpectedError('状态文件损坏');
        assert.strictEqual(e.unexpected, true);
        assert.strictEqual(e.name, 'UnexpectedError');
    });
});

describe('verifySnapshotHashes(本地快照漂移检测)', () => {
    const config = {
        sources: [
            {
                name: 'datou1996',
                files: [{ local: 'sources/datou-locals.js' }, { local: 'sources/datou-main.user.js' }],
            },
        ],
    };
    const stateWith = (snapshotHashes) => ({
        sources: { datou1996: { snapshotHashes } },
    });
    /** 假的文件读取器:按路径返回内容,未登记路径抛错(模拟文件缺失) */
    const readerOf = (files) => (p) => {
        if (!(p in files)) throw new Error(`ENOENT: ${p}`);
        return files[p];
    };

    test('记录与文件一致时不误报', () => {
        const files = { 'sources/datou-locals.js': 'AAA', 'sources/datou-main.user.js': 'BBB' };
        const state = stateWith({
            'sources/datou-locals.js': sha256('AAA'),
            'sources/datou-main.user.js': sha256('BBB'),
        });
        assert.deepStrictEqual(verifySnapshotHashes(state, config, readerOf(files)), { ok: true });
    });

    test('文件被改动一个字节即报漂移,并给出记录值与实际值', () => {
        const state = stateWith({
            'sources/datou-locals.js': sha256('AAA'),
            'sources/datou-main.user.js': sha256('BBB'),
        });
        const files = { 'sources/datou-locals.js': 'AAB', 'sources/datou-main.user.js': 'BBB' };

        const r = verifySnapshotHashes(state, config, readerOf(files));
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.mismatches.length, 1, '只有被改动的文件应被报出');
        assert.deepStrictEqual(r.mismatches[0], {
            file: 'sources/datou-locals.js',
            expected: sha256('AAA'),
            actual: sha256('AAB'),
            kind: 'drift',
        });
        assert.match(r.reason, /sources\/datou-locals\.js/);
    });

    test('人工裁剪快照后未回写 state —— 本仓库历史上的真实事故形态被检出', () => {
        // hashes 记的是"上次拉取的上游原文",裁剪后本地文件已与之不同;
        // 若 snapshotHashes 仍沿用上游值,说明裁剪者忘了回写,必须报警
        const upstreamLocals = 'LOCALS_WITH_132_EXTRA_LINES';
        const trimmedLocals = 'LOCALS_TRIMMED';
        const state = {
            sources: {
                datou1996: {
                    hashes: { 'sources/datou-locals.js': sha256(upstreamLocals) },
                    snapshotHashes: { 'sources/datou-locals.js': sha256(upstreamLocals) },
                },
            },
        };
        const files = { 'sources/datou-locals.js': trimmedLocals };

        const r = verifySnapshotHashes(state, config, readerOf(files));
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.mismatches[0].file, 'sources/datou-locals.js');
        assert.strictEqual(r.mismatches[0].kind, 'drift');
    });

    test('重录哈希后同一裁剪快照不再报警(漂移可被显式认可)', () => {
        const trimmedLocals = 'LOCALS_TRIMMED';
        const trimmedConfig = {
            sources: [{ name: 'datou1996', files: [{ local: 'sources/datou-locals.js' }] }],
        };
        const state = stateWith({ 'sources/datou-locals.js': sha256(trimmedLocals) });
        assert.deepStrictEqual(
            verifySnapshotHashes(state, trimmedConfig, readerOf({ 'sources/datou-locals.js': trimmedLocals })),
            { ok: true }
        );
    });

    test('快照文件缺失/不可读记为漂移', () => {
        const files = { 'sources/datou-main.user.js': 'BBB' };
        const state = stateWith({
            'sources/datou-locals.js': sha256('AAA'),
            'sources/datou-main.user.js': sha256('BBB'),
        });

        const r = verifySnapshotHashes(state, config, readerOf(files));
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(r.mismatches, [
            { file: 'sources/datou-locals.js', expected: sha256('AAA'), actual: null, kind: 'unreadable' },
        ]);
    });

    test('snapshotHashes 字段缺失/非法一律拒绝——删字段不能绕过校验', () => {
        for (const bad of [undefined, null, 'x', [], 1]) {
            const state = { sources: { datou1996: { snapshotHashes: bad } } };
            const files = { 'sources/datou-locals.js': 'AAA', 'sources/datou-main.user.js': 'BBB' };
            const r = verifySnapshotHashes(state, config, readerOf(files));
            assert.strictEqual(r.ok, false, `应拒绝: ${JSON.stringify(bad)}`);
            assert.ok(r.mismatches.every((m) => m.kind === 'unrecorded'));
        }
    });

    test('state 中某文件无记录但文件存在,记为 unrecorded', () => {
        const state = stateWith({ 'sources/datou-main.user.js': sha256('BBB') });
        const files = { 'sources/datou-locals.js': 'AAA', 'sources/datou-main.user.js': 'BBB' };

        const r = verifySnapshotHashes(state, config, readerOf(files));
        assert.strictEqual(r.ok, false);
        assert.deepStrictEqual(r.mismatches, [
            { file: 'sources/datou-locals.js', expected: null, actual: sha256('AAA'), kind: 'unrecorded' },
        ]);
    });

    test('状态中尚无该来源(从未同步过)时跳过,不误报', () => {
        const r = verifySnapshotHashes({ sources: {} }, config, readerOf({}));
        assert.deepStrictEqual(r, { ok: true });
    });

    test('真实仓库当前状态无漂移(直接读取 upstream.state.json 与 sources/ 实际文件)', () => {
        const state = JSON.parse(readFileSync(new URL('../upstream.state.json', import.meta.url), 'utf8'));
        const realConfig = JSON.parse(readFileSync(new URL('../upstream.config.json', import.meta.url), 'utf8'));

        const r = verifySnapshotHashes(state, realConfig);
        assert.strictEqual(r.ok, true, `仓库快照应无漂移,实际: ${JSON.stringify(r.mismatches)}`);
    });
});

describe('SnapshotDriftError 与退出码 30(快照漂移的专用分流)', () => {
    test('带 drift 标记且不与既有退出码冲突', () => {
        const e = new SnapshotDriftError('快照漂移', []);
        assert.strictEqual(e.drift, true);
        assert.strictEqual(e.name, 'SnapshotDriftError');
        assert.ok(!e.unexpected, '应与"状态文件损坏(20)"区分开,处置方式不同');
        assert.strictEqual(EXIT_DRIFT, 30);
        assert.ok(![0, 10, 20].includes(EXIT_DRIFT), '不能与既有 0/10/20 语义冲突');
    });
});
