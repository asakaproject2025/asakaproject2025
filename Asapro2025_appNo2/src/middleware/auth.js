// src/middleware/auth.js
import admin from 'firebase-admin';
import db from '../db/pool.js';

async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    // 1. トークンがない場合
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        req.currentUserId = null; // ゲストとして扱う
        return next(); // API本体へ（エラーにしない）
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        // 1. Firebase Admin SDK がトークンを検証
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        // 2. トークンから firebase_uid を取り出す
        const firebase_uid = decodedToken.uid;

        // 3. DBを検索して「シリアルID」を取得 (この処理は /api/auth/sync と似ている)
        const { rows } = await db.query('SELECT id FROM users WHERE firebase_uid = $1', [firebase_uid]);
        if (rows.length > 0) {
            // ★ ログインユーザーのIDを req に設定
            req.currentUserId = rows[0].id;
        } else {
            // トークンは本物だが、DBに同期されていない
            console.warn('DBにユーザーがいません:', error.code);
            req.currentUserId = null;
        }

        next(); // API本体へ

    } catch (error) {
        // トークンが無効（期限切れなど）
        console.warn('無効なトークン:', error.code);
        req.currentUserId = null; // ゲストとして扱う
        next(); // API本体へ
    }
}

export default authMiddleware;