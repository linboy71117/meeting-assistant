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
    
    const prompt = `你是一個專業的會議助理，請根據以下針對「${topic}」主題的腦力激盪想法清單，進行總結、歸納主要觀點，並提取關鍵行動項目：\n\n想法清單：\n- ${ideasList.join('\n- ')}`;

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