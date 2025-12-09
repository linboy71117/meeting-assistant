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

    const title = body.title;
    const date = body.date || null;
    const description = body.description || null;
    const summary = body.summary || null;
    const expiresAt = body.expiresAt || null;
    const agenda = Array.isArray(body.agenda) ? body.agenda : [];
    const userId = body.userId;

    console.log(`\n[REQUEST] POST /api/meetings - Creating: ${title}`);
    console.log(`[REQUEST] Agenda items: ${agenda.length}, userId: ${userId}, date: ${date}`);

    if (!title) {
      console.log(`[ERROR] Missing required field: title`);
      return res.status(400).json({ error: "title 為必填欄位" });
    }

    if (!date) {
      console.log(`[ERROR] Missing required field: date`);
      return res.status(400).json({ error: "date 為必填欄位" });
    }

    try {
      const client = await pool.connect();
      try {
        console.log(`[DATABASE] Starting transaction for new meeting`);
        await client.query("BEGIN");

        // 驗證 userId 是否存在
        const userCheck = await client.query(
          "SELECT id FROM users WHERE id = $1",
          [userId]
        );

        if (userCheck.rowCount === 0) {
          await client.query("ROLLBACK");
          console.log(`[ERROR] User not found: ${userId}`);
          return res.status(404).json({ error: "使用者不存在，請先登入" });
        }

        // 將 datetime-local 字符串轉換為帶時區的 timestamp
        // datetime-local 格式: "2025-12-10T06:00" 或 "2025-12-10T06:00:00"
        // 這是本地時間（使用者輸入的時間），需要保存為台北時區: "2025-12-10T06:00:00+08:00"
        let normalizedDate = null;
        if (date) {
          // 確保有秒數
          const parts = date.split('T');
          if (parts.length === 2) {
            const timePart = parts[1];
            // 如果時間部分沒有秒數（HH:mm），補上 :00
            const hasSeconds = timePart.split(':').length === 3;
            // 附加台北時區 (+08:00) 而不是 UTC
            normalizedDate = hasSeconds ? `${date}+08:00` : `${date}:00+08:00`;
          }
        }

        // 使用 UUID 生成唯一的 invite code（格式: abc-def-ghi）
        const inviteCodeResult = await client.query(
          `
          SELECT 
            substring(replace(gen_random_uuid()::text, '-', '') from 1 for 3) || '-' ||
            substring(replace(gen_random_uuid()::text, '-', '') from 1 for 3) || '-' ||
            substring(replace(gen_random_uuid()::text, '-', '') from 1 for 3) AS code
          `
        );
        
        const inviteCode = inviteCodeResult.rows[0].code;
        console.log(`[DATABASE] Generated unique invite code: ${inviteCode}`);

        // 新增會議（使用 UUID 生成的 invite code）
        console.log(`[DATABASE] Inserting new meeting with invite code: ${inviteCode}`);
        const insertResult = await client.query(
          `
        INSERT INTO meetings (
          invite_code, title, date, description, summary, expires_at, status
        )
        VALUES ($1, $2, $3::TIMESTAMPTZ, $4, $5, $6, 'active')
        RETURNING id
      `,
          [inviteCode, title, normalizedDate, description, summary, expiresAt]
        );

        const meetingId = insertResult.rows[0].id;
        console.log(`[DATABASE] Meeting created with ID: ${meetingId}, invite code: ${inviteCode}`);

        // 如果有提供 userId，將建立者加入為 host
        if (userId) {
          await client.query(
            "INSERT INTO meeting_participants (meeting_id, user_id, role) VALUES ($1, $2, $3)",
            [meetingId, userId, "host"]
          );
          console.log(`[DATABASE] Added host: ${userId}`);

          // 嘗試創建 Google Meet 並保存 calendar_event_id 和 invite_code
          try {
            const { createGoogleMeetForUser } = require("../utils/googleMeetHelper");
            const meetResult = await createGoogleMeetForUser(pool, userId, {
              title: title,
              description: description || "",
              startTime: new Date(normalizedDate),
              durationMinutes: 60,
            });

            if (meetResult.eventId && meetResult.meetCode) {
              // 更新會議記錄，保存 calendar_event_id 和 Google Meet 的 invite_code
              await client.query(
                "UPDATE meetings SET calendar_event_id = $1, invite_code = $2 WHERE id = $3",
                [meetResult.eventId, meetResult.meetCode, meetingId]
              );
              console.log(`[GOOGLE_CALENDAR] Saved calendar_event_id ${meetResult.eventId} and invite_code ${meetResult.meetCode} for meeting ${meetingId}`);
            }
          } catch (meetErr) {
            console.warn(`[WARNING] Failed to create Google Meet: ${meetErr.message}`);
            // 不中斷流程，已經創建了會議和自動生成的 invite code
          }
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

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const client = await pool.connect();
      try {
        // 先取得會議資訊（包括 calendar_event_id 和 host）
        const meetingResult = await client.query(
          `SELECT id, calendar_event_id, invite_code, title
           FROM meetings 
           WHERE id = $1`,
          [id]
        );

        if (meetingResult.rowCount === 0) {
          return res.status(404).json({ error: "找不到該會議或已刪除" });
        }

        const meeting = meetingResult.rows[0];
        const calendarEventId = meeting.calendar_event_id;
        const inviteCode = meeting.invite_code;

        console.log(`[DELETE] Meeting ${id}: calendar_event_id=${calendarEventId}, invite_code=${inviteCode}`);

        // 若有 calendar_event_id，嘗試刪除 Google Calendar 事件
        if (calendarEventId && inviteCode) {
          console.log(`[DELETE] Attempting to delete Google Calendar event ${calendarEventId}`);
          try {
            const { deleteGoogleMeetEventForUser } = require("../utils/googleMeetHelper");
            
            // 取得 host 使用者（會議建立者）
            const hostResult = await client.query(
              `SELECT user_id FROM meeting_participants 
               WHERE meeting_id = $1 AND role = 'host' 
               LIMIT 1`,
              [id]
            );

            if (hostResult.rowCount > 0) {
              const hostUserId = hostResult.rows[0].user_id;
              console.log(`[DELETE] Found host user: ${hostUserId}`);
              const deleteResult = await deleteGoogleMeetEventForUser(pool, hostUserId, calendarEventId);
              console.log(`[GOOGLE_CALENDAR] Delete result: ${JSON.stringify(deleteResult)}`);
              if (deleteResult.deleted) {
                console.log(`[GOOGLE_CALENDAR] Successfully deleted calendar event ${calendarEventId}`);
              } else {
                console.warn(`[GOOGLE_CALENDAR] Failed to delete calendar event: ${deleteResult.reason}`);
              }
            } else {
              console.warn(`[DELETE] No host user found for meeting ${id}`);
            }
          } catch (calendarErr) {
            console.error(`[ERROR] Exception while deleting Google Calendar event: ${calendarErr.message}`, calendarErr);
            // 不中斷刪除流程，繼續刪除資料庫記錄
          }
        } else {
          console.log(`[DELETE] Skipping Google Calendar deletion: calendar_event_id=${calendarEventId}`);
        }

        // 執行刪除指令
        // 因為 DB schema 有設定 ON DELETE CASCADE
        // 所以刪除 meetings 時，相關的 participants 和 agenda 也會自動消失
        const result = await client.query(
          "DELETE FROM meetings WHERE id = $1 RETURNING id",
          [id]
        );

        // 清除 Redis 快取
        if (redis) {
          await redis.del(`meeting:${id}`);
        }

        console.log(`[DATABASE] Meeting ${id} deleted successfully`);
        res.json({ message: "會議已刪除", id });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error deleting meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 更新會議（含 agenda）- 日期變更時重新建立 Meet
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
          "SELECT id, status, expires_at, invite_code, title, date, calendar_event_id FROM meetings WHERE id = $1",
          [id]
        );

        if (existing.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Meeting not found" });
        }

        const currentDate = existing.rows[0].date;
        const currentInviteCode = existing.rows[0].invite_code;
        const currentCalendarEventId = existing.rows[0].calendar_event_id;
        const newDate = body.date || currentDate;
        
        // 正規化日期：datetime-local 字符串 → 帶台北時區的 timestamp
        // 前端的 datetime-local 是本地時間，直接附加 +08:00
        let normalizedNewDate = newDate;
        if (body.hasOwnProperty('date') && body.date) {
          const parts = body.date.split('T');
          if (parts.length === 2) {
            const timePart = parts[1];
            // 如果時間部分沒有秒數（HH:mm），補上 :00
            const hasSeconds = timePart.split(':').length === 3;
            // 附加台北時區 (+08:00)
            normalizedNewDate = hasSeconds ? `${body.date}+08:00` : `${body.date}:00+08:00`;
          }
        }
        
        // 檢查日期是否有變更
        // 注意：datetime-local 格式來自前端，已是本地時間，直接比較
        const dateChanged = body.hasOwnProperty('date') && body.date !== currentDate;

        // 動態建構 UPDATE 語句，只更新有提供的欄位
        const updates = [];
        const values = [id];
        let paramIndex = 2;

        // 如果日期有變更，則更新 Google Calendar 事件的時間
        if (dateChanged && body.userId && currentCalendarEventId) {
          const { updateGoogleMeetTimeForUser } = require("../utils/googleMeetHelper");
          const meeting = await client.query(
            "SELECT title, description FROM meetings WHERE id = $1",
            [id]
          );

          console.log(`[GOOGLE_MEET] Date changed; updating calendar time for eventId: ${currentCalendarEventId}`);
          try {
            const updateResult = await updateGoogleMeetTimeForUser(pool, body.userId, currentInviteCode, {
              startTime: new Date(normalizedNewDate),
              durationMinutes: 60,
              eventId: currentCalendarEventId || null,
            });

            if (!updateResult.updated) {
              console.warn(`[GOOGLE_MEET] Calendar event not updated for invite code ${currentInviteCode}: ${updateResult.reason || 'unknown reason'}`);
            } else {
              console.log(`[GOOGLE_MEET] Calendar event updated successfully`);
            }
          } catch (meetErr) {
            console.warn(`[WARNING] Failed to update Google Calendar time: ${meetErr.message}`);
            // 不中斷流程，繼續更新會議記錄
          }
        }

        // 更新其他欄位
        if (body.hasOwnProperty('title')) {
          updates.push(`title = $${paramIndex}`);
          values.push(body.title);
          paramIndex++;
        }

        if (body.hasOwnProperty('date')) {
          updates.push(`date = $${paramIndex}::TIMESTAMPTZ`);
          values.push(normalizedNewDate);
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
      // 將 TIMESTAMPTZ 轉為本地時間字串（保留時區信息）
      let dateStr = null;
      if (row.date) {
        // PostgreSQL 的 TIMESTAMPTZ 已包含時區信息
        // 不轉為 UTC，直接返回 ISO 字串
        dateStr = row.date.toISOString();
      }
      
      m = {
        id: row.id,
        inviteCode: row.invite_code,
        title: row.title,
        date: dateStr,
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
