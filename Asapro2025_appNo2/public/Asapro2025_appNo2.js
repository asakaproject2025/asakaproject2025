// Asapro2025_appNo2.js
// ==== Firebase imports ====
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
        getAuth,
        onAuthStateChanged,
        GoogleAuthProvider,
        signInWithPopup,
        signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

// ==== あなたの設定 ====
const firebaseConfig = {
        apiKey: "AIzaSyDcJnaN-uRFxemmowCo4L8JZF0I1xHimRw",
        authDomain: "emptyroomproject.firebaseapp.com",
        projectId: "emptyroomproject",
        storageBucket: "emptyroomproject.firebasestorage.app",
        messagingSenderId: "386806722360",
        appId: "1:386806722360:web:1594f6ed5f6fbcac73dbcd",
        measurementId: "G-6052RYFN8X"
};


// ==== 単一初期化 ====
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// ==== グローバル変数 ====
let currentUserId = null; // ★ DBのシリアルID (例: 1, 2, 3...) を保持する
let isLoggedIn = false;

// ==== 便利関数 ====
const $ = (sel) => document.querySelector(sel);
const showMsg = (el, text) => { if (el) el.textContent = text; };

// ==== ページ判定（← path を先に定義！）====
const path = location.pathname.replace(/\/+$/, "");
const isIndex = /(?:^|\/)(index\.html)?$/.test(path);  // ルート/ もOK
const isHome = /(?:^|\/)home\.html$/.test(path);

// ===== index.html 用（ログインページ）=====
const googleBtn = $('#googleBtn');
const googleMsg = $('#googleMsg');
const continueBtn = $('#continueBtn');          // 置いていなければ null のままでOK
const logoutBtnOnIndex = $('#logoutBtnOnIndex');// 同上

// if (googleBtn) {
//   const provider = new GoogleAuthProvider();
//   googleBtn.addEventListener('click', async () => {
//     try {
//       await signInWithPopup(auth, provider);
//       showMsg(googleMsg, 'Googleでログインしました。');      
//       const p = new URLSearchParams(location.search);
//       location.replace(p.get('next') || 'home.html');
//     } catch (err) {
//       showMsg(googleMsg, `Googleログイン失敗: ${err.code || err.message}`);
//     }
//   });
// }

