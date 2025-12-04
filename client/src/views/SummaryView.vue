<template>
  <div class="summary-page">

    <!-- Header -->
    <header class="header">
      <h2>AI 會後總結</h2>

      <p class="meeting-title">{{ meetingTitle }}</p>

      <button class="back-btn" @click="goBack">
        ← 回到會議
      </button>
    </header>

    <!-- Content -->
    <main class="content-card" v-html="renderedSummary">
    </main>

  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import MarkdownIt from "markdown-it";

const md = new MarkdownIt();
const route = useRoute();
const router = useRouter();

const meetingId = route.params.id;

const summaryKey = `aiMeetingAssistant.summary.${meetingId}`;
const meetingListKey = "aiMeetingAssistant.meetings";

const meetingTitle = ref("");
const renderedSummary = ref("");

// ------------------------------------------------
// Load Meeting Title + Summary
// ------------------------------------------------
onMounted(() => {
  // 會議標題
  const raw = localStorage.getItem(meetingListKey);
  if (raw) {
    const arr = JSON.parse(raw);
    const m = arr.find((x) => x.id === meetingId);
    if (m) meetingTitle.value = m.title;
  }

  // AI 總結內容
  const text = localStorage.getItem(summaryKey);

  if (!text) {
    renderedSummary.value = md.render("⚠ 尚未產生 AI 會後總結。");
    return;
  }

  renderedSummary.value = md.render(text);
});

// ------------------------------------------------
// Back button
// ------------------------------------------------
function goBack() {
  router.push(`/meetings/${meetingId}`);
}
</script>

<style scoped>
.summary-page {
  padding: 16px;
  font-family: system-ui, sans-serif;
  background: #f5f6fa;
  min-height: 100vh;
  box-sizing: border-box;
}

/* Header */
.header {
  margin-bottom: 14px;
}

.header h2 {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: #111827;
}

.meeting-title {
  font-size: 14px;
  color: #6b7280;
  margin-top: 4px;
}

.back-btn {
  margin-top: 10px;
  background: none;
  border: none;
  color: #2563eb;
  cursor: pointer;
  font-size: 13px;
  padding: 4px 0;
}

.back-btn:hover {
  text-decoration: underline;
}

/* Card */
.content-card {
  background: #ffffff;
  padding: 18px;
  border-radius: 12px;
  box-shadow: 0px 2px 8px rgba(0,0,0,0.08);
  font-size: 14px;
  line-height: 1.6;
}

/* Markdown Styles */
.content-card h1,
.content-card h2,
.content-card h3 {
  margin-top: 16px;
  margin-bottom: 8px;
  font-weight: 600;
  color: #111827;
}

.content-card p {
  margin-bottom: 10px;
}

.content-card ul {
  padding-left: 18px;
  margin-bottom: 10px;
}

.content-card li {
  margin-bottom: 4px;
}

.content-card strong {
  color: #111827;
}

</style>
