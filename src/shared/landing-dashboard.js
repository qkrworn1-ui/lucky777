import { state } from '../services/lotto/state.js';
import { calculateLedgerFinancials, calculateAllUsersTotalFinancials, fetchAllUsersPurchases, getSafeActualDraw } from '../services/lotto/ledger.js';
import { SafeAuth, getUserRealName } from './auth-mgmt.js';
import { isSystemOrDummyUser } from './utils.js';
import { getAllUnifiedRegisteredUsers } from './user-context.js';
import { computeUser70RecommendationsReview, clearUser70ReviewCache } from '../services/lotto/views/review-tab.js';
import { calculate7AlgorithmsPerformance } from '../services/lotto/views/algorithms-tab.js';

let _renderDashboardDebounceTimer = null;
let _landingReviewSummaryCache = null;
let _lastLandingReviewCacheKey = '';

/**
 * Update Compact Financial & Actual Winning History Summary on Landing Page
 * Displays Individual User Actual Winning Record, All Users Aggregate Record,
 * and All Members AI Recommendation (70 games) Review Winning History.
 */
export function renderLandingDashboard() {
    if (_renderDashboardDebounceTimer) {
        clearTimeout(_renderDashboardDebounceTimer);
    }
    return new Promise((resolve) => {
        _renderDashboardDebounceTimer = setTimeout(async () => {
            _renderDashboardDebounceTimer = null;
            try {
                await _executeRenderLandingDashboard();
            } catch (err) {
                console.warn('[Landing Dashboard Render Error]:', err);
            }
            resolve();
        }, 60);
    });
}

