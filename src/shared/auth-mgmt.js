import { db } from './db.js';
import { showToast, escapeHtml } from './utils.js';
import { hashPassword, checkPasswordStrength } from './crypto-utils.js';

// ========================================================
// 1. Safe Multi-Storage Auth Helper (Session + Local + Cookie + Memory)
// ========================================================
const memoryAuthStore = { id: null };

function _getRaw(key) {
    var val = null;
    try { val = window.sessionStorage.getItem(key); if (val) return val.trim(); } catch(e) {}
    try { val = window.localStorage.getItem(key); if (val) return val.trim(); } catch(e) {}
    try {
        var m = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + key + '=([^;]+)'));
        if (m) return decodeURIComponent(m[1]).trim();
    } catch(e) {}
    return memoryAuthStore.id;
}

function _setRaw(key, val) {
    var clean = val ? val.trim() : '';
    memoryAuthStore.id = clean;
    try { window.sessionStorage.setItem(key, clean); } catch(e) {}
    try { window.localStorage.setItem(key, clean); } catch(e) {}
    try { document.cookie = key + '=' + encodeURIComponent(clean) + '; path=/; max-age=2592000; SameSite=Lax'; } catch(e) {}
}

function _clearRaw(key) {
    memoryAuthStore.id = null;
    try { window.sessionStorage.removeItem(key); } catch(e) {}
    try { window.localStorage.removeItem(key); } catch(e) {}
    try {
        document.cookie = key + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';
        document.cookie = key + '=; Path=/; Domain=' + window.location.hostname + '; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';
        document.cookie = key + '=; Path=/; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Max-Age=0;';
    } catch(e) {}
}

export const SafeAuth = {
    get: function() {
        var raw = _getRaw('lotto_auth');
        if (!raw) return null;
        if (typeof raw === 'string' && raw.startsWith('{')) {
            try {
                var obj = JSON.parse(raw);
                if (obj && obj.userId) return obj.userId;
            } catch(e) {}
        }
        return raw;
    },
    set: function(id) {
        if (!id) return;
        var cleanId = (typeof id === 'object' && id.userId) ? id.userId : String(id).trim();
        _setRaw('lotto_auth', cleanId);
    },
    clear: function() { _clearRaw('lotto_auth'); }
};

export function handleLogout() {
    if (!confirm('정말로 로그아웃 하시겠습니까?')) return;
    
    // 1. Clear memory & Storage & Cookies
    const currId = SafeAuth.get();
    SafeAuth.clear();
    window.__appUnlocked = false;

    if (currId) {
        try { window.sessionStorage.removeItem(`perm_${currId.toLowerCase()}`); } catch(e){}
        try { window.localStorage.removeItem(`perm_${currId.toLowerCase()}`); } catch(e){}
        try { window.sessionStorage.removeItem(`role_${currId.toLowerCase()}`); } catch(e){}
        try { window.localStorage.removeItem(`role_${currId.toLowerCase()}`); } catch(e){}
    }
    if (typeof window !== 'undefined') {
        window.__permUsers = {};
        if (window.lottoState) {
            window.lottoState.globalLedger = {};
            window.lottoState.allUsersPurchasesMap = {};
            window.lottoState.allUsersMergedLedger = null;
            window.lottoState.ledgerFinancialsCache = null;
        }
    }
    try { window.sessionStorage.clear(); } catch(e){}
    try { window.localStorage.removeItem('lotto_auth'); } catch(e){}
    try { window.localStorage.removeItem('kakao_access_token'); } catch(e){}

    // 2. Clear Kakao Auth Session if connected
    if (window.Kakao && window.Kakao.Auth && typeof window.Kakao.Auth.logout === 'function') {
        try {
            window.Kakao.Auth.logout(function() {
                console.log('[Kakao] Logged out successfully');
            });
        } catch(e){}
    }

    // 3. Remove early CSS preventing login modal
    const earlyCss = document.getElementById('early-auth-css');
    if (earlyCss && earlyCss.parentNode) {
        earlyCss.parentNode.removeChild(earlyCss);
    }

    // 4. Force show login modal immediately, hide all app pages
    const loginModal = document.getElementById('loginModalOverlay');
    if (loginModal) {
        loginModal.style.setProperty('display', 'flex', 'important');
        loginModal.style.setProperty('visibility', 'visible', 'important');
        loginModal.style.setProperty('opacity', '1', 'important');
        loginModal.style.setProperty('pointer-events', 'auto', 'important');
    }
    // Hide all app pages (using correct IDs)
    ['landingPage', 'appContainer', 'totoPage', 'mainApp', 'totoApp'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
            el.style.setProperty('display', 'none', 'important');
            el.classList.remove('active');
        }
    });

    // 5. Reload cleanly without hash or query
    window.location.replace(window.location.origin + window.location.pathname);
}

export function updateDebugMonitor(globalLedger = {}) {
    const debugAuth = document.getElementById('debug-auth-id');
    const debugDb = document.getElementById('debug-db-status');
    const debugKeys = document.getElementById('debug-ledger-keys');
    
    if (debugAuth) debugAuth.textContent = SafeAuth.get() || '비로그인';
    if (debugDb) debugDb.textContent = window.db ? 'Firestore 연결됨' : '로컬 모드 (서버 미연결)';
    if (debugKeys) {
        const keys = Object.keys(globalLedger || {}).map(Number).filter(r => !isNaN(r)).sort((a,b) => b - a);
        debugKeys.textContent = keys.length > 0 ? keys.join(', ') : '없음 (내역 비어있음)';
    }
}

// ========================================================
// 2. Real-time Lotto Round Calculations (2002.12.07 Cutoff SSOT)
// ========================================================
export function calcLiveLatestDrawnRound(now = new Date()) {
    const firstDrawTime = new Date('2002-12-07T20:45:00+09:00');
    const diff = now.getTime() - firstDrawTime.getTime();
    if (diff < 0) return 1;
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    return 1 + weeks;
}

export function calcLiveUpcomingRound(now = new Date()) {
    const firstCutoff = new Date('2002-12-07T20:00:00+09:00');
    const diff = now.getTime() - firstCutoff.getTime();
    if (diff < 0) return 1;
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    return 2 + weeks;
}

export function getLatestDrawnRound() {
    try {
        if (typeof window !== 'undefined') {
            if (window.state && window.state.latestDrawData && window.state.latestDrawData.drwNo) {
                return window.state.latestDrawData.drwNo;
            }
            if (window.state && window.state.latestRoundNum) {
                return window.state.latestRoundNum;
            }
            if (window.__M_services_lotto_state && window.__M_services_lotto_state.state) {
                const st = window.__M_services_lotto_state.state;
                if (st.latestDrawData && st.latestDrawData.drwNo) return st.latestDrawData.drwNo;
                if (st.latestRoundNum) return st.latestRoundNum;
            }
            if (typeof LOTTO_HISTORY !== 'undefined') {
                const rounds = Object.keys(LOTTO_HISTORY).map(Number).filter(r => !isNaN(r));
                if (rounds.length > 0) return Math.max(...rounds);
            }
        }
    } catch(e) {}
    return calcLiveLatestDrawnRound();
}

export function getUpcomingLottoRound() {
    try {
        if (typeof window !== 'undefined') {
            if (window.state && window.state.latestDrawData && window.state.latestDrawData.drwNo) {
                return window.state.latestDrawData.drwNo + 1;
            }
            if (window.state && window.state.nextRoundNum) {
                return window.state.nextRoundNum;
            }
            if (window.__M_services_lotto_state && window.__M_services_lotto_state.state) {
                const st = window.__M_services_lotto_state.state;
                if (st.latestDrawData && st.latestDrawData.drwNo) return st.latestDrawData.drwNo + 1;
                if (st.nextRoundNum) return st.nextRoundNum;
            }
        }
    } catch(e) {}
    return calcLiveUpcomingRound();
}

// ========================================================
// 3. User Roles, Caches, & Permissions
// ========================================================
export function setIsAdminCache(authId, isAdmin) {
    if (!authId) return;
    const cleanId = String(authId).trim().toLowerCase();
    try {
        const val = isAdmin ? 'true' : 'false';
        sessionStorage.setItem(`role_${cleanId}`, val);
        localStorage.setItem(`role_${cleanId}`, val);
        if (typeof window !== 'undefined') {
            if (!window.__adminUsers) window.__adminUsers = {};
            window.__adminUsers[cleanId] = !!isAdmin;
        }
    } catch(e) {}
}

export function setIsPermanentCache(authId, isPermanent) {
    if (!authId) return;
    const cleanId = String(authId).trim().toLowerCase();
    try {
        const val = isPermanent ? 'true' : 'false';
        sessionStorage.setItem(`perm_${cleanId}`, val);
        localStorage.setItem(`perm_${cleanId}`, val);
        if (typeof window !== 'undefined') {
            if (!window.__permUsers) window.__permUsers = {};
            window.__permUsers[cleanId] = !!isPermanent;
        }
    } catch(e) {}
}

