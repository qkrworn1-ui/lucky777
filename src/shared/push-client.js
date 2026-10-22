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
     * 👤 현재 활성 로그인 사용자 ID 반환
     */
    getCurrentUserId() {
        if (typeof window !== 'undefined' && window.SafeAuth && typeof window.SafeAuth.get === 'function') {
            let uid = window.SafeAuth.get();
            if (typeof uid === 'string' && uid.startsWith('{')) {
                try { uid = JSON.parse(uid).userid || JSON.parse(uid).userId || uid; } catch (e) {}
            }
            if (uid) return String(uid).trim();
        }
        return (typeof this._adminMsgActiveUserId !== 'undefined' && this._adminMsgActiveUserId) ? this._adminMsgActiveUserId : 'guest';
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

    _memoryReadIds: new Set(),
    _memoryDeletedIds: new Set(),
    _memoryClearedUsers: new Set(),
    _memoryInboxMap: {},
    _serverKnownDeletedIds: {},
    _isServerLoaded: {},
    _serverLoadPromise: {},
    _lastActionGuardTs: 0,
    _lastActionGuardKey: '',
    _notificationsFsDocId: null,
    _notificationsFsUnsubscribe: null,
    _notificationsFsUnsubscribes: [],
    _saveNotificationsTimer: null,

    /**
     * localStorage 용량 초과(QuotaExceededError) 발생 시 대용량 비핵심 캐시를 자동 정리하여 알림/읽음/삭제 저장 공간 확보
     */
    freeUpLocalStorageSpace() {
        try {
            if (typeof localStorage === 'undefined') return;
            const heavyExactKeys = [
                'lotto_all_users_merged_ledger_cache',
                'lotto_all_users_purchases_map_cache',
                'lotto_home_review_dashboard_cache',
                'lotto_all_fin_kpi_cache',
                'lotto_users_with_status_cache',
                'lotto_all_users_list_cache',
                'lotto_extra_history',
                'lucky777_notification_inbox_guest'
            ];
            heavyExactKeys.forEach(k => {
                try { localStorage.removeItem(k); } catch (e) {}
            });
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (
                    k.startsWith('lotto_actual_ledger_') ||
                    k.startsWith('lotto_review_v2_') ||
                    k.startsWith('lotto_rec_snapshot_') ||
                    k.startsWith('lotto_my_fin_kpi_cache_') ||
                    k.startsWith('lotto_algo_perf_') ||
                    k.startsWith('toto_') ||
                    k.startsWith('lucky777_alert_fired_myeongri-') ||
                    k.startsWith('lucky777_pushed_myeongri-') ||
                    k.startsWith('lucky777_fired_slot_') ||
                    k.startsWith('lucky777_fired_day_')
                ) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => {
                try { localStorage.removeItem(k); } catch (e) {}
            });
        } catch (e) {}
    },

    safeSetItem(key, value) {
        if (!key) return false;
        const strVal = String(value);
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(key, strVal);
            }
        } catch (e) {}
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(key, strVal);
                return true;
            }
        } catch (err) {
            this.freeUpLocalStorageSpace();
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(key, strVal);
                    return true;
                }
            } catch (err2) {
                console.warn('[PushClient] safeSetItem fallback to memory/sessionStorage for:', key);
            }
        }
        return false;
    },

    safeGetItem(key) {
        if (!key) return null;
        try {
            if (typeof localStorage !== 'undefined') {
                const v = localStorage.getItem(key);
                if (v !== null && v !== undefined) return v;
            }
        } catch (e) {}
        try {
            if (typeof sessionStorage !== 'undefined') {
                const sv = sessionStorage.getItem(key);
                if (sv !== null && sv !== undefined) return sv;
            }
        } catch (e) {}
        return null;
    },

    safeRemoveItem(key) {
        if (!key) return;
        try { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); } catch (e) {}
        try { if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(key); } catch (e) {}
    },

    /**
     * Firebase Firestore 인스턴스 안전 조회
     */
    getFirestore() {
        if (window.db && typeof window.db.collection === 'function') {
            return window.db;
        }
        if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
            try {
                return firebase.firestore();
            } catch(e) {}
        }
        return null;
    },

    /**
     * 비로그인(게스트) 사용자의 브라우저/기기별 영구 식별자 생성 및 조회
     */
    getOrCreateGuestDeviceId() {
        let devId = this.safeGetItem('lucky777_device_id');
        if (!devId) {
            try { devId = localStorage.getItem('lucky777_device_id'); } catch(e) {}
        }
        if (!devId) {
            try {
                const m = document.cookie.match(/(?:^|;\s*)lucky777_device_id=([^;]+)/);
                if (m) devId = decodeURIComponent(m[1]).trim();
            } catch(e) {}
        }
        if (!devId) {
            devId = 'dev_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
            this.safeSetItem('lucky777_device_id', devId);
            try { localStorage.setItem('lucky777_device_id', devId); } catch(e) {}
            try { document.cookie = 'lucky777_device_id=' + encodeURIComponent(devId) + '; path=/; max-age=31536000; SameSite=Lax'; } catch(e) {}
        }
        return devId;
    },

    /**
     * Firestore lotto_notifications 컬렉션 전용 문서 ID 조회
     */
    getNotificationDocId(userId = null) {
        const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
        if (!uid || uid === 'guest') {
            return `guest_${this.getOrCreateGuestDeviceId()}`;
        }
        return uid;
    },

    _getStoredIdsArray(key) {
        try {
            const raw = this.safeGetItem(key) || (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) return arr;
            }
        } catch(e) {}
        return [];
    },

    /**
     * 브라우저 재실행 시 로컬 스토리지에 남아있는 읽음/삭제 목록을 메모리 Set에 즉시 0ms 동기화
     */
    initLocalMemorySync(userId = null) {
        try {
            const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
            const delKeys = [this.getDeletedNotifsKey(uid), 'lucky777_deleted_notifs_global'];
            delKeys.forEach(dk => {
                const arr = this._getStoredIdsArray(dk);
                arr.forEach(id => {
                    if (id) {
                        const normId = String(id).trim();
                        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                        const canonKey = this.getCanonicalPushKey(id);
                        this._memoryDeletedIds.add(normId);
                        this._memoryDeletedIds.add(cleanId);
                        if (canonKey) this._memoryDeletedIds.add(canonKey);

                        if (normId.startsWith('admin-msg-') || normId.startsWith('admin_')) {
                            const rawAdmId = normId.replace(/^admin-msg-/, '').replace(/^admin_/, '');
                            this._memoryDeletedIds.add(`admin-msg-${rawAdmId}`);
                            this._memoryDeletedIds.add(`admin_${rawAdmId}`);
                            this._memoryDeletedIds.add(rawAdmId);
                        }

                        const drawM = normId.match(/(?:draw-result|win-celebrate)-(\d+)/);
                        if (drawM) {
                            const r = drawM[1];
                            this._memoryDeletedIds.add(`draw-result-${r}`);
                            this._memoryDeletedIds.add(`win-celebrate-${r}`);
                            this._memoryDeletedIds.add(`round_${r}_result`);
                        }
                    }
                });
            });

            if (this._serverKnownDeletedIds && this._serverKnownDeletedIds[uid]) {
                this._serverKnownDeletedIds[uid].forEach(id => {
                    if (id) {
                        const normId = String(id).trim();
                        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                        const canonKey = this.getCanonicalPushKey(id);
                        this._memoryDeletedIds.add(normId);
                        this._memoryDeletedIds.add(cleanId);
                        if (canonKey) this._memoryDeletedIds.add(canonKey);
                    }
                });
            }

            const readKeys = [`lucky777_read_notifs_${uid}`, 'lucky777_read_notifs_global'];
            readKeys.forEach(rk => {
                const arr = this._getStoredIdsArray(rk);
                arr.forEach(id => {
                    if (id) {
                        const normId = String(id).trim();
                        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                        const canonKey = this.getCanonicalPushKey(id);
                        this._memoryReadIds.add(normId);
                        this._memoryReadIds.add(cleanId);
                        if (canonKey) this._memoryReadIds.add(canonKey);
                    }
                });
            });

            if (this.safeGetItem(`lucky777_inbox_cleared_${uid}`) === 'true' || (typeof localStorage !== 'undefined' && localStorage.getItem(`lucky777_inbox_cleared_${uid}`) === 'true')) {
                this._memoryClearedUsers.add(uid);
            }
            if (this.safeGetItem('lucky777_inbox_cleared_global') === 'true' || (typeof localStorage !== 'undefined' && localStorage.getItem('lucky777_inbox_cleared_global') === 'true')) {
                this._memoryClearedUsers.add('global');
            }
        } catch(e) {}
    },

    /**
     * 알림함 목록, 읽음 목록, 삭제 목록, 전체삭제 상태를 Firestore(lotto_users 서브컬렉션 및 lotto_purchases)에 영구 저장
     */
    async saveNotificationsToServer(userId = null, customPayload = null) {
        const fs = this.getFirestore();
        if (!fs) return false;
        try {
            const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
            const docId = this.getNotificationDocId(uid);
            if (!docId) return false;

            const isExplicitReset = !!(customPayload && customPayload.isExplicitReset === true);

            // 🔒 Hydration Gate: 미동기화된 초기 메모리/스토리지 상태로 서버 데이터를 덮어쓰는 오류 원천 방지
            // 만약 서버 데이터를 아직 조회하지 않았다면 loadNotificationsFromServer 완료를 먼저 대기한다.
            if (!this._isServerLoaded?.[uid] && !isExplicitReset && (!customPayload || !customPayload.forceSync)) {
                try {
                    await this.loadNotificationsFromServer(uid);
                } catch(e) {}
            }

            const isCleared = (customPayload && typeof customPayload.isCleared === 'boolean')
                ? customPayload.isCleared
                : this.isInboxCleared(uid);

            const clearedAt = (customPayload && customPayload.clearedAt)
                ? customPayload.clearedAt
                : (this.safeGetItem(`lucky777_inbox_cleared_at_${uid}`) || (isCleared ? new Date().toISOString() : null));

            const listToSave = (customPayload && Array.isArray(customPayload.inbox))
                ? customPayload.inbox
                : this.getNotifications();

            const readArr = Array.from(new Set([
                ...Array.from(this._memoryReadIds),
                ...this._getStoredIdsArray(`lucky777_read_notifs_${uid}`),
                ...this._getStoredIdsArray('lucky777_read_notifs_global')
            ])).slice(-300);

            if (!this._serverKnownDeletedIds) this._serverKnownDeletedIds = {};
            if (!this._serverKnownDeletedIds[uid]) this._serverKnownDeletedIds[uid] = new Set();
            const serverKnown = this._serverKnownDeletedIds[uid];

            let delArr;
            if (isExplicitReset) {
                delArr = Array.isArray(customPayload.deletedIds) ? customPayload.deletedIds : [];
                this._serverKnownDeletedIds[uid] = new Set(delArr);
            } else {
                delArr = Array.from(new Set([
                    ...Array.from(serverKnown),
                    ...Array.from(this._memoryDeletedIds),
                    ...this._getStoredIdsArray(this.getDeletedNotifsKey(uid)),
                    ...this._getStoredIdsArray('lucky777_deleted_notifs_global'),
                    ...(Array.isArray(customPayload && customPayload.deletedIds) ? customPayload.deletedIds : [])
                ])).slice(-300);
                delArr.forEach(id => serverKnown.add(id));
            }

            const payload = {
                userId: uid,
                docId: docId,
                updatedAt: new Date().toISOString(),
                clientVersion: (typeof window !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION : '',
                isCleared: !!isCleared,
                clearedAt: clearedAt,
                readIds: readArr,
                deletedIds: delArr,
                inbox: listToSave.slice(0, 40)
            };

            // 1. lotto_users/{docId}/notifications/inbox 저장 (서브컬렉션 권한 허용)
            const p1 = fs.collection('lotto_users').doc(docId).collection('notifications').doc('inbox').set(payload, { merge: true }).catch(() => {});
            
            // 2. lotto_purchases/notifs_{docId} 저장 (메인 컬렉션 권한 허용)
            const p2 = fs.collection('lotto_purchases').doc(`notifs_${docId}`).set(payload, { merge: true }).catch(() => {});

            // 3. lotto_users/{docId} notificationMeta 요약 저장 (실시간 onSnapshot 에코 지원)
            const p3 = fs.collection('lotto_users').doc(docId).set({
                notificationMeta: {
                    isCleared: !!isCleared,
                    clearedAt: clearedAt,
                    readIds: readArr,
                    deletedIds: delArr,
                    updatedAt: new Date().toISOString()
                }
            }, { merge: true }).catch(() => {});

            await Promise.allSettled([p1, p2, p3]);
            this._isServerLoaded = this._isServerLoaded || {};
            this._isServerLoaded[uid] = true;
            return true;
        } catch (err) {
            console.warn('[PushClient] saveNotificationsToServer note:', err);
            return false;
        }
    },

    debouncedSaveNotificationsToServer(delay = 350) {
        if (this._saveNotificationsTimer) {
            clearTimeout(this._saveNotificationsTimer);
        }
        this._saveNotificationsTimer = setTimeout(() => {
            this._saveNotificationsTimer = null;
            this.saveNotificationsToServer().catch(() => {});
        }, delay);
    },

    /**
     * Firestore에서 서버 알림 내역을 로드하여 로컬에 완전 복원 (lotto_purchases 및 서브컬렉션 병렬 조회 & 삭제내역 완벽 합집합 병합)
     */
    async loadNotificationsFromServer(userId = null) {
        const fs = this.getFirestore();
        if (!fs) return false;
        const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
        const docId = this.getNotificationDocId(uid);
        if (!docId) return false;

        if (this._serverLoadPromise && this._serverLoadPromise[uid]) {
            return this._serverLoadPromise[uid];
        }

        this._serverLoadPromise = this._serverLoadPromise || {};
        this._serverLoadPromise[uid] = (async () => {
            try {
                // 1. lotto_purchases/notifs_{docId} 와 lotto_users/{docId}/notifications/inbox 동시 병렬 조회
                const p1 = fs.collection('lotto_purchases').doc(`notifs_${docId}`).get().catch(() => null);
                const p2 = fs.collection('lotto_users').doc(docId).collection('notifications').doc('inbox').get().catch(() => null);

                const [pSnap, subSnap] = await Promise.race([
                    Promise.all([p1, p2]),
                    new Promise(resolve => setTimeout(() => resolve([null, null]), 2500))
                ]);

                let pData = (pSnap && pSnap.exists) ? pSnap.data() : null;
                let subData = (subSnap && subSnap.exists) ? subSnap.data() : null;

                let data = null;
                if (pData && subData) {
                    const pTime = new Date(pData.updatedAt || 0).getTime();
                    const sTime = new Date(subData.updatedAt || 0).getTime();
                    data = (pTime >= sTime) ? { ...pData } : { ...subData };
                    // 삭제 목록과 읽음 목록은 양쪽 문서의 완벽한 합집합(Union) 보장 (어느 한쪽이라도 삭제한 기록이 있으면 영구 보존)
                    const unionDel = Array.from(new Set([
                        ...(Array.isArray(pData.deletedIds) ? pData.deletedIds : []),
                        ...(Array.isArray(subData.deletedIds) ? subData.deletedIds : [])
                    ]));
                    const unionRead = Array.from(new Set([
                        ...(Array.isArray(pData.readIds) ? pData.readIds : []),
                        ...(Array.isArray(subData.readIds) ? subData.readIds : [])
                    ]));
                    data.deletedIds = unionDel;
                    data.readIds = unionRead;
                } else if (pData) {
                    data = pData;
                } else if (subData) {
                    data = subData;
                } else {
                    // 보조: lotto_users/{docId}.notificationMeta 확인
                    try {
                        const uSnap = await Promise.race([
                            fs.collection('lotto_users').doc(docId).get(),
                            new Promise(resolve => setTimeout(() => resolve(null), 1500))
                        ]);
                        if (uSnap && uSnap.exists && uSnap.data() && uSnap.data().notificationMeta) {
                            data = uSnap.data().notificationMeta;
                        }
                    } catch(e) {}
                }

                if (!this._serverKnownDeletedIds) this._serverKnownDeletedIds = {};
                if (!this._serverKnownDeletedIds[uid]) this._serverKnownDeletedIds[uid] = new Set();

                if (data) {
                    this.applyServerNotificationData(uid, data);
                    this._isServerLoaded = this._isServerLoaded || {};
                    this._isServerLoaded[uid] = true;
                    return true;
                } else {
                    this._isServerLoaded = this._isServerLoaded || {};
                    this._isServerLoaded[uid] = true;
                    return false;
                }
            } catch (err) {
                console.warn('[PushClient] loadNotificationsFromServer note:', err);
                return false;
            } finally {
                if (this._serverLoadPromise) {
                    this._serverLoadPromise[uid] = null;
                }
            }
        })();

        return this._serverLoadPromise[uid];
    },

    /**
     * Firestore 서버 데이터를 로컬 메모리 및 스토리지에 적용
     */
    applyServerNotificationData(uid, data) {
        if (!data || typeof data !== 'object') return;

        // 1. isCleared 상태 복원
        if (data.isCleared === true) {
            this._memoryClearedUsers.add(uid);
            this._memoryClearedUsers.add('global');
            this.safeSetItem(`lucky777_inbox_cleared_${uid}`, 'true');
            this.safeSetItem('lucky777_inbox_cleared_global', 'true');
            try {
                localStorage.setItem(`lucky777_inbox_cleared_${uid}`, 'true');
                localStorage.setItem('lucky777_inbox_cleared_global', 'true');
            } catch(e) {}
            if (data.clearedAt) {
                this.safeSetItem(`lucky777_inbox_cleared_at_${uid}`, data.clearedAt);
            }
        }

        // 2. deletedIds 복원
        if (!this._serverKnownDeletedIds) this._serverKnownDeletedIds = {};
        if (!this._serverKnownDeletedIds[uid]) this._serverKnownDeletedIds[uid] = new Set();
        const serverKnown = this._serverKnownDeletedIds[uid];

        if (Array.isArray(data.deletedIds) && data.deletedIds.length > 0) {
            const delKey = this.getDeletedNotifsKey(uid);
            let localDelArr = this._getStoredIdsArray(delKey);

            data.deletedIds.forEach(id => {
                if (!id) return;
                const normId = String(id).trim();
                const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                const canonKey = this.getCanonicalPushKey(id);
                this._memoryDeletedIds.add(normId);
                this._memoryDeletedIds.add(cleanId);
                if (canonKey) this._memoryDeletedIds.add(canonKey);

                serverKnown.add(normId);
                serverKnown.add(cleanId);
                if (canonKey) serverKnown.add(canonKey);

                this.safeSetItem(`lucky777_deleted_${normId}`, 'true');
                this.safeSetItem(`lucky777_deleted_${cleanId}`, 'true');
                if (canonKey) this.safeSetItem(`lucky777_deleted_${canonKey}`, 'true');

                if (normId.startsWith('admin-msg-') || normId.startsWith('admin_')) {
                    const rawAdm = normId.replace(/^admin-msg-/, '').replace(/^admin_/, '');
                    this._memoryDeletedIds.add(`admin-msg-${rawAdm}`);
                    this._memoryDeletedIds.add(`admin_${rawAdm}`);
                    this._memoryDeletedIds.add(rawAdm);
                    serverKnown.add(`admin-msg-${rawAdm}`);
                    serverKnown.add(`admin_${rawAdm}`);
                    serverKnown.add(rawAdm);
                    this.safeSetItem(`lucky777_deleted_admin-msg-${rawAdm}`, 'true');
                    this.safeSetItem(`lucky777_deleted_admin_${rawAdm}`, 'true');
                    this.safeSetItem(`lucky777_deleted_${rawAdm}`, 'true');
                }

                const drawM = normId.match(/(?:draw-result|win-celebrate)-(\d+)/);
                if (drawM) {
                    const r = drawM[1];
                    this._memoryDeletedIds.add(`draw-result-${r}`);
                    this._memoryDeletedIds.add(`win-celebrate-${r}`);
                    this._memoryDeletedIds.add(`round_${r}_result`);
                    serverKnown.add(`draw-result-${r}`);
                    serverKnown.add(`win-celebrate-${r}`);
                    serverKnown.add(`round_${r}_result`);
                    this.safeSetItem(`lucky777_deleted_draw-result-${r}`, 'true');
                    this.safeSetItem(`lucky777_deleted_win-celebrate-${r}`, 'true');
                    this.safeSetItem(`lucky777_deleted_round_${r}_result`, 'true');
                }

                if (!localDelArr.includes(normId)) localDelArr.push(normId);
                if (!localDelArr.includes(cleanId)) localDelArr.push(cleanId);
                if (canonKey && !localDelArr.includes(canonKey)) localDelArr.push(canonKey);
            });

            const serializedDel = JSON.stringify(localDelArr.slice(-200));
            this.safeSetItem(delKey, serializedDel);
            this.safeSetItem('lucky777_deleted_notifs_global', serializedDel);
            try {
                localStorage.setItem(delKey, serializedDel);
                localStorage.setItem('lucky777_deleted_notifs_global', serializedDel);
            } catch(e) {}
        }

        // 3. readIds 복원
        if (Array.isArray(data.readIds) && data.readIds.length > 0) {
            const readKey = `lucky777_read_notifs_${uid}`;
            let localReadArr = this._getStoredIdsArray(readKey);

            data.readIds.forEach(id => {
                if (!id) return;
                const normId = String(id).trim();
                const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                const canonKey = this.getCanonicalPushKey(id);
                this._memoryReadIds.add(normId);
                this._memoryReadIds.add(cleanId);
                if (canonKey) this._memoryReadIds.add(canonKey);

                this.safeSetItem(`lucky777_read_${normId}`, 'true');
                this.safeSetItem(`lucky777_read_${cleanId}`, 'true');
                if (canonKey) this.safeSetItem(`lucky777_read_${canonKey}`, 'true');

                if (!localReadArr.includes(normId)) localReadArr.push(normId);
                if (!localReadArr.includes(cleanId)) localReadArr.push(cleanId);
                if (canonKey && !localReadArr.includes(canonKey)) localReadArr.push(canonKey);
            });

            const serializedRead = JSON.stringify(localReadArr.slice(-200));
            this.safeSetItem(readKey, serializedRead);
            this.safeSetItem('lucky777_read_notifs_global', serializedRead);
            try {
                localStorage.setItem(readKey, serializedRead);
                localStorage.setItem('lucky777_read_notifs_global', serializedRead);
            } catch(e) {}
        }

        // 4. inbox 복원 및 병합 (삭제된 알림은 배제하고 읽음 상태 동기화)
        const key = this.getInboxStorageKey(uid);
        let list = [];
        if (data.isCleared === true) {
            list = [];
        } else if (Array.isArray(data.inbox)) {
            list = data.inbox.filter(item => {
                if (!item || !item.id) return false;
                const itemId = String(item.id).trim();
                if (this.isNotificationDeleted(itemId)) return false;
                if (itemId.startsWith('myeongri-') || item.category === 'myeongri') return false;
                return true;
            });
            list.forEach(item => {
                if (!item || !item.id) return;
                if (item.unread === false || this.isNotificationRead(item.id)) {
                    item.unread = false;
                }
            });
        }

        this._memoryInboxMap[key] = list.slice(0, 40);
        this.safeSetItem(key, JSON.stringify(list.slice(0, 40)));
        try {
            localStorage.setItem(key, JSON.stringify(list.slice(0, 40)));
        } catch(e) {}

        this.safeSetItem(`lucky777_inbox_seeded_${uid}`, 'true');
        try { localStorage.setItem(`lucky777_inbox_seeded_${uid}`, 'true'); } catch(e) {}

        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }
    },

    /**
     * Firestore lotto_notifications 실시간 리스너 연결 (PC <-> 모바일 다중 기기 실시간 읽음/삭제 동기화)
     */
    listenNotificationsFromServer(userId = null) {
        const fs = this.getFirestore();
        if (!fs) return;
        const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
        const docId = this.getNotificationDocId(uid);
        if (!docId) return;

        if (this._notificationsFsDocId === docId && Array.isArray(this._notificationsFsUnsubscribes) && this._notificationsFsUnsubscribes.length > 0) {
            return;
        }

        if (this._notificationsFsUnsubscribes && Array.isArray(this._notificationsFsUnsubscribes)) {
            this._notificationsFsUnsubscribes.forEach(unsub => {
                try { unsub(); } catch(e) {}
            });
        }
        if (this._notificationsFsUnsubscribe) {
            try { this._notificationsFsUnsubscribe(); } catch(e) {}
            this._notificationsFsUnsubscribe = null;
        }
        this._notificationsFsUnsubscribes = [];
        this._notificationsFsDocId = docId;

        const handleSnapshot = (doc, sourceName) => {
            if (!doc || !doc.exists) return;
            if (doc.metadata && doc.metadata.hasPendingWrites) {
                return;
            }
            const serverData = doc.data() || {};
            this.applyServerNotificationData(uid, serverData);
        };

        // 1. lotto_purchases/notifs_{docId} 실시간 리스너 (주요 최상위 컬렉션 실시간 동기화)
        try {
            const unsub1 = fs.collection('lotto_purchases').doc(`notifs_${docId}`).onSnapshot(
                doc => handleSnapshot(doc, 'lotto_purchases'),
                err => console.warn('[PushClient] lotto_purchases notifs onSnapshot note:', err)
            );
            this._notificationsFsUnsubscribes.push(unsub1);
        } catch(e) {}

        // 2. lotto_users/{docId}/notifications/inbox 실시간 리스너 (서브컬렉션 보조 동기화)
        try {
            const unsub2 = fs.collection('lotto_users').doc(docId).collection('notifications').doc('inbox').onSnapshot(
                doc => handleSnapshot(doc, 'lotto_users_inbox'),
                err => console.warn('[PushClient] lotto_users inbox onSnapshot note:', err)
            );
            this._notificationsFsUnsubscribes.push(unsub2);
        } catch(e) {}
    },

    getActiveUserId() {
        let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest');
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }
        return String(uid || 'guest').trim().toLowerCase();
    },

    getInboxStorageKey(userId = null) {
        const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
        return `lucky777_notification_inbox_${uid}`;
    },

    getDeletedNotifsKey(userId = null) {
        const uid = String(userId || this.getActiveUserId()).trim().toLowerCase();
        return `lucky777_deleted_notifs_${uid}`;
    },

    isInboxCleared(uid) {
        const targetUid = String(uid || this.getActiveUserId()).trim().toLowerCase();
        if (this._memoryClearedUsers.has(targetUid) || this._memoryClearedUsers.has('global')) return true;
        return (this.safeGetItem(`lucky777_inbox_cleared_${targetUid}`) === 'true') ||
            (this.safeGetItem('lucky777_inbox_cleared_global') === 'true') ||
            (typeof localStorage !== 'undefined' && (
                localStorage.getItem(`lucky777_inbox_cleared_${targetUid}`) === 'true' ||
                localStorage.getItem('lucky777_inbox_cleared_global') === 'true'
            ));
    },

    isNotificationDeleted(notifId) {
        if (!notifId) return false;
        try {
            const normId = String(notifId).trim();
            const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
            const canonKey = this.getCanonicalPushKey(notifId);

            if (
                this._memoryDeletedIds.has(normId) ||
                this._memoryDeletedIds.has(cleanId) ||
                (canonKey && this._memoryDeletedIds.has(canonKey))
            ) {
                return true;
            }

            const uid = this.getActiveUserId();
            const serverKnown = this._serverKnownDeletedIds && this._serverKnownDeletedIds[uid];
            if (serverKnown) {
                if (serverKnown.has(normId) || serverKnown.has(cleanId) || (canonKey && serverKnown.has(canonKey))) {
                    return true;
                }
                if (normId.startsWith('admin-msg-') || normId.startsWith('admin_')) {
                    const rawAdm = normId.replace(/^admin-msg-/, '').replace(/^admin_/, '');
                    if (serverKnown.has(rawAdm) || serverKnown.has(`admin_${rawAdm}`) || serverKnown.has(`admin-msg-${rawAdm}`)) {
                        return true;
                    }
                }
                const drawM = normId.match(/(?:draw-result|win-celebrate)-(\d+)/);
                if (drawM) {
                    const r = drawM[1];
                    if (
                        serverKnown.has(`draw-result-${r}`) ||
                        serverKnown.has(`win-celebrate-${r}`) ||
                        serverKnown.has(`round_${r}_result`)
                    ) {
                        return true;
                    }
                }
            }

            if (normId.startsWith('admin-msg-') || normId.startsWith('admin_')) {
                const rawAdm = normId.replace(/^admin-msg-/, '').replace(/^admin_/, '');
                if (this._memoryDeletedIds.has(rawAdm) || this._memoryDeletedIds.has(`admin_${rawAdm}`) || this._memoryDeletedIds.has(`admin-msg-${rawAdm}`)) {
                    return true;
                }
            }

            const drawM = normId.match(/(?:draw-result|win-celebrate)-(\d+)/);
            if (drawM) {
                const r = drawM[1];
                if (
                    this._memoryDeletedIds.has(`draw-result-${r}`) ||
                    this._memoryDeletedIds.has(`win-celebrate-${r}`) ||
                    this._memoryDeletedIds.has(`round_${r}_result`)
                ) {
                    return true;
                }
            }

            if (
                this.safeGetItem(`lucky777_deleted_${normId}`) === 'true' ||
                this.safeGetItem(`lucky777_deleted_${cleanId}`) === 'true' ||
                (canonKey && this.safeGetItem(`lucky777_deleted_${canonKey}`) === 'true') ||
                (typeof localStorage !== 'undefined' && (
                    localStorage.getItem(`lucky777_deleted_${normId}`) === 'true' ||
                    localStorage.getItem(`lucky777_deleted_${cleanId}`) === 'true' ||
                    (canonKey && localStorage.getItem(`lucky777_deleted_${canonKey}`) === 'true')
                ))
            ) {
                this._memoryDeletedIds.add(normId);
                this._memoryDeletedIds.add(cleanId);
                if (canonKey) this._memoryDeletedIds.add(canonKey);
                return true;
            }

            const delKeys = [this.getDeletedNotifsKey(), 'lucky777_deleted_notifs_global'];
            for (const delKey of delKeys) {
                const raw = this.safeGetItem(delKey) || (typeof localStorage !== 'undefined' ? localStorage.getItem(delKey) : null);
                if (raw) {
                    try {
                        const delArr = JSON.parse(raw);
                        if (Array.isArray(delArr)) {
                            const isDel = delArr.includes(normId) || delArr.includes(cleanId) || (canonKey && delArr.includes(canonKey));
                            if (isDel) {
                                this._memoryDeletedIds.add(normId);
                                this._memoryDeletedIds.add(cleanId);
                                if (canonKey) this._memoryDeletedIds.add(canonKey);
                                return true;
                            }
                        }
                    } catch(e) {}
                }
            }

            if (this.isInboxCleared(uid) || this.isInboxCleared('global')) {
                return true;
            }

            return false;
        } catch (e) {
            return false;
        }
    },

    /**
     * 알림 ID 또는 정규화 키를 기반으로 해당 알림이 이미 읽음 처리되었는지 확인
     */
    isNotificationRead(notifId) {
        if (!notifId) return false;
        try {
            const normId = String(notifId).trim();
            const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
            const canonKey = this.getCanonicalPushKey(notifId);

            if (
                this._memoryReadIds.has(normId) ||
                this._memoryReadIds.has(cleanId) ||
                (canonKey && this._memoryReadIds.has(canonKey))
            ) {
                return true;
            }

            const isReadInStorage =
                (this.safeGetItem(`lucky777_read_${normId}`) === 'true') ||
                (this.safeGetItem(`lucky777_read_${cleanId}`) === 'true') ||
                (canonKey && this.safeGetItem(`lucky777_read_${canonKey}`) === 'true') ||
                (localStorage.getItem(`lucky777_read_${normId}`) === 'true') ||
                (localStorage.getItem(`lucky777_read_${cleanId}`) === 'true') ||
                (canonKey && localStorage.getItem(`lucky777_read_${canonKey}`) === 'true');

            if (isReadInStorage) {
                this._memoryReadIds.add(normId);
                this._memoryReadIds.add(cleanId);
                if (canonKey) this._memoryReadIds.add(canonKey);
                return true;
            }

            // 사용자별 및 글로벌 영구 읽음 목록(Array) 확인
            const uid = this.getActiveUserId();
            const readKeys = [`lucky777_read_notifs_${uid}`, 'lucky777_read_notifs_global'];
            for (const rk of readKeys) {
                const raw = this.safeGetItem(rk) || (typeof localStorage !== 'undefined' ? localStorage.getItem(rk) : null);
                if (raw) {
                    try {
                        const arr = JSON.parse(raw);
                        if (Array.isArray(arr) && (arr.includes(normId) || arr.includes(cleanId) || (canonKey && arr.includes(canonKey)))) {
                            this._memoryReadIds.add(normId);
                            this._memoryReadIds.add(cleanId);
                            if (canonKey) this._memoryReadIds.add(canonKey);
                            return true;
                        }
                    } catch (e) {}
                }
            }

            // 현재 알림함 메모리 및 스토리지 캐시에서 unread === false 상태 확인
            const inboxKey = this.getInboxStorageKey();
            const cachedInbox = this._memoryInboxMap[inboxKey];
            if (Array.isArray(cachedInbox)) {
                const found = cachedInbox.find(it => it && (it.id === normId || it.id === cleanId || (canonKey && this.getCanonicalPushKey(it.id) === canonKey)));
                if (found && found.unread === false) {
                    this._memoryReadIds.add(normId);
                    this._memoryReadIds.add(cleanId);
                    if (canonKey) this._memoryReadIds.add(canonKey);
                    return true;
                }
            }

            return false;
        } catch (e) {
            return false;
        }
    },

    getNotifications() {
        try {
            const key = this.getInboxStorageKey();
            const raw = this.safeGetItem(key);
            let list = [];
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) list = parsed;
                } catch (e) {}
            } else if (Array.isArray(this._memoryInboxMap[key])) {
                list = [...this._memoryInboxMap[key]];
            }
            if (!Array.isArray(list)) list = [];

            // 🔮 사주 길일·길시 알림 원천 영구 삭제, ID 보정, 중복 제거 및 사용자 삭제 알림 필터링
            const origLen = list.length;
            let mutated = false;
            const seenKeys = new Set();

            list = list.filter((item, idx) => {
                if (!item || typeof item !== 'object') {
                    mutated = true;
                    return false;
                }
                if (!item.id || String(item.id).trim() === '' || String(item.id).trim() === 'undefined') {
                    item.id = `notif-${idx}-${String(item.category || 'sys')}`;
                    mutated = true;
                }
                const itemId = String(item.id || '').trim();
                const cat = String(item.category || '').trim();
                if (itemId.startsWith('myeongri-') || cat === 'myeongri') {
                    mutated = true;
                    return false;
                }
                if (this.isNotificationDeleted(itemId)) {
                    mutated = true;
                    return false;
                }
                const dedupKey = this.getCanonicalPushKey(itemId) || itemId;
                if (seenKeys.has(dedupKey)) {
                    mutated = true;
                    return false;
                }
                seenKeys.add(dedupKey);
                return true;
            });

            // 사용자가 이미 확인한 알림은 unread = false 강제 보장 및 boolean 타입 정규화,
            // 그리고 이미 확인된 알림(item.unread === false)의 ID를 _memoryReadIds 및 스토리지에 자가 복구(Self-Healing)
            list.forEach(item => {
                if (!item || !item.id) return;
                const itemId = String(item.id || '').trim();
                const cleanId = itemId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                const canonKey = this.getCanonicalPushKey(item.id);

                if (item.unread === false) {
                    this._memoryReadIds.add(itemId);
                    this._memoryReadIds.add(cleanId);
                    if (canonKey) this._memoryReadIds.add(canonKey);
                } else if (this.isNotificationRead(item.id)) {
                    item.unread = false;
                    mutated = true;
                } else {
                    const normUnread = (item.unread === true || item.unread === 'true');
                    if (item.unread !== normUnread) {
                        item.unread = normUnread;
                        mutated = true;
                    }
                }
            });

            if (list.length !== origLen || mutated) {
                this._memoryInboxMap[key] = list.slice(0, 40);
                this.safeSetItem(key, JSON.stringify(list.slice(0, 40)));
                try {
                    localStorage.setItem(key, JSON.stringify(list.slice(0, 40)));
                } catch(e) {}
            }

            // 로그인 상태인 경우, guest 알림함에 남아있는 미확인 알림 자동 병합 및 중복 푸시 각인
            const uid = this.getActiveUserId();
            if (!key.endsWith('_guest')) {
                try {
                    const guestRaw = this.safeGetItem('lucky777_notification_inbox_guest');
                    const guestList = guestRaw ? JSON.parse(guestRaw) : [];
                    if (Array.isArray(guestList) && guestList.length > 0) {
                        const hasUserInboxBefore = (list.length > 0) || this.isInboxCleared(uid) || (this.safeGetItem(key) !== null);
                        let mergedAny = false;
                        guestList.forEach(gItem => {
                            if (!gItem || !gItem.id) return;
                            const gId = String(gItem.id || '').trim();
                            if (gId.startsWith('myeongri-') || gItem.category === 'myeongri') return;
                            if (this.isNotificationDeleted(gItem.id) || this.isNotificationDeleted(gId)) return;
                            if (this.isNotificationRead(gItem.id)) gItem.unread = false;
                            this.recordPushFired(gItem.id);
                            // 회원의 기존 알림함이 이미 존재하는 경우, 게스트 임시 알림으로 인한 삭제 알림 부활 완전 차단
                            if (!hasUserInboxBefore) {
                                const exists = list.some(it => it && (it.id === gItem.id || this.getCanonicalPushKey(it.id) === this.getCanonicalPushKey(gItem.id)));
                                if (!exists) {
                                    list.push(gItem);
                                    mergedAny = true;
                                }
                            }
                        });
                        if (mergedAny) {
                            this._memoryInboxMap[key] = list.slice(0, 40);
                            this.safeSetItem(key, JSON.stringify(list.slice(0, 40)));
                        }
                        this.safeRemoveItem('lucky777_notification_inbox_guest');
                    }
                } catch(e) {}
            }

            // 알림 목록이 비어있고 사용자가 삭제/전체삭제를 하지 않은 경우에만 기본 알림 시드 생성
            const isCleared = this.isInboxCleared(uid);
            if (list.length === 0 && !isCleared && !this._isCheckingScheduledAlerts) {
                list = this.seedRecentNotifications(uid, list);
            }

            this._memoryInboxMap[key] = list;
            return list;
        } catch (e) {
            return [];
        }
    },

    /**
     * 알림함에 최근 5개 회차(1246, 1245, 1244, 1243, 1242) 공식 당첨결과 및 실구매 채점결과,
     * 차기 회차(1247) AI 추천 오픈, 공식 환영 공지를 알림함 히스토리로 보장 (스마트폰 푸시 팝업 제외)
     */
    seedRecentNotifications(userId, existingList = []) {
        try {
            const list = Array.isArray(existingList) ? [...existingList] : [];
            const uid = String(userId || 'guest').trim().toLowerCase();
            if (this.isInboxCleared(uid)) {
                return list;
            }
            const targetRound = this.getUpcomingRoundNumber();
            const dispName = this.getUserDisplayName();

            let latestDrawnRound = targetRound - 1;
            if (typeof window.getLatestDrawnRound === 'function') {
                try {
                    const ldr = window.getLatestDrawnRound();
                    if (ldr && ldr > 1000) latestDrawnRound = ldr;
                } catch(e) {}
            }
            if (this.getDrawData(1246) && latestDrawnRound < 1246) {
                latestDrawnRound = 1246;
            }

            const isGuest = (uid === 'guest');
            const isUserAlreadySeeded = !isGuest ||
                (this.safeGetItem(`lucky777_inbox_seeded_${uid}`) === 'true') ||
                (typeof localStorage !== 'undefined' && localStorage.getItem(`lucky777_inbox_seeded_${uid}`) === 'true') ||
                (list.length > 0);

            // 1. 차기 회차 AI 퀀트 추천번호 오픈 알림 보장
            if (targetRound >= 1246) {
                const recNotifId = `rec-ready-${targetRound}`;
                const hasRec = list.some(it => it && (it.id === recNotifId || this.getCanonicalPushKey(it.id) === `round_${targetRound}_rec`));
                const isRecRead = this.isNotificationRead(recNotifId);
                if (!hasRec && !this.isNotificationDeleted(recNotifId) && !this.isNotificationDeleted(`round_${targetRound}_rec`)) {
                    list.push({
                        id: recNotifId,
                        category: 'generator',
                        badge: '🎱 차기 추천번호 오픈',
                        title: `🎱 [AI 퀀트 맞춤] 제 ${targetRound}회차 AI 추천번호 및 10대 알고리즘 조합 오픈!`,
                        body: `${dispName}을 위한 제 ${targetRound}회차 AI 퀀트 알고리즘(올라운더 1·2·3 최신 엔진) 맞춤 추천번호 조합이 생성되었습니다. 지금 이번 주 최적 팩을 확인해 보세요.`,
                        createdAt: new Date().toISOString(),
                        timeLabel: `제 ${targetRound}회 추천 오픈`,
                        unread: !isRecRead,
                        actionType: 'generator',
                        actionLabel: '🎱 이번주 추천번호 확인하기'
                    });
                } else if (hasRec) {
                    const recItem = list.find(it => it && (it.id === recNotifId || this.getCanonicalPushKey(it.id) === `round_${targetRound}_rec`));
                    if (recItem && (isRecRead || recItem.unread === false || this.isNotificationRead(recItem.id))) {
                        recItem.unread = false;
                    }
                }
            }

            // 2. 최근 5개 회차별 공식 당첨결과 & 실구매 채점 알림 내역 보장
            // 신규 사용자 최초 진입 시에만 과거 5개 회차를 시딩하고, 이미 시딩된 사용자는 최신 회차(latestDrawnRound)만 점검하여 삭제된 과거 회차 재시드(부활)를 원천 차단
            const roundsToCheck = isUserAlreadySeeded
                ? [latestDrawnRound]
                : [latestDrawnRound, latestDrawnRound - 1, latestDrawnRound - 2, latestDrawnRound - 3, latestDrawnRound - 4].filter(r => r >= 1235);
            roundsToCheck.forEach(r => {
                const drawData = this.getDrawData(r);
                if (!drawData || !Array.isArray(drawData.numbers) || drawData.numbers.length !== 6) return;

                const combinedNotifId = `draw-result-${r}`;
                const legacyWinId = `win-celebrate-${r}`;
                const canonKey = `round_${r}_result`;
                if (this.isNotificationDeleted(combinedNotifId) || this.isNotificationDeleted(legacyWinId) || this.isNotificationDeleted(canonKey)) return;

                const existingIdx = list.findIndex(it => it && (it.id === combinedNotifId || it.id === legacyWinId || this.getCanonicalPushKey(it.id) === canonKey));

                const userPurchases = this.getUserPurchases(uid, r);
                const grade = this.gradePurchases(userPurchases, drawData);
                const numbersStr = drawData.numbers.join(', ');
                const bonusStr = String(drawData.bonus);
                const drawNumsHeader = `[${numbersStr}] + 보너스 [${bonusStr}]`;

                let notifBadge = '';
                let notifTitle = '';
                let notifBody = '';

                if (grade && grade.totalGames > 0 && grade.totalWins > 0) {
                    const hitsArray = [];
                    if (grade.hits[1]) hitsArray.push(`1등 ${grade.hits[1]}건`);
                    if (grade.hits[2]) hitsArray.push(`2등 ${grade.hits[2]}건`);
                    if (grade.hits[3]) hitsArray.push(`3등 ${grade.hits[3]}건`);
                    if (grade.hits[4]) hitsArray.push(`4등 ${grade.hits[4]}건`);
                    if (grade.hits[5]) hitsArray.push(`5등 ${grade.hits[5]}건`);
                    const hitsDesc = hitsArray.join(', ');

                    notifBadge = '🎉 당첨결과 & 구매확정 당첨';
                    notifTitle = `🎉 [제 ${r}회 당첨결과] 1등 ${drawNumsHeader} (구매확정 ${grade.totalWins}건 당첨!)`;
                    notifBody = `제 ${r}회 당첨번호: ${drawNumsHeader}\n🎊 ${dispName}의 구매확정 ${grade.totalGames}게임 채점 결과, ${hitsDesc} 총 ${grade.totalWins}건 당첨(총 당첨금 ${grade.totalPrize.toLocaleString()}원)을 축하드립니다! 확정 장부에서 상세 결과를 확인하세요.`;
                } else if (grade && grade.totalGames > 0 && grade.totalWins === 0) {
                    notifBadge = '📊 당첨결과 & 구매확정 채점';
                    notifTitle = `📊 [제 ${r}회 당첨결과] 1등 ${drawNumsHeader} (구매확정 채점완료)`;
                    notifBody = `제 ${r}회 당첨번호: ${drawNumsHeader}\n📊 ${dispName}의 구매확정 ${grade.totalGames}게임 채점 결과: 이번 회차는 아쉽게도 낙첨되었습니다. 차기 제 ${targetRound}회차 맞춤 조합을 확인해 보세요.`;
                } else {
                    const firstPrizeText = drawData.rank1Prize ? ` (1등 ${(drawData.rank1Prize / 100000000).toFixed(1)}억 원)` : '';
                    notifBadge = (r === latestDrawnRound) ? '🏆 최신회차 추첨결과 발표' : '🏆 공식 추첨결과 발표';
                    notifTitle = `🏆 [제 ${r}회 공식 결과] 1등 ${drawNumsHeader}${firstPrizeText}`;
                    notifBody = `제 ${r}회 당첨번호: ${drawNumsHeader}\n확인된 구매등록 내역이 없습니다. AI 추천번호 복기 결과 및 차기 제 ${targetRound}회차 맞춤 번호를 확인해 보세요.`;
                }

                const isAlreadyRead = this.isNotificationRead(combinedNotifId) ||
                    this.isNotificationRead(legacyWinId) ||
                    this.isNotificationRead(canonKey);

                const unreadFlag = (r === latestDrawnRound) ? !isAlreadyRead : false;

                if (existingIdx !== -1) {
                    const item = list[existingIdx];
                    item.id = combinedNotifId;
                    item.badge = notifBadge;
                    item.title = notifTitle;
                    item.body = notifBody;
                    item.category = 'result';
                    item.actionType = 'confirmed';
                    item.actionLabel = '📊 구매확정 당첨내역 확인하기';
                    if (item.unread === false || isAlreadyRead || !unreadFlag || this.isNotificationRead(item.id)) {
                        item.unread = false;
                    }
                } else {
                    list.push({
                        id: combinedNotifId,
                        category: 'result',
                        badge: notifBadge,
                        title: notifTitle,
                        body: notifBody,
                        createdAt: drawData.date ? new Date(drawData.date + 'T21:00:00+09:00').toISOString() : new Date().toISOString(),
                        timeLabel: `제 ${r}회 당첨·채점 발표`,
                        unread: unreadFlag,
                        actionType: 'confirmed',
                        actionLabel: '📊 구매확정 당첨내역 확인하기'
                    });
                }
            });

            // 3. 운도실력 공식 서비스 안내 알림 보장 (신규 사용자 최초 시딩 시에만 등록, 기존 사용자가 삭제한 경우 재시드 절대 금지)
            const welcomeNotifId = 'admin-msg-welcome';
            const hasWelcome = list.some(it => it && (it.id === welcomeNotifId || it.id === `push-${welcomeNotifId}`));
            if (!hasWelcome && !isUserAlreadySeeded && !this.isNotificationDeleted(welcomeNotifId) && !this.isNotificationDeleted('admin_welcome') && !this.isNotificationDeleted('welcome')) {
                list.push({
                    id: welcomeNotifId,
                    category: 'admin',
                    badge: '👑 운도실력 공지',
                    title: '📢 [운도실력] 스마트 복권 라이프 통합 알림 센터 안내',
                    body: '운도실력 통합 알림 센터에 오신 것을 환영합니다!\n매주 토요일 추첨 완료 시 최신 당첨번호와 회원님의 실구매 채점 결과가 이 곳 알림함에 자동으로 기록·보관됩니다.\n상단 탭을 통해 미확인 알림, 당첨·채점 내역, 관리자 메시지를 언제든지 편리하게 조회하실 수 있습니다.',
                    createdAt: '2026-10-01T00:00:00.000Z',
                    timeLabel: '서비스 공식 안내',
                    unread: false,
                    actionType: 'generator',
                    actionLabel: '🎱 추천번호 바로가기'
                });
            }

            // 알림 목록 정렬: 최신 회차 당첨결과 및 최신 추천번호가 최상단에 오도록 정렬
            list.sort((a, b) => {
                if (a.id.startsWith('draw-result-' + latestDrawnRound)) return -1;
                if (b.id.startsWith('draw-result-' + latestDrawnRound)) return 1;
                if (a.id.startsWith('rec-ready-')) return -1;
                if (b.id.startsWith('rec-ready-')) return 1;
                const rA = Number((a.id.match(/\d+/) || [0])[0]);
                const rB = Number((b.id.match(/\d+/) || [0])[0]);
                if (rA !== rB) return rB - rA;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });

            this.safeSetItem(`lucky777_inbox_seeded_${uid}`, 'true');
            try { localStorage.setItem(`lucky777_inbox_seeded_${uid}`, 'true'); } catch(e) {}

            const key = this.getInboxStorageKey(uid);
            const trimmed = list.slice(0, 40);
            this._memoryInboxMap[key] = trimmed;
            this.safeSetItem(key, JSON.stringify(trimmed));

            return trimmed;
        } catch (err) {
            console.warn('[PushClient] seedRecentNotifications error:', err);
            return existingList;
        }
    },

    saveNotifications(list, syncServer = true) {
        const key = this.getInboxStorageKey();
        const trimmed = (Array.isArray(list) ? list : []).slice(0, 40);
        this._memoryInboxMap[key] = trimmed;
        this.safeSetItem(key, JSON.stringify(trimmed));
        try {
            localStorage.setItem(this.getInboxStorageKey(), JSON.stringify(trimmed));
        } catch (e) {}

        try {
            const unreadCount = trimmed.filter(n => n && (n.unread === true || n.unread === 'true') && !this.isNotificationRead(n.id)).length;
            this.setBadge(unreadCount);
            this.renderUnreadNotificationUI();
            const modal = document.getElementById('lucky777NotificationCenterModal');
            if (modal && modal.style.display !== 'none') {
                this.renderNotificationCenterModalContent();
            }
        } catch (e) {}

        if (syncServer) {
            this.debouncedSaveNotificationsToServer();
        }
    },

    /**
     * 알림 ID로부터 회차/길시/관리자 식별 고유 카테고리 정규화 키 추출 (기기 단위 영구 발송 추적용)
     */
    getCanonicalPushKey(notifId) {
        if (!notifId) return '';
        const norm = String(notifId).trim().replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const slotMatch = norm.match(/myeongri-slot(\d+)-(\d{4}-\d{2}-\d{2})/);
        if (slotMatch) return `slot_${slotMatch[1]}_${slotMatch[2]}`;
        const dayMatch = norm.match(/myeongri-day-(\d{4}-\d{2}-\d{2})/);
        if (dayMatch) return `day_${dayMatch[1]}`;
        const lockMatch = norm.match(/lock-reminder-(\d+)/);
        if (lockMatch) return `round_${lockMatch[1]}_lock`;
        const winMatch = norm.match(/(?:win-celebrate|draw-result)-(\d+)/);
        if (winMatch) return `round_${winMatch[1]}_result`;
        const recMatch = norm.match(/rec-ready-(\d+)/);
        if (recMatch) return `round_${recMatch[1]}_rec`;
        const adminMatch = norm.match(/admin-msg-(.+)/);
        if (adminMatch) return `admin_${adminMatch[1]}`;
        return norm;
    },

    /**
     * 특정 알림에 대해 이미 기기에서 푸시 팝업이 발송되었는지 확인 (1회 발송 보장)
     */
    isPushAlreadyFired(notifId) {
        if (!notifId) return false;
        const normId = String(notifId).trim();
        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const canonKey = this.getCanonicalPushKey(notifId);

        try {
            // 1. 발송 완료 플래그 (ID 단위)
            if (localStorage.getItem(`lucky777_alert_fired_${cleanId}`) === 'true') return true;
            if (localStorage.getItem(`lucky777_alert_fired_${normId}`) === 'true') return true;
            if (localStorage.getItem(`lucky777_pushed_${cleanId}`) === 'true') return true;
            if (localStorage.getItem(`lucky777_pushed_${normId}`) === 'true') return true;

            // 2. 발송 완료 플래그 (카테고리/회차/길시 정규화 단위)
            if (canonKey) {
                if (localStorage.getItem(`lucky777_fired_${canonKey}`) === 'true') return true;
                if (localStorage.getItem(`lucky777_alert_fired_${canonKey}`) === 'true') return true;
            }

            // 3. 읽음 완료 플래그
            if (localStorage.getItem(`lucky777_read_${cleanId}`) === 'true') return true;
            if (localStorage.getItem(`lucky777_read_${normId}`) === 'true') return true;
            if (canonKey && localStorage.getItem(`lucky777_read_${canonKey}`) === 'true') return true;

            // 4. 관리자 메시지 전용 알림/dismiss 플래그
            if (cleanId.startsWith('admin-msg-')) {
                const rawMsgId = cleanId.replace('admin-msg-', '');
                let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
                if (typeof uid === 'string' && uid.startsWith('{')) {
                    try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
                }
                uid = String(uid || '').trim().toLowerCase();
                if (localStorage.getItem(`lucky777_admin_notified_${uid}_${rawMsgId}`) === 'true') return true;
                if (localStorage.getItem(`admin_popup_dismissed_${uid}_${rawMsgId}`) === 'true') return true;
            }
        } catch(e) {}
        return false;
    },

    /**
     * 특정 알림의 푸시 팝업 발송 완료 기록
     */
    recordPushFired(notifId) {
        if (!notifId) return;
        const normId = String(notifId).trim();
        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const canonKey = this.getCanonicalPushKey(notifId);

        try {
            localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
            localStorage.setItem(`lucky777_pushed_${cleanId}`, 'true');
            localStorage.setItem(`lucky777_pushed_${normId}`, 'true');
            if (canonKey) {
                localStorage.setItem(`lucky777_fired_${canonKey}`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${canonKey}`, 'true');
            }
            if (cleanId.startsWith('draw-result-')) {
                const rNum = cleanId.replace('draw-result-', '');
                localStorage.setItem(`lucky777_alert_fired_win-celebrate-${rNum}`, 'true');
                localStorage.setItem(`lucky777_pushed_win-celebrate-${rNum}`, 'true');
            } else if (cleanId.startsWith('win-celebrate-')) {
                const rNum = cleanId.replace('win-celebrate-', '');
                localStorage.setItem(`lucky777_alert_fired_draw-result-${rNum}`, 'true');
                localStorage.setItem(`lucky777_pushed_draw-result-${rNum}`, 'true');
            }
            if (cleanId.startsWith('admin-msg-')) {
                const rawMsgId = cleanId.replace('admin-msg-', '');
                let uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
                if (typeof uid === 'string' && uid.startsWith('{')) {
                    try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
                }
                uid = String(uid || '').trim().toLowerCase();
                if (uid && rawMsgId) {
                    localStorage.setItem(`lucky777_admin_notified_${uid}_${rawMsgId}`, 'true');
                }
            }
        } catch(e) {}
    },

    addNotification(notif, showBrowserAlert = false) {
        if (!notif || !notif.id) return false;
        const normId = String(notif.id).trim();
        const cleanAlertId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const normTitle = String(notif.title || '').trim();
        const normBody = String(notif.body || '').trim();
        const canonKey = this.getCanonicalPushKey(notif.id);

        // [길일·길시 알림 완전 배제] 사주 길일·길시 알림 생성 원천 차단
        if (notif.category === 'myeongri' || cleanAlertId.startsWith('myeongri-')) {
            return false;
        }

        // 사용자가 이미 삭제한 알림인 경우 재생성 차단
        if (this.isNotificationDeleted(notif.id)) {
            return false;
        }

        const deviceAlertKey = `lucky777_alert_fired_${cleanAlertId}`;
        // 동일 알림 푸시는 최초 1회만 발송: 이미 기기에서 푸시가 나갔다면 재푸시 원천 차단 (알림함에서만 확인)
        if (localStorage.getItem(`lucky777_read_${cleanAlertId}`) === 'true' || this.isPushAlreadyFired(cleanAlertId) || this.isPushAlreadyFired(normId) || (canonKey && this.isPushAlreadyFired(canonKey)) || localStorage.getItem(deviceAlertKey) === 'true') {
            showBrowserAlert = false;
        }

        // [사용자 지정 원칙] 최신회차 당첨번호 및 구매확정 당첨내역 통합 알림(category: 'result') 이외의 다른 모든 스마트폰 알림 푸시는 원천 차단 (알림함에서만 확인)
        if (notif.category !== 'result' && !cleanAlertId.startsWith('test-alert-')) {
            showBrowserAlert = false;
        }

        const list = this.getNotifications();

        // 1. 다중 스마트 중복 필터링:
        // - 동일 ID
        // - push- 접두사 차이 무시 동일 ID (admin-msg-123 === push-admin-msg-123)
        // - lotto-result- 와 draw-result- 상호 호환 ID
        // - canonical 키가 동일한 경우
        // - 제목과 본문 내용이 100% 동일한 경우
        const existingIdx = list.findIndex(item => {
            if (!item) return false;
            const itemId = String(item.id || '').trim();
            if (itemId === normId) return true;
            if (itemId.replace(/^push-/, '') === normId.replace(/^push-/, '')) return true;
            if (itemId.replace('lotto-result-', 'draw-result-') === normId.replace('lotto-result-', 'draw-result-')) return true;
            if (canonKey && this.getCanonicalPushKey(item.id) === canonKey) return true;
            if (normTitle && normBody && item.title === normTitle && item.body === normBody) return true;
            return false;
        });

        if (existingIdx !== -1) {
            // 이미 알림함에 존재하는 경우: 본문이나 배지만 최신화하고 푸시 팝업은 재발송하지 않음 (알림함 유지)
            const existing = list[existingIdx];
            let updated = false;

            const isAlreadyRead = this.isNotificationRead(existing.id) ||
                this.isNotificationRead(cleanAlertId) ||
                this.isNotificationRead(normId) ||
                (canonKey && this.isNotificationRead(canonKey));

            if (isAlreadyRead && existing.unread) {
                existing.unread = false;
                updated = true;
            }

            if (notif.badge && existing.badge !== notif.badge) {
                existing.badge = notif.badge;
                updated = true;
            }
            if (notif.title && existing.title !== notif.title) {
                existing.title = notif.title;
                updated = true;
            }
            if (notif.body && existing.body !== notif.body) {
                existing.body = notif.body;
                updated = true;
            }
            if (notif.timeLabel && existing.timeLabel !== notif.timeLabel) {
                existing.timeLabel = notif.timeLabel;
                updated = true;
            }
            if (notif.actionType && existing.actionType !== notif.actionType) {
                existing.actionType = notif.actionType;
                updated = true;
            }
            if (notif.actionLabel && existing.actionLabel !== notif.actionLabel) {
                existing.actionLabel = notif.actionLabel;
                updated = true;
            }
            if (notif.category && existing.category !== notif.category) {
                existing.category = notif.category;
                updated = true;
            }

            // 최신 당첨 결과 알림(draw-result)은 항상 최신 결과로 알림함 최상단으로 이동 (Pin to Top)
            if (cleanAlertId.startsWith('draw-result-') || cleanAlertId.startsWith('win-celebrate-')) {
                list.splice(existingIdx, 1);
                list.unshift(existing);
                this.saveNotifications(list);
                return true;
            }

            if (updated) {
                this.saveNotifications(list);
            }
            return false;
        }

        // 사용자가 이미 확인한 알림인 경우 unread = false로 보존
        const isAlreadyRead = this.isNotificationRead(notif.id) ||
            this.isNotificationRead(cleanAlertId) ||
            this.isNotificationRead(normId) ||
            (canonKey && this.isNotificationRead(canonKey));

        const newItem = {
            id: notif.id,
            category: notif.category || 'result',
            badge: notif.badge || '🔔 운도실력 알림',
            title: notif.title || '운도실력 맞춤 알림',
            body: notif.body || '',
            createdAt: notif.createdAt || new Date().toISOString(),
            timeLabel: notif.timeLabel || this.formatTimeLabel(notif.createdAt),
            unread: isAlreadyRead ? false : (notif.unread !== false),
            actionType: notif.actionType || 'confirmed',
            actionLabel: notif.actionLabel || '📊 바로 확인하기'
        };

        list.unshift(newItem);
        this.saveNotifications(list);

        // 최초 1회에 한해서만 브라우저/OS 알림 발송 (이후는 알림함에서 확인)
        if (showBrowserAlert && typeof Notification !== 'undefined' && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            this.recordPushFired(cleanAlertId);
            this.recordPushFired(normId);

            navigator.serviceWorker.ready.then(reg => {
                const origin = window.location.origin;
                const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
                const targetTab = (newItem.actionType === 'confirmed') ? 'tab-confirmed-list' : ((newItem.actionType === 'fortune') ? 'tab-dashboard' : 'tab-generator');

                // OS 알림바(Tray)에 이미 활성 표시 중인 동일 알림이 있으면 새로고침 시 중복 진동/알림 방지
                const checkTag = newItem.id;
                const getNotifsPromise = (typeof reg.getNotifications === 'function')
                    ? reg.getNotifications({ tag: checkTag })
                    : Promise.resolve([]);

                getNotifsPromise.then(activeNotifs => {
                    if (Array.isArray(activeNotifs) && activeNotifs.length > 0) {
                        return; // 이미 화면 상단바에 표시되어 있으므로 재울림 방지
                    }
                    reg.showNotification(newItem.title, {
                        body: newItem.body,
                        icon: `${origin}${basePath}icons/icon-192.png`,
                        badge: `${origin}${basePath}icons/favicon.png`,
                        tag: newItem.id,
                        renotify: false,
                        vibrate: [150, 80, 150],
                        data: { url: `${origin}${basePath}?tab=${targetTab}`, id: newItem.id }
                    }).catch(() => {});
                }).catch(() => {
                    reg.showNotification(newItem.title, {
                        body: newItem.body,
                        icon: `${origin}${basePath}icons/icon-192.png`,
                        badge: `${origin}${basePath}icons/favicon.png`,
                        tag: newItem.id,
                        renotify: false,
                        vibrate: [150, 80, 150],
                        data: { url: `${origin}${basePath}?tab=${targetTab}`, id: newItem.id }
                    }).catch(() => {});
                });
            }).catch(() => {});
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

    markNotificationRead(id, showToastMsg = true) {
        if (!id) return;
        const normId = String(id).trim();
        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const canonKey = this.getCanonicalPushKey(id);

        this._memoryReadIds.add(normId);
        this._memoryReadIds.add(cleanId);
        if (canonKey) this._memoryReadIds.add(canonKey);

        this.safeSetItem(`lucky777_read_${normId}`, 'true');
        this.safeSetItem(`lucky777_read_${cleanId}`, 'true');
        if (canonKey) this.safeSetItem(`lucky777_read_${canonKey}`, 'true');
        this.safeSetItem(`lucky777_alert_fired_${normId}`, 'true');
        this.safeSetItem(`lucky777_alert_fired_${cleanId}`, 'true');
        if (canonKey) this.safeSetItem(`lucky777_alert_fired_${canonKey}`, 'true');

        try {
            localStorage.setItem(`lucky777_read_${normId}`, 'true');
            localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
            if (canonKey) localStorage.setItem(`lucky777_read_${canonKey}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            if (canonKey) localStorage.setItem(`lucky777_alert_fired_${canonKey}`, 'true');
        } catch(e) {
            this.freeUpLocalStorageSpace();
            try {
                localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            } catch(e2) {}
        }

        const readUid = this.getActiveUserId();
        const readKeys = [`lucky777_read_notifs_${readUid}`, 'lucky777_read_notifs_global'];
        readKeys.forEach(rk => {
            try {
                const raw = this.safeGetItem(rk) || (typeof localStorage !== 'undefined' ? localStorage.getItem(rk) : null);
                const rArr = raw ? JSON.parse(raw) : [];
                if (Array.isArray(rArr)) {
                    if (!rArr.includes(normId)) rArr.push(normId);
                    if (!rArr.includes(cleanId)) rArr.push(cleanId);
                    if (canonKey && !rArr.includes(canonKey)) rArr.push(canonKey);
                    const serialized = JSON.stringify(rArr.slice(-200));
                    this.safeSetItem(rk, serialized);
                    try { localStorage.setItem(rk, serialized); } catch(e) {}
                }
            } catch(e) {}
        });

        const list = this.getNotifications();
        list.forEach(item => {
            if (!item) return;
            const itemId = String(item.id || '').trim();
            const matchesId = itemId === normId ||
                itemId === cleanId ||
                itemId.replace(/^push-/, '') === normId.replace(/^push-/, '') ||
                itemId.replace('lotto-result-', 'draw-result-') === normId.replace('lotto-result-', 'draw-result-') ||
                (canonKey && this.getCanonicalPushKey(item.id) === canonKey) ||
                (normId.includes('admin-msg-') && itemId.includes(normId.replace(/^push-/, '').replace(/^admin-msg-/, '')));
            if (matchesId || this.isNotificationRead(item.id)) {
                item.unread = false;
            }
        });

        if (normId.includes('admin-msg-')) {
            const rawMsgId = normId.replace(/^push-/, '').replace(/^admin-msg-/, '');
            this.syncAdminMessageReadToFirestore(rawMsgId);
            const uid = this.getActiveUserId();
            if (uid && rawMsgId) {
                this.safeSetItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                try {
                    localStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                    sessionStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                } catch (e) {}
            }
        }

        this.saveNotifications(list);

        // 모달 및 대시보드 미확인 알림 UI 즉시 갱신
        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }

        const nowTs = Date.now();
        if (showToastMsg && typeof window.showToast === 'function') {
            if (this._lastReadToastId !== normId || (nowTs - (this._lastReadToastTs || 0)) > 250) {
                this._lastReadToastId = normId;
                this._lastReadToastTs = nowTs;
                window.showToast('✓ 알림을 확인 처리했습니다.');
            }
        }

        // 스마트폰 OS 알림바(Tray)에서도 해당 알림 팝업 즉시 닫기
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.getNotifications().then(notifs => {
                    notifs.forEach(n => {
                        if (n && n.tag) {
                            const nTag = String(n.tag).trim();
                            if (nTag === normId ||
                                nTag === cleanId ||
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
        const uid = this.getActiveUserId();

        let changedCount = 0;
        list.forEach(item => {
            if (item) {
                if (item.unread) changedCount++;
                if (item.id) {
                    const normId = String(item.id).trim();
                    const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                    const canon = this.getCanonicalPushKey(item.id);
                    this._memoryReadIds.add(normId);
                    this._memoryReadIds.add(cleanId);
                    if (canon) this._memoryReadIds.add(canon);

                    this.safeSetItem(`lucky777_read_${normId}`, 'true');
                    this.safeSetItem(`lucky777_read_${cleanId}`, 'true');
                    if (canon) this.safeSetItem(`lucky777_read_${canon}`, 'true');
                    this.safeSetItem(`lucky777_alert_fired_${normId}`, 'true');
                    this.safeSetItem(`lucky777_alert_fired_${cleanId}`, 'true');
                    if (canon) this.safeSetItem(`lucky777_alert_fired_${canon}`, 'true');

                    try {
                        localStorage.setItem(`lucky777_read_${normId}`, 'true');
                        localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
                        if (canon) localStorage.setItem(`lucky777_read_${canon}`, 'true');
                        localStorage.setItem(`lucky777_alert_fired_${normId}`, 'true');
                        localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
                        if (canon) localStorage.setItem(`lucky777_alert_fired_${canon}`, 'true');
                    } catch(e) {}
                }
                if (item.id && String(item.id).includes('admin-msg-')) {
                    const rawMsgId = String(item.id).replace(/^push-/, '').replace(/^admin-msg-/, '');
                    this.syncAdminMessageReadToFirestore(rawMsgId);
                    if (uid && rawMsgId) {
                        this.safeSetItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                        try {
                            localStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                            sessionStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                        } catch (e) {}
                    }
                }
                item.unread = false;
            }
        });

        const allReadIds = list.map(it => it && it.id).filter(Boolean);
        const readKeys = [`lucky777_read_notifs_${uid}`, 'lucky777_read_notifs_global'];
        readKeys.forEach(rk => {
            try {
                const raw = this.safeGetItem(rk) || (typeof localStorage !== 'undefined' ? localStorage.getItem(rk) : null);
                const rArr = raw ? JSON.parse(raw) : [];
                if (Array.isArray(rArr)) {
                    allReadIds.forEach(id => {
                        const nId = String(id).trim();
                        const cId = nId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
                        if (!rArr.includes(nId)) rArr.push(nId);
                        if (!rArr.includes(cId)) rArr.push(cId);
                    });
                    const serialized = JSON.stringify(rArr.slice(-200));
                    this.safeSetItem(rk, serialized);
                    try { localStorage.setItem(rk, serialized); } catch(e) {}
                }
            } catch(e) {}
        });

        this.saveNotifications(list);
        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }

        // 스마트폰 OS 알림바(Tray)의 모든 알림 즉시 닫기
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.getNotifications().then(notifs => {
                    notifs.forEach(n => { if (n && typeof n.close === 'function') n.close(); });
                }).catch(() => {});
            }).catch(() => {});
        }

        if (typeof window.showToast === 'function') {
            window.showToast(changedCount > 0 ? `✓ ${changedCount}건의 알림을 모두 읽음 처리했습니다.` : '모든 알림이 이미 확인되었습니다.');
        }
    },

    /**
     * 개별 알림 삭제 (사용자 삭제 기록 영구 보존으로 재시드 방지)
     */
    deleteNotification(id) {
        if (!id) return;
        const normId = String(id).trim();
        const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
        const canonKey = this.getCanonicalPushKey(id);
        const uid = this.getActiveUserId();

        this._memoryDeletedIds.add(normId);
        this._memoryDeletedIds.add(cleanId);
        if (canonKey) this._memoryDeletedIds.add(canonKey);
        this._memoryReadIds.add(normId);
        this._memoryReadIds.add(cleanId);
        if (canonKey) this._memoryReadIds.add(canonKey);

        this.safeSetItem(`lucky777_deleted_${normId}`, 'true');
        this.safeSetItem(`lucky777_deleted_${cleanId}`, 'true');
        if (canonKey) this.safeSetItem(`lucky777_deleted_${canonKey}`, 'true');
        this.safeSetItem(`lucky777_read_${cleanId}`, 'true');
        this.safeSetItem(`lucky777_alert_fired_${cleanId}`, 'true');
        if (canonKey) {
            this.safeSetItem(`lucky777_read_${canonKey}`, 'true');
            this.safeSetItem(`lucky777_alert_fired_${canonKey}`, 'true');
        }

        if (normId.startsWith('admin-msg-') || normId.startsWith('admin_')) {
            const rawMsgId = normId.replace(/^push-/, '').replace(/^admin-msg-/, '').replace(/^admin_/, '');
            this.syncAdminMessageReadToFirestore(rawMsgId);
            this._memoryDeletedIds.add(`admin-msg-${rawMsgId}`);
            this._memoryDeletedIds.add(`admin_${rawMsgId}`);
            this._memoryDeletedIds.add(rawMsgId);
            this.safeSetItem(`lucky777_deleted_admin-msg-${rawMsgId}`, 'true');
            this.safeSetItem(`lucky777_deleted_admin_${rawMsgId}`, 'true');
            this.safeSetItem(`lucky777_deleted_${rawMsgId}`, 'true');
            try {
                localStorage.setItem(`lucky777_deleted_admin-msg-${rawMsgId}`, 'true');
                localStorage.setItem(`lucky777_deleted_admin_${rawMsgId}`, 'true');
                localStorage.setItem(`lucky777_deleted_${rawMsgId}`, 'true');
            } catch(e) {}
            if (uid && rawMsgId) {
                this.safeSetItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                this.safeSetItem(`lucky777_admin_notified_${uid}_${rawMsgId}`, 'true');
                try {
                    localStorage.setItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                    localStorage.setItem(`lucky777_admin_notified_${uid}_${rawMsgId}`, 'true');
                } catch(e) {}
            }
        }

        const drawMatch = normId.match(/(?:draw-result|win-celebrate)-(\d+)/);
        if (drawMatch) {
            const rNum = drawMatch[1];
            this._memoryDeletedIds.add(`draw-result-${rNum}`);
            this._memoryDeletedIds.add(`win-celebrate-${rNum}`);
            this._memoryDeletedIds.add(`round_${rNum}_result`);
            this.safeSetItem(`lucky777_deleted_draw-result-${rNum}`, 'true');
            this.safeSetItem(`lucky777_deleted_win-celebrate-${rNum}`, 'true');
            this.safeSetItem(`lucky777_deleted_round_${rNum}_result`, 'true');
            try {
                localStorage.setItem(`lucky777_deleted_draw-result-${rNum}`, 'true');
                localStorage.setItem(`lucky777_deleted_win-celebrate-${rNum}`, 'true');
                localStorage.setItem(`lucky777_deleted_round_${rNum}_result`, 'true');
            } catch(e) {}
        }

        try {
            const delKey = this.getDeletedNotifsKey(uid);
            const delKeys = [delKey, 'lucky777_deleted_notifs_global'];
            delKeys.forEach(dk => {
                try {
                    const raw = this.safeGetItem(dk) || localStorage.getItem(dk);
                    const delArr = raw ? JSON.parse(raw) : [];
                    if (!delArr.includes(normId)) delArr.push(normId);
                    if (!delArr.includes(cleanId)) delArr.push(cleanId);
                    if (canonKey && !delArr.includes(canonKey)) delArr.push(canonKey);
                    const serializedDel = JSON.stringify(delArr.slice(-200));
                    this.safeSetItem(dk, serializedDel);
                    localStorage.setItem(dk, serializedDel);
                } catch(e) {}
            });

            localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
            localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            if (canonKey) {
                localStorage.setItem(`lucky777_read_${canonKey}`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${canonKey}`, 'true');
            }
        } catch (e) {
            this.freeUpLocalStorageSpace();
            try {
                localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            } catch(e2) {}
        }

        const list = this.getNotifications();
        const nextList = list.filter(item => {
            if (!item || !item.id) return false;
            const itemId = String(item.id).trim();
            const itemClean = itemId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
            if (itemId === normId || itemClean === cleanId || itemId === cleanId) return false;
            if (canonKey && this.getCanonicalPushKey(item.id) === canonKey) return false;
            if (this.isNotificationDeleted(item.id)) return false;
            return true;
        });

        if (!this._serverKnownDeletedIds) this._serverKnownDeletedIds = {};
        if (!this._serverKnownDeletedIds[uid]) this._serverKnownDeletedIds[uid] = new Set();
        const serverKnown = this._serverKnownDeletedIds[uid];
        serverKnown.add(normId);
        serverKnown.add(cleanId);
        if (canonKey) serverKnown.add(canonKey);

        const delArr = Array.from(new Set([
            ...Array.from(serverKnown),
            ...Array.from(this._memoryDeletedIds),
            ...this._getStoredIdsArray(this.getDeletedNotifsKey(uid)),
            ...this._getStoredIdsArray('lucky777_deleted_notifs_global')
        ])).slice(-300);

        // 마지막 알림까지 모두 삭제된 경우 자동 재시딩(부활) 방지 플래그 설정
        if (nextList.length === 0) {
            this._memoryClearedUsers.add(uid);
            this._memoryClearedUsers.add('global');
            this.safeSetItem(`lucky777_inbox_cleared_${uid}`, 'true');
            this.safeSetItem('lucky777_inbox_cleared_global', 'true');
            try {
                localStorage.setItem(`lucky777_inbox_cleared_${uid}`, 'true');
                localStorage.setItem('lucky777_inbox_cleared_global', 'true');
            } catch (e) {}
            this.saveNotificationsToServer(uid, { inbox: [], isCleared: true, clearedAt: new Date().toISOString() });
        } else {
            this.saveNotificationsToServer(uid, { inbox: nextList, isCleared: false });
        }

        this.saveNotifications(nextList, false);
        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }

        const nowTs = Date.now();
        if (typeof window.showToast === 'function') {
            if (this._lastDeleteToastId !== normId || (nowTs - (this._lastDeleteToastTs || 0)) > 250) {
                this._lastDeleteToastId = normId;
                this._lastDeleteToastTs = nowTs;
                window.showToast('🗑️ 알림이 삭제되었습니다.');
            }
        }
    },

    /**
     * 전체 알림 일괄 삭제 (confirm 차단 없이 즉시 삭제 및 자동 재시드 완전 차단)
     */
    clearAllNotifications() {
        const nowTs = Date.now();
        if (nowTs - (this._lastClearAllTs || 0) < 400) return;
        this._lastClearAllTs = nowTs;

        const list = this.getNotifications();
        const uid = this.getActiveUserId();
        if (!list || list.length === 0) {
            this._memoryClearedUsers.add(uid);
            this._memoryClearedUsers.add('global');
            this.safeSetItem(`lucky777_inbox_cleared_${uid}`, 'true');
            this.safeSetItem('lucky777_inbox_cleared_global', 'true');
            try {
                localStorage.setItem(`lucky777_inbox_cleared_${uid}`, 'true');
                localStorage.setItem('lucky777_inbox_cleared_global', 'true');
            } catch (e) {}
            if (typeof window.showToast === 'function') {
                window.showToast('삭제할 알림 내역이 없습니다.');
            }
            return;
        }

        const delKey = this.getDeletedNotifsKey();
        let delArr = [];
        try {
            const raw = this.safeGetItem(delKey) || localStorage.getItem(delKey);
            delArr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(delArr)) delArr = [];
        } catch (e) {
            delArr = [];
        }

        const markIdDeleted = (rawId) => {
            if (!rawId) return;
            const normId = String(rawId).trim();
            const cleanId = normId.replace(/^push-/, '').replace('lotto-result-', 'draw-result-');
            const canon = this.getCanonicalPushKey(rawId);
            this._memoryDeletedIds.add(normId);
            this._memoryDeletedIds.add(cleanId);
            if (canon) this._memoryDeletedIds.add(canon);
            this._memoryReadIds.add(normId);
            this._memoryReadIds.add(cleanId);
            if (canon) this._memoryReadIds.add(canon);

            if (!delArr.includes(normId)) delArr.push(normId);
            if (!delArr.includes(cleanId)) delArr.push(cleanId);
            if (canon && !delArr.includes(canon)) delArr.push(canon);

            this.safeSetItem(`lucky777_deleted_${cleanId}`, 'true');
            this.safeSetItem(`lucky777_read_${cleanId}`, 'true');
            this.safeSetItem(`lucky777_alert_fired_${cleanId}`, 'true');
            try {
                localStorage.setItem(`lucky777_read_${cleanId}`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${cleanId}`, 'true');
            } catch (e) {}
        };

        list.forEach(item => {
            if (item && item.id) {
                markIdDeleted(item.id);
                if (String(item.id).includes('admin-msg-')) {
                    const rawMsgId = String(item.id).replace(/^push-/, '').replace(/^admin-msg-/, '');
                    this.syncAdminMessageReadToFirestore(rawMsgId);
                    if (uid && rawMsgId) {
                        this.safeSetItem(`admin_popup_dismissed_${uid}_${rawMsgId}`, 'true');
                    }
                }
            }
        });

        // 기본 시딩 대상 ID들도 함께 삭제 처리하여 포커스 복귀 시 재시딩 원천 차단
        const targetRound = this.getUpcomingRoundNumber();
        markIdDeleted(`rec-ready-${targetRound}`);
        markIdDeleted(`lock-reminder-${targetRound}`);
        markIdDeleted('admin-msg-welcome');
        for (let r = targetRound; r >= 1235; r--) {
            markIdDeleted(`draw-result-${r}`);
        }

        const serializedDel = JSON.stringify(delArr.slice(-200));
        this.safeSetItem(delKey, serializedDel);
        this.safeSetItem('lucky777_deleted_notifs_global', serializedDel);
        this._memoryClearedUsers.add(uid);
        this._memoryClearedUsers.add('global');
        this.safeSetItem(`lucky777_inbox_cleared_${uid}`, 'true');
        this.safeSetItem('lucky777_inbox_cleared_global', 'true');

        try {
            localStorage.setItem(delKey, serializedDel);
            localStorage.setItem('lucky777_deleted_notifs_global', serializedDel);
            localStorage.setItem(`lucky777_inbox_cleared_${uid}`, 'true');
            localStorage.setItem('lucky777_inbox_cleared_global', 'true');
        } catch (e) {
            this.freeUpLocalStorageSpace();
            try {
                localStorage.setItem(delKey, serializedDel);
                localStorage.setItem(`lucky777_inbox_cleared_${uid}`, 'true');
            } catch(e2) {}
        }

        if (!this._serverKnownDeletedIds) this._serverKnownDeletedIds = {};
        if (!this._serverKnownDeletedIds[uid]) this._serverKnownDeletedIds[uid] = new Set();
        delArr.forEach(id => this._serverKnownDeletedIds[uid].add(id));

        const finalDelArr = Array.from(new Set([
            ...Array.from(this._serverKnownDeletedIds[uid]),
            ...delArr
        ])).slice(-300);

        this.saveNotifications([], false);
        this.saveNotificationsToServer(uid, {
            inbox: [],
            isCleared: true,
            clearedAt: new Date().toISOString(),
            deletedIds: finalDelArr,
            forceSync: true
        });
        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }

        if (typeof window.showToast === 'function') {
            window.showToast('🗑️ 모든 알림이 삭제되었습니다.');
        }
    },

    /**
     * 알림 재동기화 (삭제 목록 초기화 및 최근 회차 알림 재생성)
     */
    resetAndSeedNotifications() {
        const uid = this.getActiveUserId();
        this._memoryDeletedIds.clear();
        this._memoryClearedUsers.delete(uid);
        this._memoryClearedUsers.delete('global');
        if (this._serverKnownDeletedIds) {
            this._serverKnownDeletedIds[uid] = new Set();
        }

        this.safeRemoveItem(`lucky777_deleted_notifs_${uid}`);
        this.safeRemoveItem('lucky777_deleted_notifs_global');
        this.safeRemoveItem(`lucky777_inbox_cleared_${uid}`);
        this.safeRemoveItem('lucky777_inbox_cleared_global');
        try {
            localStorage.removeItem(`lucky777_deleted_notifs_${uid}`);
            localStorage.removeItem('lucky777_deleted_notifs_global');
            localStorage.removeItem(`lucky777_inbox_cleared_${uid}`);
            localStorage.removeItem('lucky777_inbox_cleared_global');
            for (const store of [localStorage, sessionStorage]) {
                if (!store) continue;
                const keysToRemove = [];
                for (let i = 0; i < store.length; i++) {
                    const k = store.key(i);
                    if (k && k.startsWith('lucky777_deleted_')) keysToRemove.push(k);
                }
                keysToRemove.forEach(k => { try { store.removeItem(k); } catch (e) {} });
            }
        } catch (e) {}

        const seeded = this.seedRecentNotifications(uid, []);
        this.saveNotifications(seeded, false);
        this.saveNotificationsToServer(uid, { inbox: seeded, isCleared: false, deletedIds: [], isExplicitReset: true, forceSync: true });
        this.renderUnreadNotificationUI();
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal && modal.style.display !== 'none') {
            this.renderNotificationCenterModalContent();
        }

        if (typeof window.showToast === 'function') {
            window.showToast('🔄 최신 알림 내역이 동기화되었습니다.');
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
                                    if (!it || !it.id) return;
                                    if (it.category === 'myeongri' || (it.id && String(it.id).startsWith('myeongri-'))) return;
                                    if (this.isNotificationDeleted(it.id)) return;
                                    const isRead = this.isNotificationRead(it.id);
                                    this.addNotification({
                                        id: it.id,
                                        category: it.category || 'result',
                                        badge: it.badge || '🔔 운도실력 알림',
                                        title: it.title,
                                        body: it.body,
                                        createdAt: it.createdAt,
                                        unread: !isRead,
                                        actionType: it.actionType || 'confirmed',
                                        actionLabel: it.actionLabel || '📊 바로 확인하기'
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

            // 3. Check in-memory state.globalLedger (현재 활성 로그인 사용자와 일치할 때만)
            const currentActiveUid = (this.getCurrentUserId() || '').trim().toLowerCase();
            let ledger = null;
            if (currentActiveUid === uid && window.state && window.state.globalLedger) {
                ledger = window.state.globalLedger;
            }

            // 4. Check state.allUsersPurchasesMap
            if ((!ledger || Object.keys(ledger).length === 0) && window.state && window.state.allUsersPurchasesMap && uid) {
                if (window.state.allUsersPurchasesMap[uid] && window.state.allUsersPurchasesMap[uid].ledger) {
                    ledger = window.state.allUsersPurchasesMap[uid].ledger;
                }
            }

            // 5. Check localStorage by multiple individual keys (해당 사용자 고유 키만 검사)
            if (!ledger || Object.keys(ledger).length === 0) {
                const keys = [`lotto_actual_ledger_${uid}`, `lotto_actual_ledger_${uid.toLowerCase()}`];
                if (uid === 'guest') keys.push('lotto_actual_ledger_guest');
                if (uid === 'master' || uid === 'admin') {
                    keys.push('lotto_actual_ledger_master', 'lotto_actual_ledger_admin');
                }
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

            // 6. Check cached allUsersPurchasesMap and allUsersMergedLedger in localStorage
            if (!ledger || Object.keys(ledger).length === 0) {
                try {
                    const rawMap = localStorage.getItem('lotto_all_users_purchases_map_cache');
                    if (rawMap) {
                        const parsedMap = JSON.parse(rawMap);
                        if (parsedMap && typeof parsedMap === 'object') {
                            const uData = parsedMap[uid] || parsedMap[uid.toLowerCase()];
                            if (uData && uData.ledger) {
                                const rList = uData.ledger[String(rNum)] || uData.ledger[rNum];
                                if (Array.isArray(rList) && rList.some(r => r && Array.isArray(r.combos) && r.combos.length > 0)) {
                                    return true;
                                }
                            }
                        }
                    }
                } catch(e) {}

                try {
                    const rawMerged = localStorage.getItem('lotto_all_users_merged_ledger_cache');
                    if (rawMerged) {
                        const parsedMerged = JSON.parse(rawMerged);
                        if (parsedMerged && typeof parsedMerged === 'object') {
                            const rList = parsedMerged[String(rNum)] || parsedMerged[rNum];
                            if (Array.isArray(rList) && rList.some(r => r && (String(r.user || r.userId || '').toLowerCase() === uid) && Array.isArray(r.combos) && r.combos.length > 0)) {
                                return true;
                            }
                        }
                    }
                } catch(e) {}
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
                const p = window.getUserPurchasesForRound(uid, rNum);
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

        // 3. Try window.state.globalLedger (현재 활성 로그인 사용자와 일치할 때만)
        const currentActiveUid = (this.getCurrentUserId() || '').trim().toLowerCase();
        if (currentActiveUid === uid && window.state && window.state.globalLedger) {
            const rList = window.state.globalLedger[String(rNum)] || window.state.globalLedger[rNum];
            if (Array.isArray(rList) && rList.length > 0) {
                const myReceipts = rList.filter(p => {
                    if (!p) return false;
                    const pUser = (p.user || p.userId || '').trim().toLowerCase();
                    return !pUser || pUser === uid;
                });
                if (myReceipts.length > 0) return myReceipts;
            }
        }

        // 4. Try localStorage individual keys (해당 사용자 고유 키만 검사)
        const keys = [
            `lotto_actual_ledger_${uid}`,
            `lotto_actual_ledger_${uid.toLowerCase()}`
        ];
        if (uid === 'guest') keys.push('lotto_actual_ledger_guest');
        if (uid === 'master' || uid === 'admin') {
            keys.push('lotto_actual_ledger_master', 'lotto_actual_ledger_admin');
        }
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

        // 5. Try cached maps in localStorage: lotto_all_users_purchases_map_cache, lotto_all_users_merged_ledger_cache
        try {
            const rawMap = localStorage.getItem('lotto_all_users_purchases_map_cache');
            if (rawMap) {
                const parsedMap = JSON.parse(rawMap);
                if (parsedMap && typeof parsedMap === 'object') {
                    const uData = parsedMap[uid] || parsedMap[uid.toLowerCase()];
                    if (uData && uData.ledger) {
                        const rList = uData.ledger[String(rNum)] || uData.ledger[rNum];
                        if (Array.isArray(rList) && rList.length > 0) return rList;
                    }
                }
            }
        } catch(e) {}

        try {
            const rawMerged = localStorage.getItem('lotto_all_users_merged_ledger_cache');
            if (rawMerged) {
                const parsedMerged = JSON.parse(rawMerged);
                if (parsedMerged && typeof parsedMerged === 'object') {
                    const rList = parsedMerged[String(rNum)] || parsedMerged[rNum];
                    if (Array.isArray(rList) && rList.length > 0) {
                        const userReceipts = rList.filter(r => r && String(r.user || r.userId || '').toLowerCase() === uid);
                        if (userReceipts.length > 0) return userReceipts;
                    }
                }
            }
        } catch(e) {}

        return [];
    },

    /**
     * 특정 회차의 공식 당첨번호 데이터 조회 (LOTTO_HISTORY / STATIC_DRAWS / state.lottoData)
     */
    getDrawData(round) {
        const rStr = String(round);
        try {
            if (typeof window !== 'undefined' && typeof window.getSafeActualDraw === 'function') {
                const d = window.getSafeActualDraw(round);
                if (d && Array.isArray(d.numbers) && d.numbers.length === 6) return d;
            }
            if (typeof LOTTO_HISTORY !== 'undefined' && LOTTO_HISTORY[rStr]) {
                return LOTTO_HISTORY[rStr];
            }
            if (typeof window !== 'undefined' && window.LOTTO_HISTORY && window.LOTTO_HISTORY[rStr]) {
                return window.LOTTO_HISTORY[rStr];
            }
        } catch(e) {}
        const STATIC_DRAWS = {
            '1246': { numbers: [16, 22, 23, 24, 27, 28], bonus: 6, rank1Winners: 16, rank1Prize: 1881025430, rank2Prize: 78376060, rank3Prize: 1497334, rank4Prize: 50000, rank5Prize: 5000, date: '2026-10-17' },
            '1245': { numbers: [4, 5, 25, 28, 32, 42], bonus: 12, rank1Winners: 10, rank1Prize: 3006515775, rank2Winners: 91, rank2Prize: 55064392, rank3Winners: 3105, rank3Prize: 1615365, rank4Winners: 154625, rank4Prize: 50000, rank5Winners: 2603893, rank5Prize: 5000, date: '2026-10-10' },
            '1244': { numbers: [1, 13, 18, 26, 34, 38], bonus: 25, rank1Winners: 18, rank1Prize: 1604686625, rank2Winners: 80, rank2Prize: 60175749, rank3Winners: 3734, rank3Prize: 1290287, rank4Winners: 173542, rank4Prize: 50000, rank5Winners: 2800000, rank5Prize: 5000, date: '2026-10-03' },
            '1243': { numbers: [9, 18, 24, 38, 43, 44], bonus: 35, rank1Winners: 12, rank1Prize: 2592525282, rank2Winners: 115, rank2Prize: 45087397, rank3Winners: 3591, rank3Prize: 1443902, rank4Winners: 174306, rank4Prize: 50000, rank5Winners: 2853501, rank5Prize: 5000, date: '2026-09-26' },
            '1242': { numbers: [2, 4, 10, 16, 31, 41], bonus: 9, rank1Winners: 9, rank1Prize: 3281029250, rank2Winners: 104, rank2Prize: 47322538, rank3Winners: 3206, rank3Prize: 1535105, rank4Winners: 165377, rank4Prize: 50000, rank5Winners: 2729145, rank5Prize: 5000, date: '2026-09-19' },
            '1241': { numbers: [7, 13, 16, 23, 24, 43], bonus: 9, rank1Winners: 18, rank1Prize: 1628391980, rank2Winners: 90, rank2Prize: 54279733, rank3Winners: 3254, rank3Prize: 1501284, rank4Winners: 165086, rank4Prize: 50000, rank5Winners: 2724667, rank5Prize: 5000, date: '2026-09-12' },
            '1240': { numbers: [11, 13, 19, 20, 31, 44], bonus: 27, rank1Winners: 16, rank1Prize: 1791817758, rank2Winners: 78, rank2Prize: 61258727, rank3Winners: 3087, rank3Prize: 1547840, rank4Winners: 155202, rank4Prize: 50000, rank5Winners: 2619423, rank5Prize: 5000, date: '2026-09-05' },
            '1239': { numbers: [1, 3, 17, 26, 33, 42], bonus: 41, rank1Winners: 13, rank1Prize: 2214789375, rank2Winners: 71, rank2Prize: 67587470, rank3Winners: 3081, rank3Prize: 1557518, rank4Winners: 152825, rank4Prize: 50000, rank5Winners: 2570542, rank5Prize: 5000, date: '2026-08-29' },
            '1238': { numbers: [2, 13, 18, 32, 38, 42], bonus: 22, rank1Winners: 23, rank1Prize: 1197258718, rank2Winners: 84, rank2Prize: 54636807, rank3Winners: 3235, rank3Prize: 1418700, rank4Winners: 156141, rank4Prize: 50000, rank5Winners: 2549183, rank5Prize: 5000, date: '2026-08-22' },
            '1237': { numbers: [2, 9, 16, 27, 34, 45], bonus: 21, rank1Winners: 13, rank1Prize: 2180450000, rank2Prize: 52000000, rank3Prize: 1450000, rank4Prize: 50000, rank5Prize: 5000, date: '2026-08-15' },
            '1236': { numbers: [3, 11, 18, 25, 33, 42], bonus: 8, rank1Winners: 11, rank1Prize: 2450320000, rank2Prize: 52000000, rank3Prize: 1450000, rank4Prize: 50000, rank5Prize: 5000, date: '2026-08-08' },
            '1235': { numbers: [6, 14, 22, 29, 36, 41], bonus: 17, rank1Winners: 14, rank1Prize: 1985670000, rank2Prize: 52000000, rank3Prize: 1450000, rank4Prize: 50000, rank5Prize: 5000, date: '2026-08-01' }
        };
        if (STATIC_DRAWS[rStr]) return STATIC_DRAWS[rStr];
        try {
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
            // 실구매 등록 완료 후 즉시 당첨 채점 및 미확인 알림 상태 최신화
            this.checkAndGenerateScheduledAlerts(true);
            this.renderUnreadNotificationUI();
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
            const lockId = `lock-reminder-${rNum}`;

            // 구매 완료 회차의 마감 리마인더 푸시 영구 봉인 각인
            this.recordPushFired(lockId);
            try {
                localStorage.setItem(`lucky777_fired_round_${rNum}_lock`, 'true');
                localStorage.setItem(`lucky777_alert_fired_${lockId}`, 'true');
            } catch(e) {}

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

    _isCheckingScheduledAlerts: false,
    _lastScheduledCheckTs: 0,
    _lastCheckedUid: null,

    /**
     * 🔮 스마트 하이브리드 스케줄러:
     * 앱 접속 또는 포그라운드 복귀 시 [토요일 마감 임박], [추첨 결과 발표], [차기 추천번호]를 자동 점검하여
     * 놓친 알림을 미확인 알림함에 자동 생성하고 최신 당첨 결과에 한해 브라우저 알림을 발송합니다.
     */
    checkAndGenerateScheduledAlerts(isInitialSubscribe = false) {
        if (this._isCheckingScheduledAlerts) return;
        const nowTs = Date.now();
        let uid = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : 'guest';
        if (typeof uid === 'string' && uid.startsWith('{')) {
            try { uid = JSON.parse(uid).userid || uid; } catch (e) {}
        }
        uid = String(uid || 'guest').trim().toLowerCase();

        // 사용자 전환(guest -> 로그인 회원) 감지 시 쿨다운 즉시 해제
        if (this._lastCheckedUid && this._lastCheckedUid !== uid) {
            isInitialSubscribe = true;
        }
        this._lastCheckedUid = uid;

        // 초기 구독/강제 갱신이 아닌 경우 새로고침/재로그인 2.5초 내 다중 중복 평가 방지
        if (!isInitialSubscribe && (nowTs - (this._lastScheduledCheckTs || 0)) < 2500) {
            return;
        }
        this._lastScheduledCheckTs = nowTs;
        this._isCheckingScheduledAlerts = true;

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

            // 토요일 20:00 이후는 이번 주 복권 판매 종료 및 추첨/정산 시간대
            const isSaturdayPostDraw = (todayName === '토요일' && curMinutes >= 20 * 60);

            // 이번 회차 구매가 완료되었거나 토요일 20:00 마감 이후인 경우: 기존 미구매 유도 알림 자동 정리 및 신규 리마인더 발송 차단
            if (alreadyPurchased || isSaturdayPostDraw) {
                this.dismissPurchaseRemindersForRound(targetRound);
                if (isSaturdayPostDraw) {
                    this.dismissPurchaseRemindersForRound(targetRound - 1);
                }
            }

            const inboxCleared = this.isInboxCleared(uid);

            // 1. 토요일 판매 마감 임박 리마인더 (토요일 18:00 ~ 20:00 사이, 미구매 회원 - 스마트폰 푸시 제외, 알림함에서만 확인)
            if (!inboxCleared && todayName === '토요일' && curMinutes >= 18 * 60 && curMinutes < 20 * 60 && !alreadyPurchased) {
                const lockNotifId = `lock-reminder-${targetRound}`;
                if (!this.isNotificationDeleted(lockNotifId) && !this.isNotificationDeleted(`round_${targetRound}_lock`)) {
                    const isLockRead = this.isNotificationRead(lockNotifId);
                    this.addNotification({
                        id: lockNotifId,
                        category: 'reminder',
                        badge: '⏰ 마감 임박 리마인더',
                        title: `제 ${targetRound}회차 로또 판매 마감(20:00) 임박 안내`,
                        body: `오늘 20:00에 제 ${targetRound}회차 복권 판매 및 실구매 인증이 마감됩니다. 실물 복권을 구매하셨다면 지금 QR 스캔으로 간편 등록하세요.`,
                        timeLabel: '오늘 토요일 마감 안내',
                        unread: !isLockRead,
                        actionType: 'qr',
                        actionLabel: '📷 실구매 QR 영수증 등록하기'
                    }, false); // 스마트폰 푸시 제외 (알림함에서만 확인)
                }
            }

            // 2. 최신 회차 추첨 결과 & 구매확정 당첨내역 통합 알림 (스마트폰 푸시 허용 유일 대상)
            let latestDrawnRound = targetRound - 1;
            if (typeof window.getLatestDrawnRound === 'function') {
                try {
                    const ldr = window.getLatestDrawnRound();
                    if (ldr && ldr > 1000) latestDrawnRound = ldr;
                } catch(e) {}
            }
            if (this.getDrawData(1246) && latestDrawnRound < 1246) {
                latestDrawnRound = 1246;
            }

            // 최근 5개 회차별 공식 결과 및 추천번호 알림함 내역 전체 보장 동기화 (전체 삭제 상태가 아닌 경우에만)
            let currentList = this.getNotifications();
            if (!inboxCleared) {
                currentList = this.seedRecentNotifications(uid, currentList);
            }

            if (!inboxCleared && latestDrawnRound >= 1235) {
                const drawData = this.getDrawData(latestDrawnRound);
                if (drawData && Array.isArray(drawData.numbers) && drawData.numbers.length === 6) {
                    const combinedNotifId = `draw-result-${latestDrawnRound}`;
                    const legacyWinId = `win-celebrate-${latestDrawnRound}`;
                    const canonKey = `round_${latestDrawnRound}_result`;

                    // 사용자가 해당 알림을 이미 삭제한 경우 재발송 및 재생성 원천 차단
                    if (!this.isNotificationDeleted(combinedNotifId) && !this.isNotificationDeleted(legacyWinId) && !this.isNotificationDeleted(canonKey)) {
                        const userPurchases = this.getUserPurchases(uid, latestDrawnRound);
                        const grade = this.gradePurchases(userPurchases, drawData);

                        // 이전 분리 발송 시절 남아있던 win-celebrate 알림이 있다면 통합 알림으로 스마트 교체
                        const inboxList = this.getNotifications();
                        const legacyWinIdx = inboxList.findIndex(it => it && (it.id === legacyWinId || it.id === `push-${legacyWinId}`));
                        if (legacyWinIdx !== -1) {
                            inboxList.splice(legacyWinIdx, 1);
                            this.saveNotifications(inboxList);
                        }

                        const numbersStr = drawData.numbers.join(', ');
                        const bonusStr = String(drawData.bonus);
                        const drawNumsHeader = `[${numbersStr}] + 보너스 [${bonusStr}]`;

                        let notifBadge = '';
                        let notifTitle = '';
                        let notifBody = '';

                        if (grade && grade.totalGames > 0 && grade.totalWins > 0) {
                            // 3-A) 실구매 복권 당첨: 당첨번호 + 구매확정 당첨내역 통합
                            const hitsArray = [];
                            if (grade.hits[1]) hitsArray.push(`1등 ${grade.hits[1]}건`);
                            if (grade.hits[2]) hitsArray.push(`2등 ${grade.hits[2]}건`);
                            if (grade.hits[3]) hitsArray.push(`3등 ${grade.hits[3]}건`);
                            if (grade.hits[4]) hitsArray.push(`4등 ${grade.hits[4]}건`);
                            if (grade.hits[5]) hitsArray.push(`5등 ${grade.hits[5]}건`);
                            const hitsDesc = hitsArray.join(', ');

                            notifBadge = '🎉 당첨결과 & 구매확정 당첨';
                            notifTitle = `🎉 [제 ${latestDrawnRound}회 당첨결과] 1등 ${drawNumsHeader} (구매확정 ${grade.totalWins}건 당첨!)`;
                            notifBody = `제 ${latestDrawnRound}회 당첨번호: ${drawNumsHeader}\n🎊 ${dispName}의 구매확정 ${grade.totalGames}게임 채점 결과, ${hitsDesc} 총 ${grade.totalWins}건 당첨(총 당첨금 ${grade.totalPrize.toLocaleString()}원)을 축하드립니다! 확정 장부에서 상세 결과를 확인하세요.`;
                        } else if (grade && grade.totalGames > 0 && grade.totalWins === 0) {
                            // 3-B) 실구매 복권 미당첨(낙첨): 당첨번호 + 구매확정 채점결과 통합
                            notifBadge = '📊 당첨결과 & 구매확정 채점';
                            notifTitle = `📊 [제 ${latestDrawnRound}회 당첨결과] 1등 ${drawNumsHeader} (구매확정 채점완료)`;
                            notifBody = `제 ${latestDrawnRound}회 당첨번호: ${drawNumsHeader}\n📊 ${dispName}의 구매확정 ${grade.totalGames}게임 채점 결과: 이번 회차는 아쉽게도 낙첨되었습니다. 차기 제 ${targetRound}회차 맞춤 조합을 확인해 보세요.`;
                        } else {
                            // 3-C) 미구매 회원: 최신회차 당첨번호 안내
                            const firstPrizeText = drawData.rank1Prize ? ` (1등 ${(drawData.rank1Prize / 100000000).toFixed(1)}억 원)` : '';
                            notifBadge = '🏆 최신회차 추첨결과 발표';
                            notifTitle = `🏆 [제 ${latestDrawnRound}회 공식 결과] 1등 ${drawNumsHeader}${firstPrizeText}`;
                            notifBody = `제 ${latestDrawnRound}회 당첨번호: ${drawNumsHeader}\n확인된 구매등록 내역이 없습니다. AI 추천번호 복기 결과 및 차기 제 ${targetRound}회차 맞춤 번호를 확인해 보세요.`;
                        }

                        // 최신회차 당첨번호 + 구매확정 당첨내역 통합 알림만 스마트폰 푸시 1회 발송
                        const shouldPushCombined = !this.isPushAlreadyFired(combinedNotifId) && !this.isPushAlreadyFired(legacyWinId);
                        const isDrawRead = this.isNotificationRead(combinedNotifId) || this.isNotificationRead(legacyWinId);

                        this.addNotification({
                            id: combinedNotifId,
                            category: 'result',
                            badge: notifBadge,
                            title: notifTitle,
                            body: notifBody,
                            timeLabel: `제 ${latestDrawnRound}회 당첨·채점 발표`,
                            unread: !isDrawRead,
                            actionType: 'confirmed',
                            actionLabel: '📊 구매확정 당첨내역 확인하기'
                        }, shouldPushCombined);
                    }
                }
            }

            // 4. 차기 회차 AI 퀀트 맞춤 추천번호 오픈 알림 (신규 회차 1회 알림함 등록, 스마트폰 푸시는 제외)
            if (!inboxCleared && targetRound >= 1246) {
                // 토요일 20:00 이후 또는 일~금요일 등 신규 회차가 활성화된 시점에 안내
                const isRecOpenTime = isSaturdayPostDraw || todayName !== '토요일' || curMinutes < 18 * 60;
                if (isRecOpenTime) {
                    const recNotifId = `rec-ready-${targetRound}`;
                    if (!this.isNotificationDeleted(recNotifId) && !this.isNotificationDeleted(`round_${targetRound}_rec`)) {
                        const isRecRead = this.isNotificationRead(recNotifId);
                        this.addNotification({
                            id: recNotifId,
                            category: 'generator',
                            badge: '🎱 차기 추천번호 오픈',
                            title: `🎱 [AI 퀀트 맞춤] 제 ${targetRound}회차 AI 추천번호 및 10대 알고리즘 조합 오픈!`,
                            body: `${dispName}을 위한 제 ${targetRound}회차 AI 퀀트 알고리즘(올라운더 1·2·3 최신 엔진) 맞춤 추천번호 조합이 생성되었습니다. 지금 이번 주 최적 팩을 확인해 보세요.`,
                            timeLabel: `제 ${targetRound}회 추천 오픈`,
                            unread: !isRecRead,
                            actionType: 'generator',
                            actionLabel: '🎱 이번주 추천번호 확인하기'
                        }, false); // 스마트폰 푸시 제외 (알림함에서만 확인)
                    }
                }
            }

            this.renderUnreadNotificationUI();
        } catch (err) {
            console.warn('[PushClient] checkAndGenerateScheduledAlerts error:', err);
        } finally {
            this._isCheckingScheduledAlerts = false;
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
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">모든 알림을 확인하셨습니다.</span>
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
                            <span style="font-size:0.68rem; padding:1px 6px; border-radius:6px; background:rgba(245,158,11,0.2); color:#fde68a; font-weight:800;">${latest.badge || '알림'}</span>
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
        this.checkAndGenerateScheduledAlerts(true);
        this._currentModalFilter = filter || this._currentModalFilter || 'all';
        let modal = document.getElementById('lucky777NotificationCenterModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'lucky777NotificationCenterModal';
            modal.style.cssText = 'position:fixed; inset:0; background:rgba(7,10,20,0.85); backdrop-filter:blur(8px); z-index:100000; display:none; align-items:center; justify-content:center; padding:14px; box-sizing:border-box;';
            document.body.appendChild(modal);
        }
        // 이벤트 위임(Event Delegation) 바인딩: 인라인 onclick 실패 환경(모바일 인앱/WebView 등)에서도 100% 작동 보장
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeNotificationCenterModal();
                return;
            }
            if (!e.target || typeof e.target.closest !== 'function') return;
            const actionEl = e.target.closest('[data-notif-action]');
            if (!actionEl) return;
            const action = actionEl.getAttribute('data-notif-action');
            const notifId = actionEl.getAttribute('data-notif-id') || '';
            if (action === 'delete' && notifId) {
                e.stopPropagation();
                this.deleteNotification(notifId);
            } else if (action === 'read' && notifId) {
                e.stopPropagation();
                this.markNotificationRead(notifId);
            } else if (action === 'action' && notifId) {
                e.stopPropagation();
                this.handleNotificationAction(notifId);
            } else if (action === 'filter') {
                e.stopPropagation();
                const targetFilter = actionEl.getAttribute('data-notif-filter') || 'all';
                this.setNotificationModalFilter(targetFilter);
            } else if (action === 'mark-all-read') {
                e.stopPropagation();
                this.markAllNotificationsRead();
            } else if (action === 'clear-all') {
                e.stopPropagation();
                this.clearAllNotifications();
            } else if (action === 'reset-seed') {
                e.stopPropagation();
                this.resetAndSeedNotifications();
            } else if (action === 'close') {
                e.stopPropagation();
                this.closeNotificationCenterModal();
            }
        };
        this.renderNotificationCenterModalContent();
        modal.style.display = 'flex';
    },

    setNotificationModalFilter(filter = 'all') {
        this._currentModalFilter = filter || 'all';
        this.renderNotificationCenterModalContent();
    },

    closeNotificationCenterModal() {
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (modal) modal.style.display = 'none';
    },

    renderNotificationCenterModalContent() {
        const modal = document.getElementById('lucky777NotificationCenterModal');
        if (!modal) return;

        const list = this.getNotifications();
        const unreadCount = list.filter(n => n && (n.unread === true || n.unread === 'true') && !this.isNotificationRead(n.id)).length;
        const resultCount = list.filter(n => n && (n.category === 'result' || String(n.id || '').startsWith('draw-result-') || String(n.id || '').startsWith('win-celebrate-'))).length;
        const adminCount = list.filter(n => n && (n.category === 'admin' || String(n.id || '').startsWith('admin-msg-'))).length;
        const filter = this._currentModalFilter || 'all';
        const filtered = filter === 'unread'
            ? list.filter(n => n && (n.unread === true || n.unread === 'true') && !this.isNotificationRead(n.id))
            : (filter === 'result'
                ? list.filter(n => n && (n.category === 'result' || String(n.id || '').startsWith('draw-result-') || String(n.id || '').startsWith('win-celebrate-')))
                : (filter === 'admin'
                    ? list.filter(n => n && (n.category === 'admin' || String(n.id || '').startsWith('admin-msg-')))
                    : list));

        const emptyMsg = filter === 'unread'
            ? `<div style="font-weight:800; color:#e2e8f0; margin-bottom:4px;">확인하지 않은 새로운 알림이 없습니다.</div>
               <div style="font-size:0.75rem; color:#64748b; margin-bottom:12px;">지난 회차별 당첨결과 및 공지 내역은 [전체] 탭에서 확인하실 수 있습니다.</div>
               <button type="button" data-notif-action="filter" data-notif-filter="all" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('all')" style="background:#f59e0b; color:#0f172a; border:none; padding:6px 14px; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">전체 알림내역 보기 (${list.length})</button>`
            : (filter === 'result'
                ? `<div style="font-weight:800; color:#e2e8f0; margin-bottom:4px;">표시할 당첨 결과가 없습니다.</div>
                   <button type="button" data-notif-action="filter" data-notif-filter="all" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('all')" style="background:#f59e0b; color:#0f172a; border:none; padding:6px 14px; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">전체 알림 보기 (${list.length})</button>`
                : (filter === 'admin'
                    ? `<div style="font-weight:800; color:#e2e8f0; margin-bottom:4px;">도착한 관리자 메시지가 없습니다.</div>
                       <button type="button" data-notif-action="filter" data-notif-filter="all" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('all')" style="background:#f59e0b; color:#0f172a; border:none; padding:6px 14px; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">전체 알림 보기 (${list.length})</button>`
                    : `<div style="font-weight:800; color:#e2e8f0; margin-bottom:4px;">알림함에 보관된 알림이 없습니다.</div>
                       <div style="font-size:0.75rem; color:#64748b; margin-bottom:12px;">최근 5개 회차 당첨결과 및 추천 알림을 다시 불러오시겠습니까?</div>
                       <button type="button" data-notif-action="reset-seed" onclick="window.PushClient && window.PushClient.resetAndSeedNotifications()" style="background:#f59e0b; color:#0f172a; border:none; padding:6px 14px; border-radius:8px; font-weight:800; font-size:0.75rem; cursor:pointer;">🔄 알림 내역 다시 동기화</button>`));

        const itemsHtml = filtered.length === 0
            ? `<div style="padding:36px 16px; text-align:center; color:#94a3b8; font-size:0.82rem;">
                <div style="font-size:1.8rem; margin-bottom:8px;">✨</div>
                ${emptyMsg}
               </div>`
            : filtered.map(item => {
                const isUnread = (item.unread === true || item.unread === 'true') && !this.isNotificationRead(item.id);
                const safeId = String(item.id || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const attrId = String(item.id || '').replace(/"/g, '&quot;');
                return `
                <div data-notif-action="read" data-notif-id="${attrId}" onclick="window.markNotificationRead ? window.markNotificationRead('${safeId}') : (window.PushClient && window.PushClient.markNotificationRead('${safeId}'))" style="background:${isUnread ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.55)'}; border:1.5px solid ${isUnread ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.07)'}; border-radius:12px; padding:12px 14px; cursor:pointer; transition:all 0.2s; opacity:${isUnread ? '1' : '0.8'}; position:relative;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${isUnread
                                ? '<span style="width:8px; height:8px; border-radius:50%; background:#fbbf24; display:inline-block; box-shadow:0 0 6px #fbbf24;"></span><span style="font-size:0.68rem; font-weight:900; color:#fbbf24;">미확인</span>'
                                : '<span style="font-size:0.68rem; font-weight:800; color:#10b981;">✓ 확인완료</span>'}
                            <span style="font-size:0.68rem; padding:1px 7px; border-radius:6px; background:rgba(245,158,11,0.18); color:#fde68a; border:1px solid rgba(245,158,11,0.3); font-weight:800;">${item.badge || '🔔 알림'}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:0.68rem; color:#94a3b8;">${item.timeLabel || ''}</span>
                            <button type="button" data-notif-action="delete" data-notif-id="${attrId}" onclick="event.stopPropagation(); window.deleteNotification ? window.deleteNotification('${safeId}') : (window.PushClient && window.PushClient.deleteNotification('${safeId}'))" title="이 알림 삭제" style="background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.25); color:#fca5a5; font-size:0.68rem; padding:3px 8px; border-radius:6px; cursor:pointer;" onmouseover="this.style.background='rgba(239,68,68,0.25)';" onmouseout="this.style.background='rgba(239,68,68,0.12)';">
                                <i class="fa-solid fa-trash-can" style="pointer-events:none;"></i> 삭제
                            </button>
                        </div>
                    </div>
                    <div style="font-size:0.84rem; font-weight:800; color:${isUnread ? '#ffffff' : '#cbd5e1'}; line-height:1.35;">${item.title}</div>
                    <div style="font-size:0.76rem; color:#94a3b8; margin-top:4px; line-height:1.5; white-space:pre-line;">${item.body}</div>
                    <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                        <button type="button" data-notif-action="action" data-notif-id="${attrId}" onclick="event.stopPropagation(); window.PushClient && window.PushClient.handleNotificationAction('${safeId}')" style="background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.4); color:#fbbf24; font-size:0.73rem; font-weight:800; padding:4px 10px; border-radius:7px; cursor:pointer;">
                            ${item.actionLabel || '🎱 바로가기'} →
                        </button>
                        <div style="display:flex; align-items:center; gap:6px;">
                            ${isUnread ? `
                                <button type="button" data-notif-action="read" data-notif-id="${attrId}" onclick="event.stopPropagation(); window.markNotificationRead ? window.markNotificationRead('${safeId}') : (window.PushClient && window.PushClient.markNotificationRead('${safeId}'))" style="background:linear-gradient(135deg, rgba(245,158,11,0.25) 0%, rgba(217,119,6,0.35) 100%); border:1px solid #fbbf24; color:#fff; font-size:0.72rem; font-weight:900; padding:4px 10px; border-radius:7px; cursor:pointer; box-shadow:0 2px 6px rgba(245,158,11,0.2);">
                                    탭하여 읽음 처리 ✓
                                </button>
                            ` : `
                                <span style="font-size:0.7rem; color:#10b981; font-weight:800; padding:3px 6px;">
                                    ✓ 확인 완료됨
                                </span>
                            `}
                        </div>
                    </div>
                </div>
                `;
            }).join('');

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
                            <div style="font-size:0.7rem; color:#94a3b8;">관리자 메시지 · 당첨 결과 발표 · 차기 추천번호 안내</div>
                        </div>
                    </div>
                    <button type="button" data-notif-action="close" onclick="window.PushClient && window.PushClient.closeNotificationCenterModal()" style="background:rgba(255,255,255,0.08); border:none; color:#cbd5e1; width:30px; height:30px; border-radius:50%; font-size:1.1rem; cursor:pointer;">&times;</button>
                </div>

                <!-- Sub Toolbar -->
                <div style="padding:10px 14px; background:#090d16; border-bottom:1px solid rgba(255,255,255,0.06);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                            <button type="button" data-notif-action="filter" data-notif-filter="all" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('all')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'all' ? '#f59e0b' : '#1e293b'}; color:${filter === 'all' ? '#0f172a' : '#cbd5e1'};">
                                전체 (${list.length})
                            </button>
                            <button type="button" data-notif-action="filter" data-notif-filter="unread" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('unread')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'unread' ? '#f59e0b' : '#1e293b'}; color:${filter === 'unread' ? '#0f172a' : '#cbd5e1'};">
                                미확인 (${unreadCount})
                            </button>
                            <button type="button" data-notif-action="filter" data-notif-filter="result" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('result')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'result' ? '#f59e0b' : '#1e293b'}; color:${filter === 'result' ? '#0f172a' : '#cbd5e1'};">
                                🏆 당첨·채점 (${resultCount})
                            </button>
                            <button type="button" data-notif-action="filter" data-notif-filter="admin" onclick="window.PushClient && window.PushClient.setNotificationModalFilter('admin')" style="padding:4px 10px; border-radius:7px; font-size:0.73rem; font-weight:800; border:none; cursor:pointer; background:${filter === 'admin' ? '#f59e0b' : '#1e293b'}; color:${filter === 'admin' ? '#0f172a' : '#cbd5e1'};">
                                👑 관리자 메시지 (${adminCount})
                            </button>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <button type="button" data-notif-action="mark-all-read" onclick="window.markAllNotificationsRead ? window.markAllNotificationsRead() : (window.PushClient && window.PushClient.markAllNotificationsRead())" style="padding:4px 9px; border-radius:7px; font-size:0.72rem; font-weight:800; background:rgba(255,255,255,0.07); color:#e2e8f0; border:1px solid rgba(255,255,255,0.12); cursor:pointer;">
                                ✓ 모두 읽음
                            </button>
                            <button type="button" data-notif-action="clear-all" onclick="window.clearAllNotifications ? window.clearAllNotifications() : (window.PushClient && window.PushClient.clearAllNotifications())" style="padding:4px 9px; border-radius:7px; font-size:0.72rem; font-weight:800; background:rgba(239,68,68,0.15); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); cursor:pointer;">
                                🗑️ 전체 삭제
                            </button>
                            <button type="button" onclick="window.handlePushNotificationToggle && window.handlePushNotificationToggle()" style="padding:4px 9px; border-radius:7px; font-size:0.72rem; font-weight:800; background:rgba(59,130,246,0.2); color:#93c5fd; border:1px solid rgba(59,130,246,0.4); cursor:pointer;">
                                ⚙️ 설정·테스트
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
                    bannerDesc.textContent = '매주 토요일 공식 추첨 결과 및 실구매 채점 통합 알림 (스마트폰 1회 푸시 & 알림함 보관)';
                }
            }
        }

        if (popoverPushBtnText) {
            popoverPushBtnText.textContent = isSubscribed ? '당첨결과 알림 (수신 중 🟢)' : '당첨결과 알림 설정';
        }
        if (lpMobilePushBtn) {
            lpMobilePushBtn.title = '운도실력 통합 알림 센터 (알림함)';
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
        const msg = `🧪 ${delaySec}초 뒤 [${displayName}]님을 위한 [토요일 공식 당첨결과 & 실구매 채점] 테스트 푸시 알림이 발송됩니다!\n\n화면을 끄거나 상단 [알림함] 버튼에서 도착 내역을 확인해 보세요.`;
        
        if (typeof window.showToast === 'function') {
            window.showToast(`🧪 ${delaySec}초 뒤 [${displayName}] 당첨결과 테스트 알림 발송!`);
        }
        alert(msg);

        setTimeout(() => {
            const origin = window.location.origin;
            const basePath = (reg.scope && reg.scope.includes('/lucky777/')) ? '/lucky777/' : '/';
            const title = `🏆 [운도실력] 제1246회 로또 당첨결과 & 채점 테스트`;
            const body = `당첨번호: [16, 22, 23, 24, 27, 28] + 보너스 [6] | 구매확정 당첨내역 및 공식 결과가 알림함에 안전하게 등록되었습니다.`;

            reg.showNotification(title, {
                body,
                icon: `${origin}${basePath}icons/icon-192.png`,
                badge: `${origin}${basePath}icons/favicon.png`,
                vibrate: [200, 100, 200, 100, 400],
                tag: 'lucky777-test-result-alert',
                data: { url: `${origin}${basePath}?tab=tab-confirmed` }
            });

            this.addNotification({
                id: `test-alert-${Date.now()}`,
                category: 'result',
                badge: '🧪 당첨·채점 테스트',
                title,
                body,
                timeLabel: '방금 도착',
                unread: true,
                actionType: 'confirmed',
                actionLabel: '📊 실구매 장부 확인하기'
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
        ai_pick: {
            badge: '🎱 AI 추천번호 안내',
            actionType: 'generator',
            actionLabel: '🎱 이번주 추천번호 확인하기',
            title: '{회원명}님을 위한 제 {회차}회차 맞춤 AI 추천번호 안내',
            body: '{회원명}님, 제 {회차}회차 10대 핵심 퀀트 알고리즘 기반 맞춤 번호 조합이 준비되었습니다.\n지금 추천번호 연구소에서 이번 주 번호 팩을 확인해 보세요.'
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
        this.initLocalMemorySync(uid);
        this.loadNotificationsFromServer(uid).finally(() => {
            this.listenNotificationsFromServer(uid);
            this.checkAndGenerateScheduledAlerts();
        });

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
            const rawId = String(msg.id).trim();
            const inboxId = `admin-msg-${rawId}`;
            if (
                this.isNotificationDeleted(inboxId) ||
                this.isNotificationDeleted(rawId) ||
                this.isNotificationDeleted(`admin_${rawId}`)
            ) return;

            const existingList = this.getNotifications();
            const existingItem = existingList.find(it => it && (
                it.id === inboxId ||
                it.id === `push-${inboxId}` ||
                (it.title === msg.title && it.body === (msg.body || ''))
            ));
            const isReadLocally = !!(existingItem && !existingItem.unread) || this.isNotificationRead(inboxId);
            const isUnread = (msg.status !== 'read') && !isReadLocally;
            const notifiedKey = `lucky777_admin_notified_${userId}_${msg.id}`;
            const alreadyAlerted = (this.safeGetItem(notifiedKey) === 'true') ||
                (localStorage.getItem(notifiedKey) === 'true') ||
                this.isPushAlreadyFired(inboxId) ||
                (localStorage.getItem(`lucky777_fired_admin_${msg.id}`) === 'true') ||
                (this.safeGetItem(`admin_popup_dismissed_${userId}_${msg.id}`) === 'true') ||
                (localStorage.getItem(`admin_popup_dismissed_${userId}_${msg.id}`) === 'true');

            if (msg.saveToInbox !== false) {
                if (!existingItem) {
                    if (isUnread && !alreadyAlerted) {
                        this.safeSetItem(notifiedKey, 'true');
                        try { localStorage.setItem(notifiedKey, 'true'); } catch (e) {}
                        this.recordPushFired(inboxId);
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
                    }, false); // 스마트폰 푸시 제외 (알림함 및 로그인 팝업에서 확인)
                } else if (!isUnread && existingItem.unread) {
                    existingItem.unread = false;
                    this.saveNotifications(existingList);
                }
            } else if (isUnread && !alreadyAlerted && !this.isPushAlreadyFired(inboxId)) {
                this.safeSetItem(notifiedKey, 'true');
                try { localStorage.setItem(notifiedKey, 'true'); } catch (e) {}
                this.recordPushFired(inboxId);
            }

            if (isUnread && msg.popupOnLogin !== false) {
                const dismissKey = `admin_popup_dismissed_${userId}_${msg.id}`;
                if (this.safeGetItem(dismissKey) !== 'true' && localStorage.getItem(dismissKey) !== 'true' && sessionStorage.getItem(dismissKey) !== 'true') {
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
            fortune: '🧭 대시보드 바로가기',
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
                localStorage.setItem(`admin_popup_dismissed_${uid}_${msgId}`, 'true');
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

        const uid = this._adminMsgActiveUserId || ((typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '');
        if (uid && msgId) {
            try {
                localStorage.setItem(`admin_popup_dismissed_${uid}_${msgId}`, 'true');
                sessionStorage.setItem(`admin_popup_dismissed_${uid}_${msgId}`, 'true');
            } catch (e) {}
        }

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
                            <button type="button" onclick="window.PushClient.applyAdminMsgTemplate('ai_pick')" style="background:rgba(139,92,246,0.18); border:1px solid rgba(139,92,246,0.45); color:#ddd6fe; padding:5px 10px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">🎱 AI 추천번호 안내</button>
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
                                    <option value="🎱 AI 추천번호 안내">🎱 AI 추천번호 안내</option>
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
                                    <option value="fortune">🧭 대시보드 홈 이동</option>
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
            fortune: '🧭 대시보드 바로가기',
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
    window.setNotificationModalFilter = (filter) => PushClient.setNotificationModalFilter(filter);
    window.openAdminMessageConsoleModal = (userId) => PushClient.openAdminMessageConsoleModal(userId);
    window.markNotificationRead = (id, showToast) => PushClient.markNotificationRead(id, showToast);
    window.markAllNotificationsRead = () => PushClient.markAllNotificationsRead();
    window.deleteNotification = (id) => PushClient.deleteNotification(id);
    window.clearAllNotifications = () => PushClient.clearAllNotifications();
    window.resetAndSeedNotifications = () => PushClient.resetAndSeedNotifications();

    window.handlePushNotificationToggle = async function() {
        if (!PushClient.isSupported()) {
            alert('현재 브라우저에서는 웹 푸시를 지원하지 않습니다.\n아이폰(iOS)의 경우 [홈 화면에 추가(PWA)] 후 앱에서 실행해 주세요.');
            return;
        }

        try {
            const displayName = PushClient.getUserDisplayName();
            const existingSub = await PushClient.getSubscription();
            if (existingSub) {
                const choice = confirm(`🟢 현재 [${displayName}]님을 위한 [매주 토요일 공식 추첨결과 & 구매확정 채점] 알림이 정상 등록되어 있습니다.\n\n[확인] : 3초 뒤 테스트 알림 발송 (알림함 기록 포함)\n[취소] : 알림 수신 해제 창으로 이동`);
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

            const ok = confirm(`🔔 [운도실력 공식 당첨결과 & 채점 알림 서비스]\n\n1. 매주 토요일 공식 추첨 완료 시 당첨번호 및 실구매 채점 통합 알림 (스마트폰 푸시 1회)\n2. 동일 알림은 중복 발송되지 않으며 앱 내 [알림함]에서 언제든 확인 가능\n3. 불필요한 사주 및 광고성 푸시 알림 없음\n\n알림을 허용하시겠습니까?`);
            if (!ok) return;

            const sub = await PushClient.subscribe();
            if (sub) {
                await PushClient.updateBannerVisibility();
                const testNow = confirm(`✨ [${displayName}]님을 위한 당첨결과 알림이 성공적으로 등록되었습니다!\n\n지금 3초 뒤 테스트 알림이 오는지 시험해 보시겠습니까?`);
                if (testNow) {
                    await PushClient.sendTestNotification(3);
                }
            }
        } catch (err) {
            console.error('[handlePushNotificationToggle Error]', err);
            alert(err.message.startsWith('브라우저') ? err.message : ('🔔 [알림 설정 안내]\n\n' + err.message));
        }
    };

    // 앱 실행 및 화면 복귀 시 백그라운드 푸시 동기화 + 당첨결과 알림함 갱신 + 미확인 알림 배너 렌더링
    function initPushUI() {
        PushClient.initLocalMemorySync();
        PushClient.loadNotificationsFromServer().finally(() => {
            PushClient.listenNotificationsFromServer();
            PushClient.syncFromServiceWorkerDB().then(() => {
                PushClient.checkAndGenerateScheduledAlerts();
                PushClient.updateBannerVisibility();
                if (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get && window.SafeAuth.get()) {
                    PushClient.startAdminMessageListener(window.SafeAuth.get());
                }
            });
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
                PushClient.loadNotificationsFromServer().finally(() => {
                    PushClient.syncFromServiceWorkerDB().then(() => {
                        PushClient.checkAndGenerateScheduledAlerts();
                        PushClient.updateBannerVisibility();
                    });
                });
            }
        });
        window.addEventListener('focus', () => {
            PushClient.loadNotificationsFromServer().finally(() => {
                PushClient.syncFromServiceWorkerDB().then(() => {
                    PushClient.checkAndGenerateScheduledAlerts();
                    PushClient.updateBannerVisibility();
                });
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



