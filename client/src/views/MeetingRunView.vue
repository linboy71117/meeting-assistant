<template>
  <div class="meeting-run-container">
    <div v-if="!isPipActive" :class="['timer-bar', { 'is-overtime': isOvertime }]">
       <div class="timer-controls">
          <button class="btn-control pip" @click="togglePip">
            {{ isPipActive ? '退出懸浮' : '📌 懸浮模式' }}
          </button>
       </div>
    </div>

    <Teleport :to="pipBody" v-if="isPipActive && pipBody">
      <div :class="['mini-timer-container', { 'is-overtime': isOvertime }]">
        
        <div class="mini-header">
          <span class="mini-label">Current:</span>
          <span class="mini-title">{{ currentItem?.title }}</span>
        </div>

        <div class="mini-time">
          {{ formattedTime }}
          <span v-if="isOvertime" class="mini-badge">OVERTIME</span>
        </div>

        <div class="mini-controls" v-if="isHost">
           <button @click="handleNextItem">Next</button>
           <button @click="togglePip">Close</button>
        </div>
      </div>
    </Teleport>
    
    <div :class="['timer-bar', { 'is-overtime': isOvertime }]">
      <div class="timer-info">
        <div class="current-label">正在進行 (Current Stage)</div>
        <div class="current-title">{{ currentItem?.title || '準備開始' }}</div>
      </div>

      <div class="timer-display">
        <span class="time-text">{{ formattedTime }}</span>
        <span v-if="isOvertime" class="overtime-badge">OVERTIME (延長)</span>
      </div>

      <div v-if="isHost" class="timer-controls">
        <button v-if="!isRunning" class="btn-control start" @click="startTimer">
          ▶ 開始
        </button>
        <button v-else class="btn-control pause" @click="pauseTimer">
          ⏸ 暫停
        </button>

        <button class="btn-control next" @click="handleNextItem">
          {{ isLastItem ? '結束會議' : '下一個環節 →' }}
        </button>
      </div>
    </div>

    <div class="agenda-list-container">
      <div 
        v-for="(item, index) in agenda" 
        :key="index"
        :class="['agenda-item', { 'active': currentIndex === index, 'past': currentIndex > index }]"
        @click="handleJumpTo(index)"
      >
        <div class="status-icon">
          <span v-if="currentIndex === index && isRunning" class="spinner"></span>
          <span v-else-if="currentIndex > index">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>

        <div class="item-content">
          <div class="item-header">
            <span class="item-title">{{ item.title }}</span>
            <span class="item-duration">預計: {{ item.time }} min</span>
          </div>
          <div class="item-owner" v-if="item.owner">負責人: {{ item.owner }}</div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import socket from '../config/socket'; // 確保路徑正確

// 定義資料結構
interface AgendaItem {
  id?: number;
  time: string;   
  title: string;
  owner?: string;
  note?: string;
}

const route = useRoute();
const meetingId = route.params.id as string;
const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";

// === 狀態管理 ===
const isHost = ref(false); 
const agenda = ref<AgendaItem[]>([]);
const currentIndex = ref(0);
const isRunning = ref(false);

const timeLeft = ref(0);
const timerInterval = ref<any>(null);

const currentItem = computed(() => agenda.value[currentIndex.value]);
const isLastItem = computed(() => currentIndex.value >= agenda.value.length - 1);
const isOvertime = computed(() => timeLeft.value < 0);

const formattedTime = computed(() => {
  const absSeconds = Math.abs(timeLeft.value);
  const m = Math.floor(absSeconds / 60).toString().padStart(2, '0');
  const s = (absSeconds % 60).toString().padStart(2, '0');
  if (isOvertime.value) return `+${m}:${s}`;
  return `${m}:${s}`;
});

function parseDurationToSeconds(timeStr: string): number {
  if (!timeStr) return 300; 
  if (timeStr.includes(':')) {
    const [mm, ss] = timeStr.split(':').map(Number);
    return (mm * 60) + (ss || 0);
  }
  const val = parseInt(timeStr);
  if (!isNaN(val)) return val * 60;
  return 300;
}

// === 獨立的監聽函式 ===
const handleTimerSync = (syncData: any) => {
  // 如果我是 Host，且計時器正在跑，代表我是權威，不聽別人的
  if (isHost.value && timerInterval.value) return;

  // 但如果我是 Host 且沒在跑 (剛重整)，我要恢復狀態
  if (currentIndex.value !== syncData.currentIndex) {
    currentIndex.value = syncData.currentIndex;
  }
  
  timeLeft.value = syncData.timeLeft;
  
  // 恢復計時器狀態
  if (syncData.isRunning && !timerInterval.value) {
    // 呼叫 startTimer(false) -> 不要廣播，純粹啟動本地計時器
    startTimer(false);
  } else if (!syncData.isRunning) {
    pauseTimer(false); // 不要廣播，純粹暫停本地
    isRunning.value = false;
  }
};

