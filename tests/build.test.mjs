/**
 * build.mjs 状态校验单元测试(node:test 内置运行器,零依赖)
 *
 * 运行:node --test tests/build.test.mjs
 *
 * 只测可导出的纯函数 validateBuildNumber;main 仅在直接执行 build.mjs 时运行,
 * import 本模块不会触发真实构建。
 * 重点守护:buildNumber 非法时拒绝构建——若静默回退默认值 1,
 * 本地 npm run build 会产出降版本号的脚本(如 1.3.2 → 1.3.1),
 * 脚本管理器会把降版视为"已是最新",用户从此收不到更新。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBuildNumber, resolveRawUrl, resolveChannel, OUR_BASE, REPO_OWNER, REPO_NAME } from '../build.mjs';

describe('validateBuildNumber(build 状态校验——防版本倒退)', () => {
    test('合法 buildNumber 通过并原样返回', () => {
        const r = validateBuildNumber({ buildNumber: 2, sources: { datou1996: {} } });
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.buildNumber, 2);
    });

    test('buildNumber 缺失、为 0、非整数、为字符串、为负数一律拒绝', () => {
        for (const bad of [
            { sources: {} },
            { buildNumber: 0, sources: {} },
            { buildNumber: '2', sources: {} },
            { buildNumber: 1.5, sources: {} },
            { buildNumber: -1, sources: {} },
            { buildNumber: null, sources: {} },
        ]) {
            assert.strictEqual(validateBuildNumber(bad).ok, false, `应拒绝: ${JSON.stringify(bad)}`);
        }
    });

    test('拒绝原因指出 buildNumber 非法及合法取值', () => {
        const r = validateBuildNumber({ buildNumber: '2', sources: {} });
        assert.strictEqual(r.ok, false);
        assert.match(r.reason, /buildNumber 非法/);
        assert.match(r.reason, />=1 的整数/);
    });

    test('顶层非对象(null/数组)被拒绝', () => {
        assert.strictEqual(validateBuildNumber(null).ok, false);
        assert.strictEqual(validateBuildNumber([1]).ok, false);
    });
});

describe('版本规范与基线对齐(v1.3.3+ 递增)', () => {
    test('OUR_BASE 与 upstream.state.json 组装版本不低于 1.3.3', () => {
        const state = JSON.parse(readFileSync(new URL('../upstream.state.json', import.meta.url), 'utf8'));
        const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

        assert.strictEqual(OUR_BASE, '1.3');
        assert.ok(state.buildNumber >= 3, `upstream.state.json buildNumber 必须 >= 3，当前为: ${state.buildNumber}`);

        const currentVersion = `${OUR_BASE}.${state.buildNumber}`;
        assert.match(currentVersion, /^1\.3\.[3-9]\d*$/, `产物构建版本必须符合 v1.3.3+ 基线递增规范，当前为: ${currentVersion}`);
        assert.match(pkg.version, /^1\.3\.[3-9]\d*$/, `package.json 版本必须符合 v1.3.3+ 基线规范，当前为: ${pkg.version}`);
    });
});

describe('通道解析与 RAW_URL 构建(--channel=stable 校验)', () => {
    test('默认（未传参）解析为 rolling 通道并指向 main 原始文件', () => {
        assert.strictEqual(resolveChannel([]), 'rolling');
        assert.strictEqual(
            resolveRawUrl([]),
            `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/openrouter-chinese-plus.user.js`
        );
    });

    test('--channel=stable 解析为 stable 通道并指向 releases latest 下载地址', () => {
        const args = ['--channel=stable'];
        assert.strictEqual(resolveChannel(args), 'stable');
        assert.strictEqual(
            resolveRawUrl(args),
            `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/openrouter-chinese-plus.user.js`
        );
    });

    test('--channel stable 形式亦可正确识别为 stable 通道', () => {
        const args = ['--channel', 'stable'];
        assert.strictEqual(resolveChannel(args), 'stable');
        assert.strictEqual(
            resolveRawUrl(args),
            `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/openrouter-chinese-plus.user.js`
        );
    });

    test('其他未知参数回退为 rolling 通道', () => {
        const args = ['--channel=beta', '--foo'];
        assert.strictEqual(resolveChannel(args), 'rolling');
        assert.strictEqual(
            resolveRawUrl(args),
            `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/openrouter-chinese-plus.user.js`
        );
    });
});


