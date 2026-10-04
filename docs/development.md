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
| Demo 解析、回合数据、自制录像与 HUD | `src/demo/`、`src/demoCache.js` |
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

`main.jsx` 与 `ThreeBoard.jsx` 仍承担状态编排和场景生命周期，拆分时需核对闭包、回调与资源清理。分析查询属于 `src/analysis/`，序列化用例属于 `src/app/`；根目录 `shared/` 只保存跨进程、客户端与服务端共用的协议和编码。

## 功能边界与后续开发

依赖方向为 **界面 → 功能用例 → 业务核心**，驱动实现功能用例需要的端口，启动入口负责选择实现。业务核心不依赖 React、3D 场景或平台；功能用例接收缓存、计算、保存等接口，React Hook 负责把用例状态接到界面。

| 边界 | 当前示例 | 约束 |
| --- | --- | --- |
| 业务核心 | 道具相似计算、回合事件、存档及帧模型 | 可在不同宿主执行，不读取界面和物理存储 |
| 功能用例 | `demo/library.js`、`analysis/queryService.js`、`utility/recordedThrowRepository.js` | 端口注入，管理资料读取、有效性、共享请求与取消 |
| 界面适配 | `useDemoLibrary`、`useRecordedUtilityActions` | 管理 UI 状态与交互生命周期，场景/保存/草稿回调由页面注入 |
| 平台驱动 | `platform/drivers/`、`platform/hosts/` | 不导入 React、JSX 或渲染器，复用纯业务计算 |
| 组装与协议 | `platform/assembly/`、根目录 `shared/` | 前者选择实现；后者只定义跨边界协议，不反向依赖页面 |

新增功能先确定所属模块及用例入口，再连接界面；不要继续向 `main.jsx` 添加资料读取、缓存、取消和重试循环。UI 和 AI 工具应复用同一个业务命令入口及权限、撤销规则，不各写一份编辑逻辑。跨进程数据结构、类型化数组编码和记录键在 `shared/` 维护，构建配置与地图视图配置分开。

Demo 目录用例检查缓存完整性，界面适配保证最新选择生效。道具资料服务让预览与保存共享请求和有限缓存，取消单个消费者不会中断其他消费者，上下文失效则统一释放；保存草稿拥有独立身份，不能修改缓存中的预览资料。

运行 `make lint` 检查实际 AST 导入依赖及物理存储访问。构建与 CI 同样执行该检查：业务不得导入具体驱动，驱动不得依赖 UI，共享协议不得依赖页面，列出的业务核心入口连同传递依赖不得依赖平台或渲染器。增加独立核心入口时同步维护检查脚本中的 `domainRoots`。

`main.jsx` 和 `ThreeBoard.jsx` 仍有历史编排，后续按存档、房间、演播、场景交互分别迁出；每次迁移应明确状态归属、过期结果处理和释放责任，而非仅按文件大小拆分。当前没有统一命令总线和工作流引擎，等出现多个真实调用方再引入，避免增加空转抽象。

## 数据与运行约定

### 平台与解析

- 页面业务通过 `src/platform/` 的能力接口访问解析、计算、存储与资源。桌面调用 Go 程序及 Electron 后台进程，浏览器使用 Worker、Go WASM 与 IndexedDB；桌面服务失败不得静默切换存储后端。
- 解析器 fork 与提交固定在 `native/parser/source.json`，构建时拉取至 `.local/demoparser/demoinfocs`。修改 fork 后先提交并推送，再更新固定提交；本地试改可运行 `node scripts/build-go-parser.js --local-source`，该选项不用于 CI 或正式发布。
- 输出结构改变时同步缓存 schema。切 Demo、回合或取消后，旧异步结果不能覆盖新状态；回合快照、轨迹及烟火数据一起发布。
- 线程预算与内存准入不保证满核，也不是操作系统硬内存限制。实体状态、事件和烟火日志有顺序依赖，不能任意按 tick 并行解码。浏览器仍受后台调度与 WASM 内存限制。
- 播放按单调时钟和记录 tickRate 推进，不按回调次数或轨迹点数计时。演播和回合浏览复用渲染器，但保留各自的数据源与播放状态。

### 宿主与驱动

采用端口与适配器设计：业务依赖能力契约，启动入口选择实现。这里的驱动是应用层适配器，不是操作系统内核驱动。

| 组件 | 职责 | 目录 |
| --- | --- | --- |
| Host 宿主 | 文件选择、窗口生命周期、设备能力与宿主服务 | `src/platform/hosts/` |
| Parser 解析驱动 | Demo 解析、进度、取消及并发预算 | `src/platform/drivers/parser/` |
| Storage 存储驱动 | Demo 缓存、应用记录、小型偏好三个端口 | `src/platform/drivers/storage/` |
| Compute 计算驱动 | 分析及序列化任务、取消、存储读取 | `src/platform/drivers/compute/` |
| Assembly 组装入口 | 选择并注入驱动，初始化后加载同一套 UI | `src/platform/assembly/` |

