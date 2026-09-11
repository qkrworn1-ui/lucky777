import { state, saveGlobalState } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast } from '../../../shared/utils.js';
import { createBallHtml } from '../../../shared/components.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack, saveUserWeeklyRecommendationSnapshot } from '../generator.js';
import { db } from '../../../shared/db.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';
import { getComboNumbers, getLedger, getHistoricalTop10Combinations, saveToLedger } from '../ledger.js';

let currentAlgoReviewStartRound = 1235;
let algoAccordionStateMap = {};
let generatorAdminViewingUser = null;

/**
 * 1235회차부터 최신 회차까지 7개 알고리즘의 100% 무결점 실데이터 전수 복기 채점 집계
 * (신규 당첨번호 업데이트 시 state.mergedHistory 기반으로 실시간 자동 반영)
 */
export function compute7AlgorithmsRealStats(fromRound = 1235, targetUserId = null) {
    const history = state.mergedHistory || {};
    const drawnRounds = Object.keys(history)
        .map(Number)
        .filter(r => !isNaN(r) && r >= fromRound && history[r] && Array.isArray(history[r].numbers) && history[r].numbers.length === 6)
        .sort((a, b) => a - b);

    const maxRound = drawnRounds.length > 0 ? Math.max(...drawnRounds) : fromRound;

    // 7개 알고리즘 명확한 정의 (각 10게임)
    const algoDefinitions = [
        {
            id: 'v4',
            name: 'V4.0 행동경제학 포트폴리오',
            shortName: 'V4.0 행동경제학',
            icon: 'fa-brain',
            badge: 'V4.0 BEHAVIORAL',
            color: '#a78bfa',
            bgGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(167, 139, 250, 0.4)',
            desc: '통계적 밸런스 + 클러스터링 믹스 + 과적합 치트키 10게임 앙상블',
            getCombos: (r) => computeAbsoluteTop10Combinations(false, r, 'v4', true, targetUserId) || []
        },
        {
            id: 'v3',
            name: 'V3.0 하이브리드 정통 수학 알고리즘',
            shortName: 'V3.0 하이브리드',
            icon: 'fa-gears',
            badge: 'V3.0 HYBRID MATH',
            color: '#60a5fa',
            bgGradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(96, 165, 250, 0.4)',
            desc: '빈도·Pair·보너스·Cold·EV·이웃수·거울수·모멘텀 복합 수학 모델 (10게임)',
            getCombos: (r) => computeAbsoluteTop10Combinations(false, r, 'v3', true, targetUserId) || []
        },
        {
            id: 'extra1',
            name: '추가 1: 30게임 완성형 100% 전수 커버리지팩',
            shortName: '추가 1: 전수 커버리지',
            icon: 'fa-shield-halved',
            badge: '추가 1 KEYSTONE 100%',
            color: '#10b981',
            bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(16, 185, 129, 0.4)',
            desc: '기본 20게임(V3+V4) 누락 번호 100% 포섭 + 핫 앵커 직교 결합 (10게임)',
            getCombos: (r) => { const p = generateExtraAddonPack(1, r, targetUserId); return (p && p.combos) ? p.combos : []; }
        },
        {
            id: 'extra2',
            name: '추가 2: 초고배당 EV 독점 수령팩',
            shortName: '추가 2: 초고배당 EV',
            icon: 'fa-sack-dollar',
            badge: '추가 2 HIGH EV MONOPOLY',
            color: '#f59e0b',
            bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(245, 158, 11, 0.4)',
            desc: '30~45번대 고번호 + 2연번 집중으로 1등 당첨 시 독점 수령금 극대화 (10게임)',
            getCombos: (r) => { const p = generateExtraAddonPack(2, r, targetUserId); return (p && p.combos) ? p.combos : []; }
        },
        {
            id: 'extra3',
            name: '추가 3: 기하학적 휠링 하모닉팩',
            shortName: '추가 3: 기하학 휠링',
            icon: 'fa-dharmachakra',
            badge: '추가 3 HARMONIC WHEELING',
            color: '#8b5cf6',
            bgGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(139, 92, 246, 0.4)',
            desc: '45각형 5구간 대칭 분산형 휠링 매트릭스로 3~4등 다중 적중 방어망 (10게임)',
            getCombos: (r) => { const p = generateExtraAddonPack(3, r, targetUserId); return (p && p.combos) ? p.combos : []; }
        },
        {
            id: 'extra4',
            name: '추가 4: 마르코프 2차 전이 & 페어 부스터팩',
            shortName: '추가 4: 마르코프&페어',
            icon: 'fa-bolt',
            badge: '추가 4 MARKOV & PAIR',
            color: '#06b6d4',
            bgGradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(6, 182, 212, 0.4)',
            desc: '직전 회차 마르코프 전이 확률 및 역대 최다 동반 출현 Pair 집중 타격 (10게임)',
            getCombos: (r) => { const p = generateExtraAddonPack(4, r, targetUserId); return (p && p.combos) ? p.combos : []; }
        },
        {
            id: 'extra5',
            name: '추가 5: 골든 클러스터 올인팩',
            shortName: '추가 5: 골든 클러스터',
            icon: 'fa-crown',
            badge: '추가 5 GOLDEN CLIQUE',
            color: '#ec4899',
            bgGradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(15, 23, 42, 0.7) 100%)',
            borderColor: 'rgba(236, 72, 153, 0.4)',
            desc: '역대 1등 추첨 데이터 최다 중복 출현 3수 고정틀(Golden Trios) 마스터 (10게임)',
            getCombos: (r) => { const p = generateExtraAddonPack(5, r, targetUserId); return (p && p.combos) ? p.combos : []; }
        }
    ];

    let grandTotalGames = 0;
    let grandTotalInvest = 0;
    let grandTotalPrize = 0;
    const grandRankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const results = algoDefinitions.map(algo => {
        let totalGames = 0;
        let totalInvest = 0;
        let totalPrize = 0;
        const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundDetails = [];

        drawnRounds.forEach(round => {
            const draw = history[round];
            if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) return;

            const winningSet = new Set(draw.numbers);
            const bonus = draw.bonus;
            const combos = algo.getCombos(round) || [];
            
            let roundPrize = 0;
            const roundHits = [];

            combos.forEach((combo, gIdx) => {
                totalGames++;
                totalInvest += 1000;
                grandTotalGames++;
                grandTotalInvest += 1000;

                const nums = getComboNumbers(combo);
                if (!Array.isArray(nums) || nums.length !== 6) return;

                const matches = nums.filter(n => winningSet.has(n));
                const matchCount = matches.length;
                const hasBonus = (bonus !== undefined && bonus !== null) ? nums.includes(bonus) : false;

                let rank = null;
                let prize = 0;
                let rankLabel = '';

                if (matchCount === 6) {
                    rank = 1;
                    prize = draw.rank1Prize || draw.firstWinamnt || 2000000000;
                    rankLabel = '🎉 1등 (6개 일치)';
                } else if (matchCount === 5 && hasBonus) {
                    rank = 2;
                    prize = draw.rank2Prize || 50000000;
                    rankLabel = '🥈 2등 (5개+보너스)';
                } else if (matchCount === 5) {
                    rank = 3;
                    prize = draw.rank3Prize || 1500000;
                    rankLabel = '🥉 3등 (5개 일치)';
                } else if (matchCount === 4) {
                    rank = 4;
                    prize = 50000;
                    rankLabel = '✨ 4등 (4개 일치)';
                } else if (matchCount === 3) {
                    rank = 5;
                    prize = 5000;
                    rankLabel = '⭐ 5등 (3개 일치)';
                }

                if (rank !== null) {
                    rankCounts[rank]++;
                    grandRankCounts[rank]++;
                    totalPrize += prize;
                    grandTotalPrize += prize;
                    roundPrize += prize;

                    roundHits.push({
                        gameIdx: gIdx + 1,
                        comboName: combo.meta ? combo.meta.name : (combo.name || `게임 #${gIdx + 1}`),
                        nums: nums,
                        matchedNums: matches,
                        hasBonus: hasBonus,
                        bonusNum: bonus,
                        matchCount: matchCount,
                        rank: rank,
                        rankLabel: rankLabel,
                        prize: prize
                    });
                }
            });

            roundDetails.push({
                round: round,
                date: draw.date || draw.drwNoDate || '',
                drawNumbers: draw.numbers,
                bonus: bonus,
                roundPrize: roundPrize,
                hits: roundHits,
                hitCount: roundHits.length
            });
        });

        const totalWins = rankCounts[1] + rankCounts[2] + rankCounts[3] + rankCounts[4] + rankCounts[5];
        const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
        const roi = totalInvest > 0 ? (((totalPrize - totalInvest) / totalInvest) * 100).toFixed(1) : '0.0';
        
        let topRank = null;
        for (let r = 1; r <= 5; r++) {
            if (rankCounts[r] > 0) {
                topRank = r;
                break;
            }
        }

        return {
            ...algo,
            totalRounds: drawnRounds.length,
            totalGames,
            totalInvest,
            totalPrize,
            rankCounts,
            totalWins,
            winRate,
            roi,
            topRank,
            roundDetails: roundDetails.sort((a, b) => b.round - a.round)
        };
    });

    const grandTotalWins = grandRankCounts[1] + grandRankCounts[2] + grandRankCounts[3] + grandRankCounts[4] + grandRankCounts[5];
    const grandWinRate = grandTotalGames > 0 ? ((grandTotalWins / grandTotalGames) * 100).toFixed(1) : '0.0';
    const grandRoi = grandTotalInvest > 0 ? (((grandTotalPrize - grandTotalInvest) / grandTotalInvest) * 100).toFixed(1) : '0.0';

    return {
        fromRound,
        maxRound,
        totalRoundsCount: drawnRounds.length,
        drawnRounds,
        grandTotalGames,
        grandTotalInvest,
        grandTotalPrize,
        grandRankCounts,
        grandTotalWins,
        grandWinRate,
        grandRoi,
        results
    };
}

let isAlgoReviewMainExpanded = false;

function formatPrizeCompact(prize) {
    if (!prize || isNaN(prize) || prize <= 0) return '0원';
    if (prize >= 100000000) {
        const eok = prize / 100000000;
        return eok >= 10 ? `${Math.round(eok).toLocaleString()}억원` : `${eok.toFixed(1)}억원`;
    }
    if (prize >= 10000) {
        return `${Math.round(prize / 10000).toLocaleString()}만원`;
    }
    return `${prize.toLocaleString()}원`;
}

/**
 * 추천번호생성기 화면에 역대 7개 알고리즘 실데이터 누적 복기 리포트 렌더링
 * (스마트폰 최적화: 기본 초슬림 콤팩트 요약 뷰 + 펼치기 토글)
 */
