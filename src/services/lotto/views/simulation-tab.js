import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack, enterHistoryIsolation, exitHistoryIsolation, buildWalkForwardCore3BScoreCache, generateCore3BPortfolioAtRound } from '../generator.js';
import { getSafeActualDraw } from '../ledger.js';
import { db } from '../../../shared/db.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';

let realSimCache = null;
const liveSimCacheMap = {};
const liveSimCoreStatsMap = {};
let _simResultViewMode = 'totals';
let _simAlgoSortMode = 'prize';
let _simRangeCount = 50; // 50, 100, 300, or 0 (all rounds)

export function getSimCfgKey(effectiveTarget, cfg) {
    return `${effectiveTarget}_N${_simRangeCount}_PLANA_${JSON.stringify(cfg)}`;
}

export function setSimRangeCount(cnt, btnEl = null) {
    _simRangeCount = Number(cnt) || 0;
    document.querySelectorAll('.sim-range-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
        b.classList.remove('active');
    });
    if (btnEl) {
        btnEl.style.background = '#0284c7';
        btnEl.style.color = '#ffffff';
        btnEl.classList.add('active');
    }
    const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1250);
    const btnRun = document.getElementById('btnRunRealSim');
    if (btnRun) {
        const rangeTxt = _simRangeCount > 0 ? `최근 ${_simRangeCount}회 (${Math.max(1, maxR - _simRangeCount + 1)}~${maxR}회)` : `1~${maxR}회 전 회차`;
        btnRun.innerHTML = `<i class="fa-solid fa-play"></i> ${rangeTxt} 핵심·보조 코어 리얼 백테스팅 시작`;
    }
    const sel = document.getElementById('simRoundSelector');
    const targetRound = sel && sel.value ? parseInt(sel.value) : null;
    renderSimulationTab(targetRound);
}

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
    const cfgKey = getSimCfgKey(targetUserId, cfg);
    if (liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0) {
        return liveSimCacheMap[cfgKey];
    }
    try {
        const cached = sessionStorage.getItem(`sim_cache_history_${cfgKey}`);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                liveSimCacheMap[cfgKey] = parsed;
                return parsed;
            }
        }
    } catch(e) {}
    return []; // No mock data! Return empty until real simulation is run
}

/**
 * Get current simulation settings (3 All-Rounder Algorithms independently selectable: V4, V3, AR3)
 */
export function getSelectedSimulationConfig() {
    const chkSimV3 = document.getElementById('chkSimIncludeV3');
    const chkSimV4 = document.getElementById('chkSimIncludeV4');
    const chkSimE1 = document.getElementById('chkSimExtraPack1');
    
    const includeV3 = chkSimV3 ? chkSimV3.checked : false;
    const includeV4 = chkSimV4 ? chkSimV4.checked : false;
    
    const selectedExtraPacks = [];
    if (chkSimE1 && chkSimE1.checked) selectedExtraPacks.push(1);
    
    const selectedCount = (includeV4 ? 1 : 0) + (includeV3 ? 1 : 0) + selectedExtraPacks.length;
    const hasSelection = selectedCount > 0;
    
    return { includeV3, includeV4, selectedExtraPacks, selectedCount, hasSelection };
}

/**
 * Select/Deselect all 3 All-Rounder simulation algorithm checkboxes
 */
export function selectAllSimAlgos(checked = true) {
    const chkSimV3 = document.getElementById('chkSimIncludeV3');
    const chkSimV4 = document.getElementById('chkSimIncludeV4');
    const chkSimE1 = document.getElementById('chkSimExtraPack1');
    if (chkSimV3) chkSimV3.checked = checked;
    if (chkSimV4) chkSimV4.checked = checked;
    if (chkSimE1) chkSimE1.checked = checked;
    
    const sel = document.getElementById('simRoundSelector');
    const targetRound = sel && sel.value ? parseInt(sel.value) : null;
    renderSimulationTab(targetRound);
}

export function getSingleUserCombosForRound(round, cfg, userId, userName = null, scoreCache = null) {
    const pf = generateCore3BPortfolioAtRound(round, userId, scoreCache, true);
    if (!pf) return [];
    const combos = [];
    const coreMeta = {
        top6: pf.top6Anchors || [],
        support10: pf.support10 || [],
        pool16: pf.pool16 || []
    };

    if (cfg.includeV4 && Array.isArray(pf.v4)) {
        for (let i = 0; i < pf.v4.length; i++) {
            const c = pf.v4[i];
            const clone = { ...c, coreMeta };
            if (userName) clone.meta = { ...(c.meta || {}), ownerName: userName };
            clone.algoId = 'v4';
            clone.algoName = '올라운더 팩 1 (TOP6 직결·고액 휠)';
            combos.push(clone);
        }
    }
    if (cfg.includeV3 && Array.isArray(pf.v3)) {
        for (let i = 0; i < pf.v3.length; i++) {
            const c = pf.v3[i];
            const clone = { ...c, coreMeta };
            if (userName) clone.meta = { ...(c.meta || {}), ownerName: userName };
            clone.algoId = 'v3';
            clone.algoName = '올라운더 팩 2 (EV 상호보완 휠)';
            combos.push(clone);
        }
    }
    if (cfg.selectedExtraPacks.includes(1) && Array.isArray(pf.ar3)) {
        for (let i = 0; i < pf.ar3.length; i++) {
            const c = pf.ar3[i];
            const clone = { ...c, coreMeta };
            if (userName) clone.meta = { ...(c.meta || {}), ownerName: userName };
            clone.algoId = 'extra_1';
            clone.packIdx = 1;
            clone.algoName = '기본 3: 올라운더 팩 3 (30G 완결 휠)';
            combos.push(clone);
        }
    }
    return combos;
}

/**
 * Generate all combinations for a specific simulation round based on currently selected algorithms and target user(s)
 * @param {number} round 
 * @param {Object} config 
 * @param {string} customUserId
 */
const _simRoundCombosCache = new Map();

export function getCombosForSimulationRound(round, config = null, customUserId = null, scoreCache = null) {
    const cfg = config || getSelectedSimulationConfig();
    const effectiveTarget = customUserId || getEffectiveTargetUser();
    const roundCacheKey = `${effectiveTarget}_R${round}_${JSON.stringify(cfg)}`;

    if (_simRoundCombosCache.has(roundCacheKey)) {
        return _simRoundCombosCache.get(roundCacheKey);
    }

    let resultCombos;
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
            return !uId.startsWith('{') && !uId.startsWith('test_') && !uId.startsWith('notif_') && !uId.startsWith('notifs_') && uId !== 'app_latest_version' && uId !== 'dashboard_summary_latest' && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'sample' && uId !== 'hms' && uId !== 'admin' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
        });
        const finalUsers = filteredUsers.length > 0 ? filteredUsers : [{ id: 'master', name: '관리자 본인' }];

        const allCombos = [];
        finalUsers.forEach(u => {
            const uCombos = getSingleUserCombosForRound(round, cfg, u.id, u.name || u.id, scoreCache);
            allCombos.push(...uCombos);
        });
        resultCombos = allCombos;
    } else {
        resultCombos = getSingleUserCombosForRound(round, cfg, effectiveTarget, null, scoreCache);
    }
    _simRoundCombosCache.set(roundCacheKey, resultCombos);
    return resultCombos;
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
    const label = document.getElementById('simRoundDisplayLabel');
    if (label && sel.value) {
        label.innerText = `제 ${sel.value}회차`;
    }
}

