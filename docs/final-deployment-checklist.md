# MindWeave 最终公网部署与跨设备验收清单

推荐组合：

- 前端：Vercel
- 后端：Render Web Service
- 数据库 / Auth / Storage：Supabase

最终访问链路必须是：

```text
手机 PWA / 浏览器 -> 公网前端域名 -> 公网后端 API -> Supabase
电脑浏览器 / 桌面 PWA -> 公网前端域名 -> 公网后端 API -> Supabase
```

手机不能访问 `localhost`、`127.0.0.1`、局域网 IP，也不能依赖电脑运行 `npm run dev`。

## 一、部署前检查

1. Supabase migration 已执行：在 Supabase SQL Editor 执行 `supabase/migrations/202605210001_mindweave_cloud_schema.sql`。
2. Supabase Storage bucket 已创建：名称建议为 `mindweave-documents`，保持 private。
3. 本地 `.env` 已配置后端变量：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_STORAGE_BUCKET`、`APP_ENCRYPTION_KEY`。
4. 本地后端 `/api/health` 已经是 `cloud=true`：

   ```bash
   npm run build
   npm start
   ```

   然后访问：

   ```text
   http://localhost:4141/api/health
   ```

   应该看到类似：

   ```json
   { "ok": true, "name": "MindWeave API", "cloud": true }
   ```

5. 本地注册、登录、上传资料、图谱同步都已经成功。
6. `npm run build` 通过，并且生成 `dist/frontend`。
7. PWA 文件存在：`frontend/public/manifest.webmanifest`、`frontend/public/pwa-icon.svg`，构建后应生成 `dist/frontend/sw.js`。
8. 确认 service worker 不缓存 API 数据：当前 PWA 配置对 `/api/` 使用 `NetworkOnly`，资料、节点、关系同步会走云端后端。

## 二、后端部署步骤（Render）

1. 打开 Render，创建 `New +` -> `Web Service`。
2. 连接当前 MindWeave 代码仓库。
3. 服务名称可以填：`mindweave-api`。
4. Root Directory 选择仓库根目录。如果 Render 让你填写 Root Directory，保持空白或填根目录，不要填 `backend`。
5. Runtime 选择 Node。
6. Build Command 填：

   ```bash
   npm ci && npm run build
   ```

7. Start Command 填：

   ```bash
   npm start
   ```

8. 后端环境变量至少配置：

   ```bash
   PORT=10000
   CORS_ORIGIN=*
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
   SUPABASE_STORAGE_BUCKET=mindweave-documents
   APP_ENCRYPTION_KEY=replace-with-a-long-random-secret
   ALLOW_LOCAL_FALLBACK=false
   ```

9. `PORT` 说明：Render 通常会注入 `PORT`。如果平台已经自动提供，可以不用手动改；如果需要填写，保持和 Render 服务端口一致。MindWeave 后端会读取 `process.env.PORT`。
10. `CORS_ORIGIN` 初次部署时可以先填 `*`，等前端正式域名出来后再改成精确前端域名。
11. `SUPABASE_SERVICE_ROLE_KEY` 只能放在后端部署平台，不能放到 Vercel、Netlify、Cloudflare Pages，也不能以 `VITE_` 开头暴露给浏览器。
12. 部署成功后，打开 Render 给你的公网后端地址，例如：

   ```text
   https://mindweave-api.onrender.com/api/health
   ```

13. 确认返回里有：

   ```text
   cloud=true
   ```

   JSON 里通常显示为：

   ```json
   { "ok": true, "name": "MindWeave API", "cloud": true }
   ```

## 三、前端部署步骤（Vercel）

1. 打开 Vercel，创建 `Add New` -> `Project`。
2. 导入当前 MindWeave 代码仓库。
3. Framework Preset 选择 `Vite`。
4. Root Directory 选择仓库根目录，不要选择 `frontend`，因为 `package.json` 在仓库根目录。
5. Install Command 填：

   ```bash
   npm ci
   ```

6. Build Command 填：

   ```bash
   npm run build
   ```

7. Output Directory 填：

   ```text
   dist/frontend
   ```

8. 前端环境变量至少配置：

   ```bash
   VITE_API_BASE_URL=https://your-render-api.onrender.com
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

