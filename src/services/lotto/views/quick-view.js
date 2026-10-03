import { state } from '../state.js';
import { getBallHexColor, getBallColorClass, showToast } from '../../../shared/utils.js';
import { SafeAuth, isAdminUser, getUpcomingLottoRound } from '../../../shared/auth-mgmt.js';
import { getComboNumbers, isUserEligibleForExtraPacks } from '../ledger.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack, getEffectiveGeneratorUserId } from '../generator.js';

let currentQuickAlgo = 'v4'; // 'v3', 'v4', 'extra_1'...'extra_5', or 'all'
let quickViewWakeLock = null;
let isWakeLockUserDisabled = false;
let currentSlipPage = 1;
const markedComboKeys = new Set();

/**
 * Switch Slip Page in Quick View (1 = 1장, 2 = 2장...)
 */
export function switchQuickViewSlipPage(page) {
    const quickData = getQuickCombos(currentQuickAlgo);
    const totalCombos = (quickData && quickData.combos) ? quickData.combos.length : 10;
    const totalPages = Math.max(1, Math.ceil(totalCombos / 5));

    let targetPage = page;
    if (targetPage < 1) targetPage = 1;
    if (targetPage > totalPages) targetPage = totalPages;

    currentSlipPage = targetPage;
    renderQuickViewContent();
}

/**
 * Toggle Marking State for a combination row (Option 3 touch-to-mark)
 */
export function toggleQuickViewMarkCombo(markKey) {
    if (markedComboKeys.has(markKey)) {
        markedComboKeys.delete(markKey);
    } else {
        markedComboKeys.add(markKey);
    }
    renderQuickViewContent();
}

/**
 * Reset all marked checks in Quick View
 */
export function resetQuickViewMarks() {
    markedComboKeys.clear();
    renderQuickViewContent();
    if (typeof showToast === 'function') {
        showToast('🔄 마킹 체크가 초기화되었습니다.');
    }
}

/**
 * Acquire Screen Wake Lock to prevent mobile screen from sleeping during quick view
 */
export async function acquireQuickViewWakeLock() {
    if (isWakeLockUserDisabled) {
        updateWakeLockUI(false);
        return;
    }

    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || typeof navigator.wakeLock.request !== 'function') {
        updateWakeLockUI(false, true);
        return;
    }

    try {
        if (quickViewWakeLock && !quickViewWakeLock.released) {
            updateWakeLockUI(true);
            return;
        }

        quickViewWakeLock = await navigator.wakeLock.request('screen');
        quickViewWakeLock.addEventListener('release', () => {
            quickViewWakeLock = null;
            const modal = document.getElementById('compactViewModal');
            if (!modal || modal.style.display === 'none' || !modal.classList.contains('active')) {
                updateWakeLockUI(false);
            }
        });
        updateWakeLockUI(true);
    } catch (err) {
        console.warn('[QuickView] Screen wake lock request failed or denied:', err);
        quickViewWakeLock = null;
        updateWakeLockUI(false);
    }
}

/**
 * Release Screen Wake Lock to restore standard device power saving
 */
export function releaseQuickViewWakeLock() {
    if (quickViewWakeLock) {
        try {
            quickViewWakeLock.release().catch(() => {});
        } catch (e) {
            // ignore
        }
        quickViewWakeLock = null;
    }
    updateWakeLockUI(false);
}

/**
 * Toggle Screen Wake Lock manually from the UI badge
 */
export async function toggleQuickViewWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || typeof navigator.wakeLock.request !== 'function') {
        showToast('⚠️ 현재 브라우저는 화면 항상 켜기 기능을 지원하지 않습니다.');
        updateWakeLockUI(false, true);
        return;
    }

    if (quickViewWakeLock && !quickViewWakeLock.released) {
        isWakeLockUserDisabled = true;
        releaseQuickViewWakeLock();
        showToast('🌙 화면 꺼짐 방지가 해제되었습니다.');
    } else {
        isWakeLockUserDisabled = false;
        await acquireQuickViewWakeLock();
        if (quickViewWakeLock && !quickViewWakeLock.released) {
            showToast('☀️ 화면 켜짐 유지(꺼짐 방지)가 활성화되었습니다.');
        } else {
            showToast('⚠️ 화면 켜짐 유지 요청이 거부되었거나 지원되지 않습니다.');
        }
    }
}

