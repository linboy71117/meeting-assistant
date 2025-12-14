<template>
  <div class="meeting-run-container">
    
    <Teleport :to="pipBody" v-if="isPipActive && pipBody">
      <div :class="['mini-timer-container', { 'is-overtime': isOvertime }]">
        <div class="mini-left">
          <span class="mini-label">Current Stage</span>
          <span class="mini-title">{{ currentItem?.title }}</span>
        </div>
        <div class="mini-right">
          <div class="mini-time">{{ formattedTime }}</div>
          <div class="mini-controls" v-if="isHost">
             <button @click="handleNextItem">Next</button>
             <button @click="togglePip" class="btn-close-pip">Exit PiP</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <div v-if="!isPipActive" :class="['timer-bar', { 'is-overtime': isOvertime }]">
      
      <div class="timer-info">
        <div class="status-badge" v-if="isRunning">Running</div>
        <div class="status-badge paused" v-else>Paused</div>
        <div class="current-title">{{ currentItem?.title || '準備開始' }}</div>
        <div class="next-hint" v-if="nextItem">Next: {{ nextItem.title }}</div>
      </div>

      <div class="timer-right-panel">
        <div class="timer-display">
          <span class="time-text">{{ formattedTime }}</span>
          <span v-if="isOvertime" class="overtime-badge">OVERTIME</span>
        </div>

        <div class="timer-controls">
          
          <button class="btn-icon-glass" @click="togglePip" title="懸浮視窗">
            📌
          </button>

          <button 
            class="btn-icon-glass magic-btn" 
            :class="{ 'active': brainstormingActive }"
            @click="startBrainstorm" 
            title="腦力激盪"
          >
            <span v-if="brainstormingActive" class="pulse-dot"></span>
            ✨ {{ brainstormingActive ? '進入腦力激盪' : '腦力激盪' }}
          </button>

          <div class="divider-vertical" v-if="isHost"></div>

          <template v-if="isHost">
            <button v-if="!isRunning" class="btn-control start" @click="startTimer">
              ▶<br>開始
            </button>
            <button v-else class="btn-control pause" @click="pauseTimer">
              ⏸<br>暫停
            </button>

            <button class="btn-control next" @click="handleNextItem">
              →<br>{{ isLastItem ? '結束' : '下一項' }}
            </button>
          </template>
        </div>
      </div>
    </div>

    <div class="agenda-list-container">
      <div 
        v-for="(item, index) in agenda" 
        :key="index"
        :class="['agenda-item', { 
          'active': currentIndex === index, 
          'past': currentIndex > index 
        }]"
        @click="handleJumpTo(index)"
      >
        <div class="status-indicator"></div>

        <div class="item-index">
          <span v-if="currentIndex === index && isRunning" class="playing-icon">
            <span></span><span></span><span></span>
          </span>
          <span v-else-if="currentIndex > index" class="check-icon">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>

        <div class="item-content">
          <div class="item-row-top">
            <span class="item-title">{{ item.title }}</span>
            <span class="item-time-pill">{{ item.time }} min</span>
          </div>
          <div class="item-row-btm" v-if="item.owner || item.note">
            <span class="item-owner" v-if="item.owner">👤 {{ item.owner }}</span>
            <span class="item-note" v-if="item.note">📝 {{ item.note }}</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import socket from '../config/socket'; 

// 定義資料結構
interface AgendaItem {
  id?: number;
  time: string;   
  title: string;
  owner?: string;
  note?: string;
}

