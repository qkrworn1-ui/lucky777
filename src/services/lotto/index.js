import { state, initHistory, saveGlobalState } from './state.js';
import { recalculateGroups } from './statistics.js';
import { db } from '../../shared/db.js';
import { showToast } from '../../shared/utils.js';
import { updateDebugMonitor, SafeAuth } from '../../shared/auth-mgmt.js';
import { renderLatestDrawBanner } from './views/draw-banner.js';
import { renderTop5Combinations, updateSavedCount, renderSavedList, setupGeneratorTabEvents } from './views/generator-tab.js';
import { populateSimRoundSelector, renderSimulationTab, setupSimulationEvents } from './views/simulation-tab.js';
import { renderWheelingSelector, renderWheelingResults, setupWheelingTab } from './views/wheeling.js';
import { renderVerificationTab, setupEvolutionButton } from './views/verification.js';
import { renderDashboardCharts } from './views/dashboard-tab.js';
import { renderReviewTab, renderReviewDetail } from './views/review-tab.js';
import { renderAlgorithmsTab } from './views/algorithms-tab.js';
import { renderConfirmedPurchasesList } from './views/confirmed-tab.js';
import { setupPredictionReport } from './views/prediction-report.js';
import { setupQuickView } from './views/quick-view.js';
import { setupManualLedgerModal, updateManualModalCrossCheck } from './views/manual-modal.js';
import { setupManualDrawModal } from './views/manual-draw-modal.js';
import { autoSyncMissingDraws, setupSyncEvents } from './views/sync.js';
import { computeAbsoluteTop10Combinations } from './generator.js';
import { getLedger, getHistoricalTop10Combinations, saveToLedger, saveLedgerDirectly, exportLedgerToFile, importLedgerFromFile, clearEntireLedger, getReceiptTrashList, saveReceiptTrashList, moveToReceiptTrash, restoreFromReceiptTrash, permanentDeleteFromReceiptTrash, emptyEntireReceiptTrash, fetchReceiptTrash, getReceiptCombosFingerprint } from './ledger.js';

