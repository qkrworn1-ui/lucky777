import { state } from './state.js';

export function encodeLotto6Sorted(n0, n1, n2, n3, n4, n5) {
    return ((((n0 * 46 + n1) * 46 + n2) * 46 + n3) * 46 + n4) * 46 + n5;
}

const HEDGE8_EXPERT_KEYS = ['dirichlet', 'ewma10', 'ewma30', 'ewma80', 'overdue', 'gap_haz', 'pair_cent', 'trans12'];

function znorm45(arr, out) {
    let sum = 0;
    for (let n = 1; n <= 45; n++) sum += arr[n];
    const mu = sum / 45.0;
    let v = 0;
    for (let n = 1; n <= 45; n++) {
        const d = arr[n] - mu;
        v += d * d;
    }
    const sd = Math.sqrt(v / 45.0);
    if (sd > 1e-12) {
        for (let n = 1; n <= 45; n++) out[n] = (arr[n] - mu) / sd;
    } else {
        for (let n = 1; n <= 45; n++) out[n] = 0;
    }
}

/**
 * 🧬 V3_Hedge8_WheelEV 워크포워드 8-전문가 온라인 헤지 스냅샷 생성기 (미래 데이터 누수 0%)
 * - 전문가 8종: dirichlet(α=40), ewma10, ewma30, ewma80, overdue(cap=30), gap_haz, pair_cent, trans12(α=12)
 * - 매 회차 t 실제 당첨번호 확정 직후 상위 16수 적중 성과(hit16 - 2.1333)로 지수 가중치 자기보정
 * - CROWD_AVOIDANCE_SCORE는 확률 풀 선별에서 분리해 30게임 커버링 휠 EV 단계에만 순수 반영
 */
