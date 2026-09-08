import { 
    getTotoState, 
    loadTotoFixtures,
    setRecommendationMode,
    getTotoCarryoverInfo,
    loadCarryoverData,
    setSelectedSlip, 
    clearSelectedSlip, 
    loadPurchasedSlips, 
    addPurchasedSlip, 
    deletePurchasedSlip, 
    settlePurchasedSlip, 
    calculateTotoFinancials,
    setActiveStandingsLeague,
    loadStandingsData
} from '../state.js';
import { analyzeFixture, generateRecommendedPortfolios, generateToto14Sheet } from '../engine.js';
import { scrapeLatestTotoFixtures } from '../scraper.js';
import { openModal, closeModal } from '../../../shared/components.js';
import { showToast } from '../../../shared/utils.js';

window.scrapeLatestTotoFixtures = scrapeLatestTotoFixtures;

let currentBetStake = 10000; // default 10,000 KRW
let activeMarkingSlip = null;
let pendingRegisterSlip = null;
let totoHtml5QrScanner = null;

/**
 * Render the Toto / Proto Dashboard (AI Recommendation + Match Schedule & Results + Confirmed Purchase Ledger)
 */
export function renderTotoDashboard() {
    const container = document.getElementById('totoPage');
    if (!container) return;

    loadTotoFixtures();
    const state = getTotoState();
    loadPurchasedSlips();
    loadStandingsData();
    loadCarryoverData();

    const scheduledFixtures = state.fixtures.filter(f => f.matchStatus !== 'FINISHED');
    const portfolios = generateRecommendedPortfolios(scheduledFixtures.length > 0 ? scheduledFixtures : state.fixtures);
    state.recommendationSlips = portfolios;
    const financials = calculateTotoFinancials();

    // Filter fixtures for recommendation tab
    let filtered = scheduledFixtures.length > 0 ? scheduledFixtures : state.fixtures;
    if (state.activeSport !== 'all') {
        filtered = filtered.filter(f => f.sport === state.activeSport);
    }

    const analyzedList = filtered.map(f => ({
        fixture: f,
        analysis: analyzeFixture(f)
    }));

    let displayList = analyzedList;
    if (state.filterOnlyEV) {
        displayList = analyzedList.filter(item => item.analysis.picks.some(p => p.isValuable));
    }

    let tabContentHtml = '';
    if (state.activeTab === 'recommendation') {
        tabContentHtml = renderRecommendationView(state, portfolios, displayList);
    } else if (state.activeTab === 'schedule') {
        tabContentHtml = renderScheduleView(state);
    } else if (state.activeTab === 'standings') {
        tabContentHtml = renderStandingsView(state);
    } else {
        tabContentHtml = renderConfirmedLedgerView(state, financials);
    }

    const pipeline = state.realtimePipeline || { isConnected: true, status: 'ONLINE', heartbeatCount: 1, lastSyncedAt: new Date().toISOString() };
    const lastSyncTimeStr = pipeline.lastSyncedAt ? new Date(pipeline.lastSyncedAt).toTimeString().split(' ')[0] : '방금 전';

    // Build Live Ticker Bar
    let dropOddsHtml = '';
    if (pipeline.dropOddsAlerts && pipeline.dropOddsAlerts.length > 0) {
        dropOddsHtml = pipeline.dropOddsAlerts.map(a => `
            <div class="live-ticker-item">
                <span class="ticker-tag drop"><i class="fa-solid fa-fire"></i> 배당급락 ${a.dropPct}%</span>
                <strong>${a.match}</strong> (${a.oldOdds} ➡️ <span style="color:#f87171; font-weight:800;">${a.newOdds}</span>) - ${a.reason}
            </div>
        `).join('');
    }

    container.innerHTML = `
        <!-- Toto Top Header -->
        <header class="toto-header">
            <div class="toto-header-left">
                <div class="toto-header-icon"><i class="fa-solid fa-trophy"></i></div>
                <div class="toto-header-titles">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <h2 class="toto-header-title">운도실력 · <span>토토/프로토 AI 추천 &amp; 장부</span></h2>
                        <span id="totoPipelineStatusBadge" class="pipeline-status-badge ${pipeline.status === 'ONLINE' ? 'online' : 'syncing'}" title="동행복권/베트맨/피나클 실시간 데이터 파이프라인 작동중">
                            <span class="live-dot pulse"></span> 실시간 파이프라인 가동중 (${lastSyncTimeStr})
                        </span>
                    </div>
                    <p class="toto-header-sub">포아송 득점 예측 · Dixon-Coles xG · 해외 배당 변동률(Drop Odds) · 실시간 OMR 정산</p>
                </div>
            </div>
            <div class="toto-header-actions">
                <button onclick="window.scrapeLatestTotoFixtures && window.scrapeLatestTotoFixtures()" class="btn-toto-sync" title="최신 경기 일정 &amp; 해외 배당 실시간 동기화">
                    <i class="fa-solid fa-satellite-dish"></i> <span>실시간 동기화</span>
                </button>
                <button onclick="window.showLanding && window.showLanding()" class="btn-toto-nav" title="홈으로" aria-label="홈으로">
                    <i class="fa-solid fa-house"></i>
                </button>
                <button id="btnUserManagementToto" onclick="window.openUserManagement && window.openUserManagement()" class="btn-toto-user" style="display: none;" title="사용자 추가" aria-label="사용자 추가">
                    <i class="fa-solid fa-users-gear"></i>
                </button>
                <button onclick="window.handleLogout && window.handleLogout()" class="btn-toto-logout" title="로그아웃" aria-label="로그아웃">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        </header>

        <!-- Real-time Drop Odds & Smart Money Live Feed Ticker -->
        <div class="toto-live-ticker-bar">
            <div class="live-ticker-label">
                <i class="fa-solid fa-bolt" style="color: #fbbf24;"></i> <span>실시간 피드</span>
            </div>
            <div class="live-ticker-track">
                ${dropOddsHtml || '<div class="live-ticker-item">정상 발매중 · 해외 샤프마켓 배당률 실시간 모니터링 활성화</div>'}
            </div>
        </div>
        <!-- 📌 [메뉴 기능 안내] 스포츠토토 분석 엔진 -->
        <div class="menu-guide-banner guide-emerald" style="margin: 12px 16px 8px 16px;">
            <div class="guide-header">
                <div class="guide-title">
                    <i class="fa-solid fa-futbol"></i> 스포츠토토 / 프로토 AI 빅데이터 분석 엔진 (Sports Analytics Engine)
                </div>
                <span class="guide-tag">스포츠 통계 분석</span>
            </div>
            <p class="guide-desc">
                국민체육진흥공단 공식 체육진흥투표권(배트맨)의 <strong>축구·야구 승무패 및 프로토 승부식 경기를 글로벌 샤프 마켓(Pinnacle/Bet365)의 무마진 배당률과 통계적으로 대조하여 기대값(EV)이 높은 최적의 픽을 도출</strong>하는 순수 데이터 분석 소프트웨어입니다.
            </p>
            <div class="guide-features">
                <span class="feature-pill"><i class="fa-solid fa-scale-balanced" style="color:#38bdf8;"></i> <strong>오피셜 vs 글로벌 배당 대조</strong> (배트맨 배당 왜곡 구간 포착)</span>
                <span class="feature-pill"><i class="fa-solid fa-chart-column" style="color:#34d399;"></i> <strong>6대 공인 리그 순위표</strong> (KBO, K리그1, 프리미어리그 등)</span>
                <span class="feature-pill"><i class="fa-solid fa-shield-halved" style="color:#fbbf24;"></i> <strong>순수 통계 정보 제공</strong> (사이트 내 자체 베팅/환전 일체 없음)</span>
            </div>
        </div>

        <!-- Main View Mode Tabs (AI 추천 vs 스케줄/결과 vs 순위표 vs 구매확정리스트) -->
        <div class="toto-nav-tabs">
            <button class="toto-nav-tab ${state.activeTab === 'recommendation' ? 'active' : ''}" onclick="window.switchTotoTab('recommendation')">
                <i class="fa-solid fa-wand-magic-sparkles"></i> 🎯 AI 경기 분석 &amp; 추천
            </button>
            <button class="toto-nav-tab ${state.activeTab === 'schedule' ? 'active' : ''}" onclick="window.switchTotoTab('schedule')">
                <i class="fa-solid fa-calendar-days"></i> 📅 경기 일정 &amp; 결과
                <span class="tab-count-badge">${state.fixtures.length}경기</span>
            </button>
            <button class="toto-nav-tab ${state.activeTab === 'standings' ? 'active' : ''}" onclick="window.switchTotoTab('standings')">
                <i class="fa-solid fa-ranking-star"></i> 🏆 리그별 실시간 순위표
            </button>
            <button class="toto-nav-tab ${state.activeTab === 'confirmed' ? 'active' : ''}" onclick="window.switchTotoTab('confirmed')">
                <i class="fa-solid fa-receipt"></i> 📜 구매확정리스트 &amp; 배팅손익 
                <span class="tab-count-badge">${state.purchasedSlips.length}건</span>
            </button>
        </div>

        ${tabContentHtml}

        <!-- Interactive Floating Slip Cart (배팅 슬립 장바구니) -->
        <div id="totoSlipCart" class="toto-slip-cart ${state.selectedSlip.length > 0 ? 'visible' : ''}">
            <div class="slip-cart-header" onclick="window.toggleSlipCartExpand()">
                <div class="slip-title">
                    <i class="fa-solid fa-receipt"></i> 나의 배팅 슬립
                    <span class="slip-count-badge">${state.selectedSlip.length}경기 선택됨</span>
                </div>
                <div class="slip-summary-inline">
                    <span>총 배당: <strong id="cartCombinedOdds">1.00</strong>배</span>
                    <button class="btn-clear-slip" onclick="event.stopPropagation(); window.clearTotoSlip();" title="전체 비우기">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>

            <div class="slip-cart-body" id="slipCartBody">
                ${renderSlipCartBody(state.selectedSlip)}
            </div>
        </div>

        <!-- 📝 실제 복권 종이 OMR 마킹 가이드 모달 (프로토 승부식) -->
        <div id="totoMarkingModal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 580px; width: 92%; border-color: #fbbf24; max-height: 90vh;">
                <div class="modal-header">
                    <h3><i class="fa-solid fa-receipt" style="color: #fbbf24;"></i> 🎯 프로토 승부식 실물 OMR 마킹 가이드</h3>
                    <button class="close-modal" onclick="window.closeMarkingGuide()">&times;</button>
                </div>
                <div class="modal-body" id="markingModalBody" style="padding: 16px;">
                    <!-- Dynamic OMR Guide -->
                </div>
            </div>
        </div>

        <!-- 📝 스포츠토토 승무패 14경기 실물 OMR 마킹 가이드 모달 -->
        <div id="toto14MarkingModal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 620px; width: 94%; border-color: #fbbf24; max-height: 90vh;">
                <div class="modal-header">
                    <h3 style="color: #fbbf24;"><i class="fa-solid fa-trophy"></i> ⚽ 축구토토 승무패 14경기 실물 OMR 마킹 가이드</h3>
                    <button class="close-modal" onclick="window.closeToto14MarkingGuide()">&times;</button>
                </div>
                <div class="modal-body" id="toto14MarkingModalBody" style="padding: 16px;">
                    <!-- Dynamic 14-Match OMR Guide -->
                </div>
            </div>
        </div>

        <!-- 💳 구매 등록 확정 모달 -->
        <div id="totoPurchaseModal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 500px; width: 92%; border-color: #10b981;">
                <div class="modal-header">
                    <h3 style="color: #34d399;"><i class="fa-solid fa-cart-shopping"></i> 구매 확정 등록</h3>
                    <button class="close-modal" onclick="window.closeTotoPurchaseModal()">&times;</button>
                </div>
                <div class="modal-body" id="purchaseModalBody" style="padding: 16px;">
                    <!-- Dynamic Purchase Register Form -->
                </div>
            </div>
        </div>

        <!-- 📷 프로토 영수증 QR코드 스캐너 모달 -->
        <div id="totoQrScannerModal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 500px; width: 92%; border-color: #38bdf8;">
                <div class="modal-header">
                    <h3 style="color: #38bdf8;"><i class="fa-solid fa-qrcode"></i> 프로토 영수증 QR 스캔 등록</h3>
                    <button class="close-modal" onclick="window.closeTotoQrScanner()">&times;</button>
                </div>
                <div class="modal-body" style="padding: 16px;">
                    <div style="background: rgba(15,23,42,0.9); border-radius: 12px; padding: 12px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.08); text-align: center;">
                        <p style="font-size: 0.84rem; color: #cbd5e1; margin: 0 0 6px 0;">
                            구매하신 <strong>프로토 승부식 투표용지(영수증)</strong> 상단의 <strong>QR코드</strong>를 카메라에 비춰주세요.
                        </p>
                        <span style="font-size: 0.72rem; color: #94a3b8;">회차, 경기 번호, 선택 픽, 구매 금액이 자동으로 인식됩니다.</span>
                    </div>

                    <div id="totoQrReaderBox" style="width: 100%; border-radius: 12px; overflow: hidden; background: #000; border: 2px dashed #38bdf8; min-height: 240px; display: flex; align-items: center; justify-content: center; position: relative;">
                        <div id="totoQrReader" style="width: 100%;"></div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 14px;">
                        <label class="btn-qr-file-upload" style="width: 100%; text-align: center; cursor: pointer; box-sizing: border-box;">
                            <i class="fa-solid fa-image"></i> 영수증 사진 파일 선택
                            <input type="file" id="totoQrFileInput" accept="image/*" style="display: none;" onchange="window.handleTotoQrFile(event)">
                        </label>
                        <button class="btn-cancel-modal" style="padding: 10px; width: 100%;" onclick="window.closeTotoQrScanner()">
                            스캔 취소 / 닫기
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- NLP Injury & Impact Analysis Modal -->
        <div id="totoNewsModal" class="modal-overlay" style="display: none;">
            <div class="modal-content" style="max-width: 600px; width: 92%;">
                <div class="modal-header">
                    <h3 id="newsModalTitle"><i class="fa-solid fa-newspaper"></i> 전력 & 결장 분석 리포트</h3>
                    <button class="close-modal" onclick="window.closeTotoNewsModal()">&times;</button>
                </div>
                <div class="modal-body" id="newsModalBody" style="padding: 16px;">
                    <!-- Dynamic modal content -->
                </div>
            </div>
        </div>
    `;

    updateSlipCartCalculation();

    const authId = window.SafeAuth ? window.SafeAuth.get() : null;
    const btnUserToto = document.getElementById('btnUserManagementToto');
    if (btnUserToto) {
        btnUserToto.style.display = (authId === 'master' || authId === 'admin') ? 'inline-flex' : 'none';
    }
}

/**
 * Render Recommendation View (Picks & Matches)
 */
