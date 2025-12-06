// routes/users.js - 用戶相關 API

const express = require("express");
const router = express.Router();

module.exports = (pool) => {
  // 註冊新用戶
  router.post("/register", async (req, res) => {
    const { name, email } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name 為必填欄位" });
    }

    if (!email) {
      return res.status(400).json({ error: "email 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        // 檢查 email 是否已被使用
        const existing = await client.query(
          "SELECT id FROM users WHERE email = $1",
          [email]
        );

        if (existing.rowCount > 0) {
          return res.status(409).json({ error: "此 email 已被註冊" });
        }

        // 建立新用戶
        const result = await client.query(
          "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at",
          [name, email]
        );

        res.status(201).json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error registering user:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 用戶登入
  router.post("/login", async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          "SELECT id, name, email, created_at FROM users WHERE email = $1",
          [email]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: "用戶不存在，請先註冊" });
        }

        res.json(result.rows[0]);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error logging in user:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 使用inviteCode加入會議
  router.post("/:userId/join", async (req, res) => {
    const { userId } = req.params;
    const { inviteCode } = req.body;

    if (!inviteCode) {
      return res.status(400).json({ error: "inviteCode 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 檢查用戶是否存在
        const userCheck = await client.query(
          "SELECT id FROM users WHERE id = $1",
          [userId]
        );

        if (userCheck.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "User not found" });
        }

        // 檢查會議是否存在
        const meetingResult = await client.query(
          `SELECT id, invite_code, title
             FROM meetings
            WHERE invite_code = $1
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            LIMIT 1;`,
          [inviteCode]
        );

        if (meetingResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Invalid invite code" });
        }

        const meeting = meetingResult.rows[0];

        // 檢查是否已經加入
        const participantCheck = await client.query(
          "SELECT id FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2",
          [meeting.id, userId]
        );

        if (participantCheck.rowCount === 0) {
          // 加入會議
          await client.query(
            "INSERT INTO meeting_participants (meeting_id, user_id, role) VALUES ($1, $2, $3)",
            [meeting.id, userId, "participant"]
          );
        }

        await client.query("COMMIT");

        res.json({
          meetingId: meeting.id,
          inviteCode: meeting.invite_code,
          title: meeting.title,
          message: "Successfully joined meeting",
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error joining meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 取得用戶的會議列表
  router.get("/:userId/meetings", async (req, res) => {
    const { userId } = req.params;

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
          m.summary,
          m.status,
          m.expires_at,
          m.created_at,
          m.updated_at,
          m.version,
          mp.role,
          mp.joined_at,
          a.id          AS agenda_id,
          a.order_index,
          a.time,
          a.title       AS agenda_title,
          a.owner,
          a.note
        FROM meeting_participants mp
        JOIN meetings m ON mp.meeting_id = m.id
        LEFT JOIN agenda_items a ON a.meeting_id = m.id
        WHERE mp.user_id = $1
        ORDER BY m.created_at DESC, a.order_index ASC;
      `,
          [userId]
        );

        // 使用 groupMeetings 函數（需要從外部傳入或重新定義）
        const meetings = groupMeetings(result.rows);
        res.json(meetings);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error fetching user meetings:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};

// Helper function: 把 JOIN 後的 rows -> group 成 meetings 陣列
function groupMeetings(rows) {
  const map = new Map();

  for (const row of rows) {
    let m = map.get(row.id);
    if (!m) {
      m = {
        id: row.id,
        inviteCode: row.invite_code,
        title: row.title,
        date: row.date ? row.date.toISOString().slice(0, 10) : null,
        description: row.description,
        summary: row.summary,
        version: row.version,
        status: row.status,
        expiresAt: row.expires_at,
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
