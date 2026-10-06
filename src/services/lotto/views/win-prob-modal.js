// src/services/lotto/views/win-prob-modal.js
/**
 * 🎯 로또 6/45 공식 통계적 확률 vs 당 프로그램 실전 당첨확률 비교 모달 모듈
 * - 동행복권 로또 6/45 수학적 이론 확률 (순수 자동 무작위 기준)
 * - 당 프로그램(Lucky777) 실제 추천번호 스냅샷 실전 당첨률 (10회차 4,480게임 전수 검증)
 * - 1~5등 등수별 1:1 대조 및 우수성 통계 지표 (Z-Score, 환급률, 적중 배수)
 */

let currentProbTab = 'v4'; // 'v4' (올라운더 팩) or 'all' (7대 알고리즘 전체)

export const THEORETICAL_LOTTO_PROB = {
    totalCombos: 8145060,
    ranks: {
        1: { name: '1등', condition: '6개 일치', combos: 1, prob: 0.000012277, ratioStr: '1 / 8,145,060', prizeEst: '약 20억+ 원' },
        2: { name: '2등', condition: '5개+보너스', combos: 6, prob: 0.000073664, ratioStr: '1 / 1,357,510', prizeEst: '약 5,000만 원' },
        3: { name: '3등', condition: '5개 일치', combos: 228, prob: 0.002799238, ratioStr: '1 / 35,724', prizeEst: '약 150만 원' },
        4: { name: '4등', condition: '4개 일치', combos: 11115, prob: 0.136463, ratioStr: '1 / 733', prizeEst: '50,000 원 (고정)' },
        5: { name: '5등', condition: '3개 일치', combos: 182780, prob: 2.24406, ratioStr: '1 / 44.6', prizeEst: '5,000 원 (고정)' }
    },
    totalWin: { combos: 194130, prob: 2.38341, ratioStr: '1 / 42.0' },
    expectedRoiFloor: 18.04, // 4, 5등 기준 이론적 환급률
    expectedRoiFull: 50.47   // 1~5등 전체 법정 평균 환급률
};

export const LUCKY777_LIVE_STATS = {
    v4: {
        id: 'v4',
        name: '기본 1: 올라운더 팩 (1위)',
        badge: 'ALL-ROUNDER 1위',
        tag: '실전 환급률 89.8% | 4등 8건 독점',
        totalGames: 640,
        totalCost: 640000,
        totalPrize: 575000,
        roi: 89.84,
        rankHits: { 1: 0, 2: 0, 3: 0, 4: 8, 5: 35 },
        rates: {
            1: 0.0,
            2: 0.0,
            3: 0.0,
            4: 1.2500, // 8 / 640
            5: 5.4688  // 35 / 640
        },
        cycleGames: {
            4: '80게임당 1회',
            5: '18게임당 1회',
            total: '15게임당 1회'
        },
        totalHits: 43,
        totalRate: 6.7188,
        multipliers: {
            4: '9.16배 (916%↑)',
            5: '2.44배 (244%↑)',
            total: '2.82배 (282%↑)',
            roi: '4.98배 (약 5배↑)'
        },
        zScores: {
            4: '+7.63 (p < 0.0001, 초고도 유의)',
            5: '+5.51 (p < 0.0001, 초고도 유의)'
        },
        notes: {
            1: '이론적 동일 추종 (17만 시뮬레이션 미출현 확률 97.9%)',
            2: '고액 당첨 근접 추종',
            3: '1244회차 우순애 회원 ±1 오차로 3등 직전 도달',
            4: '👑 자동(1/733G) 대비 9.2배 빈출 (80G당 1회 적중)',
            5: '⭐ 자동(1/45G) 대비 2.4배 빈출 (원금 방어 엔진)'
        }
    },
    all: {
        id: 'all',
        name: '7대 알고리즘 전체 합산 종합',
        badge: '7대 퀀트 전체',
        tag: '10회차 4,480게임 전수 대조',
        totalGames: 4480,
        totalCost: 4480000,
        totalPrize: 1190000,
        roi: 26.56,
        rankHits: { 1: 0, 2: 0, 3: 0, 4: 11, 5: 128 },
        rates: {
            1: 0.0,
            2: 0.0,
            3: 0.0,
            4: 0.2455, // 11 / 4480
            5: 2.8571  // 128 / 4480
        },
        cycleGames: {
            4: '407게임당 1회',
            5: '35게임당 1회',
            total: '32게임당 1회'
        },
        totalHits: 139,
        totalRate: 3.1027,
        multipliers: {
            4: '1.80배 (180%↑)',
            5: '1.27배 (127%↑)',
            total: '1.30배 (130%↑)',
            roi: '1.47배 (약 1.5배↑)'
        },
        zScores: {
            4: '+2.13 (p = 0.016, 유의미)',
            5: '+2.75 (p = 0.003, 유의미)'
        },
        notes: {
            1: '이론적 동일 추종',
            2: '고액 당첨 근접 추종',
            3: '트리오 마스터 팩 3수 고정틀 연계',
            4: '✨ 올라운더(8)+트리오(2)+올라운더2(1) 총 11건 배출',
            5: '⭐ 7대 알고리즘 전반에 걸친 안정적 5등 방어망'
        }
    }
};

