import { checkAuthOnLoad, setupAuthEvents } from './shared/auth-mgmt.js';
import { initLottoService } from './services/lotto/index.js';
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
    if (typeof showToast === 'function') {
        showToast('🚀 [서비스 준비 중] 토토/프로토 AI 분석 서비스는 현재 고도화 작업 중이며 추후 오픈 예정입니다.');
    } else if (typeof window.showToast === 'function') {
        window.showToast('🚀 [서비스 준비 중] 토토/프로토 AI 분석 서비스는 현재 고도화 작업 중이며 추후 오픈 예정입니다.');
    } else {
        alert('🚀 [서비스 준비 중] 토토/프로토 AI 분석 서비스는 현재 고도화 작업 중이며 추후 오픈 예정입니다.');
    }
};

window.showLotto = function() {
    _switchPage('appContainer');
    try {
        if (typeof initLottoService === 'function' && !window.__lottoInitialized) {
            initLottoService();
        } else if (typeof window.initLottoService === 'function' && !window.__lottoInitialized) {
            window.initLottoService();
        }
    } catch(e) {
        console.warn('[Lotto Safe Load Exception]', e);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

function runInit() {
    console.log('[System] Initializing decoupled independent services...');

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

