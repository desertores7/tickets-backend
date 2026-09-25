const mysql = require('mysql2/promise');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const m = env.match(/DB_CONNECTION_DATA=(\{.*\})/);
const conn = JSON.parse(m[1]);

(async () => {
  const c = await mysql.createConnection({
    host: conn.host, port: conn.port, user: conn.username, password: conn.password, database: conn.database
  });
  const [migrations] = await c.query("SELECT * FROM migrations ORDER BY id DESC LIMIT 8");
  console.log("=== migrations table (last 8) ===");
  console.log(JSON.stringify(migrations, null, 2));
  await c.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
