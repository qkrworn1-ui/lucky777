import { state, initHistory } from './state.js';
import { recalculateGroups } from './statistics.js';
import { db } from '../../shared/db.js';
import { showToast } from '../../shared/utils.js';
import { updateDebugMonitor, SafeAuth, isAdminUser } from '../../shared/auth-mgmt.js';
import { renderLatestDrawBanner } from './views/draw-banner.js';
import { renderTop5Combinations, updateSavedCount, renderSavedList, setupGeneratorTabEvents, updateTop7AlgoUI, resetGeneratorAdminViewingUser } from './views/generator-tab.js';
import { populateSimRoundSelector, renderSimulationTab, setupSimulationEvents } from './views/simulation-tab.js';
import { renderWheelingSelector, renderWheelingResults, setupWheelingTab } from './views/wheeling.js';
import { renderVerificationTab, setupEvolutionButton } from './views/verification.js';
import { renderDashboardCharts, renderFortuneAdvisorCard } from './views/dashboard-tab.js';
import { renderReviewTab, renderReviewDetail, resetReviewAdminViewingUser } from './views/review-tab.js';
import { renderAlgorithmsTab, resetAlgoAdminViewingUser } from './views/algorithms-tab.js';
import { renderConfirmedPurchasesList } from './views/confirmed-tab.js';
import { setupPredictionReport } from './views/prediction-report.js';
import { setupQuickView } from './views/quick-view.js';
import { setupManualLedgerModal, updateManualModalCrossCheck } from './views/manual-modal.js';
import { setupManualDrawModal } from './views/manual-draw-modal.js';
import { setupSnapshotAuditEvents, openSnapshotAuditModal, closeSnapshotAuditModal, renderSnapshotAuditView } from './views/snapshot-audit-modal.js';
import { autoSyncMissingDraws, setupSyncEvents } from './views/sync.js';
import { computeAbsoluteTop10Combinations } from './generator.js';
import { getLedger, getUserPurchasesForRound, calculateLedgerFinancials, calculateAllUsersTotalFinancials, getSafeActualDraw, saveToLedger, exportLedgerToFile, importLedgerFromFile, clearEntireLedger, getReceiptTrashList, saveReceiptTrashList, moveToReceiptTrash, restoreFromReceiptTrash, permanentDeleteFromReceiptTrash, emptyEntireReceiptTrash, fetchReceiptTrash, getReceiptCombosFingerprint, toggleReceiptLock, toggleRoundLock, normalizeMaster1239Order, parseDonghangLotteryQrUrl, syncPurchaseWithQrUrl, getUserConfirmedRoundNumbers, formatConfirmedRoundLabel } from './ledger.js';

let _isLottoInitializing = false;
let _lottoInitPromise = null;
let _activePurchasesUnsub = null;
let _activeExtraHistoryUnsub = null;
let _activeAppStateUnsub = null;
let _activePurchasesAuthId = null;
let _activeLottoAuthId = null;

export function resetLottoServiceState() {
    window.__lottoInitialized = false;
    _isLottoInitializing = false;
    _lottoInitPromise = null;
    if (_activePurchasesUnsub) {
        try { _activePurchasesUnsub(); } catch(e) {}
        _activePurchasesUnsub = null;
    }
    _activePurchasesAuthId = null;
    _activeLottoAuthId = null;
    state.fixedTop5Combinations_v3 = [];
    state.fixedTop5Combinations_v3_userId = null;
    state.fixedTop5Combinations_v3_round = null;
    state.fixedTop5Combinations_v4 = [];
    state.fixedTop5Combinations_v4_userId = null;
    state.fixedTop5Combinations_v4_round = null;
    state.fixedTop5Combinations = [];
}

