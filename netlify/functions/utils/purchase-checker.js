/**
 * 🛡️ purchase-checker.js
 * 해당 회차(upcomingRound)에 회원이 이미 구매등록/영수증 인증을 완료했는지 판별하는 스마트 필터 엔진
 */

/**
 * 회원의 구매등록 완료 여부 검사
 * @param {Object} db - Firestore Database 인스턴스 (또는 REST API)
 * @param {string} userId - 회원 ID
 * @param {number} targetRound - 이번 주 진행 회차 (예: 1242)
 * @returns {Promise<boolean>} 이미 구매등록을 완료했으면 true, 아니면 false
 */
async function checkUserPurchaseCompleted(db, userId, targetRound) {
    if (!userId || userId === 'guest') return false;

    // 관리자나 영구 면제 회원은 상시 패스
    const cleanId = String(userId).trim().toLowerCase();
    if (cleanId === 'master' || cleanId === 'admin') {
        return true;
    }

    try {
        if (!db) {
            // Firestore SDK가 없을 경우 REST API로 조회
            return await checkPurchaseViaRestApi(userId, targetRound);
        }

        const docRef = db.collection('lotto_purchases').doc(String(userId));
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return false;
        }

        const data = docSnap.data() || {};
        const ledger = data.ledger || {};
        const roundReceipts = ledger[String(targetRound)] || ledger[targetRound] || [];

        // 해당 회차에 등록된 영수증이 1건 이상이거나 게임 수가 1개 이상이면 구매 완료로 판정
        let gameCount = 0;
        if (Array.isArray(roundReceipts)) {
            roundReceipts.forEach(r => {
                if (r && Array.isArray(r.combos)) {
                    gameCount += r.combos.length;
                }
            });
        }

        return gameCount > 0;
    } catch (err) {
        console.warn(`[purchase-checker] Failed to check purchase for ${userId}:`, err.message);
        // 에러 발생 시 사용자에게 알림 기회를 주기 위해 false 반환
        return false;
    }
}

/**
 * Firebase Admin SDK 없이도 동작 가능한 Firestore REST API Fallback
 */
async function checkPurchaseViaRestApi(userId, targetRound) {
    const projectId = 'sonamu-jokgu-club';
    const apiKey = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/lotto_purchases/${encodeURIComponent(userId)}?key=${apiKey}`;

    try {
        const fetch = global.fetch || require('node-fetch');
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) return false;

        const json = await res.json();
        if (!json.fields || !json.fields.ledger) return false;

        // REST 응답에서 해당 회차 키 존재 여부 파악
        const rawJsonStr = JSON.stringify(json.fields.ledger);
        if (rawJsonStr.includes(`"${targetRound}"`) || rawJsonStr.includes(String(targetRound))) {
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

module.exports = {
    checkUserPurchaseCompleted
};
