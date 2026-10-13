# 本地构建指南

[首页](README.zh-CN.md) · [English](build-guide.md) · [开发者指南](developer-guide.zh-CN.md)

## 准备环境

使用 Node.js 24、npm、Git、GNU Make 和 Bash。解析器与原生存储需要 Go，版本以 `native/parser/go.mod`、`native/storage/go.mod` 为准，无需 Rust 或 Python。Windows 使用 Git Bash、GNU Make 和 x64 Node.js；移动端额外需要 Android Studio 或 Xcode。

```sh
make install
cp .env.example .env.local
make help
```

NAV 随应用提供。建筑模型不是启动必需项；本地模型放在 `.local/official/maps/<map>/<map>.glb`。若要下载资源，先在 `.env.local` 配置自己的 `VITE_OSS_BASE_URL`，再执行 `make resources`；仓库不提供默认下载源。

## 日常开发

| 目的 | 命令 |
| --- | --- |
| 桌面开发，带 DevTools | `make desk-dev`（同 `make desktop-dev`） |
| 构建宿主平台桌面应用 | `make desktop-prepare` |
| 打开已构建应用，不重建 | `make desktop-start` |
| 构建并启动网页与 Node 服务 | `make dev` |
| 独立视图库示例 | `make viewer-example` |

源码变更后重新 prepare；不存在构建产物时 start 无法直接启动。桌面渲染产物在 `build/renderer`，后台任务在 `build/tasks`，应用在 `build/desktop`；网页产物为 `dist`。示例产物在 `build/viewer-example`，需用 HTTP 服务打开。

## 公共服务与构建开关

`.env.production.local` 提供生产公共地址，`.env.desktop.local`、`.env.mobile.local` 分别覆盖。桌面本地资源服务器不承载协作，必须设置绝对 `VITE_BACKEND_BASE_URL`。`CSBOARD_AI_ENABLED=false` 在构建时排除实验助手；`CSBOARD_PARSER_ENGINE=auto` 默认按宿主选择原生或 WASM。

```sh
make build          # 本地网页
make build-remote   # 使用公共后端和资源地址
make workers-build # 仅打包 Workers，不部署
```

`VITE_*` 是前端可见配置，不要放密钥。Cloudflare OAuth、域名绑定与部署见 [部署指南](../config/cloudflare/README.md)；`make deploy ARGS=--dry-run` 只检查，`make deploy` 会真正部署。移动端使用 `make mobile-prepare` / `mobile-open` / `mobile-build PLATFORM=ios|android`；流程与触控设计见 [移动端说明](mobile.md)。

## 检查与打包

```sh
make test-js TEST=tests/replay-package.test.js
make check
make desktop-check
```

`test-js` 不重建原生程序；依赖原生存储的测试先运行 `make native-build`。`check` 检查版本、架构、行为、网页构建和 Go 解析器。`desktop-check` 构建、检查真实包并使用隔离数据目录启动；`desktop-smoke` 只检查已有包。详见 [测试指南](../tests/README.md)。

| 发行目标 | 命令（在对应系统执行） |
| --- | --- |
| macOS Apple Silicon | `make desktop-build-mac-arm64` |
| Windows amd64 | `make desktop-build-win-x64` |
| 本地 Intel Mac | `make desktop-build-mac-x64` |

发行包不包含本地游戏模型；运行后在资源包界面导入。`make desktop-prepare ARGS=--local-models` 只创建额外测试包，不能代替普通发行包。已安装应用不要求用户安装 Go。

## 版本与 GitHub Actions

`make version` 交互选择 major/minor/patch/自定义；也支持 `BUMP=patch` 或 `VERSION=x.y.z`，只同步版本，不提交或打标签。按功能提交后，最后单独整理面向用户的更新说明与版本，再创建 `vX.Y.Z` 标签；标签、package/lockfile 与 changelog 必须一致。

PR 和 main/master 推送运行 Checks：行为与网页、独立消费者构建，以及 macOS/Windows 真实打包启动。Release 由版本标签或手动选择已有标签触发，构建 macOS ARM、Windows x64、Android，上传到同一个草稿 Release。Mobile preview 只手动运行；Intel Mac/iOS 不参加正式发行构建。

公开服务地址使用仓库 Actions variables `VITE_BACKEND_BASE_URL`、`VITE_OSS_BASE_URL`。默认使用内置 `GITHUB_TOKEN`；发布前检查草稿和安装结果。免费 ad-hoc 签名不等于 Apple 公证，Windows 安装包也未签名；这属于发行环境，不能用改运行代码替代发行签名。

## 资源与维护

原始 Demo、VPK、GLB 和工具输出仅放 `.local`，不要提交。`make nav-data` 从本地 NAV 更新已提交地面数据；`make nav-labels` 编辑点位，`make map-places` 导入游戏区域。预设数据放 [docs/presets](presets/README.md)，提示词放 [docs/ai](ai/README.md)。

### 预发布版本

通过 `make version VERSION=2.0.0-alpha.1` 开始预发布，通过 `make version BUMP=prerelease` 增加序号；交互菜单也提供增加预发布序号的选项。支持 `alpha`、`beta`、`rc`，均带数字序号。最后的文档与版本提交为 `release: v2.0.0-alpha.1`，再创建同名标签。

`package.json` 是应用版本与 `mobileBuildNumber` 的来源。开始预发布后使用独立的原生构建计数器：版本变化时递增，重复同步不会递增。Android 保留完整版本名，iOS 的展示版本使用数字核心，二者使用相同构建编号。

Release Actions 为预发布标签创建带 Pre-release 标记的草稿。桌面自动更新仍只选择正式版；预览安装包在对应 release 页面手动下载。独立视图库目前为实验性工作区包，尚未发布到 npm。