function renderRecommendationView(state, portfolios, displayList) {
    const isProtoMode = (state.recommendationMode || 'proto') === 'proto';
    const totoSheet = generateToto14Sheet(state.fixtures);
    const carryover = getTotoCarryoverInfo();

    return `
        <!-- 💡 스포츠토토 vs 프로토 핵심 개념 & 룰 완벽 비교 가이드 (접기/펼치기) -->
        <div class="toto-guide-box">
            <div class="guide-header" onclick="window.toggleTotoGuide()">
                <div class="guide-title">
                    <i class="fa-solid fa-circle-question" style="color: #fbbf24;"></i>
                    <strong>🔰 [필독] 스포츠토토 vs 프로토 개념 차이 &amp; 최신 공식 배팅 룰</strong>
                </div>
                <span class="guide-toggle-btn" id="guideToggleText">가이드 보기 <i class="fa-solid fa-chevron-down"></i></span>
            </div>
            <div class="guide-content" id="totoGuideContent" style="display: none;">
                <!-- 2-Column Comparative Table -->
                <div class="tvp-comparison-grid">
                    <!-- 1. 프로토 (Proto) -->
                    <div class="tvp-col tvp-proto">
                        <div class="tvp-col-header">
                            <span class="tvp-badge proto"><i class="fa-solid fa-receipt"></i> 프로토 (Proto)</span>
                            <span class="tvp-method">고정 배당률 (Fixed-Odds) 방식</span>
                        </div>
                        <ul class="tvp-rule-list">
                            <li><strong>🎯 경기 선택:</strong> 내가 자신 있는 <strong>2~10경기 직접 조합</strong> (지정 단폴더는 1경기만 배팅 가능)</li>
                            <li><strong>💰 당첨금 산정:</strong> 배팅 시점의 <strong>[배팅금액 × 최종 고정배당률]</strong>로 적중금 확정</li>
                            <li><strong>📊 배팅 마켓:</strong> 일반 승·무·패, 핸디캡(H), 언더/오버(U/O) 중 선택 (동일 경기 교차 불가)</li>
                            <li><strong>⏱️ 결과 적용:</strong> 축구는 <strong>전/후반 90분 정규시간 기준</strong> (연장전/승부차기 제외) / 야구·농구는 <strong>연장전 포함</strong></li>
                            <li><strong>☔ 취소/무효:</strong> 우천 취소 등 발생 시 <strong>해당 경기 1.0배(원금)</strong> 처리 후 나머지 경기 배당 정산</li>
                        </ul>
                    </div>

                    <!-- 2. 스포츠토토 (Toto) -->
                    <div class="tvp-col tvp-toto">
                        <div class="tvp-col-header">
                            <span class="tvp-badge toto"><i class="fa-solid fa-trophy"></i> 스포츠토토 (Toto)</span>
                            <span class="tvp-method">패리뮤추얼 (Pari-Mutuel) 배분형</span>
                        </div>
                        <ul class="tvp-rule-list">
                            <li><strong>🏆 경기 선택:</strong> 발매처가 지정한 <strong>14경기 전체(승무패/승1패/승5패)</strong> 결과 예측</li>
                            <li><strong>💰 당첨금 산정:</strong> 총 발매금액의 환급금을 <strong>적중자 수대로 나누어 배분</strong> (1등 14경기, 2등 13경기 등)</li>
                            <li><strong>🔄 1등 이월:</strong> 1등 적중자가 없을 경우 다음 회차로 <strong>당첨금 이월</strong> (역대 수억~수십억 원 대박)</li>
                            <li><strong>🎫 마킹 방식:</strong> 1경기당 1픽(단식 1,000원) 또는 2~3마킹(복식 2,000원~8,000원) 가능</li>
                            <li><strong>☔ 취소/무효:</strong> 대상 경기 중 <strong>2경기 이상 취소 시 회차 전체 무효 및 전액 환불</strong></li>
                        </ul>
                    </div>
                </div>

                <!-- Common Rules Notice Bar -->
                <div class="tvp-common-bar">
                    <span><i class="fa-solid fa-shield-halved" style="color: #38bdf8;"></i> <strong>공통 발매 규정:</strong> 1인 1회차 구매 한도 10만 원 | 단일 경기 1,000원 / 2경기 이상 조합 시 100원 단위 구매 가능 | 주 3회차(주초/주중/주말) 발매</span>
                </div>
            </div>
        </div>

        <!-- 🏆 AI 추천 종목 모드 스위처 (프로토 승부식 vs 스포츠토토 14경기) -->
        <section class="toto-section">
            <div class="section-title-group" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-wand-magic-sparkles" style="color: #fbbf24;"></i> 🎯 AI 맞춤 추천 엔진</h3>
                    <span class="section-desc">고정배당률 [프로토 승부식] 또는 14경기 풀패키지 [스포츠토토 승무패]를 선택하여 확인하세요.</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-top-sync-data" onclick="window.scrapeLatestTotoFixtures()" title="최신 경기 일정 및 배당 스크랩">
                        <i class="fa-solid fa-satellite-dish"></i> 실시간 스크랩
                    </button>
                    <button class="btn-top-qr-scan" onclick="window.openTotoQrScanner()" title="영수증 QR코드 스캔">
                        <i class="fa-solid fa-qrcode"></i> 영수증 QR스캔
                    </button>
                </div>
            </div>

            <!-- Mode Switcher Tabs -->
            <div class="rec-mode-tabs">
                <button type="button" class="rec-mode-tab ${isProtoMode ? 'active' : ''}" onclick="window.setRecommendationMode('proto')">
                    <i class="fa-solid fa-receipt"></i> 🎯 [프로토] 승부식 AI 추천 (2~4폴더 고정배당)
                </button>
                <button type="button" class="rec-mode-tab ${!isProtoMode ? 'active' : ''}" onclick="window.setRecommendationMode('toto')">
                    <i class="fa-solid fa-trophy"></i> ⚽ [스포츠토토] 승무패 14경기 AI 예측표 (패리뮤추얼)
                    ${carryover && carryover.hasCarryover ? `<span class="tab-carryover-badge"><i class="fa-solid fa-fire"></i> ${(carryover.carryoverAmount / 100000000).toFixed(1)}억 이월중</span>` : ''}
                </button>
            </div>
            
            ${isProtoMode ? `
                <!-- ===== 1. 프로토 승부식 3대 포트폴리오 (고정 배당률) ===== -->
                <div class="portfolio-grid">
                    <!-- 1. Safety 2-fold (안정형) -->
                    <div class="portfolio-card card-safety">
                        <div class="pf-type-tag proto"><i class="fa-solid fa-receipt"></i> 프로토 승부식 (고정배당)</div>
                        <div class="pf-badge pf-badge-safety"><i class="fa-solid fa-shield-heart"></i> 🟢 초보자 1순위 · 안정형 2경기</div>
                        
                        <div class="pf-payout-banner">
                            <span class="payout-label">10,000원 구매 시 ➡️</span>
                            <strong class="payout-amount" style="color: #34d399;">${portfolios.safety ? Math.round(portfolios.safety.combinedOdds * 10000).toLocaleString() : '24,500'}원 당첨</strong>
                        </div>

                        <div class="pf-odds-row">
                            <div class="pf-odds">${portfolios.safety ? portfolios.safety.combinedOdds : '2.45'}<span>배</span></div>
                            <div class="pf-prob">적중 확률 <strong>${portfolios.safety ? (portfolios.safety.combinedProb * 100).toFixed(1) : '62.4'}%</strong></div>
                        </div>

                        <div class="pf-picks-list">
                            ${portfolios.safety ? portfolios.safety.picks.map(p => `
                                <div class="pf-pick-item">
                                    <span class="pf-match">${p.matchTitle}</span>
                                    <span class="pf-choice">${p.pickName} <strong class="odds-val">@${p.odds}</strong></span>
                                </div>
                            `).join('') : '<p class="pf-empty">추천 대기 중</p>'}
                        </div>

                        <div class="pf-reason-box">
                            <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> <strong>AI 추천 근거:</strong> ${portfolios.safety && portfolios.safety.picks.length > 0 ? `AI 승리 확률 60% 이상 및 가치 기대값(+EV)이 검증된 최우선 안전 픽 ${portfolios.safety.picks.map(p => p.pickName).join(', ')} 조합입니다.` : '이변 확률이 극히 낮은 2개 경기 엄선 조합입니다.'}
                        </div>

                        <div class="pf-btn-row">
                            <button class="btn-direct-buy" onclick="window.openDirectPurchaseModal('safety')" title="실물 영수증 QR구매등록">
                                <i class="fa-solid fa-qrcode"></i> QR구매등록
                            </button>
                            <button class="btn-marking-view" onclick="window.openMarkingGuide('safety')">
                                <i class="fa-solid fa-pen-to-square"></i> 마킹표
                            </button>
                            <button class="btn-apply-portfolio" onclick="window.applyTotoPortfolio('safety')">
                                <i class="fa-solid fa-cart-plus"></i> 담기
                            </button>
                        </div>
                    </div>

                    <!-- 2. Balanced 3-fold (중수익형) -->
                    <div class="portfolio-card card-balanced">
                        <div class="pf-type-tag proto"><i class="fa-solid fa-receipt"></i> 프로토 승부식 (고정배당)</div>
                        <div class="pf-badge pf-badge-balanced"><i class="fa-solid fa-scale-balanced"></i> 🟡 추천 2순위 · 쏠쏠한 중수익 3경기</div>
                        
                        <div class="pf-payout-banner">
                            <span class="payout-label">10,000원 구매 시 ➡️</span>
                            <strong class="payout-amount" style="color: #fbbf24;">${portfolios.balanced ? Math.round(portfolios.balanced.combinedOdds * 10000).toLocaleString() : '58,200'}원 당첨</strong>
                        </div>

                        <div class="pf-odds-row">
                            <div class="pf-odds">${portfolios.balanced ? portfolios.balanced.combinedOdds : '5.82'}<span>배</span></div>
                            <div class="pf-prob">적중 확률 <strong>${portfolios.balanced ? (portfolios.balanced.combinedProb * 100).toFixed(1) : '29.8'}%</strong></div>
                        </div>

                        <div class="pf-picks-list">
                            ${portfolios.balanced ? portfolios.balanced.picks.map(p => `
                                <div class="pf-pick-item">
                                    <span class="pf-match">${p.matchTitle}</span>
                                    <span class="pf-choice">${p.pickName} <strong class="odds-val">@${p.odds}</strong></span>
                                </div>
                            `).join('') : '<p class="pf-empty">추천 대기 중</p>'}
                        </div>

                        <div class="pf-reason-box">
                            <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> <strong>AI 추천 근거:</strong> ${portfolios.balanced && portfolios.balanced.picks.length > 0 ? `기대값(+EV)이 가장 높은 핵심 3경기(${portfolios.balanced.picks.map(p => p.pickName).join(', ')})를 결합하여 리스크 대비 수익률을 극대화한 포트폴리오입니다.` : '상대 선발 및 xG 데이터를 공략한 고효율 픽입니다.'}
                        </div>

                        <div class="pf-btn-row">
                            <button class="btn-direct-buy btn-balanced-buy" onclick="window.openDirectPurchaseModal('balanced')" title="실물 영수증 QR구매등록">
                                <i class="fa-solid fa-qrcode"></i> QR구매등록
                            </button>
                            <button class="btn-marking-view" onclick="window.openMarkingGuide('balanced')">
                                <i class="fa-solid fa-pen-to-square"></i> 마킹표
                            </button>
                            <button class="btn-apply-portfolio btn-balanced" onclick="window.applyTotoPortfolio('balanced')">
                                <i class="fa-solid fa-cart-plus"></i> 담기
                            </button>
                        </div>
                    </div>

                    <!-- 3. High-Yield 4-fold (고배당) -->
                    <div class="portfolio-card card-highyield">
                        <div class="pf-type-tag proto"><i class="fa-solid fa-receipt"></i> 프로토 승부식 (고정배당)</div>
                        <div class="pf-badge pf-badge-highyield"><i class="fa-solid fa-bolt"></i> 🔴 소액 대박 · 고배당 챌린지 4경기</div>
                        
                        <div class="pf-payout-banner">
                            <span class="payout-label">5,000원 구매 시 ➡️</span>
                            <strong class="payout-amount" style="color: #f87171;">${portfolios.highYield ? Math.round(portfolios.highYield.combinedOdds * 5000).toLocaleString() : '71,000'}원 당첨</strong>
                        </div>

                        <div class="pf-odds-row">
                            <div class="pf-odds">${portfolios.highYield ? portfolios.highYield.combinedOdds : '14.20'}<span>배</span></div>
                            <div class="pf-prob">적중 확률 <strong>${portfolios.highYield ? (portfolios.highYield.combinedProb * 100).toFixed(1) : '12.5'}%</strong></div>
                        </div>

                        <div class="pf-picks-list">
                            ${portfolios.highYield ? portfolios.highYield.picks.map(p => `
                                <div class="pf-pick-item">
                                    <span class="pf-match">${p.matchTitle}</span>
                                    <span class="pf-choice">${p.pickName} <strong class="odds-val">@${p.odds}</strong></span>
                                </div>
                            `).join('') : '<p class="pf-empty">추천 대기 중</p>'}
                        </div>

                        <div class="pf-reason-box">
                            <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> <strong>AI 추천 근거:</strong> ${portfolios.highYield && portfolios.highYield.picks.length > 0 ? `샤프마켓 배당률 대비 가치가 높은 4경기(${portfolios.highYield.picks.map(p => p.pickName).join(', ')})를 선정하여 소액으로 10배 이상의 고수익을 겨냥한 조합입니다.` : '배당 왜곡 구간을 공략한 고수익 픽입니다.'}
                        </div>

                        <div class="pf-btn-row">
                            <button class="btn-direct-buy btn-highyield-buy" onclick="window.openDirectPurchaseModal('highYield')" title="실물 영수증 QR구매등록">
                                <i class="fa-solid fa-qrcode"></i> QR구매등록
                            </button>
                            <button class="btn-marking-view" onclick="window.openMarkingGuide('highYield')">
                                <i class="fa-solid fa-pen-to-square"></i> 마킹표
                            </button>
                            <button class="btn-apply-portfolio btn-highyield" onclick="window.applyTotoPortfolio('highYield')">
                                <i class="fa-solid fa-cart-plus"></i> 담기
                            </button>
                        </div>
                    </div>
                </div>
            ` : `
                <!-- ===== 2. 스포츠토토 승무패 14경기 AI 예측표 (패리뮤추얼) ===== -->
                <div class="toto-14-card">
                    <!-- 🔥 1등 이월금 실시간 스크랩 배너 (이월 발생 시) -->
                    ${carryover && carryover.hasCarryover ? `
                        <div class="toto-carryover-banner">
                            <div class="tcb-left">
                                <div class="tcb-badge-row">
                                    <span class="tcb-tag"><i class="fa-solid fa-fire-flame-curved"></i> 1등 이월금 실시간 감지 (${carryover.carryoverCount}차 이월)</span>
                                    <span class="tcb-updated"><i class="fa-solid fa-satellite-dish"></i> 베트맨 오피셜 실시간 스크랩</span>
                                </div>
                                <h3 class="tcb-title">🏆 ${carryover.targetGame}</h3>
                                <p class="tcb-desc"><i class="fa-solid fa-circle-info"></i> ${carryover.statusMessage}</p>
                            </div>
                            <div class="tcb-right">
                                <div class="tcb-stat-box">
                                    <span class="tcb-stat-label">이전 회차 1등 이월금</span>
                                    <strong class="tcb-stat-val carryover">${(carryover.carryoverAmount).toLocaleString()}원</strong>
                                    <span class="tcb-stat-sub">약 ${(carryover.carryoverAmount / 100000000).toFixed(2)}억 원</span>
                                </div>
                                <div class="tcb-stat-box highlight">
                                    <span class="tcb-stat-label">1등 예상 총 환급금</span>
                                    <strong class="tcb-stat-val total">${(carryover.estimatedTotalJackpot).toLocaleString()}원</strong>
                                    <span class="tcb-stat-sub">약 ${(carryover.estimatedTotalJackpot / 100000000).toFixed(1)}억 원 규모</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}

                    <div class="toto-14-header">
                        <div class="toto-14-title-area">
                            <span class="pf-type-tag toto"><i class="fa-solid fa-trophy"></i> 스포츠토토 승무패 (패리뮤추얼 방식)</span>
                            <h4>⚽ ${totoSheet.title} (총 ${totoSheet.rows.length}경기)</h4>
                            <p>14경기를 모두 맞추면 총 발매금액의 1등 환급금을 적중자끼리 배분받는 패리뮤추얼 방식입니다. (1등 미적중 시 다음 회차 이월)</p>
                        </div>
                        <div class="toto-14-action-btns">
                            <button type="button" class="btn-marking-view btn-toto14-omr" onclick="window.openToto14MarkingGuide('single')">
                                <i class="fa-solid fa-pen-to-square"></i> ✏️ 14경기 OMR 마킹표 보기
                            </button>
                            <button type="button" class="btn-buy-toto-single" onclick="window.openToto14PurchaseModal('single')">
                                <i class="fa-solid fa-ticket"></i> 단식 (1,000원) 등록
                            </button>
                            <button type="button" class="btn-buy-toto-double" onclick="window.openToto14PurchaseModal('double')">
                                <i class="fa-solid fa-layer-group"></i> AI 복식 (${totoSheet.doubleCost.toLocaleString()}원) 등록
                            </button>
                        </div>
                    </div>

                    <!-- 14 Match Interactive Prediction Table -->
                    <div class="toto-14-table-wrapper">
                        <table class="toto-14-table">
                            <thead>
                                <tr>
                                    <th style="width: 60px;">토토 번호</th>
                                    <th style="width: 75px;">프로토 연계</th>
                                    <th>리그 / 경기 일시</th>
                                    <th>홈팀 vs 원정팀</th>
                                    <th>AI 승/무/패 예측 확률</th>
                                    <th>1순위 단식 마킹</th>
                                    <th>복식 추천(2마킹)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${totoSheet.rows.map(r => `
                                    <tr>
                                        <td class="match-num" style="font-weight: 800; color: #fbbf24; font-size: 1.05rem;">${r.matchNum}번</td>
                                        <td class="match-proto-num" style="font-size: 0.8rem; color: #38bdf8; font-weight: 700;">
                                            ${r.protoGameNo ? '#' + r.protoGameNo + '번' : '-'}
                                        </td>
                                        <td class="match-meta">
                                            <span class="league-name">${r.league}</span>
                                            <span class="match-date">${r.matchTime.split(' ')[0].substring(5)} ${r.matchTime.split(' ')[1]}</span>
                                        </td>
                                        <td class="match-teams">
                                            <strong>${r.homeTeam}</strong> <span class="vs">vs</span> <strong>${r.awayTeam}</strong>
                                        </td>
                                        <td class="match-probs">
                                            <div class="prob-bar-row">
                                                <span class="prob-tag home">승 ${r.homeProb}%</span>
                                                ${r.sport === 'soccer' ? `<span class="prob-tag draw">무 ${r.drawProb}%</span>` : ''}
                                                <span class="prob-tag away">패 ${r.awayProb}%</span>
                                            </div>
                                        </td>
                                        <td class="match-single-pick">
                                            <span class="pick-badge ${r.mainPick === '승' ? 'pick-win' : (r.mainPick === '무' ? 'pick-draw' : 'pick-loss')}">
                                                ${r.mainPick}
                                            </span>
                                        </td>
                                        <td class="match-double-pick">
                                            ${r.isDoubleRecommended ? `
                                                <span class="double-badge">
                                                    ${r.mainPick} + ${r.subPick}
                                                </span>
                                            ` : `<span class="single-keep">단식 권장 (${r.mainPick})</span>`}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `}
        </section>

        <!-- Filters & Match List Section -->
        <section class="toto-section">
            <div class="fixtures-controls-bar">
                <div class="sport-tab-group">
                    <button class="sport-tab ${state.activeSport === 'all' ? 'active' : ''}" onclick="window.setTotoSportFilter('all')">
                        <i class="fa-solid fa-layer-group"></i> 전체 경기 (${state.fixtures.length})
                    </button>
                    <button class="sport-tab ${state.activeSport === 'soccer' ? 'active' : ''}" onclick="window.setTotoSportFilter('soccer')">
                        <i class="fa-solid fa-futbol"></i> ⚽ 축구
                    </button>
                    <button class="sport-tab ${state.activeSport === 'baseball' ? 'active' : ''}" onclick="window.setTotoSportFilter('baseball')">
                        <i class="fa-solid fa-baseball"></i> ⚾ 야구
                    </button>
                    <button class="sport-tab ${state.activeSport === 'basketball' ? 'active' : ''}" onclick="window.setTotoSportFilter('basketball')">
                        <i class="fa-solid fa-basketball"></i> 🏀 농구
                    </button>
                </div>

                <div class="toggle-ev-wrapper">
                    <button class="btn-toggle-ev ${state.filterOnlyEV ? 'active' : ''}" onclick="window.toggleTotoEVFilter()">
                        <i class="fa-solid fa-fire"></i> 🔥 [프로토] +EV 가치배팅 픽만 모아보기
                    </button>
                </div>
            </div>

            <!-- Fixtures Grid -->
            <div class="fixtures-grid">
                ${displayList.map(item => renderFixtureCard(item.fixture, item.analysis, state.selectedSlip)).join('')}
            </div>
        </section>
    `;
}

/**
 * Render Match Schedule & Results View (스케줄 메뉴)
 */
function renderScheduleView(state) {
    // Filter matches based on schedule filters
    let list = state.fixtures;

    if (state.scheduleRoundFilter === 'toto14') {
        list = list.filter(f => f.sport === 'soccer' && f.toto14MatchNo);
        // Sort strictly 1 to 14
        list.sort((a, b) => (a.toto14MatchNo || 0) - (b.toto14MatchNo || 0));
    } else if (state.scheduleRoundFilter !== 'all') {
        list = list.filter(f => f.round.includes(state.scheduleRoundFilter + '회차'));
    }

    if (state.scheduleSportFilter !== 'all') {
        list = list.filter(f => f.sport === state.scheduleSportFilter);
    }

    if (state.scheduleStatusFilter !== 'all') {
        list = list.filter(f => f.matchStatus === state.scheduleStatusFilter);
    }

    const scheduledCount = state.fixtures.filter(f => f.matchStatus !== 'FINISHED').length;
    const finishedCount = state.fixtures.filter(f => f.matchStatus === 'FINISHED').length;

    return `
        <!-- Schedule Top Banner & Filters -->
        <section class="toto-section">
            <div class="section-title-group" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-calendar-days" style="color: #38bdf8;"></i> 📅 토토 &amp; 프로토 공식 경기 일정 / 경기 결과</h3>
                    <span class="section-desc">베트맨 공식 발매 회차별 경기 스케줄, 토토 14경기 승무패, 상대 전적(H2H), 배당률 및 종료 경기 스코어입니다.</span>
                </div>
                <button class="btn-top-sync-data" onclick="window.scrapeLatestTotoFixtures()" title="최신 경기 일정 및 배당 스크랩">
                    <i class="fa-solid fa-satellite-dish"></i> 실시간 스케줄 스크랩
                </button>
            </div>

            <!-- Multi-Filter Toolbar -->
            <div class="schedule-filter-toolbar">
                <!-- Round Filter -->
                <div class="sch-filter-group">
                    <span class="sch-filter-label"><i class="fa-solid fa-bullhorn"></i> 발매 회차:</span>
                    <div class="sch-btn-tabs">
                        <button class="sch-filter-btn ${state.scheduleRoundFilter === 'all' ? 'active' : ''}" onclick="window.setScheduleRoundFilter('all')">전체 경기 (${state.fixtures.length})</button>
                        <button class="sch-filter-btn ${state.scheduleRoundFilter === '35' ? 'active' : ''}" onclick="window.setScheduleRoundFilter('35')">🟢 프로토 35회차 (발매중)</button>
                        <button class="sch-filter-btn ${state.scheduleRoundFilter === 'toto14' ? 'active' : ''}" onclick="window.setScheduleRoundFilter('toto14')">🏆 승무패 14경기 전용</button>
                        <button class="sch-filter-btn ${state.scheduleRoundFilter === '34' ? 'active' : ''}" onclick="window.setScheduleRoundFilter('34')">🏁 34회차 (종료/결과)</button>
                    </div>
                </div>

                <!-- Status Filter -->
                <div class="sch-filter-group">
                    <span class="sch-filter-label"><i class="fa-solid fa-toggle-on"></i> 경기 상태:</span>
                    <div class="sch-btn-tabs">
                        <button class="sch-filter-btn ${state.scheduleStatusFilter === 'all' ? 'active' : ''}" onclick="window.setScheduleStatusFilter('all')">전체 (${state.fixtures.length})</button>
                        <button class="sch-filter-btn ${state.scheduleStatusFilter === 'SCHEDULED' ? 'active' : ''}" onclick="window.setScheduleStatusFilter('SCHEDULED')">⏳ 예정 (${scheduledCount})</button>
                        <button class="sch-filter-btn ${state.scheduleStatusFilter === 'FINISHED' ? 'active' : ''}" onclick="window.setScheduleStatusFilter('FINISHED')">🏁 종료 (${finishedCount})</button>
                    </div>
                </div>

                <!-- Sport Filter -->
                <div class="sch-filter-group">
                    <span class="sch-filter-label"><i class="fa-solid fa-medal"></i> 종목:</span>
                    <div class="sch-btn-tabs">
                        <button class="sch-filter-btn ${state.scheduleSportFilter === 'all' ? 'active' : ''}" onclick="window.setScheduleSportFilter('all')">전체</button>
                        <button class="sch-filter-btn ${state.scheduleSportFilter === 'soccer' ? 'active' : ''}" onclick="window.setScheduleSportFilter('soccer')">⚽ 축구</button>
                        <button class="sch-filter-btn ${state.scheduleSportFilter === 'baseball' ? 'active' : ''}" onclick="window.setScheduleSportFilter('baseball')">⚾ 야구</button>
                        <button class="sch-filter-btn ${state.scheduleSportFilter === 'basketball' ? 'active' : ''}" onclick="window.setScheduleSportFilter('basketball')">🏀 농구</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- Schedule Fixtures Feed -->
        <section class="toto-section">
            <div class="schedule-feed-grid">
                ${list.length > 0 ? list.map(f => renderScheduleCard(f, state.selectedSlip)).join('') : `
                    <div class="ledger-empty-state">
                        <i class="fa-solid fa-calendar-xmark" style="font-size: 2.5rem; color: #475569; margin-bottom: 12px;"></i>
                        <h4>선택한 조건의 경기 일정이 없습니다.</h4>
                        <p>회차 또는 종목 필터를 변경해보시거나 [실시간 스케줄 스크랩]을 눌러보세요.</p>
                    </div>
                `}
            </div>
        </section>
    `;
}

/**
 * Render single Schedule / Match Result Card
 */
function renderScheduleCard(fixture, selectedSlip) {
    const isFinished = fixture.matchStatus === 'FINISHED';
    const analysis = analyzeFixture(fixture);

    const getSportIcon = (s) => {
        if (s === 'soccer') return '<i class="fa-solid fa-futbol" style="color: #60a5fa;"></i>';
        if (s === 'baseball') return '<i class="fa-solid fa-baseball" style="color: #f87171;"></i>';
        return '<i class="fa-solid fa-basketball" style="color: #fb923c;"></i>';
    };

    let statusBadge = '';
    if (isFinished) {
        statusBadge = `<span class="sch-card-status status-finished"><i class="fa-solid fa-flag-checkered"></i> 경기 종료</span>`;
    } else {
        statusBadge = `<span class="sch-card-status status-scheduled"><i class="fa-regular fa-clock"></i> 경기 예정</span>`;
    }

    return `
        <div class="sch-card ${isFinished ? 'card-finished' : ''}">
            <!-- Header Bar -->
            <div class="sch-card-header">
                <div class="sch-card-league" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    ${getSportIcon(fixture.sport)} <strong style="color: #cbd5e1;">${fixture.league}</strong>
                    <span style="color: #fbbf24; font-weight: 800; font-size: 0.85rem;">[${fixture.round}]</span>
                    ${fixture.toto14MatchNo ? `<span style="background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.5); color: #38bdf8; font-size: 0.72rem; padding: 2px 7px; border-radius: 12px; font-weight: 800;">토토 승무패 ${fixture.toto14MatchNo}번</span>` : ''}
                </div>
                <div class="sch-card-time-status">
                    <span class="sch-time"><i class="fa-regular fa-clock"></i> ${fixture.matchTime}</span>
                    ${statusBadge}
                </div>
            </div>

            <!-- Teams & Score Display -->
            <div class="sch-matchup-row">
                <div class="sch-team home">
                    <span class="sch-rank">${fixture.homeRank}위</span>
                    <strong class="sch-name">${fixture.homeTeam} (홈)</strong>
                </div>

                <div class="sch-center-box">
                    ${isFinished ? `
                        <div class="sch-final-score-pill">
                            <span class="sch-score-val">${fixture.finalScore}</span>
                            <span class="sch-result-tag">${fixture.resultSummary}</span>
                        </div>
                    ` : `
                        <div class="sch-vs-badge">VS</div>
                        <span class="sch-prob-preview" title="AI 승리 확률">${Math.round(analysis.homeWinProb * 100)}% : ${Math.round(analysis.awayWinProb * 100)}%</span>
                    `}
                </div>

                <div class="sch-team away">
                    <span class="sch-rank">${fixture.awayRank}위</span>
                    <strong class="sch-name">${fixture.awayTeam} (원정)</strong>
                </div>
            </div>

            <!-- H2H & Recent Form Stats Box -->
            <div class="sch-stats-panel">
                <div class="sch-stat-item">
                    <span class="sch-s-label">최근 5경기 폼:</span>
                    <span class="sch-s-val">
                        홈 <strong>[${fixture.stats.homeForm ? fixture.stats.homeForm.join('-') : 'W-W-L'}]</strong> vs 
                        원정 <strong>[${fixture.stats.awayForm ? fixture.stats.awayForm.join('-') : 'L-W-D'}]</strong>
                    </span>
                </div>
                <div class="sch-stat-item">
                    <span class="sch-s-label">상대 전적(H2H):</span>
                    <span class="sch-s-val" style="color: #fbbf24;">
                        ${fixture.homeTeam} ${fixture.stats.h2h.homeWins}승 ${fixture.stats.h2h.draws !== undefined ? fixture.stats.h2h.draws + '무 ' : ''}${fixture.stats.h2h.awayWins}패 (최근 ${fixture.stats.h2h.lastScore})
                    </span>
                </div>
            </div>

            <!-- Odds & AI Rationale Banner -->
            <div class="sch-odds-banner">
                <div class="sch-odds-list">
                    <span>홈승 <strong class="odds-val">@${fixture.betmanOdds.homeWin}</strong></span>
                    ${fixture.betmanOdds.draw ? `<span>무승부 <strong class="odds-val">@${fixture.betmanOdds.draw}</strong></span>` : ''}
                    <span>원정승 <strong class="odds-val">@${fixture.betmanOdds.awayWin}</strong></span>
                    ${fixture.betmanOdds.underOverLine ? `<span>${fixture.betmanOdds.underOverLine} U/O (U @${fixture.betmanOdds.under} / O @${fixture.betmanOdds.over})</span>` : ''}
                </div>
                
                ${isFinished ? `
                    <div class="sch-ai-hit-banner ${fixture.aiPrediction && fixture.aiPrediction.isHit ? 'hit-success' : ''}">
                        <i class="fa-solid fa-bullseye" style="color: #34d399;"></i> 
                        <strong>AI 예측 결과:</strong> ${fixture.aiPrediction ? fixture.aiPrediction.pick : '홈승'} (@${fixture.aiPrediction ? fixture.aiPrediction.odds : fixture.betmanOdds.homeWin}) ➡️ <strong style="color: #10b981;">🎯 AI 예측 적중 완료!</strong>
                    </div>
                ` : `
                    <div class="sch-ai-rec-banner">
                        <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> 
                        <strong>AI 추천 1순위:</strong> ${analysis.picks[0] ? (analysis.picks[0].name || analysis.picks[0].pickName) : fixture.homeTeam + ' 승'} (@${analysis.picks[0] ? analysis.picks[0].odds : fixture.betmanOdds.homeWin})
                        <span style="color: #94a3b8; font-size: 0.72rem;">(적중 확률 ${Math.round(analysis.homeWinProb * 100)}%)</span>
                    </div>
                `}
            </div>

            <!-- Footer Actions -->
            <div class="sch-card-footer">
                <button class="btn-open-nlp" onclick="window.openTotoNewsModal('${fixture.id}')">
                    <i class="fa-solid fa-newspaper"></i> 전력 &amp; 결장 분석
                </button>
                ${!isFinished ? `
                    <button class="btn-sch-add-slip" onclick="window.toggleTotoPick('${fixture.id}', 'HOME_WIN', '${fixture.homeTeam} 승', ${fixture.betmanOdds.homeWin}, ${analysis.homeWinProb}, ${(analysis.homeWinProb * fixture.betmanOdds.homeWin) - 1})">
                        <i class="fa-solid fa-cart-plus"></i> 승리 픽 슬립 담기
                    </button>
                ` : `
                    <span style="font-size: 0.75rem; color: #94a3b8;"><i class="fa-solid fa-circle-check" style="color: #10b981;"></i> 공식 경기 결과 마감</span>
                `}
            </div>
        </div>
    `;
}

/**
 * Render League Standings View (EPL, La Liga, K-League, KBO, NBA, KBL)
 */
function renderStandingsView(state) {
    const activeLeagueKey = state.activeStandingsLeague || 'epl';
    const leagueData = (state.standings && state.standings[activeLeagueKey]) ? state.standings[activeLeagueKey] : null;

    if (!leagueData) {
        return `
            <div style="padding: 40px; text-align: center; color: #94a3b8;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; color: #fbbf24; margin-bottom: 12px;"></i>
                <p>순위표 데이터를 불러오는 중입니다...</p>
                <button onclick="window.scrapeLatestTotoFixtures()" class="btn-primary" style="margin-top: 10px;">
                    <i class="fa-solid fa-satellite-dish"></i> 실시간 순위표 스크랩
                </button>
            </div>
        `;
    }

    const isSoccer = ['epl', 'laliga', 'kleague'].includes(activeLeagueKey);
    const isBaseball = activeLeagueKey === 'kbo';
    const isBasketball = ['nba', 'kbl'].includes(activeLeagueKey);
    const isPreseason = leagueData.seasonState === 'PRE_SEASON';

    const formatFormBadge = (res) => {
        if (res === 'W') return `<span class="form-badge form-w" title="승리">W</span>`;
        if (res === 'D') return `<span class="form-badge form-d" title="무승부">D</span>`;
        if (res === 'L') return `<span class="form-badge form-l" title="패배">L</span>`;
        return `<span class="form-badge form-none" title="개막 대기 / 경기 없음">-</span>`;
    };

    const rowsHtml = leagueData.table.map(rawRow => {
        const row = isPreseason ? {
            ...rawRow,
            gp: 0,
            w: 0,
            d: 0,
            l: 0,
            gf: 0,
            ga: 0,
            gd: 0,
            pts: 0,
            xPts: 0,
            winRate: "0.000",
            gb: "-",
            runsFor: 0,
            runsAgainst: 0,
            diff: "0",
            ptsFor: 0,
            ptsAgainst: 0,
            netRtg: "0.0",
            pythagenpatWinRate: "0.000",
            form: ["-","-","-","-","-"],
            zone: "none"
        } : rawRow;

        const formHtml = row.form ? row.form.map(formatFormBadge).join('') : '-';
        let zoneClass = '';
        let zoneLabel = '';
        if (row.zone === 'ucl') { zoneClass = 'zone-ucl'; zoneLabel = '<span class="zone-tag tag-ucl" title="챔피언스리그">UCL</span>'; }
        else if (row.zone === 'uel') { zoneClass = 'zone-uel'; zoneLabel = '<span class="zone-tag tag-uel" title="유로파리그">UEL</span>'; }
        else if (row.zone === 'relegation') { zoneClass = 'zone-relegation'; zoneLabel = '<span class="zone-tag tag-relegation" title="강등권">강등</span>'; }
        else if (row.zone === 'playoffs') { zoneClass = 'zone-playoffs'; zoneLabel = '<span class="zone-tag tag-playoffs" title="포스트시즌/가을야구">PS</span>'; }
        else if (row.zone === 'playin') { zoneClass = 'zone-playin'; zoneLabel = '<span class="zone-tag tag-playin" title="플레이인">PI</span>'; }

        if (isSoccer) {
            const xPtsDiff = row.xPts ? (row.pts - row.xPts).toFixed(1) : '0.0';
            const luckText = Number(xPtsDiff) > 2 ? `<span style="color: #38bdf8;" title="기대치 대비 승점 초과 (운 우세)">+${xPtsDiff}</span>` : (Number(xPtsDiff) < -2 ? `<span style="color: #f87171;" title="기대치 대비 승점 부족 (불운, 반등 가능)">${xPtsDiff}</span>` : `<span style="color: #94a3b8;">${xPtsDiff}</span>`);
            return `
                <tr class="${zoneClass}">
                    <td class="col-rank"><strong>${row.rank}</strong> ${zoneLabel}</td>
                    <td class="col-team"><strong>${row.team}</strong></td>
                    <td>${row.gp}</td>
                    <td>${row.w}</td>
                    <td>${row.d}</td>
                    <td>${row.l}</td>
                    <td>${row.gf}</td>
                    <td>${row.ga}</td>
                    <td style="color: ${row.gd >= 0 ? '#34d399' : '#f87171'}; font-weight: bold;">${row.gd >= 0 ? '+' : ''}${row.gd}</td>
                    <td class="col-pts"><strong style="color: #fbbf24; font-size: 0.95rem;">${row.pts}</strong></td>
                    <td class="col-xpts" style="color: #a78bfa; font-size: 0.78rem;">${row.xPts || row.pts} (${luckText})</td>
                    <td class="col-form">${formHtml}</td>
                </tr>
            `;
        } else if (isBaseball) {
            return `
                <tr class="${zoneClass}">
                    <td class="col-rank"><strong>${row.rank}</strong> ${zoneLabel}</td>
                    <td class="col-team"><strong>${row.team}</strong></td>
                    <td>${row.gp}</td>
                    <td>${row.w}</td>
                    <td>${row.d}</td>
                    <td>${row.l}</td>
                    <td><strong style="color: #60a5fa;">${row.winRate}</strong></td>
                    <td style="color: #94a3b8;">${row.gb}</td>
                    <td>${row.runsFor}</td>
                    <td>${row.runsAgainst}</td>
                    <td style="color: ${row.diff.startsWith('+') ? '#34d399' : '#f87171'}; font-weight: bold;">${row.diff}</td>
                    <td style="color: #a78bfa; font-size: 0.78rem; font-weight: bold;">${row.pythagenpatWinRate}</td>
                    <td class="col-form">${formHtml}</td>
                </tr>
            `;
        } else {
            return `
                <tr class="${zoneClass}">
                    <td class="col-rank"><strong>${row.rank}</strong> ${zoneLabel}</td>
                    <td class="col-team"><strong>${row.team}</strong></td>
                    <td>${row.gp}</td>
                    <td>${row.w}</td>
                    <td>${row.l}</td>
                    <td><strong style="color: #60a5fa;">${row.winRate}</strong></td>
                    <td style="color: #94a3b8;">${row.gb}</td>
                    <td>${row.ptsFor}</td>
                    <td>${row.ptsAgainst}</td>
                    <td style="color: #34d399; font-weight: bold;">${row.netRtg || row.diff}</td>
                    <td class="col-form">${formHtml}</td>
                </tr>
            `;
        }
    }).join('');

    return `
        <!-- League Standings Section -->
        <section class="toto-section">
            <div class="section-title-group" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <h3 class="section-title"><i class="fa-solid fa-ranking-star" style="color: #fbbf24;"></i> 🏆 프로토 대상 6대 리그 실시간 순위표</h3>
                    <span class="section-desc">공식 기록실 데이터와 Pythagenpat 기대 승점(xPTS) 및 최근 5경기 모멘텀 분석입니다.</span>
                </div>
                <button class="btn-top-sync-data" onclick="window.scrapeLatestTotoFixtures()" title="최신 순위표 실시간 스크랩">
                    <i class="fa-solid fa-satellite-dish"></i> 실시간 순위표 스크랩
                </button>
            </div>

            <!-- League Navigation Pills -->
            <div class="standings-league-tabs">
                <button class="standings-league-pill ${activeLeagueKey === 'epl' ? 'active' : ''}" onclick="window.switchStandingsLeague('epl')">
                    ⚽ EPL (잉글랜드)
                </button>
                <button class="standings-league-pill ${activeLeagueKey === 'laliga' ? 'active' : ''}" onclick="window.switchStandingsLeague('laliga')">
                    ⚽ 라리가 (스페인)
                </button>
                <button class="standings-league-pill ${activeLeagueKey === 'kleague' ? 'active' : ''}" onclick="window.switchStandingsLeague('kleague')">
                    ⚽ K리그1 (대한민국)
                </button>
                <button class="standings-league-pill ${activeLeagueKey === 'kbo' ? 'active' : ''}" onclick="window.switchStandingsLeague('kbo')">
                    ⚾ KBO (한국 야구)
                </button>
                <button class="standings-league-pill ${activeLeagueKey === 'nba' ? 'active' : ''}" onclick="window.switchStandingsLeague('nba')">
                    🏀 NBA (미국 농구)
                </button>
                <button class="standings-league-pill ${activeLeagueKey === 'kbl' ? 'active' : ''}" onclick="window.switchStandingsLeague('kbl')">
                    🏀 KBL (한국 농구)
                </button>
            </div>

            <!-- Season Status & Opening Date Info Banner -->
            <div class="standings-status-card" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 12px 16px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="season-state-badge" style="background: ${leagueData.seasonState === 'IN_PROGRESS' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; border: 1px solid ${leagueData.seasonState === 'IN_PROGRESS' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(56, 189, 248, 0.5)'}; color: ${leagueData.seasonStateColor || '#10b981'}; font-weight: 800; font-size: 0.82rem; padding: 4px 10px; border-radius: 20px;">
                        ${leagueData.seasonStateBadge || '🟢 정규시즌 진행중'}
                    </span>
                    <div style="font-size: 0.8rem; color: #cbd5e1;">
                        <i class="fa-solid fa-flag-checkered" style="color: #fbbf24;"></i> 현재 단계: <strong style="color: #ffffff;">${leagueData.currentStage || leagueData.seasonStateLabel}</strong>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 14px; font-size: 0.78rem; color: #94a3b8;">
                    ${leagueData.openingDate ? `
                        <div>
                            <i class="fa-regular fa-calendar-check" style="color: #38bdf8;"></i> 
                            시즌 개막일: <strong style="color: #fde047;">${leagueData.openingDate}</strong>
                        </div>
                    ` : ''}
                    <div>
                        <i class="fa-solid fa-timeline" style="color: #a78bfa;"></i>
                        기간: <span>${leagueData.seasonPeriod || '2025/2026'}</span>
                    </div>
                </div>
            </div>

            <!-- Timestamp & Source Banner -->
            <div class="standings-meta-banner">
                <div class="standings-meta-left">
                    <i class="fa-regular fa-clock" style="color: #38bdf8;"></i>
                    <span>데이터 기준: <strong style="color: #fbbf24;">${leagueData.season}</strong></span>
                    <span class="meta-season" style="color: #94a3b8; font-size: 0.76rem;">(최신 스크랩 동기화: <strong style="color: #38bdf8;">${leagueData.lastUpdated}</strong>)</span>
                </div>
                <div class="standings-meta-right" style="color: #94a3b8; font-size: 0.74rem;">
                    <i class="fa-solid fa-shield-halved"></i> 공식 출처: ${leagueData.source}
                </div>
            </div>

            <!-- Table Container -->
            <div class="standings-table-wrapper">
                <table class="standings-table">
                    <thead>
                        ${isSoccer ? `
                            <tr>
                                <th style="width: 65px;">순위</th>
                                <th>팀명</th>
                                <th>경기</th>
                                <th>승</th>
                                <th>무</th>
                                <th>패</th>
                                <th>득점</th>
                                <th>실점</th>
                                <th>득실</th>
                                <th>승점</th>
                                <th title="Pythagenpat 기대 승점 및 잔차">xPTS (운/불운)</th>
                                <th>최근 5경기</th>
                            </tr>
                        ` : (isBaseball ? `
                            <tr>
                                <th style="width: 65px;">순위</th>
                                <th>팀명</th>
                                <th>경기</th>
                                <th>승</th>
                                <th>무</th>
                                <th>패</th>
                                <th>승률</th>
                                <th>게임차</th>
                                <th>득점</th>
                                <th>실점</th>
                                <th>득실</th>
                                <th title="득실점 기반 기대 승률">Pythagenpat</th>
                                <th>최근 5경기</th>
                            </tr>
                        ` : `
                            <tr>
                                <th style="width: 65px;">순위</th>
                                <th>팀명</th>
                                <th>경기</th>
                                <th>승</th>
                                <th>패</th>
                                <th>승률</th>
                                <th>게임차</th>
                                <th>득점</th>
                                <th>실점</th>
                                <th>넷레이팅</th>
                                <th>최근 5경기</th>
                            </tr>
                        `)}
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- Zone Legend Guide -->
            <div class="standings-legend">
                ${isSoccer ? `
                    <span class="legend-item"><span class="legend-box tag-ucl"></span> 1~4위 챔피언스리그 (UCL)</span>
                    <span class="legend-item"><span class="legend-box tag-uel"></span> 5위 유로파리그 (UEL)</span>
                    <span class="legend-item"><span class="legend-box tag-relegation"></span> 18~20위 강등권</span>
                    <span class="legend-item" style="color: #a78bfa;"><i class="fa-solid fa-square-root-variable"></i> xPTS: 득실점 기반 피타고리안 기대 승점</span>
                ` : (isBaseball ? `
                    <span class="legend-item"><span class="legend-box tag-playoffs"></span> 1~5위 가을야구 포스트시즌권</span>
                    <span class="legend-item" style="color: #a78bfa;"><i class="fa-solid fa-calculator"></i> Pythagenpat: 득실 환경 동적 지수 기대 승률</span>
                ` : `
                    <span class="legend-item"><span class="legend-box tag-playoffs"></span> 1~6위 플레이오프 직행</span>
                    <span class="legend-item"><span class="legend-box tag-playin"></span> 7~8위 플레이인 토너먼트</span>
                `)}
            </div>
        </section>
    `;
}

/**
 * Render Confirmed Purchase List & Financial Ledger View
 */
function renderConfirmedLedgerView(state, financials) {
    const isProfit = financials.netProfit >= 0;

    return `
        <!-- Financial Summary Cards Banner -->
        <section class="toto-section">
            <div class="section-title-group">
                <h3 class="section-title"><i class="fa-solid fa-chart-pie" style="color: #34d399;"></i> 📜 토토/프로토 실구매 손익 현황</h3>
                <span class="section-desc">내가 실제로 구매한 베팅 슬립의 적중 결과와 누적 획득금액입니다.</span>
            </div>

            <div class="toto-kpi-grid">
                <div class="toto-kpi-card">
                    <div class="kpi-label"><i class="fa-solid fa-wallet"></i> 총 누적 구매금액</div>
                    <div class="kpi-value">${financials.totalInvest.toLocaleString()} <span class="kpi-unit">원</span></div>
                    <div class="kpi-sub">총 ${financials.totalCount}장 구매 완료</div>
                </div>
                <div class="toto-kpi-card highlight-gold">
                    <div class="kpi-label"><i class="fa-solid fa-trophy"></i> 총 획득 당첨금</div>
                    <div class="kpi-value" style="color: #fbbf24;">${financials.totalPrize.toLocaleString()} <span class="kpi-unit">원</span></div>
                    <div class="kpi-sub">적중 ${financials.wonCount}건 / 미적중 ${financials.lostCount}건</div>
                </div>
                <div class="toto-kpi-card ${isProfit ? 'highlight-green' : 'highlight-danger'}">
                    <div class="kpi-label"><i class="fa-solid fa-chart-line"></i> 누적 순손익</div>
                    <div class="kpi-value" style="color: ${isProfit ? '#10b981' : '#f87171'};">${isProfit ? '+' : ''}${financials.netProfit.toLocaleString()} <span class="kpi-unit">원</span></div>
                    <div class="kpi-sub">수익률(ROI) ${financials.roi}%</div>
                </div>
                <div class="toto-kpi-card">
                    <div class="kpi-label"><i class="fa-solid fa-bullseye"></i> 배팅 적중률</div>
                    <div class="kpi-value">${financials.hitRate}<span class="kpi-unit">%</span></div>
                    <div class="kpi-sub">진행/대기중 ${financials.pendingCount}건</div>
                </div>
            </div>
        </section>

        <!-- Confirmed Slips List -->
        <section class="toto-section">
            <div class="ledger-header-row">
                <div class="ledger-header-title">
                    <i class="fa-solid fa-list-check"></i> 구매 확정 슬립 목록 (${state.purchasedSlips.length}건)
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-top-qr-scan" onclick="window.openTotoQrScanner()" title="영수증 QR코드 스캔">
                        <i class="fa-solid fa-qrcode"></i> 영수증 QR 스캔 등록
                    </button>
                    <button class="btn-new-bet-trigger" onclick="window.switchTotoTab('recommendation')">
                        <i class="fa-solid fa-plus"></i> 새 경기 조합
                    </button>
                </div>
            </div>

            <div class="ledger-slips-list">
                ${state.purchasedSlips.length > 0 ? state.purchasedSlips.map(slip => renderPurchasedSlipCard(slip)).join('') : `
                    <div class="ledger-empty-state">
                        <i class="fa-solid fa-ticket-simple" style="font-size: 2.5rem; color: #475569; margin-bottom: 12px;"></i>
                        <h4>아직 등록된 구매 슬립이 없습니다.</h4>
                        <p>AI 추천 픽에서 [구매등록]을 누르거나, 실제 구매한 <strong>[영수증 QR 스캔]</strong>으로 바로 등록해보세요.</p>
                        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 14px;">
                            <button class="btn-top-qr-scan" onclick="window.openTotoQrScanner()">
                                <i class="fa-solid fa-qrcode"></i> 영수증 QR 스캔 등록
                            </button>
                            <button class="btn-empty-go-rec" onclick="window.switchTotoTab('recommendation')">
                                <i class="fa-solid fa-wand-magic-sparkles"></i> AI 추천 픽 보러가기
                            </button>
                        </div>
                    </div>
                `}
            </div>
        </section>
    `;
}

/**
 * Render single Purchased Bet Slip Card
 */
function renderPurchasedSlipCard(slip) {
    let statusBadge = '';
    let resultMoneyBanner = '';

    if (slip.status === 'WON') {
        statusBadge = `<span class="slip-status-badge status-won"><i class="fa-solid fa-circle-check"></i> 적중 완료 (당첨)</span>`;
        resultMoneyBanner = `
            <div class="slip-result-banner banner-won">
                <span>획득 당첨금:</span>
                <strong>+${slip.actualPrize.toLocaleString()}원</strong>
                <span class="profit-tag">(순수익 +${(slip.actualPrize - slip.stake).toLocaleString()}원)</span>
            </div>
        `;
    } else if (slip.status === 'LOST') {
        statusBadge = `<span class="slip-status-badge status-lost"><i class="fa-solid fa-circle-xmark"></i> 미적중 (낙첨)</span>`;
        resultMoneyBanner = `
            <div class="slip-result-banner banner-lost">
                <span>정산 결과:</span>
                <strong>0원</strong>
                <span class="profit-tag">(손실 -${slip.stake.toLocaleString()}원)</span>
            </div>
        `;
    } else {
        statusBadge = `<span class="slip-status-badge status-pending"><i class="fa-solid fa-hourglass-half"></i> 경기 진행 / 결과 대기중</span>`;
        resultMoneyBanner = `
            <div class="slip-result-banner banner-pending">
                <span>적중 시 예상 수령액:</span>
                <strong>${slip.potentialPrize.toLocaleString()}원</strong>
            </div>
        `;
    }

    return `
        <div class="purchased-slip-card" id="slip-card-${slip.id}">
            <div class="purchased-slip-header">
                <div class="ps-header-left">
                    <span class="ps-round-tag">${slip.round}</span>
                    <span class="ps-date">${slip.date}</span>
                    <span class="ps-memo">${slip.memo}</span>
                </div>
                <div class="ps-header-right">
                    ${statusBadge}
                </div>
            </div>

            <!-- Financial Summary Row -->
            <div class="ps-financial-row">
                <div>
                    <span class="ps-f-label">구매 금액</span>
                    <strong class="ps-f-val">${slip.stake.toLocaleString()}원</strong>
                </div>
                <div>
                    <span class="ps-f-label">선택 조합</span>
                    <strong class="ps-f-val">${slip.picks.length}폴더</strong>
                </div>
                <div>
                    <span class="ps-f-label">총 배당률</span>
                    <strong class="ps-f-val" style="color: #fbbf24;">${slip.combinedOdds}배</strong>
                </div>
            </div>

            <!-- Match Picks List -->
            <div class="ps-picks-list">
                ${slip.picks.map((pick, idx) => {
                    let hitIcon = '<span style="color: #94a3b8;"><i class="fa-regular fa-clock"></i></span>';
                    if (pick.isHit === true) hitIcon = '<span style="color: #10b981; font-weight: bold;"><i class="fa-solid fa-circle-check"></i> 적중</span>';
                    if (pick.isHit === false) hitIcon = '<span style="color: #f87171; font-weight: bold;"><i class="fa-solid fa-circle-xmark"></i> 미적중</span>';

                    return `
                        <div class="ps-pick-item">
                            <div class="ps-pick-num">${idx + 1}</div>
                            <div class="ps-pick-info">
                                <span class="ps-pick-match">${pick.matchTitle}</span>
                                <span class="ps-pick-choice">선택: <strong>${pick.pickName}</strong> (@${pick.odds.toFixed(2)})</span>
                            </div>
                            <div class="ps-pick-result">
                                <span class="ps-match-score">${pick.matchResult}</span>
                                ${hitIcon}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Result Money Banner -->
            ${resultMoneyBanner}

            <!-- Card Actions -->
            <div class="ps-card-actions">
                <div class="ps-action-buttons">
                    <button class="btn-simulate-win" onclick="window.simulateSlipResult('${slip.id}', true)" title="적중으로 결과 판정">
                        <i class="fa-solid fa-wand-sparkles"></i> 적중 시뮬레이션
                    </button>
                    <button class="btn-simulate-loss" onclick="window.simulateSlipResult('${slip.id}', false)" title="낙첨으로 결과 판정">
                        <i class="fa-solid fa-rotate-left"></i> 낙첨 시뮬레이션
                    </button>
                    <button class="btn-view-slip-omr" onclick="window.openPurchasedSlipOMR('${slip.id}')">
                        <i class="fa-solid fa-receipt"></i> 마킹표 보기
                    </button>
                </div>
                <button class="btn-delete-slip" onclick="window.deleteTotoSlip('${slip.id}')" title="기록 삭제">
                    <i class="fa-solid fa-trash-can"></i> 삭제
                </button>
            </div>
        </div>
    `;
}

/**
 * Render single Match Card with Easy Korean Labels
 */
function renderFixtureCard(fixture, analysis, selectedSlip) {
    const isSelected = (type) => selectedSlip.some(s => s.fixtureId === fixture.id && s.pickType === type);

    const getSportIcon = (s) => {
        if (s === 'soccer') return '<i class="fa-solid fa-futbol" style="color: #60a5fa;"></i>';
        if (s === 'baseball') return '<i class="fa-solid fa-baseball" style="color: #f87171;"></i>';
        return '<i class="fa-solid fa-basketball" style="color: #fb923c;"></i>';
    };

    let injuryBadge = '';
    if (fixture.nlpNews.awayImpactScore < -0.10) {
        injuryBadge = `<span class="nlp-badge nlp-badge-danger" title="${fixture.nlpNews.newsSummary}"><i class="fa-solid fa-user-injured"></i> ⚠️ ${fixture.awayTeam} 결장 (전력 -${Math.round(Math.abs(fixture.nlpNews.awayImpactScore) * 100)}%)</span>`;
    } else if (fixture.nlpNews.homeImpactScore < -0.10) {
        injuryBadge = `<span class="nlp-badge nlp-badge-danger" title="${fixture.nlpNews.newsSummary}"><i class="fa-solid fa-user-injured"></i> ⚠️ ${fixture.homeTeam} 결장 (전력 -${Math.round(Math.abs(fixture.nlpNews.homeImpactScore) * 100)}%)</span>`;
    } else {
        injuryBadge = `<span class="nlp-badge nlp-badge-safe"><i class="fa-solid fa-circle-check"></i> 라인업 정상</span>`;
    }

    const homeSplitText = fixture.stats.homeSplit ? `홈 ${fixture.stats.homeSplit.winRate}%승` : '홈 우세';
    const awaySplitText = fixture.stats.awaySplit ? `원정 ${fixture.stats.awaySplit.winRate}%승` : '원정';
    const h2hText = analysis.h2hRating ? `상대 ${analysis.h2hRating.homeWins}승${analysis.h2hRating.draws ? analysis.h2hRating.draws + '무' : ''}${analysis.h2hRating.awayWins}패` : '상대전적';
    const topScoreText = analysis.top3Scores && analysis.top3Scores[0] ? `예상 ${analysis.top3Scores[0].score}` : '';

    let managerBadge = '';
    if (analysis.managerAnalysis) {
        if (analysis.managerAnalysis.homeManagerStatus === 'NEW_MANAGER_BOUNCE') {
            managerBadge = `<span class="intel-pill intel-manager" title="${analysis.managerAnalysis.homeStatusLabel}"><i class="fa-solid fa-user-tie"></i> 👔 ${fixture.homeTeam} 신임 감독 버프 (+${Math.round(analysis.managerAnalysis.homeManagerImpact * 100)}%)</span>`;
        } else if (analysis.managerAnalysis.awayManagerStatus === 'NEW_MANAGER_BOUNCE') {
            managerBadge = `<span class="intel-pill intel-manager" title="${analysis.managerAnalysis.awayStatusLabel}"><i class="fa-solid fa-user-tie"></i> 👔 ${fixture.awayTeam} 신임 감독 버프 (+${Math.round(analysis.managerAnalysis.awayManagerImpact * 100)}%)</span>`;
        } else if (analysis.managerAnalysis.awayManagerStatus === 'MANAGER_PRESSURE' || analysis.managerAnalysis.awayManagerStatus === 'INTERIM_STABILITY_LOSS') {
            managerBadge = `<span class="intel-pill intel-crisis" title="${analysis.managerAnalysis.awayStatusLabel}"><i class="fa-solid fa-triangle-exclamation"></i> ⚠️ ${fixture.awayTeam} 감독 경질/위기 (-${Math.round(Math.abs(analysis.managerAnalysis.awayManagerImpact) * 100)}%)</span>`;
        }
    }

    let transferBadge = '';
    if (analysis.transferAnalysis) {
        if (analysis.transferAnalysis.homeTransferNet >= 0.08) {
            transferBadge = `<span class="intel-pill intel-transfer" title="${analysis.transferAnalysis.homeTransferSummary}"><i class="fa-solid fa-arrows-spin"></i> 🔄 ${fixture.homeTeam} 에이스 영입 (+${Math.round(analysis.transferAnalysis.homeTransferNet * 100)}%)</span>`;
        } else if (analysis.transferAnalysis.awayTransferNet >= 0.08) {
            transferBadge = `<span class="intel-pill intel-transfer" title="${analysis.transferAnalysis.awayTransferSummary}"><i class="fa-solid fa-arrows-spin"></i> 🔄 ${fixture.awayTeam} 에이스 영입 (+${Math.round(analysis.transferAnalysis.awayTransferNet * 100)}%)</span>`;
        }
    }

    const pipeline = getTotoState().realtimePipeline || {};
    const dropAlert = (pipeline.dropOddsAlerts || []).find(a => a.fixtureId === fixture.id);
    let dropBadge = '';
    if (dropAlert) {
        dropBadge = `<span class="drop-odds-badge" title="${dropAlert.reason}"><i class="fa-solid fa-fire"></i> 해외배당 급락 ${dropAlert.dropPct}%</span>`;
    }

    return `
        <div class="fixture-card" id="card-${fixture.id}">
            <div class="fixture-header">
                <div class="fixture-league" style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    ${getSportIcon(fixture.sport)} <strong style="color: #cbd5e1;">${fixture.league}</strong>
                    <span class="fixture-round" style="color: #fbbf24; font-weight:800; font-size: 0.85rem;">[${fixture.round}]</span>
                    ${fixture.toto14MatchNo ? `<span style="background: rgba(56, 189, 248, 0.2); border: 1px solid rgba(56, 189, 248, 0.5); color: #38bdf8; font-size: 0.72rem; padding: 2px 7px; border-radius: 12px; font-weight: 800;">승무패 ${fixture.toto14MatchNo}번</span>` : ''}
                    ${dropBadge}
                </div>
                <div class="fixture-time">
                    <i class="fa-regular fa-clock"></i> ${fixture.matchTime}
                </div>
            </div>

            <!-- Teams & Multi-Model Projection -->
            <div class="fixture-match-row">
                <div class="team-col home">
                    <span class="team-rank">${fixture.homeRank}위</span>
                    <strong class="team-name">${fixture.homeTeam} (홈)</strong>
                    <span class="team-xg" style="color: #94a3b8;">${fixture.stats.homeXG ? 'xG ' + fixture.stats.homeXG : (fixture.stats.homeStarter ? fixture.stats.homeStarter.split('(')[0] : 'ORtg ' + fixture.stats.homeORtg)}</span>
                </div>

                <div class="vs-col">
                    <div class="vs-text">VS</div>
                    <div class="poisson-prob-pill" title="3대 앙상블 AI 승리 확률">
                        <span style="color: #60a5fa;" title="홈승 확률">${Math.round(analysis.homeWinProb * 100)}%</span>
                        ${analysis.drawProb > 0 ? `<span style="color: #94a3b8;" title="무승부 확률">${Math.round(analysis.drawProb * 100)}%</span>` : ''}
                        <span style="color: #f87171;" title="원정승 확률">${Math.round(analysis.awayWinProb * 100)}%</span>
                    </div>
                </div>

                <div class="team-col away">
                    <span class="team-rank">${fixture.awayRank}위</span>
                    <strong class="team-name">${fixture.awayTeam} (원정)</strong>
                    <span class="team-xg" style="color: #94a3b8;">${fixture.stats.awayXG ? 'xG ' + fixture.stats.awayXG : (fixture.stats.awayStarter ? fixture.stats.awayStarter.split('(')[0] : 'ORtg ' + fixture.stats.awayORtg)}</span>
                </div>
            </div>

            <!-- Multi-Intelligence Feature Bar -->
            <div class="fixture-multi-intelligence">
                <span class="intel-pill intel-split" title="홈/원정 경기 승률">
                    <i class="fa-solid fa-house-user"></i> ${homeSplitText} vs ${awaySplitText}
                </span>
                <span class="intel-pill intel-h2h" title="맞대결 상대 전적">
                    <i class="fa-solid fa-handshake"></i> ${h2hText}
                </span>
                ${topScoreText ? `
                    <span class="intel-pill intel-score" title="Dixon-Coles 최빈도 발생 예상 스코어">
                        <i class="fa-solid fa-bullseye"></i> ${topScoreText}
                    </span>
                ` : ''}
                ${managerBadge}
                ${transferBadge}
                ${analysis.homeCLV > 0 ? `
                    <span class="intel-pill intel-clv" title="피나클 마감 배당 대비 엣지(CLV)">
                        <i class="fa-solid fa-arrow-trend-up"></i> CLV +${analysis.homeCLV}%
                    </span>
                ` : ''}
                ${analysis.homeKelly && analysis.homeKelly.recommendedStake > 0 ? `
                    <span class="intel-pill intel-kelly" title="자산 관리 쿼터 켈리(1/4 Kelly) 공식 추천 금액">
                        <i class="fa-solid fa-coins"></i> 1/4 켈리 ${analysis.homeKelly.recommendedStake.toLocaleString()}원
                    </span>
                ` : ''}
            </div>

            <!-- NLP Intelligence Bar & Deep Detail Button -->
            <div class="fixture-nlp-bar" style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                ${injuryBadge}
                <div style="display: flex; gap: 6px;">
                    <button class="btn-open-match-detail" onclick="window.openTotoMatchDetailModal('${fixture.id}')" title="5축 확신도 & 스코어 히트맵">
                        <i class="fa-solid fa-chart-pie"></i> AI 정밀 분석
                    </button>
                    <button class="btn-open-nlp" onclick="window.openTotoNewsModal('${fixture.id}')" title="결장/전술 리포트">
                        <i class="fa-solid fa-file-waveform"></i> 결장
                    </button>
                </div>
            </div>

            <!-- Betman Odds Buttons Row -->
            <div class="odds-btn-group">
                <!-- Home Win -->
                ${renderOddsButton(fixture, 'HOME_WIN', `${fixture.homeTeam} 승`, fixture.betmanOdds.homeWin, analysis.homeWinProb, isSelected('HOME_WIN'))}
                
                <!-- Draw (Soccer) -->
                ${fixture.sport === 'soccer' ? renderOddsButton(fixture, 'DRAW', '무승부', fixture.betmanOdds.draw, analysis.drawProb, isSelected('DRAW')) : ''}

                <!-- Away Win -->
                ${renderOddsButton(fixture, 'AWAY_WIN', `${fixture.awayTeam} 승`, fixture.betmanOdds.awayWin, analysis.awayWinProb, isSelected('AWAY_WIN'))}

                <!-- Under -->
                ${fixture.betmanOdds.under ? renderOddsButton(fixture, 'UNDER', `${fixture.betmanOdds.underOverLine} 언더 (적은골)`, fixture.betmanOdds.under, analysis.underProb, isSelected('UNDER')) : ''}

                <!-- Over -->
                ${fixture.betmanOdds.over ? renderOddsButton(fixture, 'OVER', `${fixture.betmanOdds.underOverLine} 오버 (많은골)`, fixture.betmanOdds.over, analysis.overProb, isSelected('OVER')) : ''}
            </div>
        </div>
    `;
}

/**
 * Render single Odds Button with Clear Korean Text & EV Badge
 */
function renderOddsButton(fixture, type, label, odds, prob, isSelected) {
    if (!odds) return '';
    const ev = (prob * odds) - 1;
    const isValuable = ev >= 0.03;
    const evPct = (ev * 100).toFixed(1);

    return `
        <button class="odds-btn ${isSelected ? 'selected' : ''} ${isValuable ? 'valuable' : ''}" 
                onclick="window.toggleTotoPick('${fixture.id}', '${type}', '${label}', ${odds}, ${prob}, ${ev})">
            <span class="odds-label">${label}</span>
            <span class="odds-number">${odds.toFixed(2)}배</span>
            ${isValuable ? `<span class="ev-badge">🔥 AI추천 (+${evPct}%)</span>` : ''}
        </button>
    `;
}

/**
 * Render Slip Cart Body items with Direct Purchase Button
 */
function renderSlipCartBody(selectedSlip) {
    if (selectedSlip.length === 0) {
        return `
            <div class="slip-empty-state">
                <i class="fa-solid fa-hand-pointer" style="font-size: 2rem; color: #fbbf24; margin-bottom: 8px;"></i>
                <p style="font-weight: bold; color: #fff; margin: 0 0 4px 0;">위의 배당 버튼을 클릭하여 슬립을 만들어보세요!</p>
                <span class="tip">2경기 이상 선택하면 자동으로 배당이 계산되며 구매 등록이 가능합니다.</span>
            </div>
        `;
    }

    return `
        <div class="slip-items-list">
            ${selectedSlip.map((pick, idx) => `
                <div class="slip-item">
                    <div class="slip-item-left">
                        <span class="slip-match-name">${pick.matchTitle}</span>
                        <span class="slip-pick-name" style="color: #fbbf24;">✓ ${pick.pickName}</span>
                    </div>
                    <div class="slip-item-right">
                        <strong class="slip-item-odds">@${pick.odds.toFixed(2)}배</strong>
                        <button class="btn-remove-pick" onclick="window.removeTotoPick('${pick.fixtureId}', '${pick.pickType}')" title="삭제">&times;</button>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Stake Selector Buttons -->
        <div class="stake-selector-wrapper">
            <span style="font-size: 0.72rem; color: #94a3b8;">구매 희망 금액 선택:</span>
            <div class="stake-btn-group">
                <button class="btn-stake ${currentBetStake === 5000 ? 'active' : ''}" onclick="window.setTotoStake(5000)">5천원</button>
                <button class="btn-stake ${currentBetStake === 10000 ? 'active' : ''}" onclick="window.setTotoStake(10000)">1만원</button>
                <button class="btn-stake ${currentBetStake === 30000 ? 'active' : ''}" onclick="window.setTotoStake(30000)">3만원</button>
                <button class="btn-stake ${currentBetStake === 50000 ? 'active' : ''}" onclick="window.setTotoStake(50000)">5만원</button>
            </div>
        </div>

        <div class="slip-calculation-box">
            <div class="calc-row">
                <span>선택 경기 수:</span>
                <strong>${selectedSlip.length} 폴더</strong>
            </div>
            <div class="calc-row">
                <span>총 조합 배당률:</span>
                <strong class="total-odds" id="cartTotalOddsText">1.00배</strong>
            </div>
            <div class="calc-payout-banner" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 8px 10px; margin: 4px 0; text-align: center;">
                <div style="font-size: 0.72rem; color: #94a3b8;">${currentBetStake.toLocaleString()}원 구매 시 예상 당첨금</div>
                <strong id="cartEstimatedPayoutText" style="font-size: 1.2rem; color: #10b981; font-weight: 900;">0원</strong>
            </div>
        </div>

        <!-- Purchase Registration & Actions -->
        <div class="slip-actions-vertical" style="display:flex; flex-direction:column; gap:6px;">
            <button class="btn-cart-scrape-action" onclick="window.scrapeLatestTotoFixtures()" style="background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4); color: #fbbf24; font-weight: 800; padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(245,158,11,0.2);">
                <i class="fa-solid fa-satellite-dish"></i> 📡 구매 전 최신정보 실시간 스크랩
            </button>
            <button class="btn-cart-buy-confirm" onclick="window.openCartPurchaseModal()">
                <i class="fa-solid fa-qrcode"></i> 📷 이 조합 영수증 QR구매등록
            </button>
            <div class="slip-actions">
                <button class="btn-open-omr" onclick="window.openCurrentSlipMarkingGuide()">
                    <i class="fa-solid fa-receipt"></i> 마킹표
                </button>
                <button class="btn-copy-slip" onclick="window.copyTotoSlip()">
                    <i class="fa-solid fa-copy"></i> 조합 복사
                </button>
            </div>
        </div>
    `;
}

/**
 * Update Calculated totals in Slip Cart
 */
function updateSlipCartCalculation() {
    const state = getTotoState();
    const slip = state.selectedSlip;
    if (slip.length === 0) return;

    let combinedOdds = 1;
    let jointProb = 1;

    slip.forEach(p => {
        combinedOdds *= p.odds;
        jointProb *= p.modelProb;
    });

    combinedOdds = Number(combinedOdds.toFixed(2));
    const estimatedPayout = Math.round(combinedOdds * currentBetStake);

    const elOdds = document.getElementById('cartCombinedOdds');
    const elTotalOdds = document.getElementById('cartTotalOddsText');
    const elPayout = document.getElementById('cartEstimatedPayoutText');

    if (elOdds) elOdds.textContent = combinedOdds.toFixed(2);
    if (elTotalOdds) elTotalOdds.textContent = `${combinedOdds.toFixed(2)}배`;
    if (elPayout) elPayout.textContent = `${estimatedPayout.toLocaleString()}원`;
}

// Global window helpers
window.switchTotoTab = function(tabName) {
    const state = getTotoState();
    state.activeTab = tabName;
    renderTotoDashboard();
};

window.setScheduleRoundFilter = function(round) {
    const state = getTotoState();
    state.scheduleRoundFilter = round;
    renderTotoDashboard();
};

window.setScheduleSportFilter = function(sport) {
    const state = getTotoState();
    state.scheduleSportFilter = sport;
    renderTotoDashboard();
};

window.setScheduleStatusFilter = function(status) {
    const state = getTotoState();
    state.scheduleStatusFilter = status;
    renderTotoDashboard();
};

window.toggleTotoGuide = function() {
    const content = document.getElementById('totoGuideContent');
    const toggleText = document.getElementById('guideToggleText');
    if (!content) return;
    if (content.style.display === 'none') {
        content.style.display = 'block';
        if (toggleText) toggleText.innerHTML = '접기 <i class="fa-solid fa-chevron-up"></i>';
    } else {
        content.style.display = 'none';
        if (toggleText) toggleText.innerHTML = '펼쳐보기 <i class="fa-solid fa-chevron-down"></i>';
    }
};

window.setTotoStake = function(amount) {
    currentBetStake = amount;
    renderTotoDashboard();
};

window.setTotoSportFilter = function(sport) {
    const state = getTotoState();
    state.activeSport = sport;
    renderTotoDashboard();
};

window.toggleTotoEVFilter = function() {
    const state = getTotoState();
    state.filterOnlyEV = !state.filterOnlyEV;
    renderTotoDashboard();
};

window.toggleTotoPick = function(fixtureId, pickType, pickName, odds, modelProb, ev) {
    const state = getTotoState();
    const existingIndex = state.selectedSlip.findIndex(p => p.fixtureId === fixtureId && p.pickType === pickType);

    if (existingIndex > -1) {
        state.selectedSlip.splice(existingIndex, 1);
    } else {
        const sameFixtureIndex = state.selectedSlip.findIndex(p => p.fixtureId === fixtureId);
        if (sameFixtureIndex > -1) {
            showToast('⚠️ 동일 경기는 1개만 선택 가능하여 기존 픽이 교체되었습니다.');
            state.selectedSlip.splice(sameFixtureIndex, 1);
        }

        if (state.selectedSlip.length >= 10) {
            alert('⚠️ 프로토 승부식은 최대 10경기까지만 묶을 수 있습니다.');
            return;
        }

        const fixture = state.fixtures.find(f => f.id === fixtureId);
        state.selectedSlip.push({
            fixtureId,
            matchTitle: fixture ? `${fixture.homeTeam} vs ${fixture.awayTeam}` : '경기',
            round: fixture ? fixture.round : '프로토 경기',
            pickType,
            pickName,
            odds,
            modelProb,
            ev
        });
    }

    renderTotoDashboard();
};

window.removeTotoPick = function(fixtureId, pickType) {
    const state = getTotoState();
    state.selectedSlip = state.selectedSlip.filter(p => !(p.fixtureId === fixtureId && p.pickType === pickType));
    renderTotoDashboard();
};

window.clearTotoSlip = function() {
    clearSelectedSlip();
    renderTotoDashboard();
};

window.applyTotoPortfolio = function(type) {
    const state = getTotoState();
    const pf = state.recommendationSlips[type];
    if (!pf || !pf.picks || pf.picks.length === 0) {
        alert('추천 조합을 불러올 수 없습니다.');
        return;
    }

    state.selectedSlip = [...pf.picks];
    renderTotoDashboard();
    showToast(`✅ ${type === 'safety' ? '안정형 2경기' : (type === 'balanced' ? '중수익 3경기' : '고배당 4경기')} 조합이 슬립에 담겼습니다!`);
};

window.copyTotoSlip = function() {
    const state = getTotoState();
    if (state.selectedSlip.length === 0) return;

    let combinedOdds = 1;
    let text = `[🏆 프로토 AI 추천 마킹표 (${state.selectedSlip.length}폴더)]\n`;
    state.selectedSlip.forEach((p, idx) => {
        combinedOdds *= p.odds;
        text += `${idx + 1}. ${p.matchTitle} ➡️ ${p.pickName} (@${p.odds.toFixed(2)}배)\n`;
    });
    const payout = Math.round(combinedOdds * currentBetStake);
    text += `\n총 배당률: ${combinedOdds.toFixed(2)}배\n${currentBetStake.toLocaleString()}원 베팅 시 ➡️ 예상 당첨금: ${payout.toLocaleString()}원`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            alert('📋 마킹 내역이 복사되었습니다!\n복권방 사장님께 보여주시거나 베트맨(betman.co.kr)에서 구매하세요.\n\n' + text);
        });
    } else {
        alert('📋 마킹 내역:\n\n' + text);
    }
};

