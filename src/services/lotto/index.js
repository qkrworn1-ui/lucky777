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
import { getLedger, getHistoricalTop10Combinations, getUserPurchasesForRound, calculateLedgerFinancials, calculateAllUsersTotalFinancials, getSafeActualDraw, saveToLedger, saveLedgerDirectly, exportLedgerToFile, importLedgerFromFile, clearEntireLedger, getReceiptTrashList, saveReceiptTrashList, moveToReceiptTrash, restoreFromReceiptTrash, permanentDeleteFromReceiptTrash, emptyEntireReceiptTrash, fetchReceiptTrash, getReceiptCombosFingerprint, toggleReceiptLock, toggleRoundLock, normalizeMaster1239Order, parseDonghangLotteryQrUrl, syncPurchaseWithQrUrl } from './ledger.js';

let _isLottoInitializing = false;
let _lottoInitPromise = null;
let _activePurchasesUnsub = null;
let _activeExtraHistoryUnsub = null;
let _activeAppStateUnsub = null;
let _activePurchasesAuthId = null;

export function resetLottoServiceState() {
    window.__lottoInitialized = false;
    _isLottoInitializing = false;
    _lottoInitPromise = null;
    if (_activePurchasesUnsub) {
        try { _activePurchasesUnsub(); } catch(e) {}
        _activePurchasesUnsub = null;
    }
    _activePurchasesAuthId = null;
}