export async function initLottoService(force = false) {
    window.initLottoService = initLottoService;
    window.resetLottoServiceState = resetLottoServiceState;
    const currentAuthId = (SafeAuth.get() || '').trim().toLowerCase();

    // If user changed or force re-init requested, clean previous active listener
    if (force || (_activeLottoAuthId !== null && _activeLottoAuthId !== currentAuthId)) {
        resetLottoServiceState();
    }
    _activeLottoAuthId = currentAuthId;

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

            // Restore preference for V4 algorithm checkbox (Default: TRUE for V4.0)
            const chkReportLogicEarly = document.getElementById('chkUseV4ReportLogic');
            if (chkReportLogicEarly) {
                const savedPref = localStorage.getItem('lotto_pref_v4');
                if (savedPref !== null) {
                    chkReportLogicEarly.checked = (savedPref === 'true');
                } else {
                    chkReportLogicEarly.checked = true;
                    localStorage.setItem('lotto_pref_v4', 'true');
                }
            }

            // ⚡ Immediate baseline synchronous generation & rendering (Zero waiting time for 10 combos & admin banner)
            try {
                const earlyUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1243);
                const effectiveAuth = currentAuthId || 'guest';
                const isV3EarlyValid = (state.fixedTop5Combinations_v3 && state.fixedTop5Combinations_v3.length === 10 &&
                    state.fixedTop5Combinations_v3_userId === effectiveAuth && state.fixedTop5Combinations_v3_round === earlyUpcomingRound);
                if (!isV3EarlyValid) {
                    state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(false, earlyUpcomingRound, 'v3', true, effectiveAuth);
                    state.fixedTop5Combinations_v3_userId = effectiveAuth;
                    state.fixedTop5Combinations_v3_round = earlyUpcomingRound;
                }
                const isV4EarlyValid = (state.fixedTop5Combinations_v4 && state.fixedTop5Combinations_v4.length === 10 &&
                    state.fixedTop5Combinations_v4_userId === effectiveAuth && state.fixedTop5Combinations_v4_round === earlyUpcomingRound);
                if (!isV4EarlyValid) {
                    state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(false, earlyUpcomingRound, 'v4', true, effectiveAuth);
                    state.fixedTop5Combinations_v4_userId = effectiveAuth;
                    state.fixedTop5Combinations_v4_round = earlyUpcomingRound;
                }
                const useV4Early = chkReportLogicEarly ? chkReportLogicEarly.checked : true;
                state.fixedTop5Combinations = useV4Early ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3;

                renderLatestDrawBanner();
                renderTop5Combinations(false);
                updateTop7AlgoUI();
                updateSavedCount();
                renderSavedList();
            } catch (earlyErr) {
                console.warn('[Early Lotto Render Warning]', earlyErr);
            }

            const statusIndicator = document.getElementById('serverStatusIndicator');
            const statusText = document.getElementById('serverStatusText');
            const statusBadge = document.getElementById('serverStatusBadge');

            if (statusBadge && !statusBadge.__clickBound) {
                statusBadge.__clickBound = true;
                statusBadge.style.cursor = 'pointer';
                statusBadge.setAttribute('title', '서버 접속 상태 확인 (클릭 시 최근 접속시간 안내)');
                statusBadge.onclick = (e) => {
                    e.stopPropagation();
                    const isOnline = !!window.db;
                    const cTime = window.__lastServerConnectTimeStr || new Date().toLocaleTimeString('ko-KR');
                    if (typeof showToast === 'function') {
                        showToast(isOnline ? `🟢 Firestore 서버 정상 연결됨\n⏱️ 최근 접속시간: ${cTime}` : '🔴 서버 미연결 (로컬 캐시 모드)');
                    }
                };
            }

            if (!window.db) {
                console.error("Firebase not initialized.");
                state.lottoExtraHistory = {};
                state.savedCombinations = [];
                const mDot = document.getElementById('mobileServerStatusDot');
                const mText = document.getElementById('mobileServerStatusText');
                if (mDot) { mDot.style.background = '#ef4444'; mDot.style.boxShadow = '0 0 6px #ef4444'; }
                if (mText) { mText.textContent = '오프라인'; mText.style.color = '#f87171'; }
                if (typeof window.updateServerConnectionStatus === 'function') {
                    window.updateServerConnectionStatus(false);
                }
            } else {
                if (statusIndicator) { statusIndicator.style.background = '#10b981'; statusIndicator.style.boxShadow = '0 0 8px #10b981'; }
                if (statusText) statusText.textContent = 'DB 접속 완료 (Cloud)';
                const mDot = document.getElementById('mobileServerStatusDot');
                const mText = document.getElementById('mobileServerStatusText');
                if (mDot) { mDot.style.background = '#10b981'; mDot.style.boxShadow = '0 0 6px #10b981'; }
                if (mText) { mText.textContent = '서버 정상'; mText.style.color = '#6ee7b7'; }
                if (typeof window.updateServerConnectionStatus === 'function') {
                    window.updateServerConnectionStatus(true);
                }

                // Initial background sync for receipt trash
                fetchReceiptTrash().catch(() => {});

                const authId = (SafeAuth.get() || '').trim().toLowerCase();
                // ⚡ 0ms 즉시 복원: 서버 응답 대기 없이 로컬 캐시에서 내 실구매 장부 즉각 로드 (모바일 실구매 당첨이력 지연 0초 해결)
                try {
                    const cachedMyLedger = localStorage.getItem(`lotto_actual_ledger_${authId}`);
                    if (cachedMyLedger) {
                        state.globalLedger = JSON.parse(cachedMyLedger);
                    } else {
                        state.globalLedger = {};
                    }
                } catch(e) {
                    state.globalLedger = {};
                }
                state.ledgerFinancialsCache = null;
                state.allUsersMergedLedger = null;

                if (authId && window.db) {
                    // ⚡ 0ms 즉시 복원: IndexedDB 로컬 캐시에서 즉시 doc(authId) 읽어 실구매 장부 선행 반영
                    window.db.collection('lotto_purchases').doc(authId).get({ source: 'cache' }).then(cDoc => {
                        if (cDoc && cDoc.exists) {
                            const cLedger = cDoc.data()?.ledger || {};
                            if (cLedger && Object.keys(cLedger).length > 0) {
                                state.globalLedger = cLedger;
                                try { localStorage.setItem(`lotto_actual_ledger_${authId}`, JSON.stringify(cLedger)); } catch(e) {}
                                if (typeof window.renderLandingDashboard === 'function') {
                                    window.renderLandingDashboard();
                                }
                            }
                        }
                    }).catch(() => {});

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
                if (Array.isArray(stateDoc.extraPacks)) state.extraPacks = stateDoc.extraPacks;
            } else {
                state.fixedTop5Combinations = [];
                state.fixedTop5Combinations_v3 = [];
                state.fixedTop5Combinations_v3_userId = null;
                state.fixedTop5Combinations_v3_round = null;
                state.fixedTop5Combinations_v4 = [];
                state.fixedTop5Combinations_v4_userId = null;
                state.fixedTop5Combinations_v4_round = null;
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
                    if (Array.isArray(data.extraPacks)) {
                        state.extraPacks = data.extraPacks;
                        changed = true;
                    }

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

    // Initialize v3 and v4 current week recommendations for effective user if missing
    const effectiveAuth = currentAuthId || 'guest';
    const isV3Valid = (state.fixedTop5Combinations_v3 && state.fixedTop5Combinations_v3.length === 10 &&
        state.fixedTop5Combinations_v3_userId === effectiveAuth && state.fixedTop5Combinations_v3_round === curUpcomingRound);
    if (!isV3Valid) {
        state.fixedTop5Combinations_v3 = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v3', true, effectiveAuth);
        state.fixedTop5Combinations_v3_userId = effectiveAuth;
        state.fixedTop5Combinations_v3_round = curUpcomingRound;
    }
    const isV4Valid = (state.fixedTop5Combinations_v4 && state.fixedTop5Combinations_v4.length === 10 &&
        state.fixedTop5Combinations_v4_userId === effectiveAuth && state.fixedTop5Combinations_v4_round === curUpcomingRound);
    if (!isV4Valid) {
        state.fixedTop5Combinations_v4 = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v4', true, effectiveAuth);
        state.fixedTop5Combinations_v4_userId = effectiveAuth;
        state.fixedTop5Combinations_v4_round = curUpcomingRound;
    }

    state.fixedTop5Combinations = (chkReportLogic && chkReportLogic.checked) ? state.fixedTop5Combinations_v4 : state.fixedTop5Combinations_v3;

    renderLatestDrawBanner();
    renderTop5Combinations(false);
    updateTop7AlgoUI();
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

    const landingEl = document.getElementById('landingPage');
    if (landingEl && (landingEl.classList.contains('active') || landingEl.style.display !== 'none')) {
        if (typeof window.renderLandingDashboard === 'function') {
            window.renderLandingDashboard();
        }
    }
        } finally {
            _isLottoInitializing = false;
        }
    })();

    return _lottoInitPromise;
}

