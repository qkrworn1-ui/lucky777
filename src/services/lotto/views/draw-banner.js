import { state } from '../state.js';
import { getBallColorClass, getDrawDateByRound, getNextSaturdayDate } from '../../../shared/utils.js';
import { db } from '../../../shared/db.js';
import { fetchFullPrizeDetailsFromHTML } from '../scraper.js';
import { evaluateRoundCoreHitReport } from '../generator.js';

let isBannerCoreDetailOpen = false;

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

    // ⏱️ Start Live Countdown for Recommended Next Round Draw
    startNextDrawCountdown(nextRound);

    const heroMaxRound = document.getElementById('heroMaxRound');
    if (heroMaxRound) heroMaxRound.textContent = state.latestDrawData.drwNo.toLocaleString();
    const simHistoryMaxRound = document.getElementById('simHistoryMaxRound');
    if (simHistoryMaxRound) simHistoryMaxRound.textContent = state.latestDrawData.drwNo.toLocaleString();
    const simTotalDraws = document.getElementById('simTotalDraws');
    if (simTotalDraws) simTotalDraws.textContent = `${state.latestDrawData.drwNo.toLocaleString()} 회`;

    const coreReport = (typeof evaluateRoundCoreHitReport === 'function')
        ? evaluateRoundCoreHitReport(state.latestDrawData.drwNo)
        : null;
    const core6Set = new Set((coreReport && Array.isArray(coreReport.top6Items)) ? coreReport.top6Items.map(x => x.n) : []);
    const sup10Set = new Set((coreReport && Array.isArray(coreReport.support10Items)) ? coreReport.support10Items.map(x => x.n) : []);

    const ballsContainer = document.getElementById('latestDrawBalls');
    if (ballsContainer) {
        const formatBannerBall = (n, isBonus = false) => {
            const isCore = core6Set.has(n);
            const isSup = !isCore && sup10Set.has(n);
            const hitCls = isCore ? 'banner-hit-core' : (isSup ? 'banner-hit-sup' : '');
            const tagHtml = isCore
                ? '<span class="banner-hit-tag tag-core">핵</span>'
                : (isSup ? '<span class="banner-hit-tag tag-sup">보</span>' : '');
            const titleAttr = isBonus
                ? (isCore ? '보너스 (핵심코어 적중)' : (isSup ? '보너스 (보조코어 적중)' : '보너스 번호'))
                : (isCore ? '핵심코어 6수 적중' : (isSup ? '보조코어 10수 적중' : ''));
            return `<div class="ball-mono lotto-ball sm-ball ${getBallColorClass(n)} ${hitCls}" ${titleAttr ? `title="${titleAttr}"` : ''}>${n.toString().padStart(2, '0')}${tagHtml}</div>`;
        };

        const mainBallsHTML = state.latestDrawData.numbers.map(n => formatBannerBall(n, false)).join('');
        const bonusBallHTML = `<span class="plus-symbol">+</span>` + formatBannerBall(state.latestDrawData.bonus, true);

        ballsContainer.innerHTML = mainBallsHTML + bonusBallHTML;
        ballsContainer.style.cursor = 'pointer';
        ballsContainer.title = '클릭 시 동행복권 최신 당첨번호 자동 스크랩 & 동기화';
        ballsContainer.onclick = function(e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof window.handleFetchLatestDrawClick === 'function') {
                window.handleFetchLatestDrawClick();
            }
        };
    }

    const chipEl = document.getElementById('latestBannerCoreHitChip');
    if (chipEl) {
        if (coreReport) {
            const cParts = [
                ...(coreReport.core6MainHits || []).map(String),
                ...(coreReport.core6BonusHits || []).map(n => `${n}+`)
            ];
            const sParts = [
                ...(coreReport.support10MainHits || []).map(String),
                ...(coreReport.support10BonusHits || []).map(n => `${n}+`)
            ];
            if (cParts.length === 0 && sParts.length === 0) {
                chipEl.innerHTML = `<span class="chip-none">코어 미적중</span>`;
            } else {
                const segs = [];
                if (cParts.length > 0) segs.push(`<span class="chip-core">핵심 ${cParts.join(',')}</span>`);
                if (sParts.length > 0) segs.push(`<span class="chip-sup">보조 ${sParts.join(',')}</span>`);
                chipEl.innerHTML = segs.join('<span class="chip-sep">·</span>');
            }
            chipEl.style.display = 'inline-flex';
        } else {
            chipEl.style.display = 'none';
        }
    }

    const bannerCenter = document.querySelector('.latest-draw-banner .banner-center');
    if (bannerCenter) {
        bannerCenter.style.cursor = 'pointer';
        bannerCenter.title = '클릭 시 동행복권 최신 당첨번호 자동 스크랩 & 동기화';
        bannerCenter.onclick = function(e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof window.handleFetchLatestDrawClick === 'function') {
                window.handleFetchLatestDrawClick();
            }
        };
    }

    const latestTitle = document.querySelector('.latest-draw-banner .latest-title');
    if (latestTitle) {
        latestTitle.style.cursor = 'pointer';
        latestTitle.title = '클릭 시 동행복권 최신 당첨번호 자동 스크랩 & 동기화';
        latestTitle.onclick = function(e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof window.handleFetchLatestDrawClick === 'function') {
                window.handleFetchLatestDrawClick();
            }
        };
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

    renderLatestDrawCoreHitPanel(state.latestDrawData.drwNo);
}

