# 视图库：当前接口与迁移范围

当前兼容边界与验收结论见 [兼容范围](viewer-compatibility.md)。

当前实现已随 CSBoard 2.0 集成，可从打包归档安装到独立项目；视图库接口仍为实验性，尚未发布到 npm。API 版本为 `0.2`，与 CSBoard 应用版本、Demo 数据格式版本分别维护。

## 分层

| 位置 | 职责 |
| --- | --- |
| `packages/viewer/src/core` | 命令执行、权限策略、版本检查、结果、状态与事件；不依赖 Three.js |
| `packages/viewer/src/three` | 视口、相机、NAV、人物棋与独立视图生命周期 |
| `packages/viewer/src/index.js` | 独立视图入口及坐标转换；类型见相邻 `index.d.ts` |
| CSBoard 宿主 | 面板、解析、数据加载、存储、Yjs、AI 服务与用户确认 |

现有应用已使用包内的相机、NAV、人物棋、渲染调度和命令核心，没有复制这些实现。`ThreeBoard` 仍编排完整回放、道具效果、地图资源和输入交互；并未把整个页面包装成 SDK。

## 独立入口

```js
const viewer = createViewer({ container, navData, mapName, policy });
const state = viewer.getState();
const result = await viewer.execute(
  { type: 'player.move', id: 'player-1', position: [1, 0, 2] },
  { origin: 'api', expectedRevision: state.revision, signal },
);
const unsubscribe = viewer.on('*', event => console.log(event));
unsubscribe();
viewer.dispose();
```

创建时要求有效 NAV 数据，由宿主获取后注入。场景以 NAV 包围盒中心为原点。NAV 输入采用 Source XYZ 英寸；人物位置采用 scene-local XYZ 米、Y 向上。`sourceToScene` / `sceneToSource` 使用状态中的 `coordinates.origin` 转换，禁止直接混用。人物朝向 `rotationY` 为弧度。

| 命令 | 参数 |
| --- | --- |
| `board.apply` | `snapshot.points`：完整人员快照，最多 256 人；手工快照当前不接受道具；回放道具由轨道驱动 |
| `board.clear` | 无 |
| `player.rename` | `id`, `name` |
| `player.team` | `id`, `team`（T / CT） |
| `player.move` | `id`, `position` |
| `camera.reset` | 无 |
| `camera.mode` | `mode`（2d / 3d） |
| `camera.focusPlayer` | `id` |

只调用 `getCapabilities().commands` 声明的命令。独立入口现已声明 `utilities`、`replay` 为 true；具体来源的数据是否可用仍需读取轨道能力，不能把未知数据当成空数据。

## 执行、版本与权限

- 结果包含 `status`、`operationId`、`revision`，失败包含 `error.code/message/details`。普通失败返回结果；读取已销毁实例则抛错。
- `getState()` 返回副本，修改返回对象不会修改场景。
- 内容变更或相机命令变更会推进 revision；拾取及相机手动操控事件不作为编辑版本。主应用还保留原有 AI 内容指纹，两种版本目前不可互换。
- 一次命令中的多个内容通知汇成一次版本推进。失败前若已经产生内容变更，仍发布变更，避免假装回滚。
- `policy(command, context)` 可同步或异步拒绝操作。等待许可期间不接受另一条命令；内容版本变动会使许可失效。`origin` 是调用来源记录，不是身份认证；宿主负责授权。
- `signal` 支持执行前取消和等待许可时取消。同步执行已经开始时不能抢占或回滚；宿主异步命令需自行支持取消。销毁会取消待批准的操作。
- 当前没有通用事务回滚。独立人员快照先校验再替换；应用撤销仍使用既有历史机制。

## 事件与销毁

事件结构为 `{type, revision, operationId, origin, payload}`，每个订阅者收到独立副本。订阅者异常交给 `onObserverError`，不阻断其他订阅者。

事件有 `operation.started/succeeded/failed/cancelled`、`workspace.changed`、`camera.changed`、`selection.changed` 和 `lifecycle.disposed`。应用接入另有 `lifecycle.ready`。相机手动操控在结束时通知，避免每帧发送；播放事件见后文。独立入口暂不提供 hover、拖动事件，资源事件见后文。创建同步完成，宿主可直接查询 `ready`。

`dispose()` 幂等，停止动画、释放监听器、控制器和本实例几何/材质，移除 Canvas。一个实例的销毁不影响另一个实例。实例不拥有宿主数据、存储或房间连接。

## 应用、AI 与后续工作

CSBoard `onReady` 返回 `viewer`，原有 `commands.execute(name, args, context)` 兼容入口转发到同一核心。面板和 AI 的画布命令共享实现；AI 调用标记为 `origin: 'ai'`，已有编辑许可和用户确认仍生效。帧、存档与房间操作属于宿主，目前不属于独立视图库命令。

尚需迁移：部分直接鼠标编辑/相机调用仍走旧方法；独立入口已能播放中立片段和展示道具效果；应用中的完整战斗 HUD、道具相机和部分辅助资源编排仍由宿主负责。第三方需注入数据源与 NAV，ZIP 解码属于外部来源适配器。后续先统一这些控制器和数据/资源接口，再发布 SDK，不增加第二份回放实现。

## 本地示例

`make viewer-example` 构建 `build/viewer-example/`。示例不使用 React、解析器、存储或房间，左侧注入 Dust2 NAV，支持布局、回放包和 GLB 模型；右侧注入 Nuke NAV，展示独立相机与楼层切换。初始人员只是布局示例，回放包才提供真实回放。模型对象树按需展开，根也可折叠。Three.js 和示例 NAV 暂未进一步拆包。

## 回放数据源

新增不依赖渲染器的 `createReplayDataSource`，也可从包的 `./data` 入口使用。它规定数据读取方式，不负责解析 `.dem` 或连接存储。

```js
const metadata = source.getMetadata();
const segments = source.listSegments(); // 不读取回合载荷
const lease = await source.openSegment({ segmentId: segments[0].id, signal });
try {
  const capabilities = lease.getCapabilities();
  for await (const batch of lease.readTrack('frames', {
    startTick: lease.descriptor.activeStartTick,
    batchSize: 256,
    signal,
  })) {
    consumeFrames(batch);
  }
} finally {
  lease.dispose();
}
source.dispose();
```

