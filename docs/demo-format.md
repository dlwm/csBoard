# Demo 数据格式接入

本页记录 `feature/demo-format` 的当前实现。应用版本仍为 1.21.2；这些改动尚未发布。

## 使用方式

对局回放的文件工具区提供「导入数据包」「导出数据包」，支持取消并显示进度。
数据包扩展名为 `.cs2df`，内部是 ZIP。导入后进入原有本地回放列表，不替换原始 Demo、已有缓存或存档。

- **导入**：支持 `cs2-demo-format/3.0` 完整数据包，以及 fork 的 `cs2-demo-format/replay/0.1` 回放草案。
- **导出**：导出回放草案，保留源数据实际提供的帧、准备动作、道具效果和语音。不生成未经计算的 v3 完整统计。
- **执行**：桌面使用后台进程，浏览器使用 Worker；两者调用同一套格式任务和适配器。已有移动壳使用相同计算接口。
- **存储**：逐片段写入，全部成功后才发布目录项；失败或取消会清理本次导入。

## 数据流与边界

```mermaid
flowchart LR
  G[Go native / WASM / embedded] --> N[共享 Go 适配器]
  N --> R[现有回放数据]
  R --> E[回放格式生产适配器]
  E --> P[数据包]
  P --> V[v3 / 回放草案消费适配器]
  V --> C[现有缓存接口]
  C --> UI[回放与分析]
```

解析驱动负责运行解析器；格式适配器负责语义转换；计算驱动负责后台执行；存储驱动负责读写。
格式模块不调用 Electron、DOM、Yjs 或 AI。UI 只注入计算、缓存和打开回放的接口。
本次没有将已有解析缓存整体改为 ZIP，也没有提取独立 3D SDK。

## 字段对照

| 数据 | v3 导入 | 回放草案 | 当前应用映射 |
| --- | --- | --- | --- |
| 地图、时间基准、采样率 | manifest / replay meta | manifest | Demo 元信息 |
| 玩家身份、每帧阵营 | 字典与 tracks | players / frames | 玩家快照 |
| 位置与视角 | 解码增量并应用缩放 | Source XYZ / yaw / pitch | raw 坐标与渲染坐标 |
| 生命、装备与动作状态 | 仅提供的 track 字段 | 可空的显式状态字段 | 玩家状态；未知值保留为空 |
| 回合或任意录像片段 | replay rounds | segments、kind | 对局或自制 DEMO |
| 冻结阶段 | 未提供冻结帧 | startTick / activeStartTick | 冻结开始与默认播放起点 |
| 投掷前准备与按键 | 未提供 | preparationFrames / input | throwSnapshots |
| 道具飞行 | grenade events / tracks | projectiles | projectile 轨迹 |
| 实际烟体与火焰 | 未提供 | smokeFrames / fireFrames | Uint16 体素 / Float32 火焰数组 |
| 语音 | 未提供 | Opus voiceFrames | 压缩语音包与说话者 |
| 击杀、伤害、炸弹等事件 | 各类事件文件 | events | 现有事件模型 |
| 分析采样 | 从回放生成 2 Hz 索引 | 可选 analysis 文件 | 分析缓存 |
| 对局统计与原始 v3 文件 | 保留 formatFacts | 不要求虚构统计 | 附加来源事实 |
| 其他源字段 | 按合同读取 | namespaced producerFields | 适配器处理 CSBoard 附加字段 |

### 坐标、时间与身份

- 包内坐标为 Source 2 世界单位，按 `x, y, z` 排列。渲染坐标由适配器统一转换为米：`(y, z, x) × 0.0254`。
- tick rate 与采样率独立；保留负 tick、语音小数 tick，以及投掷准备帧。当前应用 UI 仍仅接受 64 tick 时间基准，其他值明确拒绝。
- `startTick` 为片段播放起点，`activeStartTick` 为默认进入位置，`endTick` 为结束；准备帧可以早于起点。
- 玩家 ID 在包内稳定；优先 Steam ID，其次 user ID。只有名字的旧数据使用名字兜底，无法保证同名玩家唯一。
- 可空位置表示未观测到，不能当作世界原点。阵营按帧记录；不将账号绑定为永久 T 或 CT。

### 缺失与兼容

能力声明区分 `available`（有数据）、`empty`（已知为空）、`unavailable`（来源不支持）、`unknown`（来源未声明）。
没有语音或烟体文件不等于本局没有讲话或投烟。UI 的降级效果也不等于源数据的真实效果。

v3 的枚举、增量轨迹、坐标缩放和角度缩放由 v3 适配器处理；新回放草案不改变 v3 必需文件。
普通回放的玩家、事件、道具和语音事实有中立字段；`producerFields` 只补充尚未纳入合同的信息。
事件类型暂保留生产者名称，通用事件注册表留待上游讨论。

## 合同来源与维护

依赖固定到 `dlwm/cs2-demo-format` 的已审阅提交，不追随浮动 master。
当前回放扩展在 `.local/demo-format` 的 `feature/replay-profile`，已在本地提交到 fork 的 `feature/replay-profile`（64a9deb），尚未推送，也未经上游接受。
合同快照记录本地 revision、源码 SHA-256 和是否有合同文件未提交的 `draft` 标志。依赖下载仍固定到已在远端的基础提交；本地提交标识不代表已推送或已发布。

```sh
# 从项目内已保存的合同快照重新生成静态校验器，不依赖 .local
make format-contracts

# 修改 fork 的权威 schemas 后，更新快照、fork JSON Schema 和校验器
make format-contracts ARGS="--source .local/demo-format"
```

权威定义在 fork 的 `schemas/index.ts`；CSBoard 的 JSON 快照与校验器是生成物，不手工修改。
校验器在构建期编译，运行时不需要 eval，不修改 CSP。同步本地 fork 需要支持 TypeScript stripping 的 Node 24。
发布草案前应先提交 fork，再固定新 revision 并同步快照。包版本、格式版本、未来 viewer API 版本分别管理。

## 当前限制与后续

当前交换边界为压缩包 256 MiB、展开总量 512 MiB、单文件 64 MiB、最多 2048 项。
这些值位于格式 IO 模块；过大的片段或分析文件会明确拒绝，尚未提供二进制轨迹或分析分块。
导入验证结构、文件路径、引用、轨迹顺序和支持的地图，但不证明来源可信或物理真实性。

已完成格式交换的第一阶段；Go 已接入[通用解析会话接口](parser-interface.md)。其他解析器实现、独立数据源、3D viewer、命令与事件 API、AI 公共接口仍按 [路线图](../ROADMAP.md) 推进。