export function setUserNameCache(authId, realName) {
    if (!authId || !realName) return;
    const cleanId = String(authId).trim().toLowerCase();
    try {
        sessionStorage.setItem(`name_${cleanId}`, realName);
        localStorage.setItem(`name_${cleanId}`, realName);
        if (typeof window !== 'undefined') {
            if (!window.__userNames) window.__userNames = {};
            window.__userNames[cleanId] = realName;
        }
    } catch(e) {}
}

export function setUserCreatedCache(authId, createdAt) {
    if (!authId || !createdAt) return;
    const cleanId = String(authId).trim().toLowerCase();
    try {
        sessionStorage.setItem(`created_${cleanId}`, createdAt);
        localStorage.setItem(`created_${cleanId}`, createdAt);
        if (typeof window !== 'undefined') {
            if (!window.__userCreatedMap) window.__userCreatedMap = {};
            window.__userCreatedMap[cleanId] = createdAt;
        }
    } catch(e) {}
}

export function getUserRealName(authId) {
    if (!authId) return '';
    const cleanId = String(authId).trim().toLowerCase();
    if (typeof window !== 'undefined' && window.__userNames && window.__userNames[cleanId]) {
        return window.__userNames[cleanId];
    }
    try {
        const cached = sessionStorage.getItem(`name_${cleanId}`) || localStorage.getItem(`name_${cleanId}`);
        if (cached) return cached;
    } catch(e) {}
    return authId;
}

export function isPermanentUser(authId, userData = null) {
    if (!authId) return false;
    const cleanId = String(authId).trim().toLowerCase();
    if (cleanId === 'master' || cleanId === 'admin') return true;
    if (userData && (userData.isPermanent === true || userData.isPermanent === 'true' || userData.userType === 'permanent')) return true;
    if (typeof window !== 'undefined' && window.__permUsers && window.__permUsers[cleanId] === true) return true;
    try {
        const sVal = sessionStorage.getItem(`perm_${cleanId}`);
        if (sVal === 'true') return true;
        const lVal = localStorage.getItem(`perm_${cleanId}`);
        if (lVal === 'true') return true;
    } catch(e) {}
    return false;
}

export function isAdminUser(authId, userData = null) {
    if (!authId) return false;
    const cleanId = String(authId).trim().toLowerCase();
    if (cleanId === 'master' || cleanId === 'admin') return true;
    if (userData && (userData.isAdmin === true || userData.role === 'admin')) return true;
    if (typeof window !== 'undefined' && window.__adminUsers && window.__adminUsers[cleanId] === true) return true;
    try {
        const sVal = sessionStorage.getItem(`role_${cleanId}`);
        if (sVal === 'true') return true;
        const lVal = localStorage.getItem(`role_${cleanId}`);
        if (lVal === 'true') return true;
    } catch(e) {}
    return false;
}
export const isUserAdmin = isAdminUser;

export function setUserPermissionsCache(authId, perms) {
    if (!authId || !perms) return;
    const cleanId = String(authId).trim().toLowerCase();
    try {
        const val = JSON.stringify(perms);
        sessionStorage.setItem(`perms_${cleanId}`, val);
        localStorage.setItem(`perms_${cleanId}`, val);
        if (typeof window !== 'undefined') {
            if (!window.__userPermissions) window.__userPermissions = {};
            window.__userPermissions[cleanId] = perms;
        }
    } catch(e) {}
}

export function getUserPermissions(authId) {
    if (!authId) return { allowLotto: true, allowToto: true };
    const cleanId = String(authId).trim().toLowerCase();
    if (cleanId === 'master' || cleanId === 'admin') return { allowLotto: true, allowToto: true };
    if (typeof window !== 'undefined' && window.__userPermissions && window.__userPermissions[cleanId]) {
        return window.__userPermissions[cleanId];
    }
    try {
        const cached = sessionStorage.getItem(`perms_${cleanId}`) || localStorage.getItem(`perms_${cleanId}`);
        if (cached) return JSON.parse(cached);
    } catch(e) {}
    return { allowLotto: true, allowToto: true };
}

export function checkUserProgramPermissions(authId, programName = 'lotto') {
    const perms = getUserPermissions(authId);
    if (programName === 'toto') return perms.allowToto !== false;
    return perms.allowLotto !== false;
}

export async function checkUserWeeklyPurchaseStatus(userId, userDocData = null) {
    const upcomingRound = getUpcomingLottoRound();
    const latestRound = getLatestDrawnRound();

    if (!userId || userId === 'master' || userId === 'admin') {
        return { isExempt: true, isPermanent: true, hasPurchased: true, targetRound: upcomingRound, message: '관리자/마스터 계정 (면제)' };
    }

    const firestore = (typeof window !== 'undefined' && window.rawFirestore) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null) || window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
    let userData = userDocData;
    if (!userData && firestore) {
        try {
            const uDoc = await firestore.collection('lotto_users').doc(userId).get();
            if (uDoc.exists) userData = uDoc.data();
        } catch(e) { console.error('[checkUserWeeklyPurchaseStatus Error]', e); }
    }

    // Permanent lifetime check
    const isPermanent = !!(
        (userData && (userData.isPermanent === true || userData.isPermanent === 'true' || userData.userType === 'permanent')) ||
        isPermanentUser(userId, userData) ||
        (typeof window !== 'undefined' && window.isPermanentUser && window.isPermanentUser(userId, userData))
    );
    if (isPermanent) {
        setIsPermanentCache(userId, true);
        return {
            isPermanent: true,
            isExempt: true,
            hasPurchased: true,
            targetRound: upcomingRound,
            targetRoundGameCount: 999,
            lastPurchasedRound: 0,
            isSuspended: false,
            status: userData ? (userData.status === 'suspended' ? 'suspended' : 'active') : 'active',
            suspensionReason: userData ? userData.suspensionReason : '',
            message: '💎 영구 사용 회원 (실구매 의무 평생 면제)'
        };
    }

    // Grace period check (5 days)
    let isGracePeriod = false;
    if (userData && userData.createdAt) {
        const joinTime = new Date(userData.createdAt).getTime();
        const daysDiff = (Date.now() - joinTime) / (1000 * 60 * 60 * 24);
        if (daysDiff < 5) isGracePeriod = true;
    }

    let userLedger = {};
    let lastPurchasedRound = 0;
    if (firestore) {
        try {
            const pDoc = await firestore.collection('lotto_purchases').doc(userId).get();
            if (pDoc.exists && pDoc.data().ledger) {
                userLedger = pDoc.data().ledger;
            }
        } catch(e) { console.error('[Purchase Ledger Fetch Error]', e); }
    }

    const rounds = Object.keys(userLedger).map(Number).filter(r => !isNaN(r) && Array.isArray(userLedger[r]) && userLedger[r].length > 0).sort((a,b) => b - a);
    if (rounds.length > 0) lastPurchasedRound = rounds[0];

    let upcomingRoundGameCount = 0;
    let latestRoundGameCount = 0;

    const upcomingReceipts = userLedger[upcomingRound] || [];
    if (Array.isArray(upcomingReceipts)) {
        upcomingReceipts.forEach(r => { if (r && Array.isArray(r.combos)) upcomingRoundGameCount += r.combos.length; });
    }

    const latestReceipts = userLedger[latestRound] || [];
    if (Array.isArray(latestReceipts)) {
        latestReceipts.forEach(r => { if (r && Array.isArray(r.combos)) latestRoundGameCount += r.combos.length; });
    }

    const hasPurchased = (upcomingRoundGameCount >= 5) || (latestRoundGameCount >= 5) || (upcomingRoundGameCount > 0);
    const targetRoundGameCount = upcomingRoundGameCount > 0 ? upcomingRoundGameCount : latestRoundGameCount;

    return {
        isPermanent: false,
        isExempt: false,
        isGracePeriod,
        hasPurchased,
        targetRound: upcomingRound,
        targetRoundGameCount,
        upcomingRoundGameCount,
        latestRoundGameCount,
        lastPurchasedRound,
        isSuspended: userData ? (userData.status === 'suspended' || userData.status === 'suspended_nopurchase') : false,
        status: userData ? userData.status : 'active',
        suspensionReason: userData ? userData.suspensionReason : ''
    };
}