// === 初始化 ===
onMounted(async () => {
  try {
    const userId = localStorage.getItem("meeting_user_id");
    
    // 1. API 抓資料
    const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`);
    const data = await res.json();

    if (data.agenda && Array.isArray(data.agenda)) {
      agenda.value = data.agenda;
    }
    
    // 2. 身分確認
    if (userId) {
      const roleRes = await fetch(`${API_BASE}/api/users/${userId}/meetings`);
      const myMeetings = await roleRes.json();
      const thisMeeting = myMeetings.find((m: any) => m.id === meetingId);
      if (thisMeeting && thisMeeting.role === 'host') {
        isHost.value = true;
      }
    }
    
    // 3. ⭐⭐ 關鍵修正：初始化時，只設定時間，不發送廣播 (false)
    // 這樣就不會把後端存的「進行中時間」覆蓋掉了
    resetTimerForCurrentIndex(false);

    // 4. Socket 連線
    if (!socket.connected) {
      socket.connect();
    }
    
    socket.off('timer-sync', handleTimerSync);
    socket.on('timer-sync', handleTimerSync);

    socket.emit('join-meeting', meetingId);

    // 5. Host 延遲廣播初始狀態
    // 只有當確定後端沒有正在跑的狀態 (isRunning 為 false) 時，才需要廣播初始值
    if (isHost.value) {
      setTimeout(() => {
        if (!isRunning.value) {
          emitSync();
        }
      }, 1000);
    }

  } catch (e) {
    console.error("Init failed", e);
  }
});

onUnmounted(() => {
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
    timerInterval.value = null;
  }
  socket.off('timer-sync', handleTimerSync);

  if (socket.connected) {
    socket.disconnect();
    console.log("Socket disconnected on unmount");
  }
});

// === Timer 操作 (Host 專用) ===

// 🟢 修改 1：接收 shouldEmit 參數
function startTimer(shouldEmit = true) {
  if (isRunning.value && timerInterval.value) return;
  
  isRunning.value = true;
  
  // 只有在 shouldEmit 為 true 時才廣播
  if (shouldEmit) emitSync();

  timerInterval.value = setInterval(() => {
    timeLeft.value--;
    emitSync(); // 這裡每秒廣播是為了讓 Client 同步
  }, 1000);
}

// 🟢 修改 2：接收 shouldEmit 參數
function pauseTimer(shouldEmit = true) {
  isRunning.value = false;
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
    timerInterval.value = null;
  }
  if (shouldEmit) emitSync();
}

// 🟢 修改 3：接收 shouldEmit 參數
function resetTimerForCurrentIndex(shouldEmit = true) {
  const item = agenda.value[currentIndex.value];
  if (!item) return;
  
  timeLeft.value = parseDurationToSeconds(item.time);
  
  // 傳遞參數給 pauseTimer
  pauseTimer(shouldEmit);
}

function handleNextItem() {
  if (currentIndex.value < agenda.value.length - 1) {
    currentIndex.value++;
    // 切換下一項時，當然要廣播 (true)
    resetTimerForCurrentIndex(true);
    emitSync();
  } else {
    alert("會議結束");
    pauseTimer(true);
  }
}

function handleJumpTo(index: number) {
  if (!isHost.value) return;
  if (currentIndex.value !== index) {
    if(confirm(`切換到: ${agenda.value[index].title}?`)) {
      currentIndex.value = index;
      resetTimerForCurrentIndex(true);
      emitSync();
    }
  }
}

function emitSync() {
  if (!socket || !isHost.value) return;
  socket.emit('sync-timer', {
    meetingId,
    currentIndex: currentIndex.value,
    timeLeft: timeLeft.value,
    isRunning: isRunning.value
  });
}

// === PiP (懸浮視窗) 相關 (保持不變) ===
const isPipActive = ref(false);
const pipBody = ref<HTMLElement | null>(null); 
let pipWindowRef: Window | null = null; 

async function togglePip() {
  if (isPipActive.value && pipWindowRef) {
    pipWindowRef.close();
    return;
  }
  if (!("documentPictureInPicture" in window)) {
    alert("您的瀏覽器不支援懸浮視窗功能");
    return;
  }
  try {
    // @ts-ignore
    const pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 300, height: 150,
    });
    pipWindowRef = pipWindow;
    [...document.styleSheets].forEach((styleSheet) => {
      try {
        const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
        const style = document.createElement('style');
        style.textContent = cssRules;
        pipWindow.document.head.appendChild(style);
      } catch (e) {}
    });
    pipBody.value = pipWindow.document.body;
    isPipActive.value = true;
    pipWindow.addEventListener("pagehide", () => {
      isPipActive.value = false;
      pipBody.value = null;
      pipWindowRef = null;
    });
  } catch (err) {
    console.error("Failed to open PiP:", err);
  }
}
</script>

<style scoped>

.meeting-run-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f8f9fa;
  font-family: system-ui, -apple-system, sans-serif;
}

/* =========================================
   1. 頂部計時器欄位 (Timer Bar)
   ========================================= */
.timer-bar {
  background: #2c3e50; /* 預設深色背景 */
  color: white;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  
  /* 固定在頂部 */
  position: sticky;
  top: 0;
  z-index: 100;
  
  /* 背景色切換動畫 */
  transition: background-color 0.5s ease;
}

/* 延長賽模式 (Overtime) - 變紅色 */
.timer-bar.is-overtime {
  background: #c0392b; 
}

/* 左側標題資訊 */
.timer-info {
  display: flex;
  flex-direction: column;
}

.current-label {
  font-size: 12px;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.current-title {
  font-size: 20px;
  font-weight: 700;
  margin-top: 4px;
}

/* 中間時間顯示 */
.timer-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.time-text {
  font-family: 'Courier New', monospace;
  font-size: 42px;
  font-weight: 700;
  line-height: 1;
}

.overtime-badge {
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 4px;
  font-weight: bold;
}

/* =========================================
   Host 控制按鈕區 (Controls)
   ========================================= */
.timer-controls {
  display: flex;
  gap: 12px;
  margin-left: 24px;
  padding-left: 24px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.btn-control {
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-control.start {
  background: #27ae60;
  color: white;
}

.btn-control.pause {
  background: #f1c40f;
  color: #2c3e50;
}

.btn-control.next {
  background: white;
  color: #2c3e50;
}

/* 當處於延長賽時，"下一個"按鈕的樣式變化 */
.timer-bar.is-overtime .btn-control.next {
  background: white;
  color: #c0392b;
  font-weight: 800;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
}

/* =========================================
   2. 下方議程列表 (Agenda List)
   ========================================= */
.agenda-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
}

.agenda-item {
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  border: 2px solid transparent;
  transition: all 0.2s;
  cursor: default;
  position: relative;
}

/* 當前進行中的項目 (Active) */
.agenda-item.active {
  border-color: #0b57d0;
  box-shadow: 0 4px 12px rgba(11, 87, 208, 0.15);
  background: #f8fbff;
}

/* 已經結束的項目 (Past) */
.agenda-item.past {
  opacity: 0.6;
  background: #f3f3f3;
}

/* 狀態圓圈圖示 */
.status-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: #888;
  flex-shrink: 0;
}

.agenda-item.active .status-icon {
  border-color: #0b57d0;
  color: #0b57d0;
}

/* 議程內容文字 */
.item-content {
  flex: 1;
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-title {
  font-weight: 600;
  font-size: 16px;
}

.item-duration {
  font-size: 12px;
  color: #666;
  background: #eee;
  padding: 2px 6px;
  border-radius: 4px;
}

.item-owner {
  font-size: 13px;
  color: #666;
  margin-top: 4px;
}

/* =========================================
   動畫 (Animations)
   ========================================= */
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #0b57d0;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.btn-control.pip {
  background: #8e44ad;
  color: white;
}

/* === 懸浮視窗專用樣式 === */
.mini-timer-container {
  width: 100%;
  height: 100%;
  
  /* 改用深色實心背景，比較好讀，不要用半透明了，因為透不出東西 */
  background: #222; 
  border: 1px solid #444; /* 加個邊框更有質感 */
  
  color: white;
  display: flex;
  
  /* 改成橫向排列，省空間 */
  flex-direction: row; 
  align-items: center;
  justify-content: space-between;
  
  padding: 0 16px;
  box-sizing: border-box;
}

/* 讓時間最大，標題變小 */
.mini-info {
  text-align: left;
}

.mini-title {
  font-size: 14px;
  max-width: 120px; /* 限制寬度 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #ccc;
}

.mini-time {
  font-size: 32px;
  margin: 0 16px;
  color: #fff;
}

.mini-controls {
  margin-top: 0; /* 拿掉上邊距 */
}

.mini-controls button {
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.4);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
</style>