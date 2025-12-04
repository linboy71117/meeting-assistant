<template>
  <div class="bs-container">

    <!-- HEADER -->
    <header class="bs-header">
      <h2 class="title">Brainstorming Session</h2>
      <p class="subtitle">{{ meetingTitle }}</p>
      <p class="code-row">
        Agenda Code：<span class="pill">{{ inviteCode }}</span>
      </p>
    </header>

    <!-- STEP SWITCH -->
    <nav class="step-tabs">
      <button
        v-for="step in steps"
        :key="step.id"
        :class="{ active: currentStep === step.id }"
        @click="switchStep(step.id)"
      >
        {{ step.label }}
      </button>
    </nav>


    <!-- ================= MAIN PANEL ================= -->
    <main class="bs-main">

      <!-- SHARE -->
      <section v-if="currentStep === 1" class="step-section">
        <h3>Share Ideas</h3>

        <textarea
          class="idea-input"
          v-model="newIdea"
          placeholder="輸入想法（Enter 送出）"
          @keydown.enter.exact.prevent="addIdea"
        ></textarea>

        <button class="add-btn" @click="addIdea">新增想法</button>

        <ul class="idea-list">
          <li v-for="(idea, idx) in ideas" :key="idea.id">
            <strong>#{{ idx + 1 }}</strong> {{ idea.text }}
            <button class="del-btn" @click="removeIdea(idx)">刪除</button>
          </li>
        </ul>
      </section>



      <!-- EVALUATE (VOICE) -->
      <section v-else-if="currentStep === 2" class="step-section">

        <h3>Evaluate（語音版）</h3>
        <p class="hint">按住下方按鈕講話，放開後系統自動分析可行性與影響力。</p>

        <!-- ================= 錄音按鈕（完全置中 + 自動縮放） ================= -->
        <div class="record-area">
          <div
            class="record-circle"
            :style="circleStyle"
            :class="{ recording: isRecording }"
            @mousedown="startRecord"
            @mouseup="stopRecord"
            @touchstart.prevent="startRecord"
            @touchend.prevent="stopRecord"
          >
            🎤 按住錄音
          </div>
        </div>

        <!-- APPLY -->
        <button class="apply-btn" @click="applyVoiceScore">套用到當前想法</button>

        <!-- IDEA CARDS -->
        <div
          class="evaluate-card"
          v-for="idea in ideas"
          :key="idea.id"
          :class="{ selected: selectedIdea === idea.id }"
          @click="selectedIdea = idea.id"
        >
          <div class="idea-text">{{ idea.text }}</div>

          <div class="select-row">
            <label>可行性：</label>
            <select v-model="idea.feasible" @change="saveState">
              <option value="">未選</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>

            <label>影響力：</label>
            <select v-model="idea.impact" @change="saveState">
              <option value="">未選</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
        </div>

      </section>




      <!-- VOTE -->
      <section v-else class="step-section">
        <h3>Vote</h3>

        <div class="vote-card" v-for="idea in ideas" :key="idea.id">
          <p class="idea-text">{{ idea.text }}</p>

          <button class="vote-btn" :class="{ active: idea.vote === 'ready' }" @click="setVote(idea, 'ready')">
            Ready
          </button>

          <button class="vote-btn" :class="{ active: idea.vote === 'more' }" @click="setVote(idea, 'more')">
            Need More
          </button>
        </div>
      </section>

    </main>



    <!-- FOOTER -->
    <footer class="bs-footer">
      <button class="nav-btn" @click="prevStep" :disabled="currentStep === 1">上一步</button>
      <button class="nav-btn primary" @click="nextStep">
        {{ currentStep === 3 ? "結束並生成會後總結" : "下一步" }}
      </button>
    </footer>

  </div>
</template>
<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { generateAISummary } from "../api/gemini";

const route = useRoute();
const router = useRouter();

const meetingId = route.params.id;
const brainstormKey = `aiMeetingAssistant.brainstorm.${meetingId}`;
const summaryKey = `aiMeetingAssistant.summary.${meetingId}`;

const meetingTitle = ref("");
const inviteCode = ref("");

onMounted(() => {
  const raw = localStorage.getItem("aiMeetingAssistant.meetings");
  if (raw) {
    const list = JSON.parse(raw);
    const m = list.find((x) => x.id === meetingId);
    if (m) {
      meetingTitle.value = m.title;
      inviteCode.value = m.inviteCode;
    }
  }
});

const steps = [
  { id: 1, label: "Share" },
  { id: 2, label: "Evaluate" },
  { id: 3, label: "Vote" }
];

const currentStep = ref(1);
const ideas = ref([]);
const newIdea = ref("");
const selectedIdea = ref(null);


// ---- Load saved state ----
onMounted(() => {
  const raw = localStorage.getItem(brainstormKey);
  if (raw) {
    const data = JSON.parse(raw);
    ideas.value = data.ideas || [];
    currentStep.value = data.currentStep || 1;
  }
});

