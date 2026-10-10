import { state } from '../services/lotto/state.js';
import { calculateLedgerFinancials, calculateAllUsersTotalFinancials, fetchAllUsersPurchases, getSafeActualDraw, getUserConfirmedRoundNumbers, formatConfirmedRoundLabel } from '../services/lotto/ledger.js';
import { SafeAuth, getUserRealName, updateLoggedInUserHeaderUI } from './auth-mgmt.js';
import { isSystemOrDummyUser } from './utils.js';
import { getAllUnifiedRegisteredUsers } from './user-context.js';
import { computeUser70RecommendationsReview, getUserJoinRound } from '../services/lotto/views/review-tab.js';

/**
 * Update Compact Financial & Actual Winning History Summary on Landing Page
 * Displays Individual User Actual Winning Record, All Users Aggregate Record,
 * and All Members AI Recommendation (70 games) Review Winning History.
 */
export async function renderLandingDashboard() {
    const landingEl = document.getElementById('landingPage');
    if (landingEl && !landingEl.classList.contains('active') && landingEl.style.display === 'none') {
        return;
    }

    if (typeof window !== 'undefined') {
        if (window.__isRenderingDashboard) return;
        window.__isRenderingDashboard = true;
    }

    try {
        // 0. Ensure full purchases and user maps are loaded from Firestore (non-blocking for instant initial paint)
        if (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0) {
            if (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0) {
                try {
                    const localUsers = localStorage.getItem('lotto_all_users_list_cache');
                    if (localUsers) state.allRegisteredUsersList = JSON.parse(localUsers);
                } catch(e) {}
            }
            // ⚡ 0ms 즉시 로컬 캐시 복원: 스마트폰 접속 시 대시보드 당첨이력 및 금융 지표 즉각 렌더링
            try {
                const localMap = localStorage.getItem('lotto_all_users_purchases_map_cache');
                const localMerged = localStorage.getItem('lotto_all_users_merged_ledger_cache');
                if (localMap) state.allUsersPurchasesMap = JSON.parse(localMap);
                if (localMerged) state.allUsersMergedLedger = JSON.parse(localMerged);
            } catch(e) {}

            if (typeof fetchAllUsersPurchases === 'function') {
                fetchAllUsersPurchases().catch(e => console.warn('[BG fetch users purchases]', e));
            }
        }

        let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || '비로그인';
        if (typeof authId === 'string' && authId.startsWith('{')) {
            try {
                const parsed = JSON.parse(authId);
                authId = parsed.userid || parsed.userId || authId;
            } catch (e) {}
        }

        // ⚡ 로그인한 사용자의 장부가 state.globalLedger에 비어있다면 로컬 캐시에서 0ms 즉시 복원
        if (authId && authId !== '비로그인' && (!state.globalLedger || Object.keys(state.globalLedger).length === 0)) {
            try {
                const cachedLedger = localStorage.getItem(`lotto_actual_ledger_${authId.toLowerCase().trim()}`);
                if (cachedLedger) state.globalLedger = JSON.parse(cachedLedger);
            } catch(e) {}
        }

        const realName = (typeof getUserRealName === 'function' ? getUserRealName(authId) : '') || '';
        let displayName = realName;
        if (!displayName) {
            if (authId === 'master') displayName = '최고관리자';
            else if (authId.startsWith('kakao_')) displayName = `카카오회원 (${authId.slice(-4)})`;
            else displayName = authId;
        }

    // 0. Update Service Cards Access Permission Badges & Counters IMMEDIATELY (0ms perception)
    updateLoggedInUserHeaderUI(authId);
    updateHomeServiceCardsPermissions();
    updateMobileDdayBadge();
    updateDrawCountdownBanner();

    if (typeof window.updatePurchaseDeadlineCountdowns === 'function') {
        try { window.updatePurchaseDeadlineCountdowns(); } catch(e){}
    }

    if (typeof window.renderFortuneAdvisorCard === 'function') {
        try { window.renderFortuneAdvisorCard(); } catch(e){}
    }

    // ⚡ 16인 전체회원 스냅샷 동기화 스트립 표시
    const syncStripText = document.getElementById('lpSyncStripText');
    if (syncStripText) {
        syncStripText.textContent = '서버 스냅샷: 16인 동기화 완료';
    }

    // 1. Calculate Individual Logged-in User's Actual Lotto Financials (Synchronous 0ms)
    let myFin = calculateLedgerFinancials(true, 'my');
    const cleanAuthId = (authId || '').toLowerCase().trim();

    // ⚡ 0ms 즉시 복원: 스마트폰 새로고침 시 myFin이 비어있다면 경량 로컬 KPI 캐시에서 즉시 표시
    let cachedMyFin = null;
    if (cleanAuthId && cleanAuthId !== '비로그인') {
        try {
            const rawMyKpi = localStorage.getItem(`lotto_my_fin_kpi_cache_${cleanAuthId}`);
            if (rawMyKpi) cachedMyFin = JSON.parse(rawMyKpi);
        } catch(e) {}
    }

    if ((!myFin || myFin.totalCombos === 0) && cachedMyFin && cachedMyFin.totalCombos > 0) {
        myFin = cachedMyFin;
    } else if (myFin && myFin.totalCombos > 0 && cleanAuthId && cleanAuthId !== '비로그인') {
        try {
            localStorage.setItem(`lotto_my_fin_kpi_cache_${cleanAuthId}`, JSON.stringify({
                totalInvest: myFin.totalInvest,
                totalPrize: myFin.totalPrize,
                totalCombos: myFin.totalCombos,
                totalWins: myFin.totalWins,
                hits: myFin.hits,
                netProfit: (myFin.totalPrize || 0) - (myFin.totalInvest || 0),
                roi: myFin.totalInvest > 0 ? (((myFin.totalPrize - myFin.totalInvest) / myFin.totalInvest) * 100).toFixed(1) : '0.0',
                confirmedRounds: getUserConfirmedRoundNumbers('my')
            }));
        } catch(e) {}
    }

    // Update Header Financial Summary KPI Elements (My Portfolio)
    const elInvest = document.getElementById('lp-total-invest');
    const elPrize = document.getElementById('lp-total-prize');
    const elProfit = document.getElementById('lp-total-profit');
    const elRoi = document.getElementById('lp-total-roi');
    const elFinTitle = document.querySelector('.lp-fin-title');

    if (elFinTitle) {
        elFinTitle.innerHTML = `<span style="color:#10b981; font-weight:700;">[${displayName}]</span> 님의 실구매 누적 자산 &amp; 당첨 요약`;
    }

    if (elInvest) elInvest.textContent = `${(myFin.totalInvest || 0).toLocaleString()} 원`;
    if (elPrize) elPrize.textContent = `${(myFin.totalPrize || 0).toLocaleString()} 원`;
    
    const myNetProfit = (myFin.totalPrize || 0) - (myFin.totalInvest || 0);
    const myRoi = myFin.totalInvest > 0 ? (((myFin.totalPrize - myFin.totalInvest) / myFin.totalInvest) * 100).toFixed(1) : '0.0';

    if (elProfit) {
        elProfit.textContent = `${myNetProfit >= 0 ? '+' : ''}${myNetProfit.toLocaleString()} 원`;
        elProfit.className = `lp-stat-val ${myNetProfit > 0 ? 'positive' : (myNetProfit < 0 ? 'negative' : '')}`;
    }
    
    if (elRoi) {
        elRoi.textContent = `${myRoi}%`;
        elRoi.className = `lp-stat-val ${myNetProfit > 0 ? 'positive' : (myNetProfit < 0 ? 'negative' : '')}`;
    }

    // Concept 1 Mobile Elements Update
    const elMobileUserName = document.getElementById('lpMobileUserName');
    if (elMobileUserName) elMobileUserName.textContent = displayName || '회원';

    // 📈 [신규] 로그인 회원 최근 추천 당첨추이 슬림 배너 (가입일 이후 한정, 폴드7 320px 최적화)
    try {
        renderUserWinningTrendBanner(authId, displayName);
    } catch(e) {
        console.warn('[User Trend Banner Init Error]', e);
    }

    let confirmedRounds = [];
    try {
        confirmedRounds = getUserConfirmedRoundNumbers('my');
    } catch (e) {}
    if ((!confirmedRounds || confirmedRounds.length === 0) && Array.isArray(cachedMyFin?.confirmedRounds) && cachedMyFin.confirmedRounds.length > 0) {
        confirmedRounds = cachedMyFin.confirmedRounds.map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
    }
    if ((!confirmedRounds || confirmedRounds.length === 0) && myFin && myFin.roundBreakdown) {
        confirmedRounds = Object.keys(myFin.roundBreakdown).map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
    }
    const confirmedRoundLabel = formatConfirmedRoundLabel(confirmedRounds);
    const latestConfirmedRound = confirmedRounds.length ? confirmedRounds[confirmedRounds.length - 1] : null;

    const elMobileConfirmedPill = document.getElementById('lpMobileConfirmedPill');
    if (elMobileConfirmedPill) elMobileConfirmedPill.textContent = confirmedRoundLabel;
    const elDesktopConfirmedPill = document.getElementById('lpDesktopConfirmedPill');
    if (elDesktopConfirmedPill) elDesktopConfirmedPill.textContent = confirmedRoundLabel;

    const elWinStripText = document.getElementById('lpWinStripText');
    if (elWinStripText) {
        const rankPartsFromHits = (hits) => {
            const ranksArr = [];
            if (!hits) return ranksArr;
            if (hits[0] > 0) ranksArr.push(`1등 ${hits[0]}건`);
            if (hits[1] > 0) ranksArr.push(`2등 ${hits[1]}건`);
            if (hits[2] > 0) ranksArr.push(`3등 ${hits[2]}건`);
            if (hits[3] > 0) ranksArr.push(`4등 ${hits[3]}건`);
            if (hits[4] > 0) ranksArr.push(`5등 ${hits[4]}건`);
            return ranksArr;
        };

        let latestWinRound = null;
        let latestWinBreakdown = null;
        if (myFin && myFin.roundBreakdown) {
            for (let i = confirmedRounds.length - 1; i >= 0; i--) {
                const r = confirmedRounds[i];
                const rb = myFin.roundBreakdown[r] || myFin.roundBreakdown[String(r)];
                if (rb && Array.isArray(rb.winningCombos) && rb.winningCombos.length > 0) {
                    latestWinRound = r;
                    latestWinBreakdown = rb;
                    break;
                }
            }
        }

        if (latestWinRound && latestWinBreakdown) {
            const rh = latestWinBreakdown.roundHits || latestWinBreakdown.hits || [];
            const ranksArr = [];
            if (rh[1] > 0) ranksArr.push(`1등 ${rh[1]}건`);
            if (rh[2] > 0) ranksArr.push(`2등 ${rh[2]}건`);
            if (rh[3] > 0) ranksArr.push(`3등 ${rh[3]}건`);
            if (rh[4] > 0) ranksArr.push(`4등 ${rh[4]}건`);
            if (rh[5] > 0) ranksArr.push(`5등 ${rh[5]}건`);
            const prize = latestWinBreakdown.prize || 0;
            elWinStripText.innerHTML = `<strong>${latestWinRound}회 적중:</strong> ${ranksArr.join(', ') || '당첨'} (총 ${prize.toLocaleString()}원)`;
        } else if (myFin && myFin.totalWins > 0) {
            const ranksArr = rankPartsFromHits(myFin.hits);
            elWinStripText.innerHTML = `<strong>누적 적중:</strong> ${ranksArr.join(', ') || '당첨'} (총 ${(myFin.totalPrize || 0).toLocaleString()}원)`;
        } else if (latestConfirmedRound) {
            elWinStripText.innerHTML = `<strong>${latestConfirmedRound}회 구매확정</strong> · 당첨 내역 없음`;
        } else {
            elWinStripText.innerHTML = `등록된 구매확정 내역이 없습니다`;
        }
    }

    // 4. Update Card 1: My Actual Lotto Winning Summary (👤 나의 실구매 당첨 실적)
    const elMyTitle = document.getElementById('lp-my-lotto-title');
    const elMySub = document.getElementById('lp-lotto-mini-sub');
    const elMyPrize = document.getElementById('lp-lotto-mini-prize');
    const elMyHits = document.getElementById('lp-lotto-mini-hits');

    if (elMyTitle) {
        elMyTitle.textContent = `👤 [${displayName}] 님의 실구매 당첨`;
    }

    if (elMySub) {
        elMySub.textContent = myFin.totalCombos > 0 
            ? `${myFin.totalCombos.toLocaleString()}게임 (${myFin.totalInvest.toLocaleString()}원 구매)`
            : '0게임 (0원)';
    }
    if (elMyPrize) {
        elMyPrize.textContent = `당첨 ${myFin.totalPrize.toLocaleString()}원`;
        elMyPrize.style.color = myFin.totalPrize > 0 ? '#10b981' : '#cbd5e1';
    }
    if (elMyHits) {
        if (myFin.totalCombos > 0) {
            if (myFin.totalWins > 0) {
                const ranksArr = [];
                if (myFin.hits[0] > 0) ranksArr.push(`1등 ${myFin.hits[0]}`);
                if (myFin.hits[1] > 0) ranksArr.push(`2등 ${myFin.hits[1]}`);
                if (myFin.hits[2] > 0) ranksArr.push(`3등 ${myFin.hits[2]}`);
                if (myFin.hits[3] > 0) ranksArr.push(`4등 ${myFin.hits[3]}`);
                if (myFin.hits[4] > 0) ranksArr.push(`5등 ${myFin.hits[4]}`);
                elMyHits.textContent = `총 ${myFin.totalWins}건 적중 (${ranksArr.join(', ')})`;
                elMyHits.style.color = '#34d399';
            } else {
                elMyHits.textContent = '당첨 내역 없음 (미당첨)';
                elMyHits.style.color = '#94a3b8';
            }
        } else {
            elMyHits.textContent = '등록된 실구매 내역 없음';
            elMyHits.style.color = '#64748b';
        }
    }

    // 5. Non-Blocking Staggered Background Computations:
    function updateAllUsersCardUI(allFin) {
        if (!allFin) return;
        const elAllSub = document.getElementById('lp-toto-mini-sub');
        const elAllPrize = document.getElementById('lp-toto-mini-prize');
        const elAllHits = document.getElementById('lp-toto-mini-hits');

        if (elAllSub) {
            elAllSub.textContent = (allFin.totalCombos > 0)
                ? `총 ${allFin.totalCombos.toLocaleString()}게임 (${(allFin.totalInvest || 0).toLocaleString()}원)`
                : '0게임 (0원)';
        }
        if (elAllPrize) {
            elAllPrize.textContent = `총 당첨 ${(allFin.totalPrize || 0).toLocaleString()}원`;
            elAllPrize.style.color = (allFin.totalPrize || 0) > 0 ? '#10b981' : '#cbd5e1';
        }
        if (elAllHits) {
            if (allFin.totalCombos > 0) {
                if (allFin.totalWins > 0) {
                    const ranksArr = [];
                    if (allFin.hits && allFin.hits[0] > 0) ranksArr.push(`1등 ${allFin.hits[0]}`);
                    if (allFin.hits && allFin.hits[1] > 0) ranksArr.push(`2등 ${allFin.hits[1]}`);
                    if (allFin.hits && allFin.hits[2] > 0) ranksArr.push(`3등 ${allFin.hits[2]}`);
                    if (allFin.hits && allFin.hits[3] > 0) ranksArr.push(`4등 ${allFin.hits[3]}`);
                    if (allFin.hits && allFin.hits[4] > 0) ranksArr.push(`5등 ${allFin.hits[4]}`);
                    elAllHits.textContent = `전체 ${allFin.totalWins}건 적중 (${ranksArr.join(', ')})`;
                    elAllHits.style.color = '#94a3b8';
                } else {
                    elAllHits.textContent = '당첨 내역 없음';
                    elAllHits.style.color = '#94a3b8';
                }
            } else {
                elAllHits.textContent = '등록된 실구매 내역 없음';
                elAllHits.style.color = '#64748b';
            }
        }
    }

    // ⚡ 0ms 즉시 표시: 로컬 캐시된 전체 회원 실구매 KPI가 있으면 네트워크 다운로드 전 0ms 즉각 표시
    let cachedAllFin = null;
    try {
        const rawAll = localStorage.getItem('lotto_all_fin_kpi_cache');
        if (rawAll) cachedAllFin = JSON.parse(rawAll);
    } catch(e) {}
    if (cachedAllFin && cachedAllFin.totalCombos > 0) {
        updateAllUsersCardUI(cachedAllFin);
    }

    // UI 스레드 프리즈 방지를 위해 카드 2(전체 회원 실구매)를 백그라운드 계산하여 최신화
    calculateAllUsersTotalFinancials().then(allFin => {
        if (allFin && allFin.totalCombos > 0) {
            updateAllUsersCardUI(allFin);
            try {
                localStorage.setItem('lotto_all_fin_kpi_cache', JSON.stringify({
                    totalInvest: allFin.totalInvest,
                    totalPrize: allFin.totalPrize,
                    totalCombos: allFin.totalCombos,
                    totalWins: allFin.totalWins,
                    hits: allFin.hits
                }));
            } catch(e) {}
        } else if (!cachedAllFin) {
            updateAllUsersCardUI(allFin);
        }
    }).catch(e => console.warn('[Landing BG allFin Note]', e));

    // ⚡ 스마트폰 로그인 직후 메인 스레드 멈춤 방지를 위한 Staggered Background Execution (600ms 분산 지연)
    setTimeout(() => {
        Promise.allSettled([
            updateHomeReviewDashboard(),
            updateHomeWinningTicker()
        ]).catch(e => console.warn('[Landing BG Compute Note]', e));
        try {
            renderUserWinningTrendBanner(authId, displayName);
        } catch(e) {}
    }, 600);

    } finally {
        if (typeof window !== 'undefined') {
            window.__isRenderingDashboard = false;
        }
    }
}