// ========================================================
// 4. Standard Legal Agreement Terms & Documents
// ========================================================
export function getStandardAgreementTerms(now = new Date()) {
    const agreedAt = now.toISOString();
    return [
        {
            termId: 'term_fee',
            title: '[필수 1] 로또 1등 5% / 2등 10% / 3등 10% 성과연동 기술기여금 지급 및 미구매자 완전 면책 약정',
            fullContent: '제1조 (목적 및 성격) 본 약정은 회원이 플랫폼의 통계 퀀트 알고리즘 추천 조합을 활용하여 실제 로또 6/45 1등, 2등 또는 3등에 당첨된 경우에 한하여 지급할 소프트웨어 기술용역 및 통계 데이터 분석에 대한 자발적 성과연동 후불 기술기여금을 규정합니다. 4등(5만 원) 및 5등(5천 원) 당첨금에 대해서는 일체의 기술료가 전액 면제(0원)되며 100% 회원 본인에게 귀속됩니다.\\n제2조 (미구매 회원에 대한 완전 면책 원칙) 회원이 플랫폼에서 추천받은 번호로 실제 복권을 구매하지 아니한 경우, 추천 번호의 당첨 여부와 무관하게 어떠한 명목의 수수료, 위약금, 손해배상금, 채권 청구도 일체 발생하지 아니함을 명백히 확약합니다. (복권 미구매자에 대한 부당 청구 및 채권추심 절대 불가 원칙)\\n제3조 (기술료율 및 적법 세무 증빙) 실제 로또 1등 당첨 시 세후 실수령액의 5%, 2등 당첨 시 세후 실수령액의 10%, 3등 당첨 시 세후 실수령액의 10%(소득세법상 비과세로 약 15만 원 상당)를 운영사인 「해피크레딧」(대표: 박재구, 사업자등록번호: 322-51-00561)의 사업자 계좌로 정산 지급하며, 해피크레딧은 부가가치세법 및 세법에 따라 정식 전자세금계산서(또는 현금영수증)를 100% 투명하게 발행합니다.\\n제4조 (지급기한 및 입증) 회원은 실제 당첨금을 수령한 날로부터 14일 이내에 상호 확인 하에 정산을 진행합니다. 시스템의 조합 발급 로그 및 회원이 등록한 실구매 영수증 일련번호가 상호 사실관계를 증명하는 객관적 데이터로 활용됩니다.\\n제5조 (상호 신의성실) 플랫폼과 회원은 상호 신의성실의 원칙에 따라 투명하고 공정하게 본 약정을 이행합니다.\\n제6조 (개인 배정 라이선스) 플랫폼이 회원에게 배정한 고유 알고리즘 추천번호는 회원 본인의 직접 구매 목적에 한해 일신전속적으로 부여된 개인 라이선스입니다.\\n제7조 (당첨 정산 시 본인 일치 확인 KYC) 투명한 세무 처리를 위해 당첨금 정산 시 [앱 가입자 명의]와 [동행복권 실물 당첨금 수령자(신분증)]가 동일인임을 상호 확인합니다.',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_weekly',
            title: '[필수 2] 주간 5게임 실구매 인증 혜택(통계 분산 팩 무료) 및 복권 100% 개별 소유권 정책',
            fullContent: '제1조 (실구매 인증 혜택) 회원은 매주 추천받은 번호 중 최소 5게임 이상을 본인 명의와 비용으로 동행복권 공식 판매처에서 직접 구매하고 영수증 QR코드를 시스템에 등록할 수 있습니다. 당해 회차 실구매를 인증한 회원에게는 통계 분산 커버리지 모델, 기댓값(EV) 가중 모델 등 추가 5개 퀀트 팩(50게임) 및 시뮬레이션 연구소 무료 이용 혜택이 즉시 활성화됩니다.\\n제2조 (구매대행 부인 및 개별 단독 소유) 본 서비스는 복권 구매대행이나 공동구매 펀드가 아니며, 회원이 직접 구매하여 등록한 실물 복권의 당첨금 소유권은 해당 회원 본인에게 100% 단독 귀속됩니다.',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_privacy',
            title: '[필수 3] 개인정보 수집·이용, 카카오톡 알림 발송 및 전자계약 문서 안전 보존 동의',
            fullContent: '1. 수집 항목: 아이디, 성명(실명), 휴대폰번호, 자필 전자서명 이미지, 접속 기기 식별정보, 카카오 계정 고유 식별자 및 카카오톡 메시지 전송 권한 토큰\\n2. 수집 및 이용 목적:\\n  - 1인 1계정 본인확인 및 중복가입 방지\\n  - 성과연동 기술료 세무 정산 및 전자계약 체결·법적 보존\\n  - 회원의 주간 실구매 복권 당첨 채점 리포트, AI 퀀트 분석 추천 정보 및 서비스 중요 공지사항의 스마트폰 카카오톡(나와의 채팅) 자동 발송 알림 제공\\n3. 카카오톡 알림 수신 및 철회: 본 서비스는 회원이 등록한 복권의 당첨 채점 결과 및 맞춤형 분석 정보를 회원의 스마트폰 카카오톡 [나와의 채팅]으로 자동 발송하며, 회원은 언제든지 카카오계정 설정 또는 서비스 내 동의 설정을 통해 알림 수신 동의를 철회할 수 있습니다.\\n4. 제3자 제공 금지: 수집된 개인정보 및 전자서명 데이터는 상업적 마케팅 목적으로 제3자에게 일체 제공되거나 판매되지 않습니다.\\n5. 보유 및 보존 기간: 회원 탈퇴 시까지 (단, 전자서약서 및 정산 증빙 문서는 전자문서법 및 전자서명법에 따라 5년간 법적 아카이브로 안전 암호화 보존 후 영구 파기)',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_algo',
            title: '[필수 4] 복권 퀀트 알고리즘 정보 성격, 자기책임 원칙 및 비제휴 독립 소프트웨어 고지',
            fullContent: '1. 독립 확률 및 당첨 미보장 고지: 로또 6/45 복권 추첨은 매회 독립된 무작위 추출에 의해 결정되는 우연적 사행게임이며, 어떠한 알고리즘이나 통계 분석으로도 미래 당첨을 100% 확정하거나 원금을 보장할 수 없습니다. 본 서비스의 추천번호는 과거 통계 빅데이터에 기반한 학술적·수학적 분석 참고 정보입니다.\\n2. 자기책임 원칙: 복권 구매에 대한 모든 최종 판단과 경제적 손익 책임은 회원 본인에게 있으며, 과도한 몰입을 지양하고 소액 건전 구매 문화를 준수하여야 합니다.\\n3. 비제휴 독립 소프트웨어 고지: 본 플랫폼은 복권 수탁사업자인 동행복권(주) 및 정부 기관과 어떠한 지분이나 제휴 관계도 없는 독립된 민간 데이터 분석 응용 소프트웨어입니다.\\n4. 선불 유료 결제 및 유사수신 부인: 본 서비스는 선불 유료 회원권, VIP 유료 가입비, 원금 보장형 환불 상품 등 일체의 유사수신 유료 상품을 운영하지 않습니다.\\n5. 서비스 운영 주체: 본 서비스는 정식 등록 사업자인 「해피크레딧」(대표: 박재구 | 사업자등록번호: 322-51-00561 | 서울특별시 강남구 봉은사로1길 6, 5층 5159호 | 종목: 응용 소프트웨어 개발 및 공급업)에 의해 소프트웨어 기술 용역으로 운영되며 관련 법령을 엄격히 준수합니다.',
            isAgreed: true,
            agreedAt: agreedAt
        }
    ];
}

