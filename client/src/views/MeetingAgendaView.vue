<template>
  <div class="page">

    <!-- 返回列表 -->
    <button class="back-btn" v-if="!isEditing" @click="$router.push('/meetings')">
      ← 回到會議列表
    </button>

    <!-- 載入中 / 錯誤 / 找不到 -->
    <div v-if="loading">
      <p class="meta">載入中...</p>
    </div>

    <div v-else-if="!meeting">
      <p class="error">找不到這場會議。</p>
      <p v-if="loadError" class="error">{{ loadError }}</p>
    </div>

    <!-- 找到會議 -->
    <div v-else>

      <!-- ========== 編輯模式 ========== -->
      <div v-if="isEditing" class="edit-panel">

        <h2 class="title">編輯會議</h2>

        <!-- 名稱 -->
        <label class="field">
          <span class="field-label">會議名稱</span>
          <input v-model="editable.title" class="text-input" />
        </label>

        <!-- 日期 -->
        <label class="field">
          <span class="field-label">日期</span>
          <input type="datetime-local" v-model="editable.date" class="text-input" />
        </label>

        <!-- 描述 -->
        <label class="field">
          <span class="field-label">說明</span>
          <textarea v-model="editable.description" class="textarea-input" rows="2" />
        </label>

        <!-- 邀請碼 -->
        <div class="field">
          <div class="field-label">邀請碼</div>
          <div class="invite-row">
            <span class="code-pill">{{ editable.inviteCode }}</span>
            <button class="small-btn" @click="copyInviteCode">複製</button>
          </div>
        </div>

        <!-- Agenda 編輯區 -->
        <h3 class="section-title">會議流程（Agenda）</h3>

        <div v-if="editableAgenda.length === 0" class="empty">尚無流程，請新增。</div>

        <ul class="agenda-edit-list">
          <li
            v-for="(item, idx) in editableAgenda"
            :key="idx"
            class="agenda-edit-item"
          >
            <div class="agenda-edit-header">
              <span>流程 #{{ idx + 1 }}</span>
              <button class="link-btn" @click="removeAgenda(idx)">刪除</button>
            </div>

            <div class="agenda-edit-grid">
              <label>
                <span class="sub-label">時間</span>
                <input v-model="item.time" class="text-input" placeholder="09:00" />
              </label>

              <label>
                <span class="sub-label">標題</span>
                <input v-model="item.title" class="text-input" />
              </label>

              <label>
                <span class="sub-label">負責人</span>
                <input v-model="item.owner" class="text-input" />
              </label>

              <label class="full">
                <span class="sub-label">備註</span>
                <textarea v-model="item.note" class="textarea-input" rows="2" />
              </label>
            </div>
          </li>
        </ul>

        <button class="secondary-btn" @click="addAgenda">＋ 新增流程</button>

        <div class="actions">
          <button class="primary-btn" @click="saveMeeting">儲存</button>
          <button class="secondary-btn" @click="cancelEdit">取消</button>
        </div>

      </div>

      <!-- ========== 檢視模式 ========== -->
      <div v-else class="view-panel">

        <h2 class="title">{{ meeting.title }}</h2>

        <p class="meta">日期：{{ meeting.date || "未設定" }}</p>
        <p class="meta">
          邀請碼：<span class="code-pill">{{ meeting.inviteCode }}</span>
        </p>
        <p class="meta" v-if="meeting.inviteCode">
          <a :href="`https://meet.google.com/${meeting.inviteCode}`" target="_blank" rel="noopener noreferrer" class="meet-link">
            📞 Google Meet
          </a>
        </p>
        <p class="desc" v-if="meeting.description">{{ meeting.description }}</p>

        <!-- Agenda -->
        <h3 class="section-title">會議流程（Agenda）</h3>

        <ul v-if="agendaToShow.length" class="agenda-list">
          <li v-for="(item, idx) in agendaToShow" :key="idx" class="agenda-item">
            <div class="agenda-time">{{ item.time }}</div>
            <div class="agenda-body">
              <div class="agenda-title">{{ item.title }}</div>
              <div class="agenda-owner" v-if="item.owner">
                負責人：{{ item.owner }}
              </div>
              <div class="agenda-note" v-if="item.note">{{ item.note }}</div>
            </div>
          </li>
        </ul>

        <p v-else class="empty">尚無流程。</p>

        <!-- AI SUMMARY（顯示區） -->
        <section v-if="summary" class="summary-section">
          <h3 class="section-title">會後 AI 總結</h3>

          <div class="summary-box">
            <pre class="summary-text">{{ summary }}</pre>
          </div>
        </section>

        <!-- Buttons -->
        <div class="actions">
          <button class="btn-google-meet" @click="openGoogleMeet" :disabled="loadingMeet">
            <span v-if="loadingMeet">建立中...</span>
            <span v-else>開啟 Google Meet</span>
          </button>

          <button class="btn-run-mode" @click="startRunMode">
            ▶ 開始會議 (Run Mode)
          </button>

          <button class="primary-btn" @click="startBrainstorm">
            Brainstorming
          </button>

          <button class="secondary-btn" @click="startEdit">
            編輯流程
          </button>
        </div>

      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";

