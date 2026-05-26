# 桌面端使用与封装

## 桌面 PWA

1. Chrome/Edge 打开前端生产域名。
2. 地址栏点击安装图标，或菜单 -> 安装 MindWeave。
3. 登录后即可使用完整图谱编辑体验。

## Tauri/Electron 后续封装

当前代码已把客户端 API 地址抽到 `VITE_API_BASE_URL`，后续桌面壳只需加载构建产物并保持云端 API。

Tauri 可选步骤：

```bash
npm install -D @tauri-apps/cli
npm run build
npx tauri init
```

Electron 可选步骤：

```bash
npm install -D electron electron-builder
npm run build
```

桌面 App 不需要本机后端常驻；应连接部署好的云端 Express API。
