// index.js - 主程式入口

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");

// 引入資料庫連線
const { pool, redis } = require("./config/database");

// 引入資料庫初始化
const initDatabase = require("./scripts/init-db");

// 引入 Socket.IO 設定
const setupSocketIO = require("./config/socket");

// 引入同步工作者
const { startSyncWorker } = require("./services/syncWorker");

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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

/* ---------------- REST API ---------------- */

// 健康檢查
app.get("/health", (req, res) => {
  console.log("/health request from:", req.headers.origin || "no origin");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 掛載路由
app.use("/api/users", usersRouter(pool, redis));
app.use("/api/meetings", meetingsRouter(pool, redis, io));

/* ---------------- 啟動伺服器 ---------------- */

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // 初始化資料庫
    console.log("[SERVER] Initializing database...");
    await initDatabase(pool);
    console.log("[SERVER] Database initialized");

    // 啟動異步同步工作者
    console.log("[SERVER] Starting sync worker...");
    startSyncWorker(pool, redis);
    console.log("[SERVER] Sync worker started");

    // 啟動 HTTP server
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`\n[SERVER] Server running on port ${PORT}`);
      console.log(`[SERVER] Socket.IO server ready`);
      console.log(`[SERVER] Listening for requests...\n`);
    });
  } catch (error) {
    console.error("[SERVER] Startup failed:", error);
    process.exit(1);
  }
}

startServer();
