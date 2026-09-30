# 开发导览

这份文档帮助定位代码和选择验证方式。具体实现原因留在代码注释中，不在各目录重复维护。

## 从哪里开始

源码按职责放在 `src/`、`electron/`、`server/`、`shared/` 和 `native/`；Go 解析与存储分别是 `native/parser/`、`native/storage/` 两个模块。构建配置在 `config/build/`，本地打包配置在 `config/electron/`，容器配置在 `config/docker/`，部署设置与示例在 `config/cloudflare/`。根目录保留包管理、页面入口、Make 命令、项目说明及 `AGENTS.md`。

移动源码与配置时，以项目根路径解析输入和产物；不要让配置目录变成 Vite root 或 Docker 构建上下文。生成产物的路径和解析器运行时 URL 独立于源码位置，当前仍使用 `build/go-parser/`、`build/native/` 和页面内 `go-parser/`。本地 `.local`、IDE 设置和旧构建缓存不因源码整理而清理。

| 要修改的功能 | 主要位置 |
| --- | --- |
| 页面组装、面板切换、跨功能联动 | `src/main.jsx` |
| Demo 批量解析、回合数据、HUD | `src/demo/`、`src/demoWorker.js`、`src/demoCache.js` |
| 分析筛选、数据计算 | `src/analysis/` |
| 协作存档、战术帧、房间同步 | `src/collaboration/` |
| 道具记录、导入、保存转换、回放 | `src/utility/` |
| 场景、相机、地图与道具效果 | `src/three/` |
| 共享界面与通用交互 | `src/components/`、`src/hooks/` |
| 本地持久化、资源包与运行环境 | `src/app/`、`src/platform/` |
| 桌面主进程、资源导入与 IPC | `electron/` |
| Demo 解析器、SQLite 与大数据文件 | `native/parser/`、`native/storage/`、`electron/native-*.js` |
| HTTP 与协作服务端 | `server/` |
| 浏览器与服务端共用的传输协议 | `shared/` |

`main.jsx` 仍负责部分 Demo 会话、表单状态及跨功能编排；`ThreeBoard.jsx` 仍负责场景生命周期和渲染循环。两者不是纯粹的组件拼装文件。

根目录 `shared/` 当前只有演播分块传输协议，供浏览器与 Node／Cloudflare 服务端共同导入；`src/platform/shared/` 则是 Web 与桌面后台共用的页面业务逻辑。两处的共享范围不同。

## 数据与状态

**协作**：`archiveStore` 管理存档列表和顺序写入，`archiveCommands` / `archiveRestore` 处理保存与恢复的数据规则。`frameSession` 管理帧集合和当前帧；`workspaceSession` 管理入房前的本地会话与跨地图恢复。房间监听由 `roomConnection` 管理，Yjs 发布和读取集中在 `roomFrames` / `roomWorkspace`。React hook 负责订阅、生命周期和连接适配。

**Demo**：`useDemoBatchParser` 管理批量任务；`useDemoRoundData` / `roundDataStore` 加载当前回合数据并隔离过期请求；`useDemoViewState` 计算展示所需的派生状态。Demo 缓存使用 `demoCache.js`，不是用户存档的存储入口。`parserRuntime.js` 为 Web Worker 和桌面后台提供独立会话；桌面调用 Go 可执行文件，浏览器调用同一适配层构建的 Go WASM。

**道具**：`useUtilityNotes` 管理记录的加载、迁移与写入，`noteSchema` 处理版本兼容，`mergeUtilityNotes` 处理导入去重，`savedThrow` 转换解析结果，`useUtilityReplayPlayback` 管理回放时序。道具记录和协作存档通过 `app/persistentStore.js` 写入桌面 SQLite 或浏览器 IndexedDB。

**视角演播**：`broadcast/` 保存单个不可编辑的 Demo 时间段，并使用独立持久化记录；Yjs 传房间控制与载荷摘要，HTTP 传分块载荷。区间外只允许保留插值、烟火生命周期等回放上下文；访客必须在完整反序列化并成功写入本地后才显示下载完成。演播复用 Demo 播放与监视器，但不展示比赛比分、击杀、人员装备状态和回合选择；这些仅属于回合浏览界面。两页共用渲染器，但各自保留数据源、回合、时间、主视角、镜头及地图；异步下载或解析完成时不能覆盖未激活页面的播放状态。

演播片段若从烟火生效中途开始，还需保留相交道具的投掷事件、轨迹及必要的投掷前快照，才能点击效果保存道具；`contextStartTick` 只用于关联道具，不改变可播放区间。桌面演播底栏只占画面中栏，与其他菜单一致；栏内左侧放模型选项、右侧放时间轴和播放键。窄桌面窗口将模型选项收进弹出层，避免挤掉时间轴；移动端可分行。监视器切换留在画面上方，须避开右上角指南。

