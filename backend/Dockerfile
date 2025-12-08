# Backend Dockerfile
FROM node:20-alpine

WORKDIR /app

# 複製 package files
COPY package*.json ./

# 安裝依賴
RUN npm install --omit=dev

# 複製應用程式碼
COPY . .

# 暴露端口
EXPOSE 3000

# 啟動應用
CMD ["node", "index.js"]
