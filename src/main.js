import { checkAuthOnLoad, setupAuthEvents, SafeAuth, getUserPermissions } from './shared/auth-mgmt.js';
import { initLottoService } from './services/lotto/index.js';
import { initTotoService } from './services/toto/index.js';
import { renderLandingDashboard } from './shared/landing-dashboard.js';
import { showToast } from './shared/utils.js';
import { reconnectFirebaseNetwork } from './shared/db.js';

let _lastBackPressTime = 0;

function _closeAnyActiveModal() {
    // 0. Mandatory Pledge Modal - Strict Gate (Cannot be dismissed via back key / ESC / global click)
    const mandatoryModal = document.getElementById('mandatoryPledgeModal');
    if (mandatoryModal && (mandatoryModal.classList.contains('active') || mandatoryModal.style.display === 'flex' || mandatoryModal.style.display === 'block')) {
        return true; // Strictly block dismissal
    }

    // 1. Donghang verify modal
    const donghangModal = document.getElementById('donghangVerifyModal');
    if (donghangModal && (donghangModal.classList.contains('active') || donghangModal.style.display === 'flex')) {
        if (typeof window.closeDonghangVerifyModal === 'function') {
            window.closeDonghangVerifyModal();
        } else {
            donghangModal.classList.remove('active');
            donghangModal.style.display = 'none';
            if (document.body) document.body.style.overflow = '';
        }
        return true;
    }

    // 2. All visible modals / overlays
    const modalSelectors = [
        '#agreementModalOverlay',
        '#modalReceiptTrash',
        '#winningHistoryModal',
        '#modalQuickView',
        '#modalManual',
        '#modalManualDraw',
        '#modalSnapshotAudit',
        '#modalBudgetOptimizer',
        '#userMgmtModal',
        '#memberManageModal',
        '#kakaoMessageConsentModal'
    ];

    const isAuth = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? !!SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? !!window.SafeAuth.get() : false);
    if (isAuth) {
        modalSelectors.unshift('#loginModalOverlay');
    }

    for (const sel of modalSelectors) {
        const el = document.querySelector(sel);
        if (el && el.style.display !== 'none' && el.style.display !== '' && !el.classList.contains('hidden')) {
            const closeBtn = el.querySelector('.btn-close, .modal-close, [data-dismiss="modal"], .btn-close-receipt-trash, #btnCloseLoginModal, #btnCloseQuickView, .btn-close-user-mgmt');
            if (closeBtn && typeof closeBtn.click === 'function') {
                closeBtn.click();
            } else {
                el.style.display = 'none';
                el.classList.remove('active');
            }
            return true;
        }
    }
    return false;
}

function getCurrentActivePage() {
    const lotto = document.getElementById('appContainer');
    const toto = document.getElementById('totoPage');
    if (lotto && (lotto.classList.contains('active') || lotto.style.display === 'flex' || lotto.style.display === 'block')) return 'lotto';
    if (toto && (toto.classList.contains('active') || toto.style.display === 'flex' || toto.style.display === 'block')) return 'toto';
    return 'landing';
}

function _switchPage(show, pushHistory = true) {
    var ids = ['landingPage', 'totoPage', 'appContainer'];
    ids.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === show) {
            el.classList.add('active');
            if (id === 'landingPage' || id === 'appContainer') {
                el.style.setProperty('display', 'flex', 'important');
            } else {
                el.style.setProperty('display', 'block', 'important');
            }
        } else {
            el.classList.remove('active');
            el.style.setProperty('display', 'none', 'important');
        }
    });

    if (pushHistory && typeof history !== 'undefined' && history.pushState) {
        try {
            const hash = show === 'landingPage' ? '#home' : (show === 'appContainer' ? '#lotto' : '#toto');
            const page = show === 'landingPage' ? 'landing' : (show === 'appContainer' ? 'lotto' : 'toto');
            if (window.location.hash !== hash) {
                history.pushState({ page: page }, '', hash);
            }
        } catch(e) {}
    }
}
window._switchPage = _switchPage;

