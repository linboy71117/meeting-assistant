// services/syncWorker.js - 異步會議同步工作者

const SYNC_QUEUE_KEY = "meeting-sync-queue";
const SYNC_BATCH_SIZE = 10;
const SYNC_INTERVAL = 30 * 1000; // 30 秒

/**
 * 啟動異步同步工作者
 * @param {object} pool - PostgreSQL 連線池
 * @param {object} redis - Redis 客戶端
 */
function startSyncWorker(pool, redis) {
  console.log("Starting meeting sync worker...");

  // 定期處理同步隊列
  const workerInterval = setInterval(() => {
    processSyncQueue(pool, redis).catch((err) => {
      console.error("Error in sync worker:", err);
    });
  }, SYNC_INTERVAL);

  // 優雅關閉
  process.on("SIGTERM", () => {
    clearInterval(workerInterval);
    console.log("Sync worker stopped");
  });

  return workerInterval;
}

/**
 * 處理同步隊列
 * @param {object} pool - PostgreSQL 連線池
 * @param {object} redis - Redis 客戶端
 */
async function processSyncQueue(pool, redis) {
  try {
    // 批量取出隊列中的任務
    const tasks = await redis.lrange(SYNC_QUEUE_KEY, 0, SYNC_BATCH_SIZE - 1);

    if (tasks.length === 0) {
      // 隊列空，不輸出日誌避免過度日誌
      return;
    }

    console.log(`\n[SYNC WORKER] Processing ${tasks.length} tasks from queue`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const taskStr of tasks) {
        try {
          const task = JSON.parse(taskStr);
          console.log(`[SYNC WORKER] Processing: ${task.operation} for meeting:${task.meetingId}`);
          await processSyncTask(client, task);
        } catch (err) {
          console.error("[SYNC WORKER] Error processing sync task:", err.message);
          // 繼續處理下一個任務
        }
      }

      await client.query("COMMIT");
      console.log(`[SYNC WORKER] All tasks committed`);

      // 刪除已處理的任務
      await redis.ltrim(SYNC_QUEUE_KEY, tasks.length, -1);
      console.log(`[SYNC WORKER] Queue trimmed, remaining: ${await redis.llen(SYNC_QUEUE_KEY)}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[SYNC WORKER] Error processing sync queue:", err);
  }
}

/**
 * 處理單個同步任務
 * @param {object} client - PostgreSQL 客戶端
 * @param {object} task - 同步任務
 */
async function processSyncTask(client, task) {
  const { meetingId, operation, data, timestamp } = task;

  console.log(`[SYNC WORKER] [${timestamp}] Executing ${operation} for meeting ${meetingId}`);

  // 這裡可以添加更多同步邏輯，例如
  // - 記錄變更日誌到審計表
  // - 執行更複雜的驗證
  // - 通知外部系統
  // 目前數據已在主流程中同步到 DB，此處僅進行日誌記錄
  
  // 如果需要審計日誌功能，可在後續添加 audit_log 表
  // await client.query(
  //   `INSERT INTO audit_log (meeting_id, operation, timestamp)
  //    VALUES ($1, $2, $3)`,
  //   [meetingId, operation, timestamp]
  // );
  
  console.log(`[SYNC WORKER] Task completed for meeting ${meetingId}`);
}

module.exports = {
  startSyncWorker,
  processSyncQueue,
};
