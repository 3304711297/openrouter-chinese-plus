# OpenRouter 中文化增强版

一个油猴脚本,做两件事:

1. **全站中文化** [openrouter.ai](https://openrouter.ai) 界面(模型、工作区、排行榜、设置、文档等 20+ 种页面)
2. **人民币价格参考**:保留官方美元价,在模型价格旁追加 `≈¥xx` 换算参考价

最终产物为单文件 [`openrouter-chinese-plus.user.js`](./openrouter-chinese-plus.user.js),适用于 **ScriptCat(脚本猫)** 与 Tampermonkey。

## 三个上游项目的取舍

| 上游项目 | 取舍 | 理由 |
|---|---|---|
| [datou1996/openrouter-chinese](https://github.com/datou1996/openrouter-chinese) | ✅ 整体采用(引擎 + 词库,MIT) | 三者中覆盖面最广(20+ 页面类型)、迭代最活跃、排障菜单完善 |
| [LynnGuo666/OpenRouter_Chinese](https://github.com/LynnGuo666/OpenRouter_Chinese) | 💡 仅借鉴"人民币价格"功能思路,**代码全部重写** | 其代码为 PolyForm Noncommercial 许可(禁止商用),不能直接复用;重写后本作品可整体按 MIT 发布 |
| [isdoge/openrouter-chinese](https://github.com/isdoge/openrouter-chinese) | ❌ 未并入 | 页面覆盖为 datou 版子集,无独有功能,且已近一个月无更新 |

相对 datou 原版的两处结构改动:

1. **词库由 `@require` 外链改为单文件内联**,消除脚本管理器缓存外部文件导致"更新词库后不生效"的问题(原项目 FAQ 的头号问题)。代价是单文件体积约 330 KB。
2. **上游快照 vendor 进本仓库 + GitHub Actions 定时自动同步**(见下文),上游项目消失也不影响使用与维护。

## 安装

### 方式一:远程链接安装(推荐,支持自动更新)

在装有 [ScriptCat](https://github.com/scriptscat/scriptcat) 或 [Tampermonkey](https://www.tampermonkey.net/) 的浏览器中打开,直连 / 镜像双入口任选其一:

```text
# 直连
https://raw.githubusercontent.com/3304711297/openrouter-chinese-plus/main/openrouter-chinese-plus.user.js
# 镜像(国内建议用镜像,无需代理)
https://cdn.jsdelivr.net/gh/3304711297/openrouter-chinese-plus@main/openrouter-chinese-plus.user.js
```

脚本管理器会弹出安装确认。安装后脚本管理器会定期检查同一地址获取新版本(`@downloadURL`/`@updateURL` 已指向 raw 直连链接),有更新时自动升级。

> - 分支文件在 jsDelivr 有约 12 小时 CDN 缓存,新版本可能延迟生效;急着更新可走直连
> - 使用脚本猫的用户同样支持上述直连/镜像两种安装方式,更新检测逻辑一致
> - 国内直连 `raw.githubusercontent.com` 通常不通,需要代理环境;镜像无需代理

更新检测说明:`@version` 递增是脚本管理器判断"是否为更新版本"的核心版本依据,实际更新检测还涉及 `@updateURL`、安装源与管理器策略。

### 方式二:本地文件安装

下载 [`openrouter-chinese-plus.user.js`](./openrouter-chinese-plus.user.js) 后拖入浏览器窗口,由脚本猫/Tampermonkey 接管安装;或在脚本管理器面板"创建脚本"后粘贴全部内容保存。

### ScriptCat 首次授权说明

首次使用时脚本猫会就跨域汇率请求(Yahoo Finance / Frankfurter)询问授权:允许后自动获取实时汇率;拒绝则使用默认汇率 7.2 或在菜单中设置手动汇率。

## 功能明细

**翻译部分**(来自 datou 版,词库 v1.5.22,523 条公共词条):

- 静态词典精确匹配 + 正则规则模糊匹配(数字单位、日期、价格、百分比)
- 按 URL 识别页面类型加载对应词条;MutationObserver + TreeWalker 只改文本节点,不破坏 React 组件
- 处理 React 拆分文本节点(如 `90` + `% off`);页面标题翻译
- 忽略规则保护代码块、API Key、聊天输入框
- 油猴菜单:正则翻译开关、开发者模式(记录未翻译词条)、诊断扫描

**人民币价格部分**(原创实现):

- 保留官方美元价,追加 `≈¥` 参考价;免费模型($0)不标注
- 兼容两种 DOM 形态:价格完整在同一文本节点;React 把 `$`/数字/单位拆成多个文本节点
- React 事后修正价格数字时(如四舍五入),参考价自动同步刷新
- 汇率链路:Yahoo Finance → Frankfurter 兜底 → 30 分钟缓存 → 最长回退 72 小时旧值 → 默认 7.2
- 纯本地换算,不发送任何页面数据;`/chat` 与 `/fusion` 页面不启用

**脚本菜单**:

- ✓ 人民币价格显示(切换)
- 设置手动汇率
- 恢复自动汇率(Yahoo/Frankfurter)
- 正则翻译(切换)/ 开发者模式 / 诊断扫描(继承自 datou 版)

## 上游词库自动同步

本仓库通过 [`.github/workflows/upstream-sync.yml`](./.github/workflows/upstream-sync.yml) **每 6 小时**自动检测上游词库更新:

```
定时触发 → scripts/check-upstream.mjs 拉取上游 locals.js / main.user.js
        → 与 upstream.state.json 中的哈希比对
        ├─ 有更新 → 覆盖 sources/ 快照 → buildNumber+1 → 重新构建产物 → 自动提交推送
        ├─ 无更新 → 结束
        └─ 上游不可用 → 记录状态,警告日志,正常结束(工作流保持绿色)
```

产物版本号为 `<功能版本>.<构建号>`(如 `1.1.2`),上游每实际更新一次构建号 +1,保证脚本管理器能识别到新版本并自动升级用户端。

### 上游消失了怎么办?

`sources/` 目录保存的是上游文件的**完整本地快照**(vendored),构建永远只依赖快照,不依赖上游在线。因此:

- **上游仓库删除/改名/断网**:同步脚本记录 `unavailable` 状态并跳过,本仓库照常构建发布,已安装用户完全不受影响;只是暂时收不到新词库。
- **上游归档(archived)**:归档仓库的 raw 文件仍可访问,自动同步照常工作。
- **上游彻底死亡**:把社区 fork 加进 [`upstream.config.json`](./upstream.config.json) 的 `mirrors` 数组即可切换同步源,无需改任何代码:

```json
{ "repo": "datou1996/openrouter-chinese", "mirrors": ["someone/fork", "another/fork"] }
```

- 最坏情况(没有任何人维护 fork):本仓库的快照就是最后版本,可以自行按原词库格式继续维护 `sources/datou-locals.js`,同步机制对本地改动同样生效。

## 开发

```bash
node scripts/check-upstream.mjs   # 检查上游更新(有更新时更新快照并递增构建号,退出码 10)
node build.mjs                    # 由 sources/ 与 cny-price.module.js 组装生成单文件产物
node --check openrouter-chinese-plus.user.js   # 语法校验
node --test tests/cny-price.test.cjs   # 人民币价格模块单元测试(零依赖,node:test)
node serve-test.mjs               # 本地 CORS 测试服务(端口 8931,供浏览器注入实测用)
```

目录结构:

```
openrouter-chinese/
├── openrouter-chinese-plus.user.js   # 最终安装产物(构建生成,勿手改)
├── cny-price.module.js               # 人民币价格模块(原创;Node 下导出内部函数供测试)
├── build.mjs                         # 组装脚本(版本号 = OUR_BASE 常量.构建号,OUR_BASE 是功能版本唯一权威来源)
├── upstream.config.json              # 上游来源与镜像配置
├── upstream.state.json               # 同步状态(哈希/版本号/构建号,自动维护)
├── scripts/check-upstream.mjs        # 上游检查与同步
├── tests/cny-price.test.cjs          # 人民币模块单元测试(node --test)
├── .github/workflows/ci.yml          # push/PR:构建 + 语法校验 + 产物一致性 + 单元测试
├── .github/workflows/upstream-sync.yml  # 每 6 小时定时同步
├── serve-test.mjs                    # 本地测试服务
├── sources/                          # 上游脚本快照(vendored,构建的唯一依赖)
│   ├── datou-locals.js               #   datou1996 词库
│   └── datou-main.user.js            #   datou1996 翻译引擎
└── test-models.png                   # 真机实测截图(openrouter.ai/models)
```

### 手动发版

修改了本仓库自身功能(价格模块、引擎补丁等)后:编辑 `build.mjs` 顶部的 `OUR_BASE`(如 `1.0` → `1.1`),重跑 `node build.mjs`,提交推送即可。构建号保持全局递增,版本号永远单调上涨。

## 许可证

MIT(见 [LICENSE](./LICENSE))。翻译引擎与词库来自 datou1996/openrouter-chinese(脚本头声明 MIT),版权归原作者;人民币价格模块为原创。LynnGuo666/OpenRouter_Chinese 仅作设计思路参考,未复制其任何代码(其代码为 PolyForm Noncommercial 许可)。

本插件为第三方作品,与 OpenRouter 官方无关。人民币价格仅为按市场汇率的本地换算参考,不代表 OpenRouter 以人民币结算,不含支付手续费与税费。
