// routes/brainstormings.js - 腦力激盪相關 API

const express = require("express");
const router = express.Router();

module.exports = (pool, redis, io) => {
    // 創建腦力激盪
    router.post("/", async (req, res) => {
        const { meetingId, topic, duration } = req.body;
        console.log("[POST /brainstormings] Request body:", req.body);

        if (!meetingId || !topic) {
            console.warn("[POST /brainstormings] Missing meetingId or topic");
            return res.status(400).json({ error: "meetingId 和 topic 為必填欄位" });
        }

        // duration：秒數，預設 5 分鐘
        const expireSeconds = Number(duration) > 0 ? Number(duration) : 300;

        try {
            // 檢查是否已有進行中的腦力激盪
            const existing = await pool.query(
                `
                SELECT id, expires_at
                FROM brainstormings
                WHERE meeting_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [meetingId]
            );

            console.log("[POST /brainstormings] Existing brainstorming:", existing.rows);

            if (existing.rowCount > 0) {
                const expiresAt = new Date(existing.rows[0].expires_at);
                if (expiresAt > new Date()) {
                    console.warn("[POST /brainstormings] Active brainstorming exists:", existing.rows[0]);
                    return res.status(400).json({ error: "此會議已有進行中的腦力激盪" });
                }

                const { created_at, expires_at } = existing.rows[0];

                await pool.query(
                    `
                    DELETE
                    FROM brainstorming_items
                    WHERE meeting_id = $1
                    AND created_at >= $2
                    AND created_at <= $3
                    `,
                    // 參數：[會議 ID, 腦力激盪建立時間, 腦力激盪到期時間]
                    [meetingId, created_at, expires_at] 
                );

                // 過期 → 刪除
                await pool.query(
                    `DELETE FROM brainstormings WHERE meeting_id = $1`,
                    [meetingId]
                );
                console.log("[POST /brainstormings] Deleted expired brainstorming:", existing.rows[0].id);
            }

            // 新增腦力激盪（設定 expires_at = now() + interval）
            const result = await pool.query(
                `
                INSERT INTO brainstormings (meeting_id, topic, expires_at)
                VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval)
                RETURNING *
                `,
                [meetingId, topic, expireSeconds]
            );

            console.log("[POST /brainstormings] Created new brainstorming:", result.rows[0]);

            io.to(`meeting-${meetingId}`).emit("new-brainstorming-created", result.rows[0]);
            res.json(result.rows[0]);

        } catch (err) {
            console.error("[POST /brainstormings] Error creating brainstorming:", err);
            res.status(500).json({ error: "Internal server error" });
        }
    });


    // 創建腦力激盪想法
    router.post("/:meetingId/ideas", async (req, res) => {
        const { meetingId } = req.params;
        const { idea, userId } = req.body;
        console.log(`[POST /brainstormings/${meetingId}/ideas] Request body:`, req.body);

        if (!idea) {
            console.warn(`[POST /brainstormings/${meetingId}/ideas] Missing idea`);
            return res.status(400).json({ error: "idea 為必填欄位" });
        }

        try {
            const result = await pool.query(
                `INSERT INTO brainstorming_items (meeting_id, user_id, idea)
                VALUES ($1, $2, $3)
                RETURNING *`,
                [meetingId, userId, idea]
            );
            console.log(`[POST /brainstormings/${meetingId}/ideas] Created idea:`, result.rows[0]);

            io.to(`meeting-${meetingId}`).emit("new-brainstorming-idea", result.rows[0]);
            res.json(result.rows[0]);

        } catch (err) {
            console.error(`[POST /brainstormings/${meetingId}/ideas] Error creating idea:`, err);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // 取得進行中的腦力激盪主題和到期時間
    router.get("/:meetingId/active", async (req, res) => {
        const { meetingId } = req.params;
        console.log(`[GET /brainstormings/${meetingId}/active] Fetching active brainstorming`);

        try {
            // 查詢最新的腦力激盪紀錄
            const result = await pool.query(
                `
                SELECT id, topic, expires_at
                FROM brainstormings
                WHERE meeting_id = $1
                ORDER BY created_at DESC
                LIMIT 1
                `,
                [meetingId]
            );

            if (result.rowCount === 0) {
                console.log(`[GET /brainstormings/${meetingId}/active] No brainstorming found`);
                return res.status(404).json({ error: "No brainstorming session found for this meeting." });
            }

            const brainstorming = result.rows[0];
            const expiresAt = new Date(brainstorming.expires_at);

            // 檢查是否已過期
            if (expiresAt <= new Date()) {
                console.log(`[GET /brainstormings/${meetingId}/active] Brainstorming expired at:`, expiresAt);
                return res.status(404).json({ error: "The active brainstorming session has expired." });
            }

            // 回傳主題和到期時間
            console.log(`[GET /brainstormings/${meetingId}/active] Active brainstorming found:`, { topic: brainstorming.topic, expires_at: brainstorming.expires_at });
            res.json({
                id: brainstorming.id,
                topic: brainstorming.topic,
                expires_at: brainstorming.expires_at
            });

        } catch (err) {
            console.error(`[GET /brainstormings/${meetingId}/active] Error fetching active brainstorming:`, err);
            res.status(500).json({ error: "Internal server error" });
        }
    });


    // 腦力激盪結束時，取得腦力激盪資料
    router.get("/:meetingId/complete", async (req, res) => {
        const { meetingId } = req.params;
        console.log(`[GET /brainstormings/${meetingId}/complete] Fetching brainstorming results`);

        try {
            const brainstorming = await pool.query(
                `SELECT *
                FROM brainstormings
                WHERE meeting_id = $1
                ORDER BY created_at DESC
                LIMIT 1`,
                [meetingId]
            );
            console.log(`[GET /brainstormings/${meetingId}/complete] Brainstorming fetched:`, brainstorming.rows);

            if (brainstorming.rowCount === 0) {
                console.warn(`[GET /brainstormings/${meetingId}/complete] Brainstorming not found`);
                return res.status(404).json({ error: "Brainstorming not found" });
            }

            const { created_at, expires_at } = brainstorming.rows[0];

            const items = await pool.query(
                `
                SELECT *
                FROM brainstorming_items
                WHERE meeting_id = $1
                AND created_at >= $2
                AND created_at <= $3
                ORDER BY created_at ASC
                `,
                // 參數：[會議 ID, 腦力激盪建立時間, 腦力激盪到期時間]
                [meetingId, created_at, expires_at] 
            );
            console.log(`[GET /brainstormings/${meetingId}/complete] Ideas fetched:`, items.rows);

            res.json({
                brainstorming: brainstorming.rows[0],
                ideas: items.rows
            });

        } catch (err) {
            console.error(`[GET /brainstormings/${meetingId}/complete] Error fetching brainstorming results:`, err);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
};