// ========================================================
// 5. Secure Immediate Login Handler (Exported at Top Level)
// ========================================================
export async function handleLoginSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
        e.stopPropagation();
    }
    
    const idEl = document.getElementById('loginId');
    const pwEl = document.getElementById('loginPw');
    const loginError = document.getElementById('loginError');
    const loginForm = document.getElementById('loginForm');
    const submitBtn = (loginForm ? loginForm.querySelector('button[type="submit"]') : null) || document.getElementById('btnLoginSubmit');
    const origBtnText = submitBtn ? submitBtn.innerHTML : '시스템 접속';

    const rawId = idEl ? idEl.value.trim() : '';
    const idLower = rawId.toLowerCase();
    const pw = pwEl ? pwEl.value.trim() : '';

    if (loginError) loginError.style.display = 'none';

    // ✅ Immediately unlock UI on auth success
    function unlockUIImmediately(authId, welcomeMsg) {
        window.__appUnlocked = true;
        SafeAuth.set(authId);

        // 1. Immediately hide login modal
        const modal = document.getElementById('loginModalOverlay');
        if (modal) {
            modal.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;');
            modal.classList.add('hidden');
            modal.classList.remove('active');
        }

        // 2. Show landing page immediately
        const pages = [
            { id: 'landingPage', display: 'flex' },
            { id: 'appContainer', display: 'flex' },
            { id: 'totoPage', display: 'block' }
        ];
        pages.forEach(function(p) {
            const el = document.getElementById(p.id);
            if (!el) return;
            if (p.id === 'landingPage') {
                el.classList.add('active');
                el.style.setProperty('display', p.display, 'important');
            } else {
                el.classList.remove('active');
                el.style.setProperty('display', 'none', 'important');
            }
        });

        // 3. Configure Admin UI immediately if admin
        const isAdm = (authId && (authId.toLowerCase() === 'master' || authId.toLowerCase() === 'admin')) || (typeof isAdminUser === 'function' && isAdminUser(authId));
        if (isAdm) {
            document.body.classList.add('is-admin');
            const btnUserManagement = document.getElementById('btnUserManagement');
            if (btnUserManagement) btnUserManagement.style.setProperty('display', 'inline-flex', 'important');
            const btnUserManagementApp = document.getElementById('btnUserManagementApp');
            if (btnUserManagementApp) btnUserManagementApp.style.setProperty('display', 'inline-flex', 'important');
            const btnUserManagementToto = document.getElementById('btnUserManagementToto');
            if (btnUserManagementToto) btnUserManagementToto.style.setProperty('display', 'inline-flex', 'important');
            const btnFetchLatestDraw = document.getElementById('btnFetchLatestDraw');
            if (btnFetchLatestDraw) btnFetchLatestDraw.style.display = 'inline-flex';
        }

        // 4. Toast welcome message
        if (welcomeMsg) {
            setTimeout(function() { try { showToast(welcomeMsg); } catch(ex) {} }, 80);
        }

        // 5. Initialize services (non-blocking, background)
        setTimeout(function() {
            try {
                if (typeof window.initLottoService === 'function') window.initLottoService(true);
            } catch(ex) {}
            try {
                if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
            } catch(ex) {}
            checkAuthOnLoad(window.initLottoService).catch(function(err) {
                console.warn('[Background auth check error]', err);
            });
        }, 150);
    }

    // 1. Instant Master/Admin bypass
    if ((idLower === 'master' && (pw === '0338' || pw === '')) || 
        (idLower === 'admin' && pw === '0338') ||
        (rawId === '' && pw === '0338')) {
        unlockUIImmediately('master', '🔑 마스터 계정으로 접속했습니다.');
        return false;
    }

    if (!rawId || !pw) {
        if (loginError) { loginError.textContent = '아이디와 비밀번호를 모두 입력해주세요.'; loginError.style.display = 'block'; }
        return false;
    }

    // 2. Firestore Authentication
    const firestore = (typeof window !== 'undefined' && window.rawFirestore) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null) || window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
    if (!firestore) {
        if (loginError) {
            loginError.textContent = "데이터베이스에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.";
            loginError.style.display = 'block';
        }
        return false;
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 보안 인증 확인 중...';
        }

        const docRef = firestore.collection('lotto_users').doc(rawId);
        const userDoc = await docRef.get();

        if (!userDoc.exists) {
            if (loginError) { loginError.textContent = "아이디 또는 비밀번호가 일치하지 않습니다."; loginError.style.display = 'block'; }
            return false;
        }

        const data = userDoc.data();

        // Check Deletion / Trash Status
        if (data.isDeleted === true || data.status === 'trash') {
            if (loginError) { 
                loginError.textContent = `🚫 삭제(휴지통) 처리된 계정입니다.\\n관리자에게 문의하여 계정 복구를 요청하세요.`; 
                loginError.style.display = 'block'; 
            }
            return false;
        }

        // Check Account Suspension Status
        if (data.status === 'suspended') {
            if (loginError) { 
                loginError.textContent = `🚫 관리자에 의해 이용 정지된 계정입니다.\\n(사유: ${data.suspensionReason || '관리자 수동 이용정지'})`; 
                loginError.style.display = 'block'; 
            }
            return false;
        }
        if (data.status === 'suspended_nopurchase') {
            if (loginError) { 
                loginError.textContent = `⚠️ 주간 실구매 미등록으로 인해 자동 이용 정지된 계정입니다.\\n(사유: ${data.suspensionReason || '실구매 미등록'})\\n관리자에게 문의하여 이용 정지를 해제하세요.`; 
                loginError.style.display = 'block'; 
            }
            return false;
        }

        // Check Lockout
        if (data.lockoutUntil && new Date(data.lockoutUntil) > new Date()) {
            const remainMins = Math.ceil((new Date(data.lockoutUntil) - new Date()) / 60000);
            if (loginError) {
                loginError.textContent = `연속 로그인 실패로 계정이 일시 잠금되었습니다. (${remainMins}분 후 재시도 가능)`;
                loginError.style.display = 'block';
            }
            return false;
        }

        // Hash & Verify Password
        const computedHash = await hashPassword(pw, rawId);
        const isHashMatch = data.passwordHash && data.passwordHash === computedHash;
        const isLegacyMatch = !data.passwordHash && data.password === pw;

        if (isHashMatch || isLegacyMatch) {
            const isPerm = !!(data.isAdmin === true || data.role === 'admin' || data.isPermanent === true || data.isPermanent === 'true' || data.userType === 'permanent');
            const isAdm = !!(data.isAdmin === true || data.role === 'admin' || rawId.toLowerCase() === 'master' || rawId.toLowerCase() === 'admin');
            setIsPermanentCache(rawId, isPerm);
            setIsAdminCache(rawId, isAdm);

            const updatePayload = {
                loginFailCount: 0,
                lockoutUntil: null,
                lastLoginAt: new Date().toISOString()
            };

            if (isLegacyMatch) {
                updatePayload.passwordHash = computedHash;
            }

            await docRef.update(updatePayload);
            unlockUIImmediately(rawId, `👋 ${data.realName || rawId}님 환영합니다!`);
        } else {
            const failCount = (data.loginFailCount || 0) + 1;
            const updatePayload = { loginFailCount: failCount };

            if (failCount >= 5) {
                updatePayload.lockoutUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
                if (loginError) {
                    loginError.textContent = "비밀번호 5회 연속 불일치로 5분간 계정이 일시 잠금되었습니다.";
                    loginError.style.display = 'block';
                }
            } else {
                if (loginError) {
                    loginError.textContent = `아이디 또는 비밀번호가 일치하지 않습니다. (실패: ${failCount}/5회)`;
                    loginError.style.display = 'block';
                }
            }
            await docRef.update(updatePayload);
        }

    } catch (error) {
        console.error('[Auth Error]', error);
        if (loginError) {
            loginError.textContent = "인증 처리 중 오류가 발생했습니다.";
            loginError.style.display = 'block';
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnText;
        }
    }
    return false;
}

// ========================================================
// 6. Auth Lifecycle & Onboarding Router (checkAuthOnLoad)
// ========================================================
export async function checkAuthOnLoad(initFirebaseAndData) {
    updateDebugMonitor({});
    const authId = SafeAuth.get();
    const loginModal = document.getElementById('loginModalOverlay');
    const appContainer = document.getElementById('appContainer');
    const landingPage = document.getElementById('landingPage');
    const btnUserManagement = document.getElementById('btnUserManagement');
    const btnUserManagementApp = document.getElementById('btnUserManagementApp');
    const btnUserManagementToto = document.getElementById('btnUserManagementToto');
    const btnFetchLatestDraw = document.getElementById('btnFetchLatestDraw');
    const btnOpenManualDrawModal = document.getElementById('btnOpenManualDrawModal');

    function _showPage(targetId) {
        const pages = [
            { id: 'landingPage', display: 'flex' },
            { id: 'totoPage',    display: 'block' },
            { id: 'appContainer', display: 'flex' }
        ];
        pages.forEach(function(p) {
            const el = document.getElementById(p.id);
            if (!el) return;
            if (p.id === targetId) {
                el.classList.add('active');
                el.style.setProperty('display', p.display, 'important');
            } else {
                el.classList.remove('active');
                el.style.setProperty('display', 'none', 'important');
            }
        });
    }

    if (btnFetchLatestDraw) btnFetchLatestDraw.style.display = 'inline-flex';

    if (authId) {
        window.__appUnlocked = true;
        let isUserAdmin = isAdminUser(authId);

        const firestore = (typeof window !== 'undefined' && window.rawFirestore) || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null) || window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);

        if (firestore) {
            try {
                const userDoc = await firestore.collection('lotto_users').doc(authId).get();
                if (userDoc.exists) {
                    const uData = userDoc.data();
                    if (uData.isAdmin === true || uData.role === 'admin') {
                        isUserAdmin = true;
                        setIsAdminCache(authId, true);
                    }
                    const isPerm = isUserAdmin || !!(uData.isPermanent === true || uData.userType === 'permanent');
                    setIsPermanentCache(authId, isPerm);
                    if (uData.realName) {
                        setUserNameCache(authId, uData.realName);
                    }
                    if (uData.createdAt || (uData.agreementDoc && uData.agreementDoc.createdAt)) {
                        setUserCreatedCache(authId, uData.createdAt || uData.agreementDoc.createdAt);
                    }
                    setUserPermissionsCache(authId, {
                        allowLotto: isUserAdmin || uData.allowLotto !== false,
                        allowToto: isUserAdmin || uData.allowToto !== false
                    });

                    if (!isUserAdmin) {
                        if (uData.status === 'suspended') {
                            SafeAuth.clear();
                            alert(`⚠️ [계정 이용 정지]\\n\\n사유: ${uData.suspensionReason || '관리자에 의해 이용 정지된 계정입니다.'}\\n\\n관리자에게 문의해주세요.`);
                            location.reload();
                            return;
                        }
                    }
                }
            } catch(e) {
                console.error('[Active User Verification Error]', e);
            }
        }

        if (loginModal) {
            loginModal.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;');
            loginModal.classList.add('hidden');
            loginModal.classList.remove('active');
        }

        const totoPage = document.getElementById('totoPage');
        const isTotoActive = totoPage && (totoPage.style.display === 'block' || totoPage.classList.contains('active'));
        const isLottoActive = appContainer && appContainer.classList.contains('active') && (!landingPage || !landingPage.classList.contains('active'));

        const userPerms = getUserPermissions(authId);
        if (isTotoActive && userPerms.allowToto) {
            _showPage('totoPage');
        } else if (isLottoActive && userPerms.allowLotto) {
            _showPage('appContainer');
        } else {
            _showPage('landingPage');
        }

        if (isUserAdmin) {
            document.body.classList.add('is-admin');
            if (btnUserManagement) btnUserManagement.style.setProperty('display', 'inline-flex', 'important');
            if (btnUserManagementApp) btnUserManagementApp.style.setProperty('display', 'inline-flex', 'important');
            if (btnUserManagementToto) btnUserManagementToto.style.setProperty('display', 'inline-flex', 'important');
            if (btnFetchLatestDraw) btnFetchLatestDraw.style.display = 'inline-flex';
            if (btnOpenManualDrawModal) btnOpenManualDrawModal.style.display = 'inline-block';
        } else {
            document.body.classList.remove('is-admin');
            if (btnUserManagement) btnUserManagement.style.setProperty('display', 'none', 'important');
            if (btnUserManagementApp) btnUserManagementApp.style.setProperty('display', 'none', 'important');
            if (btnUserManagementToto) btnUserManagementToto.style.setProperty('display', 'none', 'important');
            if (btnOpenManualDrawModal) btnOpenManualDrawModal.style.display = 'none';
        }

        if (typeof initFirebaseAndData === 'function') {
            try {
                initFirebaseAndData();
            } catch (err) {
                console.error('[AUTH] Error during service init (non-blocking):', err);
            }
        }

        if (typeof window.renderLandingDashboard === 'function') {
            try { window.renderLandingDashboard(); } catch(e) {}
        }
    } else {
        if (!window.__appUnlocked && loginModal) {
            loginModal.removeAttribute('style');
            loginModal.style.cssText = 'display: flex !important; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(7, 10, 20, 0.95); z-index: 99999; padding: 16px; box-sizing: border-box;';
            loginModal.classList.remove('hidden');
            loginModal.classList.add('active');
        }
    }
}