const API_BASE =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";

const route = useRoute();
const router = useRouter();

const meetingId = route.params.id as string;

// 狀態
const loading = ref(true);
const loadError = ref("");

const meeting = ref<any | null>(null);
const summary = ref("");

const editable = ref<any | null>(null);
const editableAgenda = ref<any[]>([]);
const isEditing = ref(
  route.query.edit === "1" || route.query.new === "1"
);
const isNewMeeting = ref(route.query.new === "1");

const loadingMeet = ref(false);

// Helpers
/**
 * 將本地日期轉換為不考慮時區偏移的 ISO 字符串
 * 例：本地時間 2025-12-10 14:00 → "2025-12-10T14:00:00Z"（保持本地時間值）
 */
function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`;
}

function normalizeDate(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return "";
}

const agendaToShow = computed(() => meeting.value?.agenda ?? []);

function resetEditableFromMeeting() {
  if (!meeting.value) return;
  
  // 將日期轉換為 datetime-local 格式 (YYYY-MM-DDTHH:mm:ss)
  // 使用本地時間，不進行時區轉換
  let formattedDate = "";
  if (meeting.value.date) {
    const d = new Date(meeting.value.date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    formattedDate = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }
  
  // 根據 inviteCode 生成 Google Meet 連結
  const inviteCode = meeting.value.inviteCode ?? "";
  
  editable.value = {
    title: meeting.value.title ?? "",
    date: formattedDate,
    description: meeting.value.description ?? "",
    inviteCode: inviteCode,
  };
  editableAgenda.value = (meeting.value.agenda || []).map(
    (a: any, idx: number) => ({
      orderIndex: a.orderIndex ?? idx,
      time: a.time ?? "",
      title: a.title ?? "",
      owner: a.owner ?? "",
      note: a.note ?? "",
    })
  );
  summary.value = meeting.value.summary ?? "";
}

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
}

onMounted(loadMeeting);

// CRUD for Agenda
function addAgenda() {
  editableAgenda.value.push({
    time: "",
    title: "",
    owner: "",
    note: "",
  });
}

function removeAgenda(i: number) {
  editableAgenda.value.splice(i, 1);
}

async function saveMeeting() {
  if (!editable.value) return;
  
  // 日期必填
  if (!editable.value.date) {
    alert("請填寫會議日期");
    return;
  }

  const agendaData = editableAgenda.value.map((item, index) => ({
    orderIndex: index,
    time: item.time || "",
    title: item.title || "",
    owner: item.owner || "",
    note: item.note || "",
  }));

  try {
    // 從 localStorage 取得 userId
    const userId = localStorage.getItem('meeting_user_id');
    
    // datetime-local 值已經是本地時間，直接發送給後端
    // 後端會以此本地時間作為基準（不進行時區轉換）
    const payload = {
      id: meetingId,
      title: editable.value.title || "未命名會議",
      date: editable.value.date,
      description: editable.value.description || "",
      summary: summary.value || "",
      agenda: agendaData,
      userId: userId, // 傳遞 userId 以便重新生成 Google Meet
    };

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
    console.error("Save meeting failed", e);
    alert("儲存失敗（連線錯誤）");
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

// Google Meet 自動建立
async function createNewGoogleMeet() {
  const w = window.open("https://meet.google.com/new", "_blank");
  if (!w) return null;

  await new Promise((r) => setTimeout(r, 1500));

  try {
    return w.location.href;
  } catch {
    return w.location.href;
  }
}

async function openGoogleMeet() {
  loadingMeet.value = true;
  try {
    // 根據 inviteCode 生成 Google Meet 連結
    const inviteCode = editable.value?.inviteCode || meeting.value?.inviteCode || "";
    
    if (inviteCode) {
      // 直接使用 inviteCode 打開 Google Meet
      const meetUrl = `https://meet.google.com/${inviteCode}`;
      window.open(meetUrl, "_blank");
      return;
    }

    // 如果沒有 inviteCode，創建新的 Google Meet
    const newUrl = await createNewGoogleMeet();
    if (!newUrl) {
      alert("無法建立 Google Meet！");
      return;
    }

    if (!editable.value) {
      editable.value = {
        title: meeting.value?.title ?? "",
        date: normalizeDate(meeting.value?.date),
        description: meeting.value?.description ?? "",
        inviteCode: meeting.value?.inviteCode ?? "",
      };
    }

    window.open(newUrl, "_blank");
  } finally {
    loadingMeet.value = false;
  }
}

