# 手机端使用与封装

## PWA 安装

1. 用手机浏览器打开前端生产域名。
2. 登录 Supabase Auth 账号。
3. iOS Safari：分享 -> 添加到主屏幕。
4. Android Chrome：菜单 -> 安装应用。

手机端会连接 `VITE_API_BASE_URL` 指向的云端后端。电脑关闭后，只要云端后端和 Supabase 在线，手机仍可上传资料、查看资料库、搜索图谱、打开节点详情和编辑基础数据。

## Capacitor 后续封装

当前阶段先以 PWA 为第一 App 形态。后续可新增：

```bash
npm install @capacitor/core @capacitor/cli
npx cap init MindWeave com.mindweave.app --web-dir dist/frontend
npx cap add ios
npx cap add android
```

封装时继续使用云端 API 域名，不要改成电脑本地地址。
