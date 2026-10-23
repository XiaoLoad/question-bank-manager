# 前端设计语言参考：PageHeader 契约与设计令牌

- 适用范围：`frontend/src/views/` 下所有页面级组件，以及 `frontend/src/components/` 下的共享 UI 组件
- 参照基准：`ExternalBanks.vue`、`SiteSettings.vue`（旗舰实现）；`About.vue`、`AiSettings.vue`、`Dashboard.vue`、`Questions.vue`、`Categories.vue`、`Trash.vue`、`UserManagement.vue`、`UserActivityLog.vue`、`Quiz.vue`（同族页）
- 基础设施：`components/PageHeader.vue`、`components/SectionHeader.vue`、`components/AppLayout.vue`、`components/Sidebar.vue`、`components/Skeleton.vue`、`components/PaginationBar.vue`、`assets/main.css`、`themes/themes.css`、`themes/index.js`、`utils/motionTokens.js`、`composables/useListSwitch.js`、`../tailwind.config.js`
- 技术栈：Vue 3.5.13 + Tailwind 3.4.17 + GSAP 3.12.5 + Vite 6.3.2（`frontend/package.json`）
- 构建校验命令：`cd frontend && npm run build`（= `vite build`，`package.json:8`）

## 1. 标题头契约（PageHeader）

### 1.1 组件契约

`frontend/src/components/PageHeader.vue`

| 成员 | 位置 | 定义 |
|---|---|---|
| prop `eyebrow` | `PageHeader.vue:5` | `String`，默认 `''`，中文小标 |
| prop `eyebrowEn` | `PageHeader.vue:6` | `String`，默认 `''`，模板里以 kebab 属性 `eyebrow-en` 传入 |
| prop `title` | `PageHeader.vue:7` | `String`，**required**，页面主标题 |
| prop `description` | `PageHeader.vue:8` | `String`，默认 `''`，副标题 |
| slot 默认 | 无 | 组件不渲染默认插槽，传子内容无效 |
| slot `actions` | `PageHeader.vue:25-27` | 唯一插槽；`v-if="$slots.actions"`，容器 `div.ds-page-actions.ds-rise` 带 `--d: 160ms` |

渲染结构与内置节奏：`header.ds-page-head > div.ds-page-copy`（`:13-14`）→ `p.ds-eyebrow.ds-rise`（`:15`，含 `span` 中文标 `:16` 与 `span.ds-eyebrow-en` `:17`）→ `h1.ds-page-title.ds-rise` `:19`（`--d: 60ms`）→ `p.ds-page-sub.ds-rise` `:20`（`--d: 110ms`）→ actions `:25-27`（`--d: 160ms`）。即页头四段入场延迟 0/60/110/160ms 由组件自带，页面不得重复施加。

排版契约（页面无需覆写）：`.ds-page-head` flex-column gap 14px / margin-bottom 22px，`@media(min-width:640px)` 转 row + flex-end + space-between + gap 22px + margin-bottom 26px（`:31-47`）；`.ds-eyebrow` 等宽字体栈 `ui-monospace/SFMono-Regular/Menlo/Consolas/'Liberation Mono'`、9.5px、600、letter-spacing .16em、uppercase、`var(--theme-accent)`，并带 16×1px `::before` 短横（`:52-71`）；`.ds-eyebrow-en` 为 `.ds-eyebrow` 的后代 → 同样继承 uppercase/.16em，仅颜色改 `.ds-eyebrow-en`→`var(--theme-muted)`、500、.2em（`:73-77`）；`.ds-page-title` 1.5rem→640px 起 1.625rem、700、ls -.022em（`:79-92`）；`.ds-page-sub` `.8125rem`、lh 1.65、`max-width: 54ch`（`:94-100`）；`.ds-page-actions` flex-wrap gap 9px、`flex-shrink: 0`（`:102-108`）。

### 1.2 全站实参（逐个页面，均已读源码核对）

