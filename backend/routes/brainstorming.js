// routes/brainstormings.js - 腦力激盪相關 API

const express = require("express");
const { Worker } = require('worker_threads');
const router = express.Router();

// 💡 定義 AI 處理中的狀態標記
const AI_STATUS_PROCESSING = 'PROCESSING...';

/**
 * 處理 Worker Thread 返回的結果，並更新資料庫和通知客戶端。
 * @param {object} result - 包含分析結果的物件
 * @param {object} pool - PostgreSQL 連線池
 * @param {object} io - Socket.IO 實例
 */
function handleWorkerResult(result, pool, io) {
    if (result.success) {
        const { meetingId, summary } = result;
        
        // 1. 儲存 AI 分析結果到資料庫
        pool.query(
            `UPDATE brainstormings SET ai_summary = $1 WHERE meeting_id = $2`,
            [summary, meetingId]
        )
        .then(() => {
            console.log(`[Main Thread] AI analysis saved for meeting ${meetingId}.`);
            // 2. 使用 Socket.IO 通知客戶端
            io.to(`meeting-${meetingId}`).emit("ai-analysis-completed", {
                meetingId: meetingId,
                ai_summary: summary
            });
        })
        .catch(dbErr => {
            console.error(`[Main Thread] DB update failed for AI summary:`, dbErr);
        });
    } else {
        console.error(`[Main Thread] AI analysis worker failed for meeting ${result.meetingId}:`, result.error);
        // 可以在這裡發送一個失敗通知給客戶端或記錄錯誤
    }
}


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
            const brainstormingQuery = await pool.query(
                `SELECT *
                FROM brainstormings
                WHERE meeting_id = $1
                ORDER BY created_at DESC
                LIMIT 1`,
                [meetingId]
            );
            // console.log(`[GET /brainstormings/${meetingId}/complete] Brainstorming fetched:`, brainstormingQuery.rows);

            if (brainstormingQuery.rowCount === 0) {
                console.warn(`[GET /brainstormings/${meetingId}/complete] Brainstorming not found`);
                return res.status(404).json({ error: "Brainstorming not found" });
            }

            const brainstorming = brainstormingQuery.rows[0];
            // 💡 修正：使用 id 和 ai_summary
            const { created_at, expires_at, ai_summary } = brainstorming;

            const itemsQuery = await pool.query(
                `
                SELECT bi.*, u.username
                FROM brainstorming_items bi
                LEFT JOIN users u ON bi.user_id = u.id
                WHERE bi.meeting_id = $1
                AND bi.created_at >= $2
                AND bi.created_at <= $3
                ORDER BY bi.created_at ASC
                `,
                // 參數：[會議 ID, 腦力激盪建立時間, 腦力激盪到期時間]
                [meetingId, created_at, expires_at]
            );
            // rows now include a `username` field (may be null for anonymous items)
            const ideas = itemsQuery.rows.map(row => ({
                id: row.id,
                meeting_id: row.meeting_id,
                user_id: row.user_id,
                username: row.username || null,
                idea: row.idea,
                created_at: row.created_at
            }));
            console.log(`[GET /brainstormings/${meetingId}/complete] Ideas fetched:`, ideas);

            // ----------------------------------------------------
            // 3. 檢查 AI 總結狀態，並啟動 Worker 執行背景任務
            // ----------------------------------------------------
            // 💡 檢查條件：ai_summary 必須為 NULL (未啟動過) 且想法數量 > 0
            const shouldStartWorker = (!ai_summary || ai_summary === AI_STATUS_PROCESSING) && ideas.length > 0;
            
            if (shouldStartWorker) {
                
                // 💡 步驟 3A: 在啟動 Worker 之前，先將 DB 狀態設為 PROCESSING
                if (!ai_summary) {
                    await pool.query(
                        `UPDATE brainstormings 
                         SET ai_summary = $1 
                         WHERE meeting_id = $2`,
                        [AI_STATUS_PROCESSING, meetingId]
                    );
                    console.log(`[GET /complete] DB locked for AI analysis: ${meetingId}`);
                }
                
                // 💡 步驟 3B: 立即啟動 Worker Thread
                const worker = new Worker('./routes/worker/ai_analysis.js', {
                    workerData: {
                        meetingId: meetingId,
                        topic: brainstorming.topic,
                        ideasList: ideas.map(item => item.idea) 
                    }
                });

                // 設置 Worker 的事件監聽器，使用 bind 確保 pool 和 io 傳遞正確
                worker.on('message', (result) => {
                    handleWorkerResult(result, pool, io)
                }); 
                worker.on('error', (err) => {
                    console.error(`[Main Thread] Worker encountered a critical error:`, err);
                });
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        console.error(`[Main Thread] Worker stopped with exit code ${code}`);
                    }
                });

                console.log(`[GET /complete] AI analysis job started in Worker Thread.`);
            }
            
            // 4. 立即回傳結果
            // 注意：我們回傳的 brainstorming.ai_summary 可能是 NULL、最終總結或 'PROCESSING...'
            res.json({
                brainstorming: { 
                    ...brainstorming, 
                    // 💡 確保回傳最新的狀態，包含可能的 'PROCESSING...'
                    ai_summary: shouldStartWorker && !ai_summary ? AI_STATUS_PROCESSING : ai_summary 
                }, 
                ideas: ideas
            });

        } catch (err) {
            console.error(`[GET /brainstormings/${meetingId}/complete] Error fetching brainstorming results:`, err);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
};