export function render7AlgorithmsRealReviewSection() {
    const container = document.getElementById('algoRealReviewSection');
    if (!container) return;

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;

    const data = compute7AlgorithmsRealStats(currentAlgoReviewStartRound, effectiveUserId);
    const { fromRound, maxRound, totalRoundsCount, results, grandTotalGames, grandTotalPrize, grandRankCounts, grandTotalWins, grandWinRate, grandRoi } = data;

    if (totalRoundsCount === 0) {
        container.innerHTML = `
            <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 10px 14px; text-align: center; color: #94a3b8; font-size: 0.8rem;">
                <i class="fa-solid fa-circle-info" style="color: #60a5fa;"></i> 제 ${fromRound}회차 이후의 추첨 당첨 데이터가 아직 등록되지 않았습니다.
            </div>
        `;
        return;
    }

    // 1. Horizontal Quick Reference Mini Chips for each of the 7 algorithms
    const algoChipsHtml = results.map(algo => {
        let topBadge = '';
        if (algo.topRank === 1) topBadge = `<span style="background: rgba(251,191,36,0.3); border: 1px solid #fbbf24; color: #fbbf24; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">1등</span>`;
        else if (algo.topRank === 2) topBadge = `<span style="background: rgba(248,113,113,0.3); border: 1px solid #f87171; color: #f87171; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">2등</span>`;
        else if (algo.topRank === 3) topBadge = `<span style="background: rgba(96,165,250,0.3); border: 1px solid #60a5fa; color: #60a5fa; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">3등</span>`;
        else if (algo.topRank === 4) topBadge = `<span style="background: rgba(52,211,153,0.3); border: 1px solid #34d399; color: #34d399; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">4등</span>`;
        else if (algo.topRank === 5) topBadge = `<span style="background: rgba(167,139,250,0.3); border: 1px solid #a78bfa; color: #a78bfa; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; font-weight: 800;">5등</span>`;
        else topBadge = `<span style="background: rgba(255,255,255,0.06); color: #94a3b8; padding: 1px 4px; border-radius: 4px; font-size: 0.68rem;">-</span>`;

        return `
            <div style="background: ${algo.bgGradient}; border: 1px solid ${algo.borderColor}; border-radius: 8px; padding: 6px 10px; display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;">
                <i class="fa-solid ${algo.icon}" style="color: ${algo.color}; font-size: 0.8rem;"></i>
                <span style="font-size: 0.74rem; font-weight: 700; color: #f8fafc; white-space: nowrap;">${algo.shortName}</span>
                ${topBadge}
                <span style="font-size: 0.72rem; color: #fbbf24; font-weight: 700; white-space: nowrap;">${algo.totalWins}회 적중</span>
                <span style="font-size: 0.72rem; color: #34d399; font-weight: 700; white-space: nowrap;">(+${formatPrizeCompact(algo.totalPrize)})</span>
            </div>
        `;
    }).join('');

    // 2. Detailed Full Breakdown HTML
    let fullDetailCardsHtml = '';
    results.forEach(algo => {
        const isExpanded = !!algoAccordionStateMap[algo.id];
        
        let topRankBadge = '';
        if (algo.topRank === 1) topRankBadge = `<span style="background: rgba(251,191,36,0.25); border: 1px solid #fbbf24; color: #fbbf24; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥇 최고 1등 적중</span>`;
        else if (algo.topRank === 2) topRankBadge = `<span style="background: rgba(248,113,113,0.25); border: 1px solid #f87171; color: #f87171; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥈 최고 2등 적중</span>`;
        else if (algo.topRank === 3) topRankBadge = `<span style="background: rgba(96,165,250,0.25); border: 1px solid #60a5fa; color: #60a5fa; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥉 최고 3등 적중</span>`;
        else if (algo.topRank === 4) topRankBadge = `<span style="background: rgba(52,211,153,0.25); border: 1px solid #34d399; color: #34d399; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">✨ 최고 4등 적중</span>`;
        else if (algo.topRank === 5) topRankBadge = `<span style="background: rgba(167,139,250,0.25); border: 1px solid #a78bfa; color: #a78bfa; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">⭐ 최고 5등 적중</span>`;
        else topRankBadge = `<span style="background: rgba(255,255,255,0.06); color: #94a3b8; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem;">추첨 추적 중</span>`;

        let roundRowsHtml = '';
        algo.roundDetails.forEach(rd => {
            let hitItemsHtml = '';
            if (rd.hits.length > 0) {
                hitItemsHtml = rd.hits.map(h => {
                    const rankColor = h.rank === 1 ? '#fbbf24' : h.rank === 2 ? '#f87171' : h.rank === 3 ? '#60a5fa' : h.rank === 4 ? '#34d399' : '#a78bfa';
                    const ballsHtml = h.nums.map(n => {
                        const isHit = h.matchedNums.includes(n);
                        const isBonusHit = h.hasBonus && (n === rd.bonus);
                        return createBallHtml(n, {
                            isHit: isHit,
                            isBonusHit: isBonusHit,
                            dim: !isHit && !isBonusHit,
                            size: 'mini'
                        });
                    }).join('');

                    return `
                        <div style="background: rgba(0,0,0,0.3); border-left: 3px solid ${rankColor}; border-radius: 6px; padding: 6px 8px; margin-top: 4px; display: flex; flex-direction: column; gap: 4px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74rem;">
                                <span style="color: #cbd5e1; font-weight: 700;">#${h.gameIdx} ${h.comboName}</span>
                                <strong style="color: ${rankColor}; font-size: 0.78rem;">${h.rankLabel} (+${h.prize.toLocaleString()}원)</strong>
                            </div>
                            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                                ${ballsHtml}
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                hitItemsHtml = `<div style="font-size: 0.72rem; color: #64748b; padding: 4px 0;">해당 회차는 5등 이상 미적중</div>`;
            }

            const drawBallsHtml = rd.drawNumbers.map(n => createBallHtml(n, { size: 'mini' })).join('');
            const bonusBallHtml = rd.bonus ? createBallHtml(rd.bonus, { isBonusHit: true, size: 'mini' }) : '';

            roundRowsHtml += `
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 8px 10px; margin-top: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 0.76rem;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <strong style="color: #f8fafc;">제 ${rd.round}회</strong>
                            <span style="font-size: 0.7rem; color: #64748b;">${rd.date}</span>
                        </div>
                        <div style="font-size: 0.74rem; font-weight: 700; color: ${rd.roundPrize > 0 ? '#34d399' : '#64748b'};">
                            ${rd.hitCount > 0 ? `🎯 ${rd.hitCount}게임 적중 (+${rd.roundPrize.toLocaleString()}원)` : '낙첨'}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px; flex-wrap: wrap;">
                        <span style="font-size: 0.7rem; color: #94a3b8;">당첨번호:</span>
                        ${drawBallsHtml}
                        <span style="font-size: 0.7rem; color: #64748b; margin: 0 2px;">+</span>
                        ${bonusBallHtml}
                    </div>
                    ${hitItemsHtml}
                </div>
            `;
        });

        fullDetailCardsHtml += `
            <div style="background: ${algo.bgGradient}; border: 1.5px solid ${algo.borderColor}; border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="background: ${algo.color}25; border: 1px solid ${algo.color}; color: ${algo.color}; padding: 2px 7px; border-radius: 12px; font-size: 0.7rem; font-weight: 800;">
                                <i class="fa-solid ${algo.icon}"></i> ${algo.badge}
                            </span>
                            ${topRankBadge}
                        </div>
                        <h4 style="margin: 4px 0 2px 0; color: #f8fafc; font-size: 0.92rem; font-weight: 800;">
                            ${algo.name}
                        </h4>
                        <p style="margin: 0; color: #94a3b8; font-size: 0.72rem; line-height: 1.3;">
                            ${algo.desc}
                        </p>
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.35); border-radius: 8px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <div>
                        <span style="font-size: 0.7rem; color: #94a3b8;">누적 당첨금</span>
                        <div style="font-size: 0.95rem; font-weight: 800; color: #34d399;">+${algo.totalPrize.toLocaleString()}원</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.7rem; color: #94a3b8;">적중 건수 (적중률)</span>
                        <div style="font-size: 0.92rem; font-weight: 800; color: #fbbf24;">${algo.totalWins}회 <span style="font-size:0.72rem; color:#fde047;">(${algo.winRate}%)</span></div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 2px; font-size: 0.72rem; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 4px 6px;">
                    <span style="color: ${algo.rankCounts[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">1등: <strong>${algo.rankCounts[1]}</strong></span>
                    <span style="color: ${algo.rankCounts[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">2등: <strong>${algo.rankCounts[2]}</strong></span>
                    <span style="color: ${algo.rankCounts[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">3등: <strong>${algo.rankCounts[3]}</strong></span>
                    <span style="color: ${algo.rankCounts[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">4등: <strong>${algo.rankCounts[4]}</strong></span>
                    <span style="color: ${algo.rankCounts[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">5등: <strong>${algo.rankCounts[5]}</strong></span>
                </div>

                <button type="button" onclick="window.toggleAlgoRealReviewAccordion && window.toggleAlgoRealReviewAccordion('${algo.id}')" style="width: 100%; padding: 6px 8px; font-size: 0.74rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: rgba(30,41,59,0.8); color: ${algo.color}; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    <span>${isExpanded ? '회차별 결과 닫기' : `회차별 당첨 상세 (${algo.totalWins}회 적중)`}</span>
                </button>

                <div id="algo-review-detail-${algo.id}" style="display: ${isExpanded ? 'block' : 'none'}; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px; max-height: 350px; overflow-y: auto;">
                    ${roundRowsHtml}
                </div>
            </div>
        `;
    });

    let html = `
        <div style="background: linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8)); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 10px 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.35); margin-bottom: 16px;">
            <!-- Ultra Compact Header Toolbar -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; cursor: pointer;" onclick="window.toggleAlgoReviewMainCollapse && window.toggleAlgoReviewMainCollapse()">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #0f172a; padding: 2px 6px; border-radius: 6px; font-size: 0.7rem; font-weight: 900;">
                        <i class="fa-solid fa-trophy"></i> 7대 알고리즘 실데이터 당첨 결과
                    </span>
                    <span style="font-size: 0.78rem; font-weight: 700; color: #f8fafc;">
                        제 ${fromRound}~${maxRound}회 (${totalRoundsCount}회차 누적)
                    </span>
                    <span style="font-size: 0.75rem; font-weight: 800; color: #34d399;">
                        총 ${grandTotalWins}회 적중 (+${formatPrizeCompact(grandTotalPrize)})
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button type="button" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fbbf24; border-radius: 6px; padding: 4px 8px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <span>${isAlgoReviewMainExpanded ? '간략히 보기' : '자세히 보기'}</span>
                        <i class="fa-solid ${isAlgoReviewMainExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                    </button>
                </div>
            </div>

            <!-- Horizontal Scrollable Quick Mini Chips (Compact for Mobile) -->
            <div style="display: flex; gap: 6px; overflow-x: auto; padding-top: 8px; padding-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch;">
                ${algoChipsHtml}
            </div>

            <!-- Collapsible Full Detail View -->
            <div id="algoRealReviewFullDetailSection" style="display: ${isAlgoReviewMainExpanded ? 'block' : 'none'}; margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);">
                <!-- Grand Summary Stats Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 12px;">
                    <div>
                        <span style="font-size: 0.7rem; color: #94a3b8;">누적 총 당첨금</span>
                        <div style="font-size: 0.95rem; font-weight: 800; color: #34d399;">+${grandTotalPrize.toLocaleString()}원</div>
                    </div>
                    <div>
                        <span style="font-size: 0.7rem; color: #94a3b8;">총 적중 횟수 (적중률)</span>
                        <div style="font-size: 0.92rem; font-weight: 800; color: #fbbf24;">${grandTotalWins}회 (${grandWinRate}%)</div>
                    </div>
                    <div>
                        <span style="font-size: 0.7rem; color: #94a3b8;">1~5등 등급별 적중</span>
                        <div style="display: flex; gap: 3px; flex-wrap: wrap; margin-top: 2px;">
                            <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(251,191,36,0.2); color: #fbbf24; font-weight: 700;">1등:${grandRankCounts[1]}</span>
                            <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(248,113,113,0.2); color: #f87171; font-weight: 700;">2등:${grandRankCounts[2]}</span>
                            <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(96,165,250,0.2); color: #60a5fa; font-weight: 700;">3등:${grandRankCounts[3]}</span>
                            <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(52,211,153,0.2); color: #34d399; font-weight: 700;">4등:${grandRankCounts[4]}</span>
                            <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(167,139,250,0.2); color: #a78bfa; font-weight: 700;">5등:${grandRankCounts[5]}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 10px;">
                    <button type="button" onclick="window.toggleAllAlgoRealReviews && window.toggleAllAlgoRealReviews(true)" class="btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(30,41,59,0.8); color: #cbd5e1; cursor: pointer;">
                        <i class="fa-solid fa-angles-down"></i> 전체 펼치기
                    </button>
                    <button type="button" onclick="window.toggleAllAlgoRealReviews && window.toggleAllAlgoRealReviews(false)" class="btn-secondary" style="padding: 4px 8px; font-size: 0.72rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(30,41,59,0.8); color: #cbd5e1; cursor: pointer;">
                        <i class="fa-solid fa-angles-up"></i> 전체 접기
                    </button>
                </div>

                <!-- 7 Algorithms Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px;">
                    ${fullDetailCardsHtml}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Toggle main collapsible view of 7 algorithms real review
 */
export function toggleAlgoReviewMainCollapse() {
    isAlgoReviewMainExpanded = !isAlgoReviewMainExpanded;
    render7AlgorithmsRealReviewSection();
}

/**
 * Toggle single algorithm details accordion
 */
export function toggleAlgoRealReviewAccordion(algoId) {
    algoAccordionStateMap[algoId] = !algoAccordionStateMap[algoId];
    render7AlgorithmsRealReviewSection();
}

/**
 * Toggle all algorithms details accordion
 */
export function toggleAllAlgoRealReviews(expand = true) {
    ['v4', 'v3', 'extra1', 'extra2', 'extra3', 'extra4', 'extra5'].forEach(id => {
        algoAccordionStateMap[id] = !!expand;
    });
    render7AlgorithmsRealReviewSection();
}


export function getSelectedComboCountOption() {
    const radios = document.getElementsByName('optComboCount');
    for (const r of radios) {
        if (r.checked) return parseInt(r.value);
    }
    return 10;
}

export function getEnsembleWinningHistory(comboObj, comboIndex) {
    const ledger = getLedger();
    const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
    const useV4 = chkReportLogic ? chkReportLogic.checked : false;
    const targetVersionKeyword = useV4 ? 'V4.0' : 'V3.0';

    const winningHistory = [];
    const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalPrize = 0;
    let totalPurchasedRounds = 0;

    for (const [roundStr, _] of Object.entries(ledger)) {
        const round = parseInt(roundStr);
        if (isNaN(round)) continue;

        const actualDraw = state.mergedHistory && state.mergedHistory[round];
        if (!actualDraw || !actualDraw.numbers) continue;

        const winningSet = new Set(actualDraw.numbers);
        const bonus = actualDraw.bonus;

        const purchases = getHistoricalTop10Combinations(round) || [];
        purchases.forEach(p => {
            const isMatchingVersion = p.version && p.version.includes(targetVersionKeyword);
            if (!isMatchingVersion && purchases.length > 1) return;

            const combos = p.combos || [];
            const matchedCombo = combos[comboIndex] || combos.find(c => c.meta && comboObj.meta && c.meta.name === comboObj.meta.name);

            if (matchedCombo) {
                totalPurchasedRounds++;
                const nums = getComboNumbers(matchedCombo);
                const matches = nums.filter(n => winningSet.has(n));
                const matchCount = matches.length;
                const hasBonus = nums.includes(bonus);

                let rank = 0;
                let prize = 0;
                let rankLabel = '';

                if (matchCount === 6) {
                    rank = 1;
                    prize = actualDraw.rank1Prize || 2000000000;
                    rankLabel = '1등';
                } else if (matchCount === 5 && hasBonus) {
                    rank = 2;
                    prize = 50000000;
                    rankLabel = '2등';
                } else if (matchCount === 5) {
                    rank = 3;
                    prize = 1500000;
                    rankLabel = '3등';
                } else if (matchCount === 4) {
                    rank = 4;
                    prize = 50000;
                    rankLabel = '4등';
                } else if (matchCount === 3) {
                    rank = 5;
                    prize = 5000;
                    rankLabel = '5등';
                }

                if (rank >= 1 && rank <= 5) {
                    rankCounts[rank]++;
                    totalPrize += prize;
                    winningHistory.push({
                        round,
                        rank,
                        rankLabel,
                        prize,
                        matchCount,
                        hasBonus
                    });
                }
            }
        });
    }

    winningHistory.sort((a, b) => b.round - a.round);

    return {
        totalPurchasedRounds,
        hasWins: winningHistory.length > 0,
        winningHistory,
        rankCounts,
        totalPrize,
        topRank: winningHistory.length > 0 ? Math.min(...winningHistory.map(w => w.rank)) : null
    };
}

/**
 * Check if a 6-number combo is registered in the confirmed purchase list for the target round
 * (Requires exact 6/6 numbers match)
 */
export function isComboPurchasedInConfirmedLedger(nums, targetRound = null) {
    if (!Array.isArray(nums) || nums.length !== 6) return false;
    const round = targetRound || (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239));
    const ledger = getLedger();
    const roundPurchases = ledger[round] || ledger[String(round)] || [];
    if (!Array.isArray(roundPurchases) || roundPurchases.length === 0) return false;

    const userKey = [...nums].sort((a, b) => a - b).join(',');

    for (const receipt of roundPurchases) {
        if (!receipt || !Array.isArray(receipt.combos)) continue;
        for (const combo of receipt.combos) {
            const cNums = getComboNumbers(combo);
            if (Array.isArray(cNums) && cNums.length === 6) {
                const cKey = [...cNums].sort((a, b) => a - b).join(',');
                if (cKey === userKey) {
                    return true;
                }
            }
        }
    }
    return false;
}

export async function renderTop5Combinations(isRollingAnimation = false) {
    try {
        const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
        const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
        const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;

        if (typeof render7AlgorithmsRealReviewSection === 'function') {
            render7AlgorithmsRealReviewSection();
        }

        // Ensure user list is loaded for admin dropdown
        if (isAdmin && (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0) && window.db) {
            try {
                const uSnap = await window.db.collection('lotto_users').get();
                state.allRegisteredUsersList = [];
                uSnap.forEach(d => {
                    const uId = d.id.trim().toLowerCase();
                    if (uId.startsWith('{') || uId.startsWith('test_') || uId === 'user_alpha' || uId === 'user_beta' || uId === 'pjg' || uId === 'sample' || uId === 'hms') return;
                    const uData = d.data() || {};
                    if (uData.isDeleted === true || uData.status === 'trash' || uData.status === 'deleted') return;
                    const isPerm = !!(uData.isPermanent === true || uData.isPermanent === 'true' || uData.userType === 'permanent' || uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin');
                    if (typeof window !== 'undefined' && typeof window.setIsPermanentCache === 'function') {
                        window.setIsPermanentCache(d.id, isPerm);
                    }
                    state.allRegisteredUsersList.push({
                        id: d.id,
                        name: uData.realName || d.id,
                        realName: uData.realName || d.id,
                        phone: uData.phoneNumber || '',
                        isAdmin: !!(uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin'),
                        isPermanent: isPerm,
                        userType: uData.userType || (isPerm ? 'permanent' : 'regular'),
                        createdAt: uData.createdAt || null
                    });
                });
            } catch(e) {}
        }

        // Admin User Selector Injection for Generator View
        const adminBarContainer = document.getElementById('generatorAdminUserBarContainer') || (() => {
            const existing = document.getElementById('generatorAdminUserBarContainer');
            if (existing) return existing;
            const heroBanner = document.querySelector('.generator-hero') || document.querySelector('.hero-banner') || document.getElementById('combinationsContainer')?.parentElement;
            if (heroBanner && isAdmin) {
                const bar = document.createElement('div');
                bar.id = 'generatorAdminUserBarContainer';
                bar.style.marginBottom = '12px';
                heroBanner.parentElement.insertBefore(bar, heroBanner);
                return bar;
            }
            return null;
        })();

        if (isAdmin && adminBarContainer) {
            const userList = state.allRegisteredUsersList || [];
            let userOptions = `<option value="${authId}" ${effectiveUserId === authId ? 'selected' : ''}>👑 관리자 본인 (${authId})</option>`;
            userList.forEach(u => {
                if (u.id !== authId) {
                    userOptions += `<option value="${u.id}" ${effectiveUserId === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name}${u.phone ? ` / ${u.phone}` : ''})</option>`;
                }
            });

            adminBarContainer.innerHTML = `
                <div class="generator-admin-bar" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 10px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 220px;">
                        <i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 1.1rem; flex-shrink: 0;"></i>
                        <div style="min-width: 0;">
                            <strong style="color: #fbbf24; font-size: 0.84rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">[관리자 전용] 회원별 AI 추천번호 실시간 확인</strong>
                            <div style="font-size: 0.72rem; color: #cbd5e1; word-break: break-all;">선택한 회원(<span style="color:#38bdf8; font-weight:700;">${effectiveUserId}</span>)에게 배정된 고유 AI 추천 조합 확인</div>
                        </div>
                    </div>
                    <div class="generator-admin-select-wrapper" style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; max-width: 100%; box-sizing: border-box;">
                        <label for="generatorAdminUserSelect" style="font-size: 0.78rem; color: #fbbf24; font-weight: 700; white-space: nowrap; flex-shrink: 0;">회원 선택:</label>
                        <select id="generatorAdminUserSelect" onchange="window.changeGeneratorAdminViewingUser && window.changeGeneratorAdminViewingUser(this.value)" style="background: #0f172a; border: 1px solid #f59e0b; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; outline: none; max-width: 100%; min-width: 0; flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; box-sizing: border-box;">
                            ${userOptions}
                        </select>
                    </div>
                </div>
            `;
        }

        const container = document.getElementById('combinationsContainer');
        if (!container) return;
        container.innerHTML = `
            <!-- 📱 스마트폰/반응형 최적화: 10조합 컴팩트 뷰 & 전체 토글 툴바 -->
            <div class="combo-view-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 8px 14px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.78rem; color: #cbd5e1; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-mobile-screen-button" style="color: #38bdf8;"></i>
                    <span>스마트폰 최적화: <strong>컴팩트 요약 뷰 적용 중</strong></span>
                    <span style="font-size: 0.68rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">스크롤 75% 압축</span>
                </span>
                <button type="button" id="btnToggleAllComboDetails" style="background: rgba(251, 191, 36, 0.12); border: 1px solid rgba(251, 191, 36, 0.4); color: #fbbf24; font-size: 0.74rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s ease;">
                    <i class="fa-solid fa-layer-group"></i> <span id="lblToggleAllText">전체 10게임 상세 펼치기</span>
                </button>
            </div>
        `;

        state.comboChartInstances.forEach(c => c.destroy());
        state.comboChartInstances = [];

        const comboCount = getSelectedComboCountOption();
        const el_heroComboCountText = document.getElementById('heroComboCountText');
        if (el_heroComboCountText) el_heroComboCountText.textContent = `${comboCount}세트`;

        const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        const isV4 = chkReportLogic ? chkReportLogic.checked : (localStorage.getItem('lotto_pref_v4') !== 'false');

        // 🛡️ 포렌식 다이내믹 워터마크 (화면 캡처 유출 시 배정자 즉시 추적)
        const watermarkEl = document.createElement('div');
        watermarkEl.className = 'forensic-watermark-layer';
        watermarkEl.setAttribute('aria-hidden', 'true');
        watermarkEl.innerHTML = Array(16).fill(0).map(() => `
            <div class="forensic-watermark-item">
                <span>LUCKY777 · ${effectiveUserId.toUpperCase()} · 제${curUpcomingRound}회 · 보안배정</span>
            </div>
        `).join('');
        container.appendChild(watermarkEl);

        let allCombos;
        if (isV4) {
            allCombos = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v4', true, effectiveUserId);
        } else {
            allCombos = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v3', true, effectiveUserId);
        }

        // 🔒 차기 회차에 대해 사용자별 7대 알고리즘 영구 불변 스냅샷 자동 생성/보존 (Write-Once)
        if (typeof saveUserWeeklyRecommendationSnapshot === 'function') {
            saveUserWeeklyRecommendationSnapshot(effectiveUserId, curUpcomingRound).catch(e => console.warn('[Auto Snapshot Error]', e));
        }

        state.fixedTop5Combinations = allCombos;
        const activeCombinations = allCombos.slice(0, comboCount);

        activeCombinations.forEach((comboObj, index) => {
            const strat = comboObj.meta;
            const numbers = comboObj.numbers;
            const stats = comboObj.stats || { evScore: 70, oddEvenRatio: '3:3', sum: 135, highCount: 0, neighborCount: 0 };
            const winData = getEnsembleWinningHistory(comboObj, index);
            const isPurchased = isComboPurchasedInConfirmedLedger(numbers, curUpcomingRound);

            const cardEl = document.createElement('div');
            cardEl.className = 'combo-card';
            if (isPurchased) {
                cardEl.style.borderColor = 'rgba(16, 185, 129, 0.6)';
                cardEl.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.15)';
            }

            const isSaved = state.savedCombinations.some(s => s.numbers.join(',') === numbers.join(','));

            const purchasedBadgeHtml = isPurchased ? `
                <span class="badge-purchased-tag" style="background: rgba(16, 185, 129, 0.2); border: 1.5px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 2px 7px; border-radius: 6px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(16, 185, 129, 0.35); vertical-align: middle;">
                    <i class="fa-solid fa-circle-check"></i> 구매
                </span>
            ` : '';

            // Build winning history badge & panel HTML
            let winHistoryHtml = '';
            if (winData.hasWins) {
                const rankPills = Object.entries(winData.rankCounts)
                    .filter(([_, cnt]) => cnt > 0)
                    .map(([r, cnt]) => {
                        const color = r === '1' ? '#fbbf24' : r === '2' ? '#60a5fa' : r === '3' ? '#fb923c' : r === '4' ? '#4ade80' : '#cbd5e1';
                        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.08);border:1px solid ${color};color:${color};font-size:0.75rem;font-weight:700;">${r}등: ${cnt}회</span>`;
                    }).join('');

                const recentWinsStr = winData.winningHistory.slice(0, 3)
                    .map(w => `<strong style="color:#fbbf24;">${w.round}회(${w.rankLabel})</strong>`)
                    .join(', ');

                winHistoryHtml = `
                    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(16, 185, 129, 0.06) 100%); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 10px 14px; margin-top: 10px; display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 800; color: #fbbf24;">
                                <i class="fa-solid fa-trophy"></i>
                                <span>실구매 검증 당첨 이력</span>
                                <span style="font-size: 0.72rem; padding: 1px 6px; border-radius: 10px; background: rgba(245,158,11,0.25); color: #fef08a;">최고 ${winData.topRank}등</span>
                            </div>
                            <div style="font-size: 0.8rem; font-weight: 800; color: #34d399;">
                                누적 당첨금: +${winData.totalPrize.toLocaleString()}원
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 0.76rem; color: #cbd5e1;">
                            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                                ${rankPills}
                            </div>
                            <div style="color: #94a3b8;">
                                최근 당첨: ${recentWinsStr}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                winHistoryHtml = `
                    <div style="background: rgba(0, 0, 0, 0.25); border: 1px dashed rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 6px 12px; margin-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: #94a3b8;">
                        <span><i class="fa-solid fa-chart-pie" style="color: #60a5fa;"></i> 실구매 분석 데이터: <strong>${winData.totalPurchasedRounds > 0 ? `누적 ${winData.totalPurchasedRounds}회차 추적` : '이번 회차 신규 포트폴리오'}</strong></span>
                        <span style="color: #cbd5e1;">🎯 1~3등 당첨 타겟</span>
                    </div>
                `;
            }

            cardEl.innerHTML = `
                <!-- 📱 모바일 컴팩트 요약 행 (기본 보임 → 클릭 시 상세 펼침) -->
                <div class="combo-compact-row" data-index="${index}">
                    <div class="combo-compact-left">
                        <span class="combo-compact-num">#${index + 1}</span>
                        <div class="combo-compact-balls">
                            ${numbers.map(n => `<div class="lotto-ball lotto-ball-xs ${getBallColorClass(n)}">${n}</div>`).join('')}
                        </div>
                        ${isPurchased ? `<span class="combo-compact-purchased"><i class="fa-solid fa-circle-check"></i></span>` : ''}
                    </div>
                    <div class="combo-compact-right">
                        <span class="combo-compact-name">${strat.name}</span>
                        <i class="fa-solid fa-chevron-down combo-expand-arrow"></i>
                    </div>
                </div>
                <!-- 📂 상세 내용 (모바일 기본 접힘 / 데스크탑 항상 보임) -->
                <div class="combo-detail-section">
                <div class="combo-header">
                    <div class="combo-title-group">
                        <span class="rank-badge ${strat.rankClass}">${strat.rankBadge}</span>
                        <div class="combo-title-text-wrap">
                            <div class="combo-name">
                                <span class="combo-name-title">${strat.name}</span>
                                <span class="chart-tag">${strat.tag}</span>
                                ${purchasedBadgeHtml}
                            </div>
                            <div class="combo-desc">${strat.desc}</div>
                        </div>
                    </div>
                    <div class="combo-actions">
                        <button class="btn-icon btn-save ${isSaved ? 'saved-active' : ''}" title="보관함 저장" data-index="${index}">
                            <i class="fa-solid fa-bookmark"></i>
                        </button>
                    </div>
                </div>

                <div class="combo-body">
                    <div class="balls-row">
                        ${numbers.map(n => `
                            <div class="lotto-ball ${getBallColorClass(n)} ${isRollingAnimation ? 'ball-rolling' : ''}">${n}</div>
                        `).join('')}
                    </div>
                    <div class="combo-stats">
                        <div class="stat-pill"><i class="fa-solid fa-scale-unbalanced-flip"></i> 홀짝 <strong>${stats.oddEvenRatio}</strong></div>
                        <div class="stat-pill"><i class="fa-solid fa-calculator"></i> 번호합 <strong>${stats.sum}</strong></div>
                        <div class="stat-pill"><i class="fa-solid fa-arrow-up-1-9"></i> 고번대 <strong>${stats.highCount}개</strong></div>
                        <div class="stat-pill"><i class="fa-solid fa-code-compare"></i> 이웃수(±1) <strong>${stats.neighborCount}개</strong></div>
                        <div class="stat-pill ev-score"><i class="fa-solid fa-shield-halved"></i> EV지수 <strong>${stats.evScore}점</strong></div>
                    </div>
                    ${winHistoryHtml}
                </div>

                <!-- 📱 모바일 사용성 극대화: 상세 퀀트 분석 & 차트 토글 버튼 -->
                <button type="button" class="btn-toggle-combo-details" data-index="${index}" style="width: 100%; margin-top: 10px; padding: 8px 12px; background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.18); border-radius: 8px; color: #cbd5e1; font-size: 0.76rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s ease;">
                    <span style="display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-chart-pie" style="color: #fbbf24;"></i>
                        <span>상세 퀀트 분석 &amp; 레이더 차트</span>
                    </span>
                    <span class="toggle-status" style="font-size: 0.72rem; color: #94a3b8; display: inline-flex; align-items: center; gap: 5px;">
                        <span class="lbl-toggle">상세 분석 보기</span>
                        <i class="fa-solid fa-chevron-down toggle-arrow" style="transition: transform 0.25s ease;"></i>
                    </span>
                </button>

                <!-- 📂 접이식 상세 퀀트 분석 서랍 (기본 접힘: 스마트폰 스크롤 75% 압축) -->
                <div class="combo-deep-details-drawer" id="comboDeepDetails-${index}" style="display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(255,255,255,0.1);">
                    <!-- EV Metric Panel -->
                    <div class="ev-metric-panel">
                        <div class="ev-panel-header">
                            <div class="ev-main-badge"><i class="fa-solid fa-chart-line-up"></i> 산정 기대가치 (EV Index): <strong>${stats.evScore}점</strong> / 100점</div>
                            <div class="ev-payout-badge"><i class="fa-solid fa-wave-square"></i> 이항 모멘텀 지수: <strong>${stats.binomialWaveIndex}pt</strong> | 독점 수령: <strong>${stats.payoutMultiplier}배</strong></div>
                        </div>
                        <div class="ev-breakdown-row">
                            <div class="ev-bar-item">
                                <span class="ev-bar-label">통계적 출현 수렴도</span>
                                <div class="ev-bar-track"><div class="ev-bar-fill" style="width: ${(stats.probBalanceScore / 50 * 100).toFixed(0)}%;"></div></div>
                                <span class="ev-bar-val">${stats.probBalanceScore} / 50pt</span>
                            </div>
                            <div class="ev-bar-item">
                                <span class="ev-bar-label">인지편향 회피 (독점율)</span>
                                <div class="ev-bar-track"><div class="ev-bar-fill gold-fill" style="width: ${(stats.biasAvoidanceScore / 50 * 100).toFixed(0)}%;"></div></div>
                                <span class="ev-bar-val">${stats.biasAvoidanceScore} / 50pt</span>
                            </div>
                        </div>
                    </div>

                    <!-- Visual Recommendation Charts Box -->
                    <div class="combo-visual-chart-box">
                        <div class="chart-box-header" data-index="${index}">
                            <span><i class="fa-solid fa-chart-pie"></i> <strong>추출 번호별 누적 출현 빈도 &amp; 레이더 평가 차트</strong></span>
                            <button class="btn-chart-toggle"><i class="fa-solid fa-chevron-down"></i> Visual Graph</button>
                        </div>
                        <div class="chart-box-content" id="comboChartContent-${index}">
                            <div class="combo-charts-layout">
                                <div class="combo-chart-item">
                                    <span class="mini-chart-title">번호별 역대 출현 횟수 비교 (1100회+ 전수)</span>
                                    <div class="mini-chart-wrapper">
                                        <canvas id="comboBarChart-${index}"></canvas>
                                    </div>
                                </div>
                                <div class="combo-chart-item">
                                    <span class="mini-chart-title">5대 통계 평가 요소 레이더 (Radar)</span>
                                    <div class="mini-chart-wrapper">
                                        <canvas id="comboRadarChart-${index}"></canvas>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Detailed Probabilistic Rationale Box with Per-Number Reasons -->
                    <div class="rationale-box">
                        <div class="rationale-header" data-index="${index}">
                            <div class="rationale-title">
                                <i class="fa-solid fa-square-root-variable"></i>
                                <span>역대 1~1,234회 전수 분석 확률적 추천 이유 (상세)</span>
                                <span class="law-tag">${strat.lawName}</span>
                            </div>
                            <button class="rationale-toggle-btn"><i class="fa-solid fa-chevron-down"></i></button>
                        </div>
                        <div class="rationale-content" id="rationaleContent-${index}">
                            <p class="rationale-text"><i class="fa-solid fa-circle-info"></i> ${strat.probRationale}</p>
                            
                            <div style="margin: 8px 0; padding-left: 4px;">
                                <strong style="font-size:0.78rem; color:var(--primary-light);"><i class="fa-solid fa-list-check"></i> 번호별 상세 추출 근거:</strong>
                                <ul style="list-style:none; padding: 4px 0 0 10px; font-size:0.75rem; color:var(--text-secondary); line-height:1.6;">
                                    ${(strat.numReasons || ['과거 당첨 패턴 및 통계 기반 하이브리드 추출']).map(r => `<li>• ${r}</li>`).join('')}
                                </ul>
                            </div>

                            <div class="rationale-benefit">
                                <i class="fa-solid fa-bullseye"></i> <strong>기대 목표:</strong> ${strat.targetBenefit}
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            `;
            container.appendChild(cardEl);
        });

        if (isRollingAnimation) {
            setTimeout(() => {
                document.querySelectorAll('.lotto-ball').forEach(b => b.classList.remove('ball-rolling'));
            }, 600);
        }

        attachCardEvents();
        renderAllComboCharts(activeCombinations);
        renderExtraAddonPacksSection();
        updateTop7AlgoUI();

    } catch (err) {
        console.error('Error in renderTop5Combinations:', err);
    }
}

/**
 * 📊 Render single combo chart on-demand when expanded (Optimizes performance & mobile responsiveness)
 */
export function renderSingleComboChart(index, comboObj) {
    if (typeof window.Chart !== 'function' || !comboObj) return;
    try {
        const barCtx = document.getElementById(`comboBarChart-${index}`);
        const radarCtx = document.getElementById(`comboRadarChart-${index}`);
        if (!barCtx || !radarCtx || typeof barCtx.getContext !== 'function' || typeof radarCtx.getContext !== 'function') return;

        const numbers = comboObj.numbers || [];
        const stats = comboObj.stats || { evScore: 70, oddEvenRatio: '3:3', totalSum: 135, patternCount: 0 };

        // Check if chart instance already exists
        const existingBar = Chart.getChart(barCtx);
        if (existingBar) {
            existingBar.resize();
        } else {
            const barChart = new window.Chart(barCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: numbers.map(n => `${n}번`),
                    datasets: [{
                        label: '출현 횟수',
                        data: numbers.map(n => state.HISTORICAL_FREQUENCY[n] || 135),
                        backgroundColor: numbers.map(n => getBallHexColor(n)),
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                        y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                    }
                }
            });
            state.comboChartInstances.push(barChart);
        }

        const existingRadar = Chart.getChart(radarCtx);
        if (existingRadar) {
            existingRadar.resize();
        } else {
            const radarChart = new window.Chart(radarCtx.getContext('2d'), {
                type: 'radar',
                data: {
                    labels: ['빈도 모멘텀', '미출현 반등력', '고번대 독점', '구간 분산도', '홀짝 밸런스'],
                    datasets: [{
                        label: comboObj.name || `조합 #${index+1}`,
                        data: [
                            stats.freqIndex || 70,
                            stats.overdueIndex || 70,
                            Math.min(95, (stats.highCount || 3) * 28),
                            Math.min(95, (stats.sectionCount || 4) * 22),
                            (stats.probBalanceScore || 40) * 1.8
                        ],
                        backgroundColor: 'rgba(99, 102, 241, 0.25)',
                        borderColor: '#818cf8',
                        pointBackgroundColor: '#6366f1',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        r: {
                            angleLines: { color: 'rgba(255,255,255,0.08)' },
                            grid: { color: 'rgba(255,255,255,0.08)' },
                            pointLabels: { color: '#cbd5e1', font: { size: 10 } },
                            ticks: { display: false, max: 100 }
                        }
                    }
                }
            });
            state.comboChartInstances.push(radarChart);
        }
    } catch(err) {
        console.warn('[renderSingleComboChart Warning]', err.message);
    }
}

export function renderAllComboCharts(activeCombinations) {
    // Left empty for lazy on-demand rendering when user clicks [상세 분석 펼치기]
    // Dramatically speeds up mobile page load and saves device battery!
}

export function attachCardEvents() {
    // 📱 모바일 컴팩트 행 클릭 → 카드 펼치기/접기
    document.querySelectorAll('.combo-compact-row').forEach(row => {
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = row.closest('.combo-card');
            if (!card) return;
            const isExpanded = card.classList.contains('combo-card-expanded');
            if (isExpanded) {
                card.classList.remove('combo-card-expanded');
                const arrow = row.querySelector('.combo-expand-arrow');
                if (arrow) arrow.style.transform = 'rotate(0deg)';
            } else {
                card.classList.add('combo-card-expanded');
                const arrow = row.querySelector('.combo-expand-arrow');
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                // 차트도 지연 렌더
                const idx = parseInt(row.dataset.index);
                const combos = state.fixedTop5Combinations || [];
                if (combos[idx]) {
                    setTimeout(() => renderSingleComboChart(idx, combos[idx]), 40);
                }
            }
        });
    });

    // 📱 Individual Card Collapsible Details Toggle
    document.querySelectorAll('.btn-toggle-combo-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            const drawer = document.getElementById(`comboDeepDetails-${idx}`);
            const lbl = btn.querySelector('.lbl-toggle');
            const arrow = btn.querySelector('.toggle-arrow');
            if (!drawer) return;

            const isCurrentlyHidden = (drawer.style.display === 'none' || !drawer.style.display);
            if (isCurrentlyHidden) {
                drawer.style.display = 'block';
                if (lbl) lbl.textContent = '상세 분석 접기';
                if (arrow) arrow.style.transform = 'rotate(180deg)';
                btn.style.background = 'rgba(251, 191, 36, 0.08)';
                btn.style.borderColor = 'rgba(251, 191, 36, 0.4)';

                const combos = state.fixedTop5Combinations || [];
                if (combos[idx]) {
                    setTimeout(() => renderSingleComboChart(idx, combos[idx]), 30);
                }
            } else {
                drawer.style.display = 'none';
                if (lbl) lbl.textContent = '상세 분석 보기';
                if (arrow) arrow.style.transform = 'rotate(0deg)';
                btn.style.background = 'rgba(255, 255, 255, 0.03)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.18)';
            }
        });
    });

    // ⚡ Master Toggle All Combinations Details (전체 10게임 펼치기/접기)
    const btnToggleAll = document.getElementById('btnToggleAllComboDetails');
    if (btnToggleAll) {
        btnToggleAll.onclick = function() {
            const allDrawers = document.querySelectorAll('.combo-deep-details-drawer');
            const allBtns = document.querySelectorAll('.btn-toggle-combo-details');
            const allCards = document.querySelectorAll('#combinationsContainer .combo-card');
            const lblAll = document.getElementById('lblToggleAllText');
            if (allDrawers.length === 0 && allCards.length === 0) return;

            // 모바일: 컴팩트 카드 확장 상태 기준으로 판단
            const isMobile = window.innerWidth <= 768;
            let hasClosed;
            if (isMobile) {
                hasClosed = Array.from(allCards).some(c => !c.classList.contains('combo-card-expanded'));
            } else {
                hasClosed = Array.from(allDrawers).some(d => d.style.display === 'none' || !d.style.display);
            }
            const targetState = hasClosed ? 'block' : 'none';

            // 모바일: 컴팩트 카드 expand/collapse
            if (isMobile) {
                allCards.forEach((card, cIdx) => {
                    const row = card.querySelector('.combo-compact-row');
                    const arrow = row ? row.querySelector('.combo-expand-arrow') : null;
                    if (targetState === 'block') {
                        card.classList.add('combo-card-expanded');
                        if (arrow) arrow.style.transform = 'rotate(180deg)';
                    } else {
                        card.classList.remove('combo-card-expanded');
                        if (arrow) arrow.style.transform = 'rotate(0deg)';
                    }
                });
            }

            allDrawers.forEach((drawer, dIdx) => {
                drawer.style.display = targetState;
                const btn = allBtns[dIdx];
                if (btn) {
                    const lbl = btn.querySelector('.lbl-toggle');
                    const arrow = btn.querySelector('.toggle-arrow');
                    if (targetState === 'block') {
                        if (lbl) lbl.textContent = '상세 분석 접기';
                        if (arrow) arrow.style.transform = 'rotate(180deg)';
                        btn.style.background = 'rgba(251, 191, 36, 0.08)';
                        btn.style.borderColor = 'rgba(251, 191, 36, 0.4)';
                    } else {
                        if (lbl) lbl.textContent = '상세 분석 보기';
                        if (arrow) arrow.style.transform = 'rotate(0deg)';
                        btn.style.background = 'rgba(255, 255, 255, 0.03)';
                        btn.style.borderColor = 'rgba(255, 255, 255, 0.18)';
                    }
                }
            });

            if (lblAll) {
                lblAll.textContent = targetState === 'block' ? '전체 10게임 상세 접기' : '전체 10게임 상세 펼치기';
            }

            if (targetState === 'block') {
                const combos = state.fixedTop5Combinations || [];
                setTimeout(() => {
                    combos.forEach((c, idx) => renderSingleComboChart(idx, c));
                }, 40);
            }
        };
    }

    document.querySelectorAll('.chart-box-header').forEach(header => {
        header.addEventListener('click', () => {
            const idx = header.dataset.index;
            const content = document.getElementById(`comboChartContent-${idx}`);
            const icon = header.querySelector('.btn-chart-toggle i');

            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                icon.style.transform = 'rotate(0deg)';
            } else {
                content.classList.add('expanded');
                icon.style.transform = 'rotate(180deg)';
            }
        });
    });

    document.querySelectorAll('.rationale-header').forEach(header => {
        header.addEventListener('click', () => {
            const idx = header.dataset.index;
            const content = document.getElementById(`rationaleContent-${idx}`);
            const icon = header.querySelector('.rationale-toggle-btn i');

            if (content.classList.contains('expanded')) {
                content.classList.remove('expanded');
                icon.style.transform = 'rotate(0deg)';
            } else {
                content.classList.add('expanded');
                icon.style.transform = 'rotate(180deg)';
            }
        });
    });

    document.querySelectorAll('.btn-save').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const combo = state.fixedTop5Combinations[index];

            if (!combo) return;

            const existsIndex = state.savedCombinations.findIndex(s => s.numbers.join(',') === combo.numbers.join(','));
            if (existsIndex >= 0) {
                state.savedCombinations.splice(existsIndex, 1);
                btn.classList.remove('saved-active');
                showToast('보관함에서 제거되었습니다.');
            } else {
                state.savedCombinations.push({
                    ...combo,
                    date: new Date().toLocaleDateString()
                });
                btn.classList.add('saved-active');
                showToast('보관함에 저장되었습니다.');
            }
            if (db) {
                const savedUserKey = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest';
                db.collection('lotto_saved_combinations').doc(savedUserKey).set({ combos: state.savedCombinations }).catch(console.error);
            }
            updateSavedCount();
            renderSavedList();
        });
    });
}

