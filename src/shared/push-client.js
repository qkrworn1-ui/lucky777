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
     * 현재 로그인된 사용자의 실명/이름 획득 (UI 동기화)
     */
    getCurrentUserName() {
        try {
            // 1. 화면에 렌더링된 실명 우선 확인
            const mobileEl = document.getElementById('lpMobileUserName');
            if (mobileEl && mobileEl.textContent && mobileEl.textContent.trim()) {
                const txt = mobileEl.textContent.trim();
                if (txt && txt !== '회원' && txt !== '비로그인') return txt;
            }
            const headerEl = document.getElementById('userDisplayName') || document.querySelector('.user-display-name');
            if (headerEl && headerEl.textContent && headerEl.textContent.trim()) {
                const txt = headerEl.textContent.trim().replace(/^👑\s*/, '').replace(/\s*님$/, '').trim();
                if (txt && txt !== '비로그인' && txt !== '로그인') return txt;
            }

            // 2. SafeAuth 및 사용자 캐시/함수 확인
            const uid = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : null;
            if (uid) {
                if (typeof window.getUserRealName === 'function') {
                    const name = window.getUserRealName(uid);
                    if (name && name !== '최고관리자' && !name.startsWith('kakao_')) return name;
                }
                if (window.__currentUser && window.__currentUser.realName) {
                    return window.__currentUser.realName;
                }
                const cleanUid = String(uid).toLowerCase().trim();
                if (window.__userNames && window.__userNames[cleanUid]) {
                    return window.__userNames[cleanUid];
                }
            }

            // 3. Storage 백업 확인
            const sName = window.sessionStorage?.getItem('user_real_name') || window.localStorage?.getItem('user_real_name');
            if (sName) return sName;
        } catch (e) {
            console.warn('[PushClient.getCurrentUserName]', e);
        }
        return '';
    },

    getUserDisplayName() {
        const name = this.getCurrentUserName();
        return (name && name !== '최고관리자' && !name.startsWith('kakao_')) ? `${name} 님` : '회원님';
    },

    /**
     * 회원의 사주명리 길일·길시 스케줄 정보 추출
     * (calculateMyeongriProfile 및 모든 생년월일 저장소 키 완벽 호환)
     */
    getMyeongriSchedule() {
        try {
            let birthDate = null;
            let calendarType = 'solar';
            let currentUserId = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : null;
            if (typeof currentUserId === 'string' && currentUserId.startsWith('{')) {
                try { currentUserId = JSON.parse(currentUserId).userid || currentUserId; } catch (e) {}
            }
            currentUserId = (currentUserId || '').trim();

            // 1. window.__currentUser 우선 확인
            if (window.__currentUser && window.__currentUser.birthDate) {
                birthDate = window.__currentUser.birthDate;
                calendarType = window.__currentUser.calendarType || 'solar';
            }

            // 2. window.__cachedUsersWithStatus 확인
            if (!birthDate && currentUserId && Array.isArray(window.__cachedUsersWithStatus)) {
                const userObj = window.__cachedUsersWithStatus.find(u =>
                    String(u.id || u.userId || '').toLowerCase() === String(currentUserId).toLowerCase()
                );
                if (userObj) {
                    const bDate = userObj.birthDate || (userObj.data && userObj.data.birthDate);
                    if (bDate) {
                        birthDate = bDate;
                        calendarType = userObj.calendarType || (userObj.data && userObj.data.calendarType) || 'solar';
                    }
                }
            }

            // 3. localStorage 다양한 키 확인 (user_birthdate_{id}, user_birthdate_last, userBirthDate)
            if (!birthDate && typeof localStorage !== 'undefined') {
                if (currentUserId) {
                    birthDate = localStorage.getItem('user_birthdate_' + currentUserId);
                    calendarType = localStorage.getItem('user_calendartype_' + currentUserId) || calendarType;
                }
                if (!birthDate) {
                    birthDate = localStorage.getItem('user_birthdate_last')
                        || localStorage.getItem('user_birthdate_guest')
                        || localStorage.getItem('userBirthDate');
                    calendarType = localStorage.getItem('user_calendartype_last')
                        || localStorage.getItem('user_calendartype_guest')
                        || calendarType;
                }
            }

            if (!birthDate || !window.MyeongriService) {
                return null;
            }

            // MyeongriService.calculateMyeongriProfile 정식 호출 (하위 호환 analyzeBirth 폴백 포함)
            let profile = null;
            if (typeof window.MyeongriService.calculateMyeongriProfile === 'function') {
                profile = window.MyeongriService.calculateMyeongriProfile(birthDate, { calendarType });
            } else if (typeof window.MyeongriService.analyzeBirth === 'function') {
                profile = window.MyeongriService.analyzeBirth(birthDate, calendarType);
            }

            if (!profile) return null;

            const stem = profile.stem || profile;
            return {
                birthDate,
                calendarType,
                stemKey: profile.stemKey || stem.key || '',
                stemName: stem.name || '',
                elementKo: stem.elementKo || '',
                wealthElementKo: stem.wealthElementKo || '',
                primaryDays: Array.isArray(stem.primaryDays) ? stem.primaryDays : [],
                secondaryDays: Array.isArray(stem.secondaryDays) ? stem.secondaryDays : [],
                primaryDayShort: stem.primaryDayShort || (Array.isArray(stem.primaryDays) ? stem.primaryDays.join(', ') : ''),
                luckyColor: stem.luckyColor || '',
                timeSlot1: stem.timeSlot1 || '',
                timeSlot2: stem.timeSlot2 || '',
                todayReport: profile.todayReport || null
            };
        } catch (err) {
            console.warn('[PushClient] Myeongri schedule extraction error:', err);
            return null;
        }
    },

    /**
     * 생년월일/사주 변경 시 이미 구독 중인 사용자의 스케줄을 서버/Firestore에 즉시 재동기화
     */
    async syncMyeongriScheduleIfNeeded() {
        try {
            const sub = await this.getSubscription();
            if (!sub) return false;
            const myeongriSchedule = this.getMyeongriSchedule();
            if (!myeongriSchedule) return false;

            let userId = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
            if (typeof userId === 'string' && userId.startsWith('{')) {
                try { userId = JSON.parse(userId).userid || userId; } catch (e) {}
            }
            const userName = this.getCurrentUserName();
            let savedSettings = {};
            try {
                savedSettings = JSON.parse(localStorage.getItem('lucky777_push_settings') || '{}');
            } catch (e) {}

            const subData = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.toJSON().keys ? sub.toJSON().keys.p256dh : '',
                    auth: sub.toJSON().keys ? sub.toJSON().keys.auth : ''
                },
                userId: userId || 'guest',
                userName: userName,
                myeongriSchedule: myeongriSchedule,
                settings: {
                    notifyMyeongri: savedSettings.notifyMyeongri !== false,
                    notifyLockReminder: savedSettings.notifyLockReminder !== false,
                    notifyDrawResult: savedSettings.notifyDrawResult !== false,
                    skipIfPurchased: true
                },
                platform: navigator.platform || 'Unknown',
                userAgent: navigator.userAgent,
                updatedAt: new Date().toISOString()
            };

            await this.saveSubscriptionToServer(subData);
            return true;
        } catch (e) {
            console.warn('[PushClient] syncMyeongriScheduleIfNeeded error:', e);
            return false;
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
        let permission = Notification.permission;
        if (permission === 'denied') {
            throw new Error('브라우저에서 알림이 [차단]되어 있습니다.\n\n[간단 해제 방법 (3초)]\n1. 스마트폰 화면 상단 주소창 맨 왼쪽의 [설정 아이콘(⊶)] 터치\n2. [권한] 또는 [알림] 항목을 눌러 [허용]으로 변경\n3. 변경 후 다시 [알림 신청]을 누르시면 정상 등록됩니다.');
        }
        if (permission !== 'granted') {
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') {
            throw new Error('알림 권한이 허용되지 않았습니다.\n\n주소창 맨 왼쪽의 설정 아이콘(⊶)을 눌러 알림을 [허용]으로 변경해 주세요.');
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
        let userId = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
        if (typeof userId === 'string' && userId.startsWith('{')) {
            try { userId = JSON.parse(userId).userid || userId; } catch (e) {}
        }
        const userName = this.getCurrentUserName();
        const subData = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.toJSON().keys ? sub.toJSON().keys.p256dh : '',
                auth: sub.toJSON().keys ? sub.toJSON().keys.auth : ''
            },
            userId: userId,
            userName: userName,
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

        // 6. 구독 완료 후 즉시 길일·길시 도래 여부 체크
        this.checkAndGenerateScheduledAlerts(true);

        // 7. 성공 피드백 진동
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

        // 1) Firestore에 직접 구독 정보 상시 동기화 (관리자 1:1/일괄 웹푸시 즉시 발송 및 스케줄러 호환 보장)
        if (window.db && subData.userId && subData.userId !== 'guest') {
            try {
                const hash = btoa(subData.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-20);
                await window.db.collection('push_subscriptions').doc(`${subData.userId}_${hash}`).set(subData, { merge: true });
                await window.db.collection('lotto_users').doc(subData.userId).set({
                    pushSubscription: {
                        endpoint: subData.endpoint,
                        keys: subData.keys,
                        updatedAt: subData.updatedAt || new Date().toISOString()
                    },
                    hasPushSubscription: true
                }, { merge: true });
                console.log('[PushClient] Push subscription synced to Firestore (push_subscriptions & lotto_users).');
            } catch (fsErr) {
                console.warn('[PushClient] Firestore push subscription sync warning:', fsErr);
            }
        }

        // 2) Netlify Serverless Function 저장 병행 시도
        try {
            const resp = await fetch('/.netlify/functions/push-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(subData)
            });
            if (resp.ok) {
                console.log('[PushClient] Push subscription registered on Netlify Function successfully.');
            }
        } catch (netErr) {
            console.warn('[PushClient] Netlify Function push-subscription non-blocking notice:', netErr);
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
            } catch (e) {}
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
    },

    // =========================================================================
    // 📬 미확인 알림 센터 (Unread Notification Inbox & Hybrid Schedule Engine)
    // =========================================================================

    getInboxStorageKey() {
        let uid = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }
        uid = String(uid || 'guest').trim().toLowerCase();
        return `lucky777_notification_inbox_${uid}`;
    },

    getNotifications() {
        try {
            const raw = localStorage.getItem(this.getInboxStorageKey());
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    saveNotifications(list) {
        try {
            const trimmed = (Array.isArray(list) ? list : []).slice(0, 40);
            localStorage.setItem(this.getInboxStorageKey(), JSON.stringify(trimmed));
            const unreadCount = trimmed.filter(n => n && n.unread).length;
            this.setBadge(unreadCount);
            this.renderUnreadNotificationUI();
        } catch (e) {}
    },

    addNotification(notif, showBrowserAlert = false) {
        if (!notif || !notif.id) return false;
        const normId = String(notif.id).trim();
        const cleanAlertId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const normTitle = String(notif.title || '').trim();
        const normBody = String(notif.body || '').trim();

        // 0. 기기 단위로 이미 읽음 처리되었거나 확인된 알림은 중복 생성 원천 차단
        try {
            if (localStorage.getItem(`lucky777_read_${cleanAlertId}`) === 'true' || localStorage.getItem(`lucky777_read_${normId}`) === 'true') {
                return false;
            }
        } catch(e) {}

        const list = this.getNotifications();

        // 1. 다중 스마트 중복 필터링:
        // - 동일 ID
        // - push- 접두사 차이 무시 동일 ID (admin-msg-123 === push-admin-msg-123)
        // - lotto-result- 와 draw-result- 상호 호환 ID
        // - 제목과 본문 내용이 100% 동일한 경우
        const isDuplicate = list.some(item => {
            if (!item) return false;
            const itemId = String(item.id || '').trim();
            if (itemId === normId) return true;
            if (itemId.replace(/^push-/, '') === normId.replace(/^push-/, '')) return true;
            if (itemId.replace('lotto-result-', 'draw-result-') === normId.replace('lotto-result-', 'draw-result-')) return true;
            if (normTitle && normBody && item.title === normTitle && item.body === normBody) return true;
            return false;
        });

        if (isDuplicate) {
            return false; // 이미 확인(읽음)된 알림이거나 존재하는 알림이면 중복 추가/재알림 절대 방지
        }

        const newItem = {
            id: notif.id,
            category: notif.category || 'myeongri',
            badge: notif.badge || '🔮 사주 길일·길시',
            title: notif.title || '운도실력 맞춤 알림',
            body: notif.body || '',
            createdAt: notif.createdAt || new Date().toISOString(),
            timeLabel: notif.timeLabel || this.formatTimeLabel(notif.createdAt),
            unread: notif.unread !== false,
            actionType: notif.actionType || 'generator',
            actionLabel: notif.actionLabel || '🎱 맞춤 번호 확인하기'
        };

        list.unshift(newItem);
        this.saveNotifications(list);

        if (showBrowserAlert && typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            const deviceAlertKey = `lucky777_alert_fired_${cleanAlertId}`;
            const alreadyFiredOnDevice = (localStorage.getItem(deviceAlertKey) === 'true') ||
                (localStorage.getItem(`lucky777_alert_fired_${normId}`) === 'true') ||
                (localStorage.getItem(`lucky777_read_${cleanAlertId}`) === 'true');

            if (!alreadyFiredOnDevice) {
                try {
                    localStorage.setItem(deviceAlertKey, 'true');
                    localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
                } catch(e) {}

                navigator.serviceWorker.ready.then(reg => {
                    const origin = window.location.origin;
                    const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
                    const targetTab = (newItem.actionType === 'confirmed') ? 'tab-confirmed-list' : ((newItem.actionType === 'fortune') ? 'tab-dashboard' : 'tab-generator');
                    reg.showNotification(newItem.title, {
                        body: newItem.body,
                        icon: `${origin}${basePath}icons/icon-192.png`,
                        badge: `${origin}${basePath}icons/favicon.png`,
                        tag: newItem.id,
                        vibrate: [150, 80, 150],
                        data: { url: `${origin}${basePath}?tab=${targetTab}`, id: newItem.id }
                    }).catch(() => {});
                }).catch(() => {});
            }
        }
        return true;
    },

    formatTimeLabel(isoStr) {
        try {
            const d = isoStr ? new Date(isoStr) : new Date();
            const month = d.getMonth() + 1;
            const date = d.getDate();
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${month}/${date} ${hh}:${mm}`;
        } catch (e) {
            return '방금 전';
        }
    },

    markNotificationRead(id) {
        if (!id) return;
        const normId = String(id).trim();
        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        try {
            localStorage.setItem(`lucky777_read_${normId}`, 'true');
            localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
        } catch(e) {}

        const list = this.getNotifications();
        let changed = false;
        list.forEach(item => {
            if (!item) return;
            const itemId = String(item.id || '').trim();
            const matchesId = itemId === normId ||
                itemId.replace(/^push-/, '') === normId.replace(/^push-/, '') ||
                itemId.replace('lotto-result-', 'draw-result-') === normId.replace('lotto-result-', 'draw-result-') ||
                (normId.includes('admin-msg-') && itemId.includes(normId.replace(/^push-/, '').replace(/^admin-msg-/, '')));
            if (matchesId && item.unread) {
                item.unread = false;
                changed = true;
            }
        });

        if (normId.includes('admin-msg-')) {
            const rawMsgId = normId.replace(/^push-/, '').replace(/^admin-msg-/, '');
            this.syncAdminMessageReadToFirestore(rawMsgId);
            let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
            if (typeof uid === 'string' && uid.startsWith('{')) {
                try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
            }
            if (uid && rawMsgId) {
                try { sessionStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true'); } catch (e) {}
            }
        }

        if (changed) {
            this.saveNotifications(list);
        } else {
            this.renderUnreadNotificationUI();
        }

        // 스마트폰 OS 알림바(Tray)에서도 해당 알림 팝업 즉시 닫기
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.getNotifications().then(notifs => {
                    notifs.forEach(n => {
                        if (n && n.tag) {
                            const nTag = String(n.tag).trim();
                            if (nTag === normId ||
                                nTag.replace(/^push-/, '') === normId.replace(/^push-/, '') ||
                                (normId.includes('admin-msg-') && nTag.includes(normId.replace(/^push-/, '').replace(/^admin-msg-/, '')))) {
                                n.close();
                            }
                        }
                    });
                }).catch(() => {});
            }).catch(() => {});
        }
    },

    markAllNotificationsRead() {
        const list = this.getNotifications();
        let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }

        list.forEach(item => {
            if (item) {
                if (item.id) {
                    const normId = String(item.id).trim();
                    const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                    try {
                        localStorage.setItem(`lucky777_read_${normId}`, 'true');
                        localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
                        localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
                        localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
                    } catch(e) {}
                }
                if (item.unread && item.id && String(item.id).includes('admin-msg-')) {
                    const rawMsgId = String(item.id).replace(/^push-/, '').replace(/^admin-msg-/, '');
                    this.syncAdminMessageReadToFirestore(rawMsgId);
                    if (uid && rawMsgId) {
                        try { sessionStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true'); } catch (e) {}
                    }
                }
                item.unread = false;
            }
        });
        this.saveNotifications(list);

        // 스마트폰 OS 알림바(Tray)의 모든 알림 즉시 닫기
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.getNotifications().then(notifs => {
                    notifs.forEach(n => { if (n && typeof n.close === 'function') n.close(); });
                }).catch(() => {});
            }).catch(() => {});
        }

        if (typeof window.showToast === 'function') {
            window.showToast('✓ 모든 미확인 알림을 읽음 처리했습니다.');
        }
    },

    /**
     * Service Worker IndexedDB('lucky777_notifications_db')에 쌓인 백그라운드 푸시 알림을 로컬 알림함으로 병합
     */
    async syncFromServiceWorkerDB() {
        if (typeof indexedDB === 'undefined') return;
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('lucky777_notifications_db', 1);
                req.onupgradeneeded = (ev) => {
                    const db = ev.target.result;
                    if (!db.objectStoreNames.contains('inbox')) {
                        db.createObjectStore('inbox', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (ev) => {
                    try {
                        const db = ev.target.result;
                        if (!db.objectStoreNames.contains('inbox')) return resolve();
                        const tx = db.transaction('inbox', 'readwrite');
                        const store = tx.objectStore('inbox');
                        const getAllReq = store.getAll();
                        getAllReq.onsuccess = () => {
                            const items = getAllReq.result || [];
                            if (items.length > 0) {
                                items.forEach(it => {
                                    this.addNotification({
                                        id: it.id,
                                        category: it.category || 'myeongri',
                                        badge: it.badge || '🔮 사주 길일·길시',
                                        title: it.title,
                                        body: it.body,
                                        createdAt: it.createdAt,
                                        unread: true,
                                        actionType: 'generator',
                                        actionLabel: '🎱 바로 확인하기'
                                    }, false);
                                });
                                store.clear();
                            }
                            resolve();
                        };
                        getAllReq.onerror = () => resolve();
                    } catch (e) {
                        resolve();
                    }
                };
                req.onerror = () => resolve();
            } catch (e) {
                resolve();
            }
        });
    },

    /**
     * 현재 진행 회차에 사용자가 이미 실구매 영수증을 등록했는지 확인
     */
    hasPurchasedCurrentRound(targetRound) {
        try {
            let uid = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '';
            if (typeof uid === 'string' && uid.startsWith('{')) {
                try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
            }
            uid = String(uid || '').trim().toLowerCase();

            const rNum = Number(targetRound) || this.getUpcomingRoundNumber();

            // 1. Check getUserConfirmedGameCountForRound if available
            if (typeof window.getUserConfirmedGameCountForRound === 'function') {
                try {
                    const count = window.getUserConfirmedGameCountForRound(uid, rNum);
                    if (count > 0) return true;
                } catch(e) {}
            }

            // 2. Check getUserPurchasesForRound if available
            if (typeof window.getUserPurchasesForRound === 'function') {
                try {
                    const p = window.getUserPurchasesForRound(uid, rNum);
                    if (Array.isArray(p) && p.length > 0) return true;
                } catch(e) {}
            }

            // 3. Check in-memory state.globalLedger
            let ledger = (window.state && window.state.globalLedger) ? window.state.globalLedger : null;

            // 4. Check state.allUsersPurchasesMap
            if ((!ledger || Object.keys(ledger).length === 0) && window.state && window.state.allUsersPurchasesMap && uid) {
                if (window.state.allUsersPurchasesMap[uid] && window.state.allUsersPurchasesMap[uid].ledger) {
                    ledger = window.state.allUsersPurchasesMap[uid].ledger;
                }
            }

            // 5. Check localStorage by multiple keys
            if (!ledger || Object.keys(ledger).length === 0) {
                const keys = [`lotto_actual_ledger_${uid}`, `lotto_actual_ledger_${uid.toLowerCase()}`, 'lotto_actual_ledger_guest'];
                for (const k of keys) {
                    const raw = localStorage.getItem(k);
                    if (raw) {
                        try {
                            const parsed = JSON.parse(raw);
                            if (parsed && typeof parsed === 'object') {
                                const rList = parsed[String(rNum)] || parsed[rNum];
                                if (Array.isArray(rList) && rList.some(r => r && Array.isArray(r.combos) && r.combos.length > 0)) {
                                    return true;
                                }
                            }
                        } catch(e) {}
                    }
                }
            }

            if (ledger) {
                const receipts = ledger[String(rNum)] || ledger[rNum] || [];
                if (Array.isArray(receipts) && receipts.some(r => r && Array.isArray(r.combos) && r.combos.length > 0)) {
                    return true;
                }
            }
        } catch (e) {}
        return false;
    },

    /**
     * 특정 회차의 사용자 실구매 영수증 목록 조회
     */
    getUserPurchases(userId, round) {
        const rNum = Number(round);
        if (isNaN(rNum) || rNum <= 0) return [];
        let uid = String(userId || '').trim().toLowerCase();

        // 1. Try window.getUserPurchasesForRound
        if (typeof window.getUserPurchasesForRound === 'function') {
            try {
                const p = window.getUserPurchasesForRound(uid || 'all', rNum);
                if (Array.isArray(p) && p.length > 0) return p;
            } catch(e) {}
        }

        // 2. Try window.state.allUsersPurchasesMap
        if (window.state && window.state.allUsersPurchasesMap) {
            const uData = window.state.allUsersPurchasesMap[uid] || window.state.allUsersPurchasesMap[uid.toLowerCase()];
            if (uData && uData.ledger) {
                const rList = uData.ledger[String(rNum)] || uData.ledger[rNum];
                if (Array.isArray(rList) && rList.length > 0) return rList;
            }
        }

        // 3. Try window.state.globalLedger
        if (window.state && window.state.globalLedger) {
            const rList = window.state.globalLedger[String(rNum)] || window.state.globalLedger[rNum];
            if (Array.isArray(rList) && rList.length > 0) return rList;
        }

        // 4. Try localStorage keys
        const keys = [
            `lotto_actual_ledger_${uid}`,
            `lotto_actual_ledger_${uid.toLowerCase()}`,
            'lotto_actual_ledger_guest',
            'lotto_actual_ledger_master',
            'lotto_actual_ledger_admin'
        ];
        for (const k of keys) {
            try {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        const rList = parsed[String(rNum)] || parsed[rNum];
                        if (Array.isArray(rList) && rList.length > 0) return rList;
                    }
                }
            } catch(e) {}
        }

        return [];
    },

    /**
     * 특정 회차의 공식 당첨번호 데이터 조회 (LOTTO_HISTORY / STATIC_DRAWS / state.lottoData)
     */
    getDrawData(round) {
        try {
            if (typeof LOTTO_HISTORY !== 'undefined' && LOTTO_HISTORY[String(round)]) {
                return LOTTO_HISTORY[String(round)];
            }
            if (typeof window !== 'undefined' && window.LOTTO_HISTORY && window.LOTTO_HISTORY[String(round)]) {
                return window.LOTTO_HISTORY[String(round)];
            }
            if (typeof window.getSafeActualDraw === 'function') {
                const d = window.getSafeActualDraw(round);
                if (d && Array.isArray(d.numbers) && d.numbers.length === 6) return d;
            }
            if (window.state && Array.isArray(window.state.lottoData)) {
                const found = window.state.lottoData.find(d => Number(d.round || d.drwNo) === Number(round));
                if (found && Array.isArray(found.numbers) && found.numbers.length === 6) return found;
            }
        } catch(e) {}
        return null;
    },

    /**
     * 실구매 영수증 게임들을 공식 당첨번호와 대조 채점
     */
    gradePurchases(receipts, drawData) {
        if (!drawData || !Array.isArray(drawData.numbers) || drawData.numbers.length !== 6) {
            return null;
        }
        const winSet = new Set(drawData.numbers);
        const bonus = drawData.bonus;
        const hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let totalGames = 0;
        let totalPrize = 0;
        let bestRank = 99;

        (receipts || []).forEach(rcpt => {
            if (!rcpt || !Array.isArray(rcpt.combos)) return;
            rcpt.combos.forEach(combo => {
                const nums = Array.isArray(combo) ? combo : (combo.numbers || []);
                if (!Array.isArray(nums) || nums.length < 6) return;
                totalGames++;
                const matchCount = nums.filter(n => winSet.has(n)).length;
                const hasBonus = bonus ? nums.includes(bonus) : false;

                let rank = 0;
                let prize = 0;
                if (matchCount === 6) {
                    rank = 1;
                    prize = drawData.rank1Prize || 2000000000;
                } else if (matchCount === 5 && hasBonus) {
                    rank = 2;
                    prize = drawData.rank2Prize || 50000000;
                } else if (matchCount === 5) {
                    rank = 3;
                    prize = drawData.rank3Prize || 1500000;
                } else if (matchCount === 4) {
                    rank = 4;
                    prize = drawData.rank4Prize || 50000;
                } else if (matchCount === 3) {
                    rank = 5;
                    prize = drawData.rank5Prize || 5000;
                }

                if (rank >= 1 && rank <= 5) {
                    hits[rank]++;
                    totalPrize += prize;
                    if (rank < bestRank) bestRank = rank;
                }
            });
        });

        const totalWins = hits[1] + hits[2] + hits[3] + hits[4] + hits[5];
        return { totalGames, totalWins, totalPrize, bestRank, hits };
    },

    /**
     * 실구매 등록 성공 시 호출되는 알림 동기화 핸들러:
     * 이미 등록된 해당 회차의 구매 독려 알림 자동 정리 및 알림 배지 리셋
     */
    onPurchaseRegistered(round) {
        try {
            const rNum = Number(round) || this.getUpcomingRoundNumber();
            console.log(`[PushClient] Purchase registered for round ${rNum}. Dismissing reminders...`);
            this.dismissPurchaseRemindersForRound(rNum);
            this.updateBannerVisibility();
        } catch(e) {
            console.warn('[PushClient] onPurchaseRegistered error:', e);
        }
    },

    /**
     * 해당 회차 구매 완료 시 미구매 유도/마감 리마인더 알림 자동 읽음 처리 및 OS 알림 닫기
     */
    dismissPurchaseRemindersForRound(round) {
        try {
            const rNum = Number(round) || this.getUpcomingRoundNumber();
            const list = this.getNotifications();
            let changed = false;
            list.forEach(item => {
                if (!item) return;
                const isRoundLock = item.id && (item.id.includes(`lock-reminder-${rNum}`) || item.id.includes('lock-reminder'));
                const isPurchasePrompt = item.body && (
                    item.body.includes('구매 등록 전이시라면') ||
                    item.body.includes('실구매 영수증 등록') ||
                    item.body.includes('구매등록 전') ||
                    item.body.includes('실물 복권을 구매하셨다면')
                );
                if ((isRoundLock || isPurchasePrompt) && item.unread) {
                    item.unread = false;
                    item.badge = '✅ 구매완료 (알림 종료)';
                    changed = true;
                }
            });
            if (changed) {
                this.saveNotifications(list);
            }

            // 스마트폰 OS 알림 트레이에 남아있는 리마인더 팝업 즉시 닫기
            if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.getNotifications().then(notifs => {
                        notifs.forEach(n => {
                            if (n && n.tag && (n.tag.includes(`lock-reminder-${rNum}`) || n.tag.includes('myeongri-'))) {
                                n.close();
                            }
                        });
                    }).catch(() => {});
                }).catch(() => {});
            }
        } catch(e) {
            console.warn('[PushClient] dismissPurchaseRemindersForRound error:', e);
        }
    },

    /**
     * 진행 중인 목표 회차 계산 (2002-12-07 1회 기준)
     */
    getUpcomingRoundNumber() {
        try {
            if (typeof window.getUpcomingLottoRound === 'function') {
                return window.getUpcomingLottoRound();
            }
            if (window.state && Array.isArray(window.state.lottoData) && window.state.lottoData.length > 0) {
                const maxDraw = Math.max(...window.state.lottoData.map(d => Number(d.round || d.drwNo || 0)));
                if (maxDraw > 1000) return maxDraw + 1;
            }
        } catch (e) {}
        const baseDate = new Date('2002-12-07T20:00:00+09:00');
        const diffWeeks = Math.floor((Date.now() - baseDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        return 1 + diffWeeks + 1;
    },

    /**
     * 🔮 스마트 하이브리드 스케줄러:
     * 앱 접속 또는 포그라운드 복귀 시 오늘의 [사주 길일], [사주 길시(1시간 전 및 진행중)], [토요일 마감 임박], [추첨 결과 발표]를 자동 점검하여
     * 놓친 알림을 미확인 알림함에 자동 생성하고 필요 시 브라우저 알림을 발송합니다.
     */
    checkAndGenerateScheduledAlerts(isInitialSubscribe = false) {
        try {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const dateKey = `${yyyy}-${mm}-${dd}`;
            const daysKo = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
            const todayName = daysKo[now.getDay()];
            const curMinutes = now.getHours() * 60 + now.getMinutes();

            const targetRound = this.getUpcomingRoundNumber();
            const alreadyPurchased = this.hasPurchasedCurrentRound(targetRound);
            const dispName = this.getUserDisplayName();
            const schedule = this.getMyeongriSchedule();

            let uid = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
            if (typeof uid === 'string' && uid.startsWith('{')) {
                try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
            }
            uid = String(uid || 'guest').trim().toLowerCase();

            // 토요일 20:00 이후는 이번 주 복권 판매 종료 및 추첨/정산 시간대
            const isSaturdayPostDraw = (todayName === '토요일' && curMinutes >= 20 * 60);

            // 이번 회차 구매가 완료되었거나 토요일 20:00 마감 이후인 경우: 기존 미구매 유도 알림 자동 정리 및 신규 리마인더 발송 차단
            if (alreadyPurchased || isSaturdayPostDraw) {
                this.dismissPurchaseRemindersForRound(targetRound);
                if (isSaturdayPostDraw) {
                    this.dismissPurchaseRemindersForRound(targetRound - 1);
                }
            }

            // 1. 사주 길일·길시 알림 체크 (미구매 & 토요일 20:00 판매마감 이전 시에만 생성)
            if (schedule && !alreadyPurchased && !isSaturdayPostDraw) {
                const isPrimaryDay = Array.isArray(schedule.primaryDays) && schedule.primaryDays.includes(todayName);
                const isSecondaryDay = Array.isArray(schedule.secondaryDays) && schedule.secondaryDays.includes(todayName);
                const isAuspiciousDay = isPrimaryDay || isSecondaryDay || todayName === '토요일';

                // 1-A) 오늘의 길일 브리핑 알림 (오전 08:00 이후)
                if ((isPrimaryDay || isSecondaryDay) && curMinutes >= 8 * 60) {
                    const dayRankLabel = isPrimaryDay ? '1순위 황금 재물 길일' : '2순위 재물 길일';
                    this.addNotification({
                        id: `myeongri-day-${dateKey}`,
                        category: 'myeongri',
                        badge: `☀️ 오늘의 ${isPrimaryDay ? '1순위' : '2순위'} 길일`,
                        title: `오늘은 ${dispName}의 ${dayRankLabel}(${todayName})입니다!`,
                        body: `${schedule.stemName}(${schedule.elementKo}) 일간 기준 오늘의 추천 집중 길시는 [${schedule.timeSlot1}] 및 [${schedule.timeSlot2}]이며, 행운 색상은 [${schedule.luckyColor}]입니다.`,
                        timeLabel: `오늘 (${todayName}) 길일 안내`,
                        unread: true,
                        actionType: 'fortune',
                        actionLabel: '🧭 사주 길일·길시 상세 보기'
                    }, false);
                }

                // 1-B) 오늘의 길시 1시간 전 & 진행중 알림 체크
                if (isAuspiciousDay) {
                    const slots = [
                        { label: schedule.timeSlot1, rank: '1순위 집중 길시' },
                        { label: schedule.timeSlot2, rank: '2순위 보조 길시' }
                    ].filter(s => s.label);

                    slots.forEach((slotObj, idx) => {
                        const match = slotObj.label.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
                        if (!match) return;
                        const startMin = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
                        const endMin = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
                        const oneHourBeforeMin = startMin - 60;

                        if (curMinutes >= oneHourBeforeMin) {
                            const isCurrentlyActive = curMinutes >= startMin && curMinutes <= endMin;
                            const isPreAlertWindow = curMinutes >= oneHourBeforeMin && curMinutes < startMin;
                            const statusTitle = isPreAlertWindow
                                ? `[길시 1시간 전] ${dispName}의 ${slotObj.rank}(${slotObj.label}) 도래 안내`
                                : (isCurrentlyActive
                                    ? `[지금은 황금 길시!] ${dispName}의 ${slotObj.rank}(${slotObj.label}) 진행 중`
                                    : `[오늘의 길시 알림] ${dispName}의 ${slotObj.rank}(${slotObj.label}) 안내`);

                            this.addNotification({
                                id: `myeongri-slot${idx + 1}-${dateKey}`,
                                category: 'myeongri',
                                badge: isCurrentlyActive ? '🔮 황금 길시 진행중' : '🔮 사주 길시 알림',
                                title: statusTitle,
                                body: `오늘(${todayName}) ${dispName}의 일간(${schedule.stemName})과 재성(${schedule.wealthElementKo}) 기운이 조화를 이루는 [${slotObj.label}] 시간대입니다. 아직 제 ${targetRound}회차 구매 등록 전이시라면 맞춤 번호를 확인해 보세요.`,
                                timeLabel: `오늘 ${match[1]}:${match[2]} 길시`,
                                unread: true,
                                actionType: 'generator',
                                actionLabel: '🎱 길시 맞춤 번호 생성하기'
                            }, !isSaturdayPostDraw && (isPreAlertWindow || isCurrentlyActive));
                        }
                    });
                }
            }

            // 2. 토요일 판매 마감 임박 리마인더 (토요일 18:00 ~ 20:00 사이, 미구매 회원)
            if (todayName === '토요일' && curMinutes >= 18 * 60 && curMinutes < 20 * 60 && !alreadyPurchased) {
                this.addNotification({
                    id: `lock-reminder-${targetRound}`,
                    category: 'reminder',
                    badge: '⏰ 마감 임박 리마인더',
                    title: `제 ${targetRound}회차 로또 판매 마감(20:00) 임박 안내`,
                    body: `오늘 20:00에 제 ${targetRound}회차 복권 판매 및 실구매 인증이 마감됩니다. 실물 복권을 구매하셨다면 지금 QR 스캔으로 간편 등록하세요.`,
                    timeLabel: '오늘 토요일 마감 안내',
                    unread: true,
                    actionType: 'qr',
                    actionLabel: '📷 실구매 QR 영수증 등록하기'
                }, true);
            }

            // 3. 최신 회차 추첨 결과 & 실구매 채점 당첨 축하 알림 (완료된 최신 추첨 회차 기준)
            let latestDrawnRound = targetRound - 1;
            if (typeof window.getLatestDrawnRound === 'function') {
                try {
                    const ldr = window.getLatestDrawnRound();
                    if (ldr && ldr > 1000) latestDrawnRound = ldr;
                } catch(e) {}
            }

            if (latestDrawnRound >= 1235) {
                const drawData = this.getDrawData(latestDrawnRound);
                if (drawData && Array.isArray(drawData.numbers) && drawData.numbers.length === 6) {
                    const seenDrawKey = `lucky777_draw_evaluated_${latestDrawnRound}_${uid}_v2`;
                    if (!localStorage.getItem(seenDrawKey)) {
                        localStorage.setItem(seenDrawKey, 'true');

                        const userPurchases = this.getUserPurchases(uid, latestDrawnRound);
                        const grade = this.gradePurchases(userPurchases, drawData);

                        if (grade && grade.totalGames > 0 && grade.totalWins > 0) {
                            // 3-A) 실구매 복권 당첨 축하 알림 (1등~5등 당첨자)
                            const hitsArray = [];
                            if (grade.hits[1]) hitsArray.push(`1등 ${grade.hits[1]}건`);
                            if (grade.hits[2]) hitsArray.push(`2등 ${grade.hits[2]}건`);
                            if (grade.hits[3]) hitsArray.push(`3등 ${grade.hits[3]}건`);
                            if (grade.hits[4]) hitsArray.push(`4등 ${grade.hits[4]}건`);
                            if (grade.hits[5]) hitsArray.push(`5등 ${grade.hits[5]}건`);
                            const hitsDesc = hitsArray.join(', ');

                            this.addNotification({
                                id: `win-celebrate-${latestDrawnRound}`,
                                category: 'result',
                                badge: '🎉 실구매 당첨 축하',
                                title: `🎉 [당첨 축하] 제 ${latestDrawnRound}회차 실구매 ${grade.totalWins}건 당첨! (${grade.bestRank}등 등 총 ${grade.totalPrize.toLocaleString()}원)`,
                                body: `${dispName}의 제 ${latestDrawnRound}회차 실구매 복권 ${grade.totalGames}게임 채점 결과, ${hitsDesc} 총 ${grade.totalWins}건(${grade.totalPrize.toLocaleString()}원)에 당첨되셨습니다! 확정 장부에서 상세 결과를 확인하세요.`,
                                timeLabel: `제 ${latestDrawnRound}회 당첨 확인`,
                                unread: true,
                                actionType: 'confirmed',
                                actionLabel: '📊 당첨 복권 내역 확인하기'
                            }, true);
                        } else if (grade && grade.totalGames > 0 && grade.totalWins === 0) {
                            // 3-B) 실구매 복권 채점 완료 (낙첨) 알림
                            this.addNotification({
                                id: `draw-result-${latestDrawnRound}`,
                                category: 'result',
                                badge: '📊 실구매 채점 완료',
                                title: `📊 [제 ${latestDrawnRound}회 채점 완료] 실구매 복권 ${grade.totalGames}게임 정산 안내`,
                                body: `제 ${latestDrawnRound}회차 공식 당첨번호 [${drawData.numbers.join(', ')}] + 보너스 [${drawData.bonus}] 채점이 완료되었습니다. 아쉽게도 이번 회차는 미당첨되었습니다. 다음 제 ${targetRound}회차 AI 맞춤 조합을 확인해 보세요.`,
                                timeLabel: `제 ${latestDrawnRound}회 정산 완료`,
                                unread: true,
                                actionType: 'confirmed',
                                actionLabel: '📊 채점 장부 확인하기'
                            }, true);
                        } else {
                            // 3-C) 미구매 회원 공식 추첨 결과 리포트
                            const firstPrizeText = drawData.rank1Prize ? `${(drawData.rank1Prize / 100000000).toFixed(1)}억 원` : '';
                            const prizeInfo = firstPrizeText ? ` (1등 ${firstPrizeText})` : '';
                            this.addNotification({
                                id: `draw-result-${latestDrawnRound}`,
                                category: 'result',
                                badge: '🏆 추첨 결과 리포트',
                                title: `🏆 [제 ${latestDrawnRound}회 공식 결과] 1등 [${drawData.numbers.join(', ')}] + ${drawData.bonus}`,
                                body: `제 ${latestDrawnRound}회차 로또 추첨이 완료되었습니다${prizeInfo}. AI 추천번호 복기 결과 및 이번 주 제 ${targetRound}회차 맞춤 번호를 확인해 보세요.`,
                                timeLabel: `제 ${latestDrawnRound}회 추첨 발표`,
                                unread: true,
                                actionType: 'confirmed',
                                actionLabel: '📊 당첨 결과 확인하기'
                            }, true);
                        }
                    }
                }
            }

            // 4. 차기 회차 AI 퀀트 맞춤 추천번호 오픈 알림 (신규 회차 1회 발송)
            if (targetRound >= 1246) {
                const seenRecKey = `lucky777_rec_announced_${targetRound}_${uid}_v2`;
                if (!localStorage.getItem(seenRecKey)) {
                    // 토요일 20:00 이후 또는 일~금요일 등 신규 회차가 활성화된 시점에 안내
                    const isRecOpenTime = isSaturdayPostDraw || todayName !== '토요일' || curMinutes < 18 * 60;
                    if (isRecOpenTime) {
                        localStorage.setItem(seenRecKey, 'true');
                        this.addNotification({
                            id: `rec-ready-${targetRound}`,
                            category: 'generator',
                            badge: '🎱 차기 추천번호 오픈',
                            title: `🎱 [AI 퀀트 맞춤] 제 ${targetRound}회차 AI 추천번호 및 10대 알고리즘 조합 오픈!`,
                            body: `${dispName}을 위한 제 ${targetRound}회차 AI 퀀트 알고리즘(올라운더 1·2·3 최신 엔진) 맞춤 추천번호 조합이 생성되었습니다. 지금 이번 주 최적 팩을 확인해 보세요.`,
                            timeLabel: `제 ${targetRound}회 추천 오픈`,
                            unread: true,
                            actionType: 'generator',
                            actionLabel: '🎱 이번주 추천번호 확인하기'
                        }, true);
                    }
                }
            }

            this.renderUnreadNotificationUI();
        } catch (err) {
            console.warn('[PushClient] checkAndGenerateScheduledAlerts error:', err);
        }
    },

    /**
     * 알림 액션 실행 (번호생성 / QR등록 / 사주운세 / 당첨확인 탭 이동)
     */
    handleNotificationAction(notifId) {
        const list = this.getNotifications();
        const target = list.find(n => n && n.id === notifId);
        this.markNotificationRead(notifId);
        this.closeNotificationCenterModal();

        const actionType = target ? target.actionType : 'generator';
        if (actionType === 'qr') {
            if (typeof window.showLotto === 'function') window.showLotto();
            setTimeout(() => {
                if (typeof window.openManualLedgerModal === 'function') window.openManualLedgerModal();
                else if (document.getElementById('btnOpenManualLedger')) document.getElementById('btnOpenManualLedger').click();
            }, 120);
        } else if (actionType === 'confirmed') {
            if (typeof window.showLotto === 'function') window.showLotto();
            setTimeout(() => {
                if (typeof window.switchLottoTab === 'function') window.switchLottoTab('tab-confirmed-list');
                else if (typeof window.switchTab === 'function') window.switchTab('tab-confirmed-list');
            }, 100);
        } else if (actionType === 'fortune') {
            if (typeof window.showLotto === 'function') window.showLotto();
            setTimeout(() => {
                if (typeof window.switchTab === 'function') window.switchTab('tab-dashboard');
                const el = document.getElementById('dashboardFortuneAdvisorContainer');
                if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        } else {
            if (typeof window.showLotto === 'function') window.showLotto();
            setTimeout(() => {
                if (typeof window.switchLottoTab === 'function') window.switchLottoTab('tab-generator');
                else if (typeof window.switchTab === 'function') window.switchTab('tab-generator');
            }, 100);
        }
    },

    /**
     * 대시보드(홈 & 로또 대시보드) 미확인 알림 배너 및 상단 헤더 배지 실시간 렌더링
     */
    renderUnreadNotificationUI() {
        const list = this.getNotifications();
        const unreadList = list.filter(n => n && n.unread);
        const unreadCount = unreadList.length;

        // 1. 모바일/데스크톱 상단 알림 버튼에 미확인 건수 배지 업데이트
        const mobileBtn = document.getElementById('lpMobilePushBtn');
        if (mobileBtn) {
            const txtEl = mobileBtn.querySelector('.lp-dday-text');
            if (txtEl) {
                txtEl.innerHTML = unreadCount > 0
                    ? `알림 <span style="display:inline-block; background:#ef4444; color:#fff; font-size:0.65rem; font-weight:900; padding:0 5px; border-radius:999px; margin-left:2px; line-height:1.35;">${unreadCount}</span>`
                    : '알림함';
            }
            mobileBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                this.openNotificationCenterModal();
            };
        }

        const desktopBtn = document.getElementById('btnPushNotifyTop');
        if (desktopBtn) {
            desktopBtn.innerHTML = unreadCount > 0
                ? `<i class="fa-solid fa-bell"></i> <span>미확인 알림</span> <span style="background:#ef4444; color:#fff; font-size:0.7rem; font-weight:900; padding:1px 6px; border-radius:999px; margin-left:4px;">${unreadCount}</span>`
                : `<i class="fa-solid fa-bell"></i> <span>알림함</span>`;
            desktopBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                this.openNotificationCenterModal();
            };
        }

        // 2. 홈 대시보드 & 로또 대시보드 미확인 알림 브리핑 배너 렌더링
        this.ensureDashboardUnreadContainers();
        const containers = document.querySelectorAll('.lucky777-unread-banner-slot');
        containers.forEach(slot => {
            if (unreadCount === 0) {
                slot.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 14px; border-radius:12px; background:rgba(15,23,42,0.72); border:1px solid rgba(255,255,255,0.08); margin-bottom:10px; font-size:0.76rem; color:#94a3b8;">
                        <div style="display:flex; align-items:center; gap:7px; min-width:0;">
                            <span style="color:#10b981; font-weight:900;">✓</span>
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">길일·길시 및 추첨 알림을 모두 확인하셨습니다.</span>
                        </div>
                        <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal()" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#fbbf24; font-size:0.72rem; font-weight:800; padding:4px 10px; border-radius:8px; cursor:pointer; flex-shrink:0;">
                            🔔 알림함 (${list.length})
                        </button>
                    </div>
                `;
                return;
            }

            const latest = unreadList[0];
            slot.innerHTML = `
                <div style="background:linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(15,23,42,0.92) 65%, rgba(30,41,59,0.92) 100%); border:1.5px solid rgba(245,158,11,0.45); border-radius:14px; padding:11px 14px; margin-bottom:12px; box-shadow:0 6px 20px rgba(245,158,11,0.12);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:7px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#fbbf24; box-shadow:0 0 8px #fbbf24;"></span>
                            <span style="font-size:0.8rem; font-weight:900; color:#fbbf24;">🔔 미확인 알림 ${unreadCount}건</span>
                            <span style="font-size:0.68rem; padding:1px 6px; border-radius:6px; background:rgba(245,158,11,0.2); color:#fde68a; font-weight:800;">${latest.badge || '길일·길시'}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button type="button" onclick="window.PushClient && window.PushClient.markAllNotificationsRead()" style="background:transparent; border:none; color:#cbd5e1; font-size:0.72rem; font-weight:700; text-decoration:underline; cursor:pointer; padding:2px 4px;">
                                모두 읽음
                            </button>
                            <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal()" style="background:rgba(245,158,11,0.2); border:1px solid rgba(245,158,11,0.45); color:#fde047; font-size:0.72rem; font-weight:800; padding:3px 9px; border-radius:7px; cursor:pointer;">
                                전체보기 (${unreadCount}) ›
                            </button>
                        </div>
                    </div>
                    <div onclick="window.PushClient && window.PushClient.openNotificationCenterModal()" style="background:rgba(9,13,22,0.75); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:9px 11px; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
                        <div style="min-width:0; flex:1;">
                            <div style="font-size:0.8rem; font-weight:800; color:#ffffff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${latest.title}</div>
                            <div style="font-size:0.73rem; color:#cbd5e1; margin-top:2px; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${latest.body}</div>
                        </div>
                        <button type="button" onclick="event.stopPropagation(); window.PushClient && window.PushClient.markNotificationRead('${latest.id}')" style="background:#f59e0b; color:#0f172a; border:none; font-size:0.73rem; font-weight:900; padding:6px 11px; border-radius:8px; cursor:pointer; flex-shrink:0;">
                            확인 ✓
                        </button>
                    </div>
                </div>
            `;
        });

        // 모달이 열려 있다면 내부 리스트도 즉시 갱신
        const modalEl = document.getElementById('lucky777NotificationCenterModal');
        if (modalEl && modalEl.style.display === 'flex') {
            this.renderNotificationCenterModalContent();
        }
    },

    /**
     * 홈 대시보드 및 로또 대시보드 상단에 미확인 알림 슬롯 자동 주입
     */
    ensureDashboardUnreadContainers() {
        // 1) 홈 대시보드: #landingFortuneAdvisorContainer 위 또는 #lpDrawCountdownBanner 아래
        if (!document.getElementById('landingUnreadNotificationSlot')) {
            const fortuneEl = document.getElementById('landingFortuneAdvisorContainer');
            const countdownEl = document.getElementById('lpDrawCountdownBanner');
            const slot = document.createElement('div');
            slot.id = 'landingUnreadNotificationSlot';
            slot.className = 'lucky777-unread-banner-slot';
            slot.style.cssText = 'width: 100%; max-width: 900px; margin: 0 auto 4px auto; box-sizing: border-box;';
            if (fortuneEl && fortuneEl.parentNode) {
                fortuneEl.parentNode.insertBefore(slot, fortuneEl);
            } else if (countdownEl && countdownEl.parentNode) {
                countdownEl.parentNode.insertBefore(slot, countdownEl.nextSibling);
            }
        }

        // 2) 로또 대시보드(통계분석/사주 탭): #dashboardFortuneAdvisorContainer 위
        if (!document.getElementById('lottoDashUnreadNotificationSlot')) {
            const dashFortuneEl = document.getElementById('dashboardFortuneAdvisorContainer');
            if (dashFortuneEl && dashFortuneEl.parentNode) {
                const slot2 = document.createElement('div');
                slot2.id = 'lottoDashUnreadNotificationSlot';
                slot2.className = 'lucky777-unread-banner-slot';
                slot2.style.cssText = 'width: 100%; box-sizing: border-box; margin-bottom: 8px;';
                dashFortuneEl.parentNode.insertBefore(slot2, dashFortuneEl);
            }
        }
    },

    /**
     * 통합 미확인 알림 센터 모달 열기
     */
    openNotificationCenterModal(filter = 'all') {
        this._currentModalFilter = filter || this._currentModalFilter || 'all';
        let modal = document.getElementById('lucky777NotificationCenterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lucky777NotificationCenterModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(7,10,20,0.85); backdrop-filter:blur(8px); z-index:100000; display:none; align-items:center; justify-content:center; padding:14px; box-sizing:border-box;';
            modal.onclick = (e) => {
                if (e.target === modal) this.closeNotificationCenterModal();
            };
            document.body.appendChild(modal);
        }
        this.renderNotificationCenterModalContent();
        modal.style.display = 'flex';
    },

    closeNotificationCenterModal() {
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal) modal.style.display = 'none';
    },

    renderNotificationCenterModalContent() {
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (!modal) return;

        const list = this.getNotifications();
        const unreadCount = list.filter(n => n && n.unread).length;
        const filter = this._currentModalFilter || 'all';
        const filtered = filter === 'unread'
            ? list.filter(n => n && n.unread)
            : (filter === 'myeongri'
                ? list.filter(n => n && n.category === 'myeongri')
                : (filter === 'admin'
                    ? list.filter(n => n && (n.category === 'admin' || String(n.id || '').startsWith('admin-msg-')))
                    : list));

        const schedule = this.getMyeongriSchedule();
        const isPermGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
        const isSubscribed = isPermGranted && localStorage.getItem('lucky777_push_subscribed') === 'true';

        const scheduleSummaryHtml = schedule
            ? `<div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:9px 12px; margin-bottom:10px; font-size:0.74rem; color:#e2e8f0; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                <div>
                    <span style="color:#fbbf24; font-weight:800;">🧭 내 사주 길일·길시 스케줄:</span>
                    <strong style="color:#fff; margin-left:4px;">${schedule.primaryDayShort || '토요일'}</strong> · 집중 길시 <strong style="color:#fde047;">${schedule.timeSlot1}</strong>
                </div>
                <span style="font-size:0.68rem; padding:2px 7px; border-radius:999px; background:${isSubscribed ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}; color:${isSubscribed ? '#34d399' : '#fbbf24'}; font-weight:800;">
                    ${isSubscribed ? '🟢 푸시+앱내 자동감지 활성' : '⚡ 앱내 길일·길시 자동감지 활성'}
                </span>
               </div>`
            : `<div style="background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:10px; padding:9px 12px; margin-bottom:10px; font-size:0.74rem; color:#cbd5e1; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <span>💡 생년월일을 등록하시면 사주 맞춤 길일·길시 알림이 자동 생성됩니다.</span>
                <button type="button" onclick="window.PushClient.handleNotificationAction('fortune')" style="background:#3b82f6; color:#fff; border:none; padding:4px 9px; border-radius:6px; font-size:0.7rem; font-weight:800; cursor:pointer;">등록하기</button>
               </div>`;

        const itemsHtml = filtered.length === 0
            ? `<div style="padding:36px 16px; text-align:center; color:#94a3b8; font-size:0.82rem;">
                <div style="font-size:1.8rem; margin-bottom:8px;">✨</div>
                <div>표시할 알림이 없습니다.</div>
               </div>`
            : filtered.map(item => `
                <div onclick="window.PushClient && window.PushClient.markNotificationRead('${item.id}')" style="background:${item.unread ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.55)'}; border:1.5px solid ${item.unread ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.07)'}; border-radius:12px; padding:12px 14px; cursor:pointer; transition:all 0.2s; opacity:${item.unread ? '1' : '0.72'};">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${item.unread
                                ? '<span style="width:8px; height:8px; border-radius:50%; background:#fbbf24; display:inline-block;"></span><span style="font-size:0.68rem; font-weight:900; color:#fbbf24;">미확인</span>'
                                : '<span style="font-size:0.68rem; font-weight:800; color:#10b981;">✓ 확인완료</span>'}
                            <span style="font-size:0.68rem; padding:1px 7px; border-radius:6px; background:rgba(245,158,11,0.18); color:#fde68a; border:1px solid rgba(245,158,11,0.3); font-weight:800;">${item.badge || '🔔 알림'}</span>
                        </div>
                        <span style="font-size:0.68rem; color:#94a3b8;">${item.timeLabel || ''}</span>
                    </div>
                    <div style="font-size:0.84rem; font-weight:800; color:${item.unread ? '#ffffff' : '#cbd5e1'}; line-height:1.35;">${item.title}</div>
                    <div style="font-size:0.76rem; color:#94a3b8; margin-top:4px; line-height:1.5; white-space:pre-line;">${item.body}</div>
                    <div style="margin-top:9px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; gap:8px;">
                        <button type="button" onclick="event.stopPropagation(); window.PushClient && window.PushClient.handleNotificationAction('${item.id}')" style="background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.4); color:#fbbf24; font-size:0.73rem; font-weight:800; padding:4px 10px; border-radius:7px; cursor:pointer;">
                            ${item.actionLabel || '🎱 바로가기'} →
                        </button>
                        <span style="font-size:0.68rem; color:${item.unread ? '#fbbf24' : '#64748b'}; font-weight:700;">
                            ${item.unread ? '탭하여 읽음 처리' : '읽음'}
                        </span>
                    </div>
                </div>
            `).join('');

        modal.innerHTML = `
            <div style="width:100%; max-width:520px; max-height:88vh; background:#0f172a; border:1.5px solid rgba(245,158,11,0.4); border-radius:18px; box-shadow:0 24px 60px rgba(0,0,0,0.85); display:flex; flex-direction:column; overflow:hidden;">
                <!-- Header -->
                <div style="padding:14px 16px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:1.2rem;">🔔</span>
                        <div>
                            <div style="font-size:0.95rem; font-weight:900; color:#fff; display:flex; align-items:center; gap:6px;">
                                <span>운도실력 통합 알림 센터</span>
                                <span style="font-size:0.7rem; padding:1px 7px; border-radius:999px; background:${unreadCount > 0 ? '#ef4444' : 'rgba(16,185,129,0.2)'}; color:${unreadCount > 0 ? '#fff' : '#34d399'}; font-weight:900;">
                                    ${unreadCount > 0 ? `미확인 ${unreadCount}건` : '모두 확인'}
                                </span>
                            </div>
                            <div style="font-size:0.7rem; color:#94a3b8;">관리자 메시지 · 사주 길일·길시 · 마감 임박 · 추첨 결과</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.PushClient && window.PushClient.closeNotificationCenterModal()" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; width:30px; height:30px; border-radius:50%; font-size:1.1rem; cursor:pointer;">&times;</button>
                </div>

                <!-- Sub Toolbar -->
                <div style="padding:10px 14px; background:#090d16; border-bottom:1px solid rgba(255,255,255,0.06);">
                    ${scheduleSummaryHtml}
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                            <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal('all')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'all' ? '#f59e0b' : '#1e293b'}; color:${filter === 'all' ? '#0f172a' : '#cbd5e1'};">
                                전체 (${list.length})
                            </button>
                            <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal('unread')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'unread' ? '#f59e0b' : '#1e293b'}; color:${filter === 'unread' ? '#0f172a' : '#cbd5e1'};">
                                미확인 (${unreadCount})
                            </button>
                            <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal('admin')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'admin' ? '#f59e0b' : '#1e293b'}; color:${filter === 'admin' ? '#0f172a' : '#cbd5e1'};">
                                👑 관리자 메시지
                            </button>
                            <button type="button" onclick="window.PushClient && window.PushClient.openNotificationCenterModal('myeongri')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'myeongri' ? '#f59e0b' : '#1e293b'}; color:${filter === 'myeongri' ? '#0f172a' : '#cbd5e1'};">
                                🔮 길일·길시
                            </button>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button type="button" onclick="window.PushClient && window.PushClient.markAllNotificationsRead()" style="padding:4px 9px; border-radius:7px; font-size:0.72rem; font-weight:800; background:rgba(255,255,255,0.07); color:#e2e8f0; border:1px solid rgba(255,255,255,0.12); cursor:pointer;">
                                ✓ 모두 읽음
                            </button>
                            <button type="button" onclick="window.handlePushNotificationToggle && window.handlePushNotificationToggle()" style="padding:4px 9px; border-radius:7px; font-size:0.72rem; font-weight:800; background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid rgba(59,130,246,0.4); cursor:pointer;">
                                ⚙️ 푸시 설정·테스트
                            </button>
                        </div>
                    </div>
                </div>

                <!-- List Body -->
                <div style="padding:12px 14px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;">
                    ${itemsHtml}
                </div>
            </div>
        `;
    },

    /**
     * 알림 수신 상태에 따라 홈화면 배너 숨김/표시 처리
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
                const bannerDesc = banner.querySelector('div[style*="font-size: 0.77rem"]') || banner.querySelector('.lp-push-banner-desc');
                if (bannerDesc) {
                    const disp = this.getUserDisplayName();
                    bannerDesc.textContent = `${disp}의 일간(日干)과 조화를 이루는 길시 1시간 전 스마트 알림 (해당 주차 구매등록 완료 시 알림 자동 생략)`;
                }
            }
        }

        if (popoverPushBtnText) {
            popoverPushBtnText.textContent = isSubscribed ? '맞춤 알림 관리 (수신 중 🟢)' : '맞춤 알림 설정 (길시 1시간 전)';
        }
        if (lpMobilePushBtn) {
            lpMobilePushBtn.title = '미확인 알림함 및 길일·길시 알림 설정';
        }

        if (typeof window !== 'undefined' && typeof window.renderPushNotificationMiniWidget === 'function') {
            try { window.renderPushNotificationMiniWidget(); } catch(e) {}
        }

        // 미확인 알림 UI 동기화
        this.renderUnreadNotificationUI();
    },

    /**
     * 🧪 알림 동작 테스트: 지정된 초(기본 3초) 뒤에 백그라운드 푸시 알림 팝업 + 미확인 알림함 기록
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
        const displayName = this.getUserDisplayName();
        const schedule = this.getMyeongriSchedule();
        const slotInfo = schedule ? `${schedule.primaryDayShort || '토요일'} ${schedule.timeSlot1}` : '맞춤 길시';
        const msg = `🧪 ${delaySec}초 뒤 [${displayName}]을 위한 길일·길시 테스트 알림이 발송됩니다!\n\n지금 스마트폰의 [전원 버튼]을 눌러 화면을 끄거나 대시보드 상단 [미확인 알림 배너]에 도착하는지 확인해 보세요.`;
        
        if (typeof window.showToast === 'function') {
            window.showToast(`🧪 ${delaySec}초 뒤 [${displayName}] 테스트 알림 발송!`);
        }
        alert(msg);

        setTimeout(() => {
            const origin = window.location.origin;
            const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
            const title = `🌿 [운도실력] ${displayName}의 길일·길시 알림 연결 완료`;
            const body = `${displayName}의 사주 맞춤 스케줄(${slotInfo}) 및 대시보드 미확인 알림함이 정상 연결되었습니다.`;

            reg.showNotification(title, {
                body,
                icon: `${origin}${basePath}icons/icon-192.png`,
                badge: `${origin}${basePath}icons/favicon.png`,
                vibrate: [200, 100, 200, 100, 400],
                tag: 'lucky777-test-alert',
                data: { url: `${origin}${basePath}?tab=tab-confirmed` }
            });

            this.addNotification({
                id: `test-alert-${Date.now()}`,
                category: 'myeongri',
                badge: '🧪 길일·길시 테스트',
                title,
                body,
                timeLabel: '방금 도착',
                unread: true,
                actionType: 'generator',
                actionLabel: '🎱 추천번호 확인하기'
            }, false);
        }, delaySec * 1000);
    },

    // =========================================================================
    // 📨 [관리자 → 회원 맞춤 메시지 발송 & 로그인 즉시 팝업 / 멀티채널 푸시 엔진]
    // =========================================================================
    ADMIN_MSG_TEMPLATES: {
        qr_remind: {
            badge: '📷 실구매 인증 안내',
            actionType: 'qr',
            actionLabel: '📷 지금 QR 영수증 등록하기',
            title: '제 {회차}회차 실구매 영수증(QR) 등록 안내',
            body: '안녕하세요, {회원명}님! 이번 주 제 {회차}회차 실구매 영수증 등록 마감이 다가오고 있습니다.\n복권을 구매하셨다면 QR 스캔으로 간편하게 실구매 인증을 완료해 주세요.'
        },
        win_congrats: {
            badge: '🎉 당첨 축하 메시지',
            actionType: 'confirmed',
            actionLabel: '📊 내 실구매 당첨장부 보기',
            title: '축하합니다! {회원명}님 실구매 당첨 결과 안내',
            body: '{회원명}님, 등록하신 실구매 복권에서 당첨이 확인되었습니다!\n구매확정 장부에서 상세 적중 번호(본번호 ✓ · 보너스 +)와 당첨금을 지금 확인해 보세요.'
        },
        myeongri_pick: {
            badge: '🔮 사주 길일·길시 특별 안내',
            actionType: 'generator',
            actionLabel: '🎱 이번주 추천번호 확인하기',
            title: '{회원명}님의 오늘 사주 재물운 길일·길시 안내',
            body: '{회원명}님의 사주 일간과 조화를 이루는 길일·길시 에너지가 활성화되었습니다.\n오늘 길시가 지나기 전에 AI 맞춤 추천번호를 생성해 보세요.'
        },
        account_notice: {
            badge: '🔓 계정 권한 안내',
            actionType: 'fortune',
            actionLabel: '🧭 대시보드 바로가기',
            title: '{회원명}님 계정 상태 및 이용 권한 업데이트 안내',
            body: '{회원명}님의 계정 권한이 정상 활성화되었습니다.\n지금 바로 로또 퀀트 추천 및 대시보드 모든 기능을 자유롭게 이용하실 수 있습니다.'
        },
        general_notice: {
            badge: '📢 관리자 공지사항',
            actionType: 'generator',
            actionLabel: '🎱 추천번호 연구소 이동',
            title: '[운도실력] {회원명}님을 위한 주요 업데이트 안내',
            body: '{회원명}님, 당첨번호 적중 체크(✓/+) 고도화 및 대시보드 미확인 알림함이 새롭게 업데이트되었습니다.\n더욱 편리해진 운도실력을 경험해 보세요!'
        }
    },

    _adminMsgUnsubscribe: null,
    _adminMsgActiveUserId: null,
    _adminPopupQueue: [],

    /**
     * 회원 로그인 시(또는 앱 실행 시) 해당 회원의 Firestore 문서를 실시간 감시하여
     * 관리자가 보낸 미확인 메시지가 있으면:
     * 1) 푸시 동의 회원에게 스마트폰 상단 배너+진동 알림 즉시 발생
     * 2) 대시보드 미확인 알림함에 자동 적재
     * 3) 화면 중앙에 [관리자 메시지 도착 팝업 모달] 즉시 표시
     */
    startAdminMessageListener(userId) {
        let uid = userId;
        if (!uid && typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) {
            uid = window.SafeAuth.get();
        }
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }
        uid = String(uid || '').trim();
        if (!uid || !window.db) return;

        if (this._adminMsgActiveUserId === uid && this._adminMsgUnsubscribe) {
            // 이미 동일 회원으로 실시간 리스너가 연결되어 있으면 1회 수동 점검만 수행
            window.db.collection('lotto_users').doc(uid).get().then(doc => {
                if (doc && doc.exists) {
                    this.processIncomingAdminMessages(uid, doc.data() || {});
                }
            }).catch(() => {});
            return;
        }

        if (this._adminMsgUnsubscribe) {
            try { this._adminMsgUnsubscribe(); } catch (e) {}
            this._adminMsgUnsubscribe = null;
        }
        this._adminMsgActiveUserId = uid;

        try {
            this._adminMsgUnsubscribe = window.db.collection('lotto_users').doc(uid).onSnapshot((doc) => {
                if (!doc || !doc.exists) return;
                const uData = doc.data() || {};
                this.processIncomingAdminMessages(uid, uData);
            }, (err) => {
                console.warn('[PushClient] Admin message listener warning:', err);
            });
        } catch (err) {
            console.warn('[PushClient] Failed to attach admin message listener:', err);
        }
    },

    processIncomingAdminMessages(userId, uData) {
        if (!uData || !uData.adminMessages || typeof uData.adminMessages !== 'object') return;
        const msgMap = uData.adminMessages;
        const allMsgs = Object.values(msgMap)
            .filter(m => m && m.id && m.title)
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        if (allMsgs.length === 0) return;

        const unreadMsgs = [];
        allMsgs.forEach(msg => {
            const inboxId = `admin-msg-${msg.id}`;
            const existingList = this.getNotifications();
            const existingItem = existingList.find(it => it && (
                it.id === inboxId ||
                it.id === `push-${inboxId}` ||
                (it.title === msg.title && it.body === (msg.body || ''))
            ));
            const isReadLocally = !!(existingItem && !existingItem.unread);
            const isUnread = (msg.status !== 'read') && !isReadLocally;
            const notifiedKey = `lucky777_admin_notified_${userId}_${msg.id}`;
            const alreadyAlerted = localStorage.getItem(notifiedKey) === 'true';

            if (msg.saveToInbox !== false) {
                if (!existingItem) {
                    if (isUnread && !alreadyAlerted) {
                        localStorage.setItem(notifiedKey, 'true');
                    }
                    this.addNotification({
                        id: inboxId,
                        category: 'admin',
                        badge: msg.badge || '👑 관리자 안내',
                        title: msg.title,
                        body: msg.body || '',
                        createdAt: msg.createdAt || new Date().toISOString(),
                        timeLabel: this.formatTimeLabel(msg.createdAt),
                        unread: isUnread,
                        actionType: msg.actionType || 'generator',
                        actionLabel: msg.actionLabel || '🎱 바로 확인하기'
                    }, isUnread && !alreadyAlerted);
                } else if (!isUnread && existingItem.unread) {
                    existingItem.unread = false;
                    this.saveNotifications(existingList);
                }
            } else if (isUnread && !alreadyAlerted) {
                // 알림함 저장 없이 푸시만 보낸 경우에도 푸시 동의 사용자에게 브라우저 알림 발송
                localStorage.setItem(notifiedKey, 'true');
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
                    navigator.serviceWorker.ready.then(reg => {
                        const origin = window.location.origin;
                        const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
                        reg.showNotification(msg.title, {
                            body: msg.body || '',
                            icon: `${origin}${basePath}icons/icon-192.png`,
                            badge: `${origin}${basePath}icons/favicon.png`,
                            tag: inboxId,
                            vibrate: [200, 100, 200, 100, 350],
                            data: { url: `${origin}${basePath}?tab=tab-dashboard`, id: inboxId }
                        }).catch(() => {});
                    }).catch(() => {});
                }
            }

            if (isUnread && msg.popupOnLogin !== false) {
                const dismissKey = `admin_popup_dismissed_${userId}_${msg.id}`;
                if (sessionStorage.getItem(dismissKey) !== 'true') {
                    unreadMsgs.push(msg);
                }
            }
        });

        if (unreadMsgs.length > 0) {
            this._adminPopupQueue = unreadMsgs;
            this.showAdminMessageLoginPopup(unreadMsgs[0], unreadMsgs.length);
        }
    },

    /**
     * 회원 화면 중앙에 표시되는 [관리자 맞춤 메시지 도착 팝업 모달]
     */
    showAdminMessageLoginPopup(msg, totalUnread = 1) {
        if (!msg) return;
        let modal = document.getElementById('lucky777AdminMessagePopupModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lucky777AdminMessagePopupModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(7,10,20,0.88); backdrop-filter:blur(8px); z-index:100020; display:none; align-items:center; justify-content:center; padding:16px; box-sizing:border-box;';
            document.body.appendChild(modal);
        }

        const actionLabelMap = {
            qr: '📷 지금 실구매 QR 영수증 등록하기',
            confirmed: '📊 내 실구매 당첨장부 확인하기',
            fortune: '🧭 내 사주 길일·길시 확인하기',
            generator: '🎱 이번주 AI 추천번호 확인하기'
        };
        const btnLabel = msg.actionLabel || actionLabelMap[msg.actionType] || '🎱 바로 확인하기';
        const timeStr = this.formatTimeLabel(msg.createdAt);
        const safeMsgId = String(msg.id || '').replace(/'/g, "\\'");

        modal.innerHTML = `
            <div style="width:100%; max-width:410px; background:linear-gradient(160deg, #1e293b 0%, #0f172a 100%); border:2px solid rgba(245,158,11,0.65); border-radius:22px; padding:22px 20px; box-shadow:0 25px 60px rgba(0,0,0,0.85), 0 0 35px rgba(245,158,11,0.18); position:relative; overflow:hidden; font-family:'Pretendard','Noto Sans KR',sans-serif; color:#f8fafc;">
                <div style="position:absolute; top:0; left:0; right:0; height:4px; background:linear-gradient(90deg, #f59e0b, #fbbf24, #10b981);"></div>

                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <span style="display:inline-flex; align-items:center; gap:5px; font-size:0.72rem; font-weight:900; padding:4px 10px; border-radius:999px; background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(245,158,11,0.45);">
                        ${msg.badge || '👑 관리자 특별 안내'}
                    </span>
                    <span style="font-size:0.7rem; color:#94a3b8; font-weight:700;">
                        ${totalUnread > 1 ? `<span style="color:#fbbf24; font-weight:900;">미확인 ${totalUnread}건 중 1번째</span> · ` : ''}${timeStr}
                    </span>
                </div>

                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <div style="width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg,#f59e0b,#d97706); display:flex; align-items:center; justify-content:center; font-size:1.25rem; flex-shrink:0; box-shadow:0 4px 14px rgba(245,158,11,0.35);">
                        👑
                    </div>
                    <div style="min-width:0; flex:1;">
                        <div style="font-size:0.72rem; color:#fbbf24; font-weight:800;">운도실력 최고관리자 메시지</div>
                        <div style="font-size:0.98rem; font-weight:900; color:#ffffff; line-height:1.35; word-break:keep-all;">${msg.title}</div>
                    </div>
                </div>

                <div style="background:rgba(9,13,22,0.82); border:1px solid rgba(255,255,255,0.09); border-radius:14px; padding:14px; font-size:0.84rem; color:#e2e8f0; line-height:1.65; margin-bottom:16px; white-space:pre-line; max-height:240px; overflow-y:auto; word-break:keep-all;">${msg.body || ''}</div>

                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button type="button" onclick="window.PushClient && window.PushClient.acknowledgeAdminMessage('${safeMsgId}', true)" style="width:100%; background:linear-gradient(135deg, #f59e0b, #d97706); color:#0f172a; border:none; padding:12px 14px; border-radius:12px; font-size:0.86rem; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 14px rgba(245,158,11,0.35);">
                        <span>${btnLabel}</span>
                        <span>→</span>
                    </button>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button type="button" onclick="window.PushClient && window.PushClient.acknowledgeAdminMessage('${safeMsgId}', false)" style="background:rgba(16,185,129,0.16); border:1px solid rgba(16,185,129,0.45); color:#34d399; padding:9px; border-radius:10px; font-size:0.78rem; font-weight:800; cursor:pointer;">
                            ✓ 확인 완료 (읽음 표시)
                        </button>
                        <button type="button" onclick="window.PushClient && window.PushClient.dismissAdminMessagePopupLater('${safeMsgId}')" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#94a3b8; padding:9px; border-radius:10px; font-size:0.78rem; font-weight:700; cursor:pointer;">
                            나중에 보기 (알림함 보관)
                        </button>
                    </div>
                </div>
            </div>
        `;
        modal.style.display = 'flex';
    },

    dismissAdminMessagePopupLater(msgId) {
        const uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
        if (uid && msgId) {
            try {
                sessionStorage.setItem(`admin_popup_dismissed_${uid}_${msgId}`, 'true');
            } catch (e) {}
        }
        const modal = document.getElementById('lucky777AdminMessagePopupModal');
        if (modal) modal.style.display = 'none';
        if (typeof window.showToast === 'function') {
            window.showToast('🔔 대시보드 상단 [미확인 알림함]에 보관되었습니다.');
        }
    },

    async syncAdminMessageReadToFirestore(msgId) {
        if (!msgId || !window.db) return;
        let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }
        uid = String(uid || '').trim();
        if (!uid) return;

        const nowIso = new Date().toISOString();
        try {
            await window.db.collection('lotto_users').doc(uid).set({
                adminMessages: {
                    [msgId]: {
                        status: 'read',
                        readAt: nowIso
                    }
                }
            }, { merge: true });
        } catch (err) {
            console.warn('[PushClient] syncAdminMessageReadToFirestore error:', err);
        }
    },

    async acknowledgeAdminMessage(msgId, triggerAction = false) {
        const modal = document.getElementById('lucky777AdminMessagePopupModal');
        if (modal) modal.style.display = 'none';

        const inboxId = `admin-msg-${msgId}`;
        const list = this.getNotifications();
        const item = list.find(n => n && n.id === inboxId);
        const queuedMsg = (this._adminPopupQueue || []).find(m => m && m.id === msgId);
        const actionType = (queuedMsg && queuedMsg.actionType) || (item && item.actionType) || 'generator';

        // 로컬 알림함 및 Firestore 읽음 처리
        this.markNotificationRead(inboxId);
        await this.syncAdminMessageReadToFirestore(msgId);

        if (typeof window.showToast === 'function') {
            window.showToast('✓ 관리자 메시지 확인이 완료되었습니다.');
        }

        if (triggerAction) {
            this.handleNotificationAction(inboxId);
            return;
        }

        // 남은 미확인 팝업 큐가 있으면 다음 메시지 표시
        this._adminPopupQueue = (this._adminPopupQueue || []).filter(m => m && m.id !== msgId);
        if (this._adminPopupQueue.length > 0) {
            setTimeout(() => {
                this.showAdminMessageLoginPopup(this._adminPopupQueue[0], this._adminPopupQueue.length);
            }, 250);
        }
    },

    /**
     * 🛠️ 관리자용 [회원 맞춤 메시지 발송 & 수신 확인 콘솔 모달] 열기
     */
    async openAdminMessageConsoleModal(preselectUserId = null) {
        this._consolePreselectUser = preselectUserId || null;
        this._consoleTargetMode = preselectUserId ? 'single' : (this._consoleTargetMode || 'single');

        let modal = document.getElementById('lucky777AdminMsgConsoleModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lucky777AdminMsgConsoleModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(7,10,20,0.88); backdrop-filter:blur(8px); z-index:100010; display:none; align-items:center; justify-content:center; padding:14px; box-sizing:border-box;';
            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };
            document.body.appendChild(modal);
        }

        modal.style.display = 'flex';
        modal.innerHTML = `<div style="background:#0f172a; border:1.5px solid rgba(245,158,11,0.45); border-radius:18px; padding:28px; color:#f8fafc; font-weight:800; text-align:center;"><i class="fa-solid fa-spinner fa-spin" style="color:#fbbf24; font-size:1.4rem; margin-bottom:8px; display:block;"></i>회원 목록 및 알림 수신 상태를 불러오는 중...</div>`;

        await this.renderAdminMessageConsoleContent();
    },

    closeAdminMessageConsoleModal() {
        const modal = document.getElementById('lucky777AdminMsgConsoleModal');
        if (modal) modal.style.display = 'none';
    },

    async fetchAllUsersForAdminConsole() {
        const users = [];
        const upcomingRound = this.getUpcomingRoundNumber();
        if (!window.db) return users;

        try {
            const [uSnap, pSnap, subSnap] = await Promise.all([
                window.db.collection('lotto_users').get(),
                window.db.collection('lotto_purchases').get().catch(() => ({ forEach: () => {} })),
                window.db.collection('push_subscriptions').get().catch(() => ({ forEach: () => {} }))
            ]);

            const purchasedUserMap = {};
            pSnap.forEach(doc => {
                const pData = doc.data() || {};
                const uid = String(doc.id || '').trim();
                const ledger = pData.ledger || pData;
                const rList = ledger[String(upcomingRound)] || ledger[upcomingRound] || [];
                if (Array.isArray(rList) && rList.length > 0) {
                    purchasedUserMap[uid.toLowerCase()] = true;
                }
            });

            const pushSubByUser = {};
            subSnap.forEach(doc => {
                const sData = doc.data() || {};
                const uid = String(sData.userId || '').trim().toLowerCase();
                if (uid && sData.endpoint) {
                    if (!pushSubByUser[uid]) pushSubByUser[uid] = [];
                    pushSubByUser[uid].push(sData);
                }
            });

            uSnap.forEach(doc => {
                const data = doc.data() || {};
                if (data.isDeleted === true || data.status === 'trash') return;
                const userId = doc.id;
                const lowerId = userId.toLowerCase();
                const isPerm = !!(data.isAdmin === true || data.role === 'admin' || data.isPermanent === true || data.userType === 'permanent');
                const hasPurchased = isPerm || !!purchasedUserMap[lowerId];
                const subs = pushSubByUser[lowerId] || (data.pushSubscription && data.pushSubscription.endpoint ? [data.pushSubscription] : []);
                const hasKakao = userId.startsWith('kakao_') || !!(data.kakaoAuth && data.kakaoAuth.hasTalkMessageScope);
                const hasWins = !!(data.sentReports && Object.keys(data.sentReports).length > 0);

                users.push({
                    userId,
                    realName: data.realName || userId,
                    isPerm,
                    hasPurchased,
                    hasPush: subs.length > 0 || !!data.hasPushSubscription,
                    pushSubs: subs,
                    hasKakao,
                    hasWins,
                    adminMessages: data.adminMessages || {},
                    lastAccessAt: data.lastAccessAt || data.lastLoginAt || ''
                });
            });
        } catch (err) {
            console.warn('[PushClient] fetchAllUsersForAdminConsole error:', err);
        }
        this._adminConsoleUsers = users;
        return users;
    },

    async renderAdminMessageConsoleContent() {
        const modal = document.getElementById('lucky777AdminMsgConsoleModal');
        if (!modal) return;

        const users = await this.fetchAllUsersForAdminConsole();
        const upcomingRound = this.getUpcomingRoundNumber();
        const mode = this._consoleTargetMode || 'single';
        const preselect = this._consolePreselectUser || (users[0] ? users[0].userId : '');

        const nonPurchasersCount = users.filter(u => !u.isPerm && !u.hasPurchased).length;
        const winnersCount = users.filter(u => u.hasWins).length;
        const pushConsentedCount = users.filter(u => u.hasPush).length;

        const userOptionsHtml = users.map(u => {
            const pTag = u.isPerm ? '♾️영구' : (u.hasPurchased ? '✓구매완료' : '❌미구매');
            const pushTag = u.hasPush ? '🔔푸시ON' : (u.hasKakao ? '💬카톡ON' : '앱팝업');
            const selected = (u.userId === preselect) ? 'selected' : '';
            return `<option value="${u.userId}" ${selected}>${u.realName} (${u.userId}) — [${pTag} · ${pushTag}]</option>`;
        }).join('');

        // 최근 발송 내역 수집
        const allSentLogs = [];
        users.forEach(u => {
            const msgMap = u.adminMessages || {};
            Object.values(msgMap).forEach(m => {
                if (m && m.id && m.title) {
                    allSentLogs.push({
                        ...m,
                        targetUserId: u.userId,
                        targetUserName: u.realName,
                        hasPush: u.hasPush,
                        hasKakao: u.hasKakao
                    });
                }
            });
        });
        allSentLogs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

        const historyHtml = allSentLogs.length === 0
            ? `<div style="padding:18px; text-align:center; color:#64748b; font-size:0.78rem;">아직 발송된 관리자 메시지가 없습니다.</div>`
            : allSentLogs.slice(0, 20).map(log => {
                const isRead = log.status === 'read';
                const sentTime = this.formatTimeLabel(log.createdAt);
                const readTime = log.readAt ? this.formatTimeLabel(log.readAt) : '';
                const safeUid = String(log.targetUserId || '').replace(/'/g, "\\'");
                const safeMid = String(log.id || '').replace(/'/g, "\\'");
                return `
                    <div style="background:#090d16; border:1px solid ${isRead ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.35)'}; border-radius:10px; padding:9px 12px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                        <div style="min-width:0; flex:1;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span style="font-size:0.78rem; font-weight:900; color:#f8fafc;">${log.targetUserName} <span style="color:#94a3b8; font-weight:600;">(${log.targetUserId})</span></span>
                                <span style="font-size:0.65rem; padding:1px 6px; border-radius:5px; background:rgba(245,158,11,0.16); color:#fde68a; font-weight:800;">${log.badge || '👑 관리자 안내'}</span>
                                ${log.hasPush ? '<span style="font-size:0.63rem; color:#34d399; font-weight:800;">🔔푸시전달</span>' : ''}
                                ${log.hasKakao ? '<span style="font-size:0.63rem; color:#fee500; font-weight:800;">💬카톡연동</span>' : ''}
                            </div>
                            <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${log.title}</div>
                            <div style="font-size:0.67rem; color:#64748b; margin-top:1px;">발송: ${sentTime}${isRead && readTime ? ` · 읽음: ${readTime}` : ''}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                            ${isRead
                                ? `<span style="font-size:0.68rem; font-weight:900; padding:3px 8px; border-radius:999px; background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.4);">✓ 읽음 완료</span>`
                                : `<span style="font-size:0.68rem; font-weight:900; padding:3px 8px; border-radius:999px; background:rgba(245,158,11,0.18); color:#fbbf24; border:1px solid rgba(245,158,11,0.4);">⏳ 미확인 대기</span>`}
                            <button type="button" onclick="window.PushClient && window.PushClient.deleteAdminSentMessage('${safeUid}', '${safeMid}')" title="발송 메시지 회수/삭제" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.35); color:#fca5a5; width:26px; height:26px; border-radius:6px; font-size:0.72rem; cursor:pointer;">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

        const defaultTpl = this.ADMIN_MSG_TEMPLATES.qr_remind;

        modal.innerHTML = `
            <div style="width:100%; max-width:640px; max-height:90vh; background:#0f172a; border:1.5px solid rgba(245,158,11,0.5); border-radius:18px; box-shadow:0 25px 65px rgba(0,0,0,0.88); display:flex; flex-direction:column; overflow:hidden; font-family:'Pretendard','Noto Sans KR',sans-serif; color:#f8fafc;">
                <!-- Header -->
                <div style="padding:14px 18px; background:linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:9px;">
                        <span style="font-size:1.25rem;">📨</span>
                        <div>
                            <div style="font-size:0.96rem; font-weight:900; color:#fff; display:flex; align-items:center; gap:7px;">
                                <span>관리자 회원 맞춤 메시지 발송 콘솔</span>
                                <span style="font-size:0.68rem; padding:2px 8px; border-radius:999px; background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.4); font-weight:800;">
                                    🔔 푸시동의 ${pushConsentedCount}명 · 전체 ${users.length}명
                                </span>
                            </div>
                            <div style="font-size:0.71rem; color:#94a3b8;">로그인 즉시 중앙 팝업 + 스마트폰 푸시 알림 + 대시보드 미확인 알림함 + 카톡 대기열 동시 발송</div>
                        </div>
                    </div>
                    <button type="button" onclick="window.PushClient && window.PushClient.closeAdminMessageConsoleModal()" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; width:32px; height:32px; border-radius:50%; font-size:1.2rem; cursor:pointer;">&times;</button>
                </div>

                <!-- Scrollable Body -->
                <div style="padding:14px 16px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:12px;">
                    <!-- 1. 수신 대상 선택 -->
                    <div style="background:#090d16; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:11px 13px;">
                        <div style="font-size:0.75rem; font-weight:800; color:#fbbf24; margin-bottom:7px;">1️⃣ 수신 대상 선택</div>
                        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-bottom:8px;">
                            <button type="button" onclick="window.PushClient.setAdminConsoleTargetMode('single')" style="padding:8px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer; border:1px solid ${mode === 'single' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background:${mode === 'single' ? 'rgba(245,158,11,0.2)' : '#1e293b'}; color:${mode === 'single' ? '#fde047' : '#cbd5e1'}; text-align:left;">
                                👤 1:1 개별 회원 지정
                            </button>
                            <button type="button" onclick="window.PushClient.setAdminConsoleTargetMode('non_purchasers')" style="padding:8px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer; border:1px solid ${mode === 'non_purchasers' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background:${mode === 'non_purchasers' ? 'rgba(245,158,11,0.2)' : '#1e293b'}; color:${mode === 'non_purchasers' ? '#fde047' : '#cbd5e1'}; text-align:left;">
                                ⏳ 이번주 미구매 일괄 (${nonPurchasersCount}명)
                            </button>
                            <button type="button" onclick="window.PushClient.setAdminConsoleTargetMode('winners')" style="padding:8px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer; border:1px solid ${mode === 'winners' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background:${mode === 'winners' ? 'rgba(245,158,11,0.2)' : '#1e293b'}; color:${mode === 'winners' ? '#fde047' : '#cbd5e1'}; text-align:left;">
                                🏆 당첨 이력 회원 일괄 (${winnersCount}명)
                            </button>
                            <button type="button" onclick="window.PushClient.setAdminConsoleTargetMode('all')" style="padding:8px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer; border:1px solid ${mode === 'all' ? '#f59e0b' : 'rgba(255,255,255,0.1)'}; background:${mode === 'all' ? 'rgba(245,158,11,0.2)' : '#1e293b'}; color:${mode === 'all' ? '#fde047' : '#cbd5e1'}; text-align:left;">
                                📢 전체 회원 공지 (${users.length}명)
                            </button>
                        </div>
                        <div id="adminConsoleSingleUserWrap" style="display:${mode === 'single' ? 'block' : 'none'};">
                            <select id="adminMsgTargetUserSelect" style="width:100%; background:#1e293b; color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:8px 10px; font-size:0.8rem; font-weight:700;">
                                ${userOptionsHtml}
                            </select>
                        </div>
                    </div>

                    <!-- 2. 원클릭 빠른 템플릿 -->
                    <div style="background:#090d16; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:11px 13px;">
                        <div style="font-size:0.75rem; font-weight:800; color:#fbbf24; margin-bottom:7px;">2️⃣ 원클릭 빠른 메시지 템플릿 <span style="color:#94a3b8; font-weight:500;">({회원명}, {회차} 자동 치환)</span></div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('qr_remind')" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.4); color:#fde68a; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">📷 실구매 QR 독려</button>
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('win_congrats')" style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); color:#6ee7b7; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">🎉 실구매 당첨 축하</button>
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('myeongri_pick')" style="background:rgba(139,92,246,0.18); border:1px solid rgba(139,92,246,0.45); color:#ddd6fe; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">🔮 사주 길일·길시 안내</button>
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('account_notice')" style="background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#bfdbfe; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">🔓 계정 권한 안내</button>
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('general_notice')" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.2); color:#e2e8f0; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">📢 전체 공지·업데이트</button>
                        </div>
                    </div>

                    <!-- 3. 제목 / 본문 / 바로가기 액션 작성 -->
                    <div style="background:#090d16; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:11px 13px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <div>
                                <label style="font-size:0.7rem; color:#94a3b8; font-weight:700; display:block; margin-bottom:4px;">상단 배지 태그</label>
                                <select id="adminMsgBadgeSelect" style="width:100%; background:#1e293b; color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:7px; padding:6px 8px; font-size:0.75rem; font-weight:700;">
                                    <option value="📷 실구매 인증 안내">📷 실구매 인증 안내</option>
                                    <option value="🎉 당첨 축하 메시지">🎉 당첨 축하 메시지</option>
                                    <option value="🔮 사주 길일·길시 특별 안내">🔮 사주 길일·길시 특별 안내</option>
                                    <option value="🔓 계정 권한 안내">🔓 계정 권한 안내</option>
                                    <option value="📢 관리자 공지사항">📢 관리자 공지사항</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:0.7rem; color:#94a3b8; font-weight:700; display:block; margin-bottom:4px;">팝업 클릭 시 연결 화면</label>
                                <select id="adminMsgActionSelect" style="width:100%; background:#1e293b; color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:7px; padding:6px 8px; font-size:0.75rem; font-weight:700;">
                                    <option value="qr">📷 실구매 QR 영수증 등록창 열기</option>
                                    <option value="confirmed">📊 구매확정·당첨내역 탭 이동</option>
                                    <option value="generator">🎱 AI 추천번호 생성 탭 이동</option>
                                    <option value="fortune">🧭 대시보드 사주 길일·길시 보기</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style="font-size:0.7rem; color:#94a3b8; font-weight:700; display:block; margin-bottom:4px;">메시지 제목 (제 ${upcomingRound}회차)</label>
                            <input type="text" id="adminMsgTitleInput" value="${defaultTpl.title}" style="width:100%; box-sizing:border-box; background:#1e293b; color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:8px 10px; font-size:0.82rem; font-weight:800;" />
                        </div>
                        <div>
                            <label style="font-size:0.7rem; color:#94a3b8; font-weight:700; display:block; margin-bottom:4px;">메시지 본문 내용</label>
                            <textarea id="adminMsgBodyInput" rows="3" style="width:100%; box-sizing:border-box; background:#1e293b; color:#fff; border:1px solid rgba(255,255,255,0.15); border-radius:8px; padding:8px 10px; font-size:0.79rem; line-height:1.5; resize:vertical;">${defaultTpl.body}</textarea>
                        </div>

                        <!-- 멀티채널 전달 옵션 -->
                        <div style="display:flex; flex-direction:column; gap:5px; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06);">
                            <label style="display:flex; align-items:center; gap:7px; font-size:0.75rem; color:#e2e8f0; cursor:pointer;">
                                <input type="checkbox" id="cbAdminMsgPopup" checked style="accent-color:#f59e0b; width:15px; height:15px;">
                                <span><strong>로그인 즉시 화면 중앙 팝업 모달</strong>로 최우선 표시</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:7px; font-size:0.75rem; color:#e2e8f0; cursor:pointer;">
                                <input type="checkbox" id="cbAdminMsgInbox" checked style="accent-color:#f59e0b; width:15px; height:15px;">
                                <span><strong>대시보드 상단 미확인 알림함</strong>에 보관 및 읽음(✓) 실시간 추적</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:7px; font-size:0.75rem; color:#fde047; cursor:pointer;">
                                <input type="checkbox" id="cbAdminMsgPushKakao" checked style="accent-color:#10b981; width:15px; height:15px;">
                                <span><strong>알림·푸시 동의 회원에게 스마트폰 푸시 알림 + 카카오톡 대기열</strong> 동시 전송</span>
                            </label>
                        </div>

                        <div style="display:flex; gap:8px; margin-top:4px;">
                            <button type="button" id="btnDispatchAdminMsgNow" onclick="window.PushClient.sendAdminMessageFromConsole()" style="flex:1.8; background:linear-gradient(135deg, #f59e0b, #d97706); color:#0f172a; border:none; padding:11px 14px; border-radius:10px; font-size:0.84rem; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 4px 14px rgba(245,158,11,0.35);">
                                <i class="fa-solid fa-paper-plane"></i> <span>회원에게 메시지 발송하기</span>
                            </button>
                            <button type="button" onclick="window.PushClient.previewAdminMessagePopupFromConsole()" style="flex:1; background:rgba(59,130,246,0.18); border:1px solid rgba(59,130,246,0.45); color:#93c5fd; padding:11px 10px; border-radius:10px; font-size:0.76rem; font-weight:800; cursor:pointer;">
                                👁️ 수신 팝업 미리보기
                            </button>
                        </div>
                    </div>

                    <!-- 4. 발송 내역 및 실시간 읽음 확인 트래커 -->
                    <div style="background:#090d16; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:11px 13px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                            <span style="font-size:0.76rem; font-weight:800; color:#fbbf24;">📊 최근 발송 내역 & 회원 읽음 확인 현황 (${allSentLogs.length}건)</span>
                            <button type="button" onclick="window.PushClient.renderAdminMessageConsoleContent()" style="background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:#cbd5e1; font-size:0.68rem; font-weight:700; padding:3px 8px; border-radius:6px; cursor:pointer;">
                                ↻ 상태 새로고침
                            </button>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; max-height:190px; overflow-y:auto;">
                            ${historyHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    setAdminConsoleTargetMode(mode) {
        this._consoleTargetMode = mode;
        const selEl = document.getElementById('adminMsgTargetUserSelect');
        if (selEl && selEl.value) {
            this._consolePreselectUser = selEl.value;
        }
        this.renderAdminMessageConsoleContent();
    },

    applyAdminMsgTemplate(tplKey) {
        const tpl = this.ADMIN_MSG_TEMPLATES[tplKey];
        if (!tpl) return;
        const badgeEl = document.getElementById('adminMsgBadgeSelect');
        const actionEl = document.getElementById('adminMsgActionSelect');
        const titleEl = document.getElementById('adminMsgTitleInput');
        const bodyEl = document.getElementById('adminMsgBodyInput');
        if (badgeEl) badgeEl.value = tpl.badge;
        if (actionEl) actionEl.value = tpl.actionType;
        if (titleEl) titleEl.value = tpl.title;
        if (bodyEl) bodyEl.value = tpl.body;
    },

    previewAdminMessagePopupFromConsole() {
        const badge = document.getElementById('adminMsgBadgeSelect')?.value || '👑 관리자 특별 안내';
        const actionType = document.getElementById('adminMsgActionSelect')?.value || 'qr';
        const rawTitle = document.getElementById('adminMsgTitleInput')?.value || '관리자 안내 메시지';
        const rawBody = document.getElementById('adminMsgBodyInput')?.value || '';
        const round = this.getUpcomingRoundNumber();
        const sampleName = this.getCurrentUserName() || '홍길동';

        const title = rawTitle.replace(/\{회원명\}/g, sampleName).replace(/\{회차\}/g, String(round));
        const body = rawBody.replace(/\{회원명\}/g, sampleName).replace(/\{회차\}/g, String(round));

        this.showAdminMessageLoginPopup({
            id: 'preview-demo',
            badge,
            actionType,
            title,
            body,
            createdAt: new Date().toISOString()
        }, 1);
    },

    async sendAdminMessageFromConsole() {
        if (!window.db) {
            alert('DB 연결이 준비되지 않았습니다.');
            return;
        }

        const badge = document.getElementById('adminMsgBadgeSelect')?.value || '👑 관리자 안내';
        const actionType = document.getElementById('adminMsgActionSelect')?.value || 'qr';
        const rawTitle = (document.getElementById('adminMsgTitleInput')?.value || '').trim();
        const rawBody = (document.getElementById('adminMsgBodyInput')?.value || '').trim();
        const popupOnLogin = document.getElementById('cbAdminMsgPopup')?.checked !== false;
        const saveToInbox = document.getElementById('cbAdminMsgInbox')?.checked !== false;
        const sendPushAndKakao = document.getElementById('cbAdminMsgPushKakao')?.checked !== false;

        if (!rawTitle || !rawBody) {
            alert('메시지 제목과 본문을 모두 입력해 주세요.');
            return;
        }

        const users = this._adminConsoleUsers || await this.fetchAllUsersForAdminConsole();
        const mode = this._consoleTargetMode || 'single';
        let targets = [];

        if (mode === 'single') {
            const selectedUid = document.getElementById('adminMsgTargetUserSelect')?.value;
            const found = users.find(u => u.userId === selectedUid);
            if (found) targets = [found];
        } else if (mode === 'non_purchasers') {
            targets = users.filter(u => !u.isPerm && !u.hasPurchased);
        } else if (mode === 'winners') {
            targets = users.filter(u => u.hasWins);
        } else {
            targets = users;
        }

        if (targets.length === 0) {
            alert('선택한 조건에 해당하는 수신 대상 회원이 없습니다.');
            return;
        }

        const btn = document.getElementById('btnDispatchAdminMsgNow');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${targets.length}명에게 발송 중...</span>`;
        }

        const round = this.getUpcomingRoundNumber();
        const actionLabelMap = {
            qr: '📷 지금 실구매 QR 영수증 등록하기',
            confirmed: '📊 내 실구매 당첨장부 확인하기',
            fortune: '🧭 내 사주 길일·길시 확인하기',
            generator: '🎱 이번주 AI 추천번호 확인하기'
        };
        const actionLabel = actionLabelMap[actionType] || '🎱 바로 확인하기';
        const nowIso = new Date().toISOString();
        const baseMsgId = `adm_${Date.now()}`;

        let sentCount = 0;
        let webPushSentCount = 0;
        let kakaoQueuedCount = 0;

        for (const target of targets) {
            const dispName = target.realName || target.userId;
            const personalTitle = rawTitle.replace(/\{회원명\}/g, dispName).replace(/\{회차\}/g, String(round));
            const personalBody = rawBody.replace(/\{회원명\}/g, dispName).replace(/\{회차\}/g, String(round));

            const msgObj = {
                id: baseMsgId,
                badge,
                title: personalTitle,
                body: personalBody,
                actionType,
                actionLabel,
                popupOnLogin,
                saveToInbox,
                status: 'unread',
                createdAt: nowIso
            };

            try {
                // 1) Firestore lotto_users/{userId}.adminMessages 저장 (로그인 시 즉시 팝업 + 실시간 onSnapshot 전달)
                await window.db.collection('lotto_users').doc(target.userId).set({
                    adminMessages: {
                        [baseMsgId]: msgObj
                    }
                }, { merge: true });
                sentCount++;

                // 2) 알림·푸시 동의 회원에게 Web Push 즉시 전송 + 카카오톡 대기열 등록
                if (sendPushAndKakao) {
                    if (Array.isArray(target.pushSubs) && target.pushSubs.length > 0) {
                        try {
                            const pushResp = await fetch('/.netlify/functions/send-push', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    subscriptions: target.pushSubs,
                                    notification: {
                                        id: `admin-msg-${baseMsgId}`,
                                        title: `${badge} ${personalTitle}`,
                                        body: personalBody,
                                        tag: `admin-msg-${baseMsgId}`,
                                        url: '/?tab=tab-dashboard'
                                    }
                                })
                            });
                            if (pushResp.ok) webPushSentCount++;
                        } catch (pushErr) {
                            console.warn('[Admin WebPush Dispatch Notice]', pushErr);
                        }
                    }

                    if (target.hasKakao && typeof window.queueKakaoNotificationForUser === 'function') {
                        const appUrl = window.location.origin + window.location.pathname;
                        await window.queueKakaoNotificationForUser(target.userId, {
                            id: `kakao_${baseMsgId}`,
                            type: 'admin_custom_message',
                            round: round,
                            template: {
                                object_type: 'text',
                                text: `👑 [운도실력 관리자 메시지]\n\n📌 ${personalTitle}\n\n${personalBody}`,
                                link: {
                                    web_url: appUrl,
                                    mobile_web_url: appUrl
                                },
                                button_title: actionLabel.replace(/^[^\s]+\s/, '')
                            }
                        });
                        kakaoQueuedCount++;
                    }
                }
            } catch (err) {
                console.warn(`[sendAdminMessageFromConsole] Failed for ${target.userId}:`, err);
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }

        if (typeof window.showToast === 'function') {
            window.showToast(`🚀 총 ${sentCount}명에게 발송 완료! (웹푸시 ${webPushSentCount}명 · 카톡연동 ${kakaoQueuedCount}명)`);
        }

        if (typeof window.loadUserList === 'function') {
            try { window.loadUserList(true); } catch (e) {}
        }

        await this.renderAdminMessageConsoleContent();
    },

    async deleteAdminSentMessage(userId, msgId) {
        if (!userId || !msgId || !window.db) return;
        try {
            const docRef = window.db.collection('lotto_users').doc(userId);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data() || {};
                const map = { ...(data.adminMessages || {}) };
                delete map[msgId];
                await docRef.update({ adminMessages: map });
            }
            if (typeof window.showToast === 'function') {
                window.showToast('🗑️ 발송된 메시지를 삭제했습니다.');
            }
            await this.renderAdminMessageConsoleContent();
        } catch (err) {
            console.warn('[PushClient] deleteAdminSentMessage error:', err);
        }
    }
};

// 전역 윈도우 등록 및 인터랙티브 토글 헬퍼
if (typeof window !== 'undefined') {
    window.PushClient = PushClient;
    window.openNotificationCenterModal = (filter) => PushClient.openNotificationCenterModal(filter);
    window.openAdminMessageConsoleModal = (userId) => PushClient.openAdminMessageConsoleModal(userId);

    window.handlePushNotificationToggle = async function() {
        if (!PushClient.isSupported()) {
            alert('현재 브라우저에서는 웹 푸시를 지원하지 않습니다.\n아이폰(iOS)의 경우 [홈 화면에 추가(PWA)] 후 앱에서 실행해 주세요.');
            return;
        }

        try {
            const displayName = PushClient.getUserDisplayName();
            const existingSub = await PushClient.getSubscription();
            if (existingSub) {
                // 구독 정보가 이미 있으면 최신 사주 스케줄을 자동 재동기화
                await PushClient.syncMyeongriScheduleIfNeeded();
                const choice = confirm(`🟢 현재 [${displayName}]을 위한 [사주 길일·길시 & 공식 통계 리포트] 알림이 정상 등록되어 있습니다.\n\n[확인] : 3초 뒤 테스트 알림 발송 (알림함 기록 포함)\n[취소] : 알림 수신 해제 창으로 이동`);
                if (choice) {
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

            const ok = confirm(`🌿 [운도실력 맞춤 알림 서비스]\n\n1. [${displayName}]의 사주 길일·길시 1시간 전 정갈한 리마인더 안내\n2. 해당 주차 구매등록 완료 시 알림 자동 생략 (안심 스마트 케어)\n3. 대시보드 미확인 알림함에 자동 보관되어 놓친 알림도 100% 확인 가능\n\n알림을 허용하시겠습니까?`);
            if (!ok) return;

            const sub = await PushClient.subscribe();
            if (sub) {
                await PushClient.updateBannerVisibility();
                const testNow = confirm(`✨ [${displayName}]을 위한 맞춤 알림이 성공적으로 등록되었습니다!\n\n지금 3초 뒤 테스트 알림이 오는지 시험해 보시겠습니까?`);
                if (testNow) {
                    await PushClient.sendTestNotification(3);
                }
            }
        } catch (err) {
            console.error('[handlePushNotificationToggle Error]', err);
            alert(err.message.startsWith('브라우저') ? err.message : ('🔔 [알림 설정 안내]\n\n' + err.message));
        }
    };

    // 앱 실행 및 화면 복귀 시 백그라운드 푸시 병합 + 길일·길시 스케줄 자동 감지 + 미확인 알림 배너 렌더링
    function initPushUI() {
        PushClient.syncFromServiceWorkerDB().then(() => {
            PushClient.checkAndGenerateScheduledAlerts();
            PushClient.updateBannerVisibility();
            PushClient.syncMyeongriScheduleIfNeeded();
            if (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get && window.SafeAuth.get()) {
                PushClient.startAdminMessageListener(window.SafeAuth.get());
            }
        });

        // Service Worker 실시간 postMessage 수신 리스너
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'LUCKY777_PUSH_RECEIVED' && event.data.notification) {
                    PushClient.addNotification(event.data.notification, false);
                } else if (event.data && event.data.type === 'LUCKY777_NOTIFICATION_CLICKED' && event.data.id) {
                    PushClient.markNotificationRead(event.data.id);
                }
            });
        }

        // URL 쿼리에 notif_read 파라미터가 있으면 즉시 해당 알림 읽음 처리 (OS 알림 클릭 진입 시)
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const readTargetId = urlParams.get('notif_read');
            if (readTargetId) {
                PushClient.markNotificationRead(readTargetId);
                const cleanUrl = window.location.pathname + window.location.search.replace(/([?&])notif_read=[^&]+(&|$)/, '$1').replace(/[?&]$/, '') + window.location.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        } catch(e) {}

        // 1분 주기로 길시 도래 여부 백그라운드 점검
        setInterval(() => {
            PushClient.checkAndGenerateScheduledAlerts();
        }, 60 * 1000);

        window.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                PushClient.syncFromServiceWorkerDB().then(() => {
                    PushClient.checkAndGenerateScheduledAlerts();
                    PushClient.updateBannerVisibility();
                });
            }
        });
        window.addEventListener('focus', () => {
            PushClient.syncFromServiceWorkerDB().then(() => {
                PushClient.checkAndGenerateScheduledAlerts();
                PushClient.updateBannerVisibility();
            });
        });

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