- 片段有 `startTick`（可含冻结阶段）、`activeStartTick` 与 `endTick`，tick 为来源录像坐标，不重新归零。`sourceRound` 是原始回合编号，可为 null，不能把它当存储索引。
- 轨道为 `frames`、`preparationFrames`、`events`、`projectiles`、`smokeFrames`、`fireFrames`、`voiceFrames`，采用 replay profile 的中立行结构；坐标仍为 Source XYZ 英寸，不能直接当 scene-local 米使用。
- `readTrack` 按批交付，默认 256 行、最大 4096 行；查询范围不得超出片段。批内及跨批 tick 必须有序。当前按行限制，不是字节预算；单条体素帧仍可能很大。
- 能力区分 available / empty / unknown / unsupported。unknown/unsupported 抛 `track_unavailable`，不假装返回“没有事件”。
- `listPlayers()` 返回当前已知身份目录。交换包目录完整；运行时适配器可能在读取人员/事件轨道后补充新身份，消费新批次时可重新查询。
- 元数据和目录返回副本；轨道数据属于租约，只读消费。为避免复制大量体素，轨道批次不深拷贝；宿主需要修改或长期持有时自行复制。
- 租约释放后禁止继续读取；源销毁会关闭所有租约并发出取消信号。底层读取需配合 signal；现有存储调用开始后未必能立即抢占，过期结果不会发布。

### 已接入来源

| 来源 | 接入方式 |
| --- | --- |
| 原始 Demo | 现有解析适配器生成缓存；`createRuntimeReplaySource` 读取选中片段 |
| 导入的 v3 / replay profile 包 | 已导入缓存时与原始 Demo 使用同一来源驱动 |
| 独立自制片段 | 同一运行时来源驱动，换成内存载荷，不读取回合缓存 |
| 独立宿主直接读取 replay profile | `openReplayPackageSource` 读取包目录与选中片段，不连接 CSBoard 存储 |

现有 `useDemoRoundData` 已经过该数据源加载，并取消旧选择的请求、显示加载错误。运行时驱动串行读取，只保留一个回合缓存。播放器暂通过命名空间扩展 `csboard.runtime` 取得原有载荷，避免整回合转换再转换回来；这不是中立轨道，也不能写入交换包。待渲染控制器迁移后移除该兼容端口。

直接包读取器目前仅支持 replay profile；v3 不含完整回放轨道，应继续使用现有导入适配器，不声明为可直接完整回放。ZIP 仍保留压缩包内存、选中片段仍整体 JSON 解码；批量交付不等于底层流式解码。字节预算和分页存储读取还需后续实现。

独立示例新增回放包选择入口，优先打开第 22 回合。宿主只加载数据源并发送命令，播放时钟、插值和道具效果由库处理，不在示例中复制播放器。

## 播放与道具渲染

独立视图已经消费中立帧与道具轨道，不使用 `csboard.runtime` 兼容载荷。现有 CSBoard 仍使用原有人员 HUD/高级相机，但与库共享帧定位、时钟以及完整道具效果控制器；应用播放状态与高级人员更新器尚待统一。

```js
viewer.setDataSource(source); // 来源由宿主持有，不进入命令 JSON
await viewer.execute({ type: 'replay.open', segmentId: 'segment-22' }, { signal });
await viewer.execute({ type: 'replay.play' });
await viewer.execute({ type: 'replay.seek', tick: 210550 });
await viewer.execute({ type: 'replay.pause' });
viewer.setDataSource(null);
source.dispose(); // 库释放自己的租约，宿主释放来源
```

| 命令 | 参数 |
| --- | --- |
| `replay.open` | `segmentId`；开始读取前暂停并释放上一片段 |
| `replay.play` / `replay.pause` | 无；播放到末尾自动停止，再次播放从 activeStartTick 开始 |
| `replay.seek` | `tick`；限制在 startTick–endTick，可拖回冻结阶段 |
| `replay.speed` | `speed`，0.1–8 |
| `replay.display` | `effects` / `trajectories`，可分别控制 |
| `camera.focusPoint` | `position`，scene-local 米，用于任意位置聚焦 |

- `getState().playback` 返回加载状态、时间、片段、倍速、错误、轨道能力和数量；`effectDisplay` 与 `effectCounts` 返回展示配置和当前对象数。
- 事件有 playback.source/loading/ready/failed/cancelled/play/pause/seek/speed/time/ended/display。time 最多约 10 Hz；用户播放命令推进操作 revision，时钟帧不推进编辑版本。页面隐藏时渲染暂停；恢复前台后按单调时间追上，沿用原应用时钟语义。
- 加载期间通过执行上下文 signal 取消；已进入底层读取时是否能立即抢占仍由来源驱动决定。切换来源/销毁也会取消当前请求。
- `createReplayController` 可从 `./playback` 单独使用，不依赖 Three.js、React 或存储；时钟与回调可注入。帧二分查找避免每次扫描整段，位置/朝向插值保留未知值，复活或超过 12 米的位移不生成跨地图动画。
- 独立渲染器缓存人物棋，只在人物增减、阵营/姿势/样式变化时替换几何；普通播放帧只更新变换。死亡人员采用灰色压低棋身；HUD 数据与装备支持范围见下文。
- 当前加载一整个选中片段的所需轨道，再播放；不是无限流式回放。默认限制 50 万行和约 128 MiB 的 JSON UTF-16 估算量，可通过 `playbackBudget: {maxRows, maxBytes}` 调整。估算不是实际堆内存或 GPU 内存测量。
- 独立视图处于已加载回放模式时禁止手工改写人员，防止下一播放帧覆盖修改；脱离来源后恢复编辑。宿主若要保存战术帧，应另行复制当前布局。

### 道具共用实现与扩展

原有道具控制器、烟雾体素/密度渲染、火焰、轨迹、碰撞索引和地面材质裁切已移动到包中。原路径只做兼容转发，没有第二份效果实现。轨迹按记录时间渐进显示，倒退会恢复；烟雾使用来源体素，火焰使用来源单元，数据缺失时才采用既有示意效果。

中立事件在现行 profile 中未覆盖所有实体关联与投掷物生命周期字段。宿主可注入 `readProducerFields(fields)` 解码自己的生产者扩展，补充实体关联；库不导入 CSBoard 存储编解码。示例对 CSBoard 包使用现有宿主解码器。其他生产者不提供关联时保留既有位置/时长降级，不能声称完全复现每个实体。后续应在格式合同中推进通用的实体关联定义。

## 地图资源驱动

`createViewer({ resourceLoader })` 注入资源驱动后才声明 model 能力；没有驱动时不注册模型命令。驱动通过 `load(key, {signal, onProgress})` 返回 `{value, dispose}` 租约，模型槽位 key 为 `world-model`，value 为含 scene 的 GLTF 结果。