/**
 * Update UI Indicator for Screen Wake Lock
 */
export function updateWakeLockUI(isActive, notSupported = false) {
    const btn = document.getElementById('btnToggleWakeLock');
    if (!btn) return;

    if (notSupported) {
        btn.style.display = 'none';
        return;
    }

    btn.style.display = 'inline-flex';
    if (isActive) {
        btn.style.background = 'rgba(16, 185, 129, 0.15)';
        btn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        btn.style.color = '#34d399';
        btn.title = '화면 꺼짐 방지 활성화됨 (클릭 시 끄기)';
        btn.innerHTML = `<i class="fa-solid fa-sun" style="font-size: 0.78rem;"></i> <span id="quickViewWakeLockText">화면 켜짐 유지</span>`;
    } else {
        btn.style.background = 'rgba(100, 116, 139, 0.15)';
        btn.style.borderColor = 'rgba(100, 116, 139, 0.3)';
        btn.style.color = '#94a3b8';
        btn.title = '화면 꺼짐 방지 해제됨 (클릭 시 켜기)';
        btn.innerHTML = `<i class="fa-regular fa-moon" style="font-size: 0.78rem;"></i> <span id="quickViewWakeLockText">화면 켜짐 꺼짐</span>`;
    }
}

/**
 * Check if the effective user is eligible for extra booster packs in quick view
 */
export function checkQuickViewExtraPackEligibility(userId = null, targetRound = null) {
    const effectiveUserId = userId || getEffectiveGeneratorUserId();
    const curRound = targetRound || (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243))));
    
    if (typeof isUserEligibleForExtraPacks === 'function') {
        return isUserEligibleForExtraPacks(effectiveUserId, curRound);
    }
    if (typeof window !== 'undefined' && typeof window.isUserEligibleForExtraPacks === 'function') {
        return window.isUserEligibleForExtraPacks(effectiveUserId, curRound);
    }
    return false;
}

/**
 * Fetch combinations based on selected algorithm (v3.0 / v4.0 / extra_1~5 / all)
 * Strictly synchronized with the main screen generator and personalized for user/round.
 * Non-purchased users are protected from viewing extra 1~5 booster packs.
 */
