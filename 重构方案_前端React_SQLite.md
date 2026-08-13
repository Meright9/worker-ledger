# 打工人小账本 · 前端重构方案（React + TS + Vite + SQLite）

> 决策（2026-08-13）：前端换 React 18 + TypeScript + Vite；数据层换 SQLite（rusqlite）；后端 Rust + Tauri 壳不动；现有 `ledger.json` **全新不迁移**（丢弃）；执行方式 = 先出方案，评审后分阶段实施。
> 本文是实施前的规格文档，不改动任何代码。

## 0. 决策与范围
- 保留：Tauri v2 桌面壳、系统托盘、全局热键 `Cmd/Ctrl+Shift+K`、宏大自然风光插画视觉、1.1.0 五项功能（今日额度、悬浮速记、心情附言+回忆卡、一键多笔、勋章墙）。
- 替换：单文件 `frontend/index.html`（HTML+内嵌 JS）→ Vite + React 组件工程；`std::fs` 整文件 `ledger.json` → SQLite 单文件 `ledger.db`。
- 数据迁移：**完全不迁移**。旧 `ledger.json` 直接丢弃，应用启动不再读取、不做任何备份（`db_init` 只建空库）。用户已明确「旧数据可以不要」。
- 代价：失去「单文件当网页打开」预览（`打工人小账本.html` 不再等同应用，本地预览改 `npm run dev`）。

## 1. 目标架构总览
```
浏览器 WebView  ── invoke ──>  Rust 命令  ──>  SQLite (app_data_dir/ledger.db)
   React 组件                (rusqlite)       表: records / accounts / meta
   状态(Zustand)            托盘 / 热键不变
   主题(CSS)                db_init 建表
```
- 前端只通过 `src/api/db.ts` 抽象读写，不直接碰存储；双实现：`tauriDb`（走 invoke）/ `localDb`（localStorage，供 dev 预览与测试）。
- 聚合统计（月度回忆、streak、桶占比、分类汇总）在 TS 层用 `record_list` 结果计算，复用现逻辑，单一事实源。

## 2. 目录结构
```
tauri-app/
├─ package.json                # 加 react/vite/zustand/vitest 等 + scripts
├─ vite.config.ts              # base:'./', build.outDir:'dist'
├─ tsconfig.json
├─ index.html                  # Vite 入口（仅挂载 #root，非应用本体）
├─ src/                        # 前端工程（新增）
│  ├─ main.tsx
│  ├─ App.tsx
│  ├─ api/db.ts                # 双模数据接口（tauriDb / localDb）
│  ├─ state/                   # Zustand: useLedger / useUI / useSettings
│  ├─ components/
│  │  ├─ Scenery.tsx           # 宏大自然风光固定背景 SVG
│  │  ├─ HomePage.tsx          # 今日额度大卡 + 勋章墙 + 回忆卡 + KPI + 图表
│  │  ├─ AddForm.tsx           # 分类/二级/金额/账户/桶/心情/碎碎念/多笔
│  │  ├─ QuickAddModal.tsx     # 悬浮速记弹窗
│  │  ├─ MedalWall.tsx         # 勋章墙
│  │  ├─ MemoryCard.tsx        # 本月回忆卡
│  │  ├─ TodayHero.tsx         # 今日额度
│  │  ├─ Charts.tsx            # SVG 柱状/折线
│  │  └─ NavBar.tsx
│  └─ styles/                  # theme.css(:root 调色板) + components.css
├─ src-tauri/
│  ├─ Cargo.toml               # + rusqlite(features=["bundled"])
│  ├─ src/main.rs              # 命令重设计 + 托盘/热键（不变）
│  └─ tauri.conf.json         # frontendDist:'../dist', devUrl, before*Command
└─ (旧) frontend/index.html    # 废弃，迁移完成后删除
```

## 3. 数据层（SQLite）
### 3.1 DDL
```sql
CREATE TABLE IF NOT EXISTS records (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  type    TEXT NOT NULL,          -- 'expense' | 'income'
  cat     TEXT NOT NULL,          -- 一级分类
  subcat  TEXT DEFAULT '',
  amount  REAL NOT NULL,
  account TEXT DEFAULT '',
  bucket  TEXT DEFAULT '',        -- 必要/想要/储蓄
  mood    TEXT DEFAULT '',        -- 心情 emoji
  note    TEXT DEFAULT '',        -- 碎碎念
  ts      INTEGER NOT NULL        -- epoch ms
);
CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts);

CREATE TABLE IF NOT EXISTS accounts (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  balance REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);  -- k='streak' | 'version' | 'demo'
```