```js
const resourceLoader = createGltfResourceLoader({
  resolve: key => key === 'world-model' ? [mapUrl] : [],
  maxBytes: 512 * 1024 ** 2,
});
const viewer = createViewer({ container, navData, mapName, resourceLoader });
await viewer.execute({ type: 'model.visibility', visible: true });
await viewer.execute({ type: 'model.unload' });
```

- 默认不加载模型；显示命令启动后台读取，不阻塞其他命令，方便立即隐藏并取消。隐藏已完成的模型保留租约，卸载才释放；取消还在下载/解析的模型会丢弃过期结果。2D 模式下暂不启动模型下载，回到 3D 后按显示意愿加载。
- `getState().resources` 与 `resource.state` 事件给出 key、status、phase、loaded、total、error。无 Content-Length 时 total 可能为 0；解析前会发布实际字节数，不能将下载达到 100% 当成场景已经就绪。
- 控制器保证同一槽位读取去重、失败可重试、过期租约释放。驱动不缓存可变场景，多个视图各自拥有实例。场景、几何、材质和贴图由租约统一释放，不能由宿主再次释放同一租约对象。
- URL、地图目录、本地文件和服务器路由由宿主 resolver 决定。库不读取 CSBoard 平台、资源注册表或用户目录，也不会替宿主请求文件权限。
- GLTF 驱动支持有序 URL 回退、流式下载进度、AbortSignal、下载字节预算和自包含 GLB v2。默认 512 MiB，可配置；这不是峰值堆内存预算，未知长度下载目前仍先收集分块再合并。
- 外部缓冲区/贴图引用会在解析前被拒绝，避免子请求绕过取消与预算；此类资源需要宿主专用驱动。Three.js parseAsync 本身不可抢占，完成后若已取消仍释放，不挂入场景。压缩模型所需的 DRACO/KTX 等解码器也由 createLoader 或专用驱动注入。
- 模型须采用未中心化的 Three 坐标（米、Y 向上，即 Source XYZ 经 `(Y,Z,X)*0.0254` 转换）；视图统一减去 NAV 中心。不能提前减中心或混用 Source 英寸。当前 GLB 不能自动证明它与注入的 NAV 属于同一地图，匹配由宿主保证。

应用的主世界模型读取已迁入同一控制器/驱动，保留原有懒加载、资源注册表、显示材质、合批和简化；地图切换会取消未完成下载。应用下载上限当前为桌面 1 GiB、移动 128 MiB。独立库与应用现在共用简洁显示材质、导出灯光移除、装饰覆盖层隐藏和受预算限制的静态合批。应用仍保留自己的光照配置和模型简化编排，不能据此保证像素完全一致。

辅助 zones、模型简化、区域标注与地图显示 UI 的统一编排仍待迁移。库销毁不销毁宿主驱动本身，只释放自己取得的资源租约。

## 地图显示控制

应用与独立入口共用模型命令定义；应用端口负责 React 设置与节点掩码的持久化，独立入口的持久化由调用方负责。两种入口均提供模型目录查询、样式、整体显隐、对象显隐和楼层命令；模型卸载只在注册了该命令的入口提供。

显示材质、静态合批、对象名称树与楼层范围计算已经移入库中。应用原路径只是兼容转发；主模型也通过同一个 `createMapDisplayController` 初始化。

| 命令 / 查询 | 参数与结果 |
| --- | --- |
| `model.style` | `opacity` 与 `range` 为 0–1；`focus` 为 full / pointer / camera。可在加载前设置，须注入资源驱动 |
| `getModelObjects()` | 可传 query、offset、limit（默认 100，最大 1000）；返回 signature、total、offset、objects，每项有 id/name/visible |
| `getModelObjectTree(query)` | 按原始 GLB 名称的下划线构树，压缩单子项分支，文件夹优先；每个分支含 ids，根也可折叠 |
| `model.objectsVisibility` | ids、visible、signature；目录签名不符返回 object_catalog_changed，应重读目录 |
| `map.floor` | id 为 all 或初始化时注入的楼层 ID |

对象目录查询要求模型 ready；返回数据为副本。visible 表示对象显隐掩码，不代表模型整体显隐、楼层裁切或装饰覆盖层的最终可见性。显隐会同步更新批次与碰撞索引版本；不复制、重载或重新简化模型。模型卸载后该目录失效。

`createViewer` 可接受 `floorRanges: {main: [minZ,maxZ], lower: [minZ,maxZ]}`，边界采用 **Source Z 英寸**；或接受 `floorBoundary` 由 NAV 推导范围。库没有固定地图名单。未指定边界时只推导整个 NAV 的 main 范围，初始选择 all，不裁切。`deriveNavFloorRanges` 可单独使用。宿主决定楼层 ID 的本地化名称与布局。

楼层影响 NAV、模型、人员和火焰地面效果；道具轨迹保持原有完整三维深度遮挡，不被楼层截断。不是独立实例自动生成并排多楼层视图：宿主需要时创建多个实例或自行编排视图。

`getState()` 新增 modelStyle、modelStats、floor、floors；renderStats 提供最近一帧的 draw calls 和 triangles，可用于宿主诊断，不是性能评分。事件新增 model.style、model.objectsChanged、map.floor；均经过公共操作核心。对象树 UI 属于宿主，库不依赖 React 或应用的侧栏。

## 第一人称与监视器

应用与独立库共用第一人称眼位、朝向、蹲姿高度和开镜 FOV 计算，以及监视器缓存渲染器。应用的 DOM 小窗测量留在宿主适配器，库不查询 `.demo-monitor-wall` 或读取解析器原始字段。

| 命令 | 行为 |
| --- | --- |
| `camera.pov {id}` | 跟随当前帧选手，要求 3D、有效位置与 pitch/yaw；保存自由相机，主视图隐藏自身棋子 |
| `camera.free` | 恢复跟随前的自由相机；监视器可独立保持开启 |
| `camera.monitor {playerIds}` | 最多 16 个当前帧选手的唯一 ID；空数组关闭并释放小窗缓存，要求 3D |

拖动进度会立即同步第一人称相机。死亡或临时缺少位置/视角时停止更新该视角并发布 unavailable，保留最后相机，不编造朝向；有数据后恢复跟随。换来源会退出跟随、清空监视器；换片段保留选择，等待该选手在新片段出现。进入 2D 会退出跟随、关闭小窗；原始自由相机通过现有投影控制器保存与恢复。

