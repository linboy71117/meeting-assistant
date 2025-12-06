# Meeting Assistant API 文件

## 概述

變更說明：
- `inviteCode` 與 `meetCode` 已合併，統一使用 Google Meet 代碼作為 `inviteCode`
- 新增用戶系統與會議參與者機制
- 用戶必須透過 `inviteCode` 加入會議才能看到該會議

---

## 用戶 API

### 1. 註冊用戶
```
POST /api/users/register
```

Request Body:
```json
{
  "name": "張三",
  "email": "user@example.com"
}
```

Response (201 Created):
```json
{
  "id": "uuid",
  "name": "張三",
  "email": "user@example.com",
  "created_at": "2025-12-06T10:00:00Z"
}
```

說明：email 為必填，重複會回 409

### 2. 用戶登入
```
POST /api/users/login
```

Request Body:
```json
{
  "email": "user@example.com"
}
```

Response (200 OK):
```json
{
  "id": "uuid",
  "name": "張三",
  "email": "user@example.com",
  "created_at": "2025-12-06T10:00:00Z"
}
```

說明：若不存在回 404

---

### 3. 用戶加入會議
```
POST /api/users/:userId/join
```

**Request Body:**
```json
{
  "inviteCode": "abc-defg-hij"  // Google Meet 代碼
}
```

**Response (200 OK):**
```json
{
  "meetingId": "uuid",
  "inviteCode": "abc-defg-hij",
  "title": "產品規劃會議",
  "message": "Successfully joined meeting"
}
```

**Error Responses:**
- `404` - 用戶或會議不存在
- `400` - 缺少 inviteCode

---

### 4. 取得用戶的會議列表
```
GET /api/users/:userId/meetings
```

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "inviteCode": "abc-defg-hij",
    "title": "產品規劃會議",
    "date": "2025-12-10",
    "description": "討論 Q1 產品規劃",
    "summary": null,
    "version": 1,
    "createdAt": "2025-12-06T10:00:00Z",
    "updatedAt": "2025-12-06T10:00:00Z",
    "agenda": [
      {
        "id": 1,
        "orderIndex": 0,
        "time": "10:00",
        "title": "開場",
        "owner": "產品經理",
        "note": "準備簡報"
      }
    ]
  }
]
```

**說明：**
- 只回傳該用戶加入過的會議
- 包含完整議程資訊

---

## 會議 API

### 5. 建立新會議
```
POST /api/meetings
```

Request Body:
```json
{
  "inviteCode": "abc-defg-hij",  // 必填：Google Meet 代碼
  "title": "產品規劃會議",         // 必填
  "date": "2025-12-10",          // 選填
  "description": "討論 Q1 產品規劃",  // 選填
  "summary": null,                // 選填
  "userId": "user-uuid",          // 選填：建立者 ID，會自動設為 host
  "expiresAt": "2025-12-31T23:59:59Z", // 選填：過期時間（到期會標記 expired，可重用代碼）
  "agenda": [                     // 選填
    {
      "time": "10:00",
      "title": "開場",
      "owner": "產品經理",
      "note": "準備簡報"
    }
  ]
}
```

Response (201 Created):
```json
{
  "id": "meeting-uuid",
  "inviteCode": "abc-defg-hij",
  "title": "產品規劃會議",
  "date": "2025-12-10",
  "description": "討論 Q1 產品規劃",
  "summary": null,
  "status": "active",
  "expiresAt": "2025-12-31T23:59:59Z",
  "version": 1,
  "createdAt": "2025-12-06T10:00:00Z",
  "updatedAt": "2025-12-06T10:00:00Z",
  "agenda": [...]
}
```

Error Responses:
- `409 Conflict` - 還有 active 且未過期的相同 inviteCode
- `400 Bad Request` - 缺少必填欄位

---

### 6. 更新會議
```
PATCH /api/meetings/:id
```

Request Body:
```json
{
  "inviteCode": "abc-defg-hij",
  "title": "產品規劃會議（更新）",
  "date": "2025-12-10",
  "description": "討論 Q1 產品規劃",
  "summary": "決定優先開發功能 A",
  "expiresAt": "2026-01-31T00:00:00Z",
  "status": "active",
  "agenda": [...]
}
```

Response (200 OK):
- 與建立會議相同，但 `version` 會遞增，並回傳 `status`/`expiresAt`

---

### 7. 取得單一會議
```
GET /api/meetings/:id
```

**Response (200 OK):**
- 與建立會議相同

**Error Responses:**
- `404 Not Found` - 會議不存在

---

### 8. 取得所有會議列表
```
GET /api/meetings
```

**Response (200 OK):**
```json
[
  {會議物件1},
  {會議物件2}
]
```

**說明：**
- ⚠️ 此 API 回傳所有會議，不建議在生產環境使用
- 建議使用 `GET /api/users/:userId/meetings` 取得用戶的會議

---

## Socket.IO 事件

### 客戶端 → 伺服器

#### join-meeting
```javascript
socket.emit('join-meeting', meetingId);
```
加入會議室，會從 Redis 載入最新資料。

#### leave-meeting
```javascript
socket.emit('leave-meeting', meetingId);
```
離開會議室。

#### sync-meeting-data
```javascript
socket.emit('sync-meeting-data', {
  meetingId: 'uuid',
  content: { /* 會議資料 */ }
});
```
同步會議資料到 Redis，並廣播給其他人。

#### sync-brainstorm
```javascript
socket.emit('sync-brainstorm', {
  meetingId: 'uuid',
  ideas: [{ id: 1, text: '想法', author: '張三' }]
});
```
同步腦力激盪資料。

---

### 伺服器 → 客戶端

#### meeting-data
```javascript
socket.on('meeting-data', (data) => {
  // 收到會議初始資料（從 Redis）
});
```

#### meeting-updated
```javascript
socket.on('meeting-updated', (data) => {
  // 收到會議更新通知
});
```

#### brainstorm-updated
```javascript
socket.on('brainstorm-updated', (ideas) => {
  // 收到腦力激盪更新
});
```

---

## 📖 使用流程範例

### 新用戶建立會議並加入

```javascript
// 1. 建立用戶
const userRes = await fetch('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name: '張三', email: 'user@example.com' })
});
const user = await userRes.json();