9. `VITE_API_BASE_URL` 必须填公网后端根地址，不要带 `/api`，例如 `https://mindweave-api.onrender.com`。
10. `VITE_SUPABASE_URL` 填 Supabase Project URL。
11. `VITE_SUPABASE_ANON_KEY` 填 Supabase anon public key。
12. 前端不能配置 `SUPABASE_SERVICE_ROLE_KEY`，也不能配置任何 service role 密钥。
13. 部署完成后，打开 Vercel 给你的正式前端网址，例如：

   ```text
   https://mindweave.vercel.app
   ```

14. 在电脑浏览器里注册或登录，确认页面能加载资料库。

## 四、CORS 最终配置

1. 前端部署完成后，复制正式前端域名，例如：

   ```text
   https://mindweave.vercel.app
   ```

2. 回到 Render 后端服务。
3. 打开 Environment。
4. 把 `CORS_ORIGIN` 从临时值改成正式前端域名：

   ```bash
   CORS_ORIGIN=https://mindweave.vercel.app
   ```

5. 如果你同时使用 Vercel 预览域名、正式自定义域名，可以用英文逗号分隔：

   ```bash
   CORS_ORIGIN=https://mindweave.vercel.app,https://www.your-domain.com
   ```

6. 保存后重新部署后端。
7. 再次打开正式前端域名，确认登录、上传、同步都正常。

## 五、手机端使用方式

1. 手机浏览器打开正式前端域名，例如：

   ```text
   https://mindweave.vercel.app
   ```

2. 登录和电脑端相同的账号。
3. 查看电脑端已经上传的资料。
4. 在手机端上传一个资料，可以是文本、文件或 URL。
5. 回到电脑端，刷新或点击同步，确认手机上传的资料出现。
6. iPhone Safari 添加到主屏幕：
   打开正式前端域名 -> 点击分享按钮 -> 选择“添加到主屏幕” -> 确认名称为 MindWeave -> 添加。
7. Android Chrome 安装 PWA：
   打开正式前端域名 -> 点击地址栏或菜单里的“安装应用”/“添加到主屏幕” -> 确认安装。
8. 确认像 App 一样运行：
   从手机主屏幕点开 MindWeave，界面应以独立窗口打开，地址栏通常会隐藏或弱化；登录后仍然能访问云端资料。

## 六、电脑端使用方式

1. 电脑浏览器打开正式前端域名。
2. 登录和手机端相同的账号。
3. 查看手机端上传的资料。
4. Chrome / Edge 安装为桌面 App：
   打开正式前端域名 -> 地址栏右侧安装图标，或浏览器菜单 -> “安装 MindWeave”。
5. 关闭本地开发服务：

   ```bash
   # 停止 npm run dev / npm start 对应的本地窗口
   ```

6. 重新打开电脑浏览器或桌面 PWA，访问正式前端域名，确认仍能登录、查看资料、上传资料、同步图谱。

## 七、最终验收清单

### 场景 1：公网后端可用

访问：

```text
https://your-render-api.onrender.com/api/health
```

应该看到：

```text
cloud=true
```

### 场景 2：公网前端可用

电脑打开正式前端域名，可以注册/登录。

### 场景 3：电脑上传，手机查看

电脑上传资料，手机登录同一账号能看到。

### 场景 4：手机上传，电脑查看

手机上传资料，电脑登录同一账号能看到。

### 场景 5：图谱同步

电脑修改节点，手机能看到变化。
手机删除节点，电脑能看到变化。

### 场景 6：电脑关闭后手机仍可用

关闭电脑。
手机继续打开 PWA。
确认仍能登录、查看资料、上传资料、同步图谱。

### 场景 7：不是 localhost

手机端访问的网址不能包含：

```text
localhost
127.0.0.1
192.168
10.0
172.16
```

手机端 Network 请求的 API 地址也不能包含这些值。

### 场景 8：Supabase 写入确认

上传后 Supabase 里应该能看到：

- Storage 里有原始文件。
- `documents` 表有资料记录。
- `document_chunks` 表有文本块。
- `graph_nodes` 表有节点。
- `graph_edges` 表有关系。

### 场景 9：API Key 配置

设置页填写大模型 API Key 后，测试连接成功。
没有 API Key 时，本地规则 fallback 仍然可用。

## 八、常见问题排查

### 1. `/api/health` 显示 `cloud=false`

