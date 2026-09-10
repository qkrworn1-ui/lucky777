import { SafeAuth, isAdminUser } from './auth-mgmt.js';

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
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(created_, dateStr);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(created_, dateStr);
                localStorage.setItem(lotto_user_created_, dateStr);
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
            const cached = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(created_)) ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem(created_)) ||
                           (typeof localStorage !== 'undefined' && localStorage.getItem(lotto_user_created_));
            if (cached) return cached;
        } catch(e) {}

        // 5. Current logged in user object
        if (typeof window !== 'undefined' && window.currentUser) {
            const cId = (window.currentUser.userId || window.currentUser.id || '').toLowerCase().trim();
            if (cId === cleanId && (window.currentUser.createdAt || window.currentUser.created_at)) {
                return window.currentUser.createdAt || window.currentUser.created_at;
            }
        }

        return null;
    },

    getUserJoinRound(userId) {
        if (!userId) return 1235;
        let cleanId = String(userId).trim();
        if (cleanId.startsWith('{')) {
            try {
                const p = JSON.parse(cleanId);
                cleanId = p.userid || p.userId || cleanId;
            } catch(e) {}
        }
        cleanId = cleanId.toLowerCase().trim();

        if (cleanId === 'master' || cleanId === 'admin' || cleanId === 'all') return 1235;
        if (typeof isAdminUser === 'function' && isAdminUser(cleanId)) return 1235;

        const createdAt = this.getUserCreatedAt(cleanId);
        if (createdAt) {
            const calced = LottoTimeService.calcRoundFromDate(createdAt);
            return Math.max(calced, 1235);
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
    }
};

if (typeof window !== 'undefined') {
    window.LottoTimeService = LottoTimeService;
    window.UserContextManager = UserContextManager;
}
