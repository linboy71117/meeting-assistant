<template>
  <div class="page">

    <button class="back-btn" @click="$router.push('/meetings')">
      ← 回到會議列表
    </button>

    <div v-if="loading" class="state-msg">
      <p>載入中...</p>
    </div>

    <div v-else-if="!meeting" class="state-msg error">
      <p>找不到這場會議。</p>
      <p v-if="loadError">{{ loadError }}</p>
    </div>

    <div v-else>

      <div v-if="isEditing" class="edit-container">

        <div class="edit-header">
          <h2 class="page-title">編輯會議</h2>
        </div>

        <div class="form-card">
          <h3 class="card-subtitle">基本資訊</h3>
          
          <div class="form-grid">
            <div class="form-group full">
              <label>會議名稱</label>
              <input v-model="editable.title" class="input-field" placeholder="例如：產品週會" />
            </div>

            <div class="form-group">
              <label>日期</label>
              <input type="date" v-model="editable.date" class="input-field" />
            </div>

            <div class="form-group">
              <label>邀請碼</label>
              <div class="input-row">
                <span class="code-display">{{ editable.inviteCode }}</span>
                <button class="btn-copy" @click="copyInviteCode">複製</button>
              </div>
            </div>

            <div class="form-group full">
              <label>會議說明</label>
              <textarea v-model="editable.description" class="input-textarea" rows="2" placeholder="備註..."></textarea>
            </div>

            <div class="form-group full">
              <label>Google Meet 連結</label>
              <div class="link-display">
                {{ editable.meetUrl || "尚未建立 (儲存後可建立)" }}
              </div>
            </div>
          </div>
        </div>

        <div class="form-card">
          <div class="card-header-row">
            <h3 class="card-subtitle">會議流程 (Agenda)</h3>
            <button class="btn-add-text" @click="addAgenda">＋ 新增環節</button>
          </div>

          <div v-if="editableAgenda.length === 0" class="empty-hint">
            尚未新增流程，請點擊上方按鈕。
          </div>

          <ul class="agenda-edit-list">
            <li v-for="(item, idx) in editableAgenda" :key="idx" class="agenda-edit-item">
              
              <div class="item-top-row">
                <span class="item-badge">#{{ idx + 1 }}</span>
                <button class="btn-delete" @click="removeAgenda(idx)" title="刪除">✕ 刪除</button>
              </div>

              <div class="item-inputs">
                <div class="form-group small-col">
                  <label>時間 (分)</label>
                  <input v-model="item.time" type="number" class="input-field" placeholder="10" />
                </div>

                <div class="form-group main-col">
                  <label>環節標題</label>
                  <input v-model="item.title" class="input-field" placeholder="例如：專案報告" />
                </div>

                <div class="form-group user-col">
                  <label>負責人</label>
                  <input v-model="item.owner" class="input-field" placeholder="選填" />
                </div>

                <div class="form-group full">
                  <label>備註</label>
                  <textarea v-model="item.note" class="input-textarea small" rows="1" placeholder="備註事項..."></textarea>
                </div>
              </div>

            </li>
          </ul>
        </div>

        <div class="bottom-actions-bar">
          <button class="btn-cancel" @click="cancelEdit">取消</button>
          <button class="btn-save" @click="saveMeeting">儲存變更</button>
        </div>

      </div>

      <div v-else class="view-panel">

        <h2 class="title">{{ meeting.title }}</h2>

        <div class="meta-row">
          <span class="meta-tag">📅 {{ meeting.date || "未設定" }}</span>
          <span class="meta-tag">🔑 {{ meeting.inviteCode }}</span>
        </div>
        
        <p class="desc" v-if="meeting.description">{{ meeting.description }}</p>
        
        <div class="meet-link-row">
           <span class="meet-label">Google Meet:</span>
           <a v-if="meeting.meetUrl" :href="meeting.meetUrl" target="_blank" class="meet-link">{{ meeting.meetUrl }}</a>
           <span v-else class="text-gray">尚未建立</span>
        </div>

        <h3 class="section-title">會議流程</h3>

        <ul v-if="agendaToShow.length" class="agenda-list">
          <li v-for="(item, idx) in agendaToShow" :key="idx" class="agenda-item">
            <div class="agenda-time-box">
              <span class="time-val">{{ item.time }}</span>
              <span class="time-unit">min</span>
            </div>
            <div class="agenda-content">
              <div class="agenda-header">
                <span class="agenda-title">{{ item.title }}</span>
                <span class="agenda-owner" v-if="item.owner">👤 {{ item.owner }}</span>
              </div>
              <div class="agenda-note" v-if="item.note">{{ item.note }}</div>
            </div>
          </li>
        </ul>

        <p v-else class="empty">尚無流程。</p>

        <section v-if="summary" class="summary-section">
          <h3 class="section-title">✨ AI 會後總結</h3>
          <div class="summary-box">
            <pre class="summary-text">{{ summary }}</pre>
          </div>
        </section>

        <div class="actions">
  
          <button 
            v-if="!isInMeeting"
            class="btn-google-meet" 
            @click="openGoogleMeet" 
            :disabled="loadingMeet"
          >
            <span v-if="loadingMeet">建立中...</span>
            <span v-else>📹 開啟 Google Meet</span>
          </button>

          <div v-else class="status-in-meet">
            <span class="dot">●</span> Google Meet 進行中
          </div>

          <button 
            class="primary-btn" 
            :class="{'btn-alert': brainstormingActive }" 
            @click="startBrainstorm"
          >
            <span v-if="brainstormingActive">🎉 進入腦力激盪</span>
            <span v-else>🧠 創建腦力激盪</span>
          </button>

          <button class="btn-run-mode" @click="startRunMode">
            ▶ 開始會議 (Run Mode)
          </button>

          <button class="secondary-btn" @click="startEdit">
            ✏️ 編輯流程
          </button>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { io } from "socket.io-client";

