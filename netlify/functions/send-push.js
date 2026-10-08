/**
 * 🚀 netlify/functions/send-push.js
 * VAPID 암호화 전자서명을 통해 스마트폰 FCM/APNs 게이트웨이로 Web Push를 발송하는 핵심 백엔드 함수
 */

let webPush = null;
try {
    webPush = require('web-push');
} catch (e) {
    console.warn('[send-push] web-push module not loaded locally:', e.message);
}

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BN5A1LyDv-oNzs5kYQfokZO1PWGE_Mh2OJv1rqfCTOSiS5rgiRWpLGlB0SU1dBkMLW9nKpGJ64cVJ7-irtcETY4';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '-g9-6eqS4qSe1honcvApzazotaC8pIilzCaYqYeOWcI';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@lucky777.com';

if (webPush) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json; charset=utf-8'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { subscription, subscriptions, notification } = body;

        if (!notification || !notification.title) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Notification payload required (title, body)' })
            };
        }

        if (!webPush) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'web-push engine not initialized. Please ensure dependencies are installed.' })
            };
        }

        const targetList = subscriptions || (subscription ? [subscription] : []);
        if (targetList.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'No recipient subscription provided' })
            };
        }

        const payloadString = JSON.stringify(notification);
        const results = {
            total: targetList.length,
            success: 0,
            failed: 0,
            expired: 0
        };

        const sendPromises = targetList.map(async (sub) => {
            const pushSub = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys?.p256dh || sub.p256dh,
                    auth: sub.keys?.auth || sub.auth
                }
            };

            try {
                await webPush.sendNotification(pushSub, payloadString, {
                    TTL: 60 * 60 * 24 // 24시간 보관
                });
                results.success++;
            } catch (err) {
                results.failed++;
                if (err.statusCode === 404 || err.statusCode === 410) {
                    results.expired++;
                    console.log(`[send-push] Expired subscription token: ${sub.endpoint}`);
                    // 만료된 구독 토큰은 정리 대상
                } else {
                    console.error('[send-push] Send error:', err.statusCode, err.message);
                }
            }
        });

        await Promise.all(sendPromises);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                results,
                message: `Pushed ${results.success} notifications successfully`
            })
        };
    } catch (err) {
        console.error('[send-push] Unexpected fatal error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
        };
    }
};
