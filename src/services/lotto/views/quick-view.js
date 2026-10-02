import { state } from '../state.js';
import { getBallHexColor, getBallColorClass, showToast } from '../../../shared/utils.js';
import { SafeAuth, isAdminUser, getUpcomingLottoRound } from '../../../shared/auth-mgmt.js';
import { getComboNumbers, isUserEligibleForExtraPacks } from '../ledger.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack, getEffectiveGeneratorUserId } from '../generator.js';

let currentQuickAlgo = 'v4'; // 'v3', 'v4', 'extra_1'...'extra_5', or 'all'

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
            versionLabel: 'V3.0 하이브리드',
            badgeColor: '#3b82f6',
            combos: v3Combos.map((c, i) => ({ ...c, customLabel: `V3-${alphabet[i] || (i + 1)}` })),
            effectiveUserId,
            targetRound,
            isLocked: false
        };
    } else if (algo === 'v4') {
        const v4Combos = isV4Valid
            ? state.fixedTop5Combinations_v4
            : (computeAbsoluteTop10Combinations(false, targetRound, 'v4', true, effectiveUserId) || []);
        return {
            versionLabel: 'V4.0 행동경제학',
            badgeColor: '#10b981',
            combos: v4Combos.map((c, i) => ({ ...c, customLabel: `V4-${alphabet[i] || (i + 1)}` })),
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
            ...v3Combos.map((c, i) => ({ ...c, customLabel: `V3-${alphabet[i] || (i + 1)}`, groupTag: 'V3.0 하이브리드 (10조합)' })),
            ...v4Combos.map((c, i) => ({ ...c, customLabel: `V4-${alphabet[i] || (i + 1)}`, groupTag: 'V4.0 행동경제학 (10조합)' }))
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

    updateQuickViewAlgoButtons();
    renderQuickViewContent();

    compactViewModal.style.display = 'flex';
    compactViewModal.classList.add('active');
    document.body.style.overflow = 'hidden';
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
 * Render Modal Content based on Current Algorithm
 */
export function renderQuickViewContent() {
    const quickData = getQuickCombos(currentQuickAlgo);
    const { versionLabel, combos, badgeColor, effectiveUserId, targetRound, isLocked } = quickData;

    const markingGrid = document.getElementById('compactMarkingGrid');
    const titleSub = document.getElementById('quickViewSubTitle');

    if (isLocked) {
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

    // 1. Grid Mode Rendering
    let gridHtml = '';
    let lastRenderedGroup = '';

    combos.forEach((combo, idx) => {
        if (combo.groupTag && combo.groupTag !== lastRenderedGroup) {
            lastRenderedGroup = combo.groupTag;
            gridHtml += `
                <div style="background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; color: #fbbf24; margin-top: 6px; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-circle-notch"></i> ${lastRenderedGroup}
                </div>
            `;
        }

        const label = combo.customLabel || `${idx + 1}`;
        const nums = getComboNumbers(combo);
        const ballsHtml = nums.map(n => {
            const bgColor = getBallHexColor(n);
            const textColor = n <= 10 ? '#0f172a' : '#ffffff';
            return `<span class="lotto-ball sm-ball ${getBallColorClass(n)}" style="background: ${bgColor}; width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; color: ${textColor}; font-size: 0.78rem; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.35); flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
        }).join('');

        gridHtml += `
            <div class="quick-view-row" style="display: grid; grid-template-columns: 85px 1fr; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; gap: 8px;">
                <span style="font-weight: 800; color: #fbbf24; font-size: 0.78rem; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${label}</span>
                <div class="balls-row" style="display: inline-flex; gap: 5px; justify-content: flex-end; align-items: center; flex-wrap: nowrap; flex-shrink: 0;">
                    ${ballsHtml}
                </div>
            </div>
        `;
    });

    if (markingGrid) markingGrid.innerHTML = gridHtml;

    if (titleSub) {
        titleSub.innerHTML = `<span style="color: #fbbf24; font-weight: 800;">[${(effectiveUserId || 'guest').toUpperCase()}] 회원 전용 배정</span> · 제 <strong>${targetRound}</strong>회차 · ${versionLabel} (${combos.length}조합)`;
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

    // Expose globally for inline onclick handlers
    if (typeof window !== 'undefined') {
        window.openCompactView = openCompactView;
        window.closeCompactView = closeCompactView;
        window.switchQuickViewAlgo = switchQuickViewAlgo;
        window.updateQuickViewAlgoButtons = updateQuickViewAlgoButtons;
        window.renderQuickViewContent = renderQuickViewContent;
        window.getQuickCombos = getQuickCombos;
        window.checkQuickViewExtraPackEligibility = checkQuickViewExtraPackEligibility;
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
}