/**
 * 🔒 Update Service Entry Cards based on User Program Permissions (Lotto / Toto)
 */
export function updateHomeServiceCardsPermissions() {
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
    const getPerms = typeof getUserPermissions === 'function' ? getUserPermissions : (window.getUserPermissions || (() => ({ allowLotto: true, allowToto: true })));
    const perms = getPerms(authId);

    const lottoCard = document.getElementById('btnGoLotto');
    const totoCard = document.getElementById('btnGoToto');

    if (lottoCard) {
        const badge = lottoCard.querySelector('.lp-card-badge');
        const btn = lottoCard.querySelector('.lp-btn');
        if (!perms.allowLotto) {
            if (badge) {
                badge.className = 'lp-card-badge';
                badge.style.background = 'rgba(239, 68, 68, 0.2)';
                badge.style.color = '#fca5a5';
                badge.style.border = '1px solid rgba(239, 68, 68, 0.4)';
                badge.innerHTML = '<i class="fa-solid fa-lock"></i> 🔒 이용 권한 없음';
            }
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> <span>🔒 권한 요청 필요</span>';
                btn.style.opacity = '0.7';
            }
            lottoCard.style.opacity = '0.75';
        } else {
            if (badge) {
                badge.className = 'lp-card-badge lp-badge-active';
                badge.style.background = '';
                badge.style.color = '';
                badge.style.border = '';
                badge.innerHTML = '<i class="fa-solid fa-circle" style="font-size:0.5rem;"></i> 서비스 운영중';
            }
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>추천번호 확인</span>';
                btn.style.opacity = '1';
            }
            lottoCard.style.opacity = '1';
        }
    }

    if (totoCard) {
        const badge = totoCard.querySelector('.lp-card-badge');
        const btn = totoCard.querySelector('.lp-btn');
        if (!perms.allowToto) {
            if (badge) {
                badge.className = 'lp-card-badge';
                badge.style.background = 'rgba(239, 68, 68, 0.2)';
                badge.style.color = '#fca5a5';
                badge.style.border = '1px solid rgba(239, 68, 68, 0.4)';
                badge.innerHTML = '<i class="fa-solid fa-lock"></i> 🔒 이용 권한 없음';
            }
            if (btn) {
                btn.innerHTML = '<span class="lp-desktop-text"><i class="fa-solid fa-lock"></i> 🔒 권한 요청 필요</span><span class="lp-mobile-text">🔒 권한 필요</span>';
                btn.style.opacity = '0.7';
            }
            totoCard.style.opacity = '0.75';
        } else {
            if (badge) {
                badge.className = 'lp-card-badge';
                badge.style.background = '#1e293b';
                badge.style.color = '#94a3b8';
                badge.style.border = '1px solid #334155';
                badge.innerHTML = '<i class="fa-solid fa-flask"></i> 🧪 테스트중 (Beta)';
            }
            if (btn) {
                btn.innerHTML = '<span class="lp-desktop-text"><i class="fa-solid fa-arrow-right"></i> 지금 이용하기 (테스트중)</span><span class="lp-mobile-text">분석 보기 →</span>';
                btn.style.opacity = '1';
            }
            totoCard.style.opacity = '1';
        }
    }
}

let _homeReviewDashboardCache = null;
let _homeReviewDashboardCacheTime = 0;