`getState().camera` 新增 follow（playerId、idle/following/unavailable）与 monitorIds。`camera.follow` 在跟随状态变化时通知，不逐帧发送；相关命令使用既有 camera.changed 与操作事件。`monitorStats` 提供最近监视器渲染的 scenePasses、cachedTiles、updates、updateCostMs，用于诊断；renderStats 为最近一次渲染 pass 的 Three.js 统计，监视器多 pass 时不能当作整帧总量。

监视器沿用应用现有预算：最多 20 Hz、每帧最多 2 个小窗刷新、约 5 ms 刷新预算；单次昂贵渲染仍至少允许一窗推进。单窗最多 480×320、像素比最多 1.25，缓存总像素约 100 万。预算不等于实际 GPU 字节上限；一轮可能未把所有小窗刷新完。静止时复用缓存，跳转、倒退或换片段会废弃旧时间画面，按预算刷新。退出恢复全 Canvas viewport/scissor，销毁释放目标纹理。隐藏主视图自身棋子不会隐藏它在其他选手小窗中的形象。

默认小窗排在右侧。宿主可在 `createViewer` 注入同步的 `monitorLayout({width,height,playerIds})`，返回 `{mainWidth,tiles:[{id,x,y,width,height}]}`，坐标为 Canvas CSS 像素、左下原点。返回 null 暂停小窗；矩形必须在 Canvas 内，ID 必须属于当前选择。布局回调异常交给 onObserverError，一直失败时只报告一次并恢复普通视图，避免渲染循环报错。示例使用这个宿主接口排布四个小窗。

## 人员状态、HUD 数据与枪械

新增渲染器无关的 `describePlayer(neutralPlayer)`，应用通过 `describeDemoPlayer` 适配旧缓存字段。生命、护甲、头盔、拆弹器、C4、金钱、当前武器/弹药、库存数量、闪光时长、视角可用性采用同一语义。未知数值与布尔值保持 null，不转换为零；库存未提供为 null，已知空库存为 []，无法识别的库存项计入 inventoryUnknownCount。

死亡时，**用于展示**的 weapon 为 null、inventory 为 []、equipmentVisible 为 false，不修改来源轨道。需要分析死者原始库存时应读取轨道，而不是 HUD DTO。应用的原有 UI 布局和部分未知值展示回退仍保留；这里统一数据与装备显示条件，没有替换所有界面组件。

`getState().hud` 返回 tick、players、最近五条 kills 与 eventsStatus。玩家含 id/name/side 和上述展示状态。近期击杀按 tick 二分查找，支持倒退，名称取自中立身份目录，未获知的参与者姓名保持 null。eventsStatus 区分 available/empty/unknown/unsupported，不能把空数组视为来源确认没有击杀。现有 profile 未包含全部击杀图标标志；爆头、穿烟等扩展还没有在此 DTO 中统一。

### 注入枪械图标

```js
const viewer = createViewer({
  container, navData, mapName,
  weaponIcons: (weapon, { side }) => {
    const key = weaponIconKey(weapon, { side });
    return iconUrls[key] ? { key, url: iconUrls[key] } : null;
  },
});
```

`weaponIconKey` / `grenadeIconKey` 为无资源目录依赖的名称映射。武器分类也采用同一别名映射，避免展示名与内部 ID 得到不同类别。应用的图标注册表仍由宿主持有；库不导入平台、资源包或游戏目录。

实际 SVG 透明轮廓扫描、简化与带厚度挤出已经移入库，应用原文件只注入 URL。库缓存最多 64 个 CPU 轮廓，每个人物/第一人称持有独立 GPU 几何；取消后的异步结果不会挂到已释放对象。失败轮廓不会长期留在公共缓存；同一实例不会每帧自动重试，可在切换武器或重建来源后再次尝试。默认长度沿用原有枪类配置，厚度为 .035 场景米，轮廓采样上限 512 像素。

提供驱动后 equipment 能力为 true；未提供时不加载图标，HUD 武器数据仍可读取。独立视图支持第三人称与第一人称静态枪械，死亡/道具/近战时隐藏枪械。**刀、手雷、C4、拆弹模型、换弹/开火/投掷动画尚未完整迁入独立入口**，不能把基础枪械支持当作全部装备支持。

事件有 equipment.ready/failed，异步资源通知不推进编辑 revision；equipmentStats 提供当前模型实例的 ready/loading/failed 与几何三角数，包含缓存的第一人称模型，不等于可见模型数。暂停时枪械异步完成也会使监视器缓存失效，避免小窗一直缺枪。人员底盘色共用原有规则：每队初始五色，额外人员按身份稳定生成。

## 人员时间索引与回放表现

`createPlayerTimeline({frames,events,tickRate,readPlayer?,readEvent?})` 不依赖 Three.js、React、解析器或存储。创建时按人员整理弹药、余额与事件；后续用 tick 二分查询，倒退无需重建。适配器可提供字段读取函数；应用旧缓存字段与姓名兜底留在 `src/demo/playerTimeline.js`，不能让库读取 steamid/activeWeapon 等旧字段。

| 查询 | 返回 |
| --- | --- |
| `reloadAt(id,tick)` | 区间、progress、evidence、estimatedStart/estimatedEnd；没有匹配时为 null |
| `balanceAt(id,tick)` | 最近 1.5 秒采样余额变化的合计与最后变化 tick；无变化为 null |
| `latest(id,type,tick,seconds)` | 指定时间窗内最新事件，不返回未来事件 |
| `purchasesAt(id,tick,round)` | 近期购买/出售差值及冻结阶段开局购买回退 |
| `flashAt(id,tick)` | Source 持续时间字段的剩余时长、初始时长与起点；缺数据为 null |

换弹有两种依据：录像事件提供开始时间，或弹药增加推断。ammo 依据的开始时间按枪类时长估计，也可能是拾取/修改；不能用于确证换弹分析。没有已知完成时使用展示用时长：手枪 2.2 秒、狙击 3.2、霰弹 3.4、机枪 4.2、其他 2.8。切枪截断区间，未知弹药不当零处理。公式集中在 playerTimeline，调用者应读取依据与估计标记。

共用表现函数：

- `delayedPlayerHealth`：受伤后血条停留 1 秒，随后 0.6 秒内用 smoothstep 追上。
- `flashPresentation`：提供剩余秒数、进度、来源强度与 opacity；缺失时为 null。
- `weaponAnimation`：换弹下沉曲线为 sin(progress×π)，开火提供 recoil 标记；宿主选择模型锚点与位移系数。

