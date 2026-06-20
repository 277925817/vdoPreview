# VDO.Ninja Circle Preview

一个可点击启动的 VDO.Ninja 桌面圆形预览工具。

## 功能

- 透明无边框圆形预览窗口
- 默认启动本机摄像头：`push=preview&webcam&autostart&audiodevice=0`
- 打开后检测真实视频帧，摄像头权限/设备占用会在控制窗口提示
- 本机无摄像头时，`push=` 链接会自动尝试切换为同 ID 的 `view=` 观看链接
- 支持输入 VDO.Ninja stream ID 或完整链接
- 支持观看远端流、置顶、点击穿透和尺寸调整
- 预览媒体层默认左右翻转，修正手机前置摄像头镜像画面
- 观看模式默认加 `scale=100&viewwidth=1920&viewheight=1920&videobitrate=12000&codec=h264&buffer2=1000`，避免小圆窗触发低清缩放并缓解网络抖动
- Linux 桌面快捷方式安装脚本

## 使用

```bash
npm install
./install-desktop-entry.sh
./start-vdo-preview.sh
```

桌面入口会安装到 `~/Desktop/VDO Ninja 圆形预览.desktop`。

## 验证

```bash
npm test
npm run check
npm run smoke
npm run smoke:click
npm run smoke:close
```