### 3.2 Rust 命令接口（`src-tauri/src/main.rs`）
```rust
#[tauri::command] fn db_init(app: AppHandle) -> bool { /* open ledger.db, 跑 DDL, 写 meta version；不碰旧 ledger.json */ }
#[tauri::command] fn record_list(range: Option<(i64,i64)>) -> Vec<RecordRow> { /* SELECT ... ORDER BY ts */ }
#[tauri::command] fn record_insert(p: RecordPayload) -> i64 { /* INSERT, 返回 id */ }
#[tauri::command] fn record_update(id: i64, p: RecordPayload) -> bool { }
#[tauri::command] fn record_delete(id: i64) -> bool { }
#[tauri::command] fn account_list() -> Vec<AccountRow> { }
#[tauri::command] fn account_upsert(name: String, balance: f64) -> bool { }
#[tauri::command] fn export_data() -> String { /* 全表 JSON */ }
#[tauri::command] fn import_data(json: String) -> bool { }
```
- `db_init` 在 `setup` 末尾调用一次；连接用 `rusqlite::Connection::open(path)`。
- 托盘 / 热键逻辑**完全不变**（仍 `emit("quick-add")` + 显示窗口）。

### 3.3 迁移说明（完全不迁移）
- 应用启动**不读取、不引用**旧 `ledger.json`；旧数据视为彻底丢弃，不做任何备份或导入。
- `db_init` 只负责 `open ledger.db` + 跑 DDL + 写 `meta(version)`；与旧 `ledger.json` 没有任何代码路径交集。
- 用户侧无需任何导出/备份动作（已确认旧数据可弃）。

## 4. 前端架构
### 4.1 数据访问接口（双模）`src/api/db.ts`
```ts
export interface Db {
  init(): Promise<void>;
  recordList(range?: [number,number]): Promise<Record[]>;
  recordInsert(p: RecordPayload): Promise<number>;
  recordUpdate(id: number, p: RecordPayload): Promise<void>;
  recordDelete(id: number): Promise<void>;
  accountList(): Promise<Account[]>;
  accountUpsert(name: string, balance: number): Promise<void>;
  exportData(): Promise<string>;
  importData(json: string): Promise<void>;
}
// tauriDb: 每个方法 invoke('db_init'|'record_list'|...)，仅当 window.__TAURI__ 存在
// localDb: 同接口，落到 localStorage（key 'ledger'），供 dev/test
export const db: Db = hasTauri() ? tauriDb : localDb;
```

### 4.2 状态管理（Zustand）
- `useLedger`：启动 `db.init()` + `db.recordList()` 载入 `records`；提供 `add/update/del` 动作（调 db 后更新内存）。
- `useUI`：当前页、模态开关（`quickAddOpen`）、当前选中分类。
- `useSettings`：主题、账户列表。

### 4.3 组件 ↔ 功能映射（1.1.0 全覆盖）
| 组件 | 对应功能 |
|---|---|
| `TodayHero` | 今日额度大卡（日额度=月预算/天数，今日剩余=额度−已花） |
| `MedalWall` | 连续记账勋章墙（3天🌱/7天🌿/21天🌳/30天⛰️/100天🏔️/365天🌅，按 streak 点亮） |
| `MemoryCard` | 本月回忆（本月支出、最高频心情、最大单笔、净结余，温和文案） |
| `AddForm` | 记账表单：分类/二级/金额/账户/桶 + 心情 chips + 碎碎念 + 一键多笔（`parseMulti` 逻辑搬入 TS） |
| `QuickAddModal` | 悬浮速记：监听 `window.__TAURI__.event.listen('quick-add')` 打开；浏览器回退 `Cmd/Ctrl+Shift+K` |
| `Charts` | 桶占比柱状（必要/想要/储蓄）、趋势折线（复用现 SVG 渐变配色） |
| `Scenery` | 宏大自然风光固定背景（sunGlow/云/远山三层/云海，照搬现 SVG，封装为组件） |
| `NavBar` | 底部导航 |

### 4.4 主题与插画风
- 把现 `frontend/index.html` 的 `:root` 调色板（cream/mint/pink/sky/sun/ocean/ink/red/green/amber）与柔边半径/阴影原样搬入 `src/styles/theme.css`。
- 圆体字体栈、`prefers-reduced-motion` 保留；`Scenery.tsx` 用 `preserveAspectRatio="xMidYMax slice"` 固定层。

