/**
 * 🔔 push-client.js: 운도실력 Web Push, 사주 길일·길시 1시간 전 알림 & Badging API 클라이언트 모듈
 * 
 * [주요 기능]
 * 1. W3C Web Push 표준 구독 및 VAPID 전자서명 연동
 * 2. MyeongriService 사주 길일·길시 스케줄 자동 동기화
 * 3. 구매등록 감지 기반 자동 생략 플래그 저장
 * 4. PWA Badging API (앱 아이콘 숫자 배지) 연동
 */

const VAPID_PUBLIC_KEY = 'BN5A1LyDv-oNzs5kYQfokZO1PWGE_Mh2OJv1rqfCTOSiS5rgiRWpLGlB0SU1dBkMLW9nKpGJ64cVJ7-irtcETY4';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export const PushClient = {
    VAPID_PUBLIC_KEY,

    /**
     * 현재 브라우저의 Web Push 지원 여부 확인
     */
    isSupported() {
        return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    },

    /**
     * 현재 알림 권한 상태 반환 ('granted', 'denied', 'default')
     */
    getPermissionState() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    },

    /**
     * 현재 활성화된 PushSubscription 객체 조회
     */
    async getSubscription() {
        if (!this.isSupported()) return null;
        try {
            const reg = await navigator.serviceWorker.ready;
            return await reg.pushManager.getSubscription();
        } catch (e) {
            console.warn('[PushClient] getSubscription failed:', e);
            return null;
        }
    },

    /**
     * 회원의 사주명리 길일·길시 스케줄 정보 추출
     */
    getMyeongriSchedule() {
        try {
            // 사용자 생년월일 가져오기 (SafeAuth / window.__cachedUsersWithStatus / Firestore)
            let birthDate = null;
            let calendarType = 'solar';
            const currentUserId = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : null;

            if (currentUserId && window.__cachedUsersWithStatus) {
                const userObj = window.__cachedUsersWithStatus.find(u => String(u.id).toLowerCase() === String(currentUserId).toLowerCase());
                if (userObj && userObj.data && userObj.data.birthDate) {
                    birthDate = userObj.data.birthDate;
                    calendarType = userObj.data.calendarType || 'solar';
                }
            }

            if (!birthDate) {
                // fallback to localStorage or inputs
                const storedBirth = localStorage.getItem('userBirthDate');
                if (storedBirth) birthDate = storedBirth;
            }

            if (!birthDate || !window.MyeongriService || typeof window.MyeongriService.analyzeBirth !== 'function') {
                return null;
            }

            const analysis = window.MyeongriService.analyzeBirth(birthDate, calendarType);
            if (!analysis || !analysis.stem) return null;

            const stem = analysis.stem;
            return {
                stemName: stem.name,
                elementKo: stem.elementKo,
                wealthElementKo: stem.wealthElementKo,
                primaryDayShort: stem.primaryDayShort,
                luckyColor: stem.luckyColor,
                timeSlot1: stem.timeSlot1,
                timeSlot2: stem.timeSlot2
            };
        } catch (err) {
            console.warn('[PushClient] Myeongri schedule extraction error:', err);
            return null;
        }
    },

    /**
     * 푸시 알림 권한 요청 및 구독 등록
     * @param {Object} options - 알림 세부 설정 { notifyMyeongri, notifyDrawResult, notifyLockReminder }
     */
    async subscribe(options = {}) {
        if (!this.isSupported()) {
            throw new Error('현재 브라우저/환경에서는 웹 푸시 알림을 지원하지 않습니다. (PWA 홈화면 추가 권장)');
        }

        // 1. 브라우저 알림 권한 획득
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해 주세요.');
        }

        // 2. 서비스 워커 등록 확인
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        // 3. 없으면 새로 구독
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // 4. 사주 스케줄 및 사용자 정보 패키징
        const myeongriSchedule = this.getMyeongriSchedule();
        const userId = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
        const subData = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.toJSON().keys ? sub.toJSON().keys.p256dh : '',
                auth: sub.toJSON().keys ? sub.toJSON().keys.auth : ''
            },
            userId: userId,
            myeongriSchedule: myeongriSchedule,
            settings: {
                notifyMyeongri: options.notifyMyeongri !== false, // 기본 ON (길일길시 1시간 전)
                notifyLockReminder: options.notifyLockReminder !== false, // 기본 ON (토요일 19:30 마감)
                notifyDrawResult: options.notifyDrawResult !== false, // 기본 ON (토요일 20:45 당첨)
                skipIfPurchased: true // 🔥 해당 주차 구매등록 시 자동 생략 활성화
            },
            platform: navigator.platform || 'Unknown',
            userAgent: navigator.userAgent,
            updatedAt: new Date().toISOString()
        };

        // 5. 서버에 구독 정보 동기화 (Netlify Function 또는 Firestore 직접 저장)
        await this.saveSubscriptionToServer(subData);

        // 6. 성공 피드백 진동
        if ('vibrate' in navigator) {
            navigator.vibrate([40, 60, 40]);
        }

        return sub;
    },

    /**
     * 서버/Firestore에 구독 정보 저장
     */
    async saveSubscriptionToServer(subData) {
        // 로컬 스토리지에 캐시
        try {
            localStorage.setItem('lucky777_push_subscribed', 'true');
            localStorage.setItem('lucky777_push_settings', JSON.stringify(subData.settings));
        } catch(e) {}

        // 1) Netlify Serverless Function 저장 시도
        try {
            const resp = await fetch('/.netlify/functions/push-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subData)
            });
            if (resp.ok) {
                console.log('[PushClient] Push subscription registered on Netlify Function successfully.');
                return;
            }
        } catch (netErr) {
            console.warn('[PushClient] Netlify Function fallback to direct Firestore:', netErr);
        }

        // 2) Firestore 직접 연동 Fallback
        if (window.db && subData.userId && subData.userId !== 'guest') {
            try {
                // key based on hash of endpoint
                const hash = btoa(subData.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-20);
                await window.db.collection('push_subscriptions').doc(`${subData.userId}_${hash}`).set(subData, { merge: true });
                console.log('[PushClient] Push subscription registered directly to Firestore.');
            } catch (fsErr) {
                console.error('[PushClient] Firestore push subscription save failed:', fsErr);
            }
        }
    },

    /**
     * 푸시 알림 구독 취소
     */
    async unsubscribe() {
        if (!this.isSupported()) return false;
        try {
            const sub = await this.getSubscription();
            if (sub) {
                await sub.unsubscribe();
            }
            localStorage.removeItem('lucky777_push_subscribed');
            console.log('[PushClient] Push subscription unsubscribed.');
            return true;
        } catch (e) {
            console.error('[PushClient] Unsubscribe failed:', e);
            return false;
        }
    },

    /**
     * App Badging API: 앱 아이콘에 숫자 배지 설정
     * @param {number} count 
     */
    async setBadge(count = 1) {
        if ('setAppBadge' in navigator) {
            try {
                if (count > 0) {
                    await navigator.setAppBadge(count);
                } else {
                    await navigator.clearAppBadge();
                }
            } catch (e) {
                // Ignore error on uninstalled web context
            }
        }
    },

    /**
     * App Badging API: 앱 아이콘 배지 초기화
     */
    async clearBadge() {
        if ('clearAppBadge' in navigator) {
            try {
                await navigator.clearAppBadge();
            } catch (e) {}
        }
    }
};

