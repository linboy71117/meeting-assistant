// routes/users.js - 用戶相關 API

const express = require("express");
const router = express.Router();
const { getGoogleOAuthClient } = require("../utils/googleOAuthManager");
const { getMeetingFromCache, setMeetingCache } = require("../utils/cacheManager");

module.exports = (pool, redis) => {

  // Google OAuth 驗證端點 (用於 ID Token 方式)
  router.post("/auth/google", async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "idToken 為必填欄位" });
    }

    try {
      const googleClient = getGoogleOAuthClient();
      if (!googleClient) {
        return res.status(500).json({ error: "Google OAuth client not initialized" });
      }

      // 驗證 ID Token
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: undefined, // 從 credential 自動取得 client_id
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub; // Google User ID
      const email = payload.email;
      const name = payload.name;

      const client = await pool.connect();
      try {
        // 檢查用戶是否已存在
        const existing = await client.query(
          "SELECT id, email FROM users WHERE google_id = $1",
          [googleId]
        );

        let userId;
        if (existing.rowCount > 0) {
          // 用戶已存在，直接登入
          userId = existing.rows[0].id;
        } else {
          // 新用戶，自動註冊
          const result = await client.query(
            "INSERT INTO users (google_id, email, username) VALUES ($1, $2, $3) RETURNING id, email, username, created_at",
            [googleId, email, name]
          );
          userId = result.rows[0].id;
        }

        // 查詢用戶資訊
        const userResult = await client.query(
          "SELECT id, email, username, created_at FROM users WHERE id = $1",
          [userId]
        );

        res.json(userResult.rows[0]);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error verifying Google token:", err);
      res.status(401).json({ error: "Invalid token" });
    }
  });

  // Google OAuth Callback 路由 (Server-side OAuth flow)
  router.get("/auth/google/callback", async (req, res) => {
    const { code, state, error } = req.query;

    // 檢查錯誤
    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Google Login Error</title></head>
        <body>
          <script>
            window.close();
          </script>
        </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).json({ error: "Missing authorization code" });
    }

    try {
      const googleClient = getGoogleOAuthClient();
      if (!googleClient) {
        return res.status(500).json({ error: "Google OAuth client not initialized" });
      }

      // 交換 authorization code 為 tokens
      const { tokens } = await googleClient.getToken(code);
      
      // 驗證 ID Token
      const ticket = await googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: undefined,
      });

      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name;

      const client = await pool.connect();
      try {
        // 檢查用戶是否已存在
        const existing = await client.query(
          "SELECT id, email FROM users WHERE google_id = $1",
          [googleId]
        );

        let userId;
        if (existing.rowCount > 0) {
          // 用戶已存在，更新 tokens
          userId = existing.rows[0].id;
          await client.query(
            `UPDATE users 
             SET google_access_token = $1, 
                 google_refresh_token = $2,
                 picture = $3
             WHERE google_id = $4`,
            [tokens.access_token, tokens.refresh_token, payload.picture, googleId]
          );
          console.log(`[AUTH_CALLBACK] Updated tokens for user: ${email}`);
        } else {
          // 新用戶，自動註冊並儲存 tokens
          const result = await client.query(
            `INSERT INTO users (google_id, email, username, google_access_token, google_refresh_token, picture) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id, email, username, created_at`,
            [googleId, email, name, tokens.access_token, tokens.refresh_token, payload.picture]
          );
          userId = result.rows[0].id;
          console.log(`[AUTH_CALLBACK] Created new user with tokens: ${email}`);
        }

        // 儲存用戶 ID 到 session 或回傳到前端
        // 由於是 Extension，我們返回 HTML 頁面將用戶資訊通過 postMessage 回傳給 opener
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>Google Login Success</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; text-align: center; }
              .success { color: green; }
              .loading { color: #666; }
            </style>
          </head>
          <body>
            <div class="loading">登入成功，正在返回...</div>
            <script>
              // 通過 postMessage 將用戶資訊傳送給 opener（親窗口）
              const authData = {
                success: true,
                user_id: '${userId}',
                email: '${email}',
                username: '${name || ''}'
              };
              
              // 也儲存到 localStorage 作為備用
              localStorage.setItem('meeting_user_id', '${userId}');
              localStorage.setItem('meeting_user_email', '${email}');
              localStorage.setItem('meeting_user_name', '${name || ''}');
              
              // 發送 postMessage 給 opener
              if (window.opener) {
                window.opener.postMessage(authData, '*');
              }
              
              // 立即關閉窗口
              window.close();
            </script>
          </body>
          </html>
        `;
        res.send(html);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error in OAuth callback:", err);
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Login Error</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; text-align: center; }
            .error { color: red; }
          </style>
        </head>
        <body>
          <div class="error">登入失敗: ${err.message}</div>
          <script>
            const errorData = {
              success: false,
              error: '${err.message}'
            };
            
            // 發送錯誤信息給 opener
            if (window.opener) {
              window.opener.postMessage(errorData, '*');
            }
            
            // 立即關閉窗口
            window.close();
          </script>
        </body>
        </html>
      `);
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

  // ------------------------------------------------
  // 新增：使用者退出會議 (Leave Meeting)
  // ------------------------------------------------
  router.delete("/:userId/meetings/:meetingId", async (req, res) => {
    const { userId, meetingId } = req.params;

    try {
      const client = await pool.connect();
      try {
        // 檢查該使用者是否為 Host (Host 不能退出，只能刪除)
        // 雖然前端會擋，但後端多做一層檢查比較安全
        const roleCheck = await client.query(
          "SELECT role FROM meeting_participants WHERE user_id = $1 AND meeting_id = $2",
          [userId, meetingId]
        );

        if (roleCheck.rowCount > 0 && roleCheck.rows[0].role === 'host') {
          return res.status(400).json({ error: "主持人無法退出會議，請選擇刪除會議。" });
        }

        // 執行移除指令
        const result = await client.query(
          "DELETE FROM meeting_participants WHERE user_id = $1 AND meeting_id = $2",
          [userId, meetingId]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: "您不在該會議中" });
        }

        res.json({ message: "已退出會議" });
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Error leaving meeting:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 取得用戶的會議列表 - 使用 Redis 快取單個會議
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
        
        // 批量快取每個會議
        for (const meeting of meetings) {
          await setMeetingCache(redis, meeting.id, meeting);
        }
        
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
      // 保留完整的 ISO 字串（含時區信息），讓前端自行處理顯示
      const dateStr = row.date ? row.date.toISOString() : null;
      
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
        role: row.role,
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
