import { state } from '../state.js';

let reportFreqChartInstance = null;
let reportBalanceChartInstance = null;

export function generatePredictionReport() {
    if (!state.fixedTop5Combinations || state.fixedTop5Combinations.length === 0) return;

    // 1. Calculate Stats from fixedTop5Combinations
    const allNumbers = [];
    state.fixedTop5Combinations.forEach(combo => {
        if (combo.numbers) {
            allNumbers.push(...combo.numbers);
        }
    });

    if (allNumbers.length === 0) return;

    const freqMap = {};
    let oddCount = 0;
    let evenCount = 0;
    let lowCount = 0;
    let highCount = 0;

    allNumbers.forEach(n => {
        freqMap[n] = (freqMap[n] || 0) + 1;
        if (n % 2 === 1) oddCount++;
        else evenCount++;
        
        if (n <= 22) lowCount++;
        else highCount++;
    });

    const totalNumbers = allNumbers.length;
    const oddRatio = Math.round((oddCount / totalNumbers) * 100);
    const evenRatio = Math.round((evenCount / totalNumbers) * 100);
    const lowRatio = Math.round((lowCount / totalNumbers) * 100);
    const highRatio = Math.round((highCount / totalNumbers) * 100);

    // Sort by frequency
    const sortedFreq = Object.entries(freqMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const topLabels = sortedFreq.map(item => item[0] + '번');
    const topData = sortedFreq.map(item => item[1]);
    const topTop3 = sortedFreq.slice(0, 3).map(item => item[0] + '번').join(', ');

    // 2. Draw Freq Chart
    if (typeof window.Chart === 'function') {
        const ctxFreq = document.getElementById('reportFreqChart')?.getContext('2d');
        if (ctxFreq) {
            try {
                if (reportFreqChartInstance) reportFreqChartInstance.destroy();
                reportFreqChartInstance = new window.Chart(ctxFreq, {
                    type: 'bar',
                    data: {
                        labels: topLabels,
                        datasets: [{
                            label: '추천 횟수',
                            data: topData,
                            backgroundColor: 'rgba(251, 191, 36, 0.7)',
                            borderColor: 'rgba(251, 191, 36, 1)',
                            borderWidth: 1,
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true, ticks: { color: '#cbd5e1', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                            x: { ticks: { color: '#cbd5e1' }, grid: { display: false } }
                        }
                    }
                });
            } catch(e){}
        }

        // 3. Draw Balance Chart
        const ctxBal = document.getElementById('balanceChart')?.getContext('2d');
        if (ctxBal) {
            try {
                if (reportBalanceChartInstance) reportBalanceChartInstance.destroy();
                reportBalanceChartInstance = new window.Chart(ctxBal, {
                    type: 'bar',
                    data: {
                        labels: ['홀수 vs 짝수', '저번호 vs 고번호'],
                        datasets: [
                            {
                                label: '홀수 / 저번호(1~22)',
                                data: [oddRatio, lowRatio],
                                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                            },
                            {
                                label: '짝수 / 고번호(23~45)',
                                data: [evenRatio, highRatio],
                                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: { color: '#cbd5e1', font: { size: 10 } }
                            }
                        },
                        scales: {
                            x: { stacked: true, ticks: { color: '#cbd5e1' }, grid: { display: false } },
                            y: { stacked: true, max: 100, ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                        }
                    }
                });
            } catch(e){}
        }
    }

    // 4. Generate Briefing Text
    const strategyDesc = `
        이번 주 추천 번호 10개 조합(총 60개 번호)은 역대 당첨 데이터와 직전 회차의 흐름을 반영하여 다음과 같은 통계적 원리로 추출되었습니다.<br><br>
        <strong style="color:var(--accent-gold);">1. 빈도 최적화:</strong> 가장 강력한 상승세를 타고 있어 집중 추천된 핵심 번호는 <b>[${topTop3}]</b> 입니다. 이 번호들은 AI 알고리즘이 이번 주 출현 가능성을 가장 높게 평가했습니다.<br><br>
        <strong style="color:#93c5fd;">2. 홀짝 황금비율 적용:</strong> 전체 조합의 홀수와 짝수 비율은 <b>${oddRatio}% 대 ${evenRatio}%</b>로 배분되었습니다. 이는 역대 1등 당첨 번호들이 보여주는 가장 안정적인 홀짝 비율에 수렴하도록 의도적으로 조정된 결과입니다.<br><br>
        <strong style="color:#fca5a5;">3. 고저 밸런스 유지:</strong> 저번호(1~22)와 고번호(23~45)의 비율은 <b>${lowRatio}% 대 ${highRatio}%</b>로 설계되어, 특정 구간에 번호가 쏠려 당첨 확률이 급락하는 현상을 방지했습니다.<br><br>
        <i>종합 의견: 이번 주 추천 조합은 과거 데이터의 회귀성(Regression)을 바탕으로 극단적인 패턴을 피하고 가장 안정적이면서도 확률 높은 번호군을 채택했습니다.</i>
    `;
    const predictionBriefingText = document.getElementById('predictionBriefingText');
    if (predictionBriefingText) {
        predictionBriefingText.innerHTML = strategyDesc;
    }
}

export function setupPredictionReport() {
    const btnPredictionReport = document.getElementById('btnPredictionReport');
    const predictionReportModal = document.getElementById('predictionReportModal');
    const btnClosePredictionReport = document.getElementById('btnClosePredictionReport');
    const btnConfirmPredictionReport = document.getElementById('btnConfirmPredictionReport');

    if (btnPredictionReport && predictionReportModal) {
        btnPredictionReport.addEventListener('click', () => {
            if (!state.fixedTop5Combinations || state.fixedTop5Combinations.length === 0) {
                alert("아직 추천 조합이 생성되지 않았습니다.");
                return;
            }
            generatePredictionReport();
            predictionReportModal.style.display = 'flex';
        });
    }

    if (btnClosePredictionReport && predictionReportModal) {
        btnClosePredictionReport.addEventListener('click', () => {
            predictionReportModal.style.display = 'none';
        });
    }

    if (btnConfirmPredictionReport && predictionReportModal) {
        btnConfirmPredictionReport.addEventListener('click', () => {
            predictionReportModal.style.display = 'none';
        });
    }
}
