import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, calculateACValue } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';
import { recalculateGroups } from '../statistics.js';
import { calculateStats, getNeighborMatches } from '../scoring.js';
import { getLedger, saveToLedger, getComboNumbers, getHistoricalTop10Combinations } from '../ledger.js';
import { db } from '../../../shared/db.js';
import { getSelectedComboCountOption } from './generator-tab.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';

let realSimCache = null;
const liveSimCacheMap = {};

export function getEffectiveTargetUser() {
    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '')) || 'guest';
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try {
            const parsed = JSON.parse(authId);
            authId = parsed.userid || parsed.userId || authId;
        } catch(e) {}
    }
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin' || (typeof window !== 'undefined' && window.isAdminUser && window.isAdminUser(authId))));
    if (isAdmin && state.simAdminTargetUserId) {
        return state.simAdminTargetUserId;
    }
    return authId;
}

/**
 * Return actual simulation results if executed, otherwise empty array
 */
export function generateAccumulatedWinsHistory() {
    const cfg = getSelectedSimulationConfig();
    const targetUserId = getEffectiveTargetUser();
    const cfgKey = `${targetUserId}_${JSON.stringify(cfg)}`;
    if (liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0) {
        return liveSimCacheMap[cfgKey];
    }
    return []; // No mock data! Return empty until real simulation is run
}

/**
 * Get current simulation settings (7 Algorithms independently selectable: V4, V3, Extra 1~5)
 */
export function getSelectedSimulationConfig() {
    const chkSimV3 = document.getElementById('chkSimIncludeV3');
    const chkSimV4 = document.getElementById('chkSimIncludeV4');
    
    const includeV3 = chkSimV3 ? chkSimV3.checked : false;
    const includeV4 = chkSimV4 ? chkSimV4.checked : false;
    
    const selectedExtraPacks = [];
    for (let p = 1; p <= 5; p++) {
        const chk = document.getElementById(`chkSimExtraPack${p}`);
        if (chk && chk.checked) selectedExtraPacks.push(p);
    }
    
    const selectedCount = (includeV4 ? 1 : 0) + (includeV3 ? 1 : 0) + selectedExtraPacks.length;
    const hasSelection = selectedCount > 0;
    
    return { includeV3, includeV4, selectedExtraPacks, selectedCount, hasSelection };
}

/**
 * Select/Deselect all 7 simulation algorithm checkboxes
 */
export function selectAllSimAlgos(checked = true) {
    const chkSimV3 = document.getElementById('chkSimIncludeV3');
    const chkSimV4 = document.getElementById('chkSimIncludeV4');
    if (chkSimV3) chkSimV3.checked = checked;
    if (chkSimV4) chkSimV4.checked = checked;
    
    for (let p = 1; p <= 5; p++) {
        const chk = document.getElementById(`chkSimExtraPack${p}`);
        if (chk) chk.checked = checked;
    }
    
    const sel = document.getElementById('simRoundSelector');
    const targetRound = sel && sel.value ? parseInt(sel.value) : null;
    renderSimulationTab(targetRound);
}

export function getSingleUserCombosForRound(round, cfg, userId, userName = null) {
    const combos = [];
    if (cfg.includeV4) {
        const v4Combos = computeAbsoluteTop10Combinations(false, round, 'v4', true, userId) || [];
        v4Combos.forEach(c => {
            const clone = { ...c, meta: { ...(c.meta || {}) } };
            if (userName) clone.meta.ownerName = userName;
            combos.push(clone);
        });
    }
    if (cfg.includeV3) {
        const v3Combos = computeAbsoluteTop10Combinations(false, round, 'v3', true, userId) || [];
        v3Combos.forEach(c => {
            const clone = { ...c, meta: { ...(c.meta || {}) } };
            if (userName) clone.meta.ownerName = userName;
            combos.push(clone);
        });
    }
    cfg.selectedExtraPacks.forEach(pIdx => {
        const extraPack = generateExtraAddonPack(pIdx, round, userId);
        if (extraPack && Array.isArray(extraPack.combos)) {
            extraPack.combos.forEach(c => {
                const clone = { ...c, meta: { ...(c.meta || {}) } };
                if (userName) clone.meta.ownerName = userName;
                combos.push(clone);
            });
        }
    });
    return combos;
}

/**
 * Generate all combinations for a specific simulation round based on currently selected algorithms and target user(s)
 * @param {number} round 
 * @param {Object} config 
 * @param {string} customUserId
 */
export function getCombosForSimulationRound(round, config = null, customUserId = null) {
    const cfg = config || getSelectedSimulationConfig();
    const effectiveTarget = customUserId || getEffectiveTargetUser();
    
    if (effectiveTarget === '__ALL__') {
        let userList = state.allRegisteredUsersList;
        if (!userList || userList.length === 0) {
            try {
                const cached = localStorage.getItem('lotto_all_users_list_cache');
                if (cached) userList = JSON.parse(cached);
            } catch(e) {}
        }
        if (!userList || userList.length === 0) {
            if (state.allUsersPurchasesMap && Object.keys(state.allUsersPurchasesMap).length > 0) {
                userList = Object.keys(state.allUsersPurchasesMap).map(id => ({ id, name: id }));
            }
        }
        if (!userList || userList.length === 0) {
            userList = [{ id: 'master', name: '관리자 본인' }];
        }
        const filteredUsers = userList.filter(u => {
            const uId = (u.id || '').trim().toLowerCase();
            return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'sample' && uId !== 'hms' && uId !== 'admin' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
        });
        const finalUsers = filteredUsers.length > 0 ? filteredUsers : [{ id: 'master', name: '관리자 본인' }];
        
        const allCombos = [];
        finalUsers.forEach(u => {
            const uCombos = getSingleUserCombosForRound(round, cfg, u.id, u.name || u.id);
            allCombos.push(...uCombos);
        });
        return allCombos;
    } else {
        return getSingleUserCombosForRound(round, cfg, effectiveTarget);
    }
}

