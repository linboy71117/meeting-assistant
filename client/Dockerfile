# Frontend Dockerfile - Build Chrome Extension
FROM node:20-alpine AS builder

WORKDIR /app

# 複製 package files
COPY package*.json ./

# 安裝依賴
RUN npm ci

# 複製原始碼
COPY . .

# 建置 Chrome Extension
RUN npm run build

# 使用 nginx 提供靜態檔案 (可選,用於測試)
FROM nginx:alpine

# 複製建置結果到 nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 複製 nginx 配置 (如果需要)
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