- 检查后端平台是否配置了 `SUPABASE_URL`。
- 检查后端平台是否配置了 `SUPABASE_SERVICE_ROLE_KEY`。
- 保存环境变量后必须重新部署后端。
- 不要把 service role key 放在前端平台。

### 2. 前端打不开后端 API

- 检查 `VITE_API_BASE_URL` 是否是公网后端根地址，例如 `https://mindweave-api.onrender.com`。
- 不要把 `VITE_API_BASE_URL` 写成 `localhost`、局域网 IP 或带 `/api` 的地址。
- 打开 `https://your-render-api.onrender.com/api/health`，先确认后端本身可访问。
- 检查浏览器控制台是否有 CORS 报错。

### 3. 手机打不开 App

- 确认手机访问的是正式前端域名。
- 确认域名使用 HTTPS。
- 确认不是访问电脑的 `localhost` 或局域网 IP。
- 尝试用手机移动网络打开，排除本地 Wi-Fi 或电脑依赖。

### 4. 登录失败

- 检查前端 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
- 检查 Supabase Auth 是否开启 Email/Password。
- 检查 Supabase Auth URL Configuration 是否加入正式前端域名。
- 检查后端是否能通过 service role 验证 token。

### 5. 上传失败

- 检查后端 `/api/health` 是否 `cloud=true`。
- 检查 `SUPABASE_STORAGE_BUCKET` 是否和 Supabase Storage bucket 名称一致。
- 检查上传文件是否超过后端限制，当前限制为 25MB。
- 检查 Render 日志中的 Supabase Storage 错误。

### 6. Storage 没有文件

- 确认上传的是文件类型资料；纯文本或 URL 资料可能不会生成原始文件对象。
- 检查 Storage bucket 是否存在且名称匹配。
- 检查后端是否配置 `SUPABASE_SERVICE_ROLE_KEY`。
- 检查 Render 日志是否有 Storage 权限或 bucket 错误。

### 7. `documents` 表没有记录

- 检查 migration 是否已经执行。
- 检查上传请求是否成功返回。
- 检查登录用户是否正确，数据按 `user_id` 隔离。
- 检查 Render 日志中的 Postgres upsert 错误。

### 8. CORS 报错

- 初次排查可以临时设置 `CORS_ORIGIN=*` 并重新部署后端。
- 正式上线后改成精确前端域名。
- `CORS_ORIGIN` 不要带路径，只填 origin，例如 `https://mindweave.vercel.app`。
- 如果有多个域名，用英文逗号分隔。

### 9. PWA 不能安装

- 确认前端是 HTTPS。
- 确认 `https://your-frontend-domain/manifest.webmanifest` 能打开。
- 确认构建产物里有 `sw.js`。
- iPhone 需要用 Safari 的“添加到主屏幕”；不是所有浏览器都会显示同样的安装按钮。

### 10. 手机端仍然访问 localhost

- 检查 Vercel 环境变量 `VITE_API_BASE_URL`。
- 修改环境变量后重新部署前端。
- 清理手机浏览器缓存，或删除旧的主屏幕 PWA 后重新添加。
- 在手机浏览器开发工具或后端日志里确认请求打到公网 API。

### 11. API Key 测试失败

- 检查设置页里的 Base URL、Chat 模型、Embedding 模型是否正确。
- 检查后端 `APP_ENCRYPTION_KEY` 是否配置且保持稳定；不要每次部署换一个值。
- 检查外部模型服务商的 API Key 是否可用。
- 没有 API Key 时，MindWeave 仍会使用本地规则 fallback。

### 12. 电脑关闭后手机不能用

- 手机访问地址如果包含 `localhost` 或局域网 IP，说明还在访问电脑，不是公网部署。
- 检查手机打开的是 Vercel 正式前端域名。
- 检查前端环境变量 `VITE_API_BASE_URL` 是否指向 Render 公网后端。
- 检查 Render 服务是否正在运行。
- 检查 Supabase 项目是否正常。

## 九、最终确认

全部验收通过后，MindWeave 的真实运行方式应为：

```text
手机 / 电脑 -> Vercel 前端 -> Render 后端 -> Supabase Auth/Postgres/Storage
```

此时手机和电脑都可以独立使用同一个 App，电脑关闭不会影响手机登录、查看资料、上传资料或同步图谱。
