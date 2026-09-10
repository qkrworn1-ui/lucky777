import { removeUndefined } from '../../shared/utils.js';
import { db } from '../../shared/db.js';

export const state = {
    allNumbers: Array.from({ length: 45 }, (_, i) => i + 1),
    lottoExtraHistory: {},
    mergedHistory: {},
    HISTORICAL_FREQUENCY: {},
    MISSING_WEEKS: {},
    PAIR_FREQUENCIES: {},
    TRANSITION_MATRIX: {},
    HISTORICAL_WINNING_SETS: new Set(),
    RECENT_BONUS_NUMBERS: [],
    HOT_GROUP: [],
    COLD_FREQ_GROUP: [],
    COLD_OVERDUE_GROUP: [],
    savedCombinations: [],
    fixedTop5Combinations: [],
    fixedTop5Combinations_v3: [],
    fixedTop5Combinations_v4: [],
    extraPacks: [], // Up to 5 additional 10-combo packs: [{ packId: 1, name: '추가 1', combos: [...] }]
    editingLedgerInfo: null,
    selectedWheelingPool: [3, 7, 12, 18, 21, 27, 34, 38, 42, 45],
    comboChartInstances: [],
    latestDrawData: null,
    PREVIOUS_DRAW: [],
    globalLedger: {},
    latestRoundNum: 0,
    nextRoundNum: 0,
    localComboCache: {},
    aiState: {
        generation: 1,
        fitnessScore: 95.0,
        hotColdRatio: '70 : 30',
        coldThreshold: 10,
        highWeight: 35
    },
    simPieChartInstance: null,
    simLineChartInstance: null,
    reviewPrizeChartInstance: null,
    reviewAlgoBarChartInstance: null,
    confirmedPrizeChartInstance: null,
    confirmedTrendChartInstance: null,
};

/**
 * Initialize LOTTO_HISTORY reference
 */
export function initHistory() {
    if (typeof LOTTO_HISTORY !== 'undefined') {
        state.mergedHistory = { ...LOTTO_HISTORY, ...state.lottoExtraHistory };
    } else {
        state.mergedHistory = { ...state.lottoExtraHistory };
    }
}

/**
 * Save global state to database
 */
export function saveGlobalState() {
    const currentRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
    db.set('lotto_app_state', 'global_state', removeUndefined({
        round: currentRound,
        aiState: state.aiState,
        fixedTop5Combinations: state.fixedTop5Combinations,
        fixedTop5Combinations_v3: state.fixedTop5Combinations_v3,
        fixedTop5Combinations_v4: state.fixedTop5Combinations_v4,
        extraPacks: state.extraPacks || [],
        updatedAt: new Date().toISOString()
    }));
    try {
        localStorage.setItem('lotto_extra_packs', JSON.stringify(state.extraPacks || []));
    } catch(e) {}
}

/**
 * Retrieve historical draw data
 * @param {number} round
 */
export function getHistoricalDrawData(round) {
    if (state.mergedHistory && state.mergedHistory[round]) {
        return {
            drwNo: round,
            drwNoDate: state.mergedHistory[round].date || '',
            numbers: state.mergedHistory[round].numbers,
            bonus: state.mergedHistory[round].bonus
        };
    }
    return null;
}

/**
 * Apply new draw data and update state
 * @param {Object} drawObj
 */
export function applyNewDrawData(drawObj) {
    state.latestDrawData = drawObj;
    state.PREVIOUS_DRAW = [...drawObj.numbers];

    drawObj.numbers.forEach(n => {
        state.HISTORICAL_FREQUENCY[n] = (state.HISTORICAL_FREQUENCY[n] || 135) + 1;
    });

    state.allNumbers.forEach(n => {
        if (drawObj.numbers.includes(n) || n === drawObj.bonus) {
            state.MISSING_WEEKS[n] = 0;
        } else {
            state.MISSING_WEEKS[n] = (state.MISSING_WEEKS[n] || 0) + 1;
        }
    });

    state.aiState.generation += 1;
    state.aiState.fitnessScore += 1.2;

    saveGlobalState();

    if (typeof recalculateGroups === 'function') recalculateGroups();
    if (typeof renderLatestDrawBanner === 'function') renderLatestDrawBanner();
    
    if (typeof computeAbsoluteTop10Combinations === 'function') {
        const newRound = drawObj.drwNo + 1;
        state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(false, newRound, 'v3');
        state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(false, newRound, 'v4');
        state.extraPacks = []; // Reset extra packs when new draw comes in (new round)
        state.fixedTop5Combinations = state.fixedTop5Combinations_v4; // Default to V4.0
    }
    saveGlobalState();

    if (typeof renderTop5Combinations === 'function') renderTop5Combinations(true);

    const tabVerifyEl2 = document.getElementById('tab-verify-evolution'); 
    if (tabVerifyEl2 && tabVerifyEl2.classList.contains('active')) {
        if (typeof renderVerificationTab === 'function') renderVerificationTab();
    }
    const tabSimEl = document.getElementById('tab-simulation'); 
    if (tabSimEl && tabSimEl.classList.contains('active')) {
        if (typeof renderSimulationTab === 'function') renderSimulationTab();
    }
    const tabDashEl = document.getElementById('tab-dashboard'); 
    if (tabDashEl && tabDashEl.classList.contains('active')) {
        if (typeof renderDashboardCharts === 'function') renderDashboardCharts();
    }
}
