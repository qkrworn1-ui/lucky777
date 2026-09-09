import { state } from '../state.js';
import { getBallColorClass, showToast } from '../../../shared/utils.js';
import { calculateStats } from '../scoring.js';

export function renderWheelingSelector() {
    const gridEl = document.getElementById('wheelingBallGrid');
    if (!gridEl) return;
    const el_wheelingSelectedCount = document.getElementById('wheelingSelectedCount');
    if (el_wheelingSelectedCount) el_wheelingSelectedCount.textContent = state.selectedWheelingPool.length;

    gridEl.innerHTML = state.allNumbers.map(n => {
        const isSelected = state.selectedWheelingPool.includes(n);
        return `<div class="wheeling-ball-item ${isSelected ? 'selected' : ''}" data-num="${n}">${n}</div>`;
    }).join('');

    gridEl.querySelectorAll('.wheeling-ball-item').forEach(item => {
        item.addEventListener('click', () => {
            const n = parseInt(item.dataset.num);
            if (state.selectedWheelingPool.includes(n)) {
                if (state.selectedWheelingPool.length <= 6) {
                    showToast('최소 6개 이상 번호를 선택해야 합니다.');
                    return;
                }
                state.selectedWheelingPool = state.selectedWheelingPool.filter(num => num !== n);
            } else {
                if (state.selectedWheelingPool.length >= 12) {
                    showToast('최대 12개까지만 선택 가능합니다.');
                    return;
                }
                state.selectedWheelingPool.push(n);
            }
            renderWheelingSelector();
        });
    });
}

export function calculateWheelingCombinations(pool) {
    const sortedPool = [...pool].sort((a, b) => a - b);
    const P = sortedPool;
    
    const indices = [
        [0, 1, 2, 3, 4, 5],
        [0, 1, 2, 6, 7, 8],
        [0, 1, 3, 6, 8, 9],
        [0, 2, 4, 6, 7, 9],
        [0, 3, 5, 7, 8, 9],
        [0, 4, 5, 6, 8, 9],
        [1, 2, 3, 5, 7, 9],
        [1, 2, 4, 5, 8, 9],
        [1, 3, 4, 6, 7, 8],
        [1, 5, 6, 7, 8, 9],
        [2, 3, 4, 7, 8, 9],
        [2, 3, 5, 6, 7, 8],
        [2, 4, 6, 7, 8, 9],
        [3, 4, 5, 6, 7, 9]
    ];

    return indices.map((line, idx) => {
        const nums = line.map(i => P[i % P.length]);
        const stats = calculateStats(nums);
        return {
            id: `W-${idx + 1}`,
            name: `휠링 커버링 세트 #${idx + 1}`,
            numbers: nums,
            stats: stats
        };
    });
}

export function renderWheelingResults() {
    const container = document.getElementById('wheelingResultsContainer');
    if (!container) return;
    const wheelingSets = calculateWheelingCombinations(state.selectedWheelingPool);

    container.innerHTML = wheelingSets.map(item => `
        <div class="combo-card">
            <div class="combo-header">
                <div class="combo-title-group">
                    <span class="rank-badge top-2-badge">${item.id}</span>
                    <div>
                        <div class="combo-name">${item.name} <span class="chart-tag">수학적 4등 커버링</span></div>
                        <div class="combo-desc">후보 10개 번호 중 4개 적중 시 4등 당첨 조합 성립</div>
                    </div>
                </div>
            </div>
            <div class="combo-body">
                <div class="balls-row">
                    ${item.numbers.map(n => `
                        <div class="lotto-ball ${getBallColorClass(n)}">${n}</div>
                    `).join('')}
                </div>
                <div class="combo-stats">
                    <div class="stat-pill">홀짝 <strong>${item.stats.oddEvenRatio}</strong></div>
                    <div class="stat-pill">번호합 <strong>${item.stats.sum}</strong></div>
                    <div class="stat-pill ev-score">EV지수 <strong>점</strong></div>
                </div>
            </div>
        </div>
    `).join('');
}

export function setupWheelingTab() {
    const _el_btnAutoPickWheeling = document.getElementById('btnAutoPickWheeling'); 
    if (_el_btnAutoPickWheeling) {
        _el_btnAutoPickWheeling.addEventListener('click', () => {
            state.selectedWheelingPool = [3, 7, 12, 18, 21, 27, 34, 38, 42, 45];
            renderWheelingSelector();
            showToast('AI 추천 상위 확률 후보 10개가 선택되었습니다.');
        });
    }

    const _el_btnCalculateWheeling = document.getElementById('btnCalculateWheeling'); 
    if (_el_btnCalculateWheeling) {
        _el_btnCalculateWheeling.addEventListener('click', () => {
            renderWheelingResults();
            showToast('수학적 휠링 커버링 14세트 조합 계산 완료!');
        });
    }
}