export async function initLottoService() {
    window.initLottoService = initLottoService;
    window.__lottoInitialized = true;
    initHistory();
    try {
        recalculateGroups();
    } catch(initErr) {
        console.error('[INIT] Early init error (non-fatal):', initErr);
    }

    const statusIndicator = document.getElementById('serverStatusIndicator');
    const statusText = document.getElementById('serverStatusText');

    if (!window.db) {
        console.error("Firebase not initialized.");
        state.lottoExtraHistory = {};
        state.savedCombinations = [];
        if (statusIndicator) { statusIndicator.style.background = '#ef4444'; statusIndicator.style.boxShadow = '0 0 8px #ef4444'; }
        if (statusText) statusText.textContent = 'DB 접속 오류 (로컬)';
    } else {
        showToast('데이터베이스 동기화 중...');
        if (statusIndicator) { statusIndicator.style.background = '#10b981'; statusIndicator.style.boxShadow = '0 0 8px #10b981'; }
        if (statusText) statusText.textContent = 'DB 접속 완료 (Cloud)';

        // Initial background sync for receipt trash
        fetchReceiptTrash().catch(() => {});

        const authId = (SafeAuth.get() || '').trim().toLowerCase();
        // Reset in-memory ledger to prevent cross-account pollution on re-login
        state.globalLedger = {};
        state.ledgerFinancialsCache = null;
        state.allUsersMergedLedger = null;

        if (authId && window.db) {
            window.db.collection('lotto_purchases').doc(authId).onSnapshot(async doc => {
                if (doc && doc.exists) {
                    const rawLedger = doc.data().ledger || {};
                    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
                    
                    if (!isAdmin) {
                        // 🔒 STRICT PURIFICATION: Remove any accidental master/other user receipts from normal user's doc
                        const cleanLedger = {};
                        let hadPollution = false;

                        for (const r in rawLedger) {
                            if (!Array.isArray(rawLedger[r])) continue;
                            const myOnly = rawLedger[r].filter(p => {
                                const pUser = (p.user || p.userId || '').trim().toLowerCase();
                                const isMine = (pUser === authId);
                                if (!isMine) hadPollution = true;
                                return isMine;
                            });
                            if (myOnly.length > 0) cleanLedger[r] = myOnly;
                        }
                        state.globalLedger = cleanLedger;

                        if (hadPollution) {
                            console.warn(`[Ledger Purged] Removed polluted receipts for user ${authId}`);
                            try {
                                await window.db.collection('lotto_purchases').doc(authId).set({ ledger: cleanLedger });
                            } catch(err) {}
                        }
                    } else {
                        state.globalLedger = rawLedger;
                    }
                } else {
                    // If no doc on cloud, try user-specific localStorage key ONLY
                    try {
                        const data = localStorage.getItem(`lotto_actual_ledger_${authId}`);
                        state.globalLedger = data ? JSON.parse(data) : {};
                    } catch(e) { state.globalLedger = {}; }
                }

                // Update local synchronized ledger with user-isolated key
                try {
                    localStorage.setItem(`lotto_actual_ledger_${authId}`, JSON.stringify(state.globalLedger));
                } catch(e) {}

                state.ledgerFinancialsCache = null; // Invalidate memoized financials
                updateDebugMonitor(state.globalLedger);
                if (typeof window.renderLandingDashboard === 'function') {
                    window.renderLandingDashboard();
                }
                if (typeof renderConfirmedPurchasesList === 'function') {
                    renderConfirmedPurchasesList();
                }
                
                const reviewTab = document.getElementById('tab-review');
                if (reviewTab && reviewTab.classList.contains('active')) {
                    const opt = document.querySelector('input[name="optReviewRound"]:checked');
                    if (opt) renderReviewDetail(parseInt(opt.value));
                    else renderReviewTab();
                }
            });
        } else {
            try {
                const userKey = authId ? `lotto_actual_ledger_${authId}` : 'lotto_actual_ledger_guest';
                const data = localStorage.getItem(userKey);
                state.globalLedger = data ? JSON.parse(data) : {};
            } catch(e) { state.globalLedger = {}; }
            state.ledgerFinancialsCache = null;
            updateDebugMonitor(state.globalLedger);
        }

        // 1) Local storage pre-load for extra history (offline resilient)
        try {
            const localExtra = localStorage.getItem('lotto_extra_history');
            if (localExtra) {
                state.lottoExtraHistory = JSON.parse(localExtra) || {};
            }
        } catch(e) {}

        // 2) Query extra history from cloud Firestore
        try {
            const extraDoc = await db.get('lotto_draw_history', 'extra_history');
            if (extraDoc && typeof extraDoc === 'object') {
                state.lottoExtraHistory = { ...state.lottoExtraHistory, ...extraDoc };
                try {
                    localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory));
                } catch(e) {}
            }
        } catch (e) {
            console.error('[DB] extra_history query error:', e);
        }

        // Merge history and recalculate groups
        state.mergedHistory = typeof LOTTO_HISTORY !== 'undefined' ? { ...LOTTO_HISTORY, ...state.lottoExtraHistory } : { ...state.lottoExtraHistory };
        recalculateGroups();
        state.latestDrawData = null; // force recalculation
        renderLatestDrawBanner();

        // Query global state
        const upcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
        try {
            const stateDoc = await db.get('lotto_app_state', 'global_state');
            if (stateDoc) {
                if (stateDoc.aiState) state.aiState = stateDoc.aiState;
                if (!stateDoc.round || stateDoc.round === upcomingRound) {
                    if (stateDoc.fixedTop5Combinations) state.fixedTop5Combinations = stateDoc.fixedTop5Combinations;
                    if (stateDoc.fixedTop5Combinations_v3) state.fixedTop5Combinations_v3 = stateDoc.fixedTop5Combinations_v3;
                    if (stateDoc.fixedTop5Combinations_v4) state.fixedTop5Combinations_v4 = stateDoc.fixedTop5Combinations_v4;
                    if (Array.isArray(stateDoc.extraPacks)) state.extraPacks = stateDoc.extraPacks;
                } else {
                    state.fixedTop5Combinations = [];
                    state.fixedTop5Combinations_v3 = [];
                    state.fixedTop5Combinations_v4 = [];
                    state.extraPacks = [];
                }
            }
        } catch (e) {
            console.error(e);
        }

        // Restore local extra packs fallback if offline
        try {
            const localPacks = localStorage.getItem('lotto_extra_packs');
            if (localPacks && (!state.extraPacks || state.extraPacks.length === 0)) {
                state.extraPacks = JSON.parse(localPacks);
            }
        } catch(e) {}

        // Realtime sync for lotto_app_state across devices
        if (window.db) {
            window.db.collection('lotto_app_state').doc('global_state').onSnapshot(doc => {
                if (doc && doc.exists) {
                    const data = doc.data();
                    const curUpcoming = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
                    if (data.round && data.round !== curUpcoming) return;

                    let changed = false;
                    if (data.aiState) state.aiState = data.aiState;
                    if (data.fixedTop5Combinations_v3 && data.fixedTop5Combinations_v3.length > 0) {
                        state.fixedTop5Combinations_v3 = data.fixedTop5Combinations_v3;
                        changed = true;
                    }
                    if (data.fixedTop5Combinations_v4 && data.fixedTop5Combinations_v4.length > 0) {
                        state.fixedTop5Combinations_v4 = data.fixedTop5Combinations_v4;
                        changed = true;
                    }
                    if (Array.isArray(data.extraPacks)) {
                        state.extraPacks = data.extraPacks;
                        changed = true;
                    }

                    const chkReport = document.getElementById('chkUseV4ReportLogic');
                    state.fixedTop5Combinations = (chkReport && chkReport.checked) 
                        ? state.fixedTop5Combinations_v4 
                        : state.fixedTop5Combinations_v3;

                    if (changed) {
                        renderTop5Combinations(false);
                    }
                }
            });
        }

        // Query saved combinations
        try {
            const savedDoc = await db.get('lotto_saved_combinations', 'global_saved');
            if (savedDoc) {
                state.savedCombinations = savedDoc.combos || [];
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Restore preference for V4 algorithm checkbox (Default: TRUE for V4.0)
    const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
    if (chkReportLogic) {
        const savedPref = localStorage.getItem('lotto_pref_v4');
        if (savedPref !== null) {
            chkReportLogic.checked = (savedPref === 'true');
        } else {
            chkReportLogic.checked = true; // Default to V4.0 Behavioral Portfolio
            localStorage.setItem('lotto_pref_v4', 'true');
        }
    }

    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    // Initialize v3 and v4 current week recommendations if missing in global state
    let stateChanged = false;
    if (!state.fixedTop5Combinations_v3 || state.fixedTop5Combinations_v3.length === 0) {
        state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3');
        stateChanged = true;
    }
    if (!state.fixedTop5Combinations_v4 || state.fixedTop5Combinations_v4.length === 0) {
        state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4');
        stateChanged = true;
    }

    // Safety check: Ensure V3 and V4 are truly distinct
    const v3Str = (state.fixedTop5Combinations_v3 && state.fixedTop5Combinations_v3[0] && state.fixedTop5Combinations_v3[0].numbers) ? state.fixedTop5Combinations_v3[0].numbers.join(',') : '';
    const v4Str = (state.fixedTop5Combinations_v4 && state.fixedTop5Combinations_v4[0] && state.fixedTop5Combinations_v4[0].numbers) ? state.fixedTop5Combinations_v4[0].numbers.join(',') : '';
    if (v3Str && v4Str && v3Str === v4Str) {
        state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3');
        state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4');
        stateChanged = true;
    }

    if (stateChanged) {
        saveGlobalState();
    }

    state.fixedTop5Combinations = (chkReportLogic && chkReportLogic.checked) ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3;

    renderLatestDrawBanner();
    renderTop5Combinations(false);
    updateSavedCount();
    renderSavedList();

    // Event listener for algorithm version checkbox switch
    if (chkReportLogic) {
        chkReportLogic.addEventListener('change', () => {
            localStorage.setItem('lotto_pref_v4', chkReportLogic.checked ? 'true' : 'false');
            state.fixedTop5Combinations = chkReportLogic.checked ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3;
            renderTop5Combinations(false);
            updateSavedCount();
            renderSavedList();
        });
    }

    // Tab buttons event listeners
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            switchLottoTab(target);
        });
    });

    // Initialize all components event listeners
    setupGeneratorTabEvents();
    setupSimulationEvents();
    setupWheelingTab();
    setupEvolutionButton();
    setupPredictionReport();
    setupQuickView();
    setupManualLedgerModal();
    setupManualDrawModal();
    setupSyncEvents();

    autoSyncMissingDraws();
    if (typeof window.renderLandingDashboard === 'function') {
        window.renderLandingDashboard();
    }
}