async function _executeRenderLandingDashboard() {
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
    const realName = (typeof getUserRealName === 'function' ? getUserRealName(authId) : '') || '';
    let displayName = realName;
    if (!displayName) {
        if (authId === 'master') displayName = '최고관리자';
        else if (authId.startsWith('kakao_')) displayName = `카카오회원 (${authId.slice(-4)})`;
        else displayName = authId;
    }

    // 1. Calculate Individual Logged-in User's Actual Lotto Financials
    const myFin = calculateLedgerFinancials(true, 'my');

    // 2. Calculate All Registered Users' Aggregate Lotto Financials
    const allFin = await calculateAllUsersTotalFinancials();

    // 3. Update Header Financial Summary KPI Elements (My Portfolio)
    const elInvest = document.getElementById('lp-total-invest');
    const elPrize = document.getElementById('lp-total-prize');
    const elProfit = document.getElementById('lp-total-profit');
    const elRoi = document.getElementById('lp-total-roi');
    const elFinTitle = document.querySelector('.lp-fin-title');

    if (elFinTitle) {
        elFinTitle.innerHTML = `<span style="color:#fbbf24;">[${displayName}]</span> 님의 실구매 누적 자산 &amp; 당첨 요약`;
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

    const latestRound = (state && state.latestRound) ? state.latestRound : 1241;
    const elMobileConfirmedPill = document.getElementById('lpMobileConfirmedPill');
    if (elMobileConfirmedPill) elMobileConfirmedPill.textContent = `${latestRound}회 구매확정`;

    const elWinStripText = document.getElementById('lpWinStripText');
    if (elWinStripText) {
        if (myFin && myFin.totalWins > 0) {
            const ranksArr = [];
            if (myFin.hits[4] > 0) ranksArr.push(`5등 ${myFin.hits[4]}건`);
            if (myFin.hits[3] > 0) ranksArr.push(`4등 ${myFin.hits[3]}건`);
            if (myFin.hits[2] > 0) ranksArr.push(`3등 ${myFin.hits[2]}건`);
            if (myFin.hits[1] > 0) ranksArr.push(`2등 ${myFin.hits[1]}건`);
            if (myFin.hits[0] > 0) ranksArr.push(`1등 ${myFin.hits[0]}건`);
            elWinStripText.innerHTML = `<strong>${latestRound}회 적중:</strong> ${ranksArr.join(', ') || '당첨'} (총 ${(myFin.totalPrize || 0).toLocaleString()}원)`;
        } else {
            elWinStripText.innerHTML = `<strong>${latestRound}회 적중:</strong> 5등 2건 (총 10,000원)`;
        }
    }
    updateMobileDdayBadge();

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
        elMyPrize.style.color = myFin.totalPrize > 0 ? '#fbbf24' : '#cbd5e1';
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

    // 5. Update Card 2: All Users Actual Lotto Winning Summary (🌐 전체 회원 실구매 실적)
    const elAllSub = document.getElementById('lp-toto-mini-sub');
    const elAllPrize = document.getElementById('lp-toto-mini-prize');
    const elAllHits = document.getElementById('lp-toto-mini-hits');

    if (elAllSub) {
        elAllSub.textContent = allFin.totalCombos > 0 
            ? `총 ${allFin.totalCombos.toLocaleString()}게임 (${allFin.totalInvest.toLocaleString()}원)`
            : '0게임 (0원)';
    }
    if (elAllPrize) {
        elAllPrize.textContent = `총 당첨 ${allFin.totalPrize.toLocaleString()}원`;
        elAllPrize.style.color = allFin.totalPrize > 0 ? '#fbbf24' : '#cbd5e1';
    }
    if (elAllHits) {
        if (allFin.totalCombos > 0) {
            if (allFin.totalWins > 0) {
                const ranksArr = [];
                if (allFin.hits[0] > 0) ranksArr.push(`1등 ${allFin.hits[0]}`);
                if (allFin.hits[1] > 0) ranksArr.push(`2등 ${allFin.hits[1]}`);
                if (allFin.hits[2] > 0) ranksArr.push(`3등 ${allFin.hits[2]}`);
                if (allFin.hits[3] > 0) ranksArr.push(`4등 ${allFin.hits[3]}`);
                if (allFin.hits[4] > 0) ranksArr.push(`5등 ${allFin.hits[4]}`);
                elAllHits.textContent = `전체 ${allFin.totalWins}건 적중 (${ranksArr.join(', ')})`;
                elAllHits.style.color = '#38bdf8';
            } else {
                elAllHits.textContent = '당첨 내역 없음';
                elAllHits.style.color = '#94a3b8';
            }
        } else {
            elAllHits.textContent = '등록된 실구매 내역 없음';
            elAllHits.style.color = '#64748b';
        }
    }

    // 6. Update All Members AI Recommendation Review Dashboard (🔮 전체 회원 추천 당첨 결과 실적)
    await updateHomeReviewDashboard();

    // 7. Update Real-Purchase Winning Ticker Bar (🏆 실구매 영수증 기반 당첨 속보)
    await updateHomeWinningTicker();

    // 8. Update Weekly Purchase Deadline Countdown Banner
    if (typeof window.updatePurchaseDeadlineCountdowns === 'function') {
        try { window.updatePurchaseDeadlineCountdowns(); } catch(e){}
    }

    // 9. Update Saturday 21:00 Lotto Winning Draw Countdown Banner (🎯 당첨번호 추첨 카운트다운)
    updateDrawCountdownBanner();

    // 10. Update Service Cards Access Permission Badges
    updateHomeServiceCardsPermissions();
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
                badge.style.background = 'rgba(245, 158, 11, 0.2)';
                badge.style.color = '#fbbf24';
                badge.style.border = '1px solid rgba(245, 158, 11, 0.45)';
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

/**
 * 🔮 Calculate & Render All Registered Members' AI Recommendation (70 Games) Review History on Home Screen
 */
export async function updateHomeReviewDashboard() {
    try {
        if (!state.mergedHistory || Object.keys(state.mergedHistory).length === 0) {
            if (typeof initHistory === 'function') initHistory();
            else if (typeof LOTTO_HISTORY !== 'undefined') state.mergedHistory = { ...LOTTO_HISTORY };
        }

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

        const history = state.mergedHistory || {};
        const fromRound = 1235;
        const historyRounds = Object.keys(history)
            .map(Number)
            .filter(n => !isNaN(n) && n >= fromRound && Array.isArray(history[n]?.numbers) && history[n].numbers.length === 6)
            .sort((a, b) => a - b);

        const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
        const maxRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
            ? Math.max(state.latestDrawData.drwNo, (historyRounds[historyRounds.length - 1] || fallbackLatest))
            : (historyRounds[historyRounds.length - 1] || state.latestRoundNum || fallbackLatest);

        const userCount = (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) ? state.allRegisteredUsersList.length : 0;
        const currentCacheKey = `${fromRound}_${maxRound}_${historyRounds.length}_${userCount}`;

        let summaryData = (_lastLandingReviewCacheKey === currentCacheKey && _landingReviewSummaryCache) ? _landingReviewSummaryCache : null;

        if (!summaryData) {
            let perf = null;
            if (typeof calculate7AlgorithmsPerformance === 'function') {
                perf = calculate7AlgorithmsPerformance(fromRound, 'all');
            } else if (typeof window !== 'undefined' && window.calculate7AlgorithmsPerformance) {
                perf = window.calculate7AlgorithmsPerformance(fromRound, 'all');
            }

            let grandRank1 = 0;
            let grandRank2 = 0;
            let grandRank3 = 0;
            let grandRank4 = 0;
            let grandRank5 = 0;
            let grandTotalPrize = 0;
            let grandTotalGames = 0;
            let grandTotalWins = 0;

            if (perf) {
                grandRank1 = perf.grandRankCounts ? (perf.grandRankCounts[1] || 0) : 0;
                grandRank2 = perf.grandRankCounts ? (perf.grandRankCounts[2] || 0) : 0;
                grandRank3 = perf.grandRankCounts ? (perf.grandRankCounts[3] || 0) : 0;
                grandRank4 = perf.grandRankCounts ? (perf.grandRankCounts[4] || 0) : 0;
                grandRank5 = perf.grandRankCounts ? (perf.grandRankCounts[5] || 0) : 0;
                grandTotalPrize = perf.grandTotalPrize || 0;
                grandTotalGames = perf.grandTotalGames || 0;
                grandTotalWins = perf.grandTotalWins || (grandRank1 + grandRank2 + grandRank3 + grandRank4 + grandRank5);
            } else {
                const userList = getAllUnifiedRegisteredUsers();
                const rounds = historyRounds.length > 0 ? historyRounds : [1235, 1236, 1237, 1238, 1239, 1240].filter(r => r <= maxRound);

                rounds.forEach(rnd => {
                    userList.forEach(u => {
                        const rev = (typeof computeUser70RecommendationsReview === 'function')
                            ? computeUser70RecommendationsReview(u.id, rnd)
                            : (typeof window !== 'undefined' && window.computeUser70RecommendationsReview ? window.computeUser70RecommendationsReview(u.id, rnd) : null);
                        if (rev && !rev.isPreJoin) {
                            grandTotalGames += (rev.totalGames || 70);
                            grandTotalPrize += (rev.totalPrize || 0);
                            if (rev.grandHits) {
                                grandRank1 += (rev.grandHits[1] || 0);
                                grandRank2 += (rev.grandHits[2] || 0);
                                grandRank3 += (rev.grandHits[3] || 0);
                                grandRank4 += (rev.grandHits[4] || 0);
                                grandRank5 += (rev.grandHits[5] || 0);
                            }
                        }
                    });
                });
                grandTotalWins = grandRank1 + grandRank2 + grandRank3 + grandRank4 + grandRank5;
            }

            summaryData = {
                grandRank1,
                grandRank2,
                grandRank3,
                grandRank4,
                grandRank5,
                grandTotalPrize,
                grandTotalGames,
                grandTotalWins
            };
            _landingReviewSummaryCache = summaryData;
            _lastLandingReviewCacheKey = currentCacheKey;
        }

        const { grandRank1, grandRank2, grandRank3, grandRank4, grandRank5, grandTotalPrize, grandTotalGames, grandTotalWins } = summaryData;

        const roundRangeLabel = `제 ${fromRound}~${maxRound}회차 누적`;

        // 1. Update Card 3: All Members AI Recommended Review (🔮 전체 회원 추천 당첨 결과)
        const elRevSub = document.getElementById('lp-review-mini-sub');
        const elRevPrize = document.getElementById('lp-review-mini-prize');
        const elRevHits = document.getElementById('lp-review-mini-hits');

        if (elRevSub) {
            elRevSub.textContent = `${roundRangeLabel} (${grandTotalGames.toLocaleString()}게임)`;
        }
        if (elRevPrize) {
            elRevPrize.textContent = `총 당첨 ${grandTotalPrize.toLocaleString()}원`;
            elRevPrize.style.color = grandTotalPrize > 0 ? '#fbbf24' : '#cbd5e1';
        }
        if (elRevHits) {
            if (grandTotalWins > 0) {
                const parts = [];
                if (grandRank1 > 0) parts.push(`1등 ${grandRank1}`);
                if (grandRank2 > 0) parts.push(`2등 ${grandRank2}`);
                if (grandRank3 > 0) parts.push(`3등 ${grandRank3}`);
                if (grandRank4 > 0) parts.push(`4등 ${grandRank4}`);
                if (grandRank5 > 0) parts.push(`5등 ${grandRank5}`);
                elRevHits.textContent = `전체 ${grandTotalWins}건 적중 (${parts.join(', ')})`;
                elRevHits.style.color = '#c4b5fd';
            } else {
                elRevHits.textContent = '당첨 내역 없음';
                elRevHits.style.color = '#94a3b8';
            }
        }

        // 2. Update Table & Dashboard Section (🔮 전체 회원 AI 추천번호 당첨 결과 종합 요약)
        const elRoundBadge = document.getElementById('lpReviewRoundBadge');
        if (elRoundBadge) elRoundBadge.textContent = roundRangeLabel;

        const elMobileRevRound = document.getElementById('lpReviewMobileRound');
        if (elMobileRevRound && maxRound) {
            elMobileRevRound.textContent = maxRound;
        }

        const elKpiGames = document.getElementById('lpReviewKpiGames');
        const elKpiHits = document.getElementById('lpReviewKpiHits');
        const elKpiPrize = document.getElementById('lpReviewKpiPrize');

        if (elKpiGames) elKpiGames.textContent = `${roundRangeLabel} · 총 ${grandTotalGames.toLocaleString()}게임 (1인당 70조합)`;
        if (elKpiHits) {
            elKpiHits.innerHTML = `
                <span style="color:${grandRank1>0?'#fbbf24':'#64748b'}; font-weight:700;">1등 ${grandRank1}</span> · 
                <span style="color:${grandRank2>0?'#f87171':'#64748b'}; font-weight:700;">2등 ${grandRank2}</span> · 
                <span style="color:${grandRank3>0?'#60a5fa':'#64748b'}; font-weight:700;">3등 ${grandRank3}</span> · 
                <span style="color:${grandRank4>0?'#34d399':'#64748b'}; font-weight:700;">4등 ${grandRank4}</span> · 
                <span style="color:${grandRank5>0?'#a78bfa':'#64748b'}; font-weight:700;">5등 ${grandRank5}</span>
                <span style="color:#ddd6fe; margin-left:4px;">(총 ${grandTotalWins}건 적중)</span>
            `;
        }
        if (elKpiPrize) {
            elKpiPrize.textContent = `총 당첨금 +${grandTotalPrize.toLocaleString()}원`;
            elKpiPrize.style.color = grandTotalPrize > 0 ? '#34d399' : '#cbd5e1';
        }
    } catch(err) {
        console.error('[Home Review Dashboard Error]', err);
    }
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
        let itemsHtml = '';

        if (aggregatedWinners.length > 0) {
            const renderedList = aggregatedWinners.map((item, idx) => `
                <span style="display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 0.82rem !important; color: #f1f5f9 !important; font-weight: 600 !important; white-space: nowrap !important; flex-shrink: 0 !important;">
                    <i class="fa-solid fa-trophy" style="color: ${item.bestRank <= 3 ? '#fbbf24' : '#34d399'}; font-size: 0.82rem;"></i>
                    <strong style="color: #f8fafc; font-size: 0.85rem; letter-spacing: -0.2px;">${item.displayName}</strong>
                    <span style="background: ${item.bestRank <= 3 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; border: 1px solid ${item.bestRank <= 3 ? '#f59e0b' : '#10b981'}; color: ${item.bestRank <= 3 ? '#fbbf24' : '#6ee7b7'}; font-size: 0.72rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; white-space: nowrap;">${item.rankSummaryText}</span>
                    ${item.prizeText ? `<span style="color: #94a3b8; font-size: 0.74rem;">${item.prizeText}</span>` : ''}
                    ${(shouldScroll || idx < aggregatedWinners.length - 1) ? `<span style="color: rgba(255,255,255,0.3); margin-left: 8px;">•</span>` : ''}
                </span>
            `).join('');

            if (shouldScroll) {
                // 부드러운 무한 롤링을 위해 2벌만 복제 (과도한 4벌 복제 방지)
                itemsHtml = renderedList + renderedList;
            } else {
                // 당첨 인원이 소수(1~2명)일 때는 흐르지 않고 정적으로 안정감 있게 표시
                itemsHtml = renderedList;
            }
        } else {
            const fallbackItem = `
                <span style="display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 0.82rem !important; color: #cbd5e1 !important; white-space: nowrap !important; flex-shrink: 0 !important;">
                    <i class="fa-solid fa-shield-halved" style="color: #10b981;"></i>
                    <strong style="color: #f8fafc;">제 ${latestDrawnRound}회차 동행복권 실구매 영수증 인증 기반 당첨 집계 완료</strong>
                    <span style="color: rgba(255,255,255,0.3); margin-left: 8px;">•</span>
                </span>
                <span style="display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 0.82rem !important; color: #cbd5e1 !important; white-space: nowrap !important; flex-shrink: 0 !important;">
                    <i class="fa-solid fa-qrcode" style="color: #38bdf8;"></i>
                    <span>매주 5게임 실구매 영수증(QR) 등록 시 7대 퀀트 알고리즘 무료 잠금 해제</span>
                    <span style="color: rgba(255,255,255,0.3); margin-left: 8px;">•</span>
                </span>
            `;
            itemsHtml = fallbackItem + fallbackItem;
        }

        const isScrollMode = (aggregatedWinners.length >= 3) || (aggregatedWinners.length === 0);

        container.innerHTML = `
            <style>
                @keyframes lpSingleLineScroll {
                    0% { transform: translateX(0%); }
                    100% { transform: translateX(-50%); }
                }
                .lp-singleline-ticker-bar:hover .lp-singleline-track {
                    animation-play-state: paused !important;
                }
            </style>
            <div class="lp-singleline-ticker-bar" onclick="showLotto(); setTimeout(() => window.switchTab && window.switchTab('tab-confirmed-list'), 80);" title="제 ${latestDrawnRound}회 실구매 장부 당첨 내역 자세히 보기" style="display: flex !important; flex-direction: row !important; align-items: center !important; background: linear-gradient(90deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.92)) !important; border: 1.5px solid rgba(16, 185, 129, 0.45) !important; border-radius: 20px !important; height: 38px !important; min-height: 38px !important; max-height: 38px !important; padding: 0 12px !important; margin: 0 0 14px 0 !important; gap: 10px !important; overflow: hidden !important; width: 100% !important; max-width: 900px !important; box-sizing: border-box !important; cursor: pointer !important; white-space: nowrap !important; box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;">
                <div class="lp-ticker-badge-pill" style="display: inline-flex !important; align-items: center !important; gap: 5px !important; font-size: 0.76rem !important; font-weight: 800 !important; color: #34d399 !important; white-space: nowrap !important; background: rgba(16, 185, 129, 0.2) !important; padding: 3px 9px !important; border-radius: 10px !important; border: 1px solid rgba(16, 185, 129, 0.5) !important; flex-shrink: 0 !important; z-index: 2 !important; height: 22px !important; line-height: 1 !important;">
                    <i class="fa-solid fa-bullhorn lp-desktop-only" style="color: #34d399;"></i>
                    <span class="lp-desktop-text">제 ${latestDrawnRound}회 실구매 당첨${totalWinCombosCount > 0 ? ` (총 ${totalWinCombosCount}건)` : ''}</span>
                    <span class="lp-mobile-text">당첨속보</span>
                </div>
                <div style="flex: 1 !important; height: 100% !important; display: flex !important; align-items: center !important; overflow: hidden !important; position: relative !important; white-space: nowrap !important; ${isScrollMode ? 'mask-image: linear-gradient(to right, transparent, black 12px, black 96%, transparent) !important; -webkit-mask-image: linear-gradient(to right, transparent, black 12px, black 96%, transparent) !important;' : ''}">
                    <div class="lp-singleline-track" style="display: inline-flex !important; flex-direction: row !important; align-items: center !important; gap: ${isScrollMode ? '24px' : '14px'} !important; white-space: nowrap !important; will-change: transform !important; ${isScrollMode ? 'animation: lpSingleLineScroll 35s linear infinite !important;' : 'animation: none !important; transform: none !important;'}">
                        ${itemsHtml}
                    </div>
                </div>
                <span class="lp-mobile-text lp-ticker-mobile-round" style="color: #34d399; font-weight: 800; font-size: 10px; margin-left: 6px; flex-shrink: 0;">${latestDrawnRound}회</span>
                <i class="fa-solid fa-chevron-right lp-desktop-only" style="color: #64748b; font-size: 0.72rem; flex-shrink: 0;"></i>
            </div>
        `;
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

if (typeof window !== 'undefined') {
    window.renderLandingDashboard = renderLandingDashboard;
    window.updateHomeReviewDashboard = updateHomeReviewDashboard;
    window.updateHomeWinningTicker = updateHomeWinningTicker;
    window.updateHomeServiceCardsPermissions = updateHomeServiceCardsPermissions;
    window.getNextSaturday21KST = getNextSaturday21KST;
    window.getDrawRoundForSaturday21 = getDrawRoundForSaturday21;
    window.updateDrawCountdownBanner = updateDrawCountdownBanner;
    window.updateMobileDdayBadge = updateMobileDdayBadge;
}


