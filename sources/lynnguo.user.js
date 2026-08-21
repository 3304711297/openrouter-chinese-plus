// ==UserScript==
// @name         OpenRouter 中文与人民币价格
// @namespace    openrouter-zh-cny
// @version      0.5.10
// @description  为 OpenRouter 全站补充中文界面与人民币估价
// @author       LynnGuo666
// @license      PolyForm-Noncommercial-1.0.0
// @homepageURL  https://github.com/LynnGuo666/OpenRouter_Chinese
// @supportURL   https://github.com/LynnGuo666/OpenRouter_Chinese/issues
// @downloadURL  https://raw.githubusercontent.com/LynnGuo666/OpenRouter_Chinese/main/openrouter-zh-cny.user.js
// @updateURL    https://raw.githubusercontent.com/LynnGuo666/OpenRouter_Chinese/main/openrouter-zh-cny.user.js
// @match        https://openrouter.ai/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      query1.finance.yahoo.com
// @connect      api.frankfurter.dev
// @connect      translate.googleapis.com
// ==/UserScript==
/*
SPDX-FileCopyrightText: 2026 LynnGuo666
SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
License terms: https://polyformproject.org/licenses/noncommercial/1.0.0/
Required Notice: Copyright 2026 LynnGuo666. (https://github.com/LynnGuo666/OpenRouter_Chinese)
*/
// 此文件由 npm run build 从 src/ 生成，请勿直接编辑发布产物。

