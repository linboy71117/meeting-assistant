// index.js - 主程式入口

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");

// 引入資料庫連線
const { pool, redis } = require("./config/database");

// 引入 Socket.IO 設定
const setupSocketIO = require("./config/socket");

// 引入路由
const usersRouter = require("./routes/users");
const meetingsRouter = require("./routes/meetings");

const app = express();
const httpServer = createServer(app);

// Socket.IO 設定
const io = setupSocketIO(httpServer, redis);

/* ---------------- CORS 設定 ---------------- */

const corsOptions = {
  origin: true, // 允許所有來源（含 chrome-extension://）
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

/* ---------------- REST API ---------------- */

// 健康檢查
app.get("/health", (req, res) => {
  console.log("📋 /health request from:", req.headers.origin || "no origin");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 掛載路由
app.use("/api/users", usersRouter(pool));
app.use("/api/meetings", meetingsRouter(pool, redis, io));

/* ---------------- 啟動伺服器 ---------------- */

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready`);
});