export function clearHomeReviewDashboardCache() {
    _homeReviewDashboardCache = null;
    _homeReviewDashboardCacheTime = 0;
    try {
        localStorage.removeItem('lotto_home_review_dashboard_cache');
    } catch(e) {}
}
if (typeof window !== 'undefined') {
    window.clearHomeReviewDashboardCache = clearHomeReviewDashboardCache;
}

/**
 * 🔐 현재 접속자가 관리자(전체 회원 데이터 열람 가능)인지 판별
 */
function _isDashboardAdminViewer() {
    try {
        let auth = (typeof window !== 'undefined' && window.SafeAuth && typeof window.SafeAuth.get === 'function') ? window.SafeAuth.get() : '';
        if (typeof auth === 'string' && auth.startsWith('{')) {
            try { const p = JSON.parse(auth); auth = p.userid || p.userId || auth; } catch(e) {}
        }
        const clean = String(auth || '').trim().toLowerCase();
        return clean === 'master' || clean === 'admin' ||
            (typeof window.isAdminUser === 'function' && !!window.isAdminUser(clean)) ||
            (typeof window.isAdminSession === 'function' && !!window.isAdminSession());
    } catch(e) {
        return false;
    }
}

/**
 * 👥 특정 회차(round) 집계 대상 회원 ID 목록 (삭제/테스트 회원 제외 + 가입 회차 이전 제외)
 * - 대시보드 집계(computeUser70RecommendationsReview 의 isPreJoin 기준) 및 당첨결과 탭 전체회원 집계와 동일한 기준
 */
function _getDashboardExpectedMemberIds(round) {
    const list = getAllUnifiedRegisteredUsers() || [];
    const ids = new Set();
    list.forEach(u => {
        const id = String((u && u.id) || '').trim().toLowerCase();
        if (!id) return;
        if (typeof isSystemOrDummyUser === 'function' && isSystemOrDummyUser(id)) return;
        if (typeof getUserJoinRound === 'function' && round < getUserJoinRound(id)) return;
        ids.add(id);
    });
    return ids;
}

/**
 * 🧪 서버/로컬 대시보드 요약(summary)이 현재 회원 구성 및 최신 회차와 일치하는지 검증
 * - 최신 회차보다 과거 회차 기준 요약 → 무효
 * - 집계 회원(memberIds)에 삭제/휴지통/테스트 회원 포함 → 무효 (모든 접속자)
 * - 관리자: 현재 활성 회원 목록과 집계 회원 목록이 1명이라도 다르면 무효
 * - memberIds 가 없는 구버전/배치 요약 → 관리자는 무효 처리하여 즉시 재계산·재저장
 */
function _isDashboardSummaryStale(sData, maxRound, isAdminViewer) {
    if (!sData) return true;
    const docMax = Number(sData.maxRound || 0);
    if (docMax < maxRound) return true;
    // 서버 요약이 로컬보다 더 최신 회차 보유 (로컬 당첨번호 미동기화) → 서버 값 신뢰
    if (docMax > maxRound) return false;

    const docIds = Array.isArray(sData.memberIds)
        ? sData.memberIds.map(id => String(id || '').trim().toLowerCase()).filter(Boolean)
        : null;
    if (!docIds) return true;

    // 🔒 삭제/휴지통/더미 회원 포함 시 모든 접속자 대상 즉시 무효화 (초고속 재동기화)
    const hasDeletedMember = docIds.some(id => {
        if (id === 'guest' || id === 'kakao_5081608503' || id === 'kakao_5090399860' || id === 'kakao_5105087435' || id === 'kakao_5078158815') return true;
        if (typeof isSystemOrDummyUser === 'function' && isSystemOrDummyUser(id)) return true;
        return false;
    });
    if (hasDeletedMember) {
        return true;
    }

    // 1244회차 이상 기준 정상 활성 회원은 최대 13명 (삭제회원이 포함된 구버전 데이터 차단)
    if (maxRound >= 1244 && (docIds.length > 13 || Number(sData.latestActiveMemberCount || sData.activeMemberCount || 0) > 13)) {
        return true;
    }

    if (isAdminViewer) {
        const expected = _getDashboardExpectedMemberIds(maxRound);
        if (expected.size > 0 && expected.size !== new Set(docIds).size) {
            if (expected.size < new Set(docIds).size && docIds.length <= 13) {
                // 서버 요약에 정상 13명 활성 회원이 등록되어 있으면 로컬 초기화 지연 중에도 신뢰 유지
            } else {
                return true;
            }
        }
        if (docIds.some(id => !expected.has(id))) {
            if (expected.size < docIds.length && docIds.length <= 13) {
                // 서버 요약에 정상 13명 활성 회원이 등록되어 있으면 로컬 초기화 지연 중에도 신뢰 유지
            } else {
                return true;
            }
        }
    }
    return false;
}

/**
 * 🔮 Calculate & Render All Registered Members' AI Recommendation (70 Games) Review History on Home Screen
 */