| 页面 | 位置 | eyebrow | eyebrow-en | title | description | actions 插槽 |
|---|---|---|---|---|---|---|
| 仪表盘 | `Dashboard.vue:427-431` | 数据总览 | OVERVIEW | 仪表盘 | 题库规模、增长趋势与用户活跃度的即时切面。 | 有 `:433-448`（刷新按钮） |
| 题目管理 | `Questions.vue:395-401` | 题库维护 | QUESTIONS | 题目管理 | 动态 `共 {{ total }} 道题目，按分类与题型快速检索、批量维护与 AI 校验。` | 有 `:402-405`（仅管理员：新增题目） |
| 分类管理 | `Categories.vue:220-226` | 知识结构 | TAXONOMY | 分类管理 | 管理题目的分类标签，让每一道题各归其位。 | 无（自闭合标签） |
| 题库练习 | `Quiz.vue:575-581` | 练习模式 | PRACTICE | 题库练习 | 选择分类，开始练习。 | 无 |
| 回收站 | `Trash.vue:228-234` | 删除暂存 | TRASH | 回收站 | 动态 `共 {{ total }} 道已删除题目，可恢复或彻底清除。` | 有 `:235-240`（total>0：清空回收站） |
| **数据管理** | `DataManagement.vue:453-458`（HEAD 基线） | 数据资产 | DATA OPERATIONS | 数据管理 | 数据库切换、备份与导入导出；批量操作前请先确认影响范围。 | 无 |
| 用户管理 | `UserManagement.vue:3-8` | 访问控制 | ACCESS | 用户管理 | 管理账号、角色与访问权限，保持团队入口清晰可控。 | 有 `:9-11`（添加用户） |
| 用户动态 | `UserActivityLog.vue:3-8` | 用户动态 | ACTIVITY | （计算属性 `用户活动日志`） | 查看用户的登录与刷题记录，掌握账号的使用轨迹。 | 有 `:10-13`（返回/清空） |
| 题库对接 | `ExternalBanks.vue:591-596` | 外部生态 | INTEGRATIONS | 题库对接 | 把这套题库变成可被调用的接口：Yatori 与 OCS 携带同一把密钥查询，本地命中优先，AI 兜底其后。 | 有 `:597-601`（状态胶囊） |
| AI 设置 | `AiSettings.vue:847-852` | 智能服务 | INTELLIGENCE | AI 设置 | 条件式 `aiDescByRole[aiRole]`（`:446` 定义；`custom/none`→「配置你自己的 AI 服务商与提示词…」，其余→「由管理员统一配置，你只需选择…」） | 有 `:854-872`（状态胶囊 + 重新测速/新增服务商） |
| 网站设置 | `SiteSettings.vue:513-518` | 站点配置 | SITE IDENTITY | 网站设置 | 定义访客看到的第一印象；改动先暂存，确认后发布。 | 有 `:519-535`（草稿胶囊 + 保存并发布） |
| 关于 | `About.vue:169-174` | 项目档案 | THE PROJECT | 关于 | 认识这个项目，以及把它一点点搭起来的人。 | 有 `:175-182`（release-pill 版本徽章） |

侧边栏名称对齐（navTree 内 `name` 字段，`Sidebar.vue:44` 起，按声明顺序）：`:45` 仪表盘、`:49` 题目管理、`:50` 分类管理、`:51` 回收站、`:64` **数据管理**、`:65` 题库对接、`:71` 用户管理、`:72` 网站设置、`:73` AI 设置、`:74` 关于；`:57` 题库练习在「学习中心」分组内但 `/quiz` 不在主导航展开项，`/activity` 不在导航项中。

### 1.3 命名规律（归纳）

