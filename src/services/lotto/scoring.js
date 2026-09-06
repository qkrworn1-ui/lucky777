import { state } from './state.js';
import { calculateACValue } from '../../shared/utils.js';

export function getNeighborMatches(numbers) {
    const prevSet = new Set(state.PREVIOUS_DRAW);
    const neighbors = new Set();
    state.PREVIOUS_DRAW.forEach(n => {
        if (n > 1) neighbors.add(n - 1);
        if (n < 45) neighbors.add(n + 1);
    });

    const matches = numbers.filter(n => neighbors.has(n) && !prevSet.has(n));
    return matches;
}

export function calculateStats(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const odds = sorted.filter(n => n % 2 !== 0).length;
    const evens = 6 - odds;
    const highCount = sorted.filter(n => n >= 32).length;

    const sections = new Set();
    sorted.forEach(n => {
        if (n < 10) sections.add(0);
        else if (n < 20) sections.add(1);
        else if (n < 30) sections.add(2);
        else if (n < 40) sections.add(3);
        else sections.add(4);
    });

    let probBalanceScore = 32;
    if (odds === 3) probBalanceScore += 10;
    else if (odds === 2 || odds === 4) probBalanceScore += 8;

    const sumDiff = Math.abs(sum - 138.4);
    if (sumDiff <= 15) probBalanceScore += 10;
    else if (sumDiff <= 30) probBalanceScore += 6;

    let biasAvoidanceScore = 22;
    biasAvoidanceScore += highCount * 7;
    if (sections.size >= 4) biasAvoidanceScore += 7;

    const evScore = Math.min(99, Math.max(68, probBalanceScore + biasAvoidanceScore));
    const payoutMultiplier = (1.0 + (highCount * 0.12) + (sections.size >= 4 ? 0.08 : 0)).toFixed(2);

    const freqIndex = Math.min(96, Math.round(sorted.reduce((a, b) => a + (state.HISTORICAL_FREQUENCY[b] || 135), 0) / 6 / 1.48));
    const overdueIndex = Math.min(96, Math.round(sorted.reduce((a, b) => a + (state.MISSING_WEEKS[b] || 0), 0) * 1.85 + 42));

    const neighborMatches = getNeighborMatches(sorted);
    const binomialWaveIndex = Math.min(99, Math.round(89 + neighborMatches.length * 4.8));

    const totalMathScore = Math.min(99, Math.round(probBalanceScore * 0.5 + biasAvoidanceScore * 0.5 + freqIndex * 0.2 + overdueIndex * 0.1));

    return {
        sorted,
        sum,
        oddEvenRatio: `${odds}:${evens}`,
        highCount,
        sectionCount: sections.size,
        neighborCount: neighborMatches.length,
        neighborNums: neighborMatches,
        binomialWaveIndex,
        probBalanceScore,
        biasAvoidanceScore,
        evScore,
        payoutMultiplier,
        freqIndex,
        overdueIndex,
        totalMathScore
    };
}
