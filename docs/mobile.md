# 移动端与平台适配

原生移动端与 H5 均采用横屏，手机与平板共享工作区布局。原生应用保留完整功能；手机和平板浏览器仅提供道具速记与协作，不开放 Demo 导入、回合浏览、分析或导播。触控与鼠标键盘同时保留，布局不依据鼠标是否连接切换。

## 平台服务

```text
共享界面 / 领域命令 / Three.js / Yjs
                 │
          composePlatform
       ┌─────────┼─────────┐
     应用壳    解析引擎    存储与计算
   Web/Electron  WASM     IndexedDB/Worker
   Capacitor     native   SQLite/原生文件
```

- `src/bootstrap.js` 是共用启动入口。壳入口只组装适配器，随后调用 `startApplication(adapters)` 加载同一界面。
- `src/platform/shells` 管理文件选择、资源、生命周期、维护和 AI 传输桥。
- `src/platform/engines` 管理解析任务的并发、进度、结果和取消。WASM 与移动 native 共用 Worker 调度与结果转换，并写入注入的缓存。
- `src/platform/native` 管理原生缓存、记录与任务协议；桌面的计算进程适配在 `desktop/compute.js`。
- `src/platform/compose.js` 组装 UI 服务；领域代码使用 `getPlatform()`，不判断 Capacitor 或 Electron。
- `CSBOARD_PARSER_ENGINE=auto|wasm|native` 是构建选择。默认桌面浏览器 WASM，Electron/Capacitor native；移动 H5 始终禁用解析；原生壳可选择 WASM 并保留原生存储。

适配器在加载界面前确定，同一会话不热切换存储。原生错误直接报告，不能悄悄切换到另一份数据库。

### 原生协议

桌面现有 `startDemo` 宿主在任务内保存缓存，因此桌面 native 引擎与存储必须属于同一个宿主，组装时会检查。

移动 native 使用独立 Go 会话，不写产品存储。它通过 Capacitor 插件接收请求，在原生线程解析；Worker 转换结果后通过所选缓存适配器保存。因此移动解析库和存储可以分别替换。

`native/mobile` 提供 `gomobile` 绑定，复用 `native/parser` 与 `native/storage`：

- Android 使用 AAR，iOS 使用含真机与模拟器架构的 XCFramework；没有桌面子进程。
- 系统文件选择器按块复制选中的 Demo 到应用临时目录，只向界面返回源 ID 和元数据，不通过 JS 传整文件。
- 导入时计算内容哈希，使不提供稳定修改时间的文件服务仍可命中解析缓存。
- 每次任务拥有独立 Go 会话；取消传到解析器，关闭后释放采样数据并删除临时来源。缓存命中和未启动任务的临时文件也在批次结束时清理。
- 移动端默认一次解析一个 Demo。应用转到后台时原生插件取消解析；再次导入可重新解析，不声称支持断点续算或无限后台执行。
- 存档、笔记、会话和 Demo 缓存使用 SQLite 与压缩文件。轻量界面偏好仍保留原有浏览器存储。
- 分析与序列化在 Worker 中执行，通过受限缓存请求读取原生数据。

## 输入与布局

移动视图设置集中在独立面板，包含网格、地面、模型、触控板与后续导入的采样率。地图与机位浮层默认收起，展开后可切换到保存模式并选择机位；收起时不轮询雷达。未导入 Demo 时隐藏回放操作，保留导入、缓存与设置。

- 横屏沿用桌面主体，短屏缩小顶栏、收窄侧栏，默认收起左栏；左右侧栏可以独立折叠。
- H5 的功能能力在 Web 壳启动时确定，使用移动设备标识并兼容 iPad 桌面 UA；旋转、改变窗口大小或连接鼠标不会开启解析。H5 使用禁用解析适配器，不创建解析 Worker、不读取 Demo 缓存，也不启动分析任务；笔记导入导出的 JSON 计算继续可用。
- 原生工程锁定横屏；系统窗口策略不允许锁定时显示旋转提示并暂停地图渲染。H5 竖屏同样显示旋转提示，暂停地图渲染并禁止操作隐藏工作区。
- `src/styles/input.css` 根据 `any-pointer: coarse` 增大触控区域，独立于窗口宽度和鼠标连接状态。
- 3D 空白处默认单指旋转，双指缩放和平移；对象使用单指编辑，触屏画线需在地图工具中明确开启绘图模式。切换面板或地图会恢复导航模式。操作区禁用长按文本选择，输入框、笔记正文与对话文本仍可选择复制。添加第二根手指时完成当前编辑并转入视图手势，保留撤销路径。
- 战术编辑提供“移动 / 朝向 / 俯仰”触控按钮；鼠标修饰键、滚轮、触控板与键盘快捷键继续保留。
- 滚轮由专用控制器处理，触摸缩放由 OrbitControls 处理，避免重复缩放。
- 安全区与动态视口高度集中处理；列表可触摸滚动，帧列表保留横向滚动。