// 2. 建立會議（inviteCode 從 Google Meet URL 提取）
const meetingRes = await fetch('/api/meetings', {
  method: 'POST',
  body: JSON.stringify({
    inviteCode: 'abc-defg-hij',  // Google Meet 代碼
    title: '產品規劃會議',
    userId: user.id  // 自動成為 host
  })
});
const meeting = await meetingRes.json();

// 3. 取得用戶的會議列表
const myMeetingsRes = await fetch(`/api/users/${user.id}/meetings`);
const myMeetings = await myMeetingsRes.json();
```

### 其他用戶透過邀請碼加入

```javascript
// 1. 建立用戶
const userRes = await fetch('/api/users', {
  method: 'POST',
  body: JSON.stringify({ name: '李四' })
});
const user = await userRes.json();

// 2. 透過 inviteCode 加入會議
const joinRes = await fetch(`/api/users/${user.id}/join`, {
  method: 'POST',
  body: JSON.stringify({ inviteCode: 'abc-defg-hij' })
});
const result = await joinRes.json();

// 3. 取得用戶的會議列表（會包含剛加入的會議）
const myMeetingsRes = await fetch(`/api/users/${user.id}/meetings`);
const myMeetings = await myMeetingsRes.json();
```

---

## 🗄️ 資料庫結構

### users 表
```sql
id           UUID PRIMARY KEY
name         TEXT NOT NULL
email        TEXT UNIQUE
created_at   TIMESTAMPTZ
```

### meetings 表
```sql
id           UUID PRIMARY KEY
invite_code  VARCHAR(50) UNIQUE  -- Google Meet 代碼
title        TEXT NOT NULL
date         DATE
description  TEXT
summary      TEXT
created_at   TIMESTAMPTZ
updated_at   TIMESTAMPTZ
version      INT
```

### meeting_participants 表
```sql
id           BIGSERIAL PRIMARY KEY
meeting_id   UUID REFERENCES meetings(id)
user_id      UUID REFERENCES users(id)
role         VARCHAR(20)  -- 'host' 或 'participant'
joined_at    TIMESTAMPTZ
UNIQUE(meeting_id, user_id)
```

### agenda_items 表
```sql
id           BIGSERIAL PRIMARY KEY
meeting_id   UUID REFERENCES meetings(id)
order_index  INT
time         VARCHAR(10)
title        TEXT NOT NULL
owner        TEXT
note         TEXT
```

---

## 測試指令

```bash
chmod +x ./test/test.sh
./test/test.sh
```