**存档目录**：协作、演播和道具速记各有独立的持久化目录索引，条目内容本身不因拖拽而重写。旧条目或目录引用失效时显示在不可编辑的 Root；同名文件夹按 ID 区分。删除文件夹只删除目录节点，将直属内容移到上一级。

修改异步或同步流程时，重点检查这些已有约定：

- 旧请求不能覆盖较新的用户操作；切换回合后不混用上一回合的数据。
- 旧存储数据只在新副本成功持久化后清理。
- 远端帧更新不回发；房间存档恢复的元数据和帧内容一起发布。
- 镜头属于存档／房间，战术帧只保留可编辑场景内容。

## 验证

容器命令使用 `docker compose -f config/docker/compose.yml`；配置显式保留 `csboard` 项目名与原模型挂载位置。私有部署配置在被 Git 和 Docker 排除的 `config/cloudflare/deploy.env`，`CF_DEPLOY_CONFIG` 仍可指定外部配置。

在项目根目录运行：

```bash
npm ci
npm run native:build
node --test tests/*.test.js
npm run build
make workers-build
```

测试断言应观察公开接口的返回值、持久化结果、事件和任务顺序，不扫描源码变量名、组件名或 shader 片段。可以模拟时钟、硬件预算和外部服务，但应执行实际业务模块。生成 SVG 等产品输出的内容检查仍然有效；材质 uniform 检查不能替代 GPU 画面回归。

原生存储测试启动真实 Go 子进程，使用系统临时目录，结束前等待进程退出；缺少原生组件会直接失败，不再静默跳过。调度／内存测试覆盖并发预算、排队、取消、失败和恢复；发布测试使用模拟 HTTP，不访问 GitHub 或创建 Release。

`checks.yml` 在 PR 和 main/master 推送时运行工作流语法检查、行为测试、原生存储测试、前端构建及真实 Wrangler dry-run。配置是否能构建由实际工具验证；安装包是否混入本地模型由 `scripts/check-desktop-package.js` 检查实际 ASAR 和资源目录，并执行包内原生存储读写，不只检查配置中的排除字符串。

ASAR 读取接口在 Windows 上按系统路径分隔符查找条目；安装包检查应把固定的 `/` 清单转换为本机路径再提取，并将 `listPackage` 的路径统一为 `/` 后检查泄漏。否则 Windows 包即使含有页面入口也会误报缺失。

存档与帧修改还应检查新建、覆盖、切帧和刷新恢复；Demo 修改检查快速切回合及切 Demo；房间同步修改检查两个客户端的加入、切帧、恢复存档和退出。

连接测试使用真实 Yjs 文档与模拟连接，不能替代双客户端网络回归；构建成功也不代表页面交互没有运行时错误。手工测试请使用独立浏览器或 Electron 数据目录，避免影响个人存档。

## 项目经验与行为约定

以下记录来自功能迭代和故障修复，最近核对于 2026-09-22。它不是未来功能清单；路径、常量和实现仍以当前代码为准。修改已确认行为前，说明原因及影响，不要把旧设计当作待修复问题。

Changelog 面向应用用户，记录功能、体验、兼容性、性能和问题修复；源码路径、项目目录整理与内部模块拆分留在开发文档。涉及内部实现的功能变化，应说明用户能感知的结果。

### 重构与运行时错误

- macOS Dock 的应用身份来自 `.app/Contents/Info.plist`。`app.setName` 不会重命名开发运行器 `Electron.app`；`desktop:prepare` 构建 CSBoard 应用包，`desktop:start` 只打开已有包，`desktop:dev` 保留直接运行 Electron 的调试入口。显示名称调整须保留原有 `userData` 路径。

- 过去拆分后出现过 `radarSourceBounds`、`buildDemoGrenadeSegments`、`onPointSelect` 未定义。搬代码时逐项核对闭包变量、import、props、场景回调和清理函数；这些错误可能构建成功后才在特定面板触发。
- `csboardFloorFade` 曾在渲染循环中因材质数据缺失反复报错。`floorFade.js` 对真实 Three.js Material 和 `userData` 的检查是兼容保护，不要当成冗余代码删除。
- hook 拆出去不代表状态隔离。雷达曾每 80ms 更新根组件，导致整页重复渲染；现在轮询放在 `ViewTools` 内的局部组件。高频相机、播放和指针状态尽量不要向全页传播。
- 静态地图的楼层材质补丁在加载时初始化，楼层变化通过共享 uniform 更新；不要恢复为定期遍历整个模型。动态覆盖物仍需要发现新材质。
- 注释重点记录“不这么做会怎样”。避免批量添加无信息量的函数说明，或把大量内部变量装进一个 runtime 对象后就宣称解耦完成。

### 坐标、楼层与相机