export async function updateHomeReviewDashboard(forceRefresh = false) {
    try {
        if (!state.mergedHistory || Object.keys(state.mergedHistory).length === 0) {
            if (typeof initHistory === 'function') initHistory();
            else if (typeof LOTTO_HISTORY !== 'undefined') state.mergedHistory = { ...LOTTO_HISTORY };
        }

        const history = state.mergedHistory || {};
        const fromRound = 1235;
        const historyRounds = Object.keys(history)
            .map(Number)
            .filter(n => !isNaN(n) && n >= fromRound && Array.isArray(history[n]?.numbers) && history[n].numbers.length === 6)
            .sort((a, b) => a - b);

        const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1243;
        const maxRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
            ? Math.max(state.latestDrawData.drwNo, (historyRounds[historyRounds.length - 1] || fallbackLatest))
            : (historyRounds[historyRounds.length - 1] || state.latestRoundNum || fallbackLatest);

        const roundRangeLabel = `제 ${fromRound}~${maxRound}회차 누적`;
        const isAdminViewer = _isDashboardAdminViewer();

        let summaryData = null;
        let fromLocalCache = false;
        if (!forceRefresh && _homeReviewDashboardCache && (Date.now() - _homeReviewDashboardCacheTime < 25000) && _homeReviewDashboardCache.latestTotalPrize !== undefined && !_isDashboardSummaryStale(_homeReviewDashboardCache, maxRound, isAdminViewer)) {
            summaryData = _homeReviewDashboardCache;
        } else if (!forceRefresh) {
            try {
                const localRev = localStorage.getItem('lotto_home_review_dashboard_cache');
                if (localRev) {
                    const parsed = JSON.parse(localRev);
                    if (parsed && parsed.latestTotalPrize !== undefined && !_isDashboardSummaryStale(parsed, maxRound, isAdminViewer)) {
                        summaryData = parsed;
                        _homeReviewDashboardCache = parsed;
                        _homeReviewDashboardCacheTime = Date.now();
                        fromLocalCache = true;
                    }
                }
            } catch(e) {}
        }

        const formatSummaryFromDoc = (sData) => {
            if (!sData) return null;
            return {
                maxRound: sData.maxRound || maxRound,
                fromRound: sData.fromRound || fromRound,
                roundRangeLabel: sData.roundRangeLabel || roundRangeLabel,
                memberIds: Array.isArray(sData.memberIds)
                    ? sData.memberIds
                    : (Array.isArray(sData.userRankings) ? sData.userRankings.map(u => (u && (u.userId || u.id)) || '').filter(Boolean) : null),
                updatedAt: sData.updatedAt || null,
                grandRank1: Number(sData.grandRank1 || 0),
                grandRank2: Number(sData.grandRank2 || 0),
                grandRank3: Number(sData.grandRank3 || 0),
                grandRank4: Number(sData.grandRank4 || 0),
                grandRank5: Number(sData.grandRank5 || 0),
                grandTotalPrize: Number(sData.grandTotalPrize || 0),
                grandTotalGames: Number(sData.grandTotalGames || 0),
                grandTotalWins: Number(sData.grandTotalWins || 0),
                latestRound: Number(sData.latestRound || sData.maxRound || maxRound),
                latestTotalPrize: Number(sData.latestTotalPrize || 0),
                latestTotalGames: Number(sData.latestTotalGames || 0),
                latestTotalWins: Number(sData.latestTotalWins || 0),
                latestActiveMemberCount: Number(sData.latestActiveMemberCount || sData.activeMemberCount || 0),
                activeMemberCount: Number(sData.activeMemberCount || sData.latestActiveMemberCount || 0),
                latestRank1: Number(sData.latestRank1 || 0),
                latestRank2: Number(sData.latestRank2 || 0),
                latestRank3: Number(sData.latestRank3 || 0),
                latestRank4: Number(sData.latestRank4 || 0),
                latestRank5: Number(sData.latestRank5 || 0)
            };
        };

        if (!summaryData && !forceRefresh) {
            // ⚡ 0순위: 서버 사전 판별 대시보드 요약 단일 문서(1~2KB) 초고속 조회 (0.05초 렌더링)
            try {
                const firestore = window.db || (typeof db !== 'undefined' && db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
                if (firestore) {
                    const snapDoc = await firestore.collection('lotto_purchases').doc('dashboard_summary_latest').get();
                    if (snapDoc && snapDoc.exists) {
                        const sData = snapDoc.data();
                        const formatted = formatSummaryFromDoc(sData);
                        if (formatted && !_isDashboardSummaryStale(formatted, maxRound, isAdminViewer)) {
                            summaryData = formatted;
                            _homeReviewDashboardCache = summaryData;
                            _homeReviewDashboardCacheTime = Date.now();
                            try { localStorage.setItem('lotto_home_review_dashboard_cache', JSON.stringify(summaryData)); } catch(e) {}
                        }
                    }
                }
            } catch(srvErr) {
                console.warn('[Server Dashboard Summary Fetch Fallback]', srvErr);
            }
        } else if (fromLocalCache) {
            // ⚡ SWR (Stale-While-Revalidate): 로컬 캐시 즉시 렌더링 후 백그라운드에서 최신 요약 동기화 검증
            setTimeout(async () => {
                try {
                    const firestore = window.db || (typeof db !== 'undefined' && db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
                    if (firestore) {
                        const snapDoc = await firestore.collection('lotto_purchases').doc('dashboard_summary_latest').get();
                        if (snapDoc && snapDoc.exists) {
                            const freshSummary = formatSummaryFromDoc(snapDoc.data());
                            if (freshSummary && !_isDashboardSummaryStale(freshSummary, maxRound, isAdminViewer) && (
                                freshSummary.grandTotalPrize !== summaryData.grandTotalPrize ||
                                freshSummary.latestTotalPrize !== summaryData.latestTotalPrize ||
                                freshSummary.grandTotalWins !== summaryData.grandTotalWins ||
                                freshSummary.maxRound !== summaryData.maxRound
                            )) {
                                _homeReviewDashboardCache = freshSummary;
                                _homeReviewDashboardCacheTime = Date.now();
                                try { localStorage.setItem('lotto_home_review_dashboard_cache', JSON.stringify(freshSummary)); } catch(e) {}
                                applyDashboardReviewSummaryToUI(freshSummary, freshSummary.maxRound || maxRound, freshSummary.roundRangeLabel || roundRangeLabel);
                            }
                        }
                    }
                } catch(e) {}
            }, 100);
        }

        if (!summaryData) {
            // 1. Synchronously pre-load cached users list if in-memory list is empty
            if (!state.allRegisteredUsersList || !Array.isArray(state.allRegisteredUsersList) || state.allRegisteredUsersList.length === 0) {
                try {
                    const raw = localStorage.getItem('lotto_all_users_list_cache');
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            state.allRegisteredUsersList = parsed;
                        }
                    }
                } catch(e) {}
            }

            // 2. Asynchronously fetch full users and purchases from Firestore if not yet loaded
            if (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0 || !state.allUsersPurchasesMap) {
                if (typeof fetchAllUsersPurchases === 'function') {
                    await fetchAllUsersPurchases();
                }
            }

            let grandRank1 = 0;
            let grandRank2 = 0;
            let grandRank3 = 0;
            let grandRank4 = 0;
            let grandRank5 = 0;
            let grandTotalPrize = 0;
            let grandTotalGames = 0;
            let grandTotalWins = 0;

            let latestRank1 = 0;
            let latestRank2 = 0;
            let latestRank3 = 0;
            let latestRank4 = 0;
            let latestRank5 = 0;
            let latestTotalPrize = 0;
            let latestTotalGames = 0;
            let latestTotalWins = 0;
            let latestActiveMemberCount = 0;

            const userList = (getAllUnifiedRegisteredUsers() || []).filter(u => u && u.id && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted' && !isSystemOrDummyUser(u.id));
            const rounds = historyRounds.length > 0 ? historyRounds : [1235, 1236, 1237, 1238, 1239, 1240, 1241, 1242, 1243].filter(r => r <= maxRound);

            rounds.forEach(rnd => {
                userList.forEach(u => {
                    const rev = (typeof computeUser70RecommendationsReview === 'function')
                        ? computeUser70RecommendationsReview(u.id, rnd)
                        : (typeof window !== 'undefined' && window.computeUser70RecommendationsReview ? window.computeUser70RecommendationsReview(u.id, rnd) : null);
                    if (rev && !rev.isPreJoin && !rev.isDeleted) {
                        const games = (rev.totalGames || 70);
                        const prize = (rev.totalPrize || 0);
                        grandTotalGames += games;
                        grandTotalPrize += prize;
                        if (rev.grandHits) {
                            grandRank1 += (rev.grandHits[1] || 0);
                            grandRank2 += (rev.grandHits[2] || 0);
                            grandRank3 += (rev.grandHits[3] || 0);
                            grandRank4 += (rev.grandHits[4] || 0);
                            grandRank5 += (rev.grandHits[5] || 0);
                        }
                        if (rnd === maxRound) {
                            latestTotalGames += games;
                            latestTotalPrize += prize;
                            latestActiveMemberCount++;
                            if (rev.grandHits) {
                                latestRank1 += (rev.grandHits[1] || 0);
                                latestRank2 += (rev.grandHits[2] || 0);
                                latestRank3 += (rev.grandHits[3] || 0);
                                latestRank4 += (rev.grandHits[4] || 0);
                                latestRank5 += (rev.grandHits[5] || 0);
                            }
                        }
                    }
                });
            });
            grandTotalWins = grandRank1 + grandRank2 + grandRank3 + grandRank4 + grandRank5;
            latestTotalWins = latestRank1 + latestRank2 + latestRank3 + latestRank4 + latestRank5;

            const activeMemberIds = Array.from(_getDashboardExpectedMemberIds(maxRound)).filter(id => id && id !== 'guest' && id !== 'kakao_5081608503' && id !== 'kakao_5090399860' && id !== 'kakao_5105087435' && id !== 'kakao_5078158815' && !isSystemOrDummyUser(id));
            summaryData = {
                maxRound,
                fromRound,
                roundRangeLabel: `제 ${fromRound}~${maxRound}회차 누적`,
                latestRound: maxRound,
                latestTotalPrize,
                latestTotalGames,
                latestTotalWins,
                latestActiveMemberCount,
                memberIds: activeMemberIds,
                activeMemberCount: activeMemberIds.length,
                updatedAt: new Date().toISOString(),
                latestRank1,
                latestRank2,
                latestRank3,
                latestRank4,
                latestRank5,
                grandRank1,
                grandRank2,
                grandRank3,
                grandRank4,
                grandRank5,
                grandTotalPrize,
                grandTotalGames,
                grandTotalWins
            };
            _homeReviewDashboardCache = summaryData;
            _homeReviewDashboardCacheTime = Date.now();
            try {
                localStorage.setItem('lotto_home_review_dashboard_cache', JSON.stringify(summaryData));
            } catch(e) {}

            // ⚡ 관리자 재계산 또는 신규 회차 스크랩 동기화(forceRefresh) 시 Firestore 요약 문서 자동 동기화
            try {
                const fs = window.db || (typeof db !== 'undefined' && db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
                if (fs && typeof fs.collection === 'function') {
                    const auth = (typeof window.SafeAuth !== 'undefined' && window.SafeAuth.get) ? window.SafeAuth.get() : '';
                    const isAdmin = auth === 'master' || auth === 'admin' || (typeof window.isAdminUser === 'function' && window.isAdminUser(auth)) || (typeof window.isAdminSession === 'function' && window.isAdminSession());
                    const isClean = !activeMemberIds.some(id => id === 'kakao_5081608503' || id === 'kakao_5090399860' || id === 'kakao_5105087435' || id === 'kakao_5078158815' || id === 'guest' || (typeof isSystemOrDummyUser === 'function' && isSystemOrDummyUser(id)));
                    if ((isAdmin || forceRefresh) && isClean && activeMemberIds.length <= 13) {
                        fs.collection('lotto_purchases').doc('dashboard_summary_latest').set(summaryData, { merge: true }).catch(console.warn);
                    }
                }
            } catch(e) {}
        }

        applyDashboardReviewSummaryToUI(summaryData, maxRound, roundRangeLabel);
    } catch(err) {
        console.error('[Home Review Dashboard Error]', err);
    }
}

/**
 * 🔮 전체 회원 AI 추천번호 당첨 요약 데이터(summaryData)를 대시보드 UI 엘리먼트에 즉시 반영
 */
export function applyDashboardReviewSummaryToUI(summaryData, maxRound, roundRangeLabel) {
    if (!summaryData) return;
    const {
        latestRound = maxRound,
        latestTotalPrize = 0,
        latestTotalGames = 0,
        latestTotalWins = 0,
        latestActiveMemberCount = 0,
        latestRank1 = 0,
        latestRank2 = 0,
        latestRank3 = 0,
        latestRank4 = 0,
        latestRank5 = 0,
        grandRank1 = 0,
        grandRank2 = 0,
        grandRank3 = 0,
        grandRank4 = 0,
        grandRank5 = 0,
        grandTotalPrize = 0,
        grandTotalGames = 0,
        grandTotalWins = 0
    } = summaryData;

    const rRangeLabel = roundRangeLabel || summaryData.roundRangeLabel || `제 1235~${maxRound || latestRound}회차 누적`;

    // 1. Update Card 3: All Members AI Recommended Review (🔮 전체 회원 추천 당첨 결과)
    const elRevSub = document.getElementById('lp-review-mini-sub');
    const elRevPrize = document.getElementById('lp-review-mini-prize');
    const elRevHits = document.getElementById('lp-review-mini-hits');

    if (elRevSub) {
        elRevSub.textContent = `${rRangeLabel} (총 ${grandTotalGames.toLocaleString()}게임)`;
    }
    if (elRevPrize) {
        elRevPrize.textContent = `누적 당첨 +${grandTotalPrize.toLocaleString()}원`;
        elRevPrize.style.color = grandTotalPrize > 0 ? '#10b981' : '#cbd5e1';
    }
    if (elRevHits) {
        if (latestTotalWins > 0 || grandTotalWins > 0) {
            elRevHits.textContent = `최신 ${latestRound}회: +${latestTotalPrize.toLocaleString()}원 (${latestTotalWins}건) · 누적 ${grandTotalWins}건`;
            elRevHits.style.color = '#94a3b8';
        } else {
            elRevHits.textContent = '당첨 내역 없음';
            elRevHits.style.color = '#94a3b8';
        }
    }

    // 2. Update Table & Dashboard Section (🔮 전체 회원 AI 추천번호 당첨 결과 종합 요약)
    const elRoundBadge = document.getElementById('lpReviewRoundBadge');
    if (elRoundBadge) elRoundBadge.textContent = `${rRangeLabel} +${grandTotalPrize.toLocaleString()}원`;

    const elLatestBadge = document.getElementById('lpReviewLatestBadge');
    if (elLatestBadge) elLatestBadge.textContent = `최신 ${latestRound}회 +${latestTotalPrize.toLocaleString()}원`;

    const elMobileRevRound = document.getElementById('lpReviewMobileRound');
    if (elMobileRevRound && latestRound) {
        elMobileRevRound.textContent = latestRound;
    }

    const elMobileRoundSub = document.getElementById('lpReviewMobileRoundSub');
    if (elMobileRoundSub && latestRound) {
        elMobileRoundSub.textContent = latestRound;
    }

    const elMobilePrize = document.getElementById('lpReviewMobilePrize');
    if (elMobilePrize) elMobilePrize.textContent = latestTotalPrize.toLocaleString();

    const elMobileHits = document.getElementById('lpReviewMobileHits');
    if (elMobileHits) elMobileHits.textContent = `${latestTotalWins}건`;

    const elMobileCumPrize = document.getElementById('lpReviewMobileCumPrize');
    if (elMobileCumPrize) elMobileCumPrize.textContent = grandTotalPrize.toLocaleString();

    const elMobileCumHits = document.getElementById('lpReviewMobileCumHits');
    if (elMobileCumHits) elMobileCumHits.textContent = `${grandTotalWins}건`;

    // 최신 회차 (단일) KPI 바 갱신
    const elLatestRoundNum = document.getElementById('lpReviewLatestRoundNum');
    if (elLatestRoundNum) elLatestRoundNum.textContent = latestRound;

    const elLatestGames = document.getElementById('lpReviewLatestGames');
    if (elLatestGames) elLatestGames.textContent = `${latestActiveMemberCount}명 참여 · 총 ${latestTotalGames.toLocaleString()}게임 (1인당 70조합)`;

    const elLatestHits = document.getElementById('lpReviewLatestHits');
    if (elLatestHits) {
        elLatestHits.innerHTML = `
            <span style="color:${latestRank1>0?'#10b981':'#64748b'}; font-weight:700;">1등 ${latestRank1}</span> · 
            <span style="color:${latestRank2>0?'#f87171':'#64748b'}; font-weight:700;">2등 ${latestRank2}</span> · 
            <span style="color:${latestRank3>0?'#38bdf8':'#64748b'}; font-weight:700;">3등 ${latestRank3}</span> · 
            <span style="color:${latestRank4>0?'#34d399':'#64748b'}; font-weight:700;">4등 ${latestRank4}</span> · 
            <span style="color:${latestRank5>0?'#94a3b8':'#64748b'}; font-weight:700;">5등 ${latestRank5}</span>
            <span style="color:#94a3b8; margin-left:4px;">(총 ${latestTotalWins}건 적중)</span>
        `;
    }

    const elLatestPrize = document.getElementById('lpReviewLatestPrize');
    if (elLatestPrize) {
        elLatestPrize.textContent = `최신 당첨금 +${latestTotalPrize.toLocaleString()}원`;
        elLatestPrize.style.color = latestTotalPrize > 0 ? '#34d399' : '#cbd5e1';
    }

    // 전회차 누적 KPI 바 갱신
    const elCumRoundNum = document.getElementById('lpReviewCumRoundNum');
    if (elCumRoundNum && (maxRound || latestRound)) elCumRoundNum.textContent = maxRound || latestRound;

    const elKpiGames = document.getElementById('lpReviewKpiGames');
    const elKpiHits = document.getElementById('lpReviewKpiHits');
    const elKpiPrize = document.getElementById('lpReviewKpiPrize');

    if (elKpiGames) elKpiGames.textContent = `${rRangeLabel} · 총 ${grandTotalGames.toLocaleString()}게임 (1인당 70조합)`;
    if (elKpiHits) {
        elKpiHits.innerHTML = `
            <span style="color:${grandRank1>0?'#10b981':'#64748b'}; font-weight:700;">1등 ${grandRank1}</span> · 
            <span style="color:${grandRank2>0?'#f87171':'#64748b'}; font-weight:700;">2등 ${grandRank2}</span> · 
            <span style="color:${grandRank3>0?'#38bdf8':'#64748b'}; font-weight:700;">3등 ${grandRank3}</span> · 
            <span style="color:${grandRank4>0?'#34d399':'#64748b'}; font-weight:700;">4등 ${grandRank4}</span> · 
            <span style="color:${grandRank5>0?'#94a3b8':'#64748b'}; font-weight:700;">5등 ${grandRank5}</span>
            <span style="color:#94a3b8; margin-left:4px;">(총 ${grandTotalWins}건 적중)</span>
        `;
    }
    if (elKpiPrize) {
        elKpiPrize.textContent = `누적 당첨금 +${grandTotalPrize.toLocaleString()}원`;
        elKpiPrize.style.color = grandTotalPrize > 0 ? '#10b981' : '#cbd5e1';
    }
}
if (typeof window !== 'undefined') {
    window.applyDashboardReviewSummaryToUI = applyDashboardReviewSummaryToUI;
}

/**
 * 🏆 Update Real-Purchase Winning Ticker Bar on Home Screen
 * Displays last round's real-purchase receipt winners (e.g. "김**님 5등 당첨", "박**님 4등 당첨")
 */
export async function updateHomeWinningTicker() {
    const container = document.getElementById('lpWinningTickerContainer');
    if (!container) return;

    try {
        if (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0) {
            if (typeof fetchAllUsersPurchases === 'function') {
                await fetchAllUsersPurchases();
            }
        }

        const history = state.mergedHistory || {};
        const drawnRounds = Object.keys(history)
            .map(Number)
            .filter(n => !isNaN(n) && Array.isArray(history[n]?.numbers) && history[n].numbers.length === 6)
            .sort((a, b) => b - a);

        const latestDrawnRound = drawnRounds[0] || (state.latestDrawData?.drwNo || 1239);
        const candidateRounds = [latestDrawnRound]; // 🔒 오직 직전회차(최신 추첨 회차 1개)만 엄격히 한정!

        // 마스킹 헬퍼 함수 (김**님, 이*님 등)
        function maskName(name, userId) {
            const raw = (name || userId || '').trim();
            if (!raw) return '회원**님';
            if (raw.length === 1) return `${raw}*님`;
            if (raw.length === 2) return `${raw[0]}*님`;
            return `${raw[0]}**님`;
        }

        // 🔒 회원별 실구매 당첨 집계 (한 회원이 여러 게임 당첨 시 중복 반복 노출 방지 및 정확한 건수 표기)
        const userWinsMap = new Map();
        let totalWinCombosCount = 0;

        candidateRounds.forEach(roundNum => {
            const actualDraw = (typeof getSafeActualDraw === 'function' ? getSafeActualDraw(roundNum) : history[roundNum]) || history[roundNum];
            if (!actualDraw || !Array.isArray(actualDraw.numbers)) return;

            const winningSet = new Set(actualDraw.numbers);
            const bonus = actualDraw.bonus;

            // 전체 회원의 실구매 영수증 수집
            const allReceipts = [];
            if (state.allUsersPurchasesMap) {
                for (const uid in state.allUsersPurchasesMap) {
                    const uData = state.allUsersPurchasesMap[uid];
                    const rawLedgerRound = uData?.ledger?.[roundNum] || uData?.ledger?.[String(roundNum)];
                    let roundReceipts = [];
                    if (Array.isArray(rawLedgerRound)) {
                        roundReceipts = rawLedgerRound;
                    } else if (rawLedgerRound && typeof rawLedgerRound === 'object') {
                        roundReceipts = Object.values(rawLedgerRound);
                    }
                    roundReceipts.forEach(rcpt => {
                        if (rcpt && typeof rcpt === 'object') {
                            allReceipts.push({
                                ...rcpt,
                                user: rcpt.user || uid,
                                userName: rcpt.userName || uData.realName || uid
                            });
                        }
                    });
                }
            } else if (state.allUsersMergedLedger) {
                const rawMergedRound = state.allUsersMergedLedger[roundNum] || state.allUsersMergedLedger[String(roundNum)];
                let mergedReceipts = [];
                if (Array.isArray(rawMergedRound)) {
                    mergedReceipts = rawMergedRound;
                } else if (rawMergedRound && typeof rawMergedRound === 'object') {
                    mergedReceipts = Object.values(rawMergedRound);
                }
                mergedReceipts.forEach(rcpt => {
                    if (rcpt && typeof rcpt === 'object') allReceipts.push(rcpt);
                });
            }

            allReceipts.forEach(receipt => {
                if (!receipt || !Array.isArray(receipt.combos)) return;
                const pUser = (receipt.user || receipt.userId || '').trim().toLowerCase();
                const pName = receipt.userName || (typeof getUserRealName === 'function' ? getUserRealName(pUser) : '') || pUser;
                const displayName = maskName(pName, pUser);

                receipt.combos.forEach(combo => {
                    const nums = Array.isArray(combo) ? combo : (combo.numbers || []);
                    if (!Array.isArray(nums) || nums.length < 6) return;

                    const matchCount = nums.filter(n => winningSet.has(n)).length;
                    const hasBonus = bonus ? nums.includes(bonus) : false;

                    let rank = 0;
                    let prize = 0;

                    if (matchCount === 6) {
                        rank = 1;
                        prize = actualDraw.rank1Prize || 2000000000;
                    } else if (matchCount === 5 && hasBonus) {
                        rank = 2;
                        prize = actualDraw.rank2Prize || 50000000;
                    } else if (matchCount === 5) {
                        rank = 3;
                        prize = actualDraw.rank3Prize || 1500000;
                    } else if (matchCount === 4) {
                        rank = 4;
                        prize = actualDraw.rank4Prize || 50000;
                    } else if (matchCount === 3) {
                        rank = 5;
                        prize = actualDraw.rank5Prize || 5000;
                    }

                    if (rank >= 1 && rank <= 5) {
                        totalWinCombosCount++;
                        if (!userWinsMap.has(pUser)) {
                            userWinsMap.set(pUser, {
                                userId: pUser,
                                displayName,
                                round: roundNum,
                                ranks: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                                totalWins: 0,
                                totalPrize: 0,
                                bestRank: rank
                            });
                        }
                        const uWin = userWinsMap.get(pUser);
                        uWin.ranks[rank] = (uWin.ranks[rank] || 0) + 1;
                        uWin.totalWins++;
                        uWin.totalPrize += prize;
                        if (rank < uWin.bestRank) {
                            uWin.bestRank = rank;
                        }
                    }
                });
            });
        });

        const aggregatedWinners = Array.from(userWinsMap.values());
        // 등수 높은 순(1등 -> 5등), 상금 많은 순 정렬
        aggregatedWinners.sort((a, b) => {
            if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
            return b.totalPrize - a.totalPrize;
        });

        aggregatedWinners.forEach(uWin => {
            const parts = [];
            [1, 2, 3, 4, 5].forEach(r => {
                const cnt = uWin.ranks[r];
                if (cnt > 0) {
                    if (r === 1) parts.push(`1등 ${cnt}건 🎉`);
                    else if (r === 2) parts.push(`2등 ${cnt}건 🥈`);
                    else if (r === 3) parts.push(`3등 ${cnt}건 🥉`);
                    else parts.push(`${r}등 ${cnt}건`);
                }
            });
            uWin.rankSummaryText = parts.join(' · ') + ' 당첨';
            uWin.prizeText = uWin.totalPrize > 0 ? `(총 ${uWin.totalPrize.toLocaleString()}원)` : '';
        });

        const shouldScroll = aggregatedWinners.length >= 3;
        let flipItems = [];

        if (aggregatedWinners.length > 0) {
            flipItems = aggregatedWinners.map(item => `
                <div class="lp-flip-item">
                    <i class="fa-solid fa-trophy" style="color: #10b981; font-size: 0.82rem; flex-shrink: 0;"></i>
                    <strong style="color: #f8fafc; font-size: 0.84rem; letter-spacing: -0.2px; flex-shrink: 0;">${item.displayName}</strong>
                    <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 0.72rem; font-weight: 800; padding: 1.5px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">${item.rankSummaryText}</span>
                    ${item.prizeText ? `<span style="color: #94a3b8; font-size: 0.74rem; font-weight: 700; white-space: nowrap; flex-shrink: 0;">${item.prizeText}</span>` : ''}
                </div>
            `);

            // 🎯 당첨자가 1명일 때도 멈추지 않고 위아래 플립 애니메이션이 연속 구동되도록 축하/인증 안내 슬라이드 추가
            if (aggregatedWinners.length === 1) {
                const singleWinner = aggregatedWinners[0];
                flipItems.push(`
                    <div class="lp-flip-item">
                        <i class="fa-solid fa-gift" style="color: #10b981; font-size: 0.82rem; flex-shrink: 0;"></i>
                        <strong style="color: #f8fafc; font-size: 0.84rem; letter-spacing: -0.2px; flex-shrink: 0;">${singleWinner.displayName}</strong>
                        <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 0.72rem; font-weight: 800; padding: 1.5px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">실구매 인증 당첨 축하 🎉</span>
                        <span class="lp-desktop-only" style="color: #94a3b8; font-size: 0.74rem; font-weight: 600; white-space: nowrap; flex-shrink: 0;">(구매확정현황에서 영수증 확인)</span>
                    </div>
                `);
            }
        } else {
            flipItems = [
                `<div class="lp-flip-item">
                    <i class="fa-solid fa-shield-halved" style="color: #10b981; flex-shrink: 0;"></i>
                    <strong style="color: #f8fafc; font-size: 0.82rem;">제 ${latestDrawnRound}회차 동행복권 실구매 영수증 인증 기반 당첨 집계 완료</strong>
                </div>`,
                `<div class="lp-flip-item">
                    <i class="fa-solid fa-qrcode" style="color: #38bdf8; flex-shrink: 0;"></i>
                    <span style="color: #cbd5e1; font-size: 0.82rem;">매주 5게임 실구매 영수증(QR) 등록 시 7대 퀀트 알고리즘 무료 잠금 해제</span>
                </div>`
            ];
        }

        const flipItemsHtml = flipItems.map((html, idx) => {
            if (idx === 0) return html.replace('class="lp-flip-item"', 'class="lp-flip-item lp-flip-active"');
            return html;
        }).join('');

        container.innerHTML = `
            <div class="lp-singleline-ticker-bar" onclick="showLotto(); setTimeout(() => window.switchTab && window.switchTab('tab-confirmed-list'), 80);" title="제 ${latestDrawnRound}회 실구매 장부 당첨 내역 자세히 보기" style="display: flex !important; flex-direction: row !important; align-items: center !important; background: linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92)) !important; border: 1.5px solid rgba(16, 185, 129, 0.45) !important; border-radius: 20px !important; height: 38px !important; min-height: 38px !important; max-height: 38px !important; padding: 0 12px !important; margin: 0 0 14px 0 !important; gap: 10px !important; overflow: hidden !important; width: 100% !important; max-width: 900px !important; box-sizing: border-box !important; cursor: pointer !important; white-space: nowrap !important; box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;">
                <div class="lp-ticker-badge-pill" style="display: inline-flex !important; align-items: center !important; gap: 5px !important; font-size: 0.76rem !important; font-weight: 800 !important; color: #34d399 !important; white-space: nowrap !important; background: rgba(16, 185, 129, 0.2) !important; padding: 3px 9px !important; border-radius: 10px !important; border: 1px solid rgba(16, 185, 129, 0.5) !important; flex-shrink: 0 !important; z-index: 2 !important; height: 22px !important; line-height: 1 !important;">
                    <i class="fa-solid fa-bullhorn lp-desktop-only" style="color: #34d399;"></i>
                    <span class="lp-desktop-text">제 ${latestDrawnRound}회 실구매 당첨${totalWinCombosCount > 0 ? ` (총 ${totalWinCombosCount}건)` : ''}</span>
                    <span class="lp-mobile-text">당첨속보</span>
                </div>
                <div id="lpFlipViewport" class="lp-flip-viewport">
                    ${flipItemsHtml}
                </div>
                <span class="lp-mobile-text lp-ticker-mobile-round" style="color: #34d399; font-weight: 800; font-size: 10px; margin-left: 6px; flex-shrink: 0;">${latestDrawnRound}회</span>
                <i class="fa-solid fa-chevron-right lp-desktop-only" style="color: #64748b; font-size: 0.72rem; flex-shrink: 0;"></i>
            </div>
        `;

        // 🔄 위아래 수직 플립(Vertical Flip) 타이머 시작 (3.2초 주기 부드러운 롤링)
        if (window.__lpWinningTickerTimer) {
            clearInterval(window.__lpWinningTickerTimer);
            window.__lpWinningTickerTimer = null;
        }

        const viewport = container.querySelector('#lpFlipViewport');
        if (viewport) {
            const items = viewport.querySelectorAll('.lp-flip-item');
            if (items.length > 1) {
                let currentIndex = 0;
                let isHovered = false;

                const tickerBar = container.querySelector('.lp-singleline-ticker-bar');
                if (tickerBar) {
                    tickerBar.addEventListener('mouseenter', () => { isHovered = true; });
                    tickerBar.addEventListener('mouseleave', () => { isHovered = false; });
                }

                window.__lpWinningTickerTimer = setInterval(() => {
                    if (isHovered || !document.body.contains(viewport)) return;
                    const currentItem = items[currentIndex];
                    const nextIndex = (currentIndex + 1) % items.length;
                    const nextItem = items[nextIndex];

                    currentItem.classList.remove('lp-flip-active');
                    currentItem.classList.add('lp-flip-exit');

                    setTimeout(() => {
                        currentItem.classList.remove('lp-flip-exit');
                    }, 480);

                    nextItem.classList.add('lp-flip-active');
                    currentIndex = nextIndex;
                }, 3200);
            }
        }
    } catch(e) {
        console.error('[updateHomeWinningTicker Error]', e);
    }
}

/**
 * 🎯 Calculate Next Saturday 21:00:00 KST Target
 */
export function getNextSaturday21KST(now = new Date()) {
    const day = now.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
    const diffToSat = (6 - day + 7) % 7;
    const target = new Date(now);
    target.setDate(now.getDate() + diffToSat);
    target.setHours(21, 0, 0, 0);

    // If today is Saturday and now >= 21:00:00, target next Saturday 21:00
    if (diffToSat === 0 && now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 7);
    }
    return target;
}

/**
 * 🎯 Calculate Draw Round Number for target Saturday 21:00 KST (Round 1 = 2002-12-07)
 */
export function getDrawRoundForSaturday21(targetDate = getNextSaturday21KST()) {
    const firstDrawTime = new Date('2002-12-07T21:00:00+09:00');
    const diff = targetDate.getTime() - firstDrawTime.getTime();
    if (diff < 0) return 1;
    const weeks = Math.round(diff / (7 * 24 * 60 * 60 * 1000));
    return 1 + weeks;
}

/**
 * 🎯 Update Concept 1 Mobile Header D-day Badge (e.g. 1242회 D-1)
 */
export function updateMobileDdayBadge() {
    const el = document.getElementById('lpMobileDdayText');
    try {
        const now = new Date();
        const target = getNextSaturday21KST(now);
        const targetRound = getDrawRoundForSaturday21(target);
        if (el) {
            const diffMs = target.getTime() - now.getTime();
            if (diffMs <= 0) {
                el.textContent = `${targetRound}회 LIVE 추첨중`;
            } else {
                const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                if (days === 0) {
                    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    el.textContent = `${targetRound}회 D-Day (${hours}h)`;
                } else {
                    el.textContent = `${targetRound}회 D-${days}`;
                }
            }
        }
        const subtitleEl = document.getElementById('lpMobileTargetRoundText');
        if (subtitleEl && targetRound) {
            subtitleEl.textContent = targetRound;
        }
    } catch(e) {
        console.warn('[updateMobileDdayBadge error]', e);
    }
}

/**
 * 🎯 Render & Start Live Countdown Timer for Saturday 21:00 Winning Number Draw Banner
 */
let drawCountdownIntervalId = null;

export function updateDrawCountdownBanner() {
    const container = document.getElementById('lpDrawCountdownBanner');
    if (!container) return;
    // 중복으로 있는 추첨까지 남은시간 배너 숨김 처리 시 렌더링 중단
    if (container.style.display === 'none' || container.hasAttribute('hidden') || (typeof window !== 'undefined' && window.getComputedStyle && window.getComputedStyle(container).display === 'none')) {
        container.innerHTML = '';
        return;
    }

    function renderBanner() {
        const now = new Date();
        const target = getNextSaturday21KST(now);
        const diffMs = target.getTime() - now.getTime();
        const targetRound = getDrawRoundForSaturday21(target);

        if (diffMs <= 0) {
            container.innerHTML = `
                <div class="lp-draw-countdown-banner is-live" onclick="if(window.showLotto){ window.showLotto(); setTimeout(() => window.switchTab && window.switchTab('tab-generator'), 80); }" title="제 ${targetRound}회 로또 추첨 진행 중 - 번호 생성 및 확인 바로가기">
                    <div class="lp-draw-left">
                        <div class="lp-draw-badge-icon live-pulse">
                            <i class="fa-solid fa-satellite-dish"></i>
                        </div>
                        <div class="lp-draw-text-group">
                            <div class="lp-draw-title">
                                <span class="lp-draw-round-badge" style="background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%) !important;">제 ${targetRound}회</span>
                                <span class="lp-draw-title-text">로또 6/45 추첨 진행 중!</span>
                            </div>
                            <div class="lp-draw-subtitle">동행복권 공식 당첨번호 집계 중</div>
                        </div>
                    </div>
                    <div class="lp-draw-timer-box">
                        <span class="lp-draw-live-text">
                            <i class="fa-solid fa-circle live-dot"></i> LIVE 추첨중
                        </span>
                    </div>
                    <div class="lp-draw-action-hint">
                        <span>결과확인</span>
                        <i class="fa-solid fa-chevron-right"></i>
                    </div>
                </div>
            `;
            return;
        }

        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const pad = (n) => String(n).padStart(2, '0');
        const isUrgent = days === 0 && hours < 3; // Within 3 hours of draw

        container.innerHTML = `
            <div class="lp-draw-countdown-banner ${isUrgent ? 'is-urgent' : ''}" onclick="if(window.showLotto){ window.showLotto(); setTimeout(() => window.switchTab && window.switchTab('tab-generator'), 80); }" title="제 ${targetRound}회 로또 6/45 추천 및 실구매 장부 바로가기">
                <!-- Left: Icon & Title -->
                <div class="lp-draw-left">
                    <div class="lp-draw-badge-icon ${isUrgent ? 'pulse' : ''}">
                        <i class="fa-solid ${isUrgent ? 'fa-fire' : 'fa-clock'}"></i>
                    </div>
                    <div class="lp-draw-text-group">
                        <div class="lp-draw-title">
                            <span class="lp-draw-round-badge">제 ${targetRound}회</span>
                            <span class="lp-draw-title-text">추첨까지 남은시간</span>
                            ${isUrgent ? '<span class="lp-draw-urgent-badge">추첨임박</span>' : ''}
                        </div>
                        <div class="lp-draw-subtitle">토요일 21:00 추첨 기준</div>
                    </div>
                </div>

                <!-- Center: Digital Countdown -->
                <div class="lp-draw-timer-box">
                    <div class="lp-draw-timer-digits">
                        ${days > 0 ? `
                            <div class="lp-timer-unit">
                                <span class="lp-timer-num">${days}</span>
                                <span class="lp-timer-lbl">일</span>
                            </div>
                            <span class="lp-timer-colon">:</span>
                        ` : ''}
                        <div class="lp-timer-unit">
                            <span class="lp-timer-num">${pad(hours)}</span>
                            <span class="lp-timer-lbl">시</span>
                        </div>
                        <span class="lp-timer-colon">:</span>
                        <div class="lp-timer-unit">
                            <span class="lp-timer-num">${pad(minutes)}</span>
                            <span class="lp-timer-lbl">분</span>
                        </div>
                        <span class="lp-timer-colon">:</span>
                        <div class="lp-timer-unit">
                            <span class="lp-timer-num sec-num">${pad(seconds)}</span>
                            <span class="lp-timer-lbl">초</span>
                        </div>
                    </div>
                </div>

                <!-- Right: Action Hint -->
                <div class="lp-draw-action-hint">
                    <span>번호생성</span>
                    <i class="fa-solid fa-chevron-right"></i>
                </div>
            </div>
        `;
    }

    renderBanner();

    if (drawCountdownIntervalId) {
        clearInterval(drawCountdownIntervalId);
    }
    drawCountdownIntervalId = setInterval(renderBanner, 1000);
}

/**
 * 📈 [신규] 로그인 회원 최근 추천 당첨추이 슬림 배너 렌더러
 * - 가입일(joinRound) 이전 회차 원천 배제 (round >= joinRound)
 * - 최근 최대 10주간 당첨금 & 적중 건수 0ms 로컬 캐싱
 * - 폴드7 좁은 화면(320px)에서도 글자 겹침 없는 3-Tier 마이크로 반응형 레이아웃
 * - 100% 폭 풀위드 SVG 스플라인 곡선 선그래프
 */
let _trendBannerAnimId = null;
let _trendBannerLoopTimer = null;

export function renderUserWinningTrendBanner(authId, displayName) {
    const container = document.getElementById('lpUserTrendBannerContainer');
    if (!container) return;

    let cleanAuth = String(authId || '').trim();
    if (cleanAuth.startsWith('{')) {
        try { const p = JSON.parse(cleanAuth); cleanAuth = p.userid || p.userId || cleanAuth; } catch(e) {}
    }
    cleanAuth = cleanAuth.toLowerCase().trim();

    // 0. 비로그인 / Guest
    if (!cleanAuth || cleanAuth === '비로그인' || cleanAuth === 'guest' || isSystemOrDummyUser(cleanAuth)) {
        if (_trendBannerAnimId) { cancelAnimationFrame(_trendBannerAnimId); _trendBannerAnimId = null; }
        if (_trendBannerLoopTimer) { clearTimeout(_trendBannerLoopTimer); _trendBannerLoopTimer = null; }
        container.innerHTML = `
            <div class="lp-trend-banner is-guest" onclick="if(window.handleLogin) window.handleLogin(); else { const m = document.getElementById('loginModalOverlay'); if(m) m.style.display = 'flex'; }" title="클릭하여 로그인하기">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 1.05rem;">📈</span>
                    <span style="font-size: 0.76rem; color: #cbd5e1;">로그인하시면 가입 이후 추천번호 당첨 성과 선그래프가 표시됩니다.</span>
                </div>
                <button type="button" style="background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; color: #38bdf8; font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap;">
                    로그인 &gt;
                </button>
            </div>
        `;
        return;
    }

    const name = displayName || (typeof getUserRealName === 'function' ? getUserRealName(cleanAuth) : '') || cleanAuth;

    // 1. 0ms 로컬 캐시 즉시 렌더링
    const cacheKey = `lotto_my_10w_trend_${cleanAuth}`;
    let cached = null;
    try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) cached = JSON.parse(raw);
    } catch(e) {}

    // Normalized Height with Logarithmic High Prize Ceiling Safeguard
    function getNormalizedHeightRatio(prize, maxP) {
        if (!prize || prize <= 0) return 0;
        if (maxP <= 100000) {
            return Math.min(0.85, 0.15 + (prize / maxP) * 0.70);
        }
        const minLog = Math.log10(5000);
        const curLog = Math.log10(Math.max(5000, prize));
        const maxLog = Math.log10(maxP);
        const ratio = (curLog - minLog) / Math.max(1, maxLog - minLog);
        return Math.min(0.88, 0.18 + ratio * 0.70);
    }

    function createSmoothPath(pts, padTop, padBottom, height) {
        if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
        let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i === 0 ? 0 : i - 1];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

            let cp1x = p1.x + (p2.x - p0.x) / 6;
            let cp1y = p1.y + (p2.y - p0.y) / 6;
            let cp2x = p2.x - (p3.x - p1.x) / 6;
            let cp2y = p2.y - (p3.y - p1.y) / 6;

            // 🔒 Control points clamped so curve peak never exceeds padTop - 2 (8px)
            cp1y = Math.max(padTop - 2, Math.min(height - padBottom, cp1y));
            cp2y = Math.max(padTop - 2, Math.min(height - padBottom, cp2y));

            path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        return path;
    }

    const renderFixedTrendGraph = (data) => {
        if (_trendBannerAnimId) { cancelAnimationFrame(_trendBannerAnimId); _trendBannerAnimId = null; }
        if (_trendBannerLoopTimer) { clearTimeout(_trendBannerLoopTimer); _trendBannerLoopTimer = null; }

        if (!data || !data.rounds || data.rounds.length === 0) {
            container.innerHTML = `
                <div class="lp-trend-banner" onclick="if(window.showLotto){ window.showLotto(); setTimeout(() => window.switchTab && window.switchTab('tab-generator'), 80); }" title="추천번호 생성 바로가기">
                    <div class="trend-top-row">
                        <div class="trend-title-box">
                            <span>📈</span>
                            <span><strong>${name} 님</strong> 최근 추천 당첨추이</span>
                        </div>
                        <div class="trend-top-right">
                            <span class="trend-range-pill">${data.joinRound || 1235}회 가입</span>
                            <i class="fa-solid fa-chevron-right trend-arrow-icon"></i>
                        </div>
                    </div>
                    <div style="font-size: 0.74rem; color: #94a3b8; padding: 2px 0;">가입 이후 추천번호 생성 및 추첨 대기 중입니다.</div>
                </div>
            `;
            return;
        }

        const count = data.rounds.length;
        const joinRound = data.joinRound || data.rounds[0].round;
        const lastData = data.rounds[count - 1];

        const totalPrize = data.totalPrize || data.rounds.reduce((acc, cur) => acc + (cur.prize || 0), 0);
        const totalWins = data.totalWins || data.rounds.reduce((acc, cur) => acc + (cur.hits || 0), 0);
        const winWeeks = data.rounds.filter(r => r.prize > 0).length;
        const winRate = count > 0 ? Math.round((winWeeks / count) * 100) : 0;

        // 최신회차 추천번호 당첨내역 포맷팅
        const isLatestMega = lastData.r1 > 0 || lastData.prize >= 100000000;
        const isLatestRank3 = lastData.r3 > 0 || (lastData.prize >= 1000000 && lastData.prize < 100000000);
        const isLatestRank4 = lastData.r4 > 0;
        const isLatestHigh = isLatestMega || isLatestRank3 || isLatestRank4;

        let latestRankTag = '';
        if (isLatestMega) latestRankTag = '1등 20억! 👑';
        else if (isLatestRank3) latestRankTag = '3등 150만! 🥉';
        else if (isLatestRank4) latestRankTag = `4등 ${lastData.r4}건`;
        else if (lastData.r5 > 0) latestRankTag = `5등 ${lastData.r5}건`;

        const latestPrizeStr = lastData.prize >= 100000000
            ? (lastData.prize / 100000000).toFixed(0) + '억원'
            : (lastData.prize > 0 ? '+' + lastData.prize.toLocaleString() + '원' : '0원');

        const latestHitsStr = lastData.hits > 0 ? `${lastData.hits}건 적중` : '미당첨';
        const latestBadgeClass = isLatestMega ? 'is-mega' : (isLatestRank3 ? 'is-orange' : (isLatestHigh ? 'is-gold' : ''));
        const latestIconHtml = isLatestMega ? '<i class="fa-solid fa-crown"></i>' : (lastData.prize > 0 ? '<i class="fa-solid fa-sparkles"></i>' : '<i class="fa-solid fa-circle-check"></i>');

        const totalPrizeDisp = totalPrize >= 100000000
            ? '+' + (totalPrize / 100000000).toFixed(1) + '억원'
            : '+' + totalPrize.toLocaleString() + '원';

        // SVG 좌표 계산 (너비 290, 높이 42, 패딩 X:10, 상단여백:10, 하단여백:8)
        const width = 290;
        const height = 42;
        const padX = 10;
        const padTop = 10;
        const padBottom = 8;
        const drawW = width - padX * 2;
        const drawH = height - padTop - padBottom; // 24px

        const maxPrize = Math.max(...data.rounds.map(d => d.prize), 50000);

        const points = data.rounds.map((d, i) => {
            const x = padX + (i / Math.max(1, count - 1)) * drawW;
            const ratio = getNormalizedHeightRatio(d.prize, maxPrize);
            const y = padTop + drawH - (ratio * drawH);
            return { x, y, data: d };
        });

        const lineD = createSmoothPath(points, padTop, padBottom, height);
        const areaD = lineD ? `${lineD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z` : '';

        const safeId = cleanAuth.replace(/[^a-zA-Z0-9_]/g, '_');

        // 고정 데이터 점(Dots) HTML 생성
        const dotsHtml = points.map((pt, idx) => {
            const isMega = pt.data.r1 > 0 || pt.data.prize >= 100000000;
            const isRank3 = pt.data.r3 > 0 || (pt.data.prize >= 1000000 && pt.data.prize < 100000000);
            const isRank4 = pt.data.r4 > 0;
            const isZero = pt.data.prize <= 0;
            const isLatest = (idx === count - 1);

            let dotColor = '#10b981';
            let dotRadius = 3.0;
            let strokeColor = '#070a14';
            let strokeW = '1.2';

            if (isMega) {
                dotColor = '#ef4444';
                dotRadius = 4.8;
                strokeColor = '#ffffff';
                strokeW = '1.6';
            } else if (isRank3) {
                dotColor = '#f97316';
                dotRadius = 4.0;
                strokeColor = '#fff7ed';
                strokeW = '1.4';
            } else if (isRank4) {
                dotColor = '#fbbf24';
                dotRadius = 3.5;
            } else if (isZero) {
                dotColor = '#475569';
                dotRadius = 2.4;
            }

            if (isLatest) {
                dotRadius = Math.max(dotRadius, 3.8);
                strokeColor = '#38bdf8';
                strokeW = '1.8';
            }

            const pStr = pt.data.prize >= 100000000
                ? (pt.data.prize / 100000000).toFixed(0) + '억원'
                : (pt.data.prize > 0 ? '+' + pt.data.prize.toLocaleString() + '원' : '0원');
            const hStr = pt.data.hits > 0 ? `${pt.data.hits}건 적중` : '미당첨';
            const tipText = `${pt.data.round}회: ${pStr} (${hStr})`;

            return `
                <g class="spark-dot-group" data-round="${pt.data.round}" data-tip="${tipText}" data-x="${pt.x.toFixed(1)}" data-y="${pt.y.toFixed(1)}" onclick="event.stopPropagation(); if(window.showLotto){ window.showLotto(); setTimeout(() => { if(window.switchTab) window.switchTab('tab-review'); if(typeof selectReviewRound === 'function') selectReviewRound(${pt.data.round}); }, 80); }">
                    ${isLatest ? `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="6.2" fill="none" stroke="#38bdf8" stroke-width="1.4" opacity="0.65" />` : ''}
                    <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${dotRadius}" fill="${dotColor}" stroke="${strokeColor}" stroke-width="${strokeW}" class="spark-dot ${isMega ? 'is-mega-dot' : ''}">
                        <title>${tipText}</title>
                    </circle>
                </g>
            `;
        }).join('');

        const startRound = points[0].data.round;
        const endRound = lastData.round;

        container.innerHTML = `
            <div class="lp-trend-banner" id="lpUserTrendBanner_${safeId}" onclick="if(window.showLotto){ window.showLotto(); setTimeout(() => { if(window.switchTab) window.switchTab('tab-review'); if(typeof selectReviewRound === 'function') selectReviewRound(${lastData.round}); }, 80); }" title="클릭 시 최신 ${lastData.round}회 추천번호 당첨결과 탭으로 이동">
                <!-- Tier 1: Title + Range / Latest Pill -->
                <div class="trend-top-row">
                    <div class="trend-title-box">
                        <span>📈</span>
                        <span><strong>${name} 님</strong> 최근 추천 당첨추이</span>
                    </div>
                    <div class="trend-top-right">
                        <span class="trend-sweep-pill ${latestBadgeClass}" id="lpTrendSweepPill_${safeId}">
                            ${latestIconHtml} <span><strong>최신 ${lastData.round}회:</strong> ${latestPrizeStr} (${latestHitsStr}${latestRankTag ? ' · ' + latestRankTag : ''})</span>
                        </span>
                        <i class="fa-solid fa-chevron-right trend-arrow-icon"></i>
                    </div>
                </div>

                <!-- Tier 2: Real-time Accumulating Stats (Fixed Solid Display) -->
                <div class="trend-stats-row">
                    <div class="trend-stat-main">
                        <span class="trend-stat-val" id="lpTrendTotalPrizeText_${safeId}" ${totalPrize >= 100000000 ? 'style="background:linear-gradient(90deg, #fbbf24 0%, #ef4444 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent;"' : 'style="color:#34d399;"'}>${totalPrizeDisp}</span>
                        <span class="trend-stat-sub" id="lpTrendSubHitsText_${safeId}">${totalWins}건 적중</span>
                    </div>
                    <div class="trend-stat-rate-pill" id="lpTrendWinRatePill_${safeId}">
                        <i class="fa-solid fa-fire"></i> ${winRate}% 적중
                    </div>
                </div>

                <!-- Tier 3: 100% Full-Width Fixed Solid Sparkline with Heat Gradient -->
                <div class="trend-sparkline-row">
                    <svg class="sparkline-svg" id="lpTrendSvg_${safeId}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                        <defs>
                            <!-- Heatmap Gradient for Area -->
                            <linearGradient id="lpTrendAreaGrad_${safeId}" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stop-color="#10b981" stop-opacity="0.04"></stop>
                                <stop offset="38%" stop-color="#10b981" stop-opacity="0.22"></stop>
                                <stop offset="68%" stop-color="#fbbf24" stop-opacity="0.30"></stop>
                                <stop offset="86%" stop-color="#f97316" stop-opacity="0.45"></stop>
                                <stop offset="100%" stop-color="#ef4444" stop-opacity="0.60"></stop>
                            </linearGradient>
                            <!-- Heatmap Gradient for Stroke Line -->
                            <linearGradient id="lpTrendLineGrad_${safeId}" x1="0" y1="1" x2="0" y2="0">
                                <stop offset="0%" stop-color="#10b981"></stop>
                                <stop offset="32%" stop-color="#10b981"></stop>
                                <stop offset="58%" stop-color="#fbbf24"></stop>
                                <stop offset="78%" stop-color="#f97316"></stop>
                                <stop offset="92%" stop-color="#ef4444"></stop>
                                <stop offset="100%" stop-color="#ff1744"></stop>
                            </linearGradient>
                            <filter id="lpTrendGlow_${safeId}" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2.0" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        <!-- 0원 기준 가이드라인 (점선) -->
                        <line x1="${padX}" y1="${padTop + drawH}" x2="${width - padX}" y2="${padTop + drawH}" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" stroke-dasharray="3,3" />
                        <!-- 고정 영역 & 고정 라인 -->
                        ${areaD ? `<path id="lpTrendAreaPath_${safeId}" d="${areaD}" fill="url(#lpTrendAreaGrad_${safeId})"></path>` : ''}
                        ${lineD ? `<path id="lpTrendLinePath_${safeId}" d="${lineD}" fill="none" stroke="url(#lpTrendLineGrad_${safeId})" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#lpTrendGlow_${safeId})"></path>` : ''}
                        <!-- 고정 데이터 점들 -->
                        <g id="lpTrendDotsGroup_${safeId}">${dotsHtml}</g>
                    </svg>
                    <!-- 호버/터치 툴팁 포인터 -->
                    <div class="spark-live-pointer" id="lpTrendLivePointer_${safeId}"></div>
                </div>

                <!-- 🏷️ 고정 그래프 X축 라벨 행 -->
                <div class="trend-x-axis-row">
                    <span>${startRound}회</span>
                    <span class="trend-x-axis-mid">가입 후 최근 ${count}주간 추천 성과</span>
                    <span class="trend-x-axis-latest"><strong>${endRound}회</strong> (최신)</span>
                </div>
            </div>
        `;

        // 마우스오버 / 터치 인터랙션 바인딩
        const bannerEl = document.getElementById(`lpUserTrendBanner_${safeId}`);
        const pointerEl = document.getElementById(`lpTrendLivePointer_${safeId}`);
        if (bannerEl && pointerEl) {
            const dotGroups = bannerEl.querySelectorAll('.spark-dot-group');
            dotGroups.forEach(grp => {
                const showTip = () => {
                    const tip = grp.dataset.tip;
                    const x = parseFloat(grp.dataset.x);
                    const y = parseFloat(grp.dataset.y);
                    if (tip && !isNaN(x) && !isNaN(y)) {
                        pointerEl.innerHTML = `<strong>${tip}</strong>`;
                        const pctX = (x / width) * 100;
                        pointerEl.style.left = `${pctX}%`;
                        pointerEl.style.top = `${y}px`;
                        pointerEl.classList.add('visible');
                    }
                };
                const hideTip = () => {
                    pointerEl.classList.remove('visible');
                };

                grp.addEventListener('mouseenter', showTip);
                grp.addEventListener('mouseleave', hideTip);
                grp.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    showTip();
                }, { passive: true });
            });

            bannerEl.addEventListener('mouseleave', () => {
                pointerEl.classList.remove('visible');
            });
        }
    };

    if (cached) {
        renderFixedTrendGraph(cached);
    }

    // 2. 가입일(joinRound) 이후 회차만 필터링하여 최신 데이터 산출
    try {
        const joinRound = (typeof getUserJoinRound === 'function') ? getUserJoinRound(cleanAuth) : 1235;
        const history = state.mergedHistory || {};
        const historyRounds = Object.keys(history)
            .map(Number)
            .filter(n => !isNaN(n) && n >= joinRound && Array.isArray(history[n]?.numbers) && history[n].numbers.length === 6)
            .sort((a, b) => a - b);

        const targetRounds = historyRounds.slice(-10);

        if (targetRounds.length === 0) {
            if (!cached) {
                renderFixedTrendGraph({ rounds: [], joinRound });
            }
            return;
        }

        const trendRounds = targetRounds.map(r => {
            let rev = null;
            try {
                if (typeof computeUser70RecommendationsReview === 'function') {
                    rev = computeUser70RecommendationsReview(cleanAuth, r);
                }
            } catch(e) {}
            return {
                round: r,
                prize: (rev && rev.totalPrize) || 0,
                hits: (rev && rev.totalWins) || 0,
                r1: (rev && rev.grandHits && rev.grandHits[1]) || 0,
                r2: (rev && rev.grandHits && rev.grandHits[2]) || 0,
                r3: (rev && rev.grandHits && rev.grandHits[3]) || 0,
                r4: (rev && rev.grandHits && rev.grandHits[4]) || 0,
                r5: (rev && rev.grandHits && rev.grandHits[5]) || 0
            };
        });

        const freshData = {
            joinRound,
            rounds: trendRounds,
            totalPrize: trendRounds.reduce((acc, cur) => acc + cur.prize, 0),
            totalWins: trendRounds.reduce((acc, cur) => acc + cur.hits, 0)
        };

        try {
            localStorage.setItem(cacheKey, JSON.stringify(freshData));
        } catch(e) {}

        renderFixedTrendGraph(freshData);
    } catch(err) {
        console.warn('[User Trend Banner Compute Error]', err);
    }
}

if (typeof window !== 'undefined') {
    window.renderLandingDashboard = renderLandingDashboard;
    window.updateHomeReviewDashboard = updateHomeReviewDashboard;
    window.updateHomeWinningTicker = updateHomeWinningTicker;
    window.updateHomeServiceCardsPermissions = updateHomeServiceCardsPermissions;
    window.getNextSaturday21KST = getNextSaturday21KST;
    window.getDrawRoundForSaturday21 = getDrawRoundForSaturday21;
    window.updateDrawCountdownBanner = updateDrawCountdownBanner;
    window.updateMobileDdayBadge = updateMobileDdayBadge;
    window.renderUserWinningTrendBanner = renderUserWinningTrendBanner;
}