const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";
const route = useRoute();
const router = useRouter();
let socket: any = null;

const meetingId = route.params.id as string;

// State
const loading = ref(true);
const loadError = ref("");
const meeting = ref<any | null>(null);
const summary = ref("");
const isEditing = ref(route.query.edit === "1" || route.query.new === "1");
const loadingMeet = ref(false);
const brainstormingActive = ref(false);

// Edit State
const editable = ref<any>({});
const editableAgenda = ref<any[]>([]);

// --- Helpers ---
function generateInviteCodeFromId(id: string): string {
  const base = id.replace(/-/g, "").slice(0, 10);
  return [base.slice(0, 3), base.slice(3, 7), base.slice(7, 10)].filter(Boolean).join("-");
}

function normalizeDate(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return "";
}

const agendaToShow = computed(() => meeting.value?.agenda ?? []);

function resetEditableFromMeeting() {
  if (!meeting.value) return;
  editable.value = {
    title: meeting.value.title ?? "",
    date: normalizeDate(meeting.value.date),
    description: meeting.value.description ?? "",
    inviteCode: meeting.value.inviteCode || generateInviteCodeFromId(meetingId),
    meetUrl: meeting.value.meetUrl ?? "",
  };
  editableAgenda.value = (meeting.value.agenda || []).map((a: any, idx: number) => ({
    orderIndex: a.orderIndex ?? idx,
    time: a.time ?? "",
    title: a.title ?? "",
    owner: a.owner ?? "",
    note: a.note ?? "",
  }));
  summary.value = meeting.value.summary ?? "";
}

// --- Load ---
async function loadMeeting() {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`);
    if (res.status === 404) {
      meeting.value = null;
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    meeting.value = data;
    resetEditableFromMeeting();
  } catch (e) {
    console.error("Load meeting failed", e);
    loadError.value = "載入會議失敗";
    meeting.value = null;
  } finally {
    loading.value = false;
  }

  // Check Brainstorming
  try {
    const resActive = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/active`);
    if (resActive.ok) brainstormingActive.value = true;
  } catch (e) {}

  // Socket
  const SOCKET_URL = (import.meta as any).env.VITE_SOCKET_URL || API_BASE;
  socket = io(SOCKET_URL);
  socket.emit("join-meeting", meetingId);
  socket.on("new-brainstorming-created", () => {
    brainstormingActive.value = true;
  });
}

