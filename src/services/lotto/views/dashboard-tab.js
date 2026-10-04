import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, calculateACValue } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations } from '../generator.js';
import { recalculateGroups } from '../statistics.js';
import { calculateStats, getNeighborMatches } from '../scoring.js';
import { getLedger, saveToLedger, getComboNumbers, getHistoricalTop10Combinations } from '../ledger.js';
import { updateLoggedInUserHeaderUI } from '../../../shared/auth-mgmt.js';
import { db } from '../../../shared/db.js';
import { MyeongriService } from '../myeongri-service.js';

let freqChartInstance = null;
let oddEvenChartInstance = null;
let sumChartInstance = null;

export function renderDashboardCharts() {
    const tabDashEl = document.getElementById('tab-dashboard');
    if (!tabDashEl || (!tabDashEl.classList.contains('active') && tabDashEl.style.display === 'none')) {
        return;
    }

    if (typeof updateLoggedInUserHeaderUI === 'function') {
        try { updateLoggedInUserHeaderUI(); } catch(e) {}
    } else if (typeof window.updateLoggedInUserHeaderUI === 'function') {
        try { window.updateLoggedInUserHeaderUI(); } catch(e) {}
    }

    if (typeof renderFortuneAdvisorCard === 'function') {
        try { renderFortuneAdvisorCard(); } catch(e) {}
    }

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

/**
 * 🔮 개인 생년월일 기반 로또 구매 추천 요일 및 길시 렌더링 (사주명리학 어드바이저)
 */
export async function renderFortuneAdvisorCard() {
    const container = document.getElementById('dashboardFortuneAdvisorContainer');
    if (!container) return;

    let authId = '';
    if (typeof SafeAuth !== 'undefined' && SafeAuth.get) {
        authId = SafeAuth.get();
    } else if (window.SafeAuth && window.SafeAuth.get) {
        authId = window.SafeAuth.get();
    }
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try { authId = JSON.parse(authId).userid || authId; } catch(e){}
    }
    authId = (authId || '').trim();

    // 1. 비로그인 상태
    if (!authId) {
        container.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(30, 41, 59, 0.75) 0%, rgba(15, 23, 42, 0.9) 100%); border:1.5px solid rgba(245, 158, 11, 0.3); border-radius:16px; padding:18px 20px; box-shadow:0 8px 24px rgba(0,0,0,0.35); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
                <div style="display:flex; align-items:center; gap:14px;">
                    <div style="width:48px; height:48px; border-radius:12px; background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.3); display:flex; align-items:center; justify-content:center; color:#fbbf24; font-size:1.4rem; flex-shrink:0;">
                        <i class="fa-solid fa-compass"></i>
                    </div>
                    <div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
                            <span style="background:rgba(245, 158, 11, 0.2); border:1px solid rgba(245, 158, 11, 0.4); color:#fbbf24; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px;">사주명리학 횡재수 분석</span>
                            <span style="font-size:0.72rem; color:#94a3b8;">제 ${state.CURRENT_ROUND || 1239}회차</span>
                        </div>
                        <h4 style="margin:0; font-size:0.98rem; font-weight:800; color:#fff;">이번 회차 나만의 황금 구매 요일 & 길시</h4>
                        <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">로그인 후 생년월일을 등록하시면 회원님의 <strong style="color:#fbbf24;">일간 오행과 재물운(아극재)</strong>에 맞는 최적의 구매 요일과 길시를 안내합니다.</div>
                    </div>
                </div>
                <button type="button" onclick="if(window.openAuthModal) window.openAuthModal();" style="padding:10px 18px; border-radius:10px; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border:none; color:#111827; font-weight:800; font-size:0.82rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(245, 158, 11, 0.35);">
                    <i class="fa-solid fa-right-to-bracket"></i>
                    <span>로그인하고 확인하기</span>
                </button>
            </div>
        `;
        return;
    }

    // 2. 로그인 상태: 생년월일 조회
    let birthDate = (window.__currentUser && window.__currentUser.birthDate) || null;
    let calendarType = (window.__currentUser && window.__currentUser.calendarType) || 'solar';
    let realName = (window.__currentUser && window.__currentUser.realName) || authId;

    if (!birthDate) {
        try {
            birthDate = localStorage.getItem('user_birthdate_' + authId) || null;
            calendarType = localStorage.getItem('user_calendartype_' + authId) || calendarType;
        } catch(e){}
    }

    // DB 캐시 비동기 보정
    if (!birthDate && window.db) {
        try {
            const doc = await window.db.collection('lotto_users').doc(authId).get();
            if (doc.exists) {
                const udata = doc.data();
                if (udata.birthDate) {
                    birthDate = udata.birthDate;
                    calendarType = udata.calendarType || 'solar';
                    if (window.__currentUser) {
                        window.__currentUser.birthDate = birthDate;
                        window.__currentUser.calendarType = calendarType;
                    }
                    try {
                        localStorage.setItem('user_birthdate_' + authId, birthDate);
                        localStorage.setItem('user_calendartype_' + authId, calendarType);
                    } catch(e){}
                }
            }
        } catch(err) {
            console.warn('[renderFortuneAdvisorCard] DB lookup skipped:', err);
        }
    }

    // 3. 생년월일 미입력 상태 -> 등록 유도 뷰 (상태 1)
    if (!birthDate) {
        container.innerHTML = `
            <div style="background:linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%); border:1.5px solid rgba(245, 158, 11, 0.35); border-radius:16px; padding:18px 22px; box-shadow:0 8px 24px rgba(0,0,0,0.35); position:relative; overflow:hidden;">
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
                    <div style="display:flex; align-items:center; gap:14px;">
                        <div style="width:48px; height:48px; border-radius:12px; background:linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.1) 100%); border:1px solid rgba(245, 158, 11, 0.4); display:flex; align-items:center; justify-content:center; color:#fbbf24; font-size:1.4rem; flex-shrink:0;">
                            <i class="fa-solid fa-calendar-star"></i>
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
                                <span style="background:rgba(245, 158, 11, 0.2); border:1px solid rgba(245, 158, 11, 0.4); color:#fbbf24; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px;">
                                    <i class="fa-solid fa-compass"></i> 명리학 횡재수 분석
                                </span>
                                <span style="font-size:0.72rem; color:#94a3b8;">제 ${state.CURRENT_ROUND || 1239}회차 전용</span>
                            </div>
                            <h4 style="margin:0; font-size:1.02rem; font-weight:800; color:#fff;">이번 회차 나만의 황금 구매 요일 & 길시</h4>
                            <div style="font-size:0.76rem; color:#cbd5e1; margin-top:3px; line-height:1.4;">
                                생년월일을 등록하시면 회원님의 <strong style="color:#fbbf24;">일간(日干) 오행과 재물운(아극재)</strong>을 분석하여 최적의 구매 요일과 길시를 안내합니다.
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="window.openUserBirthInputModal && window.openUserBirthInputModal();" style="padding:10px 20px; border-radius:10px; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border:none; color:#111827; font-weight:800; font-size:0.84rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(245, 158, 11, 0.35); transition:transform 0.15s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                        <span>생년월일 간편 등록하기</span>
                    </button>
                </div>
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:0.72rem; color:#94a3b8;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-shield-halved" style="color:#10b981;"></i>
                        <span>기존 7대 알고리즘 및 추천번호 추출 로직에는 전혀 영향을 미치지 않는 독립 통계 가이드입니다.</span>
                    </div>
                    <span style="color:#64748b;">소요 시간 약 3초</span>
                </div>
            </div>
        `;
        return;
    }

    // 4. 생년월일 등록 완료 -> 실시간 사주 분석 결과 렌더링 (상태 2)
    const currentRound = state.CURRENT_ROUND || 1239;
    const profile = MyeongriService.calculateMyeongriProfile(birthDate, { calendarType, currentRound });
    if (!profile || !profile.stem) {
        console.warn('[renderFortuneAdvisorCard] Invalid profile for birthDate:', birthDate);
        return;
    }

    const s = profile.stem;
    const calLabel = calendarType === 'lunar' ? '음력' : '양력';

    container.innerHTML = `
        <div style="background:linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.98) 100%); border:1.5px solid rgba(16, 185, 129, 0.35); border-radius:16px; padding:18px 22px; box-shadow:0 10px 30px rgba(0,0,0,0.45); position:relative; overflow:hidden;">
            <!-- Header Strip -->
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding-bottom:14px; border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:42px; height:42px; border-radius:12px; background:linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 136, 0.1) 100%); border:1px solid rgba(16, 185, 129, 0.4); display:flex; align-items:center; justify-content:center; color:#34d399; font-size:1.3rem; flex-shrink:0;">
                        <i class="fa-solid fa-certificate"></i>
                    </div>
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:rgba(16, 185, 129, 0.2); border:1px solid rgba(16, 185, 129, 0.4); color:#34d399; font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:6px;">
                                <i class="fa-solid fa-check"></i> 분석 완료
                            </span>
                            <span style="font-size:0.74rem; color:#94a3b8; font-weight:600;">출생: ${birthDate} (${calLabel})</span>
                        </div>
                        <h4 style="margin:2px 0 0 0; font-size:1.02rem; font-weight:800; color:#fff;">
                            <span style="color:#fbbf24;">${realName}</span> 회원님의 제 ${currentRound}회차 로또 황금 구매 가이드
                        </h4>
                    </div>
                </div>
                <button type="button" onclick="window.openUserBirthInputModal && window.openUserBirthInputModal('${birthDate}', '${calendarType}');" style="padding:6px 12px; border-radius:8px; background:rgba(30, 41, 59, 0.8); border:1px solid #475569; color:#cbd5e1; font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;" onmouseover="this.style.borderColor='#f59e0b'; this.style.color='#fbbf24';" onmouseout="this.style.borderColor='#475569'; this.style.color='#cbd5e1';">
                    <i class="fa-solid fa-pen-to-square"></i>
                    <span>생년월일 변경</span>
                </button>
            </div>

            <!-- Profile Summary 4 Pills -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; margin:14px 0;">
                <div style="background:rgba(15, 23, 42, 0.65); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 12px;">
                    <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:3px;">나의 본원 일간</div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:0.92rem; font-weight:800; color:#34d399;">${s.name}</span>
                        <span style="font-size:0.65rem; background:rgba(16, 185, 129, 0.15); color:#34d399; padding:1px 5px; border-radius:4px;">${s.elementKo.split(' ')[0]}</span>
                    </div>
                </div>

                <div style="background:rgba(15, 23, 42, 0.65); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 12px;">
                    <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:3px;">나의 재물 오행 (아극재)</div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:0.92rem; font-weight:800; color:#fbbf24;">${s.wealthElementKo}</span>
                    </div>
                </div>

                <div style="background:rgba(15, 23, 42, 0.65); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 12px;">
                    <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:3px;">이번 주 횡재수 지수</div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:0.92rem; font-weight:800; color:#fbbf24;">${profile.fortuneScore}점</span>
                        <span style="font-size:0.7rem; color:#f59e0b;">${profile.starRating}</span>
                    </div>
                </div>

                <div style="background:rgba(15, 23, 42, 0.65); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:10px 12px;">
                    <div style="font-size:0.68rem; color:#94a3b8; margin-bottom:3px;">행운의 보완 컬러</div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${s.colorHex}; box-shadow:0 0 6px ${s.colorHex};"></span>
                        <span style="font-size:0.75rem; font-weight:700; color:#e2e8f0;">${s.luckyColor}</span>
                    </div>
                </div>
            </div>

            <!-- Golden Day & Auspicious Time Highlight Boxes -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px;">
                <!-- 추천 요일 박스 -->
                <div style="background:linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%); border:1.5px solid rgba(245, 158, 11, 0.35); border-radius:14px; padding:14px; box-shadow:0 4px 14px rgba(0,0,0,0.3);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <span style="font-size:0.78rem; font-weight:800; color:#fbbf24; display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-calendar-check"></i> 이번 회차 추천 구매 요일
                        </span>
                        <span style="font-size:0.68rem; color:#94a3b8;">동양 칠요(七曜) 매핑</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; background:rgba(245, 158, 11, 0.12); border:1px solid rgba(245, 158, 11, 0.3);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color:#111827; font-size:0.7rem; font-weight:800; padding:2px 7px; border-radius:5px;">1순위</span>
                                <span style="font-size:0.86rem; font-weight:800; color:#fff;">${s.primaryDay}</span>
                            </div>
                            <span style="font-size:0.72rem; color:#fde68a; font-weight:700;">${s.primaryDayDesc}</span>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; background:rgba(99, 102, 241, 0.1); border:1px solid rgba(99, 102, 241, 0.25);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:rgba(99, 102, 241, 0.25); color:#c7d2fe; font-size:0.7rem; font-weight:800; padding:2px 7px; border-radius:5px;">2순위</span>
                                <span style="font-size:0.84rem; font-weight:700; color:#cbd5e1;">${s.secondaryDay}</span>
                            </div>
                            <span style="font-size:0.7rem; color:#a5b4fc;">${s.secondaryDayDesc}</span>
                        </div>
                    </div>
                </div>

                <!-- 구매 길시(吉時) 박스 -->
                <div style="background:linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.85) 100%); border:1.5px solid rgba(99, 102, 241, 0.35); border-radius:14px; padding:14px; box-shadow:0 4px 14px rgba(0,0,0,0.3);">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                        <span style="font-size:0.78rem; font-weight:800; color:#a5b4fc; display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-clock"></i> 구매 골든 타임 (진태양시 보정)
                        </span>
                        <span style="font-size:0.68rem; color:#94a3b8;">판매시간(06~24시) 연동</span>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; background:rgba(99, 102, 241, 0.12); border:1px solid rgba(99, 102, 241, 0.3);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 7px; border-radius:5px;">집중 길시</span>
                                <span style="font-size:0.86rem; font-weight:800; color:#fff;">${s.timeSlot1}</span>
                            </div>
                            <span style="font-size:0.72rem; color:#c7d2fe; font-weight:600;">${s.timeSlot1Desc}</span>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; background:rgba(15, 23, 42, 0.6); border:1px solid rgba(255,255,255,0.06);">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:rgba(255,255,255,0.1); color:#94a3b8; font-size:0.7rem; font-weight:700; padding:2px 7px; border-radius:5px;">보조 길시</span>
                                <span style="font-size:0.84rem; font-weight:700; color:#cbd5e1;">${s.timeSlot2}</span>
                            </div>
                            <span style="font-size:0.7rem; color:#94a3b8;">${s.timeSlot2Desc}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Custom Advice -->
            <div style="margin-top:12px; padding:10px 14px; background:rgba(15, 23, 42, 0.7); border:1px solid rgba(255,255,255,0.08); border-radius:10px; display:flex; align-items:flex-start; gap:10px;">
                <i class="fa-solid fa-lightbulb" style="color:#fbbf24; font-size:0.95rem; margin-top:2px; flex-shrink:0;"></i>
                <div style="font-size:0.74rem; color:#cbd5e1; line-height:1.5;">
                    <strong style="color:#fff;">역학적 실천 팁:</strong> ${s.advice}
                </div>
            </div>

            <!-- Disclaimer -->
            <div style="margin-top:10px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px; font-size:0.68rem; color:#64748b;">
                <span>* 본 추천은 복권 구매의 재미와 심리적 기대를 돕는 역학 통계 가이드이며, 기존 7대 알고리즘 추천번호와 함께 독립적으로 참고하실 수 있습니다.</span>
                <span>한반도 표준 127.5° 진태양시 기준</span>
            </div>
        </div>
    `;
}

window.renderFortuneAdvisorCard = renderFortuneAdvisorCard;