独立 HUD 玩家新增 animation（reload、delayedHealth、firing、hurt、headHurt、moneyDelta、flash）。未知事件轨道的开火/受伤状态保持 null。独立人员棋显示受伤/闪光颜色，第三/第一人称枪械使用同一换弹曲线；第一人称有基础开火后坐位移。应用的状态栏、人物与 POV 共用这些索引和公式，没有第二套换弹实现。

### 闪光时间语义

`createViewer({flashMode})` 默认为 sample：按来源采样值展示，不追加倒计时。source-duration 用于 CSBoard 当前导出的 Source 2 字段：字段在持续期间保持初始时长，通过连续正值区间（相邻值容差 .05 秒）定位起点，再减去录像时间。示例明确选择此模式。不能对已记录剩余时长的数据使用 source-duration，否则会重复扣时间。该模式下 HUD 的 flashDurationSeconds 也返回计算后的剩余值；原轨道不修改。

应用旧插值的闪光查找已改为索引查询，避免每位选手每帧向前扫描快照。索引按不可变数组引用和 tickRate 缓存；原地改动数组不会自动使缓存失效，宿主应换引用。库目前仍加载选中片段后同步建立索引，大片段可能需要后续分块/yield；不是无限流式索引。

## C4 与导播查询

`createBombTimeline({events,tickRate,timerSeconds?,readEvent?})` 一次建立时间索引，`at(tick)` 用二分返回 C4 状态。核心不依赖 Three.js、不识别旧 Demo 字段；应用适配器负责字段转换。状态为 unknown/carried/dropped/planted/defused/exploded/ended，缺少事件不推断携带者，缺少坐标不生成位置。

返回位置为 Source XYZ；C4 场景组件负责转成场景米坐标。HUD 的 bomb 包括 countdownSeconds、defuseProgress、timerEstimated、defuseDurationEstimated。观测到爆炸时使用实际种植到爆炸的时长；否则使用观测时长中位数，无观测默认 40 秒（宿主可配置 timerSeconds）。拆弹按有钳 5 秒/无钳 10 秒；钳信息未知时使用 10 秒并标记估计。倒退、跳转和同 tick 事件采用原始顺序，无需维护撤销状态。

应用保留旧录像缺失开始拆弹事件的采样回退，但连续 defusing 起点只在快照引用改变时建索引。HUD 和 C4 场景查询共用结果，不再各自向前扫描；场景中的脉冲、掉落示意动画和拆弹进度使用注入 tickRate，不再固定 64。掉落弧线是由掉落/后续拾取位置构造的示意线，不是实测物理轨迹；不可用作真实轨迹分析。轨迹几何只在端点改变时更新。

`createDirectorTimeline({events,readEvent?}).at(tick,mode)` 支持 follow/fixed/chase 的二分查询。`directorCameraPose(event,target,secondary?)` 独立计算位置、观察点与 FOV，输入是场景米坐标和 Source 角度。解析器 userid 与低字节匹配只存在于应用适配层，不作为通用身份标准。应用相机模式已使用共享查询和目标计算，原先的过渡系数、控制器恢复与工具第一人称切换暂由宿主管理。

## 独立视图库导播生命周期

公共命令 `camera.director` 的 mode 为 follow/fixed/chase；要求当前回放 ready 且处于 3D。非法参数、不可用 POV 目标、2D 导播请求在修改相机之前失败，不改变原模式。`getState().camera.director` 返回 mode、status（idle/following/unavailable）、eventKey（最后成功应用的机位）、playerId（导播第一人称目标）、reason（missing_event/missing_target_or_pose）。状态与机位改变发布 camera.director 事件，连续每帧移动不提高编辑 revision。

首次启用导播保存自由相机，换导播模式保留同一保存点。camera.free 恢复保存点；POV、聚焦、重置、切换 2D 与数据源更换释放导播。监视器可与导播并存，2D 清空监视器。导播第一人称隐藏主视图中的目标人物棋，并复用其手持武器；其他监视器仍能看见此人物。缺少事件/人员/视角保留最后画面并报告 unavailable，数据恢复后重新定位。跨回合加载暂时 unavailable，模式保留；数据源更换则退出模式。

seek/source/loading 使下一次相机更新直接定位；连续播放使用刷新率无关公式 `a(dt)=1-(1-a60)^(dt*60)`，dt 秒上限 .25。原 60Hz 位置、观察点、FOV 系数保留，但不再因 30/60/144Hz 刷新率改变总体速度。

注入 `readDirectorEvent(event,{origin,frames,roster})` 返回 DirectorRecord 或 null。固定机位 position 是场景米坐标；追踪目标使用稳定 targetId/secondaryId；可返回角度、距离、FOV、inEye 和 inertia。库校验坐标/数值/身份，转换失败使片段加载失败，避免污染相机。默认只消费已有中性字段，不自行解析 producerFields。

示例的 CSBoard 适配器把原始 userid 映射为 playerId，低字节冲突时不采用模糊匹配。frames 索引按引用缓存。该映射是生产者兼容方案，不是格式的通用身份标准，也无法消除同一片段重复使用 userid 的所有歧义。

## 主应用采用共用相机控制

主应用已接入 createDirectorCameraController 与 createPlayerCameraController，删除重复导播 lerp/FOV 退出逻辑。应用公共控制器提供 camera.director、camera.pov、camera.free、camera.mode；状态查询和 camera.changed 事件包含 mode/director/follow。导播按钮通过公共 execute 调用，事件 origin 为 ui 并携带 operationId。现有监视器团队/人物选择仍由 React 状态维护，但其主视图第一人称也由共享 POV 控制器保存和恢复。

旧 Snapshot 的 userid、Steam ID/姓名、坐标和 crouch 字段在宿主适配器转换。userid 低字节只有唯一候选时采用，避免任取错误人物。原有视角存档、模型质量策略、监视器布局和道具动画保留在宿主。

播放跳转使用 seekRevision（来源有提供时）、快照引用改变、倒退或大于半秒的 tick 跳跃使导播下一次更新直接定位。宿主未提供 seekRevision 的小幅向前跳转仍可能使用连续过渡；需要进一步明确所有旧回放来源的 seek 通知，不能宣称全部旧入口都已精确通知。

相机被导播/POV 持有时不再执行自由 OrbitControls.update，避免其角度/距离限制反复覆盖导播。进入道具第一人称/飞行跟随前释放对局相机，随后由道具原有保存/恢复逻辑接管；公开导播/POV/free 命令在道具播放期间返回 camera_busy。切到其他菜单给明确 null POV 输入，不再从全局缓存继承旧选手。2D 和录像身份变更释放对局相机；重置也先退出相机持有者。

## 受伤与闪光屏幕叠层