// run meeting 頁面
function startRunMode() {
  // 判斷是否在 Chrome Extension 環境下
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
    // 1. 取得 Extension 內部的完整網址
    // 格式會是：chrome-extension://<你的ID>/index.html#/meetings/xxx/run
    const url = chrome.runtime.getURL(`index.html#/meetings/${meetingId}/run`);
    
    // 2. 開啟一個新視窗 (或是用 chrome.tabs.create)
    // 這裡建議開一個 "popup" 類型的視窗，比較像獨立 App
    chrome.windows.create({
      url: url,
      type: "popup", // 這會是一個沒有網址列的乾淨視窗
      width: 500,
      height: 700
    });
    
    // 3. (選填) 關閉原本的 extension popup
    // window.close(); 
  } else {
    // 一般網頁環境 (Localhost 開發時) 照舊
    router.push(`/meetings/${meetingId}/run`);
  }
}

// Brainstorming 頁面
function startBrainstorm() {
  router.push(`/meetings/${meetingId}/brainstorm`);
}

// 複製邀請碼
async function copyInviteCode() {
  const code = editable.value?.inviteCode || meeting.value?.inviteCode || "";
  if (!code) {
    alert("邀請碼尚未產生");
    return;
  }
  await navigator.clipboard.writeText(code);
  alert("已複製！");
}
</script>

<style scoped>
/* ====== Layout ====== */

.page {
  width: 100%;
  max-width: 100%;
  padding: 12px;
  font-family: system-ui, sans-serif;
}

.back-btn {
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 12px;
  margin-bottom: 8px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 4px;
}

.meta {
  font-size: 12px;
  color: #6b7280;
}

.error {
  font-size: 12px;
  color: #dc2626;
}

.desc {
  margin: 8px 0;
  font-size: 13px;
}

/* ====== Agenda ====== */

.section-title {
  margin-top: 16px;
  font-size: 15px;
  font-weight: 600;
}

.code-pill {
  background: #e5e7eb;
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 11px;
}

.agenda-list {
  margin-top: 6px;
}

.agenda-item {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid #ddd;
}

.agenda-time {
  width: 50px;
  color: #6b7280;
  font-size: 12px;
}

.agenda-title {
  font-size: 14px;
  font-weight: 600;
}

.agenda-owner {
  font-size: 12px;
  color: #6b7280;
}

.agenda-note {
  font-size: 11px;
  margin-top: 2px;
}

/* ====== AI Summary ====== */

.summary-section {
  margin-top: 22px;
}

.summary-box {
  background: #f3f4f6;
  border-radius: 10px;
  padding: 12px;
  white-space: pre-wrap;
  border: 1px solid #e5e7eb;
}

.summary-text {
  font-size: 13px;
  line-height: 1.6;
  color: #374151;
}

/* ====== Buttons ====== */

.actions {
  margin-top: 14px;
}

.btn-google-meet {
  background: #0b57d0;
  color: white;
  border: none;
  padding: 7px 14px;
  border-radius: 999px;
  margin-right: 6px;
}

.primary-btn {
  background: #f97316;
  color: white;
  border: none;
  padding: 7px 14px;
  border-radius: 999px;
  margin-right: 6px;
}

.secondary-btn {
  background: white;
  border: 1px solid #ccc;
  padding: 7px 14px;
  border-radius: 999px;
}

.empty {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.btn-run-mode {
  background: #10b981; /* 綠色，代表開始 */
  color: white;
  border: none;
  padding: 7px 14px;
  border-radius: 999px;
  margin-right: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-run-mode:hover {
  background: #059669;
}

.meet-link {
  color: #2563eb;
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s;
}

.meet-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}
</style>
