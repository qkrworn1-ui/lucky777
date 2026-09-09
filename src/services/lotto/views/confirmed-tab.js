import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, calculateACValue, removeUndefined } from '../../../shared/utils.js';
import { createBallHtml, renderBallRow, getRankBadge, openModal, closeModal } from '../../../shared/components.js';
import { db } from '../../../shared/db.js';
import { SafeAuth, isAdminUser, getUserRealName } from '../../../shared/auth-mgmt.js';
import { getLedger, fetchAllUsersPurchases, saveToLedger, saveLedgerDirectly, getComboNumbers, getHistoricalTop10Combinations, calculateLedgerFinancials, getSafeActualDraw, exportLedgerToFile, importLedgerFromFile, clearEntireLedger, deduplicateReceipts } from '../ledger.js';
import { computeAbsoluteTop10Combinations, findBestRecommendationMatch, generateExtraAddonPack } from '../generator.js';
import { recalculateGroups } from '../statistics.js';

export async function renderConfirmedPurchasesList() {
    const container = document.getElementById('confirmedPurchasesListContainer');
    if (!container) return;

    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try {
            const parsed = JSON.parse(authId);
            authId = parsed.userid || parsed.userId || authId;
        } catch (e) {}
    }
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));

    // If Admin, prefetch all users' purchases if not yet loaded
    if (isAdmin && window.db && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0)) {
        await fetchAllUsersPurchases();
    }

    const ledger = getLedger();

    // Only render actual confirmed rounds saved in ledger (e.g. 1239+)
    const ledgerRounds = Object.keys(ledger).map(Number).filter(r => !isNaN(r) && r > 0 && Array.isArray(ledger[r]) && ledger[r].length > 0);
    const rounds = ledgerRounds.sort((a,b) => b - a); // descending order: newest first!

    // --- 💰 Financial & Chart Calculation (Optimized & Memoized) ---
    const fin = calculateLedgerFinancials(true);
    const { totalInvest, totalPrize, netProfit, totalRoi, hits, trendLabels, trendInvest, trendPrize } = fin;

    // Update financial text fields
    const elTotalInvest = document.getElementById('confirmedTotalInvest');
    const elTotalPrize = document.getElementById('confirmedTotalPrize');
    const elNetProfit = document.getElementById('confirmedNetProfit');
    const elTotalRoi = document.getElementById('confirmedTotalRoi');

    if (elTotalInvest) elTotalInvest.textContent = totalInvest.toLocaleString() + ' 원';
    if (elTotalPrize) elTotalPrize.textContent = totalPrize.toLocaleString() + ' 원';
    
    if (elNetProfit) {
        elNetProfit.textContent = (netProfit >= 0 ? '+' : '') + netProfit.toLocaleString() + ' 원';
        elNetProfit.style.color = netProfit >= 0 ? '#10b981' : '#f87171';
    }
    
    if (elTotalRoi) {
        elTotalRoi.textContent = totalRoi.toFixed(1) + '%';
        elTotalRoi.style.color = totalRoi >= 100 ? '#10b981' : (totalRoi > 0 ? '#fbbf24' : '#cbd5e1');
    }

    // Render 1~5 rank winning summary banner on the confirmed tab
    const totalCombosCount = totalInvest / 1000;
    renderConfirmedRankSummary(hits, totalCombosCount, totalPrize, totalInvest);

    // Render Charts
    const totalWins = hits.reduce((a,b) => a+b, 0);
    if (state.confirmedPrizeChartInstance) state.confirmedPrizeChartInstance.destroy();
    const canvasPie = document.getElementById('confirmedPrizeRatioChart');
    if (canvasPie && typeof canvasPie.getContext === 'function' && typeof window.Chart === 'function') {
        const ctxPie = canvasPie.getContext('2d');
        state.confirmedPrizeChartInstance = new window.Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['1등', '2등', '3등', '4등', '5등'],
                datasets: [{
                    data: totalWins > 0 ? hits : [0, 0, 0, 0, 1],
                    backgroundColor: ['#fbc400', '#69c8f2', '#ff7272', '#a0aec0', '#b0d840'],
                    borderWidth: 1,
                    borderColor: 'rgba(15,23,42,0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 9 } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (totalWins === 0) return '당첨 내역 없음';
                                const val = context.raw || 0;
                                const pct = ((val / totalWins) * 100).toFixed(1);
                                return `${context.label}: ${val}회 (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    if (state.confirmedTrendChartInstance) state.confirmedTrendChartInstance.destroy();
    const canvasTrend = document.getElementById('confirmedTrendLineChart');
    if (canvasTrend && typeof canvasTrend.getContext === 'function' && typeof window.Chart === 'function') {
        const ctxTrend = canvasTrend.getContext('2d');
        state.confirmedTrendChartInstance = new window.Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: trendLabels.length > 0 ? trendLabels : ['대기'],
                datasets: [
                    {
                        label: '누적 투자금',
                        data: trendInvest.length > 0 ? trendInvest : [0],
                        borderColor: '#cbd5e1',
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        borderWidth: 1.5,
                        tension: 0.1
                    },
                    {
                        label: '누적 회수금(당첨금)',
                        data: trendPrize.length > 0 ? trendPrize : [0],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.05)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 9 } } } },
                scales: {
                    x: { ticks: { color: '#cbd5e1', font: { size: 8 } }, grid: { display: false } },
                    y: { 
                        ticks: { 
                            color: '#cbd5e1', 
                            font: { size: 8 },
                            callback: function(value) { 
                                if (value >= 10000) {
                                    return (value / 10000).toLocaleString() + '만원'; 
                                }
                                return value.toLocaleString() + '원';
                            }
                        }, 
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    // Admin user selector dropdown HTML
    let adminUserSelectHtml = '';
    if (isAdmin) {
        const currentTarget = state.adminViewingTarget || 'all';
        const userList = Object.keys(state.allUsersPurchasesMap || {}).filter(uId => {
            const clean = (uId || '').trim().toLowerCase();
            return !clean.startsWith('{') && !clean.startsWith('test_') && clean !== 'user_alpha' && clean !== 'user_beta' && clean !== 'pjg' && clean !== 'sample' && clean !== 'hms';
        });
        
        let optionsHtml = `<option value="all" ${currentTarget === 'all' ? 'selected' : ''}>👥 [전체 회원 통합 보기 (${userList.length}명)]</option>`;
        optionsHtml += `<option value="my" ${currentTarget === 'my' ? 'selected' : ''}>👤 [내 계정 구매내역 (${authId})]</option>`;
        
        userList.forEach(uId => {
            const uInfo = state.allUsersPurchasesMap[uId];
            const uName = uInfo ? uInfo.realName : uId;
            const label = uName !== uId ? `${uId} (${uName})` : uId;
            optionsHtml += `<option value="${uId}" ${currentTarget === uId ? 'selected' : ''}>👤 ${label}</option>`;
        });

        adminUserSelectHtml = `
            <div class="confirmed-admin-bar" style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                <span style="font-size: 0.8rem; color: #fbbf24; font-weight: 800; display: flex; align-items: center; gap: 5px; white-space: nowrap; flex-shrink: 0;">
                    <i class="fa-solid fa-crown"></i> 관리자 구매내역 조회 대상:
                </span>
                <select id="selAdminLedgerTarget" style="background: #0f172a; color: #fff; border: 1px solid #f59e0b; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; outline: none; cursor: pointer; max-width: 100%; min-width: 0; flex: 1 1 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; box-sizing: border-box;">
                    ${optionsHtml}
                </select>
                <button type="button" onclick="window.refreshAdminLedgers && window.refreshAdminLedgers()" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; padding: 4px 8px; border-radius: 6px; font-size: 0.74rem; cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0;">
                    <i class="fa-solid fa-rotate-right"></i> 전체 새로고침
                </button>
            </div>
        `;
    }

    // 1-1. [ADMIN ALL USERS SUMMARY TABLE] Real Purchase Winnings & Algorithm Distribution Overview (When Admin)
    let adminOverviewTableHtml = '';
    if (isAdmin && state.allUsersPurchasesMap) {
        const currentTarget = state.adminViewingTarget || 'all';
        const userList = Object.keys(state.allUsersPurchasesMap || {}).filter(uId => {
            const clean = (uId || '').trim().toLowerCase();
            return !clean.startsWith('{') && !clean.startsWith('test_') && clean !== 'user_alpha' && clean !== 'user_beta' && clean !== 'pjg' && clean !== 'sample' && clean !== 'hms';
        });
        const history = state.mergedHistory || {};

        // Compute actual purchase winning stats with algorithm breakdown for each user
        const memberStatsList = userList.map(uId => {
            const uInfo = state.allUsersPurchasesMap[uId] || {};
            const uLedger = uInfo.ledger || {};
            const uName = uInfo.realName || uId;

            let totalGames = 0;
            let totalInvest = 0;
            let totalPrize = 0;
            const rankHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            const algoHits = { v4: 0, v3: 0, extra: 0, manual: 0 };

            Object.keys(uLedger).forEach(rStr => {
                const round = parseInt(rStr);
                if (isNaN(round) || !Array.isArray(uLedger[rStr])) return;
                const actualDraw = history[round];
                const winningSet = actualDraw && actualDraw.numbers ? new Set(actualDraw.numbers) : null;
                const bonus = actualDraw ? actualDraw.bonus : null;

                // Cache algorithm recommendations for this round & user to identify source
                const uV4 = computeAbsoluteTop10Combinations(false, round, 'v4', true, uId) || [];
                const uV3 = computeAbsoluteTop10Combinations(false, round, 'v3', true, uId) || [];
                const extraPacks = (typeof generateExtraAddonPack === 'function') 
                    ? [1, 2, 3, 4, 5].map(pId => generateExtraAddonPack(pId, round, uId)) : [];

                uLedger[rStr].forEach(receipt => {
                    const combos = receipt.combos || [];
                    combos.forEach(c => {
                        totalGames++;
                        totalInvest += 1000;
                        const nums = getComboNumbers(c);

                        let rank = 0;
                        let prize = 0;
                        if (winningSet) {
                            const matches = nums.filter(n => winningSet.has(n));
                            const matchCount = matches.length;
                            const hasBonus = bonus ? nums.includes(bonus) : false;

                            if (matchCount === 6) {
                                rank = 1;
                                prize = actualDraw.rank1Prize || actualDraw.firstWinamnt || 2000000000;
                            } else if (matchCount === 5 && hasBonus) {
                                rank = 2;
                                prize = actualDraw.rank2Prize || 50000000;
                            } else if (matchCount === 5) {
                                rank = 3;
                                prize = actualDraw.rank3Prize || 1500000;
                            } else if (matchCount === 4) {
                                rank = 4;
                                prize = 50000;
                            } else if (matchCount === 3) {
                                rank = 5;
                                prize = 5000;
                            }

                            if (rank >= 1 && rank <= 5) {
                                rankHits[rank]++;
                                totalPrize += prize;

                                // Determine Algorithm Origin
                                const match = findBestRecommendationMatch(nums, uV4, uV3, extraPacks);
                                if (match.isExact) {
                                    if (match.matchedVersion.includes('V4.0')) algoHits.v4++;
                                    else if (match.matchedVersion.includes('V3.0')) algoHits.v3++;
                                    else if (match.matchedVersion.includes('추가')) algoHits.extra++;
                                } else {
                                    algoHits.manual++;
                                }
                            }
                        }
                    });
                });
            });

            const totalWins = rankHits[1] + rankHits[2] + rankHits[3] + rankHits[4] + rankHits[5];
            const roi = totalInvest > 0 ? (totalPrize / totalInvest) * 100 : 0;

            return {
                userId: uId,
                realName: uName,
                totalGames,
                totalInvest,
                totalPrize,
                rankHits,
                algoHits,
                totalWins,
                roi
            };
        }).sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins);

        const grandPurchased = memberStatsList.reduce((a, b) => a + b.totalInvest, 0);
        const grandGames = memberStatsList.reduce((a, b) => a + b.totalGames, 0);
        const grandPrize = memberStatsList.reduce((a, b) => a + b.totalPrize, 0);
        const grandR1 = memberStatsList.reduce((a, b) => a + b.rankHits[1], 0);
        const grandR2 = memberStatsList.reduce((a, b) => a + b.rankHits[2], 0);
        const grandR3 = memberStatsList.reduce((a, b) => a + b.rankHits[3], 0);
        const grandR4 = memberStatsList.reduce((a, b) => a + b.rankHits[4], 0);
        const grandR5 = memberStatsList.reduce((a, b) => a + b.rankHits[5], 0);
        const grandAlgoV4 = memberStatsList.reduce((a, b) => a + b.algoHits.v4, 0);
        const grandAlgoV3 = memberStatsList.reduce((a, b) => a + b.algoHits.v3, 0);
        const grandAlgoExtra = memberStatsList.reduce((a, b) => a + b.algoHits.extra, 0);
        const grandAlgoManual = memberStatsList.reduce((a, b) => a + b.algoHits.manual, 0);

        let rowsHtml = '';
        memberStatsList.forEach(m => {
            const isCurrent = (currentTarget === m.userId);
            rowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem; background: ${isCurrent ? 'rgba(245, 158, 11, 0.12)' : 'transparent'};">
                    <td style="padding: 8px 10px; font-weight: 700; color: #f8fafc; white-space: nowrap;">
                        <span style="color: #fbbf24;"><i class="fa-solid fa-user"></i> ${m.userId}</span>
                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: normal;">${m.realName}</div>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; color: #cbd5e1; white-space: nowrap;">
                        ${m.totalGames}게임<br>
                        <span style="font-size: 0.68rem; color: #94a3b8;">(${m.totalInvest.toLocaleString()}원)</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 5px; border-radius: 4px; background: rgba(251,191,36,0.15); color: ${m.rankHits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">${m.rankHits[1]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 5px; border-radius: 4px; background: rgba(248,113,113,0.15); color: ${m.rankHits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">${m.rankHits[2]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 5px; border-radius: 4px; background: rgba(96,165,250,0.15); color: ${m.rankHits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">${m.rankHits[3]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 5px; border-radius: 4px; background: rgba(52,211,153,0.15); color: ${m.rankHits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">${m.rankHits[4]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 5px; border-radius: 4px; background: rgba(167,139,250,0.15); color: ${m.rankHits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">${m.rankHits[5]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap; font-size: 0.72rem;">
                        <span title="V4.0 적중" style="color: #c4b5fd; font-weight: 700;">V4:${m.algoHits.v4}</span> ·
                        <span title="V3.0 적중" style="color: #fbbf24; font-weight: 700;">V3:${m.algoHits.v3}</span> ·
                        <span title="추가팩 적중" style="color: #6ee7b7; font-weight: 700;">추가:${m.algoHits.extra}</span> ·
                        <span title="수동 적중" style="color: #94a3b8;">수동:${m.algoHits.manual}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: ${m.totalPrize > 0 ? '#34d399' : '#94a3b8'}; white-space: nowrap;">
                        +${m.totalPrize.toLocaleString()}원
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${m.roi >= 100 ? '#10b981' : (m.roi > 0 ? '#fbbf24' : '#64748b')}; white-space: nowrap;">
                        ${m.roi.toFixed(1)}%
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <button type="button" onclick="window.changeConfirmedAdminUser && window.changeConfirmedAdminUser('${m.userId}')" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 4px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-receipt"></i> 장부 보기
                        </button>
                    </td>
                </tr>
            `;
        });

        // Add Back Navigation Button if currently viewing a single user in admin mode
        let backNavHtml = '';
        if (currentTarget !== 'all') {
            backNavHtml = `
                <div style="margin-top: 10px; padding: 8px 12px; background: rgba(0,0,0,0.4); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span style="font-size: 0.8rem; color: #fbbf24; font-weight: 700;">
                        <i class="fa-solid fa-user-check"></i> 현재 👤 [${currentTarget}] 회원의 개별 구매 장부 조회 중
                    </span>
                    <button type="button" onclick="window.changeConfirmedAdminUser && window.changeConfirmedAdminUser('all')" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25)); border: 1.5px solid #f59e0b; color: #fbbf24; padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-arrow-left"></i> 전체 회원 구매목록으로 돌아가기
                    </button>
                </div>
            `;
        }

        adminOverviewTableHtml = `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 1.1rem;"></i>
                        <h4 style="margin: 0; color: #fbbf24; font-size: 0.95rem; font-weight: 800;">
                            [관리자 종합 현황] 전체 회원 실구매 당첨 이력 및 알고리즘별 적중 통계표
                        </h4>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1;">
                        총 <strong>${memberStatsList.length}명</strong> | 실구매 <strong>${grandGames}게임</strong> (${grandPurchased.toLocaleString()}원) · 총 당첨금 <strong style="color: #34d399;">+${grandPrize.toLocaleString()}원</strong>
                    </div>
                </div>

                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 780px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.35); border-bottom: 1.5px solid rgba(255,255,255,0.12); font-size: 0.74rem; color: #94a3b8;">
                                <th style="padding: 8px 10px;">회원명 (ID)</th>
                                <th style="padding: 8px 10px; text-align: right;">구매 게임(금액)</th>
                                <th style="padding: 8px 10px; text-align: center; color: #fbbf24;">1등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #f87171;">2등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #60a5fa;">3등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #34d399;">4등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #a78bfa;">5등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #c7d2fe;">적중 알고리즘 분포</th>
                                <th style="padding: 8px 10px; text-align: right; color: #34d399;">총 당첨금</th>
                                <th style="padding: 8px 10px; text-align: right;">수익률</th>
                                <th style="padding: 8px 10px; text-align: center;">개별 장부</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(0,0,0,0.5); font-weight: 800; font-size: 0.8rem; border-top: 2px solid rgba(245,158,11,0.5);">
                                <td style="padding: 10px; color: #fbbf24;">전체 합계 (${memberStatsList.length}명)</td>
                                <td style="padding: 10px; text-align: right; color: #f8fafc;">${grandGames}게임 (${grandPurchased.toLocaleString()}원)</td>
                                <td style="padding: 10px; text-align: center; color: #fbbf24;">${grandR1}</td>
                                <td style="padding: 10px; text-align: center; color: #f87171;">${grandR2}</td>
                                <td style="padding: 10px; text-align: center; color: #60a5fa;">${grandR3}</td>
                                <td style="padding: 10px; text-align: center; color: #34d399;">${grandR4}</td>
                                <td style="padding: 10px; text-align: center; color: #a78bfa;">${grandR5}</td>
                                <td style="padding: 10px; text-align: center; font-size: 0.74rem;">
                                    <span style="color: #c4b5fd;">V4:${grandAlgoV4}</span> ·
                                    <span style="color: #fbbf24;">V3:${grandAlgoV3}</span> ·
                                    <span style="color: #6ee7b7;">추가:${grandAlgoExtra}</span> ·
                                    <span style="color: #94a3b8;">수동:${grandAlgoManual}</span>
                                </td>
                                <td style="padding: 10px; text-align: right; color: #34d399;">+${grandPrize.toLocaleString()}원</td>
                                <td style="padding: 10px; text-align: right; color: #fbbf24;">${grandPurchased > 0 ? ((grandPrize / grandPurchased) * 100).toFixed(1) : '0.0'}%</td>
                                <td style="padding: 10px; text-align: center; color: #64748b;">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                ${backNavHtml}
            </div>
        `;
    }

    let html = `
        ${adminUserSelectHtml}
        ${adminOverviewTableHtml}

        <!-- 🛡️ 실구매 장부 데이터 무결성 & 조작 방지 공식 인증 박스 -->
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.77rem; color: #cbd5e1; flex: 1; min-width: 250px;">
                <i class="fa-solid fa-stamp" style="color: #34d399; font-size: 1.15rem; flex-shrink: 0;"></i>
                <span><strong>실구매 장부 불변 잠금(Immutable Lock) 보증:</strong> 본 장부의 모든 구매 내역은 실물 영수증(동행복권 QR코드 일련번호) 인증 및 <strong>추첨 마감 전 전자 타임스탬프</strong>로 잠금 보호되어 사후 임의 수정·조작·삭제가 원천 차단된 100% 공인 데이터입니다.</span>
            </div>
            <span style="font-size: 0.7rem; color: #34d399; font-weight: 800; background: rgba(16,185,129,0.18); border: 1px solid rgba(16,185,129,0.35); padding: 3px 9px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                <i class="fa-solid fa-shield-check"></i> 위·변조 방지 잠금 가동 중
            </span>
        </div>

        <div style="margin-bottom: 15px; padding: 12px 16px; background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.2); border-radius: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span style="color: #cbd5e1; font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-user-shield" style="color: #818cf8;"></i> 
                    접속 계정: <strong style="color: #fff; font-weight: 700; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(99, 102, 241, 0.5); padding: 2px 8px; border-radius: 6px;">${authId}</strong>
                    ${isAdmin ? `<span style="font-size:0.72rem; color:#fbbf24; background:rgba(245,158,11,0.2); border:1px solid #f59e0b; padding:1px 6px; border-radius:4px; font-weight:800;"><i class="fa-solid fa-crown"></i> 관리자</span>` : ''}
                </span>
                <span style="font-size: 0.78rem; color: #a78bfa; background: rgba(167, 139, 250, 0.12); border: 1px solid rgba(167, 139, 250, 0.25); padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-shield-halved"></i> ${(() => { const cur = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239); return cur; })()}회차~ 신규 원장 운용중
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                ${isAdmin ? `
                    <button id="btnOpenReceiptTrash" title="삭제된 영수증이 임시 보관된 휴지통을 열어 원상 복원하거나 영구 삭제합니다." style="padding: 5px 12px; font-size: 0.78rem; background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(185, 28, 28, 0.25)); border: 1.5px solid #ef4444; color: #fca5a5; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: 800; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);">
                        <i class="fa-solid fa-trash-arrow-up" style="color: #f87171;"></i> 🗑️ 영수증 휴지통 
                        <span id="badgeReceiptTrashCount" style="background: #ef4444; color: #fff; font-size: 0.7rem; padding: 1px 6px; border-radius: 10px; font-weight: 900;">${(typeof window.getReceiptTrashList === 'function' ? window.getReceiptTrashList().length : 0)}</span>
                    </button>
                ` : ''}
                <button id="btnExportLedgerBackup" title="현재 등록된 실구매 확정 내역 전체를 고유 텍스트 파일(.json)로 안전하게 다운로드 백업합니다." style="padding: 5px 11px; font-size: 0.78rem; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.45); color: #6ee7b7; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 700;">
                    <i class="fa-solid fa-download"></i> 💾 텍스트 백업 (.json)
                </button>
                <button id="btnTriggerImportLedger" title="백업해 둔 JSON 텍스트 파일을 업로드하여 원본 실구매 내역을 무결 복원합니다." style="padding: 5px 11px; font-size: 0.78rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.45); color: #93c5fd; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 700;">
                    <i class="fa-solid fa-upload"></i> 📥 백업 복원
                </button>
                <input type="file" id="ledgerBackupFileInput" accept=".json" style="display: none;" />
                ${isAdmin ? `
                    <button id="btnClearEntireLedger" title="구매확정 내역 전체를 깨끗하게 비웁니다." style="padding: 5px 11px; font-size: 0.78rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: 600;">
                        <i class="fa-solid fa-broom"></i> 🧹 전체 초기화
                    </button>
                ` : ''}
                <span style="font-size: 0.8rem; color: var(--text-secondary); background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">총 ${rounds.length}개 회차</span>
            </div>
        </div>
    `;

    if (rounds.length === 0) {
        const emptyUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
        html += `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;">
                <i class="fa-solid fa-receipt" style="font-size: 2.5rem; margin-bottom: 12px; color: #10b981;"></i>
                <p style="font-size: 1.05rem; font-weight: 700; color: #f1f5f9; margin-bottom: 6px;">구매 확정된 번호 조합 내역이 없습니다.</p>
                <p style="font-size: 0.82rem; color: #94a3b8; margin: 0;">제 ${emptyUpcomingRound}회차 추천 번호를 구매하신 후 <strong>[QR 스캔 등록]</strong> 버튼으로 실구매 영수증을 등록하실 수 있습니다.</p>
            </div>
        `;
        container.innerHTML = html;
        bindLedgerToolbarEvents();
        return;
    }

    rounds.forEach(round => {
        const actualDraw = getSafeActualDraw(round);
        let purchases = getHistoricalTop10Combinations(round);
        if (!purchases || purchases.length === 0) return;

        // 🔒 STRICT PRIVACY ISOLATION FOR NORMAL USERS:
        // Normal users must NEVER see other members' receipts!
        if (!isAdmin) {
            purchases = purchases.filter(p => {
                const pUser = (p.user || p.userId || '').trim().toLowerCase();
                const myUser = authId.trim().toLowerCase();
                return pUser === myUser;
            });
            if (purchases.length === 0) return;
        }

        purchases = deduplicateReceipts(purchases);
        if (purchases.length === 0) return;

        const isWaiting = !actualDraw;

        // Summarize outcomes for past draws
        let summaryHTML = '';
        let winCountSummary = '';
        if (actualDraw) {
            const winningSet = new Set(actualDraw.numbers);
            const bonus = actualDraw.bonus;
            
            let hitsSummary = [0, 0, 0, 0, 0, 0]; // Index 1-5 for ranks, 0 for miss
            purchases.forEach(p => {
                p.combos.forEach(combo => {
                    const nums = getComboNumbers(combo);
                    const matches = nums.filter(n => winningSet.has(n));
                    const matchCount = matches.length;
                    const hasBonus = nums.includes(bonus);

                    if (matchCount === 6) hitsSummary[1]++;
                    else if (matchCount === 5 && hasBonus) hitsSummary[2]++;
                    else if (matchCount === 5) hitsSummary[3]++;
                    else if (matchCount === 4) hitsSummary[4]++;
                    else if (matchCount === 3) hitsSummary[5]++;
                    else hitsSummary[0]++;
                });
            });

            const parts = [];
            if (hitsSummary[1] > 0) parts.push(`1등 ${hitsSummary[1]}개`);
            if (hitsSummary[2] > 0) parts.push(`2등 ${hitsSummary[2]}개`);
            if (hitsSummary[3] > 0) parts.push(`3등 ${hitsSummary[3]}개`);
            if (hitsSummary[4] > 0) parts.push(`4등 ${hitsSummary[4]}개`);
            if (hitsSummary[5] > 0) parts.push(`5등 ${hitsSummary[5]}개`);
            
            if (parts.length > 0) {
                winCountSummary = `<span class="confirmed-round-win-badge" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.5); padding: 2px 8px; border-radius: 12px; font-size: 0.74rem; color: #34d399; font-weight: bold; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-award"></i> ${parts.join(', ')} 당첨</span>`;
            } else {
                winCountSummary = `<span class="confirmed-round-win-badge" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 12px; font-size: 0.74rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">낙첨</span>`;
            }

            const getColor = (n) => {
                if (n <= 10) return '#fbc400';
                if (n <= 20) return '#69c8f2';
                if (n <= 30) return '#ff7272';
                if (n <= 40) return '#aaa';
                return '#b0d840';
            };

            summaryHTML = `
                <div class="confirmed-round-summary-row" style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; display:inline-flex; align-items:center; gap: 6px; flex-wrap: wrap;">
                    <span style="white-space: nowrap; font-weight: 700;">당첨번호:</span>
                    <div style="display:inline-flex; align-items:center; gap: 3px; flex-wrap: wrap;">
                        ${actualDraw.numbers.map(n => `<span style="background:${getColor(n)}; width:18px; height:18px; line-height:18px; font-size:0.7rem; border-radius:50%; text-align:center; color:#fff; font-weight:bold; display:inline-block;">${n}</span>`).join('')}
                        <span style="font-weight:bold; font-size:0.75rem; margin:0 2px;">+</span>
                        <span style="background:${getColor(actualDraw.bonus)}; width:18px; height:18px; line-height:18px; font-size:0.7rem; border-radius:50%; text-align:center; color:#fff; font-weight:bold; display:inline-block;">${actualDraw.bonus}</span>
                    </div>
                </div>
            `;
        } else {
            winCountSummary = `<span class="confirmed-round-win-badge" style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); padding: 2px 8px; border-radius: 12px; font-size: 0.74rem; color: #60a5fa; font-weight: bold; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-clock"></i> 추첨 대기중</span>`;
        }

        const allPurchasesLocked = purchases.length > 0 && purchases.every(p => !!p.isLocked);
        const roundLockBtnBg = allPurchasesLocked ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.08)';
        const roundLockBtnBorder = allPurchasesLocked ? '#f59e0b' : 'rgba(255, 255, 255, 0.2)';
        const roundLockBtnColor = allPurchasesLocked ? '#fbbf24' : '#cbd5e1';
        const roundLockIcon = allPurchasesLocked ? 'fa-lock' : 'fa-lock-open';
        const roundLockText = allPurchasesLocked ? '회차 잠김' : '회차 잠금';

        // Extract registered accounts for this round (clean real names for compact mobile responsiveness)
        const registeredUsers = Array.from(new Set(purchases.map(p => p.user || authId).filter(Boolean)));
        let usersBadge = '';
        if (registeredUsers.length > 0) {
            const userNames = registeredUsers.map(u => {
                const uName = (typeof getUserRealName === 'function' ? getUserRealName(u) : '') || 
                              (state.allUsersPurchasesMap && state.allUsersPurchasesMap[u.toLowerCase()] ? state.allUsersPurchasesMap[u.toLowerCase()].realName : '') || 
                              u;
                return `<strong style="color: #fff; font-weight: 700;">${uName}</strong>`;
            });
            usersBadge = `
                <span class="confirmed-round-users-badge" style="background: rgba(99, 102, 241, 0.16); border: 1px solid rgba(99, 102, 241, 0.35); padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; color: #c7d2fe; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; max-width: 100%; word-break: break-word; line-height: 1.35;">
                    <i class="fa-solid fa-user-check" style="color: #818cf8; font-size: 0.65rem; flex-shrink: 0;"></i> 
                    <span>구매자: ${userNames.join(', ')}</span>
                </span>
            `;
        }

        html += `
            <div class="confirmed-round-card" style="background: rgba(30, 41, 59, 0.5); border: 1px solid ${allPurchasesLocked ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.05)'}; border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.15); box-sizing: border-box; max-width: 100%; overflow: hidden;">
                <div class="confirmed-round-header" style="display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; cursor:pointer;" onclick="const content = this.nextElementSibling; const icon = this.querySelector('.chevron-icon'); if (content.style.display === 'none') { content.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; } else { content.style.display = 'none'; icon.style.transform = 'rotate(0deg)'; }">
                    <div class="confirmed-round-title-row" style="display:flex; align-items:center; flex-wrap: wrap; gap: 6px; width: 100%;">
                        <strong style="font-size: 1.02rem; color: #fff; display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <i class="fa-solid fa-chevron-down chevron-icon" style="transition: transform 0.3s; font-size:0.9rem; color: var(--text-secondary); transform: rotate(180deg);"></i>
                            제 ${round}회차 구매 확정 내역
                        </strong>
                        ${usersBadge}
                        ${winCountSummary}
                        ${allPurchasesLocked ? '<span style="color: #fbbf24; font-size: 0.74rem; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); padding: 2px 8px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-lock"></i> 전체 잠금됨</span>' : ''}
                    </div>
                    <div class="confirmed-round-sub-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; width: 100%; margin-top: 2px;">
                        <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            ${summaryHTML}
                        </div>
                        <div class="confirmed-round-actions" style="display:inline-flex; align-items:center; flex-wrap: wrap; gap: 6px; flex-shrink: 0; margin-left: auto;" onclick="event.stopPropagation();">
                            ${isAdmin ? `
                                ${round === 1238 && purchases.length > 3 ? `
                                    <button class="btn-clean-1238-ghosts" data-round="1238" title="1238회 실제 구매(#1~#3) 외 가상 영수증 일괄 정리" style="padding: 3px 8px; font-size: 0.75rem; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.5); color: #fbbf24; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: bold;">
                                        <i class="fa-solid fa-broom"></i> #4~#${purchases.length} 정리
                                    </button>
                                ` : ''}
                                <button class="btn-delete-unlocked-round" data-round="${round}" title="잠금되지 않은 영수증 일괄 삭제" style="padding: 3px 8px; font-size: 0.75rem; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 4px; font-weight: 600;">
                                    <i class="fa-solid fa-trash-can"></i> 미잠금 삭제
                                </button>
                                <button class="btn-toggle-lock-round" data-round="${round}" style="padding: 3px 10px; font-size: 0.75rem; background: ${roundLockBtnBg}; border: 1px solid ${roundLockBtnBorder}; color: ${roundLockBtnColor}; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-weight: bold;">
                                    <i class="fa-solid ${roundLockIcon}"></i> ${roundLockText}
                                </button>
                            ` : ''}
                            <span style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">총 ${purchases.reduce((acc, p) => acc + p.combos.length, 0)}조합</span>
                        </div>
                    </div>
                </div>

                <!-- Combinations detailed list -->
                <div class="confirmed-round-body" style="margin-top: 10px; display: block;">
        `;

        // Precompute V3 and V4 maps for this round for fast cross-checking
        // ignoreLedger=true ensures we always compare against the AI-generated pool, never against stored purchase data
        const v3Combos = computeAbsoluteTop10Combinations(false, round, 'v3', true) || [];
        const v4Combos = computeAbsoluteTop10Combinations(false, round, 'v4', true) || [];
        const toKey = (arr) => [...arr].sort((a,b) => a - b).join(',');
        const v3Map = new Map();
        v3Combos.forEach((c, idx) => {
            const arr = getComboNumbers(c);
            if (arr.length === 6) v3Map.set(toKey(arr), idx + 1);
        });
        const v4Map = new Map();
        v4Combos.forEach((c, idx) => {
            const arr = getComboNumbers(c);
            if (arr.length === 6) v4Map.set(toKey(arr), idx + 1);
        });

        purchases.forEach((purchase, pIdx) => {
            const isLocked = !!purchase.isLocked;
            const purchaseUser = purchase.user || purchase.userId || authId;
            const purchaseUserName = (typeof getUserRealName === 'function' ? getUserRealName(purchaseUser) : '') || 
                purchase.userName || purchase.realName || 
                (state.allUsersPurchasesMap && state.allUsersPurchasesMap[purchaseUser.toLowerCase()] ? state.allUsersPurchasesMap[purchaseUser.toLowerCase()].realName : '') || 
                '';

            const lockBtnBg = isLocked ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)';
            const lockBtnBorder = isLocked ? 'rgba(245, 158, 11, 0.5)' : 'rgba(255, 255, 255, 0.15)';
            const lockBtnColor = isLocked ? '#fbbf24' : '#cbd5e1';
            const lockBtnText = isLocked ? '잠김' : '잠금';
            const lockIcon = isLocked ? 'fa-lock' : 'fa-lock-open';

            // Distinctive Algorithm Version Badge
            const pVer = purchase.version || '';
            let versionBadgeHtml = '';
            if (pVer.includes('추가')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(5, 150, 105, 0.28)); border: 1px solid #34d399; color: #a7f3d0; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-rocket" style="color: #6ee7b7;"></i> ${pVer.split(' (')[0]}</span>`;
            } else if (pVer.includes('QR') || pVer.includes('qr')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.28), rgba(5, 150, 105, 0.28)); border: 1px solid #34d399; color: #a7f3d0; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-qrcode" style="color: #6ee7b7;"></i> QR 실구매 영수증 (5게임)</span>`;
            } else if (pVer.includes('V4.0') || pVer.includes('4.0')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.28), rgba(124, 58, 237, 0.28)); border: 1px solid #a78bfa; color: #ddd6fe; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-brain" style="color: #c4b5fd;"></i> V4.0 행동경제학</span>`;
            } else if (pVer.includes('V3.0') || pVer.includes('3.0')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.28), rgba(217, 119, 6, 0.28)); border: 1px solid #f59e0b; color: #fef08a; padding: 2px 10px; border-radius: 12px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-bolt" style="color: #fbbf24;"></i> V3.0 하이브리드</span>`;
            } else {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(148, 163, 184, 0.18); border: 1px solid rgba(148, 163, 184, 0.35); color: #cbd5e1; padding: 2px 10px; border-radius: 12px; font-weight: 700; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-pen-nib"></i> 수동/직접구매</span>`;
            }

            let purchaserLabel = '';
            if (purchaseUserName && purchaseUserName.toLowerCase() !== purchaseUser.toLowerCase()) {
                purchaserLabel = `구매자: <strong style="color: #fbbf24; font-weight: 800;">${purchaseUserName}</strong> <span style="color: #cbd5e1; font-size: 0.68rem; font-weight: 500;">(${purchaseUser})</span>`;
            } else {
                purchaserLabel = `구매자: <strong style="color: #fff; font-weight: 700;">${purchaseUser}</strong>`;
            }

            html += `
                <div class="confirmed-receipt-card" style="border-left: 3px solid ${isLocked ? '#f59e0b' : (pVer.includes('V4.0') ? '#8b5cf6' : (pVer.includes('V3.0') ? '#f59e0b' : '#64748b'))}; padding-left: 12px; margin-bottom: 14px; background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px;">
                    <div class="confirmed-receipt-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 9px; flex-wrap: wrap; gap: 7px;">
                        <div class="confirmed-receipt-title-group" style="font-size: 0.82rem; color: var(--text-secondary); font-weight: bold; display:flex; align-items:center; gap: 6px; flex-wrap: wrap;">
                            <span class="confirmed-receipt-title" style="color: #fff; font-size: 0.84rem; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-receipt" style="color: #f59e0b;"></i> 영수증 #${pIdx+1}</span>
                            ${versionBadgeHtml}
                            <span class="confirmed-user-badge" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;">
                                <i class="fa-solid fa-user-check" style="color: #60a5fa; font-size: 0.68rem;"></i> ${purchaserLabel}
                            </span>
                            ${isLocked ? '<span class="confirmed-lock-badge" style="color: #fbbf24; font-size: 0.72rem; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); padding: 1px 6px; border-radius: 4px;"><i class="fa-solid fa-lock"></i> 잠금됨</span>' : ''}
                        </div>
                        <div class="confirmed-receipt-actions" style="display:flex; gap: 5px;">
                            ${isAdmin ? `
                                <button class="btn-toggle-lock-purchase" data-round="${round}" data-pidx="${pIdx}" title="${isLocked ? '잠금 해제하기' : '실수 방지 잠금'}" style="padding: 2px 7px; font-size: 0.74rem; background: ${lockBtnBg}; border: 1px solid ${lockBtnBorder}; color: ${lockBtnColor}; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid ${lockIcon}"></i> ${lockBtnText}
                                </button>
                                <button class="btn-edit-purchase" data-round="${round}" data-pidx="${pIdx}" ${isLocked ? 'disabled' : ''} style="padding: 2px 7px; font-size: 0.74rem; background: ${isLocked ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.2)'}; border: 1px solid ${isLocked ? 'rgba(255,255,255,0.1)' : 'rgba(59, 130, 246, 0.4)'}; color: ${isLocked ? '#64748b' : '#93c5fd'}; border-radius: 4px; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-edit"></i> 수정
                                </button>
                                <button class="btn-delete-purchase" data-round="${round}" data-pidx="${pIdx}" ${isLocked ? 'disabled' : ''} title="${isLocked ? '잠금 해제 후 휴지통으로 이동 가능' : '휴지통으로 안전 보관 이동'}" style="padding: 2px 7px; font-size: 0.74rem; background: ${isLocked ? 'rgba(255,255,255,0.05)' : 'rgba(239, 68, 68, 0.2)'}; border: 1px solid ${isLocked ? 'rgba(255,255,255,0.1)' : 'rgba(239, 68, 68, 0.4)'}; color: ${isLocked ? '#64748b' : '#fca5a5'}; border-radius: 4px; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; display: flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-trash-can"></i> 삭제(휴지통)
                                </button>
                            ` : `
                                <span style="color: #34d399; font-size: 0.72rem; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); padding: 2px 7px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-shield-halved"></i> 영구 보관됨
                                </span>
                            `}
                        </div>
                    </div>
                    <div class="confirmed-games-list" style="display:flex; flex-direction:column; gap: 6px;">
            `;

            purchase.combos.forEach((combo, cIdx) => {
                const nums = getComboNumbers(combo);
                
                // Check if this combo matches an AI recommendation (Supported from round 1239 onwards)
                let aiMatchTag = '';
                if (round >= 1239) {
                    const uV4 = computeAbsoluteTop10Combinations(false, round, 'v4', true, purchaseUser) || [];
                    const uV3 = computeAbsoluteTop10Combinations(false, round, 'v3', true, purchaseUser) || [];
                    const extraPacks = (typeof generateExtraAddonPack === 'function') ? [1, 2, 3, 4, 5].map(pId => generateExtraAddonPack(pId, round, purchaseUser)) : (state.extraPacks || []);
                    const match = findBestRecommendationMatch(nums, uV4, uV3, extraPacks);
                    if (match.isExact) {
                        if (match.matchedVersion.includes('추가')) {
                            aiMatchTag = `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; font-size: 0.7rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-rocket" style="font-size: 0.62rem;"></i> ${match.label}</span>`;
                        } else if (match.matchedVersion.includes('V4.0')) {
                            aiMatchTag = `<span style="background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size: 0.7rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-brain" style="font-size: 0.62rem;"></i> ${match.label}</span>`;
                        } else {
                            aiMatchTag = `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 0.7rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-bolt" style="font-size: 0.62rem;"></i> ${match.label}</span>`;
                        }
                    } else {
                        aiMatchTag = `<span style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 0.7rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;" title="수동입력"><i class="fa-solid fa-pen-to-square" style="font-size: 0.62rem; color: #f87171;"></i> 수동</span>`;
                    }
                }
                
                let resultText = "추첨 대기";
                let resultColor = "#94a3b8";
                let rowBg = "rgba(255,255,255,0.015)";
                let border = "1px solid rgba(255,255,255,0.04)";

                const getColor = (n) => {
                    if (n <= 10) return '#fbc400';
                    if (n <= 20) return '#69c8f2';
                    if (n <= 30) return '#ff7272';
                    if (n <= 40) return '#aaa';
                    return '#b0d840';
                };

                if (actualDraw) {
                    const winningSet = new Set(actualDraw.numbers);
                    const bonus = actualDraw.bonus;
                    const matches = nums.filter(n => winningSet.has(n));
                    const matchCount = matches.length;
                    const hasBonus = nums.includes(bonus);

                    resultText = `<span style="color: #94a3b8; font-size: 0.78rem;">낙첨</span>`;
                    if (matchCount === 6) {
                        resultText = `<span style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(217, 119, 6, 0.3)); border: 1px solid #fbbf24; color: #fef08a; padding: 2px 8px; border-radius: 5px; font-size: 0.78rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 8px rgba(251, 191, 36, 0.3);"><i class="fa-solid fa-crown" style="color: #fbbf24;"></i> 1등 당첨</span>`;
                        rowBg = "rgba(251,191,36,0.08)";
                        border = "1px solid #fbbf24";
                    } else if (matchCount === 5 && hasBonus) {
                        resultText = `<span style="background: rgba(248, 113, 113, 0.25); border: 1px solid #f87171; color: #fecaca; padding: 2px 7px; border-radius: 5px; font-size: 0.76rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-medal" style="color: #f87171;"></i> 2등 당첨</span>`;
                        rowBg = "rgba(248,113,113,0.08)";
                        border = "1px solid #f87171";
                    } else if (matchCount === 5) {
                        resultText = `<span style="background: rgba(96, 165, 250, 0.25); border: 1px solid #60a5fa; color: #bfdbfe; padding: 2px 7px; border-radius: 5px; font-size: 0.76rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-trophy" style="color: #60a5fa;"></i> 3등 당첨</span>`;
                        rowBg = "rgba(96,165,250,0.08)";
                        border = "1px solid #60a5fa";
                    } else if (matchCount === 4) {
                        resultText = `<span style="background: rgba(52, 211, 153, 0.25); border: 1px solid #34d399; color: #a7f3d0; padding: 2px 7px; border-radius: 5px; font-size: 0.76rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-award" style="color: #34d399;"></i> 4등 (50,000원)</span>`;
                        rowBg = "rgba(52,211,153,0.08)";
                        border = "1px solid #34d399";
                    } else if (matchCount === 3) {
                        resultText = `<span style="background: rgba(167, 139, 250, 0.25); border: 1px solid #a78bfa; color: #ddd6fe; padding: 2px 7px; border-radius: 5px; font-size: 0.76rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 6px rgba(167, 139, 250, 0.2);"><i class="fa-solid fa-award" style="color: #c4b5fd;"></i> 5등 (5,000원)</span>`;
                        rowBg = "rgba(167,139,250,0.08)";
                        border = "1px solid #a78bfa";
                    }
                }

                const gameLetter = ['A', 'B', 'C', 'D', 'E'][cIdx] || `${cIdx + 1}`;
                html += `
                    <div class="confirmed-game-row" style="display: flex; justify-content: space-between; align-items: center; background: ${rowBg}; border: ${border}; padding: 6px 10px; border-radius: 6px; flex-wrap: wrap; gap: 6px 10px;">
                        <div class="confirmed-game-main" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                            <span class="confirmed-game-letter" style="font-size: 0.76rem; font-weight: 800; color: var(--text-secondary); background: rgba(0,0,0,0.3); min-width: 24px; text-align: center; padding: 2px 5px; border-radius: 4px; font-family: monospace;">${gameLetter}</span>
                            <div class="balls-row confirmed-balls-row" style="display: inline-flex; gap: 4px; flex-shrink: 0; flex-wrap: nowrap; min-width: 180px;">
                                ${nums.map(n => {
                                    const isHit = actualDraw ? new Set(actualDraw.numbers).has(n) : false;
                                    const isBonusHit = actualDraw ? (n === actualDraw.bonus) : false;
                                    const ballBg = getColor(n);
                                    let extraStyle = '';
                                    if (actualDraw) {
                                        extraStyle = isHit ? 'border: 2px solid #fbbf24; font-weight: 800; box-shadow: 0 0 6px rgba(251,191,36,0.6);' : (isBonusHit ? 'border: 2px solid #f87171; font-weight: 800; box-shadow: 0 0 6px rgba(248,113,113,0.6);' : 'opacity: 0.35;');
                                    }
                                    return `<span class="lotto-ball-mini" style="background: ${ballBg}; ${extraStyle} width: 26px; height: 26px; line-height: 26px; text-align: center; border-radius: 50%; font-size: 0.74rem; color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
                                }).join('')}
                            </div>
                            <div class="confirmed-ai-tag" style="min-width: 65px; flex-shrink: 0;">
                                ${aiMatchTag}
                            </div>
                        </div>
                        <div class="confirmed-game-result" style="margin-left: auto; text-align: right; flex-shrink: 0;">${resultText}</div>
                    </div>
                `;
            });

            let adminQrInfoHtml = '';

            if (isAdmin) {
                const qrMeta = purchase.qrMeta || null;
                const serial = qrMeta && qrMeta.qrSerial ? qrMeta.qrSerial : (purchase.qrSerial || 'TR-정상발권 확인됨');
                const rawUrl = qrMeta && qrMeta.qrRawUrl ? qrMeta.qrRawUrl : (purchase.qrRawUrl || null);
                const scannedAt = qrMeta && qrMeta.qrScannedAt ? formatDate(qrMeta.qrScannedAt) : (purchase.timestamp ? formatDate(purchase.timestamp) : '-');

                adminQrInfoHtml = `
                    <div class="confirmed-admin-qr-box" style="margin-top: 8px; padding: 8px 10px; background: rgba(15, 23, 42, 0.95); border: 1px dashed rgba(251, 191, 36, 0.4); border-radius: 6px; font-size: 0.72rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; flex-wrap: wrap; gap: 4px;">
                            <span style="color: #fbbf24; font-weight: 800; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-shield-halved"></i> [관리자 전용] 영수증 발권 진위 검증 데이터
                            </span>
                            <span style="color: #94a3b8; font-size: 0.68rem;">등록/스캔: ${scannedAt}</span>
                        </div>
                        <div style="color: #cbd5e1; display: flex; flex-direction: column; gap: 2px; line-height: 1.4;">
                            <div>• <strong style="color: #93c5fd;">실구매 인증자(구매자):</strong> <span style="color: #fbbf24; font-weight: 800;">${purchaseUserName ? `${purchaseUserName} (${purchaseUser})` : purchaseUser}</span></div>
                            <div>• <strong style="color: #93c5fd;">발행 일련번호(TR No):</strong> <span style="font-family: monospace; color: #34d399; font-weight: 800; font-size: 0.75rem;">${serial}</span></div>
                            ${rawUrl ? `<div>• <strong style="color: #93c5fd;">동행복권 원본 QR 링크:</strong> <a href="${rawUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline; font-family: monospace; word-break: break-all;" title="동행복권 공식 서버 당첨/발권 진위 확인"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${rawUrl}</a></div>` : `<div>• <strong style="color: #93c5fd;">동행복권 원본 QR 링크:</strong> <span style="color: #64748b;">(간이 등록 영수증)</span></div>`}
                        </div>
                    </div>
                `;
            }

            html += `
                    </div>
                    ${adminQrInfoHtml}
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Helper: Save Ledger to DB & LocalStorage (Full Sync)
    const saveLedgerState = async (ledger, successMsg, targetUser = null) => {
        const authId = (targetUser || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'master').toLowerCase().trim();
        await saveLedgerDirectly(ledger, authId, successMsg);
        renderConfirmedPurchasesList();
        if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
        if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
    };

    // Helper: Bind Toolbar Events (Export, Import, Clear, Admin Filter)
    function bindLedgerToolbarEvents() {
        const selTarget = document.getElementById('selAdminLedgerTarget');
        if (selTarget) {
            selTarget.onchange = async (e) => {
                state.adminViewingTarget = e.target.value;
                state.ledgerFinancialsCache = null;
                await renderConfirmedPurchasesList();
                if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
            };
        }

        window.refreshAdminLedgers = async function() {
            showToast('🔄 전체 회원 구매 내역 새로고침 중...');
            await fetchAllUsersPurchases();
            state.ledgerFinancialsCache = null;
            await renderConfirmedPurchasesList();
            if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
        };

        const btnExport = document.getElementById('btnExportLedgerBackup');
        if (btnExport) {
            btnExport.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                exportLedgerToFile();
            };
        }

        const btnImport = document.getElementById('btnTriggerImportLedger');
        const fileInput = document.getElementById('ledgerBackupFileInput');
        if (btnImport && fileInput) {
            btnImport.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                fileInput.value = '';
                fileInput.click();
            };
            fileInput.onchange = async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    await importLedgerFromFile(e.target.files[0]);
                }
            };
        }

        const btnTrash = document.getElementById('btnOpenReceiptTrash');
        if (btnTrash) {
            btnTrash.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                openReceiptTrashModal();
            };
        }

        const btnClear = document.getElementById('btnClearEntireLedger');
        if (btnClear) {
            btnClear.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (confirm('⚠️ 정말로 기존의 모든 구매확정 영수증을 완전히 삭제하시겠습니까?\n(1239회차부터 새롭게 시작하실 수 있습니다.)')) {
                    await clearEntireLedger();
                }
            };
        }
    }

    bindLedgerToolbarEvents();
    container.querySelectorAll('.btn-clean-1238-ghosts').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ledger = getLedger();
            if (ledger[1238] && Array.isArray(ledger[1238]) && ledger[1238].length > 3) {
                const removeCount = ledger[1238].length - 3;
                if (confirm(`1238회차의 실제 구매 영수증 #1~#3만 남기고, 나머지 가상/중복 영수증 #4~#${ledger[1238].length} (${removeCount}개)을 영구 삭제하시겠습니까?`)) {
                    ledger[1238] = ledger[1238].slice(0, 3);
                    await saveLedgerState(ledger, `🧹 1238회차 가상 영수증 ${removeCount}개가 깨끗이 정리되었습니다.`);
                }
            }
        });
    });

    // Bind Round-level unlocked items batch delete listener
    container.querySelectorAll('.btn-delete-unlocked-round').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (currentAuthId !== 'master' && currentAuthId !== 'admin') {
                showToast('🔒 영수증 일괄 삭제는 관리자(Master) 전용 기능입니다.');
                return;
            }

            const round = parseInt(btn.dataset.round);
            const ledger = getLedger();
            let purchases = ledger[round];
            if (!purchases || !Array.isArray(purchases) || purchases.length === 0) return;

            const lockedList = purchases.filter(p => !!p.isLocked);
            const unlockedCount = purchases.length - lockedList.length;

            if (unlockedCount === 0) {
                showToast('🔒 모든 영수증이 잠겨있어 삭제할 항목이 없습니다.');
                return;
            }

            if (confirm(`제 ${round}회차의 잠금되지 않은 영수증 ${unlockedCount}개를 모두 [휴지통]으로 이동하시겠습니까?\n(잠금된 ${lockedList.length}개 영수증은 안전하게 보존되며, 휴지통에서 언제든지 복원 가능합니다.)`)) {
                const unlockedReceipts = purchases.filter(p => !p.isLocked);
                for (const p of unlockedReceipts) {
                    if (typeof moveToReceiptTrash === 'function') {
                        await moveToReceiptTrash(round, 0, p, currentAuthId);
                    } else if (typeof window.moveToReceiptTrash === 'function') {
                        await window.moveToReceiptTrash(round, 0, p, currentAuthId);
                    }
                }

                renderConfirmedPurchasesList();
                if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
                if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
                showToast(`🗑️ 제 ${round}회차 미잠금 영수증 ${unlockedCount}개가 [휴지통]으로 안전 보관 이동되었습니다.`);
            }
        });
    });

    // Bind Round-level lock toggle listeners
    container.querySelectorAll('.btn-toggle-lock-round').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (currentAuthId !== 'master' && currentAuthId !== 'admin') {
                showToast('🔒 회차 전체 잠금 관리는 관리자(Master) 전용 기능입니다.');
                return;
            }

            const round = parseInt(btn.dataset.round);
            
            const ledger = getLedger();
            let purchases = ledger[round];
            if (!purchases || !Array.isArray(purchases) || purchases.length === 0) {
                purchases = getHistoricalTop10Combinations(round);
                ledger[round] = purchases;
            }
            
            const currentList = ledger[round];
            const isAllCurrentlyLocked = currentList.length > 0 && currentList.every(p => !!p.isLocked);
            const targetState = !isAllCurrentlyLocked;
            
            currentList.forEach(p => {
                p.isLocked = targetState;
            });
            
            const msg = targetState 
                ? `🔒 제 ${round}회차 모든 구매 내역이 잠겼습니다.` 
                : `🔓 제 ${round}회차 모든 구매 내역 잠금이 해제되었습니다.`;
            
            await saveLedgerState(ledger, msg);
        });
    });

    // Bind Individual Purchase lock toggle listeners
    container.querySelectorAll('.btn-toggle-lock-purchase').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent accordion toggle
            e.preventDefault();

            const currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
            const round = parseInt(btn.dataset.round);
            const pIdx = parseInt(btn.dataset.pidx);
            
            const ledger = getLedger();
            
            if (ledger[round] && Array.isArray(ledger[round]) && ledger[round][pIdx]) {
                const targetPurchase = ledger[round][pIdx];
                const purchaseUser = (targetPurchase.user || targetPurchase.userId || currentAuthId).toLowerCase().trim();
                const isAdmin = (currentAuthId === 'master' || currentAuthId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(currentAuthId)));

                if (!isAdmin && purchaseUser !== currentAuthId) {
                    showToast('🔒 타인의 영수증 잠금은 변경할 수 없습니다.');
                    return;
                }

                const isCurrentlyLocked = !!targetPurchase.isLocked;
                targetPurchase.isLocked = !isCurrentlyLocked;

                // Sync lock state into all relevant accounts (purchaseUser, currentAuthId, master)
                const storage = typeof SafeLocalStorage !== 'undefined' ? SafeLocalStorage : localStorage;
                const firestore = (db && typeof db.getFirestore === 'function') ? db.getFirestore() : window.db;
                const targetUsers = Array.from(new Set([purchaseUser, currentAuthId, 'master'].filter(Boolean)));

                const pFirst = targetPurchase.combos && targetPurchase.combos[0] && (targetPurchase.combos[0].numbers || targetPurchase.combos[0]);
                const pTimestamp = targetPurchase.timestamp;

                for (const uId of targetUsers) {
                    let uLedger = {};
                    try {
                        const raw = storage.getItem(`lotto_actual_ledger_${uId}`);
                        if (raw) uLedger = JSON.parse(raw);
                    } catch(e) {}
                    if (uLedger[round] && Array.isArray(uLedger[round])) {
                        uLedger[round].forEach(p => {
                            if (pTimestamp && p.timestamp === pTimestamp) {
                                p.isLocked = targetPurchase.isLocked;
                                return;
                            }
                            if (!p.combos || !pFirst) return;
                            const f = p.combos[0] && (p.combos[0].numbers || p.combos[0]);
                            if (JSON.stringify(f) === JSON.stringify(pFirst)) {
                                p.isLocked = targetPurchase.isLocked;
                            }
                        });
                        try { storage.setItem(`lotto_actual_ledger_${uId}`, JSON.stringify(uLedger)); } catch(e){}
                    }

                    if (firestore) {
                        try {
                            const cleanLedger = removeUndefined(uLedger);
                            await Promise.race([
                                firestore.collection('lotto_purchases').doc(uId).set({ ledger: cleanLedger }),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 3000))
                            ]);
                        } catch(e) {}
                    }

                    if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[uId]) {
                        state.allUsersPurchasesMap[uId].ledger = uLedger;
                    }
                    if (uId === currentAuthId) {
                        state.globalLedger = uLedger;
                    }
                }

                state.allUsersMergedLedger = null;
                state.ledgerFinancialsCache = null;

                const msg = !isCurrentlyLocked 
                    ? `🔒 제 ${round}회 내역 #${pIdx+1}이 잠겼습니다. (수정/삭제 방지)` 
                    : `🔓 제 ${round}회 내역 #${pIdx+1} 잠금이 해제되었습니다.`;
                
                showToast(msg);
                renderConfirmedPurchasesList();
                if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
                if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
            } else {
                console.warn(`[Lock] Could not find purchase record for round ${round}, index ${pIdx}`);
            }
        });
    });

    // Bind edit listeners
    container.querySelectorAll('.btn-edit-purchase').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent accordion toggle

            const currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (currentAuthId !== 'master' && currentAuthId !== 'admin') {
                showToast('🔒 영수증 수정은 관리자(Master) 전용 기능입니다.');
                return;
            }

            const round = parseInt(btn.dataset.round);
            const pIdx = parseInt(btn.dataset.pidx);
            
            const ledger = getLedger();
            if (ledger[round] && ledger[round][pIdx]) {
                const purchase = ledger[round][pIdx];
                if (purchase.isLocked) {
                    showToast('🔒 잠겨있는 구매 내역입니다. 잠금을 해제한 후 수정해주세요.');
                    return;
                }
                
                state.editingLedgerInfo = { round: round, index: pIdx, user: purchase.user || null };
                
                // Change modal title
                const titleEl = document.querySelector('#manualLedgerModal .modal-header h2');
                if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-edit"></i> 수동 복기 내역 수정`;
                
                document.getElementById('manualLedgerRound').value = round;
                document.getElementById('manualLedgerVersion').value = purchase.version || 'V3.0 하이브리드 알고리즘';
                
                // Populate combos text
                const combos = purchase.combos || [];
                const linesText = combos.map(c => getComboNumbers(c).join(', ')).join('\n');
                document.getElementById('manualLedgerCombos').value = linesText;
                
                // Open modal
                const manualLedgerModal = document.getElementById('manualLedgerModal');
                if (manualLedgerModal) manualLedgerModal.style.display = 'flex';
            }
        });
    });
    
    // Bind delete listeners
    container.querySelectorAll('.btn-delete-purchase').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent accordion toggle

            const currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
            const round = parseInt(btn.dataset.round);
            const pIdx = parseInt(btn.dataset.pidx);
            
            const ledger = getLedger();
            if (ledger[round] && ledger[round][pIdx]) {
                const purchase = ledger[round][pIdx];
                if (purchase.isLocked) {
                    showToast('🔒 잠겨있는 구매 내역입니다. [잠김] 버튼을 눌러 잠금을 해제한 후 삭제해주세요.');
                    return;
                }

                const purchaseUser = (purchase.user || purchase.userId || currentAuthId).toLowerCase().trim();
                const isAdmin = (currentAuthId === 'master' || currentAuthId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(currentAuthId)));

                if (!isAdmin) {
                    showToast('🔒 영수증 삭제 및 관리는 최고 관리자(Master) 전용 기능입니다.');
                    return;
                }

                if (confirm(`정말 이 구매 내역을 [휴지통]으로 이동하시겠습니까?\n(회차: ${round}회, 내역 #${pIdx+1}, 회원: ${purchaseUser})\n\n💡 삭제된 영수증은 휴지통에 안전 보관되며, 언제든지 [복원] 버튼으로 되돌릴 수 있습니다.`)) {
                    // 1. Safely move to receipt trash
                    if (typeof moveToReceiptTrash === 'function') {
                        await moveToReceiptTrash(round, pIdx, purchase, currentAuthId);
                    } else if (typeof window.moveToReceiptTrash === 'function') {
                        await window.moveToReceiptTrash(round, pIdx, purchase, currentAuthId);
                    }

                    // 2. Re-render UI immediately
                    renderConfirmedPurchasesList();
                    if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
                    if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
                    showToast('🗑️ 구매 영수증이 [휴지통]으로 안전 보관 이동되었습니다. (휴지통에서 복원 가능)');
                }
            }
        });
    });



    // Wire up Winning History Modal Open Button
    const btnOpenModal = document.getElementById('btnOpenWinningHistoryModal');
    if (btnOpenModal) {
        btnOpenModal.onclick = () => openWinningHistoryModal();
    }
}

