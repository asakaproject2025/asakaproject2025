import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import 'dotenv/config';// DBのコンフィグへアクセス
import db from './src/db/pool.js'; // DBプールをインポート
import authMiddleware from './src/middleware/auth.js' //認証APIのインポート

import admin from 'firebase-admin';
import { read } from "fs";

const app = express();
const PORT = 3000;

// ESM対応とデータディレクトリのパス設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "data");

// 1. JSON ボディパーサーを有効化（POSTリクエストで送られたJSONデータを受け取るため）
app.use(express.json());

// 静的ファイル提供（HTMLやJSなど）
app.use(express.static(path.join(__dirname, "public")));

// ヘルパー関数: JSONファイルを「同期的」に読み込む
function readJsonFile(filename) {
    try {
        const filePath = path.join(dataDir, filename);
        // ★ readFileSync (Sync = 同期) を使う
        const data = fs.readFileSync(filePath, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error.message);
        return filename.includes("comments") ? [] : {};
    }
}

// ヘルパー関数: JSONファイルにデータを書き込む
async function writeJsonFile(filename, data) {
    try {
        const filePath = path.join(dataDir, filename);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
        console.error(`Error writing to ${filename}:`, error.message);
    }
}

// === JSONファイル読み込み (同期版) ===

// 1. 現在のファイルのディレクトリパスを安全に取得
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// 2. serviceAccountKey.json へのパスを構築
// 本番環境 (Render) かどうかを判定
const isProduction = process.env.NODE_ENV === 'production';

// パスを切り替える
const serviceAccountPath = isProduction
    ? '/etc/secrets/serviceAccountKey.json'        // 本番: Renderの指定場所
    : path.join(_dirname, 'serviceAccountKey.json'); // ローカル: プロジェクト内
// 3. ファイルを「同期的に」読み込む (readFileSync)
const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');

// 4. 読み込んだ文字列をJSONオブジェクトに変換
const serviceAccount = JSON.parse(serviceAccountRaw);

// === 秘密鍵の引き渡しとfirebaseの初期化 ===
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

// API 
/*前のjsonファイル参照
app.get("/api/classrooms", async (req, res) => {
    const classrooms = await readJsonFile("classrooms.json");
    res.json(classrooms);
});

app.get("/api/classrooms/:id", async (req, res) => {
    const classrooms = await readJsonFile("classrooms.json");
    const room = classrooms.find(r => r.id === Number(req.params.id));
    if (!room) return res.status(404).json({ error: "Not found" });
    res.json(room);
});
*/