纯函数 combatOverlayState 位于 playback，不依赖 DOM/Three/React；createCombatOverlay 位于 overlays，持有两个 DOM 层及其销毁，不注入全局 CSS。应用 DemoPovHud 使用薄 React 包装，共用同一渲染组件，旧 hurt/flash CSS 和动画已移除。

受伤效果为 `1-smoothstep(clamp(ageSeconds/.16))`。闪光输入沿用 flashPresentation；最终强度为 `inputOpacity × min(maxFlashOpacity,reducedEffects?.35:1)`，受伤减弱模式乘 .35。可用视角之外、死亡、二维或禁用时强制归零；来源未知时保留 null，不凭空生成事件。淡出按录像时间计算：暂停保持、倒退重算，没有依赖 DOM 动画播放进度。未提供受伤年龄的宿主只能显示布尔伤害强度。

SDK 初始化接受 combatOverlay 与 combatOverlayTheme；公共 replay.overlays 命令接受 enabled/hurt/flash/reducedEffects/maxFlashOpacity，布尔和 0–1 范围校验失败时不改变配置。hud.overlayOptions 返回配置，hud.overlays 返回当前效果；配置改变发布 playback.overlays。主题字段为 hurtBackground/hurtShadow/flashBackground/flashShadow。

叠层不拦截鼠标/触摸，aria-hidden，不包含可聚焦内容。SDK 只覆盖主 Canvas 的主视图宽度，监视器列保持原画面；其他 viewer 实例不受影响。若宿主容器原为 static，SDK 暂设 relative 以定位叠层，销毁时在样式未改变的情况下恢复。独立 DOM 使用者负责提供已定位容器，也可用 setViewport 指定左上 CSS 像素范围。

应用 React 包装监听 prefers-reduced-motion，独立 viewer 在创建时读取系统初始偏好，之后由宿主通过命令设置。减弱模式是亮度减弱，不提供事件语音/屏幕阅读器提示；层本身不作为辅助技术重复信息。独立 SDK 可调开关，主应用尚未新增用户设置页入口或 replay.overlays 命令；开发者可以通过包装组件 options 注入。

## 共用语音调度与驱动

createVoiceTimeline 输入 tick/playerId/durationSeconds，按二分及累计结束时刻索引返回 speakingAt。标记是录像活动，独立于静音/阵营过滤；保留原 .12 秒尾部宽限，不依赖固定 120ms 查询窗口。未知身份不制造选手标记。

createVoiceScheduler 输入注入 driver、tickRate 和不可变 PCM clips。driver 要提供 now/schedule/stopAll/setVolume，可选 isReady；设备未就绪时暂停调度，不消耗包。每驱动拥有自己的播放源和增益节点。默认静音、不播放、未启用；必须 configure 后才调度。configure 的布尔、音量 0–1、速度 .1–8 和阵营 all/T/CT 会先校验再修改。

全段共用音频时钟锚点：启动缓冲 .04 秒，预排 .8 秒，漂移超过 .25 秒或明确 discontinuity 时重新锚定；pump 由宿主独立定时调用，应用维持 25ms 周期。clip 开始时间为 anchor.time+(clip.tick-anchor.tick)/(tickRate×speed)，迟到偏移为 max(0,now-start)×speed。暂停/静音/阵营/速度改变会取消旧源；普通音量改变平滑调整，不重建锚点。decoded PCM 默认限制 128MiB，失败保留旧 clips；调度器借用样本，宿主不能原地修改。

voiceSideMatches 优先用语音包 side，缺失时允许宿主 resolveSide 回退旧人员表；unknown 只在 all 播放。Web Audio 驱动通过 getContext 获取宿主已解锁上下文，只释放自身 sources/gain，不关闭宿主 AudioContext。speed 使用 playbackRate，也改变音高，尚无保音高时间伸缩。

应用与独立视图共用语音时间索引、调度器、Web Audio 驱动和可注入的 Worker 解码适配器。解码错误会终止 Worker；驱动错误终止本轮播放并报告 error。音频权限由宿主主动解锁，每次启动默认静音。

## 语音公共控制与解码驱动

createViewer 接受成对的 voiceDecoder/voiceDriver；缺一个或接口不完整时构造失败。解码器签名 `(frames,{signal,tickRate,maxPcmBytes}) → {clips,skipped?,limited?}`，clip 使用中性 playerId、tick、PCM samples、sampleRate 和可选 side。压缩轨道在有两个驱动时随选中片段读入，沿用回放总行数/字节预算；静音时不启动解码。PCM 结果另受 128MiB 默认预算约束。

公共 voice.configure 接受 enabled/muted/volume/side，参数失败不改变配置。音频权限仍在宿主用户操作中解锁。state.voice 返回配置、数据 capability、status、error、speakingIds、frameCount、clipCount、audioReady；voice.state 只在这些值变化时发布，voice.options 记录配置操作并携带 operationId。capabilities.voice 表示驱动已配置，不等于数据可用或设备已解锁。

status 区分 unknown/unsupported/empty/idle/loading/ready/partial/limited/error。unknown 不能当作确证无语音。讲话标记按录像活动更新，即使静音仍能显示；其精确度取决于来源 durationSeconds 和身份。语音速度跟随回放 speed，设备时间与界面刷新独立调度。

静音、禁用或零音量取消解码并释放 PCM。选中片段/源切换先停止旧源、取消旧任务；generation 守卫阻止迟到结果写入下一片段。解码器应响应 AbortSignal，SDK 无法强制终止忽略取消的外部进程。示例 Opus Worker 适配器会 terminate Worker，未支持 codec 计入 skipped；worker 的内部解码预算仍为原 128MiB，宿主请求预算还会在结果接收时检查，不能把结果预算称为完整峰值内存上限。

驱动实例应专属一个 viewer，音频上下文可由多个驱动共享。SDK 销毁时停止源/取消计时器/解码，不调用借用驱动的 dispose，也不关闭宿主上下文。宿主在自身生命周期末尾释放 driver/context。另修复 gain 音量未改变时重复添加 AudioParam 自动化的问题。

独立示例提供语音用户解锁按钮、阵营筛选与状态文本；未引入 React 或应用偏好存储。内置真实六回合仍无可读取语音包，已验证公共配置、非法参数、播放控制和多实例清理，尚未真实验收 PCM 播放、取消竞态或音质。

## 应用语音入口统一

应用 useDemoVoicePlayback 采用 createVoicePlaybackController 和共用 Worker 解码适配器，不再维护另一套 React 解码状态、PCM 调度或计时器。旧缓存通过宿主映射为 tick/playerId/durationSeconds/codec/dataBase64/producerFields，解析器字段不进入库。原生产者 skipped/limited 元数据并入解码结果；未知记录和确证 empty 按原缓存元数据区分。