export function renderSimulationTab(targetRound = null) {
    const tabSimEl = document.getElementById('tab-simulation');
    if (!tabSimEl || (!tabSimEl.classList.contains('active') && tabSimEl.style.display === 'none')) {
        return;
    }

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

    const roundDisplayLabel = document.getElementById('simRoundDisplayLabel');
    if (roundDisplayLabel) roundDisplayLabel.innerText = `제 ${selectedRound}회차`;

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
            
            let simUserLabel = '👑 관리자 본인';
            if (effectiveTarget === '__ALL__') {
                simUserLabel = '👥 [전체] 등록 회원 종합';
            } else if (effectiveTarget.toLowerCase() !== authId.toLowerCase()) {
                const foundU = userList.find(u => (u.id || '').toLowerCase() === effectiveTarget.toLowerCase());
                simUserLabel = foundU ? `👤 ${(foundU.name || foundU.realName || foundU.id)} (${foundU.id})` : `👤 ${effectiveTarget}`;
            }

            userList.forEach(u => {
                if (u.id !== authId) {
                    userOptions += `<option value="${u.id}" ${effectiveTarget === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name}${u.phone ? ` / ${u.phone}` : ''})</option>`;
                }
            });

            adminBarContainer.innerHTML = `
                <div class="sim-admin-bar" style="background: #0d1322; border: 1px solid rgba(245, 158, 11, 0.35); padding: 5px 10px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 8px; max-width: 100%; box-sizing: border-box; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.25);">
                    <span style="font-size: 0.76rem; color: #fbbf24; font-weight: 800; display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0;">
                        <i class="fa-solid fa-crown" style="font-size: 0.72rem;"></i> 시뮬레이션 대상:
                    </span>
                    <button type="button" id="btnSimUserTrigger" class="slim-picker-trigger slim-picker-trigger-amber" onclick="window.openSlimMemberPickerForSimulation && window.openSlimMemberPickerForSimulation()" style="flex: 1 1 auto; max-width: 320px; min-width: 0; min-height: 26px; height: 28px; padding: 2px 8px; font-size: 0.74rem; justify-content: space-between; border-radius: 6px;">
                        <span style="display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <i class="fa-solid fa-user text-amber-400" style="font-size: 0.68rem;"></i>
                            <span id="simUserDisplayLabel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${simUserLabel}</span>
                        </span>
                        <i class="fa-solid fa-chevron-down" style="font-size: 0.6rem; opacity: 0.6; margin-left: 6px; flex-shrink: 0;"></i>
                    </button>
                    <select id="simAdminUserSelect" onchange="window.changeSimAdminViewingUser && window.changeSimAdminViewingUser(this.value)" style="display: none;">
                        ${userOptions}
                    </select>
                </div>
            `;
        } else {
            adminBarContainer.innerHTML = '';
        }
    }

    function getHistoricalDrawData(round) {
        const h = (typeof getSafeActualDraw === 'function') ? (getSafeActualDraw(round) || (state.mergedHistory ? state.mergedHistory[round] : null)) : (state.mergedHistory ? state.mergedHistory[round] : null);
        if (h) {
            return {
                drwNo: round,
                drwNoDate: h.date || h.drwNoDate || '',
                date: h.date || h.drwNoDate || '',
                numbers: h.numbers || [],
                bonus: h.bonus,
                rank1Prize: h.rank1Prize || h.firstWinamnt || (h.prizes && h.prizes[1] && h.prizes[1].prize),
                rank2Prize: h.rank2Prize || (h.prizes && h.prizes[2] && h.prizes[2].prize) || 50000000,
                rank3Prize: h.rank3Prize || (h.prizes && h.prizes[3] && h.prizes[3].prize) || 1500000
            };
        }
        return null;
    }

    const cfg = getSelectedSimulationConfig();
    const cfgKey = getSimCfgKey(effectiveTarget, cfg);
    const baseCount = (cfg.includeV4 ? 10 : 0) + (cfg.includeV3 ? 10 : 0);
    const extraCount = cfg.selectedExtraPacks.length * 10;
    const gamesPerRound = baseCount + extraCount;

    const registeredCount = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0) ? state.allRegisteredUsersList.length : 1;
    const userMultiplier = (effectiveTarget === '__ALL__') ? registeredCount : 1;
    const evaluatedGamesPerRound = gamesPerRound * userMultiplier;
    const coreStats = liveSimCoreStatsMap[cfgKey] || null;
    const totalDraws = (coreStats && coreStats.evaluatedRounds > 0)
        ? coreStats.evaluatedRounds
        : (_simRangeCount > 0 ? Math.min(maxR, _simRangeCount) : maxR);
    const totalCombosEvaluated = totalDraws * evaluatedGamesPerRound;

    const packNames = { 1: '올라운더3' };
    const engineParts = [];
    if (cfg.includeV4) engineParts.push('올라운더(10G)');
    if (cfg.includeV3) engineParts.push('올라운더2(10G)');
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
    const hasExecutedSim = !!(liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0) || !!(coreStats && coreStats.evaluatedRounds > 0);

    if (hasExecutedSim) {
        allWins = liveSimCacheMap[cfgKey] || [];
        hit1st = allWins.filter(w => w.prizeRank === 1).length;
        hit2nd = allWins.filter(w => w.prizeRank === 2).length;
        hit3rd = allWins.filter(w => w.prizeRank === 3).length;
        hit4th = allWins.filter(w => w.prizeRank === 4).length;
        hit5th = allWins.filter(w => w.prizeRank === 5).length;
        allWins.forEach(w => {
            const wData = getHistoricalDrawData(w.round);
            if (w.prizeRank === 1) {
                totalPrize += (wData && wData.rank1Prize) ? wData.rank1Prize : 2000000000;
            } else if (w.prizeRank === 2) {
                totalPrize += (wData && wData.rank2Prize) ? wData.rank2Prize : 50000000;
            } else if (w.prizeRank === 3) {
                totalPrize += (wData && wData.rank3Prize) ? wData.rank3Prize : 1500000;
            } else if (w.prizeRank === 4) totalPrize += 50000;
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

    renderAlgorithmPrizeTotals();
    renderAccumulatedWins(0);
    renderSimulationCharts(hit1st, hit2nd, hit3rd, hit4th, hit5th, totalHits);
}

export function renderAccumulatedWins(rankFilter) {
    const allWins = generateAccumulatedWinsHistory();
    const accumulatedWinsContainer = document.getElementById('accumulatedWinsListContainer');
    if (!accumulatedWinsContainer) return;
    accumulatedWinsContainer.innerHTML = '';

    // Synchronize Dual View Mode sections
    const totalsSec = document.getElementById('simAlgoTotalsSection');
    const feedSec = document.getElementById('simDetailFeedSection');
    const btnTotals = document.getElementById('btnSimViewTotals');
    const btnFeed = document.getElementById('btnSimViewFeed');
    if (totalsSec && feedSec) {
        if (_simResultViewMode === 'totals') {
            totalsSec.style.display = 'block';
            feedSec.style.display = 'none';
            if (btnTotals) btnTotals.classList.add('active');
            if (btnFeed) btnFeed.classList.remove('active');
        } else {
            totalsSec.style.display = 'none';
            feedSec.style.display = 'block';
            if (btnTotals) btnTotals.classList.remove('active');
            if (btnFeed) btnFeed.classList.add('active');
        }
    }
    
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
    const cfgKey = getSimCfgKey(effectiveTarget, cfg);
    const coreStats = liveSimCoreStatsMap[cfgKey] || null;
    const hasExecutedSim = !!(liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0) || !!(coreStats && coreStats.evaluatedRounds > 0);

    if (!hasExecutedSim) {
        const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1250);
        const sR = _simRangeCount > 0 ? Math.max(1, maxR - _simRangeCount + 1) : 1;
        accumulatedWinsContainer.innerHTML = `
            <div class="sim-empty-state">
                <i class="fa-solid fa-flask-vial"></i>
                <strong>백테스팅 실행 대기 중</strong><br>
                <span>
                    아직 백테스팅이 실행되지 않았습니다.<br>
                    상단의 <strong style="color: #fbbf24;">[${sR}~${maxR}회 핵심·보조 코어 리얼 백테스팅 시작]</strong> 버튼을 누르시면 현행 코어 16수 공식과 실제 당첨번호의 적중 실적이 1:1로 집계됩니다.
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

    const rankThemes = {
        1: { border: 'rgba(251, 191, 36, 0.65)', bg: 'linear-gradient(135deg, rgba(40, 35, 20, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)', tagColor: '#fbbf24', tagBg: 'rgba(251, 191, 36, 0.25)', tagBorder: '#fbbf24' },
        2: { border: 'rgba(96, 165, 250, 0.65)', bg: 'linear-gradient(135deg, rgba(20, 35, 55, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)', tagColor: '#93c5fd', tagBg: 'rgba(96, 165, 250, 0.25)', tagBorder: '#60a5fa' },
        3: { border: 'rgba(52, 211, 153, 0.65)', bg: 'linear-gradient(135deg, rgba(20, 45, 35, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)', tagColor: '#6ee7b7', tagBg: 'rgba(52, 211, 153, 0.25)', tagBorder: '#34d399' },
        4: { border: 'rgba(167, 139, 250, 0.55)', bg: 'linear-gradient(135deg, rgba(35, 25, 50, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)', tagColor: '#c4b5fd', tagBg: 'rgba(167, 139, 250, 0.2)', tagBorder: '#a78bfa' },
        5: { border: 'rgba(244, 114, 182, 0.55)', bg: 'linear-gradient(135deg, rgba(45, 20, 35, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)', tagColor: '#f472b6', tagBg: 'rgba(244, 114, 182, 0.2)', tagBorder: '#f472b6' }
    };

    const itemsHtml = filtered.slice(0, 150).map(w => {
        const rLabel = rankShortLabels[w.prizeRank] || `${w.prizeRank}등`;
        const prizeTxt = prizeAmounts[w.prizeRank] || '';
        const comboName = (w.combo && w.combo.meta && w.combo.meta.name) ? w.combo.meta.name : (w.combo ? w.combo.name : '추천 번호');
        const ownerName = (w.combo && w.combo.meta && w.combo.meta.ownerName) ? w.combo.meta.ownerName : (w.combo ? w.combo.userName : '');
        const nums = (w.combo && w.combo.numbers) ? w.combo.numbers : [];

        const drawData = (state.mergedHistory && state.mergedHistory[w.round]) ? state.mergedHistory[w.round] : null;
        const winningSet = (drawData && Array.isArray(drawData.numbers)) ? new Set(drawData.numbers) : null;
        const bonusNum = drawData ? drawData.bonus : null;
        const cm = (w.combo && w.combo.coreMeta) ? w.combo.coreMeta : null;
        let coreBadgeHtml = '';
        if (cm && winningSet) {
            const cHits = (cm.top6 || []).filter(n => winningSet.has(n)).length;
            const sHits = (cm.support10 || []).filter(n => winningSet.has(n)).length;
            const slotBadge = w.combo && w.combo.isDirectTop6
                ? `<span style="font-size:0.65rem; font-weight:900; color:#fbbf24; background:rgba(251,191,36,0.18); border:1px solid rgba(251,191,36,0.45); padding:1px 5px; border-radius:4px; white-space:nowrap;">👑 TOP6 직결</span>`
                : (w.combo && w.combo.isSup6Slot
                    ? `<span style="font-size:0.65rem; font-weight:900; color:#34d399; background:rgba(16,185,129,0.18); border:1px solid rgba(16,185,129,0.45); padding:1px 5px; border-radius:4px; white-space:nowrap;">🛡️ 보조6 전용슬롯</span>`
                    : (w.combo && w.combo.slotCoreCnt >= 4
                        ? `<span style="font-size:0.65rem; font-weight:900; color:#a78bfa; background:rgba(167,139,250,0.18); border:1px solid rgba(167,139,250,0.45); padding:1px 5px; border-radius:4px; white-space:nowrap;">⚡ 고핵심 ${w.combo.slotCoreCnt}+${6 - w.combo.slotCoreCnt}</span>`
                        : ''));
            coreBadgeHtml = `${slotBadge}<span style="font-size:0.68rem; font-weight:800; color:#38bdf8; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); padding:1px 6px; border-radius:4px; white-space:nowrap;">핵심 ${cHits}/6 + 보조 ${sHits}/10 = ${cHits + sHits}/6</span>`;
        }

        const theme = rankThemes[w.prizeRank] || rankThemes[4];

        return `
            <div class="sim-win-item-card rank-${w.prizeRank}" style="background:${theme.bg}; border:1.5px solid ${theme.border}; border-radius:12px; padding:10px 14px; display:flex; flex-direction:column; justify-content:space-between; gap:8px; box-shadow:0 4px 14px rgba(0,0,0,0.35); box-sizing:border-box;">
                <div class="sim-win-card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
                    <div class="sim-win-info-left" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0;">
                        <span class="sim-win-round-tag" style="font-size:0.88rem; font-weight:900; color:#f8fafc; white-space:nowrap;">제 ${w.round}회</span>
                        <span class="sim-win-rank-tag rank-${w.prizeRank}" style="font-size:0.74rem; font-weight:800; padding:2px 7px; border-radius:6px; white-space:nowrap; background:${theme.tagBg}; color:${theme.tagColor}; border:1px solid ${theme.tagBorder};">${rLabel}</span>
                        ${coreBadgeHtml}
                        <span class="sim-win-combo-tag" title="${comboName}" style="font-size:0.75rem; color:#94a3b8; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${comboName}</span>
                        ${ownerName ? `<span class="sim-win-user-tag" style="font-size:0.72rem; font-weight:800; color:#fbbf24; background:rgba(251,191,36,0.15); border:1px solid rgba(251,191,36,0.4); padding:1px 6px; border-radius:4px; white-space:nowrap;"><i class="fa-solid fa-user"></i> ${ownerName}</span>` : ''}
                    </div>
                    <div class="sim-win-info-right" style="display:flex; align-items:center; margin-left:auto;">
                        <span class="sim-win-prize-tag" style="font-size:0.85rem; font-weight:900; color:#fde047; white-space:nowrap; background:rgba(254,224,71,0.1); border:1px solid rgba(254,224,71,0.3); padding:2px 8px; border-radius:6px;">${prizeTxt}</span>
                    </div>
                </div>
                <div class="sim-win-balls-row" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; padding:4px 2px;">
                    ${nums.map(n => {
                        const isHit = winningSet ? winningSet.has(n) : false;
                        const isBonus = (n === bonusNum);
                        const ballBg = getBallHexColor(n);
                        let hitStyle = 'border:1px solid rgba(255,255,255,0.2);';
                        let hitClass = '';
                        let titleAttr = '';
                        if (isHit) {
                            hitClass = 'hit-ball ball-hit';
                            hitStyle = 'position:relative; overflow:visible !important; border:1.5px solid #10b981; box-shadow:0 0 10px rgba(16,185,129,0.4); z-index:2;';
                            titleAttr = ' title="정규 당첨번호 적중 (✓)"';
                        } else if (isBonus) {
                            hitClass = 'bonus-ball ball-bonus-hit';
                            hitStyle = 'position:relative; overflow:visible !important; border:1.5px dashed #38bdf8; box-shadow:0 0 10px rgba(56,189,248,0.4); z-index:2;';
                            titleAttr = ' title="보너스 번호 적중 (+)"';
                        } else if (winningSet) {
                            hitClass = 'dim-ball';
                            hitStyle = 'opacity:0.38; filter:grayscale(25%); border:1px solid rgba(255,255,255,0.1);';
                        }
                        const textColor = n <= 10 ? '#0f172a' : '#ffffff';
                        return `<span class="sim-win-ball ${hitClass} ${getBallColorClass(n)}"${titleAttr} style="width:28px; height:28px; line-height:28px; font-size:0.78rem; font-weight:900; color:${textColor}; text-align:center; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:${ballBg}; ${hitStyle} flex-shrink:0; box-shadow:0 2px 6px rgba(0,0,0,0.4);">${n.toString().padStart(2, '0')}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    accumulatedWinsContainer.innerHTML = `
        <div class="sim-wins-count-bar" style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; margin-bottom:8px; background:rgba(30, 41, 59, 0.7); border-radius:8px; border:1px solid rgba(255, 255, 255, 0.08); font-size:0.82rem; color:#cbd5e1; box-sizing:border-box;">
            <span><i class="fa-solid fa-list-check" style="color:#60a5fa;"></i> 적중 내역 총 <strong style="color:#fbbf24;">${filtered.length.toLocaleString()}</strong>건 (상위 150건)</span>
            <span style="color:#94a3b8; font-size:0.75rem;">최신 회차순</span>
        </div>
        <div class="sim-wins-scroll-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:10px; max-height:620px; overflow-y:auto; padding:4px 6px; box-sizing:border-box;">
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

export function detectComboAlgoId(combo) {
    if (combo && combo.algoId) return combo.algoId;
    const name = (combo && combo.meta && combo.meta.name) ? combo.meta.name : (combo ? (combo.name || '') : '');
    const clean = String(name).toLowerCase();
    if (clean.includes('올라운더 3') || clean.includes('올라운더3') || clean.includes('올라운더 팩 3') || clean.includes('ar3') || clean.includes('빈틈제로') || clean.includes('추가1')) return 'extra_1';
    if (clean.includes('3.0') || clean.includes('올라운더 팩 2') || clean.includes('올라운더 2')) return 'v3';
    if (clean.includes('4.0') || (clean.includes('올라운더') && !clean.includes('2') && !clean.includes('3') && !clean.includes('팩 2') && !clean.includes('팩 3'))) return 'v4';
    return 'v4';
}

export function formatKoreanPrize(amount) {
    if (amount === undefined || amount === null || amount === '' || Number(amount) === 0) return '0 원';
    const num = Math.round(Number(amount));
    if (num === 0) return '0 원';
    if (num < 0) {
        return `-${formatKoreanPrize(Math.abs(num))}`;
    }
    if (num >= 100000000) {
        const eok = Math.floor(num / 100000000);
        const man = Math.floor((num % 100000000) / 10000);
        if (man > 0) {
            return `${eok.toLocaleString()}억 ${man.toLocaleString()}만 원`;
        }
        return `${eok.toLocaleString()}억 원`;
    }
    if (num >= 10000) {
        const man = Math.floor(num / 10000);
        const rem = num % 10000;
        if (rem > 0) {
            return `${man.toLocaleString()}만 ${rem.toLocaleString()} 원`;
        }
        return `${man.toLocaleString()}만 원`;
    }
    return `${num.toLocaleString()} 원`;
}

export function switchSimResultViewMode(mode) {
    _simResultViewMode = mode;
    const totalsSec = document.getElementById('simAlgoTotalsSection');
    const feedSec = document.getElementById('simDetailFeedSection');
    const btnTotals = document.getElementById('btnSimViewTotals');
    const btnFeed = document.getElementById('btnSimViewFeed');

    if (btnTotals) {
        if (mode === 'totals') btnTotals.classList.add('active');
        else btnTotals.classList.remove('active');
    }
    if (btnFeed) {
        if (mode === 'feed') btnFeed.classList.add('active');
        else btnFeed.classList.remove('active');
    }
    if (totalsSec) totalsSec.style.display = (mode === 'totals') ? 'block' : 'none';
    if (feedSec) feedSec.style.display = (mode === 'feed') ? 'block' : 'none';

    if (mode === 'totals') {
        renderAlgorithmPrizeTotals();
    } else {
        renderAccumulatedWins(0);
    }
}

export function setSimAlgoSortMode(sort) {
    _simAlgoSortMode = sort;
    ['prize', 'hits', 'order'].forEach(s => {
        const btn = document.getElementById(`btnSimSort_${s}`);
        if (btn) {
            if (s === sort) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    renderAlgorithmPrizeTotals();
}

export function renderAlgorithmPrizeTotals() {
    const container = document.getElementById('simAlgoTotalsGridContainer');
    const heroCard = document.getElementById('simGrandSummaryHeroCard');
    if (!container) return;

    const cfg = getSelectedSimulationConfig();
    const effectiveTarget = getEffectiveTargetUser();
    const cfgKey = getSimCfgKey(effectiveTarget, cfg);
    const coreStats = liveSimCoreStatsMap[cfgKey] || null;
    const hasExecutedSim = !!(liveSimCacheMap[cfgKey] && liveSimCacheMap[cfgKey].length > 0) || !!(coreStats && coreStats.evaluatedRounds > 0);

    const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : (state.mergedHistory ? Math.max(...Object.keys(state.mergedHistory).map(Number)) : 1250));
    const startR = (coreStats && coreStats.startRound)
        ? coreStats.startRound
        : (_simRangeCount > 0 ? Math.max(1, maxR - _simRangeCount + 1) : 1);
    const evaluatedRoundCount = (coreStats && coreStats.evaluatedRounds)
        ? coreStats.evaluatedRounds
        : (maxR - startR + 1);
    const userCount = (state.allRegisteredUsersList && state.allRegisteredUsersList.length > 0) ? state.allRegisteredUsersList.length : 1;
    const userMul = (effectiveTarget === '__ALL__') ? userCount : 1;

    let targetTitle = '관리자 본인';
    if (effectiveTarget === '__ALL__') {
        targetTitle = `전체 등록 회원 (${userCount}명 종합)`;
    } else {
        const foundU = (state.allRegisteredUsersList || []).find(u => (u.id || '').toLowerCase() === effectiveTarget.toLowerCase());
        if (foundU) targetTitle = `회원: ${(foundU.name || foundU.realName || foundU.id)} (${foundU.id})`;
        else if (effectiveTarget !== 'admin' && effectiveTarget !== 'master' && effectiveTarget !== 'guest') targetTitle = `회원: ${effectiveTarget}`;
    }

    const coreBox = document.getElementById('simCoreHitSummaryBox');
    if (!hasExecutedSim) {
        if (heroCard) heroCard.style.display = 'none';
        if (coreBox) coreBox.style.display = 'none';

        const selectedNames = [];
        if (cfg.includeV4) selectedNames.push('올라운더 팩(10G)');
        if (cfg.includeV3) selectedNames.push('올라운더 팩 2(10G)');
        const packNames = { 1: '기본3: 올라운더3(10G)' };
        cfg.selectedExtraPacks.forEach(p => {
            if (packNames[p]) selectedNames.push(packNames[p]);
        });

        const badgesHtml = selectedNames.length > 0 
            ? selectedNames.map(n => `<span class="sim-opt-badge"><i class="fa-solid fa-check"></i> ${n}</span>`).join(' ')
            : `<span class="sim-opt-badge" style="color: #f87171;">선택된 알고리즘 없음</span>`;

        container.innerHTML = `
            <div class="sim-empty-state sim-standby-card">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px auto; color: #fbbf24; font-size: 1.5rem;">
                    <i class="fa-solid fa-flask-vial"></i>
                </div>
                <strong style="font-size: 1.0rem; color: #f8fafc; display: block; margin-bottom: 5px;">
                    현행 핵심·보조 코어 백테스팅 실행 대기 중
                </strong>
                <p style="font-size: 0.78rem; color: #94a3b8; max-width: 540px; margin: 0 auto 12px auto; line-height: 1.55;">
                    <strong style="color:#fbbf24;">${startR}회 ~ ${maxR}회 (${evaluatedRoundCount.toLocaleString()}회차)</strong> 실제 당첨 번호와 현행 <strong>핵심 코어 6수 + 보조 코어 10수 30게임 공식</strong>을 1:1로 대조할 준비가 완료되었습니다.<br>
                    상단 시작 버튼을 누르시면 각 회차 핵심·보조 코어 포착률 및 1~5등 당첨금이 즉시 집계됩니다.
                </p>
                <div class="sim-standby-opts-box">
                    <div style="font-size: 0.74rem; color: #cbd5e1; font-weight: 700; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-sliders text-amber-400"></i> 현재 선택된 시뮬레이션 옵션:
                    </div>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">
                        <span class="sim-opt-badge" style="color: #38bdf8;"><i class="fa-solid fa-user-tag"></i> 대상: ${targetTitle}</span>
                        ${badgesHtml}
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Has executed: render Core 6 & Support 10 capture KPI summary strip
    if (coreBox && coreStats) {
        coreBox.style.display = 'block';
        const c6Avg = (coreStats.core6HitSum / Math.max(1, coreStats.evaluatedRounds)).toFixed(2);
        const s10Avg = ((coreStats.sup10HitSum || 0) / Math.max(1, coreStats.evaluatedRounds)).toFixed(2);
        const p16Avg = (coreStats.pool16HitSum / Math.max(1, coreStats.evaluatedRounds)).toFixed(2);
        const p16_4plus = coreStats.pool16Hits4Plus || 0;
        const p16_5plus = coreStats.pool16Hits5Plus || 0;
        const p16_6 = coreStats.pool16Hits6 || 0;
        const s10_4plus = coreStats.sup10Hits4Plus || 0;
        const s10_6 = coreStats.sup10Hits6 || 0;
        const sup6SlotWins = coreStats.sup6SlotWins || 0;
        const winRoundPct = ((coreStats.winningRounds / Math.max(1, coreStats.evaluatedRounds)) * 100).toFixed(1);
        const bestRoundHtml = coreStats.bestCaptureRound
            ? `제 ${coreStats.bestCaptureRound.round}회 (${coreStats.bestCaptureRound.p16Main}/6 포착 · ${coreStats.bestCaptureRound.prize.toLocaleString()}원)`
            : '-';

        coreBox.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.9)); border: 1.5px solid rgba(56, 189, 248, 0.42); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <span style="font-size: 0.82rem; font-weight: 900; color: #38bdf8; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <i class="fa-solid fa-bullseye"></i> Plan A 핵심·보조 코어 실전 포착 성적표 (${startR}~${maxR}회)
                        <span style="font-size: 0.66rem; font-weight: 800; color: #34d399; background: rgba(16,185,129,0.16); border: 1px solid rgba(16,185,129,0.4); padding: 1px 6px; border-radius: 5px;">7분할 전구간 1등 쿼터 [1,2,3,7,10,4,3]</span>
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">최고 포착: <strong style="color: #fbbf24;">${bestRoundHtml}</strong></span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; font-size: 0.75rem;">
                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(251, 191, 36, 0.35); border-radius: 9px; padding: 8px 10px;">
                        <div style="color: #94a3b8; font-size: 0.68rem;">핵심 코어 6수 평균 적중</div>
                        <div style="color: #fbbf24; font-size: 1.02rem; font-weight: 900; margin-top: 2px;">${c6Avg} / 6수</div>
                        <div style="color: #cbd5e1; font-size: 0.66rem;">3+적중 ${coreStats.core6Hits3Plus || 0}회 · 전원적중 ${coreStats.core6Hits6 || 0}회</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(52, 211, 153, 0.35); border-radius: 9px; padding: 8px 10px;">
                        <div style="color: #94a3b8; font-size: 0.68rem;">보조 코어 10수 · 보조6슬롯</div>
                        <div style="color: #34d399; font-size: 1.02rem; font-weight: 900; margin-top: 2px;">${s10Avg} / 6수</div>
                        <div style="color: #cbd5e1; font-size: 0.66rem;">보조4+ ${s10_4plus}회 · 6전원 ${s10_6}회 · 보조6슬롯 ${sup6SlotWins}건</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 9px; padding: 8px 10px;">
                        <div style="color: #94a3b8; font-size: 0.68rem;">16수 풀 4개 이상 포착</div>
                        <div style="color: #38bdf8; font-size: 1.02rem; font-weight: 900; margin-top: 2px;">${p16Avg} / 6수 · ${p16_4plus}회</div>
                        <div style="color: #cbd5e1; font-size: 0.66rem;">5/6 포착 ${p16_5plus}회 · 6/6 전원 ${p16_6}회</div>
                    </div>
                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(167, 139, 250, 0.35); border-radius: 9px; padding: 8px 10px;">
                        <div style="color: #94a3b8; font-size: 0.68rem;">당첨 발생 회차 비율</div>
                        <div style="color: #c4b5fd; font-size: 1.02rem; font-weight: 900; margin-top: 2px;">${coreStats.winningRounds} / ${coreStats.evaluatedRounds}회</div>
                        <div style="color: #cbd5e1; font-size: 0.66rem;">회차 당첨률 ${winRoundPct}%</div>
                    </div>
                </div>
            </div>
        `;
    } else if (coreBox) {
        coreBox.style.display = 'none';
    }

    // Has executed: calculate totals for each selected algorithm
    if (heroCard) heroCard.style.display = 'block';

    const allWins = liveSimCacheMap[cfgKey] || [];
    
    // Define 7 algorithms with full metadata
    const algoDefinitions = [
        {
            id: 'v4',
            name: '올라운더 팩 1 (고핵심 TOP6·5+1·4+2)',
            shortName: '올라운더 팩',
            packType: 'TOP6·고핵심 블록',
            icon: 'fa-bullseye',
            color: '#fbbf24',
            badgeBg: 'rgba(251, 191, 36, 0.2)',
            badgeBorder: 'rgba(251, 191, 36, 0.5)',
            order: 1,
            isSelected: cfg.includeV4
        },
        {
            id: 'v3',
            name: '올라운더 팩 2 (중심혼합 3+3·2+4)',
            shortName: '올라운더 팩 2',
            packType: '중심 커버 블록',
            icon: 'fa-layer-group',
            color: '#38bdf8',
            badgeBg: 'rgba(56, 189, 248, 0.2)',
            badgeBorder: 'rgba(56, 189, 248, 0.5)',
            order: 2,
            isSelected: cfg.includeV3
        },
        {
            id: 'extra_1',
            name: '기본 3: 올라운더 3 (보조6수 1등 3슬롯)',
            shortName: '기본3: 올라운더3',
            packType: '보조6 포획 완결',
            icon: 'fa-shield-halved',
            color: '#10b981',
            badgeBg: 'rgba(16, 185, 129, 0.2)',
            badgeBorder: 'rgba(16, 185, 129, 0.5)',
            order: 3,
            isSelected: cfg.selectedExtraPacks.includes(1)
        }
    ];

    // Filter to ONLY selected algorithms matching the active options!
    const activeAlgos = algoDefinitions.filter(a => a.isSelected);

    if (activeAlgos.length === 0) {
        container.innerHTML = `
            <div class="sim-empty-state" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #f87171;"></i>
                <strong>선택된 알고리즘이 없습니다.</strong><br>
                <span>상단의 알고리즘 선택 체크박스에서 1개 이상의 팩을 선택해주세요.</span>
            </div>
        `;
        return;
    }

    // Initialize stats map for active algos
    const statsMap = {};
    activeAlgos.forEach(a => {
        statsMap[a.id] = {
            ...a,
            totalPrize: 0,
            hit1st: 0,
            hit2nd: 0,
            hit3rd: 0,
            hit4th: 0,
            hit5th: 0,
            totalHits: 0,
            cost: evaluatedRoundCount * 10 * userMul * 1000,
            roi: 0,
            sharePct: 0
        };
    });

    function getHistoricalDrawObj(round) {
        const h = (typeof getSafeActualDraw === 'function') ? (getSafeActualDraw(round) || (state.mergedHistory ? state.mergedHistory[round] : null)) : (state.mergedHistory ? state.mergedHistory[round] : null);
        return h || {};
    }

    let grandTotalPrize = 0;
    let grandTotalHits = 0;

    allWins.forEach(w => {
        const algoId = detectComboAlgoId(w.combo);
        if (statsMap[algoId]) {
            const h = getHistoricalDrawObj(w.round);
            let prize = 0;
            if (w.prizeRank === 1) {
                prize = h.rank1Prize || h.firstWinamnt || (h.prizes && h.prizes[1] && h.prizes[1].prize) || 2000000000;
                statsMap[algoId].hit1st++;
            } else if (w.prizeRank === 2) {
                prize = h.rank2Prize || (h.prizes && h.prizes[2] && h.prizes[2].prize) || 50000000;
                statsMap[algoId].hit2nd++;
            } else if (w.prizeRank === 3) {
                prize = h.rank3Prize || (h.prizes && h.prizes[3] && h.prizes[3].prize) || 1500000;
                statsMap[algoId].hit3rd++;
            } else if (w.prizeRank === 4) {
                prize = 50000;
                statsMap[algoId].hit4th++;
            } else if (w.prizeRank === 5) {
                prize = 5000;
                statsMap[algoId].hit5th++;
            }
            statsMap[algoId].totalPrize += prize;
            statsMap[algoId].totalHits++;
            grandTotalPrize += prize;
            grandTotalHits++;
        }
    });

    const algoList = Object.values(statsMap).map(a => {
        const roi = a.cost > 0 ? ((a.totalPrize / a.cost) * 100).toFixed(0) : 0;
        const sharePct = grandTotalPrize > 0 ? ((a.totalPrize / grandTotalPrize) * 100).toFixed(1) : 0;
        return { ...a, roi: Number(roi), sharePct: Number(sharePct) };
    });

    const totalSelectedGamesPerRound = activeAlgos.length * 10 * userMul;
    const grandTotalCost = evaluatedRoundCount * totalSelectedGamesPerRound * 1000;
    const grandRoiGross = grandTotalCost > 0 ? ((grandTotalPrize / grandTotalCost) * 100).toFixed(1) : 0;
    const netProfit = grandTotalPrize - grandTotalCost;

    const bestAlgo = [...algoList].sort((a, b) => b.totalPrize - a.totalPrize)[0];

    if (heroCard) {
        heroCard.innerHTML = `
            <div class="sim-grand-summary-card">
                <div class="sim-grand-header-row">
                    <div class="sim-grand-title-wrap">
                        <span class="sim-grand-badge"><i class="fa-solid fa-trophy"></i> 퀀트 시뮬레이션 완주 성과</span>
                        <h3 class="sim-grand-title">
                            선택된 ${activeAlgos.length}대 알고리즘 총 당첨금 요약
                        </h3>
                    </div>
                    <div class="sim-grand-tags-wrap">
                        <span class="sim-grand-scope-tag"><i class="fa-solid fa-user-check"></i> ${targetTitle}</span>
                        <span class="sim-grand-rounds-tag"><i class="fa-solid fa-calendar"></i> ${startR}~${maxR}회 (${evaluatedRoundCount.toLocaleString()}회차 전수)</span>
                        <span class="sim-grand-games-tag"><i class="fa-solid fa-dice"></i> 회차당 ${totalSelectedGamesPerRound.toLocaleString()}게임</span>
                    </div>
                </div>

                <div class="sim-grand-body-grid">
                    <div class="sim-grand-metric-main">
                        <div class="sim-grand-label">선택 옵션 합산 총 당첨금</div>
                        <div class="sim-grand-prize-hero">${formatKoreanPrize(grandTotalPrize)}</div>
                        <div class="sim-grand-prize-sub">${grandTotalPrize.toLocaleString()} 원 (총 ${grandTotalHits.toLocaleString()}회 적중)</div>
                    </div>
                    <div class="sim-grand-metric-roi">
                        <div class="sim-grand-label">종합 환급 수익률 (ROI)</div>
                        <div class="sim-grand-roi-hero" style="color: ${netProfit >= 0 ? '#34d399' : '#f87171'};">
                            ${grandRoiGross >= 100 ? '+' : ''}${Number(grandRoiGross).toLocaleString()}%
                        </div>
                        <div class="sim-grand-roi-sub">
                            투자 ${formatKoreanPrize(grandTotalCost)} · 순수익 ${netProfit > 0 ? '+' : ''}${formatKoreanPrize(netProfit)}
                        </div>
                    </div>
                    ${bestAlgo ? `
                    <div class="sim-grand-metric-best">
                        <div class="sim-grand-label">최고 실적 알고리즘 1위</div>
                        <div class="sim-grand-best-name" style="color: ${bestAlgo.color};">
                            <i class="fa-solid ${bestAlgo.icon}"></i> ${bestAlgo.shortName}
                        </div>
                        <div class="sim-grand-best-val">
                            ${formatKoreanPrize(bestAlgo.totalPrize)} (점유율 ${bestAlgo.sharePct}%)
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    if (_simAlgoSortMode === 'prize') {
        algoList.sort((a, b) => b.totalPrize - a.totalPrize);
    } else if (_simAlgoSortMode === 'hits') {
        algoList.sort((a, b) => b.totalHits - a.totalHits);
    } else {
        algoList.sort((a, b) => a.order - b.order);
    }

    const cardsHtml = algoList.map(a => {
        const has1st = a.hit1st > 0;
        const has2nd = a.hit2nd > 0;
        const badgeHighlight = has1st 
            ? `<span class="sim-card-jackpot-badge gold"><i class="fa-solid fa-crown"></i> 1등 ${a.hit1st}회 적중!</span>`
            : (has2nd ? `<span class="sim-card-jackpot-badge silver"><i class="fa-solid fa-medal"></i> 2등 ${a.hit2nd}회 적중</span>` : (a.hit3rd > 0 ? `<span class="sim-card-jackpot-badge bronze"><i class="fa-solid fa-award"></i> 3등 ${a.hit3rd}회</span>` : ''));

        return `
            <div class="sim-algo-card" style="border-top: 3px solid ${a.color};">
                <div class="sim-algo-card-head">
                    <div class="sim-algo-id-tag" style="background: ${a.badgeBg}; border: 1px solid ${a.badgeBorder}; color: ${a.color};">
                        <i class="fa-solid ${a.icon}"></i> ${a.name}
                    </div>
                    ${badgeHighlight}
                </div>

                <div class="sim-algo-prize-block">
                    <div class="sim-algo-prize-label">총 당첨금액</div>
                    <div class="sim-algo-prize-val" style="color: ${a.totalPrize > 0 ? '#fde047' : '#94a3b8'};">
                        ${formatKoreanPrize(a.totalPrize)}
                    </div>
                    <div class="sim-algo-prize-raw">${a.totalPrize.toLocaleString()} 원</div>
                </div>

                <div class="sim-algo-share-bar-wrap">
                    <div class="sim-algo-share-labels">
                        <span>전체 당첨금 기여도</span>
                        <strong style="color: ${a.color};">${a.sharePct}%</strong>
                    </div>
                    <div class="sim-algo-progress-track">
                        <div class="sim-algo-progress-fill" style="width: ${Math.min(100, Math.max(2, a.sharePct))}%; background: ${a.color}; box-shadow: 0 0 8px ${a.color};"></div>
                    </div>
                </div>

                <div class="sim-algo-hits-row">
                    <div class="sim-mini-hit ${a.hit1st > 0 ? 'highlight-gold' : ''}">
                        <span class="hit-label">1등</span>
                        <span class="hit-val">${a.hit1st}회</span>
                    </div>
                    <div class="sim-mini-hit ${a.hit2nd > 0 ? 'highlight-blue' : ''}">
                        <span class="hit-label">2등</span>
                        <span class="hit-val">${a.hit2nd}회</span>
                    </div>
                    <div class="sim-mini-hit ${a.hit3rd > 0 ? 'highlight-green' : ''}">
                        <span class="hit-label">3등</span>
                        <span class="hit-val">${a.hit3rd}회</span>
                    </div>
                    <div class="sim-mini-hit">
                        <span class="hit-label">4등</span>
                        <span class="hit-val">${a.hit4th.toLocaleString()}회</span>
                    </div>
                    <div class="sim-mini-hit">
                        <span class="hit-label">5등</span>
                        <span class="hit-val">${a.hit5th.toLocaleString()}회</span>
                    </div>
                </div>

                <div class="sim-algo-card-footer">
                    <div class="sim-algo-invest-info">
                        <span>단독 투자: <strong>${formatKoreanPrize(a.cost)}</strong></span>
                        <span>단독 ROI: <strong style="color: ${a.roi >= 100 ? '#34d399' : '#fbbf24'};">${a.roi >= 100 ? '+' : ''}${Number(a.roi).toLocaleString()}%</strong></span>
                    </div>
                    <div class="sim-algo-total-hits-tag">
                        총 ${a.totalHits.toLocaleString()}회 적중
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
}

/**
 * Execute real historical walk-forward backtesting across all historical draws (1 to 1238)
 */
let _simSoundEnabled = true;
let _simAudioCtx = null;
let _simScanSpeed = 1;
let _simAbortRequested = false;

function getSimAudioContext() {
    if (!_simAudioCtx) {
        const AudioCtxClass = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
        if (AudioCtxClass) _simAudioCtx = new AudioCtxClass();
    }
    if (_simAudioCtx && _simAudioCtx.state === 'suspended') {
        _simAudioCtx.resume();
    }
    return _simAudioCtx;
}

function playSimCoinSound() {
    if (!_simSoundEnabled) return;
    try {
        const ctx = getSimAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    } catch(e) {}
}

function playSimJackpotSound() {
    if (!_simSoundEnabled) return;
    try {
        const ctx = getSimAudioContext();
        if (!ctx) return;
        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            const startTime = ctx.currentTime + (idx * 0.08);
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.14, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.25);
        });
    } catch(e) {}
}

export function toggleSimSound() {
    _simSoundEnabled = !_simSoundEnabled;
    const label = document.getElementById('simSoundLabel');
    const icon = document.getElementById('simSoundIcon');
    if (_simSoundEnabled) {
        if (label) label.innerText = '사운드 ON';
        if (icon) icon.className = 'fa-solid fa-volume-high text-amber-400';
        playSimCoinSound();
    } else {
        if (label) label.innerText = '사운드 OFF';
        if (icon) icon.className = 'fa-solid fa-volume-xmark text-slate-500';
    }
}

export function setSimSpeed(speed, btnEl) {
    _simScanSpeed = Number(speed) || 1;
    document.querySelectorAll('.sim-speed-btn').forEach(b => {
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
    });
    if (btnEl) {
        btnEl.style.background = '#3b82f6';
        btnEl.style.color = '#fff';
    }
}

/**
 * Smoothly centers a target element in the viewport
 * Optimized for Fold 7 cover screens and mobile viewport constraints
 */
export function scrollElementToViewportCenter(el) {
    if (!el) return;
    try {
        if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    } catch(e) {}
    try {
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetY = scrollTop + rect.top - (window.innerHeight / 2) + (rect.height / 2);
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    } catch(e) {}
}

export function stopRealHistoricalSimulation() {
    _simAbortRequested = true;
}

export function fireSimConfetti() {
    const canvas = document.getElementById('simConfettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth || 600;
    canvas.height = canvas.offsetHeight || 300;

    const particles = [];
    const colors = ['#fbbf24', '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#ffffff'];

    for (let i = 0; i < 70; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.7) * 16,
            size: Math.random() * 5 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }

    function renderConfetti() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.4;
            p.vx *= 0.98;
            p.alpha -= 0.018;
            p.rotation += p.rotationSpeed;

            if (p.alpha > 0) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (alive) {
            requestAnimationFrame(renderConfetti);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    renderConfetti();
}

export async function runRealHistoricalSimulation() {
    const cfg = getSelectedSimulationConfig();
    if (!cfg.hasSelection) {
        showToast("시뮬레이션할 알고리즘을 1개 이상 선택해주세요.");
        return;
    }
    _simRoundCombosCache.clear();

    const btn = document.getElementById('btnRunRealSim');
    const progContainer = document.getElementById('simProgressContainer');
    const telemetryCard = document.getElementById('simTelemetryCard');
    const celebrationCard = document.getElementById('simCelebrationTrophyCard');
    const progBar = document.getElementById('simProgressBar');
    const progText = document.getElementById('simProgressText');
    const progCount = document.getElementById('simProgressCount');
    const targetRoundEl = document.getElementById('simHudTargetRound');
    const dateLabelEl = document.getElementById('simHudDateLabel');
    const ballRowEl = document.getElementById('simHudBallRow');
    const feedContainer = document.getElementById('simJackpotFeedContainer');

    const liveC1 = document.getElementById('simLiveCount1st');
    const liveC2 = document.getElementById('simLiveCount2nd');
    const liveC3 = document.getElementById('simLiveCount3rd');
    const liveC4 = document.getElementById('simLiveCount4th');
    const liveC5 = document.getElementById('simLiveCount5th');
    const livePrizeEl = document.getElementById('simLiveTotalPrize');
    const liveRoiEl = document.getElementById('simLiveRoi');

    if (!btn || !progContainer) return;

    btn.style.display = 'none';
    progContainer.style.display = 'block';
    if (telemetryCard) telemetryCard.style.display = 'flex';
    if (celebrationCard) celebrationCard.style.display = 'none';

    // Auto-center simulation status screen smoothly in viewport (Fold 7 / mobile optimization)
    setTimeout(() => {
        const target = telemetryCard || progContainer;
        scrollElementToViewportCenter(target);
    }, 50);

    // Reset live stats
    let live1st = 0, live2nd = 0, live3rd = 0, live4th = 0, live5th = 0, livePrize = 0;
    if (liveC1) liveC1.textContent = '0';
    if (liveC2) liveC2.textContent = '0';
    if (liveC3) liveC3.textContent = '0';
    if (liveC4) liveC4.textContent = '0';
    if (liveC5) liveC5.textContent = '0';
    if (livePrizeEl) livePrizeEl.textContent = '0 원';
    if (liveRoiEl) liveRoiEl.textContent = 'ROI 0.0%';
    if (feedContainer) {
        feedContainer.innerHTML = `
            <div style="text-align: center; padding: 10px 0; font-size: 0.68rem; color: #64748b;">
                🔍 과거 회차 검증 중... 고액 당첨 발생 시 실시간으로 피드가 갱신됩니다.
            </div>
        `;
    }

    _simAbortRequested = false;
    getSimAudioContext();

    const maxRound = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : (state.mergedHistory ? Math.max(...Object.keys(state.mergedHistory).map(Number)) : 1250));
    const startRound = (_simRangeCount > 0) ? Math.max(1, maxRound - _simRangeCount + 1) : 1;
    const totalRangeRounds = Math.max(1, maxRound - startRound + 1);
    const scoreCache = (typeof buildWalkForwardCore3BScoreCache === 'function')
        ? buildWalkForwardCore3BScoreCache(maxRound)
        : null;
    const results = [];
    const coreRoundStats = {
        startRound,
        maxRound,
        evaluatedRounds: 0,
        winningRounds: 0,
        core6HitSum: 0,
        core6Hits3Plus: 0,
        core6Hits6: 0,
        sup10HitSum: 0,
        sup10Hits4Plus: 0,
        sup10Hits6: 0,
        sup6SlotWins: 0,
        pool16HitSum: 0,
        pool16Hits4Plus: 0,
        pool16Hits5Plus: 0,
        pool16Hits6: 0,
        bestCaptureRound: null
    };
    let r = maxRound;

    function getHistoricalDrawData(round) {
        const h = (typeof getSafeActualDraw === 'function') ? (getSafeActualDraw(round) || (state.mergedHistory ? state.mergedHistory[round] : null)) : (state.mergedHistory ? state.mergedHistory[round] : null);
        if (h) {
            return {
                drwNo: round,
                drwNoDate: h.date || h.drwNoDate || '',
                date: h.date || h.drwNoDate || '',
                numbers: h.numbers || [],
                bonus: h.bonus,
                rank1Prize: h.rank1Prize || h.firstWinamnt || (h.prizes && h.prizes[1] && h.prizes[1].prize),
                rank2Prize: h.rank2Prize || (h.prizes && h.prizes[2] && h.prizes[2].prize) || 50000000,
                rank3Prize: h.rank3Prize || (h.prizes && h.prizes[3] && h.prizes[3].prize) || 1500000
            };
        }
        return null;
    }

    const effectiveTarget = getEffectiveTargetUser();
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (window.SafeAuth ? window.SafeAuth.get() : '')) || '';
    const targetTitle = (effectiveTarget === '__ALL__') ? `전체 등록 회원 종합` : (effectiveTarget === authId ? '관리자 본인' : effectiveTarget);

    let hasCleanedFeedPlaceholder = false;

    return new Promise((resolve) => {
        function processChunk() {
            if (_simAbortRequested) {
                finalizeSimulation();
                return;
            }

            const chunkBudgetMs = _simScanSpeed >= 8 ? 34 : (_simScanSpeed >= 3 ? 22 : 14);
            const minBatch = (effectiveTarget === '__ALL__') ? 6 : (_simScanSpeed >= 3 ? 24 : 14);
            const tChunkStart = performance.now();
            let processedInChunk = 0;

            let latestDrawForBalls = null;

            for (; r >= startRound; r--) {
                if (processedInChunk >= minBatch && (performance.now() - tChunkStart) >= chunkBudgetMs) break;
                processedInChunk++;
                const drawData = getHistoricalDrawData(r);
                if (!drawData || !Array.isArray(drawData.numbers) || drawData.numbers.length !== 6) continue;
                latestDrawForBalls = drawData;

                const winningSet = new Set(drawData.numbers);
                const bonusNum = drawData.bonus;

                const simulatedCombos = getCombosForSimulationRound(r, cfg, effectiveTarget, scoreCache);
                let roundWonAny = false;
                let roundPrize = 0;

                // Record Core 6 + Support 10 capture stats for this round
                coreRoundStats.evaluatedRounds++;
                const firstMeta = (simulatedCombos[0] && simulatedCombos[0].coreMeta) ? simulatedCombos[0].coreMeta : null;
                let p16MainCached = 0;
                if (firstMeta) {
                    let c6Main = 0;
                    const t6 = firstMeta.top6 || [];
                    for (let ti = 0; ti < t6.length; ti++) if (winningSet.has(t6[ti])) c6Main++;
                    let s10Main = 0;
                    const s10 = firstMeta.support10 || [];
                    for (let si = 0; si < s10.length; si++) if (winningSet.has(s10[si])) s10Main++;
                    const p16 = firstMeta.pool16 || [];
                    for (let pi = 0; pi < p16.length; pi++) if (winningSet.has(p16[pi])) p16MainCached++;
                    coreRoundStats.core6HitSum += c6Main;
                    if (c6Main >= 3) coreRoundStats.core6Hits3Plus++;
                    if (c6Main === 6) coreRoundStats.core6Hits6++;
                    coreRoundStats.sup10HitSum += s10Main;
                    if (s10Main >= 4) coreRoundStats.sup10Hits4Plus++;
                    if (s10Main === 6) coreRoundStats.sup10Hits6++;
                    coreRoundStats.pool16HitSum += p16MainCached;
                    if (p16MainCached >= 4) coreRoundStats.pool16Hits4Plus++;
                    if (p16MainCached >= 5) coreRoundStats.pool16Hits5Plus++;
                    if (p16MainCached === 6) coreRoundStats.pool16Hits6++;
                }

                for (let ci = 0; ci < simulatedCombos.length; ci++) {
                    const combo = simulatedCombos[ci];
                    const cNums = combo.numbers;
                    if (!cNums || cNums.length !== 6) continue;
                    let realMatchCount = 0;
                    let isBonusMatch = false;
                    for (let ni = 0; ni < 6; ni++) {
                        const val = cNums[ni];
                        if (winningSet.has(val)) realMatchCount++;
                        else if (val === bonusNum) isBonusMatch = true;
                    }
                    if (realMatchCount < 3) continue;

                    let prizeRank = 0;
                    if (realMatchCount === 6) prizeRank = 1;
                    else if (realMatchCount === 5 && isBonusMatch) prizeRank = 2;
                    else if (realMatchCount === 5) prizeRank = 3;
                    else if (realMatchCount === 4) prizeRank = 4;
                    else if (realMatchCount === 3) prizeRank = 5;

                    if (prizeRank > 0) {
                        roundWonAny = true;
                        if (combo.isSup6Slot) coreRoundStats.sup6SlotWins++;
                        results.push({ round: r, combo: combo, prizeRank: prizeRank });

                        if (prizeRank === 1) {
                            live1st++;
                            const p1Prize = drawData.rank1Prize || 2000000000;
                            livePrize += p1Prize;
                            roundPrize += p1Prize;
                            handleJackpotHit(r, 1, p1Prize, combo);
                        } else if (prizeRank === 2) {
                            live2nd++;
                            const p2Prize = drawData.rank2Prize || 50000000;
                            livePrize += p2Prize;
                            roundPrize += p2Prize;
                            handleJackpotHit(r, 2, p2Prize, combo);
                        } else if (prizeRank === 3) {
                            live3rd++;
                            const p3Prize = drawData.rank3Prize || 1500000;
                            livePrize += p3Prize;
                            roundPrize += p3Prize;
                            handleJackpotHit(r, 3, p3Prize, combo);
                        } else if (prizeRank === 4) {
                            live4th++;
                            livePrize += 50000;
                            roundPrize += 50000;
                        } else if (prizeRank === 5) {
                            live5th++;
                            livePrize += 5000;
                            roundPrize += 5000;
                        }
                    }
                }

                if (roundWonAny) coreRoundStats.winningRounds++;
                if (firstMeta) {
                    const prevBest = coreRoundStats.bestCaptureRound;
                    if (!prevBest || p16MainCached > prevBest.p16Main || (p16MainCached === prevBest.p16Main && roundPrize > prevBest.prize)) {
                        coreRoundStats.bestCaptureRound = { round: r, p16Main: p16MainCached, prize: roundPrize };
                    }
                }
            }

            // Update HUD Counters
            const processed = maxRound - r;
            const pct = Math.min(100, Math.round((processed / totalRangeRounds) * 100));
            if (progBar) progBar.style.width = `${pct}%`;
            if (progText) progText.innerHTML = `<i class="fa-solid fa-microchip"></i> ${startRound}~${maxRound}회 [${targetTitle}] 핵심·보조 코어 백테스팅 중... <strong style="color:#fff;">${pct}%</strong>`;
            if (progCount) progCount.textContent = `${processed.toLocaleString()} / ${totalRangeRounds.toLocaleString()} 회차`;

            if (targetRoundEl) targetRoundEl.textContent = `제 ${Math.max(startRound, r).toLocaleString()}회차 대조 중`;
            if (dateLabelEl && latestDrawForBalls) {
                dateLabelEl.textContent = `추첨일: ${latestDrawForBalls.date || latestDrawForBalls.drwNoDate || ''} (현행 코어 16수 공식 적용)`;
            }

            if (liveC1) liveC1.textContent = live1st;
            if (liveC2) liveC2.textContent = live2nd;
            if (liveC3) liveC3.textContent = live3rd;
            if (liveC4) liveC4.textContent = live4th.toLocaleString();
            if (liveC5) liveC5.textContent = live5th.toLocaleString();

            const prizeFmt = (livePrize >= 100000000) 
                ? `${(livePrize / 100000000).toFixed(1)}억 원`
                : `${livePrize.toLocaleString()} 원`;
            if (livePrizeEl) livePrizeEl.textContent = prizeFmt;

            const gamesPerR = ((cfg.includeV4 ? 10 : 0) + (cfg.includeV3 ? 10 : 0) + cfg.selectedExtraPacks.length * 10);
            const userMul = (effectiveTarget === '__ALL__') ? ((state.allRegisteredUsersList && state.allRegisteredUsersList.length) || 1) : 1;
            const totalInvested = processed * gamesPerR * userMul * 1000;
            const currentRoi = totalInvested > 0 ? ((livePrize / totalInvested) * 100).toFixed(0) : 0;
            if (liveRoiEl) liveRoiEl.textContent = `ROI +${Number(currentRoi).toLocaleString()}%`;

            // Update mini ball row with latest draw
            if (ballRowEl && latestDrawForBalls && Array.isArray(latestDrawForBalls.numbers)) {
                ballRowEl.innerHTML = latestDrawForBalls.numbers.slice(0, 6).map(n => {
                    const bg = getBallHexColor(n);
                    const textColor = n <= 10 ? '#0f172a' : '#ffffff';
                    return `<span style="width: 20px; height: 20px; border-radius: 50%; background: ${bg}; color: ${textColor}; font-size: 0.65rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; font-family: monospace;">${n}</span>`;
                }).join('');
            }

            if (r % 6 === 0) {
                playSimCoinSound();
            }

            if (r >= startRound) {
                if (_simScanSpeed >= 8) {
                    setTimeout(processChunk, 0);
                } else {
                    requestAnimationFrame(processChunk);
                }
            } else {
                finalizeSimulation();
            }
        }

        function handleJackpotHit(round, rank, prize, combo) {
            if (rank <= 2) {
                playSimJackpotSound();
                if (telemetryCard) {
                    telemetryCard.classList.add('sim-jackpot-flash');
                    setTimeout(() => telemetryCard.classList.remove('sim-jackpot-flash'), 1000);
                }
            } else {
                playSimCoinSound();
            }

            if (feedContainer) {
                if (!hasCleanedFeedPlaceholder) {
                    feedContainer.innerHTML = '';
                    hasCleanedFeedPlaceholder = true;
                }
                const comboName = (combo && combo.meta && combo.meta.name) ? combo.meta.name : (combo ? combo.name : '추천 알고리즘');
                const owner = (combo && combo.meta && combo.meta.ownerName) ? combo.meta.ownerName : '';
                const rankName = rank === 1 ? '🥇 1등 (6개 일치!)' : (rank === 2 ? '🥈 2등 (5+보 일치!)' : '🥉 3등 (5개 일치!)');
                const badgeStyle = rank === 1 
                    ? 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);' 
                    : (rank === 2 ? 'background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);' : 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);');
                const prizeTxt = (prize >= 100000000) ? `${(prize / 100000000).toFixed(1)}억 원` : `${(prize / 10000).toLocaleString()}만 원`;

                const itemHtml = `
                    <div class="sim-feed-anim" style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 6px; background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.06); font-size: 0.70rem;">
                        <div style="display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            <span style="padding: 1px 5px; border-radius: 4px; font-weight: 900; font-size: 0.65rem; ${badgeStyle}">${rankName}</span>
                            <strong style="color: #f8fafc;">제 ${round}회</strong>
                            <span style="color: #94a3b8; font-size: 0.66rem;">(${comboName}${owner ? ` · ${owner}` : ''})</span>
                        </div>
                        <span style="color: #fde047; font-weight: 900; font-family: monospace; flex-shrink: 0; margin-left: 6px;">+${prizeTxt}</span>
                    </div>
                `;
                feedContainer.insertAdjacentHTML('afterbegin', itemHtml);
            }
        }

        function finalizeSimulation() {
            const cfgKey = getSimCfgKey(effectiveTarget, cfg);
            liveSimCacheMap[cfgKey] = results;
            liveSimCoreStatsMap[cfgKey] = coreRoundStats;
            realSimCache = results;
            try {
                sessionStorage.setItem(`sim_cache_history_${cfgKey}`, JSON.stringify(results));
            } catch(e) {}

            playSimJackpotSound();
            fireSimConfetti();

            if (progText) progText.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> 백테스팅 완료!`;
            
            // Show Trophy Card
            if (telemetryCard) telemetryCard.style.display = 'none';
            if (celebrationCard) {
                celebrationCard.style.display = 'block';
                // Auto-center celebration trophy card smoothly in viewport (Fold 7 / mobile optimization)
                setTimeout(() => {
                    scrollElementToViewportCenter(celebrationCard);
                }, 50);
                const trophyTitle = document.getElementById('simTrophyTitle');
                const trophyDesc = document.getElementById('simTrophyDesc');
                const tHit1 = document.getElementById('trophyHit1st');
                const tHit2 = document.getElementById('trophyHit2nd');
                const tHit3 = document.getElementById('trophyHit3rd');
                const tRoi = document.getElementById('trophyRoi');

                if (trophyTitle) trophyTitle.innerText = `🎉 [${targetTitle}] ${startRound}~${maxRound}회 완주 성공!`;
                if (trophyDesc) trophyDesc.innerHTML = `현행 핵심·보조 코어 공식으로 ${totalRangeRounds.toLocaleString()}회차 대조 결과, 총 <strong style="color:#fbbf24;">${results.length.toLocaleString()}건</strong>의 당첨(16수 풀 4+포착 ${coreRoundStats.pool16Hits4Plus}회)을 기록했습니다!`;
                if (tHit1) tHit1.innerText = `${live1st}회`;
                if (tHit2) tHit2.innerText = `${live2nd}회`;
                if (tHit3) tHit3.innerText = `${live3rd}회`;

                const gamesPerR = ((cfg.includeV4 ? 10 : 0) + (cfg.includeV3 ? 10 : 0) + cfg.selectedExtraPacks.length * 10);
                const userMul = (effectiveTarget === '__ALL__') ? ((state.allRegisteredUsersList && state.allRegisteredUsersList.length) || 1) : 1;
                const totalInvested = totalRangeRounds * gamesPerR * userMul * 1000;
                const finalRoiVal = totalInvested > 0 ? ((livePrize / totalInvested) * 100).toFixed(0) : 0;
                if (tRoi) tRoi.innerText = `+${Number(finalRoiVal).toLocaleString()}%`;
            }

            if (btn) {
                btn.style.display = 'flex';
                btn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> ${startRound}~${maxRound}회 [${targetTitle}] 리얼 백테스팅 다시 실행`;
            }

            const sel = document.getElementById('simRoundSelector');
            const targetRound = sel && sel.value ? parseInt(sel.value) : null;
            renderSimulationTab(targetRound);
            showToast(`🎉 [${targetTitle}] ${startRound}~${maxRound}회 코어 백테스팅 완료! (총 ${results.length}회 적중)`);
            resolve(results);
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

    const chkSimE1 = document.getElementById('chkSimExtraPack1');
    if (chkSimE1) chkSimE1.addEventListener('change', handleConfigChange);
}

export function openSlimRoundPickerForSimulation() {
    if (typeof window.openSlimRoundPickerModal === 'function') {
        const sel = document.getElementById('simRoundSelector');
        const curRound = sel && sel.value ? parseInt(sel.value) : (state.latestRoundNum || 1243);
        const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1243);
        window.openSlimRoundPickerModal({
            title: '시뮬레이션 대조 회차 선택',
            subtitle: '과거 추천 알고리즘과 실제 당첨 결과를 검증할 회차를 선택하세요.',
            selectedRound: curRound,
            minRound: 1,
            maxRound: maxR,
            includeAllRounds: false,
            onSelect: (roundNum) => {
                const r = parseInt(roundNum);
                if (sel) {
                    sel.value = r;
                    sel.dispatchEvent(new Event('change'));
                }
                const label = document.getElementById('simRoundDisplayLabel');
                if (label) label.innerText = `제 ${r}회차`;
                if (typeof renderSimulationTab === 'function') {
                    renderSimulationTab(r);
                }
            }
        });
    }
}

export function openSlimMemberPickerForSimulation() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || '';
    const cleanAuth = String(authId || '').toLowerCase().trim();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)) || (typeof window !== 'undefined' && window.isAdminUser && window.isAdminUser(cleanAuth)));
    if (!isAdmin) return;

    if (typeof window.openSlimMemberPickerModal === 'function') {
        const effectiveTarget = getEffectiveTargetUser();
        window.openSlimMemberPickerModal({
            title: '시뮬레이션 대상 회원 선택',
            subtitle: '백테스팅을 실행할 대상 회원의 고유 시드를 선택하세요.',
            selectedUserId: (effectiveTarget === '__ALL__') ? 'all' : effectiveTarget,
            includeAll: true,
            onSelect: (user) => {
                const uId = (typeof user === 'string') ? user : (user.id || user.userId || '__ALL__');
                const finalId = (uId === 'all') ? '__ALL__' : uId;
                if (window.changeSimAdminViewingUser) {
                    window.changeSimAdminViewingUser(finalId);
                }
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.renderSimulationTab = renderSimulationTab;
    window.runRealHistoricalSimulation = runRealHistoricalSimulation;
    window.setupSimulationEvents = setupSimulationEvents;
    window.selectAllSimAlgos = selectAllSimAlgos;
    window.setSimRangeCount = setSimRangeCount;
    window.openSlimRoundPickerForSimulation = openSlimRoundPickerForSimulation;
    window.openSlimMemberPickerForSimulation = openSlimMemberPickerForSimulation;
    window.toggleSimSound = toggleSimSound;
    window.setSimSpeed = setSimSpeed;
    window.stopRealHistoricalSimulation = stopRealHistoricalSimulation;
    window.fireSimConfetti = fireSimConfetti;
    window.switchSimResultViewMode = switchSimResultViewMode;
    window.setSimAlgoSortMode = setSimAlgoSortMode;
    window.renderAlgorithmPrizeTotals = renderAlgorithmPrizeTotals;
    window.formatKoreanPrize = formatKoreanPrize;
    window.changeSimAdminViewingUser = function(val) {
        state.simAdminTargetUserId = val;
        const userLabelEl = document.getElementById('simUserDisplayLabel');
        if (userLabelEl) {
            if (val === '__ALL__' || val === 'all') {
                userLabelEl.innerText = '👥 [전체] 등록 회원 종합';
            } else {
                let uName = val;
                if (Array.isArray(state.allRegisteredUsersList)) {
                    const f = state.allRegisteredUsersList.find(u => (u.id || '').toLowerCase() === val.toLowerCase());
                    if (f) uName = `${f.name || f.realName || f.id} (${f.id})`;
                }
                userLabelEl.innerText = `👤 ${uName}`;
            }
        }
        const sel = document.getElementById('simRoundSelector');
        const targetRound = sel && sel.value ? parseInt(sel.value) : null;
        renderSimulationTab(targetRound);
    };
}