export function getQuickCombos(algo = currentQuickAlgo, customUserId = null) {
    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);

    const targetRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243))));

    const isEligible = checkQuickViewExtraPackEligibility(effectiveUserId, targetRound);
    const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const isV3Valid = (state.fixedTop5Combinations_v3 && state.fixedTop5Combinations_v3.length === 10 &&
        state.fixedTop5Combinations_v3_userId === effectiveUserId && state.fixedTop5Combinations_v3_round === targetRound);
    const isV4Valid = (state.fixedTop5Combinations_v4 && state.fixedTop5Combinations_v4.length === 10 &&
        state.fixedTop5Combinations_v4_userId === effectiveUserId && state.fixedTop5Combinations_v4_round === targetRound);

    if (algo === 'v3') {
        const v3Combos = isV3Valid
            ? state.fixedTop5Combinations_v3
            : (computeAbsoluteTop10Combinations(false, targetRound, 'v3', true, effectiveUserId) || []);
        return {
            versionLabel: '기본 2: 수학 퀀트 팩',
            badgeColor: '#3b82f6',
            combos: v3Combos.map((c, i) => ({ ...c, customLabel: `수학퀀트-${alphabet[i] || (i + 1)}` })),
            effectiveUserId,
            targetRound,
            isLocked: false
        };
    } else if (algo === 'v4') {
        const v4Combos = isV4Valid
            ? state.fixedTop5Combinations_v4
            : (computeAbsoluteTop10Combinations(false, targetRound, 'v4', true, effectiveUserId) || []);
        return {
            versionLabel: '기본 1: 올라운더 팩',
            badgeColor: '#10b981',
            combos: v4Combos.map((c, i) => ({ ...c, customLabel: `올라운더-${alphabet[i] || (i + 1)}` })),
            effectiveUserId,
            targetRound,
            isLocked: false
        };
    } else if (typeof algo === 'string' && algo.startsWith('extra_')) {
        const packId = parseInt(algo.replace('extra_', ''), 10);
        if (!isEligible) {
            return {
                versionLabel: `추가 ${packId} (실구매 잠김)`,
                badgeColor: '#64748b',
                combos: [],
                isLocked: true,
                lockedPackId: packId,
                effectiveUserId,
                targetRound
            };
        }
        const pack = generateExtraAddonPack(packId, targetRound, effectiveUserId);
        return {
            versionLabel: pack.name || `추가팩 ${packId}`,
            badgeColor: pack.color || '#10b981',
            combos: (pack.combos || []).map((c, i) => ({
                ...c,
                customLabel: `${pack.shortName || ('추가' + packId)}-${alphabet[i] || (i + 1)}`
            })),
            effectiveUserId,
            targetRound,
            isLocked: false
        };
    } else {
        // 'all' -> Combines V3 + V4 (+ all active Extra Packs if eligible)
        const v3Combos = isV3Valid
            ? state.fixedTop5Combinations_v3
            : (computeAbsoluteTop10Combinations(false, targetRound, 'v3', true, effectiveUserId) || []);
        const v4Combos = isV4Valid
            ? state.fixedTop5Combinations_v4
            : (computeAbsoluteTop10Combinations(false, targetRound, 'v4', true, effectiveUserId) || []);

        const allCombos = [
            ...v3Combos.map((c, i) => ({ ...c, customLabel: `수학퀀트-${alphabet[i] || (i + 1)}`, groupTag: '기본 2: 수학 퀀트 팩 (10조합)' })),
            ...v4Combos.map((c, i) => ({ ...c, customLabel: `올라운더-${alphabet[i] || (i + 1)}`, groupTag: '기본 1: 올라운더 팩 (10조합)' }))
        ];

        // Include all 5 Booster Add-on packs ONLY if eligible
        if (isEligible) {
            for (let pId = 1; pId <= 5; pId++) {
                const pack = generateExtraAddonPack(pId, targetRound, effectiveUserId);
                if (pack && Array.isArray(pack.combos) && pack.combos.length > 0) {
                    pack.combos.forEach((c, i) => {
                        allCombos.push({
                            ...c,
                            customLabel: `${pack.shortName || '추가' + pId}-${alphabet[i] || (i + 1)}`,
                            groupTag: `${pack.name || '추가팩 ' + pId} (10조합)`
                        });
                    });
                }
            }
        }

        return { 
            versionLabel: isEligible ? `전체 통합 (${allCombos.length}조합)` : `기본 통합 (${allCombos.length}조합)`,
            badgeColor: '#fbbf24',
            combos: allCombos,
            effectiveUserId,
            targetRound,
            isLocked: false
        };
    }
}

/**
 * Open Quick View Modal
 */
export function openCompactView(algo = null) {
    const compactViewModal = document.getElementById('compactViewModal');
    if (!compactViewModal) {
        console.error('[QuickView] #compactViewModal element not found');
        return;
    }

    const effectiveUserId = getEffectiveGeneratorUserId();
    const targetRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243))));
    const isEligible = checkQuickViewExtraPackEligibility(effectiveUserId, targetRound);

    if (algo) {
        if (!isEligible && algo.startsWith('extra_')) {
            currentQuickAlgo = 'v4';
        } else {
            currentQuickAlgo = algo;
        }
    } else {
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        if (chkReportLogic) {
            currentQuickAlgo = chkReportLogic.checked ? 'v4' : 'v3';
        } else {
            const pref = localStorage.getItem('lotto_pref_v4');
            currentQuickAlgo = (pref === 'false') ? 'v3' : 'v4';
        }
    }

    if (!isEligible && currentQuickAlgo.startsWith('extra_')) {
        currentQuickAlgo = 'v4';
    }

    currentSlipPage = 1;
    updateQuickViewAlgoButtons();
    renderQuickViewContent();

    compactViewModal.style.display = 'flex';
    compactViewModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Request Screen Wake Lock so mobile screen stays awake during paper marking
    isWakeLockUserDisabled = false;
    acquireQuickViewWakeLock();
}

/**
 * Close Quick View Modal
 */
