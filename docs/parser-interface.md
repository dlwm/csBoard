# 通用解析接口

状态：`feature/demo-format` 的执行接口草案，API 版本 `0.1`。未发布独立解析 SDK。
类型声明在 `src/demo/parsers/session.d.ts`；实现入口在同目录的 `session.js`。
这份执行合同与 `cs2-demo-format` 的持久化/交换合同分别管理。

## 分层

| 层 | 责任 | 当前实现 |
| --- | --- | --- |
| 宿主任务驱动 | 输入权限、后台任务、进程或 Worker、强制取消、写缓存 | process / WASM / embedded 驱动 |
| 传输 | 初始化引擎、打开源、传输请求与响应、底层关闭 | Native client / Go WASM bridge / 移动插件 |
| 解析器适配器 | 属性与枚举映射、源身份、缺失值、武器恢复、道具网络状态解码 | `createGoParserEngine` |
| 会话接口 | 来源 ID、能力、查询、分批交付、取消检查、生命周期 | `ParserSession` |
| 应用编排 | 分片拼接、回合/录像策略、采样计划、渲染坐标与缓存输出 | `createDemoParser` |
| 交换适配器 | 将统一回放事实与标准数据包互转 | v3 / replay profile 适配器 |

上层通过 `createDemoParser({ engine, postMessage })` 注入解析器，不再接收一组 Go 的 `parseTicks/prepareTicks/releaseTicks` 回调。
属性路径和列式压缩只在 Go 适配层内使用，应用请求 `replay`、`analysis`、`preparation` 等语义 profile。

## 公共形态

```ts
interface ParserEngine {
  readonly info: ParserInfo;
  open(source: unknown, options?: { signal?: AbortSignal }): Promise<ParserSession>;
}

interface ParserSession {
  readonly parts: readonly ParserPart[];
  readonly capabilities: ParserCapabilities;
  getMetadata(query?): Promise<ParserMetadata>;
  listSegments(query?): Promise<DemoSegment[]>;
  readEvents(query?): AsyncIterable<EventObservation[]>;
  readFrames(query): AsyncIterable<PlayerSample[]>;
  readUtilities(query?): AsyncIterable<UtilityObservation>;
  readProjectiles(query?): AsyncIterable<UtilityObservation>;
  readEffects(query?): AsyncIterable<UtilityObservation>;
  readVoice(query?): AsyncIterable<VoiceBatch>;
  prepareFrames?(query): Promise<{ preparationTicks: number[] }>;
  releasePreparedFrames?(): Promise<void>;
  dispose(): Promise<void>;
}
```

`source` 是宿主传输拥有的输入描述符；会话核心不直接打开路径、系统文件选择器或游戏资源。
现有宿主仍可以传入字节缓冲区、已有移动来源描述符或绑定好的本机文件来源。
多个 part 使用独立本地时间轴。单 part 可以省略 `partId`；多 part 必须明确指定。
分片对齐、重叠去除和录制片段串联是应用编排策略，不在 Go 传输里执行。

## 读取示例

```js
const session = await engine.open(source, { signal });
try {
  const partId = session.parts[0].id;
  const metadata = await session.getMetadata({ partId });
  const segments = await session.listSegments({ partId, kind: 'match' });
  const segment = segments[0];
  for await (const batch of session.readFrames({
    partId, profile: 'replay',
    startTick: segment.activeStartTick, endTick: segment.endTick,
    tickStep: Math.max(1, metadata.tickRate / 8), signal,
    onProgress: value => console.log(value.completed, value.total),
  })) {
    // batch 是 { tick, player } 样本数组，宿主按 tick 装配快照。
    consume(batch);
  }
} finally {
  await session.dispose();
}
```

可直接传 `ticks`，或用 `startTick/endTick/tickStep`。不要求所有引擎实现相同解析算法。
Go 支持先准备投影，再查询缓存；其他引擎可以直接读取或流式解析，省略 `prepareFrames`。
准备计划只优化执行，不定义回放事实；投掷准备帧仍单独保留。

## 语义约束

