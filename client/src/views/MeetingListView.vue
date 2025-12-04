<template>
  <div class="popup-container">

    <!-- Header -->
    <h1 class="app-title">AI Meeting Assistant</h1>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab active">Meetings</button>
      <button class="tab">Settings</button>
    </div>

    <!-- Role Selector -->
    <div class="role-box">
      <label class="role-option">
        <input type="radio" v-model="role" value="host" />
        <span>我是主持人（Host）</span>
      </label>

      <label class="role-option">
        <input type="radio" v-model="role" value="participant" />
        <span>我是參與者（Participant）</span>
      </label>
    </div>

    <!-- Create Button -->
    <button class="btn-create" @click="createMeeting">
      建立新的會議（Create Meeting）
    </button>

    <!-- Meeting List -->
    <h3 class="section-title">我建立的 / 加入的會議</h3>

    <div class="meeting-list">
      <div
        class="meeting-card"
        v-for="m in meetings"
        :key="m.id"
        @click="$router.push(`/meetings/${m.id}`)"
      >
        <div class="card-header">
          <span class="meeting-index">#{{ m.index }}</span>
          <span class="meeting-title">{{ m.title }}</span>
        </div>

        <div class="meta">📅 {{ m.date }}</div>
        <div class="meta">🔑 {{ m.inviteCode }}</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref } from "vue";

const role = ref("host");
const meetings = ref(
  JSON.parse(localStorage.getItem("aiMeetingAssistant.meetings") || "[]")
);

function createMeeting() {
  const id = crypto.randomUUID();
  $router.push(`/meetings/${id}?new=1`);
}
</script>

<style scoped>
/* ----------------------------
    For Popup Size Optimization
 -----------------------------*/

.popup-container {
  width: 100%;
  max-width: 100% !important;    /* 🌟 Popup 專屬寬度 */
  padding: 14px;
  margin: 0 auto;
  font-family: -apple-system, BlinkMacSystemFont, system-ui;
}

.app-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 10px;
  text-align: left;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.tab {
  flex: 1;
  padding: 5px 0;
  border-radius: 20px;
  font-size: 13px;
  border: 1px solid #ddd;
  background: #f7f7f7;
}

.tab.active {
  background: #0b57d0;
  color: white;
  border: none;
}

.role-box {
  background: white;
  padding: 10px;
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  margin-bottom: 14px;
}

.role-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 6px;
}

.btn-create {
  width: 100%;
  background: #0b57d0;
  color: white;
  border: none;
  padding: 12px 0;
  font-size: 14px;
  border-radius: 10px;
  font-weight: 600;
  margin-bottom: 16px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.meeting-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.meeting-card {
  background: white;
  border-radius: 10px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  cursor: pointer;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.meeting-index {
  font-weight: 700;
  font-size: 14px;
}

.meeting-title {
  font-size: 14px;
  font-weight: 600;
}

.meta {
  font-size: 12px;
  color: #555;
}
</style>