- 游戏／NAV 坐标、Three.js 场景坐标、雷达投影和烟雾字节轴不是同一种约定。沿已有转换函数追踪一次，不要在多个调用方分别交换轴或反号。
- 烟雾渲染字节轴映射是场景 **`+B +A +C`**，见 `smokeVoxelVolume.js`。解码和场景转换要一起检查，避免重复交换。
- 2D 雷达使用 NAV 顶视图，不是把任意长宽比截图拉伸到正方形。上下层共享正方形世界范围与缩放；高度深浅来自 NAV 高度，不是水平位置。
- 楼层分界集中在 `data/navTopView.js`，2D 与 3D 必须一致。Nuke、Train、Vertigo 都应回归；Train 曾因分界取值把主地面错误归到下层。
- Anubis 曾因模型底部无意义几何影响包围盒，出现旋转中心过低。改相机中心时先核查有效地面、NAV 与模型范围，不要只调整 Y 偏移或正负号。
- GLB 尚在下载时也要按已内置的 NAV 尺寸设置相机最大距离和远裁剪面；不能让初始固定值限制大地图缩放，或只在加载成功／失败后才更新。
- 第一人称只保留一个准星。镜头机位保存要保留透视参数；视角问题先检查投影与屏幕中心，不要叠加第二个准星补偿。
- 监视器副画面按可用舞台高度计算右栏宽度，并让渲染相机采用每块画面的实际宽高比；不要只加宽固定四行的容器，造成画面扁长。
- 奔跑尾迹由历史坐标的净位移和路径效率决定；不能只用瞬时速度或很小的位移阈值，否则原地折返会堆成烟团。缺坐标或不足一个判断窗口时不外推旧位置。
- 道具第一人称出手后短暂保留投掷视角，再切换轨迹跟随；延迟读取 `UTILITY_THROW_VIEW_HOLD_SECONDS`，不要继续追踪投掷者后续走位。道具播放按记录 tick／tickRate，而不是按轨迹点数量计时。

### 烟、火及道具数据

- Demo 烟雾形状来自记录中的体素帧；GLB 不是解码体素的前提。不能把缺模型等同于无法回放烟雾，也不能把效果近似称为完全还原游戏画面。
- 当前烟雾复用体素构成的 metaball 密度场，用单个三维纹理沿视线积累遮挡；高密度内部应基本不透、边缘平滑变淡，不叠加独立烟球或同心颗粒外壳。`SMOKE_VOLUME_SCALE` 当前为 **1.32**；回合浏览、道具速记和协作导入应保持相同基准。
- 回放中的 HE 炸烟在密度采样时按爆点暂时减去烟量，不能永久改写原始体素帧；时间倒退、切回合及演播片段中途开始都应重算。Valve 确认烟雾会响应爆炸且 HE 不应隔墙影响烟，但未公布可直接使用的炸烟半径；当前半径是视觉近似，不是游戏权威常量。
- 有真实火焰数据时使用 `CInferno` 的火点、法线和燃烧状态；视觉是贴合 NAV 的单色不规则合并表面，内部填充不应露出独立圆边。手动 Q 添加或缺真实数据时才采用默认范围；调整范围后要更新几何。
- 烟、闪、雷、诱饵可能空中生效，标记不要强行压到最近地面；轨迹终点与显示位置应对应。火焰贴地是另一条渲染路径。
- 保存 Demo 帧要携带当时烟火形状。协作中的匿名道具可补齐名称／描述后转为正常记录，不要在恢复时退化成默认球。
- 匿名道具曾重复保存完整烟雾日志造成存储膨胀。保留 `workspace.js` 的紧凑化逻辑；体素数量与日志帧数量不是同一概念，不能按数字大小直接丢数据。
- 道具导入要检查重复内容、无 ID、同 ID 不同内容和重复导入；`mergeUtilityNotes` 已修复无 ID 道具二次导入产生副本的问题。

### Demo 解析与缓存

- 不要看到“少一个人”就判定 Demo 损坏。项目曾因 Source 2 实体索引仍用 11 位掩码而把高索引实体混淆；本地 WASM 补丁改为完整 14 位，还包含轨迹、烟日志和火焰数组处理。升级 npm 包或替换 WASM 前必须核对补丁，详见解析器专项说明。
- JS 胶水、WASM、原生程序、补丁和上游版本需要一起维护。解析输出结构变化时同步更新 `main.jsx` 与 `demo/parserRuntime.js` 的缓存 schema，不能让旧缓存掩盖新解析结果。
- `unreachable` 不只有一种原因。曾有栈包含 `__rg_oom`、`handle_alloc_error`，同时 `wasmPages = 65536`：这是约 4 GiB 线性内存耗尽的证据，不是一般事件格式错误。检查阶段、输入大小、并发和内存诊断，不盲目增加并行度或重试。
- 批量解析结束只汇总完成／失败，不自动打开某个 Demo；开发模式保留逐任务阶段和错误详情，方便追溯。
- 浏览器后台页可能被限速。保留等待提示，区分后台调度、真实解析停滞、缓存命中和 Worker 失败；不要为了制造进度而伪装已完成。
- 当前回合的快照、轨迹和烟火数据由 `roundDataStore` 一起发布；切换 Demo／回合、重置和卸载后，旧请求不得再覆盖新状态。
- 击杀事件中已见到 `usp_silencer_txz09`、`glock_vip` 等附加后缀；图标按已知武器名的最长前缀匹配，要求后续以 `_` 分隔，再做 USP-S 等别名映射。原始事件字段仍保留用于追溯，未知前缀不能猜测成其他武器。
- Demo 和道具播放通过 `playbackClock.js` 按单调时钟的实际间隔推进，并读取各自 tickRate；分析时间轴仍使用现有 64 tick 单位。计时器延迟后会追上实际经过的时间，不把回调次数当作时间。