export function closeCompactView() {
    const compactViewModal = document.getElementById('compactViewModal');
    if (compactViewModal) {
        compactViewModal.style.display = 'none';
        compactViewModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    // Release Screen Wake Lock to restore standard power saving
    releaseQuickViewWakeLock();
}

/**
 * Switch Algorithm in Quick View (v3, v4, extra_1~5, all)
 */
export function switchQuickViewAlgo(algo) {
    const effectiveUserId = getEffectiveGeneratorUserId();
    const targetRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243))));
    const isEligible = checkQuickViewExtraPackEligibility(effectiveUserId, targetRound);

    if (!isEligible && algo.startsWith('extra_')) {
        const pId = algo.replace('extra_', '');
        const wantRegister = confirm(`🔒 [실구매 인증 회원 전용 혜택]\n\n추가 ${pId}팩(10게임)을 포함한 추가 5팩(50게임)은 매주 5게임 이상 실구매 영수증(QR)을 등록하신 회원님께 100% 무료로 제공됩니다.\n\n(실구매 미등록 회원은 기본 20게임(V4.0 + V3.0)이 상시 무료 제공됩니다.)\n\n지금 실구매 영수증(QR)을 등록하시겠습니까?`);
        if (wantRegister) {
            closeCompactView();
            if (typeof window.openManualLedgerModal === 'function') {
                window.openManualLedgerModal();
            } else if (typeof window.switchLottoTab === 'function') {
                window.switchLottoTab('tab-confirmed-list');
            }
        }
        return;
    }

    currentQuickAlgo = algo;
    currentSlipPage = 1;
    updateQuickViewAlgoButtons();
    renderQuickViewContent();

    let label = '추천번호';
    if (algo === 'v3') label = 'V3.0 하이브리드 (10조합)';
    else if (algo === 'v4') label = 'V4.0 행동경제학 (10조합)';
    else if (algo === 'all') label = isEligible ? '전체 통합 조합 (70조합)' : '기본 통합 조합 (20조합)';
    else if (algo.startsWith('extra_')) {
        const pId = algo.replace('extra_', '');
        label = `추가팩 ${pId} (10조합)`;
    }
    showToast(`✅ [${label}] 보기로 전환되었습니다.`);
}

/**
 * Dynamically Render Algorithm Selector Buttons Including All Active Extra Packs
 */
