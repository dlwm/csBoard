# 开发导览

本页保留代码入口、数据约定和构建发布说明。使用说明见 [README](README.zh-CN.md)，部署细节见 [Cloudflare 指南](../config/cloudflare/README.md)；历史修复过程和本地验证日志不作为维护文档保存。

## 文档入口

| 内容 | 维护位置 |
| --- | --- |
| 使用说明与功能限制 | [中文 README](README.zh-CN.md)、[English](../README.md)、[Русский](README.ru-RU.md) |
| 面向用户的版本变化 | [中文 Changelog](CHANGELOG.zh-CN.md)、[English](../CHANGELOG.md)、[Русский](CHANGELOG.ru-RU.md) |
| AI 提示词、参考资料与贡献方式 | [ai/README.md](ai/README.md) |
| 预设道具与存档 | [presets/README.md](presets/README.md)，与 AI 目录并列 |
| 资源包使用 | [中文](ai/references/resource-packs.zh.md)、[English](ai/references/resource-packs.en.md)、[Русский](ai/references/resource-packs.ru.md) |
| Cloudflare 配置与部署 | [config/cloudflare/README.md](../config/cloudflare/README.md) |
| 许可范围与第三方声明 | [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

更新日志只记录用户能感知的变化，不加入源码路径、目录整理或内部模块拆分。AI 可读资料由 `docs/ai/catalog.json` 显式注册，不会自动读取开发、部署、许可或设计文档。

## 代码入口

| 功能 | 主要位置 |
| --- | --- |
| 页面组装与跨功能编排 | `src/main.jsx` |
| Demo 解析、回合数据与 HUD | `src/demo/`、`src/demoCache.js` |
| 数据分析 | `src/analysis/` |
| 存档、帧与 Yjs 房间同步 | `src/collaboration/` |
| 道具记录、导入与回放 | `src/utility/` |
| 场景、相机、地图与效果 | `src/three/` |
| 共享界面与交互 | `src/components/`、`src/hooks/` |
| 持久化、资源与平台服务 | `src/app/`、`src/platform/` |
| 助手会话、记忆、压缩与工作流 | `src/ai/` |
| 桌面 IPC、后台任务与凭据 | `electron/` |
| Go 解析器与 SQLite 存储 | `native/parser/`、`native/storage/` |
| HTTP、AI 代理与协作服务端 | `server/` |
| 客户端与服务端共用协议及校验 | `shared/` |

`main.jsx` 与 `ThreeBoard.jsx` 仍承担状态编排和场景生命周期，拆分时需核对闭包、回调与资源清理。`src/platform/shared/` 是页面业务共用逻辑，与根目录的 `shared/` 职责不同。

## 数据与运行约定

### 平台与解析

- 页面业务通过 `src/platform/` 的能力接口访问解析、计算、存储与资源。桌面调用 Go 程序及 Electron 后台进程，浏览器使用 Worker、Go WASM 与 IndexedDB；桌面服务失败不得静默切换存储后端。
- 解析器 fork 与提交固定在 `native/parser/source.json`，构建时拉取至 `.local/demoparser/demoinfocs`。修改 fork 后先提交并推送，再更新固定提交；本地试改可运行 `node scripts/build-go-parser.js --local-source`，该选项不用于 CI 或正式发布。
- 输出结构改变时同步缓存 schema。切 Demo、回合或取消后，旧异步结果不能覆盖新状态；回合快照、轨迹及烟火数据一起发布。
- 线程预算与内存准入不保证满核，也不是操作系统硬内存限制。实体状态、事件和烟火日志有顺序依赖，不能任意按 tick 并行解码。浏览器仍受后台调度与 WASM 内存限制。
- 播放按单调时钟和记录 tickRate 推进，不按回调次数或轨迹点数计时。演播和回合浏览复用渲染器，但保留各自的数据源与播放状态。

### 存储与协作

- 道具、存档和助手会话通过平台 records 保存；localStorage 只保留小型偏好。迁移先成功写入副本，再清理允许清理的旧记录；原生迁移保留旧 IndexedDB，较新的用户写入优先。
- 桌面 SQLite 与校验和命名的 gzip 载荷位于应用用户目录 `native-data/`。保留类型化数组编码、事务与共享 blob 引用，缓存清理不得删除用户记录。
- 写入失败后不能更新比较基线或自动重放可能已提交的事务。备份与恢复使用维护入口，不能复制运行中的 SQLite 主文件代替完整备份；恢复后保留此前目录。
- 存档命令由 `archiveCommands` / `archiveRestore` 管理，帧由 `frameSession` 管理，房间同步集中在 `roomFrames` / `roomWorkspace`。远端更新不回发；地图、机位、活动帧和场景恢复作为完整事务发布。
- 入房不能覆盖此前本地会话；访客不能用本地存档覆盖共享房间。退出时恢复本地帧并释放监听。目录排序仅更新目录索引，不重写带体素的整份存档。
- 演播的 Yjs 数据只传控制与载荷摘要，HTTP 传分块载荷并校验。协议变化需前后端一起更新，访客持久化成功后才报告下载完成。

### 坐标与渲染

- Source、Three.js、雷达与烟雾字节轴使用不同坐标约定，复用已有转换函数，不能在调用方重复换轴。烟雾字节轴映射见 `smokeVoxelVolume.js`。
- 楼层分界集中在 `src/data/navTopView.js`，2D 与 3D 保持一致；多楼层放置不能只按 XY 距离选择。相机范围需在 GLB 加载前利用内置 NAV 初始化。
- Demo 烟雾体素和真实火焰记录不依赖 GLB。保存、协作与导入应保留形状及紧凑编码；缺真实数据时的默认效果只能称为示意。
- 回放倒退、切回合及片段中途开始时重新计算效果，不永久改写原始体素。渲染对象、材质、纹理与监听在销毁时释放；高频相机和指针更新保持局部，不驱动整页重渲染。

### 操作助手

- 构建开关：普通构建默认包含，可通过 `CSBOARD_AI_ENABLED=false` 排除；Cloudflare 默认排除，部署配置用 `CF_AI_ENABLED=true` 开启。重建后生效，详见部署指南。

- 工具定义与执行在 `src/collaboration/tacticalTools.js`，对话循环在 `src/ai/conversation.js`。修改通过现有领域命令和画布历史提交；变更前校验 revision，等待确认后再次校验。地图、帧、存档、房间或页面切换取消旧计划。
- 系统与压缩提示词在 `docs/ai/prompts/`；参考资料在 `docs/ai/references/`，按清单注册并分章节读取。添加内容的方法见 [AI 贡献指南](ai/README.md)，不要开放任意路径读取。
- 会话导入只读取数据，不执行工具或恢复画布。原始聊天保留供检索，压缩阈值是文本字符预算，不是精确 token 数。截图不持久化；会话、密钥不进入 Yjs 或战术存档。
- 工具显示名称在 `src/ai/toolLabels.js` 国际化，协议与工作流继续使用稳定英文 ID。工作流权限同时约束工具声明与实际执行，取消或失败后不自动继续后续步骤。
- 截图使用临时视角并隐藏建筑模型，不改变用户镜头。NAV 连通、近似地名与截图只能提供几何参考，不能证明真实视线、掩体或游戏可行走性。
- 桌面凭据由主进程加密保存；浏览器密钥仅留内存，经共用代理发送。服务商预设在 `shared/ai-providers.js`，自定义地址仍受服务端允许列表约束；配置说明见部署指南。

## 构建与发布

开发需要 Git、Node.js 和 Go，版本要求以项目配置和两个 Go 模块为准。原生组件使用纯 Go，安装后的用户无需安装开发工具链。

```sh
npm ci
npm run dev                 # 构建并启动本地 HTTP/WebSocket 服务
npm run desktop:prepare     # 构建当前平台的目录应用
npm run desktop:start       # 打开已构建应用，源码变化后需重新 prepare
```

- 网页输出 `dist/`；桌面页面、后台任务和安装包分别输出 `build/renderer/`、`build/tasks/`、`build/desktop/`。构建配置在 `config/build/`，本地包配置在 `config/electron/`，不要手工复制领域源码到安装包。
- 正式包仅支持 macOS arm64、macOS x64、Windows x64，命令分别为 `desktop:build:mac:arm64`、`desktop:build:mac:x64`、`desktop:build:win:x64`，在对应系统运行。Electron 与 Go 目标必须一致；macOS 默认使用免费 ad-hoc 签名，不需要付费证书。
- 正式包不携带 GLB，也不自动下载模型。资源清单在 `src/resources/catalog.json`；开发可读取 `.local/official/maps`，`desktop:prepare -- --local-models` 才将本地模型带入 `build/desktop-local/`。导入资源经过 SVG/GLB 校验后生效，目前需重新加载应用。
- npm 是常用入口；`make help` 列出资源准备、Workers dry-run 与 Docker 命令。Cloudflare 的 OAuth、域名绑定、允许列表与发布检查统一见部署指南，不在多处维护操作细节。
- `.github/workflows/checks.yml` 运行行为测试、原生模块检查、前端构建与 Wrangler dry-run。测试应执行业务模块并断言输出或持久化结果，不能只扫描源码字符串。
- `.github/workflows/desktop-release.yml` 校验 tag、package、lockfile 与三语 changelog 后构建三个目标，检查实际包内容，全部成功才上传安装包和 SHA-256 至草稿 Release。确认安装后手动发布；上传前校验 macOS 应用与原生程序的签名完整性；ad-hoc 签名不等同于 Developer ID 或 Apple 公证。
- 先提交版本文件，再创建对应 tag。失败 tag 仍指向原提交，重跑不会带上后续修复；不要移动已公开版本 tag。Changelog 只维护用户变化，第三方许可另按来源更新。

构建通过不能替代运行时验证。按改动选择解析取消与旧缓存、迁移与失败写入、双客户端同步、多楼层放置或备份恢复等场景；使用独立数据目录，避免影响个人存档。运行记录留在本地或 CI 产物，不追加到本页。

## 尚未实现的设计

以下是开发待办，不属于现有功能，也不进入 AI 可读资料：

- 人员增加职责与目标，帧计划保存唯一 C4 携带者引用；删除和复制时统一校验引用。
- 道具责任人采用软绑定，不自动移动人员或轨迹；统一计划时钟保存释放延迟，仅有真实飞行时间时计算精确同步。
- 帧增加阶段标签、步骤、起始帧与条件分支；条件由用户或房主确认，不让模型凭静态视图自动判断战局。
- 线条增加标签与箭头，明确为示意；所有新增字段同时覆盖 UI、序列化、撤销、Yjs、帧复制、存档兼容与播放，再开放工具。
