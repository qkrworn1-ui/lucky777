import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast } from '../../../shared/utils.js';
import { updateLoggedInUserHeaderUI, getUpcomingLottoRound } from '../../../shared/auth-mgmt.js';
import { db } from '../../../shared/db.js';
import { MyeongriService } from '../myeongri-service.js';

let freqChartInstance = null;
let oddEvenChartInstance = null;
let sumChartInstance = null;

export function renderDashboardCharts() {
    const tabDashEl = document.getElementById('tab-dashboard');
    if (!tabDashEl) return;

    if (typeof renderFortuneAdvisorCard === 'function') {
        try { renderFortuneAdvisorCard(); } catch(e) {}
    } else if (typeof window.renderFortuneAdvisorCard === 'function') {
        try { window.renderFortuneAdvisorCard(); } catch(e) {}
    }

    if (typeof updateLoggedInUserHeaderUI === 'function') {
        try { updateLoggedInUserHeaderUI(); } catch(e) {}
    } else if (typeof window.updateLoggedInUserHeaderUI === 'function') {
        try { window.updateLoggedInUserHeaderUI(); } catch(e) {}
    }

    if (!tabDashEl.classList.contains('active') && tabDashEl.style.display === 'none') {
        return;
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

let isFortuneAdvisorExpanded = false;

/**
 * 🔮 사주명리학 어드바이저 아코디언 접기/펼치기 토글러 (기본: 접힘)
 */
export function toggleFortuneAdvisorAccordion(forceState = null) {
    if (typeof forceState === 'boolean') {
        isFortuneAdvisorExpanded = forceState;
    } else {
        isFortuneAdvisorExpanded = !isFortuneAdvisorExpanded;
    }
    if (typeof window !== 'undefined') {
        window.__fortuneAdvisorExpanded = isFortuneAdvisorExpanded;
    }

    const wraps = document.querySelectorAll('.fortune-advisor-collapsible-wrap');
    wraps.forEach(wrap => {
        const toggleBar = wrap.querySelector('.fortune-toggle-bar');
        const content = wrap.querySelector('.fortune-collapsible-content');
        const btnText = wrap.querySelector('.fortune-toggle-btn-text');
        const icon = wrap.querySelector('.fortune-toggle-icon');

        if (toggleBar) {
            if (isFortuneAdvisorExpanded) toggleBar.classList.add('expanded');
            else toggleBar.classList.remove('expanded');
        }
        if (content) {
            content.style.display = isFortuneAdvisorExpanded ? 'block' : 'none';
        }
        if (btnText) {
            const hasBirth = wrap.dataset.hasBirth === 'true';
            btnText.textContent = isFortuneAdvisorExpanded ? '접기' : (hasBirth ? '상세보기' : '입력하기');
        }
        if (icon) {
            icon.className = isFortuneAdvisorExpanded ? 'fa-solid fa-chevron-up fortune-toggle-icon' : 'fa-solid fa-chevron-down fortune-toggle-icon';
        }
    });
}

/**
 * 🔮 개인 생년월일 기반 로또 구매 추천 요일 및 길시 렌더링 (사주명리학 어드바이저)
 * 기본은 접힘(Folded) 상태로 슬림한 요약 정보만 노출되며, 클릭 시 아코디언 형태로 펼쳐짐
 */
export function renderFortuneAdvisorCard(forceShowInput = false) {
    const targets = [
        document.getElementById('landingFortuneAdvisorContainer'),
        document.getElementById('dashboardFortuneAdvisorContainer')
    ].filter(Boolean);

    if (targets.length === 0) return;

    if (forceShowInput) {
        isFortuneAdvisorExpanded = true;
        if (typeof window !== 'undefined') window.__fortuneAdvisorExpanded = true;
    }

    let authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '');
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try { authId = JSON.parse(authId).userid || authId; } catch(e){}
    }
    authId = (authId || '').trim();

    // 1. 생년월일 및 캘린더 타입 조회 (캐시 및 로컬스토리지 우선, 0ms 즉시 응답)
    let birthDate = (window.__currentUser && window.__currentUser.birthDate) || null;
    let calendarType = (window.__currentUser && window.__currentUser.calendarType) || 'solar';
    let realName = (window.__currentUser && window.__currentUser.realName) || (authId ? authId : '회원');

    if (birthDate === 'null' || birthDate === 'undefined' || !birthDate || !String(birthDate).trim()) {
        birthDate = null;
    }

    if (!birthDate && authId && Array.isArray(window.__cachedUsersWithStatus)) {
        const cached = window.__cachedUsersWithStatus.find(u => (u.id === authId || u.userId === authId));
        if (cached) {
            const rawB = cached.birthDate || (cached.data && cached.data.birthDate);
            if (rawB && rawB !== 'null' && rawB !== 'undefined' && String(rawB).trim()) {
                birthDate = String(rawB).trim();
                calendarType = cached.calendarType || (cached.data && cached.data.calendarType) || calendarType;
            }
            if (cached.realName || (cached.data && cached.data.realName)) {
                realName = cached.realName || cached.data.realName;
            }
        }
    }

    if (!birthDate) {
        try {
            if (authId) {
                const rawStored = localStorage.getItem('user_birthdate_' + authId);
                if (rawStored && rawStored !== 'null' && rawStored !== 'undefined' && String(rawStored).trim()) {
                    birthDate = String(rawStored).trim();
                    calendarType = localStorage.getItem('user_calendartype_' + authId) || calendarType;
                }
            } else {
                // 비로그인(게스트)인 경우에만 이전/게스트 캐시 참조
                const rawLast = localStorage.getItem('user_birthdate_guest') || localStorage.getItem('user_birthdate_last');
                if (rawLast && rawLast !== 'null' && rawLast !== 'undefined' && String(rawLast).trim()) {
                    birthDate = String(rawLast).trim();
                    calendarType = localStorage.getItem('user_calendartype_guest') || localStorage.getItem('user_calendartype_last') || calendarType;
                }
            }
        } catch(e){}
    }

    // 비동기 백그라운드 DB 보정 (초기 렌더링 블로킹 절대 금지, 사용자관리 DB 기준 무결점 동기화)
    if (authId && window.db) {
        window.db.collection('lotto_users').doc(authId).get().then(doc => {
            if (doc && doc.exists) {
                const udata = doc.data() || {};
                const freshBirth = (udata.birthDate && udata.birthDate !== 'null' && udata.birthDate !== 'undefined' && String(udata.birthDate).trim()) ? String(udata.birthDate).trim() : null;
                const freshCal = udata.calendarType || 'solar';

                if (freshBirth) {
                    if (window.__currentUser) {
                        window.__currentUser.birthDate = freshBirth;
                        window.__currentUser.calendarType = freshCal;
                    }
                    try {
                        localStorage.setItem('user_birthdate_' + authId, freshBirth);
                        localStorage.setItem('user_calendartype_' + authId, freshCal);
                    } catch(e){}
                    if (birthDate !== freshBirth) {
                        renderFortuneAdvisorCard(false);
                    }
                } else {
                    // 사용자관리 DB에 생년월일이 미등록된 경우 로컬 잔존값도 즉시 정리 후 입력 위젯 강제 표시
                    if (window.__currentUser) {
                        window.__currentUser.birthDate = null;
                    }
                    try {
                        localStorage.removeItem('user_birthdate_' + authId);
                        localStorage.removeItem('user_calendartype_' + authId);
                    } catch(e){}
                    if (birthDate) {
                        renderFortuneAdvisorCard(false);
                    }
                }
            }
        }).catch(err => {
            console.warn('[renderFortuneAdvisorCard] Background DB lookup skipped:', err);
        });
    }

    const currentRound = (typeof getUpcomingLottoRound === 'function')
        ? getUpcomingLottoRound()
        : ((typeof window !== 'undefined' && window.getUpcomingLottoRound)
            ? window.getUpcomingLottoRound()
            : ((typeof state !== 'undefined' && state && (state.nextRoundNum || (state.latestDrawData && state.latestDrawData.drwNo + 1)))
                ? (state.nextRoundNum || state.latestDrawData.drwNo + 1)
                : 1245));

    // 2. 생년월일 유효성 및 프로필 산출 판별
    let shouldShowInput = !birthDate || forceShowInput;
    let profile = null;

    if (!shouldShowInput && birthDate) {
        const service = (typeof MyeongriService !== 'undefined') ? MyeongriService : (window.MyeongriService || null);
        if (service && typeof service.calculateMyeongriProfile === 'function') {
            profile = service.calculateMyeongriProfile(birthDate, { calendarType, currentRound });
        }
        if (!profile || !profile.stem) {
            // 계산 불가한 비정상 생년월일 포맷인 경우 빈 화면 대신 반드시 인라인 입력창 렌더링
            shouldShowInput = true;
        }
    }

    const isExpanded = !!(isFortuneAdvisorExpanded || (typeof window !== 'undefined' && window.__fortuneAdvisorExpanded));
    let summaryLeftHtml = '';
    let detailedContentHtml = '';

    // 3. 입력 위젯 또는 분석 결과 HTML 구성
    if (shouldShowInput) {
        const todayStr = new Date().toISOString().split('T')[0];
        const defaultDateValue = (birthDate && birthDate !== 'null' && birthDate !== 'undefined') ? birthDate : '1990-01-01';

        summaryLeftHtml = `
            <span class="fortune-toggle-badge badge-pending">
                <i class="fa-solid fa-compass"></i> 사주명리학 횡재수 분석
            </span>
            <div class="fortune-quick-pills">
                <span class="fortune-mini-pill" style="color: #94a3b8;">
                    <i class="fa-regular fa-calendar" style="color: #fbbf24;"></i> 생년월일 미입력
                </span>
                <span class="fortune-mini-pill pill-gold">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> 제 ${currentRound}회 맞춤 구매 길시 & 요일 확인
                </span>
            </div>
        `;

        detailedContentHtml = `
            <div class="dash-inline-birth-form" style="position:relative;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; flex-wrap:wrap; gap:14px;">
                    <div style="display:flex; align-items:flex-start; gap:14px;">
                        <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.1) 100%); border:1px solid rgba(245, 158, 11, 0.4); display:flex; align-items:center; justify-content:center; color:#fbbf24; font-size:1.3rem; flex-shrink:0;">
                            <i class="fa-solid fa-compass"></i>
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                                <span style="background:rgba(245, 158, 11, 0.2); border:1px solid rgba(245, 158, 11, 0.4); color:#fbbf24; font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px;">
                                    <i class="fa-solid fa-wand-magic-sparkles"></i> 사주명리학 횡재수 분석
                                </span>
                                <span style="font-size:0.72rem; color:#94a3b8;">제 ${currentRound}회차 맞춤형</span>
                            </div>
                            <h4 style="margin:0; font-size:1.02rem; font-weight:800; color:#fff;">
                                ${authId ? `<span style="color:#fbbf24;">${realName}</span> 회원님의 ` : ''}로또 황금 구매 요일 & 길시 분석
                            </h4>
                            <div style="font-size:0.76rem; color:#cbd5e1; margin-top:4px; line-height:1.4;">
                                생년월일을 입력하시면 회원님의 <strong style="color:#fbbf24;">일간(日干) 오행과 재물운(아극재)</strong>을 분석하여 최적의 요일과 구매 길시를 즉시 안내합니다.
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 📅 대시보드 인라인 생년월일 입력 폼 위젯 -->
                <div style="margin-top:14px; padding:12px 14px; background:rgba(15, 23, 42, 0.7); border:1px solid rgba(255, 255, 255, 0.08); border-radius:12px; display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px;">
                    <div style="flex:1 1 180px; min-width:160px;">
                        <label style="display:block; font-size:0.75rem; color:#cbd5e1; font-weight:700; margin-bottom:6px;">
                            <i class="fa-regular fa-calendar" style="color:#fbbf24; margin-right:4px;"></i>생년월일 (YYYY-MM-DD)
                        </label>
                        <input type="date" class="dash-inline-birth-date" value="${defaultDateValue}" max="${todayStr}" style="width:100%; box-sizing:border-box; background:rgba(30, 41, 59, 0.9); border:1.5px solid #475569; border-radius:10px; color:#fff; padding:9px 12px; font-size:0.88rem; font-weight:700; outline:none; transition:border-color 0.2s;" onfocus="this.style.borderColor='#f59e0b'" onblur="this.style.borderColor='#475569'" onchange="document.querySelectorAll('.dash-inline-birth-date').forEach(el => el.value = this.value);" />
                    </div>

                    <div style="flex:0 1 130px; min-width:110px;">
                        <label style="display:block; font-size:0.75rem; color:#cbd5e1; font-weight:700; margin-bottom:6px;">
                            <i class="fa-solid fa-moon" style="color:#fbbf24; margin-right:4px;"></i>양력 / 음력
                        </label>
                        <select class="dash-inline-calendar-type" style="width:100%; box-sizing:border-box; background:rgba(30, 41, 59, 0.9); border:1.5px solid #475569; border-radius:10px; color:#fff; padding:9px 12px; font-size:0.88rem; font-weight:700; outline:none; cursor:pointer;" onchange="document.querySelectorAll('.dash-inline-calendar-type').forEach(el => el.value = this.value);">
                            <option value="solar" ${calendarType !== 'lunar' ? 'selected' : ''}>양력 (Solar)</option>
                            <option value="lunar" ${calendarType === 'lunar' ? 'selected' : ''}>음력 (Lunar)</option>
                        </select>
                    </div>

                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn-dash-submit-birth" onclick="window.saveAndApplyDashboardBirthDate && window.saveAndApplyDashboardBirthDate(this);" style="padding:10px 20px; border-radius:10px; background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border:none; color:#111827; font-weight:800; font-size:0.86rem; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 14px rgba(245, 158, 11, 0.35); transition:transform 0.15s ease;" onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform='scale(1)'">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            <span>분석 및 추천받기</span>
                        </button>
                        ${forceShowInput && birthDate ? `
                            <button type="button" onclick="window.renderFortuneAdvisorCard(false);" style="padding:10px 14px; border-radius:10px; background:rgba(30, 41, 59, 0.8); border:1px solid #475569; color:#cbd5e1; font-weight:700; font-size:0.82rem; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderColor='#94a3b8';" onmouseout="this.style.borderColor='#475569';">
                                취소
                            </button>
                        ` : ''}
                    </div>
                </div>

                <!-- 안내 푸터 -->
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; font-size:0.72rem; color:#94a3b8;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i class="fa-solid fa-shield-halved" style="color:#10b981;"></i>
                        <span>기존 7대 알고리즘 및 추천번호 추출 로직에는 전혀 영향을 미치지 않는 독립 통계 가이드입니다.</span>
                    </div>
                    <span style="color:#64748b;"><i class="fa-solid fa-bolt" style="color:#f59e0b;"></i> 즉시 연산 (소요시간 0.1초)</span>
                </div>
            </div>
        `;
    } else {
        // 4. 생년월일 등록 완료 -> 실시간 사주 분석 결과 렌더링
        const s = profile.stem;
        const calLabel = calendarType === 'lunar' ? '음력' : '양력';

        summaryLeftHtml = `
            <span class="fortune-toggle-badge badge-analyzed">
                <i class="fa-solid fa-wand-magic-sparkles"></i> 황금 구매 가이드
            </span>
            <div class="fortune-quick-pills">
                <span class="fortune-mini-pill">
                    <strong style="color:#34d399;">${s.name}</strong> (${s.elementKo.split(' ')[0]})
                </span>
                <span class="fortune-mini-pill pill-gold">
                    <i class="fa-solid fa-calendar-check" style="color:#fbbf24;"></i> 1순위 <strong>${s.primaryDay}</strong>
                </span>
                <span class="fortune-mini-pill pill-time">
                    <i class="fa-solid fa-clock" style="color:#818cf8;"></i> <strong>${s.timeSlot1.split(' ')[0]}</strong>
                </span>
                <span class="fortune-mini-pill pill-score">
                    <i class="fa-solid fa-star" style="color:#fbbf24;"></i> <strong>${profile.fortuneScore}점</strong>
                </span>
            </div>
        `;

        detailedContentHtml = `
            <div style="position:relative;">
                <!-- Header Strip -->
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.08);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div style="width:40px; height:40px; border-radius:12px; background:linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(13, 148, 136, 0.1) 100%); border:1px solid rgba(16, 185, 129, 0.4); display:flex; align-items:center; justify-content:center; color:#34d399; font-size:1.2rem; flex-shrink:0;">
                            <i class="fa-solid fa-certificate"></i>
                        </div>
                        <div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="background:rgba(16, 185, 129, 0.2); border:1px solid rgba(16, 185, 129, 0.4); color:#34d399; font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:6px;">
                                    <i class="fa-solid fa-check"></i> 분석 완료
                                </span>
                                <span style="font-size:0.74rem; color:#94a3b8; font-weight:600;">출생: ${birthDate} (${calLabel})</span>
                            </div>
                            <h4 style="margin:2px 0 0 0; font-size:1rem; font-weight:800; color:#fff;">
                                <span style="color:#fbbf24;">${realName}</span> 회원님의 제 ${currentRound}회차 로또 황금 구매 가이드
                            </h4>
                        </div>
                    </div>
                    <button type="button" onclick="window.renderFortuneAdvisorCard && window.renderFortuneAdvisorCard(true);" style="padding:6px 12px; border-radius:8px; background:rgba(30, 41, 59, 0.8); border:1px solid #475569; color:#cbd5e1; font-size:0.75rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;" onmouseover="this.style.borderColor='#f59e0b'; this.style.color='#fbbf24';" onmouseout="this.style.borderColor='#475569'; this.style.color='#cbd5e1';">
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
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
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
                <div style="margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:flex-start; gap:10px;">
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

    // 🔮 아코디언 래퍼 결합 (기본 접힘, 컴팩트 요약 바 상시 노출)
    const finalHtml = `
        <div class="fortune-advisor-collapsible-wrap" data-has-birth="${shouldShowInput ? 'false' : 'true'}">
            <!-- 🔮 Compact Summary Bar (기본 접힘, 클릭 시 펼치기 토글) -->
            <div class="fortune-toggle-bar ${isExpanded ? 'expanded' : ''} ${shouldShowInput ? '' : 'analyzed'}" onclick="window.toggleFortuneAdvisorAccordion && window.toggleFortuneAdvisorAccordion();" title="클릭 시 ${isExpanded ? '접기' : '상세보기'}">
                <div class="fortune-toggle-left">
                    ${summaryLeftHtml}
                </div>
                <div class="fortune-toggle-right">
                    <button type="button" class="btn-toggle-fortune-view" onclick="event.stopPropagation(); window.toggleFortuneAdvisorAccordion && window.toggleFortuneAdvisorAccordion();">
                        <span class="fortune-toggle-btn-text">${isExpanded ? '접기' : (shouldShowInput ? '입력하기' : '상세보기')}</span>
                        <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} fortune-toggle-icon"></i>
                    </button>
                </div>
            </div>

            <!-- 📂 Collapsible Body (기본 display: none) -->
            <div class="fortune-collapsible-content" style="display: ${isExpanded ? 'block' : 'none'};">
                ${detailedContentHtml}
            </div>
        </div>
    `;

    // 모든 대상 컨테이너(랜딩 페이지 대시보드 및 통계분석 탭 대시보드)에 일괄 반영
    targets.forEach(el => {
        el.innerHTML = finalHtml;
    });
}

/**
 * 🔮 대시보드 인라인 생년월일 분석 및 저장 핸들러
 */
export async function saveAndApplyDashboardBirthDate(triggerBtn) {
    let parentForm = triggerBtn ? triggerBtn.closest('.dash-inline-birth-form') : null;
    let inputDate = parentForm ? parentForm.querySelector('.dash-inline-birth-date') : document.querySelector('.dash-inline-birth-date');
    let selectType = parentForm ? parentForm.querySelector('.dash-inline-calendar-type') : document.querySelector('.dash-inline-calendar-type');
    let btnSubmit = triggerBtn || (parentForm ? parentForm.querySelector('.btn-dash-submit-birth') : document.querySelector('.btn-dash-submit-birth'));

    const birthDate = inputDate ? inputDate.value.trim() : '';
    const calendarType = selectType ? selectType.value : 'solar';

    if (!birthDate) {
        alert('⚠️ 생년월일을 선택해주세요.');
        if (inputDate) inputDate.focus();
        return;
    }

    let authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '');
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try { authId = JSON.parse(authId).userid || authId; } catch(e){}
    }
    authId = (authId || '').trim();

    try {
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 분석 중...';
        }

        // 1. LocalStorage 동기화 (authId 및 공통 fallback)
        const storageKeyDate = authId ? ('user_birthdate_' + authId) : 'user_birthdate_guest';
        const storageKeyType = authId ? ('user_calendartype_' + authId) : 'user_calendartype_guest';
        try {
            localStorage.setItem(storageKeyDate, birthDate);
            localStorage.setItem(storageKeyType, calendarType);
            localStorage.setItem('user_birthdate_last', birthDate);
            localStorage.setItem('user_calendartype_last', calendarType);
        } catch(e) {}

        // 2. window.__currentUser 세션 동기화
        if (window.__currentUser) {
            window.__currentUser.birthDate = birthDate;
            window.__currentUser.calendarType = calendarType;
        }

        // 3. 관리자 회원 관리 캐시 동기화 (__cachedUsersWithStatus)
        if (Array.isArray(window.__cachedUsersWithStatus) && authId) {
            const cachedUser = window.__cachedUsersWithStatus.find(u => (u.id === authId || u.userId === authId));
            if (cachedUser) {
                cachedUser.birthDate = birthDate;
                cachedUser.calendarType = calendarType;
                if (cachedUser.data) {
                    cachedUser.data.birthDate = birthDate;
                    cachedUser.data.calendarType = calendarType;
                }
            }
        }

        // 4. Firestore DB 동기화 (로그인 상태인 경우)
        if (authId && window.db) {
            try {
                await window.db.collection('lotto_users').doc(authId).set({
                    birthDate: birthDate,
                    calendarType: calendarType,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            } catch(dbErr) {
                console.warn('[saveAndApplyDashboardBirthDate] DB write warning:', dbErr);
            }
        }

        // 5. 대시보드 추천 가이드 즉각 렌더링 (모든 타겟 일괄 갱신)
        renderFortuneAdvisorCard(false);

        if (typeof showToast === 'function') {
            showToast('✨ 생년월일이 등록되었습니다. 황금 구매 요일 및 길시가 분석되었습니다.');
        }
    } catch(err) {
        console.error('[saveAndApplyDashboardBirthDate Error]', err);
        alert('생년월일 분석 및 저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> <span>분석 및 추천받기</span>';
        }
    }
}

if (typeof window !== 'undefined') {
    window.renderFortuneAdvisorCard = renderFortuneAdvisorCard;
    window.saveAndApplyDashboardBirthDate = saveAndApplyDashboardBirthDate;
    window.toggleFortuneAdvisorAccordion = toggleFortuneAdvisorAccordion;
}