export function updateQuickViewAlgoButtons() {
    const container = document.getElementById('quickViewAlgoSelectorContainer');
    if (!container) return;

    const effectiveUserId = getEffectiveGeneratorUserId();
    const targetRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243))));
    const isEligible = checkQuickViewExtraPackEligibility(effectiveUserId, targetRound);

    const totalGames = isEligible ? 70 : 20;

    let buttonsHtml = `
        <button type="button" onclick="window.switchQuickViewAlgo('v3')" class="quick-algo-btn ${currentQuickAlgo === 'v3' ? 'active' : ''}" style="flex: 1 1 70px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${currentQuickAlgo === 'v3' ? '#fbbf24' : 'rgba(255,255,255,0.08)'}; background: ${currentQuickAlgo === 'v3' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(30,41,59,0.6)'}; color: ${currentQuickAlgo === 'v3' ? '#fff' : '#94a3b8'}; font-weight: ${currentQuickAlgo === 'v3' ? '800' : '600'};">
            <i class="fa-solid fa-bolt"></i> V3.0 (10)
        </button>
        <button type="button" onclick="window.switchQuickViewAlgo('v4')" class="quick-algo-btn ${currentQuickAlgo === 'v4' ? 'active' : ''}" style="flex: 1 1 70px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${currentQuickAlgo === 'v4' ? '#fbbf24' : 'rgba(255,255,255,0.08)'}; background: ${currentQuickAlgo === 'v4' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(30,41,59,0.6)'}; color: ${currentQuickAlgo === 'v4' ? '#fff' : '#94a3b8'}; font-weight: ${currentQuickAlgo === 'v4' ? '800' : '600'};">
            <i class="fa-solid fa-brain"></i> V4.0 (10)
        </button>
    `;

    // Dynamic Extra Pack Buttons
    for (let pId = 1; pId <= 5; pId++) {
        const packKey = `extra_${pId}`;
        const isActive = currentQuickAlgo === packKey;
        const color = pId === 1 ? '#10b981' : pId === 2 ? '#f59e0b' : pId === 3 ? '#ec4899' : pId === 4 ? '#8b5cf6' : '#06b6d4';

        if (isEligible) {
            buttonsHtml += `
                <button type="button" onclick="window.switchQuickViewAlgo('${packKey}')" class="quick-algo-btn ${isActive ? 'active' : ''}" style="flex: 1 1 75px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}; background: ${isActive ? `linear-gradient(135deg, ${color}, #059669)` : 'rgba(30,41,59,0.6)'}; color: ${isActive ? '#fff' : '#cbd5e1'}; font-weight: ${isActive ? '800' : '600'};">
                    <i class="fa-solid fa-rocket"></i> 추가 ${pId} (10)
                </button>
            `;
        } else {
            buttonsHtml += `
                <button type="button" onclick="window.switchQuickViewAlgo('${packKey}')" class="quick-algo-btn locked" title="🔒 실구매 5게임 인증 시 잠금 해제" style="flex: 1 1 75px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px dashed rgba(251, 191, 36, 0.4); background: rgba(15, 23, 42, 0.7); color: #94a3b8; font-weight: 600;">
                    <i class="fa-solid fa-lock" style="color: #fbbf24; font-size: 0.68rem;"></i> 추가 ${pId}
                </button>
            `;
        }
    }

    // All Combined Button
    const isAllActive = currentQuickAlgo === 'all';
    const allBtnLabel = isEligible ? `전체 (${totalGames})` : `전체 (${totalGames})`;
    buttonsHtml += `
        <button type="button" onclick="window.switchQuickViewAlgo('all')" class="quick-algo-btn ${isAllActive ? 'active' : ''}" style="flex: 1 1 85px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${isAllActive ? '#fbbf24' : 'rgba(255,255,255,0.08)'}; background: ${isAllActive ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'rgba(30,41,59,0.6)'}; color: ${isAllActive ? '#0f172a' : '#cbd5e1'}; font-weight: ${isAllActive ? '800' : '600'};">
            <i class="fa-solid fa-layer-group"></i> ${allBtnLabel}
        </button>
    `;

    container.innerHTML = buttonsHtml;
}

/**
 * Render Modal Content based on Current Algorithm and 5-Combo Slip Pagination
 */
export function renderQuickViewContent() {
    const quickData = getQuickCombos(currentQuickAlgo);
    const { versionLabel, combos, badgeColor, effectiveUserId, targetRound, isLocked } = quickData;

    const markingGrid = document.getElementById('compactMarkingGrid');
    const titleSub = document.getElementById('quickViewSubTitle');
    const slipNav = document.getElementById('quickViewSlipNav');
    const slipGuidance = document.getElementById('quickViewSlipGuidance');
    const slipBottomAction = document.getElementById('quickViewSlipBottomAction');

    if (isLocked) {
        if (slipNav) slipNav.innerHTML = '';
        if (slipGuidance) slipGuidance.innerHTML = '';
        if (slipBottomAction) slipBottomAction.innerHTML = '';
        if (markingGrid) {
            markingGrid.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%); border: 1.5px solid rgba(251, 191, 36, 0.4); border-radius: 12px; margin: 12px 0;">
                    <div style="width: 48px; height: 48px; margin: 0 auto 12px; border-radius: 50%; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.5); display: flex; align-items: center; justify-content: center; color: #fbbf24; font-size: 1.4rem;">
                        <i class="fa-solid fa-lock"></i>
                    </div>
                    <div style="font-size: 1rem; font-weight: 800; color: #f8fafc; margin-bottom: 6px;">
                        🔒 실구매 인증 정회원 전용 [추가 5팩]
                    </div>
                    <p style="color: #cbd5e1; font-size: 0.82rem; line-height: 1.6; margin-bottom: 18px; max-width: 420px; margin-left: auto; margin-right: auto;">
                        기본 20게임(V4.0 + V3.0)은 상시 무료로 열람 가능하며,<br>
                        <strong style="color: #fbbf24;">추가 1~5팩(50게임)</strong>은 매주 5게임 이상 실구매 영수증(QR)을 등록하신 정회원님께 즉시 무료로 잠금 해제됩니다.
                    </p>
                    <button type="button" onclick="closeCompactView(); if(window.openManualLedgerModal) window.openManualLedgerModal(); else if(window.switchLottoTab) window.switchLottoTab('tab-confirmed-list');" style="background: linear-gradient(135deg, #fbbf24 0%, #d97706 100%); color: #0f172a; font-weight: 900; font-size: 0.85rem; padding: 10px 20px; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35); display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-qrcode"></i> 실구매 영수증(5게임) 등록하고 잠금 해제
                    </button>
                </div>
            `;
        }
        if (titleSub) {
            titleSub.innerHTML = `<span style="color: #fbbf24; font-weight: 800;">[${(effectiveUserId || 'guest').toUpperCase()}] 회원</span> · 제 <strong>${targetRound}</strong>회차 · <span style="color: #f59e0b; font-weight: 800;">🔒 실구매 미등록 잠김</span>`;
        }
        return;
    }

    const totalCombos = combos ? combos.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalCombos / 5));

    if (currentSlipPage > totalPages) currentSlipPage = 1;
    if (currentSlipPage < 1) currentSlipPage = 1;

    const startIdx = (currentSlipPage - 1) * 5;
    const pageCombos = combos.slice(startIdx, startIdx + 5);

    // 1. Slip Navigation Tabs Render
    if (slipNav) {
        if (totalPages === 2) {
            slipNav.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
                    <div style="display: flex; gap: 4px; background: rgba(0,0,0,0.35); padding: 3px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.08); flex: 1;">
                        <button type="button" onclick="window.switchQuickViewSlipPage(1)" style="flex: 1; padding: 7px 4px; font-size: 0.77rem; font-weight: ${currentSlipPage === 1 ? '800' : '600'}; border-radius: 7px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all 0.2s; background: ${currentSlipPage === 1 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent'}; color: ${currentSlipPage === 1 ? '#0f172a' : '#94a3b8'}; box-shadow: ${currentSlipPage === 1 ? '0 2px 6px rgba(245,158,11,0.35)' : 'none'};">
                            <i class="fa-solid fa-file-lines"></i> 📄 제 1장 (A~E)
                        </button>
                        <button type="button" onclick="window.switchQuickViewSlipPage(2)" style="flex: 1; padding: 7px 4px; font-size: 0.77rem; font-weight: ${currentSlipPage === 2 ? '800' : '600'}; border-radius: 7px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all 0.2s; background: ${currentSlipPage === 2 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'transparent'}; color: ${currentSlipPage === 2 ? '#0f172a' : '#94a3b8'}; box-shadow: ${currentSlipPage === 2 ? '0 2px 6px rgba(245,158,11,0.35)' : 'none'};">
                            <i class="fa-solid fa-file-lines"></i> 📄 제 2장 (F~J)
                        </button>
                    </div>
                    <button type="button" onclick="window.resetQuickViewMarks()" title="마킹 체크 전체 초기화" style="padding: 7px 9px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #94a3b8; font-size: 0.72rem; cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 4px; transition: all 0.2s;">
                        <i class="fa-solid fa-rotate-left"></i> 초기화
                    </button>
                </div>
            `;
        } else {
            slipNav.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; background: rgba(0,0,0,0.35); padding: 5px 8px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08);">
                    <button type="button" onclick="window.switchQuickViewSlipPage(${currentSlipPage - 1})" ${currentSlipPage <= 1 ? 'disabled style="opacity: 0.3; cursor: not-allowed; padding: 6px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #64748b; font-size: 0.72rem;"' : 'style="cursor: pointer; padding: 6px 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #cbd5e1; font-size: 0.72rem; font-weight: 700;"'}>
                        <i class="fa-solid fa-chevron-left"></i> 이전 장
                    </button>
                    <div style="text-align: center;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: #fbbf24; display: block;">
                            📄 제 ${currentSlipPage}장 / 총 ${totalPages}장
                        </span>
                        <span style="font-size: 0.68rem; color: #94a3b8;">
                            (${startIdx + 1}~${Math.min(startIdx + 5, totalCombos)}게임 마킹)
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button type="button" onclick="window.switchQuickViewSlipPage(${currentSlipPage + 1})" ${currentSlipPage >= totalPages ? 'disabled style="opacity: 0.3; cursor: not-allowed; padding: 6px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #64748b; font-size: 0.72rem;"' : 'style="cursor: pointer; padding: 6px 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #cbd5e1; font-size: 0.72rem; font-weight: 700;"'}>
                            다음 장 <i class="fa-solid fa-chevron-right"></i>
                        </button>
                        <button type="button" onclick="window.resetQuickViewMarks()" title="마킹 체크 초기화" style="padding: 6px 8px; background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #94a3b8; font-size: 0.7rem; cursor: pointer;">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // 2. Guidance Banner
    if (slipGuidance) {
        const isSecondSlip = currentSlipPage === 2;
        slipGuidance.innerHTML = `
            <div style="padding: 4px 8px; border-radius: 7px; background: ${isSecondSlip ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.04)'}; border: 1px solid ${isSecondSlip ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.07)'}; display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem;">
                <span style="color: ${isSecondSlip ? '#93c5fd' : '#94a3b8'}; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid ${isSecondSlip ? 'fa-circle-info' : 'fa-hand-pointer'}" style="color: ${isSecondSlip ? '#60a5fa' : '#10b981'};"></i>
                    ${isSecondSlip ? '새 로또 용지의 <strong>A, B, C, D, E</strong> 칸에 마킹하세요.' : '마킹한 줄을 터치하면 완료(흐림) 체크됩니다.'}
                </span>
                <span style="font-weight: 700; color: #fbbf24;">
                    5,000원 (5게임)
                </span>
            </div>
        `;
    }

    // 3. Grid Mode Rendering (5 Combos for current slip page)
    let gridHtml = '';
    pageCombos.forEach((combo, idx) => {
        const actualIdx = startIdx + idx;
        const markKey = `${currentQuickAlgo}_${actualIdx}`;
        const isMarked = markedComboKeys.has(markKey);
        const slotLetter = ['A', 'B', 'C', 'D', 'E'][idx] || `${idx + 1}`;
        const originalLabel = combo.customLabel || `${actualIdx + 1}번`;
        const nums = getComboNumbers(combo);

        const ballsHtml = nums.map(n => {
            const bgColor = getBallHexColor(n);
            const textColor = n <= 10 ? '#0f172a' : '#ffffff';
            return `<span class="lotto-ball sm-ball ${getBallColorClass(n)}" style="background: ${bgColor}; width: 29px; height: 29px; line-height: 29px; text-align: center; border-radius: 50%; color: ${textColor}; font-size: 0.8rem; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.35); flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
        }).join('');

        gridHtml += `
            <div onclick="window.toggleQuickViewMarkCombo('${markKey}')" 
                 class="quick-view-row ${isMarked ? 'marked-done' : ''}" 
                 style="display: flex; align-items: center; justify-content: space-between; padding: 7px 9px; border-radius: 9px; cursor: pointer; transition: all 0.2s; background: ${isMarked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(30, 41, 59, 0.75)'}; border: 1px solid ${isMarked ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.07)'}; opacity: ${isMarked ? '0.45' : '1'};">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span style="width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.78rem; background: ${isMarked ? '#10b981' : 'rgba(251, 191, 36, 0.18)'}; color: ${isMarked ? '#0f172a' : '#fbbf24'}; border: 1px solid ${isMarked ? '#10b981' : 'rgba(251, 191, 36, 0.4)'}; flex-shrink: 0;">
                        ${isMarked ? '<i class="fa-solid fa-check" style="font-size: 0.75rem;"></i>' : slotLetter}
                    </span>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <span style="font-weight: 800; font-size: 0.76rem; color: ${isMarked ? '#34d399' : '#e2e8f0'}; white-space: nowrap; ${isMarked ? 'text-decoration: line-through;' : ''}">
                            ${isMarked ? '마킹 완료' : originalLabel}
                        </span>
                        <span style="font-size: 0.67rem; color: #94a3b8; white-space: nowrap;">
                            ${isMarked ? originalLabel : (currentSlipPage > 1 ? `용지 ${slotLetter}열 (${originalLabel})` : `용지 ${slotLetter}열`)}
                        </span>
                    </div>
                </div>
                <div class="balls-row" style="display: inline-flex; gap: 4px; justify-content: flex-end; align-items: center; flex-wrap: nowrap; flex-shrink: 0;">
                    ${ballsHtml}
                </div>
            </div>
        `;
    });

    if (markingGrid) markingGrid.innerHTML = gridHtml;

    // 4. Bottom Quick-Action Navigation
    if (slipBottomAction) {
        if (totalPages >= 2) {
            if (currentSlipPage < totalPages) {
                const nextLabel = currentSlipPage === 1 ? '제 2장(F~J)' : `제 ${currentSlipPage + 1}장`;
                slipBottomAction.innerHTML = `
                    <button type="button" onclick="window.switchQuickViewSlipPage(${currentSlipPage + 1})" style="width: 100%; padding: 10px 14px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border: none; border-radius: 9px; color: #0f172a; font-weight: 900; font-size: 0.84rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 3px 10px rgba(245, 158, 11, 0.35); transition: all 0.2s;">
                        <span>제 ${currentSlipPage}장 마킹 완료 ➔ ${nextLabel} 넘어가기</span>
                        <i class="fa-solid fa-chevron-right text-xs"></i>
                    </button>
                `;
            } else {
                slipBottomAction.innerHTML = `
                    <button type="button" onclick="window.switchQuickViewSlipPage(1)" style="width: 100%; padding: 9px 14px; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 9px; color: #cbd5e1; font-weight: 700; font-size: 0.82rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;">
                        <i class="fa-solid fa-rotate-left text-xs"></i>
                        <span>제 1장(A~E) 처음으로 돌아가기</span>
                    </button>
                `;
            }
        } else {
            slipBottomAction.innerHTML = '';
        }
    }

    if (titleSub) {
        titleSub.innerHTML = `<span style="color: #fbbf24; font-weight: 800;">[${(effectiveUserId || 'guest').toUpperCase()}] 회원</span> · 제 <strong>${targetRound}</strong>회차 · ${versionLabel} (${currentSlipPage}/${totalPages}장)`;
    }
}

