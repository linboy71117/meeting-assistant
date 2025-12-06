// routes/meetings.js - 會議相關 API

const express = require("express");
const router = express.Router();

module.exports = (pool, redis, io) => {
  // 取得所有會議列表（含 agenda）
  router.get("/", async (req, res) => {
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
  router.get("/:id", async (req, res) => {
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
          m.summary,
          m.status,
          m.expires_at,
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

  // 建立新會議（ID 由資料庫自動產生）
  router.post("/", async (req, res) => {
    const body = req.body || {};

    const inviteCode = body.inviteCode; // Google Meet 代碼
    const title = body.title;
    const date = body.date || null;
    const description = body.description || null;
    const summary = body.summary || null;
    const expiresAt = body.expiresAt || null; // 選填：過期時間
    const agenda = Array.isArray(body.agenda) ? body.agenda : [];
    const userId = body.userId; // 建立者的 user ID

    if (!inviteCode || !title) {
      return res
        .status(400)
        .json({ error: "inviteCode 與 title 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 將已過期但狀態仍為 active 的會議標記為 expired
        await client.query(
          `UPDATE meetings
             SET status = 'expired'
           WHERE invite_code = $1
             AND status = 'active'
             AND expires_at IS NOT NULL
             AND expires_at <= NOW();`,
          [inviteCode]
        );

        // 檢查是否有未過期且 active 的同代碼會議
        const existing = await client.query(
          `SELECT id
             FROM meetings
            WHERE invite_code = $1
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            LIMIT 1;`,
          [inviteCode]
        );

        if (existing.rowCount > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "此會議代碼已存在 (尚未過期)",
            meetingId: existing.rows[0].id,
          });
        }

        // 新增會議
        const insertResult = await client.query(
          `
        INSERT INTO meetings (
          invite_code, title, date, description, summary, expires_at, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        RETURNING id
      `,
          [inviteCode, title, date, description, summary, expiresAt]
        );

        const meetingId = insertResult.rows[0].id;

        // 如果有提供 userId，將建立者加入為 host
        if (userId) {
          await client.query(
            "INSERT INTO meeting_participants (meeting_id, user_id, role) VALUES ($1, $2, $3)",
            [meetingId, userId, "host"]
          );
        }

        // 新增議程
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
              meetingId,
              i,
              item.time || null,
              item.title || "",
              item.owner || null,
              item.note || null,
            ]
          );
        }

        // 取出完整會議資料回傳
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
          [meetingId]
        );

        await client.query("COMMIT");

        const [savedMeeting] = groupMeetings(result.rows);

        // 更新 Redis 暫存 & 廣播
        await redis.set(`meeting:${meetingId}`, JSON.stringify(savedMeeting));
        io.to(`meeting-${meetingId}`).emit("meeting-updated", savedMeeting);

        res.status(201).json(savedMeeting);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error creating meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 更新會議（含 agenda）
  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    const inviteCode = body.inviteCode;
    const title = body.title;
    const date = body.date || null;
    const description = body.description || null;
    const summary = body.summary || null;
    const expiresAt = body.expiresAt || null;
    const status = body.status || null; // 選填：active/expired
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

        // 檢查會議是否存在
        const existing = await client.query(
          "SELECT id, status, expires_at FROM meetings WHERE id = $1",
          [id]
        );

        if (existing.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Meeting not found" });
        }

        // 若更換 inviteCode，檢查其他 active 未過期的衝突
        const conflict = await client.query(
          `SELECT id FROM meetings
            WHERE invite_code = $1
              AND id <> $2
              AND status = 'active'
              AND (expires_at IS NULL OR expires_at > NOW())
            LIMIT 1;`,
          [inviteCode, id]
        );

        if (conflict.rowCount > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "此會議代碼已存在 (尚未過期)" });
        }

        // 決定新狀態與過期時間（若未提供則沿用舊值）
        const newExpiresAt = expiresAt !== null ? expiresAt : existing.rows[0].expires_at;
        const newStatus = status || existing.rows[0].status || "active";

        // 若過期時間已到，強制標記 expired
        const finalStatus = newExpiresAt && new Date(newExpiresAt) <= new Date() ? "expired" : newStatus;

        // 更新會議
        await client.query(
          `
        UPDATE meetings
        SET
          invite_code = $2,
          title       = $3,
          date        = $4,
          description = $5,
          summary     = $6,
          expires_at  = $7,
          status      = $8,
          updated_at  = NOW(),
          version     = version + 1
        WHERE id = $1
      `,
          [id, inviteCode, title, date, description, summary, newExpiresAt, finalStatus]
        );

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
              item.title || "",
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
      console.error("Error updating meeting:", err);
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
