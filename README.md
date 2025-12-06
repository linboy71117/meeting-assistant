# meeting-assistant
一款協助團隊記錄討論、追蹤行動項目,並利用 AI 生成摘要與洞察的智慧會議助理。

## 專案架構

```
meeting-assistant/
├── backend/          # Express + Socket.IO 後端
├── client/           # Chrome Extension (Vue 3 + Vite)
└── docker-compose.yml
```
### 事前準備
```bash
cd backend
npm install pg
```

### 使用 Docker Compose

```bash
# 啟動所有服務
docker-compose up -d

# 停止服務
docker-compose down
```

服務將運行在:
- **後端 API**: http://localhost:3000
- **Redis**: localhost:6379

### 本地開發

#### 後端
```bash
cd backend
npm install
npm run dev
```

#### 前端
```bash
cd client
npm install
npm run dev
```