let _lottoTabRenderTimer = null;

/**
 * 👑 관리자 전용: 메뉴(탭) 이동 시 모든 탭의 조회 대상을 항상 '관리자 본인' 계정으로 안전하게 자동 복귀
 */
export function resetAdminViewingUserToSelf() {
    try {
        const rawAuth = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((typeof window !== 'undefined' && window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
        let authId = rawAuth || '';
        if (typeof authId === 'string' && authId.startsWith('{')) {
            try {
                const parsed = JSON.parse(authId);
                authId = parsed.userid || parsed.userId || parsed.id || authId;
            } catch(e) {}
        }
        authId = (authId || '').trim();
        const cleanAuth = authId.toLowerCase();
        const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));

        if (isAdmin && authId) {
            if (typeof window !== 'undefined') {
                window.selectedAdminViewingUser = authId;
                window.generatorAdminViewingUser = authId;
                window.algoAdminViewingUser = authId;
                window.reviewAdminViewingUser = authId;
            }
            if (typeof resetGeneratorAdminViewingUser === 'function') {
                resetGeneratorAdminViewingUser(authId);
            } else if (typeof window !== 'undefined' && typeof window.resetGeneratorAdminViewingUser === 'function') {
                window.resetGeneratorAdminViewingUser(authId);
            }
            if (typeof resetReviewAdminViewingUser === 'function') {
                resetReviewAdminViewingUser(authId);
            } else if (typeof window !== 'undefined' && typeof window.resetReviewAdminViewingUser === 'function') {
                window.resetReviewAdminViewingUser(authId);
            }
            if (typeof resetAlgoAdminViewingUser === 'function') {
                resetAlgoAdminViewingUser(authId);
            } else if (typeof window !== 'undefined' && typeof window.resetAlgoAdminViewingUser === 'function') {
                window.resetAlgoAdminViewingUser(authId);
            }
            if (typeof state !== 'undefined') {
                state.adminViewingTarget = 'my';
            }
        }
        return authId;
    } catch(errReset) {
        console.warn('[resetAdminViewingUserToSelf exception]', errReset);
        return null;
    }
}