### 存储与协作

- 多次“本地空间不足”来自把大体素／帧存档写进 localStorage。用户道具和协作存档放 IndexedDB，localStorage 主要留小型偏好；不要在初始化时又把默认大记录写回去。
- 启动迁移与用户保存可能同时发生：较新的会话写入优先，写入按操作顺序排队，失败不能阻塞后续重试。迁移副本未落盘前不清理旧记录。
- 默认不要清空整个数据库来修复单个坏缓存；先确认 key、schema 和数据类别，保护用户编辑存档。
- 目录索引读取完成前不能用空索引覆盖旧数据；拖拽或保存目录归属须排队写入，尤其不要为排序而重写带体素的整份存档。
- 普通保存、新建存档和覆盖存档不是同一操作。保留覆盖确认；追加帧与替换已有帧的规则由 `archiveCommands` 管理。
- 远端更新不回发；加入房间不得覆盖入房前的本地会话；访客不能用本地存档覆盖共享房间。退出时恢复本地帧，连接销毁释放所有监听。
- 房间恢复的地图、机位、活动帧和场景内容应作为完整事务发布。不要分阶段让其他客户端看见新元数据配旧帧。
- 帧切换应先完成离开帧的编辑与过渡，再保存并应用目标帧。相关场景方法末尾的布尔参数影响播放行为，移动调用时不要“顺便简化”。

### 桌面原生组件

