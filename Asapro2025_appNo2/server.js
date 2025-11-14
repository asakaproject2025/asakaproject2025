import express from "express";
import fs from "fs/promises"; // fs/promises を使用して非同期操作を簡略化
import path from "path";
import { fileURLToPath } from "url";

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

// ヘルパー関数: JSONファイルを読み込む
async function readJsonFile(filename) {
    try {
        const filePath = path.join(dataDir, filename);
        const data = await fs.readFile(filePath, "utf8");
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filename}:`, error.message);
        // ファイルが存在しない、または無効なJSONの場合は空のデータを返す
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

// API 

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

// GET: 全投票データを取得
app.get("/api/votes", async (req, res) => {
    const votes = await readJsonFile("votes.json");
    res.json(votes);
});

// GET: 全コメントデータを取得
app.get("/api/comments", async (req, res) => {
    const comments = await readJsonFile("comments.json");
    res.json(comments);
});

app.post("/api/comments", async (req, res) => {
    // クライアントから送信されるコメントデータを受け取る
    const { roomId, text, periodId, day, timestamp } = req.body; // ★ day を追加 ★

    // 1. 必須項目チェック
    if (!roomId || !text || !periodId || !day) { // ★ day を必須チェックに追加 ★
        return res.status(400).json({ error: "roomId, text, periodId, and day are required." });
    }

    // 2. 新しいコメントオブジェクトを作成
    const newComment = {
        id: Date.now(),
        roomId: String(roomId),
        text: text,
        periodId: String(periodId),
        day: String(day), // ★ 曜日の要素を追加 ★
        timestamp: timestamp || new Date().toISOString(),
    };

    // 3. 既存のコメントデータを読み込む
    let allComments = await readJsonFile("comments.json");

    // 4. 新しいコメントを追加
    // allCommentsは配列を想定
    if (!Array.isArray(allComments)) {
        allComments = []; // 読み込みエラーなどで配列でなかった場合、初期化
    }
    allComments.push(newComment);

    // 5. JSONファイルに書き込む（永続化）
    try {
        await writeJsonFile("comments.json", allComments);
        // 成功応答と、追加されたコメントデータをクライアントに返す
        res.status(201).json(newComment);
    } catch (error) {
        // ファイル書き込みエラーが発生した場合の適切なエラー処理
        console.error("Failed to write comment to file:", error);
        res.status(500).json({ error: "Failed to save comment on server." });
    }
});


// 投票 API 

// POST: 投票を記録・更新 (曜日/時限対応の新しいロジックに一本化)
app.post("/api/votes", async (req, res) => {
    // ★ クライアントから送信されるデータ: roomId, type, day, periodId を受け取る
    const { roomId, type, day, periodId } = req.body;

    // ★ 必須項目チェック: value はクライアントから送信されないため削除
    if (!roomId || !type || !day || !periodId) {
        return res.status(400).json({ error: "roomId, type, day, and periodId are required." });
        Ï
    }

    // ★ 投票タイプ（type）のバリデーション
    const validVoteTypes = ["class", "free", "garagara", "sukuname", "hutsu", "konzatsu"];
    if (!validVoteTypes.includes(type)) {
        return res.status(400).json({ error: "Invalid vote type." });
    }

    const allVotes = await readJsonFile("votes.json");
    const roomKey = String(roomId);

    // キーの準備 (例: "月曜", "1")
    const dayKey = String(day);
    const periodKey = String(periodId);

    // 1. 該当教室のデータが存在しない場合、初期化
    if (!allVotes[roomKey]) {
        allVotes[roomKey] = {};
    }

    // 2. 該当曜日のデータが存在しない場合、初期化
    if (!allVotes[roomKey][dayKey]) {
        allVotes[roomKey][dayKey] = {};
    }

    // 3. 該当時限の投票データが存在しない場合、初期化
    if (!allVotes[roomKey][dayKey][periodKey]) {
        allVotes[roomKey][dayKey][periodKey] = {
            class: 0, free: 0, garagara: 0, sukuname: 0, hutsu: 0, konzatsu: 0
        };
    }

    // 該当する投票タイプをインクリメント
    const periodVotes = allVotes[roomKey][dayKey][periodKey];
    // ここで投票タイプのバリデーションは既に上で済ませている
    periodVotes[type]++;

    await writeJsonFile("votes.json", allVotes);

    // クライアントが期待する形式 (該当時限の投票オブジェクト) で応答を返す
    res.json(periodVotes);
});

app.post("/api/comments/:id/like", async (req, res) => {
    // URLパスからコメントIDを取得
    const commentId = Number(req.params.id);

    if (isNaN(commentId)) {
        return res.status(400).json({ error: "Invalid comment ID." });
    }

    try {
        // 1. 全コメントデータを読み込む
        const allComments = await readJsonFile("comments.json");

        // 2. 該当コメントを見つける
        const commentIndex = allComments.findIndex(c => c.id === commentId);

        if (commentIndex === -1) {
            return res.status(404).json({ error: "Comment not found." });
        }

        const targetComment = allComments[commentIndex];

        // 3. いいね数をインクリメント
        // 'likes' プロパティが未定義の場合は 0 から開始
        targetComment.likes = (targetComment.likes || 0) + 1;

        // 4. JSONファイルに書き込む（永続化）
        await writeJsonFile("comments.json", allComments);

        // 5. 更新後のデータ（いいね数）を返す
        res.status(200).json({
            id: targetComment.id,
            likes: targetComment.likes
        });
    } catch (error) {
        console.error("Failed to process like request:", error);
        res.status(500).json({ error: "Failed to update like count." });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});