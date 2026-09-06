import { PROTO_FIXTURES } from './data/mock-fixtures.js';
import { INITIAL_LEAGUE_STANDINGS } from './data/standings-data.js';

export const INITIAL_TOTO_CARRYOVER = {
    hasCarryover: true,
    targetGame: "축구토토 승무패 35회차",
    carryoverRound: "34회차 1등 전원 미적중 이월",
    carryoverCount: 1, // 1차 이월
    carryoverAmount: 1486210450, // 1,486,210,450원 (약 14.86억 원)
    estimatedTotalJackpot: 2850000000, // 약 28.5억 원
    lastScrapedAt: "2026-08-23 03:30:00",
    statusMessage: "34회차 1등 미적중으로 14억 8,621만 원이 35회차로 1차 이월되었습니다."
};

export const INITIAL_REALTIME_PIPELINE = {
    isConnected: true,
    lastSyncedAt: new Date().toISOString(),
    status: 'ONLINE', // 'ONLINE' | 'SYNCING' | 'OFFLINE'
    heartbeatCount: 0,
    dropOddsAlerts: [
        { fixtureId: 'proto-3501', match: '아스널 vs 첼시', type: 'HOME_WIN', oldOdds: 1.85, newOdds: 1.62, dropPct: -12.4, reason: '첼시 콜 팔머 결장 확정 및 스마트머니 78% 집중' },
        { fixtureId: 'proto-3505', match: '울산 HD vs 전북', type: 'HOME_WIN', oldOdds: 1.95, newOdds: 1.74, dropPct: -10.8, reason: '김판곤 감독 신임 효과 및 원정 전북 수비 불안' },
        { fixtureId: 'proto-3507', match: 'KIA vs LG', type: 'UNDER', oldOdds: 1.90, newOdds: 1.70, dropPct: -10.5, reason: '선발 네일 ERA 2.34 호투 기대치 마켓 급증' }
    ],
    liveInjuries: [
        { team: '첼시', player: '콜 팔머 (MF)', impact: '-22% 공격력 누수', status: '결장 확정' },
        { team: '레알 마드리드', player: '벨링엄 (MF)', impact: '-15% 중원 지배력', status: '경미한 부상 의심' },
        { team: '한화', player: '류현진 (SP)', impact: '+16% 선발 안정감', status: '선발 등판 확정' }
    ],
    liveScores: {
        'proto-3501': { status: 'SCHEDULED', minute: null, score: null },
        'proto-3505': { status: 'SCHEDULED', minute: null, score: null },
        'past-3401': { status: 'FINISHED', minute: '90+4', score: '2 - 0' },
        'past-3402': { status: 'FINISHED', minute: '90+2', score: '1 - 1' }
    }
};

export const totoState = {
    fixtures: [...PROTO_FIXTURES],
    standings: { ...INITIAL_LEAGUE_STANDINGS },
    activeStandingsLeague: 'epl', // 'epl' | 'laliga' | 'kleague' | 'kbo' | 'nba' | 'kbl'
    activeTab: 'recommendation', // 'recommendation' | 'schedule' | 'standings' | 'confirmed'
    activeSport: 'all', // 'all', 'soccer', 'baseball', 'basketball'
    filterOnlyEV: false,
    selectedSlip: [], // user's current interactive bet cart
    currentBetStake: 10000,
    scheduleRoundFilter: 'all', // 'all', '35', '34'
    scheduleStatusFilter: 'all', // 'all', 'SCHEDULED', 'FINISHED'
    scheduleSportFilter: 'all', // 'all', 'soccer', 'baseball', 'basketball'
    recommendationSlips: {
        safety: null,
        balanced: null,
        highYield: null
    },
    activeModalFixture: null,
    recommendationMode: 'proto', // 'proto' | 'toto'
    carryoverInfo: { ...INITIAL_TOTO_CARRYOVER },
    purchasedSlips: [], // list of confirmed purchase slips
    realtimePipeline: { ...INITIAL_REALTIME_PIPELINE }
};

export function getTotoState() {
    return totoState;
}

