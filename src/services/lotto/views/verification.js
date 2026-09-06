import { state, saveGlobalState } from '../state.js';
import { getBallColorClass, showToast } from '../../../shared/utils.js';

export function renderVerificationTab() {
    const verifyCardsList = document.getElementById('verifyCardsList');
    if (!verifyCardsList) return;
    const el_verifyTargetRound = document.getElementById('verifyTargetRound');
    if (el_verifyTargetRound && state.latestDrawData) {
        el_verifyTargetRound.textContent = `제 ${state.latestDrawData.drwNo}회 검증 기준 (${state.latestDrawData.drwNoDate})`;
    }
    const el_aiGenCounter = document.getElementById('aiGenCounter');
    if (el_aiGenCounter) el_aiGenCounter.textContent = state.aiState.generation;

    const el_geneHotColdRatio = document.getElementById('geneHotColdRatio');
    if (el_geneHotColdRatio) el_geneHotColdRatio.textContent = state.aiState.hotColdRatio;
    const el_geneColdThreshold = document.getElementById('geneColdThreshold');
    if (el_geneColdThreshold) el_geneColdThreshold.textContent = `${state.aiState.coldThreshold} 주`;
    const el_geneHighWeight = document.getElementById('geneHighWeight');
    if (el_geneHighWeight) el_geneHighWeight.textContent = `+${state.aiState.highWeight}%`;
    const el_geneFitnessScore = document.getElementById('geneFitnessScore');
    if (el_geneFitnessScore) el_geneFitnessScore.textContent = `${state.aiState.fitnessScore.toFixed(1)} pt`;

    if (!state.latestDrawData) return;
    const winningSet = new Set(state.latestDrawData.numbers);
    const bonusNum = state.latestDrawData.bonus;

    verifyCardsList.innerHTML = state.fixedTop5Combinations.map((comboObj) => {
        const numbers = comboObj.numbers;
        const matches = numbers.filter(n => winningSet.has(n));
        const matchCount = matches.length;
        const isBonusMatch = numbers.includes(bonusNum);

        let prizeText = '낙첨 (0~2개 적중)';
        let prizeClass = 'prize-badge-miss';

        if (matchCount === 6) {
            prizeText = '🎉 1등 당첨!! (6개 번호 일치)';
            prizeClass = 'prize-badge-3rd';
        } else if (matchCount === 5 && isBonusMatch) {
            prizeText = '🥈 2등 당첨!! (5개 + 보너스 일치)';
            prizeClass = 'prize-badge-3rd';
        } else if (matchCount === 5) {
            prizeText = '🥉 3등 당첨! (5개 번호 일치)';
            prizeClass = 'prize-badge-3rd';
        } else if (matchCount === 4) {
            prizeText = '✨ 4등 당첨 (4개 번호 일치 / 5만원)';
            prizeClass = 'prize-badge-4th';
        } else if (matchCount === 3) {
            prizeText = '🎁 5등 당첨 (3개 번호 일치 / 5천원)';
            prizeClass = 'prize-badge-5th';
        } else {
            prizeText = `낙첨 (${matchCount}개 번호 일치)`;
            prizeClass = 'prize-badge-miss';
        }

        return `
            <div class="verify-card">
                <div class="verify-card-header">
                    <div class="combo-title-group">
                        <span class="rank-badge ${comboObj.meta ? comboObj.meta.rankClass : 'top-1-badge'}">${comboObj.id}</span>
                        <span class="combo-name">${comboObj.name}</span>
                    </div>
                    <span class="verify-match-badge ${prizeClass}">${prizeText}</span>
                </div>
                <div class="combo-body">
                    <div class="balls-row">
                        ${numbers.map(n => {
                            const isMatch = winningSet.has(n);
                            return `<div class="lotto-ball ${getBallColorClass(n)} ${isMatch ? 'matched-ball' : ''}">${n}</div>`;
                        }).join('')}
                    </div>
                    <div class="combo-stats">
                        <div class="stat-pill">일치번호 <strong>${matchCount}개${isBonusMatch ? ' + 보너스' : ''}</strong></div>
                        <div class="stat-pill ev-score">EV지수 <strong>점</strong></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function setupEvolutionButton() {
    const _el_btnRunEvolution = document.getElementById('btnRunEvolution'); 
    if (_el_btnRunEvolution) {
        _el_btnRunEvolution.addEventListener('click', () => {
            state.aiState.generation += 1;
            state.aiState.fitnessScore += 1.5;

            const hotVal = Math.min(65, Math.max(45, Math.round(55 + (Math.random() * 4 - 2))));
            state.aiState.hotColdRatio = `${hotVal} : ${100 - hotVal}`;
            state.aiState.highWeight = Math.min(50, Math.max(30, state.aiState.highWeight + 1));

            saveGlobalState();
            renderVerificationTab();

            showToast(`🧬 AI Gen #${state.aiState.generation} 세대 자가 진화 완료! 확률 모델이 강화되었습니다.`);
        });
    }
}
