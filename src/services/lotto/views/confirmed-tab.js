import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, getBallTextColor, showToast, formatDate, calculateACValue, removeUndefined, copyToClipboard } from '../../../shared/utils.js';
import { createBallHtml, renderBallRow, getRankBadge, openModal, closeModal } from '../../../shared/components.js';
import { db } from '../../../shared/db.js';
import { SafeAuth, isAdminUser, getUserRealName } from '../../../shared/auth-mgmt.js';
import { getAllUnifiedRegisteredUsers } from '../../../shared/user-context.js';
import { getLedger, fetchAllUsersPurchases, saveToLedger, saveLedgerDirectly, getComboNumbers, getHistoricalTop10Combinations, getUserPurchasesForRound, calculateLedgerFinancials, getSafeActualDraw, exportLedgerToFile, importLedgerFromFile, clearEntireLedger, deduplicateReceipts, getReceiptTrashList, saveReceiptTrashList, moveToReceiptTrash, restoreFromReceiptTrash, permanentDeleteFromReceiptTrash, emptyEntireReceiptTrash, fetchReceiptTrash, toggleReceiptLock, toggleRoundLock, getReceiptCombosFingerprint, buildDonghangLotteryQrUrl, parseDonghangLotteryQrUrl, syncPurchaseWithQrUrl } from '../ledger.js';

import { computeAbsoluteTop10Combinations, findBestRecommendationMatch, generateExtraAddonPack } from '../generator.js';
import { recalculateGroups } from '../statistics.js';

