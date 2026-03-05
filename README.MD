# uniapp-template-plus 端到端对接指南

本文档面向前后端联调与上线，覆盖从本地启动、环境配置、接口封装、登录鉴权、文件上传到 WebSocket 实时对话的完整流程。

## 1. 项目目标与技术栈

- 框架: `uni-app + Vue3 + TypeScript + Pinia`
- 构建: `Vite`
- 路由: `@uni-helper/vite-plugin-uni-pages`
- 样式: `UnoCSS`
- 网络层:
  - HTTP: `src/utils/request/request.ts`（统一拦截器）
  - Upload: `src/utils/request/upload.ts`
  - Socket: `src/store/modules/socket/webSocket.ts`

## 2. 你需要先准备什么

### 2.1 运行环境

- Node.js: 建议 `18.18.0`
- 包管理器: `pnpm`

安装依赖:

```bash
pnpm install
```

### 2.2 本地启动

微信小程序开发:

```bash
pnpm dev:mp-wx
```

启动后在微信开发者工具导入 `dev/mp-weixin`。

H5 开发:

```bash
pnpm dev:h5
```

### 2.3 环境变量（核心）

配置文件:

- `.env`
- `.env.development`
- `.env.production`

关键变量（已在 `vite.config.ts` 注入为全局常量）:

- `VITE_APP_API_URL` -> `API_URL`
- `VITE_APP_UPLOAD_API_URL` -> `UPLOAD_API_URL`
- `VITE_APP_STATIC_URL` -> `STATIC_URL`
- `VITE_APP_FILE_URL` -> `FILE_URL`
- `VITE_APP_TOKEN` -> `CUSTOM_TOKEN`（仅自定义固定 token 场景）

建议你先把开发环境变量改成自己后端地址，再开始联调。

## 3. 端到端总流程（HTTP 业务链路）

业务请求在本项目里统一走如下链路:

1. 页面触发调用（`src/pages/**`）
2. 进入 Store Action（如 `src/store/modules/user/index.ts`）
3. 调用 API 函数（`src/api/**`）
4. 统一走 Request 封装（`src/utils/request/request.ts`）
5. 请求拦截器拼接 URL/参数、注入 Token
6. 服务端返回标准结构
7. 响应拦截器统一判错/跳登录/抛异常
8. 页面拿到结果更新 UI

## 4. 后端接口返回规范（必须统一）

HTTP 返回建议统一为:

```json
{
  "code": 200,
  "msg": "success",
  "data": {}
}
```

本项目默认规则:

- `statusCode !== 200` 直接按系统错误处理
- `statusCode === 200` 时，业务成功条件是 `code === 200`
- `code === 401` 会触发登录失效跳转（`toAuth()`）

如果你后端不是这个结构，需要改 `src/utils/request/request.ts` 的 `response` 拦截器逻辑。

## 5. 登录鉴权端到端流程

### 5.1 接口定义

`src/api/auth.ts` 已定义以下接口:

- 获取验证码: `GET /prod-api/captchaImage`
- 登录: `POST /prod-api/login`
- 获取用户信息: `GET /prod-api/getInfo`
- 退出登录: `POST /prod-api/logout`

### 5.2 页面到状态流

- 登录页: `src/pages/auth/index.vue`
- 用户 Store: `src/store/modules/user/index.ts`

核心流程:

1. 页面点击登录 -> `useUserStore().login(form)`
2. 登录成功后缓存 token: `setCacheToken(res.token)`
3. 随后拉取用户信息并缓存: `setCacheUserInfo`
4. 跳转首页 tab: `/pages/home/index`

### 5.3 Token 注入机制

在 `src/utils/request/request.ts` 中:

- 默认 `withToken: true`
- 从缓存读取 token（`getCacheToken()`）
- 请求头注入:

```http
Authorization: Bearer <token>
```

不需要 token 的接口请显式写 `withToken: false`（如登录、验证码）。

### 5.4 登录失效机制