// Global Lotto Tab Switcher
export function switchLottoTab(target) {
    if (!target) return;

    if (typeof window !== 'undefined') {
        window.__currentLottoTab = target;
    }

    if (!window.__lottoInitialized && typeof initLottoService === 'function') {
        try { initLottoService(); } catch(e){}
    }

    // 🔄 메뉴(탭) 이동 시 항상 '👑 관리자 본인' 계정으로 자동 복귀 (안전 및 사용자 오인 원천 차단)
    resetAdminViewingUserToSelf();

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

    // 2. Update tab buttons active state (Instant 0ms)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => {
        if (b.dataset.tab === target) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // 3. Update tab contents active state (Instant 0ms)
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

    // 4. Safely execute tab-specific render routines (Immediate 0ms render for generator & dashboard, async for heavy tabs)
    if (target === 'tab-generator' && typeof renderTop5Combinations === 'function') {
        try { renderTop5Combinations(false); } catch(e){}
        if (typeof updateTop7AlgoUI === 'function') {
            try { updateTop7AlgoUI(); } catch(e){}
        }
    } else if (target === 'tab-dashboard') {
        if (typeof renderFortuneAdvisorCard === 'function') {
            try { renderFortuneAdvisorCard(); } catch(e){}
        } else if (typeof window.renderFortuneAdvisorCard === 'function') {
            try { window.renderFortuneAdvisorCard(); } catch(e){}
        }
    }

    if (_lottoTabRenderTimer) {
        clearTimeout(_lottoTabRenderTimer);
    }

    if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
            _lottoTabRenderTimer = setTimeout(() => {
                if (typeof window !== 'undefined' && window.__currentLottoTab !== target) {
                    return; // Target changed while waiting, skip stale render
                }

                try {
                    if (target === 'tab-generator') {
                        if (typeof renderTop5Combinations === 'function') renderTop5Combinations(false);
                        if (typeof updateTop7AlgoUI === 'function') updateTop7AlgoUI();
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
            }, 30);
        });
    } else {
        _lottoTabRenderTimer = setTimeout(() => {
            if (typeof window !== 'undefined' && window.__currentLottoTab !== target) {
                return;
            }
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
        }, 30);
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
    try { setupSnapshotAuditEvents(); } catch(e) { console.warn('[setupSnapshotAuditEvents]', e); }
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
    window.initLottoService = initLottoService;
    window.setupAllLottoEvents = setupAllLottoEvents;
    window.switchTab = switchLottoTab;
    window.switchLottoTab = switchLottoTab;
    window.resetAdminViewingUserToSelf = resetAdminViewingUserToSelf;
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
    window.getUserConfirmedRoundNumbers = getUserConfirmedRoundNumbers;
    window.formatConfirmedRoundLabel = formatConfirmedRoundLabel;
    window.calculateAllUsersTotalFinancials = calculateAllUsersTotalFinancials;
    window.resetLottoServiceState = resetLottoServiceState;
    window.openSnapshotAuditModal = openSnapshotAuditModal;
    window.closeSnapshotAuditModal = closeSnapshotAuditModal;
    window.setupSnapshotAuditEvents = setupSnapshotAuditEvents;
    window.renderSnapshotAuditView = renderSnapshotAuditView;
}