const _roundUserRecCache = new Map();
function getMemoizedRecommendations(rnd, user) {
    const key = `${rnd}_${(user || '').toLowerCase()}`;
    if (_roundUserRecCache.has(key)) return _roundUserRecCache.get(key);
    const uV4 = computeAbsoluteTop10Combinations(false, rnd, 'v4', true, user) || [];
    const uV3 = computeAbsoluteTop10Combinations(false, rnd, 'v3', true, user) || [];
    const extraPacks = (typeof generateExtraAddonPack === 'function') 
        ? [1, 2, 3, 4, 5].map(pId => generateExtraAddonPack(pId, rnd, user)) 
        : (state.extraPacks || []);
    const res = { uV4, uV3, extraPacks };
    _roundUserRecCache.set(key, res);
    return res;
}

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
    const cleanAuthId = String(authId).toLowerCase().trim();
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(cleanAuthId) : (cleanAuthId === 'master' || cleanAuthId === 'admin'));
    const isMaster = (cleanAuthId === 'master');

    // If Admin, prefetch all users' purchases in background if not yet loaded OR if merged cache was invalidated
    if (isAdmin && window.db && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0 || !state.allUsersMergedLedger)) {
        fetchAllUsersPurchases().then(() => {
            const currentTab = document.getElementById('tab-confirmed-list');
            if (currentTab && currentTab.classList.contains('active')) {
                renderConfirmedPurchasesList();
            }
        }).catch(e => console.warn('[ConfirmedTab background fetch error]', e));
    }

    const currentTarget = isAdmin ? (state.adminViewingTarget || 'my') : cleanAuthId;
    const ledger = getLedger(currentTarget);

    // Only render actual confirmed rounds saved in ledger (e.g. 1239+)
    const ledgerRounds = Object.keys(ledger).map(Number).filter(r => !isNaN(r) && r > 0 && Array.isArray(ledger[r]) && ledger[r].length > 0);
    const rounds = ledgerRounds.sort((a,b) => b - a); // descending order: newest first!

    // --- 💰 Financial & Chart Calculation (Optimized & Memoized) ---
    const fin = calculateLedgerFinancials(true, currentTarget);
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

    // Update micro glance pills on the compact toggle bar
    const elGlanceInvest = document.getElementById('glanceConfirmedInvest');
    const elGlancePrize = document.getElementById('glanceConfirmedPrize');
    const elGlanceRoi = document.getElementById('glanceConfirmedRoi');

    if (elGlanceInvest) {
        elGlanceInvest.textContent = totalInvest >= 10000 
            ? (totalInvest / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '만원' 
            : totalInvest.toLocaleString() + '원';
    }
    if (elGlancePrize) {
        elGlancePrize.textContent = totalPrize >= 10000 
            ? (totalPrize / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '만원' 
            : totalPrize.toLocaleString() + '원';
    }
    if (elGlanceRoi) {
        elGlanceRoi.textContent = (totalRoi > 0 ? '+' : '') + totalRoi.toFixed(1) + '%';
        elGlanceRoi.style.color = totalRoi >= 100 ? '#10b981' : (totalRoi > 0 ? '#34d399' : '#fbbf24');
    }

    // Render 1~5 rank winning summary banner on the confirmed tab
    const totalCombosCount = totalInvest / 1000;
    renderConfirmedRankSummary(hits, totalCombosCount, totalPrize, totalInvest);

    // Render Charts
    try {
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
                            label: '누적 구매금',
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
    } catch(chartErr) {
        console.warn('[ConfirmedTab Chart render error]', chartErr);
    }

    // Admin user selector dropdown HTML
    let adminUserSelectHtml = '';
    const allUnifiedUsers = (typeof getAllUnifiedRegisteredUsers === 'function') ? getAllUnifiedRegisteredUsers() : [];
    const validUnifiedUsers = allUnifiedUsers.filter(u => {
        const clean = (u.id || '').trim().toLowerCase();
        return clean && !clean.startsWith('{') && !clean.startsWith('test_') && clean !== 'app_latest_version' && clean !== 'user_alpha' && clean !== 'user_beta' && clean !== 'sample' && clean !== 'hms' && clean !== 'admin';
    });

    if (isAdmin) {
        let optionsHtml = `<option value="all" ${currentTarget === 'all' ? 'selected' : ''}>👥 [전체 회원 통합 보기 (${validUnifiedUsers.length}명)]</option>`;
        optionsHtml += `<option value="my" ${currentTarget === 'my' ? 'selected' : ''}>👤 [내 계정 구매내역 (${cleanAuthId})]</option>`;
        
        validUnifiedUsers.forEach(u => {
            const uId = u.id;
            const uName = u.name || u.realName || (typeof getUserRealName === 'function' ? getUserRealName(uId) : '') || uId;
            const label = uName !== uId ? `${uId} (${uName})` : uId;
            optionsHtml += `<option value="${uId}" ${currentTarget === uId ? 'selected' : ''}>👤 ${label}</option>`;
        });

        adminUserSelectHtml = `
            <div class="confirmed-admin-bar" style="background: #0d1322; border: 1px solid rgba(255, 255, 255, 0.08); padding: 8px 12px; border-radius: 10px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; max-width: 100%; box-sizing: border-box; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.3);">
                <span style="font-size: 0.8rem; color: #fbbf24; font-weight: 800; display: flex; align-items: center; gap: 5px; white-space: nowrap; flex-shrink: 0;">
                    <i class="fa-solid fa-crown"></i> 관리자 대상 선택:
                </span>
                <select id="selAdminLedgerTarget" style="background: #080d1a; color: #f1f5f9; border: 1px solid rgba(255, 255, 255, 0.12); padding: 5px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 600; outline: none; cursor: pointer; max-width: 100%; min-width: 0; flex: 1 1 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; box-sizing: border-box;">
                    ${optionsHtml}
                </select>
                <button type="button" class="btn-dark-pill" onclick="window.refreshAdminLedgers && window.refreshAdminLedgers()" style="padding: 5px 10px; font-size: 0.74rem; cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0;">
                    <i class="fa-solid fa-rotate-right"></i> 새로고침
                </button>
            </div>
        `;
    }

    // 1-1. [ADMIN ALL USERS SUMMARY TABLE] Real Purchase Winnings & Algorithm Distribution Overview (When Admin)
    let adminOverviewTableHtml = '';
    if (isAdmin) {
        try {
            // Compute actual purchase winning stats with algorithm breakdown for each user
            const memberStatsList = validUnifiedUsers.map(u => {
                const uId = u.id;
                const cleanId = uId.toLowerCase().trim();
                const uInfo = (state.allUsersPurchasesMap && (state.allUsersPurchasesMap[cleanId] || state.allUsersPurchasesMap[uId])) 
                    ? (state.allUsersPurchasesMap[cleanId] || state.allUsersPurchasesMap[uId]) 
                    : {};
                let uLedger = uInfo.ledger || {};
                if (typeof uLedger === 'string') {
                    try { uLedger = JSON.parse(uLedger); } catch(e) { uLedger = {}; }
                }
                if (!uLedger || typeof uLedger !== 'object' || Object.keys(uLedger).length === 0) {
                    uLedger = getLedger(cleanId);
                }
                if (!uLedger || typeof uLedger !== 'object' || Object.keys(uLedger).length === 0) {
                    uLedger = getLedger(uId);
                }
                const uName = u.name || u.realName || uInfo.realName || (typeof getUserRealName === 'function' ? getUserRealName(uId) : '') || uId;

                let totalGames = 0;
                let totalInvest = 0;
                let totalPrize = 0;
                const rankHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                const algoHits = { v4: 0, v3: 0, extra: 0, manual: 0 };

                Object.keys(uLedger).forEach(rStr => {
                    const round = parseInt(rStr);
                    if (isNaN(round) || !Array.isArray(uLedger[rStr])) return;
                    const actualDraw = getSafeActualDraw(round);
                    const winningSet = actualDraw && actualDraw.numbers ? new Set(actualDraw.numbers) : null;
                    const bonus = actualDraw ? actualDraw.bonus : null;

                    const receipts = deduplicateReceipts(uLedger[rStr].map(syncPurchaseWithQrUrl));
                    receipts.forEach(rawReceipt => {
                        const receipt = syncPurchaseWithQrUrl(rawReceipt);
                        const combos = receipt.combos || [];
                        const rVer = (receipt.version || rawReceipt.version || '').toLowerCase();

                        combos.forEach(c => {
                            totalGames++;
                            totalInvest += 1000;
                            const nums = getComboNumbers(c);

                            let rank = 0;
                            let prize = 0;
                            if (winningSet) {
                                const matches = nums.filter(n => winningSet.has(n));
                                const matchCount = matches.length;
                                const hasBonus = bonus !== undefined && bonus !== null ? nums.includes(bonus) : false;

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

                                    // Determine Algorithm Origin from receipt's recorded version (Instant 0ms)
                                    if (rVer.includes('v4') || rVer.includes('4.0') || rVer.includes('행동경제')) algoHits.v4++;
                                    else if (rVer.includes('v3') || rVer.includes('3.0') || rVer.includes('하이브리')) algoHits.v3++;
                                    else if (rVer.includes('추가') || rVer.includes('extra') || rVer.includes('pack')) algoHits.extra++;
                                    else algoHits.manual++;
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
            }).sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins || b.totalInvest - a.totalInvest);

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
                const isCurrent = (currentTarget === m.userId) || (currentTarget === 'my' && (m.userId === 'master' || m.userId === cleanAuthId));
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
        } catch(adminErr) {
            console.warn('[ConfirmedTab AdminOverview render error]', adminErr);
        }
    }

    // Render admin summary table into the collapsible statistics container
    const adminOverviewEl = document.getElementById('confirmedAdminOverviewContainer');
    if (adminOverviewEl) {
        adminOverviewEl.innerHTML = adminOverviewTableHtml || '';
    }

    let html = `
        ${adminUserSelectHtml}

        <div class="confirmed-unified-toolbar">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span style="color: #cbd5e1; font-size: 0.82rem; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-user-shield" style="color: #818cf8;"></i> 
                    계정: <strong style="color: #fff; font-weight: 700; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 7px; border-radius: 6px;">${authId}</strong>
                    ${isAdmin ? `<span style="font-size:0.7rem; color:#fbbf24; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); padding:1px 6px; border-radius:4px; font-weight:800;"><i class="fa-solid fa-crown"></i> 관리자</span>` : ''}
                </span>
                <span style="font-size: 0.72rem; color: #34d399; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-shield-check"></i> 실구매 QR인증
                </span>
                <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 2px 7px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-database"></i> ${(() => { const cur = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239); return cur; })()}회차~ 원장
                </span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                ${isMaster ? `
                    <button id="btnOpenReceiptTrash" class="btn-dark-pill" title="삭제된 영수증이 임시 보관된 휴지통을 열어 원상 복원하거나 영구 삭제합니다.">
                        <i class="fa-solid fa-trash-arrow-up" style="color: #f87171;"></i> 휴지통 
                        <span id="badgeReceiptTrashCount" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; font-size: 0.68rem; padding: 1px 5px; border-radius: 8px; font-weight: 800; border: 1px solid rgba(239, 68, 68, 0.3);">${getReceiptTrashList().length}</span>
                    </button>
                ` : ''}
                <button id="btnExportLedgerBackup" class="btn-dark-pill" title="현재 등록된 실구매 확정 내역 전체를 고유 텍스트 파일(.json)로 안전하게 다운로드 백업합니다.">
                    <i class="fa-solid fa-download" style="color: #34d399;"></i> 텍스트 백업
                </button>
                <button id="btnTriggerImportLedger" class="btn-dark-pill" title="백업해 둔 JSON 텍스트 파일을 업로드하여 원본 실구매 내역을 무결 복원합니다.">
                    <i class="fa-solid fa-upload" style="color: #60a5fa;"></i> 백업 복원
                </button>
                <input type="file" id="ledgerBackupFileInput" accept=".json" style="display: none;" />
                ${isMaster ? `
                    <button id="btnClearEntireLedger" class="btn-dark-pill" title="구매확정 내역 전체를 깨끗하게 비웁니다.">
                        <i class="fa-solid fa-broom" style="color: #f87171;"></i> 초기화
                    </button>
                ` : ''}
                <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 6px; white-space: nowrap;">총 ${rounds.length}개 회차</span>
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
        let purchases = (ledger[round] || []).map(syncPurchaseWithQrUrl);
        if (!purchases || purchases.length === 0) return;

        // 🔒 STRICT PRIVACY ISOLATION FOR NORMAL USERS:
        // Normal users must NEVER see other members' receipts!
        if (!isAdmin && currentTarget !== 'all') {
            purchases = purchases.filter(p => {
                const pUser = (p.user || p.userId || '').trim().toLowerCase();
                return pUser === cleanAuthId;
            });
            if (purchases.length === 0) return;
        }

        purchases = deduplicateReceipts(purchases);
        if (round === 1239 && typeof normalizeMaster1239Order === 'function') {
            purchases = normalizeMaster1239Order(purchases);
        }
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
                    const hasBonus = bonus ? nums.includes(bonus) : false;
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
                        ${actualDraw.numbers.map(n => `<span style="background:${getColor(n)}; width:18px; height:18px; line-height:18px; font-size:0.7rem; border-radius:50%; text-align:center; color:${n <= 10 ? '#0f172a' : '#fff'}; font-weight:900; display:inline-block;">${n}</span>`).join('')}
                        <span style="font-weight:bold; font-size:0.75rem; margin:0 2px;">+</span>
                        <span style="background:${getColor(actualDraw.bonus)}; width:18px; height:18px; line-height:18px; font-size:0.7rem; border-radius:50%; text-align:center; color:${actualDraw.bonus <= 10 ? '#0f172a' : '#fff'}; font-weight:900; display:inline-block;">${actualDraw.bonus}</span>
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
                <span class="confirmed-round-users-badge" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; color: #cbd5e1; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; max-width: 100%; word-break: break-word; line-height: 1.35;">
                    <i class="fa-solid fa-user-check" style="color: #818cf8; font-size: 0.65rem; flex-shrink: 0;"></i> 
                    <span>구매자: ${userNames.join(', ')}</span>
                </span>
            `;
        }

        html += `
            <div class="confirmed-round-card" style="box-sizing: border-box; max-width: 100%; overflow: hidden;">
                <div class="confirmed-round-header" style="display: flex; flex-direction: column; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px; cursor:pointer;" onclick="const content = this.nextElementSibling; const icon = this.querySelector('.chevron-icon'); if (content.style.display === 'none') { content.style.display = 'block'; icon.style.transform = 'rotate(180deg)'; } else { content.style.display = 'none'; icon.style.transform = 'rotate(0deg)'; }">
                    <div class="confirmed-round-title-row" style="display:flex; align-items:center; flex-wrap: wrap; gap: 6px; width: 100%;">
                        <strong style="font-size: 1.02rem; color: #fff; display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;">
                            <i class="fa-solid fa-chevron-down chevron-icon" style="transition: transform 0.3s; font-size:0.9rem; color: var(--text-secondary); transform: rotate(180deg);"></i>
                            제 ${round}회차 구매 확정 내역
                        </strong>
                        ${usersBadge}
                        ${winCountSummary}
                        ${allPurchasesLocked ? '<span style="color: #fbbf24; font-size: 0.74rem; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.25); padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-lock"></i> 전체 잠금됨</span>' : ''}
                    </div>
                    <div class="confirmed-round-sub-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px 10px; width: 100%; margin-top: 3px;">
                        <div style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            ${summaryHTML}
                        </div>
                        <div class="confirmed-round-actions" style="display:inline-flex; align-items:center; flex-wrap: wrap; gap: 5px; flex-shrink: 0; margin-left: auto;" onclick="event.stopPropagation();">
                            <button type="button" class="btn-toggle-all-round-combos btn-dark-pill" data-round="${round}" onclick="window.toggleRoundAllReceipts && window.toggleRoundAllReceipts(this, ${round})" style="height: 26px; box-sizing: border-box;">
                                <i class="fa-solid fa-layer-group" style="color: #818cf8;"></i> <span class="toggle-all-text">전체 번호 펼치기</span>
                            </button>
                            ${isAdmin ? `
                                ${round === 1238 && purchases.length > 3 && isMaster ? `
                                    <button class="btn-clean-1238-ghosts btn-dark-pill" data-round="1238" title="1238회 실제 구매(#1~#3) 외 가상 영수증 일괄 정리" style="height: 26px; box-sizing: border-box;">
                                        <i class="fa-solid fa-broom" style="color: #fbbf24;"></i> #4~#${purchases.length} 정리
                                    </button>
                                ` : ''}
                                ${isMaster ? `
                                    <button class="btn-delete-unlocked-round btn-dark-pill" data-round="${round}" title="잠금되지 않은 영수증 일괄 삭제" style="height: 26px; box-sizing: border-box;">
                                        <i class="fa-solid fa-trash-can" style="color: #f87171;"></i> 미잠금 삭제
                                    </button>
                                ` : ''}
                                <button class="btn-toggle-lock-round btn-dark-pill" data-round="${round}" style="height: 26px; box-sizing: border-box;">
                                    <i class="fa-solid ${roundLockIcon}" style="color: #fbbf24;"></i> ${roundLockText}
                                </button>
                            ` : ''}
                            <span style="font-size: 0.74rem; color: #94a3b8; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 6px; white-space: nowrap;">총 ${purchases.reduce((acc, p) => acc + p.combos.length, 0)}조합</span>
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

        purchases.forEach((rawPurchase, pIdx) => {
            const purchase = syncPurchaseWithQrUrl(rawPurchase);
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
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); color: #34d399; padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-rocket" style="font-size: 0.65rem;"></i> ${pVer.split(' (')[0]}</span>`;
            } else if (pVer.includes('QR') || pVer.includes('qr')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); color: #34d399; padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-qrcode" style="font-size: 0.65rem;"></i> QR영수증</span>`;
            } else if (pVer.includes('V4.0') || pVer.includes('4.0')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(139, 92, 246, 0.08); border: 1px solid rgba(139, 92, 246, 0.25); color: #c4b5fd; padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-brain" style="font-size: 0.65rem;"></i> V4.0 행동경제학</span>`;
            } else if (pVer.includes('V3.0') || pVer.includes('3.0')) {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); color: #fbbf24; padding: 2px 7px; border-radius: 6px; font-weight: 700; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-bolt" style="font-size: 0.65rem;"></i> V3.0 하이브리드</span>`;
            } else {
                versionBadgeHtml = `<span class="confirmed-version-badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; padding: 2px 7px; border-radius: 6px; font-weight: 600; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;"><i class="fa-solid fa-pen-nib" style="font-size: 0.65rem;"></i> 수동구매</span>`;
            }

            let purchaserLabel = '';
            if (purchaseUserName && purchaseUserName.toLowerCase() !== purchaseUser.toLowerCase()) {
                purchaserLabel = `구매자: <strong style="color: #fbbf24; font-weight: 800;">${purchaseUserName}</strong> <span style="color: #cbd5e1; font-size: 0.68rem; font-weight: 500;">(${purchaseUser})</span>`;
            } else {
                purchaserLabel = `구매자: <strong style="color: #fff; font-weight: 700;">${purchaseUser}</strong>`;
            }

            // Brief Outcome calculation for this single receipt
            let receiptHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, miss: 0 };
            let receiptPrize = 0;
            const winningGamesList = [];
            if (actualDraw) {
                const winningSet = new Set(actualDraw.numbers);
                const bonus = actualDraw.bonus;
                const p1 = actualDraw.rank1Prize || actualDraw.firstWinamnt || 2000000000;
                const p2 = actualDraw.rank2Prize || 50000000;
                const p3 = actualDraw.rank3Prize || 1500000;
                const p4 = 50000;
                const p5 = 5000;

                purchase.combos.forEach((c, cIdx) => {
                    const nums = getComboNumbers(c);
                    const matches = nums.filter(n => winningSet.has(n));
                    const matchCount = matches.length;
                    const hasBonus = bonus ? nums.includes(bonus) : false;
                    const gameLetter = ['A', 'B', 'C', 'D', 'E'][cIdx] || `${cIdx + 1}`;

                    if (matchCount === 6) { 
                        receiptHits[1]++; 
                        receiptPrize += p1; 
                        winningGamesList.push({ letter: gameLetter, rank: 1, label: '1등 대박', prize: p1 });
                    }
                    else if (matchCount === 5 && hasBonus) { 
                        receiptHits[2]++; 
                        receiptPrize += p2; 
                        winningGamesList.push({ letter: gameLetter, rank: 2, label: '2등 당첨', prize: p2 });
                    }
                    else if (matchCount === 5) { 
                        receiptHits[3]++; 
                        receiptPrize += p3; 
                        winningGamesList.push({ letter: gameLetter, rank: 3, label: '3등 당첨', prize: p3 });
                    }
                    else if (matchCount === 4) { 
                        receiptHits[4]++; 
                        receiptPrize += p4; 
                        winningGamesList.push({ letter: gameLetter, rank: 4, label: '4등 (50,000원)', prize: p4 });
                    }
                    else if (matchCount === 3) { 
                        receiptHits[5]++; 
                        receiptPrize += p5; 
                        winningGamesList.push({ letter: gameLetter, rank: 5, label: '5등 (5,000원)', prize: p5 });
                    }
                    else { receiptHits.miss++; }
                });
            }

            let receiptResultBadge = '';
            let winPillBadgeHtml = '';
            const hasWonReceipt = actualDraw && (receiptHits[1] > 0 || receiptHits[2] > 0 || receiptHits[3] > 0 || receiptHits[4] > 0 || receiptHits[5] > 0);

            let highestRank = 0;
            let themeColor = '#10b981';
            let themeGlow = 'rgba(16, 185, 129, 0.35)';
            let themeBorder = '#10b981';
            let themeDarkBg = '#071f16';
            let themeBannerBg = 'rgba(16, 185, 129, 0.25)';
            let rankIconEmoji = '🎉';
            let highestRankLabel = '당첨';

            if (receiptHits[1] > 0) {
                highestRank = 1;
                themeColor = '#fbbf24';
                themeGlow = 'rgba(251, 191, 36, 0.4)';
                themeBorder = '#fbbf24';
                themeDarkBg = '#1c1705';
                themeBannerBg = 'rgba(245, 158, 11, 0.3)';
                rankIconEmoji = '👑';
                highestRankLabel = '1등 대박';
            } else if (receiptHits[2] > 0) {
                highestRank = 2;
                themeColor = '#f87171';
                themeGlow = 'rgba(248, 113, 113, 0.4)';
                themeBorder = '#f87171';
                themeDarkBg = '#1f0d0d';
                themeBannerBg = 'rgba(239, 68, 68, 0.28)';
                rankIconEmoji = '🥈';
                highestRankLabel = '2등';
            } else if (receiptHits[3] > 0) {
                highestRank = 3;
                themeColor = '#60a5fa';
                themeGlow = 'rgba(96, 165, 250, 0.4)';
                themeBorder = '#60a5fa';
                themeDarkBg = '#0b1626';
                themeBannerBg = 'rgba(59, 130, 246, 0.28)';
                rankIconEmoji = '🥉';
                highestRankLabel = '3등';
            } else if (receiptHits[4] > 0) {
                highestRank = 4;
                themeColor = '#34d399';
                themeGlow = 'rgba(16, 185, 129, 0.35)';
                themeBorder = '#10b981';
                themeDarkBg = '#081f16';
                themeBannerBg = 'rgba(16, 185, 129, 0.25)';
                rankIconEmoji = '🏆';
                highestRankLabel = '4등';
            } else if (receiptHits[5] > 0) {
                highestRank = 5;
                themeColor = '#a78bfa';
                themeGlow = 'rgba(167, 139, 250, 0.35)';
                themeBorder = '#8b5cf6';
                themeDarkBg = '#140f21';
                themeBannerBg = 'rgba(139, 92, 246, 0.25)';
                rankIconEmoji = '🎁';
                highestRankLabel = '5등';
            }

            const parts = [];
            if (receiptHits[1] > 0) parts.push(`1등 ${receiptHits[1]}개`);
            if (receiptHits[2] > 0) parts.push(`2등 ${receiptHits[2]}개`);
            if (receiptHits[3] > 0) parts.push(`3등 ${receiptHits[3]}개`);
            if (receiptHits[4] > 0) parts.push(`4등 ${receiptHits[4]}개`);
            if (receiptHits[5] > 0) parts.push(`5등 ${receiptHits[5]}개`);

            if (actualDraw) {
                if (parts.length > 0) {
                    winPillBadgeHtml = `<span class="confirmed-receipt-win-badge" style="background: ${themeBannerBg}; color: ${themeColor}; border: 1px solid ${themeBorder}; padding: 3px 9px; border-radius: 6px; font-weight: 800; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px ${themeGlow}; white-space: nowrap;"><i class="fa-solid fa-trophy" style="color: ${themeColor};"></i> ${highestRankLabel} 당첨 (+${receiptPrize.toLocaleString()}원)</span>`;
                    receiptResultBadge = `<span class="confirmed-receipt-result-badge" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; padding: 2px 7px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-award"></i> ${parts.join(', ')} (+${receiptPrize.toLocaleString()}원)</span>`;
                } else {
                    receiptResultBadge = `<span class="confirmed-receipt-result-badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; padding: 2px 7px; border-radius: 6px; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;">낙첨</span>`;
                }
            } else {
                receiptResultBadge = `<span class="confirmed-receipt-result-badge" style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); color: #94a3b8; padding: 2px 7px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-clock"></i> 추첨 대기 (${purchase.combos.length}게임)</span>`;
            }

            let gamesHtml = '';
            purchase.combos.forEach((combo, cIdx) => {
                const nums = getComboNumbers(combo);
                
                // Check if this combo matches an AI recommendation (Supported from round 1239 onwards)
                let aiMatchTag = '';
                const pVer = purchase.version || '';
                if (pVer.includes('추가')) {
                    const packName = pVer.split(' (')[0] || pVer;
                    aiMatchTag = `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-rocket" style="font-size: 0.6rem;"></i> ${packName}</span>`;
                } else if (pVer.includes('V4.0') || pVer.includes('4.0')) {
                    aiMatchTag = `<span style="background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-brain" style="font-size: 0.6rem;"></i> V4.0 #${cIdx+1}</span>`;
                } else if (pVer.includes('V3.0') || pVer.includes('3.0')) {
                    aiMatchTag = `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-bolt" style="font-size: 0.6rem;"></i> V3.0 #${cIdx+1}</span>`;
                } else if (round >= 1239) {
                    try {
                        const { uV4, uV3, extraPacks } = getMemoizedRecommendations(round, purchaseUser);
                        const match = findBestRecommendationMatch(nums, uV4, uV3, extraPacks);
                        if (match && match.isExact) {
                            if (match.matchedVersion.includes('추가')) {
                                aiMatchTag = `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-rocket" style="font-size: 0.6rem;"></i> ${match.label}</span>`;
                            } else if (match.matchedVersion.includes('V4.0')) {
                                aiMatchTag = `<span style="background: rgba(139, 92, 246, 0.2); border: 1px solid rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-brain" style="font-size: 0.6rem;"></i> ${match.label}</span>`;
                            } else {
                                aiMatchTag = `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;"><i class="fa-solid fa-bolt" style="font-size: 0.6rem;"></i> ${match.label}</span>`;
                            }
                        } else {
                            aiMatchTag = `<span style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;" title="수동입력"><i class="fa-solid fa-pen-to-square" style="font-size: 0.6rem; color: #f87171;"></i> 수동</span>`;
                        }
                    } catch(e) {
                        aiMatchTag = `<span style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;" title="수동입력"><i class="fa-solid fa-pen-to-square" style="font-size: 0.6rem; color: #f87171;"></i> 수동</span>`;
                    }
                }
                
                let resultText = "추첨 대기";
                let rowBg = "rgba(255,255,255,0.015)";
                let border = "1px solid rgba(255,255,255,0.04)";
                let isRowWon = false;

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
                    const hasBonus = bonus ? nums.includes(bonus) : false;
                    const p1 = actualDraw.rank1Prize || actualDraw.firstWinamnt || 2000000000;
                    const p2 = actualDraw.rank2Prize || 50000000;
                    const p3 = actualDraw.rank3Prize || 1500000;

                    if (matchCount === 6) {
                        isRowWon = true;
                        resultText = `<span style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.35), rgba(217, 119, 6, 0.35)); border: 1px solid #fbbf24; color: #fef08a; padding: 2px 8px; border-radius: 5px; font-size: 0.74rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 10px rgba(251, 191, 36, 0.4);"><i class="fa-solid fa-crown" style="color: #fbbf24;"></i> 1등 대박 (+${p1.toLocaleString()}원)</span>`;
                        rowBg = "rgba(251,191,36,0.12)";
                        border = "1.5px solid #fbbf24";
                    } else if (matchCount === 5 && hasBonus) {
                        isRowWon = true;
                        resultText = `<span style="background: rgba(248, 113, 113, 0.3); border: 1px solid #f87171; color: #fecaca; padding: 2px 7px; border-radius: 5px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(248, 113, 113, 0.35);"><i class="fa-solid fa-medal" style="color: #f87171;"></i> 2등 당첨 (+${p2.toLocaleString()}원)</span>`;
                        rowBg = "rgba(248,113,113,0.12)";
                        border = "1.5px solid #f87171";
                    } else if (matchCount === 5) {
                        isRowWon = true;
                        resultText = `<span style="background: rgba(96, 165, 250, 0.3); border: 1px solid #60a5fa; color: #bfdbfe; padding: 2px 7px; border-radius: 5px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(96, 165, 250, 0.35);"><i class="fa-solid fa-trophy" style="color: #60a5fa;"></i> 3등 당첨 (+${p3.toLocaleString()}원)</span>`;
                        rowBg = "rgba(96,165,250,0.12)";
                        border = "1.5px solid #60a5fa";
                    } else if (matchCount === 4) {
                        isRowWon = true;
                        resultText = `<span style="background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #a7f3d0; padding: 2px 7px; border-radius: 5px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-award" style="color: #34d399;"></i> 4등 (50,000원)</span>`;
                        rowBg = "rgba(16,185,129,0.12)";
                        border = "1.5px solid #10b981";
                    } else if (matchCount === 3) {
                        isRowWon = true;
                        resultText = `<span style="background: rgba(167, 139, 250, 0.25); border: 1px solid #a78bfa; color: #ddd6fe; padding: 2px 7px; border-radius: 5px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(167, 139, 250, 0.3);"><i class="fa-solid fa-award" style="color: #c4b5fd;"></i> 5등 (5,000원)</span>`;
                        rowBg = "rgba(167,139,250,0.12)";
                        border = "1.5px solid #a78bfa";
                    } else {
                        resultText = `<span style="color: #64748b; font-size: 0.72rem;">낙첨</span>`;
                        if (hasWonReceipt) {
                            rowBg = "rgba(255,255,255,0.01)";
                            border = "1px solid rgba(255,255,255,0.03)";
                        }
                    }
                }

                const gameLetter = ['A', 'B', 'C', 'D', 'E'][cIdx] || `${cIdx + 1}`;
                const letterStyle = isRowWon
                    ? `background: ${border.split(' ')[2] || '#10b981'}; color: #000; font-weight: 900;`
                    : `color: var(--text-secondary); background: rgba(0,0,0,0.3); font-weight: 800;`;

                gamesHtml += `
                    <div class="confirmed-game-row" style="display: flex; justify-content: space-between; align-items: center; background: ${rowBg}; border: ${border}; padding: 5px 8px; border-radius: 6px; gap: 4px; width: 100%; box-sizing: border-box; ${hasWonReceipt && !isRowWon ? 'opacity: 0.7;' : ''}">
                        <div class="confirmed-game-main" style="display: inline-flex; align-items: center; gap: 5px; flex-shrink: 1; min-width: 0;">
                            <span class="confirmed-game-letter" style="font-size: 0.72rem; ${letterStyle} min-width: 18px; text-align: center; padding: 2px 3px; border-radius: 4px; font-family: monospace; flex-shrink: 0;">${gameLetter}</span>
                            <div class="balls-row confirmed-balls-row" style="display: inline-flex; gap: 3px; flex-shrink: 0; flex-wrap: nowrap;">
                                ${nums.map(n => {
                                    const isHit = actualDraw ? new Set(actualDraw.numbers).has(n) : false;
                                    const isBonusHit = actualDraw ? (n === actualDraw.bonus) : false;
                                    const ballBg = getColor(n);
                                    let extraStyle = '';
                                    if (actualDraw) {
                                        extraStyle = isHit ? 'border: 2.5px solid #fbbf24; font-weight: 900; box-shadow: 0 0 8px rgba(251,191,36,0.8);' : (isBonusHit ? 'border: 2.5px solid #f87171; font-weight: 900; box-shadow: 0 0 8px rgba(248,113,113,0.8);' : (hasWonReceipt && !isRowWon ? 'opacity: 0.35;' : 'opacity: 0.55;'));
                                    }
                                    const ballTextColor = (n <= 10) ? '#0f172a' : '#ffffff';
                                    return `<span class="lotto-ball-mini ${n <= 10 ? 'ball-yellow' : ''}" style="background: ${ballBg}; ${extraStyle} width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; font-size: 0.68rem; color: ${ballTextColor}; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
                                }).join('')}
                            </div>
                            <div class="confirmed-ai-tag" style="flex-shrink: 0; white-space: nowrap;">
                                ${aiMatchTag}
                            </div>
                        </div>
                        <div class="confirmed-game-result" style="margin-left: auto; text-align: right; flex-shrink: 0; white-space: nowrap;">${resultText}</div>
                    </div>
                `;
            });

            const qrMeta = purchase.qrMeta || null;
            const serial = qrMeta && qrMeta.qrSerial ? qrMeta.qrSerial : (purchase.qrSerial || `${String(round).padStart(4, '0')}00000014142041`);
            const rawUrl = qrMeta && qrMeta.qrRawUrl ? qrMeta.qrRawUrl : (purchase.qrRawUrl || null);
            const scannedAt = qrMeta && qrMeta.qrScannedAt ? formatDate(qrMeta.qrScannedAt) : (purchase.timestamp ? formatDate(purchase.timestamp) : '-');

            const finalQrUrl = buildDonghangLotteryQrUrl(round, purchase.combos, serial, rawUrl);

            const cardBorderStyle = hasWonReceipt ? `1.5px solid ${themeBorder}` : '1px solid rgba(255,255,255,0.08)';
            const cardBgStyle = hasWonReceipt ? `linear-gradient(180deg, ${themeDarkBg} 0%, #0a0f1d 100%)` : '#0a0f1d';
            const cardShadowStyle = hasWonReceipt ? `box-shadow: 0 0 22px ${themeGlow}, 0 6px 18px rgba(0,0,0,0.5);` : 'box-shadow: 0 4px 14px rgba(0,0,0,0.35);';

            const receiptId = purchase.receiptId || '';
            const purchaseFingerprint = getReceiptCombosFingerprint(purchase);

            html += `
                <!-- 🎟️ 스마트 모바일 월렛 패스 스타일 실구매 영수증 카드 (Clean Deep Black / Winning High Contrast) -->
                <div class="confirmed-receipt-card confirmed-receipt-pass ${hasWonReceipt ? 'confirmed-receipt-won' : ''}" style="border: ${cardBorderStyle}; border-radius: 12px; margin-bottom: 14px; background: ${cardBgStyle}; overflow: hidden; position: relative; ${cardShadowStyle}">
                    
                    ${hasWonReceipt ? `
                        <!-- 🏆 당첨 영수증 상단 하이라이트 배너 (High Contrast Radiant Win Ribbon) -->
                        <div class="confirmed-receipt-win-banner" style="background: linear-gradient(90deg, ${themeBannerBg} 0%, rgba(15, 23, 42, 0.95) 100%); border-bottom: 1px solid ${themeBorder}; padding: 9px 13px; display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; box-sizing: border-box; width: 100%; min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto;">
                                <span style="font-size: 1.15rem; line-height: 1; filter: drop-shadow(0 0 6px ${themeColor}); flex-shrink: 0;">${rankIconEmoji}</span>
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0;">
                                    <strong style="font-size: 0.88rem; color: #ffffff; letter-spacing: -0.2px; font-weight: 800; white-space: nowrap;">
                                        축하합니다! <span style="color: ${themeColor};">${highestRankLabel} 당첨!</span>
                                    </strong>
                                    <span style="font-size: 0.72rem; color: #cbd5e1; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 4px; white-space: nowrap;">
                                        ${parts.join(' · ')}
                                    </span>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 5px; margin-left: auto; flex-shrink: 0;">
                                <span style="font-size: 0.72rem; color: #94a3b8; white-space: nowrap;">당첨금</span>
                                <strong style="font-size: 1.02rem; font-weight: 900; color: #fbbf24; text-shadow: 0 0 10px rgba(251, 191, 36, 0.4); font-family: monospace; white-space: nowrap;">
                                    +${receiptPrize.toLocaleString()}원
                                </strong>
                            </div>
                        </div>
                    ` : ''}

                    <!-- 1. Pass Top Header -->
                    <div class="confirmed-receipt-header" style="padding: 11px 13px; background: #0f172a; border-bottom: 1px dashed rgba(255,255,255,0.08); position: relative;">
                        <!-- Top Badges Row -->
                        <div class="confirmed-receipt-top-row" style="display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-bottom: 6px; width: 100%;">
                            <div class="confirmed-receipt-badge-group" style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; min-width: 0;">
                                <span style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; padding: 2px 7px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;">
                                    <i class="fa-solid fa-circle-check"></i> 실구매인증
                                </span>
                                ${versionBadgeHtml}
                                ${isLocked ? '<span class="confirmed-lock-badge" style="color: #fbbf24; font-size: 0.7rem; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.25); padding: 2px 6px; border-radius: 4px; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-lock"></i> 잠김</span>' : ''}
                            </div>
                            <div class="confirmed-receipt-result-pill" style="display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto;">
                                ${winPillBadgeHtml || receiptResultBadge}
                            </div>
                        </div>

                        <!-- Main Title & Purchaser Meta -->
                        <div style="display: flex; flex-direction: column; gap: 3px;">
                            <div style="font-size: 0.92rem; font-weight: 800; color: #ffffff; display: flex; align-items: center; gap: 6px; letter-spacing: -0.2px;">
                                <i class="fa-solid fa-ticket" style="color: #fbbf24; font-size: 0.85rem;"></i> 제 ${round}회차 로또 6/45 · <span style="color: #cbd5e1;">영수증 #${pIdx+1}</span>
                            </div>
                            <div class="confirmed-receipt-meta" style="font-size: 0.72rem; color: #94a3b8; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; line-height: 1.35;">
                                <span style="display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;">${purchaserLabel}</span>
                                <span style="color: rgba(255,255,255,0.2);">•</span>
                                <span style="color: #cbd5e1; font-weight: 700; white-space: nowrap;">${purchase.combos.length}게임 (${(purchase.combos.length * 1000).toLocaleString()}원)</span>
                                ${scannedAt !== '-' ? `<span style="color: rgba(255,255,255,0.2);">•</span> <span style="font-family: monospace; color: #64748b; font-size: 0.68rem; white-space: nowrap;">${scannedAt}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- 2. Pass Mid Control Bar -->
                    <div class="confirmed-receipt-control-bar" style="padding: 6px 12px; background: #0b1120; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; box-sizing: border-box; min-width: 0;">
                        <div style="font-size: 0.74rem; font-weight: 700; color: #cbd5e1; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; min-width: 0;">
                            <i class="fa-solid fa-list-check" style="color: #818cf8; font-size: 0.72rem; flex-shrink: 0;"></i>
                            <span>${purchase.combos.length}개 게임 번호</span>
                            ${hasWonReceipt && winningGamesList.length > 0 ? `
                                <span class="confirmed-win-folded-badge" style="font-size: 0.7rem; font-weight: 800; color: ${themeColor}; background: rgba(16, 185, 129, 0.15); border: 1px solid ${themeBorder}; padding: 2px 7px; border-radius: 5px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 8px ${themeGlow}; white-space: nowrap;">
                                    <i class="fa-solid fa-trophy" style="font-size: 0.65rem;"></i>
                                    <span>${winningGamesList.map(w => `${w.letter}게임 ${w.label}`).join(', ')}</span>
                                </span>
                            ` : ''}
                        </div>
                        <div class="confirmed-receipt-actions" style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap; flex-shrink: 0; margin-left: auto;">
                            <button type="button" class="btn-toggle-receipt-combos btn-dark-pill" onclick="window.toggleReceiptCombos && window.toggleReceiptCombos(this)" style="height: 26px; box-sizing: border-box;">
                                <i class="fa-solid fa-list-ol"></i>
                                <span class="toggle-combos-text">번호 펼치기</span>
                                <i class="fa-solid fa-chevron-down toggle-combos-icon" style="transition: transform 0.2s; font-size: 0.62rem;"></i>
                            </button>
                            ${isAdmin ? `
                                <button class="btn-toggle-lock-purchase btn-dark-pill" data-round="${round}" data-pidx="${pIdx}" data-receiptid="${receiptId}" data-user="${purchaseUser}" data-fingerprint="${purchaseFingerprint}" title="${isLocked ? '잠금 해제하기' : '실수 방지 잠금'}" style="height: 26px; box-sizing: border-box;">
                                    <i class="fa-solid ${lockIcon}" style="color: #fbbf24;"></i> ${lockBtnText}
                                </button>
                                ${isMaster ? `
                                    <button class="btn-delete-purchase btn-dark-pill" data-round="${round}" data-pidx="${pIdx}" data-receiptid="${receiptId}" data-user="${purchaseUser}" data-fingerprint="${purchaseFingerprint}" ${isLocked ? 'disabled' : ''} title="${isLocked ? '잠금 해제 후 휴지통으로 이동 가능' : '휴지통으로 안전 보관 이동'}" style="height: 26px; box-sizing: border-box; ${isLocked ? 'opacity: 0.4; cursor: not-allowed;' : ''}">
                                        <i class="fa-solid fa-trash-can" style="color: #f87171;"></i> 삭제
                                    </button>
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>

                    <!-- 3. Pass Body (Collapsible Games List - Folded by default) -->
                    <div class="confirmed-games-list" style="display:none; flex-direction:column; gap: 5px; padding: 8px 10px; background: rgba(0,0,0,0.25);">
                        ${gamesHtml}
                    </div>

                    <!-- 4. Pass Bottom Footer (TR Info & 동행복권 원본 QR 링크 & 당첨여부확인 버튼) -->
                    <div class="confirmed-receipt-footer" style="padding: 10px 12px; background: #0f172a; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 8px; width: 100%; box-sizing: border-box; min-width: 0; overflow: hidden;">
                        
                        <!-- Top row: Serial & Status & Action Button -->
                        <div class="confirmed-footer-top-row">
                            <div class="confirmed-serial-group">
                                <div class="confirmed-serial-text">
                                    <span class="confirmed-serial-label">발행 일련번호:</span>
                                    <strong class="confirmed-serial-num" title="${serial}">${serial}</strong>
                                </div>
                                <span class="confirmed-serial-dot">•</span>
                                <div class="confirmed-verify-status">
                                    <i class="fa-solid fa-shield-check"></i>
                                    <span>발권 검증 완료</span>
                                </div>
                            </div>
                            <div class="confirmed-footer-btn-wrap">
                                <button type="button" class="confirmed-btn-verify-qr" title="동행복권 공식 서버 실시간 당첨결과 조회" onclick="window.openDonghangVerifyModal && window.openDonghangVerifyModal('${finalQrUrl}')">
                                    <i class="fa-solid fa-magnifying-glass-chart"></i>
                                    <span>동행복권 당첨확인</span>
                                </button>
                            </div>
                        </div>

                        <!-- Bottom row: 동행복권 원본 QR 링크 바 -->
                        <div class="confirmed-receipt-qr-link-bar">
                            <div class="confirmed-qr-info-wrap">
                                <i class="fa-solid fa-qrcode confirmed-qr-icon"></i>
                                <span class="confirmed-qr-badge">공식 QR:</span>
                                <button type="button" class="confirmed-qr-url-link" title="${finalQrUrl}" onclick="window.openDonghangVerifyModal && window.openDonghangVerifyModal('${finalQrUrl}')">${finalQrUrl}</button>
                            </div>
                            <button type="button" class="btn-dark-pill confirmed-qr-copy-btn" onclick="window.copyToClipboard && window.copyToClipboard('${finalQrUrl}', '🔗 동행복권 원본 QR 링크가 복사되었습니다.')" title="동행복권 공식 QR 원본 링크 클립보드 복사">
                                <i class="fa-solid fa-copy"></i>
                                <span>복사</span>
                            </button>
                        </div>
                    </div>
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
                let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
                if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                    try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
                }
                if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
                    showToast('🔒 영수증 휴지통은 최고 관리자(Master) 전용 기능입니다.');
                    return;
                }
                openReceiptTrashModal();
            };
        }

        const btnClear = document.getElementById('btnClearEntireLedger');
        if (btnClear) {
            btnClear.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
                if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                    try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
                }
                if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
                    showToast('🔒 구매확정 전체 초기화는 최고 관리자(Master) 전용 기능입니다.');
                    return;
                }
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

            let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                try {
                    const parsed = JSON.parse(currentAuthId);
                    currentAuthId = parsed.userid || parsed.userId || currentAuthId;
                } catch (e) {}
            }
            currentAuthId = (currentAuthId || '').toLowerCase().trim();
            if (currentAuthId !== 'master') {
                showToast('🔒 영수증 일괄 삭제는 최고 관리자(Master) 전용 기능입니다.');
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
                for (let i = 0; i < unlockedReceipts.length; i++) {
                    await moveToReceiptTrash(round, i, unlockedReceipts[i], currentAuthId);
                }

                await renderConfirmedPurchasesList();
                renderReceiptTrashModalContent();
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

            const currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
            const isAdmin = (currentAuthId === 'master' || currentAuthId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(currentAuthId)));
            if (!isAdmin) {
                showToast('🔒 회차 전체 잠금 관리는 관리자(Master) 전용 기능입니다.');
                return;
            }

            const round = parseInt(btn.dataset.round);
            const targetUser = state.adminViewingTarget && state.adminViewingTarget !== 'all' && state.adminViewingTarget !== 'my'
                ? state.adminViewingTarget
                : currentAuthId;

            await toggleRoundLock(round, null, targetUser);
            await renderConfirmedPurchasesList();
            if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
            if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
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
            const receiptId = btn.dataset.receiptid || '';
            const purchaseUser = (btn.dataset.user || currentAuthId).toLowerCase().trim();
            const fingerprint = btn.dataset.fingerprint || '';

            const isAdmin = (currentAuthId === 'master' || currentAuthId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(currentAuthId)));

            if (!isAdmin && purchaseUser !== currentAuthId) {
                showToast('🔒 타인의 영수증 잠금은 변경할 수 없습니다.');
                return;
            }

            // Safely toggle lock without touching or wiping other users' databases
            const success = await toggleReceiptLock(round, receiptId || pIdx, purchaseUser, fingerprint);
            if (success) {
                await renderConfirmedPurchasesList();
                if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
                if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
            } else {
                console.warn(`[Lock] Could not find purchase record for round ${round}, receiptId ${receiptId}, index ${pIdx}`);
            }
        });
    });


    // Bind delete listeners
    container.querySelectorAll('.btn-delete-purchase').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation(); // prevent accordion toggle

            let currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '');
            if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                try {
                    const parsed = JSON.parse(currentAuthId);
                    currentAuthId = parsed.userid || parsed.userId || currentAuthId;
                } catch (e) {}
            }
            currentAuthId = (currentAuthId || '').toLowerCase().trim();
            const isMaster = (currentAuthId === 'master');

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

                if (!isMaster) {
                    showToast('🔒 영수증 삭제 및 관리는 최고 관리자(Master) 전용 기능입니다.');
                    return;
                }

                if (confirm(`정말 이 구매 내역을 [휴지통]으로 이동하시겠습니까?\n(회차: ${round}회, 내역 #${pIdx+1}, 회원: ${purchaseUser})\n\n💡 삭제된 영수증은 휴지통에 안전 보관되며, 언제든지 [복원] 버튼으로 되돌릴 수 있습니다.`)) {
                    // 1. Safely move to receipt trash
                    await moveToReceiptTrash(round, pIdx, purchase, currentAuthId);

                    // 2. Re-render UI immediately
                    await renderConfirmedPurchasesList();
                    renderReceiptTrashModalContent();
                    if (typeof window.renderReviewTab === 'function') window.renderReviewTab();
                    if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
                    showToast('🗑️ 구매 영수증 1장이 [휴지통]으로 안전 보관 이동되었습니다. (휴지통에서 복원 가능)');
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
        <div style="background: #0d1322; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 12px 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; color: #fbbf24; font-size: 0.85rem;">
                        <i class="fa-solid fa-trophy"></i>
                    </span>
                    <strong style="color: #fff; font-size: 0.9rem;">실구매 당첨 이력 요약</strong>
                    <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 6px;">총 ${totalCombos}조합 중 ${totalWins}건 적중 (${winRate}%)</span>
                </div>
                <button type="button" class="btn-open-winning-history-summary btn-dark-pill" onclick="window.openWinningHistoryModal && window.openWinningHistoryModal()" style="padding: 4px 10px; font-size: 0.75rem;">
                    <i class="fa-solid fa-list-check" style="color: #818cf8;"></i> 전체 회차 간략표
                </button>
            </div>
            
            <div class="confirmed-rank-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px;">
                <div style="background: rgba(251, 191, 36, 0.05); border: 1px solid rgba(251, 191, 36, 0.2); border-radius: 8px; padding: 7px 6px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #fbbf24; font-weight: 700; white-space: nowrap;">🥇 1등 (6개)</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[0]}<span style="font-size: 0.7rem; font-weight: normal; color: #94a3b8;">건</span></div>
                </div>
                <div style="background: rgba(105, 200, 242, 0.05); border: 1px solid rgba(105, 200, 242, 0.2); border-radius: 8px; padding: 7px 6px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #69c8f2; font-weight: 700; white-space: nowrap;">🥈 2등 (5+보너스)</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[1]}<span style="font-size: 0.7rem; font-weight: normal; color: #94a3b8;">건</span></div>
                </div>
                <div style="background: rgba(255, 114, 114, 0.05); border: 1px solid rgba(255, 114, 114, 0.2); border-radius: 8px; padding: 7px 6px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #ff7272; font-weight: 700; white-space: nowrap;">🥉 3등 (5개)</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[2]}<span style="font-size: 0.7rem; font-weight: normal; color: #94a3b8;">건</span></div>
                </div>
                <div style="background: rgba(52, 211, 153, 0.05); border: 1px solid rgba(52, 211, 153, 0.2); border-radius: 8px; padding: 7px 6px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #34d399; font-weight: 700; white-space: nowrap;">🎖️ 4등 (4개)</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[3]}<span style="font-size: 0.7rem; font-weight: normal; color: #94a3b8;">건</span></div>
                </div>
                <div style="background: rgba(167, 139, 250, 0.05); border: 1px solid rgba(167, 139, 250, 0.2); border-radius: 8px; padding: 7px 6px; text-align: center;">
                    <div style="font-size: 0.7rem; color: #a78bfa; font-weight: 700; white-space: nowrap;">🎗️ 5등 (3개)</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-top: 2px;">${hits[4]}<span style="font-size: 0.7rem; font-weight: normal; color: #94a3b8;">건</span></div>
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

    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try { const parsed = JSON.parse(authId); authId = parsed.userid || parsed.userId || authId; } catch(e) {}
    }
    const cleanAuthId = String(authId).toLowerCase().trim();
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(cleanAuthId) : (cleanAuthId === 'master' || cleanAuthId === 'admin'));
    const currentTarget = isAdmin ? (state.adminViewingTarget || 'my') : cleanAuthId;

    const fin = calculateLedgerFinancials(true, currentTarget);
    const { totalInvest, totalPrize, netProfit, totalRoi, totalCombos, totalWins, winRate, hits, roundBreakdown } = fin;
    const roundDataList = Object.values(roundBreakdown).sort((a, b) => b.round - a.round);
    const rounds = Object.keys(roundBreakdown);

    const getBallBadge = (n) => {
        const bg = getBallHexColor(n);
        const textColor = n <= 10 ? '#0f172a' : '#fff';
        return `<span style="background: ${bg}; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; color: ${textColor}; font-size: 0.72rem; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${n}</span>`;
    };

    if (rounds.length === 0) {
        body.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
                <i class="fa-solid fa-receipt" style="font-size: 2.5rem; margin-bottom: 12px; color: #f59e0b;"></i>
                <p style="font-size: 1rem; color: #fff;">구매 확정된 번호 조합 내역이 없습니다.</p>
                <p style="font-size: 0.85rem; margin-top: 5px;">이번주 추천번호 탭에서 번호를 생성 후 [구매 확정]을 진행해주세요.</p>
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
                <div style="color: #94a3b8; font-size: 0.75rem;">총 구매금액</div>
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
                                                    const textColor = n <= 10 ? '#0f172a' : '#fff';
                                                    return `<span style="background: ${ballBg}; ${borderStyle} width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; font-size: 0.7rem; color: ${textColor}; font-weight: 900; display: inline-block;">${n}</span>`;
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
export async function openReceiptTrashModal() {
    let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
    if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
        try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
    }
    if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
        showToast('🔒 영수증 휴지통은 최고 관리자(Master) 전용 기능입니다.');
        return;
    }

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

    // Always fetch latest cloud trash list before rendering
    try {
        await fetchReceiptTrash();
    } catch(e) {}

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

    const trashList = getReceiptTrashList();
    
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
                        ${Array.isArray(nums) ? nums.map(n => `<span style="background:${getColor(n)}; width:20px; height:20px; line-height:20px; border-radius:50%; font-size:0.68rem; font-weight:900; color:${n <= 10 ? '#0f172a' : '#fff'}; text-align:center; display:inline-block;">${n}</span>`).join('') : ''}
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
            let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
            }
            if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
                showToast('🔒 영수증 복원은 최고 관리자(Master) 전용 기능입니다.');
                return;
            }

            const trashId = btn.dataset.trashId;
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 복원중...`;
            
            await restoreFromReceiptTrash(trashId, currentAuthId);

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
            let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
            }
            if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
                showToast('🔒 영수증 영구 삭제는 최고 관리자(Master) 전용 기능입니다.');
                return;
            }

            const trashId = btn.dataset.trashId;
            if (confirm('💥 정말로 이 영수증을 완전히 영구 삭제하시겠습니까?\n\n이 작업은 복원할 수 없습니다.')) {
                btn.disabled = true;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 삭제중...`;
                await permanentDeleteFromReceiptTrash(trashId);

                renderReceiptTrashModalContent();
                showToast('💥 영수증이 영구 삭제되었습니다.');
            }
        };
    });

    // Bind empty entire trash listener
    const btnEmptyTrash = document.getElementById('btnEmptyEntireTrashModal');
    if (btnEmptyTrash) {
        btnEmptyTrash.onclick = async () => {
            let currentAuthId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '';
            if (typeof currentAuthId === 'string' && currentAuthId.startsWith('{')) {
                try { const parsed = JSON.parse(currentAuthId); currentAuthId = parsed.userid || parsed.userId || currentAuthId; } catch(e) {}
            }
            if ((currentAuthId || '').toLowerCase().trim() !== 'master') {
                showToast('🔒 휴지통 비우기는 최고 관리자(Master) 전용 기능입니다.');
                return;
            }

            if (confirm('🧹 휴지통의 모든 영수증을 영구히 삭제하시겠습니까?\n\n휴지통이 완전히 비워지며 복원할 수 없습니다.')) {
                btnEmptyTrash.disabled = true;
                btnEmptyTrash.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 비우는중...`;
                await emptyEntireReceiptTrash();

                renderReceiptTrashModalContent();
                showToast('🧹 휴지통이 깨끗하게 비워졌습니다.');
            }
        };
    }
}

/**
 * 📱 단일 구매영수증의 5게임 번호 조합 목록 펼치기/접기 토글
 */
export function toggleReceiptCombos(btn) {
    if (!btn) return;
    const card = btn.closest('.confirmed-receipt-card');
    if (!card) return;
    const gamesList = card.querySelector('.confirmed-games-list');
    const textEl = btn.querySelector('.toggle-combos-text');
    const iconEl = btn.querySelector('.toggle-combos-icon');
    if (!gamesList) return;

    const isHidden = (gamesList.style.display === 'none' || !gamesList.style.display);
    if (isHidden) {
        gamesList.style.display = 'flex';
        if (textEl) textEl.textContent = '번호 접기';
        if (iconEl) iconEl.style.transform = 'rotate(180deg)';
        btn.style.background = 'rgba(59, 130, 246, 0.28)';
        btn.style.borderColor = '#3b82f6';
        btn.style.color = '#bfdbfe';
    } else {
        gamesList.style.display = 'none';
        if (textEl) textEl.textContent = '번호 펼치기';
        if (iconEl) iconEl.style.transform = 'rotate(0deg)';
        btn.style.background = 'rgba(59, 130, 246, 0.15)';
        btn.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        btn.style.color = '#93c5fd';
    }
}

/**
 * 📱 해당 회차 내 모든 구매영수증 번호 일괄 펼치기/접기 토글
 */
export function toggleRoundAllReceipts(btn, round) {
    if (!btn) return;
    const roundCard = btn.closest('.confirmed-round-card');
    if (!roundCard) return;
    const allGamesLists = roundCard.querySelectorAll('.confirmed-games-list');
    const allToggleBtns = roundCard.querySelectorAll('.btn-toggle-receipt-combos');
    const isCurrentlyCollapsed = Array.from(allGamesLists).some(el => el.style.display === 'none' || !el.style.display);

    allGamesLists.forEach(el => {
        el.style.display = isCurrentlyCollapsed ? 'flex' : 'none';
    });

    allToggleBtns.forEach(b => {
        const textEl = b.querySelector('.toggle-combos-text');
        const iconEl = b.querySelector('.toggle-combos-icon');
        if (textEl) textEl.textContent = isCurrentlyCollapsed ? '번호 접기' : '번호 펼치기';
        if (iconEl) iconEl.style.transform = isCurrentlyCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        b.style.background = isCurrentlyCollapsed ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.15)';
        b.style.borderColor = isCurrentlyCollapsed ? '#3b82f6' : 'rgba(59, 130, 246, 0.4)';
        b.style.color = isCurrentlyCollapsed ? '#bfdbfe' : '#93c5fd';
    });

    const roundToggleText = btn.querySelector('.toggle-all-text');
    if (roundToggleText) {
        roundToggleText.textContent = isCurrentlyCollapsed ? '전체 번호 접기' : '전체 번호 펼치기';
    }
}

/**
 * 📱 구매확정 현황 누적 통계 & 재무 분석 아코디언 토글 (기본 접힘 관리)
 */
export function toggleConfirmedStats(forceOpen) {
    const content = document.getElementById('confirmedStatsCollapsibleContent');
    const toggleBar = document.getElementById('confirmedStatsToggleBar');
    const icon = document.getElementById('iconToggleConfirmedStats');
    const txt = document.getElementById('txtToggleConfirmedStats');
    if (!content) return;

    const isOpen = (content.style.display !== 'none' && content.style.display !== '');
    const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : !isOpen;

    if (shouldOpen) {
        content.style.display = 'block';
        if (toggleBar) toggleBar.classList.add('expanded');
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (txt) txt.textContent = '통계 접기';

        // Trigger Chart.js resize so charts render with sharp, full responsive dimensions
        setTimeout(() => {
            if (state.confirmedPrizeChartInstance && typeof state.confirmedPrizeChartInstance.resize === 'function') {
                state.confirmedPrizeChartInstance.resize();
            }
            if (state.confirmedTrendChartInstance && typeof state.confirmedTrendChartInstance.resize === 'function') {
                state.confirmedTrendChartInstance.resize();
            }
        }, 60);
    } else {
        content.style.display = 'none';
        if (toggleBar) toggleBar.classList.remove('expanded');
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (txt) txt.textContent = '통계 펼치기';
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
    window.toggleReceiptCombos = toggleReceiptCombos;
    window.toggleRoundAllReceipts = toggleRoundAllReceipts;
    window.toggleConfirmedStats = toggleConfirmedStats;
}

// ============================================================
// 🎯 동행복권 당첨확인 인앱 모달 (실시간 정밀 채점 & 공식 QR 확인)
// ============================================================
export function openDonghangVerifyModal(url) {
    if (!url || typeof document === 'undefined') return;

    // 1. QR URL 파싱하여 회차, 게임별 번호, 일련번호 추출
    let parsed = null;
    try {
        if (typeof parseDonghangLotteryQrUrl === 'function') {
            parsed = parseDonghangLotteryQrUrl(url);
        }
    } catch(e) {}

    const round = parsed ? parsed.round : (parseInt((url.match(/[?&]v=(\d{1,4})/i) || [])[1], 10) || 0);
    const combos = parsed ? (parsed.combos || []) : [];
    const serial = parsed ? (parsed.serial || '') : '';

    // 2. 실제 당첨 데이터 조회
    let actualDraw = null;
    try {
        if (typeof getSafeActualDraw === 'function') {
            actualDraw = getSafeActualDraw(round);
        }
        if (!actualDraw && state && state.mergedHistory && state.mergedHistory[round]) {
            actualDraw = state.mergedHistory[round];
        }
        if (!actualDraw && typeof LOTTO_HISTORY !== 'undefined' && LOTTO_HISTORY[round]) {
            actualDraw = LOTTO_HISTORY[round];
        }
    } catch(e) {}

    const hasDrawn = !!(actualDraw && Array.isArray(actualDraw.numbers) && actualDraw.numbers.length === 6);
    const winNumsSet = hasDrawn ? new Set(actualDraw.numbers) : new Set();
    const bonusNum = hasDrawn ? (actualDraw.bonus || 0) : 0;

    const rankNames = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등', 0: '낙첨' };
    let totalPrize = 0;
    let winningCount = 0;
    let highestRank = 0;

    // 게임별 채점 수행
    const scoredCombos = combos.map((c, idx) => {
        const letter = c.letter || ['A', 'B', 'C', 'D', 'E'][idx] || `${idx + 1}`;
        const nums = Array.isArray(c.numbers) ? c.numbers : (Array.isArray(c) ? c : []);
        const sortedNums = nums.slice().sort((a, b) => a - b);

        if (!hasDrawn) {
            return { letter, nums: sortedNums, matchCount: 0, bonusHit: false, rank: 0, prize: 0 };
        }

        const matchCount = sortedNums.filter(n => winNumsSet.has(n)).length;
        const bonusHit = sortedNums.includes(bonusNum);

        let rank = 0;
        let prize = 0;
        if (matchCount === 6) {
            rank = 1;
            prize = (actualDraw.prizes && actualDraw.prizes[1]) ? actualDraw.prizes[1] : 2000000000;
        } else if (matchCount === 5 && bonusHit) {
            rank = 2;
            prize = (actualDraw.prizes && actualDraw.prizes[2]) ? actualDraw.prizes[2] : 50000000;
        } else if (matchCount === 5) {
            rank = 3;
            prize = (actualDraw.prizes && actualDraw.prizes[3]) ? actualDraw.prizes[3] : 1500000;
        } else if (matchCount === 4) {
            rank = 4;
            prize = 50000;
        } else if (matchCount === 3) {
            rank = 5;
            prize = 5000;
        }

        if (rank > 0) {
            totalPrize += prize;
            winningCount++;
            if (highestRank === 0 || rank < highestRank) highestRank = rank;
        }

        return { letter, nums: sortedNums, matchCount, bonusHit, rank, prize };
    });

    // 3. CSS 주입 (최초 1회)
    if (!document.getElementById('donghang-verify-modal-style')) {
        const style = document.createElement('style');
        style.id = 'donghang-verify-modal-style';
        style.textContent = `
            #donghangVerifyModal {
                display: none;
                position: fixed;
                top: 0; left: 0;
                width: 100vw; height: 100vh;
                background: rgba(7, 10, 20, 0.88);
                z-index: 999999;
                align-items: center;
                justify-content: center;
                padding: 14px;
                box-sizing: border-box;
                backdrop-filter: blur(8px);
            }
            #donghangVerifyModal.active { display: flex; }
            #donghangVerifyModalBox {
                background: linear-gradient(165deg, #0f172a 0%, #0a0f1e 100%);
                border: 1.5px solid #334155;
                border-radius: 18px;
                width: 100%;
                max-width: 540px;
                max-height: 92vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 25px 65px rgba(0,0,0,0.75), 0 0 30px rgba(56,189,248,0.15);
            }
            #donghangVerifyModalHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                background: linear-gradient(135deg, #1e3a5f, #0f172a);
                border-bottom: 1px solid rgba(56, 189, 248, 0.25);
                flex-shrink: 0;
            }
            #donghangVerifyModalHeader .modal-title {
                display: flex; align-items: center; gap: 8px;
                font-size: 1rem; font-weight: 800; color: #f8fafc;
            }
            #donghangVerifyModalHeader .modal-title i { color: #38bdf8; font-size: 1.1rem; }
            #donghangVerifyModalClose {
                background: rgba(255,255,255,0.08);
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 8px;
                color: #94a3b8;
                width: 32px; height: 32px;
                display: flex; align-items: center; justify-content: center;
                cursor: pointer; font-size: 1rem; transition: all 0.2s;
            }
            #donghangVerifyModalClose:hover { background: rgba(239,68,68,0.2); color: #f87171; border-color: #ef4444; }
            #donghangVerifyModalBody {
                padding: 16px;
                overflow-y: auto;
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            #donghangVerifyModalFooter {
                padding: 12px 18px;
                display: flex; gap: 8px; align-items: center; justify-content: flex-end;
                background: #0a0f1e;
                border-top: 1px solid #1e293b;
                flex-shrink: 0;
            }
            .verify-ball-mini {
                width: 28px; height: 28px;
                border-radius: 50%;
                display: inline-flex; align-items: center; justify-content: center;
                font-size: 0.82rem; font-weight: 900;
                box-shadow: inset 0 -2px 4px rgba(0,0,0,0.35);
                transition: transform 0.2s;
            }
            .verify-ball-hit {
                border: 2px solid #fbbf24 !important;
                box-shadow: 0 0 10px rgba(251,191,36,0.85), inset 0 -2px 4px rgba(0,0,0,0.3) !important;
                transform: scale(1.08);
            }
            .verify-ball-bonus {
                border: 2px solid #38bdf8 !important;
                box-shadow: 0 0 10px rgba(56,189,248,0.85), inset 0 -2px 4px rgba(0,0,0,0.3) !important;
                transform: scale(1.08);
            }
            .verify-ball-dim {
                opacity: 0.45;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    // 4. 모달 DOM 생성 (없으면)
    let modal = document.getElementById('donghangVerifyModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'donghangVerifyModal';
        document.body.appendChild(modal);
    }

    // 5. 당첨번호 영역 HTML
    let drawBannerHtml = '';
    if (hasDrawn) {
        const ballsHtml = actualDraw.numbers.map(n => {
            const bg = getBallHexColor(n);
            const tc = getBallTextColor(n);
            return `<span class="verify-ball-mini" style="background:${bg};color:${tc};">${n}</span>`;
        }).join('');
        const bonusBg = getBallHexColor(bonusNum);
        const bonusTc = getBallTextColor(bonusNum);

        drawBannerHtml = `
            <div style="background: linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(15, 23, 42, 0.7)); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem; font-weight: 800; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-bullhorn"></i> 제 ${round}회차 공식 당첨번호
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">${actualDraw.drawDate || '공식 추첨 완료'}</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; flex-wrap: wrap;">
                    ${ballsHtml}
                    <span style="font-weight: 800; color: #94a3b8; margin: 0 3px; font-size: 1rem;">+</span>
                    <span class="verify-ball-mini verify-ball-bonus" style="background:${bonusBg};color:${bonusTc};" title="보너스 번호">${bonusNum}</span>
                </div>
            </div>
        `;
    } else {
        drawBannerHtml = `
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px dashed rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 12px 14px; text-align: center; color: #fbbf24; font-size: 0.84rem; font-weight: 700;">
                <i class="fa-solid fa-hourglass-half" style="margin-right: 6px;"></i> 제 ${round}회차는 아직 추첨 전입니다 (매주 토요일 20:45 당첨 발표)
            </div>
        `;
    }

    // 6. 게임별 채점표 HTML
    let gamesListHtml = '';
    if (scoredCombos.length > 0) {
        gamesListHtml = scoredCombos.map(g => {
            const balls = g.nums.map(n => {
                const bg = getBallHexColor(n);
                const tc = getBallTextColor(n);
                const isHit = hasDrawn && winNumsSet.has(n);
                const isBonusHit = hasDrawn && (n === bonusNum);
                let hitClass = '';
                if (isHit) hitClass = 'verify-ball-hit';
                else if (isBonusHit) hitClass = 'verify-ball-bonus';
                else if (hasDrawn) hitClass = 'verify-ball-dim';

                return `<span class="verify-ball-mini ${hitClass}" style="background:${bg};color:${tc};">${n}</span>`;
            }).join('');

            let badgeHtml = '';
            if (hasDrawn) {
                if (g.rank > 0) {
                    badgeHtml = `
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            <span style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25)); border: 1px solid #10b981; color: #34d399; font-weight: 900; font-size: 0.8rem; padding: 2px 8px; border-radius: 6px; box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);">
                                🎉 ${rankNames[g.rank]} 당첨
                            </span>
                            <span style="font-size: 0.72rem; color: #fbbf24; font-weight: 800; margin-top: 2px;">+${g.prize.toLocaleString()}원</span>
                        </div>
                    `;
                } else {
                    badgeHtml = `<span style="background: rgba(255,255,255,0.05); color: #64748b; font-size: 0.75rem; padding: 3px 8px; border-radius: 5px;">낙첨</span>`;
                }
            } else {
                badgeHtml = `<span style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; font-size: 0.75rem; padding: 3px 8px; border-radius: 5px;">발권 등록</span>`;
            }

            return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); padding: 8px 10px; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="width: 24px; height: 24px; border-radius: 6px; background: #1e293b; color: #cbd5e1; font-weight: 800; font-size: 0.82rem; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.1);">
                            ${g.letter}
                        </span>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            ${balls}
                        </div>
                    </div>
                    ${badgeHtml}
                </div>
            `;
        }).join('');
    } else {
        gamesListHtml = `<div style="text-align:center;color:#94a3b8;padding:12px;">등록된 게임 조합 정보를 불러올 수 없습니다.</div>`;
    }

    // 7. 총 당첨금 배너 HTML
    let summaryBannerHtml = '';
    if (hasDrawn) {
        if (totalPrize > 0) {
            summaryBannerHtml = `
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.25)); border: 1.5px solid #10b981; border-radius: 12px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 0 16px rgba(16,185,129,0.3);">
                    <div>
                        <div style="font-size: 0.78rem; color: #a7f3d0; font-weight: 700;">총 ${winningCount}개 게임 당첨! (${highestRank > 0 ? rankNames[highestRank] + ' 당첨' : ''})</div>
                        <div style="font-size: 0.72rem; color: #cbd5e1;">영수증 5게임 실구매 채점 완료</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.72rem; color: #cbd5e1;">총 당첨금</span>
                        <div style="font-size: 1.25rem; font-weight: 900; color: #fbbf24; text-shadow: 0 0 8px rgba(251,191,36,0.5);">
                            +${totalPrize.toLocaleString()}원
                        </div>
                    </div>
                </div>
            `;
        } else {
            summaryBannerHtml = `
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 14px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
                    <i class="fa-solid fa-clover" style="color: #10b981; margin-right: 4px;"></i> 이번 영수증은 아쉽게도 낙첨되었습니다. 다음 회차의 1등 당첨을 기원합니다!
                </div>
            `;
        }
    }

    // 8. 모달 전체 마크업
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(url)}`;

    modal.innerHTML = `
        <div id="donghangVerifyModalBox">
            <div id="donghangVerifyModalHeader">
                <div class="modal-title">
                    <i class="fa-solid fa-ticket-simple"></i>
                    <span>동행복권 실시간 당첨결과 조회</span>
                </div>
                <button type="button" id="donghangVerifyModalClose" onclick="window.closeDonghangVerifyModal && window.closeDonghangVerifyModal()" title="닫기">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            
            <div id="donghangVerifyModalBody">
                ${drawBannerHtml}

                <!-- 게임별 번호 및 당첨 판정 리스트 -->
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <div style="font-size: 0.82rem; font-weight: 800; color: #cbd5e1; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fa-solid fa-list-check" style="color: #818cf8; margin-right: 5px;"></i> 발권 영수증 게임별 번호 (${scoredCombos.length}게임)</span>
                        <span style="font-size: 0.72rem; color: #64748b;">일련번호: ${serial || 'TR-발권검증'}</span>
                    </div>
                    ${gamesListHtml}
                </div>

                ${summaryBannerHtml}

                <!-- QR 원본 및 공식 사이트 검증 카드 -->
                <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; display: flex; align-items: center; gap: 14px;">
                    <img src="${qrImageUrl}" width="90" height="90" style="border-radius: 8px; border: 1px solid #334155; flex-shrink: 0; background: #fff;" alt="동행복권 공식 QR" onerror="this.style.display='none'" />
                    <div style="display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1;">
                        <div style="font-size: 0.78rem; font-weight: 800; color: #f8fafc;">
                            <i class="fa-solid fa-qrcode" style="color: #38bdf8;"></i> 동행복권 공식 QR 데이터
                        </div>
                        <div style="font-size: 0.68rem; color: #64748b; word-break: break-all; line-height: 1.35; max-height: 38px; overflow: hidden;">
                            ${url}
                        </div>
                        <button type="button" class="btn-dark-pill" onclick="window.copyToClipboard && window.copyToClipboard('${url}', '🔗 공식 QR 링크가 복사되었습니다.')" style="align-self: flex-start; padding: 4px 10px; font-size: 0.72rem; height: 24px;">
                            <i class="fa-solid fa-copy"></i> 링크 복사
                        </button>
                    </div>
                </div>
            </div>

            <div id="donghangVerifyModalFooter">
                <button type="button" onclick="window.closeDonghangVerifyModal && window.closeDonghangVerifyModal()" style="padding: 9px 16px; border-radius: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; font-weight: 700; font-size: 0.82rem; cursor: pointer;">
                    닫기
                </button>
                <button type="button" onclick="window.open('${url}', '_blank')" style="padding: 9px 16px; border-radius: 8px; background: linear-gradient(135deg, #1e3a5f, #2563eb); border: 1px solid #38bdf8; color: #ffffff; font-weight: 800; font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.35);">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> 동행복권 공식 사이트 새 창
                </button>
            </div>
        </div>
    `;

    modal.onclick = function(e) {
        if (e.target === modal) closeDonghangVerifyModal();
    };

    modal.classList.add('active');
    if (document.body) document.body.style.overflow = 'hidden';
}

export function closeDonghangVerifyModal() {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('donghangVerifyModal');
    if (modal) modal.classList.remove('active');
    if (document.body) document.body.style.overflow = '';
}

if (typeof window !== 'undefined') {
    window.openDonghangVerifyModal = openDonghangVerifyModal;
    window.closeDonghangVerifyModal = closeDonghangVerifyModal;

    if (typeof document !== 'undefined') {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('donghangVerifyModal');
                if (modal && modal.classList.contains('active')) {
                    closeDonghangVerifyModal();
                }
            }
        });
    }
}