export function loadTotoFixtures() {
    try {
        const raw = localStorage.getItem('toto_scraped_fixtures');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length >= PROTO_FIXTURES.length) {
                totoState.fixtures = parsed;
            } else {
                // Seamlessly merge new fixtures with cached data
                const fixtureMap = new Map();
                PROTO_FIXTURES.forEach(f => fixtureMap.set(f.id, f));
                if (Array.isArray(parsed)) {
                    parsed.forEach(f => {
                        if (f && f.id) fixtureMap.set(f.id, { ...fixtureMap.get(f.id), ...f });
                    });
                }
                totoState.fixtures = Array.from(fixtureMap.values());
                localStorage.setItem('toto_scraped_fixtures', JSON.stringify(totoState.fixtures));
            }
        } else {
            totoState.fixtures = [...PROTO_FIXTURES];
        }
    } catch(e) {
        totoState.fixtures = [...PROTO_FIXTURES];
    }
    return totoState.fixtures;
}

export function getTotoCarryoverInfo() {
    return totoState.carryoverInfo || INITIAL_TOTO_CARRYOVER;
}

export function loadCarryoverData() {
    try {
        const raw = localStorage.getItem('toto_carryover_info');
        if (raw) {
            totoState.carryoverInfo = JSON.parse(raw);
        } else {
            totoState.carryoverInfo = { ...INITIAL_TOTO_CARRYOVER };
        }
    } catch(e) {
        totoState.carryoverInfo = { ...INITIAL_TOTO_CARRYOVER };
    }
}

export function setRecommendationMode(mode) {
    totoState.recommendationMode = mode;
}

export function setActiveStandingsLeague(leagueKey) {
    totoState.activeStandingsLeague = leagueKey;
}

export function loadStandingsData() {
    try {
        const raw = localStorage.getItem('toto_scraped_standings');
        totoState.standings = JSON.parse(JSON.stringify(INITIAL_LEAGUE_STANDINGS));
        if (raw) {
            const parsed = JSON.parse(raw);
            Object.keys(INITIAL_LEAGUE_STANDINGS).forEach(k => {
                if (parsed[k] && parsed[k].lastUpdated) {
                    totoState.standings[k].lastUpdated = parsed[k].lastUpdated;
                }
                if (INITIAL_LEAGUE_STANDINGS[k].seasonState !== 'PRE_SEASON' && parsed[k] && parsed[k].table) {
                    totoState.standings[k].table = parsed[k].table;
                }
            });
        }
    } catch(e) {
        totoState.standings = JSON.parse(JSON.stringify(INITIAL_LEAGUE_STANDINGS));
    }
}

export function setSelectedSlip(slip) {
    totoState.selectedSlip = slip;
}

export function clearSelectedSlip() {
    totoState.selectedSlip = [];
}

/**
 * Load Purchased Bet Slips from localStorage and Firestore
 */
export function loadPurchasedSlips() {
    try {
        const raw = localStorage.getItem('toto_actual_purchases');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                // Filter out any legacy dummy sample slips
                totoState.purchasedSlips = parsed.filter(s => s && s.id && !String(s.id).startsWith('slip-sample-'));
                if (totoState.purchasedSlips.length !== parsed.length) {
                    savePurchasedSlips();
                }
            } else {
                totoState.purchasedSlips = [];
            }
        } else {
            totoState.purchasedSlips = [];
        }
    } catch(e) {
        console.error('[Toto State] Error loading purchased slips:', e);
        totoState.purchasedSlips = [];
    }
    return totoState.purchasedSlips;
}

/**
 * Save Purchased Slips to localStorage & sync to Firestore if available
 */
export function savePurchasedSlips() {
    try {
        localStorage.setItem('toto_actual_purchases', JSON.stringify(totoState.purchasedSlips));
        
        // Sync to Firestore under lotto_auth id or master
        const authId = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('lotto_auth') : null) || 'master';
        if (typeof window !== 'undefined' && window.db) {
            window.db.collection('toto_purchases').doc(authId).set({
                purchases: totoState.purchasedSlips,
                updatedAt: new Date().toISOString()
            }).catch(err => console.warn('[Toto Firestore Sync Warning]', err));
        }
    } catch(e) {
        console.error('[Toto State] Error saving purchased slips:', e);
    }
}

/**
 * Add a New Confirmed Purchase Slip
 */