- **eyebrow（中文小标）**：固定 **4 个汉字**、无空格无标点、偏正结构名词短语、不重复 title 用词（全站 12 例无一例外；`数据资产`/`外部生态`/`站点配置` 均为「领域 + 抽象名词」）。
- **eyebrow-en（英文等宽小标）**：以 kebab 属性 `eyebrow-en` 传入；值全大写 ASCII、**1–2 个单词**、不加前缀/标点、全站唯一（OVERVIEW/QUESTIONS/TAXONOMY/PRACTICE/TRASH/DATA OPERATIONS/ACCESS/ACTIVITY/INTEGRATIONS/INTELLIGENCE/SITE IDENTITY/THE PROJECT）。注意它**不是** title 的直译（`数据管理`→DATA OPERATIONS、`题库对接`→INTEGRATIONS、`分类管理`→TAXONOMY），而是"这页管辖什么"的领域词。大小写不必在模板里手打全大写也可（`.ds-eyebrow` 已 `text-transform: uppercase`，`PageHeader.vue:61`），但**现存 12 页全部写成字面全大写**，因此按字面全大写算合规，混写算不一致。
- **title**：与 `Sidebar.vue` 的 `item.name` 逐字相同（`Dashboard.vue:430` = `Sidebar.vue:70` 仪表盘，依此类推）。`UserActivityLog.vue:6` 是唯一用 `:title` 计算属性的例外。
- **description**：一句中文、以句号 `。` 结尾、长度约 9–48 字、句式为「这页管什么 + 操作提醒/价值」，常用分号或对偶连接两个动作（`管理账号、角色与访问权限，保持团队入口清晰可控。`）。计数类页面用插值模板串（`Questions.vue:400`、`Trash.vue:233`），角色相关文案用条件串（`AiSettings.vue:446`）。
- **属性书写顺序**：`class`（可选）→ `eyebrow` → `eyebrow-en` → `title` → `description`；自闭合写法 `class="flex-shrink-0"` 出现在 `Categories.vue:220`、`Questions.vue:395`、`Trash.vue:228`、`Quiz.vue:575`、`DataManagement.vue:453`（HEAD）——旗舰页（ExternalBanks/SiteSettings/AiSettings）不带该 class。
- **actions 语义**：仅放「本页的主张动作」或「本页的状态胶囊」，批量/次要动作下沉到 `SectionHeader #actions`。旗舰页的胶囊形态是 `<span class="status-pill" :class="{...}" role="status" aria-live="polite"><i class="status-dot" aria-hidden="true"></i>文案</span>`（`ExternalBanks.vue:597-601`、`SiteSettings.vue:520-523`）——注意 `aria-live="polite"` 是旗舰页共同写法，两页都有。

### 1.4 数据管理页应填什么才算一致

- 数据管理页现值：`eyebrow="数据资产"`（4 字 ✅）、`eyebrow-en="DATA OPERATIONS"`（2 词全大写 ✅）、`title="数据管理"`（= `Sidebar.vue:64` ✅）、`description="数据库切换、备份与导入导出；批量操作前请先确认影响范围。"`（✅ 句号结尾 + 风险提醒句式）。四条均符合规律；页头改造只补结构，取值要保持这层一致性。
- 写操作页应有 `<template #actions>`，放当前库状态胶囊（`role="status" aria-live="polite"` + 页内 dot 类），语义为「当前库 / 忙碌 / 非默认库」，与 `ExternalBanks.vue:563`、`SiteSettings.vue:520` 同构。数据管理页的实现见 `DataManagement.vue:730-742`（胶囊 `:737`）。
- 不要在页面里覆写 `.ds-page-title` 等类；`DataManagement.vue` 全文 `grep 'ds-page-title' → 0 命中`，这一条现状即合规。
- 标题下第一个可交互区块不要手写"大标题行"，应直接进 hero 或第一个 `SectionHeader`。
---

## 2. 设计令牌表

### 2.1 主题数量

可证实的主题为 **6 套**：`frontend/src/themes/themes.css` 定义 `purple / green / orange / blue / pink / indigo`，每套各一组亮色 `:root, .theme-X` 与一组暗色 `.dark.theme-X`；`frontend/src/themes/index.js` 的 `themes` 对象与 `THEME_IDS` 同为这 6 个键。换肤要求一律按「6 套主题 × 亮暗 = 12 个组合」验收，注释与文档里的数量都以此为准；需要更多主题时先扩 `themes.css` + `themes/index.js`，再更新这里的计数。

### 2.2 --theme-* 实际取值（亮/暗全表）