// ========================================================
// 7. Setup Auth Form Events & DOM Bindings
// ========================================================

// ========================================================
// 🎰 [실구매 당첨 채점 & 카카오톡 맞춤형 리포트 발송 엔진]
// ========================================================

/**
 * 조합 객체/배열에서 정수 번호 6개 추출
 */
export function extractNumbersFromCombo(c) {
    if (!c) return [];
    if (Array.isArray(c)) {
        return c.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45).sort((a,b)=>a-b);
    }
    if (c && Array.isArray(c.numbers)) {
        return c.numbers.map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45).sort((a,b)=>a-b);
    }
    if (typeof c === 'string') {
        return c.split(/[,\s]+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45).sort((a,b)=>a-b);
    }
    return [];
}

/**
 * 특정 회차의 공식 당첨 번호 및 당첨금 정보 조회
 */
export function getDrawWinningNumbers(round) {
    if (!round) return null;
    const rNum = Number(round);
    try {
        if (typeof window !== 'undefined') {
            if (window.state && window.state.mergedHistory && window.state.mergedHistory[rNum]) {
                const d = window.state.mergedHistory[rNum];
                const rawNums = (d.numbers && d.numbers.length >= 6) ? d.numbers : [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6];
                return {
                    round: rNum,
                    numbers: rawNums.map(Number).filter(n => !isNaN(n) && n > 0).sort((a,b)=>a-b),
                    bonus: Number(d.bonus || d.bnusNo || 0),
                    date: d.drawDate || d.drwNoDate || '',
                    firstWinamnt: d.firstWinamnt || d.rank1Prize || 2000000000,
                    prizes: d.prizes || d.prizeInfo || null
                };
            }
            if (typeof LOTTO_HISTORY !== 'undefined' && LOTTO_HISTORY[rNum]) {
                const d = LOTTO_HISTORY[rNum];
                const rawNums = (d.numbers && d.numbers.length >= 6) ? d.numbers : [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6];
                return {
                    round: rNum,
                    numbers: rawNums.map(Number).filter(n => !isNaN(n) && n > 0).sort((a,b)=>a-b),
                    bonus: Number(d.bonus || d.bnusNo || 0),
                    date: d.drawDate || d.drwNoDate || '',
                    firstWinamnt: d.firstWinamnt || d.rank1Prize || 2000000000,
                    prizes: d.prizes || d.prizeInfo || null
                };
            }
            if (window.state && window.state.latestDrawData && Number(window.state.latestDrawData.drwNo) === rNum) {
                const d = window.state.latestDrawData;
                const rawNums = (d.numbers && d.numbers.length >= 6) ? d.numbers : [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6];
                return {
                    round: rNum,
                    numbers: rawNums.map(Number).filter(n => !isNaN(n) && n > 0).sort((a,b)=>a-b),
                    bonus: Number(d.bonus || d.bnusNo || 0),
                    date: d.drawDate || d.drwNoDate || '',
                    firstWinamnt: d.firstWinamnt || d.rank1Prize || 2000000000,
                    prizes: d.prizes || d.prizeInfo || null
                };
            }
        }
    } catch(e) {
        console.warn('[getDrawWinningNumbers Error]', e);
    }
    return null;
}

/**
 * 특정 사용자의 특정 회차 실구매 데이터 채점
 */
export async function scoreUserRoundPurchases(userId, round, userLedgerData = null) {
    const rNum = Number(round);
    let ledger = userLedgerData;

    if (!ledger && window.db) {
        try {
            const pDoc = await window.db.collection('lotto_purchases').doc(userId).get();
            if (pDoc.exists && pDoc.data().ledger) {
                ledger = pDoc.data().ledger;
            }
        } catch(e) {
            console.error('[Score User Fetch Error]', e);
        }
    }

    const receipts = (ledger && ledger[rNum]) || [];
    const flatCombos = [];
    receipts.forEach(r => {
        if (r && Array.isArray(r.combos)) {
            r.combos.forEach(c => flatCombos.push(c));
        } else if (r && (Array.isArray(r.numbers) || Array.isArray(r))) {
            flatCombos.push(r);
        }
    });

    const draw = getDrawWinningNumbers(rNum);
    if (!draw || !draw.numbers || draw.numbers.length < 6) {
        return {
            userId,
            round: rNum,
            hasDraw: false,
            gameCount: flatCombos.length,
            totalPrize: 0,
            hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, miss: flatCombos.length },
            hasWon: false,
            hasHighRank: false,
            scoredCombos: []
        };
    }

    const winningSet = new Set(draw.numbers);
    const bonus = draw.bonus;
    const p1 = draw.firstWinamnt || 2000000000;
    const p2 = (draw.prizes && draw.prizes[2] ? draw.prizes[2].prize : 50000000);
    const p3 = (draw.prizes && draw.prizes[3] ? draw.prizes[3].prize : 1500000);
    const p4 = (draw.prizes && draw.prizes[4] ? draw.prizes[4].prize : 50000);
    const p5 = (draw.prizes && draw.prizes[5] ? draw.prizes[5].prize : 5000);

    const hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, miss: 0 };
    let totalPrize = 0;
    const scoredCombos = [];

    flatCombos.forEach((c, idx) => {
        const nums = extractNumbersFromCombo(c);
        if (nums.length !== 6) return;

        const matches = nums.filter(n => winningSet.has(n));
        const hasBonus = (bonus > 0) && nums.includes(bonus);
        let rank = 0;
        let prize = 0;

        if (matches.length === 6) { rank = 1; prize = p1; hits[1]++; }
        else if (matches.length === 5 && hasBonus) { rank = 2; prize = p2; hits[2]++; }
        else if (matches.length === 5) { rank = 3; prize = p3; hits[3]++; }
        else if (matches.length === 4) { rank = 4; prize = p4; hits[4]++; }
        else if (matches.length === 3) { rank = 5; prize = p5; hits[5]++; }
        else { hits.miss++; }

        if (rank > 0) totalPrize += prize;

        scoredCombos.push({
            slot: String.fromCharCode(65 + (idx % 26)),
            nums,
            matches,
            hasBonus,
            rank,
            prize
        });
    });

    const hasWon = (hits[1] + hits[2] + hits[3] + hits[4] + hits[5]) > 0;
    const hasHighRank = (hits[1] + hits[2] + hits[3]) > 0;

    return {
        userId,
        round: rNum,
        hasDraw: true,
        drawNumbers: draw.numbers,
        bonus: draw.bonus,
        drawDate: draw.date,
        gameCount: flatCombos.length,
        totalPrize,
        hits,
        hasWon,
        hasHighRank,
        scoredCombos
    };
}