export function updateSavedCount() {
    const el_savedCount = document.getElementById('savedCount');
    if (el_savedCount) el_savedCount.textContent = state.savedCombinations.length;
}

export function renderSavedList() {
    const container = document.getElementById('savedListContainer');
    if (!container) return;
    if (state.savedCombinations.length === 0) {
        container.innerHTML = `
            <div class="empty-saved">
                <i class="fa-regular fa-bookmark"></i>
                <p>아직 보관한 추천 조합이 없습니다.</p>
            </div>
        `;
        return;
    }

    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    container.innerHTML = state.savedCombinations.map((item, idx) => {
        const nums = getComboNumbers(item);
        const oddEven = item.stats && item.stats.oddEvenRatio ? item.stats.oddEvenRatio : '-';
        const sumVal = item.stats && item.stats.sum ? item.stats.sum : '-';
        const isPurchased = isComboPurchasedInConfirmedLedger(nums, curUpcomingRound);
        const purchasedBadgeHtml = isPurchased ? `
            <span class="badge-purchased-tag" style="background: rgba(16, 185, 129, 0.2); border: 1.5px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 2px 7px; border-radius: 6px; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px rgba(16, 185, 129, 0.35); vertical-align: middle;">
                <i class="fa-solid fa-circle-check"></i> 구매
            </span>
        ` : '';
        return `
        <div class="combo-card" style="${isPurchased ? 'border-color: rgba(16, 185, 129, 0.6); box-shadow: 0 0 15px rgba(16, 185, 129, 0.15);' : ''}">
            <div class="combo-header">
                <div class="combo-title-group">
                    <span class="rank-badge top-1-badge">${item.id || 'TOP'}</span>
                    <div>
                        <div class="combo-name">
                            ${item.name || '추천 조합'}
                            ${purchasedBadgeHtml}
                        </div>
                        <div class="combo-desc">저장일자: ${item.date || '-'}</div>
                    </div>
                </div>
                <div class="combo-actions">
                    <button class="btn-icon danger-btn btn-delete-saved" data-idx="${idx}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="combo-body">
                <div class="balls-row">
                    ${nums.map(n => `
                        <div class="lotto-ball ${getBallColorClass(n)}">${n}</div>
                    `).join('')}
                </div>
                <div class="combo-stats">
                    <div class="stat-pill">홀짝 <strong>${oddEven}</strong></div>
                    <div class="stat-pill">번호합 <strong>${sumVal}</strong></div>
                    <div class="stat-pill ev-score">EV지수 <strong>${item.stats && item.stats.evScore !== undefined ? item.stats.evScore : '-'}점</strong></div>
                </div>
            </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.btn-delete-saved').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            state.savedCombinations.splice(idx, 1);
            if (db) {
                const savedUserKey = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest';
                db.collection('lotto_saved_combinations').doc(savedUserKey).set({ combos: state.savedCombinations }).catch(console.error);
            }
            updateSavedCount();
            renderSavedList();
            showToast('조합이 삭제되었습니다.');
        });
    });
}

export function setupGeneratorTabEvents() {
    const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
    if (chkReportLogic) {
        const savedPref = localStorage.getItem('lotto_pref_v4');
        if (savedPref !== null) {
            chkReportLogic.checked = (savedPref === 'true');
        }

        chkReportLogic.onchange = function() {
            const isV4 = chkReportLogic.checked;
            localStorage.setItem('lotto_pref_v4', isV4 ? 'true' : 'false');
            
            const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
            if (isV4) {
                if (!state.fixedTop5Combinations_v4 || state.fixedTop5Combinations_v4.length === 0) {
                    state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4');
                }
                state.fixedTop5Combinations = state.fixedTop5Combinations_v4;
            } else {
                if (!state.fixedTop5Combinations_v3 || state.fixedTop5Combinations_v3.length === 0) {
                    state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3');
                }
                state.fixedTop5Combinations = state.fixedTop5Combinations_v3;
            }

            try {
                if (typeof saveGlobalState === 'function') {
                    saveGlobalState();
                }
            } catch (e) {}

            renderTop5Combinations(false);
            updateSavedCount();
            renderSavedList();
            showToast(isV4 ? '🧠 [V4.0 행동경제학 포트폴리오] 10게임이 적용되었습니다.' : '⚡ [V3.0 하이브리드 알고리즘] 10게임이 적용되었습니다.');
        };
    }

    const btnGenerateAll = document.getElementById('btnGenerateAll');
    if (btnGenerateAll) {
        btnGenerateAll.addEventListener('click', () => {
            const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
            const isV4 = chkReportLogic ? chkReportLogic.checked : true;
            const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
            
            // Force recalculate both v3 and v4 distinctly and explicitly
            state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3');
            state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4');
            state.fixedTop5Combinations = isV4 ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3;
            
            try {
                if (typeof saveGlobalState === 'function') {
                    saveGlobalState();
                }
            } catch (e) {}
            
            renderTop5Combinations(true);
            showToast('이번 주 추천 번호 10게임이 새롭게 생성되었습니다.');
        });
    }

    const btnConfirmPurchaseHero = document.getElementById('btnConfirmPurchaseHero');
    if (btnConfirmPurchaseHero) {
        btnConfirmPurchaseHero.addEventListener('click', async () => {
            const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
            const useV4 = chkReportLogic ? chkReportLogic.checked : false;
            const versionStr = useV4 ? 'V4.0 행동경제학 알고리즘' : 'V3.0 하이브리드 알고리즘';
            
            const currentCombos = state.fixedTop5Combinations || (useV4 ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3) || [];
            if (!currentCombos || currentCombos.length === 0) {
                alert('구매 확정할 추천 번호 조합이 없습니다. 먼저 번호를 생성해주세요.');
                return;
            }

            const nextRound = state.latestDrawData ? (state.latestDrawData.drwNo + 1) : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240);
            const gameCount = currentCombos.length;
            const receiptCount = Math.ceil(gameCount / 5);

            if (confirm(`제 ${nextRound}회차 추천 번호 ${gameCount}게임을\n5게임 영수증 ${receiptCount}장 단위로 잠금하여 서버에 안전하게 자동 저장하시겠습니까?`)) {
                await saveToLedger(nextRound, currentCombos, versionStr);
                
                if (typeof window.switchLottoTab === 'function') {
                    window.switchLottoTab('tab-confirmed-list');
                } else if (typeof window.switchTab === 'function') {
                    window.switchTab('tab-confirmed-list');
                }
            }
        });
    }

    const btnClearSaved = document.getElementById('btnClearSaved');
    if (btnClearSaved) {
        btnClearSaved.addEventListener('click', () => {
            if (confirm('보관함을 모두 초기화하시겠습니까?')) {
                state.savedCombinations = [];
                if (db) {
                    const savedUserKey = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest';
                    db.collection('lotto_saved_combinations').doc(savedUserKey).set({ combos: [] }).catch(console.error);
                }
                updateSavedCount();
                renderSavedList();
                showToast('보관함이 초기화되었습니다.');
            }
        });
    }
}



/**
 * Helper: Get active extra pack IDs for a specific user and round
 */
export function getUserActiveExtraPackIds(userId, round) {
    const effectiveUserId = (userId || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest').toLowerCase().trim();
    const curRound = round || (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240)));
    const storageKey = `lotto_extra_pack_ids_${effectiveUserId}_${curRound}`;
    
    // 1. Check in-memory state
    if (state.userExtraPacksMap && state.userExtraPacksMap[`${effectiveUserId}_${curRound}`]) {
        return state.userExtraPacksMap[`${effectiveUserId}_${curRound}`];
    }

    // 2. Check localStorage
    try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const arr = JSON.parse(saved);
            if (Array.isArray(arr)) {
                if (!state.userExtraPacksMap) state.userExtraPacksMap = {};
                state.userExtraPacksMap[`${effectiveUserId}_${curRound}`] = arr;
                return arr;
            }
        }
    } catch(e) {}

    return [];
}

/**
 * ☁️ Cloud Sync: Fetch user's active extra packs from Firestore across all devices
 */
export async function syncUserActiveExtraPacksFromCloud(userId, round) {
    const effectiveUserId = (userId || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest').toLowerCase().trim();
    const curRound = round || (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240)));
    const storageKey = `lotto_extra_pack_ids_${effectiveUserId}_${curRound}`;
    const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);

    if (!firestore || effectiveUserId === 'guest') return [];

    try {
        let cloudPacks = null;

        // 1. Primary: fetch from writable lotto_users collection
        const uDoc = await firestore.collection('lotto_users').doc(effectiveUserId).get();
        if (uDoc && uDoc.exists) {
            const ud = uDoc.data();
            if (ud && ud.activeExtraPacks && Array.isArray(ud.activeExtraPacks[curRound])) {
                cloudPacks = ud.activeExtraPacks[curRound];
            } else if (ud && ud[`extra_packs_${curRound}`] && Array.isArray(ud[`extra_packs_${curRound}`])) {
                cloudPacks = ud[`extra_packs_${curRound}`];
            }
        }

        // 2. Secondary fallback
        if (!cloudPacks) {
            try {
                const cloudDoc = await firestore.collection('lotto_user_extra_packs').doc(`${effectiveUserId}_${curRound}`).get();
                if (cloudDoc && cloudDoc.exists) {
                    const d = cloudDoc.data();
                    if (d && Array.isArray(d.packIds)) cloudPacks = d.packIds;
                }
            } catch(e) {}
        }

        if (cloudPacks && Array.isArray(cloudPacks)) {
            if (!state.userExtraPacksMap) state.userExtraPacksMap = {};
            const prevPacks = state.userExtraPacksMap[`${effectiveUserId}_${curRound}`] || [];
            state.userExtraPacksMap[`${effectiveUserId}_${curRound}`] = cloudPacks;
            try { localStorage.setItem(storageKey, JSON.stringify(cloudPacks)); } catch(e) {}

            // Re-render UI if new packs detected from cloud
            if (JSON.stringify(prevPacks) !== JSON.stringify(cloudPacks)) {
                console.log(`[Cloud Extra Packs Sync] Synced ${cloudPacks.length} packs for ${effectiveUserId} R${curRound}`);
                renderExtraAddonPacksSection();
            }
            return cloudPacks;
        }
    } catch(err) {
        console.warn('[syncUserActiveExtraPacksFromCloud Warning]', err.message);
    }
    return [];
}

/**
 * Helper: Save active extra pack IDs for a specific user and round to both Local and Cloud
 */
export async function saveUserActiveExtraPackIds(userId, round, packIds) {
    const effectiveUserId = (userId || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest').toLowerCase().trim();
    const curRound = round || (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240)));
    const storageKey = `lotto_extra_pack_ids_${effectiveUserId}_${curRound}`;
    
    if (!state.userExtraPacksMap) state.userExtraPacksMap = {};
    state.userExtraPacksMap[`${effectiveUserId}_${curRound}`] = packIds;

    try {
        localStorage.setItem(storageKey, JSON.stringify(packIds));
    } catch(e) {}

    // Cloud Persistence for seamless multi-device sync
    const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);
    if (firestore && effectiveUserId !== 'guest') {
        try {
            // 1. Primary: Save inside lotto_users profile document (100% permitted in Firestore Rules)
            const updatePayload = {
                activeExtraPacks: {
                    [curRound]: packIds
                },
                lastExtraPacksSync: new Date().toISOString()
            };
            updatePayload[`extra_packs_${curRound}`] = packIds;
            
            await firestore.collection('lotto_users').doc(effectiveUserId).set(updatePayload, { merge: true });
        } catch(err) {
            console.warn('[Cloud lotto_users profile backup]', err.message);
        }

        try {
            // 2. Secondary fallback collection
            firestore.collection('lotto_user_extra_packs').doc(`${effectiveUserId}_${curRound}`).set({
                userId: effectiveUserId,
                round: curRound,
                packIds: packIds,
                updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
        } catch(e) {}
    }
    return packIds;
}

/**
 * Helper: Get full extra packs objects for a specific user and round
 */
export function getEffectiveUserExtraPacks(userId, round) {
    const effectiveUserId = (userId || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest').toLowerCase().trim();
    const curRound = round || (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240)));
    const packIds = getUserActiveExtraPackIds(effectiveUserId, curRound);
    
    return packIds.map(pId => generateExtraAddonPack(pId, curRound, effectiveUserId));
}

/**
 * 🚀 Renders the Extra Add-on Packs Section in the Generator Tab (User-Isolated & Cloud Synced)
 */
export function renderExtraAddonPacksSection() {
    const listEl = document.getElementById('extraPacksList');
    const lblCount = document.getElementById('lblExtraPackCount');
    const headerActions = document.getElementById('extraPacksHeaderActions');
    if (!listEl) return;

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1240));

    // ☁️ Seamless Multi-Device Sync: Fetch from cloud in background once per session
    if (effectiveUserId !== 'guest' && (!state._extraPacksCloudSynced || !state._extraPacksCloudSynced[`${effectiveUserId}_${curUpcomingRound}`])) {
        if (!state._extraPacksCloudSynced) state._extraPacksCloudSynced = {};
        state._extraPacksCloudSynced[`${effectiveUserId}_${curUpcomingRound}`] = true;
        syncUserActiveExtraPacksFromCloud(effectiveUserId, curUpcomingRound);
    }

    const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
        ? window.isUserEligibleForExtraPacks(effectiveUserId)
        : true);

    if (!isEligible) {
        if (headerActions) headerActions.style.display = 'none';
        if (lblCount) lblCount.textContent = `🔒 실구매 인증 잠김 (0 / 5팩)`;
        listEl.innerHTML = `
            <div style="text-align: center; padding: 32px 20px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%); border: 1.5px solid rgba(251,191,36,0.35); border-radius: 14px; box-shadow: 0 8px 25px rgba(0,0,0,0.4);">
                <div style="width: 58px; height: 58px; margin: 0 auto 14px; border-radius: 50%; background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.5); display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid fa-lock" style="font-size: 1.6rem; color: #fbbf24;"></i>
                </div>
                <div style="font-size: 1.12rem; font-weight: 800; color: #f8fafc; margin-bottom: 6px;">
                    🔒 실구매 인증 회원 전용 [추가 5팩 50게임]
                </div>
                <p style="color: #cbd5e1; font-size: 0.84rem; line-height: 1.55; margin-bottom: 18px; max-width: 500px; margin-left: auto; margin-right: auto;">
                    기본 20게임(V4.0 + V3.0)은 상시 무료로 열람 가능하며,<br>
                    <strong style="color: #fbbf24;">추가 1~5팩(전수 커버리지, 초고배당 EV 등 50게임)</strong>은<br>
                    <strong>매주 5게임 이상 실구매 영수증(QR)을 등록하신 정회원</strong>님께 무료로 잠금 해제됩니다.
                </p>
                <button type="button" onclick="if(window.openManualLedgerModal) { window.openManualLedgerModal(); } else if(window.switchLottoTab) { window.switchLottoTab('tab-confirmed-list'); }" style="background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); color: #000; font-weight: 800; font-size: 0.88rem; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(251,191,36,0.35);">
                    <i class="fa-solid fa-qrcode"></i> 이번 주 실구매 영수증(QR) 등록하고 추가 5팩 잠금 해제
                </button>
            </div>
        `;
        return;
    }

    if (headerActions) headerActions.style.display = 'flex';

    const packs = getEffectiveUserExtraPacks(effectiveUserId, curUpcomingRound);
    const packCount = packs.length;
    const activePackIds = new Set(packs.map(p => p.packId));

    if (lblCount) {
        lblCount.textContent = `추가 ${packCount} / 5팩 (총 ${packCount * 10}게임)`;
    }

    // Update Header Pill Buttons State (추가 1 ~ 추가 5)
    const packColors = { 1: '#10b981', 2: '#f59e0b', 3: '#8b5cf6', 4: '#06b6d4', 5: '#ec4899' };
    const packNames = { 1: '추가 1 (30게임 커버리지)', 2: '추가 2 (초고배당 EV)', 3: '추가 3 (기하학 휠링)', 4: '추가 4 (마르코프&페어)', 5: '추가 5 (골든클러스터)' };

    for (let p = 1; p <= 5; p++) {
        const btn = document.getElementById(`btnQuickPack_${p}`);
        if (btn) {
            const isActive = activePackIds.has(p);
            const pColor = packColors[p];
            if (isActive) {
                btn.style.background = `${pColor}35`;
                btn.style.borderColor = pColor;
                btn.style.boxShadow = `0 0 10px ${pColor}50`;
                btn.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #fff;"></i> <span style="color: #fff;">${packNames[p]} [발급됨]</span>`;
            } else {
                btn.style.background = `${pColor}15`;
                btn.style.borderColor = `${pColor}70`;
                btn.style.boxShadow = 'none';
                btn.innerHTML = `<i class="fa-solid fa-circle-plus" style="color: ${pColor};"></i> <span>${packNames[p]}</span>`;
            }
        }
    }

    if (packCount === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 28px 16px; background: rgba(15,23,42,0.5); border: 1px dashed rgba(251,191,36,0.25); border-radius: 12px; color: #94a3b8;">
                <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 2rem; color: #fbbf24; margin-bottom: 10px; display: block;"></i>
                <div style="font-size: 0.95rem; font-weight: 800; color: #f8fafc;">[${effectiveUserId}] 회원에게 발급된 추가팩이 없습니다.</div>
                <div style="font-size: 0.8rem; margin-top: 6px; color: #94a3b8; line-height: 1.5;">
                    상단의 <strong style="color: #34d399;">[추가 1~5]</strong> 버튼 중 원하는 전략을 클릭하시거나,<br>
                    <strong style="color: #fbbf24;">[1~5 전체 생성]</strong> 버튼을 누르시면 [${effectiveUserId}] 회원 고유의 10게임 조합이 즉시 발급됩니다.
                </div>
            </div>
        `;
        return;
    }

    listEl.innerHTML = packs.map((pack) => {
        let purchasedGamesCount = 0;
        const combosHtml = pack.combos.map((combo, cIdx) => {
            const nums = combo.numbers;
            const stats = combo.stats || { evScore: 70, oddEvenRatio: '3:3', sum: 135, acValue: 7 };
            const ac = stats.acValue !== undefined ? stats.acValue : (combo.meta && combo.meta.targetBenefit && combo.meta.targetBenefit.includes('AC:') ? combo.meta.targetBenefit.split('AC:')[1].split(' ')[0] : '7+');
            const isPurchased = isComboPurchasedInConfirmedLedger(nums, curUpcomingRound);
            if (isPurchased) purchasedGamesCount++;

            const purchasedTag = isPurchased ? `
                <span class="badge-purchased-tag" style="background: rgba(16, 185, 129, 0.25); border: 1.5px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 1px 7px; border-radius: 4px; font-weight: 800; display: inline-flex; align-items: center; gap: 3px; box-shadow: 0 0 8px rgba(16, 185, 129, 0.35);">
                    <i class="fa-solid fa-circle-check"></i> 구매
                </span>
            ` : '';

            return `
                <div class="extra-combo-row" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 8px 12px; background: rgba(15, 23, 42, 0.7); border: 1px solid ${isPurchased ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255,255,255,0.06)'}; border-radius: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;">
                        <span style="font-size: 0.78rem; font-weight: 800; color: ${pack.color}; min-width: 52px; font-family: monospace;">게임 ${(cIdx + 1).toString().padStart(2, ' ')}</span>
                        <div class="balls-row" style="display: inline-flex; gap: 5px; flex-shrink: 0; flex-wrap: nowrap;">
                            ${nums.map(n => `<span class="lotto-ball ${getBallColorClass(n)}" style="width: 28px; height: 28px; line-height: 28px; font-size: 0.78rem; text-align: center; border-radius: 50%; font-weight: 700; color: #fff; background: ${getBallHexColor(n)}; flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`).join('')}
                        </div>
                        <div style="min-width: 56px; flex-shrink: 0;">
                            ${purchasedTag}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: #94a3b8; margin-left: auto;">
                        <span>합 <strong>${stats.sum}</strong></span>
                        <span>AC <strong>${ac}</strong></span>
                        <span>홀짝 <strong>${stats.oddEvenRatio}</strong></span>
                        <span style="color: ${pack.color}; font-weight: 700; font-size: 0.72rem;">${(combo.meta && combo.meta.tag) ? combo.meta.tag.split('|')[0].trim() : '퀀트 7대 필터 통과'}</span>
                    </div>
                </div>
            `;
        }).join('');

        const packPurchasedBadge = purchasedGamesCount > 0 ? `
            <span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; padding: 2px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 8px rgba(16, 185, 129, 0.25);">
                <i class="fa-solid fa-circle-check"></i> ${purchasedGamesCount === pack.combos.length ? '10게임 전수 구매완료' : `${purchasedGamesCount}게임 구매완료`}
            </span>
        ` : '';

        return `
            <div id="extra-pack-card-${pack.packId}" class="extra-pack-card" style="background: rgba(15, 23, 42, 0.85); border: 1.5px solid ${purchasedGamesCount > 0 ? 'rgba(16, 185, 129, 0.7)' : pack.color}; border-radius: 12px; padding: 16px; box-shadow: ${purchasedGamesCount > 0 ? '0 4px 20px rgba(16, 185, 129, 0.2)' : '0 4px 16px rgba(0,0,0,0.3)'}; transition: all 0.3s ease;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="background: ${pack.color}25; border: 1px solid ${pack.color}; color: ${pack.color}; padding: 3px 10px; border-radius: 20px; font-size: 0.78rem; font-weight: 800;">
                            ${pack.badge}
                        </span>
                        <h4 style="margin: 0; color: #fff; font-size: 1rem; font-weight: 800;">
                            ${pack.name} (10게임)
                        </h4>
                        ${packPurchasedBadge}
                        <span style="font-size: 0.72rem; color: #fbbf24; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700;">
                            👤 ${effectiveUserId}
                        </span>
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" onclick="window.handleRemoveSingleExtraPack && window.handleRemoveSingleExtraPack(${pack.packId})" class="btn-secondary" style="padding: 6px 10px; font-size: 0.75rem; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.15); color: #f87171; cursor: pointer;" title="이 팩 삭제">
                            <i class="fa-solid fa-xmark"></i> 삭제
                        </button>
                    </div>
                </div>

                <p style="margin: 0 0 12px 0; color: #94a3b8; font-size: 0.78rem; line-height: 1.5;">
                    💡 <strong>상호보완 설계:</strong> ${pack.desc}
                </p>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${combosHtml}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Handle Toggle or Generate a Specific Extra Pack (1 to 5) (User-Isolated)
 */
