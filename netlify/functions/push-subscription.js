/**
 * 🔔 netlify/functions/push-subscription.js
 * 클라이언트 Web Push 구독 토큰, 사주 스케줄 및 알림 설정을 Firestore에 등록/갱신/삭제하는 서버리스 함수
 */

const FIREBASE_PROJECT_ID = 'sonamu-jokgu-club';
const FIREBASE_API_KEY = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA';

exports.handler = async (event, context) => {
    // CORS Header
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const { endpoint, keys, userId, userName, myeongriSchedule, settings, platform, userAgent } = payload;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid PushSubscription payload' })
            };
        }

        const safeUserId = userId || 'anonymous';
        // endpoint의 뒷부분 해시를 고유 식별자로 사용
        const endpointHash = Buffer.from(endpoint).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(-24);
        const docId = `${safeUserId}_${endpointHash}`;

        // Firestore REST API를 이용해 push_subscriptions/{docId}에 저장
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/push_subscriptions/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;

        const docPayload = {
            fields: {
                docId: { stringValue: docId },
                userId: { stringValue: safeUserId },
                userName: { stringValue: userName || '' },
                endpoint: { stringValue: endpoint },
                p256dh: { stringValue: keys.p256dh },
                auth: { stringValue: keys.auth },
                notifyMyeongri: { booleanValue: settings?.notifyMyeongri !== false },
                notifyLockReminder: { booleanValue: settings?.notifyLockReminder !== false },
                notifyDrawResult: { booleanValue: settings?.notifyDrawResult !== false },
                skipIfPurchased: { booleanValue: true }, // 🔥 이번 주 구매등록 시 자동 생략
                platform: { stringValue: platform || 'Unknown' },
                userAgent: { stringValue: userAgent || 'Unknown' },
                updatedAt: { stringValue: new Date().toISOString() }
            }
        };

        // 사주명리 스케줄이 존재하면 추가
        if (myeongriSchedule) {
            docPayload.fields.myeongriStem = { stringValue: myeongriSchedule.stemName || '' };
            docPayload.fields.myeongriPrimaryDay = { stringValue: myeongriSchedule.primaryDayShort || '' };
            docPayload.fields.myeongriSlot1 = { stringValue: myeongriSchedule.timeSlot1 || '' };
            docPayload.fields.myeongriSlot2 = { stringValue: myeongriSchedule.timeSlot2 || '' };
            docPayload.fields.myeongriLuckyColor = { stringValue: myeongriSchedule.luckyColor || '' };
        }

        const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docPayload)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            console.error('[push-subscription] Firestore error:', errTxt);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to write subscription to database' })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, docId, message: 'Push subscription successfully registered' })
        };
    } catch (err) {
        console.error('[push-subscription] Unexpected error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
