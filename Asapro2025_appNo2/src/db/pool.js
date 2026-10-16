import pg from 'pg';
const { Pool } = pg;

// 環境変数を使って接続プールを作成
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // SupabaseはSSL通信が必須です
  ssl: { rejectUnauthorized: false } 
});

// 接続テスト
pool.connect((err, client, release) => {
  if (err) {
    return console.error('DB接続エラー:', err.stack);
  }
  console.log('PostgreSQLに正常に接続されました (Pool)');
  client.release(); // すぐに接続をプールに戻す
});

// 他のファイルからDB操作ができるように、query関数をエクスポート
export const query = (text, params) => pool.query(text, params);
export default { query };