export async function handleToggleSpecificExtraPack(packId) {
    const pIdx = parseInt(packId);
    if (isNaN(pIdx) || pIdx < 1 || pIdx > 5) return;

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
        ? window.isUserEligibleForExtraPacks(effectiveUserId)
        : true);

    if (!isEligible) {
        alert('🔒 [실구매 인증 회원 전용 혜택]\n\n추가 5팩(50게임)은 매주 5게임 이상 실구매 영수증(QR)을 등록하신 회원님께 무료로 제공됩니다.\n\n이번 주 실구매 영수증을 등록하고 즉시 열람해 보세요!');
        if (typeof window.switchLottoTab === 'function') window.switchLottoTab('tab-confirmed-list');
        return;
    }

    let activePackIds = getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound);

    if (activePackIds.includes(pIdx)) {
        // Scroll smoothly to the existing card
        const cardEl = document.getElementById(`extra-pack-card-${pIdx}`);
        if (cardEl) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            cardEl.style.transform = 'scale(1.02)';
            cardEl.style.borderColor = '#fbbf24';
            setTimeout(() => {
                cardEl.style.transform = 'none';
                renderExtraAddonPacksSection();
            }, 1200);
        }
        showToast(`💡 [추가 ${pIdx}] 팩이 이미 발급되어 있습니다.`);
        return;
    }

    activePackIds.push(pIdx);
    activePackIds.sort((a, b) => a - b);
    saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, activePackIds);
    renderExtraAddonPacksSection();

    // Scroll to the newly generated card
    setTimeout(() => {
        const cardEl = document.getElementById(`extra-pack-card-${pIdx}`);
        if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    const packObj = generateExtraAddonPack(pIdx, curUpcomingRound, effectiveUserId);
    showToast(`🎉 [${effectiveUserId}] 님의 [${packObj.shortName}] 10게임 팩이 고유 발급되었습니다!`);
}

/**
 * Handle Remove Single Extra Pack (User-Isolated)
 */
export function handleRemoveSingleExtraPack(packId) {
    const pIdx = parseInt(packId);
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    let activePackIds = getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound);
    if (!activePackIds.includes(pIdx)) return;

    if (confirm(`[추가 ${pIdx}팩] 10게임을 삭제하시겠습니까?`)) {
        activePackIds = activePackIds.filter(id => id !== pIdx);
        saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, activePackIds);
        renderExtraAddonPacksSection();
        showToast(`[추가 ${pIdx}팩]이 삭제되었습니다.`);
    }
}

