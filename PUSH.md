# 推 GitHub → 出 exe / dmg 分步说明

本目录已是一个 git 仓库（分支 `main`，首提交已完成）。下面的命令在 **本机终端**（安装过 Git）里执行，
把仓库推到 GitHub，由 GitHub Actions 自动编译出 Windows 安装包和 macOS 安装包。

---

## 0. 前置条件
- 有一个 GitHub 账号，并新建一个**空仓库**（不要勾选 README/.gitignore，保持空）。
- 本机已装 Git（Windows 装 Git for Windows 即可）。
- （可选）想让 GitHub 把提交正确归到你名下，先把提交作者改成你的 GitHub 邮箱（见第 2 步）。

## 1. 关联远程仓库
把下面 URL 换成你自己的仓库地址（HTTPS 或 SSH 二选一）：
```bash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
# 或用 SSH：git remote add origin git@github.com:<你的用户名>/<仓库名>.git
```

## 2. （可选）修正提交作者，让 GitHub 正确归因
当前本地提交用的是占位身份。推之前改成你的 GitHub 邮箱即可（改完这一步再 push）：
```bash
git config user.email "你的GitHub邮箱@example.com"
git config user.name "你的GitHub用户名"
git commit --amend --reset-author --no-edit
```

## 3. 推送代码 + 打 tag 触发构建
打 `app-v*` 开头的 tag 才会触发 CI 出安装包（`build.yml` 监听 tag）：
```bash
git push -u origin main --follow-tags
git tag app-v1.0.0
git push origin app-v1.0.0
```
推送 tag 后，GitHub 的 **Actions** 标签页会出现一次构建（Windows + macOS 两台机器并行），
通常 5–15 分钟完成。

## 4. 下载安装包
1. 进仓库 **Releases** 页面（构建脚本 `releaseDraft: true`，会自动建一个草稿 Release）。
2. 把草稿 Release **发布（Publish）** 一下。
3. 在产物（Assets）里下载：
   - Windows：`打工人小账本_x.x.x_x64_en-US.msi` 或 `.exe` 安装包
   - macOS：`打工人小账本_x.x.x_x64.dmg`
4. 安装：Windows 双击 `.exe`/`.msi`；macOS 打开 `.dmg` 把 App 拖进「应用程序」。

## 5. 以后怎么更新
改完代码后：
```bash
git add -A
git commit -m "你的改动说明"
git push
git tag app-v1.0.1   # 版本号递增
git push origin app-v1.0.1
```
新 tag 会自动触发新一轮构建，去 Releases 下载新版即可。

---

## 本地直接构建（不依赖 GitHub，需自备环境）
- **Windows 出 exe/msi**：本机装 [Rust](https://rustup.rs/) + [Visual Studio 生成工具（含 C++ 桌面开发）](https://visualstudio.microsoft.com/zh-hans/downloads/)，然后：
  ```bash
  npm install
  npm run tauri:build
  ```
  产物在 `src-tauri/target/release/bundle/`。
- **macOS 出 dmg**：在 Mac 上同样装 Rust + Xcode 命令行工具，执行 `npm run tauri:build`。
  - 无 Apple 开发者证书时出的是**未签名** App，首次打开右键「打开」放行（系统会提示「无法验证开发者」）。

## 数据存哪
- Windows：`%APPDATA%\com.worker.ledger\ledger.json`
- macOS：`~/Library/Application Support/com.worker.ledger/ledger.json`
- 导出文件在同级的 `exports/` 目录。纯本地文件，不上云。

## 常见问题
- **Windows SmartScreen 拦截**：未签名 exe 首次运行会被拦，点「更多信息 → 仍要运行」即可。
- **Mac 提示已损坏/无法打开**：右键 `打工人小账本.app` → 打开，放行一次。
- **构建失败先看 Actions 日志**：多半是 Rust 依赖没拉全（网络问题）或 `tauri icon` 没生成图标（已用 `frontend/icon.png` 重新生成，正常不会缺）。
- **想自己签名 Mac**：在 `build.yml` 里取消注释 Apple 签名相关的 secrets 行，并在仓库 Settings → Secrets 填入证书与密码。