const isInMeeting = ref(false);

// 檢查瀏覽器分頁
function checkMeetingStatus() {
  // 如果不是 Extension 環境 (在本機開發)，就無法檢查
  if (typeof chrome === "undefined" || !chrome.tabs) return;

  const urlToCheck = meeting.value?.meetUrl;
  if (!urlToCheck) return;

  // 取得會議代碼 (例如: "abc-defg-hij") 作為關鍵字比較保險
  // 因為 URL 可能會有 ?authuser=0 之類的參數
  const match = urlToCheck.match(/meet\.google\.com\/([a-z0-9-]+)/);
  const meetCode = match ? match[1] : null;

  if (!meetCode) return;

  // 查詢所有分頁
  chrome.tabs.query({}, (tabs) => {
    // 檢查是否有任何分頁的 URL 包含這個會議代碼
    const found = tabs.some((tab) => tab.url && tab.url.includes(meetCode));
    isInMeeting.value = found;
  });
}

// 監聽分頁變動 (選用：如果使用者關閉了 Meet 分頁，按鈕要重新出現)
function setupTabListeners() {
  if (typeof chrome === "undefined" || !chrome.tabs) return;

  // 當分頁更新 (網址改變) 或 移除時，重新檢查
  const listener = () => checkMeetingStatus();
  chrome.tabs.onUpdated.addListener(listener);
  chrome.tabs.onRemoved.addListener(listener);
}

// 修改原本的 onMounted
onMounted(async () => {
  await loadMeeting(); // 原本的載入邏輯
  
  // 載入完資料後，檢查是否在會議中
  checkMeetingStatus();
  setupTabListeners();
});
onUnmounted(() => {
  if (socket) socket.off("new-brainstorming-created");
});

// --- Agenda CRUD ---
function addAgenda() {
  editableAgenda.value.push({ time: "", title: "", owner: "", note: "" });
}
function removeAgenda(i: number) {
  editableAgenda.value.splice(i, 1);
}

// --- Actions ---
async function saveMeeting() {
  const payload = {
    id: meetingId,
    inviteCode: editable.value.inviteCode,
    title: editable.value.title || "未命名會議",
    date: editable.value.date || null,
    description: editable.value.description || "",
    summary: summary.value,
    agenda: editableAgenda.value.map((item, index) => ({
      orderIndex: index,
      time: item.time,
      title: item.title,
      owner: item.owner,
      note: item.note,
    })),
  };

  try {
    const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      alert("儲存失敗");
      return;
    }
    const saved = await res.json();
    meeting.value = saved;
    resetEditableFromMeeting();
    isEditing.value = false;
    router.replace({ path: `/meetings/${meetingId}` });
  } catch (e) {
    console.error(e);
    alert("儲存失敗");
  }
}

function startEdit() {
  resetEditableFromMeeting();
  isEditing.value = true;
}
function cancelEdit() {
  resetEditableFromMeeting();
  isEditing.value = false;
}

// --- Google Meet ---
async function createNewGoogleMeet() {
  const w = window.open("https://meet.google.com/new", "_blank");
  if (!w) return null;
  await new Promise((r) => setTimeout(r, 1500));
  try { return w.location.href; } catch { return w.location.href; }
}

async function openGoogleMeet() {
  loadingMeet.value = true;
  try {
    let url = meeting.value?.meetUrl || editable.value?.meetUrl || "";
    if (!url) {
      const newUrl = await createNewGoogleMeet();
      if (!newUrl) {
        alert("無法建立 Google Meet！");
        return;
      }
      if (!editable.value) editable.value = {}; 
      editable.value.meetUrl = newUrl;
      await saveMeeting();
      url = newUrl;
    }
    window.open(url, "_blank");
  } finally {
    loadingMeet.value = false;
  }
}

