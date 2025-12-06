// utils/cacheManager.js - Redis 快取管理工具

const CACHE_TTL = 5 * 60; // 5 分鐘

/**
 * 從 Redis 獲取會議數據（支持超時重新查詢）
 * @param {object} redis - Redis 客戶端
 * @param {number} meetingId - 會議 ID
 * @returns {object|null} - 會議對象或 null
 */
async function getMeetingFromCache(redis, meetingId) {
  try {
    console.log(`[REDIS] GET request: meeting:${meetingId}`);
    const cached = await redis.get(`meeting:${meetingId}`);
    if (cached) {
      console.log(`[REDIS] CACHE HIT: meeting:${meetingId}`);
      return JSON.parse(cached);
    } else {
      console.log(`[REDIS] CACHE MISS: meeting:${meetingId}`);
      return null;
    }
  } catch (err) {
    console.error("[REDIS] Error reading from cache:", err.message);
    return null;
  }
}

/**
 * 將會議數據存入 Redis
 * @param {object} redis - Redis 客戶端
 * @param {number} meetingId - 會議 ID
 * @param {object} meetingData - 會議數據
 * @param {number} ttl - 存活時間（秒）
 */
async function setMeetingCache(redis, meetingId, meetingData, ttl = CACHE_TTL) {
  try {
    console.log(`[REDIS] SET request: meeting:${meetingId} (TTL: ${ttl}s)`);
    await redis.setex(`meeting:${meetingId}`, ttl, JSON.stringify(meetingData));
    console.log(`[REDIS] SET success: meeting:${meetingId}`);
  } catch (err) {
    console.error("[REDIS] Error writing to cache:", err.message);
    // 不拋出錯誤，快取失敗不應中斷主流程
  }
}

/**
 * 清除會議的 Redis 快取
 * @param {object} redis - Redis 客戶端
 * @param {number} meetingId - 會議 ID
 */
async function invalidateMeetingCache(redis, meetingId) {
  try {
    console.log(`[REDIS] DEL request: meeting:${meetingId}`);
    const result = await redis.del(`meeting:${meetingId}`);
    console.log(`[REDIS] DEL success: meeting:${meetingId} (affected: ${result})`);
  } catch (err) {
    console.error("[REDIS] Error deleting cache:", err.message);
  }
}

/**
 * 同步快取到 Redis 隊列（異步同步）
 * @param {object} redis - Redis 客戶端
 * @param {number} meetingId - 會議 ID
 * @param {string} operation - 操作類型 ('create'|'update'|'delete')
 * @param {object} data - 數據
 */
async function queueSync(redis, meetingId, operation, data) {
  try {
    const payload = JSON.stringify({
      meetingId,
      operation,
      data,
      timestamp: new Date().toISOString(),
    });
    console.log(`[REDIS QUEUE] RPUSH: ${operation} operation for meeting:${meetingId}`);
    await redis.rpush("meeting-sync-queue", payload);
    console.log(`[REDIS QUEUE] Queued successfully`);
  } catch (err) {
    console.error("[REDIS QUEUE] Error queuing sync:", err.message);
  }
}

module.exports = {
  getMeetingFromCache,
  setMeetingCache,
  invalidateMeetingCache,
  queueSync,
  CACHE_TTL,
};