/**
 * 사용자의 가입 후 미전송 당첨 회차 목록 탐색 (오직 본인의 실구매 당첨 회차만)
 */
export async function getUnsentWinningRoundsForUser(userId, userData = null, userLedgerData = null) {
    if (!userId || !window.db) return [];

    let uData = userData;
    if (!uData) {
        try {
            const uDoc = await window.db.collection('lotto_users').doc(userId).get();
            if (uDoc.exists) uData = uDoc.data();
        } catch(e){}
    }
    const sentReports = (uData && uData.sentReports) || {};

    let ledger = userLedgerData;
    if (!ledger) {
        try {
            const pDoc = await window.db.collection('lotto_purchases').doc(userId).get();
            if (pDoc.exists && pDoc.data().ledger) ledger = pDoc.data().ledger;
        } catch(e){}
    }
    if (!ledger) return [];

    const purchasedRounds = Object.keys(ledger).map(Number).filter(r => !isNaN(r) && Array.isArray(ledger[r]) && ledger[r].length > 0).sort((a,b)=>b-a);
    const unsentWinning = [];

    for (const r of purchasedRounds) {
        const report = sentReports[r];
        if (report === true || (report && (report.status === 'success' || report.status === 'delivered'))) {
            continue; // Already sent/delivered
        }
        const score = await scoreUserRoundPurchases(userId, r, ledger);
        if (score.hasDraw && score.hasWon) {
            unsentWinning.push(score);
        }
    }

    return unsentWinning;
}

/**
 * 단일 회차 실구매 당첨 채점 카카오톡 템플릿 생성
 */
export async function buildUserWinningReportTemplate(userId, targetRound, userScoreData = null, userData = null) {
    let score = userScoreData;
    if (!score) {
        score = await scoreUserRoundPurchases(userId, targetRound);
    }

    let uData = userData;
    if (!uData && window.db) {
        try {
            const uDoc = await window.db.collection('lotto_users').doc(userId).get();
            if (uDoc.exists) uData = uDoc.data();
        } catch(e){}
    }

    const realName = (uData && uData.realName) || getUserRealName(userId) || userId;
    const rNum = targetRound;

    if (!score || !score.hasDraw) {
        return {
            title: `[운도실력] 제 ${rNum}회차 추첨 대기 중`,
            description: `${realName}님, 제 ${rNum}회차 당첨 번호 발표 후 자동으로 실구매 채점 결과가 통지됩니다.`,
            totalPrize: 0,
            hasWon: false
        };
    }

    if (!score.hasWon) {
        return {
            title: `[운도실력] 제 ${rNum}회차 실구매 채점 결과`,
            description: `${realName}님, 제 ${rNum}회차 실구매 ${score.gameCount}게임 채점 결과 아쉽게도 낙첨되었습니다. 다음 회차의 1등을 기원합니다!`,
            totalPrize: 0,
            hasWon: false
        };
    }

    const hitLines = [];
    if (score.hits[1] > 0) hitLines.push(`🥇 1등: ${score.hits[1]}게임`);
    if (score.hits[2] > 0) hitLines.push(`🥈 2등: ${score.hits[2]}게임`);
    if (score.hits[3] > 0) hitLines.push(`🥉 3등: ${score.hits[3]}게임`);
    if (score.hits[4] > 0) hitLines.push(`4등(5만원): ${score.hits[4]}게임`);
    if (score.hits[5] > 0) hitLines.push(`5등(5천원): ${score.hits[5]}게임`);

    const prizeFormatted = score.totalPrize.toLocaleString('ko-KR');

    return {
        title: `🎉 [운도실력] 제 ${rNum}회차 실구매 당첨 축하드립니다!`,
        description: `${realName}님의 실구매 ${score.gameCount}게임 중 [${hitLines.join(', ')}] 당첨!\n총 당첨금: ${prizeFormatted}원`,
        totalPrize: score.totalPrize,
        hasWon: true,
        hits: score.hits,
        realName
    };
}


// ========================================================
// 💬 Kakao 1-Sec Instant Login & Messaging Controller
// ========================================================
export const KAKAO_JS_KEY = 'c40e8adc700a6f1c1e62b6aa3fa0c60a';

export function initKakaoSdk() {
    if (typeof window !== 'undefined' && window.Kakao) {
        try {
            if (!window.Kakao.isInitialized()) {
                window.Kakao.init(KAKAO_JS_KEY);
                console.log('[Kakao SDK Initialized]');
            }
        } catch (e) {
            console.warn('[Kakao Init Handled]', e);
        }
    }
}

if (typeof window !== 'undefined') {
    initKakaoSdk();
    window.initKakaoSdk = initKakaoSdk;
}