`themes.css` 只声明 6 个变量：`--theme-bg`、`--theme-surface`、`--theme-text`、`--theme-border`、`--theme-accent`、`--theme-muted`（`themes.css:8-14`）。**没有 `--theme-danger` / `--theme-success` / `--theme-warning`**（全文 0 命中）——这就是为什么语义色必须由页面自定义 token 承担（见 2.4）。

| 主题 | 亮色（bg / surface / text / border / accent / muted） | 暗色（同顺序） | 行号（亮 / 暗） |
|---|---|---|---|
| purple 经典紫（`:root` 默认） | #ffffff / #ffffff / #37352f / #e5e3df / #5645d4 / #9b9a97 | #191919 / #202020 / #e8e6e3 / #333333 / #7c6ef0 / #6b6b6b | 7-15 / 17-24 |
| green 护眼绿 | #f8fdf8 / #e8f5e9 / #2e3b2e / #c8e6c9 / #4caf50 / #7cb680 | #1a2419 / #223322 / #e0ece0 / #3a5a3a / #66bb6a / #5a7a5a | 27-34 / 36-43 |
| orange 温暖橙 | #fdf8f4 / #f5ebe0 / #3d2e1e / #e6d5c3 / #e67e22 / #a89080 | #241c14 / #2d2318 / #ece0d4 / #5a4a3a / #f0a050 / #8a7a6a | 46-53 / 55-62 |
| blue 专业蓝 | #f8fafd / #e3ecf6 / #1e2d3d / #c3d5e6 / #2196f3 / #7a8ea0 | #141c24 / #1a2634 / #dce8f0 / #3a5068 / #42a5f5 / #5a7a90 | 65-72 / 74-81 |
| pink 玫瑰粉 | #fdf8fa / #fce4ec / #3d2e35 / #f8bbd0 / #e91e63 / #a07a8a | #24141c / #2d1a24 / #ece0e8 / #5a3a4a / #f06292 / #8a5a70 | 84-91 / 93-100 |
| indigo 靛蓝 | #f5f7fa / #e8ecf4 / #1a2332 / #c5cfe0 / #3f51b5 / #6b7a90 | #141824 / #1a2030 / #dce0ec / #3a4560 / #7986cb / #5a6a80 | 103-110 / 112-119 |

取值范围（跨 6 主题 × 2 模式，用于判断"某色是否中性"）：
- bg/surface：亮色 #ffffff–#ffffff / #e3ecf6–#fce4ec；暗色 #191919–#2d2318 / #1a2030–#2d1a24。**任何接近纯白的 `bg-white` 在 6 个暗色主题下都会变成刺眼块**（重构前的 `DataManagement.vue` 曾有 5 处）。
- text：亮 #1a2332–#3d2e1e（深）；暗 #dce0ec–#e0ece0（浅）⇒ 页面**绝不能**直接写 `text-gray-800` 之类。
- border：亮 #c3d5e6–#e8ecf4（浅灰彩）；暗 #333333–#5a4a3a ⇒ 需要更深/更浅时用 `color-mix(in srgb, var(--theme-border) N%, transparent)`，不要换色相。
- accent：亮 #2196f3/#3f51b5/#4caf50/#5645d4/#e67e22/#e91e63（6 个色相全不同）⇒ **任何硬编码 indigo/blue/purple 都只在一两套主题里"碰巧对"**。
- muted：亮 #6b7a90–#9b9a97；暗 #5a6a80–#8a7a6a。
- 主题切换过渡：`.theme-transitioning` 及 `*` 过渡 background-color/color/border-color/box-shadow/fill/stroke 0.3s ease `!important`（`themes.css:121-132`）⇒ 页面不要自己给根容器加换肤 transition。
- 运行期覆盖：`applyTheme` 移除 `theme-*` 类后 `root.classList.add('theme-'+id)`，并用 `root.style.setProperty` 直接内联写 `--theme-bg/-surface/-text/-border/-accent/-mutable`（`themes/index.js:97-106`）⇒ 内联值优先于 `themes.css`，因此**只有消费 `var(--theme-*)` 才能同时满足 CSS 主题与自定义主题色**。

### 2.3 main.css 提供的组件类（含数值）

