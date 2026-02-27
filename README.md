# AI Proxy 🐾

Chrome 扩展程序，将 AI 聊天界面（如 Grok）暴露为 REST API，供 Cursor、VS Code 等工具使用。

## 功能特性

- 🔑 API Key 管理 - 生成/删除/启用/禁用
- 🌐 REST API - 标准化的 HTTP 接口
- 💬 对话管理 - 创建会话、发送消息
- 🤖 多 AI 支持 - 预留扩展接口

## 安装

```bash
cd ai-proxy
npm install
npm run build && npm run copy-assets
```

然后在 Chrome 中加载 `dist` 文件夹。

## 使用方法

### 1. 获取 API Key
- 点击扩展图标
- 点击 "Generate New API Key"
- 复制生成的 Key

### 2. 调用 API

```bash
# 发送消息
curl -X POST http://127.0.0.1:7890/v1/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: gkp_xxxxxxxxxxxxx" \
  -d '{"message": "Hello!"}'

# 获取会话列表
curl http://127.0.0.1:7890/v1/sessions \
  -H "X-API-Key: gkp_xxxxxxxxxxxxx"
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /v1/sessions | 列出所有会话 |
| POST | /v1/sessions | 创建新会话 |
| POST | /v1/chat | 发送消息 |

## 在 Cursor 中使用

```json
{
  "api_key": "your-api-key",
  "base_url": "http://127.0.0.1:7890"
}
```

## 注意事项

1. ⚠️ 需要保持 AI 聊天标签页打开
2. ⚠️ 仅供个人使用
3. 🔒 API Key 请妥善保管

## License

MIT
