import { renderTotoDashboard } from './views/toto-dashboard.js';
import { getTotoState } from './state.js';
import { scrapeLatestTotoFixtures } from './scraper.js';

export function initTotoService() {
    console.log('[Toto Service] Initializing Toto / Proto Sports Analytics Engine...');
    
    window.renderTotoDashboard = renderTotoDashboard;
    window.scrapeLatestTotoFixtures = scrapeLatestTotoFixtures;
    
    // Attach global showToto navigation (Active for Beta Testing)
    window.showToto = function() {
        const authId = (window.SafeAuth && typeof window.SafeAuth.get === 'function') ? window.SafeAuth.get() : null;
        if (authId) {
            const getPerms = (typeof window.getUserPermissions === 'function') ? window.getUserPermissions : (() => ({ allowToto: true }));
            const perms = getPerms(authId);
            if (!perms.allowToto) {
                alert('⛔ [이용 권한 제한]\n\n토토/프로토 AI 추천 프로그램 이용 권한이 부여되지 않은 계정입니다.\n관리자에게 이용 권한을 요청해주세요.');
                return;
            }
        }

        if (typeof window._switchPage === 'function') {
            window._switchPage('totoPage');
        } else {
            var ids = ['landingPage', 'totoPage', 'appContainer'];
            ids.forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                if (id === 'totoPage') {
                    el.classList.add('active');
                    el.style.setProperty('display', 'block', 'important');
                } else {
                    el.classList.remove('active');
                    el.style.setProperty('display', 'none', 'important');
                }
            });
        }
        try {
            renderTotoDashboard();
        } catch(e) {
            console.warn('[Toto Render Exception]', e);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Render dashboard if #totoPage is active on page load
    const totoContainer = document.getElementById('totoPage');
    if (totoContainer && (totoContainer.classList.contains('active') || totoContainer.style.display === 'block')) {
        renderTotoDashboard();
    }
}
