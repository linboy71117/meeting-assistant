/**
 * Google Meet Helper - 通過 Google Calendar API 創建會議
 * 從返回的 Meet 連結中提取 inviteCode
 */

const { google } = require('googleapis');
const { getGoogleOAuthClient } = require('./googleOAuthManager');
const MEET_URL_PREFIX = 'https://meet.google.com/';

/**
 * 為用戶創建 Google Meet（通過 Google Calendar API）
 * @param {Pool} pool - PostgreSQL 連接池
 * @param {string} userId - 用戶 ID
 * @param {Object} options - 會議選項 { title, description, startTime, durationMinutes }
 * @returns {Promise<{ meetCode: string, meetUrl: string }>}
 */
async function createGoogleMeetForUser(pool, userId, options = {}) {
  const { title = '會議', description = '', startTime = new Date(), durationMinutes = 60 } = options;

  try {
    // 1. 從資料庫取得用戶的 Google OAuth Token
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT google_access_token, google_refresh_token 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (result.rowCount === 0) {
        throw new Error(`用戶 ${userId} 不存在`);
      }

      const { google_access_token, google_refresh_token } = result.rows[0];

      if (!google_access_token) {
        throw new Error(`用戶 ${userId} 未授權 Google Calendar`);
      }

      // 2. 取得 Google OAuth 客戶端
      const oauth2Client = getGoogleOAuthClient();
      
      if (!oauth2Client) {
        throw new Error('Google OAuth client not initialized');
      }

      oauth2Client.setCredentials({
        access_token: google_access_token,
        refresh_token: google_refresh_token,
      });

      // 3. 創建 Google Calendar API 實例
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      // 4. 計算結束時間
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      // 5. 構建會議事件（包含 Google Meet）
      // startTime 來自 DB 的 TIMESTAMPTZ，已經包含 +08:00 時區信息
      // 但 toISOString() 會自動轉為 UTC，所以需要重新指定 timeZone
      // Google Calendar 會用 timeZone 來正確解釋給定的時間
      const event = {
        summary: title,
        description: description,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Taipei', // 告訴 Google 本地時間應以台北時區解釋
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Taipei',
        },
        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}`,
            // Google Calendar expects `type`, not `key`, for conference solution
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
      };

      // 6. 插入事件並創建 Meet
      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
      });

      console.log(`[GOOGLE_CALENDAR] Event created: ${createdEvent.data.id}`);

      // 7. 從返回的事件中提取 Meet 連結和 Meet Code
      const meetUrl = createdEvent.data.conferenceData?.entryPoints?.[0]?.uri;
      const meetCode = meetUrl ? extractMeetCode(meetUrl) : null;

      if (!meetCode) {
        throw new Error('無法從 Google Meet 連結中提取會議代碼');
      }

      console.log(`[GOOGLE_MEET] Created meet code: ${meetCode}, URL: ${meetUrl}`);

      return {
        meetCode,
        meetUrl,
        eventId: createdEvent.data.id,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GOOGLE_MEET_ERROR] Failed to create Google Meet:', error.message);
    throw error;
  }
}

/**
 * 從 Google Meet 連結中提取會議代碼
 * 連結格式通常為：https://meet.google.com/xxx-yyyy-zzz
 * @param {string} meetUrl
 * @returns {string} meetCode
 */
function extractMeetCode(meetUrl) {
  const match = meetUrl.match(/meet\.google\.com\/([a-z-]+)/i);
  return match ? match[1] : null;
}

module.exports = {
  createGoogleMeetForUser,
  extractMeetCode,
  updateGoogleMeetTimeForUser,
  deleteGoogleMeetEventForUser,
};

/**
 * 刪除使用者 Google Calendar 中的 Meet 事件
 * @param {Pool} pool - PostgreSQL 連接池
 * @param {string} userId - 使用者 ID
 * @param {string} eventId - Google Calendar 事件 ID
 * @returns {Promise<{ deleted: boolean, reason?: string }>}
 */
async function deleteGoogleMeetEventForUser(pool, userId, eventId) {
  if (!eventId) {
    return { deleted: false, reason: 'missing_event_id' };
  }

  let oauth2Client;

  try {
    // 1. 取得 OAuth token
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT google_access_token, google_refresh_token 
         FROM users 
         WHERE id = $1`,
        [userId]
      );

      if (result.rowCount === 0) {
        throw new Error(`使用者 ${userId} 不存在`);
      }

      const { google_access_token, google_refresh_token } = result.rows[0];

      if (!google_access_token) {
        throw new Error(`使用者 ${userId} 未授權 Google Calendar`);
      }

      oauth2Client = getGoogleOAuthClient();
      if (!oauth2Client) {
        throw new Error('Google OAuth client not initialized');
      }

      oauth2Client.setCredentials({
        access_token: google_access_token,
        refresh_token: google_refresh_token,
      });
    } finally {
      client.release();
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // 2. 刪除事件
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });

    console.log(`[GOOGLE_CALENDAR] Deleted event ${eventId}`);
    return { deleted: true };
  } catch (error) {
    console.error(`[GOOGLE_CALENDAR_ERROR] Failed to delete event ${eventId}:`, error.message);
    return { deleted: false, reason: error.message };
  }
}