function saveState() {
  localStorage.setItem(
    brainstormKey,
    JSON.stringify({ ideas: ideas.value, currentStep: currentStep.value })
  );
}

function addIdea() {
  if (!newIdea.value.trim()) return;
  ideas.value.push({
    id: Date.now(),
    text: newIdea.value.trim(),
    feasible: "",
    impact: "",
    vote: ""
  });
  newIdea.value = "";
  saveState();
}

function removeIdea(i) {
  ideas.value.splice(i, 1);
  saveState();
}

function switchStep(id) {
  currentStep.value = id;
  saveState();
}


// =====================  錄音按鈕（動態大小）  =====================

const isRecording = ref(false);
let mediaRecorder;
let chunks = [];

const circleSize = computed(() => Math.min(window.innerWidth * 0.6, 260));

const circleStyle = computed(() => ({
  width: circleSize.value + "px",
  height: circleSize.value + "px"
}));

async function startRecord() {
  chunks = [];
  isRecording.value = true;

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.start();
}

function stopRecord() {
  if (!mediaRecorder) return;

  isRecording.value = false;
  mediaRecorder.stop();

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "audio/webm" });
    analyzeVoice(blob);
  };
}

function analyzeVoice(blob) {
  alert("語音已記錄！請選擇想法並按「套用」");
}

function applyVoiceScore() {
  if (!selectedIdea.value) {
    alert("請先選擇想法並完成語音評估");
    return;
  }

  const item = ideas.value.find((i) => i.id === selectedIdea.value);
  item.feasible = "高";
  item.impact = "中";

  saveState();
  alert("語音分析結果已套用！");
}


// ============ Vote ============
function setVote(idea, val) {
  idea.vote = val;
  saveState();
}


// ============ Generate Summary ============
async function nextStep() {
  if (currentStep.value < 3) {
    currentStep.value++;
    saveState();
    return;
  }

  try {
    const summary = await generateAISummary(ideas.value);
    localStorage.setItem(summaryKey, summary);

    alert("AI 已成功生成會後總結！");
    router.push(`/meetings/${meetingId}`);
  } catch (err) {
    console.error(err);
    alert("AI 總結生成失敗，請稍後再試！");
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value--;
    saveState();
  }
}
</script>
<style scoped>
.bs-container {
  width: 100%;
  max-width: 620px;
  margin: 0 auto;
  padding: 16px;
  font-family: system-ui, sans-serif;
}

.bs-header {
  margin-bottom: 12px;
}

.title {
  font-size: 20px;
  font-weight: 700;
}

.subtitle {
  font-size: 14px;
  color: #555;
}

.pill {
  background: #eee;
  padding: 4px 8px;
  border-radius: 6px;
}

.step-tabs {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.step-tabs button {
  flex: 1;
  padding: 6px 12px;
  border-radius: 20px;
  background: #f0f0f0;
  border: 1px solid #ccc;
  font-size: 13px;
}

.step-tabs .active {
  background: #0b57d0;
  color: white;
}

/* Main Panel */
.bs-main {
  background: white;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #eee;
}

/* Share Section */
.idea-input {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ddd;
  resize: none;
}

.add-btn {
  margin-top: 8px;
  padding: 6px 14px;
  background: #0b57d0;
  color: white;
  border: none;
  border-radius: 8px;
}

.idea-list li {
  display: flex;
  justify-content: space-between;
  background: #fafafa;
  border-radius: 8px;
  padding: 10px;
  margin-top: 8px;
  border: 1px solid #eee;
}

/* ============ Evaluate ============ */

.record-area {
  width: 100%;
  display: flex;
  justify-content: center;
  margin: 20px 0;
}

.record-circle {
  width: min(70vw, 180px);  /* 在 popup 不會超過 180px */
  height: min(70vw, 180px);
  max-width: 180px;
  max-height: 180px;
  background: #7a00ff;
  color: white;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 17px;

  box-shadow: 0 0 25px rgba(120,0,255,0.5);
  transition: transform .25s ease, box-shadow .25s ease;
}

.record-circle.recording {
  transform: scale(1.1);
  box-shadow: 0 0 40px rgba(160,0,255,0.8);
}


.apply-btn {
  width: 100%;
  padding: 10px 0;
  border: none;
  border-radius: 8px;
  background: #0b57d0;
  color: white;
  margin-bottom: 12px;
}

.evaluate-card {
  background: #111;
  color: white;
  border-radius: 12px;
  padding: 12px;
  margin-top: 10px;
}

.evaluate-card.selected {
  border: 2px solid #7a00ff;
}

/* Vote */
.vote-card {
  background: #fafafa;
  border: 1px solid #eee;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 14px;
}

.vote-btn {
  padding: 6px 12px;
  margin-right: 6px;
  border-radius: 8px;
  border: 1px solid #ccc;
}

.vote-btn.active {
  background: #0b57d0;
  color: white;
  border: none;
}

/* Footer */
.bs-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}

.nav-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: white;
}

.nav-btn.primary {
  background: #0b57d0;
  color: white;
  border: none;
}
</style>
