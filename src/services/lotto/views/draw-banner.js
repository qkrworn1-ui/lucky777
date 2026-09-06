import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, getDrawDateByRound, calculateACValue, removeUndefined } from '../../../shared/utils.js';
import { db } from '../../../shared/db.js';
import { getLedger, saveToLedger, getComboNumbers, getHistoricalTop10Combinations } from '../ledger.js';
import { computeAbsoluteTop10Combinations } from '../generator.js';
import { recalculateGroups } from '../statistics.js';
import { fetchFullPrizeDetailsFromHTML } from '../scraper.js';

export function renderLatestDrawBanner() {
    if (!state.latestDrawData) {
        // Auto-populate from mergedHistory
        const rounds = Object.keys(state.mergedHistory || {})
            .map(Number)
            .filter(r => !isNaN(r) && state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers))
            .sort((a,b) => a - b);
        if (rounds.length > 0) {
            const maxR = rounds[rounds.length - 1];
            const d = state.mergedHistory[maxR];
            if (d && Array.isArray(d.numbers)) {
                state.latestDrawData = {
                    drwNo: maxR,
                    drwNoDate: d.date || d.drwNoDate || '',
                    numbers: d.numbers,
                    bonus: d.bonus,
                    firstWinamnt: d.firstWinamnt || d.rank1Prize || 0,
                    firstPrzwnerCo: d.firstPrzwnerCo || d.rank1Winners || 0,
                    prizes: d.prizes || d.prizeInfo || null
                };
                state.PREVIOUS_DRAW = [...d.numbers];
            } else {
                return;
            }
        } else {
            return; // No data available yet
        }
    }
    const el_latestDrawNo = document.getElementById('latestDrawNo');
    if (el_latestDrawNo) el_latestDrawNo.textContent = `제 ${state.latestDrawData.drwNo}회`;
    const el_latestDrawDateText = document.getElementById('latestDrawDateText');
    if (el_latestDrawDateText) el_latestDrawDateText.textContent = state.latestDrawData.drwNoDate;

    // ⚡ Dynamically update top-right Next Draw Badge with exact upcoming round & draw date
    const nextRound = state.latestDrawData.drwNo + 1;
    const nextDrawDateStr = getDrawDateByRound(nextRound);
    
    const el_nextDrawText = document.getElementById('nextDrawText');
    if (el_nextDrawText) {
        el_nextDrawText.textContent = `제 ${nextRound} 회 추첨`;
    }
    const el_nextDrawDate = document.getElementById('nextDrawDate');
    if (el_nextDrawDate && nextDrawDateStr) {
        const formattedDate = nextDrawDateStr.replace(/-/g, '. ');
        el_nextDrawDate.textContent = `${formattedDate} (토) 20:35`;
    }

    const heroMaxRound = document.getElementById('heroMaxRound');
    if (heroMaxRound) heroMaxRound.textContent = state.latestDrawData.drwNo.toLocaleString();
    const simHistoryMaxRound = document.getElementById('simHistoryMaxRound');
    if (simHistoryMaxRound) simHistoryMaxRound.textContent = state.latestDrawData.drwNo.toLocaleString();
    const simTotalDraws = document.getElementById('simTotalDraws');
    if (simTotalDraws) simTotalDraws.textContent = `${state.latestDrawData.drwNo.toLocaleString()} 회`;

    const ballsContainer = document.getElementById('latestDrawBalls');
    if (ballsContainer) {
        const mainBallsHTML = state.latestDrawData.numbers.map(n => `
            <div class="lotto-ball sm-ball ${getBallColorClass(n)}">${n}</div>
        `).join('');

        const bonusBallHTML = `
            <span class="plus-symbol">+</span>
            <div class="lotto-ball sm-ball ${getBallColorClass(state.latestDrawData.bonus)}" title="보너스 번호">${state.latestDrawData.bonus}</div>
        `;

        ballsContainer.innerHTML = mainBallsHTML + bonusBallHTML;
    }

    const el_latestPrizeAmount = document.getElementById('latestPrizeAmount');
    const el_latestWinnersCount = document.getElementById('latestWinnersCount');
    const btnToggle = document.getElementById('btnTogglePrizeDetails');
    const detailsPanel = document.getElementById('latestDrawPrizeDetails');
    const tableBody = document.getElementById('latestDrawPrizeTableBody');

    const firstPrize = state.latestDrawData.firstWinamnt || state.latestDrawData.rank1Prize || 0;
    const isManualEntry = state.latestDrawData.isManual === true || firstPrize === 0;

    if (isManualEntry) {
        if (el_latestPrizeAmount) el_latestPrizeAmount.textContent = `- 억원`;
        if (el_latestWinnersCount) el_latestWinnersCount.textContent = `당첨금 정보 없음 (수동 등록 회차)`;
        if (btnToggle) btnToggle.style.display = 'none';
        if (detailsPanel) detailsPanel.style.display = 'none';
    } else {
        const eon = (firstPrize / 100000000).toFixed(1);
        if (el_latestPrizeAmount) el_latestPrizeAmount.textContent = `${eon} 억원`;
        const winners = state.latestDrawData.firstPrzwnerCo || state.latestDrawData.rank1Winners || 0;
        if (el_latestWinnersCount) el_latestWinnersCount.textContent = `1등 당첨자 ${winners}명`;
        if (btnToggle) btnToggle.style.display = 'inline-block';
    }

    // Initialize toggle button and lazy load details
    if (btnToggle && btnToggle.parentNode && detailsPanel && tableBody) {
        const newBtnToggle = btnToggle.cloneNode(true);
        btnToggle.parentNode.replaceChild(newBtnToggle, btnToggle);
        
        newBtnToggle.addEventListener('click', async () => {
            if (detailsPanel.style.display === 'none') {
                detailsPanel.style.display = 'block';
                newBtnToggle.innerHTML = `<i class="fa-solid fa-circle-chevron-up"></i> 등수별 당첨금 접기`;
                
                const r = state.latestDrawData.drwNo;
                let targetDraw = state.mergedHistory[r] || {};
                let info = targetDraw.prizes || targetDraw.prizeInfo;
                
                if (!info) {
                    tableBody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> 실시간 당첨 정보 스크랩 중...</td></tr>`;
                    info = await fetchFullPrizeDetailsFromHTML(r);
                    if (info) {
                        targetDraw.prizes = info;
                        targetDraw.prizeInfo = info;
                        if (db && typeof db.set === 'function') {
                            db.set('lotto_draw_history', 'extra_history', state.lottoExtraHistory).catch(console.error);
                        }
                    }
                }
                
                if (info) {
                    tableBody.innerHTML = `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="padding: 8px 12px; font-weight: 800; color: #fbbf24;">1등</td>
                            <td style="padding: 8px 12px; color: var(--text-secondary);">6개 번호 일치</td>
                            <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #fff;">${info['1'] ? (info['1'].winners || 0) : state.latestDrawData.firstPrzwnerCo}명</td>
                            <td style="padding: 8px 12px; text-align: right; color: #fbbf24; font-weight: 800;">${info['1'] ? (info['1'].prizeStr || info['1'].prize.toLocaleString() + '원') : (firstPrize.toLocaleString() + '원')}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="padding: 8px 12px; font-weight: 800; color: #60a5fa;">2등</td>
                            <td style="padding: 8px 12px; color: var(--text-secondary);">5개 + 보너스 일치</td>
                            <td style="padding: 8px 12px; text-align: right; color: #cbd5e1;">${info['2'] ? (info['2'].winners || 0) : '-'}명</td>
                            <td style="padding: 8px 12px; text-align: right; color: #60a5fa; font-weight: 700;">${info['2'] ? (info['2'].prizeStr || info['2'].prize.toLocaleString() + '원') : '-'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="padding: 8px 12px; font-weight: 800; color: #fb923c;">3등</td>
                            <td style="padding: 8px 12px; color: var(--text-secondary);">5개 번호 일치</td>
                            <td style="padding: 8px 12px; text-align: right; color: #cbd5e1;">${info['3'] ? (info['3'].winners || 0) : '-'}명</td>
                            <td style="padding: 8px 12px; text-align: right; color: #fb923c; font-weight: 700;">${info['3'] ? (info['3'].prizeStr || info['3'].prize.toLocaleString() + '원') : '-'}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="padding: 8px 12px; font-weight: 800; color: #4ade80;">4등</td>
                            <td style="padding: 8px 12px; color: var(--text-secondary);">4개 번호 일치</td>
                            <td style="padding: 8px 12px; text-align: right; color: #cbd5e1;">${info['4'] ? (info['4'].winners || 0) : '-'}명</td>
                            <td style="padding: 8px 12px; text-align: right; color: #4ade80; font-weight: 700;">${info['4'] ? (info['4'].prizeStr || '50,000원') : '50,000원'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; font-weight: 800; color: #94a3b8;">5등</td>
                            <td style="padding: 8px 12px; color: var(--text-secondary);">3개 번호 일치</td>
                            <td style="padding: 8px 12px; text-align: right; color: #cbd5e1;">${info['5'] ? (info['5'].winners || 0) : '-'}명</td>
                            <td style="padding: 8px 12px; text-align: right; color: #94a3b8; font-weight: 700;">${info['5'] ? (info['5'].prizeStr || '5,000원') : '5,000원'}</td>
                        </tr>
                    `;
                } else {
                    tableBody.innerHTML = `<tr><td colspan="4" style="padding: 15px; text-align: center; color: var(--text-secondary);">⚠️ 상세 정보를 불러올 수 없습니다.</td></tr>`;
                }
            } else {
                detailsPanel.style.display = 'none';
                newBtnToggle.innerHTML = `<i class="fa-solid fa-circle-info"></i> 등수별 당첨금 상세 보기`;
            }
        });
    }
}