- 元信息使用 firstTick/lastTick、broadcast、standardRoster 等语义字段，未知判定为 null；其他适配器无需输出 Go 的头部字符串字段。
- `raw` 为 Source 世界单位 XYZ，不含 Three.js 坐标。应用边界转换为 `(y,z,x) × 0.0254` 米。
- 视角单位为度。帧采样 tick 为整数；事件、语音可保留其源时间精度。
- `PlayerObservation.id` 是来源身份；`steamId` 是真实账号 ID 或 null。旧兼容字段 `steamid` 可包含 `bot:...`，不得把它当作真实 Steam 账号。
- 玩家数量不固定，缺少账号的 bot 使用来源身份。只有名字可用的来源仍有同名/改名歧义，适配器应提供更稳定的身份。
- 未观测的状态保留 null；位置需同时检查 `hasPosition`。按键需检查 `inputAvailable`，不能将空 movement 当作已观测到静止。
- 事件核心字段包括 type、tick、actor/target/assistant、position、positionRole、weapon、damageHealth；区分人员坐标与效果坐标，不拿落点冒充投掷者位置。attributes 保留尚未统一的事件附加事实，当前应用用桥接函数恢复已有事件模型。
- 道具输出区分 projectile、smoke、fire 和 throw 状态。烟体为 Uint16Array，火焰为 Float32Array，语音保留 Opus Base64，不默认解压 PCM。
- `readUtilities` 一次交付完整道具日志，适合同时需要轨迹与实际效果的消费方。单独调用 `readProjectiles/readEffects` 是过滤视图，不保证多个独立查询只遍历一次。
- 当前道具字段沿用统一回放事实中的实体 ID 与 Source 2 类型名；不是最终的 viewer SDK DTO。交换包由格式适配器转换。

## 能力、取消与错误

`capabilities.*.supported` 表示适配器是否能执行某类读取，**不表示这个文件必然包含对应数据**。
解析结果另有 `formatCapabilities`，区分 available、empty、unavailable、unknown。
Go 的 events 能力列出 eventTypes；请求未采集的事件类型会明确拒绝，不返回误导性的空结果。
没有读到按键仍标记 unknown；不支持某能力不能冒充已知为空。

共享会话拒绝已关闭会话、未知来源和未知查询字段；错误包含 code、message 和 details。
Go 请求失败保留引擎、方法及源错误信息。主要错误码为 `session_closed`、`session_busy`、`unknown_source`、`unsupported_capability`、`invalid_query`、`invalid_source`、`parser_failure`。

signal 在请求和批次边界检查；中止结果不会继续交付。强制打断正在同步运行的 Go/WASM 调用，由宿主终止进程或 Worker。
`dispose()` 幂等，停止新读取、等待当前请求结束、释放准备缓存，再调用传输关闭钩子。
WASM 的运行时和 Go 堆仍由其 Worker 拥有，关闭会话不等于释放整个 WASM 实例。

## 添加另一种解析器

1. 实现 `ParserEngine.open`，绑定该引擎的传输；不往应用编排里添加引擎分支。
2. 将属性、身份、枚举和缺失值转换为接口声明中的观测值，不输出库专属属性路径。
3. 使用 `createParserSession` 包装操作，声明能力；需要的方法不存在或不支持时明确报错。
4. 按 profile 提供字段投影，分批交付样本。若内部必须全量解析，缓存属于会话，不暴露内部准备/释放协议。
5. 对真实对局、自制录像、多个 bot、断线/死亡字段缺失与实际道具效果检查数据，不补造不存在的语音或输入。
6. 由宿主选择该 engine，复用编排、缓存、回放和格式交换路径。

Rust 可以使用 WASM 或原生传输实现同一接口，无需恢复旧 Rust 依赖。本次没有新加第二种解析器，也没有发布 viewer/AI 公共 API。

## 当前限制

应用编排仍要求 64 tick 时间基准；其他时间基准会明确拒绝。
Go 每个 frame 批次最多请求 512 个 tick，实际返回的玩家样本数可以更多。
事件与语音在 Go 端已有缓存；目前语音传输仍先读取整个日志，再向公共接口分批交付。道具按页读取。
本次保留既有应用事件类型和装备恢复策略；全面的通用事件注册表及所有字段的严格标准化仍需后续演进。