export function populateSimRoundSelector() {
    const sel = document.getElementById('simRoundSelector');
    if (!sel) return;
    
    const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : (state.mergedHistory ? Math.max(...Object.keys(state.mergedHistory).map(Number)) : 1239));
    
    if (sel.options.length !== maxR) {
        const currentVal = sel.value;
        sel.innerHTML = '';
        for (let r = maxR; r >= 1; r--) {
            const opt = document.createElement('option');
            opt.value = r;
            opt.textContent = `${r}회차`;
            sel.appendChild(opt);
        }
        if (currentVal && currentVal <= maxR) {
            sel.value = currentVal;
        } else {
            sel.value = maxR;
        }
    }
}

export function renderSimulationTab(targetRound = null) {
    const lockEl = document.getElementById('simLockOverlay');
    const normalEl = document.getElementById('simNormalContent');
    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '')) || '';
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try {
            const parsed = JSON.parse(authId);
            authId = parsed.userid || parsed.userId || authId;
        } catch(e) {}
    }
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin' || (typeof window !== 'undefined' && window.isAdminUser && window.isAdminUser(authId))));
    const effectiveTarget = getEffectiveTargetUser();

    // 🔒 실구매 인증 자격 확인 (관리자 계정은 모든 회원 시뮬레이션 상시 100% 프리패스 허용)
    const isEligible = isAdmin || (typeof window.isUserEligibleForExtraPacks === 'function'
        ? window.isUserEligibleForExtraPacks(effectiveTarget)
        : true);

    if (!isEligible) {
        if (lockEl) lockEl.style.display = 'block';
        if (normalEl) normalEl.style.display = 'none';
        return;
    }

    if (lockEl) lockEl.style.display = 'none';
    if (normalEl) normalEl.style.display = 'block';

    populateSimRoundSelector();
    
    const sel = document.getElementById('simRoundSelector');
    const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : (state.mergedHistory ? Math.max(...Object.keys(state.mergedHistory).map(Number)) : 1239));
    const selectedRound = targetRound || (sel && sel.value ? parseInt(sel.value) : maxR);
    if (sel) sel.value = selectedRound;

    // 👑 [관리자 전용] 회원별 시뮬레이션 & 백테스팅 컨트롤러 바 렌더링
    const adminBarContainer = document.getElementById('simAdminBarContainer');
    if (adminBarContainer) {
        if (isAdmin) {
            // 사용자 목록 로컬 캐시 확인
            if (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0) {
                try {
                    const cached = localStorage.getItem('lotto_all_users_list_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            state.allRegisteredUsersList = parsed;
                        }
                    }
                } catch(e) {}
            }

            // 사용자 목록 비동기 로딩 (Firestore)
            const firestoreDb = window.db || db;
            if (firestoreDb && (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0)) {
                firestoreDb.collection('lotto_users').get().then(uSnap => {
                    const loadedList = [];
                    uSnap.forEach(d => {
                        const cleanId = (d.id || '').trim();
                        if (!cleanId || cleanId.startsWith('{') || cleanId.startsWith('test_') || cleanId.toLowerCase() === 'admin') return;
                        const uData = d.data() || {};
                        const isPerm = !!(uData.isPermanent === true || uData.isPermanent === 'true' || uData.userType === 'permanent' || uData.isAdmin === true || uData.role === 'admin' || cleanId === 'master' || cleanId === 'admin');
                        if (typeof window !== 'undefined' && typeof window.setIsPermanentCache === 'function') {
                            window.setIsPermanentCache(cleanId, isPerm);
                        }
                        loadedList.push({
                            id: cleanId,
                            name: uData.realName || cleanId,
                            phone: uData.phoneNumber || '',
                            isAdmin: !!(uData.isAdmin === true || uData.role === 'admin' || cleanId === 'master' || cleanId === 'admin'),
                            isPermanent: isPerm,
                            userType: uData.userType || (isPerm ? 'permanent' : 'regular')
                        });
                    });
                    state.allRegisteredUsersList = loadedList;
                    try { localStorage.setItem('lotto_all_users_list_cache', JSON.stringify(loadedList)); } catch(e) {}
                    renderSimulationTab(targetRound);
                }).catch(err => console.warn('[Sim Tab Users Load Error]:', err));
            }

            const userList = state.allRegisteredUsersList || [];
            let userOptions = `<option value="${authId}" ${effectiveTarget === authId ? 'selected' : ''}>👑 관리자 본인 (${authId})</option>`;
            userOptions += `<option value="__ALL__" ${effectiveTarget === '__ALL__' ? 'selected' : ''}>👥 [전체] 등록 회원 종합 시뮬레이션 (${userList.length}명 전수)</option>`;
            
            userList.forEach(u => {
                if (u.id !== authId) {
                    userOptions += `<option value="${u.id}" ${effectiveTarget === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name}${u.phone ? ` / ${u.phone}` : ''})</option>`;
                }
            });

            adminBarContainer.innerHTML = `
                <div class="sim-admin-bar">
                    <div class="sim-admin-bar-left">
                        <i class="fa-solid fa-crown sim-admin-crown"></i>
                        <div class="sim-admin-bar-info">
                            <strong class="sim-admin-bar-title">[관리자 전용] 회원별 시뮬레이션 &amp; 백테스팅 컨트롤러</strong>
                            <div class="sim-admin-bar-desc">전체 회원 종합 또는 특정 회원의 고유 시드로 1회부터 최신 회차까지 백테스팅을 실행합니다.</div>
                        </div>
                    </div>
                    <div class="sim-admin-bar-right">
                        <label for="simAdminUserSelect" class="sim-admin-bar-label">시뮬레이션 대상:</label>
                        <select id="simAdminUserSelect" onchange="window.changeSimAdminViewingUser && window.changeSimAdminViewingUser(this.value)" class="sim-admin-user-select">
                            ${userOptions}
                        </select>
                    </div>
                </div>
            `;
        } else {
            adminBarContainer.innerHTML = '';
        }
    }

    function getHistoricalDrawData(round) {
        if (state.mergedHistory && state.mergedHistory[round]) {
            const h = state.mergedHistory[round];
            return {
                drwNo: round,
                drwNoDate: h.date || h.drwNoDate || '',
                date: h.date || h.drwNoDate || '',
                numbers: h.numbers || [],
                bonus: h.bonus,
                rank1Prize: h.rank1Prize || h.firstWinamnt
            };
        }
        return null;
    }

    const drawData = getHistoricalDrawData(selectedRound);

    const el_simSelectedRoundTitle = document.getElementById('simSelectedRoundTitle');
    if (el_simSelectedRoundTitle) el_simSelectedRoundTitle.textContent = `제 ${selectedRound}회`;
    const el_simSelectedRoundDate = document.getElementById('simSelectedRoundDate');
    if (el_simSelectedRoundDate) el_simSelectedRoundDate.textContent = `${drawData ? drawData.date : ''} 추첨`;

    const winDisplay = document.getElementById('simWinningNumbersDisplay');
    if (winDisplay && drawData) {
        const ballsHTML = drawData.numbers.map(n => `<div class="lotto-ball sm-ball ${getBallColorClass(n)}">${n}</div>`).join('');
        const bonusHTML = `<div class="lotto-ball sm-ball ${getBallColorClass(drawData.bonus)}" title="보너스 번호">${drawData.bonus}</div>`;
        winDisplay.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; color:var(--accent-gold); font-size:0.95rem;">
                    <i class="fa-solid fa-trophy"></i> 제 ${selectedRound}회 실제 당첨번호
                </span>
            </div>
            <div class="balls-row" style="display:flex; align-items:center; gap:6px;">
                ${ballsHTML}
                <span style="font-size:0.8rem; color:#aaa; margin:0 4px; font-weight:600;">+ 보너스</span>
                ${bonusHTML}
            </div>
        `;
    }

    const cfg = getSelectedSimulationConfig();
    const cfgKey = `${effectiveTarget}_${JSON.stringify(cfg)}`;
    const baseCount = (cfg.includeV4 ? 10 : 0) + (cfg.includeV3 ? 10 : 0);
    const extraCount = cfg.selectedExtraPacks.length * 10;
    const gamesPerRound = baseCount + extraCount;

    const registeredCount = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0) ? state.allRegisteredUsersList.length : 1;
    const userMultiplier = (effectiveTarget === '__ALL__') ? registeredCount : 1;
    const evaluatedGamesPerRound = gamesPerRound * userMultiplier;
    const totalDraws = maxR;
    const totalCombosEvaluated = totalDraws * evaluatedGamesPerRound;

    const packNames = { 1: '추가1(전수)', 2: '추가2(EV)', 3: '추가3(휠링)', 4: '추가4(마르코프)', 5: '추가5(골든)' };
    const engineParts = [];
    if (cfg.includeV4) engineParts.push('V4(10G)');
    if (cfg.includeV3) engineParts.push('V3(10G)');
    cfg.selectedExtraPacks.forEach(p => {
        engineParts.push(`${packNames[p] || `추가${p}`}(10G)`);
    });
    const engineSummary = engineParts.length > 0 ? engineParts.join(' + ') : '선택된 알고리즘 없음';

    const el_simTotalDraws = document.getElementById('simTotalDraws');
    if (el_simTotalDraws) {
        if (cfg.hasSelection) {
            if (effectiveTarget === '__ALL__') {
                el_simTotalDraws.textContent = `${totalDraws.toLocaleString()}회 (${engineSummary} × 회원 ${registeredCount}명 = 회차당 ${evaluatedGamesPerRound}게임 [전체 회원 종합])`;
            } else {
                const targetLabel = (effectiveTarget === authId) ? '관리자 본인' : effectiveTarget;
                el_simTotalDraws.textContent = `${totalDraws.toLocaleString()}회 (${engineSummary} = 회차당 ${gamesPerRound}게임 [${targetLabel}])`;
            }
        } else {
            el_simTotalDraws.textContent = `0회 (알고리즘을 1개 이상 선택해주세요)`;
        }
    }

    let hit1st = 0, hit2nd = 0, hit3rd = 0, hit4th = 0, hit5th = 0, totalPrize = 0;
    let allWins = [];
    const hasExecutedSim = !!(liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0);

    if (hasExecutedSim) {
        allWins = liveSimCacheMap[cfgKey];
        hit1st = allWins.filter(w => w.prizeRank === 1).length;
        hit2nd = allWins.filter(w => w.prizeRank === 2).length;
        hit3rd = allWins.filter(w => w.prizeRank === 3).length;
        hit4th = allWins.filter(w => w.prizeRank === 4).length;
        hit5th = allWins.filter(w => w.prizeRank === 5).length;
        allWins.forEach(w => {
            if (w.prizeRank === 1) {
                const wData = getHistoricalDrawData(w.round);
                totalPrize += (wData && wData.rank1Prize) ? wData.rank1Prize : 2000000000;
            } else if (w.prizeRank === 2) totalPrize += 50000000;
            else if (w.prizeRank === 3) totalPrize += 1500000;
            else if (w.prizeRank === 4) totalPrize += 50000;
            else if (w.prizeRank === 5) totalPrize += 5000;
        });
    }

    const totalHits = hit1st + hit2nd + hit3rd + hit4th + hit5th;

    const el_simTotalHits = document.getElementById('simTotalHits');
    if (el_simTotalHits) {
        el_simTotalHits.textContent = hasExecutedSim ? `${totalHits.toLocaleString()} 회` : `0 회 (실행 대기)`;
    }
    
    let actualHitRate = 0;
    if (hasExecutedSim && totalCombosEvaluated > 0) {
        actualHitRate = (totalHits / totalCombosEvaluated) * 100;
    }
    const el_simHitRate = document.getElementById('simHitRate');
    if (el_simHitRate) {
        el_simHitRate.textContent = hasExecutedSim 
            ? `실제 ${actualHitRate.toFixed(2)}% 적중 (${totalHits.toLocaleString()} / ${totalCombosEvaluated.toLocaleString()}게임)`
            : `백테스팅 실행 대기 중 (상단 버튼을 눌러주세요)`;
    }
    
    const investment = hasExecutedSim ? totalCombosEvaluated * 1000 : 0;
    const netProfit = hasExecutedSim ? totalPrize - investment : 0;
    
    let realRoi = 0;
    if (hasExecutedSim && investment > 0) realRoi = ((totalPrize / investment) * 100).toFixed(1);
    const elRoiValue = document.getElementById('simRoiValue');
    if (elRoiValue) {
        elRoiValue.textContent = hasExecutedSim ? `${Number(realRoi).toLocaleString()}% (리얼 백테스트)` : `0.0% (실행 대기)`;
    }
    
    const elTotalInv = document.getElementById('simTotalInvestment');
    if (elTotalInv) elTotalInv.textContent = hasExecutedSim ? investment.toLocaleString() + ' 원' : '0 원 (실행 대기)';
    const elTotalPrize = document.getElementById('simTotalPrize');
    if (elTotalPrize) elTotalPrize.textContent = hasExecutedSim ? totalPrize.toLocaleString() + ' 원' : '0 원 (실행 대기)';
    const elRealRoi = document.getElementById('simRealRoi');
    if (elRealRoi) {
        elRealRoi.textContent = hasExecutedSim ? `${Number(realRoi).toLocaleString()}% (${netProfit >= 0 ? '+' : ''}${netProfit.toLocaleString()} 원)` : `0.0% (실행 대기)`;
    }

    // Dynamically update the financial summary panel title if element exists
    const financialPanelTitle = document.querySelector('.financial-summary-panel h3');
    if (financialPanelTitle) {
        financialPanelTitle.innerHTML = `<i class="fa-solid fa-coins"></i> 시뮬레이션 재무 분석 (회차당 ${gamesPerRound}게임 [${engineSummary}] 구매 기준)`;
    }

    const btnRankFilterAll = document.getElementById('btnRankFilterAll');
    const btnRankFilter1 = document.getElementById('btnRankFilter1');
    const btnRankFilter2 = document.getElementById('btnRankFilter2');
    const btnRankFilter3 = document.getElementById('btnRankFilter3');
    const btnRankFilter4 = document.getElementById('btnRankFilter4');
    const btnRankFilter5 = document.getElementById('btnRankFilter5');
    
    if (btnRankFilterAll) btnRankFilterAll.textContent = hasExecutedSim ? `전체 (${totalHits.toLocaleString()}회)` : `전체 (대기)`;
    if (btnRankFilter1) btnRankFilter1.textContent = hasExecutedSim ? `역대 1등 (${hit1st.toLocaleString()}회)` : `역대 1등 (-)`;
    if (btnRankFilter2) btnRankFilter2.textContent = hasExecutedSim ? `역대 2등 (${hit2nd.toLocaleString()}회)` : `역대 2등 (-)`;
    if (btnRankFilter3) btnRankFilter3.textContent = hasExecutedSim ? `역대 3등 (${hit3rd.toLocaleString()}회)` : `역대 3등 (-)`;
    if (btnRankFilter4) btnRankFilter4.textContent = hasExecutedSim ? `역대 4등 (${hit4th.toLocaleString()}회)` : `역대 4등 (-)`;
    if (btnRankFilter5) btnRankFilter5.textContent = hasExecutedSim ? `역대 5등 (${hit5th.toLocaleString()}회)` : `역대 5등 (-)`;

    if (btnRankFilterAll) btnRankFilterAll.onclick = () => renderAccumulatedWins(0);
    if (btnRankFilter1) btnRankFilter1.onclick = () => renderAccumulatedWins(1);
    if (btnRankFilter2) btnRankFilter2.onclick = () => renderAccumulatedWins(2);
    if (btnRankFilter3) btnRankFilter3.onclick = () => renderAccumulatedWins(3);
    if (btnRankFilter4) btnRankFilter4.onclick = () => renderAccumulatedWins(4);
    if (btnRankFilter5) btnRankFilter5.onclick = () => renderAccumulatedWins(5);

    renderAccumulatedWins(0);
    renderSimulationCharts(hit1st, hit2nd, hit3rd, hit4th, hit5th, totalHits);

    const gridEl = document.getElementById('simHistoryCardsGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';
    
    if (drawData) {
        const winningSet = new Set(drawData.numbers);
        const bonusNum = drawData.bonus;
        
        const getColor = (n) => {
            if (n <= 10) return '#fbc400';
            if (n <= 20) return '#69c8f2';
            if (n <= 30) return '#ff7272';
            if (n <= 40) return '#aaa';
            return '#b0d840';
        };
        
        const simCombinations = getCombosForSimulationRound(selectedRound, cfg);
        if (!simCombinations || simCombinations.length === 0) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 28px 16px; background: rgba(15, 23, 42, 0.5); border: 1px dashed rgba(255,255,255,0.15); border-radius: 12px; color: #94a3b8;">
                    <i class="fa-solid fa-sliders" style="font-size: 1.5rem; color: #fbbf24; margin-bottom: 8px; display: block;"></i>
                    <strong style="color: #f8fafc; font-size: 0.95rem;">선택된 알고리즘이 없습니다.</strong><br>
                    <span style="font-size: 0.8rem; color: #cbd5e1;">상단의 알고리즘 선택 체크박스에서 시뮬레이션할 알고리즘을 1개 이상 선택해주세요.</span>
                </div>
            `;
            return;
        }
        const cardsHtml = (simCombinations || []).map(combo => {
            let matchesList = (combo.numbers || []).filter(n => winningSet.has(n));
            let realMatchCount = matchesList.length;
            let isBonusMatch = (combo.numbers || []).includes(bonusNum);
            
            let highlightSet = new Set(matchesList);
            let matchCount = realMatchCount;
            let finalBonusMatch = isBonusMatch;

            let prizeText = '낙첨';
            let prizeStyle = 'background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.1); font-weight: normal; padding: 2px 8px; border-radius: 6px; font-size: 0.78rem;';
            if (matchCount === 6) { 
                prizeText = '🎉 1등 당첨!! (6개 일치)'; 
                prizeStyle = 'background: rgba(251,191,36,0.25); color: #fbbf24; border: 1.5px solid #fbbf24; font-weight: 800; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; box-shadow: 0 0 10px rgba(251,191,36,0.5);';
            }
            else if (matchCount === 5 && finalBonusMatch) { 
                prizeText = '🥈 2등 당첨!! (5개+보너스)'; 
                prizeStyle = 'background: rgba(96,165,250,0.25); color: #60a5fa; border: 1.5px solid #60a5fa; font-weight: 800; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; box-shadow: 0 0 10px rgba(96,165,250,0.5);';
            }
            else if (matchCount === 5) { 
                prizeText = '🥉 3등 당첨! (5개 일치)'; 
                prizeStyle = 'background: rgba(52,211,153,0.25); color: #34d399; border: 1.5px solid #34d399; font-weight: 800; padding: 3px 8px; border-radius: 6px; font-size: 0.8rem; box-shadow: 0 0 10px rgba(52,211,153,0.5);';
            }
            else if (matchCount === 4) { 
                prizeText = '✨ 4등 (50,000원)'; 
                prizeStyle = 'background: rgba(167,139,250,0.2); color: #c4b5fd; border: 1px solid #a78bfa; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.78rem;';
            }
            else if (matchCount === 3) { 
                prizeText = '⭐ 5등 (5,000원)'; 
                prizeStyle = 'background: rgba(244,114,182,0.2); color: #f472b6; border: 1px solid #f472b6; font-weight: 700; padding: 2px 8px; border-radius: 6px; font-size: 0.78rem;';
            }

            const badgeColor = (combo.meta && combo.meta.badgeColor) ? combo.meta.badgeColor : '#38bdf8';
            const comboTitle = (combo.meta && combo.meta.name) ? combo.meta.name : (combo.name || '추천 조합');
            const ownerName = (combo.meta && combo.meta.ownerName) ? combo.meta.ownerName : combo.userName;
            const ownerBadge = ownerName ? `<span style="font-size: 0.72rem; font-weight: 800; color: #fbbf24; background: rgba(251,191,36,0.15); border: 1px solid rgba(251,191,36,0.4); padding: 2px 6px; border-radius: 4px;"><i class="fa-solid fa-user"></i> ${ownerName}</span>` : '';

            return `
                <div class="verify-card" style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; margin-bottom: 10px;">
                    <div class="verify-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <div class="combo-title-group" style="display: flex; align-items: center; gap: 8px;">
                            ${ownerBadge}
                            <span style="font-size: 0.72rem; font-weight: 800; color: ${badgeColor}; background: ${badgeColor}20; border: 1px solid ${badgeColor}50; padding: 2px 6px; border-radius: 4px;">
                                ${(combo.meta && combo.meta.rankBadge) ? combo.meta.rankBadge : 'AI 퀀트'}
                            </span>
                            <span class="combo-name" style="font-weight: bold; color: #fff; font-size: 0.92rem;">${comboTitle}</span>
                        </div>
                        <span style="${prizeStyle}">${prizeText}</span>
                    </div>
                    <div class="balls-row" style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                        ${(combo.numbers || []).map(n => {
                            const isHit = highlightSet.has(n);
                            const isBonus = (n === bonusNum);
                            const ballBg = getColor(n);
                            let extraStyle = '';
                            if (isHit) {
                                extraStyle = 'border: 2px solid #fbbf24; font-weight: 800; transform: scale(1.1); box-shadow: 0 0 10px rgba(251,191,36,0.9); opacity: 1; z-index: 2;';
                            } else if (isBonus) {
                                extraStyle = 'border: 2px solid #f87171; font-weight: 800; transform: scale(1.1); box-shadow: 0 0 10px rgba(248,113,113,0.9); opacity: 1; z-index: 2;';
                            } else {
                                extraStyle = 'opacity: 0.35; filter: grayscale(35%);';
                            }
                            return `<div class="lotto-ball sm-ball ${getBallColorClass(n)}" style="background: ${ballBg}; ${extraStyle} width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; color: #fff; font-size: 0.8rem; display: inline-block;">${n}</div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');
        gridEl.innerHTML = cardsHtml;
    }
}

