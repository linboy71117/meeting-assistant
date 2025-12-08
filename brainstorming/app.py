import os
import sqlite3
import json
import time # 用於緩存
from flask import Flask, render_template, request, jsonify, g, redirect, url_for
from google import genai

# ⚠️ 注意: 在生產環境中請務必使用環境變數來管理 API 金鑰！
API_KEY = "AIzaSyDz3RPXx85wdX8II8aoL2jswADJM2N1LcI"
DATABASE = 'database.db'
MODEL = 'gemini-2.5-flash' # 使用確認可用的 flash 模型

app = Flask(__name__)

# 全域緩存變數（用於優化 API 呼叫次數）
last_analysis_result = "尚未執行分析。"
last_analysis_timestamp = 0 
CACHE_DURATION = 60 # 緩存 60 秒

# --- 資料庫操作函式 ---

def get_db():
    """建立資料庫連線，如果不存在則建立資料表。"""
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row # 讓查詢結果以字典形式返回
    return db

@app.teardown_appcontext
def close_connection(exception):
    """應用程式結束時關閉資料庫連線。"""
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """初始化資料庫並創建 proposals 和 meetings 兩個表。"""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        
        # 1. proposals (提案) 表：儲存每個成員的想法
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meeting_id INTEGER NOT NULL,
                user_name TEXT NOT NULL,
                proposal_text TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # 2. meetings (會議) 表：儲存主題
        # status: 1=Active, 0=Closed
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                status INTEGER DEFAULT 1,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        db.commit()

# --- 輔助函式 ---

def get_current_meeting():
    """獲取當前活躍的會議 ID 和主題。"""
    db = get_db()
    cursor = db.cursor()
    # 獲取 status=1 (活躍中) 且 ID 最大 (最新) 的會議
    cursor.execute("SELECT id, topic FROM meetings WHERE status = 1 ORDER BY id DESC LIMIT 1")
    return cursor.fetchone()

# --- Gemini API 呼叫函式 ---

def generate_analysis_prompt(topic, proposals):
    """根據主題和提案，建立給 Gemini 的 Prompt。"""
    formatted_proposals = ""
    for i, p in enumerate(proposals):
        formatted_proposals += f"提案 {i+1} - 由 {p['user_name']} 提出:\n"
        formatted_proposals += f"「{p['proposal_text']}」\n\n"

    prompt = f"""
        你是一位專業的會議AI顧問。
        本次腦力激盪的主題是：「{topic}」。
        這是團隊針對此主題提供的所有提案：

        --- 提案列表 ---
        {formatted_proposals}
        ---

        請根據以上提案，用繁體中文，進行專業且嚴謹的分析與質疑。內容必須包含以下四個**Markdown 標題**：
        ## 綜合優勢分析 (Strengths)
        ## 可行性質疑與風險 (Feasibility Checks & Risks)
        ## 專案難易度評估 (Difficulty Assessment)
        ## 總結與建議發展方向 (Summary & Recommendation)
        
        每個標題下的內容約 100 字左右即可，分析應客觀且深入，以便團隊做出最終決策。
    """
    return prompt

def get_gemini_analysis_logic(current_meeting_id, current_topic):
    """從資料庫讀取提案並呼叫 Gemini 進行分析的邏輯（包含緩存）。"""
    global last_analysis_result, last_analysis_timestamp
    
    # 1. 檢查緩存
    if time.time() - last_analysis_timestamp < CACHE_DURATION:
        return last_analysis_result, 200

    try:
        # 2. 讀取所有提案
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT user_name, proposal_text FROM proposals WHERE meeting_id = ?", (current_meeting_id,))
        proposals = cursor.fetchall()

        if not proposals:
            return "目前沒有任何提案，請先提交提案。", 200

        # 3. 建立 Prompt
        prompt = generate_analysis_prompt(current_topic, proposals)

        # 4. 呼叫 Gemini
        client = genai.Client(api_key=API_KEY)
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt
        )
        
        # 5. 成功後更新緩存
        last_analysis_result = response.text
        last_analysis_timestamp = time.time()
        return response.text, 200

    except Exception as e:
        print(f"Gemini API 呼叫失敗或資料庫錯誤: {e}")
        return f"分析時發生錯誤：{e}", 500

# --- 路由 (Routes) ---

@app.route('/')
def index():
    """主啟動頁面：顯示「開始 Brain-Storming」按鈕或直接導向提案頁。"""
    current_meeting = get_current_meeting()
    
    # 如果有活躍的會議，則直接導向提案頁面
    if current_meeting:
        return redirect(url_for('proposal_page'))
    
    # 否則，顯示發起會議頁面
    return render_template('start_meeting.html')

