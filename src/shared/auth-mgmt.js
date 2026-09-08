import { db } from './db.js';
import { showToast } from './utils.js';
import { hashPassword, checkPasswordStrength } from './crypto-utils.js';

// Safe Multi-Storage Auth Helper (sessionStorage + localStorage + Cookie + memory fallback)
const memoryAuthStore = { id: null };

function _getRaw(key) {
    var val = null;
    try { val = window.sessionStorage.getItem(key); if (val) return val.trim(); } catch(e) {}
    try { val = window.localStorage.getItem(key); if (val) return val.trim(); } catch(e) {}
    try {
        var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + key + '=([^;]+)'));
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
    get: function() { return _getRaw('lotto_auth'); },
    set: function(id) { if (id) _setRaw('lotto_auth', id); },
    clear: function() { _clearRaw('lotto_auth'); }
};

export function handleLogout() {
    if (!confirm('정말로 로그아웃 하시겠습니까?')) return;
    
    // 1. Clear memory & Storage & Cookies
    const currId = SafeAuth.get();
    SafeAuth.clear();
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

if (typeof window !== 'undefined') {
    window.SafeAuth = SafeAuth;
    window.handleLogout = handleLogout;
    window.hashPassword = hashPassword;
    window.checkPasswordStrength = checkPasswordStrength;
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

/**
 * 6/45 로또 최신 추첨 완료 회차 실시간 자동 계산 (2002.12.07 20:45 기준)
 */
export function calcLiveLatestDrawnRound(now = new Date()) {
    const firstDrawTime = new Date('2002-12-07T20:45:00+09:00');
    const diff = now.getTime() - firstDrawTime.getTime();
    if (diff < 0) return 1;
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
    return 1 + weeks;
}

/**
 * 6/45 로또 이번 주차 구매등록 마감 대상 차기 회차 실시간 자동 계산 (2002.12.07 20:00 기준)
 */
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

if (typeof window !== 'undefined') {
    window.calcLiveLatestDrawnRound = calcLiveLatestDrawnRound;
    window.calcLiveUpcomingRound = calcLiveUpcomingRound;
    window.getLatestDrawnRound = getLatestDrawnRound;
    window.getUpcomingLottoRound = getUpcomingLottoRound;
}

/**
 * 4대 필수 약정 표준 전문 (투명한 기술용역료 성격, 미구매자 완전 면책, 세무 증빙, 개별소유권, 비제휴 독립 소프트웨어 고지)
 */
export function getStandardAgreementTerms(now = new Date()) {
    const agreedAt = now.toISOString();
    return [
        {
            termId: 'term_fee',
            title: '[필수 1] 로또 1등 5% / 2등 10% / 3등 10% 성과연동 기술기여금 지급 및 미구매자 완전 면책 약정',
            fullContent: '제1조 (목적 및 성격) 본 약정은 회원이 플랫폼의 통계 퀀트 알고리즘 추천 조합을 활용하여 실제 로또 6/45 1등, 2등 또는 3등에 당첨된 경우에 한하여 지급할 소프트웨어 기술용역 및 통계 데이터 분석에 대한 자발적 성과연동 후불 기술기여금을 규정합니다. 4등(5만 원) 및 5등(5천 원) 당첨금에 대해서는 일체의 기술료가 전액 면제(0원)되며 100% 회원 본인에게 귀속됩니다.\n제2조 (미구매 회원에 대한 완전 면책 원칙) 회원이 플랫폼에서 추천받은 번호로 실제 복권을 구매하지 아니한 경우, 추천 번호의 당첨 여부와 무관하게 어떠한 명목의 수수료, 위약금, 손해배상금, 채권 청구도 일체 발생하지 아니함을 명백히 확약합니다. (복권 미구매자에 대한 부당 청구 및 채권추심 절대 불가 원칙)\n제3조 (기술료율 및 적법 세무 증빙) 실제 로또 1등 당첨 시 세후 실수령액의 5%, 2등 당첨 시 세후 실수령액의 10%, 3등 당첨 시 세후 실수령액의 10%(소득세법상 비과세로 약 15만 원 상당)를 운영사인 「해피크레딧」(대표: 박재구, 사업자등록번호: 322-51-00561)의 사업자 계좌로 정산 지급하며, 해피크레딧은 부가가치세법 및 세법에 따라 정식 전자세금계산서(또는 현금영수증)를 100% 투명하게 발행합니다.\n제4조 (지급기한 및 입증) 회원은 실제 당첨금을 수령한 날로부터 14일 이내에 상호 확인 하에 정산을 진행합니다. 시스템의 조합 발급 로그 및 회원이 등록한 실구매 영수증 일련번호가 상호 사실관계를 증명하는 객관적 데이터로 활용됩니다.\n제5조 (상호 신의성실) 플랫폼과 회원은 상호 신의성실의 원칙에 따라 투명하고 공정하게 본 약정을 이행합니다.\n제6조 (개인 배정 라이선스) 플랫폼이 회원에게 배정한 고유 알고리즘 추천번호는 회원 본인의 직접 구매 목적에 한해 일신전속적으로 부여된 개인 라이선스입니다.\n제7조 (당첨 정산 시 본인 일치 확인 KYC) 투명한 세무 처리를 위해 당첨금 정산 시 [앱 가입자 명의]와 [동행복권 실물 당첨금 수령자(신분증)]가 동일인임을 상호 확인합니다.',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_weekly',
            title: '[필수 2] 주간 5게임 실구매 인증 혜택(통계 분산 팩 무료) 및 복권 100% 개별 소유권 정책',
            fullContent: '제1조 (실구매 인증 혜택) 회원은 매주 추천받은 번호 중 최소 5게임 이상을 본인 명의와 비용으로 동행복권 공식 판매처에서 직접 구매하고 영수증 QR코드를 시스템에 등록할 수 있습니다. 당해 회차 실구매를 인증한 회원에게는 통계 분산 커버리지 모델, 기댓값(EV) 가중 모델 등 추가 5개 퀀트 팩(50게임) 및 시뮬레이션 연구소 무료 이용 혜택이 즉시 활성화됩니다.\n제2조 (구매대행 부인 및 개별 단독 소유) 본 서비스는 복권 구매대행이나 공동구매 펀드가 아니며, 회원이 직접 구매하여 등록한 실물 복권의 당첨금 소유권은 해당 회원 본인에게 100% 단독 귀속됩니다.\n제3조 (영구회원 혜택) 영구 사용 회원은 실구매 등록 여부와 무관하게 모든 분석 메뉴가 평생 무제한 무료 제공됩니다.',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_privacy',
            title: '[필수 3] 개인정보 수집·이용 및 전자계약 문서 안전 보존 동의',
            fullContent: '1. 수집 항목: 아이디, 성명(실명), 휴대폰번호, 자필 전자서명 이미지, 접속 기기 식별정보\n2. 수집 목적: 1인 1계정 본인확인, 중복가입 방지, 성과연동 기술료 세무 정산 및 전자계약 체결·보존\n3. 제3자 제공 금지: 수집된 개인정보 및 전자서명 데이터는 상업적 마케팅 목적으로 제3자에게 일체 제공되거나 판매되지 않습니다.\n4. 보유 및 보존 기간: 회원 탈퇴 시까지 (단, 전자서약서 및 정산 증빙 문서는 전자문서법 및 전자서명법에 따라 5년간 법적 아카이브로 안전 암호화 보존 후 영구 파기)',
            isAgreed: true,
            agreedAt: agreedAt
        },
        {
            termId: 'term_algo',
            title: '[필수 4] 복권 퀀트 알고리즘 정보 성격, 자기책임 원칙 및 비제휴 독립 소프트웨어 고지',
            fullContent: '1. 독립 확률 및 당첨 미보장 고지: 로또 6/45 복권 추첨은 매회 독립된 무작위 추출에 의해 결정되는 우연적 사행게임이며, 어떠한 알고리즘이나 통계 분석으로도 미래 당첨을 100% 확정하거나 원금을 보장할 수 없습니다. 본 서비스의 추천번호는 과거 통계 빅데이터에 기반한 학술적·수학적 분석 참고 정보입니다.\n2. 자기책임 원칙: 복권 구매에 대한 모든 최종 판단과 경제적 손익 책임은 회원 본인에게 있으며, 과도한 몰입을 지양하고 소액 건전 구매 문화를 준수하여야 합니다.\n3. 비제휴 독립 소프트웨어 고지: 본 플랫폼은 복권 수탁사업자인 동행복권(주) 및 정부 기관과 어떠한 지분이나 제휴 관계도 없는 독립된 민간 데이터 분석 응용 소프트웨어입니다.\n4. 선불 유료 결제 및 유사수신 부인: 본 서비스는 선불 유료 회원권, VIP 유료 가입비, 원금 보장형 환불 상품 등 일체의 유사수신 유료 상품을 운영하지 않습니다.\n5. 서비스 운영 주체: 본 서비스는 정식 등록 사업자인 「해피크레딧」(대표: 박재구 | 사업자등록번호: 322-51-00561 | 서울특별시 강남구 봉은사로1길 6, 5층 5159호 | 종목: 응용 소프트웨어 개발 및 공급업)에 의해 소프트웨어 기술 용역으로 운영되며 관련 법령을 엄격히 준수합니다.',
            isAgreed: true,
            agreedAt: agreedAt
        }
    ];
}

if (typeof window !== 'undefined') {
    window.getStandardAgreementTerms = getStandardAgreementTerms;
}

/**
 * Check if a user has completed the mandatory weekly purchase registration for the given drawn round
 */
export async function checkUserWeeklyPurchaseStatus(userId, userDocData = null) {
    const upcomingRound = getUpcomingLottoRound();
    const latestRound = getLatestDrawnRound();

    if (!userId || userId === 'master' || userId === 'admin') {
        return { isExempt: true, isPermanent: true, hasPurchased: true, targetRound: upcomingRound, message: '관리자/마스터 계정 (면제)' };
    }

    const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);

    let userData = userDocData;
    if (!userData && firestore) {
        try {
            const uDoc = await firestore.collection('lotto_users').doc(userId).get();
            if (uDoc.exists) userData = uDoc.data();
        } catch(e) { console.error('[checkUserWeeklyPurchaseStatus Error]', e); }
    }

    // 💎 Permanent Lifetime User Check (영구 사용 회원 권한 확인 - 실구매 등록 의무 완전 면제)
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

    // Grace period for new users who signed up within the last 5 days
    let isGracePeriod = false;
    if (userData && userData.createdAt) {
        const joinTime = new Date(userData.createdAt).getTime();
        const now = Date.now();
        const daysDiff = (now - joinTime) / (1000 * 60 * 60 * 24);
        if (daysDiff < 5) {
            isGracePeriod = true;
        }
    }

    let userLedger = {};
    let lastPurchasedRound = 0;
    let targetRoundGameCount = 0;

    if (firestore) {
        try {
            const pDoc = await firestore.collection('lotto_purchases').doc(userId).get();
            if (pDoc.exists && pDoc.data().ledger) {
                userLedger = pDoc.data().ledger;
            }
        } catch(e) {
            console.error('[Purchase Ledger Fetch Error]', e);
        }
    }

    const rounds = Object.keys(userLedger).map(Number).filter(r => !isNaN(r) && Array.isArray(userLedger[r]) && userLedger[r].length > 0).sort((a,b) => b - a);
    if (rounds.length > 0) {
        lastPurchasedRound = rounds[0];
    }

    // Check purchase in upcoming target round (e.g. 1240) OR latest completed drawn round (e.g. 1239)
    let upcomingRoundGameCount = 0;
    let latestRoundGameCount = 0;

    const upcomingReceipts = userLedger[upcomingRound] || [];
    if (Array.isArray(upcomingReceipts) && upcomingReceipts.length > 0) {
        upcomingReceipts.forEach(r => {
            if (r && Array.isArray(r.combos)) upcomingRoundGameCount += r.combos.length;
        });
    }

    const latestReceipts = userLedger[latestRound] || [];
    if (Array.isArray(latestReceipts) && latestReceipts.length > 0) {
        latestReceipts.forEach(r => {
            if (r && Array.isArray(r.combos)) latestRoundGameCount += r.combos.length;
        });
    }

    // A user is valid/active if they registered 5+ games for the upcoming target round OR latest completed round
    const hasPurchased = (upcomingRoundGameCount >= 5) || (latestRoundGameCount >= 5) || (upcomingRoundGameCount > 0);
    targetRoundGameCount = upcomingRoundGameCount > 0 ? upcomingRoundGameCount : latestRoundGameCount;

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

export function isAdminUser(authId, userData = null) {
    if (!authId) return false;
    const cleanId = String(authId).trim().toLowerCase();
    if (cleanId === 'master' || cleanId === 'admin') return true;
    if (userData && (userData.role === 'admin' || userData.isAdmin === true || userData.userType === 'admin')) {
        setIsAdminCache(cleanId, true);
        return true;
    }
    if (typeof window !== 'undefined') {
        if (window.__adminUsers && window.__adminUsers[cleanId] === true) return true;
        try {
            const sRole = window.sessionStorage.getItem(`role_${cleanId}`);
            if (sRole === 'admin') return true;
            const lRole = window.localStorage.getItem(`role_${cleanId}`);
            if (lRole === 'admin') return true;
        } catch(e) {}
    }
    return false;
}

export function setIsAdminCache(authId, isAdmin) {
    try {
        if (authId) {
            const cleanId = String(authId).trim().toLowerCase();
            const val = isAdmin ? 'admin' : 'user';
            window.sessionStorage.setItem(`role_${cleanId}`, val);
            window.localStorage.setItem(`role_${cleanId}`, val);
            if (!window.__adminUsers) window.__adminUsers = {};
            window.__adminUsers[cleanId] = !!isAdmin;
        }
    } catch(e) {}
}

export function setIsPermanentCache(authId, isPermanent) {
    try {
        if (authId) {
            const cleanId = authId.toLowerCase().trim();
            const val = isPermanent ? 'true' : 'false';
            window.sessionStorage.setItem(`perm_${cleanId}`, val);
            window.localStorage.setItem(`perm_${cleanId}`, val);
            if (!window.__permUsers) window.__permUsers = {};
            window.__permUsers[cleanId] = !!isPermanent;
        }
    } catch(e) {}
}

export function setUserNameCache(authId, realName) {
    try {
        if (authId && realName) {
            const cleanId = authId.toLowerCase().trim();
            window.sessionStorage.setItem(`name_${cleanId}`, realName);
            window.localStorage.setItem(`name_${cleanId}`, realName);
            if (!window.__userNames) window.__userNames = {};
            window.__userNames[cleanId] = realName;
        }
    } catch(e) {}
}

export function getUserRealName(authId, userData = null) {
    if (!authId) return '';
    const cleanId = authId.toLowerCase().trim();
    if (cleanId === 'master' || cleanId === 'admin') {
        return (window.__userNames && window.__userNames[cleanId]) || '관리자 (마스터)';
    }
    if (userData && userData.realName) {
        setUserNameCache(cleanId, userData.realName);
        return userData.realName;
    }
    if (typeof window !== 'undefined' && window.__userNames && window.__userNames[cleanId]) {
        return window.__userNames[cleanId];
    }
    try {
        const sName = window.sessionStorage.getItem(`name_${cleanId}`);
        if (sName) return sName;
        const lName = window.localStorage.getItem(`name_${cleanId}`);
        if (lName) return lName;
    } catch(e) {}
    if (typeof window !== 'undefined' && window.state) {
        if (window.state.allUsersPurchasesMap && window.state.allUsersPurchasesMap[cleanId]) {
            return window.state.allUsersPurchasesMap[cleanId].realName || cleanId;
        }
        if (Array.isArray(window.state.allRegisteredUsersList)) {
            const u = window.state.allRegisteredUsersList.find(item => item && item.id && item.id.toLowerCase().trim() === cleanId);
            if (u && (u.name || u.realName)) return u.name || u.realName;
        }
    }
    return '';
}

export function isPermanentUser(authId, userData = null) {
    if (!authId) return false;
    const cleanId = authId.toLowerCase().trim();
    if (cleanId === 'master' || cleanId === 'admin') return true;
    if (userData && (userData.isPermanent === true || userData.isPermanent === 'true' || userData.userType === 'permanent')) return true;
    
    // Check in-memory fast cache
    if (typeof window !== 'undefined' && window.__permUsers && window.__permUsers[cleanId] !== undefined) {
        return !!window.__permUsers[cleanId];
    }

    // Check storage cache
    try {
        if (window.sessionStorage.getItem(`perm_${cleanId}`) === 'true') return true;
        if (window.localStorage.getItem(`perm_${cleanId}`) === 'true') return true;
    } catch(e) {}

    // Check state registered users list
    if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.allRegisteredUsersList)) {
        const u = window.state.allRegisteredUsersList.find(item => item && item.id && item.id.toLowerCase().trim() === cleanId);
        if (u && (u.isPermanent === true || u.isPermanent === 'true' || u.userType === 'permanent')) return true;
    }

    return false;
}

