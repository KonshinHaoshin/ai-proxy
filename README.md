# AI Proxy

AI Proxy 采用双进程架构：
- Chrome 扩展：负责页面自动化（发送消息、读取响应）
- 本地 Node Server：提供 `http://127.0.0.1:7890` REST API

扩展和本地服务通过 WebSocket Bridge（`ws://127.0.0.1:7891/agent`）通信。

## 功能

- API Key 管理：生成、删除、启用、禁用（在扩展弹窗内）
- 本地 REST API：会话管理与聊天请求
- 多 Provider：Grok / OpenAI / DeepSeek / Claude / Gemini

## 安装与启动

```bash
npm install
npm run build
npm run copy-assets
npm run server
```

然后在 Chrome 扩展管理页启用开发者模式，加载 `dist` 目录。

## 使用

1. 打开扩展弹窗，点击 `Generate New API Key`
2. 保持至少一个 AI 页面处于打开且已登录状态
3. 调用本地接口

```bash
curl -X POST http://127.0.0.1:7890/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: gkp_xxxxxxxxxxxxx" \
  -d '{"message": "Hello!"}'
```

## API

- `GET /health`
- `GET /v1/providers`
- `GET /v1/sessions`
- `POST /v1/sessions`
- `GET /v1/sessions/:sessionId`
- `POST /v1/chat`
- `GET /v1/conversations`
- `GET /v1/conversations/:conversationId`

## 注意事项

- 如果 `/health` 的 `bridge_connected` 为 `false`，说明本地服务尚未和扩展连通。
- Provider 页面 DOM 变化会影响自动化稳定性，需要更新 `src/content/providers.ts` 中选择器。
- 仅建议本地个人使用，不要直接暴露公网。

## License

MIT
