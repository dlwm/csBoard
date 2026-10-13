# 视图库兼容范围

当前是 `@csboard/viewer` 私有实验包，API `0.1`，不是已发布的稳定 SDK。应用版本和 API 版本分别维护；后续改变字段仍需明确迁移说明。

## 公共边界

| 接口 | 约定 |
| --- | --- |
| `./format` | 直接打开 replay/0.1 标准 ZIP；不依赖应用缓存转换；v3 统计包不作为完整回放 |
| `execute` | 结构化结果；宿主审批、取消、版本检查；来源仅为记录，不是认证 |
| `getContract` | 只描述已注册命令；以 profile 和 partial/unknown 区分宿主差异；不能代替运行时校验 |
| `getWorkspace` | 布局 0.1：地图、场景米坐标、弧度、人物、轻量道具引用与示意效果 |
| `workspace.players` | 替换人物列表；不替换宿主完整存档；回放只读 |
| `getUtilityCatalogue` | 仅配置来源时提供；目录不包含录像和体素素材 |
| `utility.place/move/remove` | 配置驱动后提供；成功值为 `{id}`；move 是刚性平移 |
| `voice.configure` | 默认静音；设备权限、解码与来源属于宿主 |
| `dispose` | 同一实例重复调用安全；释放该实例资源，不销毁宿主来源或共享音频设备 |

普通调用必须检查 capabilities/commands。独立和应用 profile 的旧 `getState().workspace`、`board.apply`、道具原始素材仍不相同；不得直接跨宿主交换完整快照。摄像机、模型资源、回放驱动的详细范围见 [集成文档](viewer-library.md)。

## 事件与版本

事件共用 `{type,revision,operationId,origin,payload}`。有明确共用内容的布局通知是 `workspace.playersChanged` 和 `utility.placementsChanged`，只覆盖相应公共命令；旧 UI 操作、撤销或恢复使用宿主通知。其余主题的内容以现有类型/文档和具体宿主为准，不承诺发现清单中的所有事件在每种宿主都会发生。

远端工作区恢复递增公共 revision，origin 为 remote；本地宿主恢复为 host。外部编辑应携带读取时的 expectedRevision，冲突后重新读取，不能盲目重复编辑。异步道具加载还受独立工作区代次保护。

## 宿主责任

宿主提供 NAV、地图资源、数据来源、道具素材/渲染驱动、音频权限、存储、联网和模型服务。借用道具租约在同步场景提交后释放；渲染器需复制数据并拥有资源。协作事务只包裹同步提交，不能跨 await。

地图编辑 UI、房间传输、存档界面、应用模型策略可以留在宿主。独立消费者不需要 React 或 CSBoard 面板。Three.js 与 three-mesh-bvh 是 peer dependencies；代码使用 GPL-3.0-only，包内带许可证。

## 当前验收

独立消费者只复制包代码并使用包名导入，提供自定义 NAV；构建拒绝应用模块依赖，实际渲染、编辑、2D 切换和多实例销毁通过。真实本地 WebSocket 下，桌面与网页同步道具放置、移动、删除、撤销和重新加入，保留引用与体素；旧 revision 被拒绝。

这些是构建和实际操作验收，并不等同于完整单元测试、负载测试、跨设备性能基准或稳定 SDK 发布。暂未验收生产网络断线恢复、权限攻防及全部相机/模型输入组合。

## 标准数据读取

`@csboard/viewer/format` 导出 `openReplayPackageSource(File | Blob | Uint8Array | ArrayBuffer, {signal})`。读取器校验标准包、立即读取目录与人员，并按需解压片段与事件，输出可直接交给 viewer 的读取来源。来源接口描述读取、取消和销毁，不定义第二套数据格式；轨道保留 replay/0.1 标准字段。

读取和导出共用同一份编译期生成的格式校验。CSBoard 的 v3 与旧缓存转换继续由应用承担。宿主负责提供 NAV 和可选模型，并在视图不再使用来源后调用 `source.dispose()`。当前整段 JSON 仍需在内存中解码，不宣称逐行流式读取或任意大小包支持。

独立标准包接入已用真实 Dust2 第 17–22 回合验证：消费者通过包名导入，构建拒绝应用模块依赖，第 22 回合显示人物与道具轨迹，播放推进、拖动、切换回合和关闭清理通过。最小接入示例位于 `packages/viewer/examples/minimal`；示例不包含应用音频解码或历史字段扩展适配，不代表这些可选功能已验收。