- `npm run native:build` 构建 Go SQLite 存储组件，模块与校验值固定在 `native/storage/go.mod`／`native/storage/go.sum`，使用 modernc.org/sqlite 并设置 `CGO_ENABLED=0`，无需 Rust/Cargo 或 C 编译器。沿用数据库 user_version=2、原表结构和 SHA-256 命名的 gzip 缓存，不清空或迁移用户数据。`.local/native-demoparser` 与旧对照二进制不是当前依赖，不自动删除。
- 支持的发布目标为 macOS arm64/x64 和 Windows x64（amd64），不提供 Linux 安装包。`desktop:prepare`、`desktop:dev` 和桌面构建脚本会先构建原生程序；安装后的用户不需要 Go、Node 或 Python 环境。发布所需原生产物在 `build/native/mac-arm64`、`mac-x64` 或 `win-x64`，通过 `extraResources` 放到 ASAR 外；打包前检查目标架构。`CSBOARD_NATIVE_TARGET` 可指定 `darwin-arm64`、`darwin-x64` 或 `win32-x64`，与 Electron 目标同步；默认只编译宿主平台，不能用 Mac 二进制填充 Windows 包。
- `native-services.js` 管理文件选择、任务及独立存储进程；`native-demo-task.js` 在 utilityProcess 中复用 JS 回合整理，调用独立 Go 解析进程。输入文件不经过页面，回合数据在后台持久化成功后才报告任务完成。桌面解析由 `parse-performance.js` 按核心数、可用内存、文件大小和运行任务的观测内存决定并发及每个 Go 进程的 GOMAXPROCS；计算仍单任务。性能设置在桌面管理中保存为均衡／极速／自定义，默认均衡。内存预算用于任务准入，不是操作系统硬限制，不能宣称无限内存或始终满核。
- 单 Demo 的回合、分析、投掷前动作及武器匹配 tick 合并成 `prepareTicks` 计划，一次顺序扫描后按查询取数据，结束后 `releaseTicks`。Go 的线程配置不等于按 tick 并行解码；实体状态、事件和烟火日志仍有顺序依赖。内部消息队列有固定上限，不随 Demo tick 数量增长。浏览器设置 Go 的 GC 软内存目标，仍受 wasm32 线性内存限制。
- 原生与 JS 进程分别统计峰值 RSS，二者之和用于保守准入和诊断，不等同于同一瞬间总峰值。Go 原生程序在 macOS/Linux 使用 getrusage、Windows 使用 GetProcessMemoryInfo；窗口最小化不改变解析预算。
- 批量缓存检查走 `cache.inspect` 小型摘要，避免每个候选 Demo 都把整份分析数据载入页面。旧缓存由存储进程提取摘要，不改写原缓存。原生 RPC 封装移动 JSON Value，JS null 适配原地修改新收到的数据，避免大烟雾日志的额外深拷贝。
- 性能验证使用 `node scripts/benchmark-native-parser.js sample.dem --threads 4 --output /tmp/parser-result`；`--threads 1` 限制 Go 调度并行度，不代表另一个解析算法。按相同采样率比较完整回合及 Demo 输出（浮点容差、类型化数组和顺序均需检查），再检查真实 Electron 批量并发、最小化、取消和打开缓存。单个样本提速不能推断所有 Demo 都等比例提速。
- SQLite 位于 `app.getPath('userData')/native-data/csboard.sqlite3`，用户集合拆成条目行，仅更新变化行；目录单独保存。Demo 载荷保存在 `blobs` 下的校验和命名 gzip 文件，落盘后发布数据库引用。只删除没有其他引用的已知缓存文件，不清理用户存档；异常退出可能留下无引用文件；桌面管理可显式清理合法校验和文件名的未引用缓存，不自动全盘清理。
- `persistentStore` 首次读取缺失的原生 key 时导入旧 IndexedDB，事务中只在 key 不存在时写入，较新的原生保存优先。Demo 迁移在 `legacyCacheMigration.js` 中执行，逐回合校验，成功后记录完成标记；保留旧数据库。迁移不能调用浏览器缓存的升级清空逻辑，也不能在原生存储失败后悄悄写入另一个后端。
- 原生通信通过 `storageCodec.js` 保留类型化数组、空值等数据；不能直接用普通 JSON 丢失烟雾体素类型。Go JSON 的 null 由共用 `goParserAdapter.js` 转为已有业务约定的 undefined，不能把未知输入变成已确认的 false。
- Go 存储替换已验证旧 Rust 写出的数据库和 gzip blob 可直接读写，Go 写出的数据也可被旧读者打开；快照、共享 blob、受保护缓存清理与事务回滚继续保持。macOS `vm_stat` 页大小头包含 `page size of`，不能漏掉 `of` 后把可回收内存统计变成 null；对应测试固定了实际输出格式。 89 项 Node 行为测试及 Go 内存统计测试通过，macOS arm64 应用包验证了最小化解析和缓存读取；Windows amd64／Intel Mac 存储组件仅完成交叉编译，Docker 守护进程未运行，未验证容器构建。
- macOS 构建产物要复制到临时文件后原子替换可执行文件，不能覆盖已运行文件的 inode。回归中曾遇到磁盘签名有效但启动 SIGKILL；改用原子替换后原生存储与真实解析恢复。
- 页面刷新、销毁或任务取消会终止所属解析任务；最小化不取消。存储进程独立于解析进程。关闭应用会终止后台组件，尚未完成的解析下次重新开始。
- 原生修改除通用测试外，运行 `node scripts/verify-native-parser.js /path/to/sample.dem` 比较 Header、事件、采样坐标及烟火属性；浮点比较有容差，此脚本不是完整性能基准。用独立 Electron 数据目录检查最小化解析、打开缓存、快速切回合、迁移中保存、取消及失败后重试。Intel Mac、Windows 和签名安装包必须在对应环境另行验证。
- 前端和桌面构建默认运行 `scripts/build-go-parser.js`，从 `native/parser/source.json` 固定的 `dlwm/demoinfocs` 提交准备 `.local/demoparser/demoinfocs`。工作区有未提交源码修改时停止；干净工作区与固定提交不同时自动检出目标提交。开发自己的 fork 时可显式用 `node scripts/build-go-parser.js --local-source` 或 `node scripts/build-frontend.js --desktop --local-source`，桌面测试包用 `npm run desktop:prepare -- --local-source`；发行命令及 CI 拒绝此参数；正式构建应先将 fork 改动推送，再更新固定 SHA。Go 适配层编译原生程序和浏览器 WASM，并复制同版本 `wasm_exec.js`。Go WASM 随页面产物交付，桌面包还包含对应目标架构的 Go 可执行文件。正式 Demo 导入已走 Go 会话协议和共用回合整理，缓存 schema 为 31；旧缓存不能掩盖新解析结果。HTTP `/api/parse` 兼容接口也调用同一 Go WASM，会话在请求结束时释放；同一 isolate 的请求串行执行，避免共用回调状态串扰。 Node 接口已用完美世界样本返回 14 回合和 585 个位置快照；本地 workerd 验证健康检查和无效输入，未验证生产大文件解析。离线投掷报告在同一样本生成 178 条记录；无独立 `grenade_thrown` 时使用道具 `weapon_fire`，保留 `releaseEvent` 来源和未知速度。Go fork 的模块路径仍是上游 `/v6`，本项目以本地 `replace` 指向固定 checkout。Go 1.27 工具链由 `GOTOOLCHAIN=auto` 选择，离线构建需提前准备工具链和模块缓存。
- Go 的购买事件必须来自购买定义与金额的成对网络写入，不能比较数组快照：记录移位会制造新消费。售回标记按 `ItemRefund` 的完整武器 handle（包含 serial）匹配，不按购买槽位跨回合猜测；与旧 Rust 标记并非逐字相同。库存保留网络 weapon-handle 数组顺序；无按钮基线时保留缺失值，WALK 沿用业务 bit 18 约定。
- 真实对照已覆盖完美世界、5E、HLTV 各一份 Demo 的 30 类业务事件数量与 tick、采样玩家状态和烟火数据；Go 原生完整导入分别生成 14／18／17 个回合。浏览器 Worker 完成完美世界及约 299 MB HLTV 样本；Electron utilityProcess 完成完美世界导入并写入 SQLite 缓存；macOS arm64 本地应用包在窗口最小化期间完成同一导入，包内 Go 原生程序与 SQLite 缓存读取正常。页面已验证导入、打开缓存、连续切换 3／9／2 回合和选手分析数据加载。未做所有平台和全部页面交互回归，对照脚本及样本留在 `.local/parser-compare/`。
- 本地 Go fork 的检查点修复读取 FullPacket usercmd 建立基线，但不派发重复业务输入事件，拒绝旧检查点回滚较新状态。HLTV 缺基线警告由 147853 降至 10，剩余为同 tick 检查点之前的首条 delta；固定构建提交必须包含此修复才能复现这些结果。不要仅为对齐旧 Rust 的索引列表解码缺陷而保留过期输入状态。
- CI 与桌面发布构建使用 `native/parser/go.mod` 选择 Go 工具链；更新固定提交或 Go 版本时，须让 `.github/workflows/checks.yml` 和 `desktop-release.yml` 一起可构建。`actionlint` 只能检查工作流语法，不能证明安装器在三个目标系统可运行。
- 5E Dust2 样本的 Go 原生摘要能读到地图、107946 帧和 14974 条原始游戏事件，但原始 `GenericGameEvent` 中没有 `round_start`；Go 语义事件另有 18 条 `RoundStart`、18 条 `RoundEnd`、17 条 `RoundEndOfficial`。业务事件需要明确合并语义事件并核对回合切分，不能只转发原始事件。这个摘要不是完整回放协议。