// 전역 윈도우 등록 및 인터랙티브 토글 헬퍼
if (typeof window !== 'undefined') {
    window.PushClient = PushClient;

    window.handlePushNotificationToggle = async function() {
        if (!PushClient.isSupported()) {
            alert('현재 브라우저에서는 웹 푸시를 지원하지 않습니다.\n아이폰(iOS)의 경우 [홈 화면에 추가(PWA)] 후 앱에서 실행해 주세요.');
            return;
        }

        try {
            const existingSub = await PushClient.getSubscription();
            if (existingSub) {
                const wantCancel = confirm('이미 [사주 길일길시 1시간 전 & 당첨 발표] 알림을 구독 중입니다.\n\n알림 수신을 해제하시겠습니까?');
                if (wantCancel) {
                    await PushClient.unsubscribe();
                    if (typeof window.showToast === 'function') {
                        window.showToast('🔔 푸시 알림 수신이 안전하게 해제되었습니다.');
                    } else {
                        alert('푸시 알림 수신이 해제되었습니다.');
                    }
                }
                return;
            }

            const ok = confirm('🔮 [운도실력 777 행운 알림 서비스]\n\n1. 회원님 사주의 재물 대길시 1시간 전 맞춤 알림\n2. 해당 주차에 이미 구매등록을 하셨으면 알림 자동 생략 (스마트 안심 케어)\n3. 토요일 20:45 당첨 결과 발표 즉시 통보\n\n알림을 허용하시겠습니까?');
            if (!ok) return;

            const sub = await PushClient.subscribe();
            if (sub) {
                if (typeof window.showToast === 'function') {
                    window.showToast('✨ 사주 길일·길시 1시간 전 스마트 알림이 등록되었습니다!');
                } else {
                    alert('✨ 사주 길일·길시 1시간 전 스마트 알림이 등록되었습니다!\n(해당 주차 구매등록 완료 시 알림이 자동 생략됩니다)');
                }
            }
        } catch (err) {
            console.error('[handlePushNotificationToggle Error]', err);
            alert('알림 설정 중 오류가 발생했습니다: ' + err.message);
        }
    };

    // 앱 실행 시 배지 자동 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PushClient.clearBadge());
    } else {
        PushClient.clearBadge();
    }
}