顶栏声音按钮、阵营和音量通过场景公共 viewer.execute({type:'voice.configure',...})，附 origin=ui；公共查询 voice 和 voice.state/voice.options 事件与独立 SDK 使用同一 VoiceState。主应用的 voice.enabled 同时受当前回放工作区与用户开关约束，不能在其他菜单强行启用播放。宿主桥只借用 React 所有者的协调器，场景卸载只取消订阅；React 所有者销毁协调器与自身音频驱动，不关闭共享宿主上下文。

语音偏好与库共用参数校验：只有音量持久化，每次启动默认静音。无效音量/阵营在写入偏好前失败；音量存储成功后发布偏好，再更新协调器。直接公共 unmute 不会解锁设备，声音按钮仍必须在用户操作中调用宿主 unlockVoiceAudio。退出回放立即停止解码/播放及讲话标记，mute/volume 用户选择仍保留在当前会话。

配置与 tick 同步分开，避免每帧静音配置反复取消/清空任务。seekRevision 明确通知语音跳转，普通 tick 同步仍使用音频漂移判断。修复共用协调器关闭 enabled 后讲话标记等待下次 sync 才清空的问题。

## 接口发现与通用工具入口

`viewer.getContract()` 返回 apiVersion、profile、坐标约定、当前注册的命令及 JSON Schema 参数描述、查询名称、事件主题与操作结果约定。命令未注册就不出现在列表中；描述可通过 core 的 contractOverrides 注入宿主扩展。返回值独立复制，调用方不能修改内部目录。

profile=standalone 的 board.apply 描述人物快照，profile=application 的快照和道具记录仍为宿主结构，标记 partial；未知扩展标记 unknown。内置应用与独立命令在权限策略及变更前校验参数 Schema；runtimeValidation=host 标记自定义 profile 或覆盖，由宿主校验。effect 仅为说明，不能当权限控制。应用 camera.reset 还会清除临时画笔，接口描述明确这一副作用。

事件清单是可能发生的主题，并不保证每个宿主均发出；playback.time 采用采样，其余按状态变化通知。公共封套有 type/revision/operationId/origin/payload，内置主题已提供 payloadSchema 和类型；宿主摘要及应用相机扩展标记为 partial。应用不提供独立库的模型对象查询，不能把两者视为完全相同的 API。

createViewerToolAdapter 提供 provider-neutral 的 name/description/inputSchema，宿主自行转换为模型服务要求的工具格式。viewer_execute 仍走 execute、policy、expectedRevision 和 AbortSignal；origin 由宿主创建适配器时指定，调用参数不能覆盖它。只读工具读取状态、能力、接口说明，以及存在时的模型目录/树。不接受任意函数名或直接修改 Three 对象。

默认上下文包含 revision/ready/mapName/selectedId/coordinates/camera/playback/voice/lastAction；workspace 必须显式请求。状态查询不存在的字段返回 unknown_section，未加载模型返回 not_ready，过大的查询返回 response_too_large。默认响应预算为 UTF-8 JSON 256KiB，可配置且至少 1KiB。成功编辑的大返回值标记 valueOmitted，保留成功状态与版本号，避免模型误以为失败后重复执行。工具描述本身没有网络传输，调用方仍应控制提供给模型的目录与上下文大小。

## 中立工作区查询与人物布局

新增 getWorkspace，返回 version=0.1、revision、mapName、coordinates、players、utilities、effects。场景位置为米，rotationY 为弧度；coordinates.origin 用于既有 sourceToScene/sceneToSource 转换。它不是完整存档，不含镜头、画笔、烟雾体素或回放轨迹。旧 getState().workspace 与 board.apply 保持原宿主结构。

players 采用共同字段 id/name/team/position/rotationY/crouched/baseColor；与 workspace.players 命令的输入一致，可直接修改并写回。每次替换最多 256 人，ID 唯一，坐标与角度必须有限，未知字段和 null 配置拒绝。命令替换整个人物列表，不是增量补丁；删除列表中的人物即移除它。编辑前读取 revision，提交时传 expectedRevision。

应用转换层保留匹配 ID 的原有武器、俯仰角等宿主字段，保留镜头、道具、效果和画笔；新人物采用宿主默认装备。独立库沿用原人物布局及默认外观，加载回放时拒绝布局编辑，不会修改解析数据。操作仍经过原权限策略与编辑许可，应用保留撤销。旧存档不迁移，也不改变持久化格式。

utilities 是轻量只读放置记录：id、referenceId（道具记录 ID，匿名为 null）、kind、起点 position、效果位置 effectPosition。effects 是只读示意效果：id、kind、position、range。二者没有写入接口，也不保证独立库有对应能力；独立库当前返回空数组，不将回放投掷误当作可编辑道具。完整道具素材仍由宿主库查找，不能把这个查询当成跨地图完整导入导出。

viewer_get_workspace 工具使用同一查询和响应预算。workspace.playersChanged 事件是本命令的结果通知，payload={players}，参数与事件均使用共用 schema；不是所有 UI 拖拽或旧命令的全集变更通知。其他 workspace.changed 内容仍随宿主不同。该事件配合 operationId/origin/revision 可避免调用方回写造成反馈循环。

库内 createWorkspaceLayout 仅构建通用布局；应用的 workspaceAdapter 负责旧 points/collabUtilities/grenades 字段转换。库不读取 CSBoard 存档格式，也没有引入反向应用依赖。

## 道具引用来源与放置驱动

新增 source.list/load 与同步 renderer.place/move/remove/getPlacements 的共用控制器。source.list 仅返回 referenceId/mapName/name/kind 目录，支持 query/offset/limit（每页最多 100）；load 返回 {asset,release}，asset 包含 referenceId/mapName/position（场景米）和宿主私有 payload。库不解码录像字段。renderer 在同步提交时复制所需数据、拥有创建的场景资源；不得保留租约释放后无效的数据。异步素材准备应放在 source.load，不能在 renderer 的提交中等待。

utility.place 接受 referenceId、可选 id 和 position；utility.move 接受 id/position；utility.remove 接受 id。同一渲染器内 ID 唯一，成功值均为 {id}。旧 utility.add({note}) 保留兼容。新命令按宿主编辑许可执行；无驱动的独立实例不注册命令、查询或相关工具，不能假装具备道具编辑能力。

