# CSBoard

> 集 3D 战术板、CS2 Demo 回放、数据分析和实时协作于一体的浏览器工具。

[English README](README.md)

![CSBoard 使用演示](assets/readme/demo.gif)

CSBoard 将 CS2 地图与 Demo 文件转换成可交互的战术工作区，在同一个应用中提供战术编辑、回合回放、玩家与道具可视化、事件时间轴、空间分析、本地存档以及基于 Yjs 的多人协作。

## 主要功能

### 回合浏览

![回合浏览](assets/readme/round-replay.png)

- 导入单个 Demo，或多选 Demo 分片并合并为一场比赛。
- 通过 Rust/WASM 一次性解析全部回合，之后从内存缓存即时切换回合。
- 从冻结结束开始回放玩家移动、击杀、死亡、武器、血量、道具、C4 状态和事件标记。
- 使用简化的站立/蹲伏人物模型，并显示 yaw、pitch、动态视点高度和 BVH 加速的视线墙体碰撞。
- 跟踪 C4 携带、掉落、安装、爆炸、拆除、近似掉落轨迹和炸弹倒计时。
- 保存当前帧，将当前玩家和生效道具转换成可编辑的战术板对象。

### 战术编辑

![战术编辑](assets/readme/collaboration.png)

- 放置 T 或 CT 战术点（仅限协作面板）。
- 在回合浏览/数据分析/道具速查面板左键拖拽绘制手绘笔迹，支持撤销与重做。
- 编辑点位阵营、符号类型、方向、视线长度和垂直倾角。
- 放置和调整烟、火、闪、HE 与诱饵弹效果。
- 每张地图保存 10 个镜头预设，并通过 `1-9` / `0` 快速恢复。
- 本地存档可保存人物、道具、画笔、镜头预设和可选的 Demo 当前帧引用。

### 道具速记

![道具速记](assets/readme/utility-notes.png)

- 可通过粘贴 `getpos` 输出或从 Demo 投掷中保存地图专属道具记录。
- 支持搜索和重播站位、视角、投掷者、事件及投掷物轨迹。
- 可直接编辑道具标题和描述。
- 支持将道具库导出为 JSON，也可将 JSON 数据附加导入本地道具库。
- 导入时按整条记录深度比较，完全相同的数据只保留一条。
- 向协作帧引入道具时，必须先选择并确认；引入道具与 `Q` 轮盘创建的自定义道具保持两套独立数据逻辑。

### 数据分析

![数据分析](assets/readme/analysis.png)

- 选择一个或多个选手，将所有回合从冻结结束开始同步叠加。
- 按全部回合、T 方回合或 CT 方回合筛选。
- 查看同步移动路径和聚合空间热力图。
- 展示击杀者位置、死亡者位置、目标位置以及交战对手位置。

### 多人协作

![协作面板](assets/readme/collaboration.png)

- 创建或加入 6 位房间号的 Yjs WebSocket 房间。
- 同步人物、引入道具、自定义道具、画笔、帧顺序和当前帧。
- 人物点带人物模型、AK47 与唯一三位十六进制名称；可拖动移动，使用 `Ctrl` 调整 yaw、`Shift` 调整 pitch，双击切换蹲下/站立。
- 每帧包含人物、引入道具、自定义道具、轨迹和画笔；当前相机与镜头预设属于存档级数据，不属于单帧。
- 支持插帧、复制、删除、保存和切换；保存到已有存档会追加一帧，切帧时同名人物的位置、yaw 和 pitch 平滑过渡。
- 人物、道具、画笔、引入和擦除共用统一撤销/重做，并按帧隔离历史。
- 房间成员可以共同编辑战术内容，同时各自当前摄像机保持私有。
- 支持房主销毁房间和成员离开通知。
- 可使用本地存档快速创建协作战术板。

### 地图渲染

- 从云存储加载受支持地图的 CS2 数据（在浏览器内解析），并限制编辑内容落在可达表面。
- 从云存储加载 GLB 地图模型，并调节模型透明度。
- 支持可达表面、鼠标透镜和摄像机透镜三种模型显示方式。
- 使用 `three-mesh-bvh` 高效查询视线最近墙体碰撞。
- 支持 Blender 风格鼠标控制、触控板手势和 WASD 移动。