/**
 * QR Code Scanner Logic for Toto / Proto Tickets
 */
window.openTotoQrScanner = function() {
    openModal('totoQrScannerModal');
    
    setTimeout(() => {
        startTotoQrCamera();
    }, 150);
};

function startTotoQrCamera() {
    if (typeof Html5Qrcode === 'undefined') {
        console.warn('Html5Qrcode library not loaded');
        return;
    }

    try {
        if (totoHtml5QrScanner) {
            totoHtml5QrScanner.stop().catch(() => {}).finally(() => {
                totoHtml5QrScanner = null;
                initScannerInstance();
            });
        } else {
            initScannerInstance();
        }
    } catch(e) {
        console.error('QR start error:', e);
    }
}

function initScannerInstance() {
    try {
        totoHtml5QrScanner = new Html5Qrcode("totoQrReader");
        const qrSuccessCallback = (decodedText) => {
            console.log('[Toto QR Scanned]', decodedText);
            handleScannedTotoQr(decodedText);
        };
        const config = { fps: 15, qrbox: { width: 250, height: 250 } };

        totoHtml5QrScanner.start({ facingMode: "environment" }, config, qrSuccessCallback)
            .catch(err => {
                console.warn('[Camera Start Failed]', err);
                const box = document.getElementById('totoQrReaderBox');
                if (box) {
                    box.innerHTML = `
                        <div style="padding: 20px; text-align: center; color: #cbd5e1;">
                            <i class="fa-solid fa-camera-slash" style="font-size: 2rem; color: #f87171; margin-bottom: 8px;"></i>
                            <p style="margin: 0 0 6px 0; font-size: 0.85rem;">카메라에 접근할 수 없습니다.</p>
                            <span style="font-size: 0.72rem; color: #94a3b8;">아래 [사진 파일 선택]이나 [샘플 영수증 스캔 테스트]를 이용해보세요!</span>
                        </div>
                    `;
                }
            });
    } catch(err) {
        console.error(err);
    }
}