// --- Navigation ---
function startRunMode() {
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    const url = chrome.runtime.getURL(`index.html#/meetings/${meetingId}/run`);
    const targetWidth = 360;
    const targetHeight = window.screen.availHeight;
    const left = Math.round(window.screen.availWidth - targetWidth);
    
    chrome.windows.create({
      url: url,
      type: "popup",
      width: targetWidth,
      height: targetHeight,
      left: left,
      top: 0,
      focused: true
    });
  } else {
    router.push(`/meetings/${meetingId}/run`);
  }
}

function startBrainstorm() {
  if (brainstormingActive.value) {
    router.replace(`/meetings/${meetingId}/brainstorm/proposal`);
  } else {
    router.push(`/meetings/${meetingId}/brainstorm`);
  }
}

async function copyInviteCode() {
  await navigator.clipboard.writeText(editable.value.inviteCode);
  alert("已複製！");
}
</script>

<style scoped>
/* 全域設定 */
.page {
  width: 100%;
  max-width: 100%;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-sizing: border-box;
  padding-bottom: 80px; /* 為了底部按鈕留白 */
}

/* 返回按鈕 */
.back-btn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 0;
}
.back-btn:hover { text-decoration: underline; }

/* 狀態訊息 */
.state-msg { padding: 20px; text-align: center; color: #666; }
.state-msg.error { color: #dc2626; }

/* =========================================
   [編輯模式] 樣式優化
   ========================================= */
.edit-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: #1f2937;
}

/* 卡片容器 */
.form-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border: 1px solid #f0f0f0;
}