### 界面信息

- 运行时切换中文和英文界面。
- 查看实时 T/CT 比分、成员、血量、当前武器、剩余道具、死亡状态和 C4 携带者。
- 从时间轴直接跳转到击杀、C4 安装、爆炸和回合结束事件。

### 手机 / H5

![移动端协作](assets/readme/mobile.jpeg)

- 使用独立移动端布局：上方为 4:3 Three.js 视窗，下方为操作面板。
- 单指拖动旋转镜头，双指支持缩放与平移。
- 3D 视窗底部覆盖可循环转动的 iPhone 相机风格半圆机位轮盘。
- 可点按已保存机位恢复视角、循环转动选择机位、上滑保存中心机位，也可选择 `RESET`。
- 协作帧列表位于操作区顶部并支持吸顶，方便快速切换。
- H5 隐藏回合浏览、数据分析、地图工具、画笔工具、触控板设置和模型透镜模式，仅保留道具速记与协作功能。

## 支持地图

仓库内包含以下地图的文件：

- Ancient
- Anubis
- Cache
- Dust II
- Inferno
- Mirage
- Nuke
- Overpass
- Train
- Vertigo

GLB 地图模型不会提交到仓库。需要本地 `.nav`/`.glb` 时运行 `make resources` 下载到 `public/maps/<map>/`；Workers 应用运行时从云存储加载生产地图资源。

## 开始使用

环境要求：

- Node.js 20 或更高版本
- npm

安装依赖：

```bash
npm install
cp .env.example .env.local
```

在 `.env.local` 中填写你自己的 `VITE_OSS_BASE_URL`，然后运行 `make resources` 下载缺失的本地地图。也可以仅为下载命令设置 `MAP_DOWNLOAD_BASE_URL`；仓库不提供默认下载源。

构建前端，并通过默认 Node.js Runtime 启动 API 与协作服务：

```bash
npm run dev
```

默认开发命令会在 `3001` 端口启动传统 Node.js HTTP/WebSocket 适配层。需要测试 Cloudflare Workers Runtime 和 Durable Objects 集成时，使用 `make workers-dev` 或 `npm run dev:workers`；该命令还会在 `3002` 端口启动本地地图服务，确保 NAV/GLB 继续读取 `public/maps`。运行 `make help` 可查看安装、资源、前端、后端和 Workers 的主要命令。

相同的 API 与 Yjs 协议核心也可以通过传统 Node.js HTTP/WebSocket 入口运行：

```bash
make node-dev
# 或：npm run dev:node
```

Node.js Runtime 适配层监听 `PORT`（默认 `3001`），并从 `process.env` 读取 `MAP_BASE_URL`。Cloudflare Workers 适配层使用 `env.MAP_BASE_URL` 和 Durable Object Storage；共享路由、解析和协议逻辑位于 `server/core/`。

构建生产版本：

```bash
make build
```

该命令会将前端构建到 `dist/`、校验 Node.js Runtime 适配层，并将 Cloudflare Workers bundle 输出到 `build/workers/`。

## 操作方式

| 输入 | 操作 |
| --- | --- |
| 中键拖动 | 旋转镜头 |
| `Shift` + 中键 | 平移镜头 |
| 鼠标滚轮 / 触控板手势 | 缩放或环绕 |
| `W A S D` | 移动镜头 |
| 左键拖拽（回合浏览/数据分析/道具速查） | 在地面绘制手绘笔迹 |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | 撤销 / 重做画笔笔迹 |
| `E` | 放置战术点（仅协作面板） |
| `Ctrl` + 左键拖动 | 擦除画笔笔迹，或调整人物 yaw |
| `Shift` + 左键拖动人物 | 调整人物 pitch |
| `Q` | 打开道具轮盘 |
| 左键点击点位 | 打开点位编辑器 |
| `Ctrl` + `1-9` / `0` | 保存 10 个镜头预设之一 |
| `1-9` / `0` | 恢复镜头预设 |
| `Space` | 播放或暂停回放/分析 |
| 方向键 | 在当前回合中步进 |
| 手机单指拖动 | 旋转镜头 |
| 手机双指手势 | 缩放并平移镜头 |
| 手机机位轮盘滑动 | 循环选择机位；上滑保存中心机位 |