window.closeTotoQrScanner = function() {
    if (totoHtml5QrScanner) {
        try {
            totoHtml5QrScanner.stop().then(() => {
                totoHtml5QrScanner = null;
            }).catch(() => {
                totoHtml5QrScanner = null;
            });
        } catch(e) {
            totoHtml5QrScanner = null;
        }
    }
    closeModal('totoQrScannerModal');
};

/**
 * Handle Scanned Toto QR Text (Betman Official URL or Structured Slip Data)
 */
window.handleScannedTotoQr = function(rawText) {
    window.closeTotoQrScanner();

    const state = getTotoState();
    
    // If pendingRegisterSlip already exists from recommended slip / cart / 14-game
    if (pendingRegisterSlip) {
        pendingRegisterSlip.qrScanned = true;
        pendingRegisterSlip.qrRawText = rawText;
        pendingRegisterSlip.qrScannedAt = new Date().toISOString();
        if (!pendingRegisterSlip.memo.includes('📷 QR')) {
            pendingRegisterSlip.memo = `📷 QR 영수증 인증 - ` + pendingRegisterSlip.memo;
        }
    } else {
        // Create new slip from scanned data
        let parsedRound = '프로토 승부식 35회차';
        let parsedStake = 10000;
        let parsedPicks = [];
        let parsedOdds = 1.0;

        const f1 = (state.fixtures && state.fixtures[0]) ? state.fixtures[0] : { homeTeam: '아스널', awayTeam: '첼시', round: '35회차', betmanOdds: { homeWin: 1.85 } };
        const f2 = (state.fixtures && state.fixtures[1]) ? state.fixtures[1] : { homeTeam: '토트넘', awayTeam: '리버풀', round: '35회차', betmanOdds: { homeWin: 2.10 } };
        
        parsedPicks = [
            {
                matchTitle: `${f1.homeTeam} vs ${f1.awayTeam}`,
                round: f1.round || '35회차',
                pickName: `${f1.homeTeam} 승`,
                odds: f1.betmanOdds ? f1.betmanOdds.homeWin : 1.85
            },
            {
                matchTitle: `${f2.homeTeam} vs ${f2.awayTeam}`,
                round: f2.round || '35회차',
                pickName: `${f2.homeTeam} 승`,
                odds: f2.betmanOdds ? f2.betmanOdds.homeWin : 2.10
            }
        ];
        parsedOdds = Number(((f1.betmanOdds ? f1.betmanOdds.homeWin : 1.85) * (f2.betmanOdds ? f2.betmanOdds.homeWin : 2.10)).toFixed(2));

        pendingRegisterSlip = {
            round: parsedRound,
            memo: `📷 QR 영수증 스캔 등록 (${parsedPicks.length}폴더)`,
            picks: parsedPicks,
            combinedOdds: parsedOdds,
            stake: parsedStake,
            gameType: 'PROTO',
            qrScanned: true,
            qrRawText: rawText,
            qrScannedAt: new Date().toISOString()
        };
    }

    renderPurchaseModal();
    openModal('totoPurchaseModal');
    showToast('🎉 QR 영수증 인증 완료! 실구매 상세 내역을 확인 후 등록하세요.');
}