export function loginWithKakao() {
    initKakaoSdk();

    if (!window.Kakao) {
        alert('⚠️ 카카오 SDK를 불러오는 중입니다. 1~2초 후 다시 눌러주세요.');
        return;
    }

    if (!window.Kakao.isInitialized()) {
        try {
            window.Kakao.init(KAKAO_JS_KEY);
        } catch (err) {
            alert('⚠️ 카카오 초기화 실패: ' + err.message);
            return;
        }
    }

    showToast('💬 카카오 로그인을 연결 중입니다...');

    // 1. Mobile & Desktop Hybrid Login
    try {
        if (window.Kakao.Auth && typeof window.Kakao.Auth.login === 'function') {
            window.Kakao.Auth.login({
                scope: 'profile_nickname,profile_image,talk_message',
                throughTalk: true,
                persistAccessToken: true,
                success: function(authObj) {
                    window.Kakao.API.request({
                        url: '/v2/user/me',
                        success: async function(res) {
                            try {
                                const kakaoId = String(res.id);
                                const profile = res.kakao_account?.profile || {};
                                const nickname = profile.nickname || `카카오_${kakaoId.slice(-4)}`;
                                const customUserId = `kakao_${kakaoId}`;

                                const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
                                if (!firestore) {
                                    alert('데이터베이스에 연결되지 않았습니다.');
                                    return;
                                }

                                // 🔑 Kakao Token & Scope Data for Server/Offline Messaging
                                const kakaoAuthData = {
                                    accessToken: authObj.access_token || '',
                                    refreshToken: authObj.refresh_token || '',
                                    expiresIn: authObj.expires_in || 0,
                                    refreshTokenExpiresIn: authObj.refresh_token_expires_in || 0,
                                    scopes: authObj.scope ? authObj.scope.split(' ') : [],
                                    hasTalkMessageScope: authObj.scope ? authObj.scope.includes('talk_message') : false,
                                    updatedAt: new Date().toISOString()
                                };

                                // Check if user already exists
                                const userDoc = await firestore.collection('lotto_users').doc(customUserId).get();

                                if (!userDoc.exists) {
                                    // New Kakao User -> Auto register with single unified agreement
                                    const now = new Date();
                                    const formattedDate = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일 ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

                                    const agreementDocument = {
                                        docId: `AGR-${customUserId}-${Date.now()}`,
                                        documentTitle: '로또 AI 퀀트 서비스 이용 및 성공수수료 전자 서약서 (카카오 간편 본인인증)',
                                        userId: customUserId,
                                        realName: nickname,
                                        phoneNumber: '카카오 1초 본인인증',
                                        createdAt: now.toISOString(),
                                        agreedDateFormatted: formattedDate,
                                        userAgent: navigator.userAgent,
                                        authProvider: 'kakao',
                                        terms: getStandardAgreementTerms(now),
                                        signatureDataUrl: null,
                                        legalPledgeStatement: '카카오 간편 본인인증을 통해 위 모든 약관의 전문 내용을 확인하였으며 본 전자 계약을 체결합니다.',
                                        status: 'legally_binding'
                                    };

                                    const userData = {
                                        userId: customUserId,
                                        phoneNumber: '카카오 1초 본인인증',
                                        realName: nickname,
                                        authProvider: 'kakao',
                                        kakaoId: kakaoId,
                                        profileImage: profile.profile_image_url || '',
                                        status: 'active',
                                        createdAt: now.toISOString(),
                                        agreementDoc: agreementDocument,
                                        kakaoAuth: kakaoAuthData,
                                        agreedTerms: {
                                            feeAgreement: true,
                                            weeklyPurchaseAgreement: true,
                                            privacyAgreement: true,
                                            algoDisclaimer: true,
                                            agreedAt: now.toISOString(),
                                            authProvider: 'kakao'
                                        },
                                        loginFailCount: 0,
                                        lockoutUntil: null
                                    };

                                    await firestore.collection('lotto_users').doc(customUserId).set(userData);
                                    try { await firestore.collection('lotto_agreements').doc(customUserId).set(agreementDocument); } catch(e){}

                                    showToast(`🎉 [${nickname}]님 환영합니다! 카카오 간편 회원가입이 완료되었습니다.`);
                                } else {
                                    // Existing Kakao User -> Update tokens and auth info
                                    await firestore.collection('lotto_users').doc(customUserId).set({
                                        kakaoAuth: kakaoAuthData,
                                        lastLoginAt: new Date().toISOString()
                                    }, { merge: true });

                                    showToast(`👋 [${nickname}]님, 카카오 간편 로그인되었습니다!`);
                                }

                                // Update local session
                                SafeAuth.set(customUserId);
                                window.__currentUser = {
                                    userId: customUserId,
                                    realName: nickname,
                                    role: 'user',
                                    authProvider: 'kakao'
                                };

                                // Hide Login Modal
                                const modal = document.getElementById('loginModalOverlay');
                                if (modal) {
                                    modal.style.setProperty('display', 'none', 'important');
                                    modal.classList.remove('active');
                                }

                                // Show Landing Page by default
                                const kakaoLpEl = document.getElementById('landingPage');
                                const kakaoAcEl = document.getElementById('appContainer');
                                const kakaoTpEl = document.getElementById('totoPage');
                                if (kakaoLpEl) { kakaoLpEl.classList.add('active'); kakaoLpEl.style.setProperty('display', 'flex', 'important'); }
                                if (kakaoAcEl) { kakaoAcEl.classList.remove('active'); kakaoAcEl.style.setProperty('display', 'none', 'important'); }
                                if (kakaoTpEl) { kakaoTpEl.classList.remove('active'); kakaoTpEl.style.setProperty('display', 'none', 'important'); }

                                setTimeout(function() {
                                    try { if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard(); } catch(ex) {}
                                    if (typeof window.checkAuthOnLoad === 'function') {
                                        window.checkAuthOnLoad().catch(function(err) { console.warn('[BG auth check]', err); });
                                    }
                                    // 🔔 Check if talk_message is agreed; if not, show dedicated in-app consent modal!
                                    if (typeof window.checkAndPromptKakaoScope === 'function') {
                                        window.checkAndPromptKakaoScope('talk_message');
                                    }
                                }, 300);

                            } catch(dbErr) {
                                console.error('[Kakao DB Sync Error]', dbErr);
                                alert('카카오 로그인 처리 중 오류가 발생했습니다: ' + dbErr.message);
                            }
                        },
                        fail: function(error) {
                            console.error('[Kakao API Error]', error);
                            alert('카카오 사용자 정보를 가져오는 데 실패했습니다: ' + JSON.stringify(error));
                        }
                    });
                },
                fail: function(err) {
                    console.error('[Kakao Auth Error]', err);
                    const errStr = JSON.stringify(err || {});
                    if (errStr.includes('KOE006') || errStr.includes('domain') || errStr.includes('Platform')) {
                        alert('⚠️ [카카오 도메인 미등록 안내]\n\n카카오 디벨로퍼스(developers.kakao.com)의\n[플랫폼] > [Web]에 현재 접속 중인 사이트 주소(' + window.location.origin + ')를 등록해 주세요!');
                    } else if (errStr.includes('window') || errStr.includes('closed') || errStr.includes('popup')) {
                        alert('⚠️ 팝업창이 닫혔거나 차단되었습니다. 브라우저의 팝업 차단을 해제하고 다시 시도해 주세요.');
                    } else {
                        alert('⚠️ 카카오 로그인 안내: ' + (err.error_description || err.error || errStr));
                    }
                }
            });
        } else if (window.Kakao.Auth && typeof window.Kakao.Auth.authorize === 'function') {
            const redirectUri = window.location.origin + window.location.pathname;
            window.Kakao.Auth.authorize({
                redirectUri: redirectUri,
                scope: 'profile_nickname,profile_image,talk_message'
            });
        } else {
            alert('⚠️ 카카오 SDK 로딩 실패: 잠시 후 다시 시도해 주세요.');
        }
    } catch (execErr) {
        console.error('[Kakao Exec Error]', execErr);
        alert('카카오 로그인 실행 오류: ' + execErr.message);
    }
}

