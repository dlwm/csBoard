# 移动端开发

[构建指南](build-guide.zh-CN.md)

Capacitor 原生端复用工作区，采用横屏、触控操作和可收起侧栏，也支持外接鼠标键盘。移动浏览器只提供道具速记和协作，关闭 Demo 导入、回放及分析；不要将浏览器解析能力等同于原生端。

```sh
make mobile-prepare PLATFORM=android
make mobile-open PLATFORM=android
make mobile-build PLATFORM=android
```

iOS 将 `PLATFORM` 改为 `ios`，使用 macOS 和 Xcode；可在 Xcode 选择实体设备，签名账号及设备授权由开发者配置。Android 需要 Android Studio、SDK 和匹配的 Java 环境。命令接受 `ARGS` 传递额外参数。

公共后端配置来自 `.env.production.local`，`.env.mobile.local` 可覆盖。当前正式 Release 包含 Android APK，iOS 构建只在手动 Mobile preview 中提供。详情以 `scripts/mobile.js` 和 `.github/workflows` 的当前配置为准。