.card-subtitle {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: #374151;
  border-left: 4px solid #0b57d0;
  padding-left: 8px;
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

/* 表單網格 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group.full { grid-column: 1 / -1; }

.form-group label {
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
}

/* 輸入框 */
.input-field, .input-textarea {
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  transition: all 0.2s;
}

.input-field:focus, .input-textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-textarea { resize: vertical; }
.input-textarea.small { min-height: 40px; }

/* 邀請碼行 */
.input-row { display: flex; gap: 8px; align-items: center; }
.code-display {
  background: #f3f4f6; padding: 8px 12px; border-radius: 6px;
  font-family: monospace; font-size: 14px; color: #374151; flex: 1;
}
.btn-copy {
  background: white; border: 1px solid #d1d5db; padding: 8px 12px;
  border-radius: 6px; cursor: pointer; font-size: 12px;
}

/* 連結顯示 */
.link-display {
  padding: 10px; background: #eff6ff; color: #1d4ed8;
  border-radius: 8px; font-size: 13px; word-break: break-all;
}

/* 新增按鈕 */
.btn-add-text {
  background: none; border: none; color: #0b57d0;
  font-weight: 600; cursor: pointer; font-size: 14px;
}
.btn-add-text:hover { background: #eff6ff; border-radius: 4px; }

.empty-hint {
  text-align: center; color: #9ca3af; padding: 20px;
  background: #f9fafb; border-radius: 8px; border: 2px dashed #e5e7eb;
}

/* 議程列表 (編輯) */
.agenda-edit-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 12px;
}

.agenda-edit-item {
  background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 10px; padding: 16px;
}

.item-top-row {
  display: flex; justify-content: space-between; margin-bottom: 10px;
}
.item-badge {
  background: #e0f2fe; color: #0369a1; font-size: 12px;
  font-weight: 700; padding: 2px 8px; border-radius: 12px;
}
.btn-delete {
  background: none; border: none; color: #ef4444; font-size: 12px;
  cursor: pointer; opacity: 0.8;
}
.btn-delete:hover { opacity: 1; text-decoration: underline; }

.item-inputs {
  display: grid; grid-template-columns: 80px 1fr 100px; gap: 10px;
}
.small-col { grid-column: 1; }
.main-col { grid-column: 2; }
.user-col { grid-column: 3; }

/* 底部操作區 */
.bottom-actions-bar {
  position: fixed; bottom: 0; left: 0; width: 100%;
  background: white; padding: 12px 20px;
  display: flex; justify-content: flex-end; gap: 12px;
  box-shadow: 0 -4px 12px rgba(0,0,0,0.05);
  z-index: 10;
}

.btn-save {
  background: #0b57d0; color: white; border: none;
  padding: 10px 24px; border-radius: 20px; font-weight: 600;
  cursor: pointer;
}
.btn-cancel {
  background: white; border: 1px solid #d1d5db; color: #374151;
  padding: 10px 24px; border-radius: 20px; font-weight: 600;
  cursor: pointer;
}

/* =========================================
   [檢視模式]
   ========================================= */
.view-panel .title {
  font-size: 24px; font-weight: 700; margin-bottom: 8px;
}
.meta-row { display: flex; gap: 8px; margin-bottom: 12px; }
.meta-tag {
  background: #f3f4f6; color: #4b5563; padding: 4px 8px;
  border-radius: 4px; font-size: 12px;
}
.desc { font-size: 14px; color: #374151; margin-bottom: 12px; line-height: 1.5; }
.meet-link-row { font-size: 13px; margin-bottom: 20px; }
.meet-label { font-weight: 600; margin-right: 6px; }
.meet-link { color: #2563eb; text-decoration: none; }
.text-gray { color: #9ca3af; }

.section-title {
  font-size: 16px; font-weight: 600; margin-bottom: 10px;
  border-bottom: 1px solid #eee; padding-bottom: 6px;
}

.agenda-list { list-style: none; padding: 0; margin-bottom: 20px; }
.agenda-item {
  display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0;
}
.agenda-time-box {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-width: 45px;
  background: #eff6ff; border-radius: 8px; padding: 4px; height: 45px;
}
.time-val { font-weight: 700; font-size: 16px; color: #1d4ed8; line-height: 1; }
.time-unit { font-size: 10px; color: #60a5fa; }

.agenda-content { flex: 1; }
.agenda-header { display: flex; justify-content: space-between; margin-bottom: 2px; }
.agenda-title { font-weight: 600; font-size: 14px; color: #1f2937; }
.agenda-owner { font-size: 12px; color: #6b7280; background: #f3f4f6; padding: 2px 6px; border-radius: 10px; }
.agenda-note { font-size: 12px; color: #6b7280; }

.empty { color: #9ca3af; font-size: 13px; font-style: italic; }

.summary-section { margin-top: 20px; margin-bottom: 20px; }
.summary-box {
  background: #f0fdf4; border: 1px solid #bbf7d0;
  border-radius: 8px; padding: 12px;
}
.summary-text { font-size: 13px; color: #166534; white-space: pre-wrap; line-height: 1.6; }

/* =========================================
   [按鈕區] (維持原本樣式)
   ========================================= */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}

/* Google Meet 按鈕 (藍色) */
.btn-google-meet {
  background: #0b57d0; color: white; border: none;
  padding: 8px 16px; border-radius: 20px; font-size: 13px;
  font-weight: 500; cursor: pointer;
}
.btn-google-meet:hover { background: #0842a0; }

/* Brainstorm 按鈕 (橘色) */
.primary-btn {
  background: #f97316; color: white; border: none;
  padding: 8px 16px; border-radius: 20px; font-size: 13px;
  font-weight: 500; cursor: pointer;
}
.primary-btn:hover { background: #ea580c; }

/* Run Mode 按鈕 (綠色) */
.btn-run-mode {
  background: #10b981; color: white; border: none;
  padding: 8px 16px; border-radius: 20px; font-size: 13px;
  font-weight: 700; cursor: pointer;
}
.btn-run-mode:hover { background: #059669; }

/* Edit 按鈕 (白色/灰色) */
.secondary-btn {
  background: white; border: 1px solid #d1d5db; color: #374151;
  padding: 8px 16px; border-radius: 20px; font-size: 13px;
  font-weight: 500; cursor: pointer;
}
.secondary-btn:hover { background: #f9fafb; }

.btn-alert {
  background-color: #ff4500;
  animation: pulse 1s infinite;
}

.status-in-meet {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #e6f4ea;
  color: #137333;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid #ceead6;
}

.status-in-meet .dot {
  color: #137333;
  font-size: 12px;
  animation: blink 2s infinite;
}

@keyframes blink {
  0% { opacity: 1; }
  50% { opacity: 0.4; }
  100% { opacity: 1; }
}
</style>