export function showKakaoMessageConsentModal(callback) {
    let modal = document.getElementById('kakaoMessageConsentModal');
    if (modal) {
        modal.style.display = 'flex';
        return;
    }

    modal = document.createElement('div');
    modal.id = 'kakaoMessageConsentModal';
    modal.className = 'modal-overlay';
    modal.style.cssText = 'display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(7, 10, 20, 0.88); z-index: 999999; padding: 16px; box-sizing: border-box; backdrop-filter: blur(8px);';
    modal.innerHTML = `
        <div style="background: linear-gradient(145deg, #0f172a, #1e293b); border: 2px solid #fee500; border-radius: 20px; max-width: 440px; width: 100%; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); text-align: center; color: #f8fafc; font-family: 'Noto Sans KR', sans-serif;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: #fee500; color: #191919; font-size: 1.8rem; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px auto; box-shadow: 0 4px 16px rgba(254, 229, 0, 0.4);">
                <i class="fa-solid fa-bell"></i>
            </div>
            <h3 style="font-size: 1.2rem; font-weight: 800; margin: 0 0 8px 0; color: #ffffff;">
                스마트폰 카카오톡 알림 받기
            </h3>
            <p style="font-size: 0.85rem; color: #cbd5e1; line-height: 1.55; margin: 0 0 16px 0; word-break: keep-all;">
                로또 당첨 발표 및 토토/프로토 AI 추천 번호를 스마트폰 <strong style="color: #fee500;">카카오톡(나와의 채팅방)</strong>으로 편리하게 받아보시려면 메시지 전송 권한 동의가 필요합니다.
            </p>
            <div style="background: rgba(254, 229, 0, 0.08); border: 1px dashed rgba(254, 229, 0, 0.35); border-radius: 12px; padding: 12px; margin-bottom: 18px; text-align: left; font-size: 0.78rem; color: #fde047; line-height: 1.5;">
                <div style="font-weight: 700; margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i> 수신 혜택 안내:</div>
                • 매주 로또 당첨 발표 시 자동 채점 리포트 발송<br>
                • 축구토토 14경기 승무패 AI 마킹표 발송<br>
                • 비용 0원 무료 (언제든 설정에서 해제 가능)
            </div>
            <div style="display: flex; gap: 10px;">
                <button type="button" id="btnCancelKakaoConsent" style="flex: 1; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #94a3b8; font-weight: 700; font-size: 0.88rem; cursor: pointer;">
                    다음에 하기
                </button>
                <button type="button" id="btnAcceptKakaoConsent" style="flex: 1.6; padding: 12px; border-radius: 10px; background: #fee500; border: none; color: #191919; font-weight: 800; font-size: 0.92rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 14px rgba(254, 229, 0, 0.35);">
                    <i class="fa-solid fa-check"></i> 지금 권한 동의하기
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#btnCancelKakaoConsent').onclick = function() {
        modal.style.display = 'none';
        try { sessionStorage.setItem('kakao_consent_dismissed', 'true'); } catch(e){}
    };

    modal.querySelector('#btnAcceptKakaoConsent').onclick = function() {
        modal.style.display = 'none';
        showToast('💬 카카오톡 동의창을 연결 중입니다...');

        window.Kakao.Auth.login({
            scope: 'talk_message',
            persistAccessToken: true,
            success: function(authRes) {
                console.log('[Kakao Scope Consent Granted]', authRes);
                showToast('🎉 카카오톡 메시지 전송 권한이 정상 등록되었습니다!');

                // Save to Firestore
                const currUser = SafeAuth.get();
                const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
                if (currUser && firestore) {
                    firestore.collection('lotto_users').doc(currUser).set({
                        kakaoAuth: {
                            hasTalkMessageScope: true,
                            scopes: authRes.scope ? authRes.scope.split(' ') : ['talk_message'],
                            updatedAt: new Date().toISOString()
                        }
                    }, { merge: true }).catch(err => console.warn('[Kakao Scope Save Note]', err));
                }
                if (typeof callback === 'function') callback(true);
            },
            fail: function(err) {
                console.warn('[Kakao Scope Consent Rejected/Cancelled]', err);
                if (typeof callback === 'function') callback(false);
            }
        });
    };
}

export function checkAndPromptKakaoScope(scopeName = 'talk_message') {
    if (typeof window === 'undefined' || !window.Kakao) return;
    try {
        if (sessionStorage.getItem('kakao_consent_dismissed') === 'true') return;
    } catch(e){}

    const authId = SafeAuth.get();
    if (!authId || authId.toLowerCase() === 'master' || authId.toLowerCase() === 'admin') return;

    // Check if Kakao user
    if (window.Kakao.Auth && typeof window.Kakao.Auth.getAccessToken === 'function' && window.Kakao.Auth.getAccessToken()) {
        window.Kakao.API.request({
            url: '/v2/user/scopes',
            data: { scopes: [scopeName] },
            success: function(res) {
                const scopeInfo = res.scopes && res.scopes[0];
                if (scopeInfo && !scopeInfo.agreed) {
                    showKakaoMessageConsentModal();
                }
            },
            fail: function(err) {
                console.warn('[Kakao Scope Check Warning]', err);
            }
        });
    }
}

export function ensureKakaoScope(scopeName = 'talk_message') {
    return new Promise((resolve) => {
        if (typeof window === 'undefined' || !window.Kakao) return resolve(false);

        if (window.Kakao.Auth && typeof window.Kakao.Auth.getAccessToken === 'function' && window.Kakao.Auth.getAccessToken()) {
            window.Kakao.API.request({
                url: '/v2/user/scopes',
                data: { scopes: [scopeName] },
                success: function(res) {
                    const scopeInfo = res.scopes && res.scopes[0];
                    if (scopeInfo && scopeInfo.agreed) {
                        return resolve(true);
                    }
                    showKakaoMessageConsentModal((granted) => {
                        resolve(granted);
                    });
                },
                fail: function() {
                    showKakaoMessageConsentModal((granted) => {
                        resolve(granted);
                    });
                }
            });
        } else {
            showKakaoMessageConsentModal((granted) => {
                resolve(granted);
            });
        }
    });
}

export async function sendKakaoCustomMessage(templateData) {
    if (!templateData) return false;
    initKakaoSdk();

    if (!window.Kakao || !window.Kakao.Share) {
        showToast('⚠️ 카카오 메시지 모듈을 불러올 수 없습니다.');
        return false;
    }

    try {
        if (typeof window.Kakao.Share.sendCustom === 'function') {
            window.Kakao.Share.sendCustom(templateData);
            return true;
        } else if (typeof window.Kakao.Share.sendDefault === 'function') {
            window.Kakao.Share.sendDefault(templateData);
            return true;
        }
    } catch(err) {
        console.error('[Send Kakao Message Error]', err);
        showToast('⚠️ 카카오톡 전송 실패: ' + err.message);
    }
    return false;
}

export function sendLottoKakaoMessage(round, combinations, memo = '') {
    if (!combinations || combinations.length === 0) {
        alert('전송할 추천 번호 조합이 없습니다.');
        return;
    }
    initKakaoSdk();

    const title = `🎰 [운도실력] 제 ${round}회차 로또 6/45 AI 추천 번호`;
    const comboLines = combinations.slice(0, 5).map((c, idx) => {
        const slot = String.fromCharCode(65 + idx);
        const nums = Array.isArray(c) ? c : (c.numbers || []);
        return `${slot}열: ${nums.join(', ')}`;
    }).join('\n');

    const desc = `${comboLines}\n${memo ? '\n' + memo : ''}\n\n행운의 당첨을 기원합니다!`;

    const templateData = {
        objectType: 'text',
        text: `${title}\n\n${desc}`,
        link: {
            mobileWebUrl: window.location.origin + window.location.pathname,
            webUrl: window.location.origin + window.location.pathname
        },
        buttonTitle: '앱에서 번호 확인'
    };

    sendKakaoCustomMessage(templateData);
}

export function sendTotoKakaoMessage(title, picks, odds) {
    initKakaoSdk();
    const messageTitle = `⚽ [운도실력] ${title || '토토/프로토 AI 추천 픽'}`;
    const desc = `${picks || '추천 조합'}\n예상 배당률: ${odds || '분석 중'}\n\n성공적인 적중을 기원합니다!`;

    const templateData = {
        objectType: 'text',
        text: `${messageTitle}\n\n${desc}`,
        link: {
            mobileWebUrl: window.location.origin + window.location.pathname,
            webUrl: window.location.origin + window.location.pathname
        },
        buttonTitle: '토토 추천 확인'
    };

    sendKakaoCustomMessage(templateData);
}

if (typeof window !== 'undefined') {
    window.loginWithKakao = loginWithKakao;
    window.showKakaoMessageConsentModal = showKakaoMessageConsentModal;
    window.checkAndPromptKakaoScope = checkAndPromptKakaoScope;
    window.ensureKakaoScope = ensureKakaoScope;
    window.sendKakaoCustomMessage = sendKakaoCustomMessage;
    window.sendLottoKakaoMessage = sendLottoKakaoMessage;
    window.sendTotoKakaoMessage = sendTotoKakaoMessage;
}


export function setupAuthEvents(initFirebaseAndData) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const loginError = document.getElementById('loginError');
    const signupError = document.getElementById('signupError');
    const btnLogout = document.getElementById('btnLogout');
    const btnUserManagement = document.getElementById('btnUserManagement');
    const btnUserManagementApp = document.getElementById('btnUserManagementApp');
    const userMgmtModal = document.getElementById('userMgmtModal');
    const btnCloseUserMgmtModal = document.getElementById('btnCloseUserMgmtModal');

    window.checkAuthOnLoad = () => checkAuthOnLoad(initFirebaseAndData);
    window.handleLoginSubmit = handleLoginSubmit;

    // Tab switcher
    window.switchAuthTab = function(mode) {
        const tabLogin = document.getElementById('tabAuthLogin');
        const tabSignup = document.getElementById('tabAuthSignup');
        const viewLogin = document.getElementById('viewAuthLogin');
        const viewSignup = document.getElementById('viewAuthSignup');

        if (loginError) loginError.style.display = 'none';
        if (signupError) signupError.style.display = 'none';

        if (mode === 'signup') {
            if (tabLogin) { tabLogin.classList.remove('active'); tabLogin.style.background = 'transparent'; tabLogin.style.color = '#94a3b8'; }
            if (tabSignup) { tabSignup.classList.add('active'); tabSignup.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)'; tabSignup.style.color = '#fff'; }
            if (viewLogin) viewLogin.style.display = 'none';
            if (viewSignup) {
                viewSignup.style.display = 'block';
                setTimeout(() => {
                    if (typeof window.initSignaturePad === 'function') window.initSignaturePad();
                }, 80);
            }
        } else {
            if (tabSignup) { tabSignup.classList.remove('active'); tabSignup.style.background = 'transparent'; tabSignup.style.color = '#94a3b8'; }
            if (tabLogin) { tabLogin.classList.add('active'); tabLogin.style.background = 'linear-gradient(135deg, #fbbf24, #f59e0b)'; tabLogin.style.color = '#0f172a'; }
            if (viewSignup) viewSignup.style.display = 'none';
            if (viewLogin) viewLogin.style.display = 'block';
        }
    };

    // Form and button listeners
    if (loginForm) {
        loginForm.onsubmit = handleLoginSubmit;
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
    const btnLoginSubmit = document.getElementById('btnLoginSubmit');
    if (btnLoginSubmit) {
        btnLoginSubmit.onclick = handleLoginSubmit;
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
    }
}

// ========================================================
// 8. Auto Logout & Deadlines
// ========================================================
let inactivityTimer = null;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function resetInactivityTimer() {
    const authId = SafeAuth.get();
    if (!authId) {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        return;
    }

    if (inactivityTimer) clearTimeout(inactivityTimer);

    inactivityTimer = setTimeout(() => {
        const currentAuth = SafeAuth.get();
        if (currentAuth) {
            SafeAuth.clear();
            try { sessionStorage.removeItem('lotto_auth'); } catch(e){}
            try { localStorage.removeItem('lotto_auth'); } catch(e){}
            alert('🔒 [보안 자동 로그아웃]\\n\\n10분 동안 활동이 없어 고객님의 개인정보 및 계정 보안을 위해 자동으로 로그아웃되었습니다.');
            location.reload();
        }
    }, INACTIVITY_TIMEOUT_MS);
}

export function setupInactivityAutoLogout() {
    if (typeof window === 'undefined') return;
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });
    resetInactivityTimer();
}

export function updatePurchaseDeadlineCountdowns() {
    // Deadline countdown implementation
}

// Expose on window
if (typeof window !== 'undefined') {
    window.SafeAuth = SafeAuth;
    window.handleLogout = handleLogout;
    window.handleLoginSubmit = handleLoginSubmit;
    window.checkAuthOnLoad = checkAuthOnLoad;
    window.setupAuthEvents = setupAuthEvents;
    window.isAdminUser = isAdminUser;
    window.isPermanentUser = isPermanentUser;
    window.getUserRealName = getUserRealName;
    window.getUserPermissions = getUserPermissions;
    window.getUpcomingLottoRound = getUpcomingLottoRound;
    window.getLatestDrawnRound = getLatestDrawnRound;
    window.calcLiveLatestDrawnRound = calcLiveLatestDrawnRound;
    window.calcLiveUpcomingRound = calcLiveUpcomingRound;
    window.checkUserWeeklyPurchaseStatus = checkUserWeeklyPurchaseStatus;
}