/**
 * 🎯 상단 최신 추첨 배너(#latestDrawCoreHitPanel) 및 홈 랜딩(#lpCoreHitSummaryStrip)에
 *    해당 추첨 완료 회차의 핵심 코어 6수 & 보조 코어 10수 적중 성적표 렌더링
 */
export function renderLatestDrawCoreHitPanel(roundNum = null) {
    if (typeof evaluateRoundCoreHitReport !== 'function') return;
    const report = evaluateRoundCoreHitReport(roundNum);

    const lpStripEl = document.getElementById('lpCoreHitSummaryStrip');
    const bannerPanelEl = document.getElementById('latestDrawCoreHitPanel');

    if (!report) {
        if (lpStripEl) lpStripEl.style.display = 'none';
        if (bannerPanelEl) bannerPanelEl.style.display = 'none';
        return;
    }

    // 1. 홈 랜딩 대시보드 요약 스트립 (#lpCoreHitSummaryStrip)
    if (lpStripEl) {
        lpStripEl.style.display = 'block';
        lpStripEl.innerHTML = `
            <div class="lp-core-hit-strip-inner" onclick="if(window.showLotto){ window.showLotto(); setTimeout(() => { if(window.switchTab) window.switchTab('tab-generator'); if(window.switchWeeklyCoreCardMode) window.switchWeeklyCoreCardMode('review'); }, 80); }">
                <div class="lp-core-hit-left">
                    <span class="lp-core-hit-icon">🎯</span>
                    <div class="lp-core-hit-texts">
                        <div class="lp-core-hit-title-row">
                            <span class="lp-core-hit-title">제 ${report.round}회 AI 코어 16 적중 리포트</span>
                            <span class="lp-core-hit-badge">총 ${report.totalHits}/7 적중</span>
                        </div>
                        <div class="lp-core-hit-sub">
                            핵심 코어 ${report.core6SummaryText} · 보조 코어 ${report.support10SummaryText} ➔ <strong>${report.wheelSummaryText}</strong>
                        </div>
                    </div>
                </div>
                <span class="lp-core-hit-action">성적표 &gt;</span>
            </div>
        `;
    }

    // 2. 상단 최신 추첨 배너 하단 코어 적중 아코디언 (#latestDrawCoreHitPanel)
    if (!bannerPanelEl) return;
    bannerPanelEl.style.display = 'block';

    const buildHitBallChip = (item) => {
        const isMain = item.hitType === 'main';
        const isBon = item.hitType === 'bonus';
        const textColor = (item.n <= 10) ? '#0f172a' : '#ffffff';
        const stateCls = isMain ? 'is-hit-main' : (isBon ? 'is-hit-bonus' : 'is-hit-miss');
        const badgeHtml = isMain
            ? '<span class="core-hit-tag tag-main">본번호 적중</span>'
            : (isBon
                ? '<span class="core-hit-tag tag-bonus">보너스 적중</span>'
                : '<span class="core-hit-tag tag-miss">미출현</span>');

        return `
            <div class="banner-core-hit-chip ${stateCls}">
                <span class="lotto-ball lotto-ball-sm ${getBallColorClass(item.n)} banner-core-ball" style="color: ${textColor};">
                    ${item.n}
                </span>
                ${badgeHtml}
            </div>
        `;
    };

    const core6ChipsHtml = report.top6Items.map(buildHitBallChip).join('');
    const support10ChipsHtml = report.support10Items.map(buildHitBallChip).join('');

    const core6HitNumsStr = [...report.core6MainHits.map(n => `${n}번`), ...report.core6BonusHits.map(n => `${n}번(보)`)].join(', ');
    const sup10HitNumsStr = [...report.support10MainHits.map(n => `${n}번`), ...report.support10BonusHits.map(n => `${n}번(보)`)].join(', ');

    bannerPanelEl.innerHTML = `
        <div class="banner-core-hit-box">
            <div class="banner-core-hit-bar">
                <div class="banner-core-hit-bar-left">
                    <span class="banner-core-round-pill"><i class="fa-solid fa-bullseye"></i> 제 ${report.round}회 코어 16 적중 성적</span>
                    <span class="banner-core-summary-txt">
                        핵심 6수 중 <strong>${report.core6MainHits.length + report.core6BonusHits.length}개</strong> · 보조 10수 중 <strong>${report.support10MainHits.length + report.support10BonusHits.length}개</strong> 적중 ➔ <strong class="text-gold">${report.wheelSummaryText}</strong>
                    </span>
                </div>
                <button type="button" onclick="event.stopPropagation(); window.toggleLatestDrawCoreHitDetails && window.toggleLatestDrawCoreHitDetails()" class="banner-core-toggle-btn">
                    <span id="lblBannerCoreToggle">${isBannerCoreDetailOpen ? '적중 상세 접기 ▲' : '적중 상세 펼치기 ▼'}</span>
                </button>
            </div>

            <div id="latestDrawCoreHitDetailBox" class="banner-core-detail-body" style="display: ${isBannerCoreDetailOpen ? 'flex' : 'none'};">
                <div class="banner-core-kpi-grid">
                    <div class="banner-core-kpi-card">
                        <div class="kpi-lbl">핵심 코어 6수 적중</div>
                        <div class="kpi-val is-gold">${report.core6SummaryText}</div>
                        <div class="kpi-sub">${core6HitNumsStr ? `적중: ${core6HitNumsStr}` : '#1번 직결 조합 탑재'}</div>
                    </div>
                    <div class="banner-core-kpi-card">
                        <div class="kpi-lbl">보조 코어 10수 적중</div>
                        <div class="kpi-val">${report.support10SummaryText}</div>
                        <div class="kpi-sub">${sup10HitNumsStr ? `적중: ${sup10HitNumsStr}` : '29게임 휠 커버링'}</div>
                    </div>
                    <div class="banner-core-kpi-card">
                        <div class="kpi-lbl">16수 풀 종합 포착률</div>
                        <div class="kpi-val is-green">총 ${report.totalHits} / 7수 포착</div>
                        <div class="kpi-sub">본번호 ${report.totalMainHits}개${report.totalBonusHits ? ` + 보너스 ${report.totalBonusHits}개` : ''}</div>
                    </div>
                    <div class="banner-core-kpi-card">
                        <div class="kpi-lbl">30게임 휠 당첨 성과</div>
                        <div class="kpi-val is-blue">${report.wheelSummaryText}</div>
                        <div class="kpi-sub">${report.wheelDetailText}</div>
                    </div>
                </div>

                <div class="banner-core-group">
                    <div class="banner-core-group-head">
                        <span class="head-title is-gold">★ 핵심 코어 TOP 6 적중 대조 (1번 게임 직결)</span>
                        <span class="head-count">적중 ${report.core6MainHits.length + report.core6BonusHits.length}수 / 총 ${report.top6Items.length}수</span>
                    </div>
                    <div class="banner-core-balls-row">${core6ChipsHtml}</div>
                </div>

                <div class="banner-core-group is-support">
                    <div class="banner-core-group-head">
                        <span class="head-title">보조 코어 10수 적중 대조 (30게임 휠 분산)</span>
                        <span class="head-count">적중 ${report.support10MainHits.length + report.support10BonusHits.length}수 / 총 ${report.support10Items.length}수</span>
                    </div>
                    <div class="banner-core-balls-row">${support10ChipsHtml}</div>
                </div>
            </div>
        </div>
    `;
}

