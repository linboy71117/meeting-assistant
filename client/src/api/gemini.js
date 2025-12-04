// client/src/api/gemini.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// 讀取 .env 內的 API Key
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

/**
 * 產生會議 AI 總結
 * @param {Array} ideas - 來自 brainstorming 的想法陣列
 */
export async function generateAISummary(ideas = []) {
  if (!ideas.length) {
    return "目前沒有任何想法可供 AI 整理。";
  }

  // 使用可用的 Gemini 模型（你 test.mjs 也成功用這個）
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", 
  });

  const prompt = `
請依以下 brainstorming 的內容，生成完整的會後 AI 總結。
格式需包含：

1️⃣ **會議摘要**（背景、核心問題、討論方向）  
2️⃣ **整合後重點**（合併相似 / 重複想法）  
3️⃣ **可行行動項目（Action Items）**  
4️⃣ **風險與下一步建議**

=== 想法列表 ===
${ideas.map((x, i) => `${i + 1}. ${x.text}`).join("\n")}
`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text(); // 返回純文字
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw err; // 交給呼叫者（BrainstormView）處理
  }
}
