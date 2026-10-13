# README screenshots / 截图工具

[构建指南](../../docs/build-guide.zh-CN.md) · [English build guide](../../docs/build-guide.md)

```sh
make readme-shots
```

命令先构建原生组件与当前桌面渲染产物，再使用已安装的 Electron 自动启动隔离桌面实例，载入内置真实 Dust2 示例，再操作回放、道具分析、速记和战术帧，使用英文界面生成 README 预览图片。不需要先手动启动应用，也不重新解析原始 Demo。旧模板直接运行 Node 时需要已有 `build/renderer`；包含本地协作场景的模板会自动构建临时服务配置，结束后恢复原有渲染产物。

The Make command builds native components and the desktop renderer, launches an isolated profile with the bundled real replay, then captures replay, analysis, saved lineups and tactical editing in English without activating its window. It does not reparse a raw Demo. Older templates need existing desktop build assets for direct Node invocation; collaboration templates build a local service configuration and restore the original renderer afterward.

## 可选项 / Options

```sh
# 建筑模型可选；仅复制进隔离目录，不修改原文件。Must be a Dust2 GLB.
make readme-shots ARGS='--model "/absolute/path/de_dust2.glb"'

# 默认写入 .local/readme-screenshots/run-*，结束后询问是否覆盖，默认否。
# Default: ignored preview directory; ask before replacing docs, default No.
make readme-shots

# 验收 / CI：只生成预览，不询问。Capture only, no prompt.
make readme-shots ARGS='--no-publish'

# 明确要求覆盖文档；也可另选预览输出目录。Explicit publication / preview output.
make readme-shots ARGS='--publish'
make readme-shots ARGS='--out .local/readme-preview --no-publish'

# 自定义模板；调试时保留隔离数据。Custom template / preserve debugging profile.
make readme-shots ARGS='--template config/screenshots/readme.json --keep-profile'
```

首次通过 `--model` 指定的来源会在成功后记到忽略的 `.local/readme-screenshots.json`；之后直接 `make readme-shots` 会复用这条路径。删除该本地配置即可恢复无模型截图。模型文件不提交、不移动。

不指定模型也能截图：NAV 随应用提供，图中不伪造建筑资源。工具不读取日常存档、密钥或用户配置，不连接公共协作房间，不改原始 Demo；隔离目录在完成后清理。截图所用应用仍执行正常启动逻辑，公共地址沿用构建配置。

Models are optional. Without one, screenshots show bundled NAV. The tool never reads your normal profile or opens a public collaboration room. It only copies an explicitly supplied model; temporary profiles are removed unless requested.

## 向后兼容 / Compatibility

- `readme.json` 的 `version: 1` 是模板合同；未来新增模板版本必须显式迁移，不能静默重解释旧模板。
- 保留 `round-replay.png`、`analysis.png`、`utility-notes.png`、`collaboration.png`，旧 Markdown 图片链接继续有效。
- 模板优先使用稳定 CSS 锚点，按钮文案提供中文/英文别名。界面改名时调整模板，无需改变输出路径。
- `click`、`focus`、`blur`、`input`、`range`、`select`、`wait`、`pause`、`repeat`、`wheel`、`pointer`、`hover` 描述真实界面操作；`range.offset` 相对 min，回放沿用 tick 单位；`range.fraction` 表示进度范围内的比例。
- `ready` 和 wait 表达式必须确认业务画面加载完成。不要通过隐藏错误、替换 DOM 或修改 React 私有状态“修好”截图。
- 缺少控件、场景超时或渲染异常会终止；所有场景都成功后才允许选择覆盖。失败截图、日志和文本留在 `.local/readme-screenshots/run-*`。

Template v1 and output filenames are stable. UI selectors or wording can evolve through aliases and template updates. Readiness guards must verify real scene state. A failed batch leaves existing README images untouched. Capture manifests record the application version, source, time, scene text, public viewer state, command results and bounded event history; inspect the actual images before committing them.

## 更新场景

编辑 `readme.json` 的 setup/scenes，即可调整时间点、筛选和操作顺序。同一批图片共用临时实例，场景按顺序执行；道具速记来自前一张分析推荐，战术帧来自实际回放。更换内置示例或缓存结构时同步更新准备逻辑，不降低校验门槛。不要提交原始游戏模型或本地 profile。

## 本地协作场景 / Local collaboration

模板可设置 `collaboration: true`，再用 `collaborate` 操作开放本机房间并启动第二个独立桌面客户端。两个客户端各有隔离存储，使用项目实际 Yjs 协议；第二个客户端通过房间号加入并复制战术帧，首个客户端必须收到同步更新与两人在线状态后才截图。不会伪造参与者、连接生产房间或修改应用 DOM。服务仅监听 loopback，完成后关闭。

Set `collaboration: true` and use the `collaborate` action for two real desktop clients with separate profiles. The second joins through the UI and duplicates a frame; capture requires synchronized frames and two participants. The local server reuses the application's Yjs protocol and closes afterward. Existing v1 templates without collaboration continue to work.

## 北向接口与交互验收 / Northbound API and interaction checks

工具启动使用不抢焦点的隔离桌面窗口，不要求窗口处于前台，也不触碰日常实例。仅未打包的开发实例在 `CSBOARD_AUTOMATION=1` 时开放自动化宿主端口；正式应用不开放。传输调用已有 viewer 的 `execute/getState/getWorkspace/getCapabilities/getContract`，沿用命令校验、权限、revision 和事件，不另写一套业务逻辑。

模板可以混用：

```json
{ "action": "command", "command": { "type": "camera.mode", "mode": "2d" }, "expect": "window.csboardAutomation.getState().camera.mode === '2d'" }
```

- `command`：执行已注册的公共命令，失败立即终止；`expect` 等待公开状态符合预期；`expectDelta: {expression, delta}` 验证操作前后的数值变化。报告记录结果与事件。
- `draw`：`points: [[x, y], ...]` 发送真实鼠标笔画，并确认公开工作区增加笔画。
- `key`：`key/code/keyCode` 发送真实快捷键；`up: true` 松开。场景 `after` 在截图后执行清理操作，例如释放 Q。
- 应用宿主尚未注册的回放时间、分析筛选和列表操作继续走真实 UI。不要将独立 viewer 的能力误认为应用已注册，也不要绕过宿主状态。
- 当前模板通过公共相机命令准备 2D/3D 场景，通过真实画笔再执行公共撤销/重做并检查状态；多人场景检查真实同步并捕获按 Q 出现的道具轮盘。

Inactive development windows use the existing northbound viewer contract for scene commands, state and event evidence. UI-specific filters remain real interactions. Production packages do not enable the automation transport. On an interactive terminal, the completed tool asks whether to replace README assets; No is the default. Non-interactive runs only retain previews unless `--publish` is explicitly supplied.