/**
 * Handle Generate All 5 Extra Packs at once (50 Games Total) (User-Isolated)
 */
export function handleGenerateAllExtraPacks() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
        ? window.isUserEligibleForExtraPacks(effectiveUserId)
        : true);

    if (!isEligible) {
        alert('🔒 [실구매 인증 회원 전용 혜택]\n\n추가 5팩(50게임)은 매주 5게임 이상 실구매 영수증(QR)을 등록하신 회원님께 무료로 제공됩니다.\n\n이번 주 실구매 영수증을 등록하고 즉시 열람해 보세요!');
        if (typeof window.switchLottoTab === 'function') window.switchLottoTab('tab-confirmed-list');
        return;
    }

    const allPacks = [1, 2, 3, 4, 5];
    saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, allPacks);
    renderExtraAddonPacksSection();

    showToast(`🎉 [${effectiveUserId}] 님의 추가팩 1~5 전체 (총 50게임)가 일괄 발급되었습니다!`);
}

/**
 * Handle Add Extra Booster Pack (Sequential Fallback)
 */
export async function handleAddExtraPack() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    const activePackIds = getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound);
    if (activePackIds.length >= 5) {
        alert('추가 팩은 최대 5개(총 50게임)까지 생성 가능합니다.');
        return;
    }

    const availablePacks = [1, 2, 3, 4, 5].filter(p => !activePackIds.includes(p));
    if (availablePacks.length === 0) return;

    handleToggleSpecificExtraPack(availablePacks[0]);
}