## 5. 构建与配置变更
- `package.json`：加 `react react-dom zustand`、`-D vite @vitejs/plugin-react typescript vitest @testing-library/react @testing-library/jsdom jsdom @tauri-apps/cli @tauri-apps/api`；scripts：`dev=vite`、`build=tsc -b && vite build`、`test=vitest run`、`tauri=tauri`。
- `vite.config.ts`：`base:'./'`、`build.outDir:'dist'`、`server` 允许 tauri 注入。
- `src-tauri/tauri.conf.json`：`frontendDist:'../dist'`、`devUrl:'http://localhost:5173'`、`beforeDevCommand:'npm run dev'`、`beforeBuildCommand:'npm run build'`。
- `src-tauri/Cargo.toml`：`tauri = { features=["tray-icon"] }` 保留；加 `rusqlite = { version="0.32", features=["bundled"] }`；`tauri-plugin-global-shortcut` 保留。
- `.github/workflows/build.yml`：保持 `releaseDraft:false`，`tagName: app-v__VERSION__`（版本我建议升 **2.0.0**，属架构级变更）。

## 6. 测试策略（Vitest 重写原 64 断言）
- 双模：mock `invoke`（tauriDb 路径）+ localStorage（localDb 路径），沿用现 jsdom 双模思路。
- 覆盖点（对应原 opt 51 / tauri 13）：
  - 渲染首页、今日额度有预算显 ¥ / 无预算显 `—`；
  - 心情 emoji 渲染；`parseMulti` 多行拆分 + `catGuess`（午饭→吃饭、地铁→交通、纯数字→其他）；
  - 勋章墙 7 天点亮 ≥2 档；
  - 悬浮速记模态 open/save/close（金额 42）；
  - 记录 CRUD 经 `db`（tauriDb + localDb 双跑）；
  - Rust 单测：DDL 建表、insert/select/delete、`db_init` 幂等。
- 目标：断言数与原 64 持平，分层为组件测试（前端）+ 单元（Rust）。

## 7. 分阶段执行步骤
1. **脚手架**：`npm create vite`(react-ts) + 装依赖；配 `vite.config.ts` / `tsconfig` / `tauri.conf.json`；确认 `npm run dev` 起页、`tauri build` 出空壳。
2. **数据层(Rust)**：加 rusqlite，写 DDL + 8 个命令 + `db_init`；Rust 单测。
3. **数据接口(TS)**：`src/api/db.ts` 双实现 + `hasTauri()` 探测。
4. **状态+主题**：Zustand stores；搬 `theme.css` + `Scenery.tsx`。
5. **UI 搬迁**：`HomePage` / `AddForm` / `QuickAddModal` / `MedalWall` / `MemoryCard` / `Charts` / `NavBar`。
6. **热键/托盘接线**：前端 `listen('quick-add')` 开 `QuickAddModal`。
7. **测试**：Vitest 重写双模 64 断言 + Rust 单测，全绿。
8. **版本+发布**：版本 1.1.0→2.0.0（三处），删旧 `frontend/index.html`；推 main → tauri-action 构建 Windows+macOS → 自动发布 `app-v2.0.0`。
9. **收尾**：更新 `tauri-cloud-build` 技能补 SQLite/React 要点；清理 `_monitor*.mjs` 临时文件；提醒 Revoke PAT（若再用）。

## 8. 风险与缓解
- **失去单文件预览**：本地预览改 `npm run dev`；可接受。
- **旧数据完全丢弃**：不读取、不备份、不导入（`db_init` 只建空库）；用户已确认旧数据可弃。
- **测试重写量**：分阶段第 7 步集中做，双模保真。
- **SQLite 体积**：rusqlite bundled 约 +数 MB，桌面应用可接受。
- **无本地 Rust 工具链**：Rust 改动仍需靠 CI 编译（每轮 5–15 分钟）；动手前先查 `docs.rs` 对应版本 API（见 `tauri-cloud-build` 技能坑 10），减少往返。
- **React 构建引入新依赖/包体**：用 Vite 生产构建 + Tauri 压缩，最终安装包仍小。

## 9. 版本与发布
- 版本号建议 **2.0.0**（架构级变更），同步改 `tauri.conf.json` / `Cargo.toml` / `package.json`。
- tag `app-v2.0.0`，releaseName「打工人小账本 v2.0.0」；`releaseDraft:false` 自动发布。
- 产物：Windows `x64-setup.exe` / `x64_en-US.msi`、macOS `aarch64.dmg` / `aarch64.app.tar.gz`。