export function computeWalkForwardHedge8Snapshots(history, maxRound = null) {
    const src = history || {};
    const rounds = Object.keys(src)
        .filter(r => src[r] && Array.isArray(src[r].numbers) && src[r].numbers.length === 6)
        .map(Number)
        .sort((a, b) => a - b);
    const limitR = maxRound || (rounds.length ? rounds[rounds.length - 1] : 1250);

    const d10 = Math.exp(-Math.LN2 / 10.0);
    const d30 = Math.exp(-Math.LN2 / 30.0);
    const d80 = Math.exp(-Math.LN2 / 80.0);
    const dPair = Math.exp(-Math.LN2 / 60.0);

    const freq = new Float64Array(46);
    const e10 = new Float64Array(46);
    const e30 = new Float64Array(46);
    const e80 = new Float64Array(46);
    const lastSeen = new Int32Array(46);
    const trans1 = Array.from({ length: 46 }, () => new Float64Array(46));
    const trans2 = Array.from({ length: 46 }, () => new Float64Array(46));
    const bonusTrans = Array.from({ length: 46 }, () => new Float64Array(46));
    const pairEw = new Float64Array(46 * 46);
    const gapHits = new Float64Array(60);
    const gapTrials = new Float64Array(60);

    const winnerWindow = [];
    const numWinnerSum = new Float64Array(46);
    const numWinnerCnt = new Int32Array(46);
    let totWinnerSum = 0;
    let totWinnerCnt = 0;
    let winQueueIdx = 0;

    let prevNums = [];
    let prev2Nums = [];
    let prevBonus = 0;
    const winRoundMap = new Map();
    const winCodeMap = new Map();

    const expLogw = {};
    for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) expLogw[HEDGE8_EXPERT_KEYS[i]] = 0;
    let latestWeights = {};
    for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) latestWeights[HEDGE8_EXPERT_KEYS[i]] = 1.0 / HEDGE8_EXPERT_KEYS.length;

    // Reusable scratch buffers to keep per-round computation allocation-free
    const dirArr = new Float64Array(46);
    const e10s = new Float64Array(46);
    const e30s = new Float64Array(46);
    const e80s = new Float64Array(46);
    const ovArr = new Float64Array(46);
    const ghArr = new Float64Array(46);
    const tArr = new Float64Array(46);
    const pArr = new Float64Array(46);
    const zExp = {
        dirichlet: new Float64Array(46),
        ewma10: new Float64Array(46),
        ewma30: new Float64Array(46),
        ewma80: new Float64Array(46),
        overdue: new Float64Array(46),
        gap_haz: new Float64Array(46),
        pair_cent: new Float64Array(46),
        trans12: new Float64Array(46)
    };
    const idxSort = Array.from({ length: 45 }, (_, i) => i + 1);
    const roundSnapshots = new Array(limitR + 2);
    const overallRate = 6.0 / 45.0;

    for (let r = 1; r <= limitR + 1; r++) {
        const mk = r - 1;
        while (winQueueIdx < winnerWindow.length && winnerWindow[winQueueIdx].r <= mk - 300) {
            const old = winnerWindow[winQueueIdx++];
            totWinnerSum -= old.w1;
            totWinnerCnt -= 1;
            for (let i = 0; i < old.nums.length; i++) {
                const bn = old.nums[i];
                numWinnerSum[bn] -= old.w1;
                numWinnerCnt[bn] -= 1;
            }
        }

        const dynScore = new Float64Array(46);
        const crowdAvoid = new Float64Array(46);

        if (mk <= 0) {
            for (let n = 1; n <= 45; n++) {
                dynScore[n] = 1.0;
                crowdAvoid[n] = 0.0;
            }
        } else {
            const avgAllWinners = totWinnerCnt > 0 ? (totWinnerSum / totWinnerCnt) : 12.0;
            let totF = 0, m10 = 0, m30 = 0, m80 = 0;
            for (let n = 1; n <= 45; n++) {
                totF += freq[n];
                m10 += e10[n];
                m30 += e30[n];
                m80 += e80[n];
            }
            const e30Sum = m30;
            m10 /= 45.0;
            m30 /= 45.0;
            m80 /= 45.0;

            let tMean = 0;
            for (let n = 1; n <= 45; n++) {
                const shrunkAvgN = (numWinnerSum[n] + 20.0 * avgAllWinners) / (numWinnerCnt[n] + 20.0);
                crowdAvoid[n] = (avgAllWinners - shrunkAvgN) / Math.max(1.0, avgAllWinners);

                dirArr[n] = (freq[n] + 40.0) / (totF + 1800.0);
                e10s[n] = (e10[n] + 0.5) / (m10 + 0.5);
                e30s[n] = (e30[n] + 1.0) / (m30 + 1.0);
                e80s[n] = (e80[n] + 2.0) / (m80 + 2.0);
                const g = Math.min(59, Math.max(0, mk - lastSeen[n]));
                ovArr[n] = Math.min(30, Math.max(0, mk - lastSeen[n]));
                ghArr[n] = (gapHits[g] + 50.0 * overallRate) / (gapTrials[g] + 50.0);

                let ts = 0;
                for (let i = 0; i < prevNums.length; i++) ts += trans1[prevNums[i]][n];
                for (let i = 0; i < prev2Nums.length; i++) ts += 0.35 * trans2[prev2Nums[i]][n];
                if (prevBonus) ts += 0.25 * bonusTrans[prevBonus][n];
                tArr[n] = ts;
                tMean += ts;
            }
            tMean /= 45.0;
            for (let n = 1; n <= 45; n++) {
                tArr[n] = (tArr[n] + 12.0) / (tMean + 12.0);
            }
            if (e30Sum > 0) {
                const invE30Sum = 1.0 / e30Sum;
                for (let n = 1; n <= 45; n++) {
                    const rowOff = n * 46;
                    let ps = 0;
                    for (let m = 1; m <= 45; m++) ps += pairEw[rowOff + m] * (e30[m] * invE30Sum);
                    pArr[n] = ps;
                }
            } else {
                pArr.fill(0);
            }

            znorm45(dirArr, zExp.dirichlet);
            znorm45(e10s, zExp.ewma10);
            znorm45(e30s, zExp.ewma30);
            znorm45(e80s, zExp.ewma80);
            znorm45(ovArr, zExp.overdue);
            znorm45(ghArr, zExp.gap_haz);
            znorm45(pArr, zExp.pair_cent);
            znorm45(tArr, zExp.trans12);

            let mx = -1e9;
            for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) {
                const lw = expLogw[HEDGE8_EXPERT_KEYS[i]];
                if (lw > mx) mx = lw;
            }
            let sw = 0;
            const ws = {};
            for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) {
                const k = HEDGE8_EXPERT_KEYS[i];
                const ev = Math.exp(expLogw[k] - mx);
                ws[k] = ev;
                sw += ev;
            }
            const curWeights = {};
            for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) {
                const k = HEDGE8_EXPERT_KEYS[i];
                const w = ws[k] / sw;
                curWeights[k] = w;
                const zVec = zExp[k];
                for (let n = 1; n <= 45; n++) dynScore[n] += w * zVec[n];
            }
            for (let n = 1; n <= 45; n++) {
                dynScore[n] = 1.0 + 0.08 * dynScore[n];
            }
            latestWeights = curWeights;

            const dCur = src[r];
            if (r <= limitR && r >= 50 && dCur && Array.isArray(dCur.numbers) && dCur.numbers.length === 6) {
                const wsSet = new Set(dCur.numbers);
                for (let i = 0; i < HEDGE8_EXPERT_KEYS.length; i++) {
                    const k = HEDGE8_EXPERT_KEYS[i];
                    const sc = zExp[k];
                    idxSort.sort((a, b) => (sc[b] - sc[a]) || (a - b));
                    let hk = 0;
                    for (let j = 0; j < 16; j++) if (wsSet.has(idxSort[j])) hk++;
                    expLogw[k] = 0.985 * expLogw[k] + 0.09 * (hk - 2.1333);
                }
            }
        }

        roundSnapshots[r] = { dynScore, crowdAvoid, maxKnown: mk };
        if (r > limitR) break;

        const d = src[r];
        if (d && Array.isArray(d.numbers) && d.numbers.length === 6) {
            const nums = d.numbers;
            const sortedNums = [...nums].sort((a, b) => a - b);
            const sortedKey = sortedNums.join(',');
            if (!winRoundMap.has(sortedKey)) winRoundMap.set(sortedKey, r);
            const winCode = encodeLotto6Sorted(sortedNums[0], sortedNums[1], sortedNums[2], sortedNums[3], sortedNums[4], sortedNums[5]);
            if (!winCodeMap.has(winCode)) winCodeMap.set(winCode, r);

            if (r >= 20) {
                for (let n = 1; n <= 45; n++) {
                    const g = Math.min(59, Math.max(0, mk - lastSeen[n]));
                    gapTrials[g] += 1;
                }
                for (let i = 0; i < nums.length; i++) {
                    const bn = nums[i];
                    const g = Math.min(59, Math.max(0, mk - lastSeen[bn]));
                    gapHits[g] += 1;
                }
            }

            for (let n = 1; n <= 45; n++) {
                e10[n] *= d10;
                e30[n] *= d30;
                e80[n] *= d80;
            }
            for (let k = 0; k < pairEw.length; k++) pairEw[k] *= dPair;

            for (let i = 0; i < nums.length; i++) {
                const bn = nums[i];
                freq[bn] += 1;
                e10[bn] += 1;
                e30[bn] += 1;
                e80[bn] += 1;
                lastSeen[bn] = r;
                const rowOff = bn * 46;
                for (let j = 0; j < nums.length; j++) {
                    if (i !== j) pairEw[rowOff + nums[j]] += 1;
                }
            }
            for (let i = 0; i < prevNums.length; i++) {
                const row = trans1[prevNums[i]];
                for (let j = 0; j < nums.length; j++) row[nums[j]] += 1;
            }
            for (let i = 0; i < prev2Nums.length; i++) {
                const row2 = trans2[prev2Nums[i]];
                for (let j = 0; j < nums.length; j++) row2[nums[j]] += 1;
            }
            if (prevBonus >= 1 && prevBonus <= 45) {
                const brow = bonusTrans[prevBonus];
                for (let j = 0; j < nums.length; j++) brow[nums[j]] += 1;
            }
            prev2Nums = prevNums;
            prevNums = [...nums];
            prevBonus = Number(d.bonus || 0);

            const w1 = Number(d.rank1Winners || d.firstPrzwnerCo || 0);
            if (w1 > 0) {
                winnerWindow.push({ r, w1, nums });
                totWinnerSum += w1;
                totWinnerCnt += 1;
                for (let i = 0; i < nums.length; i++) {
                    const bn = nums[i];
                    numWinnerSum[bn] += w1;
                    numWinnerCnt[bn] += 1;
                }
            }
        }
    }

    return { limitR, roundSnapshots, winRoundMap, winCodeMap, expertWeights: latestWeights };
}

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

    // 🧬 V3_Hedge8_WheelEV: 워크포워드 8-전문가 온라인 헤지 스코어 적용 (CROWD_AVOIDANCE_SCORE는 휠링 EV 단계에만 분리 반영)
    const hedgeRes = computeWalkForwardHedge8Snapshots(state.mergedHistory, maxRound);
    const nextSnap = hedgeRes.roundSnapshots[maxRound + 1];
    state.HEDGE8_EXPERT_WEIGHTS = hedgeRes.expertWeights || {};

    state.allNumbers.forEach(n => {
        // Stationary rolling 300-round Bayesian-shrunk crowd avoidance index (>0 => fewer 1st-prize co-winners)
        const shrunkAvgN = (numWinnerSum[n] + 20.0 * avgAllWinners) / (numWinnerCnt[n] + 20.0);
        const crowdAvoid = (avgAllWinners - shrunkAvgN) / Math.max(1.0, avgAllWinners);
        state.CROWD_AVOIDANCE_SCORE[n] = crowdAvoid;
        state.DYNAMIC_ROUND_SCORE[n] = nextSnap ? nextSnap.dynScore[n] : 1.0;
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
