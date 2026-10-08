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
    /**
     * App Badging API: 앱 아이콘 배지 초기화
     */
    async clearBadge() {
        if ('clearAppBadge' in navigator) {
            try {
                await navigator.clearAppBadge();
            } catch (e) {}
        }
    },

    /**
     * 알림 수신 상태에 따라 홈화면 배너 숨김/표시 처리
     * (알림 수신 확인/구독 완료 회원은 홈화면 배너 자동 숨김)
     */
    async updateBannerVisibility() {
        const banner = document.getElementById('lpPushNotificationBanner');
        const popoverPushBtnText = document.getElementById('popoverPushBtnText');
        const lpMobilePushBtn = document.getElementById('lpMobilePushBtn');

        let isSubscribed = false;
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                if (localStorage.getItem('lucky777_push_subscribed') === 'true') {
                    isSubscribed = true;
                } else {
                    const sub = await this.getSubscription();
                    if (sub) {
                        isSubscribed = true;
                        localStorage.setItem('lucky777_push_subscribed', 'true');
                    }
                }
            } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
                localStorage.removeItem('lucky777_push_subscribed');
            }
        } catch(e) {}

        if (banner) {
            if (isSubscribed) {
                banner.style.display = 'none';
            } else {
                banner.style.display = 'flex';
            }
        }

        if (popoverPushBtnText) {
            popoverPushBtnText.textContent = isSubscribed ? '행운 알림 관리 (수신 중 🟢)' : '행운 알림 설정 (길시 1시간 전)';
        }
        if (lpMobilePushBtn) {
            lpMobilePushBtn.title = isSubscribed ? '길시 1시간 전 알림 수신 중 (클릭 시 관리/테스트)' : '길시 1시간 전 알림 신청';
        }
    },

    /**
     * 🧪 알림 동작 테스트: 지정된 초(기본 3초) 뒤에 백그라운드 푸시 알림 팝업
     * (사용자가 전원 버튼을 눌러 화면을 끄고 잠금화면 팝업 및 진동을 직접 체험할 수 있음)
     */
    async sendTestNotification(delaySec = 3) {
        if (!('serviceWorker' in navigator) || !('Notification' in window)) {
            alert('현재 브라우저에서는 알림을 지원하지 않습니다.');
            return;
        }

        if (Notification.permission !== 'granted') {
            alert('알림 권한이 허용되지 않았습니다. 먼저 [알림 신청하기]를 완료해 주세요.');
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        const msg = `🧪 ${delaySec}초 뒤 테스트 알림이 발송됩니다!\n\n지금 스마트폰의 [전원 버튼]을 눌러 화면을 끄고 기다려보세요.\n화면이 꺼진 상태에서도 징~ 진동과 함께 잠금화면에 알림이 뜹니다.`;
        
        if (typeof window.showToast === 'function') {
            window.showToast(`🧪 ${delaySec}초 뒤 테스트 알림 발송! 지금 화면을 꺼보세요.`);
        }
        alert(msg);

        setTimeout(() => {
            const origin = window.location.origin;
            const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
            reg.showNotification('🎉 [운도실력 777] 알림 정상 작동 확인!', {
                body: '스마트폰 화면 꺼짐 및 백그라운드 수신이 완벽하게 작동하고 있습니다.',
                icon: `${origin}${basePath}icons/icon-192.png`,
                badge: `${origin}${basePath}icons/favicon.png`,
                vibrate: [200, 100, 200, 100, 400],
                tag: 'lucky777-test-alert',
                data: { url: `${origin}${basePath}?tab=tab-confirmed` }
            });

            // App Badging API 배지 테스트
            PushClient.setBadge(1);
        }, delaySec * 1000);
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
                const choice = confirm('🟢 현재 [사주 길일길시 1시간 전 & 당첨 발표] 알림이 정상 등록되어 있습니다.\n\n[확인] : 3초 뒤 테스트 알림 받기 (화면 끄고 확인)\n[취소] : 알림 수신 해제 창으로 이동');
                if (choice) {
                    // 테스트 알림 실행
                    await PushClient.sendTestNotification(3);
                } else {
                    const wantCancel = confirm('정말 알림 수신을 해제하시겠습니까?');
                    if (wantCancel) {
                        await PushClient.unsubscribe();
                        await PushClient.updateBannerVisibility();
                        if (typeof window.showToast === 'function') {
                            window.showToast('🔔 푸시 알림 수신이 안전하게 해제되었습니다.');
                        } else {
                            alert('푸시 알림 수신이 해제되었습니다.');
                        }
                    }
                }
                return;
            }

            const ok = confirm('🔮 [운도실력 777 행운 알림 서비스]\n\n1. 회원님 사주의 재물 대길시 1시간 전 맞춤 알림\n2. 해당 주차에 이미 구매등록을 하셨으면 알림 자동 생략 (스마트 안심 케어)\n3. 토요일 20:45 당첨 결과 발표 즉시 통보\n\n알림을 허용하시겠습니까?');
            if (!ok) return;

            const sub = await PushClient.subscribe();
            if (sub) {
                await PushClient.updateBannerVisibility();
                const testNow = confirm('✨ 사주 길일·길시 1시간 전 스마트 알림이 등록되었습니다!\n\n지금 화면을 끄고 3초 뒤 테스트 알림이 오는지 시험해 보시겠습니까?');
                if (testNow) {
                    await PushClient.sendTestNotification(3);
                }
            }
        } catch (err) {
            console.error('[handlePushNotificationToggle Error]', err);
            alert('알림 설정 중 오류가 발생했습니다: ' + err.message);
        }
    };

    // 앱 실행 및 화면 복귀 시 배지 초기화 및 홈화면 배너 가시성 실시간 자동 동기화
    function initPushUI() {
        PushClient.clearBadge();
        PushClient.updateBannerVisibility();

        // 1. 스마트폰 설정 등 외부에서 알림을 끄고 앱으로 돌아왔을 때 즉시 감지 (focus / visibilitychange)
        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                PushClient.updateBannerVisibility();
            }
        });
        window.addEventListener('focus', () => {
            PushClient.updateBannerVisibility();
        });

        // 2. W3C Permissions API 권한 변경 실시간 리스너 (브라우저 설정 변경 즉시 반영)
        if ('permissions' in navigator && navigator.permissions.query) {
            try {
                navigator.permissions.query({ name: 'notifications' }).then((status) => {
                    status.onchange = function() {
                        PushClient.updateBannerVisibility();
                    };
                }).catch(() => {});
            } catch (e) {}
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPushUI);
    } else {
        initPushUI();
    }
}