### 桌面任务、备份与绘制

- `task-scheduler.js` 统一管理解析／计算两个有界通道，解析通道最多 16 个任务并受性能调度器进一步限制，计算通道最多一个任务；队列最多 64 项，保留最近 50 个终态。当前回合的存储读取优先于后台缓存写入，但不打断已开始的 SQLite 操作。任务取消同时处理排队和运行状态；失败后可重试，未实现进程重启后的队列续跑。
- 原生 RPC 设定超时；连接失败拒绝所有等待请求，下次请求重建存储进程。失败的写入不自动重放，因为进程退出前可能已经提交；调用方必须使比较基线失效。解析步骤允许 30 分钟，整任务上限 2 小时，计算任务上限 10 分钟。
- 新解析回合在所属 utilityProcess 中编码到专属 staging 文件，主进程只转交路径给存储进程。分析读取只传校验和文件引用，utilityProcess 自行读取和校验；页面读取使用 60 秒有效、单次消费的同源票据，HTTP 分块校验解压后的 SHA-256。大段回合 JSON 不再通过主进程的 IPC/RPC 中转，但解析器输出与页面解码仍使用 JSON，不能称为全链路零拷贝。
- 新解析 Demo 的小型索引包含选手目录和 schema；分析目录优先读取索引，旧缓存走原查询路径。索引不改变已有缓存数据格式。SQLite user_version=2 增加缓存访问时间，按最近使用清理时也包含未完成 Demo 的回合；清理操作不修改用户 records/items。
- 桌面管理的容量是一次清理的目标，不是自动淘汰配额。备份／恢复／清理在无任务、无存储请求、无资源导入时取得维护锁，之后拒绝新写入。备份使用串行存储进程中的 VACUUM INTO 和引用 blob 文件快照，连同导入资源生成逐文件 SHA-256 清单；不包含浏览器偏好、未迁移的旧 IndexedDB、原始 Demo 或未保存编辑。
- 恢复先校验清单、资源、SQLite 完整性及 blob 校验和，再发布 pending-restore 日志。重启时交换 native-data/resource-packs；进程在交换中途退出，下次启动回滚。之前的数据保留于 restores/<id>/previous，不自动删除。不要直接复制运行中 SQLite 主文件当作完整备份，也不要覆盖真实用户目录做回归。
- `renderLoop.js` 同时观察页面可见性与 Electron 窗口的最小化／隐藏事件；不可见时取消 Three.js RAF，恢复后再启动。播放时间仍由实际经过时间决定。防自动休眠仅在用户为本次运行启用且存在后台任务时持有 blocker，任务结束或退出时释放。
- 构建不能替代备份恢复、中断回滚、存储进程重连、真实 Demo 解析与旧 IndexedDB 迁移等运行时检查；Windows/Linux 仍需对应环境验证。