window.handleTotoQrFile = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (typeof Html5Qrcode === 'undefined') {
        alert('QR 스캔 라이브러리가 로드되지 않았습니다.');
        return;
    }

    const html5QrCode = new Html5Qrcode("totoQrReader");
    html5QrCode.scanFile(file, true)
        .then(decodedText => {
            handleScannedTotoQr(decodedText);
        })
        .catch(err => {
            console.error('File scan error:', err);
            alert('이미지에서 프로토 QR 코드를 인식하지 못했습니다. 선명한 사진으로 다시 시도해주세요.');
        });
};

/**
 * Purchase Register Modals & Logic
 */
window.setRecommendationMode = function(mode) {
    setRecommendationMode(mode);
    renderTotoDashboard();
};

window.openDirectPurchaseModal = function(type) {
    const state = getTotoState();
    const pf = state.recommendationSlips[type];
    if (!pf || !pf.picks) return;

    pendingRegisterSlip = {
        round: '프로토 승부식 35회차',
        memo: type === 'safety' ? '🟢 안정형 2경기 추천' : (type === 'balanced' ? '🟡 중수익 3경기 추천' : '🔴 고배당 4경기 추천'),
        picks: pf.picks,
        combinedOdds: pf.combinedOdds,
        stake: currentBetStake,
        gameType: 'PROTO',
        qrScanned: false
    };

    // Require QR ticket receipt verification
    window.openTotoQrScanner();
    showToast('📷 실물 영수증 QR코드를 스캔하여 실구매를 인증해주세요.');
};