const route = useRoute();
const router = useRouter();
const meetingId = route.params.id as string;
const API_BASE = (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:3000";

// === 狀態管理 ===
const isHost = ref(false); 
const agenda = ref<AgendaItem[]>([]);
const currentIndex = ref(0);
const isRunning = ref(false);
const brainstormingActive = ref(false); // 新增：腦力激盪狀態

// 同步的會議高階欄位
const meetingTitle = ref('');
const meetingDescription = ref('');
const meetingSummary = ref('');
const timeLeft = ref(0);
const timerInterval = ref<any>(null);

const currentItem = computed(() => agenda.value[currentIndex.value]);
const nextItem = computed(() => agenda.value[currentIndex.value + 1]);
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

// === Timer Sync Logic ===
const handleTimerSync = (syncData: any) => {
  if (isHost.value && timerInterval.value) return;

  if (currentIndex.value !== syncData.currentIndex) {
    currentIndex.value = syncData.currentIndex;
  }
  
  timeLeft.value = syncData.timeLeft;
  
  if (syncData.isRunning && !timerInterval.value) {
    startTimer(false);
  } else if (!syncData.isRunning) {
    pauseTimer(false);
    isRunning.value = false;
  }
};

// === 初始化 ===
onMounted(async () => {
  try {
    const userId = localStorage.getItem("meeting_user_id");
    
    // 1. 抓取會議資料
    const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`);
    const data = await res.json();

    if (data.agenda && Array.isArray(data.agenda)) {
      agenda.value = data.agenda;
    }
    
    // 初始化高階欄位（title/description/summary）
    if (data.title) meetingTitle.value = data.title;
    if (data.description) meetingDescription.value = data.description;
    if (data.summary) meetingSummary.value = data.summary;
    
    // 2. 身分確認
    if (userId) {
      const roleRes = await fetch(`${API_BASE}/api/users/${userId}/meetings`);
      const myMeetings = await roleRes.json();
      const thisMeeting = myMeetings.find((m: any) => m.id === meetingId);
      if (thisMeeting && thisMeeting.role === 'host') {
        isHost.value = true;
      }
    }
    
    // 3. 初始化計時器
    resetTimerForCurrentIndex(false);

    // 4. 檢查是否有進行中的腦力激盪 (新增邏輯)
    try {
      const resActive = await fetch(`${API_BASE}/api/brainstorming/${meetingId}/active`);
      if (resActive.ok) {
        brainstormingActive.value = true;
      }
    } catch(e) { console.warn("Brainstorm check skipped"); }

    // 5. Socket 連線
    if (!socket.connected) {
      socket.connect();
    }
    
    socket.off('timer-sync', handleTimerSync);
    socket.on('timer-sync', handleTimerSync);
    
    // 監聽腦力激盪開啟事件 (新增邏輯)
    socket.on("new-brainstorming-created", () => {
       brainstormingActive.value = true;
    });

     // 監聽後端的會議更新，更新高階欄位與議程
     socket.off('meeting-updated', handleMeetingUpdated);
     socket.on('meeting-updated', handleMeetingUpdated);

    socket.emit('join-meeting', meetingId);

    // Host 初始廣播
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
  socket.off('new-brainstorming-created'); // 記得移除監聽
  socket.off('meeting-updated', handleMeetingUpdated);

  if (socket.connected) {
    // 這裡不一定要 disconnect，視你的全域 socket 策略而定
    // socket.disconnect();
  }
});

// 處理後端廣播的 meeting 更新
function handleMeetingUpdated(data: any) {
  if (!data) return;
  try {
    // 更新議程與可能的其他欄位，然後重置 timer 狀態以完整重新渲染
    if (data.agenda && Array.isArray(data.agenda)) {
      agenda.value = data.agenda;
      // 若目前索引超過新議程長度，調整到最後或重設為 0
      if (currentIndex.value >= agenda.value.length) {
        currentIndex.value = Math.max(0, agenda.value.length - 1);
      }
      // 依新的 currentIndex 重設時間（不發送 socket 廣播）
      resetTimerForCurrentIndex(false);
    }

    // 若後端有提供其他可同步欄位，亦可在此處更新
    // 例如：data.title, data.summary
    if (data.title !== undefined) meetingTitle.value = data.title;
    if (data.description !== undefined) meetingDescription.value = data.description;
    if (data.summary !== undefined) meetingSummary.value = data.summary;

    console.log('meeting-updated received in RunView — full refresh applied', data);
  } catch (e) {
    console.error('Error applying meeting-updated in RunView', e);
  }
}

// === Timer Controls ===
function startTimer(shouldEmit = true) {
  if (isRunning.value && timerInterval.value) return;
  isRunning.value = true;
  if (shouldEmit) emitSync();
  timerInterval.value = setInterval(() => {
    timeLeft.value--;
    emitSync();
  }, 1000);
}

function pauseTimer(shouldEmit = true) {
  isRunning.value = false;
  if (timerInterval.value) {
    clearInterval(timerInterval.value);
    timerInterval.value = null;
  }
  if (shouldEmit) emitSync();
}

function resetTimerForCurrentIndex(shouldEmit = true) {
  const item = agenda.value[currentIndex.value];
  if (!item) return;
  timeLeft.value = parseDurationToSeconds(item.time);
  pauseTimer(shouldEmit);
}

function handleNextItem() {
  if (currentIndex.value < agenda.value.length - 1) {
    currentIndex.value++;
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

// === Brainstorming Logic (整合進來) ===
function startBrainstorm() {
  if (brainstormingActive.value) {
    // 如果已有活動，進入提案頁
    router.push(`/meetings/${meetingId}/brainstorm/proposal`);
  } else {
    // 否則進入創建頁
    router.push(`/meetings/${meetingId}/brainstorm`);
  }
}

// === PiP Logic ===
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
      width: 320, height: 120,
    });
    pipWindowRef = pipWindow;
    
    // 複製樣式
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
/* 全域設定 */
.meeting-run-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f2f5; /* 更柔和的灰底 */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  width: 100%;
  box-sizing: border-box;
}

/* =========================================
   1. Timer Bar (現代化風格)
   ========================================= */
.timer-bar {
  /* 漸層背景 */
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  position: sticky;
  top: 0;
  z-index: 100;
  transition: background 0.3s ease;
}

.timer-bar.is-overtime {
  background: linear-gradient(135deg, #cb2d3e 0%, #ef473a 100%);
}

/* 左側標題區 */
.timer-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-badge {
  font-size: 10px;
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  padding: 2px 6px;
  border-radius: 4px;
  width: fit-content;
  border: 1px solid rgba(46, 204, 113, 0.4);
  font-weight: bold;
  letter-spacing: 0.5px;
}

.status-badge.paused {
  background: rgba(255, 255, 255, 0.15);
  color: #ddd;
  border-color: rgba(255, 255, 255, 0.3);
}

.current-title {
  font-size: 18px;
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px; /* 避免在窄視窗爆開 */
}

.next-hint {
  font-size: 11px;
  opacity: 0.7;
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 右側時間與控制區 */
.timer-right-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.timer-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-text {
  font-family: 'Roboto Mono', monospace;
  font-size: 36px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -1px;
}

.overtime-badge {
  font-size: 10px;
  background: white;
  color: #c0392b;
  padding: 2px 4px;
  border-radius: 3px;
  font-weight: 800;
}

/* 控制按鈕群組 */
.timer-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.divider-vertical {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 4px;
}

/* 通用按鈕樣式 */
.btn-control {
  border: none;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.btn-control:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.btn-control:active {
  transform: translateY(0);
}

.btn-control.start {
  background: #00b894;
  color: white;
}

.btn-control.pause {
  background: #fdcb6e;
  color: #2d3436;
}

.btn-control.next {
  background: rgba(255, 255, 255, 0.9);
  color: #2d3436;
}

/* 玻璃質感圖示按鈕 */
.btn-icon-glass {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon-glass:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 腦力激盪按鈕 (Magic Button) */
.magic-btn {
  width: auto; /* 不像 icon 是圓的 */
  padding: 0 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  gap: 6px;
  background: rgba(255, 255, 255, 0.1);
}

.magic-btn.active {
  background: #a29bfe; /* 啟動時變成紫色 */
  color: #2d3436;
  border-color: #a29bfe;
  box-shadow: 0 0 10px rgba(162, 155, 254, 0.6);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background: #d63031;
  border-radius: 50%;
  display: inline-block;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.5); opacity: 0.5; }
  100% { transform: scale(1); opacity: 1; }
}


/* =========================================
   2. Agenda List (卡片式列表)
   ========================================= */
.agenda-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  width: 100%;
  margin: 0;
  box-sizing: border-box;
}

.agenda-item {
  background: white;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 14px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
  border: 1px solid transparent;
}

.agenda-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

/* 狀態指示條 (左側線條) */
.status-indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #e0e0e0;
}

/* 進行中 (Active) */
.agenda-item.active {
  background: #fdfdfd;
  border-color: #a0c4ff;
}

.agenda-item.active .status-indicator {
  background: #0b57d0;
  width: 6px;
}

/* 過去 (Past) */
.agenda-item.past {
  opacity: 0.6;
  background: #f9f9f9;
}

.agenda-item.past .status-indicator {
  background: #bbb;
}

/* 序號/狀態 */
.item-index {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #999;
  font-size: 14px;
}

.agenda-item.active .item-index {
  color: #0b57d0;
}

.check-icon {
  color: #27ae60;
  font-size: 16px;
}

/* 播放動畫 */
.playing-icon span {
  display: inline-block;
  width: 3px;
  height: 12px;
  background-color: #0b57d0;
  margin: 0 1px;
  animation: equalize 1s infinite;
}
.playing-icon span:nth-child(2) { animation-delay: 0.2s; }
.playing-icon span:nth-child(3) { animation-delay: 0.4s; }

@keyframes equalize {
  0%, 100% { height: 6px; }
  50% { height: 14px; }
}

/* 內容區 */
.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-row-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-title {
  font-size: 15px;
  font-weight: 600;
  color: #2d3436;
}

.item-time-pill {
  font-size: 11px;
  background: #f1f2f6;
  color: #636e72;
  padding: 2px 8px;
  border-radius: 10px;
}

.item-row-btm {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: #636e72;
}

/* =========================================
   3. PiP Window (深色簡約)
   ========================================= */
.mini-timer-container {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  font-family: system-ui;
}

.mini-timer-container.is-overtime {
  border-bottom: 4px solid #c0392b;
}

.mini-left {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mini-label {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
}

.mini-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.mini-right {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.mini-time {
  font-size: 28px;
  font-weight: 700;
  font-family: monospace;
}

.mini-controls {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.mini-controls button {
  background: #333;
  color: #ccc;
  border: 1px solid #555;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  border-radius: 4px;
}

.mini-controls button:hover {
  background: #444;
  color: white;
}
</style>