export function setUserPermissionsCache(authId, permissions = {}) {
    try {
        if (authId) {
            const cleanId = String(authId).trim().toLowerCase();
            const allowLotto = permissions.allowLotto !== false;
            const allowToto = permissions.allowToto !== false;
            const lottoVal = allowLotto ? 'true' : 'false';
            const totoVal = allowToto ? 'true' : 'false';
            window.sessionStorage.setItem(`perm_lotto_${cleanId}`, lottoVal);
            window.localStorage.setItem(`perm_lotto_${cleanId}`, lottoVal);
            window.sessionStorage.setItem(`perm_toto_${cleanId}`, totoVal);
            window.localStorage.setItem(`perm_toto_${cleanId}`, totoVal);
            if (!window.__userPermissions) window.__userPermissions = {};
            window.__userPermissions[cleanId] = { allowLotto, allowToto };
        }
    } catch(e) {}
}

export function getUserPermissions(authId, userData = null) {
    if (!authId) return { allowLotto: true, allowToto: true };
    const cleanId = String(authId).trim().toLowerCase();

    // Master and Admin accounts always have full access
    if (cleanId === 'master' || cleanId === 'admin' || isAdminUser(cleanId, userData)) {
        return { allowLotto: true, allowToto: true };
    }

    if (userData) {
        const allowLotto = userData.allowLotto !== false;
        const allowToto = userData.allowToto !== false;
        setUserPermissionsCache(cleanId, { allowLotto, allowToto });
        return { allowLotto, allowToto };
    }

    // State registered users list (Firestore synchronized)
    if (typeof window !== 'undefined' && window.state && Array.isArray(window.state.allRegisteredUsersList)) {
        const u = window.state.allRegisteredUsersList.find(item => item && item.id && item.id.toLowerCase().trim() === cleanId);
        if (u) {
            const allowLotto = u.allowLotto !== false;
            const allowToto = u.allowToto !== false;
            setUserPermissionsCache(cleanId, { allowLotto, allowToto });
            return { allowLotto, allowToto };
        }
    }

    // Fast in-memory cache
    if (typeof window !== 'undefined' && window.__userPermissions && window.__userPermissions[cleanId]) {
        return window.__userPermissions[cleanId];
    }

    // Storage cache
    try {
        const sLotto = window.sessionStorage.getItem(`perm_lotto_${cleanId}`) || window.localStorage.getItem(`perm_lotto_${cleanId}`);
        const sToto = window.sessionStorage.getItem(`perm_toto_${cleanId}`) || window.localStorage.getItem(`perm_toto_${cleanId}`);
        if (sLotto !== null || sToto !== null) {
            return {
                allowLotto: sLotto !== 'false',
                allowToto: sToto !== 'false'
            };
        }
    } catch(e) {}

    // Default: both allowed
    return { allowLotto: true, allowToto: true };
}

export function checkUserProgramPermissions(authId, programName = 'lotto') {
    const perms = getUserPermissions(authId);
    if (programName === 'toto') {
        return perms.allowToto;
    }
    return perms.allowLotto;
}

if (typeof window !== 'undefined') {
    window.isPermanentUser = isPermanentUser;
    window.setIsPermanentCache = setIsPermanentCache;
    window.setUserNameCache = setUserNameCache;
    window.getUserRealName = getUserRealName;
    window.setUserPermissionsCache = setUserPermissionsCache;
    window.getUserPermissions = getUserPermissions;
    window.checkUserProgramPermissions = checkUserProgramPermissions;
}

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
        let isUserAdmin = isAdminUser(authId);

        // 🔒 Background Security Check: Check if active user has been suspended or is admin
        if (window.db) {
            try {
                const userDoc = await window.db.collection('lotto_users').doc(authId).get();
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
                    setUserPermissionsCache(authId, {
                        allowLotto: isUserAdmin || uData.allowLotto !== false,
                        allowToto: isUserAdmin || uData.allowToto !== false
                    });

                    if (!isUserAdmin) {
                        const pStatus = await checkUserWeeklyPurchaseStatus(authId, uData);

                        // Note: Non-purchased users are NOT suspended from logging in.
                        // Instead, they are restricted from accessing Extra 5 Packs and Simulation tab.
                        if (uData.status === 'suspended') {
                            SafeAuth.clear();
                            alert(`⚠️ [계정 이용 정지]\n\n사유: ${uData.suspensionReason || '관리자에 의해 이용 정지된 계정입니다.'}\n\n관리자에게 문의해주세요.`);
                            location.reload();
                            return;
                        }

                        // 🔒 Check if Mandatory Profile & E-Signature Pledge is Complete
                        const isPhoneValid = uData.phoneNumber && !uData.phoneNumber.includes('카카오') && uData.phoneNumber !== '미등록' && uData.phoneNumber.length >= 10;
                        const isSigValid = !!(uData.agreementDoc && uData.agreementDoc.signatureDataUrl);
                        const isNameValid = !!(uData.realName && uData.realName.trim().length >= 2);

                        if (!isPhoneValid || !isSigValid || !isNameValid) {
                            if (loginModal) {
                                loginModal.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important;');
                            }
                            setTimeout(() => {
                                if (typeof window.openMandatoryPledgeModal === 'function') {
                                    window.openMandatoryPledgeModal(authId, uData);
                                }
                            }, 100);
                            return; // Halt service access until pledge is submitted
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

        if (!window.__appUnlocked) {
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
    const addUserForm = document.getElementById('addUserForm');

    window.checkAuthOnLoad = () => checkAuthOnLoad(initFirebaseAndData);

    // ========================================================
    // 💬 Kakao 1-Sec Instant Login & Authentication Controller
    // ========================================================
    const KAKAO_JS_KEY = 'c40e8adc700a6f1c1e62b6aa3fa0c60a';

    function initKakaoSdk() {
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
    // Attempt early init
    initKakaoSdk();

    window.loginWithKakao = function() {
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

                                // 🔑 Kakao Token & Scope Data for FREE Server/Offline Messaging
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
                                    try { if (typeof initFirebaseAndData === 'function') initFirebaseAndData(); } catch(ex) {}
                                    checkAuthOnLoad(initFirebaseAndData).catch(function(err) { console.warn('[BG auth check]', err); });

                                    // 🔔 Check if talk_message is agreed; if not, show dedicated in-app consent modal!
                                    window.checkAndPromptKakaoScope('talk_message');
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
};

/**
 * 💬 [인앱 카카오톡 알림 권한 안내 모달]
 * 팝업 차단 및 자동 닫힘 방지를 위해 사용자 제스처(버튼 클릭) 기반으로 안전하게 동의창 실행
 */
window.showKakaoMessageConsentModal = function(callback) {
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
                            accessToken: authRes.access_token || '',
                            refreshToken: authRes.refresh_token || '',
                            hasTalkMessageScope: true,
                            updatedAt: new Date().toISOString()
                        }
                    }, { merge: true }).catch(console.warn);
                }

                if (typeof callback === 'function') callback(true);
            },
            fail: function(err) {
                console.warn('[Kakao Consent Cancelled]', err);
                alert('⚠️ 카카오톡 권한 동의가 완료되지 않았습니다.');
                if (typeof callback === 'function') callback(false);
            }
        });
    };

    modal.style.display = 'flex';
};

/**
 * 💬 [동의 여부 자동 검사 및 모달 호출]
 */
window.checkAndPromptKakaoScope = function(scopeName) {
    scopeName = scopeName || 'talk_message';
    try {
        if (sessionStorage.getItem('kakao_consent_dismissed') === 'true') return;
    } catch(e){}

    // 🔒 [안전 가드] 카카오 소셜 로그인 사용자(kakao_*)가 아니거나 기존 일반 아이디(ID/PW) 로그인 사용자는 팝업을 띄우지 않음
    const currUser = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : null;
    if (!currUser || !String(currUser).toLowerCase().startsWith('kakao_')) {
        return;
    }

    if (!window.Kakao || !window.Kakao.Auth) return;

    window.Kakao.API.request({
        url: '/v2/user/scopes',
        data: { scopes: [scopeName] },
        success: function(res) {
            const targetScope = res.scopes && res.scopes.find(s => s.id === scopeName);
            if (!targetScope || !targetScope.agreed) {
                console.log(`[Kakao] [${scopeName}] 미동의 감지 -> 동의 모달 표시`);
                window.showKakaoMessageConsentModal();
            } else {
                console.log(`[Kakao] [${scopeName}] 이미 동의 완료된 상태`);
            }
        },
        fail: function(e) {
            console.warn('[Kakao Scopes Check Fail]', e);
        }
    });
};

/**
 * 💬 [동적 권한 재동의 핸들러]
 * 기존 사용자(기존에 talk_message 권한 미동의 상태)가 메시지 발송을 시도할 때
 * 자동으로 카카오 동의 팝업창을 띄워 권한을 추가 승인받는 함수
 */
window.ensureKakaoScope = function(scopeName) {
    scopeName = scopeName || 'talk_message';
    return new Promise((resolve, reject) => {
        initKakaoSdk();
        if (!window.Kakao || !window.Kakao.Auth) {
            return reject(new Error('카카오 SDK가 준비되지 않았습니다.'));
        }

        // 1. 현재 사용자의 동의 내역 조회
        window.Kakao.API.request({
            url: '/v2/user/scopes',
            data: { scopes: [scopeName] },
            success: function(res) {
                const targetScope = res.scopes && res.scopes.find(s => s.id === scopeName);
                if (targetScope && targetScope.agreed) {
                    console.log(`[Kakao] 이미 [${scopeName}] 권한이 동의되어 있습니다.`);
                    return resolve(true);
                }

                // 2. 동의되지 않은 경우 -> 안내 모달 호출
                console.log(`[Kakao] [${scopeName}] 권한 미동의 상태 -> 모달 팝업 실행`);
                window.showKakaoMessageConsentModal(function(granted) {
                    if (granted) resolve(true);
                    else reject(new Error('카카오톡 메시지 전송을 위해 권한 동의가 필요합니다.'));
                });
            },
            fail: function(err) {
                window.showKakaoMessageConsentModal(function(granted) {
                    if (granted) resolve(true);
                    else reject(new Error('카카오톡 메시지 전송을 위해 권한 동의가 필요합니다.'));
                });
            }
        });
    });
};