| 类 | 行号 | 精确规格 |
|---|---|---|
| 页面宽度契约 | `main.css:12-31` | `:root` `--ds-page-max: 80rem` / `--ds-page-gutter: 1rem`（`:14-15`）；640px 起 gutter 1.5rem（`:18-20`）；1024px 起 2rem（`:22-24`）；`.app-main { width:100%; max-width:var(--ds-page-max); margin-inline:auto; padding:var(--ds-page-gutter) }`（`:26-31`），注释明写「页面内容宽度契约：由布局层统一提供，页面自身不再声明外框宽度」（`:12-13`） |
| `.btn-primary` | `:34-38` | `px-4 py-2` bg accent 白字 rounded-btn(8px) font-medium text-sm hover:opacity-90 active:scale-[0.98] transition-all 150ms inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed |
| `.btn-secondary` | `:39-43` | 同上 padding，bg notion-surface + text + `border border-notion-border`，hover:opacity-80 |
| `.btn-danger` | `:44-48` | `px-4 py-2` `bg-red-500` 白字 rounded-btn hover:bg-red-600 transition-colors 150ms（**这是全站唯一允许硬编码红色的地方**） |
| `.card` | `:49-51` | `bg-notion-surface rounded-card(12px) border border-notion-border p-6` |
| `.input-field` | `:52-60` | `w-full px-3 py-2` text-sm border rounded-btn bg-notion-bg text-notion-text placeholder-notion-muted focus:outline-none focus:border-notion-accent + `box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent) 30%, transparent)` |
| `.select-field` | `:61-69` | 同 `.input-field` 但不含 `w-full` |
| `.badge` | `:70-72` | `inline-flex items-center px-2 py-0.5 rounded-badge(6px) text-xs font-medium` |
| `.badge-type` | `:73-76` | background `color-mix(in srgb, var(--theme-accent) 10%, transparent)` + color accent |
| `.badge-category` | `:77-79` | `bg-notion-surface text-notion-muted` |
| `.bg-accent/-10`、`.text-accent`、`.border-accent-20` | `:82-94` | 主题色工具类，全部走 `var(--theme-accent)` / `color-mix`（15% 档与无后缀 `.border-accent` 已删：无一处引用，边框一律用 `-20`） |
| `.skeleton` / `.skeleton-enhanced` | `:169-194` | 渐变 `color-mix(text 5%→10%→5%)` 90deg、background-size 200% 100%、`animation shimmer 1.6s infinite ease-in-out`（`:160-163` 位移 -200%→200%）；`::after` 白色 .4 高光 |
| `.skeleton-stat` | `:200-220` | padding 1rem；label 10px×56px r2；value 28px×64px r8 mt 8px；hint mt 6px ⇒ 统计位骨架的标准形态 |
| 过渡类 | `:128-143` / `:146-150` / `:153-157` / `:223-248` | `.page-enter/leave`（0.35s cubic-bezier(0.22,1,0.36,1) / 0.2s cubic-bezier(0.4,0,0.2,1)，enter-from translateY(16px)）；`.collapse-*`（0.3s ease-out / 0.2s ease-in，max-height 500px）；`.animate-fade-in-up`（0.3s，仅 `AnnouncementBanner.vue:115` 在用）；`.modal-overlay-*`（.3s/.2s）与 `.modal-content-*`（.35s scale(.95) translateY(10px) → .2s scale(.98) translateY(-5px)） |
| `.ds-rise` | `:297-300` | `@keyframes ds-rise` opacity 0→1 + translateY(14px)→0（`:286-295`）；动画 **0.62s cubic-bezier(0.22,1,0.36,1) backwards**，延迟 `var(--d, 0ms)` |
| `[data-reveal]` | `:302-313` | 初始 opacity 0 / translateY(16px)；过渡 opacity+transform **0.7s cubic-bezier(0.22,1,0.36,1)**；`.is-revealed` 归位 |
| 全局降级 | `:251-281` | `@media (prefers-reduced-motion: reduce)` 对 `*, *::before, *::after` 施加 animation-duration/iteration-count/transition-duration `0.01ms !important` + scroll-behavior auto；`:315-327` 另给 `.ds-rise` / `[data-reveal]` 显式静态态 |
| 其他 | `:97-125` | `mark.search-highlight` 黄色 .4/.25；滚动条 6px；`.json-viewer` 硬编码 #7c3aed/#059669/#d97706/#dc2626（+暗色组）；`.markdown-body` `a` 硬编码 #5645d4/#7c6ef0（`:329-430`）⇒ 基础设施自身有硬编码处，**不可当作“允许硬编码”的先例 |