### Web 与桌面的职责边界

- `src/platform/index.js` 在页面生命周期内选择一次服务。业务层使用 `cache`、`records`、`demos`、`compute`、`resources`，桌面管理与窗口可见性分别通过 `maintenance`、`presentation` 能力接入；浏览器适配器管理 IndexedDB / Worker，桌面适配器管理 preload IPC。桌面服务失败不能静默改写浏览器数据库。文件选择能力与后台解析能力单独声明。
- `useDemoBatchParser` 只处理队列、缓存命中和进度。解析器共用 `parserRuntime.js`，适配器负责启动、取消和结果持久化。旧的启动即创建的单文件 Worker 已移除。
- `platform/shared/analysis.js` 共用分析查询：先返回小型选手目录，选中 Demo 后逐回合读取并聚合。Web 在 Worker 中读 IndexedDB；桌面由 `data-service.js` 启动 utilityProcess，调用原生缓存。取消、页面导航和销毁会停止任务；旧结果不能覆盖新选择。当前仍返回所选分析结果及其烟火上下文，并非无限内存或完全分页查询。
- 桌面 `records` 按条目编码比较，只向 SQLite 发送变化 slot、集合长度和元数据，事务一次提交；成功后才更新比较基线。条目编码仍在页面执行，排序导致 slot 改变时会重新发送对应条目。Web 集合保持原 IndexedDB 格式，原生迁移保留源数据库。
- JSON 导入／导出及演播序列化使用 `compute` 服务。文件读取和最终下载仍使用现有文件入口；结构化克隆和页面展示仍占内存，不能称为完全流式文件管线。
- Web 构建输出 `dist/`；桌面页面输出 `build/renderer/`，后台任务由 `config/build/vite.tasks.config.js` 从两个入口打包到 `build/tasks/`，自动追踪领域模块依赖。不要手工追加一串共享源码到安装包白名单。资源清单位于 `src/resources/catalog.json`，图标由同一 SVG 生成 PNG／ICO／ICNS。
- `package.json` 的 `build` 是正式包配置，`config/electron/local.cjs` 继承并仅追加本地测试模型及名称。发布入口仅保留 `desktop:build:mac:arm64`、`desktop:build:mac:x64`、`desktop:build:win:x64`；`scripts/package-desktop.js` 同步选择 Electron 与 Go target，拒绝跨操作系统打包和冲突的环境变量。安装包名包含系统与架构，构建不自动上传。桌面与 Web 共用 React / Three / Yjs 领域功能，不复制两份页面。
- 演播 HTTP 协议见 `shared/broadcast-transfer.js`、`server/core/broadcastTransfer.js`。单块 64 KiB、单载荷最多 128 MiB，逐块 SHA-256，Yjs 只保存带 manifest 校验值的摘要。Node 分块写临时目录，Cloudflare 写 Durable Object 存储；房间到期清理。上传凭证不放入 Yjs。新前端必须与支持该协议的后端一起更新，旧房间需由更新后的房主重开；本地存档格式未改变。
- 烟雾密度场缓存最多约 16 MiB（字段和键），GPU 纹理仍由各场景独立释放。多视角共用一次场景矩阵更新；分析轨迹依赖数据引用与筛选值重建、时间定位用二分查找。这些改动不代表已测得 FPS 提升。

### 已确认的界面行为

- 数据分析的选手支持模糊搜索、多选及加载提示；进入分析页后再处理相关数据。热力范围滑块应在拖动结束后触发重计算。
- KD 路径时间进度条与其他分析类型不互斥。道具起点和落点都能用于保存；重叠点用 hover 列表选择，但点本身不合并。
- 道具列表悬停应高亮对应轨迹；落点效果预览聚焦覆盖范围，不只聚焦坐标。人物 hover 则进入人物视角，两者不是同一套镜头动作。
- 道具目录的镜头预览须在鼠标移出或键盘失焦时恢复；从一个条目直接移到另一个条目时保留最初镜头作为恢复点。
- 教程引导／弹窗打开时不要让全局播放快捷键穿透；开发模式教程提醒说明保留“每 3 次访问提醒一次”。
- Windows 和 macOS 字体观感不同，拉丁字体已本地打包；检查离线和 Windows 字体回退，不依赖远程字体才能正常显示。
- 这些是回归关注点，不意味着每项都有自动化测试。改变它们需有明确需求依据。