/**
 * 💬 [카카오톡 나에게 메시지 전송 공통 함수]
 */
window.sendKakaoCustomMessage = async function(templateData) {
    try {
        // 1. 기존/신규 사용자 권한 동의 여부 검사 (미동의 시 팝업 띄움)
        await window.ensureKakaoScope('talk_message');

        showToast('🚀 카카오톡으로 전송 중입니다...');

        // 2. 나에게 보내기 API 호출
        window.Kakao.API.request({
            url: '/v2/api/talk/memo/default/send',
            data: {
                template_object: templateData
            },
            success: function(res) {
                console.log('[Kakao Send Success]', res);
                showToast('✅ 카카오톡 [나와의 채팅방]으로 성공적으로 전송되었습니다!');
            },
            fail: function(err) {
                console.error('[Kakao Send Failed]', err);
                if (err && err.code === -402) {
                    // 권한 부족 에러 시 즉시 재동의 팝업 호출
                    window.Kakao.Auth.login({
                        scope: 'talk_message',
                        success: function() {
                            window.sendKakaoCustomMessage(templateData);
                        }
                    });
                } else {
                    alert('⚠️ 카카오톡 전송 실패: ' + (err.msg || JSON.stringify(err)));
                }
            }
        });
    } catch (err) {
        console.warn('[Kakao Message Action Aborted]', err);
        if (err && err.message) {
            alert('⚠️ ' + err.message);
        }
    }
};

/**
 * 💬 [로또 AI 추천 번호 카카오톡 전송]
 */
window.sendLottoKakaoMessage = function(round, combinations, memo) {
    const roundText = round ? `${round}회차` : '이번 주';
    let comboText = '';
    if (Array.isArray(combinations)) {
        comboText = combinations.map((c, i) => {
            const nums = Array.isArray(c) ? c.join(', ') : (c.numbers ? c.numbers.join(', ') : String(c));
            return `[${String.fromCharCode(65 + i)}] ${nums}`;
        }).join('\n');
    } else {
        comboText = String(combinations || '');
    }

    const template = {
        object_type: 'text',
        text: `🎰 [운도실력] ${roundText} 로또 AI 맞춤 추천 번호\n\n${comboText}\n\n💡 ${memo || '빅데이터 퀀트 알고리즘 엄선 조합입니다.'}`,
        link: {
            web_url: window.location.origin + window.location.pathname,
            mobile_web_url: window.location.origin + window.location.pathname
        },
        button_title: '나의 번호 채점 & 분석 보기'
    };

    window.sendKakaoCustomMessage(template);
};

/**
 * 💬 [토토/프로토 AI 추천픽 카카오톡 전송]
 */