(function openRouterZhCny(global) {
  "use strict";

  const VERSION = "0.5.10";
  const SETTINGS_KEY = "orl:settings:v1";
  const RATE_CACHE_KEY = "orl:rates:v1";
  const RATE_ATTEMPT_KEY = "orl:rates:last-attempt:v1";
  const TRANSLATION_CACHE_KEY = "orl:translations:v1";
  const RATE_TTL_MS = 30 * 60 * 1000;
  const RATE_MAX_STALE_MS = 72 * 60 * 60 * 1000;
  const RATE_RETRY_COOLDOWN_MS = 60 * 1000;
  const TRANSLATION_CACHE_LIMIT = 5000;
  const TRANSLATION_SCHEMA_VERSION = 7;
  const CONTENT_WORKER_LIMIT = 3;
  const CONTENT_TRANSLATION_RETRY_LIMIT = 2;
  const TRANSLATION_CHUNK_LIMIT = 900;
  const MAX_PENDING_SCAN_ROOTS = 32;
  const RECORD_CLEANUP_INTERVAL_MS = 2000;

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    translateUi: true,
    translateContent: true,
    showCny: true,
    rateMode: "yahoo",
    manualUsdCny: 7.2,
    manualUsdcUsd: 1,
  });

  const PRIVATE_CONTENT_PATH_PREFIXES = new Set([
    "activity",
    "account",
    "auth",
    "billing",
    "chat",
    "credits",
    "fusion",
    "keys",
    "login",
    "logs",
    "oauth",
    "organizations",
    "profile",
    "request-builder",
    "settings",
    "spawn",
    "usage",
    "workspaces",
  ]);

  const ACCOUNT_UI_PATH_PREFIXES = new Set([
    "account",
    "activity",
    "billing",
    "credits",
    "keys",
    "logs",
    "organizations",
    "profile",
    "settings",
    "usage",
    "workspaces",
  ]);

  const PUBLIC_CONTENT_PATH_PREFIXES = new Set([
    "about",
    "agents",
    "apps",
    "authorized-sub-processors",
    "benchmarks",
    "blog",
    "careers",
    "collections",
    "compare",
    "customers",
    "data",
    "discover",
    "docs",
    "enterprise",
    "labs",
    "learn",
    "long-horizon",
    "models",
    "pricing",
    "privacy",
    "provider",
    "providers",
    "rankings",
    "sdk",
    "state-of-ai",
    "support",
    "terms",
    "terms-of-service-enterprise",
    "works-with-openrouter",
  ]);

  const NON_MODEL_TWO_SEGMENT_PREFIXES = new Set([
    "about",
    "agents",
    "api",
    "apps",
    "auth",
    "authorized-sub-processors",
    "benchmarks",
    "blog",
    "careers",
    "collections",
    "compare",
    "customers",
    "data",
    "docs",
    "enterprise",
    "fusion",
    "labs",
    "learn",
    "login",
    "long-horizon",
    "models",
    "pricing",
    "privacy",
    "provider",
    "providers",
    "rankings",
    "request-builder",
    "settings",
    "sdk",
    "spawn",
    "state-of-ai",
    "support",
    "terms",
    "terms-of-service-enterprise",
    "workspaces",
    "works-with-openrouter",
  ]);

  const MODEL_ENTITY_TAB_SEGMENTS = new Set([
    "activity",
    "api",
    "apps",
    "benchmarks",
    "performance",
    "pricing",
    "providers",
    "uptime",
  ]);

  const ENTITY_CATALOG = Object.freeze({
    providers: Object.freeze([
      "01.AI",
      "AI21 Labs",
      "Alibaba",
      "Amazon",
      "Amazon Bedrock",
      "Anthropic",
      "Azure",
      "Baseten",
      "ByteDance",
      "Cerebras",
      "Chutes",
      "Cohere",
      "DeepInfra",
      "DeepSeek",
      "Featherless",
      "Fish Audio",
      "Fireworks AI",
      "Google",
      "Google AI Studio",
      "Google Vertex",
      "Groq",
      "Hugging Face",
      "Hyperbolic",
      "Inception",
      "InclusionAI",
      "Lambda",
      "Meta",
      "Microsoft",
      "MiniMax",
      "Mistral",
      "Moonshot AI",
      "Nebius",
      "Nous Research",
      "NovitaAI",
      "NVIDIA",
      "OpenAI",
      "OpenRouter",
      "Perplexity",
      "Qwen",
      "Replicate",
      "SambaNova",
      "StepFun",
      "Tencent",
      "Thinking Machines",
      "Together AI",
      "xAI",
      "Z.AI",
      "Black Forest Labs",
    ]),
    modelFamilies: Object.freeze([
      "Claude",
      "Command R",
      "DBRX",
      "DeepSeek",
      "FLUX",
      "Gemini",
      "Gemma",
      "GLM",
      "GPT",
      "Grok",
      "Hermes",
      "Inkling",
      "Jamba",
      "Kimi",
      "Llama",
      "Mistral",
      "Mixtral",
      "Nemotron",
      "Nova",
      "Phi",
      "Qwen",
      "Seedance",
      "Sonar",
      "Yi",
      "o1",
      "o3",
      "o4",
    ]),
    stableLabels: Object.freeze([
    "OpenRouter",
    "OpenAI",
    "Anthropic",
    "Artificial Analysis",
    "Design Arena",
    "GPQA Diamond",
    "τ²-Bench Airline",
    "TAU-Bench",
    "HLE",
    "AA-LCR",
    "GDPval-AA",
    "CritPt",
    "SciCode",
    "IFBench",
    "LiveCodeBench",
    "Terminal-Bench Hard",
    "AA-Omniscience",
    "τ²-Bench Telecom",
    "TIGER Lab",
    "NYU & Collaborators",
    "Centre for AI Safety",
    "Google Research",
    "CMU & MBZUAI",
    "Stanford & Collaborators",
    "MAA",
    "GitHub",
    "Discord",
    "LinkedIn",
    "YouTube",
    "Ori",
    "Replit",
    "Hermes Agent",
    "Kilo Code",
    "SDK",
    "API",
    "ELO",
    "Elo",
    "BYOK",
    "SSO",
    "SAML",
    "SLA",
    "ZDR",
    "GDPR",
    "SOC-2",
    "OpenAPI",
    "Swagger UI",
    "Postman",
    "LangChain",
    "LiveKit",
    "PydanticAI",
    "Vercel AI SDK",
    "Open WebUI",
    "Cloudflare AI Gateway",
    "NIST",
    "CAISI",
    "MIT",
    "Boston University",
    "Brookings Institution",
    "Reuters",
    "Cisco",
    "npm",
    "pnpm",
    "Yarn",
    "Bun",
    "Deno",
    "pip",
    "Python",
    "TypeScript",
    "JavaScript",
    "Shell",
    "cURL",
    "Ruby",
    "PHP",
    "Go",
    "Java",
    "Rust",
    "C#",
    "Node.js",
    "Kotlin",
    "Swift",
    "callModel",
    ]),
  });

  const PROTECTED_LABELS = new Set([
    ...ENTITY_CATALOG.providers,
    ...ENTITY_CATALOG.modelFamilies,
    ...ENTITY_CATALOG.stableLabels,
  ]);

  const PROTECTED_ENTITY_PATTERN_SOURCE = [...new Set([
    ...ENTITY_CATALOG.providers,
    ...ENTITY_CATALOG.modelFamilies.filter((name) => name.length >= 3),
  ])]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const PROTECTED_TRANSLATION_PATTERN = new RegExp(
    [
      "`[^`\\n]+`",
      "(?:https?:\\/\\/|mailto:)[^\\s]+",
      "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b",
      "\\b[A-Za-z0-9_.~-]+\\/[A-Za-z0-9_.:~/-]+\\b",
      "[$¥]\\s*[\\d,.]+(?:\\s*[KMBT])?",
      "\\b\\d+(?:\\.\\d+)?(?:K|M|B|T|ms|tps|tok\\/s|%)\\b",
      "\\b(?:USD|CNY|USDC|API|SDK|HTTP|HTTPS|JSON|HTML|CSS|URL|URI|TTFT|TPS|E2E|P50|P90|P95|P99|ELO|MMLU(?:-Pro)?|GPQA|AIME|BFCL|SWE-bench|HLE|AA-LCR|GDPval-AA|CritPt|SciCode|IFBench|LiveCodeBench|Terminal-Bench Hard|AA-Omniscience|AI|LLM|RAG|CLI|IDE|MCP|PDF|PR|BYOK|CDP|SDLC|AST|SSO|SAML|SLA|ZDR|GDPR|SOC-2|VAT|S3)\\b",
      "(?:τ²|TAU)-Bench(?:\\s+(?:Airline|Retail|Telecom))?",
      `\\b(?:NYU & Collaborators|Centre for AI Safety|Google Research|CMU & MBZUAI|Stanford & Collaborators|Artificial Analysis|Design Arena|Hermes Agent|Kilo Code|Cloudflare|TIGER Lab|Replit|Ori|MAA|${PROTECTED_ENTITY_PATTERN_SOURCE})\\b`,
      "(?:\\b(?:npm|pnpm|Yarn|Bun|Deno|pip|Python|TypeScript|JavaScript|Shell|cURL|Ruby|PHP|Java|Rust|Kotlin|Swift|callModel)\\b|C#|Node\\.js)",
      "[\\u3400-\\u9fff]+",
    ].join("|"),
    "gi",
  );
  const PROTECTED_HTTP_METHOD_PATTERN = /\b(?:GET|POST|PUT|PATCH|DELETE)\b/g;
  const LOCALE_NAVIGATION = Object.freeze({
    Search: "搜索",
    Models: "模型",
    Fusion: "融合",
    Chat: "对话",
    Rankings: "排行榜",
    Apps: "应用",
    Docs: "文档",
    "Sign Up": "注册",
    Compare: "对比",
    Home: "首页",
    Documentation: "文档",
    "API Reference": "API 参考",
    "Skip to content": "跳到正文",
    "Get API Key": "获取 API 密钥",
    "Model weights": "模型权重",
    Activity: "使用趋势",
    Logs: "日志",
    Labs: "实验室",
    Guardrails: "防护规则",
    BYOK: "自带密钥（BYOK）",
    Routing: "路由",
    Presets: "预设",
    Plugins: "插件",
    Observability: "可观测性",
    Classifiers: "分类器",
    "Default Workspace": "默认工作区",
    Beta: "测试版",
    "Management Keys": "管理密钥",
    Preferences: "偏好设置",
    "Privacy Settings": "隐私设置",
    Integrations: "集成",
    "Organization Members": "组织成员",
    "Workspace Settings": "工作区设置",
    "Sign Out": "退出登录",
    here: "此处",
  });
  const LOCALE_COMMON = Object.freeze({
    Overview: "概览",
    Features: "功能",
    Settings: "设置",
    Account: "账户",
    Personal: "个人账户",
    Workspace: "工作区",
    Workspaces: "工作区",
    Profile: "个人资料",
    General: "常规",
    Appearance: "外观",
    Theme: "主题",
    Language: "语言",
    Billing: "账单",
    Credits: "额度",
    Usage: "用量",
    Logs: "日志",
    Keys: "密钥",
    "API Keys": "API 密钥",
    Create: "创建",
    New: "新建",
    Edit: "编辑",
    Delete: "删除",
    Save: "保存",
    Cancel: "取消",
    Close: "关闭",
    Back: "返回",
    Next: "下一步",
    Previous: "上一步",
    Continue: "继续",
    Submit: "提交",
    Confirm: "确认",
    Copy: "复制",
    Copied: "已复制",
    Download: "下载",
    Upload: "上传",
    Refresh: "刷新",
    Retry: "重试",
    Loading: "加载中",
    "Learn more": "了解更多",
    "Read more": "阅读更多",
    "View all": "查看全部",
    "Show more": "显示更多",
    "Show less": "收起",
    Search: "搜索",
    Filter: "筛选",
    Sort: "排序",
    Name: "名称",
    Description: "说明",
    Date: "日期",
    Created: "创建时间",
    Updated: "更新时间",
    Status: "状态",
    Type: "类型",
    Enabled: "已启用",
    Disabled: "已禁用",
    Public: "公开",
    Private: "私密",
    Default: "默认",
    Optional: "可选",
    Required: "必填",
    Add: "添加",
    Remove: "移除",
    Manage: "管理",
    Details: "详情",
    Quickstart: "快速开始",
    "Quick Start": "快速开始",
    Guides: "指南",
    Community: "社区",
    Contact: "联系",
    Security: "安全",
    Terms: "条款",
    Privacy: "隐私",
    "Sign In": "登录",
    "Log In": "登录",
    "Log Out": "退出登录",
    "On this page": "本页内容",
    Note: "注意",
    Warning: "警告",
    Tip: "提示",
    Install: "安装",
    "View on GitHub": "在 GitHub 查看",
  });
  const LOCALE_SETTINGS = Object.freeze({
    "Default Workspace": "默认工作区",
    Guardrails: "防护规则",
    BYOK: "自带密钥（BYOK）",
    Routing: "路由",
    Presets: "预设",
    Plugins: "插件",
    Observability: "可观测性",
    Classifiers: "分类器",
    Beta: "测试版",
    Logs: "日志",
    "Management Keys": "管理密钥",
    Preferences: "偏好设置",
    Notifications: "通知",
    "Privacy Settings": "隐私设置",
    Integrations: "集成",
    "Organization Members": "组织成员",
    "Workspace Settings": "工作区设置",

    User: "用户",
    "Manage your login credentials, security settings, or delete your account.":
      "管理登录凭据、安全设置，或删除账户。",
    Organization: "组织",
    "Create and manage your organization.": "创建和管理你的组织。",
    "Account Type": "账户类型",
    "Your current account tier.": "当前账户等级。",
    "Self Serve": "自助服务",
    "Date Format": "日期格式",
    "How dates appear in logs and activity tables.": "日志和使用趋势表格中的日期显示格式。",
    "Default Preset": "默认预设",
    "Default preset for new messages in the chatroom.": "聊天室中新消息使用的默认预设。",
    None: "无",
    "Enable analytics cookies": "启用分析 Cookie",
    "Allow analytics cookies to help us improve the user experience and site performance.":
      "允许使用分析 Cookie，帮助改善用户体验和站点性能。",
    "Toggle analytics cookies": "切换分析 Cookie",
    "Low Balance Notifications": "低余额通知",
    "Toggle low balance notifications": "切换低余额通知",
    "Chat Completion Notifications": "聊天完成通知",
    "Browser notifications when chat responses complete (only when tab is not focused)":
      "聊天回复完成时发送浏览器通知（仅当此标签页未获得焦点）",
    "Toggle chat completion notifications": "切换聊天完成通知",
    Attestations: "确认事项",
    "18+ age confirmation": "年满 18 周岁确认",
    "I confirm that I am 18 years of age or older.": "我确认自己已年满 18 周岁。",
    Confirmed: "已确认",
    "Your chat history in the": "你的",
    Chatroom: "聊天室",
    "is always stored locally on your device.": "中的聊天记录始终存储在本设备上。",
    "Verify your email": "验证邮箱",
    "Send code": "发送验证码",
    "Confirmation required": "需要确认",
    "Please confirm the following to continue:": "请确认以下内容后继续：",
    "You can review this anytime in settings.": "你可以随时在设置中查看此内容。",

    "Change profile picture": "更换头像",
    "Usage summary": "用量概览",
    "Last 7 Days": "最近 7 天",
    Spend: "支出",
    "View full activity": "查看完整用量",
    "No prior data": "暂无历史数据",
    "Daily · by model": "每日 · 按模型",
    "Invalid Date": "无效日期",
    "this month": "本月",
    "Top models": "热门模型",
    "Longest streak": "最长连续天数",
    day: "天",
    "Avg / day": "日均",
    "Avg / week": "周均",
    Total: "总计",
    Less: "较少",
    More: "较多",
    "Active keys": "有效密钥",
    "Disabled / expired": "已停用 / 已过期",
    "Last created": "最近创建",
    Key: "密钥",
    Jan: "1月",
    Feb: "2月",
    Mar: "3月",
    Apr: "4月",
    May: "5月",
    Jun: "6月",
    Jul: "7月",
    Aug: "8月",
    Sep: "9月",
    Oct: "10月",
    Nov: "11月",
    Dec: "12月",

    "Refresh credits": "刷新额度",
    "Total available": "可用总额",
    "Payment and pricing information": "支付与定价信息",
    "Pay-as-you-go balance": "按量付费余额",
    "Use crypto": "使用加密货币",
    "Pay with crypto": "使用加密货币支付",
    Amount: "金额",
    "Total due": "应付总额",
    Purchase: "购买",
    "Transactions may take many minutes to confirm": "交易确认可能需要几分钟",
    "View Usage": "查看用量",
    "Redeem Promo Code": "兑换优惠码",
    "Auto Top-Up": "自动充值",
    "Recent Transactions": "最近交易",
    "Need enterprise billing options?": "需要企业账单方案？",
    "Contact sales": "联系销售",
    Actions: "操作",
    "Get invoice": "获取发票",
    transaction: "交易",
    "Control your management API keys for administrative actions":
      "管理用于执行管理操作的 API 密钥",
    "New Key": "新建密钥",

    "Restrictions to apply globally across the account. You can further restrict API keys with guardrails inside a workspace.":
      "应用于整个账户的限制。你还可以在工作区内通过防护规则进一步限制 API 密钥。",
    "Data Policies": "数据策略",
    "Set data privacy and usage restrictions.": "设置数据隐私和使用限制。",
    "Control which providers are used for routing. Leave empty to allow all.":
      "控制路由使用的供应商。留空则允许全部供应商。",
    "Allowed Providers": "允许的供应商",
    "Exclusively enable these providers for your requests.": "请求仅使用这些供应商。",
    "Ignored Providers": "忽略的供应商",
    "Exclude these providers from serving any requests.": "禁止这些供应商处理任何请求。",
    Eligibility: "可用范围",
    "Providers and models available based on your account settings.":
      "根据账户设置可用的供应商和模型。",
    "Unable to load eligibility preview.": "无法加载可用范围预览。",
    "Prompt Injection Allowlist": "提示词注入允许列表",
    "Phrases that should never trigger the prompt injection guardrail. Matching is case-insensitive and exact.":
      "不会触发提示词注入防护规则的短语。匹配不区分大小写，且必须完全一致。",
    "Add phrases your users legitimately send that should not trigger the prompt injection guardrail. Matching is case-insensitive and exact.":
      "添加用户正常发送且不应触发提示词注入防护规则的短语。匹配不区分大小写，且必须完全一致。",
    "Allowlisted phrases only take effect when the": "仅当请求启用",
    "prompt injection guardrail": "提示词注入防护规则",
    "is enabled for the request. Without it enabled, these patterns have no effect.":
      "时，允许列表短语才会生效；未启用时，这些模式不起作用。",
    "Add pattern": "添加模式",

    "My workspace": "我的工作区",
    "Video Generation": "视频生成",
    "Default Webhook URL": "默认 Webhook URL",
    "Receives video generation delivery events for this workspace.":
      "接收此工作区的视频生成交付事件。",
    "Webhook Signing Secret": "Webhook 签名密钥",
    "Used to verify webhook payload signatures.": "用于验证 Webhook 载荷签名。",
    "No signing secret configured.": "尚未配置签名密钥。",
    "Generate signing secret": "生成签名密钥",
    "We created this workspace for you with all your existing API keys, routing rules, privacy settings, guardrails, and configurations.":
      "我们已为你创建此工作区，并迁移现有的 API 密钥、路由规则、隐私设置、防护规则和配置。",
    "Introducing Workspaces!": "工作区现已推出！",
    "Organize your OpenRouter usage into different environments with separate keys, configurations, budgets, and rules.":
      "将 OpenRouter 用量划分到不同环境，并分别管理密钥、配置、预算和规则。",
    "This Week's Usage": "本周用量",
    "View Activity": "查看使用趋势",
    "Create and manage API keys in this workspace.": "创建并管理此工作区的 API 密钥。",
    "Set budgets, model/provider restrictions, privacy, and content policies.":
      "设置预算、模型/供应商限制、隐私和内容策略。",
    "Use your own provider API keys on OpenRouter.": "在 OpenRouter 上使用自己的供应商 API 密钥。",
    "Set routing policies for models and providers.": "设置模型和供应商的路由策略。",
    "Save shortcuts for system prompts and request parameters.": "保存系统提示词和请求参数的快捷预设。",
    "Configure plugin behavior for this workspace.": "配置此工作区的插件行为。",
    "Connect monitoring tools like Langfuse or Datadog to track usage.":
      "连接 Langfuse 或 Datadog 等监控工具来跟踪用量。",
    "Edit the workspace name and description.": "编辑工作区名称和说明。",

    "Set spending limits, data privacy rules, and model/provider restrictions for":
      "为此工作区中的",
    "API keys in this workspace.": "API 密钥设置支出限额、数据隐私规则以及模型/供应商限制。",
    "New Guardrail": "新建防护规则",
    "Web Search": "网页搜索",
    "Use your own provider API keys on OpenRouter": "在 OpenRouter 上使用自己的供应商 API 密钥",
    Available: "可用",
    "Not configured": "未配置",
    "Key Priority and Fallback": "密钥优先级与回退",
    "OpenRouter always prioritizes using your provider keys when available.":
      "只要供应商密钥可用，OpenRouter 就会优先使用它们。",
    "By default, if your key encounters a rate limit or failure, OpenRouter will fall back to using shared OpenRouter endpoints.":
      "默认情况下，如果你的密钥遇到速率限制或失败，OpenRouter 会回退到共享端点。",
    "You can configure individual keys with \"Always use this key\" to prevent any fallback to OpenRouter endpoints. When this option is enabled, OpenRouter will only use your key for requests to that provider. This may result in rate limit errors if your key is exhausted, but ensures all requests go through your account.":
      "你可以为单个密钥启用“始终使用此密钥”，阻止回退到 OpenRouter 共享端点。启用后，向该供应商发出的请求只会使用你的密钥。密钥额度耗尽时可能出现速率限制错误，但能确保所有请求都通过你的账户。",
    "If you wish to never use shared OpenRouter endpoints for a model, you must":
      "如果某个模型绝不能使用 OpenRouter 共享端点，你必须",
    "specify \"Always use this key\" and pin the provider by specifying it as":
      "启用“始终使用此密钥”，并将该供应商指定为",
    "when making the request.": "后再发起请求。",
    both: "同时",
    "your only provider": "唯一供应商",

    "Auto Router": "自动路由",
    "Configure which models the Auto Router can route to.": "配置自动路由可选择的模型。",
    "Route to the best model for each request using": "使用",
    ". Saved settings also apply to": " 为每个请求选择最佳模型。保存的设置也适用于",
    "Default Provider Sort": "默认供应商排序",
    "Choose how providers should be sorted for your requests.": "选择请求中的供应商排序方式。",
    "Choose how providers should be sorted. Individual requests can override this setting.":
      "选择供应商排序方式；单个请求可以覆盖此设置。",
    "By default, OpenRouter balances low prices with high uptime.":
      "默认情况下，OpenRouter 会兼顾低价和高可用率。",
    "Default (balanced)": "默认（均衡）",
    "Default Model": "默认模型",
    "Set the default model for apps and fallback routing.": "设置应用和回退路由使用的默认模型。",
    "Apps will use this model by default, but they may override it if they choose to do so.":
      "应用默认使用此模型，但也可以自行覆盖。",
    "This model will also be used as your default": "此模型还将用作默认",
    "fallback model": "回退模型",
    "No default": "无默认模型",

    "Presets are shortcuts for your system prompts, model and provider configurations, and request parameters.":
      "预设是系统提示词、模型与供应商配置以及请求参数的快捷方式。",
    "New Preset": "新建预设",
    "Loading Presets…": "正在加载预设…",
    "Retrieving your presets. This usually only takes a moment.": "正在获取预设，通常只需片刻。",
    "Default Plugin Settings": "默认插件设置",
    "Configure default plugin behavior for your API requests.": "配置 API 请求的默认插件行为。",

    "Input & Output Logging": "输入与输出日志",
    "Show prompts and completions in your": "你的提示词和补全内容会显示在",
    "prompts and completions in your": "你的提示词和补全内容会显示在",
    "for debugging, evaluating responses, and optimizing prompts.":
      "，便于调试、评估回复并优化提示词。",
    "I/O logging settings": "输入/输出日志设置",
    "Toggle prompt storage": "切换提示词存储",
    Broadcast: "广播",
    "Automatically send traces from your requests to external observability platforms without additional instrumentation.":
      "无需额外埋点，即可自动将请求追踪发送到外部可观测性平台。",
    "Toggle observability broadcast features": "切换可观测性广播功能",
    "Add Destination": "添加目标",
    "Send Feedback": "发送反馈",
    "Let us know how we can improve!": "告诉我们可以如何改进！",
    Open: "打开",
    "Tag every generation with structured metadata for AI usage reporting. View aggregated charts in the Activity page. Create up to 10 classifiers per workspace.":
      "为每次生成添加结构化元数据，用于 AI 用量报告；可在使用趋势页查看汇总图表。每个工作区最多可创建 10 个分类器。",
    "Loading…": "加载中…",

    "Refresh logs": "刷新日志",
    "Filter by User, Model, Provider, API Key, or Modality":
      "按用户、模型、供应商、API 密钥或模态筛选",
    "Date range": "日期范围",
    Generations: "生成记录",
    "Upstream Requests": "上游请求",
    "About upstream requests": "关于上游请求",
    Sessions: "会话",
    Videos: "视频",
    Batches: "批次",
    App: "应用",
    "The app or agent that made this request.": "发起此请求的应用或智能体。",
    Cost: "成本",
    "Usage Type": "用量类型",
    Speed: "速度",
    "Routing Overhead": "路由开销",
    "Routing overhead is OpenRouter time before the successful provider attempt starts. Time to first token is provider time after it starts, so the measurements are sequential and do not overlap.":
      "路由开销是成功调用供应商前由 OpenRouter 消耗的时间。首字延迟从供应商调用开始后计算，因此两项测量依次发生且不会重叠。",
    "Latency until the first token was received, in seconds.": "收到首个令牌前的延迟，单位为秒。",
    "Finish Reason": "结束原因",
    "API Key": "API 密钥",
    "Table settings": "表格设置",
    "No transactions found": "未找到记录",
    "Try adjusting the date range or filters to see more data.":
      "请调整日期范围或筛选条件以查看更多数据。",
  });
  const LOCALE_HOME = Object.freeze({
    "The Unified Interface For LLMs": "大语言模型统一接口",
    Better: "更优的",
    prices: "价格",
    ", better": "，更高的",
    uptime: "可用率",
    ", no subscriptions.": "，无需订阅。",
    "Get API Key": "获取 API 密钥",
    "Discover Models": "发现模型",
    "Monthly Tokens": "月度令牌量",
    "Global Users": "全球用户",
    Providers: "供应商",
    Models: "模型",
    "One API for Any Model": "一个 API，调用任意模型",
    "Access all major models through a single, unified interface. OpenAI SDK works out of the box.":
      "通过一个统一接口访问所有主流模型，开箱即用地兼容 OpenAI SDK。",
    "Browse all": "浏览全部",
    "Model routing visualization": "模型路由可视化",
    "Performance graph": "性能图表",
    "Data policy visualization": "数据策略可视化",
    "Higher Availability": "更高可用性",
    "Reliable AI models via our distributed infrastructure. Fall back to other providers when one goes down.":
      "通过分布式基础设施可靠地调用 AI 模型；某个供应商故障时自动切换到其他供应商。",
    "Learn more": "了解更多",
    "Price and Performance": "价格与性能",
    "Keep costs in check without sacrificing speed. OpenRouter runs at the edge for minimal latency between your users and their inference.":
      "在不牺牲速度的前提下控制成本。OpenRouter 在边缘运行，尽量降低用户与推理服务之间的延迟。",
    "Custom Data Policies": "自定义数据策略",
    "Protect your organization with fine grained data policies. Ensure prompts only go to the models and providers you trust.":
      "通过细粒度数据策略保护组织，确保提示词只发送给你信任的模型和供应商。",
    "View docs": "查看文档",
    "Featured Models": "精选模型",
    "active models on": "个活跃模型，来自",
    "View all": "查看全部",
    by: "来自",
    Tokens: "令牌量",
    "Weekly Trend": "周趋势",
    New: "新上线",
    "Featured Agents": "精选智能体",
    "The easiest way to go from idea to app": "从想法到应用的最简单方式",
    "An autonomous agent that grows with you": "与你共同成长的自主智能体",
    "Everything you need for agentic development": "智能体开发所需的一切",
    Signup: "注册",
    "Create an account to get started. You can set up an org for your team later.":
      "创建账户即可开始使用，之后可为团队设置组织。",
    "Buy credits": "购买额度",
    "Credits can be used with any model or provider.": "额度可用于任意模型或供应商。",
    "Get your API key": "获取 API 密钥",
    "Create an API key and start making requests.": "创建 API 密钥并开始发起请求。",
    "Fully OpenAI compatible": "完全兼容 OpenAI",
    "Recent Blog Posts": "最新博客",
    "Free variant": "免费版本",
    here: "此处",
  });
  const LOCALE_CATALOG = Object.freeze({
    Model: "模型",
    "Discover Models": "发现模型",
    Newest: "最新",
    "Sort by": "排序",
    Filters: "筛选",
    "Model Filters": "模型筛选",
    "Clear filters": "清除筛选",
    "Reset Filters": "重置筛选",
    "Most popular": "最受欢迎",
    Trending: "热门趋势",
    "Top Weekly": "本周热门",
    "Pricing: Low to High": "价格：从低到高",
    "Pricing: High to Low": "价格：从高到低",
    "Context: High to Low": "上下文：从高到低",
    "Throughput: High to Low": "吞吐量：从高到低",
    "Latency: Low to High": "延迟：从低到高",
    "Intelligence: High to Low": "智能指数：从高到低",
    "Coding: High to Low": "编程指数：从高到低",
    "Agentic: High to Low": "智能体指数：从高到低",
    "Design Arena ELO: High to Low": "Design Arena ELO：从高到低",
    List: "列表",
    Table: "表格",
    All: "全部",
    Text: "文本",
    Image: "图片",
    File: "文件",
    Audio: "音频",
    Video: "视频",
    Embeddings: "嵌入",
    Rerank: "重排序",
    Speech: "语音",
    Transcription: "转录",
    "Input Modalities": "输入模态",
    "Context length": "上下文长度",
    "Prompt pricing": "输入价格",
    "Output pricing": "输出价格",
    Series: "系列",
    Categories: "类别",
    "Supported Parameters": "支持的参数",
    Distillable: "可蒸馏",
    "Zero Data Retention": "零数据保留",
    "In-Region Routing": "区域内路由",
    "Model age": "模型发布时间",
    "Tool Calling": "工具调用",
    "Inactive Models": "非活跃模型",
    "Model Authors": "模型作者",
    Architecture: "架构",
    Tokenizer: "分词器",
    "Max output": "最大输出",
    "Knowledge cutoff": "知识截止时间",
    Moderated: "内容审核",
    "No results": "无结果",
    "Search models...": "搜索模型...",
    Information: "信息",
    "Output Modalities": "输出模态",
    "All models": "全部模型",
    Popular: "热门",
    Grid: "网格",
    "Grid view": "网格视图",
    "Prompt price": "输入价格",
    "Completion pricing": "输出价格",
    "Clear search": "清除搜索",
    "Open filters": "打开筛选",
    Academia: "学术",
    Finance: "金融",
    Health: "健康",
    Legal: "法律",
    Marketing: "营销",
    Programming: "编程",
    Science: "科学",
    Technology: "技术",
    Latest: "最新",
    "Free variant": "免费版本",
    by: "来自",
  });
  const LOCALE_DETAILS = Object.freeze({
    Providers: "供应商",
    Playground: "试用",
    "Try this model": "试用此模型",
    Modalities: "模态",
    Price: "价格",
    Free: "免费",
    Context: "上下文",
    Released: "发布时间",
    Pricing: "定价",
    "Effective Pricing": "实际价格",
    Effective: "实际价格",
    Listed: "标价",
    "Price source": "价格类型",
    "Pricing metric": "价格指标",
    "Time range": "时间范围",
    "Weighted Average": "加权平均",
    "Weighted Avg Input Price": "加权平均输入价格",
    "Weighted Avg Output Price": "加权平均输出价格",
    "per 1M": "每百万",
    "More models from": "更多模型，来自",
    "Model page sections": "模型页面分区",
    "The chart below shows the average price customers are actually paying after prompt caching. Depending on the amount of repeated context you send, this can be 60–80% cheaper than the provider list price. Shown are rolling averages from the past 30 days.":
      "下图展示启用提示缓存后客户实际支付的平均价格。根据重复上下文的比例，实际价格可能比供应商标价低 60–80%。图中数据为过去 30 天的滚动平均值。",
    "The average price customers actually pay for this model, next to the prices providers post. Caching and discounts mean the price actually paid is often well below the listed one.":
      "客户为此模型实际支付的平均价格，与供应商公布的标价并列展示。受缓存和折扣影响，实际支付价格通常远低于标价。",
    "Weighted average explanation": "加权平均说明",
    "/M tokens": "/ 百万令牌",
    "Input Price / 1M tokens (7 days)": "输入价格 / 百万令牌（7 天）",
    "Output Price / 1M tokens (7 days)": "输出价格 / 百万令牌（7 天）",
    "Effective in /M": "实际输入价格 / 百万令牌",
    "Effective out /M": "实际输出价格 / 百万令牌",
    "Listed in /M": "输入标价 / 百万令牌",
    "Listed out /M": "输出标价 / 百万令牌",
    "P50, best across providers": "P50，所有供应商中的最佳值",
    "P50, best provider": "P50，最佳供应商",
    ", best across providers": "，所有供应商中的最佳值",
    ", best provider": "，最佳供应商",
    "Make your first request": "发起第一个请求",
    "Using third-party SDKs": "使用第三方 SDK",
    "Enable streaming": "启用流式输出",
    Endpoint: "端点",
    Parameters: "参数",
    "Get Code": "获取代码",
    "Create API Key": "创建 API 密钥",
    "Endpoints API": "端点 API",
    "Input / Output Pricing": "输入 / 输出价格",
    "Release Date": "发布时间",
    "Different companies host the same model. OpenRouter routes your request to one of them based on the routing mode you pick — Balanced (price + speed), Nitro (fastest), or Exacto (highest tool-calling accuracy).":
      "同一模型可由不同公司托管。OpenRouter 会根据所选路由模式分配请求：均衡（价格与速度）、极速（速度优先）或精准（工具调用准确率优先）。",
    Preview: "预览",
    Form: "表单",
    "First Frame": "首帧",
    "Last Frame": "末帧",
    Size: "尺寸",
    Seconds: "秒数",
    Reset: "重置",
    Generate: "生成",
    "Video + audio": "视频和音频",
    "Video only": "仅视频",
    Seed: "随机种子",
    Duration: "时长",
    "Enter to generate · Shift+Enter for a new line": "按 Enter 生成 · Shift+Enter 换行",
    "Sign in to try this model": "登录后试用此模型",
    "Enter your message...": "输入消息...",
    "Explain quantum entanglement to a 10-year-old": "向 10 岁孩子解释量子纠缠",
    "Sieve of Eratosthenes in Python": "用 Python 实现埃拉托色尼筛法",
    "SQL query for top regions by growth": "编写查询增长最快地区的 SQL",
    "Responses are AI-generated. Verify before relying on them.":
      "回答由 AI 生成，使用前请核实。",
  });
  const LOCALE_PROVIDERS = Object.freeze({
    Provider: "供应商",
    Providers: "供应商",
    Input: "输入",
    Output: "输出",
    "In / Out Price": "输入 / 输出价格",
    "Input Price": "输入价格",
    "Output Price": "输出价格",
    "Input /M": "输入价格 / 百万令牌",
    "Output /M": "输出价格 / 百万令牌",
    "Cache Read": "缓存读取",
    "Cache read": "缓存读取",
    "Cache read /M": "缓存读取价格 / 百万令牌",
    Standard: "标准",
    Balanced: "均衡",
    Nitro: "极速",
    Exacto: "精准",
    "Latency / throughput": "延迟 / 吞吐量",
    "Filter quantization": "筛选量化类型",
    Quantization: "量化",
    Region: "地区",
    "Data Policy": "数据策略",
    "Prompt Training": "使用提示词训练",
    "Prompt Logging": "记录提示词",
    "Retains Prompts": "保留提示词",
    Healthy: "正常",
    Degraded: "性能下降",
    Unavailable: "不可用",
    "Supports Tools": "支持工具调用",
    "% off": "% 优惠",
    "Not routable": "不参与自动路由",
    Private: "不记录提示词",
    Logs: "记录提示词",
    Trains: "用于训练",
    "All locations": "全部地区",
    Training: "训练",
    "Trains on prompts": "使用提示词训练",
    "Does not train": "不用于训练",
    Retention: "数据保留",
    "Zero retention": "零保留",
    "Limited retention": "有限保留",
    Policies: "政策",
    "Has terms of service": "提供服务条款",
    "Has privacy policy": "提供隐私政策",
    Access: "接入能力",
    "Supports BYOK": "支持 BYOK",
    "Moderation required": "需要内容审核",
    Headquarters: "总部所在地",
    "Compare providers side by side": "并排比较供应商",
    "This model is hosted by one provider. OpenRouter forwards every request to it directly — no routing decisions to make.":
      "此模型仅由一家供应商托管。OpenRouter 会将所有请求直接转发给该供应商，无需进行路由选择。",
    "Tokens processed on OpenRouter": "OpenRouter 已处理令牌",
    "Terms of Service": "服务条款",
    "Privacy Policy": "隐私政策",
    "Search providers...": "搜索供应商...",
    "Providers display format": "供应商显示方式",
    BYOK: "BYOK",
    "Terms of service": "服务条款",
    "Privacy policy": "隐私政策",
    "Daily tokens": "每日令牌量",
    "Monthly tokens": "每月令牌量",
    Yes: "是",
    No: "否",
  });
  const LOCALE_METRICS = Object.freeze({
    Performance: "性能",
    Uptime: "可用率",
    Activity: "使用趋势",
    FAQ: "常见问题",
    Benchmarks: "基准测试",
    Latency: "延迟",
    Throughput: "吞吐量",
    "E2E Latency": "E2E 延迟",
    "Tool Call Error Rate": "工具调用错误率",
    "Structured Output Error Rate": "结构化输出错误率",
    "Cache Hit Rate": "缓存命中率",
    "Cache hit rate": "缓存命中率",
    "Token share 1d": "令牌占比（1 天）",
    "Token share": "令牌占比",
    "Token Volume": "令牌用量",
    Requests: "请求数",
    "Input Tokens": "输入令牌",
    "Output Tokens": "输出令牌",
    "Time to First Token": "首字延迟",
    "Tokens per second": "每秒令牌数",
    Median: "中位数",
    "Success Rate": "成功率",
    "Error Rate": "错误率",
    "No data": "暂无数据",
    "30 days": "30 天",
    "Category Performance": "分类表现",
    "Ranking Distribution": "排名分布",
    "Expand chart": "展开图表",
    First: "第一",
    Second: "第二",
    Third: "第三",
    Fourth: "第四",
    Rank: "排名",
    Average: "平均",
    Avg: "平均",
    Overall: "综合",
    Score: "分数",
    "Win Rate": "胜率",
    Percentile: "百分位",
    "Model Rank": "模型排名",
    "ELO Rank": "ELO 排名",
    "ELO Score": "ELO 分数",
    "Intelligence Index": "智能指数",
    "Coding Index": "编程指数",
    "Agentic Index": "智能体指数",
    "Math Index": "数学指数",
    "Better than": "优于",
    "% of models compared": "% 的参评模型",
    "Higher is better": "越高越好",
    "Lower is better": "越低越好",
    "No data available": "暂无数据",
    "No benchmark data": "暂无基准数据",
    "Graduate-level scientific reasoning": "研究生水平的科学推理",
    "Humanity's Last Exam": "人类终极考试",
    "Long context reasoning evaluation": "长上下文推理评估",
    "Economically valuable tasks": "具有经济价值的任务",
    "Research-level physics reasoning": "研究级物理推理",
    Coding: "编程",
    Knowledge: "知识",
    "Metrics sourced from": "指标来源",
    "How Design Arena works": "Design Arena 工作原理",
    tournaments: "场锦标赛",
    "Code Categories": "编程类别",
    "Data Visualization": "数据可视化",
    "Game Development": "游戏开发",
    "UI Component": "UI 组件",
    "UI Components": "UI 组件",
    Website: "网站",
    "Models Arena": "模型竞技场",
    Evaluator: "评测方",
    Domain: "领域",
    "Overall Indices": "综合指数",
    Mathematics: "数学",
    "Other Benchmarks": "其他基准测试",
    "Arena Rank": "竞技场排名",
    "Arena Appearances": "竞技场出场次数",
    Top: "前",
    Win: "胜率",
    "Collapse chart": "收起图表",
    "Interactive chart": "交互式图表",
    "Y-axis scale": "Y 轴刻度",
    "Scores on standardized evaluations. Higher percentages are better — and rank percentile shows where this model lands among all models on OpenRouter.":
      "标准化评估分数。百分比越高越好；排名百分位表示该模型在 OpenRouter 所有模型中的位置。",
    "Python programming for scientific computing": "用于科学计算的 Python 编程",
    "Proportion of correctly answered questions": "正确回答问题的比例",
    "Rate of avoiding hallucination among non-correct responses": "非正确回答中避免产生幻觉的比例",
    "In each tournament, 4 models generate outputs for the same prompt. Users vote on which is best. This chart shows how often this model placed 1st, 2nd, 3rd, or 4th.":
      "每场锦标赛由 4 个模型针对同一提示生成结果，用户投票选出最佳结果。此图展示该模型获得第 1、2、3 或 4 名的频率。",
    "1 week": "1 周",
    "1d": "1 天",
    Tokens: "令牌",
    Prompt: "输入",
    Reasoning: "推理",
    Completion: "输出",
    "Frequently asked questions": "常见问题",
    "AutoExacto Benchmarks": "AutoExacto 基准测试",
    "Expand benchmark scores": "展开基准测试分数",
    "AA-Omniscience Accuracy": "AA-Omniscience 准确率",
    "AA-Omniscience Non-Hallucination Rate": "AA-Omniscience 非幻觉率",
    "All Regions": "全部地区",
    "Learn More": "了解更多",
    "Median Throughput on OpenRouter": "OpenRouter 吞吐量中位数",
    "Median Latency on OpenRouter": "OpenRouter 延迟中位数",
    "Median End-to-End Latency on OpenRouter": "OpenRouter 端到端延迟中位数",
    "Tool Call Error Rate by Provider": "各供应商工具调用错误率",
    "Structured Output Error Rate by Provider": "各供应商结构化输出错误率",
    "Cache Hit Rate by Provider": "各供应商缓存命中率",
    "Rolling average over the past 32 days — the same lookback window used for quality-based routing":
      "过去 32 天的滚动平均值，与质量路由使用相同的回溯周期",
    "Instruction-following benchmark": "指令遵循基准测试",
    "Conversational AI agents in dual-control scenarios": "双重控制场景中的对话式 AI 智能体",
    "Agentic coding & terminal use": "智能体编程与终端使用",
    "No Design Arena data available for this variant.": "该变体暂无 Design Arena 数据。",
    "No benchmark data available for this model yet.": "该模型暂时没有基准测试数据。",
    "No benchmark data available for this model.": "该模型暂无基准测试数据。",
    "Text to Image": "文本生成图片",
    "Text to Video": "文本生成视频",
    "Image to Video": "图片生成视频",
    "Text to Speech": "文本转语音",
    "Image Editing": "图片编辑",
    "Builders Arena": "开发者竞技场",
    "Agents Arena": "智能体竞技场",
    "Graphic Design": "平面设计",
    "Image to Image": "图片到图片",
    Slides: "幻灯片",
    "Video to Video": "视频到视频",
    Mobile: "移动端",
    "Native Android": "原生 Android",
    "Agon Web Apps": "Agon Web 应用",
    "Mobile Apps": "移动应用",
    "Native Apps": "原生应用",
    "Full Stack": "全栈",
    "Game Dev": "游戏开发",
    "General Intelligence": "通用智能",
    "Software Engineering": "软件工程",
    "Mathematical Reasoning": "数学推理",
    "Agentic Capabilities": "智能体能力",
    "Multidisciplinary Knowledge": "多学科知识",
    "Scientific Reasoning": "科学推理",
    "Academic Knowledge": "学术知识",
    "Instruction Following": "指令遵循",
    "Agentic Planning & Tool Use": "智能体规划与工具使用",
    "Real-World Tasks": "真实世界任务",
    "Knowledge & Factuality": "知识与事实准确性",
    "Frontier Physics": "前沿物理",
    "Competitive Programming": "算法竞赛",
    "Scientific Computing": "科学计算",
    "Long Context Reasoning": "长上下文推理",
    "Agentic Terminal Tasks": "智能体终端任务",
    "Competition Mathematics": "竞赛数学",
    "Avg. Provider Uptime (3d)": "供应商平均可用率（3 天）",
    "Avg. OpenRouter Uptime (3d)": "OpenRouter 平均可用率（3 天）",
    "averaged across all endpoints": "所有端点的平均值",
    "averaged across all requests": "所有请求的平均值",
    "Prompt tokens measure input size. Reasoning tokens show internal thinking before a response. Completion tokens reflect total output length.":
      "输入令牌衡量输入大小；推理令牌表示响应前的内部推理；输出令牌表示完整输出长度。",
    "Throughput is how fast the model writes (tokens per second — higher is better). Latency is total round-trip time (lower is better). TTFT is time-to-first-token — how long before you see anything appear (lower is better).":
      "吞吐量表示模型生成文本的速度（每秒令牌数，越高越好）；延迟表示完整往返时间（越低越好）；TTFT 表示首字延迟，即开始看到输出前的等待时间（越低越好）。",
    "Percent of requests that succeeded over the last 30 days. OpenRouter monitors every provider continuously and automatically retries on the next-best provider when one returns an error.":
      "过去 30 天内请求成功的比例。OpenRouter 会持续监控所有供应商，并在某个供应商返回错误时自动改用次优供应商重试。",
    "When an error occurs in an upstream provider, we can recover by routing to another healthy provider, if your request filters allow it. You can access uptime data programmatically through the":
      "如果请求筛选条件允许，上游供应商出错时可通过切换到其他正常供应商恢复。你也可以通过",
    "about our load balancing and customization options.": "了解负载均衡和自定义选项。",
    "Public apps that send the most traffic to this model. Good signal for what real production workloads look like — and a hint at which use cases this model is best suited for.":
      "向该模型发送流量最多的公开应用，可用于了解真实生产负载及该模型最适合的使用场景。",
    "Token volume and request traffic to this model over time.": "该模型的令牌用量和请求流量趋势。",
    "UTF-8 bytes": "UTF-8 字节",
    "Requires: 18+ age confirmation": "要求：确认年满 18 周岁",
    "Tool calling success rate (all providers, last 30 days)":
      "工具调用成功率（全部供应商，过去 30 天）",
    "Not enough data to display yet.": "数据不足，暂时无法显示。",
  });
  const LOCALE_BENCHMARKS = Object.freeze({
    Benchmarks: "基准测试",
    "OpenRouter Benchmarks": "OpenRouter 基准测试",
    "Independent, reproducible measurements of the knobs you can actually set on an OpenRouter request: models, providers, search engines, and tool budgets. Every score links to the configuration, costs, and telemetry behind it.":
      "对 OpenRouter 请求中可实际配置的模型、供应商、搜索引擎和工具预算进行独立、可复现的测量。每项分数都可查看对应配置、成本和遥测数据。",
    "Benchmark categories": "基准测试分类",
    "Agents & tools": "智能体与工具",
    Reasoning: "推理",
    Benchmark: "基准测试",
    Quality: "质量",
    Value: "性价比",
    Speed: "速度",
    "Multi-turn service agents making tool calls under strict policy constraints.":
      "在严格策略约束下调用工具的多轮服务智能体。",
    "Graduate-level science questions that resist retrieval and reward careful reasoning.":
      "难以通过检索直接作答、需要严谨推理的研究生级科学问题。",
    "For usage-based views of the same models, see the": "如需查看这些模型的实际用量，请参阅",
    "model rankings": "模型排行榜",
    "and the": "以及",
    "full model list": "完整模型列表",
    Paper: "论文",
    "Benchmark page sections": "基准测试页面分区",
    "Model comparison": "模型对比",
    "Cost efficiency": "成本效率",
    Leaderboard: "排行榜",
    "Example problems": "示例问题",
    "Why we run it": "测试目的",
    "What scores tell you": "分数说明",
    Methodology: "评测方法",
    "API access": "API 访问",
    "Most Accurate": "准确率最高",
    "Best Value": "性价比最高",
    Fastest: "速度最快",
    Accuracy: "准确率",
    "Cost per question": "每题成本",
    "Time per question": "每题耗时",
    "Expand Accuracy chart": "展开准确率图表",
    "Expand Cost per question chart": "展开每题成本图表",
    "Expand Time per question chart": "展开每题耗时图表",
    "Representative-run accuracy, best first.": "代表性运行的准确率，按最高值优先排列。",
    "Average cost per question, cheapest first.": "平均每题成本，按最低成本优先排列。",
    "Average wall-clock time per question, fastest first.": "平均每题实际耗时，按最快速度优先排列。",
    "Accuracy vs. cost (Pareto frontier)": "准确率与成本（帕累托前沿）",
    "One point per model, using default routing (not pinned to a provider) when available. The line is the Pareto frontier: no model beats these on both accuracy and cost.":
      "每个点代表一个模型；可用时采用默认路由，不固定供应商。曲线表示帕累托前沿，即没有其他模型能同时在准确率和成本上胜过这些模型。",
    "Top-level rows use default routing where available; click a row to expand provider-pinned results.":
      "顶层行在可用时采用默认路由；点击行可展开固定供应商的结果。",
    Model: "模型",
    "Std dev": "标准差",
    "Cost / question": "成本 / 题",
    "Time / question": "耗时 / 题",
    "Output tok / question": "输出令牌 / 题",
    "Top-level rows show standard deviation across runs using default routing (not pinned to a provider); provider rows show standard deviation across runs pinned to that provider.":
      "顶层行显示默认路由（不固定供应商）多次运行的标准差；供应商行显示固定到该供应商后多次运行的标准差。",
    Pareto: "帕累托前沿",
  });
  const LOCALE_RANKINGS = Object.freeze({
    "AI Model Rankings": "AI 模型排行榜",
    "Live LLM rankings based on benchmarks and real data from millions of people using models through OpenRouter.":
      "基于基准测试以及数百万用户通过 OpenRouter 使用模型的真实数据生成的实时大语言模型排行榜。",
    "Rankings sections": "排行榜分类",
    "Rankings page sections": "排行榜页面分区",
    "Top Models": "热门模型",
    Leaderboard: "排行榜",
    "LLM Leaderboard": "大语言模型排行榜",
    "Top models by task": "各任务热门模型",
    "Cost per session": "每次会话成本",
    "Market Share": "市场份额",
    "Fastest models": "最快模型",
    Languages: "语言",
    "Context Length": "上下文长度",
    "Tool Calls": "工具调用",
    Images: "图片",
    "Top Apps": "热门应用",
    "Weekly usage of models across OpenRouter": "OpenRouter 各模型的每周用量",
    "Compare the most popular models on OpenRouter": "对比 OpenRouter 上最受欢迎的模型",
    "This Week": "本周",
    Today: "今天",
    "This Month": "本月",
    "Open models": "开放模型",
    "Closed models": "闭源模型",
    "Show Percentage": "显示百分比",
    "Share of tokens": "令牌占比",
    "Show Pareto": "显示帕累托前沿",
    "Find a model…": "搜索模型…",
    "Index Score": "指数分数",
    "Intelligence Index Score": "智能指数分数",
    "TOP 20 PLOTTED · SEARCH TO PIN UP TO 5": "已绘制前 20 名 · 搜索并固定最多 5 个模型",
    "$/1M tokens (weighted avg input)": "美元 / 百万令牌（加权平均输入）",
    "Highest → Lowest Cost": "成本：从高到低",
    "1 turn": "1 轮",
    "2–9 turns": "2–9 轮",
    "10–49 turns": "10–49 轮",
    "50+ turns": "50+ 轮",
    "Top models on OpenRouter by Artificial Analysis Intelligence Index":
      "按 Artificial Analysis 智能指数排列的 OpenRouter 热门模型",
    "Filter by benchmark category": "按基准测试类别筛选",
    "Weighted Avg Input Price": "加权平均输入价格",
    "Minute Pace": "每分钟速率",
    "Hourly Pace": "每小时速率",
    "Daily Pace": "每日速率",
    "Weekly Pace": "每周速率",
    "Monthly Pace": "每月速率",
    Forecast: "预测",
    Classification: "分类",
    "Content Writing": "内容写作",
    "Q&A & Knowledge": "问答与知识",
    "Roleplay & Fiction": "角色扮演与小说",
    Research: "研究",
    "Research & Reports": "研究与报告",
    Conversation: "对话",
    Summarization: "摘要",
    "Customer Support": "客户支持",
    "Finance & Trading": "金融与交易",
    "Security Audit": "安全审计",
    Translation: "翻译",
    "Workflow Execution": "工作流执行",
    "Multi-step Planning": "多步规划",
    "Web Search": "联网搜索",
    "Tool Dispatch": "工具调度",
    "Memory Extraction": "记忆提取",
    "Code Generation": "代码生成",
    Debugging: "调试",
    "File I/O": "文件读写",
    "Shell Execution": "Shell 执行",
    "Code Review": "代码审查",
    "Frontend & UI": "前端与 UI",
    "Repo Scanning": "仓库扫描",
    "SQL & Database": "SQL 与数据库",
    "DevOps & Config": "DevOps 与配置",
    "Data Extraction": "数据提取",
    "Data Transformation": "数据转换",
    "Each task’s leading models, ranked by share of spend on OpenRouter":
      "按 OpenRouter 支出占比排列各任务的领先模型",
    "Share of spend": "支出占比",
    spend: "支出",
    "What one coding-agent session typically costs (paid usage), by session length":
      "按会话时长统计一次编程智能体会话的典型付费成本",
    "Median spend per session over the last 30 days, on a log scale. A session is attributed to a model when that model served at least 80% of its tokens.":
      "过去 30 天每次会话支出的中位数，使用对数刻度。当某模型处理了至少 80% 的令牌时，该会话归属于该模型。",
    "Chart options": "图表选项",
    "Compare text request share by model author on OpenRouter.":
      "对比 OpenRouter 上各模型作者的文本请求份额。",
    "Compare models by natural language on OpenRouter": "按自然语言对比 OpenRouter 模型",
    "Compare models by programming language on OpenRouter": "按编程语言对比 OpenRouter 模型",
    "Requests by prompt & completion length on OpenRouter": "按输入与输出长度统计 OpenRouter 请求",
    "Tool usage across models on OpenRouter": "OpenRouter 各模型的工具使用情况",
    "Total images processed on OpenRouter": "OpenRouter 处理的图片总数",
    "Filter models by openness": "按开放程度筛选模型",
    "Filter by time window": "按时间范围筛选",
    "Shown are the sum of prompt and completion tokens per model, including reasoning tokens. Open models are those with publicly available weights.":
      "此处展示各模型输入与输出令牌之和，并包含推理令牌。开放模型是指权重公开可用的模型。",
    "Change in tokens processed in the last week from the previous period":
      "过去一周处理令牌量相较上一周期的变化",
    Linear: "线性",
    Log: "对数",
    "Not enough agent sessions yet to report cost per session.": "智能体会话数量不足，暂时无法统计每次会话成本。",
    "Not enough classified usage yet to rank tasks.": "已分类用量不足，暂时无法进行任务排名。",
    "No models match this filter.": "没有符合当前筛选条件的模型。",
    "Loading app rankings": "正在加载应用排行榜",
    "Loading benchmark rankings": "正在加载基准测试排行榜",
    "Loading cost per session rankings": "正在加载每次会话成本排行榜",
    "Loading performance rankings": "正在加载性能排行榜",
    "Loading task rankings": "正在加载任务排行榜",
    "Text Leaderboard": "文本排行榜",
    "Image Leaderboard": "图片排行榜",
    "Embedding Leaderboard": "嵌入排行榜",
    "Rerank Leaderboard": "重排序排行榜",
    "Video Leaderboard": "视频排行榜",
    "Speech Leaderboard": "语音排行榜",
    "Transcription Leaderboard": "转录排行榜",
    "Transcribed Characters": "转录字符数",
    "Total Duration": "总时长",
    "Explore apps and agents": "探索应用与智能体",
    "Browse apps": "浏览应用",
  });
  const LOCALE_APPS = Object.freeze({
    "App & Agent Rankings": "应用与智能体排行榜",
    "Most Popular": "最受欢迎",
    "Largest public apps and agents": "规模最大的公开应用与智能体",
    "opting into": "选择加入",
    "usage tracking on OpenRouter.": "OpenRouter 使用情况跟踪。",
    "View more →": "查看更多 →",
    "Explore apps and agents": "探索应用与智能体",
    "Browse apps": "浏览应用",
    Trending: "增长趋势",
    "Fastest growing this week": "本周增长最快",
    "Top Coding Agents": "热门编程智能体",
    "Top Productivity": "热门效率工具",
    "Top Creative": "热门创意工具",
    "Top Entertainment": "热门娱乐应用",
    "Global Ranking": "全球排行榜",
    Today: "今天",
    App: "应用",
    Tokens: "令牌",
    "Personal Agents": "个人智能体",
    "CLI Agents": "命令行智能体",
    "IDE Extensions": "IDE 扩展",
    "General Chat": "通用对话",
    Roleplay: "角色扮演",
    "Creative Writing": "创意写作",
    "Programming App": "编程应用",
    "Video Generation": "视频生成",
    Game: "游戏",
    "No apps in this category yet": "该类别暂无应用",
    "View app analytics": "查看应用分析",
    "Growth vs previous period": "较上一周期增长",
    "View uncategorized apps": "查看未分类应用",
    "Cloud Agents": "云端智能体",
    "Native App Builders": "原生应用构建器",
    "Image Generation": "图像生成",
    "Audio Generation": "音频生成",
    "Writing Assistants": "写作助手",
    "Coding Agents": "编程智能体",
    Creative: "创意",
    Productivity: "效率工具",
    Entertainment: "娱乐",
    "Change vs previous period": "较上一周期变化",
    "This Week": "本周",
    "This Month": "本月",
    Visit: "访问",
    Spawn: "启动",
    "Total tokens": "总令牌量",
    "Daily global rank": "每日全球排名",
    "Active since": "活跃起始时间",
    "Models used": "使用的模型数",
    "OpenRouter Usage": "OpenRouter 用量",
    "Last 30 days": "过去 30 天",
    "Top models this month": "本月热门模型",
    "External Navigation": "外部网站跳转",
    "You are about to leave OpenRouter and visit an external website. Do you want to continue?":
      "你即将离开 OpenRouter 并访问外部网站，是否继续？",
  });
  const LOCALE_DOCS_SHELL = Object.freeze({
    "Documentation Index": "文档索引",
    "Fetch the complete documentation index at:": "获取完整文档索引：",
    "Use this file to discover all available pages before exploring further.":
      "先使用此文件查找全部可用页面。",
    "Skip to main content": "跳到主要内容",
    "Search...": "搜索...",
    "Ask Assistant": "咨询助手",
    "Change theme preference": "切换主题偏好",
    "Client SDKs": "客户端 SDK",
    "Agent SDK": "智能体 SDK",
    Cookbook: "示例集",
    Pages: "页面",
    "Models & Routing": "模型与路由",
    "Model Fallbacks": "模型回退",
    "Provider Selection": "供应商选择",
    "Private Models": "私有模型",
    "Model Variants": "模型变体",
    Routers: "路由器",
    Multimodal: "多模态",
    Authentication: "身份验证",
    "Stripe Projects": "Stripe 项目",
    "Report Feedback": "反馈问题",
    "Workspace Budgets": "工作区预算",
    "Switching Workspaces": "切换工作区",
    "Single Sign-On (SSO)": "单点登录（SSO）",
    "SCIM Group Mappings": "SCIM 组映射",
    "Custom Classifiers": "自定义分类器",
    "Response Caching": "响应缓存",
    "Structured Outputs": "结构化输出",
    "Message Transforms": "消息转换",
    "Zero Completion Insurance": "零输出保障",
    "App Attribution": "应用归因",
    "Service Tiers": "服务等级",
    "Sovereign AI": "主权 AI",
    "Router Metadata": "路由元数据",
    "Input & Output Logging": "输入与输出日志",
    "Where Ori writes files": "Ori 文件写入位置",
    "Data Collection": "数据收集",
    "Provider Logging": "供应商日志",
    "Best Practices": "最佳实践",
    "Latency and Performance": "延迟与性能",
    "Prompt Caching": "提示词缓存",
    "Uptime Optimization": "可用性优化",
    "Reasoning Tokens": "推理令牌",
    "For Providers": "面向供应商",
    "Frameworks and Integrations Overview": "框架与集成概览",
    "Open search": "打开搜索",
    "Toggle assistant panel": "切换助手面板",
    "Copy page": "复制页面",
    "More actions": "更多操作",
    "Scrollable table": "可滚动表格",
    "Report incorrect code": "报告错误代码",
    "Copy the contents from the code block": "复制代码块内容",
    "Navigate to header": "跳转到此标题",
    "Code examples": "代码示例",
    Pagination: "分页",
    "Ask a question...": "输入问题...",
    "Send message": "发送消息",
    FAQ: "常见问题",
  });
  const LOCALE_DOCS = Object.freeze({
    "Using the OpenRouter API": "使用 OpenRouter API",
    "Using the Client SDKs": "使用客户端 SDK",
    "Using the Agent SDK": "使用智能体 SDK",
    "Using the OpenAI SDK": "使用 OpenAI SDK",
    "Using third-party SDKs": "使用第三方 SDK",
    "Building with an AI assistant": "使用 AI 助手开发",
    "Get started with OpenRouter": "开始使用 OpenRouter",
    Approach: "接入方式",
    "Best for": "适用场景",
    "Full control, any language, no dependencies": "完全控制、支持任意语言、无依赖",
    "Type-safe model calls with minimal overhead": "低开销的类型安全模型调用",
    "Building agents with tool use, loops, and state": "构建具备工具、循环和状态的智能体",
    "First, install the SDK:": "首先安装 SDK：",
    "Then use it in your code:": "然后在代码中使用：",
    "Install the package:": "安装软件包：",
    "Build an agent with tools:": "构建带工具的智能体：",
    "See all 28 lines": "查看全部 28 行",
    "Next: Batch": "下一篇：批处理",
    "OpenAPI specification": "OpenAPI 规范",
    Requests: "请求",
    "Completions request format": "补全请求格式",
    "Structured outputs": "结构化输出",
    Plugins: "插件",
    Headers: "请求头",
    "Assistant prefill": "助手预填充",
    Responses: "响应",
    "CompletionsResponse format": "CompletionsResponse 格式",
    "Finish reason": "结束原因",
    "Querying cost and stats": "查询成本与统计",
    "An overview of OpenRouter’s API": "OpenRouter API 概览",
    "Request Schema": "请求结构",
    Parameters: "参数",
    "Model routing": "模型路由",
    Streaming: "流式输出",
    "Non-standard parameters": "非标准参数",
    "Query Generation Stats": "查询生成统计",
    "Next: Streaming": "下一篇：流式输出",
  });
  const LOCALE_SDK = Object.freeze({
    "The Model-Agnostic Agent SDK": "与模型无关的智能体 SDK",
    "View Docs": "查看文档",
    "Flexible Results": "灵活的结果处理",
    "Built-In Streaming": "内置流式输出",
    "Isolated Tools": "隔离式工具",
    "Agentic Workflows": "智能体工作流",
    "Scales Linearly": "线性扩展",
    "Drop-In Ready": "开箱即用",
    "Simple, Powerful API": "简洁而强大的 API",
    Basic: "基础",
    "Tool Calling": "工具调用",
    "Agent SDK for TypeScript": "TypeScript 智能体 SDK",
    "Type-Safe Tools": "类型安全工具",
    "Multi-Turn Agents": "多轮智能体",
    "Stop Conditions": "停止条件",
    "Tool Approval": "工具审批",
    "CLI Integration": "CLI 集成",
    "Build an Agent in Minutes": "数分钟内构建智能体",
    "Migration Guide": "迁移指南",
    "Call Any Model": "调用任意模型",
    "Ship & Scale": "发布与扩展",
    "Start Building Today": "立即开始构建",
    "Copy code": "复制代码",
  });
  const LOCALE_BLOG = Object.freeze({
    All: "全部",
    Announcements: "公告",
    Tutorials: "教程",
    Insights: "洞察",
    Pinned: "置顶",
    "View all posts": "查看全部文章",
    "Recent Product Announcements": "最新产品公告",
    "View all announcements": "查看全部公告",
    "Blog categories": "博客分类",
    "RSS Feed": "RSS 订阅",
    "Recent announcements": "最新公告",
    Breadcrumb: "面包屑导航",
    "Table of contents": "目录",
    "Tl;dr": "摘要",
    "Get started": "开始使用",
    model: "模型",
    catch: "检出率",
    result: "结果",
    pass: "通过",
    "fail (cost)": "失败（成本）",
  });
  const LOCALE_LEGAL = Object.freeze({
    "Privacy Policy": "隐私政策",
    "Collection of Personal Data": "个人数据收集",
    "Personal Data You Voluntarily Provide to Us": "你主动提供的个人数据",
    "Personal Data Collected Automatically": "自动收集的个人数据",
    "Model Provider Data Practices": "模型供应商的数据处理方式",
    "Enterprise and API Users": "企业与 API 用户",
    "Biometric Data Processing": "生物识别数据处理",
    "Cookies and Other Tracking Technology": "Cookie 与其他跟踪技术",
    "How We Use Your Personal Data": "我们如何使用你的个人数据",
    "How We Share and Disclose Your Personal Data": "我们如何共享和披露个人数据",
    "Your Rights and Choices": "你的权利与选择",
    "Data Security": "数据安全",
    "Personal Data Retention": "个人数据保留",
    Eligibility: "适用资格",
    "Data Transfers": "数据传输",
    "Governing Law": "适用法律",
    Cookies: "Cookie",
    "Changing Your Cookie Settings": "更改 Cookie 设置",
    "Analytics and Other Tracking Technologies": "分析及其他跟踪技术",
    "Aggregated and De-identified Information": "汇总与去标识化信息",
    "Marketing Communications": "营销通信",
    "Advertising Preferences": "广告偏好",
    "Keeping Your Personal Data Accurate and Deletion": "保持个人数据准确及删除",
    "Rights Regarding Your Personal Data": "与个人数据有关的权利",
    "Integration of Third-Party Platforms and Services": "第三方平台与服务集成",
    "Image, Audio, and Video Data": "图片、音频和视频数据",
    "Additional U.S. State Disclosures and Legal Bases for Processing Under the GDPR":
      "美国各州补充披露及 GDPR 下的处理法律依据",
    "Service Overview": "服务概览",
    "Accounts and Registration": "账户与注册",
    "API Credentials": "API 凭据",
    Payment: "付款",
    "Model Terms": "模型条款",
    "User Content": "用户内容",
    "Prohibited Conduct": "禁止行为",
    "Red Teaming": "红队测试",
    "Privacy Policy; Additional Terms": "隐私政策与附加条款",
    "Ownership; Proprietary Rights": "所有权与专有权利",
    Confidentiality: "保密义务",
    Indemnity: "赔偿",
    "Disclaimers; No Warranties": "免责声明；不提供保证",
    "Limitation of Liability": "责任限制",
    "Dispute Resolution and Arbitration": "争议解决与仲裁",
    "Consent to Electronic Communications": "同意电子通信",
    "Contact Information": "联系信息",
  });
  const LOCALE_SUPPORT = Object.freeze({
    "Hello, how can I help you?": "你好，需要什么帮助？",
    "Raise a Ticket": "提交工单",
    "Create Ticket": "创建工单",
    "View Docs": "查看文档",
    "Frequently Asked Questions": "常见问题",
    "Getting started": "开始使用",
    "Pricing and Fees": "定价与费用",
    "Models and Providers": "模型与供应商",
    "API Technical Specifications": "API 技术规范",
    "Privacy and Data Logging": "隐私与数据日志",
    "Credit and Billing Systems": "额度与账单系统",
    "Account Management": "账户管理",
    "Still need help?": "仍需帮助？",
    "Email Support": "邮件支持",
    "Join Discord": "加入 Discord",
  });
  const LOCALE_MARKETING = Object.freeze({
    Pricing: "定价",
    "Plans for indie hackers, AI native startups, and enterprises":
      "面向独立开发者、AI 原生初创公司和企业的方案",
    "Get Started": "开始使用",
    "Talk To Sales": "联系销售",
    "Contact Sales": "联系销售",
    "Pay-as-you-go": "按用量付费",
    Enterprise: "企业版",
    "Platform Fees": "平台费用",
    "Fee discounts available": "可享手续费折扣",
    Free: "免费版",
    Models: "模型",
    Providers: "供应商",
    "Explore all models →": "浏览所有模型 →",
    "Chat and API Access": "聊天与 API 访问",
    "Try chat now →": "立即试用聊天 →",
    "Activity Logs & Export": "活动日志与导出",
    "Auto-routing, preferred vendor selections": "自动路由与首选供应商",
    "Learn more →": "了解更多 →",
    "Budgets & Spend Controls": "预算与支出控制",
    "Prompt Caching": "提示词缓存",
    "Management API key": "管理 API 密钥",
    "Admin Controls": "管理员控制",
    "Enterprise features →": "企业功能 →",
    "Data Policy-Based Routing": "基于数据政策的路由",
    "Model & provider policies": "模型与供应商政策",
    "Managed Policy Enforcement": "托管式政策执行",
    "Contractual SLAs": "合同 SLA",
    "Payment options": "支付方式",
    "Credit card, crypto & more": "信用卡、加密货币等",
    "Invoicing options": "发票结算选项",
    "BYOK Limits": "BYOK 限额",
    "Rate limits": "速率限制",
    "High global limits": "较高的全局限额",
    "Optional dedicated limits": "可选专属限额",
    "Token Pricing": "令牌定价",
    "Free models only": "仅免费模型",
    "No minimum spend. Prices based on models": "无最低消费，价格取决于模型",
    "Volume commitments. Prices based on models": "用量承诺，价格取决于模型",
    Support: "支持",
    "Community Support": "社区支持",
    "Email Support": "邮件支持",
    "Support SLA with Shared Slack Channel": "支持 SLA 与共享 Slack 频道",
    "Get Started For Free": "免费开始使用",
    "Buy Credits": "购买额度",
    "Frequently Asked Questions": "常见问题",
    "Billing and Pricing": "账单与定价",
    "Usage and Rate Limits": "用量与速率限制",
    "Routing and Latency": "路由与延迟",
    "Privacy and Security": "隐私与安全",
    "Models and Features": "模型与功能",
    "Reliability and Uptime": "可靠性与可用率",
    "Ready To Get Started?": "准备开始了吗？",
    "Sign Up For Free": "免费注册",
    "How are tokens billed?": "令牌如何计费？",
    "Do you mark up provider pricing?": "你们会在供应商价格上加价吗？",
    "How is billing structured for BYOK, Pay‑As‑You‑Go vs Enterprise?":
      "BYOK、按用量付费和企业版的计费结构有何不同？",
    "Are failed or fallback attempts billed?": "失败或回退请求会计费吗？",
    "Do you offer volume discounts or annual plans?": "是否提供用量折扣或年度方案？",
    "Are streaming responses billed differently?": "流式响应的计费方式是否不同？",
    "What payment methods do you accept?": "支持哪些支付方式？",
    "Are taxes (VAT/GST) included in prices?": "价格是否包含税费（VAT/GST）？",
    "Is there a minimum spend or lock‑in on": "是否有最低消费或锁定期限：",
    "Do you enforce rate limits?": "是否实施速率限制？",
    "Can I separate environments (dev/staging/production)?": "可以隔离开发、预发布和生产环境吗？",
    "Do you enforce platform rate limits?": "是否有平台级速率限制？",
    "Can I make sure to send API requests in specific regions?": "能否确保 API 请求发送到特定区域？",
    "Does routing affect latency?": "路由会影响延迟吗？",
    "What happens if a model is deprecated or pricing changes?": "模型弃用或价格变化时会怎样？",
    "Can I pin specific model versions?": "可以固定特定模型版本吗？",
    "Do you train on customer data?": "是否使用客户数据训练？",
    "Do you support SSO?": "支持 SSO 吗？",
    "How do I migrate from OpenAI/Anthropic?": "如何从 OpenAI/Anthropic 迁移？",
    "Do you support function calling/tools?": "支持函数调用/工具吗？",
    "What happens if a provider is down or a model errors?": "供应商宕机或模型出错时会怎样？",
    "Where can I check uptime and incidents?": "在哪里查看可用率和事故？",
    "Join thousands of companies already building with OpenRouter":
      "加入数千家正在使用 OpenRouter 构建产品的公司",
    "Built for AI velocity,": "为 AI 速度而生，",
    "designed for enterprise control": "专为企业管控而设计",
    "Stop managing complexity. Start shipping agents.": "不再管理复杂性，专注交付智能体。",
    "From Proof-of-Concept to Production": "从概念验证到生产",
    "High Rate Limits": "高并发限额",
    "Automatic Failover": "自动故障转移",
    "Bring Your Own Capacity": "自带容量",
    "Unified Billing": "统一账单",
    "Compliance & Privacy": "合规与隐私",
    "Zero-Logging Default": "默认零日志",
    "Unified Reporting": "统一报表",
    "Organization Support with SSO": "支持采用 SSO 的组织",
    "Spend Management": "支出管理",
    "Sovereign AI": "主权 AI",
    "Enterprise-Grade AI Infrastructure": "企业级 AI 基础设施",
    Traces: "链路追踪",
    "LLM Observability": "LLM 可观测性",
    "Credit Limits": "额度限制",
    "Cost Management": "成本管理",
    "Zero Retention": "零保留",
    "Simple Setup & Billing": "简易设置与结算",
    "Payment Options": "支付方式",
    "Credit Card": "信用卡",
    "Invoiced Billing": "发票结算",
    "Credit Lines": "信用额度",
    "Transparent Pricing": "透明定价",
    "Enterprise Agreements": "企业协议",
    "Enterprise Support": "企业支持",
    "Priority Support Channels": "优先支持渠道",
    "Dedicated Engineering Contact": "专属工程联系人",
    "Data Protection & Privacy Agreements": "数据保护与隐私协议",
    "Technical Resources": "技术资源",
    "Enterprise Quickstart": "企业快速入门",
    "API Documentation": "API 文档",
    "Provider Routing Guide": "供应商路由指南",
    "Integration Examples": "集成示例",
    Labs: "实验室",
    "Explore experimental features and tools. These are works in progress and may change or be removed at any time.":
      "探索实验性功能和工具。这些功能仍在开发中，可能随时调整或移除。",
    Experiments: "实验项目",
    "Model Fusion": "模型融合",
    "Cost Simulator": "成本模拟器",
    "About OpenRouter": "关于 OpenRouter",
    "Backed by Leading Investors": "获得顶级投资机构支持",
    "Build the Future of AI Infrastructure": "共建 AI 基础设施的未来",
    "See Open Positions": "查看开放职位",
    "Why OpenRouter?": "为什么选择 OpenRouter？",
    "Benefits & Perks": "福利待遇",
    "Remote First": "远程优先",
    "Competitive Compensation": "有竞争力的薪酬",
    "Health & Wellness": "健康与福祉",
    "Unlimited PTO": "无限带薪休假",
    "WFH Budget": "居家办公预算",
    "Quarterly Offsites": "季度线下活动",
    Retirement: "退休福利",
    "Dogfooding Credit": "内部体验额度",
    "Open Positions": "开放职位",
    "Works with OpenRouter": "与 OpenRouter 兼容",
    "Discover apps and tools compatible with OpenRouter": "发现兼容 OpenRouter 的应用与工具",
    "Featured Partnerships": "精选合作伙伴",
    "Talk to us": "联系我们",
    "Read announcement": "阅读公告",
    coding: "编程",
    productivity: "效率",
    research: "研究",
    chat: "聊天",
    creative: "创意",
  });
  const LOCALE_DATA = Object.freeze({
    "OpenRouter Data": "OpenRouter 数据",
    "Our industry-leading empirical data helps AI companies build and serve great models.":
      "我们行业领先的实证数据帮助 AI 公司构建并提供优秀模型。",
    "How We Think About Data": "我们如何看待数据",
    "Trusted by Leading Institutions": "深受领先机构信赖",
    "Reports & Live Data": "报告与实时数据",
    "Interested in OpenRouter Data?": "对 OpenRouter 数据感兴趣？",
    "Datasets API": "数据集 API",
    "API Documentation": "API 文档",
    "Data Collaborations": "数据合作",
    "Get in touch": "联系我们",
    "Model Rankings": "模型排行榜",
  });
  const LOCALE_PRODUCT = Object.freeze({
    "AI Model Comparison": "AI 模型对比",
    "Select a model to see details": "选择模型以查看详情",
    "Search models": "搜索模型",
    "Find models by name or author": "按名称或作者查找模型",
    "Add models": "添加模型",
    "Available providers": "可用供应商",
    "Change model": "更换模型",
    "Remove model": "移除模型",
    "Add first model to compare": "添加第一个待对比模型",
    "Add second model to compare": "添加第二个待对比模型",
    "Visualize Performance": "可视化性能",
    "No activity data available yet.": "暂无使用数据。",
    "Your pick": "你的选择",
    "Pregenerated examples": "预生成示例",
    "Weighted Average Input": "加权平均输入价格",
    "Latency (p50)": "延迟（P50）",
    "Throughput (p50)": "吞吐量（P50）",
    "Max output tokens": "最大输出令牌数",
    "Maximum 5 models reached": "最多只能添加 5 个模型",
    "Highlight best": "突出最佳项",
    Collections: "合集",
    "Discounted Models": "折扣模型",
    "Discounted AI Models on OpenRouter": "OpenRouter 折扣 AI 模型",
    "Browse All Models": "浏览全部模型",
    "Compare Models": "对比模型",
    "AI Models with Provider Discounts": "提供商折扣 AI 模型",
    "Discover models": "发现模型",
    "Practical starting points based on real usage, production performance, and independent benchmarks.":
      "基于真实使用、生产性能和独立基准测试的实用选型起点。",
    "Browse all models": "浏览全部模型",
    "Today's frontier": "今日前沿",
    "Image models": "图像模型",
    "Explore every modality": "探索所有模态",
    Routers: "路由模型",
    "Speech models": "语音模型",
    "Video models": "视频模型",
    "Value leaders": "性价比领先模型",
    "Always-latest aliases": "始终指向最新版的别名",
    "Free models": "免费模型",
    "Smartest open model": "最智能的开放权重模型",
    "Most-used open model": "使用最多的开放权重模型",
    "Lab frontiers": "各实验室前沿模型",
    "Smartest coding": "最强编程模型",
    "Best value": "最佳性价比",
    Fastest: "最快",
    "Discovery is taking a breather": "发现页暂时休息中",
    "No usage in the last 30 days.": "过去 30 天暂无用量。",
    "Price in/out": "输入 / 输出价格",
    "TTFT p50": "首字延迟 P50",
    "Agentic pctl": "智能体能力百分位",
    "Intel pctl": "智能指数百分位",
    "Coding pctl": "编程指数百分位",
    "Tokens/wk": "每周令牌量",
    "Family tokens": "系列令牌量",
  });
  const LOCALE_FUSION = Object.freeze({
    Fusion: "融合",
    "Model Fusion": "模型融合",
    "New Fusion": "新建融合",
    runs: "次运行",
    "No runs yet.": "暂无运行记录。",
    "Default Workspace": "默认工作区",
    beta: "测试版",
    "Run multiple models side-by-side, run an analysis, and fuse into the best result.":
      "并排运行多个模型，执行分析并融合出最佳结果。",
    Quality: "质量优先",
    Budget: "预算优先",
    Fast: "速度优先",
    Custom: "自定义",
    Models: "模型",
    "Add Source Model": "添加源模型",
    "Add Model": "添加模型",
    Synthesizer: "综合模型",
    "Select Fusion Model": "选择融合模型",
    "Run Fusion": "运行融合",
    "Generating responses...": "正在生成回答...",
    Sources: "来源",
    Analysis: "分析",
    Result: "结果",
    "Fused Answer": "融合答案",
    "New fusion": "新建融合",
    Runs: "运行记录",
    "Re-fuse": "重新融合",
    "Continue in Chat": "在对话中继续",
    Agreement: "一致意见",
    "Key Differences": "主要差异",
    "Partial Coverage": "部分覆盖",
    "Unique Insights": "独特见解",
    "Blind Spots": "盲点",
    "Compare all side by side": "并排比较全部回答",
    "Download as Markdown": "下载为 Markdown",
    "Responses are AI-generated and can be inaccurate. Review all outputs before relying on them.":
      "回答由 AI 生成，可能不准确；依赖这些内容前请检查所有输出。",
    "Toggle sidebar": "切换侧边栏",
    "Search runs...": "搜索运行记录...",
    "Switch workspace": "切换工作区",
    "Open runs": "打开运行记录",
    "Ask anything...": "输入任意问题...",
    "Disable Web Search": "关闭联网搜索",
    "Add attachment": "添加附件",
    "Refine your prompt": "优化提示词",
  });
  const LOCALE_FOOTER = Object.freeze({
    Product: "产品",
    Providers: "供应商",
    Company: "公司",
    Developer: "开发者",
    Connect: "关注我们",
    Pricing: "定价",
    Enterprise: "企业服务",
    Labs: "实验室",
    About: "关于",
    Blog: "博客",
    Careers: "招聘",
    Discover: "发现",
    Hiring: "招聘中",
    "Works With OR": "与 OpenRouter 集成",
    Data: "数据",
    Privacy: "隐私",
    "Terms of Service": "服务条款",
    Support: "支持",
    Status: "状态",
  });
  const LOCALE_ACCESSIBILITY = Object.freeze({
    "Chart visibility": "图表显示选项",
    "Sort by chart visibility": "按图表显示状态排序",
    "Expand chart": "展开图表",
    Dismiss: "关闭",
    "Open account navigation": "打开账户菜单",
    "Close account navigation": "关闭账户菜单",
    "Latency / throughput percentile": "延迟 / 吞吐量百分位",
    "(opens in new tab)": "（在新标签页打开）",
    "List view": "列表视图",
    "Table view": "表格视图",
    "Models display format": "模型显示方式",
    "Filter models by output modality": "按输出模态筛选模型",
    "Tool calling success rate (percentage of requests that complete with a tool_calls finish reason)":
      "工具调用成功率（以 tool_calls 结束原因完成的请求占比）",
    "Requires: 18+ age confirmation": "需要确认年满 18 岁",
    "Methodology info": "方法说明",
    "Video generated in the last 7 days": "最近 7 天生成的视频",
    "Tokens processed in the last 7 days": "最近 7 天处理的令牌",
    "Characters transcribed in the last 7 days": "最近 7 天转录的字符",
    "Copy to clipboard": "复制到剪贴板",
    "Previous slide": "上一项",
    "Next slide": "下一项",
    "Open navigation menu": "打开导航菜单",
    "Close navigation menu": "关闭导航菜单",
    "Remove Filter": "清除筛选",
    "Open in Chatroom": "在聊天室中打开",
    "Close playground": "关闭试用面板",
    "Playground input": "试用输入区",
    "Sign in to generate": "登录后生成",
    "Model identifier for use in the API": "API 使用的模型标识符",
    "Result view": "结果视图",
    "Input view": "输入视图",
    "Copy LLMs.txt for this model": "复制该模型的 LLMs.txt",
    "Upload first frame": "上传首帧",
    "Upload last frame": "上传末帧",
  });
  const UI_TRANSLATION_MODULES = Object.freeze({
    navigation: LOCALE_NAVIGATION,
    common: LOCALE_COMMON,
    settings: LOCALE_SETTINGS,
    home: LOCALE_HOME,
    catalog: LOCALE_CATALOG,
    details: LOCALE_DETAILS,
    providers: LOCALE_PROVIDERS,
    metrics: LOCALE_METRICS,
    benchmarks: LOCALE_BENCHMARKS,
    rankings: LOCALE_RANKINGS,
    apps: LOCALE_APPS,
    docsShell: LOCALE_DOCS_SHELL,
    docs: LOCALE_DOCS,
    sdk: LOCALE_SDK,
    blog: LOCALE_BLOG,
    legal: LOCALE_LEGAL,
    support: LOCALE_SUPPORT,
    marketing: LOCALE_MARKETING,
    data: LOCALE_DATA,
    product: LOCALE_PRODUCT,
    fusion: LOCALE_FUSION,
    footer: LOCALE_FOOTER,
    accessibility: LOCALE_ACCESSIBILITY,
  });
  const TRANSLATABLE_ATTRIBUTES = Object.freeze([
    "alt",
    "placeholder",
    "aria-label",
    "aria-description",
    "aria-valuetext",
    "title",
    "data-tooltip",
  ]);

  const CATEGORY_LABELS = Object.freeze({
    Academia: "学术",
    Finance: "金融",
    Health: "健康",
    Legal: "法律",
    Marketing: "营销",
    Programming: "编程",
    Science: "科学",
    Technology: "技术",
  });

  const UI_DICTIONARY = new Map(
    Object.values(UI_TRANSLATION_MODULES).flatMap((module) => Object.entries(module)),
  );
  const UI_TRANSLATION_MODULE_LOOKUPS = Object.freeze(
    Object.fromEntries(
      Object.entries(UI_TRANSLATION_MODULES).map(([name, module]) => [
        name,
        new Map(Object.entries(module).map(([key, value]) => [key.toLocaleLowerCase(), value])),
      ]),
    ),
  );

  const UI_TRANSLATION_TEMPLATES = Object.freeze([
    {
      pattern: /^(.+?)\s+vs\s+(.+)$/i,
      render: ([, left, right]) => `${left} 与 ${right}`,
    },
    {
      pattern: /^Browse models provided by\s+(.+)$/i,
      render: ([, provider]) => `浏览 ${provider} 提供的模型`,
    },
    {
      pattern: /^(.+)\s+tokens processed on OpenRouter$/i,
      render: ([, provider]) => `${provider} 在 OpenRouter 上已处理的令牌`,
    },
    {
      pattern: /^More models from\s+(.+)$/i,
      render: ([, provider]) => `更多来自 ${provider} 的模型`,
    },
    {
      pattern: /^What is the context length of\s+(.+)\?$/i,
      render: ([, subject]) => `${subject} 的上下文长度是多少？`,
    },
    {
      pattern: /^What inputs and outputs does\s+(.+)\s+support\?$/i,
      render: ([, subject]) => `${subject} 支持哪些输入和输出？`,
    },
    {
      pattern: /^What other\s+(.+)\s+models does\s+(.+)\s+have\?$/i,
      render: ([, modality, provider]) =>
        `${provider} 还有哪些${UI_TRANSLATION_MODULE_LOOKUPS.catalog.get(modality.toLocaleLowerCase()) || modality}模型？`,
    },
    {
      pattern: /^What is\s+(.+)\?$/i,
      render: ([, subject]) => `${subject} 是什么？`,
    },
    {
      pattern: /^How much does\s+(.+)\s+cost\?$/i,
      render: ([, subject]) => `${subject} 的价格是多少？`,
    },
    {
      pattern: /^Does\s+(.+)\s+support tool calling(?: and structured outputs)?\?$/i,
      render: ([, subject]) => `${subject} 支持工具调用和结构化输出吗？`,
    },
    {
      pattern: /^Which providers (?:serve|offer)\s+(.+)\?$/i,
      render: ([, subject]) => `哪些供应商提供 ${subject}？`,
    },
    {
      pattern: /^When was\s+(.+)\s+released\?$/i,
      render: ([, subject]) => `${subject} 是什么时候发布的？`,
    },
    {
      pattern: /^(\d+(?:\.\d+)?)\s*%\s*off$/i,
      render: ([, amount]) => `优惠 ${amount}%`,
    },
    {
      pattern: /^(\d+)\s+more providers$/i,
      render: ([, amount]) => `还有 ${amount} 个供应商`,
    },
    {
      pattern: /^Show\s+(\d+)\s+more$/i,
      render: ([, amount]) => `再显示 ${amount} 项`,
    },
    {
      pattern: /^Find a model to pin,\s*(\d+)\s+of\s+5\s+pinned$/i,
      render: ([, amount]) => `搜索要固定的模型，已固定 ${amount}/5`,
    },
    {
      pattern: /^(\d+)\s+turns?:\s*(\$[\d,.]+)$/i,
      render: ([, turns, amount]) => `${turns} 轮：${amount}`,
    },
    {
      pattern: /^(\d+(?:\.\d+)?)%\s+of all spend$/i,
      render: ([, amount]) => `占全部支出的 ${amount}%`,
    },
    {
      pattern: /^Change in tokens processed in (the last (?:day|week|month)) from the previous period$/i,
      render: ([, , period]) => {
        const periodZh = { day: "过去一天", week: "过去一周", month: "过去一个月" }[
          period.toLowerCase()
        ];
        return `${periodZh}处理的令牌量相较上一周期的变化`;
      },
    },
    {
      pattern: /^(\d+(?:\.\d+)?[KMBT]?)\s+(requests?|tokens?|characters?)$/i,
      render: ([, amount, unit]) => {
        const normalized = unit.toLowerCase();
        if (normalized.startsWith("request")) return `${amount} 次请求`;
        if (normalized.startsWith("character")) return `${amount} 字符`;
        return `${amount} 令牌`;
      },
    },
    {
      pattern: /^([\d.]+[KMBT]?)\+ active models on ([\d.]+[KMBT]?)\+ providers$/i,
      render: ([, models, providers]) => `${models}+ 个活跃模型，来自 ${providers}+ 个供应商`,
    },
    {
      pattern: /^([\d.]+[KMBT]?)\+ apps using OpenRouter with ([\d.]+[KMBT]?)\+ users globally$/i,
      render: ([, apps, users]) => `全球 ${users}+ 用户通过 OpenRouter 使用 ${apps}+ 个应用`,
    },
    {
      pattern: /^Better than\s+(\d+(?:\.\d+)?)%\s+of models compared$/i,
      render: ([, amount]) => `优于 ${amount}% 的参评模型`,
    },
    {
      pattern: /^Avg\. Provider Uptime \((\d+)d\)$/i,
      render: ([, days]) => `供应商平均可用率（${days} 天）`,
    },
    {
      pattern: /^Avg\. OpenRouter Uptime \((\d+)d\)$/i,
      render: ([, days]) => `OpenRouter 平均可用率（${days} 天）`,
    },
    {
      pattern: /^\+(\d+)\s+Categories$/i,
      render: ([, amount]) => `+${amount} 类别`,
    },
    {
      pattern: /^Open\s+(.+)\s+details$/i,
      render: ([, subject]) => `打开 ${subject} 详情`,
    },
    {
      pattern: /^(.+?)\s+—\s+Price History explanation$/i,
      render: ([, subject]) => `${subject} — 价格历史说明`,
    },
    {
      pattern: /^(.+?)\s+—\s+Price History$/i,
      render: ([, subject]) => `${subject} — 价格历史`,
    },
    {
      pattern: /^Toggle\s+(.+?)\s+on (?:the )?price history chart$/i,
      render: ([, provider]) => `在价格历史图表中显示或隐藏 ${provider}`,
    },
    {
      pattern: /^Privacy:\s*(Private|Logs|Trains)$/i,
      render: ([, policy]) => `隐私：${UI_TRANSLATION_MODULES.providers[policy] || policy}`,
    },
    {
      pattern: /^Top\s+(\d+(?:\.\d+)?)\s*%$/i,
      render: ([, amount]) => `前 ${amount}%`,
    },
    {
      pattern: /^More information about\s+(.+)$/i,
      render: ([, benchmark]) => `查看 ${benchmark} 的更多信息`,
    },
    {
      pattern: /^Favicon for\s+(.+)$/i,
      render: ([, subject]) => `${subject} 图标`,
    },
    {
      pattern: /^(.+)\s+preview$/i,
      render: ([, subject]) => `${subject} 预览`,
    },
    {
      pattern: /^Ranked at\s+#?(\d+)\s+in\s+(.+)\s+category$/i,
      render: ([, rank, category]) =>
        `${CATEGORY_LABELS[category] || category}类别排名第 ${rank}`,
    },
    {
      pattern: /^(.+)\s+\(#(\d+)\)$/i,
      render: ([, category, rank]) => {
        const translated = CATEGORY_LABELS[category];
        return translated ? `${translated}（第 ${rank} 名）` : null;
      },
    },
    {
      pattern: /^(\d+(?:\.\d+)?)(?:st|nd|rd|th)\s+percentile$/i,
      render: ([, percentile]) => `第 ${percentile} 百分位`,
    },
    {
      pattern: /^(First|Second|Third|Fourth):?\s+(\d+(?:\.\d+)?)%$/i,
      render: ([, rank, amount]) =>
        `${UI_TRANSLATION_MODULES.metrics[rank]}：${amount}%`,
    },
    {
      pattern: /^Based on\s+([\d.]+[KMBT]?)\s+(requests?|samples?)$/i,
      render: ([, amount, unit]) =>
        `基于 ${amount} ${unit.toLowerCase().startsWith("request") ? "次请求" : "个样本"}`,
    },
    {
      pattern: /^([\d,.]+)\s+tournaments$/i,
      render: ([, amount]) => `${amount} 场锦标赛`,
    },
    {
      pattern: /^(\d[\d,]*)\s+benchmarks?$/i,
      render: ([, amount]) => `${amount} 项基准测试`,
    },
    {
      pattern: /^([\d,]+)\s+task evaluations$/i,
      render: ([, amount]) => `${amount} 次任务评估`,
    },
    {
      pattern: /^(\d+)\s+models$/i,
      render: ([, amount]) => `${amount} 个模型`,
    },
    {
      pattern: /^(\d+)\s+selected$/i,
      render: ([, amount]) => `已选择 ${amount} 个`,
    },
    {
      pattern: /^last run\s+(.+)$/i,
      render: ([, date]) => `最近运行：${translateStaticValue(date) || date}`,
    },
    {
      pattern: /^Last benchmark run\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4}),\s+(.+)$/i,
      render: ([, monthName, day, year, time]) => {
        const month = MONTH_NUMBERS[monthName.toLowerCase()];
        return month
          ? `最近一次基准测试运行：${year}年${month}月${Number(day)}日 ${time}`
          : `最近一次基准测试运行：${monthName} ${day}, ${year}, ${time}`;
      },
    },
    {
      pattern: /^Metrics sourced from\s+(.+)$/i,
      render: ([, source]) => `指标来源：${source}`,
    },
    {
      pattern: /^(\d+(?:\.\d+)?)%\s+Win$/i,
      render: ([, amount]) => `胜率 ${amount}%`,
    },
    {
      pattern: /^([\d.]+[KMBT]?)\s*[-–]\s*([\d.]+[KMBT]?)\s+tokens$/i,
      render: ([, start, end]) => `${start} - ${end} 令牌`,
    },
    {
      pattern: /^Elo:\s*(.+)$/i,
      render: ([, score]) => `Elo：${score}`,
    },
    {
      pattern: /^(.+)\s+(\d+(?:\.\d+)?)%\s+off for a limited time\. See all discounted models$/i,
      render: ([, models, amount]) => `${models} 限时 ${amount}% 优惠。查看全部折扣模型`,
    },
    {
      pattern: /^Copy link to\s+.+$/i,
      render: () => "复制本节链接",
    },
    {
      pattern: /^(.+?)\s+logo$/i,
      render: ([, subject]) => `${subject} 标志`,
    },
    {
      pattern: /^(\d+)\s+of\s+(\d+)\s+providers$/i,
      render: ([, shown, total]) => `显示 ${shown}/${total} 个供应商`,
    },
    {
      pattern: /^(\d+)\s+of\s+(\d+)$/i,
      render: ([, shown, total]) => `${shown}/${total}`,
    },
    {
      pattern: /^(\d+)\s+day retention$/i,
      render: ([, days]) => `保留 ${days} 天`,
    },
    {
      pattern: /^(\d+)\+\s+(free\s+)?(models|providers)$/i,
      render: ([, amount, free, kind]) =>
        `${amount}+ 个${free ? "免费" : ""}${kind.toLowerCase() === "models" ? "模型" : "供应商"}`,
    },
    {
      pattern: /^(\d+)\s+reqs\/day$/i,
      render: ([, amount]) => `每天 ${amount} 次请求`,
    },
    {
      pattern: /^(\$[\d,.]+)\s+of list price inference\s*\/\s*month with no fees,\s*([\d.]+)%\s+fee after$/i,
      render: ([, amount, fee]) => `每月标价推理额度 ${amount} 内免手续费，超出后收取 ${fee}% 手续费`,
    },
    {
      pattern: /^Last Updated:\s*(.+)$/i,
      render: ([, date]) => `最后更新：${translateStaticValue(date) || date}`,
    },
    {
      pattern: /^Waiting for\s+(.+)$/i,
      render: ([, model]) => `正在等待 ${model}`,
    },
    {
      pattern: /^Step\s+(\d+)$/i,
      render: ([, step]) => `第 ${step} 步`,
    },
    {
      pattern: /^(.+) OpenRouter Usage$/i,
      render: ([, app]) => `${app} 的 OpenRouter 用量`,
    },
    {
      pattern: /^Top models used by (.+) this month$/i,
      render: ([, app]) => `${app} 本月使用最多的模型`,
    },
    {
      pattern: /^#(\d+)\s+in\s+(.+)$/i,
      render: ([, rank, category]) => `${CATEGORY_LABELS[category] || category}排名第 ${rank}`,
    },
    {
      pattern: /^(Text|Image|Embedding|Rerank|Video|Speech|Transcription) Model Rankings$/i,
      render: ([, modality]) =>
        `${UI_TRANSLATION_MODULE_LOOKUPS.catalog.get(modality.toLocaleLowerCase()) || modality}模型排行榜`,
    },
    {
      pattern: /^(Text|Image|Embedding|Rerank|Video|Speech|Transcription) Requests Over Time$/i,
      render: ([, modality]) =>
        `${UI_TRANSLATION_MODULE_LOOKUPS.catalog.get(modality.toLocaleLowerCase()) || modality}请求趋势`,
    },
    {
      pattern: /^Show\s+(.+)$/i,
      render: ([, metric]) => `显示${translateStaticValue(metric) || metric}`,
    },
    {
      pattern: /^(\d+\.)\s+(.+)$/,
      render: ([, number, heading]) => {
        const translated = translateStaticValue(heading);
        return translated ? `${number} ${translated}` : null;
      },
    },
  ]);

  const MONTH_NUMBERS = Object.freeze({
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  });

  const UNIT_LABELS = Object.freeze({
    "m input tokens": "百万输入令牌",
    "m output tokens": "百万输出令牌",
    "m tokens": "百万令牌",
    "k input tokens": "千输入令牌",
    "k output tokens": "千输出令牌",
    "k tokens": "千令牌",
    "1k input tokens": "千输入令牌",
    "1k output tokens": "千输出令牌",
    "1k tokens": "千令牌",
    "input token": "输入令牌",
    "input tokens": "输入令牌",
    "output token": "输出令牌",
    "output tokens": "输出令牌",
    token: "令牌",
    tokens: "令牌",
    second: "秒",
    seconds: "秒",
    minute: "分钟",
    minutes: "分钟",
    hour: "小时",
    hours: "小时",
    image: "张图片",
    images: "张图片",
    request: "次请求",
    requests: "次请求",
    generation: "次生成",
    generations: "次生成",
    "web search": "次联网搜索",
    "web searches": "次联网搜索",
    character: "字符",
    characters: "字符",
  });
  const PRICE_PATTERN =
    /(?:from\s+)?\$\s*([\d,]+(?:\.\d+)?)(?:\s*\/\s*((?:M|百万)\s*(?:(?:input|output)\s+|(?:输入|输出)\s*)?(?:tokens?|令牌)|(?:1?K|千)\s*(?:(?:input|output)\s+|(?:输入|输出)\s*)?(?:tokens?|令牌)|(?:(?:input|output)\s+|(?:输入|输出)\s*)?(?:tokens?|令牌)|seconds?|秒|minutes?|分钟|hours?|小时|images?|(?:张\s*)?图片|requests?|(?:次\s*)?请求|generations?|(?:次\s*)?生成|web\s+search(?:es)?|(?:次\s*)?联网搜索|characters?|字符))?/i;

  function clampSettings(value) {
    const candidate = value && typeof value === "object" ? value : {};
    const manualUsdCny = Number(candidate.manualUsdCny);
    const manualUsdcUsd = Number(candidate.manualUsdcUsd);

    const booleanSetting = (key) =>
      typeof candidate[key] === "boolean" ? candidate[key] : DEFAULT_SETTINGS[key];

    return {
      ...DEFAULT_SETTINGS,
      ...candidate,
      enabled: booleanSetting("enabled"),
      translateUi: booleanSetting("translateUi"),
      translateContent: booleanSetting("translateContent"),
      showCny: booleanSetting("showCny"),
      rateMode: candidate.rateMode === "manual" ? "manual" : "yahoo",
      manualUsdCny:
        Number.isFinite(manualUsdCny) && manualUsdCny >= 1 && manualUsdCny <= 20
          ? manualUsdCny
          : DEFAULT_SETTINGS.manualUsdCny,
      manualUsdcUsd:
        Number.isFinite(manualUsdcUsd) && manualUsdcUsd >= 0.5 && manualUsdcUsd <= 1.5
          ? manualUsdcUsd
          : DEFAULT_SETTINGS.manualUsdcUsd,
    };
  }

  function isTargetPath(pathname) {
    return typeof pathname === "string" && pathname.startsWith("/");
  }

  function firstPathSegment(pathname) {
    return String(pathname || "").split("/").filter(Boolean)[0] || "";
  }

  function isComparePath(pathname) {
    return firstPathSegment(pathname) === "compare";
  }

  function normalizedEntityText(value) {
    return String(value || "")
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  const ENTITY_KINDS = new Set(["provider", "model", "model-family"]);
  const ENTITY_SOURCE_PRIORITY = Object.freeze({
    route: 1,
    runtime: 2,
    dom: 3,
    catalog: 4,
    manual: 5,
  });
  const ENTITY_CANONICAL_SOURCE_PRIORITY = Object.freeze({
    catalog: 1,
    runtime: 2,
    dom: 3,
    route: 4,
    manual: 5,
  });
  const MODEL_FAMILY_VARIANTS = new Set([
    "audio",
    "base",
    "chat",
    "code",
    "coder",
    "embed",
    "embedding",
    "flash",
    "guard",
    "haiku",
    "image",
    "instruct",
    "large",
    "latest",
    "lite",
    "max",
    "micro",
    "mini",
    "nano",
    "nemo",
    "opus",
    "oss",
    "preview",
    "pro",
    "small",
    "sonnet",
    "thinking",
    "transcribe",
    "turbo",
    "vision",
  ]);

  function cleanEntityName(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizedCanonicalEntityId(value) {
    return cleanEntityName(value).normalize("NFKC").toLocaleLowerCase();
  }

  function createEntityRegistry(seed = ENTITY_CATALOG) {
    const records = new Map();
    const aliasIndex = new Map();
    const dynamicKeys = new Set();

    function rebuildAliasIndex() {
      aliasIndex.clear();
      for (const [recordKey, record] of records) {
        for (const alias of record.aliases) {
          const aliasKey = normalizedEntityText(alias);
          if (!aliasKey) continue;
          const keys = aliasIndex.get(aliasKey) || new Set();
          keys.add(recordKey);
          aliasIndex.set(aliasKey, keys);
        }
      }
    }

    function register(kind, value, options = {}) {
      if (!ENTITY_KINDS.has(kind)) throw new TypeError(`不支持的实体类型：${kind}`);
      const displayName = cleanEntityName(value);
      if (
        displayName.length < 2 ||
        displayName.length > 160 ||
        /[!?。！？]\s*$/.test(displayName)
      ) {
        return null;
      }

      const canonicalId = cleanEntityName(options.canonicalId || displayName);
      const canonicalKey = normalizedCanonicalEntityId(canonicalId);
      if (!canonicalKey) return null;
      const source = Object.hasOwn(ENTITY_SOURCE_PRIORITY, options.source)
        ? options.source
        : "runtime";
      let recordKey = `${kind}:${canonicalKey}`;
      let previous = records.get(recordKey);
      let migratedCatalogProvider = false;
      if (!previous && kind === "provider" && source !== "catalog") {
        const aliasKeys = new Set(
          [displayName, ...(Array.isArray(options.aliases) ? options.aliases : [])]
            .map(normalizedEntityText)
            .filter(Boolean),
        );
        const catalogMatches = new Set();
        for (const aliasKey of aliasKeys) {
          for (const candidateKey of aliasIndex.get(aliasKey) || []) {
            const candidate = records.get(candidateKey);
            if (
              candidate?.kind === "provider" &&
              candidate.source === "catalog" &&
              (candidate.canonicalSource || candidate.source) === "catalog"
            ) {
              catalogMatches.add(candidateKey);
            }
          }
        }
        if (catalogMatches.size === 1) {
          const [catalogKey] = catalogMatches;
          previous = records.get(catalogKey);
          records.delete(catalogKey);
          dynamicKeys.delete(catalogKey);
          migratedCatalogProvider = true;
        }
      }
      const aliases = new Set([
        ...(previous?.aliases || []),
        displayName,
        ...(Array.isArray(options.aliases) ? options.aliases.map(cleanEntityName) : []),
      ]);
      aliases.delete("");

      const previousPriority = ENTITY_SOURCE_PRIORITY[previous?.source] || 0;
      const nextPriority = ENTITY_SOURCE_PRIORITY[source];
      const replaceDisplay = !previous || nextPriority > previousPriority;
      const previousCanonicalPriority =
        ENTITY_CANONICAL_SOURCE_PRIORITY[previous?.canonicalSource || previous?.source] || 0;
      const nextCanonicalPriority = ENTITY_CANONICAL_SOURCE_PRIORITY[source];
      const replaceCanonical = !previous || nextCanonicalPriority > previousCanonicalPriority;
      const record = Object.freeze({
        kind,
        canonicalId: replaceCanonical ? canonicalId : previous.canonicalId,
        canonicalSource: replaceCanonical ? source : previous.canonicalSource || previous.source,
        displayName: replaceDisplay ? displayName : previous.displayName,
        aliases: Object.freeze([...aliases]),
        source: replaceDisplay ? source : previous.source,
        route: options.route || previous?.route || null,
      });
      records.set(recordKey, record);
      if (source !== "catalog" && previous?.source !== "catalog") dynamicKeys.add(recordKey);
      if (migratedCatalogProvider) rebuildAliasIndex();
      else {
        for (const alias of record.aliases) {
          const aliasKey = normalizedEntityText(alias);
          if (!aliasKey) continue;
          const keys = aliasIndex.get(aliasKey) || new Set();
          keys.add(recordKey);
          aliasIndex.set(aliasKey, keys);
        }
      }
      return record;
    }

    function has(kind, value) {
      const keys = aliasIndex.get(normalizedEntityText(value));
      return Boolean(keys && [...keys].some((key) => records.get(key)?.kind === kind));
    }

    function matching(value, options = {}) {
      const text = String(value || "").toLocaleLowerCase();
      if (!text) return [];
      const allowedKinds = options.kinds ? new Set(options.kinds) : ENTITY_KINDS;
      const candidates = [];
      for (const record of records.values()) {
        if (!allowedKinds.has(record.kind)) continue;
        for (const alias of record.aliases) {
          const normalizedAlias = alias.toLocaleLowerCase();
          if (normalizedAlias.length < 2) continue;
          let offset = 0;
          while (offset < text.length) {
            const start = text.indexOf(normalizedAlias, offset);
            if (start < 0) break;
            const end = start + normalizedAlias.length;
            const startsWithWord = /[a-z0-9]/i.test(normalizedAlias[0]);
            const endsWithWord = /[a-z0-9]/i.test(normalizedAlias.at(-1));
            const hasLeftBoundary =
              !startsWithWord || start === 0 || !/[a-z0-9]/i.test(text[start - 1]);
            const hasRightBoundary =
              !endsWithWord || end === text.length || !/[a-z0-9]/i.test(text[end]);
            if (hasLeftBoundary && hasRightBoundary) candidates.push({ alias, end, start });
            offset = start + normalizedAlias.length;
          }
        }
      }
      candidates.sort(
        (left, right) => right.alias.length - left.alias.length || left.start - right.start,
      );
      const selected = [];
      for (const candidate of candidates) {
        if (
          selected.some(
            (existing) => candidate.start < existing.end && candidate.end > existing.start,
          )
        ) {
          continue;
        }
        selected.push(candidate);
      }
      return [...new Map(selected.map(({ alias }) => [alias.toLocaleLowerCase(), alias])).values()]
        .sort((left, right) => right.length - left.length);
    }

    function snapshot(options = {}) {
      const allowedKinds = options.kinds ? new Set(options.kinds) : ENTITY_KINDS;
      return [...records.values()].filter((record) => allowedKinds.has(record.kind));
    }

    function resetDynamic() {
      for (const key of dynamicKeys) records.delete(key);
      dynamicKeys.clear();
      rebuildAliasIndex();
    }

    for (const provider of seed?.providers || []) {
      register("provider", provider, { source: "catalog" });
    }
    for (const modelFamily of seed?.modelFamilies || []) {
      register("model-family", modelFamily, { source: "catalog" });
    }

    return Object.freeze({
      hasModel: (value) => has("model", value) || has("model-family", value),
      hasProvider: (value) => has("provider", value),
      matching,
      registerModel: (value, options) => register("model", value, options),
      registerProvider: (value, options) => register("provider", value, options),
      resetDynamic,
      snapshot,
    });
  }

  function compareModelSlugs(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    if (segments[0] !== "compare") return [];
    return segments.flatMap((segment, index) => {
      if (index < 2 || index % 2 !== 0) return [];
      try {
        return [decodeURIComponent(segment)];
      } catch {
        return [segment];
      }
    });
  }

  function isCompareModelLabel(value, pathname) {
    const text = String(value || "").trim();
    if (!text || text.length > 160) return false;
    const normalized = normalizedEntityText(text);
    const normalizedBase = normalizedEntityText(text.split(/[（(]/, 1)[0]);
    const segments = String(pathname || "").split("/").filter(Boolean);
    return compareModelSlugs(pathname).some((slug, index) => {
      const normalizedSlug = normalizedEntityText(slug);
      const normalizedAuthor = normalizedEntityText(segments[index * 2 + 1] || "");
      return [normalizedSlug, `${normalizedAuthor}${normalizedSlug}`].some(
        (label) =>
          normalized === label ||
          (/[（(]/.test(text) && normalizedBase === label) ||
          (normalizedBase.length >= 6 &&
            /[a-z]/.test(normalizedBase) &&
            /[0-9]/.test(normalizedBase) &&
            label.endsWith(normalizedBase)),
      );
    });
  }

  function isModelEntityPath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    const prefix = segments[0] || "";
    if (PRIVATE_CONTENT_PATH_PREFIXES.has(prefix) || NON_MODEL_TWO_SEGMENT_PREFIXES.has(prefix)) {
      return false;
    }
    if (segments.length === 2) return true;
    return segments.length === 3 && MODEL_ENTITY_TAB_SEGMENTS.has(segments[2]);
  }

  function isAuthorEntityPath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    if (segments.length !== 1) return false;
    const prefix = segments[0];
    return (
      !PRIVATE_CONTENT_PATH_PREFIXES.has(prefix) &&
      !PUBLIC_CONTENT_PATH_PREFIXES.has(prefix) &&
      /^[a-z0-9][a-z0-9._~-]*$/i.test(prefix) &&
      !/\.(?:json|txt|xml)$/i.test(prefix)
    );
  }

  function isEntityLabelForPath(value, pathname) {
    const text = String(value || "").trim();
    if (!text || text.length > 160 || /[.!?。！？]\s*$/.test(text)) return false;

    const segments = String(pathname || "").split("/").filter(Boolean);
    const modelEntity =
      isModelEntityPath(pathname) || (segments.length === 3 && segments[0] === "models");
    const authorEntity = isAuthorEntityPath(pathname);
    if (!modelEntity && !authorEntity) return false;

    const slug = decodeEntityPathSegment(segments.at(-1) || "");
    const normalizedText = normalizedEntityText(text);
    const normalizedSlug = normalizedEntityText(slug);
    if (!normalizedText || !normalizedSlug) return false;
    if (
      normalizedText === normalizedSlug ||
      normalizedText.endsWith(normalizedSlug) ||
      (normalizedText.length >= 4 && normalizedSlug.endsWith(normalizedText))
    ) {
      return true;
    }

    if (!modelEntity || !/[:：]/.test(text)) return false;
    const authorSegment = segments[0] === "models" ? segments[1] : segments[0];
    const normalizedAuthor = normalizedEntityText(String(authorSegment || "").replace(/^~/, ""));
    return Boolean(normalizedAuthor && normalizedText.startsWith(normalizedAuthor));
  }

  function decodeEntityPathSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function entityHintFromSlug(slug, canonicalId = slug) {
    const decoded = decodeEntityPathSegment(slug);
    return Object.freeze({
      canonicalId: decodeEntityPathSegment(canonicalId),
      displayName: decoded.replace(/^~/, "").replace(/[-_]+/g, " "),
      aliases: Object.freeze([decoded, decoded.replace(/^~/, "")]),
    });
  }

  function extractEntityNamesFromPath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    const providers = [];
    const models = [];
    const addPair = (providerSlug, modelSlug) => {
      if (!providerSlug || !modelSlug) return;
      providers.push(entityHintFromSlug(providerSlug));
      models.push(entityHintFromSlug(modelSlug, `${providerSlug}/${modelSlug}`));
    };

    if (segments[0] === "compare") {
      for (let index = 1; index + 1 < segments.length; index += 2) {
        addPair(segments[index], segments[index + 1]);
      }
    } else if (segments[0] === "models" && segments.length >= 3) {
      addPair(segments[1], segments[2]);
    } else if (["provider", "providers"].includes(segments[0]) && segments[1]) {
      providers.push(entityHintFromSlug(segments[1]));
    } else if (isModelEntityPath(pathname)) {
      addPair(segments[0], segments[1]);
    } else if (isAuthorEntityPath(pathname)) {
      providers.push(entityHintFromSlug(segments[0]));
    }

    return Object.freeze({
      models: Object.freeze(models),
      providers: Object.freeze(providers),
    });
  }

  function registerRouteEntityHints(
    pathname,
    registry = PAGE_ENTITY_REGISTRY,
    source = "route",
  ) {
    const hints = extractEntityNamesFromPath(pathname);
    for (const provider of hints.providers) {
      registry.registerProvider(provider.displayName, {
        aliases: provider.aliases,
        canonicalId: provider.canonicalId,
        route: pathname,
        source,
      });
    }
    for (const model of hints.models) {
      registry.registerModel(model.displayName, {
        aliases: model.aliases,
        canonicalId: model.canonicalId,
        route: pathname,
        source,
      });
    }
    return hints;
  }

  function isKnownProviderName(value, registry = PAGE_ENTITY_REGISTRY) {
    const text = cleanEntityName(value).replace(/\s+provider$/i, "");
    return Boolean(text && registry.hasProvider(text));
  }

  function isKnownModelName(value, registry = PAGE_ENTITY_REGISTRY) {
    const text = cleanEntityName(value);
    if (!text || text.length > 160 || /[!?。！？]\s*$/.test(text)) return false;
    if (registry.hasModel(text)) return true;
    if (/^[a-z0-9_.~-]+\/[a-z0-9_.:~/-]+$/i.test(text)) return true;
    if (text.split(/\s+/).length > 8) return false;
    if (/\b(?:is|are|was|were|with|and|or|for|from|supports?|provides?|uses?)\b/i.test(text)) {
      return false;
    }
    return ENTITY_CATALOG.modelFamilies.some((family) => {
      const lowerText = text.toLocaleLowerCase();
      const lowerFamily = family.toLocaleLowerCase();
      if (lowerText === lowerFamily) return true;
      if (!lowerText.startsWith(lowerFamily)) return false;
      const suffix = text.slice(family.length);
      if (!/^(?:\s+|[-_.:+/])/.test(suffix)) return false;
      if (/\d/.test(suffix) || suffix.trim() === "+") return true;
      const variant = suffix
        .replace(/^[\s\-_.:+/]+/, "")
        .split(/\s+/, 1)[0]
        .toLocaleLowerCase();
      return MODEL_FAMILY_VARIANTS.has(variant);
    });
  }

  const PAGE_ENTITY_REGISTRY = createEntityRegistry();
  function entityCandidateText(element) {
    const labelledText = cleanEntityName(
      element?.getAttribute?.("aria-label") ||
        element?.getAttribute?.("data-provider-name") ||
        element?.getAttribute?.("title"),
    );
    const visibleText = cleanEntityName(element?.innerText);
    const rawText = cleanEntityName(element?.textContent);
    let text = labelledText || visibleText || rawText;
    if (!labelledText && visibleText && rawText !== visibleText && rawText.endsWith(visibleText)) {
      const responsiveFullText = cleanEntityName(rawText.slice(0, -visibleText.length));
      if (responsiveFullText.length > visibleText.length) text = responsiveFullText;
    }
    if (!text || text.length > 160 || /[!?。！？]\s*$/.test(text)) return "";
    return text;
  }

  const TRUSTED_PROVIDER_CONTROL_SELECTOR = [
    "#providers tbody td:first-child button",
    "#providers tbody td:first-child a",
    "#pricing tbody tr > td:nth-child(2) button[aria-label^='Open '][aria-label$=' details']",
    "#pricing tbody tr > td:nth-child(2) a[aria-label^='Open '][aria-label$=' details']",
    "#pricing button[aria-label^='Toggle '][aria-label$='price history chart']",
    "[data-provider-name]",
    "[data-testid='provider-name']",
  ].join(", ");

  const PROVIDER_CONTROL_LABEL_PATTERNS = Object.freeze([
    /^Open\s+(.+?)\s+details$/i,
    /^Toggle\s+(.+?)\s+on (?:the )?price history chart$/i,
  ]);

  function providerNameFromControlLabel(value) {
    const label = cleanEntityName(value);
    for (const pattern of PROVIDER_CONTROL_LABEL_PATTERNS) {
      const providerName = cleanEntityName(label.match(pattern)?.[1]);
      if (providerName && providerName.length <= 100) return providerName;
    }
    return "";
  }

  function providerCandidateText(element) {
    const explicitName = cleanEntityName(element?.getAttribute?.("data-provider-name"));
    if (explicitName) return explicitName.length <= 100 ? explicitName : "";

    const labelledText = cleanEntityName(element?.getAttribute?.("aria-label"));
    const labelledProvider = providerNameFromControlLabel(labelledText);
    if (labelledProvider) return labelledProvider;
    if (element?.getAttribute?.("data-testid") === "provider-name") {
      const visibleName = cleanEntityName(element?.innerText || element?.textContent);
      return visibleName.length <= 100 ? visibleName : "";
    }
    if (labelledText) return "";

    const visibleName = entityCandidateText(element);
    return visibleName.length <= 100 ? visibleName : "";
  }

  function trustedProviderControls(scope) {
    const controls = new Set();
    if (scope.matches?.(TRUSTED_PROVIDER_CONTROL_SELECTOR)) controls.add(scope);
    const containingControl = scope.closest?.(TRUSTED_PROVIDER_CONTROL_SELECTOR);
    if (containingControl) controls.add(containingControl);
    for (const control of scope.querySelectorAll(TRUSTED_PROVIDER_CONTROL_SELECTOR)) {
      controls.add(control);
    }
    return controls;
  }

  function registerModelCandidate(value, pathname, registry = PAGE_ENTITY_REGISTRY) {
    const text = cleanEntityName(value);
    const pathHints = extractEntityNamesFromPath(pathname);
    const routeShortAlias =
      pathHints.models.length === 1 &&
      text.length <= 40 &&
      /^[a-z0-9][a-z0-9 ._+/-]*$/i.test(text) &&
      /[a-z]/i.test(text) &&
      /\d/.test(text) &&
      text.split(/\s+/).length <= 5;
    if (
      !text ||
      (!isEntityLabelForPath(text, pathname) &&
        !isKnownModelName(text, registry) &&
        !routeShortAlias)
    ) {
      return null;
    }
    const hint = pathHints.models.find((candidate) => {
      const normalizedText = normalizedEntityText(text);
      return candidate.aliases.some((alias) => {
        const normalizedAlias = normalizedEntityText(alias);
        return normalizedText === normalizedAlias || normalizedText.endsWith(normalizedAlias);
      });
    }) || (pathHints.models.length === 1 ? pathHints.models[0] : null);
    const providerName = text.match(/^([^:：]{2,80})[:：]\s*/)?.[1];
    const modelDisplayName = providerName
      ? text.replace(/^([^:：]{2,80})[:：]\s*/, "").trim()
      : "";
    const providerHint = pathHints.providers[0];
    if (providerName && providerHint) {
      registry.registerProvider(providerName, {
        aliases: providerHint.aliases,
        canonicalId: providerHint.canonicalId,
        route: pathname,
        source: "dom",
      });
    }
    return registry.registerModel(text, {
      aliases: [...(hint?.aliases || []), modelDisplayName].filter(Boolean),
      canonicalId: hint?.canonicalId || text,
      route: pathname,
      source: "dom",
    });
  }

  function registerProviderCandidate(value, pathname, registry = PAGE_ENTITY_REGISTRY) {
    const text = cleanEntityName(value);
    if (!text || text.length > 100 || /[!?。！？]\s*$/.test(text)) return null;
    const pathHints = extractEntityNamesFromPath(pathname);
    const hint = pathHints.providers.find((candidate) => {
      const normalizedText = normalizedEntityText(text);
      const directMatch = candidate.aliases.some((alias) => {
        const normalizedAlias = normalizedEntityText(alias);
        return (
          normalizedText === normalizedAlias ||
          normalizedText.startsWith(normalizedAlias) ||
          normalizedText.endsWith(normalizedAlias)
        );
      });
      if (directMatch) return true;
      const slugTokens = decodeEntityPathSegment(candidate.canonicalId)
        .replace(/^~/, "")
        .split(/[-_.]+/)
        .map(normalizedEntityText)
        .filter((token) => token.length >= 2);
      return slugTokens.length > 0 && slugTokens.every((token) => normalizedText.includes(token));
    });
    if (!hint && !isKnownProviderName(text, registry)) return null;
    return registry.registerProvider(text, {
      aliases: hint?.aliases || [],
      canonicalId: hint?.canonicalId || text,
      route: pathname,
      source: "dom",
    });
  }

  function discoverPageEntities(root, registry = PAGE_ENTITY_REGISTRY) {
    if (typeof document === "undefined" || typeof location === "undefined") return [];
    const scope = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!scope?.querySelectorAll) return registry.snapshot();
    registerRouteEntityHints(location.pathname, registry);

    const currentHints = extractEntityNamesFromPath(location.pathname);
    const headingSelector = "#model-title-row h1, main h1";
    const modelHeading =
      (scope.matches?.(headingSelector) && scope) ||
      scope.closest?.(headingSelector) ||
      scope.querySelector(headingSelector);
    if (currentHints.models.length && modelHeading) {
      const modelName = entityCandidateText(modelHeading);
      const modelHint = currentHints.models[0];
      if (modelName) {
        registry.registerModel(modelName, {
          aliases: modelHint.aliases,
          canonicalId: modelHint.canonicalId,
          route: location.pathname,
          source: "dom",
        });
      }
    } else if (currentHints.providers.length && modelHeading) {
      const providerName = entityCandidateText(modelHeading);
      const providerHint = currentHints.providers[0];
      if (providerName) {
        registry.registerProvider(providerName, {
          aliases: providerHint.aliases,
          canonicalId: providerHint.canonicalId,
          route: location.pathname,
          source: "dom",
        });
      }
    }

    const anchors = [];
    if (scope.matches?.("a[href]")) anchors.push(scope);
    anchors.push(...scope.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      let pathname;
      try {
        const url = new URL(anchor.href, location.origin);
        if (url.origin !== location.origin) continue;
        pathname = url.pathname;
      } catch {
        continue;
      }
      const hints = extractEntityNamesFromPath(pathname);
      if (!hints.models.length && !hints.providers.length) continue;
      registerRouteEntityHints(pathname, registry);

      const candidates = [
        ...anchor.querySelectorAll(
          "h1, h2, h3, h4, strong, [data-testid*='model'], [data-testid*='provider']",
        ),
      ];
      if (candidates.length === 0) candidates.push(anchor);
      for (const candidate of candidates) {
        const text = entityCandidateText(candidate);
        if (!text) continue;
        if (hints.models.length) registerModelCandidate(text, pathname, registry);
        if (hints.providers.length && !hints.models.length) {
          registerProviderCandidate(text, pathname, registry);
        }
      }

      for (const image of anchor.querySelectorAll("img[alt]")) {
        const alt = cleanEntityName(image.alt)
          .replace(/^(?:logo|icon|favicon)\s+(?:for|of)\s+/i, "")
          .replace(/\s+(?:logo|icon|favicon)$/i, "");
        if (!alt) continue;
        if (hints.models.length) registerModelCandidate(alt, pathname, registry);
        else registerProviderCandidate(alt, pathname, registry);
      }
    }

    for (const element of trustedProviderControls(scope)) {
      const providerName = providerCandidateText(element);
      if (!providerName || registry.hasProvider(providerName)) continue;
      registry.registerProvider(providerName, {
        canonicalId: providerName,
        route: location.pathname,
        source: "dom",
      });
    }

    for (const modelName of currentCompareProtectedTranslationEntities()) {
      const hint = currentHints.models.find((candidate) =>
        candidate.aliases.some((alias) =>
          normalizedEntityText(modelName).includes(normalizedEntityText(alias)),
        ),
      );
      registry.registerModel(modelName, {
        aliases: hint?.aliases || [],
        canonicalId: hint?.canonicalId || modelName,
        route: location.pathname,
        source: "dom",
      });
    }
    return registry.snapshot();
  }

  function protectedEntityNamesForText(value, registry = PAGE_ENTITY_REGISTRY) {
    return registry.matching(value, { kinds: ["provider", "model", "model-family"] });
  }
  function isPublicContentPath(pathname) {
    const prefix = firstPathSegment(pathname);
    if (!prefix) return true;
    if (PRIVATE_CONTENT_PATH_PREFIXES.has(prefix)) return false;
    return PUBLIC_CONTENT_PATH_PREFIXES.has(prefix);
  }

  function isCredentialText(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    return (
      /\bsk-[A-Za-z0-9_-]{12,}\b/.test(text) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text) ||
      /\b[A-Fa-f0-9]{32,}\b/.test(text) ||
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
        text,
      ) ||
      /__ORL_P\d+__/.test(text) ||
      /\bauthorization\s*:\s*bearer\s+\S+/i.test(text) ||
      /\b(?:api[_ -]?key|password|secret|private[_ -]?key)\s*[:=]\s*["']?(?!your\b|the\b|a\b|an\b|<)[A-Za-z0-9_./+~-]{8,}/i.test(
        text,
      ) ||
      /^(?:export\s+)?[A-Z][A-Z0-9_]{2,}\s*=\s*\S+/m.test(text)
    );
  }

  function hasPrivateIdentifier(value) {
    const text = String(value || "");
    return (
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text) ||
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
        text,
      )
    );
  }

  function isSensitiveText(value) {
    return isCredentialText(value) || hasPrivateIdentifier(value);
  }

  function shouldTranslateOnlineText(value, options = {}) {
    const text = String(value || "").trim();
    if (text.length < 2) return false;
    if (!options.publicContent) return false;
    if (isCredentialText(text)) return false;
    if (PROTECTED_LABELS.has(text) || isKnownProviderName(text) || isKnownModelName(text)) {
      return false;
    }
    if (/^©\s*\d{4}\s+OpenRouter\b/i.test(text)) return false;
    if (/^(?:[$¥€£]\s*)?[\d.,+\-/%]+(?:\s*[KMBT])?$/.test(text)) return false;
    if (/^(?:\s*[$¥]\s*[\d,.]+(?:\s*[KMBT])?\s*)+$/.test(text)) return false;
    const displayedPrice = parseDisplayedPrice(text);
    if (displayedPrice && displayedPrice.matchedText.trim() === text) return false;
    if (/^[\d,.]+\s*(?:ms|s|tps|tok\/s|tokens?\/s)$/i.test(text)) return false;
    if (/^(?:https?:\/\/|mailto:|tel:)/i.test(text)) return false;
    if (/^[A-Z][A-Z0-9_.+-]{1,15}$/.test(text)) return false;
    if (/^[\w.-]+@[\w.-]+$/.test(text)) return false;
    if (/^[a-z0-9_.~-]+\/[a-z0-9_.:~/-]+$/i.test(text)) return false;
    const unprotectedText = maskProtectedTranslationText(text).masked.replace(/__ORL_P\d+__/g, "");
    return (unprotectedText.match(/[A-Za-z]/g) || []).length >= 2;
  }

  function splitTranslationText(value, limit = TRANSLATION_CHUNK_LIMIT) {
    const text = String(value || "").trim();
    if (!text) return [];
    const safeLimit = Math.max(100, Number(limit) || TRANSLATION_CHUNK_LIMIT);
    const chunks = [];
    let remaining = text;

    while (remaining.length > safeLimit) {
      const window = remaining.slice(0, safeLimit);
      let boundary = -1;
      for (const pattern of [/[.!?]["')\]]?\s+(?=[A-Z0-9])/g, /[;:]\s+/g, /\s+/g]) {
        for (const match of window.matchAll(pattern)) boundary = match.index + match[0].length;
        if (boundary >= Math.floor(safeLimit * 0.55)) break;
        boundary = -1;
      }
      if (boundary < 1) boundary = safeLimit;
      const markerStart = remaining.lastIndexOf("__ORL_P", boundary - 1);
      if (markerStart >= 0) {
        const markerEnd = remaining.indexOf("__", markerStart + 7);
        if (markerStart < boundary && markerEnd + 2 > boundary) {
          boundary = markerStart > 0 ? markerStart : markerEnd + 2;
        }
      }
      const previousCodeUnit = remaining.charCodeAt(boundary - 1);
      const nextCodeUnit = remaining.charCodeAt(boundary);
      if (
        previousCodeUnit >= 0xd800 &&
        previousCodeUnit <= 0xdbff &&
        nextCodeUnit >= 0xdc00 &&
        nextCodeUnit <= 0xdfff
      ) {
        boundary -= 1;
      }
      chunks.push(remaining.slice(0, boundary));
      remaining = remaining.slice(boundary);
    }
    if (remaining) chunks.push(remaining);
    return chunks.filter((chunk) => chunk.length > 0);
  }

  function maskProtectedTranslationText(value, additionalEntities = []) {
    const entities = [];
    const text = String(value);
    const dynamicEntities = [...new Set(additionalEntities)]
      .map((entity) => String(entity || "").trim())
      .filter(
        (entity) =>
          entity.length >= 2 && text.toLocaleLowerCase().includes(entity.toLocaleLowerCase()),
      )
      .sort((left, right) => right.length - left.length)
      .slice(0, 16);
    const protectedPattern = dynamicEntities.length
      ? new RegExp(
          [
            ...dynamicEntities.map((entity) =>
              entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            ),
            PROTECTED_TRANSLATION_PATTERN.source,
          ].join("|"),
          "gi",
        )
      : PROTECTED_TRANSLATION_PATTERN;
    const protect = (match) => {
      const marker = `__ORL_P${entities.length}__`;
      entities.push({ marker, value: match });
      return marker;
    };
    const masked = text.replace(protectedPattern, protect).replace(PROTECTED_HTTP_METHOD_PATTERN, protect);
    return { masked, entities };
  }

  function restoreProtectedTranslationText(value, entities) {
    let restored = String(value);
    for (const entity of entities || []) {
      if (restored.split(entity.marker).length !== 2) return null;
      restored = restored.replace(entity.marker, entity.value);
    }
    if (/__ORL_P\d+__/.test(restored)) return null;
    return restored;
  }
  function parseDisplayedPrice(text) {
    if (typeof text !== "string" || text.length > 160) return null;
    const match = text.match(PRICE_PATTERN);
    if (!match) return null;
    if (match.index > 0 && /[-A-Za-z_]/.test(text[match.index - 1])) return null;
    const nextCharacter = text.slice(match.index + match[0].length).trimStart()[0];
    if (nextCharacter === "/") return null;

    const amount = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount < 0) return null;

    const rawUnit = (match[2] || "").replace(/\s+/g, " ").trim();
    const normalizedUnit = rawUnit.toLowerCase();
    return {
      amount,
      rawUnit,
      unitZh: UNIT_LABELS[normalizedUnit] || rawUnit,
      matchedText: match[0],
      index: match.index || 0,
      isFrom: /^from\s+/i.test(match[0]),
    };
  }

  function decimalPlacesFor(value) {
    const absolute = Math.abs(value);
    if (absolute === 0) return 0;
    if (absolute >= 100) return 2;
    if (absolute >= 1) return 3;
    if (absolute >= 0.01) return 4;
    if (absolute >= 0.0001) return 6;
    return 8;
  }

  function formatNumber(value, maximumFractionDigits = decimalPlacesFor(value)) {
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits,
      minimumFractionDigits: 0,
      useGrouping: true,
    }).format(value);
  }

  function formatCnyPrice(value) {
    if (!Number.isFinite(value)) return "--";
    return new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
  }

  function calculatePriceQuote(usdAmount, rates) {
    if (!Number.isFinite(usdAmount) || usdAmount < 0 || !rates) return null;
    const usdCny = Number(rates.usdCny);
    const usdcUsd = Number(rates.usdcUsd);
    const cny = Number.isFinite(usdCny) && usdCny > 0 ? usdAmount * usdCny : null;
    const usdc = Number.isFinite(usdcUsd) && usdcUsd > 0 ? usdAmount / usdcUsd : null;
    const usdcCny =
      Number.isFinite(usdCny) && usdCny > 0 && Number.isFinite(usdcUsd) && usdcUsd > 0
        ? usdCny * usdcUsd
        : null;

    return { cny, usdc, usdcCny };
  }

  function parseYahooChart(payload, symbol) {
    const result = payload?.chart?.result?.[0];
    if (!result || payload?.chart?.error) return null;

    const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
    const closes = result.indicators?.quote?.[0]?.close;
    let price = Number(result.meta?.regularMarketPrice);
    let timestamp = Number(result.meta?.regularMarketTime) * 1000;

    if (!Number.isFinite(price) && Array.isArray(closes)) {
      for (let index = closes.length - 1; index >= 0; index -= 1) {
        const close = Number(closes[index]);
        if (Number.isFinite(close)) {
          price = close;
          timestamp = Number(timestamps[index]) * 1000;
          break;
        }
      }
    }

    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      symbol: result.meta?.symbol || symbol,
      price,
      currency: result.meta?.currency || null,
      asOf: Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
    };
  }

  function parseFrankfurterRate(payload) {
    const direct = Number(payload?.rate);
    const legacy = Number(payload?.rates?.CNY);
    const rate = Number.isFinite(direct) ? direct : legacy;
    if (!Number.isFinite(rate) || rate < 1 || rate > 20) return null;
    return {
      price: rate,
      asOf: payload?.date ? Date.parse(`${payload.date}T00:00:00Z`) : Date.now(),
    };
  }

  const Core = Object.freeze({
    ENTITY_CATALOG,
    UI_TRANSLATION_MODULES,
    calculatePriceQuote,
    clampSettings,
    compareModelSlugs,
    createEntityRegistry,
    entityCandidateText,
    extractEntityNamesFromPath,
    formatCnyPrice,
    formatNumber,
    isPublicContentPath,
    isAuthorEntityPath,
    isCompareModelLabel,
    isEntityLabelForPath,
    isKnownModelName,
    isKnownProviderName,
    isModelEntityPath,
    isPublicContentDocument,
    isSensitiveText,
    isTargetPath,
    maskProtectedTranslationText,
    parseDisplayedPrice,
    parseDisplayedPrices,
    parsePriceContainerText,
    parseSplitDisplayedPrice,
    parseFrankfurterRate,
    parseYahooChart,
    providerCandidateText,
    registerModelCandidate,
    registerProviderCandidate,
    restoreProtectedTranslationText,
    shouldTranslateOnlineText,
    splitTranslationText,
    translationModuleNamesForPath,
    translateStaticValue,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Core;
  }

  if (typeof window === "undefined" || typeof document === "undefined") return;
  let settings = clampSettings(readValue(SETTINGS_KEY, DEFAULT_SETTINGS));
  let rates = null;
  let ratePromise = null;
  let rateGeneration = 0;
  let descriptionGeneration = 0;
  let routeKey = "";
  let observer = null;
  let scanFrame = 0;
  let translationPersistTimer = 0;
  let translationPersistIdle = 0;
  let descriptionWorkers = 0;
  let descriptionTaskId = 0;
  let recordCleanupTimer = 0;
  let lastRecordCleanupAt = 0;
  let recordsNeedCleanup = false;
  const pendingRoots = new Set();
  const priceRecords = new Map();
  const textRecords = new Map();
  const attributeRecords = new Map();
  const descriptionQueue = [];
  const descriptionPending = new Map();
  const attributePending = new Map();
  const translationInFlight = new Map();
  const storedTranslationCache = readValue(TRANSLATION_CACHE_KEY, {});
  const translationCache = sanitizeTranslationCache(storedTranslationCache);
  let translationCacheSize = Object.keys(translationCache).length;
  const panelRefs = {};

  if (Object.keys(translationCache).length !== Object.keys(storedTranslationCache || {}).length) {
    writeValue(TRANSLATION_CACHE_KEY, translationCache);
  }
  function sanitizeTranslationCache(value) {
    if (!value || typeof value !== "object") return {};
    const prefix = `${TRANSLATION_SCHEMA_VERSION}:`;
    return Object.fromEntries(
      Object.entries(value).filter(
        ([key, entry]) =>
          key.startsWith(prefix) &&
          entry &&
          typeof entry === "object" &&
          typeof entry.translatedMasked === "string" &&
          Number.isFinite(Number(entry.lastUsed)),
      ),
    );
  }

  function readValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
      const stored = global.localStorage?.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
      global.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // 缓存失败不应影响页面原有功能。
    }
  }

  function requestJson(url, timeout = 8000) {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url,
          timeout,
          anonymous: true,
          headers: { Accept: "application/json" },
          onload(response) {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`HTTP ${response.status}`));
              return;
            }
            try {
              resolve(JSON.parse(response.responseText));
            } catch {
              reject(new Error("JSON 响应无效"));
            }
          },
          onerror: () => reject(new Error("网络请求失败")),
          ontimeout: () => reject(new Error("网络请求超时")),
        });
      });
    }

    const controller = new AbortController();
    const timeoutId = global.setTimeout(() => controller.abort(), timeout);
    return fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .finally(() => global.clearTimeout(timeoutId));
  }

  async function fetchYahooQuote(symbol, interval, range) {
    const encoded = encodeURIComponent(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${interval}&range=${range}`;
    const payload = await requestJson(url);
    const quote = parseYahooChart(payload, symbol);
    if (!quote) throw new Error(`Yahoo ${symbol} 行情无效`);
    const normalizedSymbol = String(quote.symbol || "").toUpperCase();
    if (normalizedSymbol !== symbol.toUpperCase()) {
      throw new Error(`Yahoo 返回了错误标的：${quote.symbol || "unknown"}`);
    }
    const age = Date.now() - quote.asOf;
    const isFiat = symbol === "CNY=X";
    const inRange = isFiat
      ? quote.price >= 1 && quote.price <= 20
      : quote.price >= 0.5 && quote.price <= 1.5;
    const maxAge = isFiat ? 7 * 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    if (!inRange || age < -5 * 60 * 1000 || age > maxAge) {
      throw new Error(`Yahoo ${symbol} 行情越界或过期`);
    }
    return quote;
  }

  async function fetchFrankfurterUsdCny() {
    const payload = await requestJson("https://api.frankfurter.dev/v2/rate/USD/CNY");
    const quote = parseFrankfurterRate(payload);
    if (!quote) throw new Error("Frankfurter 汇率无效");
    return quote;
  }

  function manualRates() {
    const now = Date.now();
    return {
      usdCny: settings.manualUsdCny,
      usdcUsd: settings.manualUsdcUsd,
      usdcCny: settings.manualUsdCny * settings.manualUsdcUsd,
      source: "手动汇率",
      usdcSource: "手动汇率",
      asOf: now,
      usdcAsOf: now,
      fetchedAt: now,
      usdFetchedAt: now,
      usdcFetchedAt: now,
      checkedAt: now,
      status: "manual",
      usdcStatus: "manual",
    };
  }

  function normalizeCachedRates(candidate, now = Date.now()) {
    if (!candidate || typeof candidate !== "object") return null;
    const usdCny = Number(candidate.usdCny);
    const usdcUsd = Number(candidate.usdcUsd);
    const usdFetchedAt = Number(candidate.usdFetchedAt || candidate.fetchedAt);
    const usdcFetchedAt = Number(candidate.usdcFetchedAt || candidate.fetchedAt);
    if (!Number.isFinite(usdCny) || usdCny < 1 || usdCny > 20) return null;
    if (!Number.isFinite(usdcUsd) || usdcUsd < 0.5 || usdcUsd > 1.5) return null;
    if (!Number.isFinite(usdFetchedAt) || now - usdFetchedAt > RATE_MAX_STALE_MS) return null;
    const usdcIsFresh = Number.isFinite(usdcFetchedAt) && now - usdcFetchedAt <= 60 * 60 * 1000;
    const effectiveUsdcUsd = usdcIsFresh ? usdcUsd : 1;
    return {
      ...candidate,
      usdCny,
      usdcUsd: effectiveUsdcUsd,
      usdcCny: usdCny * effectiveUsdcUsd,
      fetchedAt: usdFetchedAt,
      usdFetchedAt,
      usdcFetchedAt,
      status: now - usdFetchedAt > RATE_TTL_MS ? "stale" : candidate.status || "live",
      usdcStatus: usdcIsFresh ? candidate.usdcStatus || "live" : "peg-assumption",
      usdcSource: usdcIsFresh ? candidate.usdcSource || "Yahoo Finance 推导" : "1 USDC≈1 USD 锚定估算",
    };
  }

  async function loadRates({ force = false } = {}) {
    if (settings.rateMode === "manual") {
      rateGeneration += 1;
      ratePromise = null;
      rates = manualRates();
      refreshPanel();
      scheduleFullScan();
      return rates;
    }

    const now = Date.now();
    const cached = normalizeCachedRates(readValue(RATE_CACHE_KEY, null), now);
    if (!force && cached && now - cached.usdFetchedAt < RATE_TTL_MS) {
      rates = cached;
      refreshPanel();
      scheduleFullScan();
      return cached;
    }

    const lastAttempt = Number(readValue(RATE_ATTEMPT_KEY, 0));
    if (!force && now - lastAttempt < RATE_RETRY_COOLDOWN_MS) {
      rates = cached;
      refreshPanel();
      scheduleFullScan();
      return cached;
    }

    if (ratePromise) return ratePromise;
    const generation = ++rateGeneration;
    writeValue(RATE_ATTEMPT_KEY, now);
    setRateStatus("正在更新 Yahoo 行情...");

    const activePromise = (async () => {
      const [fiatResult, usdcResult] = await Promise.allSettled([
        fetchYahooQuote("CNY=X", "1d", "5d"),
        fetchYahooQuote("USDC-USD", "5m", "1d"),
      ]);

      let usdCnyQuote = fiatResult.status === "fulfilled" ? fiatResult.value : null;
      let usdcUsdQuote = usdcResult.status === "fulfilled" ? usdcResult.value : null;
      let source = "Yahoo Finance";
      let status = "live";
      let usdcStatus = "live";
      let usdFetchedAt = now;
      let usdcFetchedAt = now;

      if (!usdCnyQuote) {
        try {
          usdCnyQuote = await fetchFrankfurterUsdCny();
          source = "Frankfurter 回退";
          status = "fallback";
        } catch {
          usdCnyQuote = cached
            ? { price: cached.usdCny, asOf: cached.asOf || cached.usdFetchedAt }
            : null;
          usdFetchedAt = cached?.usdFetchedAt || 0;
          source = cached?.source || "无可用汇率";
          status = cached ? "stale" : "unavailable";
        }
      }

      if (!usdcUsdQuote) {
        if (
          cached &&
          cached.usdcStatus !== "peg-assumption" &&
          now - cached.usdcFetchedAt <= 60 * 60 * 1000
        ) {
          usdcUsdQuote = { price: cached.usdcUsd, asOf: cached.usdcAsOf || cached.usdcFetchedAt };
          usdcFetchedAt = cached.usdcFetchedAt;
          usdcStatus = "stale";
        } else {
          usdcUsdQuote = { price: 1, asOf: now };
          usdcStatus = "peg-assumption";
        }
      }

      if (!usdCnyQuote) {
        if (generation !== rateGeneration || settings.rateMode !== "yahoo") return rates;
        rates = null;
        restorePrices();
        refreshPanel();
        setRateStatus("暂无可用汇率，仅显示官方美元价");
        scheduleFullScan();
        return null;
      }

      const nextRates = {
        usdCny: usdCnyQuote.price,
        usdcUsd: usdcUsdQuote.price,
        usdcCny: usdCnyQuote.price * usdcUsdQuote.price,
        source,
        usdcSource:
          usdcStatus === "live"
            ? "Yahoo Finance 推导"
            : usdcStatus === "stale"
              ? "Yahoo Finance 缓存"
              : "1 USDC≈1 USD 锚定估算",
        asOf: usdCnyQuote.asOf,
        usdcAsOf: usdcUsdQuote.asOf,
        fetchedAt: usdFetchedAt,
        usdFetchedAt,
        usdcFetchedAt,
        checkedAt: now,
        status,
        usdcStatus,
      };

      if (generation !== rateGeneration || settings.rateMode !== "yahoo") return rates;
      rates = nextRates;
      writeValue(RATE_CACHE_KEY, nextRates);
      refreshPanel();
      scheduleFullScan();
      return nextRates;
    })();
    let wrappedPromise;
    wrappedPromise = activePromise.finally(() => {
      if (ratePromise === wrappedPromise) ratePromise = null;
    });
    ratePromise = wrappedPromise;

    return ratePromise;
  }

  function isValidEnglishClock(value) {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return false;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59;
  }

  function isValidEnglishMonthDay(month, day, year = null) {
    const numericDay = Number(day);
    if (!Number.isInteger(numericDay) || numericDay < 1) return false;
    const leapYear =
      year === null ||
      (Number(year) % 4 === 0 &&
        (Number(year) % 100 !== 0 || Number(year) % 400 === 0));
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return numericDay <= daysInMonth[month - 1];
  }

  function translateStaticValue(value, moduleNames = null) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (moduleNames) {
      for (const moduleName of moduleNames) {
        const translated = UI_TRANSLATION_MODULE_LOOKUPS[moduleName]?.get(trimmed.toLocaleLowerCase());
        if (translated) return translated;
      }
    } else if (UI_DICTIONARY.has(trimmed)) {
      return UI_DICTIONARY.get(trimmed);
    }

    for (const template of UI_TRANSLATION_TEMPLATES) {
      const match = trimmed.match(template.pattern);
      if (match) return template.render(match);
    }

    const contextMatch = trimmed.match(/^([\d.]+\s*[KMB]?)\s+context$/i);
    if (contextMatch) return `${contextMatch[1]} 上下文`;

    const durationMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(seconds?|minutes?|hours?|days?)$/i);
    if (durationMatch) {
      const unit = {
        second: "秒",
        seconds: "秒",
        minute: "分钟",
        minutes: "分钟",
        hour: "小时",
        hours: "小时",
        day: "天",
        days: "天",
      }[durationMatch[2].toLowerCase()];
      return `${durationMatch[1]} ${unit}`;
    }

    const agoMatch = trimmed.match(/^(\d+)\s+(minutes?|hours?|days?)\s+ago$/i);
    if (agoMatch) {
      const unit = agoMatch[2].toLowerCase().startsWith("minute")
        ? "分钟前"
        : agoMatch[2].toLowerCase().startsWith("hour")
          ? "小时前"
          : "天前";
      return `${agoMatch[1]} ${unit}`;
    }

    const monthYearMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (monthYearMatch) {
      const month = MONTH_NUMBERS[monthYearMatch[1].toLowerCase()];
      if (month) return `${monthYearMatch[2]}年${month}月`;
    }

    const dateTimeRangeMatch = trimmed.match(
      /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}:\d{2})\s*(am|pm)\s*[–-]\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{1,2}:\d{2})\s*(am|pm)$/i,
    );
    if (dateTimeRangeMatch) {
      const startMonth = MONTH_NUMBERS[dateTimeRangeMatch[1].toLowerCase()];
      const endMonth = MONTH_NUMBERS[dateTimeRangeMatch[5].toLowerCase()];
      if (
        startMonth &&
        endMonth &&
        isValidEnglishMonthDay(startMonth, dateTimeRangeMatch[2]) &&
        isValidEnglishMonthDay(endMonth, dateTimeRangeMatch[6]) &&
        isValidEnglishClock(dateTimeRangeMatch[3]) &&
        isValidEnglishClock(dateTimeRangeMatch[7])
      ) {
        const period = { am: "上午", pm: "下午" };
        return (
          `${startMonth}月${Number(dateTimeRangeMatch[2])}日 ` +
          `${period[dateTimeRangeMatch[4].toLowerCase()]} ${dateTimeRangeMatch[3]} – ` +
          `${endMonth}月${Number(dateTimeRangeMatch[6])}日 ` +
          `${period[dateTimeRangeMatch[8].toLowerCase()]} ${dateTimeRangeMatch[7]}`
        );
      }
    }

    const dateTimeMatch = trimmed.match(
      /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}:\d{2})\s*(am|pm)$/i,
    );
    if (dateTimeMatch) {
      const month = MONTH_NUMBERS[dateTimeMatch[1].toLowerCase()];
      const period = { am: "上午", pm: "下午" }[dateTimeMatch[5].toLowerCase()];
      if (
        month &&
        isValidEnglishMonthDay(month, dateTimeMatch[2], dateTimeMatch[3]) &&
        isValidEnglishClock(dateTimeMatch[4])
      ) {
        return `${dateTimeMatch[3]}年${month}月${Number(dateTimeMatch[2])}日 ${period} ${dateTimeMatch[4]}`;
      }
    }

    const dateMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (dateMatch) {
      const month = MONTH_NUMBERS[dateMatch[1].toLowerCase()];
      if (month && isValidEnglishMonthDay(month, dateMatch[2], dateMatch[3] || null)) {
        return dateMatch[3]
          ? `${dateMatch[3]}年${month}月${Number(dateMatch[2])}日`
          : `${month}月${Number(dateMatch[2])}日`;
      }
    }

    return null;
  }
  function preserveWhitespace(original, replacement) {
    const leading = original.match(/^\s*/)?.[0] || "";
    const trailing = original.match(/\s*$/)?.[0] || "";
    return `${leading}${replacement}${trailing}`;
  }

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-orl-owned]")) return true;
    if (parent.closest("script, style, noscript, code, pre, textarea, input, select, [contenteditable='true']")) {
      return true;
    }
    return false;
  }

  function translationModuleNamesForPath(pathname) {
    const prefix = firstPathSegment(pathname);
    const shared = ["common", "navigation", "accessibility"];
    if (!prefix) return ["home", ...shared];
    if (ACCOUNT_UI_PATH_PREFIXES.has(prefix)) {
      return [
        "settings",
        "details",
        "providers",
        "metrics",
        "catalog",
        "rankings",
        "home",
        ...shared,
      ];
    }
    if (prefix === "docs") return ["docsShell", "docs", ...shared];
    if (prefix === "sdk") return ["sdk", ...shared];
    if (prefix === "blog") return ["blog", ...shared];
    if (["privacy", "terms", "terms-of-service-enterprise", "authorized-sub-processors"].includes(prefix)) {
      return ["legal", ...shared];
    }
    if (prefix === "support") return ["support", ...shared];
    if (prefix === "fusion") return ["fusion", "catalog", "providers", ...shared];
    if (["pricing", "enterprise", "labs", "about", "careers", "works-with-openrouter"].includes(prefix)) {
      return ["marketing", "apps", ...shared];
    }
    if (["provider", "providers"].includes(prefix)) {
      return ["providers", "catalog", "metrics", ...shared];
    }
    if (isAuthorEntityPath(pathname)) {
      return ["providers", "catalog", "metrics", ...shared];
    }
    if (prefix === "data") return ["data", "rankings", "metrics", "catalog", ...shared];
    if (prefix === "state-of-ai") return ["data", "rankings", "metrics", "marketing", ...shared];
    if (prefix === "benchmarks") {
      return ["benchmarks", "metrics", "rankings", "catalog", ...shared];
    }
    if (prefix === "rankings") return ["rankings", "apps", "metrics", "catalog", ...shared];
    if (prefix === "apps") return ["apps", "rankings", "metrics", ...shared];
    if (["models", "discover", "collections", "compare"].includes(prefix)) {
      return ["product", "catalog", "details", "providers", "metrics", ...shared];
    }
    if (["request-builder", "agents", "learn", "long-horizon", "customers", "spawn"].includes(prefix)) {
      return ["product", "marketing", "docs", "catalog", ...shared];
    }
    return ["details", "providers", "metrics", "catalog", "home", ...shared];
  }

  function translationModuleNamesForElement(element) {
    if (!element) return [];
    if (element.closest("footer")) return ["footer", "common", "navigation", "accessibility"];
    if (element.closest("main")) return translationModuleNamesForPath(location.pathname);
    if (element.closest("nav")) return ["navigation", "common", "accessibility"];
    if (
      element.closest(
        "#portal-container, [data-radix-popper-content-wrapper], [role='dialog'], [role='listbox'], [role='menu']",
      )
    ) {
      return translationModuleNamesForPath(location.pathname);
    }
    return ["footer", ...translationModuleNamesForPath(location.pathname)];
  }

  function isModelPagePath(pathname) {
    const segments = String(pathname || "").split("/").filter(Boolean);
    return isModelEntityPath(pathname) || (segments.length === 3 && segments[0] === "models");
  }

  function currentModelDisplayName() {
    if (!isModelPagePath(location.pathname)) return "";
    const heading = document.querySelector("#model-title-row h1, main h1")?.textContent?.trim() || "";
    return heading.includes(":") ? heading.slice(heading.indexOf(":") + 1).trim() : heading;
  }

  function isProtectedCompareEntityNode(element, value = null) {
    if (!element || !isComparePath(location.pathname)) return false;
    const text = String(value ?? element.textContent ?? "").trim();
    if (isCompareModelLabel(text, location.pathname)) return true;
    const modelButton = element.closest("main button[aria-haspopup='dialog']");
    if (modelButton?.querySelector("img")) return true;

    const entityControl = element.closest("button[role='combobox'], [role='option']");
    if (!entityControl) return false;
    return !translateStaticValue(text, translationModuleNamesForElement(element));
  }

  function currentCompareProtectedTranslationEntities() {
    if (!isComparePath(location.pathname)) return [];
    const candidates = [];
    for (const element of document.querySelectorAll("main [title]")) {
      candidates.push(element.getAttribute("title"));
    }
    for (const button of document.querySelectorAll("main button[aria-haspopup='dialog']")) {
      if (button.querySelector("img")) candidates.push(button.textContent);
    }

    const entities = new Set();
    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (!isCompareModelLabel(text, location.pathname)) continue;
      entities.add(text);
      const baseText = text.split(/[（(]/, 1)[0].trim();
      if (baseText) entities.add(baseText);
    }
    return [...entities].sort((left, right) => right.length - left.length);
  }

  function isProtectedBenchmarkEntityNode(element, value = null) {
    if (!element) return false;
    const text = String(value ?? element.textContent ?? "").trim();
    if (!text) return false;

    if (
      firstPathSegment(location.pathname) === "benchmarks" &&
      element.matches("[title]") &&
      element.getAttribute("title")?.trim() === text &&
      element.parentElement?.querySelector("img")
    ) {
      return true;
    }

    const benchmarkControl = element.closest(
      "#benchmarks [role='combobox'], [role='option']",
    );
    if (!benchmarkControl) return false;

    const modelName = currentModelDisplayName();
    if (!modelName || (text !== modelName && !text.startsWith(`${modelName} (`))) return false;
    return true;
  }

  function isProtectedEntityNode(element, value = null) {
    if (isProtectedCompareEntityNode(element, value)) return true;
    if (isProtectedBenchmarkEntityNode(element, value)) return true;
    const text = cleanEntityName(value ?? element?.textContent);
    if (isKnownProviderName(text) || isKnownModelName(text)) return true;
    const linkedEntity = element?.closest("main a[href]");
    if (linkedEntity) {
      try {
        const entityPath = new URL(linkedEntity.href, location.origin).pathname;
        const segments = entityPath.split("/").filter(Boolean);
        const entityRoute =
          isModelPagePath(entityPath) ||
          isAuthorEntityPath(entityPath) ||
          (segments.length > 1 &&
            ["apps", "provider", "providers", "works-with-openrouter"].includes(segments[0]));
        if (entityRoute && isEntityLabelElement(element, linkedEntity, entityPath, value)) {
          const hints = extractEntityNamesFromPath(entityPath);
          if (hints.models.length) registerModelCandidate(text, entityPath);
          else if (hints.providers.length) registerProviderCandidate(text, entityPath);
          return true;
        }
      } catch {
        // 无效链接交给普通词典处理。
      }
    }
    if (
      firstPathSegment(location.pathname) === "apps" &&
      location.pathname.split("/").filter(Boolean).length > 1 &&
      element?.closest("main h1")
    ) {
      return true;
    }
    if (
      (firstPathSegment(location.pathname) === "provider" ||
        isAuthorEntityPath(location.pathname)) &&
      element?.closest("main h1")
    ) {
      return true;
    }
    if (element?.closest("#providers tbody td:first-child")) return true;
    return Boolean(
      element?.closest(
        [
          "#model-title-row h1",
          "#model-title-row h2",
          "#model-title-row h3",
          "#providers tbody td:first-child button",
          "code",
          "pre",
          "kbd",
          "samp",
          "var",
          ".font-mono",
        ].join(", "),
      ),
    );
  }

  function isEntityLabelElement(element, anchor, pathname, value = null) {
    if (!element || !anchor) return false;
    if (element.closest("h1, h2, h3, h4, h5, h6, [data-slot='title']")) return true;
    const text =
      String(value ?? element.textContent ?? "").trim() ||
      String(anchor.getAttribute("aria-label") || "").trim();
    if (!text || /[.!?。！？]\s*$/.test(text)) return false;

    const listItem = element.closest("[data-testid='model-list-item']");
    if (listItem && isModelPagePath(pathname)) {
      const matchingAnchors = [...listItem.querySelectorAll("a[href]")].filter((candidate) => {
        try {
          return new URL(candidate.href, location.origin).pathname === pathname;
        } catch {
          return false;
        }
      });
      const titleAnchor =
        matchingAnchors.find((candidate) => candidate.querySelector(".font-semibold")) ||
        matchingAnchors[0];
      if (anchor === titleAnchor) return true;
    }

    const siblingListItem = anchor.parentElement?.querySelector("[data-testid='model-list-item']");
    if (
      siblingListItem &&
      anchor.hasAttribute("aria-label") &&
      text === anchor.getAttribute("aria-label") &&
      isModelPagePath(pathname)
    ) {
      return true;
    }

    if (isEntityLabelForPath(text, pathname)) return true;
    const slug = decodeEntityPathSegment(
      String(pathname || "").split("/").filter(Boolean).at(-1) || "",
    );
    const normalizedText = normalizedEntityText(text);
    const normalizedSlug = normalizedEntityText(slug);
    return Boolean(
      normalizedText &&
        normalizedSlug &&
        (normalizedText === normalizedSlug || normalizedText.endsWith(normalizedSlug)),
    );
  }

  function translateTextNode(node) {
    if (shouldSkipNode(node)) return false;
    const existing = textRecords.get(node);
    if (isProtectedEntityNode(node.parentElement, existing?.original ?? node.nodeValue)) {
      if (existing && node.nodeValue === existing.rendered) node.nodeValue = existing.original;
      textRecords.delete(node);
      return false;
    }
    if (existing) {
      if (!settings.enabled || !settings.translateUi) {
        if (node.nodeValue === existing.rendered) node.nodeValue = existing.original;
        textRecords.delete(node);
        return false;
      }
      if (node.nodeValue === existing.rendered) return true;
      textRecords.delete(node);
    }

    if (!settings.enabled || !settings.translateUi) return false;
    const original = node.nodeValue;
    const translated = translateStaticValue(
      original,
      translationModuleNamesForElement(node.parentElement),
    );
    if (!translated || translated === original.trim()) return false;
    const rendered = preserveWhitespace(original, translated);
    textRecords.set(node, { original, rendered, owner: "dictionary" });
    node.nodeValue = rendered;
    return true;
  }

  function translateAttributes(root) {
    const selector = TRANSLATABLE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(", ");
    const elements = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.(selector)) elements.push(root);
    elements.push(...(root.querySelectorAll?.(selector) || []));

    for (const element of elements) {
      if (element.closest("[data-orl-owned]")) continue;
      let records = attributeRecords.get(element);
      const hasProviderActionAttribute = TRANSLATABLE_ATTRIBUTES.some(
        (attribute) =>
          providerNameFromControlLabel(element.getAttribute(attribute)) ||
          providerNameFromControlLabel(records?.[attribute]?.original),
      );

      if (isProtectedEntityNode(element) && !hasProviderActionAttribute) {
        if (records) {
          for (const [attribute, prior] of Object.entries(records)) {
            if (element.getAttribute(attribute) === prior.rendered) {
              element.setAttribute(attribute, prior.original);
            }
          }
          attributeRecords.delete(element);
        }
        continue;
      }

      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        let prior = records?.[attribute];
        if (!settings.enabled || !settings.translateUi) {
          if (prior && current === prior.rendered) element.setAttribute(attribute, prior.original);
          continue;
        }

        if (prior && current === prior.rendered) continue;
        if (prior && current !== prior.rendered) {
          delete records[attribute];
          prior = null;
        }
        const original = current;
        if (!original) continue;
        const translated = translateStaticValue(
          original,
          translationModuleNamesForElement(element),
        );
        if (!translated) continue;
        records ||= {};
        records[attribute] = { original, rendered: translated };
        element.setAttribute(attribute, translated);
      }

      if (records) attributeRecords.set(element, records);
    }
  }

  function getAttributePending(element, attribute) {
    return attributePending.get(element)?.get(attribute);
  }

  function setAttributePending(element, attribute, taskId) {
    let pending = attributePending.get(element);
    if (!pending) {
      pending = new Map();
      attributePending.set(element, pending);
    }
    pending.set(attribute, taskId);
  }

  function deleteAttributePending(element, attribute, taskId) {
    const pending = attributePending.get(element);
    if (!pending || (taskId !== undefined && pending.get(attribute) !== taskId)) return;
    pending.delete(attribute);
    if (pending.size === 0) attributePending.delete(element);
  }

  function scanStaticTranslations(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) translateTextNode(node);
    translateAttributes(root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement || document.body);
  }
  function parseDisplayedPriceOccurrence(text, match) {
    const index = match.index || 0;
    if (index > 0 && /[-A-Za-z_]/.test(text[index - 1])) return null;

    const amount = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount < 0) return null;

    const followingText = text.slice(index + match[0].length);
    const slash = followingText.match(/^\s*\/\s*/);
    if (slash) {
      const unitText = followingText.slice(slash[0].length);
      if (!unitText.startsWith("$")) {
        const parsed = parseDisplayedPrice(text.slice(index));
        if (!parsed || !parsed.rawUnit) return null;
        return {
          ...parsed,
          matchedText: match[0],
          index,
          isFrom: false,
        };
      }
    }

    return {
      amount,
      rawUnit: "",
      unitZh: "",
      matchedText: match[0],
      index,
      isFrom: false,
    };
  }

  function parseDisplayedPrices(text) {
    if (typeof text !== "string" || text.length > 160) return [];
    return [...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].flatMap((match) => {
      const parsed = parseDisplayedPriceOccurrence(text, match);
      return parsed ? [parsed] : [];
    });
  }

  function parseSplitDisplayedPrice(parts) {
    if (!Array.isArray(parts) || parts.length < 2) return null;
    const source = parts.map((part) => String(part)).join("");
    const parsedPrices = parseDisplayedPrices(source);
    return parsedPrices.length === 1 && source.trim() === parsedPrices[0].matchedText
      ? parsedPrices[0]
      : null;
  }

  function parsePriceContainerText(text) {
    const source = String(text || "");
    const trimmed = source.trim();
    if (!trimmed) return null;

    const fullPrice = parseDisplayedPrice(source);
    const contentStart = source.search(/\S/);
    const contentEnd = source.length - (source.match(/\s*$/)?.[0].length || 0);
    if (
      !fullPrice ||
      fullPrice.index !== contentStart ||
      fullPrice.index + fullPrice.matchedText.length !== contentEnd
    ) {
      return null;
    }

    const parsedPrices = parseDisplayedPrices(source);
    return parsedPrices.length === 1 ? parsedPrices[0] : null;
  }

  function isAllowedPriceNode(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest('[data-marketplace-wrapper="true"], #providers, main table')) return true;
    if (isComparePath(location.pathname)) return Boolean(parent.closest("main"));

    const modelTitle = document.querySelector("#model-title-row");
    if (!modelTitle || !parent.closest("main")) return false;
    const context = parent.closest("div, section, td")?.textContent || parent.textContent || "";
    return (
      context.length <= 500 &&
      /(?:\b(?:price|input\s*\/m|output\s*\/m|in\s*\/\s*out)\b|价格|输入\s*\/\s*输出)/i.test(
        context,
      )
    );
  }

  function createPriceCnyElement(quote) {
    const cny = document.createElement("span");
    cny.dataset.orlOwned = "true";
    cny.dataset.orlPriceCny = "true";
    cny.className = "orl-price-cny";
    cny.textContent = Number.isFinite(quote?.cny) ? `(¥${formatCnyPrice(quote.cny)})` : "";
    return cny;
  }

  function collectPriceElementText(element) {
    const entries = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement?.closest("[data-orl-owned]")) entries.push(node);
    }
    return {
      entries,
      source: entries.map((node) => node.nodeValue || "").join(""),
    };
  }

  function findSplitPriceElement(node) {
    let element = node.parentElement;
    for (let depth = 0; element && depth < 5; depth += 1) {
      if (element.closest("[data-orl-owned]")) return null;
      const collected = collectPriceElementText(element);
      if (collected.entries.length >= 2 && parsePriceContainerText(collected.source)) {
        return element;
      }
      if (element.matches("td, th, li, section")) return null;
      element = element.parentElement;
    }
    return null;
  }

  function insertPriceCnyElement(element, entries, insertionOffset, cny) {
    let consumed = 0;
    for (const node of entries) {
      const text = node.nodeValue || "";
      const end = consumed + text.length;
      if (insertionOffset > end) {
        consumed = end;
        continue;
      }

      const localOffset = Math.max(0, insertionOffset - consumed);
      if (localOffset === 0) {
        node.before(cny);
      } else if (localOffset === text.length) {
        const parent = node.parentElement;
        if (parent && parent !== element && parent.childNodes.length === 1) parent.after(cny);
        else node.after(cny);
      } else {
        const tail = node.splitText(localOffset);
        tail.before(cny);
      }
      return true;
    }
    return false;
  }

  function renderPriceInline(wrapper, original, parsedPrices, quotes) {
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    parsedPrices.forEach((parsed, index) => {
      const start = parsed.index;
      const end = start + parsed.matchedText.length;
      if (start < cursor || end > original.length) return;
      fragment.append(document.createTextNode(original.slice(cursor, end)));
      fragment.append(createPriceCnyElement(quotes[index]));
      cursor = end;
    });

    fragment.append(document.createTextNode(original.slice(cursor)));
    wrapper.replaceChildren(fragment);
  }

  function updatePriceRecord(record, quotes) {
    const cnyElements = record.wrapper.matches?.("[data-orl-price-cny]")
      ? [record.wrapper]
      : record.wrapper.querySelectorAll("[data-orl-price-cny]");
    quotes.forEach((quote, index) => {
      const cny = cnyElements[index];
      const rendered = Number.isFinite(quote?.cny) ? `(¥${formatCnyPrice(quote.cny)})` : "";
      if (cny && cny.textContent !== rendered) cny.textContent = rendered;
    });
  }

  function removePriceRecord(node) {
    const record = priceRecords.get(node);
    if (!record) return;
    if (record.mode === "append") {
      record.wrapper.remove();
    } else if (record.wrapper.isConnected) {
      record.wrapper.replaceWith(document.createTextNode(record.original));
    }
    priceRecords.delete(node);
  }

  function enhanceSplitPriceElement(element) {
    if (!element || element.closest("[data-orl-owned]")) return false;
    const { entries, source } = collectPriceElementText(element);
    const existing = priceRecords.get(element);
    if (existing?.mode === "append" && existing.wrapper.isConnected && existing.original === source) {
      const parsedPrice = parsePriceContainerText(source);
      const quote = parsedPrice && calculatePriceQuote(parsedPrice.amount, rates);
      if (quote && Number.isFinite(quote.cny)) updatePriceRecord(existing, [quote]);
      return true;
    }
    if (existing) removePriceRecord(element);
    if (entries.length < 2) return false;

    const parsedPrice = parsePriceContainerText(source);
    if (!parsedPrice) return false;
    const quote = calculatePriceQuote(parsedPrice.amount, rates);
    if (!quote || !Number.isFinite(quote.cny)) return false;

    const cny = createPriceCnyElement(quote);
    if (!insertPriceCnyElement(element, entries, parsedPrice.index + parsedPrice.matchedText.length, cny)) {
      return false;
    }
    priceRecords.set(element, { wrapper: cny, original: source, mode: "append" });
    return true;
  }

  function enhancePriceNode(node) {
    if (node.parentElement?.closest("[data-orl-owned]")) return;
    if (!settings.enabled || !settings.showCny || !rates || shouldSkipNode(node)) {
      removePriceRecord(node);
      return;
    }
    if (!isAllowedPriceNode(node)) {
      removePriceRecord(node);
      return;
    }
    const parsedPrices = parseDisplayedPrices(node.nodeValue || "");
    if (parsedPrices.length === 0) {
      const splitPriceElement = node.nodeValue?.includes("$") ? findSplitPriceElement(node) : null;
      if (splitPriceElement && enhanceSplitPriceElement(splitPriceElement)) return;
      removePriceRecord(node);
      return;
    }
    const quotes = parsedPrices.map((parsed) => calculatePriceQuote(parsed.amount, rates));
    if (quotes.some((quote) => !quote || !Number.isFinite(quote.cny))) return;

    const existing = priceRecords.get(node);
    if (existing?.wrapper.isConnected && existing.original === node.nodeValue) {
      updatePriceRecord(existing, quotes);
      return;
    }
    removePriceRecord(node);

    const wrapper = document.createElement("span");
    wrapper.dataset.orlOwned = "true";
    wrapper.dataset.orlPriceInline = "true";
    wrapper.dataset.orlPriceOriginal = node.nodeValue || "";
    wrapper.className = "orl-price-inline";
    renderPriceInline(wrapper, node.nodeValue || "", parsedPrices, quotes);
    priceRecords.set(node, { wrapper, original: node.nodeValue || "" });
    node.replaceWith(wrapper);
  }

  function scanPrices(root) {
    if (!settings.enabled || !settings.showCny || !rates) return;
    const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!(scope instanceof Element) || scope.closest("[data-orl-owned]")) return;

    if (scope === document.body) {
      for (const [sourceNode, record] of priceRecords) {
        if (record.mode === "append") {
          const currentSource = collectPriceElementText(sourceNode).source;
          if (currentSource !== record.original) {
            removePriceRecord(sourceNode);
            continue;
          }
        }
        if (record.wrapper.isConnected) {
          const parsedPrices = parseDisplayedPrices(record.original);
          const quotes = parsedPrices.map((parsed) => calculatePriceQuote(parsed.amount, rates));
          if (quotes.every((quote) => quote && Number.isFinite(quote.cny))) {
            updatePriceRecord(record, quotes);
          }
        }
      }
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    if (root.nodeType === Node.TEXT_NODE) nodes.push(root);
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      if (node.parentElement?.closest("[data-orl-owned]")) continue;
      if (node.nodeValue?.includes("$")) enhancePriceNode(node);
      else removePriceRecord(node);
    }
  }

  function restorePrices() {
    for (const node of [...priceRecords.keys()]) removePriceRecord(node);
    document.querySelectorAll("[data-orl-price-badge]").forEach((element) => element.remove());
    document.querySelectorAll("[data-orl-price-cny]").forEach((element) => {
      if (!element.closest("[data-orl-price-inline]")) element.remove();
    });
    document.querySelectorAll("[data-orl-price-inline]").forEach((element) => {
      const original = element.dataset.orlPriceOriginal;
      if (original !== undefined) element.replaceWith(document.createTextNode(original));
      else element.remove();
    });
  }
  function isUiTextElement(element) {
    return Boolean(
      element?.closest(
        [
          "header",
          "nav",
          "footer",
          "aside",
          "button",
          "label",
          "legend",
          "th",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "[role='menu']",
          "[role='listbox']",
          "[role='option']",
          "[role='tab']",
          "[role='tooltip']",
        ].join(", "),
      ),
    );
  }

  function isPrivateContentElement(element) {
    return Boolean(
      element?.closest(
        [
          "form",
          "[role='textbox']",
          "[contenteditable]",
          "[data-private]",
          "[data-user]",
          "[data-message]",
          "[data-testid*='chat']",
          "[data-testid*='message']",
          "[data-testid*='prompt']",
        ].join(", "),
      ),
    );
  }

  function isPublicContentDocument(pathname) {
    if (PRIVATE_CONTENT_PATH_PREFIXES.has(firstPathSegment(pathname))) return false;
    if (isPublicContentPath(pathname)) return true;
    const modelEntity = isModelEntityPath(pathname);
    const authorEntity = isAuthorEntityPath(pathname);
    if (!modelEntity && !authorEntity) return false;
    const canonical = document.querySelector('link[rel="canonical"][href]');
    if (!canonical) return false;
    try {
      const canonicalUrl = new URL(canonical.href, location.origin);
      if (canonicalUrl.origin !== location.origin || canonicalUrl.pathname !== pathname) return false;
    } catch {
      return false;
    }

    if (modelEntity) {
      return Boolean(
        document.querySelector("#model-title-row h1, main h1") &&
          document.querySelector(
            '#providers, main nav a[href="#providers"], main a[href$="#providers"]',
          ),
      );
    }

    const author = firstPathSegment(pathname);
    return Boolean(
      document.querySelector("main h1") &&
        Array.from(
          document.querySelectorAll("main [data-testid='model-list-item'] a[href]"),
        ).some((anchor) => {
          try {
            const url = new URL(anchor.href, location.origin);
            const segments = url.pathname.split("/").filter(Boolean);
            return (
              url.origin === location.origin &&
              segments.length >= 2 &&
              segments[0] === author &&
              isModelEntityPath(url.pathname)
            );
          } catch {
            return false;
          }
        }),
    );
  }

  function isProtectedContentNode(node, value = null) {
    const element = node.parentElement;
    if (!element || shouldSkipNode(node)) return true;
    if (
      element.closest(
        "template, svg, math, canvas, [hidden], [aria-hidden='true'], [data-orl-owned]",
      )
    ) {
      return true;
    }

    const text = String(value ?? node.nodeValue ?? "").trim();
    return (
      PROTECTED_LABELS.has(text) ||
      isKnownProviderName(text) ||
      isKnownModelName(text) ||
      isProtectedEntityNode(element, text)
    );
  }

  function isEnglishContentNode(node, options = {}) {
    if (!(node instanceof Text)) return false;
    if (!options.protectionChecked && isProtectedContentNode(node)) return false;
    if (firstPathSegment(location.pathname) === "fusion") return false;
    const element = node.parentElement;
    if (isPrivateContentElement(element)) return false;
    const publicContent =
      typeof options.publicContent === "boolean"
        ? options.publicContent
        : isPublicContentDocument(location.pathname);
    const uiContext = isUiTextElement(element);
    return shouldTranslateOnlineText(node.nodeValue, { publicContent, uiContext });
  }

  function collectContentCandidates(root) {
    if (!settings.enabled || !settings.translateContent) return;
    const scope = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!(scope instanceof Element)) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const candidates = [];
    while (walker.nextNode()) candidates.push(walker.currentNode);

    const currentRoute = location.pathname;
    const publicContent = isPublicContentDocument(currentRoute);
    for (const node of candidates) {
      const prior = textRecords.get(node);
      if (isProtectedContentNode(node, prior?.original ?? node.nodeValue)) {
        if (prior && node.nodeValue === prior.rendered) node.nodeValue = prior.original;
        textRecords.delete(node);
        continue;
      }
      if (prior && node.nodeValue === prior.rendered) continue;
      if (prior) textRecords.delete(node);
      if (
        !isEnglishContentNode(node, { publicContent, protectionChecked: !prior }) ||
        descriptionPending.has(node)
      ) {
        continue;
      }
      const original = node.nodeValue;
      const source = original.trim();
      const taskId = ++descriptionTaskId;
      descriptionPending.set(node, taskId);
      descriptionQueue.push({
        kind: "text",
        node,
        original,
        source,
        route: currentRoute,
        protectedEntities: protectedEntityNamesForText(source),
        generation: descriptionGeneration,
        taskId,
        attempt: 0,
      });
    }

    if (publicContent) {
      const selector = TRANSLATABLE_ATTRIBUTES.map((attribute) => `[${attribute}]`).join(", ");
      const elements = [];
      if (scope.matches?.(selector)) elements.push(scope);
      elements.push(...scope.querySelectorAll(selector));
      for (const element of elements) {
        if (
          element.closest("[data-orl-owned]") ||
          isPrivateContentElement(element) ||
          isProtectedEntityNode(element)
        ) {
          continue;
        }
        const records = attributeRecords.get(element);
        for (const attribute of TRANSLATABLE_ATTRIBUTES) {
          const original = element.getAttribute(attribute);
          const prior = records?.[attribute];
          if (!original || (prior && original === prior.rendered)) continue;
          if (getAttributePending(element, attribute)) continue;
          if (!shouldTranslateOnlineText(original, { publicContent: true, uiContext: true })) {
            continue;
          }
          const taskId = ++descriptionTaskId;
          setAttributePending(element, attribute, taskId);
          descriptionQueue.push({
            kind: "attribute",
            element,
            attribute,
            original,
            source: original.trim(),
            route: currentRoute,
            protectedEntities: protectedEntityNamesForText(original),
            generation: descriptionGeneration,
            taskId,
            attempt: 0,
          });
        }
      }
    }
    runDescriptionWorkers();
  }
  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function translationCancelledError() {
    const error = new Error("翻译任务已取消");
    error.name = "AbortError";
    return error;
  }

  async function translateMaskedChunk(maskedText) {
    const key = `${TRANSLATION_SCHEMA_VERSION}:${maskedText.length}:${hashText(maskedText)}`;
    const cached = translationCache[key];
    if (typeof cached?.translatedMasked === "string") {
      cached.lastUsed = Date.now();
      return cached.translatedMasked;
    }
    if (translationInFlight.has(key)) return translationInFlight.get(key);

    const promise = (async () => {
      const url =
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
        encodeURIComponent(maskedText);
      const payload = await requestJson(url, 12000);
      const translatedMasked = payload?.[0]?.map((part) => part?.[0] || "").join("").trim();
      if (!translatedMasked) throw new Error("翻译响应为空");
      const sourceMarkers = maskedText.match(/__ORL_P\d+__/g) || [];
      const translatedMarkers = translatedMasked.match(/__ORL_P\d+__/g) || [];
      if (
        sourceMarkers.length !== translatedMarkers.length ||
        sourceMarkers.some((marker) => translatedMarkers.filter((item) => item === marker).length !== 1)
      ) {
        throw new Error("翻译响应中的保护标记无效");
      }

      translationCache[key] = { translatedMasked, lastUsed: Date.now() };
      translationCacheSize += 1;
      if (translationCacheSize > TRANSLATION_CACHE_LIMIT) {
        const entries = Object.entries(translationCache);
        const targetSize = Math.floor(TRANSLATION_CACHE_LIMIT * 0.9);
        const deleteCount = entries.length - targetSize;
        entries
          .sort(([, left], [, right]) => Number(left?.lastUsed || 0) - Number(right?.lastUsed || 0))
          .slice(0, deleteCount)
          .forEach(([oldKey]) => delete translationCache[oldKey]);
        translationCacheSize -= deleteCount;
      }
      scheduleTranslationCachePersist();
      return translatedMasked;
    })();
    translationInFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      if (translationInFlight.get(key) === promise) translationInFlight.delete(key);
    }
  }

  async function translateContentText(text, isStillCurrent = () => true, additionalEntities = []) {
    const protectedText = maskProtectedTranslationText(text, additionalEntities);
    const translatedChunks = [];
    for (const chunk of splitTranslationText(protectedText.masked)) {
      if (!isStillCurrent()) throw translationCancelledError();
      const leading = chunk.match(/^\s*/)?.[0] || "";
      const trailing = chunk.match(/\s*$/)?.[0] || "";
      const content = chunk.slice(leading.length, chunk.length - trailing.length);
      if (!content) {
        translatedChunks.push(chunk);
        continue;
      }
      const translatedMasked = await translateMaskedChunk(content);
      if (!isStillCurrent()) throw translationCancelledError();
      translatedChunks.push(`${leading}${translatedMasked}${trailing}`);
    }
    const translated = restoreProtectedTranslationText(
      translatedChunks.join(""),
      protectedText.entities,
    );
    if (!translated) throw new Error("翻译响应为空或保护标记丢失");
    return translated;
  }

  function scheduleTranslationCachePersist() {
    global.clearTimeout(translationPersistTimer);
    if (translationPersistIdle && typeof global.cancelIdleCallback === "function") {
      global.cancelIdleCallback(translationPersistIdle);
      translationPersistIdle = 0;
    }
    translationPersistTimer = global.setTimeout(() => {
      translationPersistTimer = 0;
      const persist = () => {
        translationPersistIdle = 0;
        writeValue(TRANSLATION_CACHE_KEY, translationCache);
      };
      if (typeof global.requestIdleCallback === "function") {
        translationPersistIdle = global.requestIdleCallback(persist, { timeout: 2000 });
      } else {
        persist();
      }
    }, 1000);
  }

  function runDescriptionWorkers() {
    while (descriptionWorkers < CONTENT_WORKER_LIMIT && descriptionQueue.length > 0) {
      const task = descriptionQueue.shift();
      const {
        kind,
        node,
        element,
        attribute,
        original,
        source,
        route,
        protectedEntities,
        generation,
        taskId,
        attempt,
      } = task;
      descriptionWorkers += 1;
      (async () => {
        const isCurrent = () =>
          settings.enabled &&
          settings.translateContent &&
          generation === descriptionGeneration &&
          route === location.pathname &&
          (kind === "attribute"
            ? element?.isConnected && element.getAttribute(attribute) === original
            : node?.isConnected && node.nodeValue === original);
        let retryScheduled = false;
        try {
          if (!isCurrent()) return;
          const translated = await translateContentText(source, isCurrent, protectedEntities);
          if (!isCurrent()) return;
          if (kind === "attribute") {
            const records = attributeRecords.get(element) || {};
            records[attribute] = { original, rendered: translated, owner: "remote" };
            attributeRecords.set(element, records);
            element.setAttribute(attribute, translated);
          } else {
            const rendered = preserveWhitespace(original, translated);
            textRecords.set(node, {
              original,
              rendered,
              owner: "remote",
            });
            node.nodeValue = rendered;
          }
        } catch (error) {
          if (
            error?.name !== "AbortError" &&
            isCurrent() &&
            attempt < CONTENT_TRANSLATION_RETRY_LIMIT
          ) {
            retryScheduled = true;
            global.setTimeout(
              () => {
                if (isCurrent()) {
                  descriptionQueue.push({ ...task, attempt: attempt + 1 });
                  runDescriptionWorkers();
                  return;
                }
                if (kind === "attribute") deleteAttributePending(element, attribute, taskId);
                else if (descriptionPending.get(node) === taskId) descriptionPending.delete(node);
              },
              400 * 2 ** attempt,
            );
          } else if (error?.name !== "AbortError") {
            setDescriptionStatus("部分页面内容暂时无法翻译");
          }
        } finally {
          if (!retryScheduled) {
            if (kind === "attribute") deleteAttributePending(element, attribute, taskId);
            else if (descriptionPending.get(node) === taskId) descriptionPending.delete(node);
          }
          descriptionWorkers -= 1;
          runDescriptionWorkers();
        }
      })();
    }
  }
  function restoreEnhancements() {
    for (const [node, record] of textRecords) {
      if (node.isConnected && node.nodeValue === record.rendered) node.nodeValue = record.original;
    }
    textRecords.clear();

    for (const [element, records] of attributeRecords) {
      if (!element.isConnected) continue;
      for (const [attribute, record] of Object.entries(records)) {
        if (element.getAttribute(attribute) === record.rendered) {
          element.setAttribute(attribute, record.original);
        }
      }
    }
    attributeRecords.clear();

    restorePrices();
  }

  function isActivePage() {
    return isTargetPath(location.pathname);
  }

  function scanRoot(root) {
    updatePanelVisibility();
    if (!isActivePage()) return;
    if (!settings.enabled) {
      restoreEnhancements();
      return;
    }
    discoverPageEntities(root);
    if (settings.translateUi) scanStaticTranslations(root);
    if (settings.showCny && rates) scanPrices(root);
    else if (priceRecords.size > 0) restorePrices();
    if (settings.translateContent) collectContentCandidates(root);
  }

  function closestCommonScanAncestor(scopes) {
    const [first, ...rest] = scopes;
    let ancestor = first || null;
    for (const scope of rest) {
      while (ancestor && !ancestor.contains(scope)) ancestor = ancestor.parentElement;
      if (!ancestor) return document.body;
    }
    return ancestor || document.body;
  }

  function scheduleScan(root) {
    const initialScope = root?.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (
      !(initialScope instanceof Element) ||
      !initialScope.isConnected ||
      initialScope.closest("[data-orl-owned]")
    ) {
      return;
    }
    const scope =
      initialScope.closest("#pricing .recharts-tooltip-wrapper") || initialScope;
    for (const pending of pendingRoots) {
      if (pending.contains(scope)) return;
      if (scope.contains(pending)) pendingRoots.delete(pending);
    }
    pendingRoots.add(scope);
    if (pendingRoots.size > MAX_PENDING_SCAN_ROOTS) {
      const commonAncestor = closestCommonScanAncestor([...pendingRoots]);
      pendingRoots.clear();
      pendingRoots.add(commonAncestor);
    }
    if (scanFrame) return;
    scanFrame = global.requestAnimationFrame(() => {
      scanFrame = 0;
      const roots = [...pendingRoots];
      pendingRoots.clear();
      for (const current of roots) scanRoot(current);
      cleanDisconnectedRecords();
    });
  }

  function scheduleFullScan() {
    if (document.body) scheduleScan(document.body);
  }

  function cleanDisconnectedRecords() {
    if (!recordsNeedCleanup) return;
    const now = Date.now();
    if (now - lastRecordCleanupAt < RECORD_CLEANUP_INTERVAL_MS) return;
    lastRecordCleanupAt = now;
    recordsNeedCleanup = false;
    for (const node of textRecords.keys()) if (!node.isConnected) textRecords.delete(node);
    for (const element of attributeRecords.keys()) if (!element.isConnected) attributeRecords.delete(element);
    for (const node of descriptionPending.keys()) if (!node.isConnected) descriptionPending.delete(node);
    for (const element of attributePending.keys()) if (!element.isConnected) attributePending.delete(element);
    for (const [node, record] of priceRecords) {
      if (!record.wrapper.isConnected) priceRecords.delete(node);
    }
  }

  function scheduleRecordCleanup() {
    recordsNeedCleanup = true;
    if (recordCleanupTimer) return;
    const elapsed = Date.now() - lastRecordCleanupAt;
    const delay = Math.max(0, RECORD_CLEANUP_INTERVAL_MS - elapsed);
    recordCleanupTimer = global.setTimeout(() => {
      recordCleanupTimer = 0;
      cleanDisconnectedRecords();
    }, delay);
  }

  function handleRouteChange() {
    const nextRoute = location.pathname;
    if (nextRoute === routeKey) return;
    routeKey = nextRoute;
    PAGE_ENTITY_REGISTRY.resetDynamic();
    registerRouteEntityHints(nextRoute);
    descriptionGeneration += 1;
    descriptionQueue.length = 0;
    descriptionPending.clear();
    attributePending.clear();
    recordsNeedCleanup = false;
    restoreEnhancements();
    updatePanelVisibility();
    if (isTargetPath(location.pathname)) {
      loadRates();
      scheduleFullScan();
    }
  }

  function observePage() {
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      handleRouteChange();
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const element = mutation.target;
          const record = attributeRecords.get(element)?.[mutation.attributeName];
          if (record && element.getAttribute(mutation.attributeName) === record.rendered) continue;
          if (!element.closest?.("[data-orl-owned]")) scheduleScan(element);
          continue;
        }
        if (mutation.type === "characterData") {
          const record = textRecords.get(mutation.target);
          if (record && mutation.target.nodeValue === record.rendered) continue;
          const parent = mutation.target.parentElement;
          if (parent && !parent.closest("[data-orl-owned]")) scheduleScan(parent);
          continue;
        }
        if (mutation.removedNodes.length > 0) scheduleRecordCleanup();
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scheduleScan(node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
          }
        }
      }
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
      childList: true,
      characterData: true,
      subtree: true,
    });
    global.addEventListener("popstate", handleRouteChange);
    global.addEventListener("hashchange", handleRouteChange);
    global.setInterval(handleRouteChange, 1000);
  }
  function element(tag, properties = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(properties)) {
      if (key === "className") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value !== undefined && value !== null) {
        node.setAttribute(key, String(value));
      }
    }
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child) node.append(child);
    }
    return node;
  }

  function checkboxRow(label, key, detail) {
    const input = element("input", { type: "checkbox" });
    input.checked = Boolean(settings[key]);
    input.addEventListener("change", () => {
      settings[key] = input.checked;
      saveSettings();
      if (key === "showCny" && !settings.showCny) restorePrices();
      if (!settings.enabled || (key === "translateContent" && !settings.translateContent)) {
        descriptionGeneration += 1;
        descriptionQueue.length = 0;
        descriptionPending.clear();
        attributePending.clear();
      }
      if (
        !settings.enabled ||
        (key === "translateUi" && !settings.translateUi) ||
        (key === "translateContent" && !settings.translateContent)
      ) {
        restoreEnhancements();
      }
      scheduleFullScan();
    });
    panelRefs[key] = input;
    return element("label", { className: "orl-check-row" }, [
      element("span", {}, [
        element("strong", { text: label }),
        detail ? element("small", { text: detail }) : null,
      ]),
      input,
    ]);
  }

  function setPanelOpen(open) {
    if (!panelRefs.panel) return;
    panelRefs.panel.classList.toggle("orl-hidden", !open);
    if (open) panelRefs.closeButton?.focus();
  }

  function mountPanel() {
    if (document.querySelector("[data-orl-panel-host]")) return;
    const host = element("div", {
      "data-orl-panel-host": "true",
      "data-orl-owned": "true",
      "data-orl-version": VERSION,
    });
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style", {
      text: `
        :host { all: initial; color-scheme: light dark; }
        * { box-sizing: border-box; letter-spacing: 0; }
        button, input { font: inherit; }
        .orl-panel { position: fixed; right: 16px; top: 58px; z-index: 2147483646; width: min(360px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 72px)); overflow: auto; border: 1px solid rgba(127,127,127,.34); border-radius: 8px; background: light-dark(#fff, #171717); color: light-dark(#171717, #f5f5f5); box-shadow: 0 18px 50px rgba(0,0,0,.28); font: 13px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .orl-hidden { display: none !important; }
        .orl-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid rgba(127,127,127,.22); background: inherit; }
        .orl-head strong { font-size: 14px; }
        .orl-icon-button { width: 30px; height: 30px; border: 0; border-radius: 6px; color: inherit; background: transparent; cursor: pointer; font-size: 19px; }
        .orl-icon-button:hover { background: rgba(127,127,127,.14); }
        .orl-section { padding: 13px 16px; border-bottom: 1px solid rgba(127,127,127,.18); }
        .orl-section-title { display: block; margin-bottom: 9px; font-weight: 700; font-size: 12px; color: light-dark(#5d6470, #b6bbc4); }
        .orl-check-row { min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 14px; cursor: pointer; }
        .orl-check-row span { display: grid; gap: 2px; }
        .orl-check-row strong { font-weight: 600; }
        .orl-check-row small, .orl-note { color: light-dark(#6b7280, #a3a3a3); font-size: 11px; }
        .orl-check-row input { width: 17px; height: 17px; accent-color: #1677ff; }
        .orl-rates { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: baseline; }
        .orl-rates output { font-variant-numeric: tabular-nums; font-weight: 650; }
        .orl-rate-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 11px; }
        .orl-button { min-height: 32px; border: 1px solid rgba(127,127,127,.34); border-radius: 6px; padding: 0 11px; color: inherit; background: transparent; cursor: pointer; }
        .orl-button:hover { background: rgba(127,127,127,.12); }
        .orl-button:disabled { cursor: wait; opacity: .55; }
        .orl-manual-grid { display: grid; grid-template-columns: 1fr 108px; gap: 8px 12px; align-items: center; margin-top: 10px; }
        .orl-manual-grid input { width: 100%; min-height: 32px; border: 1px solid rgba(127,127,127,.34); border-radius: 6px; padding: 4px 8px; color: inherit; background: transparent; font-variant-numeric: tabular-nums; }
        .orl-status { padding: 12px 16px; color: light-dark(#5d6470, #b6bbc4); font-size: 11px; }
        @media (max-width: 560px) {
          .orl-panel { top: 52px; right: 8px; width: calc(100vw - 16px); max-height: calc(100vh - 60px - env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); }
        }
      `,
    });

    const panel = element("section", {
      className: "orl-panel orl-hidden",
      role: "dialog",
      "aria-label": "OpenRouter 中文与价格设置",
    });
    const closeButton = element("button", {
      className: "orl-icon-button",
      type: "button",
      text: "×",
      title: "关闭",
      "aria-label": "关闭设置",
    });
    const refreshButton = element("button", {
      className: "orl-button",
      type: "button",
      text: "刷新行情",
    });
    const manualToggle = element("input", { type: "checkbox" });
    manualToggle.checked = settings.rateMode === "manual";
    const manualUsdInput = element("input", {
      type: "number",
      min: "1",
      max: "20",
      step: "0.0001",
      value: settings.manualUsdCny,
      "aria-label": "手动 USD/CNY",
    });
    const manualUsdcInput = element("input", {
      type: "number",
      min: "0.5",
      max: "1.5",
      step: "0.0001",
      value: settings.manualUsdcUsd,
      "aria-label": "手动 USDC/USD",
    });
    const manualGrid = element("div", { className: "orl-manual-grid" }, [
      element("span", { text: "USD/CNY" }),
      manualUsdInput,
      element("span", { text: "USDC/USD" }),
      manualUsdcInput,
    ]);
    manualGrid.classList.toggle("orl-hidden", settings.rateMode !== "manual");

    const usdOutput = element("output", { text: "--" });
    const usdcUsdOutput = element("output", { text: "--" });
    const usdcCnyOutput = element("output", { text: "--" });
    const rateStatus = element("div", { className: "orl-note", text: "等待行情" });
    const descriptionStatus = element("div", { className: "orl-status", text: `v${VERSION}` });

    panel.append(
      element("header", { className: "orl-head" }, [
        element("strong", { text: "中文与价格" }),
        closeButton,
      ]),
      element("div", { className: "orl-section" }, [
        element("span", { className: "orl-section-title", text: "显示" }),
        checkboxRow("启用脚本", "enabled"),
        checkboxRow("中文界面", "translateUi", "内置词典，不联网"),
        checkboxRow("页面内容中文", "translateContent", "公开长文使用 Google 翻译"),
        checkboxRow("人民币估价", "showCny", "保留 OpenRouter 官方美元价"),
      ]),
      element("div", { className: "orl-section" }, [
        element("span", { className: "orl-section-title", text: "Yahoo 行情" }),
        element("div", { className: "orl-rates" }, [
          element("span", { text: "USD/CNY" }),
          usdOutput,
          element("span", { text: "USDC/USD" }),
          usdcUsdOutput,
          element("span", { text: "USDC/CNY" }),
          usdcCnyOutput,
        ]),
        element("div", { className: "orl-rate-actions" }, [rateStatus, refreshButton]),
        element("label", { className: "orl-check-row" }, [
          element("span", {}, [
            element("strong", { text: "使用手动汇率" }),
            element("small", { text: "Yahoo 在部分地区可能不可用" }),
          ]),
          manualToggle,
        ]),
        manualGrid,
      ]),
      element("div", {
        className: "orl-status",
        text: "页面只追加 ¥ 参考价，OpenRouter 官方价格仍以 USD 结算。USDC/CNY 为市场参考。",
      }),
      descriptionStatus,
    );

    shadow.append(style, panel);
    Object.assign(panelRefs, {
      host,
      panel,
      closeButton,
      refreshButton,
      manualToggle,
      manualGrid,
      manualUsdInput,
      manualUsdcInput,
      usdOutput,
      usdcUsdOutput,
      usdcCnyOutput,
      rateStatus,
      descriptionStatus,
    });

    closeButton.addEventListener("click", () => setPanelOpen(false));
    shadow.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    });
    refreshButton.addEventListener("click", async () => {
      refreshButton.disabled = true;
      await loadRates({ force: true });
      global.setTimeout(() => {
        refreshButton.disabled = false;
      }, RATE_RETRY_COOLDOWN_MS);
    });
    manualToggle.addEventListener("change", () => {
      settings.rateMode = manualToggle.checked ? "manual" : "yahoo";
      manualGrid.classList.toggle("orl-hidden", !manualToggle.checked);
      saveSettings();
      loadRates({ force: true });
    });
    for (const input of [manualUsdInput, manualUsdcInput]) {
      input.addEventListener("change", () => {
        settings.manualUsdCny = Number(manualUsdInput.value);
        settings.manualUsdcUsd = Number(manualUsdcInput.value);
        settings = clampSettings(settings);
        manualUsdInput.value = settings.manualUsdCny;
        manualUsdcInput.value = settings.manualUsdcUsd;
        saveSettings();
        if (settings.rateMode === "manual") loadRates({ force: true });
      });
    }
    updatePanelVisibility();
    refreshPanel();
  }

  function mountDocumentStyles() {
    if (document.querySelector("style[data-orl-styles]")) return;
    const style = element("style", {
      "data-orl-styles": "true",
      "data-orl-owned": "true",
      text: `
        .orl-price-cny {
          color: color-mix(in srgb, currentColor 78%, #1677ff 22%);
          font-size: .92em;
          font-weight: 600;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          text-decoration: inherit;
        }
      `,
    });
    document.head.append(style);
  }

  function updatePanelVisibility() {
    if (!panelRefs.host) return;
    const display = isActivePage() ? "" : "none";
    if (panelRefs.host.style.display !== display) panelRefs.host.style.display = display;
  }

  function saveSettings() {
    settings = clampSettings(settings);
    writeValue(SETTINGS_KEY, settings);
    refreshPanel();
  }

  function formatTime(timestamp) {
    if (!Number.isFinite(timestamp)) return "时间未知";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  }

  function rateStatusText(currentRates) {
    if (!currentRates) return "暂无可用汇率，仅显示美元";
    const usdc =
      currentRates.usdcStatus === "peg-assumption"
        ? "USDC：锚定估算"
        : currentRates.usdcStatus === "stale"
          ? "USDC：缓存"
          : "USDC：Yahoo";
    if (currentRates.status === "manual") return "手动汇率";
    if (currentRates.status === "stale") return `使用缓存 · ${formatTime(currentRates.usdFetchedAt)} · ${usdc}`;
    if (currentRates.status === "fallback") return `Yahoo 不可用 · ${currentRates.source} · ${usdc}`;
    return `${currentRates.source} · ${formatTime(currentRates.asOf)} · ${usdc}`;
  }

  function refreshPanel() {
    if (!panelRefs.usdOutput) return;
    panelRefs.usdOutput.textContent = rates ? formatNumber(rates.usdCny, 4) : "--";
    panelRefs.usdcUsdOutput.textContent = rates ? formatNumber(rates.usdcUsd, 6) : "--";
    panelRefs.usdcCnyOutput.textContent = rates ? formatNumber(rates.usdcCny, 4) : "--";
    panelRefs.rateStatus.textContent = rateStatusText(rates);
    panelRefs.manualToggle.checked = settings.rateMode === "manual";
    panelRefs.manualGrid.classList.toggle("orl-hidden", settings.rateMode !== "manual");
    for (const key of ["enabled", "translateUi", "translateContent", "showCny"]) {
      if (panelRefs[key]) panelRefs[key].checked = Boolean(settings[key]);
    }
  }

  function setRateStatus(text) {
    if (panelRefs.rateStatus) panelRefs.rateStatus.textContent = text;
  }

  function setDescriptionStatus(text) {
    if (panelRefs.descriptionStatus) panelRefs.descriptionStatus.textContent = text;
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("打开中文与价格设置", () => setPanelOpen(true));
    GM_registerMenuCommand("立即刷新汇率", () => loadRates({ force: true }));
  }
  function boot() {
    mountDocumentStyles();
    mountPanel();
    registerMenuCommands();
    observePage();
    handleRouteChange();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(globalThis);
