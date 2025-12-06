// routes/meetings.js - 會議相關 API

const express = require("express");
const router = express.Router();
const { getMeetingFromCache, setMeetingCache, invalidateMeetingCache, queueSync } = require("../utils/cacheManager");

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

  // 取得單一會議（含 agenda）- Redis 優先
  router.get("/:id", async (req, res) => {
    const { id } = req.params;

    console.log(`\n[REQUEST] GET /api/meetings/${id}`);
    try {
      // 先檢查 Redis 快取
      const cachedMeeting = await getMeetingFromCache(redis, id);
      if (cachedMeeting) {
        console.log(`[RESPONSE] Returning cached meeting ${id}`);
        return res.json(cachedMeeting);
      }

      console.log(`[DATABASE] Querying meeting ${id} from PostgreSQL`);
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
            console.log(`[ERROR] Meeting ${id} not found`);
            return res.status(404).json({ error: "Meeting not found" });
        }
        else{
            console.log(`[DATABASE] Query completed, rows: ${result.rowCount}`);
        }

        const [meeting] = groupMeetings(result.rows);
        
        // 寫入 Redis 快取
        await setMeetingCache(redis, id, meeting);
        
        console.log(`[RESPONSE] Returning meeting ${id} from database`);
        res.json(meeting);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[ERROR] Error fetching meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 建立新會議（ID 由資料庫自動產生）- 批量議程插入
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

    console.log(`\n[REQUEST] POST /api/meetings - Creating: ${inviteCode} / ${title}`);
    console.log(`[REQUEST] Agenda items: ${agenda.length}, userId: ${userId}`);

    if (!inviteCode || !title) {
      console.log(`[ERROR] Missing required fields`);
      return res
        .status(400)
        .json({ error: "inviteCode 與 title 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        console.log(`[DATABASE] Starting transaction for new meeting`);
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
        console.log(`[DATABASE] Marked expired meetings`);

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
          console.log(`[ERROR] Invite code already exists: ${inviteCode}`);
          return res.status(409).json({
            error: "此會議代碼已存在 (尚未過期)",
            meetingId: existing.rows[0].id,
          });
        }

        // 新增會議
        console.log(`[DATABASE] Inserting new meeting`);
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
        console.log(`[DATABASE] Meeting created with ID: ${meetingId}`);

        // 如果有提供 userId，將建立者加入為 host
        if (userId) {
          await client.query(
            "INSERT INTO meeting_participants (meeting_id, user_id, role) VALUES ($1, $2, $3)",
            [meetingId, userId, "host"]
          );
          console.log(`[DATABASE] Added host: ${userId}`);
        }

        // 批量新增議程 - 單一 SQL 語句插入所有議程
        if (agenda.length > 0) {
          const agendaValues = agenda
            .map((item, i) => [
              meetingId,
              i,
              item.time || null,
              item.title || "",
              item.owner || null,
              item.note || null,
            ]);

          // 構建批量插入語句
          let query = `INSERT INTO agenda_items (meeting_id, order_index, time, title, owner, note) VALUES `;
          const values = [];
          let paramIndex = 1;

          agendaValues.forEach((row, idx) => {
            const placeholders = [];
            for (let i = 0; i < 6; i++) {
              placeholders.push(`$${paramIndex++}`);
              values.push(row[i]);
            }
            query += `(${placeholders.join(",")})`;
            if (idx < agendaValues.length - 1) query += ",";
          });

          await client.query(query, values);
          console.log(`[DATABASE] Inserted ${agenda.length} agenda items (single batch query)`);
        }

        // 取出完整會議資料回傳
        console.log(`[DATABASE] Fetching complete meeting data`);
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
        console.log(`[DATABASE] Transaction committed`);

        const [savedMeeting] = groupMeetings(result.rows);

        // 更新 Redis 快取 & 廣播
        console.log(`[REDIS] Setting cache for meeting ${meetingId}`);
        await setMeetingCache(redis, meetingId, savedMeeting);
        io.to(`meeting-${meetingId}`).emit("meeting-updated", savedMeeting);

        // 異步入隊同步（可選）
        await queueSync(redis, meetingId, "create", { title, inviteCode });

        console.log(`[RESPONSE] Meeting created successfully: ${meetingId}`);
        res.status(201).json(savedMeeting);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[ERROR] Error creating meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 更新會議（含 agenda）- 批量議程操作 + 快取更新
  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const body = req.body || {};

    const agenda = Array.isArray(body.agenda) ? body.agenda : [];

    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 檢查會議是否存在
        const existing = await client.query(
          "SELECT id, status, expires_at, invite_code, title FROM meetings WHERE id = $1",
          [id]
        );

        if (existing.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Meeting not found" });
        }

        // 動態建構 UPDATE 語句，只更新有提供的欄位
        const updates = [];
        const values = [id];
        let paramIndex = 2;

        if (body.hasOwnProperty('inviteCode')) {
          // 檢查新的 inviteCode 是否衝突
          if (body.inviteCode !== existing.rows[0].invite_code) {
            const conflict = await client.query(
              `SELECT id FROM meetings
                WHERE invite_code = $1
                  AND id <> $2
                  AND status = 'active'
                  AND (expires_at IS NULL OR expires_at > NOW())
                LIMIT 1;`,
              [body.inviteCode, id]
            );

            if (conflict.rowCount > 0) {
              await client.query("ROLLBACK");
              return res.status(409).json({ error: "此會議代碼已存在 (尚未過期)" });
            }
          }
          updates.push(`invite_code = $${paramIndex}`);
          values.push(body.inviteCode);
          paramIndex++;
        }

        if (body.hasOwnProperty('title')) {
          updates.push(`title = $${paramIndex}`);
          values.push(body.title);
          paramIndex++;
        }

        if (body.hasOwnProperty('date')) {
          updates.push(`date = $${paramIndex}`);
          values.push(body.date || null);
          paramIndex++;
        }

        if (body.hasOwnProperty('description')) {
          updates.push(`description = $${paramIndex}`);
          values.push(body.description || null);
          paramIndex++;
        }

        if (body.hasOwnProperty('summary')) {
          updates.push(`summary = $${paramIndex}`);
          values.push(body.summary || null);
          paramIndex++;
        }

        if (body.hasOwnProperty('expiresAt')) {
          updates.push(`expires_at = $${paramIndex}`);
          values.push(body.expiresAt || null);
          paramIndex++;
        }

        if (body.hasOwnProperty('status')) {
          updates.push(`status = $${paramIndex}`);
          values.push(body.status);
          paramIndex++;
        }

        // 檢查過期時間是否已到，若已到則強制標記 expired
        const expiresAtValue = body.hasOwnProperty('expiresAt') ? body.expiresAt : existing.rows[0].expires_at;
        if (expiresAtValue && new Date(expiresAtValue) <= new Date()) {
          const statusUpdateIndex = updates.findIndex(u => u.startsWith('status'));
          if (statusUpdateIndex !== -1) {
            updates[statusUpdateIndex] = `status = $${paramIndex - (updates.length - statusUpdateIndex)}`;
            values[values.length - (updates.length - statusUpdateIndex)] = 'expired';
          } else {
            updates.push(`status = $${paramIndex}`);
            values.push('expired');
            paramIndex++;
          }
        }

        // 如果有欄位需要更新
        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          updates.push(`version = version + 1`);

          const updateQuery = `
            UPDATE meetings
            SET ${updates.join(', ')}
            WHERE id = $1
          `;

          await client.query(updateQuery, values);
        }

        // 先清掉舊的 agenda
        await client.query("DELETE FROM agenda_items WHERE meeting_id = $1", [id]);

        // 批量新增議程 - 單一 SQL 語句插入所有議程
        if (agenda.length > 0) {
          const agendaValues = agenda
            .map((item, i) => [
              id,
              i,
              item.time || null,
              item.title || "",
              item.owner || null,
              item.note || null,
            ]);

          // 構建批量插入語句
          let query = `INSERT INTO agenda_items (meeting_id, order_index, time, title, owner, note) VALUES `;
          const values = [];
          let paramIndex = 1;

          agendaValues.forEach((row, idx) => {
            const placeholders = [];
            for (let i = 0; i < 6; i++) {
              placeholders.push(`$${paramIndex++}`);
              values.push(row[i]);
            }
            query += `(${placeholders.join(",")})`;
            if (idx < agendaValues.length - 1) query += ",";
          });

          await client.query(query, values);
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

        await client.query("COMMIT");

        const [savedMeeting] = groupMeetings(result.rows);

        // 更新 Redis 快取 & 廣播
        await setMeetingCache(redis, id, savedMeeting);
        io.to(`meeting-${id}`).emit("meeting-updated", savedMeeting);

        // 異步入隊同步（可選）
        await queueSync(redis, id, "update", { 
          title: savedMeeting.title, 
          inviteCode: savedMeeting.inviteCode 
        });

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
