const db = require('../src/database');

async function checkKey() {
  await db.initDb();
  const dbObj = db.getDb();
  try {
    const res = db.queryAll("SELECT * FROM settings WHERE key LIKE '%gemini%' OR key LIKE '%api%'");
    console.log("Settings rows:", res);
  } catch(e) {
    console.log("Error querying settings:", e.message);
  }
}

checkKey();
