# OpenRouter 中文化增强版 💱

<p align="center">
  <strong>现代化 OpenRouter 全站中文化油猴脚本：20+ 页面全覆盖 + 实时人民币参考价 + 词库单文件内联 + 上游自动同步与镜像容灾</strong>
</p>

<p align="center">
  <a href="https://raw.githubusercontent.com/3304711297/openrouter-chinese-plus/main/openrouter-chinese-plus.user.js"><img src="https://img.shields.io/badge/Install-Userscript-brightgreen?style=flat-square&logo=tampermonkey" alt="Install"></a>
  <a href="https://github.com/3304711297/openrouter-chinese-plus/releases"><img src="https://img.shields.io/github/v/release/3304711297/openrouter-chinese-plus?label=Release&style=flat-square" alt="Release"></a>
  <a href="https://github.com/3304711297/openrouter-chinese-plus/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/3304711297/openrouter-chinese-plus/ci.yml?branch=main&label=CI%20Build&style=flat-square" alt="CI Status"></a>
  <a href="https://github.com/3304711297/openrouter-chinese-plus/actions/workflows/upstream-sync.yml"><img src="https://img.shields.io/github/actions/workflow/status/3304711297/openrouter-chinese-plus/upstream-sync.yml?branch=main&label=Sync%20Upstream%20(6h)&style=flat-square" alt="Sync Upstream"></a>
  <img src="https://img.shields.io/badge/Target-OpenRouter.ai-6366f1?style=flat-square" alt="Target">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License"></a>
</p>

---

## 📸 实机效果展示

<p align="center">
  <img src="./test-models.png" alt="OpenRouter Models 页面实机中文化与人民币换算效果" width="850">
</p>