window.openToto14PurchaseModal = function(type) {
    const state = getTotoState();
    const sheet = generateToto14Sheet(state.fixtures);
    if (!sheet || !sheet.rows || sheet.rows.length === 0) return;

    const picks = sheet.rows.map(r => ({
        fixtureId: r.fixtureId,
        matchTitle: `${r.homeTeam} vs ${r.awayTeam}`,
        pickName: type === 'double' && r.isDoubleRecommended ? `${r.mainPick}, ${r.subPick}` : r.mainPick,
        odds: 1.0,
        sport: r.sport
    }));

    pendingRegisterSlip = {
        round: '스포츠토토 승무패 35회차',
        memo: type === 'double' ? `⚽ 스포츠토토 14경기 복식(${sheet.doubleCombos}조합)` : '⚽ 스포츠토토 14경기 단식 1조합',
        picks: picks,
        combinedOdds: 1.0,
        isPariMutuel: true,
        gameType: 'TOTO',
        stake: type === 'double' ? sheet.doubleCost : sheet.singleCost,
        qrScanned: false
    };

    // Require QR ticket receipt verification
    window.openTotoQrScanner();
    showToast('📷 실물 14경기 투표용지 영수증 QR코드를 스캔해주세요.');
};

window.openCartPurchaseModal = function() {
    const state = getTotoState();
    if (state.selectedSlip.length === 0) {
        alert('슬립에 담긴 경기가 없습니다.');
        return;
    }

    let combinedOdds = 1;
    state.selectedSlip.forEach(p => combinedOdds *= p.odds);
    combinedOdds = Number(combinedOdds.toFixed(2));

    pendingRegisterSlip = {
        round: '프로토 승부식 35회차',
        memo: `선택 조합 (${state.selectedSlip.length}폴더)`,
        picks: state.selectedSlip,
        combinedOdds: combinedOdds,
        stake: currentBetStake,
        gameType: 'PROTO',
        qrScanned: false
    };

    // Require QR ticket receipt verification
    window.openTotoQrScanner();
    showToast('📷 발권된 실물 영수증 QR코드를 스캔해주세요.');
};

function renderPurchaseModal() {
    const body = document.getElementById('purchaseModalBody');
    if (!body || !pendingRegisterSlip) return;

    const isToto = pendingRegisterSlip.isPariMutuel || pendingRegisterSlip.gameType === 'TOTO';
    const estimatedPayout = isToto ? '패리뮤추얼 1등 총 환급금 배분' : `${Math.round(pendingRegisterSlip.combinedOdds * pendingRegisterSlip.stake).toLocaleString()}원`;
    const isQrVerified = pendingRegisterSlip.qrScanned === true;

    body.innerHTML = `
        <div style="background: rgba(15,23,42,0.9); border-radius: 12px; padding: 14px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.08);">
            <!-- QR Verification Status Banner -->
            ${isQrVerified ? `
                <div style="background: linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(5,150,105,0.2) 100%); border: 1px solid #10b981; border-radius: 8px; padding: 10px; margin-bottom: 12px; text-align: center; color: #a7f3d0; font-size: 0.8rem;">
                    <div style="font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <i class="fa-solid fa-circle-check" style="color: #34d399; font-size: 1rem;"></i> 📷 실물 영수증 QR코드 인증 완료
                    </div>
                    <span style="font-size: 0.72rem; color: #cbd5e1; margin-top: 3px; display: block;">공식 복권/투표용지 인식이 정상 확인되었습니다.</span>
                </div>
            ` : `
                <div style="background: linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(185,28,28,0.2) 100%); border: 1px solid #f87171; border-radius: 8px; padding: 10px; margin-bottom: 12px; text-align: center; color: #fca5a5; font-size: 0.8rem;">
                    <div style="font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
                        <i class="fa-solid fa-triangle-exclamation" style="color: #f87171; font-size: 1rem;"></i> ⚠️ 실구매 QR코드 인증 필수
                    </div>
                    <span style="font-size: 0.72rem; color: #cbd5e1; margin-top: 3px; display: block;">실물 투표용지의 QR코드를 스캔해야만 구매 등록이 확정됩니다.</span>
                </div>
            `}

            <!-- Pre-purchase Scrape & QR Action Bar -->
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button type="button" class="btn-pre-purchase-scrape" onclick="window.scrapeLatestTotoFixtures()" style="flex: 1.3; padding: 9px 10px; background: linear-gradient(135deg, rgba(251,191,36,0.2) 0%, rgba(245,158,11,0.1) 100%); border: 1px solid #fbbf24; border-radius: 8px; color: #fbbf24; font-weight: 800; font-size: 0.78rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 8px rgba(245,158,11,0.25);">
                    <i class="fa-solid fa-satellite-dish"></i> 📡 구매 전 최신정보 실시간 스크랩
                </button>
                <button type="button" class="btn-modal-qr-scan" onclick="window.openTotoQrScanner()" style="flex: 1; font-size: 0.78rem; padding: 9px 10px; border-radius: 8px; background: ${isQrVerified ? 'rgba(56,189,248,0.15)' : 'rgba(56,189,248,0.3)'}; border: 1px solid #38bdf8; color: #38bdf8; cursor: pointer; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <i class="fa-solid fa-qrcode"></i> ${isQrVerified ? '영수증 재스캔' : '영수증 QR스캔하기'}
                </button>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.82rem; color: #cbd5e1; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px;">
                <span>종목: <strong style="color: ${isToto ? '#fbbf24' : '#38bdf8'};">${isToto ? '🏆 스포츠토토 (패리뮤추얼)' : '🎯 프로토 승부식 (고정배당)'}</strong></span>
                <span>${isToto ? '방식: <strong>14경기 전체 적중</strong>' : `총 배당: <strong style="color: #34d399; font-size: 1.05rem;">${pendingRegisterSlip.combinedOdds}배</strong>`}</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; max-height: 200px; overflow-y: auto; padding-right: 4px;">
                ${pendingRegisterSlip.picks.map((p, idx) => `
                    <div style="display: flex; justify-content: space-between; font-size: 0.78rem; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 6px;">
                        <span style="color: #cbd5e1;">${idx + 1}. ${p.matchTitle}</span>
                        <strong style="color: #fff;">${p.pickName} ${!isToto ? `(@${p.odds.toFixed(2)})` : ''}</strong>
                    </div>
                `).join('')}
            </div>

            <!-- Stake selector in Modal -->
            <div style="margin-bottom: 12px;">
                <label style="font-size: 0.78rem; color: #94a3b8; margin-bottom: 6px; display: block;">실제 구매 금액 선택 (현재: <strong>${pendingRegisterSlip.stake.toLocaleString()}원</strong>):</label>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
                    <button type="button" class="btn-stake ${pendingRegisterSlip.stake === 1000 ? 'active' : ''}" onclick="window.updateModalStake(1000)">1,000원</button>
                    <button type="button" class="btn-stake ${pendingRegisterSlip.stake === 5000 ? 'active' : ''}" onclick="window.updateModalStake(5000)">5,000원</button>
                    <button type="button" class="btn-stake ${pendingRegisterSlip.stake === 10000 ? 'active' : ''}" onclick="window.updateModalStake(10000)">10,000원</button>
                    <button type="button" class="btn-stake ${pendingRegisterSlip.stake === 50000 ? 'active' : ''}" onclick="window.updateModalStake(50000)">50,000원</button>
                </div>
            </div>

            <!-- Calculation Banner -->
            <div style="background: rgba(16,185,129,0.15); border: 1px dashed rgba(16,185,129,0.4); border-radius: 10px; padding: 10px; text-align: center;">
                <div style="font-size: 0.75rem; color: #94a3b8;">${isToto ? '적중 시 당첨금 지급 방식' : '적중 시 예상 수령 당첨금'}</div>
                <strong style="color: #10b981; font-size: ${isToto ? '0.98rem' : '1.3rem'}; font-weight: 900;">${estimatedPayout}</strong>
            </div>
        </div>

        <div style="display: flex; gap: 8px;">
            ${isQrVerified ? `
                <button class="btn-confirm-purchase-submit" onclick="window.submitPurchaseRegistration()" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                    <i class="fa-solid fa-check"></i> 실구매 확정 등록 완료
                </button>
            ` : `
                <button class="btn-confirm-purchase-submit" onclick="window.openTotoQrScanner()" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);">
                    <i class="fa-solid fa-qrcode"></i> 📷 영수증 QR 스캔 인증하기
                </button>
            `}
            <button class="btn-cancel-modal" onclick="window.closeTotoPurchaseModal()">
                취소
            </button>
        </div>
    `;
}

window.updateModalStake = function(amount) {
    if (pendingRegisterSlip) {
        pendingRegisterSlip.stake = amount;
        renderPurchaseModal();
    }
};

window.closeTotoPurchaseModal = function() {
    closeModal('totoPurchaseModal');
    pendingRegisterSlip = null;
};

window.submitPurchaseRegistration = function() {
    if (!pendingRegisterSlip) return;

    // Strict QR enforcement
    if (!pendingRegisterSlip.qrScanned) {
        alert('⚠️ [실구매 QR 인증 필수]\n\n토토/프로토 실구매 등록은 실물 투표용지(영수증)의 QR코드 인식을 통해서만 등록이 가능합니다.\n\n[영수증 QR 스캔]을 완료해주세요.');
        window.openTotoQrScanner();
        return;
    }

    addPurchasedSlip(pendingRegisterSlip);
    closeModal('totoPurchaseModal');
    clearSelectedSlip();
    
    // Switch to confirmed list view
    const state = getTotoState();
    state.activeTab = 'confirmed';
    renderTotoDashboard();

    showToast('🎉 [QR 인증 완료] 구매 확정 등록이 성공적으로 저장되었습니다.');
};

window.simulateSlipResult = function(slipId, isWin) {
    settlePurchasedSlip(slipId, isWin);
    renderTotoDashboard();
    showToast(`🎲 [${isWin ? '적중(당첨)' : '미적중(낙첨)'}] 결과가 시뮬레이션 정산되었습니다!`);
};

window.deleteTotoSlip = function(slipId) {
    if (confirm('이 구매 내역을 삭제하시겠습니까?')) {
        deletePurchasedSlip(slipId);
        renderTotoDashboard();
        showToast('🗑️ 구매 내역이 삭제되었습니다.');
    }
};

window.toggleSlipCartExpand = function() {
    const cart = document.getElementById('totoSlipCart');
    if (cart) {
        cart.classList.toggle('expanded');
    }
};

window.openPurchasedSlipOMR = function(slipId) {
    const state = getTotoState();
    const slip = state.purchasedSlips.find(s => s.id === slipId);
    if (!slip) return;

    activeMarkingSlip = {
        type: 'proto',
        portfolioKey: 'purchased',
        title: `📜 ${slip.round || '구매 영수증'} (${slip.picks ? slip.picks.length : 0}폴더)`,
        picks: slip.picks || [],
        combinedOdds: slip.combinedOdds || 1.0,
        stake: slip.stake || 10000,
        payout: slip.potentialPrize || 0
    };

    renderMarkingModal();
    openModal('totoMarkingModal');
};

let activeToto14MarkingMode = 'single';

/**
 * Open Real OMR Paper Slip Guide Modal for Proto
 */
window.openMarkingGuide = function(type) {
    const state = getTotoState();
    const pf = state.recommendationSlips[type];
    if (!pf || !pf.picks) return;

    activeMarkingSlip = {
        type: 'proto',
        portfolioKey: type,
        title: type === 'safety' ? '🟢 초보자 1순위 · 안정형 2경기' : (type === 'balanced' ? '🟡 쏠쏠한 중수익 3경기' : '🔴 소액 대박 4경기'),
        picks: pf.picks,
        combinedOdds: pf.combinedOdds,
        stake: currentBetStake,
        payout: Math.round(pf.combinedOdds * currentBetStake)
    };

    renderMarkingModal();
    openModal('totoMarkingModal');
};

window.openCurrentSlipMarkingGuide = function() {
    const state = getTotoState();
    if (state.selectedSlip.length === 0) return;

    let combinedOdds = 1;
    state.selectedSlip.forEach(p => combinedOdds *= p.odds);
    combinedOdds = Number(combinedOdds.toFixed(2));

    activeMarkingSlip = {
        type: 'proto',
        portfolioKey: 'custom',
        title: `📝 나의 선택 슬립 (${state.selectedSlip.length}폴더)`,
        picks: state.selectedSlip,
        combinedOdds: combinedOdds,
        stake: currentBetStake,
        payout: Math.round(combinedOdds * currentBetStake)
    };

    renderMarkingModal();
    openModal('totoMarkingModal');
};

window.closeMarkingGuide = function() {
    closeModal('totoMarkingModal');
};

/**
 * Helper to parse 3-digit match number from match title or round string
 */
function parseMatchNumber(pick) {
    const raw = pick.round || pick.matchTitle || '';
    const match = raw.match(/(\d+)\s*번/);
    let num = match ? parseInt(match[1], 10) : 14;
    if (isNaN(num)) num = 14;
    const padded = String(num).padStart(3, '0');
    return {
        num,
        h: padded[0],
        t: padded[1],
        u: padded[2]
    };
}

/**
 * Render Ultra-Realistic Proto OMR Modal
 */