@app.route('/start_meeting_submit', methods=['POST'])
def start_meeting_submit():
    """處理發起人輸入主題，並建立新的會議。"""
    data = request.get_json()
    topic = data.get('topic')
    
    if not topic or len(topic.strip()) < 5:
        return jsonify({"success": False, "message": "主題內容不能為空且至少5個字"}), 400
        
    try:
        db = get_db()
        # 先將所有舊會議設為非活躍狀態（可選，但有助於確保只有一個活躍會議）
        db.execute("UPDATE meetings SET status = 0 WHERE status = 1")
        db.commit()

        # 建立新的活躍會議
        db.execute("INSERT INTO meetings (topic, status) VALUES (?, 1)", (topic,))
        db.commit()
        
        # 清空提案表，確保本次提案只屬於新會議
        db.execute("DELETE FROM proposals")
        db.commit()
        
        # 重置緩存
        global last_analysis_result, last_analysis_timestamp
        last_analysis_result = "尚未執行分析。"
        last_analysis_timestamp = 0 
        
        return jsonify({"success": True, "message": "新會議已發起！"})
    except Exception as e:
        return jsonify({"success": False, "message": f"發起會議失敗: {e}"}), 500


@app.route('/proposals')
def proposal_page():
    """提案頁面：成員提交提案與查看分析結果。"""
    current_meeting = get_current_meeting()
    if not current_meeting:
        return redirect(url_for('index'))
        
    # 提案頁面只需要顯示 HTML，主題資訊通過 /get_current_topic API 獲取
    return render_template('proposal_page.html')

@app.route('/get_current_topic', methods=['GET'])
def get_current_topic():
    """提供當前會議主題給前端。"""
    current_meeting = get_current_meeting()
    if current_meeting:
        return jsonify({"active": True, "topic": current_meeting['topic']}), 200
    else:
        return jsonify({"active": False, "topic": "無活躍會議"}), 200


@app.route('/submit_proposal', methods=['POST'])
def submit_proposal():
    """接收前端提交的提案，並存入資料庫。"""
    current_meeting = get_current_meeting()
    if not current_meeting:
        return jsonify({"success": False, "message": "目前無活躍的腦力激盪會議"}), 400
        
    data = request.get_json()
    user_name = data.get('user_name', '匿名組員')
    proposal_text = data.get('proposal_text')
    
    if not proposal_text:
        return jsonify({"success": False, "message": "提案內容不能為空"}), 400

    # 寫入資料庫，使用當前會議 ID
    try:
        db = get_db()
        db.execute(
            "INSERT INTO proposals (meeting_id, user_name, proposal_text) VALUES (?, ?, ?)",
            (current_meeting['id'], user_name, proposal_text)
        )
        db.commit()
        
        # 提交新提案後，清除緩存，確保下次請求會是最新分析
        global last_analysis_timestamp
        last_analysis_timestamp = 0 
        
        return jsonify({"success": True, "message": "提案已成功提交，等待分析..."})
    except Exception as e:
        return jsonify({"success": False, "message": f"資料庫寫入錯誤: {e}"}), 500


@app.route('/get_analysis', methods=['GET'])
def get_analysis_api():
    """提供 API 路由，回傳最新的 Gemini 分析結果。"""
    current_meeting = get_current_meeting()
    if not current_meeting:
        return jsonify({"analysis": "目前沒有活躍會議，無法進行分析。"}), 200
        
    analysis_text, status_code = get_gemini_analysis_logic(current_meeting['id'], current_meeting['topic'])
    return jsonify({"analysis": analysis_text}), status_code

@app.route('/get_proposals', methods=['GET'])
def get_proposals():
    """提供 API 路由，回傳所有已提交的提案。"""
    current_meeting = get_current_meeting()
    if not current_meeting:
        return jsonify({"proposals": []}), 200
        
    db = get_db()
    cursor = db.cursor()
    cursor.execute("SELECT user_name, proposal_text, timestamp FROM proposals WHERE meeting_id = ? ORDER BY timestamp DESC", (current_meeting['id'],))
    proposals = cursor.fetchall()
    
    proposals_list = [dict(row) for row in proposals] 
    
    return jsonify({"proposals": proposals_list}), 200

@app.route('/reset_session', methods=['POST'])
def reset_session():
    """清除當前會議的所有提案並關閉會議 (用於開始新一輪腦力激盪)。"""
    try:
        db = get_db()
        db.execute("UPDATE meetings SET status = 0 WHERE status = 1") # 關閉當前會議
        db.execute("DELETE FROM proposals") # 清除所有提案
        db.commit()
        
        # 重置緩存
        global last_analysis_result, last_analysis_timestamp
        last_analysis_result = "尚未執行分析。"
        last_analysis_timestamp = 0 
        
        return jsonify({"success": True, "message": "會議已結束並清除，請發起人開始新會議。"}), 200
    except Exception as e:
        return jsonify({"success": False, "message": f"清除提案失敗: {e}"}), 500


if __name__ == '__main__':
    init_db()
    app.run(debug=True)