/**
 * 更新使用者 Google Calendar 中既有 Meet 事件的時間
 * 會嘗試透過 inviteCode (meet code) 找到會議並更新開始/結束時間
 * @param {Pool} pool
 * @param {string} userId
 * @param {string} inviteCode
 * @param {Object} options { startTime: Date, durationMinutes?: number }
 * @returns {Promise<{ updated: boolean, eventId?: string, reason?: string }>}
 */
async function updateGoogleMeetTimeForUser(pool, userId, inviteCode, options = {}) {
  const { startTime = new Date(), durationMinutes = 60, eventId = null } = options;

  if (!inviteCode) {
    return { updated: false, reason: 'missing_invite_code' };
  }

  const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

  let oauth2Client;

  // 0. 若有 eventId，直接使用它；否則稍後會搜尋
  const targetEventId = eventId || null;

  // 1. 取得 OAuth token
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT google_access_token, google_refresh_token 
         FROM users 
        WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      throw new Error(`用戶 ${userId} 不存在`);
    }

    const { google_access_token, google_refresh_token } = result.rows[0];

    if (!google_access_token) {
      throw new Error(`用戶 ${userId} 未授權 Google Calendar`);
    }

    oauth2Client = getGoogleOAuthClient();
    if (!oauth2Client) {
      throw new Error('Google OAuth client not initialized');
    }

    oauth2Client.setCredentials({
      access_token: google_access_token,
      refresh_token: google_refresh_token,
    });
  } finally {
    client.release();
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // 2. 尋找含有該 Meet code 的事件（若有 eventId 直接使用）
  let eventToUpdate = null;

  if (targetEventId) {
    const evt = await calendar.events.get({ calendarId: 'primary', eventId: targetEventId, conferenceDataVersion: 1 }).catch(() => null);
    if (evt?.data) {
      eventToUpdate = evt.data;
    }
  }

  if (!eventToUpdate) {
    const meetUrlVariants = [
      `${MEET_URL_PREFIX}${inviteCode}`,
      `${MEET_URL_PREFIX}${inviteCode.replace(/-/g, '')}`,
    ];

    const listResp = await calendar.events.list({
      calendarId: 'primary',
      q: inviteCode,
      singleEvents: true,
      maxResults: 50,
      orderBy: 'startTime',
      showDeleted: false,
      conferenceDataVersion: 1,
    });

    eventToUpdate = (listResp.data.items || []).find((evt) => {
      const entryPoints = evt.conferenceData?.entryPoints || [];
      return entryPoints.some((ep) => {
        const uri = ep.uri || '';
        return meetUrlVariants.some((url) => uri.includes(url));
      });
    });
  }

  if (!eventToUpdate) {
    console.warn(`[GOOGLE_MEET] No calendar event found for invite code ${inviteCode}`);
    return { updated: false, reason: 'event_not_found' };
  }

  // 3. 更新時間
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: eventToUpdate.id,
    conferenceDataVersion: 1,
    resource: {
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Asia/Taipei', // 告訴 Google 以台北時區解釋
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Taipei',
      },
    },
  });

  console.log(`[GOOGLE_MEET] Updated calendar event ${eventToUpdate.id} to ${startTime.toISOString()}`);
  return { updated: true, eventId: eventToUpdate.id };
}