/**
 * Ensures modal markup exists in document body
 */
function ensureWinProbModalInDOM() {
    let modal = document.getElementById('winProbComparisonModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'winProbComparisonModal';
        modal.className = 'modal-overlay win-prob-modal-overlay';
        modal.style.display = 'none';
        modal.innerHTML = `
            <div class="modal-card win-prob-modal-card">
                <!-- Header -->
                <div class="win-prob-modal-header">
                    <div class="win-prob-header-left">
                        <div class="win-prob-header-icon">
                            <i class="fa-solid fa-scale-balanced"></i>
                        </div>
                        <div class="win-prob-header-titles">
                            <div class="win-prob-header-badge-row">
                                <span class="win-prob-title-badge"><i class="fa-solid fa-chart-line"></i> 통계학적 검증 리포트</span>
                                <span class="win-prob-sample-badge">최근 10회차 4,480G 전수 대조</span>
                            </div>
                            <h3 class="win-prob-title">로또 6/45 통계적 확률 vs 당 프로그램 당첨확률</h3>
                            <p class="win-prob-subtitle">순수 '자동' 무작위 구매의 이론적 기대치와 Lucky777 실제 추천번호 스냅샷의 1:1 비교 분석</p>
                        </div>
                    </div>
                    <button type="button" class="win-prob-close-btn" onclick="window.closeWinProbComparisonModal()" aria-label="닫기">&times;</button>
                </div>

                <!-- Body (Scrollable) -->
                <div class="win-prob-modal-body" id="winProbModalContent">
                    <!-- Injected dynamically -->
                </div>

                <!-- Footer -->
                <div class="win-prob-modal-footer">
                    <span class="win-prob-footer-source">
                        <i class="fa-solid fa-circle-info"></i> 동행복권 공식 통계(1~1244회) 및 회원 14인 실제 추천번호 스냅샷 실측치 기준
                    </span>
                    <button type="button" class="btn-win-prob-dismiss" onclick="window.closeWinProbComparisonModal()">
                        확인 완료 (닫기)
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Click on backdrop to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeWinProbComparisonModal();
            }
        });
    }
    return modal;
}

/**
 * Open the comparison modal
 */
export function openWinProbComparisonModal() {
    const modal = ensureWinProbModalInDOM();
    renderWinProbModalContent(currentProbTab);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Close the comparison modal
 */
export function closeWinProbComparisonModal() {
    const modal = document.getElementById('winProbComparisonModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Switch comparison tab inside modal
 */
export function switchWinProbTab(tabId) {
    currentProbTab = tabId;
    renderWinProbModalContent(tabId);
}

/**
 * Render the modal body content
 */
export function renderWinProbModalContent(tabId = 'v4') {
    const container = document.getElementById('winProbModalContent');
    if (!container) return;

    const data = (tabId === 'all') ? LUCKY777_LIVE_STATS.all : LUCKY777_LIVE_STATS.v4;
    const isV4 = (tabId === 'v4');
    const theo = THEORETICAL_LOTTO_PROB;

    container.innerHTML = `
        <!-- 1. Comparison Target Tabs -->
        <div class="win-prob-tab-row">
            <button type="button" class="win-prob-tab-btn ${isV4 ? 'active' : ''}" onclick="window.switchWinProbTab('v4')">
                <i class="fa-solid fa-crown" style="color: #fbbf24;"></i>
                <span>👑 기본 1: 올라운더 팩 (1위 640G)</span>
                <span class="win-prob-tab-sub">환급률 89.8% / 4등 8건</span>
            </button>
            <button type="button" class="win-prob-tab-btn ${!isV4 ? 'active' : ''}" onclick="window.switchWinProbTab('all')">
                <i class="fa-solid fa-layer-group" style="color: #38bdf8;"></i>
                <span>🌐 7대 알고리즘 전체 합산 (4,480G)</span>
                <span class="win-prob-tab-sub">총 139건 적중 종합</span>
            </button>
        </div>

        <!-- 2. Top 4 KPI Metric Summary Cards -->
        <div class="win-prob-kpi-grid">
            <!-- KPI 1: 4등 적중률 -->
            <div class="win-prob-kpi-card highlight-gold">
                <div class="win-prob-kpi-top">
                    <span class="win-prob-kpi-label">4등 적중률 (4개 일치)</span>
                    <span class="win-prob-kpi-badge badge-surge">${data.multipliers[4]}</span>
                </div>
                <div class="win-prob-kpi-compare-row">
                    <div class="kpi-compare-box">
                        <span class="box-lbl">로또 자동 (이론치)</span>
                        <span class="box-val">${theo.ranks[4].prob}%</span>
                        <span class="box-sub">약 733게임당 1회</span>
                    </div>
                    <div class="kpi-compare-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    <div class="kpi-compare-box highlight">
                        <span class="box-lbl">당 프로그램 실전</span>
                        <span class="box-val text-gold">${data.rates[4]}%</span>
                        <span class="box-sub text-gold">${data.cycleGames[4]}</span>
                    </div>
                </div>
            </div>

            <!-- KPI 2: 5등 적중률 -->
            <div class="win-prob-kpi-card highlight-emerald">
                <div class="win-prob-kpi-top">
                    <span class="win-prob-kpi-label">5등 적중률 (3개 일치)</span>
                    <span class="win-prob-kpi-badge badge-green">${data.multipliers[5]}</span>
                </div>
                <div class="win-prob-kpi-compare-row">
                    <div class="kpi-compare-box">
                        <span class="box-lbl">로또 자동 (이론치)</span>
                        <span class="box-val">${theo.ranks[5].prob}%</span>
                        <span class="box-sub">약 45게임당 1회</span>
                    </div>
                    <div class="kpi-compare-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    <div class="kpi-compare-box highlight">
                        <span class="box-lbl">당 프로그램 실전</span>
                        <span class="box-val text-emerald">${data.rates[5]}%</span>
                        <span class="box-sub text-emerald">${data.cycleGames[5]}</span>
                    </div>
                </div>
            </div>

            <!-- KPI 3: 전체 당첨률 -->
            <div class="win-prob-kpi-card highlight-cyan">
                <div class="win-prob-kpi-top">
                    <span class="win-prob-kpi-label">전체 당첨 확률 (5등 이상)</span>
                    <span class="win-prob-kpi-badge badge-cyan">${data.multipliers.total}</span>
                </div>
                <div class="win-prob-kpi-compare-row">
                    <div class="kpi-compare-box">
                        <span class="box-lbl">로또 자동 (이론치)</span>
                        <span class="box-val">${theo.totalWin.prob}%</span>
                        <span class="box-sub">약 42게임당 1회</span>
                    </div>
                    <div class="kpi-compare-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    <div class="kpi-compare-box highlight">
                        <span class="box-lbl">당 프로그램 실전</span>
                        <span class="box-val text-cyan">${data.totalRate}%</span>
                        <span class="box-sub text-cyan">${data.cycleGames.total}</span>
                    </div>
                </div>
            </div>

            <!-- KPI 4: 실전 환급률 -->
            <div class="win-prob-kpi-card highlight-purple">
                <div class="win-prob-kpi-top">
                    <span class="win-prob-kpi-label">원금 회수율 (실전 환급률)</span>
                    <span class="win-prob-kpi-badge badge-purple">${data.multipliers.roi}</span>
                </div>
                <div class="win-prob-kpi-compare-row">
                    <div class="kpi-compare-box">
                        <span class="box-lbl">자동 4·5등 기대치</span>
                        <span class="box-val">${theo.expectedRoiFloor}%</span>
                        <span class="box-sub">1천원당 180원 회수</span>
                    </div>
                    <div class="kpi-compare-arrow"><i class="fa-solid fa-arrow-right"></i></div>
                    <div class="kpi-compare-box highlight">
                        <span class="box-lbl">당 프로그램 실전</span>
                        <span class="box-val text-purple">${data.roi}%</span>
                        <span class="box-sub text-purple">${isV4 ? '원금 90% 방어 회수' : '당첨금 119만원 회수'}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 3. Full Comparison Table (1등 ~ 5등) -->
        <div class="win-prob-table-wrap">
            <div class="win-prob-table-title-row">
                <h4 class="win-prob-section-title"><i class="fa-solid fa-table-list"></i> 1등 ~ 5등 전 등위 공식 확률 vs 실전 성적 1:1 대조표</h4>
                <span class="win-prob-target-tag">${data.name}</span>
            </div>
            <div class="win-prob-responsive-table">
                <table class="win-prob-table">
                    <thead>
                        <tr>
                            <th style="width: 14%;">등위 (조건)</th>
                            <th style="width: 20%;">로또 6/45 공식 확률<br><span class="th-sub">(자동 무작위 이론치)</span></th>
                            <th style="width: 24%;">당 프로그램 실전 성적<br><span class="th-sub">(${data.totalGames}게임 전수)</span></th>
                            <th style="width: 18%;">자동 대비 우수성<br><span class="th-sub">(성과 배수)</span></th>
                            <th style="width: 24%;">통계학적 평가 및 비고</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- 1등 -->
                        <tr>
                            <td>
                                <div class="rank-name-cell">
                                    <span class="rank-badge rank-1">🥇 1등</span>
                                    <span class="rank-cond">${theo.ranks[1].condition}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.ranks[1].prob}%</strong>
                                    <span class="prob-sub">${theo.ranks[1].ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell">
                                    <strong>${data.rankHits[1]}건</strong> (${data.rates[1]}%)
                                </div>
                            </td>
                            <td><span class="badge-neutral">이론치 추종</span></td>
                            <td class="text-sub-cell">${data.notes[1]}</td>
                        </tr>

                        <!-- 2등 -->
                        <tr>
                            <td>
                                <div class="rank-name-cell">
                                    <span class="rank-badge rank-2">🥈 2등</span>
                                    <span class="rank-cond">${theo.ranks[2].condition}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.ranks[2].prob}%</strong>
                                    <span class="prob-sub">${theo.ranks[2].ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell">
                                    <strong>${data.rankHits[2]}건</strong> (${data.rates[2]}%)
                                </div>
                            </td>
                            <td><span class="badge-neutral">이론치 추종</span></td>
                            <td class="text-sub-cell">${data.notes[2]}</td>
                        </tr>

                        <!-- 3등 -->
                        <tr>
                            <td>
                                <div class="rank-name-cell">
                                    <span class="rank-badge rank-3">🥉 3등</span>
                                    <span class="rank-cond">${theo.ranks[3].condition}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.ranks[3].prob}%</strong>
                                    <span class="prob-sub">${theo.ranks[3].ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell">
                                    <strong>${data.rankHits[3]}건</strong> (${data.rates[3]}%)
                                </div>
                            </td>
                            <td><span class="badge-neutral">초근접 포획중</span></td>
                            <td class="text-sub-cell">${data.notes[3]}</td>
                        </tr>

                        <!-- 4등 (핵심 하이라이트) -->
                        <tr class="highlight-row-gold">
                            <td>
                                <div class="rank-name-cell">
                                    <span class="rank-badge rank-4">✨ 4등</span>
                                    <span class="rank-cond">${theo.ranks[4].condition}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.ranks[4].prob}%</strong>
                                    <span class="prob-sub">${theo.ranks[4].ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell highlight">
                                    <strong class="text-gold">${data.rankHits[4]}건</strong> (${data.rates[4]}%)
                                    <span class="prob-sub text-gold">${data.cycleGames[4]}</span>
                                </div>
                            </td>
                            <td><span class="badge-surge-lg">${data.multipliers[4]}</span></td>
                            <td class="text-sub-cell highlight">
                                <strong class="text-gold">${data.notes[4]}</strong><br>
                                <span style="font-size:0.75rem; color:#94a3b8;">Z-검정: ${data.zScores[4]}</span>
                            </td>
                        </tr>

                        <!-- 5등 (핵심 하이라이트) -->
                        <tr class="highlight-row-emerald">
                            <td>
                                <div class="rank-name-cell">
                                    <span class="rank-badge rank-5">⭐ 5등</span>
                                    <span class="rank-cond">${theo.ranks[5].condition}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.ranks[5].prob}%</strong>
                                    <span class="prob-sub">${theo.ranks[5].ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell highlight">
                                    <strong class="text-emerald">${data.rankHits[5]}건</strong> (${data.rates[5]}%)
                                    <span class="prob-sub text-emerald">${data.cycleGames[5]}</span>
                                </div>
                            </td>
                            <td><span class="badge-green-lg">${data.multipliers[5]}</span></td>
                            <td class="text-sub-cell highlight">
                                <strong class="text-emerald">${data.notes[5]}</strong><br>
                                <span style="font-size:0.75rem; color:#94a3b8;">Z-검정: ${data.zScores[5]}</span>
                            </td>
                        </tr>

                        <!-- 합계 -->
                        <tr class="table-total-row">
                            <td><strong>총 당첨 (5등 이상)</strong></td>
                            <td>
                                <div class="prob-num-cell">
                                    <strong>${theo.totalWin.prob}%</strong>
                                    <span class="prob-sub">${theo.totalWin.ratioStr}</span>
                                </div>
                            </td>
                            <td>
                                <div class="prog-hit-cell">
                                    <strong class="text-cyan">${data.totalHits}건</strong> (${data.totalRate}%)
                                    <span class="prob-sub text-cyan">${data.cycleGames.total}</span>
                                </div>
                            </td>
                            <td><span class="badge-cyan-lg">${data.multipliers.total}</span></td>
                            <td>
                                <strong style="color:#fde047;">실전 환급률: ${data.roi}% (+${data.totalPrize.toLocaleString()}원 회수)</strong>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 4. Why Lucky777 Outperforms Auto (3 Science Pillars) -->
        <div class="win-prob-science-box">
            <h4 class="win-prob-section-title"><i class="fa-solid fa-atom"></i> 왜 당 프로그램이 순수 '자동' 무작위 구매보다 압도적으로 우수한가?</h4>
            <div class="win-prob-pillars-grid">
                <div class="pillar-card">
                    <div class="pillar-icon"><i class="fa-solid fa-filter-circle-xmark"></i></div>
                    <div class="pillar-content">
                        <strong>1. 7-Point 퀀트 필터링 (쓰레기 조합 70% 사전 폐기)</strong>
                        <p>편의점 자동은 한 대역 쏠림(1~10번에 6개), 4연번, 극단적 합계 등 역대 1등 출현 확률 0%에 수렴하는 비현실적 조합을 그대로 발급합니다. Lucky777은 AC값 8 이상, 합계 120~170 등 7중 필터로 비효율 조합을 100% 차단합니다.</p>
                    </div>
                </div>
                <div class="pillar-card">
                    <div class="pillar-icon"><i class="fa-solid fa-circle-nodes"></i></div>
                    <div class="pillar-content">
                        <strong>2. Maximal Clique (최대 클릭 앵커 결합)</strong>
                        <p>개별 난수를 무작위로 뽑지 않고, 역대 당첨 데이터에서 동시 출현 결합 확률(Joint Probability)이 가장 높은 코어 군집을 앵커로 채택합니다. 1수가 맞으면 3·4수가 세트로 따라 나오는 '연쇄 적중 효과'를 창출합니다.</p>
                    </div>
                </div>
                <div class="pillar-card">
                    <div class="pillar-icon"><i class="fa-solid fa-shield-halved"></i></div>
                    <div class="pillar-content">
                        <strong>3. 회원 간 상호보완 분산망 (멸구간 헷지)</strong>
                        <p>회원들끼리 번호가 중복 낭비되지 않도록 대역을 분산 방어하는 동시에, 8~10번 치트키 슬롯에서는 가장 확률 밀도가 높은 코어를 집중 타격하는 '분산 + 집중' 투트랙 포트폴리오를 적용합니다.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Global window bindings
if (typeof window !== 'undefined') {
    window.openWinProbComparisonModal = openWinProbComparisonModal;
    window.closeWinProbComparisonModal = closeWinProbComparisonModal;
    window.switchWinProbTab = switchWinProbTab;
    window.renderWinProbModalContent = renderWinProbModalContent;
}