/**
 * Handle Clear All Extra Booster Packs (User-Isolated)
 */
export function handleClearExtraPacks() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    const activePackIds = getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound);
    if (activePackIds.length === 0) {
        showToast('삭제할 추가 팩이 없습니다.');
        return;
    }

    if (confirm(`[${effectiveUserId}] 회원의 모든 추가 팩을 초기화하시겠습니까?\n(기본 추천 V3.0/V4.0 번호는 전혀 영향을 받지 않습니다)`)) {
        saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, []);
        renderExtraAddonPacksSection();
        showToast('모든 추가 팩이 초기화되었습니다.');
    }
}

/**
 * Admin: Change Viewing User in Generator Tab (User-Isolated)
 */
export function changeGeneratorAdminViewingUser(userId) {
    generatorAdminViewingUser = userId;
    if (typeof window !== 'undefined') {
        window.generatorAdminViewingUser = userId;
    }
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
    
    // Recalculate deterministic recommendations for selected user
    state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v4', true, userId);
    state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v3', true, userId);
    
    renderTop5Combinations();
    renderExtraAddonPacksSection();
    render7AlgorithmsRealReviewSection();
    // If Quick View (간편보기) modal is currently open, dynamically refresh its content
    if (typeof window !== 'undefined' && typeof window.renderQuickViewContent === 'function') {
        const compactModal = document.getElementById('compactViewModal');
        if (compactModal && (compactModal.classList.contains('active') || compactModal.style.display === 'flex')) {
            window.renderQuickViewContent();
        }
    }
    showToast(`👑 [${userId}] 회원의 추천 번호 및 추가팩으로 즉시 전환되었습니다.`);
}