- 当接口 `code === 401` 或本地无 token 时
- 会触发 `toAuth()`
- 清理 token 并重定向到 `/pages/auth/index`

## 6. 新增一个业务接口的标准步骤

以 `src/api/list-data-preview.ts` 的写法为模板:

1. 在 `src/model/**` 定义参数/返回类型
2. 在 `src/api/**` 新建接口函数，统一调用 `request.get/post/...`
3. 在页面或 store 中消费 API
4. 所有错误由 request 层统一抛出，页面只处理业务提示

示例:

```ts
export function getDetail(id: number) {
  return request.get<ResponseData<MyDetail>>({
    url: `/prod-api/demo/${id}`,
  })
}
```

## 7. 文件上传端到端流程

项目里有两套上传能力:

### 7.1 通用 upload 方法

文件: `src/utils/request/upload.ts`

- 使用 `uni.uploadFile`
- 可选携带 token（`withToken`）
- 返回值同样要求后端是 `{ code, msg, ... }`

### 7.2 组件化上传（推荐业务使用）

文件: `src/components/media-uploader/media-uploader.vue`

- 上传地址由 `action` 控制，默认 `/common/upload`
- 实际请求 URL: `API_URL + action`
- 请求头携带 token
- 支持压缩、缩略图、进度、失败重试状态管理

后端最少要返回:

```json
{
  "code": 200,
  "msg": "ok",
  "url": "https://xxx/xxx.jpg"
}
```

## 8. WebSocket 实时语音“端到端”流程

项目内有两个协议示例页面:

- 播客 TTS: `src/pages/test/index.vue`
- Realtime Dialogue: `src/pages/test/duan/index.vue`

协议工具:

- `src/pages/test/protocols.ts`

鉴权参数配置:

- `src/pages/test/access.ts`
- `src/pages/test/duan/access.ts`

标准握手流程（两页面通用思路）:

1. `uni.connectSocket` 建链（header 带业务鉴权）
2. 发 `StartConnection`
3. 等 `ConnectionStarted`
4. 发 `StartSession`
5. 等 `SessionStarted`
6. 持续收发业务消息（文本/音频帧）
7. 发 `FinishSession`
8. 发 `FinishConnection`
9. 等 `ConnectionFinished`
10. 主动关闭 socket

注意事项:

- 页面当前是把密钥写在 `access.ts`，仅适合本地调试
- 生产环境必须改成服务端签名/下发临时凭证，避免密钥泄露

## 9. 联调检查清单（建议按顺序）

1. `.env.development` 是否指向正确后端
2. 登录接口是否返回 `token`
3. `getInfo` 是否在带 token 时可用
4. 非登录接口是否可自动注入 `Authorization`
5. 上传接口返回结构是否兼容 `{code,msg,url}`
6. 401 时是否自动跳登录
7. WebSocket header 鉴权字段是否与服务端一致
8. 业务异常时页面是否收到明确报错

## 10. 常见问题排查

### Q1: 明明地址对，接口一直 401

优先检查:

- 登录后是否执行了 `setCacheToken`
- 请求是否意外设置了 `withToken: false`
- 后端是否要求 `Bearer ` 前缀（本项目默认会加）

### Q2: 上传接口成功了但前端报错

检查上传返回是否是 JSON 字符串，并且含 `code` 字段。

### Q3: WebSocket 连上就断

检查:

- header 鉴权字段名和值
- `Resource-Id` 是否正确
- 会话事件顺序是否严格匹配（必须先 Connection 再 Session）

## 11. 生产上线建议

- 不要在前端硬编码 AccessKey/SecretKey
- 将接口域名、静态资源域名全部放到环境变量
- 保持后端响应结构统一，减少前端分支判断
- 关键 API 增加 requestId，便于服务端日志追踪

---

如果你希望，我可以下一步直接给你补一版“后端接口对接模板”（含登录、列表、详情、上传、WebSocket 鉴权中转）并按你当前目录直接落文件。
