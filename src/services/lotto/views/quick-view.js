import { state } from '../state.js';
import { getBallHexColor, showToast } from '../../../shared/utils.js';
import { SafeAuth, getUpcomingLottoRound } from '../../../shared/auth-mgmt.js';
import { getComboNumbers } from '../ledger.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';

let currentQuickAlgo = 'v3'; // 'v3', 'v4', 'extra_1'...'extra_5', or 'all'

/**
 * Fetch combinations based on selected algorithm (v3.0 / v4.0 / extra_1~5 / all)
 * Strictly personalized for the logged-in user and current upcoming round.
 */
export function getQuickCombos(algo = currentQuickAlgo, customUserId = null) {
    const effectiveUserId = (customUserId || 
        (typeof window !== 'undefined' && window.generatorAdminViewingUser) || 
        (typeof SafeAuth !== 'undefined' && SafeAuth.get ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 
        'guest').trim().toLowerCase();

    const targetRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : 
        ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 
        (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1240))));

    const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    if (algo === 'v3') {
        const v3Combos = computeAbsoluteTop10Combinations(false, targetRound, 'v3', true, effectiveUserId) || [];
        return {
            versionLabel: 'V3.0 하이브리드',
            badgeColor: '#3b82f6',
            combos: v3Combos.map((c, i) => ({ ...c, customLabel: `V3-${alphabet[i] || (i + 1)}` })),
            effectiveUserId,
            targetRound
        };
    } else if (algo === 'v4') {
        const v4Combos = computeAbsoluteTop10Combinations(false, targetRound, 'v4', true, effectiveUserId) || [];
        return {
            versionLabel: 'V4.0 행동경제학',
            badgeColor: '#10b981',
            combos: v4Combos.map((c, i) => ({ ...c, customLabel: `V4-${alphabet[i] || (i + 1)}` })),
            effectiveUserId,
            targetRound
        };
    } else if (typeof algo === 'string' && algo.startsWith('extra_')) {
        const packId = parseInt(algo.replace('extra_', ''), 10);
        const pack = generateExtraAddonPack(packId, targetRound, effectiveUserId);
        return {
            versionLabel: pack.name || `추가팩 ${packId}`,
            badgeColor: pack.color || '#10b981',
            combos: (pack.combos || []).map((c, i) => ({
                ...c,
                customLabel: `${pack.shortName || ('추가' + packId)}-${alphabet[i] || (i + 1)}`
            })),
            effectiveUserId,
            targetRound
        };
    } else {
        // 'all' -> Combines V3 + V4 + all active Extra Packs (20 to 70 combinations)
        const v3Combos = computeAbsoluteTop10Combinations(false, targetRound, 'v3', true, effectiveUserId) || [];
        const v4Combos = computeAbsoluteTop10Combinations(false, targetRound, 'v4', true, effectiveUserId) || [];

        const allCombos = [
            ...v3Combos.map((c, i) => ({ ...c, customLabel: `V3-${alphabet[i] || (i + 1)}`, groupTag: 'V3.0 하이브리드 (10조합)' })),
            ...v4Combos.map((c, i) => ({ ...c, customLabel: `V4-${alphabet[i] || (i + 1)}`, groupTag: 'V4.0 행동경제학 (10조합)' }))
        ];

        // Include all 5 Booster Add-on packs
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

        return { 
            versionLabel: `전체 통합 (${allCombos.length}조합)`,
            badgeColor: '#fbbf24',
            combos: allCombos,
            effectiveUserId,
            targetRound
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

    if (algo) {
        currentQuickAlgo = algo;
    } else {
        // Default: If active extra packs exist, keep current or default to 'all' / 'v4'
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        if (chkReportLogic && chkReportLogic.checked) {
            currentQuickAlgo = 'v4';
        } else {
            currentQuickAlgo = 'v3';
        }
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
    currentQuickAlgo = algo;
    updateQuickViewAlgoButtons();
    renderQuickViewContent();

    let label = '추천번호';
    if (algo === 'v3') label = 'V3.0 하이브리드 (10조합)';
    else if (algo === 'v4') label = 'V4.0 행동경제학 (10조합)';
    else if (algo === 'all') label = '전체 통합 조합';
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

    const extraPacks = state.extraPacks || [];
    let totalGames = 20 + (extraPacks.reduce((sum, p) => sum + (p.combos ? p.combos.length : 0), 0));
    if (totalGames === 20) totalGames = 70; // 20 base + 50 extra

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
        buttonsHtml += `
            <button type="button" onclick="window.switchQuickViewAlgo('${packKey}')" class="quick-algo-btn ${isActive ? 'active' : ''}" style="flex: 1 1 75px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}; background: ${isActive ? `linear-gradient(135deg, ${color}, #059669)` : 'rgba(30,41,59,0.6)'}; color: ${isActive ? '#fff' : '#cbd5e1'}; font-weight: ${isActive ? '800' : '600'};">
                <i class="fa-solid fa-rocket"></i> 추가 ${pId} (10)
            </button>
        `;
    }

    // All Combined Button
    const isAllActive = currentQuickAlgo === 'all';
    buttonsHtml += `
        <button type="button" onclick="window.switchQuickViewAlgo('all')" class="quick-algo-btn ${isAllActive ? 'active' : ''}" style="flex: 1 1 85px; padding: 6px 4px; font-size: 0.74rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 3px; border: 1px solid ${isAllActive ? '#fbbf24' : 'rgba(255,255,255,0.08)'}; background: ${isAllActive ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' : 'rgba(30,41,59,0.6)'}; color: ${isAllActive ? '#0f172a' : '#cbd5e1'}; font-weight: ${isAllActive ? '800' : '600'};">
            <i class="fa-solid fa-layer-group"></i> 전체 (${totalGames})
        </button>
    `;

    container.innerHTML = buttonsHtml;
}

/**
 * Render Modal Content based on Current Algorithm
 */
export function renderQuickViewContent() {
    const { versionLabel, combos, badgeColor, effectiveUserId, targetRound } = getQuickCombos(currentQuickAlgo);

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
            return `<span class="lotto-ball sm-ball" style="background: ${bgColor}; width: 28px; height: 28px; line-height: 28px; text-align: center; border-radius: 50%; color: #fff; font-size: 0.78rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(0,0,0,0.35); flex-shrink: 0; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
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

    const markingGrid = document.getElementById('compactMarkingGrid');
    if (markingGrid) markingGrid.innerHTML = gridHtml;

    const titleSub = document.getElementById('quickViewSubTitle');
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
}