window.sendTotoKakaoMessage = function(title, picks, odds) {
    let pickText = '';
    if (Array.isArray(picks)) {
        pickText = picks.map(p => `• ${p.matchTitle || p.match || ''} : ${p.pickName || p.pick || ''} (@${p.odds || ''})`).join('\n');
    } else {
        pickText = String(picks || '');
    }

    const template = {
        object_type: 'text',
        text: `⚽ [운도실력] ${title || '토토/프로토 AI 추천픽'}\n\n${pickText}\n\n💰 조합 배당률: ${odds || '2.45'}배\n🎯 기대값(+EV) & 실시간 배당 분석 완료`,
        link: {
            web_url: window.location.origin + window.location.pathname,
            mobile_web_url: window.location.origin + window.location.pathname
        },
        button_title: '토토/프로토 분석표 보기'
    };

    window.sendKakaoCustomMessage(template);
};

    // ========================================================
    // Tab Switcher: [로그인] ⟷ [회원가입]
    // ========================================================
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

    // ========================================================
    // Live Password Strength Indicator & ID Duplicate Check
    // ========================================================
    const signupPwInput = document.getElementById('signupPw');
    const pwStrengthMsg = document.getElementById('pwStrengthMsg');
    const pwStrengthBar = document.getElementById('pwStrengthBar');

    if (signupPwInput) {
        signupPwInput.addEventListener('input', (e) => {
            const val = e.target.value;
            const res = checkPasswordStrength(val);
            if (pwStrengthMsg) {
                pwStrengthMsg.textContent = res.message;
                pwStrengthMsg.style.color = res.color;
            }
            if (pwStrengthBar) {
                const pct = (res.score / 4) * 100;
                pwStrengthBar.style.width = `${pct}%`;
                pwStrengthBar.style.backgroundColor = res.color;
            }
        });
    }

    window.checkIdDuplicate = async function() {
        const idEl = document.getElementById('signupId');
        const badgeEl = document.getElementById('idCheckBadge');
        const errEl = document.getElementById('signupError');
        const rawId = idEl ? idEl.value.trim() : '';

        if (!rawId || rawId.length < 4) {
            if (errEl) { errEl.textContent = '아이디는 영문/숫자 4자 이상이어야 합니다.'; errEl.style.display = 'block'; }
            if (badgeEl) badgeEl.style.display = 'none';
            return;
        }

        const idRegex = /^[a-zA-Z0-9_]{4,20}$/;
        if (!idRegex.test(rawId)) {
            if (errEl) { errEl.textContent = '아이디는 4~20자의 영문, 숫자, 밑줄(_)만 가능합니다.'; errEl.style.display = 'block'; }
            if (badgeEl) badgeEl.style.display = 'none';
            return;
        }

        const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
        if (!firestore) {
            if (errEl) { errEl.textContent = 'DB 연결 대기 중입니다.'; errEl.style.display = 'block'; }
            return;
        }

        try {
            if (badgeEl) { badgeEl.style.display = 'inline'; badgeEl.textContent = '확인 중...'; badgeEl.style.color = '#94a3b8'; }
            const doc = await firestore.collection('lotto_users').doc(rawId).get();
            if (doc.exists || rawId.toLowerCase() === 'master' || rawId.toLowerCase() === 'admin') {
                if (badgeEl) { badgeEl.textContent = '❌ 이미 사용 중인 아이디'; badgeEl.style.color = '#ef4444'; }
            } else {
                if (badgeEl) { badgeEl.textContent = '✓ 사용 가능한 아이디'; badgeEl.style.color = '#10b981'; }
                if (errEl) errEl.style.display = 'none';
            }
        } catch (e) {
            console.error('[ID Check Error]', e);
        }
    };

    // ========================================================
    // Phone Number Helper & Live Auto-Formatting
    // ========================================================
    function formatPhoneNumber(val) {
        if (!val) return '';
        const clean = val.replace(/[^0-9]/g, '');
        if (clean.length < 4) return clean;
        if (clean.length < 7) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
        if (clean.length < 11) return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
        return `${clean.slice(0, 3)}-${clean.slice(3, 7)}-${clean.slice(7, 11)}`;
    }

    function validatePhoneNumber(val) {
        if (!val) return false;
        const clean = val.replace(/[^0-9]/g, '');
        // 한국 휴대폰 번호 형식: 010, 011, 016, 017, 018, 019로 시작하고 10~11자리
        const regex = /^01[016789]\d{7,8}$/;
        return regex.test(clean);
    }

    const signupPhoneInput = document.getElementById('signupPhone');
    if (signupPhoneInput) {
        signupPhoneInput.addEventListener('input', (e) => {
            const formatted = formatPhoneNumber(e.target.value);
            e.target.value = formatted;
            const badgeEl = document.getElementById('phoneCheckBadge');
            if (badgeEl) badgeEl.style.display = 'none';
        });
    }

    const addUserPhoneInput = document.getElementById('addUserPhone');
    if (addUserPhoneInput) {
        addUserPhoneInput.addEventListener('input', (e) => {
            e.target.value = formatPhoneNumber(e.target.value);
        });
    }

    window.formatPhoneNumber = formatPhoneNumber;
    window.validatePhoneNumber = validatePhoneNumber;

    window.checkPhoneDuplicate = async function() {
        const phoneEl = document.getElementById('signupPhone');
        const badgeEl = document.getElementById('phoneCheckBadge');
        const errEl = document.getElementById('signupError');
        const rawPhone = phoneEl ? phoneEl.value.trim() : '';

        if (!rawPhone) {
            if (errEl) { errEl.textContent = '휴대폰 번호를 입력해주세요.'; errEl.style.display = 'block'; }
            if (badgeEl) badgeEl.style.display = 'none';
            return;
        }

        if (!validatePhoneNumber(rawPhone)) {
            if (errEl) { errEl.textContent = '올바른 휴대폰 번호(010-0000-0000) 형식이 아닙니다.'; errEl.style.display = 'block'; }
            if (badgeEl) badgeEl.style.display = 'none';
            return;
        }

        const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
        if (!firestore) {
            if (errEl) { errEl.textContent = 'DB 연결 대기 중입니다.'; errEl.style.display = 'block'; }
            return;
        }

        try {
            if (badgeEl) { badgeEl.style.display = 'inline'; badgeEl.textContent = '확인 중...'; badgeEl.style.color = '#94a3b8'; }
            
            const formatted = formatPhoneNumber(rawPhone);
            const digitsOnly = rawPhone.replace(/[^0-9]/g, '');

            // Check if phone number already exists in lotto_users
            const snapFormatted = await firestore.collection('lotto_users').where('phoneNumber', '==', formatted).get();
            let isDuplicate = !snapFormatted.empty;

            if (!isDuplicate) {
                const snapDigits = await firestore.collection('lotto_users').where('phoneNumber', '==', digitsOnly).get();
                if (!snapDigits.empty) isDuplicate = true;
            }

            if (isDuplicate) {
                if (badgeEl) { badgeEl.textContent = '❌ 이미 가입된 휴대폰 번호'; badgeEl.style.color = '#ef4444'; }
                if (errEl) { errEl.textContent = '이미 해당 휴대폰 번호로 가입된 계정이 존재합니다. (중복 가입 불가)'; errEl.style.display = 'block'; }
            } else {
                if (badgeEl) { badgeEl.textContent = '✓ 사용 가능한 번호'; badgeEl.style.color = '#10b981'; }
                if (errEl) errEl.style.display = 'none';
            }
        } catch (e) {
            console.error('[Phone Check Error]', e);
        }
    };

    // Terms master agreement toggle
    window.toggleAllTerms = function(masterCb) {
        const isChecked = masterCb.checked;
        const cbs = document.querySelectorAll('.term-child-cb');
        cbs.forEach(cb => { cb.checked = isChecked; });
    };

    // ========================================================
    // ✍️ Mobile Touch & Mouse E-Signature Pad Controller
    // ========================================================
    let isDrawingSig = false;
    let sigStrokePoints = 0;

    function initSignaturePad() {
        const canvas = document.getElementById('signupSignatureCanvas');
        const placeholder = document.getElementById('sigPlaceholder');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        
        function fillCanvasWhite() {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const ratio = window.devicePixelRatio || 2;
                canvas.width = rect.width * ratio;
                canvas.height = rect.height * ratio;
                ctx.scale(ratio, ratio);
                fillCanvasWhite();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3.2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
        resizeCanvas();

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function startDraw(e) {
            isDrawingSig = true;
            sigStrokePoints++;
            if (placeholder) placeholder.style.display = 'none';
            const pos = getPos(e);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            if (e.cancelable && (e.type === 'touchstart' || e.type === 'touchmove')) {
                e.preventDefault();
            }
        }

        function draw(e) {
            if (!isDrawingSig) return;
            sigStrokePoints++;
            const pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            if (e.cancelable && (e.type === 'touchstart' || e.type === 'touchmove')) {
                e.preventDefault();
            }
        }

        function endDraw() {
            if (!isDrawingSig) return;
            isDrawingSig = false;
            ctx.closePath();
        }

        // Pointer Events (Unified Touch & Mouse for All Mobile & Desktop Browsers)
        canvas.addEventListener('pointerdown', startDraw);
        canvas.addEventListener('pointermove', draw);
        window.addEventListener('pointerup', endDraw);

        canvas.onmousedown = startDraw;
        canvas.onmousemove = draw;
        window.addEventListener('mouseup', endDraw);

        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        window.addEventListener('touchend', endDraw);

        window.clearSignaturePad = function() {
            fillCanvasWhite();
            sigStrokePoints = 0;
            if (placeholder) placeholder.style.display = 'block';
        };

        window.autoSignWithName = function(name) {
            fillCanvasWhite();
            if (placeholder) placeholder.style.display = 'none';
            ctx.save();
            ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif';
            ctx.fillStyle = '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const signText = (name && name.trim()) ? name.trim() + ' (인)' : '전자 서명 (인)';
            ctx.fillText(signText, 140, 55);
            ctx.restore();
            sigStrokePoints = 10;
        };

        window.isSignatureEmpty = function() {
            return sigStrokePoints < 1;
        };

        window.getSignatureDataUrl = function() {
            return canvas.toDataURL('image/png');
        };
    }
    window.initSignaturePad = initSignaturePad;

    // ========================================================
    // Sign-Up Form Submission (With E-Signature & Agreement Doc)
    // ========================================================
    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const idEl = document.getElementById('signupId');
            const phoneEl = document.getElementById('signupPhone');
            const pwEl = document.getElementById('signupPw');
            const pwConfirmEl = document.getElementById('signupPwConfirm');
            const nameEl = document.getElementById('signupRealName');
            const submitBtn = signupForm.querySelector('button[type="submit"]');
            const errEl = document.getElementById('signupError');

            const rawId = idEl ? idEl.value.trim() : '';
            const rawPhone = phoneEl ? phoneEl.value.trim() : '';
            const realName = nameEl ? nameEl.value.trim() : '';
            const pw = pwEl ? pwEl.value.trim() : '';
            const pwConfirm = pwConfirmEl ? pwConfirmEl.value.trim() : '';

            if (errEl) errEl.style.display = 'none';

            // 1. Validate ID
            if (!rawId || rawId.length < 4) {
                if (errEl) { errEl.textContent = '아이디는 4자 이상이어야 합니다.'; errEl.style.display = 'block'; }
                return;
            }

            // 2. Validate Phone Number
            if (!rawPhone) {
                if (errEl) { errEl.textContent = '휴대폰 번호를 입력해주세요.'; errEl.style.display = 'block'; }
                return;
            }
            if (!validatePhoneNumber(rawPhone)) {
                if (errEl) { errEl.textContent = '올바른 휴대폰 번호(010-0000-0000)를 입력해주세요.'; errEl.style.display = 'block'; }
                return;
            }
            const cleanPhone = formatPhoneNumber(rawPhone);
            const digitsPhone = rawPhone.replace(/[^0-9]/g, '');

            // 3. Validate Password
            const pwStrength = checkPasswordStrength(pw);
            if (!pwStrength.isValid) {
                if (errEl) { errEl.textContent = pwStrength.message; errEl.style.display = 'block'; }
                return;
            }
            if (pw !== pwConfirm) {
                if (errEl) { errEl.textContent = '비밀번호 확인이 일치하지 않습니다.'; errEl.style.display = 'block'; }
                return;
            }

            // 4. Validate Mandatory Legal Terms (4 Terms)
            const agreeFee = document.getElementById('agreeFee');
            const agreeWeekly = document.getElementById('agreeWeekly');
            const agreePrivacy = document.getElementById('agreePrivacy');
            const agreeAlgo = document.getElementById('agreeAlgo');

            if (!agreeFee?.checked || !agreeWeekly?.checked || !agreePrivacy?.checked || (agreeAlgo && !agreeAlgo.checked)) {
                if (errEl) { errEl.textContent = '⚠️ 필수 약관 4종에 모두 체크 동의하셔야 회원가입이 완료됩니다.'; errEl.style.display = 'block'; }
                return;
            }

            // 5. Validate or Auto-Generate E-Signature (Must be signed or stamped)
            if (typeof window.isSignatureEmpty === 'function' && window.isSignatureEmpty()) {
                // Auto generate signature with user real name or ID so signup never halts on touch issues
                if (typeof window.autoSignWithName === 'function') {
                    window.autoSignWithName(realName || rawId);
                }
            }

            const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
            if (!firestore) {
                if (errEl) { errEl.textContent = '데이터베이스에 연결되지 않았습니다.'; errEl.style.display = 'block'; }
                return;
            }

            try {
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 서약 문서 생성 및 가입 처리 중...';
                }

                // Check ID existence
                const userDoc = await firestore.collection('lotto_users').doc(rawId).get();
                if (userDoc.exists || rawId.toLowerCase() === 'master' || rawId.toLowerCase() === 'admin') {
                    if (errEl) { errEl.textContent = '이미 사용 중인 아이디입니다. 다른 아이디를 선택해주세요.'; errEl.style.display = 'block'; }
                    return;
                }

                // Check Phone Number Duplicate
                const phoneSnap1 = await firestore.collection('lotto_users').where('phoneNumber', '==', cleanPhone).get();
                let isPhoneTaken = !phoneSnap1.empty;
                if (!isPhoneTaken) {
                    const phoneSnap2 = await firestore.collection('lotto_users').where('phoneNumber', '==', digitsPhone).get();
                    if (!phoneSnap2.empty) isPhoneTaken = true;
                }

                if (isPhoneTaken) {
                    if (errEl) { errEl.textContent = '⚠️ 이미 등록된 휴대폰 번호입니다. 1인 1계정 원칙에 따라 동일 번호로 중복 가입할 수 없습니다.'; errEl.style.display = 'block'; }
                    return;
                }

                // Generate SHA-256 Hash
                const pwHash = await hashPassword(pw, rawId);

                // Extract E-Signature Image (Base64 PNG)
                const signatureDataUrl = (typeof window.getSignatureDataUrl === 'function') ? window.getSignatureDataUrl() : null;

                const now = new Date();
                const formattedDate = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일 ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

                // Construct Single Unified Electronic Agreement & Pledge Document
                const agreementDocument = {
                    docId: `AGR-${rawId}-${Date.now()}`,
                    documentTitle: '로또 AI 퀀트 서비스 이용 및 성공수수료 전자 서약서',
                    userId: rawId,
                    realName: realName || rawId,
                    phoneNumber: cleanPhone,
                    createdAt: now.toISOString(),
                    agreedDateFormatted: formattedDate,
                    userAgent: navigator.userAgent,
                    terms: getStandardAgreementTerms(now),
                    signatureDataUrl: signatureDataUrl,
                    legalPledgeStatement: '위 모든 약관의 전문 내용을 확인하였으며, 대한민국 전자문서 및 전자서명법에 따라 본인이 직접 서명하고 본 전자 계약을 체결합니다.',
                    status: 'legally_binding'
                };

                // Save Security User Profile with Phone Number & Embedded Agreement
                const userData = {
                    userId: rawId,
                    phoneNumber: cleanPhone,
                    passwordHash: pwHash,
                    realName: realName || rawId,
                    status: 'active',
                    createdAt: now.toISOString(),
                    agreementDoc: agreementDocument,
                    agreedTerms: {
                        feeAgreement: true,
                        weeklyPurchaseAgreement: true,
                        privacyAgreement: true,
                        algoDisclaimer: true,
                        agreedAt: now.toISOString(),
                        hasSignature: !!signatureDataUrl
                    },
                    loginFailCount: 0,
                    lockoutUntil: null
                };

                await firestore.collection('lotto_users').doc(rawId).set(userData);

                // Also persist standalone agreement record for audit archive
                try {
                    await firestore.collection('lotto_agreements').doc(rawId).set(agreementDocument);
                } catch(e) {
                    console.warn('[Archive Agreement Error - Handled]', e);
                }

                showToast(`🎉 [${rawId}] 회원가입 및 전자 서약서 체결이 완료되었습니다!`);
                SafeAuth.set(rawId);

                // ✅ Immediately hide modal & show landing page after signup
                const signupModal = document.getElementById('loginModalOverlay');
                if (signupModal) {
                    signupModal.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;');
                    signupModal.classList.add('hidden');
                }
                const lpEl = document.getElementById('landingPage');
                const acEl = document.getElementById('appContainer');
                const tpEl = document.getElementById('totoPage');
                if (lpEl) { lpEl.classList.add('active'); lpEl.style.setProperty('display', 'flex', 'important'); }
                if (acEl) { acEl.classList.remove('active'); acEl.style.setProperty('display', 'none', 'important'); }
                if (tpEl) { tpEl.classList.remove('active'); tpEl.style.setProperty('display', 'none', 'important'); }

                setTimeout(function() {
                    try { if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard(); } catch(ex) {}
                    try { if (typeof initFirebaseAndData === 'function') initFirebaseAndData(); } catch(ex) {}
                    checkAuthOnLoad(initFirebaseAndData).catch(function(err) { console.warn('[BG auth check]', err); });
                }, 200);

            } catch (err) {
                console.error('[Sign-up Error]', err);
                if (errEl) { errEl.textContent = '회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'; errEl.style.display = 'block'; }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fa-solid fa-file-contract"></i> 약관 동의 및 전자 서명 가입 완료';
                }
            }
        });
    }

    // ========================================================
    // Secure Login Handler
    // ========================================================
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            
            const idEl = document.getElementById('loginId');
            const pwEl = document.getElementById('loginPw');
            const submitBtn = loginForm.querySelector('button[type="submit"]') || document.getElementById('btnLoginSubmit');
            const origBtnText = submitBtn ? submitBtn.innerHTML : '시스템 접속';

            const rawId = idEl ? idEl.value.trim() : '';
            const idLower = rawId.toLowerCase();
            const pw = pwEl ? pwEl.value.trim() : '';

            if (loginError) loginError.style.display = 'none';

            // ✅ Immediately unlock UI on auth success (before any async checks)
            function unlockUIImmediately(authId, welcomeMsg) {
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

                // 3. Toast welcome message
                if (welcomeMsg) {
                    setTimeout(function() { try { showToast(welcomeMsg); } catch(ex) {} }, 80);
                }

                // 4. Initialize services (non-blocking, background)
                setTimeout(function() {
                    try {
                        if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
                    } catch(ex) {}
                    try {
                        if (typeof initFirebaseAndData === 'function') initFirebaseAndData();
                    } catch(ex) {}
                    // Background auth verification (non-blocking)
                    checkAuthOnLoad(initFirebaseAndData).catch(function(err) {
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
            const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
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

                // 1. Check Account Suspension Status
                if (data.status === 'suspended') {
                    if (loginError) { 
                        loginError.textContent = `🚫 관리자에 의해 이용 정지된 계정입니다.\n(사유: ${data.suspensionReason || '관리자 수동 이용정지'})`; 
                        loginError.style.display = 'block'; 
                    }
                    return false;
                }
                if (data.status === 'suspended_nopurchase') {
                    if (loginError) { 
                        loginError.textContent = `⚠️ 주간 실구매 미등록으로 인해 자동 이용 정지된 계정입니다.\n(사유: ${data.suspensionReason || '실구매 미등록'})\n관리자에게 문의하여 이용 정지를 해제하세요.`; 
                        loginError.style.display = 'block'; 
                    }
                    return false;
                }

                // 2. Check Lockout
                if (data.lockoutUntil && new Date(data.lockoutUntil) > new Date()) {
                    const remainMins = Math.ceil((new Date(data.lockoutUntil) - new Date()) / 60000);
                    if (loginError) {
                        loginError.textContent = `연속 로그인 실패로 계정이 일시 잠금되었습니다. (${remainMins}분 후 재시도 가능)`;
                        loginError.style.display = 'block';
                    }
                    return false;
                }

                // 3. Hash & Verify Password
                const computedHash = await hashPassword(pw, rawId);
                const isHashMatch = data.passwordHash && data.passwordHash === computedHash;
                const isLegacyMatch = !data.passwordHash && data.password === pw;

                if (isHashMatch || isLegacyMatch) {
                    // 4. Weekly Purchase Mandatory Check (해당 주차 실구매 등록 검증)
                    const pStatus = await checkUserWeeklyPurchaseStatus(rawId, data);
                    if (!pStatus.isExempt && !pStatus.isGracePeriod && !pStatus.hasPurchased) {
                        const reason = `제 ${pStatus.targetRound}회차 실구매 미등록으로 인한 자동 이용정지`;
                        await docRef.update({
                            status: 'suspended_nopurchase',
                            suspensionReason: reason,
                            suspendedAt: new Date().toISOString()
                        });
                        if (loginError) {
                            loginError.textContent = `⚠️ [자동 이용정지]\n제 ${pStatus.targetRound}회차에 실구매 번호를 등록하지 않아 계정이 자동 이용정지되었습니다.\n관리자에게 문의하여 해제를 요청하세요.`;
                            loginError.style.display = 'block';
                        }
                        return false;
                    }

                    const isPerm = !!(data.isAdmin === true || data.role === 'admin' || data.isPermanent === true || data.isPermanent === 'true' || data.userType === 'permanent');
                    const isAdm = !!(data.isAdmin === true || data.role === 'admin' || rawId.toLowerCase() === 'master' || rawId.toLowerCase() === 'admin');
                    setIsPermanentCache(rawId, isPerm);
                    setIsAdminCache(rawId, isAdm);

                    // Reset fail count & migrate legacy plaintext if needed
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
                    // Failed login handling
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
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            if (typeof window.handleLogout === 'function') {
                window.handleLogout();
            } else {
                handleLogout();
            }
        });
    }

    // ========================================================
    // User Management Modal (Admin/Master Only)
    // ========================================================
    window.openUserManagement = () => {
        if (userMgmtModal) userMgmtModal.style.display = 'flex';
        loadUserList();
    };

    if (btnUserManagement) btnUserManagement.addEventListener('click', window.openUserManagement);
    if (btnUserManagementApp) btnUserManagementApp.addEventListener('click', window.openUserManagement);
    const btnUserManagementToto = document.getElementById('btnUserManagementToto');
    if (btnUserManagementToto) btnUserManagementToto.addEventListener('click', window.openUserManagement);

    window.loadUserList = loadUserList;

    if (btnCloseUserMgmtModal) {
        btnCloseUserMgmtModal.addEventListener('click', () => {
            if (userMgmtModal) userMgmtModal.style.display = 'none';
        });
    }

    async function loadUserList() {
        const userListContainer = document.getElementById('userListContainer');
        if (!window.db || !userListContainer) return;
        
        userListContainer.innerHTML = `<div style="text-align:center; padding: 24px; color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> 사용자 및 실구매 데이터 동기화 중...</div>`;
        
        try {
            const snapshot = await window.db.collection('lotto_users').get();
            if (snapshot.empty) {
                userListContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:#64748b;">등록된 사용자가 없습니다.</div>`;
                return;
            }
            
            const users = [];
            snapshot.forEach(doc => {
                users.push({ userId: doc.id, data: doc.data() });
            });

            // Concurrently fetch purchase status for each user
            const usersWithStatus = await Promise.all(users.map(async (u) => {
                const pStatus = await checkUserWeeklyPurchaseStatus(u.userId, u.data);
                const isUserAdmin = !!(u.data.isAdmin === true || u.data.role === 'admin' || u.userId === 'master' || u.userId === 'admin');
                const isPermanent = !!(u.data.isPermanent === true || u.data.userType === 'permanent' || isUserAdmin);
                const allowLotto = isUserAdmin || u.data.allowLotto !== false;
                const allowToto = isUserAdmin || u.data.allowToto !== false;
                setIsPermanentCache(u.userId, isPermanent);
                setUserPermissionsCache(u.userId, { allowLotto, allowToto });
                return { ...u, pStatus, allowLotto, allowToto };
            }));

            // Sync global state registered users list with isPermanent flag & program permissions
            if (typeof window !== 'undefined' && window.state) {
                window.state.allRegisteredUsersList = users.map(u => ({
                    id: u.userId,
                    name: u.data.realName || u.userId,
                    phone: u.data.phoneNumber || '',
                    isAdmin: !!(u.data.isAdmin === true || u.data.role === 'admin' || u.userId === 'master' || u.userId === 'admin'),
                    isPermanent: !!(u.data.isPermanent === true || u.data.userType === 'permanent' || u.data.isAdmin === true || u.data.role === 'admin' || u.userId === 'master' || u.userId === 'admin'),
                    allowLotto: u.data.allowLotto !== false,
                    allowToto: u.data.allowToto !== false
                }));
            }

            const latestRound = getLatestDrawnRound();

            let html = '';
            usersWithStatus.forEach(item => {
                const { userId, data, pStatus, allowLotto, allowToto } = item;
                const isUserAdmin = !!(data.isAdmin === true || data.role === 'admin' || userId === 'master' || userId === 'admin');
                const isPermanent = !!(data.isPermanent === true || data.userType === 'permanent' || isUserAdmin);
                const status = data.status || 'active';
                const isSuspended = (status === 'suspended' || status === 'suspended_nopurchase');
                const isNoPurchaseSuspended = (status === 'suspended_nopurchase');

                let adminBadge = isUserAdmin 
                    ? `<span style="font-size:0.72rem; color:#fbbf24; background:rgba(245,158,11,0.2); border:1px solid #f59e0b; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-crown"></i> 관리자</span>` 
                    : '';

                let statusBadge = '';
                if (isUserAdmin) {
                    statusBadge = `<span style="font-size:0.72rem; color:#38bdf8; background:rgba(56,189,248,0.15); border:1px solid #38bdf8; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-gem"></i> 영구 활성</span>`;
                } else if (isPermanent) {
                    statusBadge = `<span style="font-size:0.72rem; color:#38bdf8; background:rgba(56,189,248,0.15); border:1px solid #38bdf8; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-gem"></i> 영구 사용</span>`;
                } else if (status === 'active') {
                    statusBadge = `<span style="font-size:0.72rem; color:#10b981; background:rgba(16,185,129,0.15); border:1px solid #10b981; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-circle-check"></i> 정상 활성</span>`;
                } else if (isNoPurchaseSuspended) {
                    statusBadge = `<span style="font-size:0.72rem; color:#fbbf24; background:rgba(245,158,11,0.15); border:1px solid #f59e0b; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-triangle-exclamation"></i> 미구매 자동정지</span>`;
                } else {
                    statusBadge = `<span style="font-size:0.72rem; color:#ef4444; background:rgba(239,68,68,0.15); border:1px solid #ef4444; padding:2px 7px; border-radius:6px; font-weight:800;"><i class="fa-solid fa-ban"></i> 관리자 수동정지</span>`;
                }

                let lottoPermBadge = allowLotto
                    ? `<span style="font-size:0.7rem; color:#34d399; background:rgba(16,185,129,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.3); font-weight:700;"><i class="fa-solid fa-clover"></i> 로또 허용</span>`
                    : `<span style="font-size:0.7rem; color:#ef4444; background:rgba(239,68,68,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.4); font-weight:800;"><i class="fa-solid fa-ban"></i> 로또 차단</span>`;

                let totoPermBadge = allowToto
                    ? `<span style="font-size:0.7rem; color:#fbbf24; background:rgba(245,158,11,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(245,158,11,0.3); font-weight:700;"><i class="fa-solid fa-trophy"></i> 토토 허용</span>`
                    : `<span style="font-size:0.7rem; color:#ef4444; background:rgba(239,68,68,0.15); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.4); font-weight:800;"><i class="fa-solid fa-ban"></i> 토토 차단</span>`;

                let purchaseBadge = '';
                if (isUserAdmin || isPermanent) {
                    purchaseBadge = `<span style="font-size:0.7rem; color:#38bdf8; background:rgba(56,189,248,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.3); font-weight:700;"><i class="fa-solid fa-infinity"></i> 실구매 평생 면제</span>`;
                } else if (pStatus.hasPurchased) {
                    purchaseBadge = `<span style="font-size:0.7rem; color:#10b981; background:rgba(16,185,129,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.3);">✅ ${latestRound}회 구매등록 (${pStatus.targetRoundGameCount}G)</span>`;
                } else if (pStatus.isGracePeriod) {
                    purchaseBadge = `<span style="font-size:0.7rem; color:#38bdf8; background:rgba(56,189,248,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.3);">신규가입 첫주 (유예)</span>`;
                } else {
                    purchaseBadge = `<span style="font-size:0.7rem; color:#ef4444; background:rgba(239,68,68,0.12); padding:2px 6px; border-radius:4px; border:1px solid rgba(239,68,68,0.3);">❌ ${latestRound}회 미구매 (정지대상)</span>`;
                }

                const realName = data.realName && data.realName !== userId ? `(${data.realName})` : '';
                const joinDate = data.createdAt ? data.createdAt.slice(0, 10) : '-';
                const lastRoundText = pStatus.lastPurchasedRound > 0 ? `제 ${pStatus.lastPurchasedRound}회` : (isPermanent ? '무제한 이용' : '없음');
                const reasonText = data.suspensionReason ? `<div style="font-size:0.72rem; color:#f87171; background:rgba(239,68,68,0.08); padding:3px 6px; border-radius:4px; margin-top:2px;"><i class="fa-solid fa-circle-info"></i> ${data.suspensionReason}</div>` : '';

                const toggleBtnText = isSuspended ? '정지 해제' : '이용 정지';
                const toggleBtnColor = isSuspended ? '#10b981' : '#f59e0b';
                const toggleIcon = isSuspended ? 'fa-lock-open' : 'fa-lock';

                const permBtnText = isPermanent ? '영구 해제' : '영구 설정';
                const permBtnColor = isPermanent ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.8)';
                const permBtnBorder = isPermanent ? '1px solid rgba(56, 189, 248, 0.4)' : 'none';

                const adminBtnText = isUserAdmin ? '관리자 해제' : '관리자 지정';
                const adminBtnColor = isUserAdmin ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.8)';
                const adminBtnBorder = isUserAdmin ? '1px solid rgba(245, 158, 11, 0.4)' : 'none';

                html += `
                <div style="background:rgba(15, 23, 42, 0.85); padding:12px; border-radius:12px; border:1px solid ${isUserAdmin ? 'rgba(245,158,11,0.45)' : (isPermanent ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.08)')}; margin-bottom: 10px; display:flex; flex-direction:column; gap:8px; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                    
                    <!-- 1. Header: User ID & Badges -->
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:6px;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="font-weight:900; color:#f8fafc; font-size:1rem; letter-spacing:0.3px;">${userId}</span>
                            ${realName ? `<span style="font-size:0.84rem; color:#93c5fd; font-weight:700;">${realName}</span>` : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                            ${adminBadge}
                            ${statusBadge}
                            ${lottoPermBadge}
                            ${totoPermBadge}
                            ${purchaseBadge}
                        </div>
                    </div>

                    <!-- 2. Details Info Grid -->
                    <div style="background:rgba(0,0,0,0.25); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.04); display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:6px; font-size:0.75rem; color:#94a3b8;">
                        <div><i class="fa-solid fa-phone" style="color:#60a5fa; font-size:0.7rem;"></i> 연락처: <strong style="color:#e2e8f0;">${data.phoneNumber || '미등록'}</strong></div>
                        <div><i class="fa-regular fa-calendar" style="color:#a78bfa; font-size:0.7rem;"></i> 가입일: <span style="color:#cbd5e1;">${joinDate}</span></div>
                        <div style="grid-column: 1 / -1;"><i class="fa-solid fa-receipt" style="color:#34d399; font-size:0.7rem;"></i> 최근 구매: <strong style="color:#e2e8f0;">${lastRoundText}</strong></div>
                    </div>
                    ${reasonText}

                    <!-- 3. Mobile-First Responsive Action Button Grid -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(88px, 1fr)); gap:5px; margin-top:2px;">
                        <button type="button" onclick="window.viewUserAgreementDoc('${userId}')" title="가입 전자 서명 서약서 열람" style="background:rgba(251,191,36,0.15); border:1px solid #fbbf24; color:#fbbf24; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:800; display:flex; align-items:center; justify-content:center; gap:4px; box-sizing:border-box;">
                            <i class="fa-solid fa-file-signature"></i> 서명 문서
                        </button>
                        <button type="button" onclick="window.openEditUserModal('${userId}')" title="회원 정보 및 비밀번호 수정" style="background:linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color:#fff; border:none; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:800; display:flex; align-items:center; justify-content:center; gap:4px; box-shadow:0 2px 6px rgba(59,130,246,0.3); box-sizing:border-box;">
                            <i class="fa-solid fa-user-pen"></i> 정보 수정
                        </button>
                        <button type="button" onclick="window.toggleAdminRole('${userId}', ${isUserAdmin})" title="${adminBtnText}" style="background:${adminBtnColor}; border:${adminBtnBorder}; color:#fff; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:3px; box-sizing:border-box;">
                            <i class="fa-solid fa-crown" style="color:#fbbf24;"></i> ${adminBtnText}
                        </button>
                        <button type="button" onclick="window.togglePermanentStatus('${userId}', ${isPermanent})" title="${permBtnText}" style="background:${permBtnColor}; border:${permBtnBorder}; color:#fff; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:3px; box-sizing:border-box;">
                            <i class="fa-solid fa-gem" style="color:#38bdf8;"></i> ${permBtnText}
                        </button>
                        <button type="button" onclick="window.toggleUserStatus('${userId}', '${status}')" title="${toggleBtnText}" style="background:${toggleBtnColor}; color:#fff; border:none; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:3px; box-sizing:border-box;">
                            <i class="fa-solid ${toggleIcon}"></i> ${toggleBtnText}
                        </button>
                        <button type="button" onclick="window.deleteUser('${userId}')" title="계정 삭제" style="background:#ef4444; color:#fff; border:none; padding:6px 4px; border-radius:6px; cursor:pointer; font-size:0.72rem; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:3px; box-sizing:border-box;">
                            <i class="fa-solid fa-trash-can"></i> 삭제
                        </button>
                    </div>
                </div>
                `;
            });
            userListContainer.innerHTML = html;
        } catch (error) {
            console.error(error);
            userListContainer.innerHTML = `<div style="text-align:center; padding: 20px; color:#ef4444;">데이터를 불러오는 중 오류가 발생했습니다.</div>`;
        }
    }

    window.viewUserAgreementDoc = async function(userId) {
        if (!window.db) return;
        try {
            let docData = null;
            // 1. Try lotto_agreements collection first
            try {
                const agrDoc = await window.db.collection('lotto_agreements').doc(userId).get();
                if (agrDoc.exists) docData = agrDoc.data();
            } catch(e){}

            // 2. Fallback to lotto_users embedded agreementDoc
            if (!docData) {
                const userDoc = await window.db.collection('lotto_users').doc(userId).get();
                if (userDoc.exists) {
                    const u = userDoc.data();
                    docData = u.agreementDoc || {
                        userId: userId,
                        realName: u.realName || userId,
                        phoneNumber: u.phoneNumber || '미등록',
                        authProvider: u.authProvider || (userId.startsWith('kakao_') ? 'kakao' : 'local'),
                        kakaoId: u.kakaoId || (userId.startsWith('kakao_') ? userId.replace('kakao_', '') : null),
                        agreedDateFormatted: u.createdAt ? u.createdAt.slice(0, 10) : '가입일자 미상',
                        signatureDataUrl: null
                    };
                }
            }

            if (!docData) {
                alert('해당 회원의 전자 서약서 데이터를 찾을 수 없습니다.');
                return;
            }

            window.currentViewingAgreementData = docData;

            const container = document.getElementById('agreementDocContent');
            if (!container) return;

            const sigHtml = docData.signatureDataUrl 
                ? `<div style="text-align:right; margin-top:8px;">
                     <span style="font-size:0.8rem; color:#64748b; font-weight:700; margin-right:8px;">자필 전자 서명 날인:</span>
                     <img src="${docData.signatureDataUrl}" style="max-height:60px; vertical-align:middle; border-bottom:1px solid #0f172a; padding:2px 10px; background:#fff; border-radius:4px;" alt="서명">
                   </div>`
                : `<div style="text-align:right; margin-top:8px; color:#94a3b8; font-size:0.82rem;">(전자 인증 완료 / 자필 서명 이미지 없음)</div>`;

            let termsHtml = '';
            if (Array.isArray(docData.terms)) {
                termsHtml = docData.terms.map((t, idx) => `
                    <div style="margin-bottom:10px; padding:10px; background:#f1f5f9; border-radius:6px; border:1px solid #e2e8f0;">
                        <div style="font-weight:800; color:#0f172a; font-size:0.86rem;">✅ ${t.title || `[필수 ${idx+1}] 약관`}</div>
                        <div style="color:#475569; font-size:0.78rem; margin-top:4px; line-height:1.5; white-space:pre-line;">
                            ${t.fullContent || '약관에 정상 동의하였습니다.'}
                        </div>
                    </div>
                `).join('');
            } else {
                const stdTerms = getStandardAgreementTerms();
                termsHtml = stdTerms.map((t, idx) => `
                    <div style="margin-bottom:10px; padding:10px; background:#f1f5f9; border-radius:6px; border:1px solid #e2e8f0;">
                        <div style="font-weight:800; color:#0f172a; font-size:0.86rem;">✅ ${t.title}</div>
                        <div style="color:#475569; font-size:0.78rem; margin-top:4px; line-height:1.5; white-space:pre-line;">
                            ${t.fullContent}
                        </div>
                    </div>
                `).join('');
            }

            container.innerHTML = `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:10px;">
                    <div style="font-size:0.75rem; color:#64748b; font-weight:700;">DOCUMENT ID: ${docData.docId || 'AGR-' + docData.userId}</div>
                    <h4 style="margin:4px 0 6px 0; color:#0f172a; font-size:0.95rem; font-weight:800;">1. 서약자(회원) 인적 사항</h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.85rem; color:#475569;">
                        <div>• <strong>아이디</strong> : <span style="color:#0f172a; font-weight:700;">${docData.userId}</span></div>
                        <div>• <strong>성명/닉네임</strong> : <span style="color:#0f172a; font-weight:700;">${docData.realName || docData.userId}</span></div>
                        <div>• <strong>휴대폰 번호</strong> : <span style="color:#0f172a; font-weight:700;">${docData.phoneNumber || '미등록'}</span></div>
                        <div>• <strong>체결 일시</strong> : <span style="color:#2563eb; font-weight:700;">${docData.agreedDateFormatted || docData.createdAt || '-'}</span></div>
                    </div>
                </div>

                <div style="border:1px solid #e2e8f0; border-radius:8px; padding:14px; background:#ffffff; font-size:0.82rem; line-height:1.6; color:#334155;">
                    <h4 style="margin:0 0 8px 0; color:#0f172a; font-size:0.92rem; font-weight:800;">2. 전자 서약 및 동의 전문 내역 (하나의 단일 계약 문서)</h4>
                    ${termsHtml}
                </div>

                <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; padding:14px; margin-top:4px;">
                    <div style="font-size:0.82rem; color:#475569; text-align:center; margin-bottom:6px; font-weight:700;">
                        ${docData.legalPledgeStatement || '위 모든 약관의 전문 내용을 확인하였으며, 대한민국 전자문서 및 전자서명법에 따라 본인이 직접 서명하고 본 전자 계약을 체결합니다.'}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px dashed #cbd5e1; padding-top:8px;">
                        <span style="font-size:0.82rem; color:#0f172a;">서약자 성명: <strong>${docData.realName || docData.userId}</strong></span>
                        ${sigHtml}
                    </div>
                </div>

                <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:8px; padding:12px 14px; margin-top:8px; font-size:0.8rem; color:#334155; line-height:1.6;">
                    <h4 style="margin:0 0 6px 0; color:#0f172a; font-size:0.88rem; font-weight:800;">3. 플랫폼 서비스 제공 및 계약 당사자 (운영사)</h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                        <div>• <strong>상호(법인명)</strong> : <span style="color:#0f172a; font-weight:700;">해피크레딧 (일반과세자)</span></div>
                        <div>• <strong>대표자</strong> : <span style="color:#0f172a; font-weight:700;">박재구</span></div>
                        <div>• <strong>사업자등록번호</strong> : <span style="color:#0f172a; font-weight:700;">322-51-00561</span></div>
                        <div>• <strong>업태 / 종목</strong> : <span>정보통신업 / 응용 소프트웨어 개발 및 공급업</span></div>
                    </div>
                    <div style="margin-top:4px; font-size:0.75rem; color:#64748b;">
                        • <strong>사업장 소재지</strong> : 서울특별시 강남구 봉은사로1길 6, 5층 5159호(논현동, 용천빌딩)
                    </div>
                </div>
            `;

            const modal = document.getElementById('agreementViewerModal');
            if (modal) modal.style.display = 'flex';

        } catch(err) {
            console.error('[viewUserAgreementDoc Error]', err);
            alert('전자 서약서 문서를 불러오는 중 오류가 발생했습니다.');
        }
    };

    // 1. 모바일 & PC 100% 안전 파일 다운로드 (스마트폰 파일 저장 / PC 다운로드 - 앱 절대 종료 안 됨)
    window.downloadAgreementDoc = async function() {
        try {
            const docArea = document.getElementById('agreementDocContent');
            if (!docArea) return;
            const uData = window.currentViewingAgreementData || {};
            const uId = uData.userId || 'user';
            const uName = uData.realName || uId;
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `로또AI_전자서약서_${uName}_${uId}_${dateStr}.html`;

            const fullHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>로또 AI 서비스 이용 및 성공수수료 전자 서약서 - ${uName}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Pretendard", sans-serif; padding: 20px; color: #1e293b; background: #f8fafc; line-height: 1.6; max-width: 800px; margin: 0 auto; }
        .doc-card { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        h2 { color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-top: 0; font-size: 1.35rem; }
        @media print {
            body { background: #ffffff; padding: 0; }
            .doc-card { border: none; box-shadow: none; padding: 0; }
        }
    </style>
</head>
<body>
    <div class="doc-card">
        <h2>📜 로또 AI 서비스 이용 및 성공수수료 전자 서약서</h2>
        ${docArea.innerHTML}
    </div>
</body>
</html>`;

            function triggerDirectDownload() {
                const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    try { document.body.removeChild(a); } catch(e){}
                    URL.revokeObjectURL(url);
                }, 400);

                if (typeof showToast === 'function') {
                    showToast(`📥 [${fileName}] 스마트폰 다운로드 폴더에 안전하게 저장되었습니다.`);
                }
            }

            // 모바일 Web Share API 지원 시 스마트폰 시스템 파일 저장/카카오톡 공유 지원
            if (navigator.share && navigator.canShare && typeof File !== 'undefined') {
                try {
                    const file = new File([fullHtml], fileName, { type: 'text/html' });
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: '로또 AI 전자서약서',
                            text: `[${uName}] 회원의 로또 AI 서비스 이용 및 성공수수료 전자 서약서 문서입니다.`
                        });
                        return;
                    }
                } catch (shareErr) {
                    // 사용자 취소가 아닐 때만 fallback 진행
                    if (shareErr.name === 'AbortError') return;
                    console.warn('[Web Share Fallback to Direct Download]', shareErr);
                }
            }

            triggerDirectDownload();

        } catch(ex) {
            console.error('[downloadAgreementDoc Error]', ex);
            alert('서약서 다운로드 중 오류가 발생했습니다: ' + ex.message);
        }
    };

    // 2. 모바일 친화적 안전 인쇄 (Safe Hidden iframe Print - 새 창을 띄우지 않아 앱이 종료되지 않음)
    window.printAgreementDoc = function() {
        try {
            const docArea = document.getElementById('agreementDocContent');
            if (!docArea) return;

            // Use hidden iframe to avoid opening separate window which crashes PWA on mobile
            let printFrame = document.getElementById('safePrintFrame');
            if (printFrame) {
                printFrame.remove();
            }
            printFrame = document.createElement('iframe');
            printFrame.id = 'safePrintFrame';
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = '0';
            printFrame.style.opacity = '0';
            printFrame.style.pointerEvents = 'none';
            document.body.appendChild(printFrame);

            const frameDoc = printFrame.contentWindow.document;
            frameDoc.open();
            frameDoc.write(`<!DOCTYPE html>
<html>
<head>
    <title>로또 AI 서비스 이용 및 성공수수료 전자 서약서</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Pretendard", sans-serif; padding: 20px; color: #1e293b; }
        h2 { color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-top: 0; }
        @media print {
            button { display: none !important; }
        }
    </style>
</head>
<body>
    <h2>📜 로또 AI 서비스 이용 및 성공수수료 전자 서약서</h2>
    ${docArea.innerHTML}
</body>
</html>`);
            frameDoc.close();

            setTimeout(() => {
                try {
                    printFrame.contentWindow.focus();
                    printFrame.contentWindow.print();
                } catch(pe) {
                    console.warn('[Safe Print Fallback to download]', pe);
                    if (typeof window.downloadAgreementDoc === 'function') {
                        window.downloadAgreementDoc();
                    }
                }
            }, 300);

        } catch(e) {
            console.error('[printAgreementDoc Error]', e);
            if (typeof window.downloadAgreementDoc === 'function') {
                window.downloadAgreementDoc();
            }
        }
    };

    // ========================================================
    // 📋 Mandatory Profile Completion & E-Signature Pledge Gate
    // ========================================================
    let isPledgeDrawing = false;
    let pledgeStrokeCount = 0;

    function initPledgeSignaturePad() {
        const canvas = document.getElementById('pledgeSignatureCanvas');
        const placeholder = document.getElementById('pledgeSigPlaceholder');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        function fillPledgeCanvasWhite() {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.restore();
        }

        function resizePledgeCanvas() {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const ratio = window.devicePixelRatio || 2;
                canvas.width = rect.width * ratio;
                canvas.height = rect.height * ratio;
                ctx.scale(ratio, ratio);
                fillPledgeCanvasWhite();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 3.2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
        resizePledgeCanvas();

        function getPos(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
            let clientY = (e.touches && e.touches.length > 0) ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        function startDraw(e) {
            isPledgeDrawing = true;
            pledgeStrokeCount++;
            if (placeholder) placeholder.style.display = 'none';
            const pos = getPos(e);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y);
            if (e.cancelable && (e.type === 'touchstart' || e.type === 'touchmove')) {
                e.preventDefault();
            }
        }

        function draw(e) {
            if (!isPledgeDrawing) return;
            pledgeStrokeCount++;
            const pos = getPos(e);
            ctx.lineTo(pos.x, pos.y);
            ctx.stroke();
            if (e.cancelable && (e.type === 'touchstart' || e.type === 'touchmove')) {
                e.preventDefault();
            }
        }

        function endDraw() {
            if (!isPledgeDrawing) return;
            isPledgeDrawing = false;
            ctx.closePath();
        }

        canvas.onmousedown = startDraw;
        canvas.onmousemove = draw;
        window.addEventListener('mouseup', endDraw);

        canvas.addEventListener('touchstart', startDraw, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        window.addEventListener('touchend', endDraw);

        window.clearPledgeSignature = function() {
            fillPledgeCanvasWhite();
            pledgeStrokeCount = 0;
            if (placeholder) placeholder.style.display = 'block';
        };

        window.isPledgeSigEmpty = function() {
            return pledgeStrokeCount < 5;
        };

        window.getPledgeSigDataUrl = function() {
            return canvas.toDataURL('image/png');
        };
    }
    window.initPledgeSignaturePad = initPledgeSignaturePad;

    window.openMandatoryPledgeModal = function(userId, userData = {}) {
        const modal = document.getElementById('mandatoryPledgeModal');
        if (!modal) return;

        const idHidden = document.getElementById('pledgeUserId');
        const realNameInput = document.getElementById('pledgeRealName');
        const phoneInput = document.getElementById('pledgePhone');
        const agreeCb = document.getElementById('pledgeAgreeAll');
        const errEl = document.getElementById('pledgeError');

        if (idHidden) idHidden.value = userId;
        if (realNameInput) realNameInput.value = (userData.realName && !userData.realName.startsWith('카카오_') && !userData.realName.startsWith('kakao_')) ? userData.realName : '';
        if (phoneInput) {
            const rawPhone = (userData.phoneNumber && !userData.phoneNumber.includes('카카오') && userData.phoneNumber !== '미등록') ? userData.phoneNumber : '';
            phoneInput.value = formatPhoneNumber(rawPhone);
            phoneInput.oninput = (e) => { e.target.value = formatPhoneNumber(e.target.value); };
        }
        if (agreeCb) agreeCb.checked = false;
        if (errEl) errEl.style.display = 'none';

        modal.style.display = 'flex';
        modal.classList.add('active');
        modal.classList.remove('hidden');

        setTimeout(initPledgeSignaturePad, 120);
    };

    window.saveMandatoryPledge = async function(e) {
        if (e && e.preventDefault) e.preventDefault();

        const idHidden = document.getElementById('pledgeUserId');
        const realNameInput = document.getElementById('pledgeRealName');
        const phoneInput = document.getElementById('pledgePhone');
        const agreeCb = document.getElementById('pledgeAgreeAll');
        const errEl = document.getElementById('pledgeError');
        const submitBtn = document.getElementById('btnSubmitPledge');

        let userId = idHidden ? idHidden.value.trim() : '';
        if (!userId) userId = SafeAuth.get() || '';
        const realName = realNameInput ? realNameInput.value.trim() : '';
        const rawPhone = phoneInput ? phoneInput.value.trim() : '';

        function showPledgeError(msg) {
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = 'block';
                errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            alert(msg);
        }

        if (errEl) errEl.style.display = 'none';

        if (!userId) {
            showPledgeError('⚠️ 사용자 로그인 세션을 찾을 수 없습니다. 다시 로그인해 주세요.');
            return;
        }

        if (!realName || realName.length < 2) {
            showPledgeError('⚠️ 회원 실명(이름)을 2자 이상 정확히 입력해 주세요.');
            return;
        }

        if (!rawPhone || !validatePhoneNumber(rawPhone)) {
            showPledgeError('⚠️ 올바른 휴대폰 번호(010-0000-0000)를 입력해 주세요.');
            return;
        }
        const cleanPhone = formatPhoneNumber(rawPhone);

        if (!agreeCb || !agreeCb.checked) {
            showPledgeError('⚠️ 4대 필수 약정 전문 확인 및 서약 동의에 체크해 주세요.');
            return;
        }

        if (typeof window.isPledgeSigEmpty === 'function' && window.isPledgeSigEmpty()) {
            showPledgeError('⚠️ 하단 서명란에 스마트폰 터치 또는 마우스로 직접 자필 서명 날인해 주세요.');
            const sigBox = document.getElementById('pledgeSignatureCanvas');
            if (sigBox) sigBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
        if (!firestore) {
            showPledgeError('데이터베이스에 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 서약서 체결 및 등록 중...';
            }

            // Phone Duplicate Check (excluding self)
            try {
                const snap = await firestore.collection('lotto_users').where('phoneNumber', '==', cleanPhone).get();
                let isDuplicate = false;
                snap.forEach(doc => {
                    if (doc.id !== userId) isDuplicate = true;
                });

                if (isDuplicate) {
                    showPledgeError('⚠️ 이미 다른 계정에 등록된 휴대폰 번호입니다. 1인 1계정 원칙에 따라 중복 등록할 수 없습니다.');
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<i class="fa-solid fa-file-signature"></i> 전자 서약 완료 및 시스템 시작하기';
                    }
                    return;
                }
            } catch(phoneCheckErr) {
                console.warn('[Phone Duplicate Check Handled]', phoneCheckErr);
            }

            const sigDataUrl = (typeof window.getPledgeSigDataUrl === 'function') ? window.getPledgeSigDataUrl() : null;
            const now = new Date();
            const formattedDate = `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일 ${String(now.getHours()).padStart(2, '0')}시 ${String(now.getMinutes()).padStart(2, '0')}분`;

            // Construct Single Unified Electronic Agreement & Pledge Document
            const agreementDocument = {
                docId: `AGR-${userId}-${Date.now()}`,
                documentTitle: '로또 AI 퀀트 서비스 이용 및 성공수수료 전자 서약서',
                userId: userId,
                realName: realName,
                phoneNumber: cleanPhone,
                createdAt: now.toISOString(),
                agreedDateFormatted: formattedDate,
                userAgent: navigator.userAgent,
                terms: getStandardAgreementTerms(now),
                signatureDataUrl: sigDataUrl,
                legalPledgeStatement: '위 모든 약관의 전문 내용을 확인하였으며 본인이 직접 자필 서명 날인하고 본 전자 계약을 체결합니다.',
                status: 'legally_binding'
            };

            // Use set with merge: true for absolute safety (works whether doc exists or not)
            await firestore.collection('lotto_users').doc(userId).set({
                userId: userId,
                realName: realName,
                phoneNumber: cleanPhone,
                status: 'active',
                agreementDoc: agreementDocument,
                agreedTerms: {
                    feeAgreement: true,
                    weeklyPurchaseAgreement: true,
                    privacyAgreement: true,
                    algoDisclaimer: true,
                    agreedAt: now.toISOString(),
                    hasSignature: true
                }
            }, { merge: true });

            try {
                await firestore.collection('lotto_agreements').doc(userId).set(agreementDocument);
            } catch(e) {}

            // Close all modals
            const modal = document.getElementById('mandatoryPledgeModal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
                modal.classList.add('hidden');
            }
            const loginModal = document.getElementById('loginModalOverlay');
            if (loginModal) {
                loginModal.setAttribute('style', 'display: none !important; visibility: hidden !important; opacity: 0 !important;');
                loginModal.classList.remove('active');
                loginModal.classList.add('hidden');
            }

            SafeAuth.set(userId);
            showToast(`🎉 [${realName}]님, 필수 정보 등록 및 전자 서약이 완료되었습니다!`);

            // Unlock and reveal landing page directly
            const landingPage = document.getElementById('landingPage');
            if (landingPage) {
                landingPage.classList.add('active');
                landingPage.style.display = 'flex';
            }

            if (typeof initFirebaseAndData === 'function') {
                try { initFirebaseAndData(); } catch(e){}
            }
            if (typeof window.renderLandingDashboard === 'function') {
                try { window.renderLandingDashboard(); } catch(e){}
            }

            // Fallback re-check
            setTimeout(() => {
                checkAuthOnLoad(initFirebaseAndData);
            }, 300);

        } catch (err) {
            console.error('[saveMandatoryPledge Error]', err);
            showPledgeError('서약서 저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-file-signature"></i> 전자 서약 완료 및 시스템 시작하기';
            }
        }
    };

    window.openEditUserModal = async function(userId) {
        if (!window.db) return;
        try {
            const doc = await window.db.collection('lotto_users').doc(userId).get();
            if (!doc.exists) {
                alert('사용자 정보를 찾을 수 없습니다.');
                return;
            }
            const data = doc.data();
            
            const elHidden = document.getElementById('editUserIdHidden');
            const elId = document.getElementById('editUserId');
            const elName = document.getElementById('editUserRealName');
            const elPhone = document.getElementById('editUserPhone');
            const elPw = document.getElementById('editUserNewPassword');

            if (elHidden) elHidden.value = userId;
            if (elId) elId.value = userId;
            if (elName) elName.value = data.realName || '';
            if (elPhone) elPhone.value = data.phoneNumber || '';
            if (elPw) elPw.value = '';
            
            // Program Permissions
            const chkLotto = document.getElementById('editUserAllowLotto');
            const chkToto = document.getElementById('editUserAllowToto');
            if (chkLotto) chkLotto.checked = (data.allowLotto !== false);
            if (chkToto) chkToto.checked = (data.allowToto !== false);

            // Determine Role
            const isUserAdmin = !!(data.isAdmin === true || data.role === 'admin' || userId === 'master' || userId === 'admin');
            const isPermanent = !!(data.isPermanent === true || data.userType === 'permanent');
            
            const elRole = document.getElementById('editUserRole');
            if (elRole) {
                if (isUserAdmin) elRole.value = 'admin';
                else if (isPermanent) elRole.value = 'permanent';
                else elRole.value = 'regular';
            }

            const elStatus = document.getElementById('editUserStatus');
            if (elStatus) {
                elStatus.value = (data.status === 'suspended' || data.status === 'suspended_nopurchase') ? 'suspended' : 'active';
            }

            const modal = document.getElementById('editUserModal');
            if (modal) modal.style.display = 'flex';
        } catch(err) {
            console.error('[openEditUserModal Error]', err);
            alert('회원 정보 로드 중 오류가 발생했습니다.');
        }
    };

    window.saveEditedUser = async function(e) {
        if (e && e.preventDefault) e.preventDefault();
        const userId = document.getElementById('editUserIdHidden')?.value;
        if (!userId || !window.db) return;

        const realName = (document.getElementById('editUserRealName')?.value || '').trim();
        const phone = (document.getElementById('editUserPhone')?.value || '').trim();
        const newPw = (document.getElementById('editUserNewPassword')?.value || '').trim();
        const roleVal = document.getElementById('editUserRole')?.value || 'regular';
        const statusVal = document.getElementById('editUserStatus')?.value || 'active';

        const chkAllowLotto = document.getElementById('editUserAllowLotto');
        const chkAllowToto = document.getElementById('editUserAllowToto');
        const allowLotto = chkAllowLotto ? chkAllowLotto.checked : true;
        const allowToto = chkAllowToto ? chkAllowToto.checked : true;

        const btnSubmit = document.getElementById('btnSaveEditedUser');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 저장 중...`;
        }

        try {
            const updatePayload = {
                realName: realName || userId,
                phoneNumber: phone || '',
                allowLotto: allowLotto,
                allowToto: allowToto,
                status: statusVal,
                updatedAt: new Date().toISOString()
            };

            if (statusVal === 'active') {
                updatePayload.suspensionReason = null;
                updatePayload.suspendedAt = null;
            }

            if (roleVal === 'admin') {
                updatePayload.isAdmin = true;
                updatePayload.role = 'admin';
                updatePayload.isPermanent = true;
                updatePayload.userType = 'permanent';
                setIsAdminCache(userId, true);
            } else if (roleVal === 'permanent') {
                updatePayload.isAdmin = false;
                updatePayload.role = 'user';
                updatePayload.isPermanent = true;
                updatePayload.userType = 'permanent';
                setIsAdminCache(userId, false);
            } else {
                updatePayload.isAdmin = false;
                updatePayload.role = 'user';
                updatePayload.isPermanent = false;
                updatePayload.userType = 'regular';
                setIsAdminCache(userId, false);
            }

            if (newPw) {
                if (newPw.length < 4) {
                    alert('비밀번호는 최소 4자 이상이어야 합니다.');
                    if (btnSubmit) {
                        btnSubmit.disabled = false;
                        btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> 변경사항 저장하기`;
                    }
                    return;
                }
                const pwHash = await hashPassword(newPw, userId);
                updatePayload.passwordHash = pwHash;
                updatePayload.loginFailCount = 0;
                updatePayload.lockoutUntil = null;
            }

            await window.db.collection('lotto_users').doc(userId).update(updatePayload);
            setIsPermanentCache(userId, updatePayload.isPermanent || updatePayload.isAdmin);
            setUserPermissionsCache(userId, { allowLotto, allowToto });

            showToast(`✅ [${userId}] 회원 정보(이름/비밀번호/권한)가 성공적으로 수정되었습니다.`);
            
            const modal = document.getElementById('editUserModal');
            if (modal) modal.style.display = 'none';

            if (typeof window.loadUserList === 'function') {
                window.loadUserList();
            }
        } catch(err) {
            console.error('[saveEditedUser Error]', err);
            alert('회원 정보 저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = `<i class="fa-solid fa-check"></i> 변경사항 저장하기`;
            }
        }
    };

    window.toggleAdminRole = async function(userId, currentAdmin) {
        if (userId === 'master' || userId === 'admin') {
            alert('최상위 마스터 계정은 관리자 권한을 해제할 수 없습니다.');
            return;
        }
        const actionText = currentAdmin ? '관리자 권한을 해제' : '관리자(Admin) 권한을 지정';
        if (!confirm(`[${userId}] 계정에 ${actionText}하시겠습니까?\n(관리자로 지정되면 모든 이용자의 구매내역 조회 및 사용자 관리 권한이 부여됩니다)`)) return;

        try {
            const nextAdmin = !currentAdmin;
            const updatePayload = {
                isAdmin: nextAdmin,
                role: nextAdmin ? 'admin' : 'user'
            };
            if (nextAdmin) {
                updatePayload.isPermanent = true;
                updatePayload.status = 'active';
                updatePayload.suspensionReason = null;
                updatePayload.suspendedAt = null;
            }
            await window.db.collection('lotto_users').doc(userId).update(updatePayload);
            setIsAdminCache(userId, nextAdmin);
            setIsPermanentCache(userId, nextAdmin);
            showToast(`👑 [${userId}] ${nextAdmin ? '관리자(Admin)로 지정되었습니다!' : '관리자 권한이 해제되었습니다.'}`);
            loadUserList();
        } catch(err) {
            alert('관리자 상태 변경 실패');
            console.error(err);
        }
    };

    window.togglePermanentStatus = async function(userId, currentPermanent) {
        if (userId === 'master' || userId === 'admin') {
            alert('마스터/관리자 계정은 항상 영구 사용 권한이 부여되어 있습니다.');
            return;
        }
        const actionText = currentPermanent ? '영구 사용 권한을 해제' : '영구 사용(실구매 의무 평생 면제) 권한을 부여';
        if (!confirm(`[${userId}] 계정의 ${actionText}하시겠습니까?`)) return;

        try {
            const nextPermanent = !currentPermanent;
            const updatePayload = {
                isPermanent: nextPermanent,
                userType: nextPermanent ? 'permanent' : 'regular'
            };
            if (nextPermanent) {
                updatePayload.status = 'active';
                updatePayload.suspensionReason = null;
                updatePayload.suspendedAt = null;
            }
            await window.db.collection('lotto_users').doc(userId).update(updatePayload);
            setIsPermanentCache(userId, nextPermanent);
            showToast(`💎 [${userId}] ${nextPermanent ? '영구 사용(실구매 면제) 권한이 부여되었습니다.' : '영구 사용 권한이 해제되었습니다.'}`);
            loadUserList();
        } catch (err) {
            alert('영구 사용 상태 변경 실패');
            console.error(err);
        }
    };

    window.resetUserPassword = async function(userId) {
        const newPw = prompt(`[${userId}] 계정의 새로운 비밀번호를 입력해주세요.\n(8자 이상, 영문+숫자+특수문자 포함 권장)`);
        if (!newPw) return;
        if (newPw.length < 4) {
            alert('비밀번호는 최소 4자 이상이어야 합니다.');
            return;
        }
        try {
            const pwHash = await hashPassword(newPw.trim(), userId);
            await window.db.collection('lotto_users').doc(userId).update({
                passwordHash: pwHash,
                loginFailCount: 0,
                lockoutUntil: null
            });
            alert(`[${userId}] 계정의 비밀번호가 성공적으로 변경되었습니다.`);
        } catch (err) {
            alert('비밀번호 변경 실패');
            console.error(err);
        }
    };

    window.toggleUserStatus = async function(userId, currentStatus) {
        const isCurrentlySuspended = (currentStatus === 'suspended' || currentStatus === 'suspended_nopurchase');
        
        if (isCurrentlySuspended) {
            if (!confirm(`[${userId}] 계정의 이용 정지를 해제하고 '정상 활성' 상태로 복구하시겠습니까?`)) return;
            try {
                await window.db.collection('lotto_users').doc(userId).update({
                    status: 'active',
                    suspensionReason: null,
                    suspendedAt: null
                });
                showToast(`🎉 [${userId}] 계정의 이용 정지가 해제되었습니다.`);
                loadUserList();
            } catch (err) {
                alert('상태 변경 실패');
                console.error(err);
            }
        } else {
            const customReason = prompt(`[${userId}] 계정을 이용 정지하시겠습니까?\n정지 사유를 입력하세요:`, '관리자에 의한 수동 이용정지');
            if (customReason === null) return;
            try {
                await window.db.collection('lotto_users').doc(userId).update({
                    status: 'suspended',
                    suspensionReason: customReason.trim() || '관리자에 의한 수동 이용정지',
                    suspendedAt: new Date().toISOString()
                });
                showToast(`🚫 [${userId}] 계정이 이용 정지되었습니다.`);
                loadUserList();
            } catch (err) {
                alert('상태 변경 실패');
                console.error(err);
            }
        }
    };

    window.autoSuspendAllNonPurchasers = async function(isSilent = false) {
        if (!isSilent) {
            if (!confirm(`⚡ [미구매자 일괄 자동 정지 검사]\n\n직전 주차 실구매 미등록 일반 회원을 전수 검사하여 자동으로 이용 정지 처리하시겠습니까?\n(영구 사용 회원 및 신규 유예 회원은 제외됩니다)`)) return;
        }
        
        if (!window.db) {
            if (!isSilent) alert('DB 연결이 필요합니다.');
            return;
        }

        try {
            if (!isSilent) showToast('🔍 전 회원 실구매 이력 전수 검사 중...');
            const snapshot = await window.db.collection('lotto_users').get();
            let suspendedCount = 0;
            let activeCount = 0;
            let permanentCount = 0;
            const latestRound = getLatestDrawnRound();

            for (const doc of snapshot.docs) {
                const userId = doc.id;
                const data = doc.data();
                if (userId === 'master' || userId === 'admin' || data.isAdmin === true || data.role === 'admin') {
                    permanentCount++;
                    continue;
                }

                const pStatus = await checkUserWeeklyPurchaseStatus(userId, data);
                if (pStatus.isPermanent) {
                    permanentCount++;
                    continue;
                }

                if (!pStatus.isGracePeriod && !pStatus.hasPurchased) {
                    if (data.status === 'active') {
                        const reason = `제 ${latestRound}회차 실구매 미등록으로 인한 자동 이용정지`;
                        await window.db.collection('lotto_users').doc(userId).update({
                            status: 'suspended_nopurchase',
                            suspensionReason: reason,
                            suspendedAt: new Date().toISOString()
                        });
                        suspendedCount++;
                    }
                } else {
                    activeCount++;
                }
            }

            if (!isSilent) {
                alert(`✅ 일괄 검사 완료!\n\n- 신규 정지 처리: ${suspendedCount}명\n- 정상 구매 회원: ${activeCount}명\n- 영구 사용 회원(면제): ${permanentCount}명`);
                loadUserList();
            } else {
                console.log(`[Background Auto-Suspend on Draw] Suspended: ${suspendedCount}, Active: ${activeCount}, Exempt: ${permanentCount}`);
                if (suspendedCount > 0) {
                    showToast(`⚡ 최신 당첨 발표에 따라 미구매 회원 ${suspendedCount}명이 자동 정지되었습니다.`);
                }
            }
            return { suspendedCount, activeCount, permanentCount };
        } catch(e) {
            console.error('[Batch Auto Suspend Error]', e);
            if (!isSilent) alert('일괄 처리 중 오류가 발생했습니다.');
        }
    };

    window.deleteUser = async function(userId) {
        if (!confirm(`경고: 정말로 [${userId}] 계정을 영구 삭제하시겠습니까?`)) return;
        try {
            await window.db.collection('lotto_users').doc(userId).delete();
            loadUserList();
        } catch (err) {
            alert('계정 삭제 실패');
            console.error(err);
        }
    };

    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newId = document.getElementById('addUserId').value.trim();
            const newPhone = (document.getElementById('addUserPhone') ? document.getElementById('addUserPhone').value : '').trim();
            const newPw = document.getElementById('addUserPw').value.trim();
            const chkPermanent = document.getElementById('chkAddPermanent');
            const chkAdmin = document.getElementById('chkAddAdmin');
            const chkAllowLotto = document.getElementById('chkAddAllowLotto');
            const chkAllowToto = document.getElementById('chkAddAllowToto');
            const isPermanent = chkPermanent ? chkPermanent.checked : false;
            const isAdmin = chkAdmin ? chkAdmin.checked : false;
            const allowLotto = chkAllowLotto ? chkAllowLotto.checked : true;
            const allowToto = chkAllowToto ? chkAllowToto.checked : true;

            if (!newId || !newPw) {
                showToast('⚠️ 아이디와 비밀번호를 모두 입력해주세요.');
                return;
            }

            if (!window.db) {
                showToast('⚠️ DB 연결이 없어 계정을 생성할 수 없습니다.');
                return;
            }

            let cleanPhone = '';
            if (newPhone) {
                if (!validatePhoneNumber(newPhone)) {
                    showToast('⚠️ 올바른 휴대폰 번호(010-0000-0000)를 입력해주세요.');
                    return;
                }
                cleanPhone = formatPhoneNumber(newPhone);
                const digitsPhone = newPhone.replace(/[^0-9]/g, '');

                // Check duplicate phone in admin creation
                try {
                    const snap1 = await window.db.collection('lotto_users').where('phoneNumber', '==', cleanPhone).get();
                    let isDuplicatePhone = !snap1.empty;
                    if (!isDuplicatePhone) {
                        const snap2 = await window.db.collection('lotto_users').where('phoneNumber', '==', digitsPhone).get();
                        if (!snap2.empty) isDuplicatePhone = true;
                    }
                    if (isDuplicatePhone) {
                        alert('⚠️ 이미 등록된 휴대폰 번호입니다. 다른 번호를 입력해주세요.');
                        return;
                    }
                } catch (pe) {
                    console.error('[Admin Phone Check Error]', pe);
                }
            }

            const submitBtn = addUserForm.querySelector('button[type="submit"]');
            const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 생성 중...';
            }

            try {
                const pwHash = await hashPassword(newPw, newId);
                const userPayload = {
                    userId: newId,
                    passwordHash: pwHash,
                    status: 'active',
                    isAdmin: isAdmin,
                    role: isAdmin ? 'admin' : 'user',
                    isPermanent: isPermanent || isAdmin,
                    userType: (isPermanent || isAdmin) ? 'permanent' : 'regular',
                    allowLotto: allowLotto,
                    allowToto: allowToto,
                    createdAt: new Date().toISOString(),
                    agreedTerms: {
                        feeAgreement: true,
                        weeklyPurchaseAgreement: true,
                        privacyAgreement: true,
                        agreedAt: new Date().toISOString()
                    },
                    loginFailCount: 0,
                    lockoutUntil: null
                };

                if (cleanPhone) {
                    userPayload.phoneNumber = cleanPhone;
                }

                await window.db.collection('lotto_users').doc(newId).set(userPayload);
                setIsPermanentCache(newId, isPermanent || isAdmin);
                setIsAdminCache(newId, isAdmin);
                setUserPermissionsCache(newId, { allowLotto, allowToto });
                addUserForm.reset();
                loadUserList();
                showToast(`🎉 [${newId}] ${isAdmin ? '👑 관리자 계정' : (isPermanent ? '💎 영구 사용 계정' : '사용자 계정')}이 생성되었습니다!`);
            } catch (error) {
                console.error(error);
                showToast('❌ 계정 생성 중 오류가 발생했습니다.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = origBtnHtml;
                }
            }
        });
    }

    // ========================================================
    // ⏱️ 10-Minute Inactivity Auto-Logout Controller
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
                alert('🔒 [보안 자동 로그아웃]\n\n10분 동안 활동이 없어 고객님의 개인정보 및 계정 보안을 위해 자동으로 로그아웃되었습니다.');
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
    setupInactivityAutoLogout();

    // ========================================================
    // 🚨 Weekly Purchase Deadline Countdown Banner Controller
    // ========================================================
    let countdownIntervalId = null;

    function getNextSaturday20PM() {
        const now = new Date();
        const day = now.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
        const diffToSat = (6 - day + 7) % 7;
        const target = new Date(now);
        target.setDate(now.getDate() + diffToSat);
        target.setHours(20, 0, 0, 0);

        // If today is Saturday and after 20:00, target next Saturday
        if (diffToSat === 0 && now.getTime() > target.getTime()) {
            target.setDate(target.getDate() + 7);
        }
        return target;
    }

    export async function updatePurchaseDeadlineCountdowns() {
        const authId = SafeAuth.get();
        const lpBanner = document.getElementById('lpPurchaseDeadlineBanner');
        const lottoBanner = document.getElementById('lottoPurchaseDeadlineBanner');

        if (!authId) {
            if (lpBanner) lpBanner.style.display = 'none';
            if (lottoBanner) lottoBanner.style.display = 'none';
            return;
        }

        let uData = null;
        let isUserAdmin = isAdminUser(authId);
        try {
            if (window.db) {
                const doc = await window.db.collection('lotto_users').doc(authId).get();
                if (doc.exists) {
                    uData = doc.data();
                    if (uData.isAdmin === true || uData.role === 'admin') isUserAdmin = true;
                }
            }
        } catch(e) {}

        const pStatus = await checkUserWeeklyPurchaseStatus(authId, uData);
        const targetRound = pStatus.targetRound || getUpcomingLottoRound();

        const targetSaturday = getNextSaturday20PM();

        function renderBannerHtml() {
            const now = new Date();
            const diffMs = targetSaturday.getTime() - now.getTime();

            if (diffMs <= 0) {
                return `
                <div style="background:rgba(245,158,11,0.15); border:1px solid #f59e0b; border-radius:12px; padding:12px 16px; color:#f8fafc; font-size:0.85rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <div><i class="fa-solid fa-hourglass-end" style="color:#f59e0b;"></i> [제 ${targetRound}회차] 이번 주 복권 판매 및 등록이 마감되었습니다. (추첨 진행 중)</div>
                </div>
                `;
            }

            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

            const timeStr = `${days > 0 ? `<strong style="color:#fbbf24; font-size:1.05rem;">${days}</strong>일 ` : ''}<strong style="color:#fbbf24; font-size:1.05rem;">${String(hours).padStart(2, '0')}</strong>시간 <strong style="color:#fbbf24; font-size:1.05rem;">${String(minutes).padStart(2, '0')}</strong>분 <strong style="color:#fbbf24; font-size:1.05rem;">${String(seconds).padStart(2, '0')}</strong>초`;

            // If user has NOT purchased and is a regular user (urgent warning)
            if (!pStatus.hasPurchased && !pStatus.isPermanent && !isUserAdmin) {
                return `
                <div style="background: linear-gradient(135deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.28) 100%); border: 1.5px solid #ef4444; border-radius: 12px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.25); box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:38px; height:38px; border-radius:50%; background:rgba(239,68,68,0.25); border:1px solid #ef4444; color:#f87171; display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0;">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <div>
                            <div style="font-weight:900; color:#fca5a5; font-size:0.92rem; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span>🚨 [제 ${targetRound}회차] 실구매 5게임 등록 마감 임박!</span>
                                <span style="background:#ef4444; color:#fff; font-size:0.7rem; padding:1px 5px; border-radius:4px; font-weight:800;">미등록 시 정지</span>
                            </div>
                            <div style="color:#f8fafc; font-size:0.84rem; margin-top:2px;">
                                마감까지 <span style="letter-spacing:0.5px;">${timeStr}</span> 남았습니다!
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="document.getElementById('btnOpenManualLedger') ? document.getElementById('btnOpenManualLedger').click() : (window.showLotto && (showLotto(), setTimeout(() => document.getElementById('btnOpenManualLedger') && document.getElementById('btnOpenManualLedger').click(), 200)))" style="background:linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color:#fff; border:none; padding:8px 14px; border-radius:8px; font-size:0.82rem; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 3px 10px rgba(239,68,68,0.4); white-space:nowrap;">
                        <i class="fa-solid fa-cart-plus"></i> 지금 구매등록하기
                    </button>
                </div>
                `;
            } else {
                // Verified or Exempt
                const statusTitle = isUserAdmin ? '👑 관리자 계정 (실구매 등록 면제)' : (pStatus.isPermanent ? '💎 영구 회원 (주간 실구매 평생 면제)' : `✅ [제 ${targetRound}회차] 실구매 ${pStatus.targetRoundGameCount || 5}게임 인증 완료`);
                return `
                <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 10px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; box-sizing:border-box;">
                    <div style="display:flex; align-items:center; gap:8px; font-size:0.84rem; color:#6ee7b7; font-weight:700;">
                        <i class="fa-solid fa-circle-check" style="font-size:1.1rem; color:#10b981;"></i>
                        <span>${statusTitle}</span>
                    </div>
                    <div style="font-size:0.78rem; color:#94a3b8;">
                        차기 추첨까지: <span style="color:#cbd5e1; font-weight:700;">${days > 0 ? days + '일 ' : ''}${hours}시간 ${minutes}분 남음</span>
                    </div>
                </div>
                `;
            }
        }

        const bannerHtml = renderBannerHtml();
        if (lpBanner) {
            lpBanner.innerHTML = bannerHtml;
            lpBanner.style.display = 'block';
        }
        if (lottoBanner) {
            lottoBanner.innerHTML = bannerHtml;
            lottoBanner.style.display = 'block';
        }

        if (countdownIntervalId) clearInterval(countdownIntervalId);
        countdownIntervalId = setInterval(() => {
            const updatedHtml = renderBannerHtml();
            if (lpBanner && lpBanner.style.display !== 'none') lpBanner.innerHTML = updatedHtml;
            if (lottoBanner && lottoBanner.style.display !== 'none') lottoBanner.innerHTML = updatedHtml;
        }, 1000);
    }
    window.updatePurchaseDeadlineCountdowns = updatePurchaseDeadlineCountdowns;

}
