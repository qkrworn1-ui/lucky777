import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast } from '../../../shared/utils.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';
import { computeUser70RecommendationsReview, getUserJoinRound } from './review-tab.js';
import { calculate7AlgorithmsPerformance, SEVEN_ALGORITHMS_INFO } from './algorithms-tab.js';

let memberDiagnosisCache = null;
let currentSearchQuery = '';
let currentAlgoFilter = 'all';
let currentMemberTypeFilter = 'all';
let currentSortKey = 'prize_desc';
let expandedMemberDetails = {};

/**
 * 7대 알고리즘 진단 가중치 점수 계산
 */
function computeAlgoFitnessScore(algo) {
    if (!algo) return 0;
    const hits = algo.rankCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const score = (hits[1] * 10000000) +
                  (hits[2] * 2000000) +
                  (hits[3] * 300000) +
                  (hits[4] * 10000) +
                  (hits[5] * 1000) +
                  (algo.totalPrize || 0) +
                  ((algo.totalWins || 0) * 500) +
                  ((algo.roi || 0) * 10);
    return score;
}

/**
 * 회원 1인에 대한 7대 알고리즘 전수 분석 및 최적 알고리즘 진단
 */
export function diagnoseMemberOptimalAlgorithms(userObj) {
    const rawId = (userObj.id || '').trim();
    const cleanId = rawId.toLowerCase();
    const userName = userObj.name || userObj.realName || cleanId;
    const phone = userObj.phone || userObj.phoneNumber || '';
    const isPerm = !!(userObj.isPermanent === true || userObj.userType === 'permanent' || userObj.isAdmin === true || userObj.role === 'admin' || cleanId === 'master' || cleanId === 'admin');
    const joinRound = getUserJoinRound(cleanId);
    
    // Calculate performance across all 7 algorithms from joinRound
    const perfData = calculate7AlgorithmsPerformance(joinRound, cleanId);
    const algos = (perfData.results || []).map(a => {
        const score = computeAlgoFitnessScore(a);
        return {
            ...a,
            score
        };
    });

    // Sort algorithms: highest fitness score first
    const sortedAlgos = [...algos].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.totalPrize !== a.totalPrize) return b.totalPrize - a.totalPrize;
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
        return (b.roi || 0) - (a.roi || 0);
    });

    const bestAlgo = sortedAlgos[0] || SEVEN_ALGORITHMS_INFO[0];
    const subAlgo = sortedAlgos[1] || SEVEN_ALGORITHMS_INFO[2];

    // Member total stats across all algos
    const totalMemberPrize = algos.reduce((sum, a) => sum + (a.totalPrize || 0), 0);
    const totalMemberWins = algos.reduce((sum, a) => sum + (a.totalWins || 0), 0);
    const totalMemberGames = algos.reduce((sum, a) => sum + (a.totalGames || 0), 0);
    const totalMemberInvest = totalMemberGames * 1000;
    const memberRoi = totalMemberInvest > 0 ? (((totalMemberPrize - totalMemberInvest) / totalMemberInvest) * 100).toFixed(1) : '0.0';

    // Best rank across all algorithms
    let memberBestRank = 999;
    algos.forEach(a => {
        if (a.topRank && a.topRank < memberBestRank) {
            memberBestRank = a.topRank;
        }
    });

    // Generate AI personalized diagnostic commentary
    let aiComment = '';
    const bestHits = bestAlgo.rankCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const bestHighHits = [];
    if (bestHits[1] > 0) bestHighHits.push(`1등 ${bestHits[1]}회`);
    if (bestHits[2] > 0) bestHighHits.push(`2등 ${bestHits[2]}회`);
    if (bestHits[3] > 0) bestHighHits.push(`3등 ${bestHits[3]}회`);
    if (bestHits[4] > 0) bestHighHits.push(`4등 ${bestHits[4]}회`);
    if (bestHits[5] > 0) bestHighHits.push(`5등 ${bestHits[5]}회`);

    if (bestAlgo.totalPrize > 0 || bestAlgo.totalWins > 0) {
        const hitDesc = bestHighHits.length > 0 ? bestHighHits.join(', ') : `${bestAlgo.totalWins}회 적중`;
        aiComment = `🎯 [${userName}] 회원님은 <strong>${bestAlgo.name}</strong>에서 ${hitDesc} (총 당첨금 ${bestAlgo.totalPrize.toLocaleString()}원 / ROI ${bestAlgo.roi > 0 ? '+' : ''}${bestAlgo.roi}%)으로 압도적 최적 적합도를 보입니다. 메인 1순위로 <strong>${bestAlgo.shortName}</strong>을 유지하고, 상호 보완 헤지용으로 <strong>${subAlgo.shortName}</strong>(2순위)을 병행 배치하는 포트폴리오를 강력 추천합니다.`;
    } else {
        aiComment = `💡 [${userName}] 회원님은 가입 회차(${joinRound}회) 기준 통계적 방어력이 가장 견고한 <strong>${bestAlgo.name}</strong>(1순위)과 전수 커버리지 <strong>${subAlgo.name}</strong>(2순위)의 20게임 조합 배치가 장기 당첨 기대치(EV) 극대화에 가장 최적입니다.`;
    }

    return {
        id: cleanId,
        rawId: rawId,
        name: userName,
        phone: phone,
        isPermanent: isPerm,
        joinRound: joinRound,
        algos: algos,
        sortedAlgos: sortedAlgos,
        bestAlgo: bestAlgo,
        subAlgo: subAlgo,
        totalMemberPrize,
        totalMemberWins,
        totalMemberGames,
        totalMemberInvest,
        memberRoi: parseFloat(memberRoi),
        memberBestRank: memberBestRank === 999 ? null : memberBestRank,
        aiComment: aiComment,
        roundsAnalyzed: perfData.totalRoundsCount || 0
    };
}

