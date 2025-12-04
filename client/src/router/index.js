import { createRouter, createWebHashHistory } from "vue-router";

import MeetingListView from "../views/MeetingListView.vue";
import MeetingAgendaView from "../views/MeetingAgendaView.vue";
import BrainstormView from "../views/BrainstormView.vue";
import SettingsView from "../views/SettingsView.vue";
import HelpView from "../views/HelpView.vue";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/meetings" },
    { path: "/meetings", component: MeetingListView },
    { path: "/meetings/:id", component: MeetingAgendaView },
    { path: "/meetings/:id/brainstorm", component: BrainstormView },

    // ⭐ 新增的頁面
    { path: "/settings", component: SettingsView },
    { path: "/help", component: HelpView },
    {
      path: "/meetings/:id/summary",
      name: "SummaryView",
      component: () => import("../views/SummaryView.vue")
    },

  ],
});

export default router;
