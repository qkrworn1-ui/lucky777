import { state } from '../state.js';

let _histPage = 1;
const _HIST_PAGE_SIZE = 20;
let _histSortDesc = true;
let _histQuery = '';

function _getBallColorClass(n) {
    if (n <= 10) return 'num-1-10';
    if (n <= 20) return 'num-11-20';
    if (n <= 30) return 'num-21-30';
    if (n <= 40) return 'num-31-40';
    return 'num-41-45';
}

function _formatKrwShort(amount) {
    const num = Number(amount || 0);
    if (!Number.isFinite(num) || num <= 0) return '';
    if (num >= 100000000) {
        const eok = (num / 100000000).toFixed(1).replace(/\.0$/, '');
        return `${eok}억원`;
    }
    if (num >= 10000) {
        return `${Math.round(num / 10000).toLocaleString()}만원`;
    }
    return `${num.toLocaleString()}원`;
}

function _parseHistoryRows() {
    const src = (state && state.mergedHistory && Object.keys(state.mergedHistory).length > 0)
        ? state.mergedHistory
        : (typeof window !== 'undefined' && window.LOTTO_HISTORY ? window.LOTTO_HISTORY : {});

    const rows = [];
    for (const [k, v] of Object.entries(src)) {
        const round = parseInt(k, 10);
        if (!Number.isFinite(round) || round <= 0) continue;
        if (!v || !Array.isArray(v.numbers) || v.numbers.length !== 6) continue;
        rows.push({
            round,
            numbers: v.numbers.map(Number),
            bonus: Number(v.bonus || 0),
            date: v.date || '',
            rank1Prize: Number(v.rank1Prize || v.firstWinamnt || 0),
            rank1Winners: Number(v.rank1Winners || v.firstPrzwnerCo || 0)
        });
    }
    rows.sort((a, b) => _histSortDesc ? (b.round - a.round) : (a.round - b.round));
    return rows;
}

function _filterRows(rows, query) {
    const q = String(query || '').trim();
    if (!q) return rows;
    if (/^\d+$/.test(q) && q.length >= 3) {
        return rows.filter(r => String(r.round).includes(q));
    }
    const nums = q.split(/[\s,]+/).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= 45);
    if (nums.length > 0 && !/^\d{3,}$/.test(q)) {
        return rows.filter(r => nums.every(n => r.numbers.includes(n) || r.bonus === n));
    }
    return rows.filter(r => String(r.round).includes(q));
}

export function renderHistoryTab() {
    const container = document.getElementById('historyListContainer');
    const summaryEl = document.getElementById('historySummaryText');
    const pageInfoEl = document.getElementById('historyPageInfo');
    const prevBtn = document.getElementById('btnHistoryPrevPage');
    const nextBtn = document.getElementById('btnHistoryNextPage');
    if (!container) return;

    const allRows = _parseHistoryRows();
    const filtered = _filterRows(allRows, _histQuery);
    const totalPages = Math.max(1, Math.ceil(filtered.length / _HIST_PAGE_SIZE));
    if (_histPage > totalPages) _histPage = totalPages;
    if (_histPage < 1) _histPage = 1;

    const startIdx = (_histPage - 1) * _HIST_PAGE_SIZE;
    const pageRows = filtered.slice(startIdx, startIdx + _HIST_PAGE_SIZE);

    if (summaryEl) {
        const latestR = allRows.length ? Math.max(...allRows.map(r => r.round)) : 0;
        summaryEl.textContent = _histQuery
            ? `검색 결과 ${filtered.length.toLocaleString()}회차 (전체 1~${latestR}회)`
            : `총 ${allRows.length.toLocaleString()}회차 (1~${latestR}회)`;
    }
    if (pageInfoEl) {
        pageInfoEl.textContent = `${_histPage} / ${totalPages} 페이지`;
    }
    if (prevBtn) prevBtn.disabled = (_histPage <= 1);
    if (nextBtn) nextBtn.disabled = (_histPage >= totalPages);

    if (pageRows.length === 0) {
        container.innerHTML = `<div class="history-empty-state">조건에 맞는 당첨 회차가 없습니다.</div>`;
        return;
    }

    container.innerHTML = pageRows.map(r => {
        const ballsHtml = r.numbers.map(n =>
            `<span class="lotto-ball history-ball ${_getBallColorClass(n)}">${n}</span>`
        ).join('');
        const bonusHtml = r.bonus > 0
            ? `<span class="history-plus">+</span><span class="lotto-ball history-ball ${_getBallColorClass(r.bonus)} is-bonus" title="보너스 번호">${r.bonus}</span>`
            : '';

        const hasPrize = r.rank1Prize > 0;
        const hasWinners = r.rank1Winners > 0;
        let detailHtml = '';
        if (hasPrize) {
            const shortAmt = _formatKrwShort(r.rank1Prize);
            const exactAmt = `${r.rank1Prize.toLocaleString()}원`;
            const winTxt = hasWinners ? ` · ${r.rank1Winners}명` : '';
            detailHtml = `
                <div class="history-prize-meta" title="1등 1인당 실수령 기준: ${exactAmt}">
                    <span class="hist-prize-badge">1등 ${shortAmt}${winTxt}</span>
                    <span class="hist-prize-exact">(${exactAmt})</span>
                </div>`;
        } else if (hasWinners) {
            detailHtml = `
                <div class="history-prize-meta">
                    <span class="hist-prize-badge">1등 ${r.rank1Winners}명</span>
                </div>`;
        }

        return `
            <div class="history-draw-row">
                <div class="history-draw-head">
                    <span class="history-round-label">제 ${r.round}회</span>
                    ${r.date ? `<span class="history-date-label">${r.date}</span>` : ''}
                </div>
                <div class="history-balls-wrap">
                    ${ballsHtml}
                    ${bonusHtml}
                </div>
                ${detailHtml}
            </div>`;
    }).join('');
}

export function setupHistoryTabEvents() {
    const searchInput = document.getElementById('historySearchInput');
    const sortBtn = document.getElementById('btnHistorySortToggle');
    const prevBtn = document.getElementById('btnHistoryPrevPage');
    const nextBtn = document.getElementById('btnHistoryNextPage');

    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = '1';
        searchInput.addEventListener('input', (e) => {
            _histQuery = e.target.value || '';
            _histPage = 1;
            renderHistoryTab();
        });
    }
    if (sortBtn && !sortBtn.dataset.bound) {
        sortBtn.dataset.bound = '1';
        sortBtn.addEventListener('click', () => {
            _histSortDesc = !_histSortDesc;
            _histPage = 1;
            sortBtn.innerHTML = _histSortDesc
                ? '<i class="fa-solid fa-arrow-down-9-1"></i> 최신순'
                : '<i class="fa-solid fa-arrow-up-1-9"></i> 1회차부터';
            renderHistoryTab();
        });
    }
    if (prevBtn && !prevBtn.dataset.bound) {
        prevBtn.dataset.bound = '1';
        prevBtn.addEventListener('click', () => {
            if (_histPage > 1) {
                _histPage--;
                renderHistoryTab();
            }
        });
    }
    if (nextBtn && !nextBtn.dataset.bound) {
        nextBtn.dataset.bound = '1';
        nextBtn.addEventListener('click', () => {
            _histPage++;
            renderHistoryTab();
        });
    }
}