## 资源结构

```text
assets/
  readme/                 # README 截图与演示 GIF
public/
  maps/
    <map>/
      <map>.nav           # 本地开发数据，由 Git 忽略（通过 `make resources` 下载）
      <map>.glb           # 本地开发数据，由 Git 忽略（通过 `make resources` 下载）
```

`public/` 目录整体被 Git 忽略。运行 `make resources` 时，`scripts/ensure-maps.js` 会检测各地图资源，并从 `.env.local` 的 `VITE_OSS_BASE_URL`（或 `MAP_DOWNLOAD_BASE_URL`）下载缺失文件。未配置下载源时命令会明确报错。

开发模式（`import.meta.env.DEV`）下从本地 `public/maps` 加载：`/maps/<map>/<map>.nav`、`/maps/<map>/<map>.glb`。
生产构建（`vite build`）则直接使用云存储地址：

- `<VITE_OSS_BASE_URL>/maps/<map>/<map>.nav`
- `<VITE_OSS_BASE_URL>/maps/<map>/<map>.glb`

NAV 以原始字节拉取并在浏览器内解析（`src/navParser.js`）。存储桶需返回 `Access-Control-Allow-Origin` 头。旧的 `/api/maps/:map/nav` 接口仅作为回退，运行时非必需。

地图导出工具和原始游戏资源继续仅保存在本地。请勿提交 VPK、解包后的游戏资源、Demo 文件或 GLB 模型。

## 技术架构

- React 与 Vite：应用外壳和界面。
- Three.js：地图、战术对象、效果和回放渲染。
- Rust/WASM `demoparser2`：解析 Demo 事件、Tick、玩家、库存和投掷物。
- `three-mesh-bvh`：地图射线检测加速。
- Yjs 与 `y-websocket`：协作房间协议。
- Node.js Runtime：传统 HTTP/WebSocket 服务入口。
- Cloudflare Workers Fetch API：后端 Worker 提供 HTTP 路由，前端 Worker 提供静态资源。
- Durable Objects：云端房间 WebSocket 与短期 Yjs 持久化。

## Cloudflare Workers 部署

```bash
npm install
cp deploy.cloudflare.env.example deploy.cloudflare.env
make workers-deploy
```

在 `deploy.cloudflare.env` 中填写 Cloudflare Account ID、前后端 Worker 名称、OSS 根地址、后端公网地址和两个可选自定义域名。建议通过终端环境变量或 CI Secret 提供 `CLOUDFLARE_API_TOKEN`。

部署脚本先部署后端 Worker（API、房间 WebSocket 和 Durable Objects），再部署前端 Worker（Workers Static Assets）。它会把与平台无关的 `VITE_OSS_BASE_URL` 和 `VITE_BACKEND_BASE_URL` 写入已忽略的 `.env.production.local`，其中 `BACKEND_PUBLIC_URL` 会被嵌入前端用于连接独立后端服务。

## 当前限制

- Node.js Runtime 的协作房间保存在进程内存中；Cloudflare Workers 使用 Durable Object Storage，并在最后一个客户端离开五分钟后清理。
- 房主身份目前主要由客户端管理，尚未使用服务端签发的 owner token。
- 解析器没有暴露 C4 实体逐 Tick 坐标，因此掉落轨迹只能根据事件近似。
- 生产环境地图 NAV 与 GLB 依赖云存储可用；开发模式使用 `public/maps/` 本地数据（缺失时自动下载）。
- Demo 初次解析后会缓存全部回合，大型 Demo 可能占用较多内存。
- 回合浏览和数据分析仅在桌面端提供；H5 提供道具速记与协作。

## 未来方向

### 模型尺寸缩减

- 缩减地图模型资源体积、下载开销和运行时内存占用。

### 地图区域标记

- 在支持的地图中标记 C4 安放区域和双方出生区域。
