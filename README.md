# Grok API Proxy 🐾

Chrome 扩展程序，将 Grok Web 界面暴露为 REST API，供 Cursor、VS Code 等工具使用。

## 功能特性

- 🔑 API Key 管理 - 生成/删除/启用/禁用
- 🌐 REST API - 标准化的 HTTP 接口
- 💬 对话管理 - 创建会话、发送消息
- 🔄 实时响应 - 拦截 Grok WebSocket 流

## 安装

1. 克隆项目
```bash
git clone https://github.com/Akanclaw/grok-api-proxy.git
cd grok-api-proxy
```

2. 安装依赖
```bash
npm install
```

3. 构建
```bash
npm run build
```

4. 加载到 Chrome
- 打开 `chrome://extensions/`
- 启用"开发者模式"
- 点击"加载已解压的扩展程序"
- 选择 `dist` 文件夹

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
  -d '{"message": "Hello Grok!"}'

# 获取会话列表
curl http://127.0.0.1:7890/v1/sessions \
  -H "X-API-Key: gkp_xxxxxxxxxxxxx"

# 创建新会话
curl -X POST http://127.0.0.1:7890/v1/sessions \
  -H "X-API-Key: gkp_xxxxxxxxxxxxx"
```

## API 端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /v1/sessions | 列出所有会话 |
| POST | /v1/sessions | 创建新会话 |
| POST | /v1/chat | 发送消息 |
| GET | /v1/conversations | 获取对话列表 |

## 在 Cursor 中使用

```json
{
  "api_key": "your-grok-api-key",
  "base_url": "http://127.0.0.1:7890",
  "model": "grok-2"
}
```

## 注意事项

1. ⚠️ 需要保持 Grok 标签页打开
2. ⚠️ 仅供个人使用，请勿公开暴露 API
3. 🔒 API Key 请妥善保管

## 开发

```bash
# 监听模式
npm run dev

# 重新加载扩展
```

## License

MIT