if (typeof window !== 'undefined') {
    window.render7AlgorithmsRealReviewSection = render7AlgorithmsRealReviewSection;
    window.compute7AlgorithmsRealStats = compute7AlgorithmsRealStats;
    window.toggleAlgoReviewMainCollapse = toggleAlgoReviewMainCollapse;
    window.toggleAlgoRealReviewAccordion = toggleAlgoRealReviewAccordion;
    window.toggleAllAlgoRealReviews = toggleAllAlgoRealReviews;
    window.renderExtraAddonPacksSection = renderExtraAddonPacksSection;
    window.handleToggleSpecificExtraPack = handleToggleSpecificExtraPack;
    window.handleRemoveSingleExtraPack = handleRemoveSingleExtraPack;
    window.handleGenerateAllExtraPacks = handleGenerateAllExtraPacks;
    window.handleAddExtraPack = handleAddExtraPack;
    window.handleClearExtraPacks = handleClearExtraPacks;
    window.changeGeneratorAdminViewingUser = changeGeneratorAdminViewingUser;
    window.getUserActiveExtraPackIds = getUserActiveExtraPackIds;
    window.getEffectiveUserExtraPacks = getEffectiveUserExtraPacks;
    window.updateTop7AlgoUI = updateTop7AlgoUI;
    window.selectGeneratorAlgo = selectGeneratorAlgo;
    window.handleGenerateAll70Games = handleGenerateAll70Games;
}




