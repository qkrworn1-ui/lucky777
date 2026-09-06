import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, calculateACValue } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations } from '../generator.js';
import { recalculateGroups } from '../statistics.js';
import { calculateStats, getNeighborMatches } from '../scoring.js';
import { getLedger, saveToLedger, getComboNumbers, getHistoricalTop10Combinations } from '../ledger.js';
import { db } from '../../../shared/db.js';

let freqChartInstance = null;
let oddEvenChartInstance = null;
let sumChartInstance = null;

export function renderDashboardCharts() {
    if (state.HOT_GROUP && state.HOT_GROUP.length > 0) {
        const el_topHotNum = document.getElementById('topHotNum');
        if (el_topHotNum) el_topHotNum.textContent = `${state.HOT_GROUP[0]}번`;
        const el_topHotCount = document.getElementById('topHotCount');
        if (el_topHotCount) el_topHotCount.textContent = `총 ${state.HISTORICAL_FREQUENCY[state.HOT_GROUP[0]]}회 출현`;
    }

    const allNumbers = Array.from({ length: 45 }, (_, i) => i + 1);
    const topCold = [...allNumbers].sort((a, b) => state.MISSING_WEEKS[b] - state.MISSING_WEEKS[a])[0];
    if (topCold) {
        const el_topColdNum = document.getElementById('topColdNum');
        if (el_topColdNum) el_topColdNum.textContent = `${topCold}번`;
        const el_topColdWeeks = document.getElementById('topColdWeeks');
        if (el_topColdWeeks) el_topColdWeeks.textContent = `${state.MISSING_WEEKS[topCold]}주 연속 미출현`;
    }

    const coldListEl = document.getElementById('coldGroupList');
    if (coldListEl && state.COLD_OVERDUE_GROUP) {
        coldListEl.innerHTML = state.COLD_OVERDUE_GROUP.map(n => `
            <div class="cold-item">
                <div class="lotto-ball ${getBallColorClass(n)}" style="width:36px; height:36px; font-size:0.9rem;">${n}</div>
                <div class="cold-item-text">
                    <span style="font-weight:700; font-size:0.85rem;">${n}번</span>
                    <span class="cold-weeks">${state.MISSING_WEEKS[n]}주 미출현</span>
                </div>
            </div>
        `).join('');
    }

    if (typeof window.Chart === 'function') {
        if (freqChartInstance) {
            try {
                freqChartInstance.data.datasets[0].data = allNumbers.map(n => state.HISTORICAL_FREQUENCY[n]);
                freqChartInstance.resize();
                freqChartInstance.update();
            } catch(e){}
        } else {
            const freqChartEl = document.getElementById('freqChart');
            if (freqChartEl) {
                const ctx = freqChartEl.getContext('2d');
                const labels = allNumbers.map(n => `${n}`);
                const data = allNumbers.map(n => state.HISTORICAL_FREQUENCY[n]);
                const colors = allNumbers.map(n => getBallHexColor(n));
                const isMobile = (typeof window !== 'undefined' && window.innerWidth <= 640);

                try {
                    freqChartInstance = new window.Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: '누적 출현 횟수',
                                data: data,
                                backgroundColor: colors,
                                borderRadius: 3,
                                maxBarThickness: isMobile ? 8 : 16,
                                barPercentage: 0.9,
                                categoryPercentage: 0.9
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: {
                                padding: { left: 0, right: 4, top: 4, bottom: 0 }
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: (items) => `${items[0].label}번`,
                                        label: (item) => `누적 ${item.raw}회 출현`
                                    }
                                }
                            },
                            scales: {
                                x: {
                                    ticks: {
                                        color: '#94a3b8',
                                        font: { size: isMobile ? 8 : 9 },
                                        autoSkip: true,
                                        maxTicksLimit: isMobile ? 12 : 23,
                                        maxRotation: 0,
                                        minRotation: 0
                                    },
                                    grid: { display: false }
                                },
                                y: {
                                    ticks: { color: '#94a3b8', font: { size: isMobile ? 8 : 10 }, maxTicksLimit: 5 },
                                    grid: { color: 'rgba(255,255,255,0.05)' }
                                }
                            }
                        }
                    });
                } catch(e){}
            }
        }

        if (oddEvenChartInstance) {
            try {
                oddEvenChartInstance.resize();
                oddEvenChartInstance.update();
            } catch(e){}
        } else {
            const oddEvenChartEl = document.getElementById('oddEvenChart');
            if (oddEvenChartEl) {
                const ctx = oddEvenChartEl.getContext('2d');
                try {
                    oddEvenChartInstance = new window.Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: ['홀:짝 3:3', '홀:짝 4:2', '홀:짝 2:4', '기타 편중'],
                            datasets: [{
                                data: [34.5, 23.8, 24.1, 17.6],
                                backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#64748b']
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 10 } } } }
                        }
                    });
                } catch(e){}
            }
        }

        if (sumChartInstance) {
            try {
                sumChartInstance.resize();
                sumChartInstance.update();
            } catch(e){}
        } else {
            const sumDistChartEl = document.getElementById('sumDistChart');
            if (sumDistChartEl) {
                const ctx = sumDistChartEl.getContext('2d');
                try {
                    sumChartInstance = new window.Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ['~90', '90-110', '110-130', '130-150', '150-170', '170-190', '190+'],
                            datasets: [{
                                label: '출현 빈도수 (%)',
                                data: [4.2, 14.1, 28.5, 29.2, 16.4, 6.1, 1.5],
                                borderColor: '#818cf8',
                                backgroundColor: 'rgba(129, 140, 248, 0.15)',
                                fill: true,
                                tension: 0.4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { display: false } },
                                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
                            }
                        }
                    });
                } catch(e){}
            }
        }
    }

    if (typeof window.initHexMap === 'function') {
        window.initHexMap();
    } else if (typeof window.renderHexFreqMap === 'function') {
        window.renderHexFreqMap();
    }
}