export function addPurchasedSlip(slipData) {
    const newSlip = {
        id: 'slip-' + Date.now(),
        round: slipData.round || '프로토 승부식 35회차',
        date: new Date().toISOString().replace('T', ' ').substring(0, 16),
        stake: Number(slipData.stake || 10000),
        combinedOdds: Number(slipData.combinedOdds.toFixed(2)),
        potentialPrize: Math.round(slipData.combinedOdds * Number(slipData.stake || 10000)),
        status: slipData.status || 'PENDING', // PENDING, WON, LOST
        actualPrize: slipData.actualPrize || 0,
        memo: slipData.memo || 'AI 추천 조합 구매',
        picks: slipData.picks.map(p => ({
            matchTitle: p.matchTitle,
            round: p.round,
            pickName: p.pickName,
            odds: p.odds,
            matchResult: p.matchResult || '경기 전 (결과 대기)',
            isHit: p.isHit !== undefined ? p.isHit : null
        }))
    };

    totoState.purchasedSlips.unshift(newSlip);
    savePurchasedSlips();
    return newSlip;
}

/**
 * Delete a Purchased Slip
 */
export function deletePurchasedSlip(slipId) {
    totoState.purchasedSlips = totoState.purchasedSlips.filter(s => s.id !== slipId);
    savePurchasedSlips();
}

/**
 * Settle / Simulate Bet Results
 */
export function settlePurchasedSlip(slipId, isWin = true) {
    const slip = totoState.purchasedSlips.find(s => s.id === slipId);
    if (!slip) return;

    if (isWin) {
        slip.status = 'WON';
        slip.actualPrize = slip.potentialPrize;
        slip.picks.forEach(p => {
            p.isHit = true;
            p.matchResult = '적중 완료 (예측 적중)';
        });
    } else {
        slip.status = 'LOST';
        slip.actualPrize = 0;
        slip.picks.forEach((p, idx) => {
            if (idx === slip.picks.length - 1) {
                p.isHit = false;
                p.matchResult = '이변 발생 (미적중)';
            } else {
                p.isHit = true;
                p.matchResult = '적중';
            }
        });
    }

    savePurchasedSlips();
}

/**
 * Calculate Summary Financials
 */
export function calculateTotoFinancials() {
    const slips = totoState.purchasedSlips;
    let totalInvest = 0;
    let totalPrize = 0;
    let wonCount = 0;
    let lostCount = 0;
    let pendingCount = 0;

    slips.forEach(s => {
        totalInvest += s.stake;
        if (s.status === 'WON') {
            totalPrize += s.actualPrize;
            wonCount++;
        } else if (s.status === 'LOST') {
            lostCount++;
        } else {
            pendingCount++;
        }
    });

    const netProfit = totalPrize - totalInvest;
    const settledCount = wonCount + lostCount;
    const hitRate = settledCount > 0 ? ((wonCount / settledCount) * 100).toFixed(1) : '0.0';
    const roi = totalInvest > 0 ? (((totalPrize - totalInvest) / totalInvest) * 100).toFixed(1) : '0.0';

    return {
        totalInvest,
        totalPrize,
        netProfit,
        hitRate,
        roi,
        totalCount: slips.length,
        wonCount,
        lostCount,
        pendingCount
    };
}

export function getRealtimePipeline() {
    return totoState.realtimePipeline || INITIAL_REALTIME_PIPELINE;
}

export function updatePipelineStatus(status, details = {}) {
    if (!totoState.realtimePipeline) {
        totoState.realtimePipeline = { ...INITIAL_REALTIME_PIPELINE };
    }
    totoState.realtimePipeline.status = status;
    totoState.realtimePipeline.lastSyncedAt = new Date().toISOString();
    totoState.realtimePipeline.heartbeatCount = (totoState.realtimePipeline.heartbeatCount || 0) + 1;
    if (details.dropOddsAlerts) totoState.realtimePipeline.dropOddsAlerts = details.dropOddsAlerts;
    if (details.liveScores) totoState.realtimePipeline.liveScores = details.liveScores;
    if (details.liveInjuries) totoState.realtimePipeline.liveInjuries = details.liveInjuries;
}