// Global Lotto Tab Switcher
export function switchLottoTab(target) {
    if (!window.__lottoInitialized && typeof initLottoService === 'function') {
        try { initLottoService(); } catch(e){}
    }

    const landingPage = document.getElementById('landingPage');
    const totoPage = document.getElementById('totoPage');
    const appContainer = document.getElementById('appContainer');

    if (landingPage) {
        landingPage.classList.remove('active');
        landingPage.style.display = 'none';
    }
    if (totoPage) {
        totoPage.classList.remove('active');
        totoPage.style.display = 'none';
    }
    if (appContainer) {
        appContainer.classList.add('active');
        appContainer.style.display = 'flex';
    }

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const targetEl = document.getElementById(target);
    if (targetEl) targetEl.classList.add('active');

    if (target === 'tab-generator') {
        renderTop5Combinations(false);
        updateSavedCount();
        renderSavedList();
    } else if (target === 'tab-algorithms') {
        renderAlgorithmsTab();
    } else if (target === 'tab-simulation') {
        populateSimRoundSelector();
        renderSimulationTab();
    } else if (target === 'tab-wheeling') {
        renderWheelingSelector();
        renderWheelingResults();
    } else if (target === 'tab-verify-evolution' && document.getElementById('tab-verify-evolution')) {
        renderVerificationTab();
    } else if (target === 'tab-dashboard') {
        renderDashboardCharts();
    } else if (target === 'tab-review') {
        renderReviewTab();
    } else if (target === 'tab-confirmed-list') {
        renderConfirmedPurchasesList();
    }
}