export async function initLottoService(force = false) {
    window.initLottoService = initLottoService;
    window.resetLottoServiceState = resetLottoServiceState;
    const currentAuthId = (SafeAuth.get() || '').trim().toLowerCase();

    // If user changed or force re-init requested, clean previous active listener
    if (force || (_activePurchasesAuthId && _activePurchasesAuthId !== currentAuthId)) {
        resetLottoServiceState();
    }

    if (_isLottoInitializing && _lottoInitPromise) {
        return _lottoInitPromise;
    }
    _isLottoInitializing = true;

    _lottoInitPromise = (async () => {
        try {
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
                    if (_activePurchasesUnsub) {
                        try { _activePurchasesUnsub(); } catch(e) {}
                        _activePurchasesUnsub = null;
                    }
                    _activePurchasesAuthId = authId;
                    _activePurchasesUnsub = window.db.collection('lotto_purchases').doc(authId).onSnapshot(async doc => {
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

                // Ensure 1239 is strictly normalized in master's ledger
                if (state.globalLedger && state.globalLedger['1239']) {
                    state.globalLedger['1239'] = normalizeMaster1239Order(state.globalLedger['1239']);
                }

                // Update local synchronized ledger with user-isolated key
                try {
                    localStorage.setItem(`lotto_actual_ledger_${authId}`, JSON.stringify(state.globalLedger));
                } catch(e) {}

                state.ledgerFinancialsCache = null; // Invalidate memoized financials
                if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[authId]) {
                    state.allUsersPurchasesMap[authId].ledger = state.globalLedger;
                }
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
            if (state.globalLedger && state.globalLedger['1239']) {
                state.globalLedger['1239'] = normalizeMaster1239Order(state.globalLedger['1239']);
            }
            state.ledgerFinancialsCache = null;
            state.allUsersPurchasesMap = null;
            state.allUsersMergedLedger = null;
            updateDebugMonitor(state.globalLedger);
        }

        // 1) Local storage pre-load for extra history (offline resilient)
        try {
            const localExtra = localStorage.getItem('lotto_extra_history');
            if (localExtra) {
                state.lottoExtraHistory = JSON.parse(localExtra) || {};
            }
        } catch(e) {}

        // 2) Query extra history, global state, and saved combinations in parallel from Firestore
        let extraDoc = null;
        let stateDoc = null;
        let savedDoc = null;

        try {
            const [rExtra, rState, rSaved] = await Promise.all([
                db.get('lotto_draw_history', 'extra_history').catch(e => { console.warn('[DB] extra_history query error:', e); return null; }),
                db.get('lotto_app_state', 'global_state').catch(e => { console.warn('[DB] global_state query error:', e); return null; }),
                db.get('lotto_saved_combinations', 'global_saved').catch(e => { console.warn('[DB] saved_combinations query error:', e); return null; })
            ]);
            extraDoc = rExtra;
            stateDoc = rState;
            savedDoc = rSaved;
        } catch(e) {
            console.error('[DB] Parallel initial fetch error:', e);
        }

        if (extraDoc && typeof extraDoc === 'object') {
            state.lottoExtraHistory = { ...state.lottoExtraHistory, ...extraDoc };
            try {
                localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory));
            } catch(e) {}
        }

        if (window.db && typeof window.db.collection === 'function') {
            if (_activeExtraHistoryUnsub) {
                try { _activeExtraHistoryUnsub(); } catch(e) {}
                _activeExtraHistoryUnsub = null;
            }
            _activeExtraHistoryUnsub = window.db.collection('lotto_draw_history').doc('extra_history').onSnapshot(doc => {
                if (doc && doc.exists) {
                    const extraDoc = doc.data();
                    if (extraDoc && typeof extraDoc === 'object') {
                        state.lottoExtraHistory = { ...state.lottoExtraHistory, ...extraDoc };
                        try { localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory)); } catch(e) {}
                        state.mergedHistory = typeof LOTTO_HISTORY !== 'undefined' ? { ...LOTTO_HISTORY, ...state.lottoExtraHistory } : { ...state.lottoExtraHistory };
                        recalculateGroups();
                        state.latestDrawData = null;
                        renderLatestDrawBanner();
                        if (typeof window.renderLandingDashboard === 'function') {
                            window.renderLandingDashboard();
                        }
                    }
                }
            }, err => console.warn('[Realtime Draw History Listener Skipped]', err));
        }

        // Merge history and recalculate groups
        state.mergedHistory = typeof LOTTO_HISTORY !== 'undefined' ? { ...LOTTO_HISTORY, ...state.lottoExtraHistory } : { ...state.lottoExtraHistory };
        recalculateGroups();
        state.latestDrawData = null; // force recalculation
        renderLatestDrawBanner();

        // Process global state
        const upcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
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

        // Restore local extra packs fallback if offline
        try {
            const localPacks = localStorage.getItem('lotto_extra_packs');
            if (localPacks && (!state.extraPacks || state.extraPacks.length === 0)) {
                state.extraPacks = JSON.parse(localPacks);
            }
        } catch(e) {}

        // Realtime sync for lotto_app_state across devices
        if (window.db) {
            if (_activeAppStateUnsub) {
                try { _activeAppStateUnsub(); } catch(e) {}
                _activeAppStateUnsub = null;
            }
            _activeAppStateUnsub = window.db.collection('lotto_app_state').doc('global_state').onSnapshot(doc => {
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

        // Process saved combinations
        if (savedDoc) {
            state.savedCombinations = savedDoc.combos || [];
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

    // Component event listeners
    setupAllLottoEvents();

    // Run auto-sync in the background non-blockingly after initial render
    setTimeout(() => {
        if (typeof autoSyncMissingDraws === 'function') {
            autoSyncMissingDraws().catch(err => console.warn('[AutoSync Background Skipped/Error]', err));
        }
    }, 1500);

    if (typeof window.renderLandingDashboard === 'function') {
        window.renderLandingDashboard();
    }
        } finally {
            _isLottoInitializing = false;
        }
    })();

    return _lottoInitPromise;
}

