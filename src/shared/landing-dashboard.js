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

    // 1. Calculate Individual User's Actual Lotto Financials
    //    관리자(master/admin)도 홈 화면 '나의 실구매 당첨' 카드는 본인 장부만 계산해야 함
    //    adminViewingTarget을 'my'로 임시 전환 후 본인 데이터만 계산하고 복원
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    let myFin;
    if (isAdmin) {
        const prevTarget = state.adminViewingTarget;
        state.adminViewingTarget = 'my';
        myFin = calculateLedgerFinancials(true);
        state.adminViewingTarget = (prevTarget !== undefined ? prevTarget : 'my');
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

    // 9. Update Real-Time Live Auto-Scrap Countdown & Trigger Engine
    updateHomeAutoScrapeCountdown();

    // 10. Update Service Cards Access Permission Badges
    updateHomeServiceCardsPermissions();
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
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> 🔒 권한 요청 필요';
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
                btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 지금 이용하기';
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
                btn.innerHTML = '<i class="fa-solid fa-lock"></i> 🔒 권한 요청 필요';
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
                btn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> 지금 이용하기 (테스트중)';
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
            const rawRegisteredUsers = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0)
                ? state.allRegisteredUsersList
                : Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id, realName: id }));

            const registeredUsers = rawRegisteredUsers.filter(u => {
                const uId = (u.id || '').trim().toLowerCase();
                return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'app_latest_version' && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'sample' && uId !== 'hms' && uId !== 'admin' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
            });

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

        const winningItems = [];

        // 마스킹 헬퍼 함수 (김**님, 이*님 등)
        function maskName(name, userId) {
            const raw = (name || userId || '').trim();
            if (!raw) return '회원**님';
            if (raw.length === 1) return `${raw}*님`;
            if (raw.length === 2) return `${raw[0]}*님`;
            return `${raw[0]}**님`;
        }

        candidateRounds.forEach(roundNum => {
            const actualDraw = history[roundNum];
            if (!actualDraw || !Array.isArray(actualDraw.numbers)) return;

            const winningSet = new Set(actualDraw.numbers);
            const bonus = actualDraw.bonus;

            // 전체 회원의 실구매 영수증 수집
            const allReceipts = [];
            if (state.allUsersPurchasesMap) {
                for (const uid in state.allUsersPurchasesMap) {
                    const uData = state.allUsersPurchasesMap[uid];
                    const roundReceipts = uData?.ledger?.[roundNum] || [];
                    roundReceipts.forEach(rcpt => {
                        allReceipts.push({
                            ...rcpt,
                            user: rcpt.user || uid,
                            userName: rcpt.userName || uData.realName || uid
                        });
                    });
                }
            } else if (state.allUsersMergedLedger && state.allUsersMergedLedger[roundNum]) {
                state.allUsersMergedLedger[roundNum].forEach(rcpt => allReceipts.push(rcpt));
            }

            allReceipts.forEach(receipt => {
                if (!receipt || !Array.isArray(receipt.combos)) return;
                const pUser = (receipt.user || receipt.userId || '').trim();
                const pName = receipt.userName || (typeof getUserRealName === 'function' ? getUserRealName(pUser) : '') || pUser;
                const displayName = maskName(pName, pUser);

                receipt.combos.forEach(combo => {
                    const nums = Array.isArray(combo) ? combo : (combo.numbers || []);
                    if (!Array.isArray(nums) || nums.length < 6) return;

                    const matchCount = nums.filter(n => winningSet.has(n)).length;
                    const hasBonus = bonus ? nums.includes(bonus) : false;

                    let rank = 0;
                    let rankText = '';
                    let rankClass = '';
                    let prizeText = '';

                    if (matchCount === 6) {
                        rank = 1;
                        rankText = '1등 당첨 🎉';
                        rankClass = 'rank-1';
                    } else if (matchCount === 5 && hasBonus) {
                        rank = 2;
                        rankText = '2등 당첨 🥈';
                        rankClass = 'rank-2';
                    } else if (matchCount === 5) {
                        rank = 3;
                        rankText = '3등 당첨 🥉';
                        rankClass = 'rank-3';
                    } else if (matchCount === 4) {
                        rank = 4;
                        rankText = '4등 당첨';
                        rankClass = 'rank-4';
                        prizeText = '(50,000원)';
                    } else if (matchCount === 3) {
                        rank = 5;
                        rankText = '5등 당첨';
                        rankClass = 'rank-5';
                        prizeText = '(5,000원)';
                    }

                    if (rank >= 1 && rank <= 5) {
                        winningItems.push({
                            round: roundNum,
                            displayName,
                            rank,
                            rankText,
                            rankClass,
                            prizeText
                        });
                    }
                });
            });
        });

        // HTML 아이템 생성 (한 줄로 옆으로 자연스럽게 흐르는 텍스트)
        let itemsHtml = '';
        if (winningItems.length > 0) {
            // 등수 높은 순(1등 -> 5등) 정렬
            winningItems.sort((a, b) => a.rank - b.rank);

            const renderedList = winningItems.map(item => `
                <span style="display: inline-flex !important; align-items: center !important; gap: 6px !important; font-size: 0.82rem !important; color: #f1f5f9 !important; font-weight: 600 !important; white-space: nowrap !important; flex-shrink: 0 !important;">
                    <i class="fa-solid fa-trophy" style="color: ${item.rank <= 3 ? '#fbbf24' : '#34d399'}; font-size: 0.82rem;"></i>
                    <strong style="color: #f8fafc; font-size: 0.85rem; letter-spacing: -0.2px;">${item.displayName}</strong>
                    <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #6ee7b7; font-size: 0.72rem; font-weight: 800; padding: 1px 6px; border-radius: 4px; white-space: nowrap;">${item.rankText}</span>
                    ${item.prizeText ? `<span style="color: #94a3b8; font-size: 0.74rem;">${item.prizeText}</span>` : ''}
                    <span style="color: rgba(255,255,255,0.3); margin-left: 8px;">•</span>
                </span>
            `).join('');

            // 끊김 없는 무한 롤링을 위해 4벌 복제
            itemsHtml = renderedList + renderedList + renderedList + renderedList;
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
            itemsHtml = fallbackItem + fallbackItem + fallbackItem + fallbackItem;
        }

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
                <div style="display: inline-flex !important; align-items: center !important; gap: 5px !important; font-size: 0.76rem !important; font-weight: 800 !important; color: #34d399 !important; white-space: nowrap !important; background: rgba(16, 185, 129, 0.2) !important; padding: 3px 9px !important; border-radius: 10px !important; border: 1px solid rgba(16, 185, 129, 0.5) !important; flex-shrink: 0 !important; z-index: 2 !important; height: 22px !important; line-height: 1 !important;">
                    <i class="fa-solid fa-bullhorn" style="color: #34d399;"></i>
                    <span>제 ${latestDrawnRound}회 실구매 당첨</span>
                </div>
                <div style="flex: 1 !important; height: 100% !important; display: flex !important; align-items: center !important; overflow: hidden !important; position: relative !important; white-space: nowrap !important; mask-image: linear-gradient(to right, transparent, black 12px, black 96%, transparent) !important; -webkit-mask-image: linear-gradient(to right, transparent, black 12px, black 96%, transparent) !important;">
                    <div class="lp-singleline-track" style="display: inline-flex !important; flex-direction: row !important; align-items: center !important; gap: 24px !important; white-space: nowrap !important; will-change: transform !important; animation: lpSingleLineScroll 30s linear infinite !important;">
                        ${itemsHtml}
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: #64748b; font-size: 0.72rem; flex-shrink: 0;"></i>
            </div>
        `;
    } catch(e) {
        console.error('[updateHomeWinningTicker Error]', e);
    }
}

/**
 * 🛰️ Real-Time Auto-Scrap Countdown & Trigger Engine for Home Screen
 * Displays live countdown down to seconds until the next round's official draw/scraping time (Saturday 21:00:00 KST)
 * and automatically initiates autoSyncMissingDraws when the scheduled time is reached.
 */
let homeAutoScrapeIntervalId = null;
let isAutoScrapingInProgress = false;

export function updateHomeAutoScrapeCountdown() {
    const bannerEl = document.getElementById('lpAutoScrapCountdownBanner');
    if (!bannerEl) return;

    function getScrapeScheduleInfo() {
        const history = (state && state.mergedHistory) || ((typeof LOTTO_HISTORY !== 'undefined') ? LOTTO_HISTORY : {});
        const historyRounds = Object.keys(history || {})
            .map(Number)
            .filter(n => !isNaN(n) && history[n] && Array.isArray(history[n].numbers) && history[n].numbers.length === 6)
            .sort((a, b) => a - b);

        const maxKnownRound = historyRounds.length > 0 
            ? Math.max(...historyRounds, 1237)
            : 1237;

        const nextTargetRound = maxKnownRound + 1;

        // Base Draw Date: Round 1 was 2002-12-07 21:00:00 KST (Saturday)
        const baseMs = new Date('2002-12-07T21:00:00+09:00').getTime();
        const targetMs = baseMs + (nextTargetRound - 1) * 7 * 24 * 60 * 60 * 1000;
        const targetDate = new Date(targetMs);

        const yyyy = targetDate.getFullYear();
        const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
        const dd = String(targetDate.getDate()).padStart(2, '0');
        const formattedDate = `${yyyy}. ${mm}. ${dd}`;

        return {
            maxKnownRound,
            nextTargetRound,
            targetMs,
            targetDate,
            formattedDate
        };
    }

    function renderScrapeBannerStep() {
        const info = getScrapeScheduleInfo();
        const nowMs = Date.now();
        const diffMs = info.targetMs - nowMs;

        // 1. If Target Draw Time is Reached or Passed (diffMs <= 0) & Round Not Yet Synced
        if (diffMs <= 0) {
            if (!isAutoScrapingInProgress) {
                isAutoScrapingInProgress = true;
                console.log(`[AutoScrap Timer] Reached draw time for Round ${info.nextTargetRound}! Triggering automatic sync pipeline...`);

                if (typeof window !== 'undefined' && typeof window.autoSyncMissingDraws === 'function') {
                    window.autoSyncMissingDraws(false).then((synced) => {
                        isAutoScrapingInProgress = false;
                        if (synced > 0) {
                            console.log(`[AutoScrap Timer] Round ${info.nextTargetRound} synced successfully!`);
                            if (typeof window.renderLandingDashboard === 'function') {
                                window.renderLandingDashboard();
                            }
                        } else {
                            // Retry after 30 seconds if Donghang Lottery has not published yet
                            setTimeout(() => {
                                isAutoScrapingInProgress = false;
                            }, 30000);
                        }
                    }).catch(err => {
                        console.error('[AutoScrap Timer Error]', err);
                        setTimeout(() => {
                            isAutoScrapingInProgress = false;
                        }, 30000);
                    });
                }
            }

            bannerEl.innerHTML = `
            <div class="lp-autoscrap-card" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.92) 100%); border: 1.5px solid rgba(245, 158, 11, 0.55); border-radius: 14px; padding: 12px 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(245, 158, 11, 0.2); display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; width: 100%;">
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 30px; height: 30px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">
                            <i class="fa-solid fa-satellite-dish fa-spin"></i>
                        </div>
                        <div style="font-size: 0.88rem; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span>로또 6/45 최신 회차 자동 스크랩 시스템</span>
                            <span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; font-weight: 800; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); color: #fde68a; display: inline-flex; align-items: center; gap: 4px;">
                                <span style="width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; box-shadow: 0 0 8px #fbbf24; display: inline-block;"></span> 자동 수집 파이프라인 가동중
                            </span>
                        </div>
                    </div>
                    <div style="font-size: 0.74rem; color: #94a3b8; background: rgba(2, 6, 23, 0.7); padding: 3px 9px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08); white-space: nowrap;">
                        보유 최신: <strong style="color: #38bdf8;">제 ${info.maxKnownRound}회</strong>
                    </div>
                </div>
                <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; flex-direction: column; gap: 3px; min-width: 200px; flex: 1;">
                        <div style="font-size: 0.86rem; font-weight: 800; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-arrows-rotate fa-spin"></i>
                            <span>[제 ${info.nextTargetRound}회차] 동행복권 공식 서버 최신 당첨번호 자동 수집 중...</span>
                        </div>
                        <div style="font-size: 0.74rem; color: #94a3b8;">
                            공식 발표 시 실시간 1~5등 당첨금 및 회원별 당첨 결과가 즉시 자동 갱신됩니다.
                        </div>
                    </div>
                    <button type="button" class="lp-btn-scrape-now" onclick="window.handleFetchLatestDrawClick && window.handleFetchLatestDrawClick()" style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: #0f172a; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 3px 10px rgba(245, 158, 11, 0.35); white-space: nowrap;">
                        <i class="fa-solid fa-terminal"></i> 스크랩 콘솔 열기
                    </button>
                </div>
            </div>
            `;
            return;
        }

        // 2. Live Countdown until Target Saturday 21:00:00 KST
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        bannerEl.innerHTML = `
        <div class="lp-autoscrap-card" style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(30, 41, 59, 0.92) 100%); border: 1.5px solid rgba(56, 189, 248, 0.4); border-radius: 14px; padding: 12px 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(56, 189, 248, 0.12); display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; width: 100%;">
            <!-- 상단: 타이틀 & 상태 뱃지 -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 30px; height: 30px; border-radius: 8px; background: rgba(56, 189, 248, 0.18); border: 1px solid rgba(56, 189, 248, 0.4); color: #38bdf8; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; flex-shrink: 0;">
                        <i class="fa-solid fa-satellite-dish"></i>
                    </div>
                    <div style="font-size: 0.88rem; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span>로또 6/45 최신 회차 자동 스크랩 시스템</span>
                        <span style="font-size: 0.68rem; padding: 2px 7px; border-radius: 6px; font-weight: 800; background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(16, 185, 129, 0.45); color: #6ee7b7; display: inline-flex; align-items: center; gap: 4px;">
                            <span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 6px #10b981; display: inline-block;"></span> 실시간 대기중
                        </span>
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #94a3b8; background: rgba(2, 6, 23, 0.7); padding: 3px 9px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.08); white-space: nowrap;">
                    보유 최신: <strong style="color: #38bdf8;">제 ${info.maxKnownRound}회</strong>
                </div>
            </div>

            <!-- 메인: 대상 회차 + 디지털 카운트다운 타이머 + 즉시 실행 버튼 -->
            <div style="background: rgba(2, 6, 23, 0.6); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 10px; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; flex-direction: column; gap: 3px; min-width: 200px; flex: 1;">
                    <div style="font-size: 0.86rem; font-weight: 800; color: #e2e8f0; display: flex; align-items: center; gap: 4px;">
                        <span>🎯</span> <span><strong style="color: #38bdf8; font-weight: 900;">제 ${info.nextTargetRound}회차</strong> 최신 당첨번호 자동 수집까지</span>
                    </div>
                    <div style="font-size: 0.74rem; color: #94a3b8;">
                        📅 예정: <span style="color: #cbd5e1; font-weight: 700;">${info.formattedDate} (토) 21:00:00</span> (동행복권 공식 서버 연동)
                    </div>
                </div>

                <!-- ⏱️ 디지털 카운트다운 박스 (초단위 글로우) -->
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: nowrap; margin: 2px 0;">
                    <div style="background: #020617; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 7px; padding: 4px 7px; display: inline-flex; align-items: baseline; gap: 2px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.7);">
                        <span style="font-family: 'Space Grotesk', 'Consolas', monospace; font-size: 1.15rem; font-weight: 900; color: #38bdf8; line-height: 1;">${days}</span>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700;">일</span>
                    </div>
                    <span style="font-size: 0.95rem; font-weight: 900; color: #475569; margin: 0 1px;">:</span>
                    <div style="background: #020617; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 7px; padding: 4px 7px; display: inline-flex; align-items: baseline; gap: 2px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.7);">
                        <span style="font-family: 'Space Grotesk', 'Consolas', monospace; font-size: 1.15rem; font-weight: 900; color: #38bdf8; line-height: 1;">${String(hours).padStart(2, '0')}</span>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700;">시간</span>
                    </div>
                    <span style="font-size: 0.95rem; font-weight: 900; color: #475569; margin: 0 1px;">:</span>
                    <div style="background: #020617; border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 7px; padding: 4px 7px; display: inline-flex; align-items: baseline; gap: 2px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.7);">
                        <span style="font-family: 'Space Grotesk', 'Consolas', monospace; font-size: 1.15rem; font-weight: 900; color: #38bdf8; line-height: 1;">${String(minutes).padStart(2, '0')}</span>
                        <span style="font-size: 0.68rem; color: #64748b; font-weight: 700;">분</span>
                    </div>
                    <span style="font-size: 0.95rem; font-weight: 900; color: #475569; margin: 0 1px;">:</span>
                    <div style="background: #020617; border: 1px solid rgba(251, 191, 36, 0.45); border-radius: 7px; padding: 4px 7px; display: inline-flex; align-items: baseline; gap: 2px; box-shadow: inset 0 2px 5px rgba(0,0,0,0.7), 0 0 10px rgba(251, 191, 36, 0.15);">
                        <span style="font-family: 'Space Grotesk', 'Consolas', monospace; font-size: 1.15rem; font-weight: 900; color: #fbbf24; text-shadow: 0 0 8px rgba(251, 191, 36, 0.45); line-height: 1;">${String(seconds).padStart(2, '0')}</span>
                        <span style="font-size: 0.68rem; color: #fbbf24; font-weight: 700;">초</span>
                    </div>
                </div>

                <button type="button" class="lp-btn-scrape-now" onclick="window.handleFetchLatestDrawClick && window.handleFetchLatestDrawClick()" title="동행복권 공식 서버에서 지금 즉시 최신 당첨번호 수집 시도" style="background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%); color: #041226; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 3px 10px rgba(56, 189, 248, 0.35); white-space: nowrap;">
                    <i class="fa-solid fa-bolt"></i> 지금 즉시 스크랩
                </button>
            </div>
        </div>
        `;
    }

    renderScrapeBannerStep();

    if (homeAutoScrapeIntervalId) {
        clearInterval(homeAutoScrapeIntervalId);
    }
    homeAutoScrapeIntervalId = setInterval(renderScrapeBannerStep, 1000);
}

if (typeof window !== 'undefined') {
    window.renderLandingDashboard = renderLandingDashboard;
    window.updateHomeReviewDashboard = updateHomeReviewDashboard;
    window.updateHomeWinningTicker = updateHomeWinningTicker;
    window.updateHomeServiceCardsPermissions = updateHomeServiceCardsPermissions;
    window.updateHomeAutoScrapeCountdown = updateHomeAutoScrapeCountdown;
}