if (googleBtn) {
        const provider = new GoogleAuthProvider();
        googleBtn.addEventListener('click', async () => {
                try {
                        const result = await signInWithPopup(auth, provider);
                        const user = result.user;

                        const email = user.email;
                        const uid = user.uid;

                        // 表示用
                        console.log('ログイン成功:', { email, uid });
                        showMsg(googleMsg, `Googleでログインしました。\nメール: ${email}\nUID: ${uid}`);

                        // ★★★ ここからDB連携を追加 ★★★
                        // 2. サーバーAPIにユーザー情報を送信 (UPSERT)
                        const idToken = await user.getIdToken();

                        const response = await fetch('/api/auth/sync', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${idToken}`},
                        });

                        const data = await response.json();

                        if (!data.success) {
                                throw new Error(data.message || 'DBとの同期に失敗しました');
                        }

                        // 3. APIから返された「DBのシリアルID」を保存
                        currentUserId = data.user.id;
                        localStorage.setItem('currentUserId', currentUserId); // ローカルストレージにも保存

                        console.log(`DB 同期成功: シリアルID (currentUserId) = ${currentUserId}`);
                        showMsg(googleMsg, `DB同期成功 (ID: ${currentUserId})。ホームに移動します...`);
                        // ★★★ DB連携ここまで ★★★

                        // 保存して別ページで確認もできる
                        localStorage.setItem('userEmail', email);
                        localStorage.setItem('userUid', uid);

                        const p = new URLSearchParams(location.search);
                        location.replace(p.get('next') || 'home.html');
                } catch (err) {
                        console.error(err);
                        showMsg(googleMsg, `Googleログイン失敗: ${err.code || err.message}`);
                }
        });
}


if (continueBtn) {
        continueBtn.addEventListener('click', () => location.replace('home.html'));
}

if (logoutBtnOnIndex) {
        logoutBtnOnIndex.addEventListener('click', async () => {
                await signOut(auth);
                location.reload();
        });
}

// ===== home.html 用（任意でログアウトボタン対応）=====
const emailOut = $('#userEmail');
const uidOut = $('#userUid');

const logoutBtn = $('#logoutBtn');
if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
                await signOut(auth);
                // ★ ログアウト時にDBのIDもクリア
                localStorage.removeItem('currentUserId');
                currentUserId = null;
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userUid');
                location.replace('index.html');
        });
}

// --- 自動遷移・状態監視 ---
onAuthStateChanged(auth, (user) => {

        // ★ ページ読み込み時にDBのIDを復元
        currentUserId = localStorage.getItem('currentUserId');

        if (user) {
                console.log(`ログイン中: ${user.email}`);
                isLoggedIn = true;
                if (googleMsg) {
                        googleMsg.textContent = `${user.displayName || user.email} でログイン中`;
                }
        } else {
                console.log("未ログイン");
                googleMsg.textContent = "ログアウト中";
                isLoggedIn = false;
                // ★ 未ログインならDBのIDも消去
                currentUserId = null;
                localStorage.removeItem('currentUserId');
        }

        //変更10/24
        if (isHome) {
                if (user) {
                        const email = user.email || localStorage.getItem('userEmail') || '';
                        const uid = user.uid || localStorage.getItem('userUid') || '';
                        if (emailOut) emailOut.textContent = `メールアドレス: ${email}`;
                        if (uidOut) uidOut.textContent = `UID: ${uid}`;
                } else {
                        // 未ログインなら index に戻す（next 付きで）
                        //location.replace('index.html?next=home.html');
                        //今回は非ログイン者でもみれるようにするので上のコードはコメントアウト
                }
        }
        //変更10/24ここまで


});

// 1. グローバル定数とヘルパー関数の定義 (DOMContentLoadedの外側)

const PERIOD_TIMES = [
        { id: 1, start: '09:00:00', end: '10:30:00' },
        { id: 2, start: '10:45:00', end: '12:15:00' },
        { id: "昼休み", start: '12:15:00', end: '13:05:00' },
        { id: 3, start: '13:05:00', end: '14:35:00' },
        { id: 4, start: '14:50:00', end: '16:20:00' },
        { id: 5, start: '16:35:00', end: '18:05:00' },
        { id: 6, start: '18:20:00', end: '19:50:00' },
];
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"]; // グローバル定数化

/**
 * 現在の時限ID、または次に開始する時限IDを返す。
 * 全ての授業が終わっている場合は最後の時限IDを返す。
 * @returns {{id: string, isCurrent: boolean}} 時限IDと現在時限かどうかの情報
 */
function getCurrentPeriodId() {
        const now = new Date();
        // 協定世界時（UTC）との時差を考慮せず、現地時間で計算
        const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

        let nextPeriodId = null;
        let nextPeriodStartTime = Infinity; // 次の時限開始時刻を保持 (秒)

        for (const period of PERIOD_TIMES) {
                const [hStart, mStart] = period.start.split(':').map(Number);
                const [hEnd, mEnd] = period.end.split(':').map(Number);
                const startTime = hStart * 3600 + mStart * 60;
                const endTime = hEnd * 3600 + mEnd * 60;

                // 1. 現在、授業時間内の場合
                if (currentTime >= startTime && currentTime < endTime) {
                        return {
                                id: String(period.id),
                                isCurrent: true
                        };
                }

                // 2. 次に開始する時限を探す
                // 授業開始時刻が現在の時刻よりも未来の場合に候補とする
                if (currentTime < startTime && startTime < nextPeriodStartTime) {
                        nextPeriodStartTime = startTime;
                        nextPeriodId = String(period.id);
                }
        }

        // 3. 次の時限が見つかった場合 (授業時間外だが、次に始まる時限がある)
        if (nextPeriodId) {
                return {
                        id: nextPeriodId,
                        isCurrent: false
                };
        }

        // 4. 全ての授業が終わっている場合（当日の最後の時限を返す）
        const lastPeriod = PERIOD_TIMES[PERIOD_TIMES.length - 1];
        return {
                id: String(lastPeriod.id),
                isCurrent: false
        };
}

/**
 * コメントのタイムスタンプが指定された時限内であるかを判定する。（曜日フィルタリングがあるので、この関数は時限フィルタリングにのみ使用）
 */
function isTimestampInPeriod(timestamp, periodId) {
        if (!periodId) return true;

        const period = PERIOD_TIMES.find(p => String(p.id) === String(periodId));
        if (!period) return true; // 定義されていない時限IDは無視

        const commentTime = new Date(timestamp);
        const dateStr = commentTime.toISOString().split('T')[0];

        // Local Time (JST)として比較
        // ★ タイムゾーンの問題を避けるため、日時と時刻を結合するロジックは注意が必要
        // タイムスタンプがISO形式なら、サーバーで生成したタイムスタンプがJSTなら問題ない
        const startTime = new Date(`${dateStr}T${period.start}`);
        const endTime = new Date(`${dateStr}T${period.end}`);

        return commentTime >= startTime && commentTime < endTime;
}

// ヘッダー要素の更新関数 (グローバルスコープで定義)
function setHeaderPeriod(text) {
        const headerElement = document.getElementById("header-period");
        if (headerElement) {
                headerElement.textContent = text;
        }
}

// ======= 現在時限表示 ヘルパー関数 (ヘッダー表示とデータ取得用IDを返す) =======

function getPeriod() {
        const now = new Date();
        // 修正: グローバル定数 WEEKDAYS を使用
        const dayLabel = WEEKDAYS[now.getDay()];

        const periodInfo = getCurrentPeriodId();
        const periodId = periodInfo.id;

        // 修正: 時間外でも特別な表示はしない。単に時限のみを表示する。
        const periodText = (periodId === '昼休み') ? "昼休み" : `${periodId}限`;

        // 修正: 曜日名も省略しない（「水曜」のようにする）
        return {
                headerText: `${dayLabel}曜 ${periodText}`, // ヘッダーに表示するテキスト
                day: dayLabel, // フィルタ/データ処理に使用する今日の曜日
                periodId: periodId // フィルター/データ処理に使用する時限ID
        };
}

/**
 * いいねボタンクリック時の処理。APIを呼び出し、いいね数を更新する。
 */
async function handleLikeClick(event) {
        const button = event.currentTarget;
        const commentId = button.dataset.commentId;

        if (!commentId) return;

        try {
                const fetchOptions = {
                        method: "POST",
                        headers: { "Content-Type": "application/json" } // まず空のヘッダーを用意
                };

                // 1. 現在のユーザーを取得
                // ★ 1. まずユーザーをチェック
                const user = auth.currentUser;
                if (!user) {
                        alert('いいねをするにはログインが必要です。');
                        return; // ★ ユーザーがいなければここで中断
                }

                let idToken;
                try {
                        // ★ 2. IDトークン（身分証明書）を取得
                        idToken = await user.getIdToken();
                } catch (err) {
                        console.error('トークン取得エラー:', err);
                        alert('認証情報の取得に失敗しました。再ログインしてください。');
                        return; // ★ トークンが取れなければここで中断
                }

                if (user) {
                        // 2. ログイン中なら、IDトークンを取得してヘッダーに追加
                        try {
                                const idToken = await user.getIdToken();
                                fetchOptions.headers['Authorization'] = `Bearer ${idToken}`;
                        } catch (err) {
                                console.error('トークン取得エラー:', err);
                                // (トークンが取れなくても、ゲストとしてリクエストは続行)
                        }
                }
                const response = await fetch(`/api/comments/${commentId}/like`, fetchOptions);

                if (response.ok) {
                        // サーバーからの応答JSONには更新後のいいね数が含まれていると想定
                        const updatedData = await response.json();

                        // ★ 即時更新の肝：DOMを直接操作する ★
                        const likeCountElement = document.getElementById(`like-count-${commentId}`);

                        if (likeCountElement) {
                                // 返ってきた新しいいいね数に数字を更新
                                likeCountElement.textContent = updatedData.newLikeCount;
                        }

                        // 3. サーバーの応答に基づいてUIを更新する
                        updateLikeUI(button, updatedData.liked, updatedData.newLikeCount);
                        // (オプション) 一度いいねしたらボタンを無効化しても良い
                        //button.classList.add('liked');
                        //button.disabled = true;

                } else {
                        alert("いいねの送信に失敗しました。");
                        console.error("サーバー応答エラー:", await response.text());
                }
        } catch (e) {
                console.error("いいね処理中にエラーが発生しました:", e);
                alert("ネットワークエラーによりいいねできませんでした。");
        }
        // UIを更新する専用の関数
        function updateLikeUI(button, isLiked, newCount) {
                // ボタンの色を更新
                if (isLiked) {
                        button.classList.add('liked');
                } else {
                        button.classList.remove('liked');
                }

                // いいね数を更新
                const countElement = document.getElementById(`like-count-${button.dataset.commentId}`);
                if (countElement) {
                        countElement.textContent = newCount;
                }
        }
}

// 2. DOMContentLoaded イベントリスナーの開始

document.addEventListener("DOMContentLoaded", async function () {

        const themeButtons = document.querySelectorAll('.theme-btn');
        const closeImages = document.querySelectorAll('.logo_close'); // すべての閉じるボタン画像を取得
        const modal = document.getElementById("roomModal");

        // テーマごとの閉じるボタン画像パス
        const closeBtnImages = {
                red: 'images/close-red.png',
                pink: 'images/close-pink.png',
                orange: 'images/close-orange.png',
                yellow: 'images/close-yellow.png',
                lightgreen: 'images/close-lightgreen.png',
                green: 'images/close-green.png',
                skyblue: 'images/close-skyblue.png',
                blue: 'images/close-blue.png',
                purple: 'images/close-purple.png',
                beige: 'images/close-beige.png',
                brown: 'images/close-brown.png',
                gray: 'images/close-gray.png',
                black: 'images/close-black.png',
                default: 'images/close.png'
        };

        // ✅ テーマ適用用関数
        function applyTheme(theme) {
                const body = document.body;

                // 1. 保存用にテーマ名をLocalStorageに保存（これは維持）
                localStorage.setItem('theme', theme);

                // 2. 現在適用されている全てのテーマクラスを削除

                // 現在のbodyのクラスリストを取得し、'theme-' で始まるものを全て削除
                body.className = body.className.split(' ')
                        .filter(c => !c.startsWith('theme-'))
                        .join(' ');

                // 3. 新しいテーマクラスを適用
                body.classList.add(`theme-${theme}`); // ★重要: CSSクラスを適用する

                // ... (以下の閉じるボタン画像とラジオボタンの処理は続きます) ...

                closeImages.forEach(img => {

                        img.src = closeBtnImages[theme] || closeBtnImages.default;

                });

                // ✅ ラジオボタンのチェック状態を更新

                themeButtons.forEach(btn => {

                        btn.checked = (btn.getAttribute('data-theme') === theme);

                });

                // すべての閉じるボタン画像をテーマに合わせて変更
                closeImages.forEach(img => { /* ... */ });

                // ラジオボタンのチェック状態を更新
                themeButtons.forEach(btn => { /* ... */ });
        }

        // ✅ テーマボタンクリック処理
        themeButtons.forEach(button => {
                button.addEventListener('click', () => {
                        const theme = button.getAttribute('data-theme');
                        applyTheme(theme);
                });
        });

        // ✅ ページ読み込み時に前回のテーマを復元
        const savedTheme = localStorage.getItem('theme') || 'normal'; // 'default'ではなく'normal'を初期値に
        applyTheme(savedTheme);

        // ページ管理
        const homePage = document.getElementById("homePage");
        const mypagePage = document.getElementById("mypagePage");
        const subPages = document.querySelectorAll(".sub-page");

        // ---- ハンバーガーメニュー処理 ----
        document.querySelectorAll(".hamb").forEach(hamb => {
                const blackBg = hamb.parentElement.querySelector(".black-bg");

                hamb.addEventListener("click", () => {
                        hamb.classList.toggle("active");
                        blackBg.classList.toggle("open");
                });

                // 背景クリック時：背景の外側のみ反応
                document.addEventListener("click", (e) => {
                        // クリック位置がblack-bgでもhambでもないなら閉じる
                        if (!blackBg.contains(e.target) && !hamb.contains(e.target)) {
                                hamb.classList.remove("active");
                                blackBg.classList.remove("open");
                        }
                });
        });

        // ---- メニュー内の各ボタン ----
        function showSubpage(id) {
                // すべてのページを非表示にする
                document.querySelectorAll(".page, .sub-page").forEach(p => {
                        p.classList.remove("active");
                });

                // 指定されたページだけ表示
                document.getElementById(id).classList.add("active");

                // メニューを閉じる
                document.querySelectorAll(".hamb").forEach(h => h.classList.remove("active"));
                document.querySelectorAll(".black-bg").forEach(bg => bg.classList.remove("open"));
        }


        // 各メニュー項目
        document.querySelectorAll(".menuTheme").forEach(btn => {
                btn.addEventListener("click", () => showSubpage("themePage"));
        });
        document.querySelectorAll(".menuContact").forEach(btn => {
                btn.addEventListener("click", () => showSubpage("contactPage"));
        });
        document.querySelectorAll(".menuTerms").forEach(btn => {
                btn.addEventListener("click", () => showSubpage("termsPage"));
        });

        // ---- ホーム／マイページ移動 ----
        document.querySelectorAll(".openMypage").forEach(btn => {
                btn.addEventListener("click", () => showSubpage("mypagePage"));
        });
        document.querySelectorAll(".backHome").forEach(btn => {
                btn.addEventListener("click", () => showSubpage("homePage"));
        });

        if (openFilter && filterModal) { // 要素が取得できたか確認
                openFilter.addEventListener("click", () => filterModal.style.display = "flex");
        }
        if (closeFilter && filterModal) {
                closeFilter.addEventListener("click", () => filterModal.style.display = "none");
        }

        // ======= 教室リストの動的生成 =======
        const buildingList = document.querySelector(".building-list");
        const res = await fetch("/api/classrooms");
        const classrooms = await res.json();

        const grouped = classrooms.reduce((acc, room) => {
                if (!acc[room.building]) acc[room.building] = [];
                acc[room.building].push(room);
                return acc;
        }, {});

        for (const [building, rooms] of Object.entries(grouped)) {
                // 1. 建物全体を包むコンテナを作成
                const buildingContainer = document.createElement("div");
                buildingContainer.className = "building-container";
                buildingContainer.dataset.building = building;
                buildingList.appendChild(buildingContainer);


                const buildingBtn = document.createElement("button");
                buildingBtn.className = "building-item";
                buildingBtn.dataset.target = `building-${building}`;
                buildingBtn.innerHTML = `${building} <span class="arrow">▼</span>`;
                // buildingContainer に追加
                buildingContainer.appendChild(buildingBtn);

                const detailDiv = document.createElement("div");
                detailDiv.className = "building-detail";
                detailDiv.id = `building-${building}`;
                // buildingContainer に追加
                buildingContainer.appendChild(detailDiv);

                const roomsDiv = document.createElement("div");
                roomsDiv.className = "rooms";
                detailDiv.appendChild(roomsDiv);

                rooms.forEach(room => {
                        const btn = document.createElement("button");
                        btn.className = `room ${room.status === "空き" ? "blue" : "red"}`;
                        btn.textContent = room.name;

                        // フィルター用データ属性とroomDataの埋め込み
                        btn.dataset.roomId = room.id;
                        btn.dataset.building = room.building;
                        btn.dataset.status = room.status;
                        btn.dataset.tags = (room.tags || []).join(',');
                        btn.roomData = room; // 教室オブジェクト全体を要素に保持

                        btn.addEventListener("click", () => openRoomModal(room));
                        roomsDiv.appendChild(btn);
                });

                //  アコーディオンクリック処理
                buildingBtn.addEventListener("click", () => {
                        const arrow = buildingBtn.querySelector(".arrow");
                        const isOpen = detailDiv.classList.contains("open");

                        // 他のすべてのアコーディオンを閉じる
                        document.querySelectorAll(".building-detail").forEach(div => {
                                div.classList.remove("open");
                                div.style.maxHeight = null;
                                div.style.opacity = 0;
                        });
                        document.querySelectorAll(".arrow").forEach(a => a.textContent = "▼");

                        if (!isOpen) {
                                detailDiv.classList.add("open");
                                detailDiv.style.maxHeight = detailDiv.scrollHeight + "px";
                                detailDiv.style.opacity = 1;
                                arrow.textContent = "▲";
                                // スクロールターゲットを buildingContainer に変更
                                setTimeout(() => buildingContainer.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
                        }
                });
        } // forループの閉じ括弧

        // ======= モーダル制御 =======
        const closeModal = document.getElementById("closeModal");

        function openRoomModal(room) {
                document.getElementById("modal-room-name").textContent = room.name;
                document.getElementById("modal-capacity").textContent = room.capacity ?? "不明";
                document.getElementById("modal-status").textContent = room.status;
                document.getElementById("modal-tags").textContent = (room.tags || []).join("・");
                document.getElementById("modal-room-photo").src = room.image_url || "noimage.png";

                modal.style.display = "flex";
                modal.dataset.roomId = room.id; // 教室IDをデータ属性に保存

                initModalTabs(modal);
                loadRoomData(room.id);
        }
        closeModal.addEventListener("click", () => {
                modal.style.display = "none";
        });

        function initModalTabs(modalElement) {
                const tabContainers = modalElement.querySelectorAll(".tabs > div");
                const panels = modalElement.querySelectorAll(".tab-panel");

                tabContainers.forEach(c => c.classList.remove("active"));
                panels.forEach(p => p.classList.remove("active"));
                // 初期状態は教室情報タブをアクティブにする
                modalElement.querySelector(".tab-1")?.classList.add("active");
                modalElement.querySelector("#panel-info")?.classList.add("active");


                tabContainers.forEach(container => {
                        const button = container.querySelector("button");
                        button.addEventListener("click", () => {
                                tabContainers.forEach(c => c.classList.remove("active"));
                                panels.forEach(p => p.classList.remove("active"));

                                container.classList.add("active");
                                const targetPanel = modalElement.querySelector(`#${button.dataset.target}`);
                                if (targetPanel) targetPanel.classList.add("active");
                        });
                });
        }

        // 追加ヘルパー関数 (displayVotes/Comments)

        function displayVotes(votes) {
                document.getElementById("countClass").textContent = votes.votes.class_count ?? 0;
                document.getElementById("countFree").textContent = votes.votes.free_count ?? 0;
                document.getElementById("countGaragara").textContent = votes.votes.garagara_count ?? 0;
                document.getElementById("countSukuname").textContent = votes.votes.sukuname_count ?? 0;
                document.getElementById("countHutsu").textContent = votes.votes.hutsu_count ?? 0;
                document.getElementById("countKonzatsu").textContent = votes.votes.konzatsu_count ?? 0;
        }

        function displayComments(comments, commentListElement) {
                commentListElement.innerHTML = "";

                comments.forEach(comment => {
                        // --- ここから安全なDOM構築 ---
                        // 1. 各要素を .createElement で作成
                        const item = document.createElement("div");
                        item.className = "comment-item";

                        const contentDiv = document.createElement("div");
                        contentDiv.className = "comment-content";

                        const textDiv = document.createElement("div");
                        textDiv.className = "comment-text";

                        // ★ 2. .textContent を使って安全にテキストを挿入 ★
                        // これにより、<script> タグはただの文字列として表示される
                        textDiv.textContent = comment.content;

                        const metaDiv = document.createElement("div");
                        metaDiv.className = "comment-meta";

                        // ... (timeMeta, dayLabel の計算は同じ) ...
                        const timeMeta = new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const dayLabel = comment.time_slot_day ? `${comment.time_slot_day}曜 ` : '';

                        // メタ情報も .textContent で挿入
                        const dayPeriodSpan = document.createElement("span");
                        dayPeriodSpan.className = "day-period";
                        dayPeriodSpan.textContent = `${dayLabel}${comment.time_slot_period}限`;

                        const timeSpan = document.createElement("span");
                        timeSpan.className = "time";
                        timeSpan.textContent = timeMeta;

                        // ... (ボタンやいいねカウントの作成) ...
                        const likeBtn = document.createElement("button");
                        likeBtn.className = "like-btn";
                        likeBtn.dataset.commentId = comment.id; // data-* 属性は安全
                        likeBtn.textContent = "♡";

                        const likeCountSpan = document.createElement("span");
                        likeCountSpan.className = "like-count";
                        likeCountSpan.id = `like-count-${comment.id}`;
                        likeCountSpan.textContent = comment.likes || 0;
                        // ログインユーザーのいいね済みを反映
                        if (comment.is_liked_by_me) {
                                likeBtn.classList.add('liked');
                        } else {
                                likeBtn.classList.remove('liked');
                        }

                        // 3. 作成した要素を組み立てる (appendChild)
                        metaDiv.appendChild(dayPeriodSpan);
                        metaDiv.appendChild(timeSpan);
                        metaDiv.appendChild(likeBtn);
                        metaDiv.appendChild(likeCountSpan);

                        contentDiv.appendChild(textDiv);
                        contentDiv.appendChild(metaDiv);

                        item.appendChild(contentDiv);

                        commentListElement.prepend(item);
                        // --- DOM構築ここまで ---

                        // イベントリスナーの登録
                        commentListElement.querySelectorAll('.like-btn').forEach(button => {
                                button.addEventListener('click', handleLikeClick);
                        });
                });
        }

        // ★★★ 投票数とコメントの読み込み処理 (曜日・時限対応) ★★★
        async function loadRoomData(roomId) {
                const todayIndex = new Date().getDay();
                // 修正: グローバル定数 WEEKDAYS を使用
                const selectedDay = document.querySelector('.option-group:nth-of-type(1) button.active')?.textContent || WEEKDAYS[todayIndex];

                // 時限は2番目のオプショングループになりました
                let selectedPeriod = document.querySelector('.option-group:nth-of-type(2) button.active')?.textContent;
                if (!selectedPeriod) {
                        selectedPeriod = getCurrentPeriodId().id; // idプロパティを取得
                }

                // 1. 投票データの読み込み
                try {
                        // 1. パラメータを準備
                        const params = new URLSearchParams({
                                roomId: Number(roomId),
                                day: selectedDay,
                                periodId: selectedPeriod
                        });

                        // 2. URLを組み立てる
                        const url = `/api/votes?${params.toString()}`;

                        const fetchOptions = {
                                method: 'GET',
                                headers: {} // まず空のヘッダーを用意
                        };

                        // 1. 現在のユーザーを取得
                        const user = auth.currentUser;
                        if (user) {
                                // 2. ログイン中なら、IDトークンを取得してヘッダーに追加
                                try {
                                        const idToken = await user.getIdToken();
                                        fetchOptions.headers['Authorization'] = `Bearer ${idToken}`;
                                } catch (err) {
                                        console.error('トークン取得エラー:', err);
                                        // (トークンが取れなくても、ゲストとしてリクエストは続行)
                                }
                        }

                        // 3. fetch
                        const votesRes = await fetch(url, fetchOptions);
                        const allVotes = await votesRes.json();
                        const roomPeriodVotes = allVotes;

                        // 該当教室 -> 該当曜日 -> 該当时限の投票データを抽出 (3階層アクセス)
                        //const roomPeriodVotes = (allVotes[String(roomId)]?.[selectedDay]?.[String(selectedPeriod)]) || {};

                        displayVotes(roomPeriodVotes);
                } catch (e) {
                        console.error("投票データの読み込みに失敗しました:", e);
                        displayVotes({});
                }

                // 2. コメントデータの読み込み
                try {
                        const fetchOptions = {
                                method: 'GET',
                                headers: {} // まず空のヘッダーを用意
                        };

                        // 1. 現在のユーザーを取得
                        const user = auth.currentUser;
                        if (user) {
                                // 2. ログイン中なら、IDトークンを取得してヘッダーに追加
                                try {
                                        const idToken = await user.getIdToken();
                                        fetchOptions.headers['Authorization'] = `Bearer ${idToken}`;
                                } catch (err) {
                                        console.error('トークン取得エラー:', err);
                                        // (トークンが取れなくても、ゲストとしてリクエストは続行)
                                }
                        }
                        const commentsRes = await fetch("/api/comments", fetchOptions);
                        const data = await commentsRes.json();
                        const allComments = data.comments;
                        const commentList = document.getElementById("commentList114");

                        // ★ 修正: 曜日によるフィルタリングを追加 ★
                        const roomComments = allComments.filter(c =>
                                String(c.classroom_id) === String(roomId) &&
                                String(c.time_slot_day) === String(selectedDay) && // 曜日が一致
                                String(c.time_slot_period) === String(selectedPeriod) // 時限が一致
                                // isTimestampInPeriod(c.timestamp, selectedPeriod) は、データ保存時に
                                // 既に曜日・時限が確定しているため、基本的に不要（サーバーでタイムスタンプをチェック済みと仮定）
                        );
                        console.log(roomComments);

                        displayComments(roomComments, commentList);
                } catch (e) {
                        console.error("コメントデータの読み込みに失敗しました:", e);
                        document.getElementById("commentList114").innerHTML = "<p>コメントの読み込みに失敗しました。</p>";
                }

        }



        async function submitVote(roomId, type) {
                // 修正: グローバル定数 WEEKDAYS を使用
                const selectedDay = document.querySelector('.option-group:nth-of-type(1) button.active')?.textContent || WEEKDAYS[new Date().getDay()];

                // 時限は2番目のオプショングループになりました
                let selectedPeriod = document.querySelector('.option-group:nth-of-type(2) button.active')?.textContent;
                if (!selectedPeriod) {
                        selectedPeriod = getCurrentPeriodId().id; // idプロパティを取得
                }

                try {
                        // ★ 1. まずユーザーをチェック
                        const user = auth.currentUser;
                        if (!user) {
                                alert('投票するにはログインが必要です。');
                                return; // ★ ユーザーがいなければここで中断
                        }

                        let idToken;
                        try {
                                // ★ 2. IDトークン（身分証明書）を取得
                                idToken = await user.getIdToken();
                        } catch (err) {
                                console.error('トークン取得エラー:', err);
                                alert('認証情報の取得に失敗しました。再ログインしてください。');
                                return; // ★ トークンが取れなければここで中断
                        }

                        const fetchOptions = {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                        roomId: Number(roomId),
                                        type: type,
                                        day: selectedDay,
                                        periodId: selectedPeriod // 時限ID文字列をPOST
                                }),
                        };

                        if (user) {
                                // 2. ログイン中なら、IDトークンを取得してヘッダーに追加
                                try {
                                        const idToken = await user.getIdToken();
                                        fetchOptions.headers['Authorization'] = `Bearer ${idToken}`;
                                } catch (err) {
                                        console.error('トークン取得エラー:', err);
                                        // (トークンが取れなくても、ゲストとしてリクエストは続行)
                                }
                        }

                        const response = await fetch("/api/votes", fetchOptions);

                        // サーバー応答の処理
                        if (response.ok) {
                                // 投票後、最新の投票データを再読み込み
                                loadRoomData(roomId);
                        } else {
                                alert("投票の送信に失敗しました。");
                                console.error("サーバー応答エラー:", await response.text());
                        }
                } catch (e) {
                        console.error("投票処理中にエラーが発生しました:", e);
                        alert("ネットワークエラーにより投票できませんでした。");
                }
        }

        // ======= 投票カウント機能（時限IDをPOSTに追加） =======
        const voteButtons = [
                { element: document.getElementById("btnClass"), type: "class" },
                { element: document.getElementById("btnFree"), type: "free" },
                { element: document.getElementById("btnGaragara"), type: "garagara" },
                { element: document.getElementById("btnSukuname"), type: "sukuname" },
                { element: document.getElementById("btnHutsu"), type: "hutsu" },
                { element: document.getElementById("btnKonzatsu"), type: "konzatsu" },
        ];

        voteButtons.forEach(btnInfo => {
                if (btnInfo.element) {
                        btnInfo.element.addEventListener("click", () => {
                                const roomId = modal.dataset.roomId;
                                if (roomId) {
                                        submitVote(roomId, btnInfo.type);
                                }
                        });
                }
        });


        // ======= コメント機能 (曜日対応を実装) =======
        const postBtn = document.getElementById("postBtn114");

        if (postBtn) {
                postBtn.addEventListener("click", async e => {
                        e.preventDefault();

                        const textareaElement = document.getElementById("comments114");

                        // テキストエリア要素が存在しないか、roomIdがない場合は処理を中断
                        const roomId = modal.dataset.roomId;
                        if (!textareaElement || !roomId) return;

                        const text = textareaElement.value.trim();
                        if (!text) return; // テキストが空なら中断

                        // 1. 選択されている曜日を取得 (未選択なら今日の曜日)
                        // 修正: グローバル定数 WEEKDAYS を使用
                        const todayIndex = new Date().getDay();
                        const selectedDay = document.querySelector('.option-group:nth-of-type(1) button.active')?.textContent || WEEKDAYS[todayIndex];

                        // 2. 選択されている時限を取得 (未選択なら現在の時限)
                        let selectedPeriod = document.querySelector('.option-group:nth-of-type(2) button.active')?.textContent;
                        if (!selectedPeriod) {
                                selectedPeriod = getCurrentPeriodId().id;
                        }

                        // ★ 1. まずユーザーをチェック
                        const user = auth.currentUser;
                        if (!user) {
                                alert('コメントを投稿するにはログインが必要です。');
                                return; // ★ ユーザーがいなければここで中断
                        }

                        let idToken;
                        try {
                                // ★ 2. IDトークン（身分証明書）を取得
                                idToken = await user.getIdToken();
                        } catch (err) {
                                console.error('トークン取得エラー:', err);
                                alert('認証情報の取得に失敗しました。再ログインしてください。');
                                return; // ★ トークンが取れなければここで中断
                        }

                        try {
                                const fetchOptions = {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        // ★ 修正: day と timestamp をペイロードに追加 ★
                                        body: JSON.stringify({
                                                roomId: Number(roomId),
                                                text: text,
                                                periodId: selectedPeriod,
                                                day: selectedDay,
                                                //timestamp: new Date().toISOString()
                                        }),
                                };

                                // 1. 現在のユーザーを取得
                                const user = auth.currentUser;
                                if (user) {
                                        // 2. ログイン中なら、IDトークンを取得してヘッダーに追加
                                        try {
                                                const idToken = await user.getIdToken();
                                                fetchOptions.headers['Authorization'] = `Bearer ${idToken}`;
                                        } catch (err) {
                                                console.error('トークン取得エラー:', err);
                                                // (トークンが取れなくても、ゲストとしてリクエストは続行)
                                        }
                                }
                                const response = await fetch("/api/comments", fetchOptions);

                                if (response.ok) {
                                        loadRoomData(roomId);
                                        textareaElement.value = "";
                                } else {
                                        alert("コメントの投稿に失敗しました。");
                                }
                        } catch (e) {
                                console.error("コメント投稿中にエラーが発生しました:", e);
                                alert("ネットワークエラーにより投稿できませんでした。");
                        }
                });
        }


        // ======= フィルターボタンの切り替え (単一/複数選択に対応) =======
        document.querySelectorAll(".option-group button").forEach(btn => {
                btn.addEventListener("click", function () {
                        this.classList.toggle("active");

                        const group = this.closest(".option-group");
                        const selectionMode = group.dataset.selection;

                        if (selectionMode === "single") {
                                group.querySelectorAll("button").forEach(otherBtn => {
                                        if (otherBtn !== this) {
                                                otherBtn.classList.remove("active");
                                        }
                                });
                        }
                        // ボタンクリック時にフィルターを実行
                        applyFilters();
                });
        });

        // キーワード入力時にフィルターを実行
        document.getElementById("keyword").addEventListener("input", applyFilters);

        // ★修正: チェックボックス変更時にフィルターを実行する処理をDOMイベントリスナーに追加
        document.querySelector('.checkbox-group input[type="checkbox"]').addEventListener('change', applyFilters);


        // ======= フィルタリング処理のコア関数 =======
        function applyFilters() {
                const filters = collectFilterSettings();

                // 1. 教室要素のフィルタリング
                document.querySelectorAll(".room").forEach(roomElement => {
                        let isVisible = true;
                        const roomData = roomElement.roomData;

                        if (!roomData) {
                                isVisible = false;
                        } else {
                                // a. キーワードフィルター
                                if (filters.keyword && !roomData.name.toLowerCase().includes(filters.keyword)) {
                                        isVisible = false;
                                }

                                // b. 号館フィルター（複数選択）
                                if (filters.buildings.length > 0 && !filters.buildings.includes(roomData.building)) {
                                        isVisible = false;
                                }

                                // c. 設備フィルター（AND条件）
                                if (filters.equipment.length > 0) {
                                        const roomTags = new Set(roomData.tags || []);
                                        for (const tag of filters.equipment) {
                                                if (!roomTags.has(tag)) {
                                                        isVisible = false;
                                                        break;
                                                }
                                        }
                                }

                                // d. 使用中の教室を非表示フィルター
                                if (filters.hideOccupied && roomData.status === '授業中') {
                                        isVisible = false;
                                }
                        }

                        // 3. 表示/非表示の切り替え
                        roomElement.classList.toggle("filtered-out", !isVisible);
                });

                // 2. ヘッダー表示の更新ロジック
                const day = filters.day;
                const period = filters.period; // collectFilterSettingsでデータとして決定された時限ID

                if (day && period) {
                        // 曜日と時限が両方選択されている場合
                        const periodDisplay = (period === '昼休み') ? '昼休み' : `${period}限`;
                        setHeaderPeriod(`${day}曜 ${periodDisplay}`);
                } else if (day) {
                        // 曜日だけ選択されている場合（時限はデータとして決定されたものを使う）
                        const periodText = getPeriod().headerText.split(' ')[1]; // 「Y限」の部分 (例: 1限, 昼休み)
                        setHeaderPeriod(`${day}曜 ${periodText}`); // 選択された曜日と現在時刻の時限を組み合わせる
                } else if (period) {
                        // 時限だけ選択されている場合（曜日は今日のまま）
                        const dayLabel = WEEKDAYS[new Date().getDay()]; // 修正: グローバル定数 WEEKDAYS を使用
                        const periodDisplay = (period === '昼休み') ? '昼休み' : `${period}限`;
                        setHeaderPeriod(`${dayLabel}曜 ${periodDisplay}`); // 曜日名に「曜」を追加
                } else {
                        // どちらも選択されていない場合、現在の時刻に戻す
                        updateCurrentPeriod();
                }

                // 3. 号館の表示/非表示ロジック
                document.querySelectorAll(".building-container").forEach(container => {
                        // 非表示になっていない教室（.room:not(.filtered-out)）の数をカウント
                        const visibleRoomsCount = container.querySelectorAll(".room:not(.filtered-out)").length;

                        if (visibleRoomsCount === 0) {
                                // 教室が一つも表示されていなければ、建物全体を非表示
                                container.style.display = 'none';
                        } else {
                                // 一つでも表示されていれば、建物全体を表示
                                container.style.display = 'block';
                        }

                        // 号館の開閉状態をリセット
                        const detailDiv = container.querySelector(".building-detail");
                        const buildingBtn = container.querySelector(".building-item");

                        if (detailDiv && detailDiv.classList.contains("open")) {
                                detailDiv.classList.remove("open");
                                detailDiv.style.maxHeight = null;
                                detailDiv.style.opacity = 0;
                                buildingBtn.querySelector(".arrow").textContent = "▼";
                        }
                });
        } // applyFilters 関数の閉じ括弧

        // ======= フィルター設定を収集するヘルパー関数 =======
        function collectFilterSettings() {
                // 時限はHTMLの2番目のオプショングループ
                let periodIdForData = document.querySelector('.option-group:nth-of-type(2) button.active')?.textContent;
                if (!periodIdForData) {
                        periodIdForData = getPeriod().periodId; // getPeriod()を利用して現在の時限のIDを取得
                }

                // 曜日が選択されていない場合、今日の曜日を短縮名で取得
                const dayLabelForData = document.querySelector('.option-group:nth-of-type(1) button.active')?.textContent || getPeriod().day; // getPeriod()から今日の曜日を取得

                const settings = {
                        keyword: document.getElementById("keyword").value.trim().toLowerCase(),
                        day: dayLabelForData, // 曜日名 (例: "水")
                        period: periodIdForData, // 常に時限IDを持つ
                        // 号館はHTMLの3番目のオプショングループ
                        buildings: Array.from(document.querySelectorAll('.option-group:nth-of-type(3) button.active')).map(b => b.textContent + '号館'),
                        equipment: Array.from(document.querySelectorAll('.option-group.wide button.active')).map(b => b.textContent),
                        // ★修正: チェックボックスの状態をブーリアンで取得
                        hideOccupied: document.querySelector('.checkbox-group input[type="checkbox"]').checked
                };

                return settings;
        }

        // ======= フィルタークリアボタン =======
        const clearBtn = document.querySelector(".clear-btn");
        if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                        document.querySelectorAll(".filter-modal input[type='checkbox']").forEach(cb => cb.checked = false);
                        document.querySelectorAll(".option-group button").forEach(b => b.classList.remove("active"));
                        document.getElementById("keyword").value = "";
                        applyFilters(); // クリア後、全表示に戻すためにフィルターを適用
                        filterModal.style.display = "none"; // フィルターモーダルを閉じる
                });
        }


        // フィルター選択がない場合に現在の時刻を表示するための関数
        function updateCurrentPeriod() {
                // フィルターが選択されているかチェック
                const filterDay = document.querySelector('.option-group:nth-of-type(1) button.active');
                // 時限は2番目のオプショングループ
                const filterPeriod = document.querySelector('.option-group:nth-of-type(2) button.active');

                if (!filterDay && !filterPeriod) {
                        const periodInfo = getPeriod();
                        setHeaderPeriod(periodInfo.headerText);
                }
        }
        updateCurrentPeriod(); // 起動時に現在の時限を表示
        setInterval(updateCurrentPeriod, 60000); // リアルタイム更新

});