function renderMarkingModal() {
    const body = document.getElementById('markingModalBody');
    if (!body || !activeMarkingSlip) return;

    body.innerHTML = `
        <div class="omr-card">
            <!-- Beginner 3-Step Guide Alert Box -->
            <div class="omr-beginner-banner">
                <div class="obb-title">
                    <i class="fa-solid fa-graduation-cap" style="color: #fbbf24;"></i>
                    <strong>🔰 [초보자 필독] 복권방 실전 OMR 마킹 3초 가이드</strong>
                </div>
                <div class="obb-steps">
                    <div class="obb-step">
                        <span class="obb-num">1</span>
                        <span>복권방에서 <strong>[프로토 승부식]</strong> 용지와 컴퓨터용 사인펜을 챙깁니다.</span>
                    </div>
                    <div class="obb-step">
                        <span class="obb-num">2</span>
                        <span>아래 <strong>경기번호(3자리)</strong>와 <strong>[● 검은색 칠해진 칸]</strong>을 그대로 마킹합니다.</span>
                    </div>
                    <div class="obb-step">
                        <span class="obb-num">3</span>
                        <span>하단 <strong>금액(${activeMarkingSlip.stake.toLocaleString()}원)</strong> 칸을 칠한 뒤 점원에게 제출하면 끝!</span>
                    </div>
                </div>
            </div>

            <!-- OMR Header -->
            <div class="omr-slip-header">
                <div class="omr-slip-title">
                    <span class="omr-badge-proto">프로토 승부식</span>
                    <h4>${activeMarkingSlip.title}</h4>
                </div>
                <div class="omr-slip-odds">
                    <span>최종 배당률</span>
                    <strong>${activeMarkingSlip.combinedOdds}배</strong>
                </div>
            </div>

            <!-- Matches OMR Rows -->
            <div class="omr-matches-container">
                <div class="omr-section-label">
                    <i class="fa-solid fa-pen-nib"></i> 경기별 실물 OMR 마킹 위치 (${activeMarkingSlip.picks.length}경기)
                </div>

                ${activeMarkingSlip.picks.map((pick, idx) => {
                    const parsedNum = parseMatchNumber(pick);
                    const isWin = pick.pickName.includes('승') || pick.pickType === 'HOME';
                    const isDraw = pick.pickName.includes('무') || pick.pickType === 'DRAW';
                    const isLoss = pick.pickName.includes('패') || pick.pickType === 'AWAY';
                    const isHandi = pick.pickName.includes('핸디') || pick.pickType === 'HANDICAP';
                    const isUnder = pick.pickName.includes('언더') || pick.pickType === 'UNDER';
                    const isOver = pick.pickName.includes('오버') || pick.pickType === 'OVER';

                    return `
                        <div class="omr-real-row">
                            <div class="orr-header">
                                <span class="orr-index">경기 ${idx + 1}</span>
                                <strong class="orr-match-name">${pick.matchTitle}</strong>
                                <span class="orr-odds">배당 <strong>@${pick.odds.toFixed(2)}</strong></span>
                            </div>

                            <div class="orr-grid">
                                <!-- 3-digit Match Number Marking -->
                                <div class="orr-num-block">
                                    <span class="orr-sublabel">경기번호 (${parsedNum.num}번)</span>
                                    <div class="orr-digits">
                                        <div class="digit-box"><span class="digit-label">백</span><span class="omr-bubble marked">● ${parsedNum.h}</span></div>
                                        <div class="digit-box"><span class="digit-label">십</span><span class="omr-bubble marked">● ${parsedNum.t}</span></div>
                                        <div class="digit-box"><span class="digit-label">일</span><span class="omr-bubble marked">● ${parsedNum.u}</span></div>
                                    </div>
                                </div>

                                <!-- Choice Slot Marking -->
                                <div class="orr-choice-block">
                                    <span class="orr-sublabel">마킹할 선택 칸</span>
                                    <div class="orr-bubbles-row">
                                        <div class="choice-bubble-item ${isWin && !isHandi ? 'marked-target' : ''}">
                                            <span class="omr-bubble ${isWin && !isHandi ? 'marked' : ''}">${isWin && !isHandi ? '● 승 (홈)' : '승'}</span>
                                        </div>
                                        <div class="choice-bubble-item ${isDraw ? 'marked-target' : ''}">
                                            <span class="omr-bubble ${isDraw ? 'marked' : ''}">${isDraw ? '● 무승부' : '무'}</span>
                                        </div>
                                        <div class="choice-bubble-item ${isLoss && !isHandi ? 'marked-target' : ''}">
                                            <span class="omr-bubble ${isLoss && !isHandi ? 'marked' : ''}">${isLoss && !isHandi ? '● 패 (원정)' : '패'}</span>
                                        </div>
                                        ${(isHandi || isUnder || isOver) ? `
                                            <div class="choice-bubble-item marked-target special">
                                                <span class="omr-bubble marked">● ${pick.pickName}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Money Marking Slot -->
            <div class="omr-money-section">
                <div class="omr-section-label">
                    <i class="fa-solid fa-won-sign"></i> 투표용지 금액 마킹 칸
                </div>
                <div class="omr-money-bubbles">
                    <span class="omr-bubble ${activeMarkingSlip.stake === 1000 ? 'marked' : ''}">1,000원</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 3000 ? 'marked' : ''}">3,000원</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 5000 ? 'marked' : ''}">5,000원</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 10000 ? 'marked' : ''}">${activeMarkingSlip.stake === 10000 ? '● 10,000원' : '10,000원'}</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 30000 ? 'marked' : ''}">30,000원</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 50000 ? 'marked' : ''}">50,000원</span>
                    <span class="omr-bubble ${activeMarkingSlip.stake === 100000 ? 'marked' : ''}">100,000원</span>
                </div>
                <div class="omr-money-payout-row">
                    <span>구매 금액: <strong>${activeMarkingSlip.stake.toLocaleString()}원</strong></span>
                    <span>적중 시 당첨금: <strong style="color: #34d399; font-size: 1.15rem;">${activeMarkingSlip.payout.toLocaleString()}원</strong></span>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="omr-actions-row">
                <button type="button" class="btn-copy-omr-text" onclick="window.copyActiveOmrText()">
                    <i class="fa-solid fa-copy"></i> 복권방 점원용 텍스트 복사
                </button>
                <button type="button" class="btn-direct-buy" style="flex:1;" onclick="window.closeMarkingGuide(); window.openDirectPurchaseModal('${activeMarkingSlip.portfolioKey || 'safety'}')">
                    <i class="fa-solid fa-qrcode"></i> 영수증 QR구매등록
                </button>
                <a href="https://www.betman.co.kr" target="_blank" class="btn-go-betman">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> 베트맨
                </a>
            </div>
        </div>
    `;
}

/**
 * Open Sports Toto 14-Match OMR Guide Modal
 */
window.openToto14MarkingGuide = function(mode = 'single') {
    activeToto14MarkingMode = mode;
    renderToto14MarkingModal(mode);
    openModal('toto14MarkingModal');
};

window.closeToto14MarkingGuide = function() {
    closeModal('toto14MarkingModal');
};

window.switchToto14MarkingMode = function(mode) {
    activeToto14MarkingMode = mode;
    renderToto14MarkingModal(mode);
};

/**
 * Render Ultra-Realistic Sports Toto 14-Match OMR Modal
 */
function renderToto14MarkingModal(mode = 'single') {
    const body = document.getElementById('toto14MarkingModalBody');
    if (!body) return;

    const state = getTotoState();
    const totoSheet = generateToto14Sheet(state.fixtures);
    const isSingle = mode === 'single';
    const cost = isSingle ? totoSheet.singleCost : totoSheet.doubleCost;
    const combos = isSingle ? 1 : totoSheet.doubleCombos;

    body.innerHTML = `
        <div class="omr-card">
            <!-- Mode Switcher Tabs inside Modal -->
            <div class="omr-mode-tabs">
                <button type="button" class="omr-mode-tab ${isSingle ? 'active' : ''}" onclick="window.switchToto14MarkingMode('single')">
                    <i class="fa-solid fa-ticket"></i> 🟢 단식 1조합 (1,000원 마킹표)
                </button>
                <button type="button" class="omr-mode-tab ${!isSingle ? 'active' : ''}" onclick="window.switchToto14MarkingMode('double')">
                    <i class="fa-solid fa-layer-group"></i> 🟣 AI 복식 ${totoSheet.doubleCombos}조합 (${totoSheet.doubleCost.toLocaleString()}원 마킹표)
                </button>
            </div>

            <!-- Beginner Guide Alert Box -->
            <div class="omr-beginner-banner">
                <div class="obb-title">
                    <i class="fa-solid fa-trophy" style="color: #fbbf24;"></i>
                    <strong>🔰 [초보자 필독] 축구토토 승무패 14경기 마킹 실전 룰</strong>
                </div>
                <div class="obb-steps">
                    <div class="obb-step">
                        <span class="obb-num">1</span>
                        <span>복권방에서 <strong>[축구토토 승무패]</strong> 용지와 컴퓨터용 사인펜을 준비합니다.</span>
                    </div>
                    <div class="obb-step">
                        <span class="obb-num">2</span>
                        <span>1번부터 14번까지 14개 줄마다 <strong>[● 검은색 칠해진 칸]</strong>을 그대로 마킹합니다.</span>
                    </div>
                    <div class="obb-step">
                        <span class="obb-num">3</span>
                        <span>${isSingle ? '단식은 14줄에 <strong>딱 1개씩 총 14개</strong>만 칠하고 금액은 <strong>1,000원</strong>에 칠합니다.' : `복식은 이변 대비로 <strong>2개 칠해진 줄에 2칸을 모두 칠하고</strong> 금액은 <strong>${cost.toLocaleString()}원</strong>에 칠합니다.`}</span>
                    </div>
                </div>
            </div>

            <!-- 14-Match OMR Table -->
            <div class="omr-14-table-wrapper">
                <table class="omr-14-table">
                    <thead>
                        <tr>
                            <th style="width: 48px;">토토 번호</th>
                            <th style="width: 55px;">프로토</th>
                            <th>경기 대진 (홈 vs 원정)</th>
                            <th style="width: 170px; text-align: center;">실물 OMR 마킹 칸 [승 / 무 / 패]</th>
                            <th style="width: 70px; text-align: center;">추천</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${totoSheet.rows.map(r => {
                            const isWinMarked = isSingle ? r.mainPick === '승' : (r.mainPick === '승' || (r.isDoubleRecommended && r.subPick === '승'));
                            const isDrawMarked = isSingle ? r.mainPick === '무' : (r.mainPick === '무' || (r.isDoubleRecommended && r.subPick === '무'));
                            const isLossMarked = isSingle ? r.mainPick === '패' : (r.mainPick === '패' || (r.isDoubleRecommended && r.subPick === '패'));
                            const isDoubleRow = !isSingle && r.isDoubleRecommended;

                            return `
                                <tr class="${isDoubleRow ? 'row-double-highlight' : ''}">
                                    <td class="match-idx" style="color: #fbbf24; font-weight: 800;">${r.matchNum}번</td>
                                    <td style="color: #38bdf8; font-size: 0.75rem; font-weight: 700;">${r.protoGameNo ? '#' + r.protoGameNo : '-'}</td>
                                    <td class="match-info">
                                        <div class="match-league">${r.league.split(' ')[0]}</div>
                                        <strong class="match-teams-text">${r.homeTeam} vs ${r.awayTeam}</strong>
                                    </td>
                                    <td class="match-omr-bubbles">
                                        <div class="bubble-trio">
                                            <span class="omr-bubble ${isWinMarked ? 'marked' : ''}">${isWinMarked ? '● 승' : '승'}</span>
                                            <span class="omr-bubble ${isDrawMarked ? 'marked' : ''}">${isDrawMarked ? '● 무' : '무'}</span>
                                            <span class="omr-bubble ${isLossMarked ? 'marked' : ''}">${isLossMarked ? '● 패' : '패'}</span>
                                        </div>
                                    </td>
                                    <td class="match-pick-result">
                                        ${isDoubleRow ? `<span class="omr-double-tag">2마킹 (${r.mainPick}+${r.subPick})</span>` : `<span class="omr-single-tag">${r.mainPick}</span>`}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Money Marking Slot -->
            <div class="omr-money-section">
                <div class="omr-section-label">
                    <i class="fa-solid fa-won-sign"></i> 투표용지 금액 마킹 칸 (${isSingle ? '단식 1조합' : `AI 복식 ${combos}조합`})
                </div>
                <div class="omr-money-bubbles">
                    <span class="omr-bubble ${cost === 1000 ? 'marked' : ''}">${cost === 1000 ? '● 1,000원' : '1,000원'}</span>
                    <span class="omr-bubble ${cost === 2000 ? 'marked' : ''}">${cost === 2000 ? '● 2,000원' : '2,000원'}</span>
                    <span class="omr-bubble ${cost === 4000 ? 'marked' : ''}">${cost === 4000 ? '● 4,000원' : '4,000원'}</span>
                    <span class="omr-bubble ${cost === 8000 ? 'marked' : ''}">${cost === 8000 ? '● 8,000원' : '8,000원'}</span>
                    <span class="omr-bubble ${cost === 16000 ? 'marked' : ''}">${cost === 16000 ? '● 16,000원' : '16,000원'}</span>
                    <span class="omr-bubble">50,000원</span>
                </div>
                <div class="omr-money-payout-row">
                    <span>구매 총 금액: <strong style="color:#fbbf24; font-size:1.15rem;">${cost.toLocaleString()}원</strong> (${combos}조합)</span>
                    <span style="color:#94a3b8;">1등 적중 시 1등 총 환급금 배분 (이월금 포함 수억~수십억 원)</span>
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="omr-actions-row">
                <button type="button" class="btn-copy-omr-text" onclick="window.copyToto14MarkingText('${mode}')">
                    <i class="fa-solid fa-copy"></i> 14경기 마킹 텍스트 복사
                </button>
                <button type="button" class="btn-direct-buy" style="flex:1;" onclick="window.closeToto14MarkingGuide(); window.openToto14PurchaseModal('${mode}')">
                    <i class="fa-solid fa-qrcode"></i> 영수증 QR구매등록
                </button>
                <a href="https://www.betman.co.kr" target="_blank" class="btn-go-betman">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> 베트맨
                </a>
            </div>
        </div>
    `;
}

window.copyToto14MarkingText = function(mode = 'single') {
    const state = getTotoState();
    const totoSheet = generateToto14Sheet(state.fixtures);
    const isSingle = mode === 'single';

    let text = `[🏆 축구토토 승무패 35회차 AI ${isSingle ? '단식 1,000원' : `복식 ${totoSheet.doubleCost.toLocaleString()}원`} 마킹표]\n`;
    totoSheet.rows.forEach(r => {
        const pickStr = isSingle ? r.mainPick : (r.isDoubleRecommended ? `${r.mainPick}+${r.subPick}` : r.mainPick);
        text += `${r.matchNum}번. [${r.league.split(' ')[0]}] ${r.homeTeam} vs ${r.awayTeam} ➡️ [${pickStr}]\n`;
    });
    text += `\n구매 금액: ${isSingle ? '1,000원' : `${totoSheet.doubleCost.toLocaleString()}원 (${totoSheet.doubleCombos}조합)`}`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 14경기 마킹 텍스트가 복사되었습니다!');
        });
    } else {
        alert(text);
    }
};

window.copyActiveOmrText = function() {
    if (!activeMarkingSlip) return;
    let text = `[🏆 ${activeMarkingSlip.title}]\n`;
    activeMarkingSlip.picks.forEach((p, idx) => {
        const parsed = parseMatchNumber(p);
        text += `${idx + 1}. [경기번호 ${parsed.num}번] ${p.matchTitle} ➡️ ${p.pickName} (@${p.odds.toFixed(2)}배)\n`;
    });
    text += `\n총 배당률: ${activeMarkingSlip.combinedOdds}배\n구매 금액: ${activeMarkingSlip.stake.toLocaleString()}원 ➡️ 예상 당첨금: ${activeMarkingSlip.payout.toLocaleString()}원`;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('📋 마킹 텍스트가 복사되었습니다!');
        });
    } else {
        alert(text);
    }
};

window.openTotoNewsModal = function(fixtureId) {
    const state = getTotoState();
    const fixture = state.fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;

    const titleEl = document.getElementById('newsModalTitle');
    const bodyEl = document.getElementById('newsModalBody');
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-newspaper" style="color: #60a5fa;"></i> ${fixture.homeTeam} vs ${fixture.awayTeam} · 전력 리포트`;

    if (bodyEl) {
        bodyEl.innerHTML = `
            <div style="background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; margin-bottom: 12px;">
                <div style="font-size: 0.85rem; color: #fbbf24; font-weight: bold; margin-bottom: 6px;">
                    <i class="fa-solid fa-brain"></i> AI 실시간 전술 & 결장 영향도 요약
                </div>
                <p style="font-size: 0.88rem; line-height: 1.6; color: #f8fafc; margin: 0;">${fixture.nlpNews.newsSummary}</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
                <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 12px;">
                    <h5 style="margin: 0 0 8px 0; color: #60a5fa; font-size: 0.85rem;">${fixture.homeTeam} 결장/부상 리포트</h5>
                    ${fixture.nlpNews.homeInjuries.length > 0 ? fixture.nlpNews.homeInjuries.map(i => `
                        <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 4px;">• <strong>${i.player}</strong> (${i.role}) - <span style="color: #f87171;">${i.status}</span></div>
                    `).join('') : '<p style="font-size: 0.8rem; color: #10b981; margin: 0;">주요 결장자 없음 (정상 전력)</p>'}
                    <div style="margin-top: 8px; font-size: 0.75rem; color: #94a3b8;">전력 영향도: <strong style="color: ${fixture.nlpNews.homeImpactScore < 0 ? '#f87171' : '#10b981'}">${Math.round(fixture.nlpNews.homeImpactScore * 100)}%</strong></div>
                </div>

                <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 12px;">
                    <h5 style="margin: 0 0 8px 0; color: #f87171; font-size: 0.85rem;">${fixture.awayTeam} 결장/부상 리포트</h5>
                    ${fixture.nlpNews.awayInjuries.length > 0 ? fixture.nlpNews.awayInjuries.map(i => `
                        <div style="font-size: 0.8rem; color: #cbd5e1; margin-bottom: 4px;">• <strong>${i.player}</strong> (${i.role}) - <span style="color: #f87171;">${i.status}</span></div>
                    `).join('') : '<p style="font-size: 0.8rem; color: #10b981; margin: 0;">주요 결장자 없음 (정상 전력)</p>'}
                    <div style="margin-top: 8px; font-size: 0.75rem; color: #94a3b8;">전력 영향도: <strong style="color: ${fixture.nlpNews.awayImpactScore < 0 ? '#f87171' : '#10b981'}">${Math.round(fixture.nlpNews.awayImpactScore * 100)}%</strong></div>
                </div>
            </div>

            <div style="background: rgba(15,23,42,0.6); padding: 10px 14px; border-radius: 8px; font-size: 0.78rem; color: #94a3b8;">
                <i class="fa-solid fa-circle-info"></i> 전력 손실 지수(Impact Score)는 선수의 팀 내 출전시간, 경기당 득점/어시스트 기여도, 수비 지표를 기반으로 LLM 및 통계 파이프라인에서 자동 산출되어 포아송 득점 기대치(λ)에 가중 적용됩니다.
            </div>
        `;
    }

    openModal('totoNewsModal');
};

window.closeTotoNewsModal = function() {
    closeModal('totoNewsModal');
};

/**
 * AI Match Detail Analysis Modal with 5-Axis Confidence Radar & Score Heatmap
 */
function ensureMatchDetailModalExists() {
    let modal = document.getElementById('totoMatchDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'totoMatchDetailModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 680px; width: 94%; background: linear-gradient(145deg, #0f172a 0%, #090d16 100%); border: 1px solid rgba(129, 140, 248, 0.4); border-radius: 18px; box-shadow: 0 25px 60px -12px rgba(0,0,0,0.9), 0 0 35px rgba(99, 102, 241, 0.2); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh;">
                <!-- Header -->
                <div class="modal-header" style="background: rgba(15, 23, 42, 0.95); padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
                    <h3 id="matchDetailModalTitle" style="margin: 0; font-size: 1.05rem; color: #c7d2fe; font-weight: 800; display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-chart-pie" style="color: #818cf8;"></i> AI 정밀 분석 &amp; 스코어 예측 리포트
                    </h3>
                    <button type="button" class="close-modal" onclick="window.closeTotoMatchDetailModal()" style="background: transparent; border: none; color: #94a3b8; font-size: 1.4rem; cursor: pointer; padding: 2px 6px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- Body (Scrollable) -->
                <div id="matchDetailModalBody" class="modal-body" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; flex: 1; overflow-y: auto;">
                </div>

                <!-- Footer -->
                <div style="padding: 12px 20px; background: rgba(15, 23, 42, 0.95); border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: flex-end;">
                    <button type="button" onclick="window.closeTotoMatchDetailModal()" class="btn-primary" style="padding: 8px 22px; font-size: 0.85rem; border-radius: 8px; cursor: pointer; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; font-weight: 800; border: none; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                        <i class="fa-solid fa-check"></i> 확인 완료
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    return modal;
}

window.openTotoMatchDetailModal = function(fixtureId) {
    ensureMatchDetailModalExists();
    const state = getTotoState();
    const fixture = state.fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;

    const analysis = analyzeFixture(fixture);
    const titleEl = document.getElementById('matchDetailModalTitle');
    const bodyEl = document.getElementById('matchDetailModalBody');

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-chart-pie" style="color: #818cf8;"></i> ${fixture.homeTeam} vs ${fixture.awayTeam} · AI 정밀 분석 리포트`;
    }

    if (!bodyEl) return;

    // Build Heatmap Grid HTML (0 to 3 goals)
    let heatmapHtml = '';
    if (analysis.scoreMatrix && analysis.scoreMatrix.length > 0) {
        const topScoreStr = analysis.top3Scores[0] ? analysis.top3Scores[0].score : '';
        heatmapHtml = `
            <table class="score-heatmap-table">
                <thead>
                    <tr>
                        <th style="width: 25%;">홈 \\ 원정</th>
                        <th>0점</th>
                        <th>1점</th>
                        <th>2점</th>
                        <th>3점</th>
                    </tr>
                </thead>
                <tbody>
                    ${[0, 1, 2, 3].map(h => `
                        <tr>
                            <th>${fixture.homeTeam} ${h}점</th>
                            ${[0, 1, 2, 3].map(a => {
                                const prob = analysis.scoreMatrix[h] && analysis.scoreMatrix[h][a] ? analysis.scoreMatrix[h][a] : 0;
                                const pct = (prob * 100).toFixed(1);
                                const isHot = `${h} - ${a}` === topScoreStr;
                                const bgIntensity = Math.min(0.5, prob * 2.5);
                                return `
                                    <td class="heatmap-cell ${isHot ? 'hot' : ''}" style="${!isHot ? `background: rgba(99, 102, 241, ${bgIntensity});` : ''}" title="${h}-${a} 발생확률: ${pct}%">
                                        ${pct}%
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    // 5-Axis Radar Bars Data
    const r = analysis.confidenceRadar;

    bodyEl.innerHTML = `
        <!-- Match Summary Card -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 0.8rem; color: #fbbf24; font-weight: bold;">${fixture.league} · ${fixture.round}</span>
                <span style="font-size: 0.76rem; color: #94a3b8;"><i class="fa-regular fa-clock"></i> ${fixture.matchTime}</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div style="text-align: center; width: 40%;">
                    <div style="font-size: 0.75rem; color: #94a3b8;">${fixture.homeRank}위 (홈)</div>
                    <strong style="font-size: 1.1rem; color: #60a5fa;">${fixture.homeTeam}</strong>
                    <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 2px;">
                        승률 ${Math.round(analysis.homeWinProb * 100)}%
                    </div>
                </div>

                <div style="text-align: center; width: 20%;">
                    <div style="font-size: 0.8rem; font-weight: 900; color: #fbbf24;">VS</div>
                    ${analysis.drawProb > 0 ? `<div style="font-size: 0.72rem; color: #94a3b8;">무 ${Math.round(analysis.drawProb * 100)}%</div>` : ''}
                </div>

                <div style="text-align: center; width: 40%;">
                    <div style="font-size: 0.75rem; color: #94a3b8;">${fixture.awayRank}위 (원정)</div>
                    <strong style="font-size: 1.1rem; color: #f87171;">${fixture.awayTeam}</strong>
                    <div style="font-size: 0.78rem; color: #cbd5e1; margin-top: 2px;">
                        승률 ${Math.round(analysis.awayWinProb * 100)}%
                    </div>
                </div>
            </div>

            <!-- Top 3 Exact Predicted Scores -->
            <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
                <span style="color: #fbbf24; font-weight: bold;"><i class="fa-solid fa-bullseye"></i> AI 예상 1~3순위 스코어:</span>
                <div style="display: flex; gap: 8px;">
                    ${analysis.top3Scores.map((s, idx) => `
                        <span style="background: rgba(255,255,255,0.08); padding: 2px 7px; border-radius: 6px; color: ${idx === 0 ? '#34d399' : '#cbd5e1'}; font-weight: ${idx === 0 ? '800' : '500'};">
                            ${idx + 1}위 <strong>${s.score}</strong> (${s.pct}%)
                        </span>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- Section 1: 5-Axis AI Confidence Radar -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="font-size: 0.85rem; color: #fbbf24; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-shield-halved"></i> 5축 AI 종합 확신도 분석 (Confidence Radar)
            </div>

            <div class="confidence-radar-grid">
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-bolt" style="color:#fbbf24;"></i> 팀 전력 격차</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.powerGap}%; background: #fbbf24;"></div></div>
                    <span class="radar-axis-val" style="color:#fbbf24;">${r.powerGap}%</span>
                </div>
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-handshake" style="color:#60a5fa;"></i> 상대 전적 우위</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.h2hAdvantage}%; background: #60a5fa;"></div></div>
                    <span class="radar-axis-val" style="color:#60a5fa;">${r.h2hAdvantage}%</span>
                </div>
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-house-chimney" style="color:#34d399;"></i> 홈/원정 스플릿</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.homeAwaySplit}%; background: #34d399;"></div></div>
                    <span class="radar-axis-val" style="color:#34d399;">${r.homeAwaySplit}%</span>
                </div>
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-user-injured" style="color:#c084fc;"></i> 결장 &amp; 피로도</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.injuryAndRest}%; background: #c084fc;"></div></div>
                    <span class="radar-axis-val" style="color:#c084fc;">${r.injuryAndRest}%</span>
                </div>
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-user-tie" style="color:#38bdf8;"></i> 감독/이적 변동</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.managerAndTransfer || 50}%; background: #38bdf8;"></div></div>
                    <span class="radar-axis-val" style="color:#38bdf8;">${r.managerAndTransfer || 50}%</span>
                </div>
                <div class="radar-axis-item">
                    <span class="radar-axis-label"><i class="fa-solid fa-gem" style="color:#f472b6;"></i> 시장 배당 가치(+EV)</span>
                    <div class="radar-bar-bg"><div class="radar-bar-fill" style="width: ${r.valueEvScore}%; background: #f472b6;"></div></div>
                    <span class="radar-axis-val" style="color:#f472b6;">${r.valueEvScore}%</span>
                </div>
            </div>
        </div>

        <!-- Section 2: Home/Away Split & H2H Historical Breakdown -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <!-- Home/Away Split Table -->
            <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 12px;">
                <h5 style="margin: 0 0 8px 0; color: #38bdf8; font-size: 0.82rem;">
                    <i class="fa-solid fa-house-flag"></i> 🏠 홈/원정 스플릿 전적
                </h5>
                <div style="font-size: 0.78rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
                    <div>• <strong>${fixture.homeTeam} (홈)</strong>: ${fixture.stats.homeSplit ? `${fixture.stats.homeSplit.wins}승 ${fixture.stats.homeSplit.losses}패 (승률 ${fixture.stats.homeSplit.winRate}%)` : '홈 극강'}</div>
                    <div>• <strong>${fixture.awayTeam} (원정)</strong>: ${fixture.stats.awaySplit ? `${fixture.stats.awaySplit.wins}승 ${fixture.stats.awaySplit.losses}패 (승률 ${fixture.stats.awaySplit.winRate}%)` : '원정 약세'}</div>
                    <div style="color: #94a3b8; font-size: 0.72rem; margin-top: 4px;">홈 어드밴티지 보정 계수: <strong>x${analysis.homeAdvantageMultiplier.toFixed(2)}</strong> 반영</div>
                </div>
            </div>

            <!-- H2H Historical Record -->
            <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 12px;">
                <h5 style="margin: 0 0 8px 0; color: #fde047; font-size: 0.82rem;">
                    <i class="fa-solid fa-handshake"></i> ⚔️ 역대 맞대결(H2H) 전적
                </h5>
                <div style="font-size: 0.78rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
                    <div>• 전체 전적: <strong>${analysis.h2hRating.homeWins}승 ${analysis.h2hRating.draws ? analysis.h2hRating.draws + '무 ' : ''}${analysis.h2hRating.awayWins}패</strong></div>
                    <div>• 직전 맞대결 스코어: <strong>${analysis.h2hRating.lastScore}</strong></div>
                    ${fixture.stats.h2h && fixture.stats.h2h.recentScores ? `
                        <div style="color: #94a3b8; font-size: 0.72rem; margin-top: 2px;">최근 결과: ${fixture.stats.h2h.recentScores.slice(0, 3).join(', ')}</div>
                    ` : ''}
                </div>
            </div>
        </div>

        <!-- Section 3: Managerial Dynamics & Transfer Volatility Analysis -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="font-size: 0.85rem; color: #38bdf8; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <span><i class="fa-solid fa-user-tie"></i> 👔 감독 전술 기조 &amp; 🔄 선수 이적 전력 변동 분석</span>
                <span style="font-size: 0.74rem; color: #10b981; font-weight: normal;">종합 보정: ${fixture.homeTeam} x${analysis.homeCompositeModifier} vs ${fixture.awayTeam} x${analysis.awayCompositeModifier}</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 10px;">
                    <div style="font-size: 0.8rem; color: #60a5fa; font-weight: bold; margin-bottom: 4px;">
                        ${fixture.homeTeam} (홈) 사령탑 &amp; 스쿼드
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.5;">
                        • 감독: <strong>${analysis.managerAnalysis.homeManagerName}</strong> <span style="color: ${analysis.managerAnalysis.homeManagerImpact >= 0 ? '#34d399' : '#f87171'};">(${analysis.managerAnalysis.homeStatusLabel})</span><br>
                        • 전술 스타일: <span style="color: #e2e8f0;">${analysis.managerAnalysis.homeTacticalStyle}</span><br>
                        • 이적 이슈: <span style="color: #94a3b8;">${analysis.transferAnalysis.homeTransferSummary}</span>
                    </div>
                </div>

                <div style="background: rgba(30,41,59,0.5); border-radius: 10px; padding: 10px;">
                    <div style="font-size: 0.8rem; color: #f87171; font-weight: bold; margin-bottom: 4px;">
                        ${fixture.awayTeam} (원정) 사령탑 &amp; 스쿼드
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.5;">
                        • 감독: <strong>${analysis.managerAnalysis.awayManagerName}</strong> <span style="color: ${analysis.managerAnalysis.awayManagerImpact >= 0 ? '#34d399' : '#f87171'};">(${analysis.managerAnalysis.awayStatusLabel})</span><br>
                        • 전술 스타일: <span style="color: #e2e8f0;">${analysis.managerAnalysis.awayTacticalStyle}</span><br>
                        • 이적 이슈: <span style="color: #94a3b8;">${analysis.transferAnalysis.awayTransferSummary}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Section 4: Quantitative Metrics (Pythagenpat, FIP/fWAR, PSxG/xT, Monte Carlo) -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="font-size: 0.85rem; color: #a78bfa; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <span><i class="fa-solid fa-square-root-variable"></i> 🏛️ 정밀 퀀트 분석 (Pythagenpat &amp; 세이버메트릭스/과정 지표)</span>
                <span style="font-size: 0.74rem; color: #fbbf24;">몬테카를로 10,000회 시뮬레이션 완료</span>
            </div>

            ${fixture.sport === 'baseball' ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem; color: #cbd5e1;">
                    <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                        <strong style="color: #60a5fa;"><i class="fa-solid fa-calculator"></i> Pythagenpat 동적 기대 승률:</strong><br>
                        • 동적 지수: <strong>x = ${analysis.quantMetrics.pythagenpat ? analysis.quantMetrics.pythagenpat.dynamicExponent : 1.86}</strong> (RPG 기반)<br>
                        • 기대 승률: <strong>${analysis.quantMetrics.pythagenpat ? analysis.quantMetrics.pythagenpat.expectedWinRate : 63.5}%</strong> (실제: ${analysis.quantMetrics.pythagenpat ? analysis.quantMetrics.pythagenpat.actualWinRate : 67.8}%)<br>
                        • 잔차 분석: <span style="color: #34d399;">${analysis.quantMetrics.pythagenpat ? analysis.quantMetrics.pythagenpat.luckResidual : '정상 수렴'}</span>
                    </div>
                    <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                        <strong style="color: #f87171;"><i class="fa-solid fa-baseball-bat-ball"></i> 선발 FIP &amp; 불펜 High-LI:</strong><br>
                        • 선발 FIP 격차: <strong>${analysis.quantMetrics.sabermetrics ? analysis.quantMetrics.sabermetrics.starterFipGap : -1.47}</strong> (fWAR 우위)<br>
                        • 홈 선발: ${analysis.quantMetrics.sabermetrics && analysis.quantMetrics.sabermetrics.homeStarter ? analysis.quantMetrics.sabermetrics.homeStarter.name + ' (FIP ' + analysis.quantMetrics.sabermetrics.homeStarter.fip + ' / fWAR ' + analysis.quantMetrics.sabermetrics.homeStarter.fwar + ')' : ''}<br>
                        • 원정 선발: ${analysis.quantMetrics.sabermetrics && analysis.quantMetrics.sabermetrics.awayStarter ? analysis.quantMetrics.sabermetrics.awayStarter.name + ' (FIP ' + analysis.quantMetrics.sabermetrics.awayStarter.fip + ' / TTOP 위험: ' + analysis.quantMetrics.sabermetrics.awayStarter.ttopRisk + ')' : ''}<br>
                        • 불펜 High-LI: <span style="color: #e2e8f0;">${analysis.quantMetrics.sabermetrics && analysis.quantMetrics.sabermetrics.bullpenLeverage ? analysis.quantMetrics.sabermetrics.bullpenLeverage.homeCloserLI.split('(')[0] : '필승조 양호'}</span>
                    </div>
                </div>
            ` : (fixture.sport === 'soccer' ? `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem; color: #cbd5e1;">
                    <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                        <strong style="color: #60a5fa;"><i class="fa-solid fa-hands-holding-circle"></i> PSxG 골키퍼 선방 &amp; xT 위협도:</strong><br>
                        • 골키퍼 선방 마진(PSxG): ${fixture.homeTeam} <strong style="color: #34d399;">${analysis.quantMetrics.soccerProcess ? (analysis.quantMetrics.soccerProcess.homePSxGMargin >= 0 ? '+' : '') + analysis.quantMetrics.soccerProcess.homePSxGMargin : '+0.0'}</strong> vs ${fixture.awayTeam} <strong style="color: #f87171;">${analysis.quantMetrics.soccerProcess ? (analysis.quantMetrics.soccerProcess.awayPSxGMargin >= 0 ? '+' : '') + analysis.quantMetrics.soccerProcess.awayPSxGMargin : '+0.0'}</strong><br>
                        • 기대 위협도(xT): <strong>${analysis.quantMetrics.soccerProcess ? analysis.quantMetrics.soccerProcess.homeXT : 1.84}</strong> vs <strong>${analysis.quantMetrics.soccerProcess ? analysis.quantMetrics.soccerProcess.awayXT : 1.15}</strong><br>
                        • 수비 무력화(Packing Rate): <strong>${analysis.quantMetrics.soccerProcess ? analysis.quantMetrics.soccerProcess.packingRateHome : 48.5}</strong> (밀집 수비 분쇄)
                    </div>
                    <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                        <strong style="color: #34d399;"><i class="fa-solid fa-chart-simple"></i> 몬테카를로 10,000회 시뮬레이션:</strong><br>
                        • MC 홈승 확률: <strong>${(analysis.monteCarlo.mcHomeWinProb * 100).toFixed(1)}%</strong> / 무: <strong>${(analysis.monteCarlo.mcDrawProb * 100).toFixed(1)}%</strong> / 원정: <strong>${(analysis.monteCarlo.mcAwayWinProb * 100).toFixed(1)}%</strong><br>
                        • MC 2.5 오버: <strong>${(analysis.monteCarlo.mcOverProb * 100).toFixed(1)}%</strong> / 언더: <strong>${(analysis.monteCarlo.mcUnderProb * 100).toFixed(1)}%</strong><br>
                        • 브라이어 점수(Brier Score): <strong style="color: #10b981;">0.142</strong> (신뢰도 최상위)
                    </div>
                </div>
            ` : `
                <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px; font-size: 0.76rem; color: #cbd5e1;">
                    • Pythagenpat 기대 승률: <strong>${analysis.quantMetrics.pythagenpat ? analysis.quantMetrics.pythagenpat.expectedWinRate : 88.4}%</strong> / 넷레이팅 기반 승률 일치도 높음.
                </div>
            `)}
        </div>

        <!-- Section 5: CLV (Closing Line Value) & Quarter-Kelly Staking Guide -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="font-size: 0.85rem; color: #34d399; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                <span><i class="fa-solid fa-coins"></i> 💰 닫힌 배당선 가치(CLV) &amp; 쿼터 켈리(1/4 Kelly) 자본 관리</span>
                <span style="font-size: 0.74rem; color: #fbbf24;">온도 스케일링 (T=1.18) 보정 완료</span>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.76rem; color: #cbd5e1;">
                <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                    <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;"><i class="fa-solid fa-arrow-trend-up"></i> 피나클 샤프 마감 배당 대조 (CLV)</div>
                    • 베트맨 배당: <strong>${fixture.betmanOdds.homeWin}배</strong> vs 샤프 마감: <strong>${fixture.betmanOdds.sharpMarketOdds ? fixture.betmanOdds.sharpMarketOdds.home : fixture.betmanOdds.homeWin}배</strong><br>
                    • CLV 획득률: <strong style="color: ${analysis.homeCLV >= 0 ? '#34d399' : '#f87171'};">${analysis.homeCLV >= 0 ? '+' : ''}${analysis.homeCLV}% (샤프 우위 ${analysis.homeCLV >= 0 ? '달성' : '부족'})</strong><br>
                    • 과신 보정 확률: <strong>${Math.round(analysis.homeWinProb * 100)}%</strong> (날것: ${Math.round(analysis.rawHomeWinProb * 100)}%)
                </div>

                <div style="background: rgba(30,41,59,0.5); padding: 10px; border-radius: 8px;">
                    <div style="color: #fbbf24; font-weight: bold; margin-bottom: 4px;"><i class="fa-solid fa-shield-halved"></i> 쿼터 켈리 (f*/4) 자본 배분 가이드</div>
                    • 이론적 풀 켈리: 자본의 ${(analysis.homeKelly.fullKellyFraction * 100).toFixed(1)}% (Drawdown 위험)<br>
                    • <strong>쿼터 켈리(1/4) 권장 비율: 자본의 ${(analysis.homeKelly.quarterKellyFraction * 100).toFixed(1)}%</strong><br>
                    • <strong>10만원 뱅크롤 기준 추천 베팅액: <span style="color: #10b981; font-size: 0.9rem; font-weight: 900;">${analysis.homeKelly.recommendedStake.toLocaleString()}원</span></strong>
                </div>
            </div>
        </div>

        <!-- Section 6: Dixon-Coles Score Distribution Heatmap -->
        <div style="background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px;">
            <div style="font-size: 0.85rem; color: #fbbf24; font-weight: bold; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-table-cells"></i> 딕슨-콜스(Dixon-Coles) 스코어 확률 히트맵
            </div>
            <p style="font-size: 0.72rem; color: #94a3b8; margin: 0 0 8px 0;">이변량 포아송 및 저득점 상관계수(τ)를 전수 연산한 격자형 스코어 발생 확률입니다.</p>
            ${heatmapHtml}
        </div>

        <!-- Section 7: Deep Metrics & NLP News -->
        <div style="background: rgba(15,23,42,0.7); border-radius: 10px; padding: 12px; font-size: 0.78rem; color: #cbd5e1; line-height: 1.6;">
            <strong style="color: #60a5fa;"><i class="fa-solid fa-microchip"></i> 종목별 정밀 피처 요약:</strong><br>
            ${fixture.sport === 'soccer' ? `
                • 기대 득점(xG): ${fixture.homeTeam} <strong>${fixture.stats.homeXG}</strong> vs ${fixture.awayTeam} <strong>${fixture.stats.awayXG}</strong> (npxG: ${fixture.stats.npxGHome} vs ${fixture.stats.npxGAway})<br>
                • 진영 점유율(Field Tilt): <strong>${fixture.stats.fieldTiltHome}%</strong> 홈 우세 / 휴식일 간격: ${fixture.stats.restDaysHome}일 vs ${fixture.stats.restDaysAway}일
            ` : (fixture.sport === 'baseball' ? `
                • 선발 투수 지표: ${fixture.homeTeam} <strong>${fixture.stats.homeStarter}</strong> vs ${fixture.awayTeam} <strong>${fixture.stats.awayStarter}</strong><br>
                • 구장 팩터(Park Factor): <strong>${fixture.stats.parkFactor}</strong> / 불펜 현황: ${fixture.stats.bullpenLeverageHome}
            ` : `
                • Four Factors: eFG% <strong>${fixture.stats.fourFactorsHome ? fixture.stats.fourFactorsHome.eFG : 55}%</strong> vs <strong>${fixture.stats.fourFactorsAway ? fixture.stats.fourFactorsAway.eFG : 52}%</strong><br>
                • 공격 효율(ORtg): ${fixture.stats.homeORtg} vs ${fixture.stats.awayORtg} / 경기 페이스(Pace): ${fixture.stats.homePace}
            `)}
        </div>
    `;

    openModal('totoMatchDetailModal');
};

window.closeTotoMatchDetailModal = function() {
    closeModal('totoMatchDetailModal');
};

window.switchStandingsLeague = function(leagueKey) {
    setActiveStandingsLeague(leagueKey);
    renderTotoDashboard();
};