export function toggleLatestDrawCoreHitDetails(forceState = null) {
    if (typeof forceState === 'boolean') {
        isBannerCoreDetailOpen = forceState;
    } else {
        isBannerCoreDetailOpen = !isBannerCoreDetailOpen;
    }
    const detailEl = document.getElementById('latestDrawCoreHitDetailBox');
    const lblEl = document.getElementById('lblBannerCoreToggle');
    if (detailEl) {
        detailEl.style.display = isBannerCoreDetailOpen ? 'flex' : 'none';
    }
    if (lblEl) {
        lblEl.textContent = isBannerCoreDetailOpen ? '적중 상세 접기 ▲' : '적중 상세 펼치기 ▼';
    }
}

let headerCountdownInterval = null;

/**
 * ⏱️ Live Countdown Timer for Recommended Draw Round (Saturday 20:35 KST)
 */
export function startNextDrawCountdown(nextRound) {
    if (headerCountdownInterval) {
        clearInterval(headerCountdownInterval);
        headerCountdownInterval = null;
    }

    const pad = (n) => String(n).padStart(2, '0');

    function update() {
        const now = new Date();
        const dateStr = getDrawDateByRound(nextRound);
        let target;
        if (dateStr) {
            const parts = dateStr.split('-').map(Number);
            target = new Date(parts[0], parts[1] - 1, parts[2], 20, 35, 0);
        } else {
            target = getNextSaturdayDate(now);
        }

        const diffMs = target.getTime() - now.getTime();

        const elHeaderCount = document.getElementById('nextDrawCountdownText');
        const elGenRound = document.getElementById('lblGeneratorTargetRound');
        const elGenTime = document.getElementById('lblGeneratorCountdownTime');
        const elMobileRound = document.getElementById('lblMobileHeaderRound');
        const elMobileDday = document.getElementById('lblMobileHeaderDday');
        const elMobileCount = document.getElementById('lblMobileHeaderCountdown');

        if (elGenRound) {
            elGenRound.textContent = `제 ${nextRound}회`;
        }
        if (elMobileRound) {
            elMobileRound.textContent = `${nextRound}회`;
        }

        if (diffMs <= 0) {
            const liveText = '추첨 진행 중 (LIVE)';
            if (elHeaderCount) elHeaderCount.textContent = liveText;
            if (elGenTime) elGenTime.textContent = liveText;
            if (elMobileDday) elMobileDday.textContent = 'LIVE';
            if (elMobileCount) elMobileCount.textContent = '추첨중';
            return;
        }

        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

        const shortStr = `${days > 0 ? days + '일 ' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
        const longStr = `${days > 0 ? days + '일 ' : ''}${pad(hours)}시간 ${pad(minutes)}분 ${pad(seconds)}초`;

        if (elHeaderCount) elHeaderCount.textContent = `남은시간 ${shortStr}`;
        if (elGenTime) elGenTime.textContent = longStr;
        if (elMobileDday) elMobileDday.textContent = days > 0 ? `D-${days}` : 'D-DAY';
        if (elMobileCount) elMobileCount.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }

    update();
    headerCountdownInterval = setInterval(update, 1000);
}

if (typeof window !== 'undefined') {
    window.startNextDrawCountdown = startNextDrawCountdown;
    window.renderLatestDrawCoreHitPanel = renderLatestDrawCoreHitPanel;
    window.toggleLatestDrawCoreHitDetails = toggleLatestDrawCoreHitDetails;
}