/**
 * 전체 등록 회원 진단 실행 및 캐싱
 */
export async function analyzeAllMembersOptimalAlgorithms(forceRefresh = false) {
    if (memberDiagnosisCache && !forceRefresh) {
        return memberDiagnosisCache;
    }

    // Ensure user list is loaded
    let userList = [];
    if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
        userList = [...state.allRegisteredUsersList];
    } else if (typeof window !== 'undefined' && window.db) {
        try {
            const uSnap = await window.db.collection('lotto_users').get();
            const loaded = [];
            uSnap.forEach(d => {
                if (d.id === 'app_latest_version') return;
                const uData = d.data();
                const isPerm = !!(uData.isPermanent === true || uData.isPermanent === 'true' || uData.userType === 'permanent' || uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin');
                loaded.push({
                    id: d.id,
                    name: uData.realName || d.id,
                    phone: uData.phoneNumber || '',
                    isAdmin: !!(uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin'),
                    isPermanent: isPerm,
                    userType: uData.userType || (isPerm ? 'permanent' : 'regular'),
                    createdAt: uData.createdAt || null
                });
            });
            state.allRegisteredUsersList = loaded;
            userList = loaded;
        } catch(e) {}
    }

    // Include any users from purchase map
    if (state.allUsersPurchasesMap && typeof state.allUsersPurchasesMap === 'object') {
        Object.keys(state.allUsersPurchasesMap).forEach(uId => {
            if (!userList.some(u => (u.id || '').toLowerCase().trim() === uId.toLowerCase().trim())) {
                const pObj = state.allUsersPurchasesMap[uId];
                userList.push({
                    id: uId,
                    name: pObj.realName || uId,
                    phone: pObj.phoneNumber || '',
                    isPermanent: false,
                    userType: 'regular',
                    createdAt: pObj.createdAt || null
                });
            }
        });
    }

    // Filter valid members
    const validUsers = userList.filter(u => {
        const uId = (u.id || '').trim().toLowerCase();
        return uId &&
               !uId.startsWith('{') &&
               !uId.startsWith('test_') &&
               uId !== 'app_latest_version' &&
               uId !== 'user_alpha' &&
               uId !== 'user_beta' &&
               uId !== 'sample' &&
               uId !== 'hms' &&
               u.isDeleted !== true &&
               u.status !== 'trash' &&
               u.status !== 'deleted';
    });

    if (validUsers.length === 0) {
        validUsers.push({ id: 'master', name: '관리자', isPermanent: true, userType: 'permanent' });
    }

    const diagnoses = validUsers.map(u => diagnoseMemberOptimalAlgorithms(u));
    memberDiagnosisCache = diagnoses;
    return diagnoses;
}

/**
 * 모달 열기 (관리자 전용)
 */
export async function openMemberOptimalAlgoModal() {
    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const authId = (rawAuth || '').trim().toLowerCase();
    const isAdmin = (authId === 'master' || authId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(authId)));

    if (!isAdmin) {
        showToast('🔒 본 기능은 최고 관리자 전용 진단 도구입니다.');
        return;
    }

    const modal = document.getElementById('memberOptimalAlgoModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Show initial loading state
    const container = document.getElementById('memberOptimalAlgoListContainer');
    if (container) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8;">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 2rem; color: #fbbf24; margin-bottom: 12px; display: block;"></i>
                <div style="font-size: 0.95rem; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">전체 회원 7대 알고리즘 실적 전수 분석 중...</div>
                <div style="font-size: 0.78rem; color: #94a3b8;">회원별 가입 회차부터 최신 회차까지의 복기 데이터를 정밀 연산하고 있습니다.</div>
            </div>
        `;
    }

    // Run analysis and render
    await renderMemberOptimalAlgoModalContent(false);
}

/**
 * 모달 닫기
 */
export function closeMemberOptimalAlgoModal() {
    const modal = document.getElementById('memberOptimalAlgoModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

/**
 * 모달 내부 콘텐츠 전체 렌더링
 */
export async function renderMemberOptimalAlgoModalContent(forceRefresh = false) {
    const diagnoses = await analyzeAllMembersOptimalAlgorithms(forceRefresh);
    
    // KPI Overview
    const totalMembers = diagnoses.length;
    const grandPrize = diagnoses.reduce((sum, d) => sum + d.totalMemberPrize, 0);
    
    // Count occurrences of 1st priority algorithms
    const algoFreq = {};
    diagnoses.forEach(d => {
        const aId = d.bestAlgo.id;
        algoFreq[aId] = (algoFreq[aId] || 0) + 1;
    });
    let topAlgoId = 'v4';
    let topAlgoCount = 0;
    Object.keys(algoFreq).forEach(k => {
        if (algoFreq[k] > topAlgoCount) {
            topAlgoCount = algoFreq[k];
            topAlgoId = k;
        }
    });
    const topAlgoDef = SEVEN_ALGORITHMS_INFO.find(a => a.id === topAlgoId) || SEVEN_ALGORITHMS_INFO[0];

    // High tier hits (1~3등)
    let totalHighHits = 0;
    diagnoses.forEach(d => {
        d.algos.forEach(a => {
            const hits = a.rankCounts || {};
            totalHighHits += (hits[1] || 0) + (hits[2] || 0) + (hits[3] || 0);
        });
    });

    // Update KPI Header DOM
    const kpiContainer = document.getElementById('memberOptimalAlgoKpiContainer');
    if (kpiContainer) {
        kpiContainer.innerHTML = `
            <div class="member-optimal-kpi-grid">
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px;"><i class="fa-solid fa-users" style="color: #60a5fa;"></i> 총 진단 회원</div>
                    <div class="kpi-val" style="font-size: 1.15rem; font-weight: 800; color: #f8fafc;">${totalMembers.toLocaleString()}명</div>
                </div>
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px;"><i class="fa-solid fa-crown" style="color: #fbbf24;"></i> 최다 1순위 추천 팩</div>
                    <div class="kpi-val" style="font-size: 0.95rem; font-weight: 800; color: ${topAlgoDef.badgeColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${topAlgoDef.shortName} <span style="font-size: 0.72rem; color: #cbd5e1;">(${topAlgoCount}명)</span>
                    </div>
                </div>
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px;"><i class="fa-solid fa-trophy" style="color: #f59e0b;"></i> 회원 누적 총 당첨금</div>
                    <div class="kpi-val" style="font-size: 1.05rem; font-weight: 800; color: #fbbf24;">${grandPrize.toLocaleString()}원</div>
                </div>
                <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(251, 191, 36, 0.3); border-radius: 10px; padding: 10px; text-align: center;">
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px;"><i class="fa-solid fa-star" style="color: #10b981;"></i> 고액(1~3등) 적중</div>
                    <div class="kpi-val" style="font-size: 1.15rem; font-weight: 800; color: #10b981;">${totalHighHits}건</div>
                </div>
            </div>
        `;
    }

    renderFilteredMemberList(diagnoses);
}

/**
 * 검색/필터/정렬 적용 후 회원 진단 리스트 렌더링
 */
function renderFilteredMemberList(diagnoses) {
    const listContainer = document.getElementById('memberOptimalAlgoListContainer');
    if (!listContainer) return;

    let filtered = [...diagnoses];

    // 1. Text Search Filter
    if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase().trim();
        filtered = filtered.filter(d => 
            d.id.includes(q) ||
            d.name.toLowerCase().includes(q) ||
            d.phone.includes(q)
        );
    }

    // 2. Algorithm Filter
    if (currentAlgoFilter !== 'all') {
        filtered = filtered.filter(d => d.bestAlgo.id === currentAlgoFilter);
    }

    // 3. Member Type Filter
    if (currentMemberTypeFilter === 'permanent') {
        filtered = filtered.filter(d => d.isPermanent);
    } else if (currentMemberTypeFilter === 'regular') {
        filtered = filtered.filter(d => !d.isPermanent);
    }

    // 4. Sorting
    filtered.sort((a, b) => {
        if (currentSortKey === 'prize_desc') {
            return b.totalMemberPrize - a.totalMemberPrize;
        } else if (currentSortKey === 'rank_asc') {
            const rankA = a.memberBestRank || 999;
            const rankB = b.memberBestRank || 999;
            if (rankA !== rankB) return rankA - rankB;
            return b.totalMemberPrize - a.totalMemberPrize;
        } else if (currentSortKey === 'wins_desc') {
            return b.totalMemberWins - a.totalMemberWins;
        } else if (currentSortKey === 'roi_desc') {
            return b.memberRoi - a.memberRoi;
        } else if (currentSortKey === 'name_asc') {
            return a.name.localeCompare(b.name, 'ko');
        } else if (currentSortKey === 'round_desc') {
            return b.joinRound - a.joinRound;
        }
        return b.totalMemberPrize - a.totalMemberPrize;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #94a3b8; background: rgba(15,23,42,0.5); border-radius: 10px;">
                <i class="fa-solid fa-magnifying-glass" style="font-size: 2rem; color: #475569; margin-bottom: 10px; display: block;"></i>
                <div style="font-size: 0.9rem; font-weight: 700; color: #cbd5e1;">조건에 일치하는 회원이 없습니다.</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">검색어 또는 필터 조건을 변경해 보세요.</div>
            </div>
        `;
        return;
    }

    const cardsHtml = filtered.map((d, idx) => {
        const isExpanded = !!expandedMemberDetails[d.id];
        const bestHits = d.bestAlgo.rankCounts || {};
        const subHits = d.subAlgo.rankCounts || {};

        // All 7 algos breakdown table/grid for accordion
        const allAlgosAccordionHtml = d.sortedAlgos.map((algo, aIdx) => {
            const isBest = aIdx === 0;
            const isSub = aIdx === 1;
            const hits = algo.rankCounts || {};
            return `
                <div class="member-optimal-accordion-row" style="background: ${isBest ? 'rgba(251, 191, 36, 0.12)' : (isSub ? 'rgba(59, 130, 246, 0.08)' : 'rgba(15, 23, 42, 0.6)')}; border: 1px solid ${isBest ? 'rgba(251, 191, 36, 0.4)' : (isSub ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.06)')};">
                    <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto;">
                        <span style="font-size: 0.68rem; font-weight: 800; color: ${isBest ? '#fbbf24' : (isSub ? '#60a5fa' : '#94a3b8')}; min-width: 22px;">#${aIdx + 1}</span>
                        <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; background: ${algo.badgeColor}22; color: ${algo.badgeColor}; border: 1px solid ${algo.badgeColor}55; white-space: nowrap;">
                            ${algo.shortName}
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex: 1 1 auto; flex-wrap: wrap;">
                        <span style="color: #cbd5e1; font-size: 0.7rem;">${hits[1] ? `1등(${hits[1]}) ` : ''}${hits[2] ? `2등(${hits[2]}) ` : ''}${hits[3] ? `3등(${hits[3]}) ` : ''}${hits[4] ? `4등(${hits[4]}) ` : ''}${hits[5] ? `5등(${hits[5]}) ` : ''}${algo.totalWins === 0 ? '0회 적중' : ''}</span>
                        <strong style="color: ${algo.totalPrize > 0 ? '#fbbf24' : '#94a3b8'}; text-align: right; font-size: 0.74rem; min-width: 65px;">${algo.totalPrize.toLocaleString()}원</strong>
                        <span style="color: ${algo.roi > 0 ? '#34d399' : '#94a3b8'}; font-weight: 700; text-align: right; font-size: 0.72rem; min-width: 45px;">${algo.roi > 0 ? '+' : ''}${algo.roi}%</span>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="member-optimal-card">
                <!-- Card Header: User Info -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 0.85rem; flex-shrink: 0;">
                            ${d.name.charAt(0)}
                        </div>
                        <div style="min-width: 0;">
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <strong style="color: #f8fafc; font-size: 0.88rem;">${d.name}</strong>
                                <span style="font-size: 0.73rem; color: #94a3b8;">(${d.id})</span>
                                ${d.isPermanent ? '<span style="font-size: 0.65rem; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 4px; padding: 1px 5px; font-weight: 700;">👑 정회원</span>' : '<span style="font-size: 0.65rem; background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 4px; padding: 1px 5px;">일반</span>'}
                            </div>
                            <div style="font-size: 0.7rem; color: #64748b; margin-top: 1px;">
                                ${d.phone ? `📞 ${d.phone} · ` : ''}가입: ${d.joinRound}회차부터 분석
                            </div>
                        </div>
                    </div>
                    <!-- Member Overall Stats Badge -->
                    <div style="text-align: right; flex-shrink: 0;">
                        <div style="font-size: 0.95rem; font-weight: 800; color: #fbbf24;">${d.totalMemberPrize.toLocaleString()}원</div>
                        <div style="font-size: 0.7rem; color: #94a3b8;">총 ${d.totalMemberWins}회 적중 (ROI ${d.memberRoi > 0 ? '+' : ''}${d.memberRoi}%)</div>
                    </div>
                </div>

                <!-- 1st & 2nd Recommended Algorithm Highlight -->
                <div class="member-optimal-algo-grid">
                    <!-- 1st Best Algo -->
                    <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%); border: 1.5px solid rgba(245, 158, 11, 0.5); border-radius: 8px; padding: 8px 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 0.68rem; font-weight: 800; color: #fbbf24; background: rgba(245, 158, 11, 0.2); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.4);">
                                🥇 1순위 최적 맞춤 알고리즘
                            </span>
                            <span style="font-size: 0.72rem; font-weight: 700; color: #34d399;">
                                ${d.bestAlgo.roi > 0 ? '+' : ''}${d.bestAlgo.roi}% ROI
                            </span>
                        </div>
                        <div style="font-size: 0.85rem; font-weight: 800; color: #f8fafc; margin-bottom: 2px;">
                            ${d.bestAlgo.name}
                        </div>
                        <div style="font-size: 0.72rem; color: #cbd5e1; display: flex; justify-content: space-between;">
                            <span>누적 당첨금: <strong style="color: #fbbf24;">${d.bestAlgo.totalPrize.toLocaleString()}원</strong></span>
                            <span>${d.bestAlgo.totalWins}회 적중</span>
                        </div>
                    </div>

                    <!-- 2nd Sub Algo -->
                    <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%); border: 1.5px solid rgba(59, 130, 246, 0.4); border-radius: 8px; padding: 8px 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <span style="font-size: 0.68rem; font-weight: 800; color: #60a5fa; background: rgba(59, 130, 246, 0.2); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.4);">
                                🥈 2순위 서브 추천 (헤지)
                            </span>
                            <span style="font-size: 0.72rem; font-weight: 700; color: #60a5fa;">
                                ${d.subAlgo.roi > 0 ? '+' : ''}${d.subAlgo.roi}% ROI
                            </span>
                        </div>
                        <div style="font-size: 0.85rem; font-weight: 800; color: #f8fafc; margin-bottom: 2px;">
                            ${d.subAlgo.name}
                        </div>
                        <div style="font-size: 0.72rem; color: #cbd5e1; display: flex; justify-content: space-between;">
                            <span>누적 당첨금: <strong style="color: #60a5fa;">${d.subAlgo.totalPrize.toLocaleString()}원</strong></span>
                            <span>${d.subAlgo.totalWins}회 적중</span>
                        </div>
                    </div>
                </div>

                <!-- AI Personalized Diagnostic Comment -->
                <div style="background: rgba(0, 0, 0, 0.35); border-left: 3px solid #fbbf24; border-radius: 6px; padding: 8px 10px; font-size: 0.75rem; color: #cbd5e1; line-height: 1.45; margin-bottom: 10px;">
                    <div style="font-size: 0.72rem; font-weight: 800; color: #fbbf24; margin-bottom: 2px; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-wand-magic-sparkles"></i> AI 맞춤 포트폴리오 진단 코멘트
                    </div>
                    ${d.aiComment}
                </div>

                <!-- Accordion Toggle for all 7 algos -->
                <div style="margin-bottom: 10px;">
                    <button type="button" onclick="window.toggleMemberOptimalDetailAccordion && window.toggleMemberOptimalDetailAccordion('${d.id}')" style="background: transparent; border: none; color: #94a3b8; font-size: 0.72rem; cursor: pointer; padding: 2px 0; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                        <span>${isExpanded ? '7대 알고리즘 전체 실적 접기' : '7대 알고리즘 전체 실적 순위 보기 (전체 펼치기)'}</span>
                    </button>
                    ${isExpanded ? `
                        <div style="margin-top: 6px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 6px;">
                            ${allAlgosAccordionHtml}
                        </div>
                    ` : ''}
                </div>

                <!-- Card Actions -->
                <div class="member-optimal-btn-group">
                    <button type="button" onclick="window.copySingleMemberDiagnosis && window.copySingleMemberDiagnosis('${d.id}')" class="btn-secondary" style="font-size: 0.72rem; padding: 6px 10px; border-radius: 6px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-copy"></i> 진단 리포트 복사 (회원 발송용)
                    </button>
                    <button type="button" onclick="window.viewMemberOptimalInGenerator && window.viewMemberOptimalInGenerator('${d.id}')" class="btn-secondary" style="font-size: 0.72rem; padding: 6px 10px; border-radius: 6px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fde047; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> 추천기에서 조회
                    </button>
                </div>
            </div>
        `;
    }).join('');

    listContainer.innerHTML = cardsHtml;
}

/**
 * 7대 알고리즘 상세 아코디언 토글
 */
export function toggleMemberOptimalDetailAccordion(userId) {
    expandedMemberDetails[userId] = !expandedMemberDetails[userId];
    if (memberDiagnosisCache) {
        renderFilteredMemberList(memberDiagnosisCache);
    }
}

/**
 * 검색어 변경 핸들러
 */
export function handleMemberOptimalSearch(query) {
    currentSearchQuery = query;
    if (memberDiagnosisCache) {
        renderFilteredMemberList(memberDiagnosisCache);
    }
}

/**
 * 알고리즘 필터 변경
 */
export function handleMemberOptimalAlgoFilter(algoId) {
    currentAlgoFilter = algoId;
    if (memberDiagnosisCache) {
        renderFilteredMemberList(memberDiagnosisCache);
    }
}

/**
 * 회원 등급 필터 변경
 */
export function handleMemberOptimalTypeFilter(type) {
    currentMemberTypeFilter = type;
    if (memberDiagnosisCache) {
        renderFilteredMemberList(memberDiagnosisCache);
    }
}

/**
 * 정렬 기준 변경
 */
export function handleMemberOptimalSort(sortKey) {
    currentSortKey = sortKey;
    if (memberDiagnosisCache) {
        renderFilteredMemberList(memberDiagnosisCache);
    }
}

/**
 * 단일 회원 진단 리포트 클립보드 복사 (회원 알림톡/문자 전송용 포맷)
 */
export function copySingleMemberDiagnosis(userId) {
    if (!memberDiagnosisCache) return;
    const d = memberDiagnosisCache.find(item => item.id === userId);
    if (!d) return;

    const curRound = state.latestDrawData ? state.latestDrawData.drwNo : (state.latestRoundNum || 1238);
    const nextRound = curRound + 1;

    const text = `[Lucky777 AI] 👑 ${d.name} 회원님 맞춤 최적 알고리즘 진단 리포트\n` +
                 `━━━━━━━━━━━━━━━━━━━━\n` +
                 `👤 대상 회원: ${d.name} (${d.id})\n` +
                 `📅 분석 기간: ${d.joinRound}회차 ~ ${curRound}회차 (${d.roundsAnalyzed}회차 전수 분석)\n` +
                 `💰 누적 총 당첨금: ${d.totalMemberPrize.toLocaleString()}원 (${d.totalMemberWins}회 적중)\n` +
                 `━━━━━━━━━━━━━━━━━━━━\n` +
                 `🥇 [1순위 최적 알고리즘]\n` +
                 `▶ ${d.bestAlgo.name}\n` +
                 `   - 누적 당첨: ${d.bestAlgo.totalPrize.toLocaleString()}원 (${d.bestAlgo.totalWins}회 적중 / ROI ${d.bestAlgo.roi > 0 ? '+' : ''}${d.bestAlgo.roi}%)\n` +
                 `🥈 [2순위 서브 추천팩]\n` +
                 `▶ ${d.subAlgo.name}\n` +
                 `   - 누적 당첨: ${d.subAlgo.totalPrize.toLocaleString()}원 (${d.subAlgo.totalWins}회 적중 / ROI ${d.subAlgo.roi > 0 ? '+' : ''}${d.subAlgo.roi}%)\n` +
                 `━━━━━━━━━━━━━━━━━━━━\n` +
                 `💡 [AI 전략 코멘트]\n` +
                 `${d.aiComment.replace(/<[^>]*>/g, '')}\n` +
                 `━━━━━━━━━━━━━━━━━━━━\n` +
                 `👉 이번주 ${nextRound}회차 추천번호는 [${d.bestAlgo.shortName}] + [${d.subAlgo.shortName}] 조합으로 집중 배정하여 당첨 기대치를 극대화하세요!`;

    navigator.clipboard.writeText(text).then(() => {
        showToast(`📋 [${d.name}] 님의 AI 최적 알고리즘 진단서가 복사되었습니다!`);
    }).catch(() => {
        showToast('❌ 클립보드 복사에 실패했습니다.');
    });
}

/**
 * 전체 회원 최적 알고리즘 진단 종합 리포트 복사 (관리자 분석용)
 */
export function copyAllMembersOptimalSummary() {
    if (!memberDiagnosisCache || memberDiagnosisCache.length === 0) {
        showToast('⚠️ 진단 데이터가 없습니다.');
        return;
    }

    const curRound = state.latestDrawData ? state.latestDrawData.drwNo : (state.latestRoundNum || 1238);
    let summaryText = `[Lucky777] 👑 전체 회원별 복기 기반 최적 알고리즘 진단 종합 현황 (기준: ${curRound}회차)\n` +
                      `총 진단 회원: ${memberDiagnosisCache.length}명\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    memberDiagnosisCache.forEach((d, idx) => {
        summaryText += `${idx + 1}. ${d.name}(${d.id}) [${d.isPermanent ? '정회원' : '일반'}] (가입:${d.joinRound}회)\n` +
                       `   - 🥇 1순위: ${d.bestAlgo.shortName} (당첨금: ${d.bestAlgo.totalPrize.toLocaleString()}원, ${d.bestAlgo.totalWins}회 적중, ROI ${d.bestAlgo.roi}%)\n` +
                       `   - 🥈 2순위: ${d.subAlgo.shortName} (당첨금: ${d.subAlgo.totalPrize.toLocaleString()}원, ${d.subAlgo.totalWins}회 적중)\n` +
                       `   - 누적 총합: ${d.totalMemberPrize.toLocaleString()}원 (${d.totalMemberWins}회 적중)\n\n`;
    });

    summaryText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n* Lucky777 AI 알고리즘 진단 센터`;

    navigator.clipboard.writeText(summaryText).then(() => {
        showToast(`📋 전체 ${memberDiagnosisCache.length}명의 AI 진단 종합 요약이 복사되었습니다!`);
    }).catch(() => {
        showToast('❌ 클립보드 복사에 실패했습니다.');
    });
}

/**
 * 추천번호 생성기 탭에서 해당 회원 선택 후 이동
 */
export function viewMemberOptimalInGenerator(userId) {
    closeMemberOptimalAlgoModal();
    if (typeof window.changeGeneratorAdminViewingUser === 'function') {
        window.changeGeneratorAdminViewingUser(userId);
    } else {
        window.generatorAdminViewingUser = userId;
    }

    if (typeof window.switchLottoTab === 'function') {
        window.switchLottoTab('tab-generator');
    }

    showToast(`👤 [${userId}] 회원님의 이번주 추천번호 생성 화면으로 이동했습니다.`);
}

// Window global bindings
if (typeof window !== 'undefined') {
    window.openMemberOptimalAlgoModal = openMemberOptimalAlgoModal;
    window.closeMemberOptimalAlgoModal = closeMemberOptimalAlgoModal;
    window.renderMemberOptimalAlgoModalContent = renderMemberOptimalAlgoModalContent;
    window.toggleMemberOptimalDetailAccordion = toggleMemberOptimalDetailAccordion;
    window.handleMemberOptimalSearch = handleMemberOptimalSearch;
    window.handleMemberOptimalAlgoFilter = handleMemberOptimalAlgoFilter;
    window.handleMemberOptimalTypeFilter = handleMemberOptimalTypeFilter;
    window.handleMemberOptimalSort = handleMemberOptimalSort;
    window.copySingleMemberDiagnosis = copySingleMemberDiagnosis;
    window.copyAllMembersOptimalSummary = copyAllMembersOptimalSummary;
    window.viewMemberOptimalInGenerator = viewMemberOptimalInGenerator;
}
