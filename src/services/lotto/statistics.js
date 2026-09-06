import { state } from './state.js';

/** Recalculate all statistics from mergedHistory */
export function aggregateAllStatistics() {
    state.allNumbers.forEach(n => {
        state.HISTORICAL_FREQUENCY[n] = 0;
        state.MISSING_WEEKS[n] = 0;
        state.PAIR_FREQUENCIES[n] = {};
        state.TRANSITION_MATRIX[n] = {};
    });
    state.HISTORICAL_WINNING_SETS.clear();
    state.RECENT_BONUS_NUMBERS = [];
    
    let maxRound = 0;
    const rounds = Object.keys(state.mergedHistory).map(Number).sort((a,b) => a - b);
    let lastSeen = {};
    
    for (const r of rounds) {
        const data = state.mergedHistory[r];
        if (!data || !data.numbers || !Array.isArray(data.numbers)) continue;
        if (r > maxRound) maxRound = r;
        state.HISTORICAL_WINNING_SETS.add(data.numbers.join(','));
        if (data.bonus !== undefined) state.RECENT_BONUS_NUMBERS.push(data.bonus);
        data.numbers.forEach(n => {
            state.HISTORICAL_FREQUENCY[n] = (state.HISTORICAL_FREQUENCY[n] || 0) + 1;
            lastSeen[n] = r;
            data.numbers.forEach(m => {
                if (n !== m) state.PAIR_FREQUENCIES[n][m] = (state.PAIR_FREQUENCIES[n][m] || 0) + 1;
            });
        });
        if (r > 1 && state.mergedHistory[r-1] && state.mergedHistory[r-1].numbers && Array.isArray(state.mergedHistory[r-1].numbers)) {
            const prevNums = state.mergedHistory[r-1].numbers;
            prevNums.forEach(prev => {
                if (state.TRANSITION_MATRIX[prev]) {
                    data.numbers.forEach(curr => {
                        state.TRANSITION_MATRIX[prev][curr] = (state.TRANSITION_MATRIX[prev][curr] || 0) + 1;
                    });
                }
            });
        }
    }
    state.allNumbers.forEach(n => {
        state.MISSING_WEEKS[n] = maxRound - (lastSeen[n] || 0);
    });
    state.latestRoundNum = maxRound;
    state.nextRoundNum = maxRound + 1;
}

/** Reclassify HOT/COLD/OVERDUE groups based on current frequency data */
export function recalculateGroups() {
    aggregateAllStatistics();
    const sortedByFreq = [...state.allNumbers].sort((a, b) => (state.HISTORICAL_FREQUENCY[b] - state.HISTORICAL_FREQUENCY[a]) || (a - b));
    state.HOT_GROUP = sortedByFreq.slice(0, 15);
    state.COLD_FREQ_GROUP = sortedByFreq.slice(30, 45);
    state.COLD_OVERDUE_GROUP = state.allNumbers.filter(n => state.MISSING_WEEKS[n] >= 10);
}
