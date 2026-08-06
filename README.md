# 打工人小账本 · 桌面版（Tauri）

把原有的单文件网页账本，打包成**真正的桌面应用**：Windows 下是 `.exe` 安装包，macOS 下是 `.dmg`（打开即全屏 App）。数据存在本机应用数据目录下的 `ledger.json`，不再依赖浏览器 localStorage。

## 目录结构

```
tauri-app/
├── package.json              # 前端脚本（tauri cli）
├── src-tauri/                # Rust 后端
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/main.rs           # ledger_load / ledger_save / ledger_export 命令
├── frontend/                 # 网页前端（即原账本 HTML，已接好存储桥）
│   ├── index.html
│   ├── icon.png              # 1024 源图标
│   ├── manifest.webmanifest / sw.js / icon.svg（PWA 用，桌面端无害）
└── .github/workflows/build.yml   # 云端自动出 exe 与 dmg
```

## 方式一：云端一键出包（推荐，无需本机装 Rust、无需 Mac）

1. 把本 `tauri-app/` 目录内容作为**一个 GitHub 仓库**的根目录推送（含 `.github/`）。
2. 在仓库 **Settings → Actions → General** 确认工作流有写权限（默认即可）。
3. 推一次代码（或手动在 Actions 页点 `Run workflow`）。
4. 跑完后在仓库 **Releases** 页拿到：
   - Windows：`打工人小账本_x.x.x_x64_en-US.msi` 与 `.exe` 安装包
   - macOS：`.dmg`（Apple Silicon / Intel 按 runner 架构出）

> 首次构建会拉取 Rust 依赖，约几分钟。Windows 包在 `windows-latest` 出，macOS 包在 `macos-latest` 出，两份都在同一个 Release 里。

## 方式二：本机本地编译

### Windows
1. 安装 [Rust](https://rustup.rs/) + **Microsoft C++ 生成工具**（VS Build Tools，勾“使用 C++ 的桌面开发”）+ WebView2（Win11 自带）。
2. `npm install`
3. `npm run tauri:build` → 产物在 `src-tauri/target/release/bundle/`。

### macOS（出 .app / .dmg）
1. 安装 Rust：`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. `npm install`
3. `npm run tauri:build`

## 数据在哪

- 账本主数据：`{应用数据目录}/ledger.json`
  - Windows：`%APPDATA%\com.worker.ledger\ledger.json`
  - macOS：`~/Library/Application Support/com.worker.ledger/ledger.json`
- 导出文件：`{应用数据目录}/exports/`（点“导出 JSON/CSV/TXT”后落在那里，并提示完整路径）
- 备份/迁移：用页面里的「导出 JSON」拿到文件，换机后用「导入恢复」。

## 备注

- 桌面端不需要 PWA 的 Service Worker / manifest，但保留它们对网页版无害。
- macOS 未签名包首次打开会报“无法验证开发者”：右键 → 打开，或在终端 `xattr -cr /Applications/打工人小账本.app` 后重试。要彻底去除提示需配置 Apple 签名/公证（workflow 里已留好 secret 位）。
- 窗口标题“小账本”，包名 `com.worker.ledger`。