export function renderAccumulatedWins(rankFilter) {
    const allWins = generateAccumulatedWinsHistory();
    const accumulatedWinsContainer = document.getElementById('accumulatedWinsListContainer');
    if (!accumulatedWinsContainer) return;
    accumulatedWinsContainer.innerHTML = '';
    
    const btnRankFilterAll = document.getElementById('btnRankFilterAll');
    const btnRankFilter1 = document.getElementById('btnRankFilter1');
    const btnRankFilter2 = document.getElementById('btnRankFilter2');
    const btnRankFilter3 = document.getElementById('btnRankFilter3');
    const btnRankFilter4 = document.getElementById('btnRankFilter4');
    const btnRankFilter5 = document.getElementById('btnRankFilter5');

    [btnRankFilterAll, btnRankFilter1, btnRankFilter2, btnRankFilter3, btnRankFilter4, btnRankFilter5].forEach((btn, idx) => {
        if (btn) {
            if ((idx === 0 && rankFilter === 0) || (idx === rankFilter)) {
                btn.classList.add('active-filter');
            } else {
                btn.classList.remove('active-filter');
            }
        }
    });

    const cfg = getSelectedSimulationConfig();
    const effectiveTarget = getEffectiveTargetUser();
    const cfgKey = `${effectiveTarget}_${JSON.stringify(cfg)}`;
    const hasExecutedSim = !!(liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0);

    if (!hasExecutedSim) {
        const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1239);
        accumulatedWinsContainer.innerHTML = `
            <div class="sim-empty-state">
                <i class="fa-solid fa-flask-vial"></i>
                <strong>백테스팅 실행 대기 중</strong><br>
                <span>
                    아직 백테스팅이 실행되지 않았습니다.<br>
                    상단의 <strong style="color: #fbbf24;">[1~${maxR}회 리얼 백테스팅 시작]</strong> 버튼을 누르시면 과거 전 회차 실제 당첨번호와 7대 알고리즘의 진짜 적중 실적이 1:1로 집계됩니다.
                </span>
            </div>
        `;
        return;
    }

    const filtered = (rankFilter === 0) 
        ? allWins 
        : allWins.filter(w => w.prizeRank === rankFilter);

    if (filtered.length === 0) {
        const rankName = rankFilter === 1 ? '1등 (6개 일치)' : (rankFilter === 2 ? '2등 (5개+보너스 일치)' : (rankFilter === 3 ? '3등 (5개 일치)' : (rankFilter === 4 ? '4등 (4개 일치)' : '5등 (3개 일치)')));
        accumulatedWinsContainer.innerHTML = `
            <div class="sim-empty-state">
                <i class="fa-solid fa-circle-info" style="color:#38bdf8;"></i>
                <strong>${rankName} 당첨 기록 없음</strong><br>
                <span>
                    시뮬레이션 기간 동안 ${rankName} 당첨이 발생하지 않았습니다.<br>
                    상단 필터에서 <strong>[전체]</strong> 또는 <strong>[역대 4등 / 5등]</strong> 버튼을 눌러 적중 내역을 확인해보세요.
                </span>
            </div>
        `;
        return;
    }

    const rankShortLabels = { 1: '🥇 1등 (6개)', 2: '🥈 2등 (5+보)', 3: '🥉 3등 (5개)', 4: '✨ 4등 (4개)', 5: '⭐ 5등 (3개)' };
    const prizeAmounts = { 1: '약 20억+ 원', 2: '5,000만 원', 3: '150만 원', 4: '50,000 원', 5: '5,000 원' };

    const itemsHtml = filtered.slice(0, 150).map(w => {
        const rLabel = rankShortLabels[w.prizeRank] || `${w.prizeRank}등`;
        const prizeTxt = prizeAmounts[w.prizeRank] || '';
        const comboName = (w.combo && w.combo.meta && w.combo.meta.name) ? w.combo.meta.name : (w.combo ? w.combo.name : '추천 번호');
        const ownerName = (w.combo && w.combo.meta && w.combo.meta.ownerName) ? w.combo.meta.ownerName : (w.combo ? w.combo.userName : '');
        const nums = (w.combo && w.combo.numbers) ? w.combo.numbers : [];

        const drawData = (state.mergedHistory && state.mergedHistory[w.round]) ? state.mergedHistory[w.round] : null;
        const winningSet = (drawData && Array.isArray(drawData.numbers)) ? new Set(drawData.numbers) : null;
        const bonusNum = drawData ? drawData.bonus : null;

        return `
            <div class="sim-win-item-card rank-${w.prizeRank}">
                <div class="sim-win-card-header">
                    <div class="sim-win-info-left">
                        <span class="sim-win-round-tag">제 ${w.round}회</span>
                        <span class="sim-win-rank-tag rank-${w.prizeRank}">${rLabel}</span>
                        <span class="sim-win-combo-tag" title="${comboName}">${comboName}</span>
                        ${ownerName ? `<span class="sim-win-user-tag"><i class="fa-solid fa-user"></i> ${ownerName}</span>` : ''}
                    </div>
                    <div class="sim-win-info-right">
                        <span class="sim-win-prize-tag">${prizeTxt}</span>
                    </div>
                </div>
                <div class="sim-win-balls-row">
                    ${nums.map(n => {
                        const isHit = winningSet ? winningSet.has(n) : false;
                        const isBonus = (n === bonusNum);
                        const ballBg = getBallHexColor(n);
                        let hitClass = '';
                        if (isHit) hitClass = 'hit-ball';
                        else if (isBonus) hitClass = 'bonus-ball';
                        else if (winningSet) hitClass = 'dim-ball';
                        return `<span class="sim-win-ball ${hitClass} ${getBallColorClass(n)}" style="background:${ballBg};">${n}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    accumulatedWinsContainer.innerHTML = `
        <div class="sim-wins-count-bar">
            <span><i class="fa-solid fa-list-check"></i> 적중 내역 총 <strong>${filtered.length.toLocaleString()}</strong>건 (상위 150건)</span>
            <span style="color:#94a3b8; font-size:0.75rem;">최신 회차순</span>
        </div>
        <div class="sim-wins-scroll-list">
            ${itemsHtml}
        </div>
    `;
}

export function renderSimulationCharts(hit1st, hit2nd, hit3rd, hit4th, hit5th, totalWins) {
    const chartContainer = document.getElementById('simChartContainer');
    if (chartContainer) chartContainer.style.display = totalWins > 0 ? 'flex' : 'none';

    if (state.simPrizePieChartInstance) {
        try { state.simPrizePieChartInstance.destroy(); } catch(e){}
    }
    const pieCanvas = document.getElementById('simPrizeRatioChart');
    if (pieCanvas && typeof window.Chart === 'function' && totalWins > 0) {
        try {
            const pieCtx = pieCanvas.getContext('2d');
            state.simPrizePieChartInstance = new window.Chart(pieCtx, {
                type: 'doughnut',
                data: {
                    labels: ['1등', '2등', '3등', '4등', '5등'],
                    datasets: [{
                        data: [hit1st, hit2nd, hit3rd, hit4th, hit5th],
                        backgroundColor: ['#fbbf24', '#60a5fa', '#34d399', '#a78bfa', '#f472b6'],
                        borderWidth: 1,
                        borderColor: 'rgba(15,23,42,0.8)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { color: '#cbd5e1', font: { size: 10 } } }
                    },
                    cutout: '65%'
                }
            });
        } catch(e) {}
    }
}

/**
 * Execute real historical walk-forward backtesting across all historical draws (1 to 1238)
 */
export async function runRealHistoricalSimulation() {
    const cfg = getSelectedSimulationConfig();
    if (!cfg.hasSelection) {
        showToast("시뮬레이션할 알고리즘을 1개 이상 선택해주세요.");
        return;
    }

    const btn = document.getElementById('btnRunRealSim');
    const progContainer = document.getElementById('simProgressContainer');
    const progBar = document.getElementById('simProgressBar');
    const progText = document.getElementById('simProgressText');
    const progCount = document.getElementById('simProgressCount');
    
    if (!btn || !progContainer) return;
    
    btn.style.display = 'none';
    progContainer.style.display = 'block';
    
    const maxRound = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : (state.mergedHistory ? Math.max(...Object.keys(state.mergedHistory).map(Number)) : 1239));
    const results = [];
    let r = maxRound;
    
    const chunkSize = 50;

    function getHistoricalDrawData(round) {
        if (state.mergedHistory && state.mergedHistory[round]) {
            const h = state.mergedHistory[round];
            return {
                drwNo: round,
                drwNoDate: h.date || h.drwNoDate || '',
                date: h.date || h.drwNoDate || '',
                numbers: h.numbers || [],
                bonus: h.bonus,
                rank1Prize: h.rank1Prize || h.firstWinamnt
            };
        }
        return null;
    }
    
    const effectiveTarget = getEffectiveTargetUser();
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '')) || '';
    const targetTitle = (effectiveTarget === '__ALL__') ? `전체 등록 회원 종합` : (effectiveTarget === authId ? '관리자 본인' : effectiveTarget);

    return new Promise((resolve) => {
        function processChunk() {
            const end = Math.max(1, r - chunkSize + 1);
            for (; r >= end; r--) {
                const drawData = getHistoricalDrawData(r);
                if (!drawData || !Array.isArray(drawData.numbers) || drawData.numbers.length !== 6) continue;
                
                const winningSet = new Set(drawData.numbers);
                const bonusNum = drawData.bonus;

                // Retrieve all combinations (Base 10 + Checked Extra Packs) for round r with target user
                const simulatedCombos = getCombosForSimulationRound(r, cfg, effectiveTarget);
                
                simulatedCombos.forEach(combo => {
                    let matchesList = (combo.numbers || []).filter(n => winningSet.has(n));
                    let realMatchCount = matchesList.length;
                    let isBonusMatch = (combo.numbers || []).includes(bonusNum);
                    
                    let prizeRank = 0;
                    if (realMatchCount === 6) prizeRank = 1;
                    else if (realMatchCount === 5 && isBonusMatch) prizeRank = 2;
                    else if (realMatchCount === 5) prizeRank = 3;
                    else if (realMatchCount === 4) prizeRank = 4;
                    else if (realMatchCount === 3) prizeRank = 5;
                    
                    if (prizeRank > 0) {
                        results.push({ round: r, combo: combo, prizeRank: prizeRank });
                    }
                });
            }
            
            const processed = maxRound - r;
            const pct = Math.min(100, Math.round((processed / maxRound) * 100));
            if (progBar) progBar.style.width = `${pct}%`;
            if (progText) progText.textContent = `1~${maxRound}회 [${targetTitle}] 백테스팅 진행 중... ${pct}%`;
            if (progCount) progCount.textContent = `${processed} / ${maxRound} 회차`;
            
            if (r >= 1) {
                requestAnimationFrame(processChunk);
            } else {
                const cfgKey = `${effectiveTarget}_${JSON.stringify(cfg)}`;
                liveSimCacheMap[cfgKey] = results;
                realSimCache = results;
                if (progText) progText.textContent = `백테스팅 완료!`;
                setTimeout(() => {
                    if (progContainer) progContainer.style.display = 'none';
                    if (btn) {
                        btn.style.display = 'inline-block';
                        btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> 1~${maxRound}회 [${targetTitle}] 리얼 백테스팅 다시 실행`;
                    }
                    const sel = document.getElementById('simRoundSelector');
                    const targetRound = sel && sel.value ? parseInt(sel.value) : null;
                    renderSimulationTab(targetRound);
                    showToast(`🎉 [${targetTitle}] ${maxRound}개 전 회차 리얼 백테스팅 완료! (총 ${results.length}회 적중)`);
                }, 400);
                resolve(results);
            }
        }
        processChunk();
    });
}

export function setupSimulationEvents() {
    const btnRunRealSim = document.getElementById('btnRunRealSim');
    if (btnRunRealSim) {
        btnRunRealSim.addEventListener('click', () => {
            runRealHistoricalSimulation();
        });
    }

    const simRoundSelector = document.getElementById('simRoundSelector');
    if (simRoundSelector) {
        simRoundSelector.addEventListener('change', (e) => {
            const targetRound = parseInt(e.target.value);
            if (!isNaN(targetRound)) {
                renderSimulationTab(targetRound);
            }
        });
    }

    const handleConfigChange = () => {
        const sel = document.getElementById('simRoundSelector');
        const targetRound = sel && sel.value ? parseInt(sel.value) : null;
        renderSimulationTab(targetRound);
    };

    const chkSimV3 = document.getElementById('chkSimIncludeV3');
    const chkSimV4 = document.getElementById('chkSimIncludeV4');
    if (chkSimV3) chkSimV3.addEventListener('change', handleConfigChange);
    if (chkSimV4) chkSimV4.addEventListener('change', handleConfigChange);

    for (let p = 1; p <= 5; p++) {
        const chk = document.getElementById(`chkSimExtraPack${p}`);
        if (chk) chk.addEventListener('change', handleConfigChange);
    }
}

if (typeof window !== 'undefined') {
    window.renderSimulationTab = renderSimulationTab;
    window.runRealHistoricalSimulation = runRealHistoricalSimulation;
    window.setupSimulationEvents = setupSimulationEvents;
    window.selectAllSimAlgos = selectAllSimAlgos;
    window.changeSimAdminViewingUser = function(val) {
        state.simAdminTargetUserId = val;
        const sel = document.getElementById('simRoundSelector');
        const targetRound = sel && sel.value ? parseInt(sel.value) : null;
        renderSimulationTab(targetRound);
    };
}

