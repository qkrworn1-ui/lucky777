import { renderTotoDashboard } from './views/toto-dashboard.js';
import { getTotoState } from './state.js';
import { scrapeLatestTotoFixtures } from './scraper.js';

export function initTotoService() {
    console.log('[Toto Service] Initializing Toto / Proto Sports Analytics Engine...');
    
    window.renderTotoDashboard = renderTotoDashboard;
    window.scrapeLatestTotoFixtures = scrapeLatestTotoFixtures;
    
    // Attach global showToto navigation (Temporarily paused for upcoming launch)
    window.showToto = function() {
        const msg = '🚀 [서비스 준비 중] 토토/프로토 AI 분석 서비스는 현재 고도화 작업 중이며 추후 오픈 예정입니다.';
        if (typeof showToast === 'function') showToast(msg);
        else if (typeof window.showToast === 'function') window.showToast(msg);
        else alert(msg);
    };

    // Render dashboard if #totoPage is active on page load
    const totoContainer = document.getElementById('totoPage');
    if (totoContainer && (totoContainer.classList.contains('active') || totoContainer.style.display === 'block')) {
        renderTotoDashboard();
    }
}