Tailwind 侧（`frontend/tailwind.config.js`）：`darkMode: 'class'`（`:7`）；`colors.notion` 把 `bg/surface/text/border/accent/muted` **与其 `-dark` 后缀全部映射到同一个 `var(--theme-*)`**（`:11-24`）⇒ `dark:bg-notion-surface-dark` 与 `bg-notion-surface` 是同一个值，写 `dark:notion-*-dark` 是**空转噪声**（`AiSettings.vue` 105 处、`Dashboard.vue` 105 处、`Questions.vue` 44 处，属存量债务，新页禁止新增）；`borderRadius` btn 8px / card 12px / badge 6px（`:26-30`）；`fontFamily.inter`（`:31-33`）。

**页面宽度契约由谁提供**：`AppLayout.vue:109` 的 `<main :class="['lg:flex-1 lg:overflow-y-auto', showSidebar ? 'app-main' : '']">` 是唯一持有者，`.app-main` 由 `main.css:26-31` 落地。旗舰页根节点都**不再自带宽度**：`ExternalBanks.vue:1061` `.external-page{display:flex;flex-direction:column;gap:28px;padding-bottom:3.5rem}`（无 max-width/margin-inline），`SiteSettings.vue:1394-1404` `.settings-page` 同样无宽度（其 `@media(min-width:1280px)` 的 `grid-template-columns: minmax(0,1fr) 360px` 在 `SiteSettings.vue:3108-3112`，是页内两栏，不是外框）。⇒ **数据管理页重构时不得写 `max-w-4xl`/`mx-auto`/`w-full max-w-[X]` 之类的外框宽度**。

### 2.4 语义色与页内派生 token 的写法契约

旗舰页共同做法：**先在根类里派生一组页内 token，全部由 `--theme-*` + `color-mix` 推导；语义色（成功/警告/危险）作为页面局部常量，并在 `.dark` 下覆盖。**

`ExternalBanks.vue:1061-1089`：`--ex-accent/--ex-border/--ex-text/--ex-muted/--ex-surface/--ex-bg` = `var(--theme-*)` 别名（`:1062-1067`）；语义常量 `--ex-warn #b45309` / `--ex-ok #15803d` / `--ex-info #1d4ed8` / `--ex-yatori #2563eb` / `--ex-ocs #b45309`（`:1068-1072`）；派生 `--ex-muted-strong`、`--ex-accent-text`、`--ex-locate-ring`（`:1073-1076`）；`--ex-mono ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`（`:1077`）；`--ex-radius: 14px`（`:1080`）；`.dark .external-page` 覆盖 `--ex-warn #fbbf24 / --ex-ok #4ade80 / --ex-info #93c5fd / --ex-yatori #60a5fa / --ex-ocs #fbbf24`（`:1083-1089`）。

`SiteSettings.vue:1380-1420`：`.settings-page` 内 `--ss-accent: var(--theme-accent)`、`--ss-text/--ss-muted/--ss-surface/--ss-bg/--ss-border`、`--ss-soft`、`--ss-soft-2`、`--ss-accent-10`（12% mix）、`--ss-accent-15`、`--ss-muted-strong`、`--ss-accent-text`、`--ss-mono`、`--ss-radius: 16px`，另声明 `--mx: 50%` / `--my: 20%` 供聚光使用（`:1382-1383`）。

