// ai_response.js (Worker Thread)

const { parentPort, workerData } = require('worker_threads');
const { GoogleGenAI } = require("@google/genai"); 

// 🚨 注意：將 API Key 寫死在程式碼中並不安全。
//      強烈建議改為使用環境變數：const ai = new GoogleGenAI({});
const ai = new GoogleGenAI({});

/**
 * 呼叫 Gemini API 進行腦力激盪想法總結
 */
async function callGeminiApi(prompt) {
    const { meetingId } = workerData;
    console.log(`[Worker ${process.pid} for ${meetingId}] Starting Gemini API call...`);
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: prompt,
            config: {
                temperature: 0.2, 
            }
        });
        return response.text;
    } catch (error) {
        console.error(`[Worker ${process.pid}] Gemini API Call Failed:`, error);
        throw new Error("Failed to generate AI analysis from Gemini API.");
    }
}

// Worker 接收到數據後開始執行
async function processAnalysis() {
    const { meetingId, topic, ideasList } = workerData;
    
    const prompt = `Developer: 你是一位專業的會議助理，請針對以下「${topic}」主題的腦力激盪想法清單，進行結構化分析。

                    ---
                    ### 處理步驟要求：

                    在開始進行分析前，請先列出你將執行的概念性工作清單（3-7點），涵蓋從想法篩選到歸納總結的核心步驟。Begin with a concise checklist (3-7 bullets) of what you will do; keep items conceptual, not implementation-level.

                    1. **篩選想法**：首先，請移除所有無實質內容、重複或無用的想法（如：「沒意見」、「不知道」、「沒想法」等），僅保留有價值、可供討論的實質建議。若完成此步驟後，發現無任何可供討論的實質建議，請忽略第二與第三步驟，直接輸出目前無實質想法，建議重新開始腦力激盪等說明，避免在完全無可供討論的實質建議時提供自己的意見。
                    2. **分組歸納**：接著，請將相關聯、相似的實質想法進行分組，並為每一組取一個精煉且概括性強的子主題標題。分組上限請不超過五組，分組標題及順序需與原始清單中首次出現想法的順序一致。
                    3. **總結與行動**：最後，請根據分組的結果，進行整體總結、歸納主要觀點，並提供會議接下來可以深入討論的問題。

                    After each step, validate your results in 1-2 lines; if validation fails (e.g., no valid ideas found), promptly end the analysis and explain why. 若遇需進行不可逆或具破壞性的操作，請先獲得明確確認。
                    **請嚴格注意：除了三個必輸出的 Markdown 區塊（#### 1. 篩選後的有效想法, #### 2. 分組歸納與子主題, #### 3. 整體總結與關鍵行動項目）及其內容外，請勿輸出任何前置步驟（如概念性工作清單）或中間步驟的驗證結果。**
                    ---
                    ### 輸出格式要求：

                    請嚴格按照下列三個部分輸出內容，並使用 Markdown 格式呈現：

                    #### 1. 篩選後的有效想法
                    - 列出所有經過篩選、被保留下來的實質想法。
                    - 若無任何有效想法，請明確標註：「沒有有效想法」。

                    #### 2. 分組歸納與子主題
                    - 以 Markdown 二級標題（##）展示每個子主題。
                    - 在每個子主題下，以無序清單（-）列出該組的所有相關想法。
                    - 分組和子主題標題與順序必須與在篩選後有效想法清單中首次出現想法的順序一致。
                    - 若無任何可分組的有效想法，此區塊可省略。

                    #### 3. 整體總結與關鍵行動項目
                    - 提供整體總結和主要觀點。
                    - 提供可繼續深入討論的問題，例如缺陷、與其他分組的比較等，採用無序清單呈現。

                    ---
                    腦力激盪想法清單（原始輸入）：
                    - ${ideasList.join('\n- ')}

                    ---
                    請僅使用允許的工具，根據需求自動執行常規讀取類操作；如需進行不可逆或具破壞性的操作，請先獲得明確確認。

                    ## Output Format

                    輸出為 Markdown 格式，結構如下（僅供參考，依實際分析內容生成）：

                    ---

                    #### 1. 篩選後的有效想法
                    - 想法1
                    - 想法2
                    …
                    （如無有效想法，僅輸出「沒有有效想法」）

                    #### 2. 分組歸納與子主題
                    ## 子主題一
                    - 相關想法A
                    - 相關想法B

                    ## 子主題二
                    - 相關想法C
                    （如無分組，可省略本段）

                    #### 3. 整體總結與關鍵行動項目
                    - 總結內容
                    - 可深入討論的問題1
                    - 可深入討論的問題2

                    ---
                    以上為本次分析的完整內容，請嚴格遵守輸出格式要求。
                    `;

    let result = {
        success: false,
        meetingId: meetingId,
        summary: null,
        error: null
    };

    try {
        const analysisText = await callGeminiApi(prompt);
        
        result.success = true;
        result.summary = analysisText;
        console.log(`[Worker ${process.pid}] Analysis completed successfully.`);
        // console.log(`[Worker ${process.pid}] Summary: ${analysisText}`);
    } catch (e) {
        result.error = e.message;
    }

    // 將結果發回給主執行緒
    parentPort.postMessage(result);
}

processAnalysis();