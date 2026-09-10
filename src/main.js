import { checkAuthOnLoad, setupAuthEvents, SafeAuth, getUserPermissions } from './shared/auth-mgmt.js';
import { initLottoService, switchLottoTab } from './services/lotto/index.js';
import { initTotoService } from './services/toto/index.js';
import { renderLandingDashboard } from './shared/landing-dashboard.js';

function _switchPage(show) {
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
}
window._switchPage = _switchPage;

window.showLanding = function() {
    _switchPage('landingPage');
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

window.showToto = function() {
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
    if (authId) {
        const getPerms = typeof getUserPermissions === 'function' ? getUserPermissions : (window.getUserPermissions || (() => ({ allowToto: true })));
        const perms = getPerms(authId);
        if (!perms.allowToto) {
            alert('⛔ [이용 권한 제한]\n\n토토/프로토 AI 추천 프로그램 이용 권한이 부여되지 않은 계정입니다.\n관리자에게 이용 권한을 요청해주세요.');
            return;
        }
    }

    _switchPage('totoPage');
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

window.showLotto = function(targetTab = 'tab-generator') {
    const authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get) ? SafeAuth.get() : ((window.SafeAuth && window.SafeAuth.get) ? window.SafeAuth.get() : null);
    if (authId) {
        const getPerms = typeof getUserPermissions === 'function' ? getUserPermissions : (window.getUserPermissions || (() => ({ allowLotto: true })));
        const perms = getPerms(authId);
        if (!perms.allowLotto) {
            alert('⛔ [이용 권한 제한]\n\n로또 6/45 프로그램 이용 권한이 부여되지 않은 계정입니다.\n관리자에게 이용 권한을 요청해주세요.');
            return;
        }
    }

    _switchPage('appContainer');
    try {
        if (typeof initLottoService === 'function') {
            initLottoService();
        } else if (typeof window.initLottoService === 'function') {
            window.initLottoService();
        }
    } catch(e) {
        console.warn('[Lotto Safe Load Exception]', e);
    }

    try {
        const currentActive = document.querySelector('#appContainer .tab-content.active');
        const activeId = (currentActive && currentActive.id) ? currentActive.id : targetTab;
        if (typeof switchLottoTab === 'function') {
            switchLottoTab(activeId || 'tab-generator');
        } else if (typeof window.switchTab === 'function') {
            window.switchTab(activeId || 'tab-generator');
        }
    } catch(e) {
        console.warn('[Lotto Tab Switch Exception]', e);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function runInit() {
    console.log('[System] Initializing decoupled independent services...');
    try {
        if (typeof window.updateAppVersionBadges === 'function') {
            window.updateAppVersionBadges();
        }
    } catch(e) {}

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
            checkAuthOnLoad(initLottoService);
            setupAuthEvents(initLottoService);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}