### 桌面资源与部署

- 当前桌面正常 release 不包含 GLB，不自动走 Web 的 OSS 链；本地测试构建才显式启用 `.local/official/maps`。用户可多文件导入资源，缺图标用默认 UI，缺模型保留 NAV 并隐藏模型操作。这比早期“打包模型并回退 OSS”的方案更新。
- `.local/official/` 是本地资源来源分组，不是官方授权标记。`.local` 内容不应因改打包配置而进入 release。导入仍需 SVG／GLB 校验，不能开放任意文件路径读取。
- 导入资源后当前采用“重新加载并应用”，不要无验证地改成运行中替换所有场景对象。
- Wrangler 配置位于 `config/cloudflare/`。从项目根目录执行脚本，保留根目录 `.wrangler/state`；配置内资源路径与 `build.cwd` 的相对基准不同，搬配置后需 dry-run 验证。部署命令不是只读检查，不作为默认验证步骤。
- Worker UI 资源包由 `.local/worker-resource-pack.json` 在前端构建时选取 SVG，缺配置沿用内置图标；本地 `dev:workers` 与生产前端必须走同一构建脚本，否则本地击杀栏会误显示旧图标。不要把本地 GLB 顺手复制进 Workers Static Assets，模型仍走 OSS。资源包修改需用 Wrangler dry-run 核对实际资产清单。
- Docker 挂载、Node 模型路径、Electron 测试打包与地图脚本需共同检查；当前本地官方模型目录是 `.local/official/maps`，不要只改某一个入口。
- 遇到异常跨域请求或内容脚本报错时，先查项目引用和请求发起源，并禁用浏览器扩展复现；不要直接放宽项目 CORS 或关闭浏览器安全策略。

### 发布与许可证

- 常用启动、构建及部署以 npm 为唯一入口；Make 仅保留资源准备、Workers dry-run 与 Docker 一键启动。图标、后台任务和页面构建由内部脚本串联，不维护重复 npm/Make 别名。`desktop:prepare -- --local-models` 保留带模型测试包；不要把低频解析诊断脚本当作无用文件删除。
- 发布流程见三语 README 的“GitHub Actions”说明。`.github/workflows/desktop-release.yml` 校验 tag／package／lockfile／changelog 后按固定 commit 构建三个目标；全部通过才上传草稿 Release 与 SHA-256。仅汇总任务有 `contents: write`，使用内置 token；重跑拒绝覆盖已发布版本或不同 commit 的草稿。安装包默认未签名，首次云端运行与安装验证仍需分别确认。
- 版本号以当前 `package.json` 和发布文件为准。发布任务统一核对 lockfile、版本显示、Docker 默认 tag 和三语 changelog／README；先提交这些变更，再为该提交创建 tag。已推送的失败 tag 仍指向旧提交，重新运行不会读取后续修复；使用下一版本 tag，不移动已公开 tag。
- 原创代码采用 `GPL-3.0-only`，第三方软件、字体、解析器和游戏资源不因此改许可证。以 `docs/LICENSE_SCOPE.md`、`docs/THIRD_PARTY_NOTICES.md` 和来源说明为准；不要把来源分组或重新绘制当成自动获得外部素材分发权。
- 保留必要三方鸣谢，按来源和许可说明第三方资源。

## 按改动选择回归场景

| 改动 | 最少关注的场景 |
| --- | --- |
| 拆分入口或画布 | 打开各受影响面板；检查控制台；加载地图并触发相关交互，不能只 build |
| 回合数据／解析器 | 快速切回合、切 Demo、缓存旧 schema、缺数据、解析失败；检查 smoke/inferno 载荷 |
| 存档／道具存储 | 新建、追加、覆盖、删除、刷新恢复、迁移中保存、写入失败后重试、重复导入 |
| 协作连接 | 房主初始化、访客加入、切帧、跨地图恢复、断线再同步、退出清理；两个客户端 |
| 烟火／坐标／楼层 | 有真实帧与无真实帧、手动道具、保存后再导入；Nuke／Train／Vertigo 分层与 Anubis 镜头 |
| 奔跑尾迹 | 持续直线跑、小范围往返、急停、回放倒退与缺失坐标；观察是否堆烟或残留 |
| 桌面资源包 | 空资源、部分导入、无效文件、重复文件、刷新应用；release 不带模型，本地测试可带 |
| 性能 | 空闲与持续旋转、播放、复杂地图及烟火；记录测试环境，区分 CPU 更新和 GPU 渲染成本 |

## 专项说明

- [地图与 NAV 数据](../src/data/README.md)
- [默认道具与存档数据](../src/default-data/README.md)
- [桌面资源包](resource-packs.md)
- [Cloudflare 配置与部署](../config/cloudflare/README.md)