/**
 * 🎛️ Updates the Top 7 Algorithms Selection Grid and Purchase Status Banner
 */
export function updateTop7AlgoUI() {
    try {
        const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
        const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
        const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
        const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

        const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
            ? window.isUserEligibleForExtraPacks(effectiveUserId)
            : true);

        // 1. Update Weekly Purchase Status & Inducement Banner
        const statusBanner = document.getElementById('userWeeklyPurchaseStatusBanner');
        const txtStatus = document.getElementById('txtWeeklyPurchaseStatus');
        const btnStatusBanner = document.getElementById('btnWeeklyPurchaseStatusBanner');

        if (statusBanner && txtStatus) {
            if (isEligible) {
                statusBanner.className = 'purchase-status-banner verified';
                txtStatus.innerHTML = `<strong><i class="fa-solid fa-circle-check" style="color:#10b981;"></i> [제 ${curUpcomingRound}회차] 실구매 인증 완료!</strong> 7대 퀀트 알고리즘 70게임 전수 무료 이용이 활성화되어 있습니다.`;
                if (btnStatusBanner) {
                    btnStatusBanner.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                    btnStatusBanner.style.color = '#ffffff';
                    btnStatusBanner.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.35)';
                    btnStatusBanner.innerHTML = '<i class="fa-solid fa-qrcode"></i> 실구매 영수증(QR) 추가 등록';
                }
            } else {
                statusBanner.className = 'purchase-status-banner unverified';
                txtStatus.innerHTML = `<strong><i class="fa-solid fa-triangle-exclamation" style="color:#f59e0b;"></i> [제 ${curUpcomingRound}회차] 실구매 미등록</strong> 매주 5게임 이상 실구매 영수증(QR) 등록 시 7대 알고리즘(추가 50게임)이 즉시 무료 잠금 해제됩니다!`;
                if (btnStatusBanner) {
                    btnStatusBanner.style.background = 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)';
                    btnStatusBanner.style.color = '#0f172a';
                    btnStatusBanner.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.35)';
                    btnStatusBanner.innerHTML = '<i class="fa-solid fa-qrcode"></i> 실구매 영수증(5게임) 등록하고 추가 50게임 잠금해제';
                }
            }
        }

        // 2. Update Active V3 / V4 State
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        const isV4 = chkReportLogic ? chkReportLogic.checked : (localStorage.getItem('lotto_pref_v4') !== 'false');

        const cardV4 = document.getElementById('topAlgoCard_v4');
        const badgeV4 = document.getElementById('topAlgoBadge_v4');
        const cardV3 = document.getElementById('topAlgoCard_v3');
        const badgeV3 = document.getElementById('topAlgoBadge_v3');

        if (cardV4 && badgeV4) {
            if (isV4) {
                cardV4.classList.add('active');
                badgeV4.className = 'algo-status-badge active';
                badgeV4.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>선택됨 (10G)</span>';
            } else {
                cardV4.classList.remove('active');
                badgeV4.className = 'algo-status-badge';
                badgeV4.innerHTML = '<i class="fa-regular fa-circle"></i> <span>선택하기</span>';
            }
        }

        if (cardV3 && badgeV3) {
            if (!isV4) {
                cardV3.classList.add('active');
                badgeV3.className = 'algo-status-badge active';
                badgeV3.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>선택됨 (10G)</span>';
            } else {
                cardV3.classList.remove('active');
                badgeV3.className = 'algo-status-badge';
                badgeV3.innerHTML = '<i class="fa-regular fa-circle"></i> <span>선택하기</span>';
            }
        }

        // 3. Update Extra Packs 1~5 Cards State
        const activePackIds = getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound);
        const activeSet = new Set(activePackIds);

        for (let p = 1; p <= 5; p++) {
            const card = document.getElementById(`topAlgoCard_extra${p}`);
            const badge = document.getElementById(`topAlgoBadge_extra${p}`);
            if (card && badge) {
                if (!isEligible) {
                    card.classList.remove('active');
                    card.classList.add('locked');
                    badge.className = 'algo-status-badge locked';
                    badge.innerHTML = '<i class="fa-solid fa-lock"></i> <span>실구매 혜택</span>';
                } else {
                    card.classList.remove('locked');
                    if (activeSet.has(p)) {
                        card.classList.add('active');
                        badge.className = 'algo-status-badge unlocked';
                        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>발급됨 (10G)</span>';
                    } else {
                        card.classList.remove('active');
                        badge.className = 'algo-status-badge';
                        badge.innerHTML = '<i class="fa-solid fa-circle-plus"></i> <span>발급받기</span>';
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[updateTop7AlgoUI error]', e);
    }
}

/**
 * 🎛️ Select/Toggle Generator Algorithm from Top Hero Panel
 * @param {'v4'|'v3'|'extra1'|'extra2'|'extra3'|'extra4'|'extra5'} algoId
 */
export async function selectGeneratorAlgo(algoId) {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    // V4.0 Selected
    if (algoId === 'v4') {
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        if (chkReportLogic) chkReportLogic.checked = true;
        localStorage.setItem('lotto_pref_v4', 'true');
        state.fixedTop5Combinations = state.fixedTop5Combinations_v4 || computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4', true, effectiveUserId);
        renderTop5Combinations(true);
        updateTop7AlgoUI();
        showToast('🧠 V4.0 행동경제학 포트폴리오 (10게임)가 선택되었습니다.');
        return;
    }

    // V3.0 Selected
    if (algoId === 'v3') {
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        if (chkReportLogic) chkReportLogic.checked = false;
        localStorage.setItem('lotto_pref_v4', 'false');
        state.fixedTop5Combinations = state.fixedTop5Combinations_v3 || computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3', true, effectiveUserId);
        renderTop5Combinations(true);
        updateTop7AlgoUI();
        showToast('⚡ V3.0 하이브리드 알고리즘 (10게임)이 선택되었습니다.');
        return;
    }

    // Extra Packs (extra1 ~ extra5)
    if (algoId.startsWith('extra')) {
        const packNum = parseInt(algoId.replace('extra', ''));
        if (isNaN(packNum) || packNum < 1 || packNum > 5) return;

        const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
            ? window.isUserEligibleForExtraPacks(effectiveUserId)
            : true);

        if (!isEligible) {
            const wantConfirm = confirm('🔒 [실구매 인증 회원 전용 혜택]\n\n추가 1~5팩(총 50게임)은 매주 5게임 이상 실구매 영수증(QR)을 등록하신 회원님께 100% 무료로 제공됩니다.\n\n지금 실구매 영수증(QR)을 등록하고 추가 50게임을 즉시 잠금 해제하시겠습니까?');
            if (wantConfirm) {
                if (typeof window.openManualLedgerModal === 'function') {
                    window.openManualLedgerModal();
                } else if (typeof window.switchLottoTab === 'function') {
                    window.switchLottoTab('tab-confirmed-list');
                }
            }
            return;
        }

        await handleToggleSpecificExtraPack(packNum);
        updateTop7AlgoUI();
    }
}

/**
 * ⚡ Generate All 7 Algorithms (70 Games Total: V4 + V3 + Extra 1~5)
 */
export async function handleGenerateAll70Games() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const effectiveUserId = (isAdmin && generatorAdminViewingUser) ? generatorAdminViewingUser : authId;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    // 1. Force compute both V3 and V4 (20 Games)
    state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3', true, effectiveUserId);
    state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4', true, effectiveUserId);
    state.fixedTop5Combinations = state.fixedTop5Combinations_v4;

    const isEligible = isAdmin || ((typeof window.isUserEligibleForExtraPacks === 'function')
        ? window.isUserEligibleForExtraPacks(effectiveUserId)
        : true);

    if (isEligible) {
        // 2. Compute Extra 1~5 (50 Games)
        saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, [1, 2, 3, 4, 5]);
        renderTop5Combinations(true);
        renderExtraAddonPacksSection();
        updateTop7AlgoUI();
        showToast(`🎉 7대 퀀트 알고리즘 70게임(기본 20G + 추가 50G) 전수가 생성되었습니다!`);
    } else {
        renderTop5Combinations(true);
        renderExtraAddonPacksSection();
        updateTop7AlgoUI();
        const wantRegister = confirm(`⚡ 기본 20게임(V4.0 + V3.0)이 성공적으로 생성되었습니다!\n\n추가 5팩(50게임)을 잠금 해제하시려면 이번 주 5게임 실구매 영수증(QR)을 등록해주세요.\n\n실구매 영수증(QR)을 지금 등록하시겠습니까?`);
        if (wantRegister) {
            if (typeof window.openManualLedgerModal === 'function') {
                window.openManualLedgerModal();
            } else if (typeof window.switchLottoTab === 'function') {
                window.switchLottoTab('tab-confirmed-list');
            }
        }
    }
}