getUtilityCatalogue 与 viewer_get_utilities 提供不含录像、轨迹或烟体素的目录。utility.placementsChanged 内容固定为 {action,id,placements}，包含全部轻量放置记录；这是新命令的通知，不承诺覆盖拖拽、旧 add、撤销及帧恢复。既有 workspace.changed 仍由宿主定义。

素材加载前后检查取消信号、编辑许可、地图、唯一 ID 和宿主工作区代次；途中工作区发生变化时返回 workspace_changed。加载失败或取消后不提交，成功与失败均释放借用租约。控制器销毁取消它发出的请求；宿主仍拥有来源对象。只读目录不会绕过宿主的数据读取权限，服务端或本地源负责授权。渲染端必须同步、可靠地提交并处理自身构建失败，库没有通用 GPU 回滚事务。

独立 createViewer 可注入 utilitySource 和 createUtilityRenderer({scene,origin,navData,floorState})，两者必须成对提供。返回的 renderer 另需 clear/dispose，由该实例调用；来源不被库销毁。默认不加载道具，也不引入应用素材库。示例第一实例提供明确标记为示意的闪光驱动，第二实例没有道具驱动。这只是驱动示例，不代表录制的投掷或可用点位。

应用适配层按引用查询现有速记，复用原 collabUtilitySceneController：保留真实烟体素、火焰与轨迹。道具移动是整组几何的刚性平移，不重新模拟碰撞或证明投掷有效。renderOrigin 记录原始渲染基准，保存恢复时使用它构建相对几何，再应用当前位置；旧记录缺少该字段时回退到旧 position。轻量工作区查询不再为了道具目录复制体素数据，旧完整存档接口继续提供全部素材。

## 应用道具入口闭环

道具添加链路：UI 添加与既有 AI import_utility 使用 utility.place({referenceId})，不再把整份速记当作命令参数。UI 删除继续使用公共 utility.remove；旧 utility.add 留给未迁移调用方兼容。

道具控制器提供宿主 commit(action)，必须同步调用并返回 action 的结果。异步素材准备发生在此回调之前；应用 onUtilityCommit 将场景修改、事件和 flushCollabSave 放在当前 Yjs doc.transact 内，随后刷新列表。这里不让同步事务跨越 await，也不把事务方法开放为模型工具。无协作文档时直接提交同一动作。

UI 添加期间禁用确认、搜索和选项，仍可取消；请求引用在事件开始时立即锁定，防止双击。取消、帧/地图/存档/房间/菜单变化、卸载均中止请求。失败保留选择并显示错误，成功后关闭选择器。AI 传递 signal 和公共场景版本号，等待放置结束；若完成后用户切换上下文，返回 placementId/contextChanged，避免把已添加的道具误报为失败后再次添加。

## 接入与验收

安装包、独立消费者与桌面主要流程的检查方式见 [测试指南](../tests/README.md)，已验收范围和限制见 [兼容范围](viewer-compatibility.md)。后续以缺陷和实际接入需求驱动，不为抽象而持续扩展；完整生产发布仍需设备与性能验收。

## 标准包读取入口

标准读取器已移入 `@csboard/viewer/format`，独立示例不再从应用 `src/formats` 导入回放来源。数据链路为“解析器 → 标准包 → 标准读取器 → 视图”；来源接口只负责读取生命周期，不引入新的交换格式。入口、输入类型、支持的 profile 与限制见 [兼容范围](viewer-compatibility.md) 和包 README。

## 可配置的相机输入

`createViewer({ input })` 默认使用 `orbit`：左键旋转、Shift + 左键或右键平移、滚轮缩放；不默认开启 WASD、循环鼠标或触控板猜测。`csboard` 显式选择原操作预设，主应用也明确使用它。自定义对象只启用明确配置的动作，不继承遗漏的默认键；`false` 或 `{}` 关闭用户相机操作，API 相机命令仍可用。配置字段和示例见 [视图库 Camera input](../packages/viewer/README.md#camera-input)。主应用也使用同一输入模块；房间、画笔、人员编辑与道具轮盘属于宿主业务快捷键。

键盘采用 `KeyboardEvent.code`，默认仅在画布获得焦点时响应。支持前后左右、升降、加速，以及鼠标旋转/平移的按键组合（例如 Space + 中键抓住地图）。`wheelMode` 支持 `zoom`、`trackpad`、`auto`；默认滚动只缩放，自动猜测仅显式开启。滚动方向和灵敏度可以配置；关闭相机操作不再抢宿主滚动。`getState().input` 可读取独立视图的生效配置。窗口失焦、页面隐藏会清除按键，销毁会移除监听器；循环拖动申请 Pointer Lock，失败时回退到普通拖动。

NAV 几何不添加高度偏移，直接使用原始 Z 并转换单位、减去统一原点；默认抬高量为 **0**。原始 NAV 自身的坡度、楼层高度或与世界模型地面之间的差值不属于人为偏移。拾取、碰撞、楼层与轨迹均使用同一坐标约定。区域效果的防重叠处理只作用于区域显示，不改变 NAV 几何。

[最小接入示例](../packages/viewer/examples/minimal/README.md) 现在提供操作预设选择和本地 GLB 文件导入。外部应用使用 `createGltfResourceLoader`，将自己的文件转为 Object URL，传入 resolver，再执行 `model.visibility`；退出后销毁视图并释放 URL。库不读取本机资源目录或主动弹出文件选择器。


## 外部应用的模型、标记与取点

- 完整地图使用 `resourceLoader` 的 `world-model` 入口，共用材质、楼层、显隐与合批流程。输入为场景轴向的世界米制坐标，不要提前减 NAV 中心。
- 已经转换为场景局部坐标的自定义物体使用 `mountSceneExtension()`，通过 `context.addObject(object)` 加入，默认参与三维深度遮挡；只有显式指定 `{ occlusion: 'overlay' }` 才始终可见。
- 使用 `pickSurface(event)` 与 `projectSource(SourceXYZ)` 复用主视窗的拾取和投影，不需要复制 NAV 或遍历场景查找相机。输入/输出屏幕位置为 CSS 视窗像素，不乘设备像素比。
- 可见地图未命中时不会自动选到墙后的 NAV；隐藏地图或二维模式才回落到 NAV。自定义物体不自动进入地图碰撞数据。
- 俯仰角默认限制在地面上方，可通过相机输入配置的 `minPolarAngle`、`maxPolarAngle`（弧度）调整；这与旋转中心是两项独立行为。

详见[视图库指南中的遮挡与坐标排查](../packages/viewer/README.md#host-geometry-and-picking-avoid-depth-and-coordinate-surprises)。