/**
 * Setup Event Listeners & Initialize
 */
export function setupQuickView() {
    // Global click listener for open/close triggers
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        if (target.closest('#btnCompactView') || target.closest('[data-action="open-compact-view"]')) {
            e.preventDefault();
            openCompactView();
            return;
        }

        if (target.closest('#closeCompactModal')) {
            e.preventDefault();
            closeCompactView();
            return;
        }

        const compactViewModal = document.getElementById('compactViewModal');
        if (compactViewModal && target === compactViewModal) {
            closeCompactView();
            return;
        }
    });

    // Visibility change handler to re-acquire wake lock if tab becomes visible while modal is open
    document.addEventListener('visibilitychange', async () => {
        const compactViewModal = document.getElementById('compactViewModal');
        if (compactViewModal && (compactViewModal.classList.contains('active') || compactViewModal.style.display === 'flex') && document.visibilityState === 'visible') {
            await acquireQuickViewWakeLock();
        }
    });

    // Expose globally for inline onclick handlers
    if (typeof window !== 'undefined') {
        window.openCompactView = openCompactView;
        window.closeCompactView = closeCompactView;
        window.switchQuickViewAlgo = switchQuickViewAlgo;
        window.updateQuickViewAlgoButtons = updateQuickViewAlgoButtons;
        window.renderQuickViewContent = renderQuickViewContent;
        window.getQuickCombos = getQuickCombos;
        window.checkQuickViewExtraPackEligibility = checkQuickViewExtraPackEligibility;
        window.acquireQuickViewWakeLock = acquireQuickViewWakeLock;
        window.releaseQuickViewWakeLock = releaseQuickViewWakeLock;
        window.toggleQuickViewWakeLock = toggleQuickViewWakeLock;
        window.updateWakeLockUI = updateWakeLockUI;
        window.switchQuickViewSlipPage = switchQuickViewSlipPage;
        window.toggleQuickViewMarkCombo = toggleQuickViewMarkCombo;
        window.resetQuickViewMarks = resetQuickViewMarks;
    }
}

