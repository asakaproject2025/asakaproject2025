const { Pool } = require('pg');

// 環境変数を使って接続プールを作成
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  // Renderにデプロイする際は、SSL接続が必要になる場合があります
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
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
module.exports = {
  query: (text, params) => pool.query(text, params),
};