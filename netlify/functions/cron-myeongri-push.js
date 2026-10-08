/**
 * 🔮 netlify/functions/cron-myeongri-push.js
 * 사주 길일·길시 1시간 전 자동 체크 및 [해당 주차 구매등록 완료 회원 자동 생략] 스케줄러
 */

const { checkUserPurchaseCompleted } = require('./utils/purchase-checker');

let webPush = null;
try {
    webPush = require('web-push');
} catch (e) {}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BN5A1LyDv-oNzs5kYQfokZO1PWGE_Mh2OJv1rqfCTOSiS5rgiRWpLGlB0SU1dBkMLW9nKpGJ64cVJ7-irtcETY4';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '-g9-6eqS4qSe1honcvApzazotaC8pIilzCaYqYeOWcI';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@lucky777.com';

const FIREBASE_PROJECT_ID = 'sonamu-jokgu-club';
const FIREBASE_API_KEY = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA';

if (webPush) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/**
 * 기준일(2002-12-07 1회) 기반 현재 로또 진행 회차 계산
 */
function calculateCurrentRound() {
    const baseDate = new Date('2002-12-07T20:00:00+09:00');
    const now = new Date();
    const diffMs = now.getTime() - baseDate.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return 1 + diffWeeks + 1; // 진행 중인 회차
}

/**
 * 한국 시간(KST) 기준 현재 요일 및 시:분 추출
 */
function getKSTTime() {
    const now = new Date();
    // UTC + 9h
    const kstMs = now.getTime() + (9 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000);
    const kst = new Date(kstMs);

    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayName = days[kst.getDay()];
    const hours = kst.getHours();
    const minutes = kst.getMinutes();

    return { kst, dayName, hours, minutes };
}

exports.handler = async (event, context) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    const { dayName, hours, minutes } = getKSTTime();
    const currentRound = calculateCurrentRound();

    console.log(`[cron-myeongri-push] Run check at KST ${hours}:${minutes} (${dayName}), Target Round: ${currentRound}`);

    // 길시 1시간 전 매칭 테이블 (오차 ±15분 허용)
    // 사시(09:30) 1시간 전 -> 08:30 (hours: 8)
    // 오시(11:30) 1시간 전 -> 10:30 (hours: 10)
    // 신시(15:30) 1시간 전 -> 14:30 (hours: 14)
    // 유시(17:30) 1시간 전 -> 16:30 (hours: 16)
    // 술시(19:30) 1시간 전 -> 18:30 (hours: 18)
    let matchingSlotHour = null;
    let slotName = '';

    if (hours === 8) { matchingSlotHour = 9; slotName = '사시 (巳時 09:30~11:30)'; }
    else if (hours === 10) { matchingSlotHour = 11; slotName = '오시 (午時 11:30~13:30)'; }
    else if (hours === 14) { matchingSlotHour = 15; slotName = '신시 (申時 15:30~17:30)'; }
    else if (hours === 16) { matchingSlotHour = 17; slotName = '유시 (酉時 17:30~19:30)'; }
    else if (hours === 18) { matchingSlotHour = 19; slotName = '술시 (戌時 19:30~21:30)'; }

    // 강제 테스트 파라미터가 있을 경우
    const isForceTest = event.queryStringParameters && event.queryStringParameters.force === 'true';

    try {
        // Firestore에서 푸시 구독 목록 조회
        const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/push_subscriptions?key=${FIREBASE_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch subscriptions' }) };
        }

        const data = await res.json();
        const documents = data.documents || [];

        const stats = {
            total: documents.length,
            checked: 0,
            skippedAlreadyPurchased: 0,
            skippedNotTargetTime: 0,
            sent: 0,
            failed: 0
        };

        for (const doc of documents) {
            const f = doc.fields || {};
            const userId = f.userId?.stringValue || 'guest';
            const endpoint = f.endpoint?.stringValue;
            const p256dh = f.p256dh?.stringValue;
            const auth = f.auth?.stringValue;
            const notifyMyeongri = f.notifyMyeongri?.booleanValue !== false;
            const primaryDay = f.myeongriPrimaryDay?.stringValue || '';
            const slot1 = f.myeongriSlot1?.stringValue || '';
            const luckyColor = f.myeongriLuckyColor?.stringValue || '골드';

            if (!endpoint || !p256dh || !auth || !notifyMyeongri) continue;
            stats.checked++;

            // 요일 및 길시 매칭 검사
            let isTarget = isForceTest;
            if (!isTarget && matchingSlotHour) {
                // 오늘 요일이 회원의 길일이거나 토요일이고, 슬롯 텍스트에 매칭 시간이 포함된 경우
                const dayMatch = primaryDay.includes(dayName) || dayName === '토요일';
                const timeMatch = slot1.includes(String(matchingSlotHour));
                if (dayMatch && timeMatch) {
                    isTarget = true;
                }
            }

            if (!isTarget) {
                stats.skippedNotTargetTime++;
                continue;
            }

            // 🔥 [핵심 로직] 해당 주차(currentRound)에 이미 구매등록을 완료했는지 검사
            const alreadyPurchased = await checkUserPurchaseCompleted(null, userId, currentRound);
            if (alreadyPurchased && !isForceTest) {
                console.log(`[cron-myeongri-push] [SKIP] User ${userId} already registered purchase for round ${currentRound}`);
                stats.skippedAlreadyPurchased++;
                continue; // 구매 완료 회원은 알림 스킵!
            }

            // 아직 구매하지 않은 회원에게만 푸시 발송!
            const notificationPayload = JSON.stringify({
                title: `🔮 [재물 대길시 1시간 전] 행운의 시간대 안내`,
                body: `오늘(${dayName}) 회원님의 재물운이 가장 왕성한 ${slotName || '길시'}가 1시간 뒤 시작됩니다. 행운의 추천번호를 확인해 보세요! (행운색: ${luckyColor})`,
                icon: '/lucky777/icons/icon-192.png',
                badge: '/lucky777/icons/favicon.png',
                tag: 'myeongri-lucky-time',
                data: {
                    url: '/lucky777/?tab=tab-generator&src=myeongri_push'
                }
            });

            if (webPush) {
                try {
                    await webPush.sendNotification({
                        endpoint,
                        keys: { p256dh, auth }
                    }, notificationPayload, { TTL: 3600 });
                    stats.sent++;
                } catch (sendErr) {
                    stats.failed++;
                    console.error(`[cron-myeongri-push] Push failed for ${userId}:`, sendErr.message);
                }
            } else {
                console.log(`[cron-myeongri-push] Simulation Send -> User: ${userId}`);
                stats.sent++;
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                currentRound,
                kstTime: `${hours}:${minutes} (${dayName})`,
                stats
            })
        };
    } catch (err) {
        console.error('[cron-myeongri-push] Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