// Immediate module-level attachment to prevent race condition
if (typeof window !== 'undefined') {
    window.openCompactView = openCompactView;
    window.closeCompactView = closeCompactView;
    window.switchQuickViewAlgo = switchQuickViewAlgo;
    window.updateQuickViewAlgoButtons = updateQuickViewAlgoButtons;
    window.renderQuickViewContent = renderQuickViewContent;
    window.getQuickCombos = getQuickCombos;
    window.checkQuickViewExtraPackEligibility = checkQuickViewExtraPackEligibility;
    window.acquireQuickViewWakeLock = acquireQuickViewWakeLock;
    window.releaseQuickViewWakeLock = releaseQuickViewWakeLock;
    window.toggleQuickViewWakeLock = toggleQuickViewWakeLock;
    window.updateWakeLockUI = updateWakeLockUI;
    window.switchQuickViewSlipPage = switchQuickViewSlipPage;
    window.toggleQuickViewMarkCombo = toggleQuickViewMarkCombo;
    window.resetQuickViewMarks = resetQuickViewMarks;

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', async () => {
            const compactViewModal = document.getElementById('compactViewModal');
            if (compactViewModal && (compactViewModal.classList.contains('active') || compactViewModal.style.display === 'flex') && document.visibilityState === 'visible') {
                await acquireQuickViewWakeLock();
            }
        });
    }
}
