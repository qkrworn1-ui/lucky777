import { state } from './state.js';

/** Recalculate all statistics from mergedHistory */
export function aggregateAllStatistics() {
    state.allNumbers.forEach(n => {
        state.HISTORICAL_FREQUENCY[n] = 0;
        state.EWMA_FREQUENCY[n] = 0;
        state.DYNAMIC_ROUND_SCORE[n] = 1.0;
        state.CROWD_AVOIDANCE_SCORE[n] = 0.0;
        state.MISSING_WEEKS[n] = 0;
        state.PAIR_FREQUENCIES[n] = {};
        state.TRANSITION_MATRIX[n] = {};
    });
    state.HISTORICAL_WINNING_SETS.clear();
    state.RECENT_BONUS_NUMBERS = [];
    
    let maxRound = 0;
    const rounds = Object.keys(state.mergedHistory).map(Number).filter(r => !isNaN(r)).sort((a,b) => a - b);
    let lastSeen = {};
    
    for (const r of rounds) {
        const data = state.mergedHistory[r];
        if (!data || !data.numbers || !Array.isArray(data.numbers)) continue;
        if (r > maxRound) maxRound = r;
        state.HISTORICAL_WINNING_SETS.add([...data.numbers].sort((a,b) => a - b).join(','));
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
    state.PREVIOUS_DRAW = (maxRound > 0 && state.mergedHistory[maxRound]?.numbers && Array.isArray(state.mergedHistory[maxRound].numbers))
        ? [...state.mergedHistory[maxRound].numbers]
        : [];

    // Compute EWMA (half-life = 30 rounds), Rolling 200-round Pari-Mutuel Crowd Ratio, and Empirical Crowd Avoidance
    const decay = Math.exp(-Math.LN2 / 30.0);
    let totalFreq = 0;
    let totalEwma = 0;
    const ewmaMap = {};
    const numWinnerSum = {};
    const numWinnerCnt = {};
    let totWinnerSum = 0;
    let totWinnerCnt = 0;
    state.allNumbers.forEach(n => {
        totalFreq += (state.HISTORICAL_FREQUENCY[n] || 0);
        ewmaMap[n] = 0;
        numWinnerSum[n] = 0;
        numWinnerCnt[n] = 0;
    });

    const hi3Winners = [];
    const hi1Winners = [];
    for (const r of rounds) {
        const data = state.mergedHistory[r];
        if (!data || !Array.isArray(data.numbers)) continue;
        const w = Math.pow(decay, maxRound - r);
        data.numbers.forEach(n => { ewmaMap[n] = (ewmaMap[n] || 0) + w; });
        const w1 = Number(data.rank1Winners || data.firstPrzwnerCo || 0);
        if (w1 > 0 && r > maxRound - 300) {
            totWinnerSum += w1;
            totWinnerCnt += 1;
            data.numbers.forEach(n => {
                numWinnerSum[n] = (numWinnerSum[n] || 0) + w1;
                numWinnerCnt[n] = (numWinnerCnt[n] || 0) + 1;
            });
            if (r > maxRound - 200) {
                const highCnt = data.numbers.filter(n => n >= 32).length;
                if (highCnt >= 3) hi3Winners.push(w1);
                else if (highCnt <= 1) hi1Winners.push(w1);
            }
        }
    }
    state.allNumbers.forEach(n => {
        state.EWMA_FREQUENCY[n] = ewmaMap[n];
        totalEwma += ewmaMap[n];
    });
    if (hi3Winners.length > 0 && hi1Winners.length > 0) {
        const avgHi3 = hi3Winners.reduce((a, b) => a + b, 0) / hi3Winners.length;
        const avgHi1 = hi1Winners.reduce((a, b) => a + b, 0) / hi1Winners.length;
        state.CROWD_EV_RATIO = avgHi3 > 0 ? Math.max(1.0, Math.min(1.25, avgHi1 / avgHi3)) : 1.07;
    } else {
        state.CROWD_EV_RATIO = 1.07;
    }

    const avgAllWinners = totWinnerCnt > 0 ? (totWinnerSum / totWinnerCnt) : 12.0;
    const avgFreq = rounds.length > 0 ? totalFreq / 45.0 : 1.0;
    const avgEwma = rounds.length > 0 ? totalEwma / 45.0 : 1.0;
    const prevDraw = state.PREVIOUS_DRAW || [];
    const neighbors = new Set();
    prevDraw.forEach(ln => {
        if (ln > 1) neighbors.add(ln - 1);
        if (ln < 45) neighbors.add(ln + 1);
    });
    let totalM = 0;
    prevDraw.forEach(ln => {
        const row = state.TRANSITION_MATRIX[ln] || {};
        for (const k in row) totalM += row[k];
    });
    const avgM = prevDraw.length > 0 ? (totalM / 45.0) : 1.0;

    state.allNumbers.forEach(n => {
        // Stationary rolling 300-round Bayesian-shrunk crowd avoidance index (>0 => fewer 1st-prize co-winners)
        const shrunkAvgN = (numWinnerSum[n] + 20.0 * avgAllWinners) / (numWinnerCnt[n] + 20.0);
        const crowdAvoid = (avgAllWinners - shrunkAvgN) / Math.max(1.0, avgAllWinners);
        state.CROWD_AVOIDANCE_SCORE[n] = crowdAvoid;

        // True Probability-Driven Core Score:
        // 40% Historical Cumulative Frequency + 35% Markov Transition from Prev Draw + 25% 30-Round Half-Life EWMA
        const fRatio = (state.HISTORICAL_FREQUENCY[n] || 0) / Math.max(1.0, avgFreq);
        let mSum = 0;
        prevDraw.forEach(ln => { mSum += (state.TRANSITION_MATRIX[ln]?.[n] || 0); });
        const mRatio = (mSum + 2.0) / (avgM + 2.0);
        const ewRatio = ((state.EWMA_FREQUENCY[n] || 0) + 1.0) / (avgEwma + 1.0);

        const ovBoost = 1.0 + Math.min(0.05, Math.max(0, (state.MISSING_WEEKS[n] || 0) - 8) * 0.004);
        const nbBoost = neighbors.has(n) ? 1.02 : 1.0;
        const coBoost = prevDraw.includes(n) ? 1.015 : 1.0;

        const probScore = (0.40 * fRatio + 0.35 * mRatio + 0.25 * ewRatio) * ovBoost * nbBoost * coBoost;
        state.DYNAMIC_ROUND_SCORE[n] = probScore + crowdAvoid * 0.06 + (n >= 32 ? 0.015 : 0.0);
    });
}

/** Reclassify HOT/COLD/OVERDUE groups based on current frequency data */
export function recalculateGroups() {
    aggregateAllStatistics();
    const sortedByFreq = [...state.allNumbers].sort((a, b) => (state.HISTORICAL_FREQUENCY[b] - state.HISTORICAL_FREQUENCY[a]) || (a - b));
    state.HOT_GROUP = sortedByFreq.slice(0, 15);
    state.COLD_FREQ_GROUP = sortedByFreq.slice(30, 45);
    state.COLD_OVERDUE_GROUP = state.allNumbers.filter(n => state.MISSING_WEEKS[n] >= 10);
}