app.get("/api/classrooms", async (req, res) => {
    try {
        // DBの classrooms テーブルから全データを取得
        // 
        const sql = `
            SELECT * FROM classrooms
            ORDER BY
                -- ★ 1. 号館ソート (前回と同じ)
                CAST(REPLACE(building, '号館', '') AS INTEGER) ASC,
                
                -- ★ 2. 教室名ソート (ここからが新しい)
                
                -- 2a. まず「数字グループ(1)」か「文字グループ(2)」かに分ける
                CASE 
                    WHEN name ~ '^[0-9]' THEN 1
                    ELSE 2
                END ASC,
                
                -- 2b. 「数字グループ」の中でのソート
                -- (先頭の数字を抜き出して、数値として並べる)
                CASE 
                    WHEN name ~ '^[0-9]' THEN CAST(substring(name from '^[0-9]+') AS INTEGER)
                    ELSE NULL 
                END ASC,
                
                -- 2c. 「文字グループ」の中でのソート
                -- (そのまま辞書順で並べる)
                CASE 
                    WHEN name ~ '^[0-9]' THEN NULL 
                    ELSE name
                END ASC;
        `;
        const { rows } = await db.query(sql);

        // ★ 以前と同じように、JSONの配列(rows)をそのまま返す
        // (app.js は 'classrooms' という変数名で受け取る想定)
        res.json(rows);

    } catch (err) {
        console.error('APIエラー (GET /api/classrooms):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

app.get("/api/classrooms/:id", async (req, res) => {
    try {
        const { id } = req.params; // URLから :id を取得

        const sql = "SELECT * FROM classrooms WHERE id = $1;";
        const params = [id];

        const { rows } = await db.query(sql, params);

        // 
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Classroom not found' });
        }

        // ★ 以前と同じように、単一のオブジェクト(rows[0])を返す
        // (app.js は 'room' という変数名で受け取る想定)
        res.json(rows[0]);

    } catch (err) {
        console.error(`APIエラー (GET /api/classrooms/${req.params.id}):`, err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});


// GET: 全投票データを取得
app.get("/api/votes", authMiddleware, async (req, res) => {
    try {
        // URLクエリパラメータから変数を取得 
        const { roomId, day, periodId } = req.query;

        // (※認証実装前のテスト用: 'user_firebase_uid_abc123' などを入れるか、nullのままにする)
        const currentUserId = req.currentUserId;
        //const currentUserId = 12;

        // 必要なパラメータが渡されたかチェック
        if (!roomId || !day || !periodId) {
            return res.status(400).json({
                success: false,
                message: "roomId, day, periodId のクエリパラメータが必要です。"
            });
        }
        // SQL (CTEを使って2つの情報を同時に取得)
        const sql = `
            WITH aggregated_counts AS (
                -- (A) まず、指定された時間枠の全投票を集計
                SELECT
                    COUNT(*) FILTER (WHERE has_class = true) AS class_count,
                    COUNT(*) FILTER (WHERE has_class = false) AS free_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'garagara') AS garagara_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'sukuname') AS sukuname_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'hutsu') AS hutsu_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'konzatsu') AS konzatsu_count
                FROM
                    user_submissions
                WHERE
                    classroom_id = $1
                    AND time_slot_day = $2
                    AND time_slot_period = $3
            ),
            my_vote AS (
                -- (B) 次に、同じ時間枠に対する「私」の投票を探す
                SELECT
                    CASE
                        WHEN has_class = true THEN 'class'
                        WHEN has_class = false THEN 'free'
                        ELSE congestion_level -- 'garagara', 'sukuname', 'hutsu', 'konzatsu', or NULL
                    END AS type
                FROM
                    user_submissions
                WHERE
                    classroom_id = $1
                    AND time_slot_day = $2
                    AND time_slot_period = $3
                    AND user_id = $4 -- 「私」のID
            )
            -- (C) 2つの結果を結合して返す
            SELECT
                (SELECT type FROM my_vote) AS my_vote_type, -- 私の投票（"class", "free", ... or NULL）
                ac.* -- 集計結果 (class_count, free_count, ...)
            FROM
                aggregated_counts ac;
        `;
        const params = [roomId, day, periodId, currentUserId];
        const { rows } = await db.query(sql, params);

        // 4. クライアントに最新データを返す
        res.json({ success: true, votes: rows[0] });
    } catch (err) {
        console.error('APIエラー (GET /vote):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

/// GET: 全コメントデータを取得 (いいね情報付き)
app.get("/api/comments", authMiddleware, async (req, res) => {

    // 1. (将来のFirebase認証用) 
    // ログインしていなければ req.user は undefined => currentUserId は null になる
    const currentUserId = req.user ? req.currentUserId : null;

    // (※認証実装前のテスト用: 'user_firebase_uid_abc123' などを入れるか、nullのままにする)
    //const currentUserId = 12;

    try {
        // 2. SQL文をJOINとサブクエリを含むものに変更
        const sql = `
            SELECT 
                c.id, c.content, c.classroom_id, c.time_slot_day, c.time_slot_period, c.created_at,
                
                -- (A) このコメントの総いいね数をカウントし、'likes' カラムとして追加
                (SELECT COUNT(*) FROM comment_likes cl_count WHERE cl_count.comment_id = c.id) AS likes,
                
                -- (B) 「私」がいいねしているかをチェックし、'is_liked_by_me' カラムとして追加
                CASE 
                    WHEN cl.user_id IS NOT NULL THEN true 
                    ELSE false 
                END AS is_liked_by_me
                
            FROM 
                comments c
                
            -- (C) 「私」( $1 ) のいいね記録だけを LEFT JOIN で横付け
            LEFT JOIN 
                comment_likes cl 
            ON 
                c.id = cl.comment_id 
            AND 
                cl.user_id = $1 -- $1 に currentUserId が入る
                
            ORDER BY 
                c.created_at DESC;
        `;

        // 3. queryの第2引数に [currentUserId] を渡す
        const { rows } = await db.query(sql, [currentUserId]);

        // 4. フロントエンドには 'likes' と 'is_liked_by_me' が追加されたデータが返る
        res.json({ success: true, comments: rows });

    } catch (err) {
        console.error('APIエラー (GET /comments):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

app.post("/api/comments", authMiddleware, async (req, res) => {
    // クライアントから送信されるコメントデータを受け取る
    const { roomId, text, periodId, day } = req.body; // ★ day を追加 ★

    // ★ user_id はFirebase実装まで固定値（12）
    const userId = req.currentUserId;
    //const userId = 12;

    // 1. 必須項目チェック
    if (!roomId || !text || !periodId || !day) { // ★ day を必須チェックに追加 ★
        return res.status(400).json({ error: "roomId, text, periodId, and day are required." });
    }

    try {
        // 2. DBに保存 (RETURNING * で保存した行の全情報を返す)
        const sql = `
      INSERT INTO comments (content, user_id, classroom_id, time_slot_day, time_slot_period) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `;
        // $1, $2, $3, $4 に対応する値を配列で渡す
        const params = [text, userId, roomId, day, periodId];

        const { rows } = await db.query(sql, params);

        // 3. 保存成功をクライアントに通知 (HTTPステータス 201 = Created)
        res.status(201).json({ success: true, newComment: rows[0] });

    } catch (err) {
        console.error('APIエラー (POST /comments):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

app.post("/api/votes", authMiddleware, async (req, res) => {

    // (A) ユーザーIDとリクエストボディを取得
    const currentUserId = req.currentUserId;
    const { type, roomId, day, periodId } = req.body;

    // (B) バリデーション
    const validVoteTypes = ["class", "free", "garagara", "sukuname", "hutsu", "konzatsu"];
    if (!validVoteTypes.includes(type) || !roomId || !day || !periodId) {
        return res.status(400).json({ error: "Invalid request parameters." });
    }

    try {
        // --- ★ ステップ 1: ユーザーの「現在の投票」を検索 ★ ---
        const sqlFind = `
            SELECT 
                CASE
                    WHEN has_class = true THEN 'class'
                    WHEN has_class = false THEN 'free'
                    ELSE congestion_level
                END AS current_type
            FROM user_submissions
            WHERE user_id = $1
              AND classroom_id = $2
              AND time_slot_day = $3
              AND time_slot_period = $4;
        `;
        const findParams = [currentUserId, roomId, day, periodId];
        const findResult = await db.query(sqlFind, findParams);

        const currentVoteRow = findResult.rows[0];
        // 存在すれば "class" や "garagara"、なければ null
        const currentType = currentVoteRow ? currentVoteRow.current_type : null;

        // --- ★ ステップ 2: 実行するアクションを決定 ★ ---
        if (currentType === type) {

            // --- アクション: DELETE (取り消し) ---
            // 押されたボタンが現在の投票と同じなので、投票を取り消す
            console.log(`投票取り消し: User ${currentUserId}, Slot ${roomId}-${day}-${periodId}`);
            const sqlDelete = `
                DELETE FROM user_submissions
                WHERE user_id = $1
                  AND classroom_id = $2
                  AND time_slot_day = $3
                  AND time_slot_period = $4;
            `;
            // (findParams と同じパラメータで削除)
            await db.query(sqlDelete, findParams);

        } else {

            // --- アクション: UPSERT (新規作成 または 変更) ---
            // 押されたボタンが違う、または新規投票
            console.log(`投票UPSERT: User ${currentUserId}, New Type ${type}`);

            // (C) DBに保存する値を準備
            let hasClass = null;
            let congestionLevel = null;
            if (type === "class") hasClass = true;
            else if (type === "free") hasClass = false;
            else congestionLevel = type;

            // (あなたの既存のUPSERTロジックをそのまま使用)
            const sqlUpsert = `
                INSERT INTO user_submissions (user_id, classroom_id, time_slot_day, time_slot_period, has_class, congestion_level, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (user_id, classroom_id, time_slot_day, time_slot_period) 
                DO UPDATE SET 
                    has_class = CASE 
                        WHEN EXCLUDED.has_class IS NOT NULL THEN EXCLUDED.has_class 
                        ELSE user_submissions.has_class 
                    END,
                    congestion_level = CASE 
                        WHEN EXCLUDED.congestion_level IS NOT NULL THEN EXCLUDED.congestion_level 
                        ELSE user_submissions.congestion_level 
                    END,
                    created_at = NOW(); -- 投票日時を更新
            `;
            const paramsUpsert = [currentUserId, roomId, day, periodId, hasClass, congestionLevel];
            await db.query(sqlUpsert, paramsUpsert);
        }

        // --- ★ ステップ 3: (DELETEまたはUPSERT後の)最新の集計結果を取得 ★ ---
        // (あなたの既存の集計SQLをそのまま使用)
        const sqlCounts = `
            WITH aggregated_counts AS (
                SELECT
                    COUNT(*) FILTER (WHERE has_class = true) AS class_count,
                    COUNT(*) FILTER (WHERE has_class = false) AS free_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'garagara') AS garagara_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'sukuname') AS sukuname_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'hutsu') AS hutsu_count,
                    COUNT(*) FILTER (WHERE congestion_level = 'konzatsu') AS konzatsu_count
                FROM
                    user_submissions
                WHERE
                    classroom_id = $2
                    AND time_slot_day = $3
                    AND time_slot_period = $4
            ),
            my_vote AS (
                SELECT
                    CASE
                        WHEN has_class = true THEN 'class'
                        WHEN has_class = false THEN 'free'
                        ELSE congestion_level
                    END AS type
                FROM
                    user_submissions
                WHERE
                    user_id = $1 -- 「私」のID
                    AND time_slot_day = $3
                    AND time_slot_period = $4
                    AND classroom_id = $2
            )
            SELECT
                (SELECT type FROM my_vote) AS my_vote_type,
                ac.*
            FROM
                aggregated_counts ac;
        `;

        // (findParams と同じパラメータを使用)
        const { rows } = await db.query(sqlCounts, findParams);

        // --- ★ ステップ 4: クライアントに最新データを返す ★ ---
        res.json({ success: true, voteRes: rows[0] });

    } catch (err) {
        // (ネストされていた try-catch を統合し、エラーログのタイポを修正)
        console.error('APIエラー (POST /votes):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

// POST: いいねを記録・更新
app.post("/api/comments/:id/like", authMiddleware, async (req, res) => {
    // URLパスからコメントIDを取得
    const commentId = Number(req.params.id);

    if (isNaN(commentId)) {
        return res.status(400).json({ error: "Invalid comment ID." });
    }

    // ★ user_id はFirebase実装まで固定値（12）
    const currentUserId = req.currentUserId;
    //const currentUserId = 12;; // 動作テスト用の仮ID

    if (!currentUserId) {
        return res.status(401).json({ success: false, message: '認証が必要です' });
    }

    try {
        // --- トグルロジック ---

        // 1. まず INSERT を試みる (ON CONFLICT を指定)
        // (user_id, comment_id) の組み合わせが競合(CONFLICT)したら、
        // DO NOTHING (何もしない)
        const insertQuery = `
            INSERT INTO comment_likes (user_id, comment_id)
            VALUES ($1, $2)
            ON CONFLICT (user_id, comment_id) 
            DO NOTHING;
        `;
        const insertResult = await db.query(insertQuery, [currentUserId, commentId]);

        let liked = true; // デフォルトは「いいねした」

        // 2. INSERT の結果を判定
        if (insertResult.rowCount === 0) {
            // rowCount が 0 ＝ INSERTされなかった (競合した)
            // ＝ すでに「いいね」していた
            // ＝ これから「いいねを取り消す (DELETE)」

            const deleteQuery = `
                DELETE FROM comment_likes 
                WHERE user_id = $1 AND comment_id = $2;
            `;
            await db.query(deleteQuery, [currentUserId, commentId]);
            liked = false; // 状態は「いいね解除」
        }

        // 3. 最新のいいね総数を取得
        const countResult = await db.query(
            'SELECT COUNT(*) FROM comment_likes WHERE comment_id = $1',
            [commentId]
        );
        const newLikeCount = parseInt(countResult.rows[0].count, 10);

        // 4. クライアントに最新の状態を返す
        res.json({
            success: true,
            liked: liked, // あなたが今いいねしたか (true/false)
            newLikeCount: newLikeCount // 最新の総いいね数
        });

    } catch (error) {
        console.error("Failed to process like request:", error);
        res.status(500).json({ error: "Failed to update like count." });
    }
});

/**
 * POST /api/auth/sync
 * Firebase UID と Email を受け取り、DBのユーザーを検索または作成する (UPSERT)
 * 成功すると、DBのシリアルID (id) を含むユーザー情報を返す
 */
app.post('/api/auth/sync', async (req, res) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: '認証トークンが必要です' });
    }
    const idToken = authorization.split('Bearer ')[1];

    try {
        // トークンを検証し、信頼できる情報を取得
        // ここでFirebaseに問い合わせて「このトークンは本物か？」を確認します
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        // ★ ここで取り出した情報だけが信用できます
        const firebase_uid = decodedToken.uid;
        const email = decodedToken.email;

        // 2. 既存ユーザーを検索 (firebase_uid で)
        let userResult = await db.query('SELECT id, email FROM users WHERE firebase_uid = $1', [firebase_uid]);

        if (userResult.rows.length > 0) {
            // --- 既存ユーザーが見つかった場合 ---
            const existingUser = userResult.rows[0];
            console.log(`既存ユーザー ログイン: DB ID=${existingUser.id}`);

            // (オプション: emailが変更されていたら更新するロジックもここに入れられる)

            res.status(200).json({
                success: true,
                message: '既存ユーザー ログイン成功',
                user: {
                    id: existingUser.id, // ★ DBのシリアルID
                    email: existingUser.email
                }
            });

        } else {
            // --- 初回ログインの場合 (INSERT) ---
            console.log('初回ログイン。ユーザーを作成します...');
            const insertResult = await db.query(
                'INSERT INTO users (firebase_uid, email) VALUES ($1, $2) RETURNING id, email',
                [firebase_uid, email]
            );

            const newUser = insertResult.rows[0];
            console.log(`新規ユーザー 作成成功: DB ID=${newUser.id}`);

            res.status(201).json({
                success: true,
                message: '新規ユーザー 作成成功',
                user: {
                    id: newUser.id, // ★ DBのシリアルID
                    email: newUser.email
                }
            });
        }

    } catch (err) {
        // トークン検証エラーのハンドリング
        if (err.code && err.code.startsWith('auth/')) {
            console.error('トークン検証失敗:', err);
            return res.status(401).json({ success: false, message: '無効なトークンです' });
        }

        // DB系のエラーハンドリング
        if (err.code === '23505') { // unique_violation
            // 並列リクエストなどで稀にここに来る可能性があります
            console.error('重複エラー:', err.detail);
            return res.status(409).json({ success: false, message: 'ユーザー重複エラー' });
        }
        console.error('APIエラー (POST /auth/sync):', err.stack);
        res.status(500).json({ success: false, message: 'DBエラー' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});