契约在 `contracts.js`，纯组装与校验在 `createPlatform.js`。工厂统一命名为 `create…Host` 或 `create…Driver`；实现 ID 使用小写短横线，仅用于诊断。UI 使用 `capabilities` 判断能力，不通过 `electron`、`native` 等名字猜测行为。

| 运行组合 | 宿主 ID | 解析驱动 ID | 存储驱动 ID | 计算驱动 ID |
| --- | --- | --- | --- | --- |
| 浏览器 | `browser` | `go-wasm` | `browser-storage` | `web-worker` |
| 手机浏览器 | `browser` | `disabled` | `browser-storage` | `web-worker`，禁用 Demo 分析 |
| 桌面默认 | `electron` | `go-process` | `sqlite-storage` | `electron-worker` |
| 桌面 WASM | `electron` | `go-wasm` | `sqlite-storage` | `electron-worker` |
| 原生移动端默认 | `capacitor` | `go-embedded` | `sqlite-storage` | `web-worker` |
| 原生移动端 WASM | `capacitor` | `go-wasm` | `sqlite-storage` | `web-worker` |

- `configurePlatform({ host, parser, storage, compute })` 在启动时注入驱动；会话启动后不热切换存储。默认选择集中在 `assembly/default.js`，Capacitor 桥接集中在 `assembly/capacitor.js`。`CSBOARD_PARSER_ENGINE=auto|wasm|native` 仍作为构建选择项，映射到具体驱动，不决定存储或计算后端。
- 浏览器存储组合使用 IndexedDB 保存记录和缓存、localStorage 保存偏好；原生组合使用 SQLite 保存记录和偏好，并用文件保存大型缓存。业务通过 `getPlatform()` 与 `preferences` 门面访问，只有驱动和迁移代码接触物理存储。
- 原生偏好在 UI 挂载前读取，之后同步读取内存镜像，串行合并异步写入；失败保留脏版本，`preferences.flush()` 可等待或重试落盘，宿主进入后台时自动调用。迁移保留旧来源；大型旧记录仍由各自迁移流程确认后清理。
- `cacheOwner` 声明解析或计算驱动直接访问的存储宿主。进程解析驱动会自行写入宿主缓存，必须匹配存储 owner；WASM 和嵌入解析通过注入的缓存端口写入。需要真正切换到独立存储时，先让进程协议返回结果而非自行保存，不可仅替换名字。
- 增加实现时添加驱动工厂、满足对应端口并在组装入口选择；业务层不增加宿主分支。可见性订阅只取 `getHost()`，不启动数据库或解析器。

### 自制录像与共用回放

- 解析端口的 `kind` 为 `match` 或 `recording`；前者构建对局回合和分析数据，后者按文件实际 tick 范围建立片段，不依赖回合结束或固定阵容，也不生成分析数据。两者复用事件、人物、投掷物及烟火读取与同一播放器。
- `recordings.js` 定义非标准录像识别策略。已解码的客户端录制标记、缺少可播放回合、未出现标准阵容会产生 `non_standard_demo` 错误；传输必须保留错误 code/reason，损坏文件不能统一认定为非标准录像。
- `useCustomRecordings` 管理加载、来源释放和过期结果；失败批次跳转时转移文件句柄所有权，原批次不能再释放或重试该句柄。录像缓存使用独立身份前缀和 kind，不进入对局目录或数据分析。
- `ReplayTransportControls` 共用播放、拖动与片段选择；`playbackSessions` 保存回合浏览、自制录像和演播各自的进度、视角。自制录像隐藏对局 HUD，不裁剪人物数量；BOT 使用独立身份，人员加入、离开与传送不插值为虚假路径。
- Source 2 头部记录 FileInfo 偏移，尾部长度取决于 varint 和 protobuf；不能用偏移加固定长度验证整份文件。

### 存储与协作

- 道具、存档和助手会话通过平台 records 保存；小型偏好通过 preferences 端口保存。迁移先成功写入副本，再清理允许清理的旧记录；原生迁移保留旧 IndexedDB，较新的用户写入优先。
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

各端的驱动组合与替换约束见上文“宿主与驱动”。

开发需要 GNU Make、Git、Node.js 和 Go，版本要求以项目配置和两个 Go 模块为准。原生组件使用纯 Go，安装后的用户无需安装开发工具链。

```sh
make install
make dev                 # 构建并启动本地 HTTP/WebSocket 服务
make desktop-prepare     # 构建当前平台的目录应用
make desktop-start       # 打开已构建应用，源码变化后需重新 prepare
```

