import { state } from '../services/lotto/state.js';
import { calculateLedgerFinancials, calculateAllUsersTotalFinancials, fetchAllUsersPurchases } from '../services/lotto/ledger.js';
import { SafeAuth, getUserRealName } from './auth-mgmt.js';
import { computeUser70RecommendationsReview } from '../services/lotto/views/review-tab.js';

/**
 * Update Compact Financial & Actual Winning History Summary on Landing Page
 * Displays Individual User Actual Winning Record, All Users Aggregate Record,
 * and All Members AI Recommendation (70 games) Review Winning History.
 */
export async function renderLandingDashboard() {
    console.log('[Landing Dashboard] Updating individual and global winning summary...');

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || '비로그인';

    // 1. Calculate Individual User's Actual Lotto Financials
    //    관리자(master/admin)도 홈 화면 '나의 실구매 당첨' 카드는 본인 장부만 계산해야 함
    //    adminViewingTarget을 'my'로 임시 전환 후 본인 데이터만 계산하고 복원
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    let myFin;
    if (isAdmin) {
        const prevTarget = state.adminViewingTarget;
        state.adminViewingTarget = 'my';
        myFin = calculateLedgerFinancials(true);
        state.adminViewingTarget = (prevTarget !== undefined ? prevTarget : 'all');
    } else {
        myFin = calculateLedgerFinancials(true);
    }

    // 2. Calculate All Registered Users' Aggregate Lotto Financials
    const allFin = await calculateAllUsersTotalFinancials();

    // 3. Update Header Financial Summary KPI Elements (My Portfolio)
    const elInvest = document.getElementById('lp-total-invest');
    const elPrize = document.getElementById('lp-total-prize');
    const elProfit = document.getElementById('lp-total-profit');
    const elRoi = document.getElementById('lp-total-roi');
    const elFinTitle = document.querySelector('.lp-fin-title');

    if (elFinTitle) {
        elFinTitle.innerHTML = `<span style="color:#fbbf24;">[${authId}]</span> 님의 실구매 누적 자산 &amp; 당첨 요약`;
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

    // 4. Update Card 1: My Actual Lotto Winning Summary (👤 나의 실구매 당첨 실적)
    const elMyTitle = document.getElementById('lp-my-lotto-title');
    const elMySub = document.getElementById('lp-lotto-mini-sub');
    const elMyPrize = document.getElementById('lp-lotto-mini-prize');
    const elMyHits = document.getElementById('lp-lotto-mini-hits');

    if (elMyTitle) {
        elMyTitle.textContent = `👤 [${authId}] 님의 실구매 당첨`;
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

    // 6. Update All Members AI Recommendation Review Dashboard (🔮 전체 회원 추천 복기 당첨 실적)
    await updateHomeReviewDashboard();

    // 7. Update Weekly Purchase Deadline Countdown Banner
    if (typeof window.updatePurchaseDeadlineCountdowns === 'function') {
        try { window.updatePurchaseDeadlineCountdowns(); } catch(e){}
    }
}

/**
 * 🔮 Calculate & Render All Registered Members' AI Recommendation (70 Games) Review History on Home Screen
 */
export async function updateHomeReviewDashboard() {
    try {
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

        if (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0) {
            if (typeof fetchAllUsersPurchases === 'function') {
                await fetchAllUsersPurchases();
            }
        }

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
            // Fallback direct calculation across rounds 1235..maxRound and registered users
            const registeredUsers = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0)
                ? state.allRegisteredUsersList
                : Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id, realName: id }));

            const userList = registeredUsers.length > 0 ? [...registeredUsers] : [
                { id: 'master', name: '관리자 (마스터)', realName: '관리자 (마스터)' }
            ];

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

        const roundRangeLabel = `제 ${fromRound}~${maxRound}회차 누적`;

        // 1. Update Card 3: All Members AI Recommended Review (🔮 전체 회원 추천 복기 당첨)
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

        // 2. Update Table & Dashboard Section (🔮 전체 회원 AI 추천번호 복기 당첨 종합 요약)
        const elRoundBadge = document.getElementById('lpReviewRoundBadge');
        if (elRoundBadge) elRoundBadge.textContent = roundRangeLabel;

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

if (typeof window !== 'undefined') {
    window.renderLandingDashboard = renderLandingDashboard;
    window.updateHomeReviewDashboard = updateHomeReviewDashboard;
}