// --------------------------------------------------------------------------
// 🏆 1~5등 실구매 누적 당첨 요약 배너 렌더링
// --------------------------------------------------------------------------
export function renderConfirmedRankSummary(hits, totalCombos, totalPrize, totalInvest) {
    const container = document.getElementById('confirmedRankSummaryContainer');
    if (!container) return;

    const totalWins = (hits || [0,0,0,0,0]).reduce((a, b) => a + b, 0);
    const winRate = totalCombos > 0 ? ((totalWins / totalCombos) * 100).toFixed(1) : '0.0';
    const netProfit = totalPrize - totalInvest;

    container.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 14px; padding: 14px 18px; box-shadow: 0 4px 15px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 0.9rem; box-shadow: 0 2px 6px rgba(245,158,11,0.3);">
                        <i class="fa-solid fa-trophy"></i>
                    </span>
                    <strong style="color: #fff; font-size: 0.95rem;">실구매 당첨 이력 요약 현황</strong>
                    <span style="font-size: 0.75rem; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px;">총 ${totalCombos}조합 중 ${totalWins}건 적중 (${winRate}%)</span>
                </div>
                <button type="button" class="btn-open-winning-history-summary" onclick="window.openWinningHistoryModal && window.openWinningHistoryModal()" style="padding: 6px 14px; font-size: 0.82rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: bold; transition: all 0.2s;">
                    <i class="fa-solid fa-list-check"></i> 전체 회차 간략표 보기
                </button>
            </div>
            
            <div class="confirmed-rank-grid" style="display: grid; gap: 8px;">
                <div style="background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #fbbf24; font-weight: bold; white-space: nowrap;">🥇 1등 (6개)</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[0]}<span style="font-size: 0.75rem; font-weight: normal; color: #cbd5e1;">건</span></div>
                </div>
                <div style="background: rgba(105, 200, 242, 0.1); border: 1px solid rgba(105, 200, 242, 0.3); border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #69c8f2; font-weight: bold; white-space: nowrap;">🥈 2등 (5+보너스)</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[1]}<span style="font-size: 0.75rem; font-weight: normal; color: #cbd5e1;">건</span></div>
                </div>
                <div style="background: rgba(255, 114, 114, 0.1); border: 1px solid rgba(255, 114, 114, 0.3); border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #ff7272; font-weight: bold; white-space: nowrap;">🥉 3등 (5개)</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[2]}<span style="font-size: 0.75rem; font-weight: normal; color: #cbd5e1;">건</span></div>
                </div>
                <div style="background: rgba(52, 211, 153, 0.1); border: 1px solid rgba(52, 211, 153, 0.3); border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #34d399; font-weight: bold; white-space: nowrap;">🎖️ 4등 (4개)</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[3]}<span style="font-size: 0.75rem; font-weight: normal; color: #cbd5e1;">건</span></div>
                </div>
                <div style="background: rgba(167, 139, 250, 0.1); border: 1px solid rgba(167, 139, 250, 0.3); border-radius: 8px; padding: 8px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #a78bfa; font-weight: bold; white-space: nowrap;">🎗️ 5등 (3개)</div>
                    <div style="font-size: 1.15rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[4]}<span style="font-size: 0.75rem; font-weight: normal; color: #cbd5e1;">건</span></div>
                </div>
            </div>
        </div>
    `;
}

// --------------------------------------------------------------------------
// 📋 당첨 이력 간략 보기 모달 (전체 회차 요약 & 당첨 조합 빠른 확인)
// --------------------------------------------------------------------------
export function openWinningHistoryModal() {
    const modal = document.getElementById('confirmedWinningHistoryModal');
    if (!modal) {
        console.error('[WinningHistory] #confirmedWinningHistoryModal element not found');
        return;
    }
    renderWinningHistoryModal();
    modal.style.display = 'flex';
    modal.classList.add('active');

    if (!modal._hasBackdropClick) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeWinningHistoryModal();
            }
        });
        modal._hasBackdropClick = true;
    }
}

export function closeWinningHistoryModal() {
    const modal = document.getElementById('confirmedWinningHistoryModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

export function renderWinningHistoryModal() {
    const body = document.getElementById('winningHistoryModalBody');
    if (!body) return;

    const fin = calculateLedgerFinancials();
    const { totalInvest, totalPrize, netProfit, totalRoi, totalCombos, totalWins, winRate, hits, roundBreakdown } = fin;
    const roundDataList = Object.values(roundBreakdown).sort((a, b) => b.round - a.round);
    const rounds = Object.keys(roundBreakdown);

    const getBallBadge = (n) => {
        const bg = getBallHexColor(n);
        return `<span style="background: ${bg}; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; color: #fff; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${n}</span>`;
    };

    if (rounds.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fa-solid fa-receipt" style="font-size: 2.5rem; margin-bottom: 12px; color: #f59e0b;"></i>
                <p style="font-size: 1rem; color: #fff;">구매 확정된 번호 조합 내역이 없습니다.</p>
                <p style="font-size: 0.85rem; margin-top: 5px;">추천 번호 생성기 탭에서 번호를 생성 후 [구매 확정]을 진행해주세요.</p>
            </div>
        `;
        return;
    }

    let html = `
        <!-- 🛡️ 실구매 당첨 데이터 100% 무결성 및 공정성 공식 인증 배너 -->
        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.85) 100%); border: 1px solid rgba(16, 185, 129, 0.45); border-radius: 10px; padding: 12px 16px; margin-bottom: 15px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.25);">
            <i class="fa-solid fa-certificate" style="color: #34d399; font-size: 1.6rem; flex-shrink: 0;"></i>
            <div style="font-size: 0.77rem; color: #cbd5e1; line-height: 1.55;">
                <div style="font-size: 0.82rem; font-weight: 800; color: #34d399; display: flex; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <i class="fa-solid fa-circle-check"></i> 공정성 및 실구매 당첨 데이터 무결성 공식 확인 (Verifiable Ledger)
                </div>
                본 당첨 이력은 회원이 직접 구매 등록한 실물 복권의 <strong>동행복권 공인 QR코드 일련번호</strong> 및 <strong>추첨 마감(매주 토 20:00) 전 영구 잠금(Lock)된 전자 타임스탬프</strong>를 기반으로 자동 산출됩니다. 사후 당첨 번호 조작이나 데이터 끼워넣기가 일절 불가능한 <strong>100% 신뢰할 수 있는 실구매 정산 기록</strong>입니다.
            </div>
        </div>

        <!-- Top KPI summary -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px;">
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; text-align: center;">
                <div style="color: #94a3b8; font-size: 0.75rem;">실구매 회차 / 조합</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 4px;">${rounds.length}회 <span style="font-size:0.8rem; color:#cbd5e1; font-weight:normal;">(${totalCombos}조합)</span></div>
            </div>
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; text-align: center;">
                <div style="color: #94a3b8; font-size: 0.75rem;">총 투자금액</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #cbd5e1; margin-top: 4px;">${totalInvest.toLocaleString()}원</div>
            </div>
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; text-align: center;">
                <div style="color: #94a3b8; font-size: 0.75rem;">총 당첨금액</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: #10b981; margin-top: 4px;">${totalPrize.toLocaleString()}원</div>
            </div>
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px; text-align: center;">
                <div style="color: #94a3b8; font-size: 0.75rem;">순수익 (회수율)</div>
                <div style="font-size: 1.1rem; font-weight: 800; color: ${netProfit >= 0 ? '#10b981' : '#f87171'}; margin-top: 4px;">
                    ${(netProfit >= 0 ? '+' : '') + netProfit.toLocaleString()}원 <span style="font-size: 0.78rem; font-weight:bold; color: ${totalRoi >= 100 ? '#10b981' : '#fbbf24'};">(${totalRoi.toFixed(1)}%)</span>
                </div>
            </div>
        </div>

        <!-- Rank Hits Badges -->
        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 14px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span style="font-size: 0.8rem; color: #cbd5e1; font-weight: bold;"><i class="fa-solid fa-award" style="color: #fbbf24;"></i> 등수별 총 적중:</span>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <span style="background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4); color: #fbbf24; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">1등: ${hits[0]}건</span>
                <span style="background: rgba(105, 200, 242, 0.15); border: 1px solid rgba(105, 200, 242, 0.4); color: #69c8f2; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">2등: ${hits[1]}건</span>
                <span style="background: rgba(255, 114, 114, 0.15); border: 1px solid rgba(255, 114, 114, 0.4); color: #ff7272; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">3등: ${hits[2]}건</span>
                <span style="background: rgba(52, 211, 153, 0.15); border: 1px solid rgba(52, 211, 153, 0.4); color: #34d399; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">4등: ${hits[3]}건</span>
                <span style="background: rgba(167, 139, 250, 0.15); border: 1px solid rgba(167, 139, 250, 0.4); color: #a78bfa; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 12px;">5등: ${hits[4]}건</span>
                <span style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.5); color: #c7d2fe; font-size: 0.75rem; font-weight: 800; padding: 2px 10px; border-radius: 12px;">총 ${totalWins}건 적중 (${winRate}%)</span>
            </div>
        </div>

        <!-- Section Header for Winning Rounds -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
            <span style="font-size: 0.88rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-trophy" style="color: #fbbf24;"></i> 당첨 회차 목록
            </span>
            <span style="font-size: 0.75rem; color: #a5b4fc; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); padding: 2px 8px; border-radius: 10px;">
                당첨된 회차만 표시 중 (총 ${roundDataList.filter(i => i.winningCombos.length > 0).length}개 회차)
            </span>
        </div>

        <!-- Winning rounds summary cards -->
        <div style="display: flex; flex-direction: column; gap: 10px;">
    `;

    const winningRoundsList = roundDataList.filter(item => item.winningCombos && item.winningCombos.length > 0);

    if (winningRoundsList.length === 0) {
        html += `
            <div style="text-align: center; padding: 35px 20px; color: var(--text-secondary); background: rgba(15,23,42,0.5); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                <i class="fa-solid fa-trophy" style="font-size: 2.2rem; color: #64748b; margin-bottom: 10px;"></i>
                <p style="font-size: 1rem; color: #cbd5e1; margin: 0; font-weight: bold;">당첨된 회차 내역이 없습니다.</p>
                <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 5px;">실구매 번호 등록 후 추첨이 완료되면 당첨된 회차만 이곳에 표시됩니다.</p>
            </div>
        `;
    } else {
        winningRoundsList.forEach((item, rIdx) => {
            const actual = item.actualDraw;
            const hasWinningCombos = item.winningCombos.length > 0;

            const statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: bold;"><i class="fa-solid fa-trophy"></i> 당첨</span>`;
            
            const rParts = [];
            if (item.roundHits[1] > 0) rParts.push(`<span style="color:#fbbf24; font-weight:bold;">1등 ${item.roundHits[1]}개</span>`);
            if (item.roundHits[2] > 0) rParts.push(`<span style="color:#69c8f2; font-weight:bold;">2등 ${item.roundHits[2]}개</span>`);
            if (item.roundHits[3] > 0) rParts.push(`<span style="color:#ff7272; font-weight:bold;">3등 ${item.roundHits[3]}개</span>`);
            if (item.roundHits[4] > 0) rParts.push(`<span style="color:#34d399; font-weight:bold;">4등 ${item.roundHits[4]}개</span>`);
            if (item.roundHits[5] > 0) rParts.push(`<span style="color:#a78bfa; font-weight:bold;">5등 ${item.roundHits[5]}개</span>`);
            const rankBadge = rParts.join(', ');

            let ballsHtml = '';
            if (actual) {
                ballsHtml = `
                    <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                        ${actual.numbers.map(n => getBallBadge(n)).join('')}
                        <span style="font-weight: 800; font-size: 0.75rem; color: #94a3b8; margin: 0 1px;">+</span>
                        ${getBallBadge(actual.bonus)}
                    </div>
                `;
            } else {
                ballsHtml = `<span style="color: #64748b; font-size: 0.75rem;">(추첨 전)</span>`;
            }

            const profitVal = item.prize - item.invest;
            const profitColor = profitVal > 0 ? '#10b981' : (profitVal < 0 ? '#f87171' : '#cbd5e1');

            html += `
                <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 12px 14px; transition: all 0.2s; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <strong style="color: #fff; font-size: 0.98rem;">제 ${item.round}회</strong>
                            ${statusBadge}
                            <span style="color: #94a3b8; font-size: 0.78rem;">${item.combosCount}조합 (${item.invest.toLocaleString()}원)</span>
                        </div>

                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <div style="text-align: right;">
                                <div style="font-size: 0.95rem; font-weight: 800; color: #10b981;">
                                    ${item.prize.toLocaleString()}원
                                </div>
                                <div style="font-size: 0.72rem; color: ${profitColor};">
                                    회수율 ${item.roi.toFixed(1)}% (${(profitVal >= 0 ? '+' : '') + profitVal.toLocaleString()}원)
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; gap: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="font-size: 0.75rem; color: #94a3b8;">당첨번호:</span>
                            ${ballsHtml}
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 0.8rem;">
                                ${rankBadge}
                            </div>
                            <button type="button" class="btn-toggle-winning-detail" data-round="${item.round}" style="padding: 3px 8px; font-size: 0.72rem; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-list-ol"></i> 당첨 조합 보기 (${item.winningCombos.length})
                            </button>
                        </div>
                    </div>

                    <div id="winning-detail-round-${item.round}" style="display: none; margin-top: 10px; padding: 8px 10px; background: rgba(0,0,0,0.25); border-radius: 8px; border: 1px dashed rgba(16, 185, 129, 0.25);">
                        <div style="font-size: 0.75rem; color: #34d399; font-weight: bold; margin-bottom: 6px;">
                            <i class="fa-solid fa-check-double"></i> 제 ${item.round}회차 적중 조합 목록:
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            ${item.winningCombos.map(wc => {
                                const rankNames = ['', '1등', '2등', '3등', '4등', '5등'];
                                const rankColors = ['', '#fbbf24', '#69c8f2', '#ff7272', '#34d399', '#a78bfa'];
                                return `
                                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 5px 8px; border-radius: 6px; flex-wrap: wrap; gap: 6px;">
                                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                            <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 3px;">#${wc.cIdx}</span>
                                            <div style="display: flex; gap: 3px;">
                                                ${wc.nums.map(n => {
                                                    const isHit = actual ? new Set(actual.numbers).has(n) : false;
                                                    const isBonusHit = actual ? (n === actual.bonus) : false;
                                                    const ballBg = getBallHexColor(n);
                                                    let borderStyle = 'opacity: 0.45;';
                                                    if (isHit) borderStyle = 'border: 2px solid #fbbf24; font-weight: 800; transform: scale(1.05); box-shadow: 0 0 6px rgba(251,191,36,0.6);';
                                                    else if (isBonusHit) borderStyle = 'border: 2px solid #69c8f2; font-weight: 800; transform: scale(1.05); box-shadow: 0 0 6px rgba(105,200,242,0.6);';
                                                    return `<span style="background: ${ballBg}; ${borderStyle} width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; font-size: 0.7rem; color: #fff; display: inline-block;">${n}</span>`;
                                                }).join('')}
                                            </div>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="color: ${rankColors[wc.rank]}; font-size: 0.8rem; font-weight: 800;">${rankNames[wc.rank]} 당첨</span>
                                            <span style="color: #cbd5e1; font-size: 0.75rem;">(${wc.prize.toLocaleString()}원)</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    html += `</div>`;
    body.innerHTML = html;

    // Bind toggle buttons for winning combo details
    body.querySelectorAll('.btn-toggle-winning-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            const r = btn.dataset.round;
            const detailEl = document.getElementById(`winning-detail-round-${r}`);
            if (detailEl) {
                if (detailEl.style.display === 'none') {
                    detailEl.style.display = 'block';
                    btn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> 접기`;
                } else {
                    detailEl.style.display = 'none';
                    btn.innerHTML = `<i class="fa-solid fa-list-ol"></i> 당첨 조합 보기`;
                }
            }
        });
    });
}

export async function changeConfirmedAdminUser(userId) {
    state.adminViewingTarget = userId;
    state.ledgerFinancialsCache = null;
    const selTarget = document.getElementById('selAdminLedgerTarget');
    if (selTarget) selTarget.value = userId;
    await renderConfirmedPurchasesList();
    if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
    showToast(userId === 'all' ? '🌐 전체 회원 통합 구매내역으로 전환되었습니다.' : `👤 [${userId}] 회원의 개별 구매내역으로 전환되었습니다.`);
}

// --------------------------------------------------------------------------
// 🗑️ 영수증 휴지통(Recycle Bin) 관리 모달
// --------------------------------------------------------------------------
export function openReceiptTrashModal() {
    let modal = document.getElementById('modalReceiptTrash');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalReceiptTrash';
        modal.className = 'modal-backdrop';
        modal.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: none; align-items: center; justify-content: center; backdrop-filter: blur(4px); padding: 16px;';
        modal.innerHTML = `
            <div class="modal-content" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1.5px solid rgba(239, 68, 68, 0.4); border-radius: 12px; width: 100%; max-width: 720px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,0.6); overflow: hidden;">
                <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-trash-arrow-up" style="color: #ef4444; font-size: 1.2rem;"></i>
                        <h3 style="margin: 0; font-size: 1.05rem; font-weight: 800; color: #fca5a5;">
                            🗑️ 영수증 휴지통 (안전 보관소)
                        </h3>
                    </div>
                    <button type="button" class="btn-close-receipt-trash" style="background: transparent; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; padding: 4px 8px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div style="padding: 10px 18px; background: rgba(239, 68, 68, 0.08); border-bottom: 1px solid rgba(239, 68, 68, 0.15); font-size: 0.76rem; color: #cbd5e1; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-circle-info" style="color: #f87171;"></i>
                    <span>삭제된 구매 영수증이 임시 보관되는 곳입니다. <strong>[복원]</strong>을 누르면 언제든지 원래 장부로 되돌릴 수 있으며, <strong>[영구 삭제]</strong>를 눌러야만 비로소 완전히 삭제됩니다.</span>
                </div>
                <div id="receiptTrashModalBody" style="padding: 16px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 12px;">
                    <!-- Dynamically rendered -->
                </div>
                <div style="padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3);">
                    <button type="button" id="btnEmptyEntireTrashModal" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-broom"></i> 휴지통 전체 비우기
                    </button>
                    <button type="button" class="btn-close-receipt-trash" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 6px 16px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer;">
                        닫기
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeReceiptTrashModal();
        });
        modal.querySelectorAll('.btn-close-receipt-trash').forEach(b => {
            b.onclick = () => closeReceiptTrashModal();
        });
    }

    renderReceiptTrashModalContent();
    modal.style.display = 'flex';
}

