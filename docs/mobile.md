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

- 横屏沿用桌面主体，短屏缩小顶栏、收窄侧栏，默认收起左栏；左右侧栏可以独立折叠。
- H5 的功能能力在 Web 壳启动时确定，使用移动设备标识并兼容 iPad 桌面 UA；旋转、改变窗口大小或连接鼠标不会开启解析。H5 使用禁用解析适配器，不创建解析 Worker、不读取 Demo 缓存，也不启动分析任务；笔记导入导出的 JSON 计算继续可用。
- 原生工程锁定横屏；系统窗口策略不允许锁定时显示旋转提示并暂停地图渲染。H5 竖屏同样显示旋转提示，暂停地图渲染并禁止操作隐藏工作区。
- `src/styles/input.css` 根据 `any-pointer: coarse` 增大触控区域，独立于窗口宽度和鼠标连接状态。
- 3D 空白处单指旋转，双指缩放和平移；对象和绘图工具使用单指编辑。添加第二根手指时完成当前编辑并转入视图手势，保留撤销路径。
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
npm run mobile -- build android
```

- `prepare` 构建前台、图标、Go 库和依赖许可，并同步原生工程。
- `open` 打开已有工程。首次使用先 `prepare`。
- `build ios` 生成模拟器应用，不生成可安装到手机的 IPA。真机安装在 Xcode 中选择开发团队并运行；免费个人团队适合自己的设备开发测试。
- `build android` 生成 `native/android/app/build/outputs/apk/debug/app-debug.apk`，使用开发签名。正式分发需要配置自己的长期签名密钥；密钥文件已忽略。
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

`.github/workflows/mobile-android.yml` 在推送 `feature/mobile` 时构建 Android 开发 APK，也支持手动选择 native / WASM。产物放在 Actions artifacts，不发布到正式 Release。工作流随移动端支持提供，尚未执行构建。

不同 CI 运行可能使用不同开发密钥，产物不作为长期更新包；正式分发需使用固定签名密钥。

## 当前边界

- 已完成 iOS 模拟器构建；尚未做真机触控、大 Demo 内存、后台切换和外接输入设备的运行验证。
- Android 工程和桥接代码已加入，本机缺少 JDK/NDK，尚未完成 APK 构建。
- 原生资源包导入、移动凭据持久化、正式签名、原生导出和正式移动发布尚未接入。
- 原生解析减少 WASM 的限制，但仍有完整文件读取、采样数据驻留和桥接结果复制的内存成本；不能据此保证所有手机都能解析任意大小的 Demo。
