// scripts/init-db.js - 資料庫初始化腳本

const fs = require("fs");
const path = require("path");

/**
 * 預期的表結構定義（與 DB_scheme.sql 同步）
 */
const SCHEMA_DEFINITIONS = {
  users: {
    columns: {
      id: "uuid PRIMARY KEY DEFAULT uuid_generate_v4()",
      email: "TEXT UNIQUE",
      google_id: "VARCHAR(255) NOT NULL UNIQUE",
      google_access_token: "TEXT",
      google_refresh_token: "TEXT",
      picture: "TEXT",
      created_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
  },
  meetings: {
    columns: {
      id: "uuid PRIMARY KEY DEFAULT uuid_generate_v4()",
      invite_code: "VARCHAR(50) UNIQUE",
      title: "TEXT NOT NULL",
      date: "TIMESTAMPTZ",
      description: "TEXT",
      summary: "TEXT",
      expires_at: "TIMESTAMPTZ",
      calendar_event_id: "TEXT",
      status: "TEXT NOT NULL DEFAULT 'active'",
      created_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      updated_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      version: "INT NOT NULL DEFAULT 1",
    },
  },
  meeting_participants: {
    columns: {
      id: "BIGSERIAL PRIMARY KEY",
      meeting_id: "UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE",
      user_id: "UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE",
      role: "VARCHAR(20) NOT NULL DEFAULT 'participant'",
      joined_at: "TIMESTAMPTZ NOT NULL DEFAULT NOW()",
    },
  },
  agenda_items: {
    columns: {
      id: "BIGSERIAL PRIMARY KEY",
      meeting_id: "UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE",
      order_index: "INT NOT NULL",
      time: "VARCHAR(10)",
      title: "TEXT NOT NULL",
      owner: "TEXT",
      note: "TEXT",
    },
  },
};

/**
 * 檢查表是否存在
 */
async function tableExists(pool, tableName) {
  const result = await pool.query(
    `SELECT EXISTS(
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  return result.rows[0].exists;
}

/**
 * 取得表的所有欄位
 */
async function getTableColumns(pool, tableName) {
  const result = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows;
}

/**
 * 新增缺少的欄位
 */
async function addMissingColumns(pool, tableName, existingColumns, schemaColumns) {
  const existingNames = new Set(existingColumns.map((c) => c.column_name));
  const missingColumns = Object.entries(schemaColumns).filter(
    ([name]) => !existingNames.has(name)
  );

  if (missingColumns.length === 0) {
    console.log(`  └─ ${tableName}: 無缺少欄位`);
    return;
  }

  console.log(`  └─ ${tableName}: 偵測到 ${missingColumns.length} 個缺少的欄位`);

  for (const [colName, colDef] of missingColumns) {
    try {
      // 簡化處理：移除預設值、NOT NULL 等修飾符，只保留基本類型
      const baseDef = colDef.split("NOT NULL")[0].split("DEFAULT")[0].trim();
      await pool.query(
        `ALTER TABLE ${tableName} ADD COLUMN ${colName} ${baseDef}`
      );
      console.log(`     ✓ 新增欄位: ${tableName}.${colName}`);
    } catch (err) {
      console.warn(`     ✗ 無法新增欄位 ${tableName}.${colName}:`, err.message);
    }
  }
}

/**
 * 檢查並修復資料表結構
 */
async function migrateSchema(pool) {
  console.log("\n[DATABASE] 檢查並修復資料表結構...");

  for (const [tableName, tableDef] of Object.entries(SCHEMA_DEFINITIONS)) {
    const exists = await tableExists(pool, tableName);

    if (!exists) {
      console.log(`  ✗ 表不存在: ${tableName}`);
      return false; // 有表不存在，需要完全初始化
    }

    const existingColumns = await getTableColumns(pool, tableName);
    await addMissingColumns(pool, tableName, existingColumns, tableDef.columns);
  }

  console.log("[DATABASE] 結構檢查完成");
  return true;
}

async function initDatabase(pool) {
  try {
    console.log("\n[DATABASE] 開始資料庫初始化...");

    // 檢查必要的資料表
    const requiredTables = [
      "users",
      "meetings",
      "meeting_participants",
      "agenda_items",
    ];

    const { rows } = await pool.query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_name = ANY($1::text[])
       AND table_schema = 'public'`,
      [requiredTables]
    );

    const existingTables = rows.map((r) => r.table_name);

    if (existingTables.length === requiredTables.length) {
      console.log("[DATABASE] 資料表已存在，進行結構檢查與修復...");
      const migrationSuccess = await migrateSchema(pool);
      if (migrationSuccess) {
        console.log("[DATABASE] 初始化完成\n");
        return;
      }
      // 若結構檢查失敗，進行完全重建
    }

    console.log("[DATABASE] 建立資料表...");

    // 讀取 SQL schema
    const schemaPath = path.join(__dirname, "../../DB_scheme.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");

    // 執行 schema
    await pool.query(schema);

    console.log("[DATABASE] 資料表建立完成\n");
  } catch (error) {
    console.error("[DATABASE] 初始化失敗:", error.message);
    throw error;
  }
}

module.exports = initDatabase;
