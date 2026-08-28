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
import {
    extractDictVersion,
    extractEngineVersion,
    sha256,
    parseStateText,
    UnexpectedError,
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