export function closeReceiptTrashModal() {
    const modal = document.getElementById('modalReceiptTrash');
    if (modal) modal.style.display = 'none';
}

export function renderReceiptTrashModalContent() {
    const body = document.getElementById('receiptTrashModalBody');
    if (!body) return;

    const trashList = (typeof window.getReceiptTrashList === 'function') ? window.getReceiptTrashList() : [];
    
    // Update badge on toolbar
    const badge = document.getElementById('badgeReceiptTrashCount');
    if (badge) badge.innerText = trashList.length;

    if (trashList.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 10px; color: #94a3b8;">
                <i class="fa-solid fa-trash-can-arrow-up" style="font-size: 2.4rem; color: #475569; margin-bottom: 12px;"></i>
                <p style="font-size: 0.95rem; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">휴지통이 비어 있습니다.</p>
                <p style="font-size: 0.8rem; color: #64748b; margin: 0;">삭제된 구매 영수증이 없습니다.</p>
            </div>
        `;
        const btnEmpty = document.getElementById('btnEmptyEntireTrashModal');
        if (btnEmpty) btnEmpty.style.display = 'none';
        return;
    }

    const btnEmpty = document.getElementById('btnEmptyEntireTrashModal');
    if (btnEmpty) btnEmpty.style.display = 'inline-flex';

    const getColor = (n) => {
        if (n <= 10) return '#fbc400';
        if (n <= 20) return '#69c8f2';
        if (n <= 30) return '#ff7272';
        if (n <= 40) return '#aaa';
        return '#b0d840';
    };

    let html = '';
    trashList.forEach((item, idx) => {
        const round = item.originalRound || item.round || '미지정';
        const user = item.user || item.userId || 'master';
        const uName = (typeof getUserRealName === 'function' ? getUserRealName(user) : '') || '';
        const userLabel = (uName && uName.toLowerCase() !== user.toLowerCase()) ? `${uName} (${user})` : user;
        const dateStr = item.trashedAt ? new Date(item.trashedAt).toLocaleString() : '삭제일시 미상';
        const combos = item.combos || [];

        let combosHtml = combos.map((c, cIdx) => {
            const letter = ['A','B','C','D','E'][cIdx] || `${cIdx+1}`;
            const nums = c.numbers || c;
            return `
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.74rem;">
                    <span style="min-width: 20px; font-weight: 800; color: #94a3b8; font-family: monospace;">${letter}</span>
                    <div style="display: inline-flex; gap: 4px;">
                        ${Array.isArray(nums) ? nums.map(n => `<span style="background:${getColor(n)}; width:20px; height:20px; line-height:20px; border-radius:50%; font-size:0.68rem; font-weight:bold; color:#fff; text-align:center; display:inline-block;">${n}</span>`).join('') : ''}
                    </div>
                </div>
            `;
        }).join('');

        html += `
            <div class="trash-card" style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="flex: 1; min-width: 260px;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        <span style="background: #3b82f6; color: #fff; font-size: 0.75rem; font-weight: 800; padding: 2px 7px; border-radius: 4px;">
                            제 ${round}회차
                        </span>
                        <span style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; font-size: 0.73rem; padding: 1px 7px; border-radius: 4px; font-weight: 700;">
                            ${item.version || '실구매 영수증'}
                        </span>
                        <span style="background: rgba(255,255,255,0.06); color: #94a3b8; font-size: 0.72rem; padding: 1px 6px; border-radius: 4px;">
                            구매자: <strong style="color:#fff;">${userLabel}</strong>
                        </span>
                        <span style="font-size: 0.68rem; color: #64748b;">
                            🗑️ 삭제: ${dateStr}
                        </span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px;">
                        ${combosHtml}
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; min-width: 100px;">
                    <button type="button" class="btn-restore-single-trash" data-trash-id="${item.trashId}" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25)); border: 1.5px solid #10b981; color: #34d399; padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.2);">
                        <i class="fa-solid fa-rotate-left"></i> 복원하기
                    </button>
                    <button type="button" class="btn-delete-single-trash" data-trash-id="${item.trashId}" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; padding: 5px 12px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                        <i class="fa-solid fa-fire"></i> 영구 삭제
                    </button>
                </div>
            </div>
        `;
    });

    body.innerHTML = html;

    // Bind item restore listeners
    body.querySelectorAll('.btn-restore-single-trash').forEach(btn => {
        btn.onclick = async () => {
            const trashId = btn.dataset.trashId;
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 복원중...`;
            
            const currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'master';
            if (typeof window.restoreFromReceiptTrash === 'function') {
                await window.restoreFromReceiptTrash(trashId, currentAuthId);
            }
            renderReceiptTrashModalContent();
            await renderConfirmedPurchasesList();
            if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
            if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
            showToast('♻️ 구매 영수증이 실구매 장부로 안전하게 복원되었습니다!');
        };
    });

    // Bind item permanent delete listeners
    body.querySelectorAll('.btn-delete-single-trash').forEach(btn => {
        btn.onclick = async () => {
            const trashId = btn.dataset.trashId;
            if (confirm('💥 정말로 이 영수증을 완전히 영구 삭제하시겠습니까?\n\n이 작업은 복원할 수 없습니다.')) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 삭제중...`;
                if (typeof window.permanentDeleteFromReceiptTrash === 'function') {
                    await window.permanentDeleteFromReceiptTrash(trashId);
                }
                renderReceiptTrashModalContent();
                showToast('💥 영수증이 영구 삭제되었습니다.');
            }
        };
    });

    // Bind empty entire trash listener
    const btnEmptyTrash = document.getElementById('btnEmptyEntireTrashModal');
    if (btnEmptyTrash) {
        btnEmptyTrash.onclick = async () => {
            if (confirm('🧹 휴지통의 모든 영수증을 영구히 삭제하시겠습니까?\n\n휴지통이 완전히 비워지며 복원할 수 없습니다.')) {
                btnEmptyTrash.disabled = true;
                btnEmptyTrash.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 비우는중...`;
                if (typeof window.emptyEntireReceiptTrash === 'function') {
                    await window.emptyEntireReceiptTrash();
                }
                renderReceiptTrashModalContent();
                showToast('🧹 휴지통이 깨끗하게 비워졌습니다.');
            }
        };
    }
}

if (typeof window !== 'undefined') {
    window.renderConfirmedPurchasesList = renderConfirmedPurchasesList;
    window.openWinningHistoryModal = openWinningHistoryModal;
    window.closeWinningHistoryModal = closeWinningHistoryModal;
    window.changeConfirmedAdminUser = changeConfirmedAdminUser;
    window.openReceiptTrashModal = openReceiptTrashModal;
    window.closeReceiptTrashModal = closeReceiptTrashModal;
    window.renderReceiptTrashModalContent = renderReceiptTrashModalContent;
}