⇒ 每个页面照此定义自己的 `--xx-*` 家族：数据管理页 `.dm-page`（`DataManagement.vue:1337-1352`，`.dark .dm-page` 覆盖 `--danger #d9695c` / `--ok #58b98d` 于 `:1354-1360`）、题库对接页 `.external-page`（`ExternalBanks.vue:1016-1037`，暗色覆盖 `:1038`）、站点设置页 `.settings-page`。语义色**只以 token 形式出现**（`--danger` / `--ok`），模板里不散落 `text-red-500` 一类的调色板类。

---

## 3. 共享 UI 组件契约

### 3.1 `components/SectionNav.vue`（章节导航，340 行）

- props：`sections`（`[{ nav, index, label }]`，required）、`container`（`[data-nav]` 锚点的查询作用域，模板 ref / ref 对象 / 组件实例三者都接受，`null` 时测量安全退化）、`ariaLabel`（默认 `章节导航`）、`bandRatio`（默认 `0.36`，判定当前章节的视口带高 = `window.innerHeight * bandRatio`，`:13-14` / `:43`）、`locateSelector`（默认 `.panel`，落点脉冲目标，查不到则脉冲锚点本身）、`chips`（默认 `false`，是否渲染 <1024px 横向胶囊）。
- 事件与暴露：`emit('jump', idx)`；`defineExpose({ jumpTo })`（`:105`），页面内的跳转按钮走 `navRef.value?.jumpTo(idx)`（见 `ExternalBanks.vue:525`）。
- 自持状态与清理：`measureNav` / `trackSections`（90ms 节流 + rAF）/ `jumpTo`（`:66`，reduced-motion 下 `behavior:'auto'`）/ 活动胶囊 `scrollIntoView({block:'nearest',inline:'nearest'})`；scroll（`passive` + `capture:true`）与 resize 监听在 `onBeforeUnmount` 全部撤销，含 `cancelAnimationFrame` 与 `clearTimeout`。
- token：`.sn`（`:147-`）内的 16 个 `--sn-*` 只从全局 `var(--theme-*)` 经 `color-mix` 派生，**不读页面局部 `--ex-*` / `--dm-*`**，因此同一份标记在任意宿主页面、6 套主题与亮暗下自动跟随；暗色仅在 `.dark .sn-nav` / `.dark .sn-chips` 重混 alpha。`--sn-mono`（`:160`）为 `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`。
- 根节点 `display: contents`：固定导轨与文档流内的胶囊各自保持原有的流身份，宿主页面可用 `margin-top` 等继续控制胶囊位置。
- 用法：`ExternalBanks.vue:585`（`locate-selector=".panel"`）、`DataManagement.vue:829`（`locate-selector=".dm-console"` + `chips`）。两页锚点为 `data-nav="0..n"`；页面各自持有 `scroll-margin-top`。

### 3.2 `components/SearchableSelect.vue`（可搜索下拉，447 行）