> 真实环境实测：[openrouter.ai/models](https://openrouter.ai/models) 模型列表、筛选器、侧边栏全量中文化；保留官方美元原价的同时，在每百万 Token 价格后自动追加高精度 **`≈¥xx.xx` 人民币参考价**。

---

## 🚀 安装指南（双通道规范）

在已安装 [ScriptCat 脚本猫](https://scriptcat.org/) 或 [Tampermonkey](https://www.tampermonkey.net/) 的浏览器中选择适合的通道进行安装。本项目建立 **滚动开发通道（Rolling Channel）** 与 **稳定发布通道（Stable Channel）** 双轨规范（新稳定版本基线对齐 `v1.3.3+`）：

| 安装通道 | 链接 / 途径 | 特性与更新机制 | 推荐场景 |
| :--- | :--- | :--- | :--- |
| ⚡ **滚动开发通道**<br>*(Rolling Channel)* | 🔹 [GitHub 直连（秒级更新）](https://raw.githubusercontent.com/3304711297/openrouter-chinese-plus/main/openrouter-chinese-plus.user.js)<br>🔹 [jsDelivr 镜像（国内免代）](https://cdn.jsdelivr.net/gh/3304711297/openrouter-chinese-plus@main/openrouter-chinese-plus.user.js) | **默认跟随 `main` 分支**。<br>上游词库每 6 小时自动同步或新特性合并后秒级生效（CDN 约 12h 缓存）。 | **日常尝鲜推荐**。<br>第一时间体验最新全站中文化翻译与最新特性。 |
| 🟢 **稳定发布通道**<br>*(Stable Channel)* | 🔹 [🚀 GitHub Releases 永久最新资产直链](https://github.com/3304711297/openrouter-chinese-plus/releases/latest/download/openrouter-chinese-plus.user.js)<br>🔹 [📦 历史与固定 Release Tags](https://github.com/3304711297/openrouter-chinese-plus/releases) | **指向 GitHub Releases 正式发布资产**。<br>新稳定版本基线从 `v1.3.3+` 起步，经自动化测试验证并锁定语义版本，杜绝频繁滚动打扰。 | **长效稳定推荐**。<br>追求高可靠性、或需使用固定 Release Tag 下载的用户。 |

> 💡 **通道差异速查**：
> - **滚动开发通道（Rolling Channel）**：默认跟随 `main` 分支（推荐日常尝鲜），享受快速迭代与自动词库同步；
> - **稳定发布通道（Stable Channel）**：指向 [GitHub Releases 永久最新资产直链](https://github.com/3304711297/openrouter-chinese-plus/releases/latest/download/openrouter-chinese-plus.user.js)，或从 [Releases 列表](https://github.com/3304711297/openrouter-chinese-plus/releases) 选择固定 Release Tag 下载，更新策略严谨稳定。

---

## ❓ 常见安装问题速查 (FAQ)

<details>
<summary><strong>👉 Edge + ScriptCat 提示 <code>ERR_BLOCKED_BY_CLIENT</code> 怎么办？</strong></summary>

这是 Edge 浏览器的安全权限机制导致的：
1. 在 Edge 地址栏打开 `edge://extensions`；
2. 找到 **ScriptCat（脚本猫）**，点击 **「详细信息」**；
3. 勾选打开 **「允许访问文件 URL」** 开关后，重新刷新安装链接即可顺利弹出安装面板。
</details>

<details>
<summary><strong>👉 脚本猫首次提示跨域汇率请求授权？</strong></summary>

首次运行时，脚本会通过 Yahoo Finance / Frankfurter 获取最新美元兑人民币汇率。点击 **「总是允许」** 即可。若拒绝，脚本会自动回退到默认汇率 7.2 或使用你在菜单中手动填写的汇率。
</details>

---

## ⚡ 核心功能与架构优势

### 1. 🌐 全站深度中文化 (20+ 页面类型)
- **覆盖全站核心场景**：模型库 (`/models`)、排行榜 (`/rankings`)、活动日历、账单设置、Playground 与开发文档。
- **React 组件友好**：基于 `MutationObserver` 与 `TreeWalker` 精准操作文本叶子节点，支持 React 拆分文本节点拼接（如 `90` + `% off`），绝不破坏前端组件状态与事件监听。
- **代码与 Key 安全区**：API Key 输入框、代码高亮块、聊天上下文输入区域受到严格保护，绝不产生误翻译。

### 2. 💱 独创人民币参考价模块 (4 级容灾链路)
- **无感注入**：保留官方美元原价（`$0.15/M`），并在其后智能追加 `≈¥1.08/M` 实时参考价（免费模型 `$0` 智能免标注）。
- **四级汇率容灾架构**：
  ```text
  Yahoo Finance API (实时高精度)
       │ (失败)
       ▼
  Frankfurter API (官方备用)
       │ (失败)
       ▼
  本地 30 分钟缓存 / 72 小时历史兜底
       │ (离线)
       ▼
  静态保底基准值 (7.2)
  ```
- **纯本地安全计算**：汇率计算全部在本地浏览器沙箱完成，不向任何第三方上报页面数据。

### 3. 📦 词库单文件内联与 6 小时自动同步
- **解决缓存死锁**：放弃原版的 `@require` 外部词库外链形式，将词库直接内联打包为单文件，彻底杜绝“脚本更新但外部词库被浏览器永久缓存”的常见痛点。
- **自动化追踪**：GitHub Actions 每 6 小时自动检查上游词库，有更新自动触发构建与发版。

---

## 🔄 上游项目对比与取舍

| 上游项目 | 取舍决策 | 理由与规范 |
| :--- | :--- | :--- |
| [datou1996/openrouter-chinese](https://github.com/datou1996/openrouter-chinese) | ✅ **整体采用** (MIT) | 覆盖 20+ 页面，翻译质量最完善，排障机制成熟 |
| [LynnGuo666/OpenRouter_Chinese](https://github.com/LynnGuo666/OpenRouter_Chinese) | 💡 **借鉴思路，代码 100% 原创重写** | 原作者代码采用非商业许可；本项目纯原创实现，全库保持 MIT 纯正开源 |
| [isdoge/openrouter-chinese](https://github.com/isdoge/openrouter-chinese) | ❌ **未并入** | 词库为 datou 版子集，无独有功能 |

---

## 🛠️ 本地开发与测试

```bash
# 1. 运行完整单元测试 (node:test 零外部依赖)
npm test

# 2. 检查上游词库更新
node scripts/check-upstream.mjs

# 3. 编译并输出单文件产物
node build.mjs
node --check openrouter-chinese-plus.user.js
```

---

## 📂 项目结构

单文件产物由 `build.mjs` 组装生成，`sources/` 目录保存上游词库的完整快照（vendored）：即使上游项目消失，本项目也能继续构建、发布与维护。

`upstream.state.json` 中的两个哈希字段语义严格分离，不要混用：

- **`hashes`**：**上次拉取的上游内容哈希**。只用于更新检测（本次拉取的上游内容 vs 此值），不描述本地文件。
- **`snapshotHashes`**：**当前本地快照文件哈希**。只用于漂移检测；`scripts/check-upstream.mjs` 会在拉取上游之前校验 `sources/` 下每个快照文件的实际 sha256 是否等于此记录值。

对 `sources/` 做人工裁剪（如词库死重清理）后，**必须把新哈希重录进 `snapshotHashes`**：否则下次检查会以退出码 `30` 报警，提醒你改动未经显式认可。这是刻意的——否则一旦上游真更新，整文件覆盖会静默回填被删内容，清理成果无声丢失。无漂移时该检查不影响任何既有行为（正常检查仍以 `0`/`10` 退出）。

```text
openrouter-chinese-plus/
├── openrouter-chinese-plus.user.js  # 构建产物（勿手改，CI 校验其与源一致）
├── build.mjs                        # 构建器：输出单文件产物，内含 OUR_BASE 版本常量
├── cny-price.module.js              # 人民币参考价模块（构建器内联，单元测试直接引用）
├── package.json                     # Scripts：build / test / e2e
├── playwright.config.mjs            # Playwright E2E 冒烟测试配置
├── serve-test.mjs                   # 本地测试服务：带 CORS 返回产物，供浏览器注入实测
├── upstream.config.json             # 上游来源配置（仓库与镜像候选列表）
├── upstream.state.json              # 上游同步状态：上游内容哈希 hashes、本地快照哈希 snapshotHashes、递增构建号 buildNumber
├── scripts/
│   └── check-upstream.mjs           # 上游词库检查与同步：快照漂移自检 → 哈希比对 → 更新快照 → 递增构建号
├── sources/                         # 上游快照（vendored）：构建与比对的数据来源
│   ├── datou-locals.js              # datou1996 词库，构建时内联进产物
│   ├── datou-main.user.js           # datou1996 引擎主体，构建时去元数据头后内联
│   ├── isdoge.user.js               # isdoge 版参考快照（评估后未并入）
│   └── lynnguo.user.js              # LynnGuo666 版参考快照（仅借鉴设计思路）
└── tests/
    ├── cny-price.test.cjs           # 人民币模块单元测试
    ├── check-upstream.test.mjs      # 上游检查纯函数单元测试
    ├── build.test.mjs               # 构建器状态校验单元测试
    └── e2e.spec.mjs                 # Playwright E2E 冒烟测试
```

---

## 📄 免责声明与开源协议

本项目依据 **MIT 许可证** 开源。

*本脚本为第三方开源作品，与 OpenRouter 官方无关。人民币价格仅按市场公开汇率提供本地计算参考，不代表 OpenRouter 官方结算币种，亦不包含银行换汇手续费与跨境税费。*
