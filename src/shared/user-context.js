/**
 * 🕒 LottoTimeService: Single Source of Truth for Lotto Dates & Rounds
 */
export const LottoTimeService = {
    FIRST_CUTOFF: new Date('2002-12-07T20:00:00+09:00'),

    parseDate(input) {
        if (!input) return null;
        try {
            if (typeof input === 'object' && input !== null) {
                if (input.seconds) return new Date(input.seconds * 1000);
                if (typeof input.toDate === 'function') return input.toDate();
                if (input._seconds) return new Date(input._seconds * 1000);
                if (input instanceof Date) return input;
            } else if (typeof input === 'number') {
                return new Date(input < 1e11 ? input * 1000 : input);
            } else if (typeof input === 'string') {
                const s = input.trim().replace('Z', '+00:00');
                const d = new Date(s);
                if (!isNaN(d.getTime())) return d;
            }
        } catch(e) {}
        return null;
    },

    calcRoundFromDate(dateInput) {
        const dt = this.parseDate(dateInput);
        if (!dt || isNaN(dt.getTime())) return 1235;
        const diff = dt.getTime() - this.FIRST_CUTOFF.getTime();
        if (diff < 0) return 1;
        const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
        return 2 + weeks;
    },

    getRoundCutoffDate(roundNum) {
        const weeks = Math.max(0, roundNum - 2);
        return new Date(this.FIRST_CUTOFF.getTime() + (weeks * 7 * 24 * 60 * 60 * 1000));
    },

    isPreJoinRound(roundNum, userJoinRound) {
        return Number(roundNum) < Number(userJoinRound);
    }
};

export const DEFAULT_KNOWN_USERS = [
    { id: 'master', name: '최고관리자', realName: '최고관리자', phone: '', isAdmin: true, isPermanent: true, userType: 'permanent', createdAt: '2026-07-25T12:00:00+09:00', status: 'active', isDeleted: false },
    { id: 'wdy', name: '우대용', realName: '우대용', phone: '010-4056-8177', isAdmin: false, isPermanent: false, userType: 'regular', createdAt: '2026-08-01T12:00:00+09:00', status: 'active', isDeleted: false },
    { id: 'kakao_5070244665', name: '박재구', realName: '박재구', phone: '010-7177-2581', isAdmin: true, isPermanent: true, userType: 'permanent', createdAt: '2026-09-03T07:11:50.351Z', status: 'active', isDeleted: false },
    { id: 'kakao_5070267707', name: '정미승', realName: '정미승', phone: '010-7124-5768', isAdmin: true, isPermanent: true, userType: 'permanent', createdAt: '2026-09-03T05:16:47.711Z', status: 'active', isDeleted: false },
    { id: 'kakao_5070669650', name: '강지민', realName: '강지민', phone: '010-7191-1151', isAdmin: false, isPermanent: true, userType: 'permanent', createdAt: '2026-09-03T09:32:47.035Z', status: 'active', isDeleted: false },
    { id: 'kakao_5071901217', name: '황선영', realName: '황선영', phone: '010-3332-5843', isAdmin: true, isPermanent: true, userType: 'permanent', createdAt: '2026-09-04T05:58:58.537Z', status: 'active', isDeleted: false },
    { id: 'kakao_5072328991', name: '채금조(재우주식회사)', realName: '채금조(재우주식회사)', phone: '010-2596-1107', isAdmin: false, isPermanent: false, userType: 'regular', createdAt: '2026-09-04T10:34:57.095Z', status: 'suspended_nopurchase', isDeleted: false },
    { id: 'kakao_5073272571', name: '우순애', realName: '우순애', phone: '010-8865-7777', isAdmin: false, isPermanent: true, userType: 'permanent', createdAt: '2026-09-05T04:26:10.288Z', status: 'active', isDeleted: false },
    { id: 'kakao_5078158815', name: '이재문', realName: '이재문', phone: '010-9116-3887', isAdmin: false, isPermanent: false, userType: 'regular', createdAt: '2026-09-08T04:35:33.378Z', status: 'active', isDeleted: false },
    { id: 'kakao_5081166702', name: '은정', realName: '은정', phone: '010-8952-1325', isAdmin: false, isPermanent: false, userType: 'regular', createdAt: '2026-09-09T15:36:24.439Z', status: 'active', isDeleted: false },
    { id: 'kakao_5081608503', name: '백인동', realName: '백인동', phone: '010-9444-6044', isAdmin: false, isPermanent: false, userType: 'regular', createdAt: '2026-09-10T02:12:26.711Z', status: 'active', isDeleted: false },
    { id: 'kakao_5084970607', name: '우대웅', realName: '우대웅', phone: '', isAdmin: true, isPermanent: true, userType: 'permanent', createdAt: '2026-09-12T02:58:58.476Z', status: 'active', isDeleted: false },
    { id: 'kakao_5090399860', name: 'Stealth honey bang', realName: 'Stealth honey bang', phone: '010-6556-6393', isAdmin: false, isPermanent: true, userType: 'permanent', createdAt: '2026-09-15T06:22:13.931Z', status: 'active', isDeleted: false }
];