- props / emits 契约保持稳定：`modelValue`、`options`、`placeholder`（默认 `请选择`）、`allLabel`、`labelField`（默认 `label`）、`valueField`（默认 `value`）、`disabled`（`:4-12`）；仅 `emit('update:modelValue')`（`:14`）。当前 8 个调用点：`ImportCategoryDialog.vue:99`、`Categories.vue:411`、`DataManagement.vue:1083`（条件导出）与 `:1190`（批量删除）、`Questions.vue` ×2、`Quiz.vue:658`、`Trash.vue:284`。改动该组件时以这些点为回归范围，几何逻辑不依赖任何调用点参数。
- 浮层宿主：面板用 `<Teleport to="body" :disabled="!canTeleport">`（`:322`）挂到 `document.body`，`position: fixed` 由 `place()`（`:117`）按触发器 `getBoundingClientRect()` 内联写入（`:148`），因此脱离祖先的 `overflow` 裁剪与 stacking context。`canTeleport`（`:68`）在 `onMounted` 取 `!!document.body`，body 不可用时降级为原地渲染，fixed 坐标仍以视口为参照。
- 祖先滚动保护是抖动修复的核心：聚焦一律走 `withoutAncestorScroll(() => el.focus({ preventScroll: true }))`（`:232` / `:200` / `:246`），组件内不使用 `scrollIntoView`；被裁剪祖先的枚举仍保留在 `clippedAncestors()`（`:222`）供复位使用。
- 面板几何：`flipUp`（`:21` 判定常量、`:139` 赋值）按视口上下剩余高度决定展开方向，阈值 `MIN_DROPDOWN_SPACE_REM = 20`；高度取 `NATURAL_CAP_REM`（20rem，`:37`）与所选方向可用空间减 `SAFETY`（`:28`）的较小值，并用 `MIN_PANEL_H`（160，`:30`）/ `MIN_FIT_H`（96，`:32`）兜住下限；宽度以 `MIN_PANEL_W_REM`（10rem，`:35`）随根字号缩放（`rootFontSizePx()` `:96`）。位置随 `scroll` / `resize` 经 `schedulePlace()`（`:167`）合到 rAF 重算，`startTracking()` / `stopTracking()`（`:182` / `:188`）成对注册与清理。
- 外部点击判定必须同时放行触发器与面板：`onClickOutside()`（`:272`）里 `inTrigger`（`:274`）之外还要 `inPanel = panelRef.value.contains(e.target)`（`:276`），因为 Teleport 后面板不在 `containerRef` 子树内。收起走 `closeDropdown(withFocus)`（`:204`），`withFocus` 为真时把焦点交回触发器（Esc 路径）。
- 可访问性：触发器 `aria-haspopup="listbox"` + `:aria-expanded`（`:311` / `:312`），列表容器 `role="listbox"`（`:350`），选项行 `role="option"` + `aria-selected`（`:360`）；`role` 不放面板根节点，因为面板内含搜索输入。
- 弹层局部 token `--ss-pop-*` 只从 `--theme-*` 经 `color-mix` 派生，暗色只调混合强度：声明处成对出现于 `.ss-select, .ss-pop`（`:382`）与 `.dark .ss-select, .dark .ss-pop`（`:397`）。**新增 token 必须同时改这两处**——面板被传送到 body 后已不在 `.ss-select` 子树内，漏掉第一处会拿到 `undefined`。scoped 编译只把 `data-v` 补在复合选择器末段，Teleport 保留面板自身 `data-v`，故暗色覆写仍然命中。
- z-index 由 `resolveZIndex()`（`:102`）沿父链取最大整数档（遇 `position: fixed` 即停），无档位祖先兜底 `Z_FALLBACK = 200`（`:52`），上限 `Z_CEILING = 9998`（`:53`）——一律写死 200 会让弹窗内的下拉被自己所在的弹窗盖住，一律跟随宿主又可能越过 toast 档。

### 3.3 页内 z-index 阶梯（新增层级前先对齐）

| 层 | 值 | 位置 |
|---|---|---|
| 面板装饰层 / 光斑 | 0 | `DataManagement.vue:1448` `.dm-console-fx`、`:1458` `.dm-console::after` |
| 面板正文 | 1 | `DataManagement.vue:1434` `.dm-console > :not(.dm-console-fx)` |
| 投递角标 | 2 | `DataManagement.vue:2215` `.dm-drop-corner` |
| 聚焦面板（抬升自身以承载浮层） | 30 | `DataManagement.vue:1440` `.dm-console:focus-within` |
| 章节导航导轨 | 40 | `SectionNav.vue:172` `.sn-nav`（高于聚焦面板，低于页面模态） |
| 页面模态（上传命名） | 90 | `DataManagement.vue:2472` `.dm-modal` |
| 页内浮层兜底档 | 200 | `SearchableSelect.vue:52` `Z_FALLBACK`（浮层 Teleport 到 body 后回到根层叠上下文，需高于以上各档） |
| 宿主弹窗同档（跟随取到的最大父链 z） | ≤ 9998 | `SearchableSelect.vue:53` `Z_CEILING`，如 `ImportCategoryDialog.vue:49` 的 9997 容器内下拉 |
| 全局对话框/Toast | 9994–9999 | `ImportResultDialog.vue:72`、`ToastContainer.vue:69` 等 |
| 全局加载层 | 10000 | `GlobalLoader.vue:10` |