window.showLanding = function(pushHistory = true) {
    _switchPage('landingPage', pushHistory);
    try {
        if (typeof window.updateAppVersionBadges === 'function') {
            window.updateAppVersionBadges();
        }
        if (typeof renderLandingDashboard === 'function') {
            renderLandingDashboard();
        } else if (typeof window.renderLandingDashboard === 'function') {
            window.renderLandingDashboard();
        }
    } catch(e) {
        console.warn('[Landing Safe Load Exception]', e);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.showToto = function(pushHistory = true) {
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
    if (authId) {
        const getPerms = typeof getUserPermissions === 'function' ? getUserPermissions : (window.getUserPermissions || (() => ({ allowToto: true })));
        const perms = getPerms(authId);
        if (!perms.allowToto) {
            alert('⛔ [이용 권한 제한]\n\n토토/프로토 AI 추천 프로그램 이용 권한이 부여되지 않은 계정입니다.\n관리자에게 이용 권한을 요청해주세요.');
            return;
        }
    }

    _switchPage('totoPage', pushHistory);
    try {
        if (typeof renderTotoDashboard === 'function') {
            renderTotoDashboard();
        } else if (typeof window.renderTotoDashboard === 'function') {
            window.renderTotoDashboard();
        }
    } catch(e) {
        console.warn('[Toto Safe Load Exception]', e);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.showLotto = function(pushHistory = true) {
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
    if (authId) {
        const getPerms = typeof getUserPermissions === 'function' ? getUserPermissions : (window.getUserPermissions || (() => ({ allowLotto: true })));
        const perms = getPerms(authId);
        if (!perms.allowLotto) {
            alert('⛔ [이용 권한 제한]\n\n로또 6/45 프로그램 이용 권한이 부여되지 않은 계정입니다.\n관리자에게 이용 권한을 요청해주세요.');
            return;
        }
    }

    _switchPage('appContainer', pushHistory);
    try {
        if (typeof switchLottoTab === 'function') {
            switchLottoTab('tab-generator');
        } else if (typeof window !== 'undefined' && typeof window.switchLottoTab === 'function') {
            window.switchLottoTab('tab-generator');
        } else if (typeof initLottoService === 'function') {
            initLottoService();
        } else if (typeof window !== 'undefined' && typeof window.initLottoService === 'function') {
            window.initLottoService();
        }
    } catch(e) {
        console.warn('[Lotto Safe Load Exception]', e);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function setupMobileBackNavigation() {
    if (typeof window === 'undefined' || typeof history === 'undefined') return;

    // Set initial baseline history state
    try {
        const curPage = getCurrentActivePage();
        history.replaceState({ page: curPage }, '', curPage === 'landing' ? '#home' : '#' + curPage);
    } catch(e) {}

    window.addEventListener('popstate', function(e) {
        // 1. If any modal is active, close the modal first and stay on the current page
        if (_closeAnyActiveModal()) {
            const cur = getCurrentActivePage();
            try {
                history.pushState({ page: cur }, '', cur === 'landing' ? '#home' : '#' + cur);
            } catch(err) {}
            return;
        }

        const curPage = getCurrentActivePage();

        // 2. If in Lotto or Toto sub-page -> navigate back to Home (Landing)
        if (curPage === 'lotto' || curPage === 'toto') {
            window.showLanding(false);
            try {
                history.pushState({ page: 'landing' }, '', '#home');
            } catch(err) {}
            return;
        }

        // 3. If already on Home (landingPage) -> Double back to exit
        if (curPage === 'landing') {
            const now = Date.now();
            if (now - _lastBackPressTime < 2000) {
                // Exit app: do nothing to let default browser back/close occur
                return;
            } else {
                _lastBackPressTime = now;
                // Keep landing page state to prevent immediate unexpected exit on first press
                try {
                    history.pushState({ page: 'landing' }, '', '#home');
                } catch(err) {}
                const msg = "📱 '뒤로가기'를 한 번 더 누르면 앱이 종료됩니다.";
                if (typeof showToast === 'function') {
                    showToast(msg);
                } else if (typeof window.showToast === 'function') {
                    window.showToast(msg);
                }
            }
        }
    });
}

function runInit() {
    console.log('[System] Initializing decoupled independent services...');

    // 0. Auto Cache-Bust on version mismatch
    try {
        const curAppVer = (typeof window !== 'undefined' && window.APP_VERSION) ? window.APP_VERSION : 'latest';
        const lastSavedVer = localStorage.getItem('lucky777_last_app_version');
        if (lastSavedVer !== curAppVer) {
            console.log(`[Version Sync] App version update detected (${lastSavedVer} -> ${curAppVer}). Purging stale caches...`);
            localStorage.removeItem('lotto_all_users_list_cache');
            if (typeof window !== 'undefined' && typeof window.clearUser70ReviewCache === 'function') {
                window.clearUser70ReviewCache();
            }
            localStorage.setItem('lucky777_last_app_version', curAppVer);
        }
    } catch(e) {}

    try {
        if (typeof window.updateAppVersionBadges === 'function') {
            window.updateAppVersionBadges();
        }
    } catch(e) {}

    // Initialize Mobile Back Button Navigation Handler
    try {
        setupMobileBackNavigation();
    } catch(e) {
        console.warn('[Mobile Back Nav Init Error]', e);
    }

    // 1. Initialize Toto Service (Independent Sandbox)
    setTimeout(() => {
        try {
            initTotoService();
            window.__totoInitialized = true;
        } catch(e) {
            console.error('[Toto Service Init Error - Isolated]:', e);
        }
    }, 0);

    // 2. Initialize Lotto Service & Auth (Independent Sandbox)
    setTimeout(() => {
        try {
            setupAuthEvents(initLottoService);
            checkAuthOnLoad(initLottoService);
        } catch(e) {
            console.error('[Lotto Auth/Service Init Error - Isolated]:', e);
        }
    }, 10);

    // 3. Render Landing Dashboard (Independent Sandbox)
    setTimeout(() => {
        try {
            if (typeof renderLandingDashboard === 'function') {
                renderLandingDashboard();
            }
        } catch(e) {
            console.error('[Landing Dashboard Init Error - Isolated]:', e);
        }
    }, 20);
}

function handleAppResumeAndWakeup() {
    // 1. Immediately revive Firestore network connection (eliminates mobile sleep/background lag)
    if (typeof reconnectFirebaseNetwork === 'function') {
        reconnectFirebaseNetwork();
    } else if (typeof window.reconnectFirebaseNetwork === 'function') {
        window.reconnectFirebaseNetwork();
    } else if (window.db && typeof window.db.enableNetwork === 'function') {
        try { window.db.enableNetwork(); } catch(e) {}
    }

    // 2. Render Landing UI immediately from cache (0ms instant response)
    if (typeof renderLandingDashboard === 'function') {
        try { renderLandingDashboard(); } catch(e) {}
    }

    // 3. Fast non-blocking version cross-check
    if (typeof window.checkLatestBuildVersion === 'function') {
        try { window.checkLatestBuildVersion(true); } catch(e) {}
    }

    // 4. If logged in but login modal is lingering, re-verify auth
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : null;
    const loginModal = document.getElementById('loginModalOverlay');
    const isModalVisible = loginModal && loginModal.style.display !== 'none' && !loginModal.classList.contains('hidden');
    if (authId && isModalVisible) {
        setTimeout(() => {
            try { checkAuthOnLoad(initLottoService); } catch(e) {}
        }, 50);
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInit);
    } else {
        runInit();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            handleAppResumeAndWakeup();
        }
    });

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleAppResumeAndWakeup, { passive: true });
        window.addEventListener('pageshow', handleAppResumeAndWakeup, { passive: true });
        window.addEventListener('online', handleAppResumeAndWakeup, { passive: true });
    }
}