if (typeof window !== 'undefined') {
    window.switchTab = switchLottoTab;
    window.switchLottoTab = switchLottoTab;
    window.renderAlgorithmsTab = renderAlgorithmsTab;
    window.renderReviewTab = renderReviewTab;
    window.renderReviewDetail = renderReviewDetail;
    window.getLedger = getLedger;
    window.saveToLedger = saveToLedger;
    window.exportLedgerToFile = exportLedgerToFile;
    window.importLedgerFromFile = importLedgerFromFile;
    window.clearEntireLedger = clearEntireLedger;
    window.renderConfirmedPurchasesList = renderConfirmedPurchasesList;
    window.computeAbsoluteTop10Combinations = computeAbsoluteTop10Combinations;
    window.updateManualModalCrossCheck = updateManualModalCrossCheck;
    window.getReceiptTrashList = getReceiptTrashList;
    window.fetchReceiptTrash = fetchReceiptTrash;
    window.saveReceiptTrashList = saveReceiptTrashList;
    window.moveToReceiptTrash = moveToReceiptTrash;
    window.restoreFromReceiptTrash = restoreFromReceiptTrash;
    window.permanentDeleteFromReceiptTrash = permanentDeleteFromReceiptTrash;
    window.emptyEntireReceiptTrash = emptyEntireReceiptTrash;
    window.getReceiptCombosFingerprint = getReceiptCombosFingerprint;
}
