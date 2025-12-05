// index.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");
const { Pool } = require("pg");

const app = express();
const httpServer = createServer(app);

/* ---------------- Redis 連線（給同步用） ---------------- */

const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log("✅ Connected to Redis");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

/* ---------------- PostgreSQL 連線（正式儲存用） ---------------- */

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "meeting_assistant",
  user: process.env.POSTGRES_USER || "meeting_user",
  password: process.env.POSTGRES_PASSWORD || "meeting_pass",
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err);
});

/**
 * 把 JOIN 後的 rows -> group 成 meetings 陣列
 * 每個 meeting 帶 agenda: []
 */
function groupMeetings(rows) {
  const map = new Map();

  for (const row of rows) {
    let m = map.get(row.id);
    if (!m) {
      m = {
        id: row.id,
        inviteCode: row.invite_code,
        title: row.title,
        date: row.date ? row.date.toISOString().slice(0, 10) : null, // YYYY-MM-DD
        description: row.description,
        meetUrl: row.meet_url,
        summary: row.summary,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        agenda: [],
      };
      map.set(row.id, m);
    }

    if (row.agenda_id != null) {
      m.agenda.push({
        id: row.agenda_id,
        orderIndex: row.order_index,
        time: row.time,
        title: row.agenda_title,
        owner: row.owner,
        note: row.note,
      });
    }
  }

  return Array.from(map.values());
}

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

/* ---------------- Socket.IO ---------------- */

const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || origin.startsWith("chrome-extension://")) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // 加入會議室
  socket.on("join-meeting", async (meetingId) => {
    socket.join(`meeting-${meetingId}`);
    console.log(`Socket ${socket.id} joined meeting-${meetingId}`);

    // 從 Redis 撈暫存的會議資料（如果有的話）
    const meetingData = await redis.get(`meeting:${meetingId}`);
    if (meetingData) {
      socket.emit("meeting-data", JSON.parse(meetingData));
    }
  });

  // 離開會議室
  socket.on("leave-meeting", (meetingId) => {
    socket.leave(`meeting-${meetingId}`);
    console.log(`👋 Socket ${socket.id} left meeting-${meetingId}`);
  });

  // 同步會議資料（暫存到 Redis，適合 "即時編輯"）
  socket.on("sync-meeting-data", async (data) => {
    const { meetingId, content } = data;

    await redis.set(`meeting:${meetingId}`, JSON.stringify(content));
    socket.to(`meeting-${meetingId}`).emit("meeting-updated", content);
  });

  // 同步腦力激盪資料
  socket.on("sync-brainstorm", async (data) => {
    const { meetingId, ideas } = data;

    await redis.set(`brainstorm:${meetingId}`, JSON.stringify(ideas));
    socket.to(`meeting-${meetingId}`).emit("brainstorm-updated", ideas);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected:", socket.id);
  });
});

/* ---------------- REST API ---------------- */

// 健康檢查
app.get("/health", (req, res) => {
  console.log("📋 /health request from:", req.headers.origin || "no origin");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 取得所有會議列表（含 agenda）
app.get("/api/meetings", async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT
          m.id,
          m.invite_code,
          m.title,
          m.date,
          m.description,
          m.meet_url,
          m.summary,
          m.created_at,
          m.updated_at,
          m.version,
          a.id          AS agenda_id,
          a.order_index,
          a.time,
          a.title       AS agenda_title,
          a.owner,
          a.note
        FROM meetings m
        LEFT JOIN agenda_items a
          ON a.meeting_id = m.id
        ORDER BY m.created_at DESC, a.order_index ASC;
      `
      );

      const meetings = groupMeetings(result.rows);
      res.json(meetings);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error fetching meetings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 取得單一會議（含 agenda）
app.get("/api/meetings/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        SELECT
          m.id,
          m.invite_code,
          m.title,
          m.date,
          m.description,
          m.meet_url,
          m.summary,
          m.created_at,
          m.updated_at,
          m.version,
          a.id          AS agenda_id,
          a.order_index,
          a.time,
          a.title       AS agenda_title,
          a.owner,
          a.note
        FROM meetings m
        LEFT JOIN agenda_items a
          ON a.meeting_id = m.id
        WHERE m.id = $1
        ORDER BY a.order_index ASC;
      `,
        [id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      const [meeting] = groupMeetings(result.rows);
      res.json(meeting);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error fetching meeting:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 建立 / 更新會議（含 agenda）
app.post("/api/meetings/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body || {};

  const inviteCode = body.inviteCode;
  const title = body.title;
  const date = body.date || null; // "YYYY-MM-DD" or null
  const description = body.description || null;
  const meetUrl = body.meetUrl || null;
  const summary = body.summary || null;
  const agenda = Array.isArray(body.agenda) ? body.agenda : [];

  if (!inviteCode || !title) {
    return res
      .status(400)
      .json({ error: "inviteCode 與 title 為必填欄位" });
  }

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const existing = await client.query(
        "SELECT id FROM meetings WHERE id = $1",
        [id]
      );

      if (existing.rowCount === 0) {
        // 新增
        await client.query(
          `
          INSERT INTO meetings (
            id, invite_code, title, date, description, meet_url, summary
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
          [id, inviteCode, title, date, description, meetUrl, summary]
        );
      } else {
        // 更新
        await client.query(
          `
          UPDATE meetings
          SET
            invite_code = $2,
            title       = $3,
            date        = $4,
            description = $5,
            meet_url    = $6,
            summary     = $7,
            updated_at  = NOW(),
            version     = version + 1
          WHERE id = $1
        `,
          [id, inviteCode, title, date, description, meetUrl, summary]
        );
      }

      // 先清掉舊的 agenda
      await client.query("DELETE FROM agenda_items WHERE meeting_id = $1", [
        id,
      ]);

      // 再把新的 agenda 插回去
      for (let i = 0; i < agenda.length; i++) {
        const item = agenda[i] || {};
        await client.query(
          `
          INSERT INTO agenda_items (
            meeting_id, order_index, time, title, owner, note
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
          [
            id,
            i,
            item.time || null,
            item.title || "", // NOT NULL
            item.owner || null,
            item.note || null,
          ]
        );
      }

      // 取出最新版本回傳
      const result = await client.query(
        `
        SELECT
          m.id,
          m.invite_code,
          m.title,
          m.date,
          m.description,
          m.meet_url,
          m.summary,
          m.created_at,
          m.updated_at,
          m.version,
          a.id          AS agenda_id,
          a.order_index,
          a.time,
          a.title       AS agenda_title,
          a.owner,
          a.note
        FROM meetings m
        LEFT JOIN agenda_items a
          ON a.meeting_id = m.id
        WHERE m.id = $1
        ORDER BY a.order_index ASC;
      `,
        [id]
      );

      await client.query("COMMIT");

      const [savedMeeting] = groupMeetings(result.rows);

      // 更新 Redis 暫存 & 廣播
      await redis.set(`meeting:${id}`, JSON.stringify(savedMeeting));
      io.to(`meeting-${id}`).emit("meeting-updated", savedMeeting);

      res.json(savedMeeting);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error saving meeting:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ---------------- 啟動伺服器 ---------------- */

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server ready`);
});