// Global Lotto Tab Switcher
export function switchLottoTab(target) {
    if (!target) return;

    if (!window.__lottoInitialized && typeof initLottoService === 'function') {
        try { initLottoService(); } catch(e){}
    }

    // 1. Ensure appContainer is active and visible with !important
    if (typeof window._switchPage === 'function') {
        window._switchPage('appContainer', false);
    } else {
        const landingPage = document.getElementById('landingPage');
        const totoPage = document.getElementById('totoPage');
        const appContainer = document.getElementById('appContainer');

        if (landingPage) {
            landingPage.classList.remove('active');
            landingPage.style.setProperty('display', 'none', 'important');
        }
        if (totoPage) {
            totoPage.classList.remove('active');
            totoPage.style.setProperty('display', 'none', 'important');
        }
        if (appContainer) {
            appContainer.classList.add('active');
            appContainer.style.setProperty('display', 'flex', 'important');
        }
    }

    // 2. Update tab buttons active state
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => {
        if (b.dataset.tab === target) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // 3. Update tab contents active state
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(c => {
        if (c.id === target) {
            c.classList.add('active');
            c.style.setProperty('display', 'block', 'important');
        } else {
            c.classList.remove('active');
            c.style.setProperty('display', 'none', 'important');
        }
    });

    // 4. Safely execute tab-specific render routines
    try {
        if (target === 'tab-generator') {
            if (typeof renderTop5Combinations === 'function') renderTop5Combinations(false);
            if (typeof updateSavedCount === 'function') updateSavedCount();
            if (typeof renderSavedList === 'function') renderSavedList();
        } else if (target === 'tab-algorithms') {
            if (typeof renderAlgorithmsTab === 'function') renderAlgorithmsTab();
        } else if (target === 'tab-simulation') {
            if (typeof populateSimRoundSelector === 'function') populateSimRoundSelector();
            if (typeof renderSimulationTab === 'function') renderSimulationTab();
        } else if (target === 'tab-wheeling') {
            if (typeof renderWheelingSelector === 'function') renderWheelingSelector();
            if (typeof renderWheelingResults === 'function') renderWheelingResults();
        } else if (target === 'tab-verify-evolution') {
            if (typeof renderVerificationTab === 'function') renderVerificationTab();
        } else if (target === 'tab-dashboard') {
            if (typeof renderDashboardCharts === 'function') renderDashboardCharts();
        } else if (target === 'tab-review') {
            if (typeof renderReviewTab === 'function') renderReviewTab();
        } else if (target === 'tab-confirmed-list') {
            if (typeof renderConfirmedPurchasesList === 'function') renderConfirmedPurchasesList();
        }
    } catch(err) {
        console.error(`[Error rendering tab: ${target}]`, err);
    }
}

// Setup all component event listeners
export function setupAllLottoEvents() {
    if (typeof window !== 'undefined' && window.__lottoEventsSetup) return;
    if (typeof window !== 'undefined') window.__lottoEventsSetup = true;

    try { setupGeneratorTabEvents(); } catch(e) { console.warn('[setupGeneratorTabEvents]', e); }
    try { setupSimulationEvents(); } catch(e) { console.warn('[setupSimulationEvents]', e); }
    try { setupWheelingTab(); } catch(e) { console.warn('[setupWheelingTab]', e); }
    try { setupEvolutionButton(); } catch(e) { console.warn('[setupEvolutionButton]', e); }
    try { setupPredictionReport(); } catch(e) { console.warn('[setupPredictionReport]', e); }
    try { setupQuickView(); } catch(e) { console.warn('[setupQuickView]', e); }
    try { setupManualLedgerModal(); } catch(e) { console.warn('[setupManualLedgerModal]', e); }
    try { setupManualDrawModal(); } catch(e) { console.warn('[setupManualDrawModal]', e); }
    try { setupSyncEvents(); } catch(e) { console.warn('[setupSyncEvents]', e); }
}

// Global robust document-level tab click delegation (handles icons, spans, dynamic buttons)
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn && btn.dataset && btn.dataset.tab) {
            e.preventDefault();
            switchLottoTab(btn.dataset.tab);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAllLottoEvents);
    } else {
        setupAllLottoEvents();
    }
}

if (typeof window !== 'undefined') {
    window.setupAllLottoEvents = setupAllLottoEvents;
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
    window.toggleReceiptLock = toggleReceiptLock;
    window.toggleRoundLock = toggleRoundLock;
    window.parseDonghangLotteryQrUrl = parseDonghangLotteryQrUrl;
    window.syncPurchaseWithQrUrl = syncPurchaseWithQrUrl;
    window.getSafeActualDraw = getSafeActualDraw;
    window.getUserPurchasesForRound = getUserPurchasesForRound;
    window.calculateLedgerFinancials = calculateLedgerFinancials;
    window.calculateAllUsersTotalFinancials = calculateAllUsersTotalFinancials;
    window.resetLottoServiceState = resetLottoServiceState;
}
