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

    // 9. Update Service Cards Access Permission Badges
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
            const rawRegisteredUsers = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0)
                ? state.allRegisteredUsersList
                : Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id, realName: id }));

            const registeredUsers = rawRegisteredUsers.filter(u => {
                const uId = (u.id || '').trim().toLowerCase();
                return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
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

if (typeof window !== 'undefined') {
    window.renderLandingDashboard = renderLandingDashboard;
    window.updateHomeReviewDashboard = updateHomeReviewDashboard;
    window.updateHomeWinningTicker = updateHomeWinningTicker;
    window.updateHomeServiceCardsPermissions = updateHomeServiceCardsPermissions;
}