/**
 * 👤 UserContextManager: Single Source of Truth for User Metadata & Permissions
 */
export const UserContextManager = {
    _userCreatedMap: {},

    setUserCreated(userId, createdAt) {
        if (!userId || !createdAt) return;
        const cleanId = String(userId).trim().toLowerCase();
        const dt = LottoTimeService.parseDate(createdAt);
        const dateStr = dt ? dt.toISOString() : String(createdAt).trim();
        this._userCreatedMap[cleanId] = dateStr;
        try {
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`created_${cleanId}`, dateStr);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(`created_${cleanId}`, dateStr);
                localStorage.setItem(`lotto_user_created_${cleanId}`, dateStr);
            }
        } catch(e) {}
    },

    getUserCreatedAt(userId) {
        if (!userId) return null;
        const cleanId = String(userId).trim().toLowerCase();

        // 1. Memory cache
        if (this._userCreatedMap[cleanId]) return this._userCreatedMap[cleanId];
        if (typeof window !== 'undefined' && window.__userCreatedMap && window.__userCreatedMap[cleanId]) {
            return window.__userCreatedMap[cleanId];
        }

        // 2. State registered users list
        if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.allRegisteredUsersList)) {
            const found = window.state.allRegisteredUsersList.find(u => (u.id || '').toLowerCase().trim() === cleanId);
            if (found && (found.createdAt || found.created_at || found.registeredAt)) {
                return found.createdAt || found.created_at || found.registeredAt;
            }
        }

        // 3. State purchases map
        if (typeof window !== 'undefined' && window.state && window.state.allUsersPurchasesMap && window.state.allUsersPurchasesMap[cleanId]) {
            const pObj = window.state.allUsersPurchasesMap[cleanId];
            if (pObj.createdAt || pObj.created_at) return pObj.createdAt || pObj.created_at;
        }

        // 4. Session & Local Storage
        try {
            const cached = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`created_${cleanId}`)) ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem(`created_${cleanId}`)) ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem(`lotto_user_created_${cleanId}`));
            if (cached) return cached;
        } catch(e) {}

        // 5. Current logged in user object
        if (typeof window !== 'undefined' && window.currentUser && (window.currentUser.userId || window.currentUser.id) === cleanId) {
            if (window.currentUser.createdAt) return window.currentUser.createdAt;
        }

        // 6. DEFAULT_KNOWN_USERS Baseline
        const foundKnown = DEFAULT_KNOWN_USERS.find(u => u.id === cleanId);
        if (foundKnown && foundKnown.createdAt) return foundKnown.createdAt;

        return null;
    },

    getUserJoinRound(userId) {
        if (!userId) return 1235;
        let cleanId = String(userId).trim();
        if (cleanId.startsWith('{')) {
            try {
                const parsed = JSON.parse(cleanId);
                cleanId = parsed.userid || parsed.userId || cleanId;
            } catch(e) {}
        }
        cleanId = cleanId.toLowerCase().trim();
        if (cleanId === 'all') return 1235;
        if (cleanId === 'master' || cleanId === 'admin') return 1235;
        if (cleanId === 'wdy') return 1235;

        // Check if user has explicit createdAt
        const createdAt = this.getUserCreatedAt(cleanId);
        if (createdAt) {
            const calced = LottoTimeService.calcRoundFromDate(createdAt);
            return Math.max(calced, 1235);
        }

        // Fallback for Kakao users without registered date (default baseline 1240)
        if (cleanId.startsWith('kakao_')) {
            return 1240;
        }

        return 1235;
    },

    getValidRoundsForUser(userId, latestRound) {
        const joinRound = this.getUserJoinRound(userId);
        const minRound = Math.max(1235, joinRound);
        const rounds = [];
        for (let r = latestRound; r >= minRound; r--) {
            rounds.push(r);
        }
        return rounds.length > 0 ? rounds : [minRound];
    },

    /**
     * 🌐 Single Source of Truth (SSOT) Unified Registered Users List Provider
     * Perfectly merges DEFAULT_KNOWN_USERS, localStorage, state.allRegisteredUsersList, allUsersPurchasesMap, and snapshots.
     * Guarantees all members presence while strictly filtering out system dummy test accounts.
     */
    getAllUnifiedUsers() {
        const userMap = new Map();

        // 0. Seed with DEFAULT_KNOWN_USERS baseline (guarantees instant zero-delay consistency)
        DEFAULT_KNOWN_USERS.forEach(u => {
            userMap.set(u.id.toLowerCase(), { ...u });
        });

        // 1. Synchronously pre-load cached users from localStorage
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('lotto_all_users_list_cache');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(u => {
                            if (u && u.id) {
                                const cleanId = String(u.id).trim().toLowerCase();
                                if (cleanId && !userMap.has(cleanId)) {
                                    userMap.set(cleanId, {
                                        id: u.id,
                                        name: u.name || u.realName || u.id,
                                        realName: u.realName || u.name || u.id,
                                        phone: u.phone || u.phoneNumber || '',
                                        isAdmin: !!u.isAdmin,
                                        isPermanent: !!u.isPermanent,
                                        userType: u.userType || 'regular',
                                        createdAt: u.createdAt || null,
                                        status: u.status || 'active',
                                        isDeleted: u.isDeleted || false
                                    });
                                }
                            }
                        });
                    }
                }
            }
        } catch(e) {}

        // 2. Merge in-memory state.allRegisteredUsersList
        if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.allRegisteredUsersList)) {
            window.state.allRegisteredUsersList.forEach(u => {
                if (u && u.id) {
                    const cleanId = String(u.id).trim().toLowerCase();
                    if (cleanId) {
                        const existing = userMap.get(cleanId) || {};
                        userMap.set(cleanId, {
                            ...existing,
                            id: u.id,
                            name: u.name || u.realName || existing.name || u.id,
                            realName: u.realName || u.name || existing.realName || u.id,
                            phone: u.phone || u.phoneNumber || existing.phone || '',
                            isAdmin: u.isAdmin !== undefined ? !!u.isAdmin : existing.isAdmin,
                            isPermanent: u.isPermanent !== undefined ? !!u.isPermanent : existing.isPermanent,
                            userType: u.userType || existing.userType || 'regular',
                            createdAt: u.createdAt || existing.createdAt || null,
                            status: u.status || existing.status || 'active',
                            isDeleted: u.isDeleted !== undefined ? u.isDeleted : existing.isDeleted
                        });
                    }
                }
            });
        }

        // 3. Merge state.allUsersPurchasesMap
        if (typeof window !== 'undefined' && window.state && window.state.allUsersPurchasesMap && typeof window.state.allUsersPurchasesMap === 'object') {
            Object.keys(window.state.allUsersPurchasesMap).forEach(uId => {
                const pObj = window.state.allUsersPurchasesMap[uId];
                if (pObj) {
                    const cleanId = String(uId).trim().toLowerCase();
                    if (cleanId) {
                        const existing = userMap.get(cleanId) || {};
                        const hasOfficialName = !!(existing.realName && !existing.realName.startsWith('kakao_') && !existing.realName.startsWith('카카오회원'));
                        const officialRealName = hasOfficialName ? existing.realName : (pObj.realName || pObj.name || existing.name || uId);
                        userMap.set(cleanId, {
                            ...existing,
                            id: pObj.userId || uId,
                            name: officialRealName,
                            realName: officialRealName,
                            phone: existing.phone || '',
                            isAdmin: existing.isAdmin !== undefined ? existing.isAdmin : false,
                            isPermanent: existing.isPermanent !== undefined ? existing.isPermanent : false,
                            userType: existing.userType || 'regular',
                            createdAt: existing.createdAt || pObj.createdAt || pObj.created_at || null,
                            status: existing.status || 'active',
                            isDeleted: existing.isDeleted || false
                        });
                    }
                }
            });
        }

        // 4. Merge state.userRecommendationSnapshots
        if (typeof window !== 'undefined' && window.state && window.state.userRecommendationSnapshots && typeof window.state.userRecommendationSnapshots === 'object') {
            Object.keys(window.state.userRecommendationSnapshots).forEach(k => {
                const snap = window.state.userRecommendationSnapshots[k];
                if (snap && snap.userId) {
                    const cleanId = String(snap.userId).trim().toLowerCase();
                    if (cleanId) {
                        const existing = userMap.get(cleanId) || {};
                        const hasOfficialName = !!(existing.realName && !existing.realName.startsWith('kakao_') && !existing.realName.startsWith('카카오회원'));
                        const officialRealName = hasOfficialName ? existing.realName : (snap.realName || existing.name || snap.userId);
                        userMap.set(cleanId, {
                            ...existing,
                            id: snap.userId,
                            name: officialRealName,
                            realName: officialRealName,
                            phone: existing.phone || snap.phone || '',
                            isAdmin: existing.isAdmin !== undefined ? existing.isAdmin : false,
                            isPermanent: existing.isPermanent !== undefined ? existing.isPermanent : false,
                            userType: snap.userType || existing.userType || 'regular',
                            createdAt: existing.createdAt || snap.userCreatedAt || null,
                            status: existing.status || 'active',
                            isDeleted: existing.isDeleted || false
                        });
                    }
                }
            });
        }

        // 5. Ensure master and wdy are always guaranteed
        if (!userMap.has('master')) {
            userMap.set('master', {
                id: 'master',
                name: '관리자',
                realName: '관리자',
                phone: '',
                isAdmin: true,
                isPermanent: true,
                userType: 'permanent',
                createdAt: '2026-07-25T12:00:00+09:00',
                status: 'active',
                isDeleted: false
            });
        } else {
            const m = userMap.get('master');
            m.isAdmin = true;
            m.isPermanent = true;
            if (!m.name) m.name = '관리자';
        }

        if (!userMap.has('wdy')) {
            userMap.set('wdy', {
                id: 'wdy',
                name: '우대용',
                realName: '우대용',
                phone: '',
                isAdmin: false,
                isPermanent: false,
                userType: 'regular',
                createdAt: '2026-08-01T12:00:00+09:00',
                status: 'active',
                isDeleted: false
            });
        }

        // 6. Filter out deleted or dummy test accounts and duplicate name aliases
        const unifiedList = Array.from(userMap.values()).filter(u => {
            if (!u || !u.id) return false;
            const uId = String(u.id).trim().toLowerCase();
            if (u.isDeleted === true || u.status === 'trash' || u.status === 'deleted') return false;
            if (uId.startsWith('{') || uId.startsWith('test_') || uId === 'app_latest_version' ||
                uId === 'global_trash' || uId === 'global_state' || uId === 'global_saved' || uId === 'extra_history' ||
                uId === 'user_alpha' || uId === 'user_beta' || uId === 'user_gamma' || uId === 'sample' || uId === 'hms' ||
                uId === 'guest' || uId === 'all') {
                return false;
            }
            // Filter out non-canonical name aliases if an official kakao account already exists for this person
            if (!uId.startsWith('kakao_') && uId !== 'master' && uId !== 'wdy') {
                const uRaw = String(u.name || u.realName || u.id).trim();
                const hasKakaoAccount = Array.from(userMap.values()).some(other => 
                    other && other.id && String(other.id).startsWith('kakao_') && 
                    ((other.name && String(other.name).trim() === uRaw) || (other.realName && String(other.realName).trim() === uRaw))
                );
                if (hasKakaoAccount) return false;
            }
            return true;
        });

        // 7. Update in-memory state and localStorage cache if list has elements
        if (unifiedList.length > 0 && typeof window !== 'undefined' && window.state) {
            window.state.allRegisteredUsersList = unifiedList;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('lotto_all_users_list_cache', JSON.stringify(unifiedList));
                }
            } catch(e) {}
        }

        return unifiedList;
    }
};

export function getAllUnifiedRegisteredUsers() {
    return UserContextManager.getAllUnifiedUsers();
}

if (typeof window !== 'undefined') {
    window.LottoTimeService = LottoTimeService;
    window.UserContextManager = UserContextManager;
    window.getAllUnifiedRegisteredUsers = getAllUnifiedRegisteredUsers;
}