## 构建

先执行 `npm ci`。iOS 需要 macOS 与 Xcode 26+；Android 需要 JDK 21、Android SDK 36 和 NDK，并设置 `JAVA_HOME`、`ANDROID_HOME` 及相应 PATH。Go 工具链以 `native/mobile/go.mod` 为准，移动绑定工具版本已固定。

唯一移动命令入口：

```sh
npm run mobile -- prepare ios
npm run mobile -- open ios
npm run mobile -- build ios
npm run mobile -- build ios --simulator
npm run mobile -- build android
```

- `prepare` 构建前台、图标、Go 库和依赖许可，并同步原生工程。iOS 默认只准备 arm64 真机库；需要模拟器时追加 `--simulator`。
- `open` 打开已有工程。首次使用先 `prepare`。
- `build ios` 默认构建未签名的 arm64 真机应用，并生成 `build/mobile/artifacts/CSBoard-版本-ios-arm64-unsigned.zip`，不会编译或启动模拟器。该压缩包不是可直接安装的 IPA；真机安装仍需在 Xcode 中选择开发团队并运行。需要模拟器构建时使用 `--simulator`。
- `build android` 生成 `build/mobile/artifacts/CSBoard-版本-android-development.apk`，使用开发签名；原始包仍在 `native/android/app/build/outputs/apk/debug/app-debug.apk`。正式分发需要配置自己的长期签名密钥；密钥文件已忽略。
- 应用版本和构建号由 `package.json` 同步。原生库和复制的前台资源是忽略的构建产物，不提交。

`.env.mobile.local` 是本地移动构建配置，已忽略：

```dotenv
CSBOARD_PARSER_ENGINE=auto
CSBOARD_AI_ENABLED=false
VITE_BACKEND_BASE_URL=https://your-backend.example.com
VITE_OSS_BASE_URL=https://your-model-storage.example.com
```

后端地址用于在线协作等服务，应使用可从设备访问的完整 HTTPS 地址。模型地址可留空，此时只使用内置 NAV 和可用资源。移动端在没有显式配置时排除实验性 AI；开启后当前使用远程代理，API Key 仅在内存中，不保存到移动数据库。代理允许来源需要包含实际移动端来源。

### 自动构建

`.github/workflows/mobile-build.yml` 监听 `main` 的相关代码更新、面向 `main` 的 PR 和 `v*` 标签；手动运行可选择 Android、iOS 或两者，以及 native / WASM 解析器。标签构建会校验版本号和更新日志。

- Android 使用 JDK 21、SDK 36 和固定 NDK 构建开发 APK。
- iOS 使用 macOS runner 与 Xcode 26.3，只构建 arm64 真机目标，并打包未签名 `.app`。
- 产物存放在 Actions artifacts，保留 14 天，文件名包含应用版本；尚不上传到 Release。
- 无需配置签名 secrets 即可运行这些开发构建。iOS 产物不能直接安装；Android 的不同 CI 运行可能使用不同开发密钥，因此不作为长期更新包。正式分发需另行接入固定签名与发布流程。
- 本地已完成 iOS 真机目标构建；远程工作流需你推送后执行，Android 云端构建尚待确认。

## 当前边界

- 已完成 iOS 真机目标构建与启动修复，基础界面已在实体机加载；大 Demo 内存、后台切换和外接输入设备仍需运行验证。
- Android 工程和桥接代码已加入，本机缺少 JDK/NDK，尚未完成 APK 构建。
- 原生资源包导入、移动凭据持久化、正式签名、原生导出和正式移动发布尚未接入。
- 原生解析减少 WASM 的限制，但仍有完整文件读取、采样数据驻留和桥接结果复制的内存成本；不能据此保证所有手机都能解析任意大小的 Demo。