- 网页输出 `dist/`；桌面页面、后台任务和安装包分别输出 `build/renderer/`、`build/tasks/`、`build/desktop/`。构建配置在 `config/build/`，本地包配置在 `config/electron/`，不要手工复制领域源码到安装包。
- 正式包仅支持 macOS arm64、macOS x64、Windows x64，命令分别为 `make desktop-build-mac-arm64`、`make desktop-build-mac-x64`、`make desktop-build-win-x64`，在对应系统运行。Electron 与 Go 目标必须一致；macOS 默认使用免费 ad-hoc 签名，不需要付费证书。
- 正式包不携带 GLB，也不自动下载模型。资源清单在 `src/resources/catalog.json`；开发可读取 `.local/official/maps`，`make desktop-prepare ARGS=--local-models` 才将本地模型带入 `build/desktop-local/`。导入资源经过 SVG/GLB 校验后生效，目前需重新加载应用。
- 所有开发命令统一使用 Make；`make help` 列出安装、构建、运行、版本、资源与部署命令。Windows 使用 Git Bash 和 GNU Make（可用 `choco install make` 安装），CI 自动准备。附加参数用 `ARGS="..."` 传递。Cloudflare 的 OAuth、域名绑定、允许列表与发布检查统一见部署指南，不在多处维护操作细节。
- `.github/workflows/checks.yml` 运行行为测试、原生模块检查、前端构建与 Wrangler dry-run。测试应执行业务模块并断言输出或持久化结果，不能只扫描源码字符串。
- `.github/workflows/release.yml` 校验 tag、package、lockfile 与发布说明后，并行构建三个桌面目标和两个移动目标；移动构建复用 `mobile-build.yml`，版本 tag 不再单独触发移动工作流。全部成功后统一上传五个包与桌面／移动 SHA-256 至草稿 Release。确认安装后手动发布；上传前校验 macOS 应用与原生程序的签名完整性；ad-hoc 签名不等同于 Developer ID 或 Apple 公证。
- 先提交版本文件，再创建对应 tag。失败 tag 仍指向原提交，重跑不会带上后续修复；不要移动已公开版本 tag。Changelog 只维护用户变化，第三方许可另按来源更新。

### 统一版本入口

`package.json` 是应用版本的唯一来源：

```sh
make version                      # 选择大版本、次版本、补丁版本加一或输入自定义版本
make version BUMP=patch            # 非交互：major / minor / patch
make version VERSION=1.20.1        # 非交互：指定完整版本
make version-sync                  # 仅同步，版本不递增
make version-check                 # 仅检查，不写文件
```

升版前校验所有目标文件，再同步 package、lockfile、Android 与 iOS；不创建提交或标签。构建号按 `major × 1000000 + minor × 1000 + patch` 计算，仅支持正式三段版本，各段小于 1000。

- 手动改过 `package.json` 时运行 `make version-sync`，不要手改原生版本字段。CI 使用 `make version-check` 提前检查；移动端命令使用同一个同步模块。
- 更新日志仍需人工归纳，在三语 Changelog 中维护对应版本章节。提交版本文件与更新日志后，再创建 `v版本号` 标签；Release 正文取根目录英文 Changelog 的对应章节，不取提交信息。
- 不要从错误标签反向覆盖应用版本，也不要关闭发布校验；已有失败标签不随 main 的修改自动更新。

### 移动端命令

```sh
make mobile-prepare PLATFORM=ios
make mobile-open PLATFORM=ios
make mobile-build PLATFORM=ios                  # 默认实体设备构建
make mobile-build PLATFORM=ios ARGS=--simulator
make mobile-build PLATFORM=android
```

解析器选择继续使用环境变量 `CSBOARD_PARSER_ENGINE=native|wasm`。
构建通过不能替代运行时验证。按改动选择解析取消与旧缓存、迁移与失败写入、双客户端同步、多楼层放置或备份恢复等场景；使用独立数据目录，避免影响个人存档。运行记录留在本地或 CI 产物，不追加到本页。

## 尚未实现的设计

以下是开发待办，不属于现有功能，也不进入 AI 可读资料：

- 人员增加职责与目标，帧计划保存唯一 C4 携带者引用；删除和复制时统一校验引用。
- 道具责任人采用软绑定，不自动移动人员或轨迹；统一计划时钟保存释放延迟，仅有真实飞行时间时计算精确同步。
- 帧增加阶段标签、步骤、起始帧与条件分支；条件由用户或房主确认，不让模型凭静态视图自动判断战局。
- 线条增加标签与箭头，明确为示意；所有新增字段同时覆盖 UI、序列化、撤销、Yjs、帧复制、存档兼容与播放，再开放工具。
