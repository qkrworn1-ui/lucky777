import { showToast } from './utils.js';

export const THEME_KEY = 'lucky777_theme';

export function getStoredThemePreference() {
    try {
        return localStorage.getItem(THEME_KEY) || 'system';
    } catch(e) {
        return 'system';
    }
}

export function getSystemPreferredTheme() {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}

export function getCurrentTheme() {
    if (typeof document !== 'undefined') {
        const attr = document.documentElement.getAttribute('data-theme');
        if (attr) return attr;
    }
    const pref = getStoredThemePreference();
    if (pref === 'light' || pref === 'dark') return pref;
    return getSystemPreferredTheme();
}

export function getChartThemeColors() {
    const isLight = getCurrentTheme() === 'light';
    return {
        isLight,
        textColor: isLight ? '#334155' : '#cbd5e1',
        mutedColor: isLight ? '#64748b' : '#94a3b8',
        gridColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.06)',
        borderColor: isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.8)',
        investColor: isLight ? '#64748b' : '#cbd5e1'
    };
}

export function updateThemeToggleIcons(theme) {
    if (typeof document === 'undefined') return;
    const buttons = document.querySelectorAll('.btn-theme-toggle');
    buttons.forEach(btn => {
        if (theme === 'light') {
            btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            btn.setAttribute('title', '다크 모드로 전환');
            btn.setAttribute('aria-label', '다크 모드로 전환');
        } else {
            btn.innerHTML = '<i class="fa-solid fa-sun" style="color: #fbbf24;"></i>';
            btn.setAttribute('title', '화이트 모드로 전환');
            btn.setAttribute('aria-label', '화이트 모드로 전환');
        }
    });
}

export function applyTheme(theme, notify = false) {
    if (typeof document === 'undefined') return;
    const targetTheme = (theme === 'light' || theme === 'dark') 
        ? theme 
        : getSystemPreferredTheme();

    document.documentElement.setAttribute('data-theme', targetTheme);
    if (targetTheme === 'light') {
        document.documentElement.classList.add('theme-light');
        if (document.body) document.body.classList.add('theme-light');
    } else {
        document.documentElement.classList.remove('theme-light');
        if (document.body) document.body.classList.remove('theme-light');
    }

    updateThemeToggleIcons(targetTheme);

    // Update Chart.js global defaults if Chart is loaded
    if (typeof window !== 'undefined' && window.Chart && window.Chart.defaults) {
        try {
            const isLight = (targetTheme === 'light');
            window.Chart.defaults.color = isLight ? '#334155' : '#cbd5e1';
            window.Chart.defaults.borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
        } catch(e) {}
    }

    // Notify listeners (Chart.js, Canvas, etc.)
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: targetTheme } }));

        // Refresh Landing view if active
        try {
            const landingView = document.getElementById('landingView');
            if (landingView && landingView.style.display !== 'none' && typeof window.renderLandingDashboard === 'function') {
                window.renderLandingDashboard();
            }
        } catch(e) {}

        // Refresh Active Tab in Lotto view if active
        try {
            const activeTabBtn = document.querySelector('.tab-btn.active');
            if (activeTabBtn && activeTabBtn.dataset && activeTabBtn.dataset.tab) {
                const tabId = activeTabBtn.dataset.tab;
                if (tabId === 'tab-confirmed-list' && typeof window.renderConfirmedPurchasesList === 'function') {
                    window.renderConfirmedPurchasesList();
                } else if (tabId === 'tab-review' && typeof window.renderReviewTab === 'function') {
                    window.renderReviewTab();
                } else if (tabId === 'tab-dashboard' && typeof window.renderDashboardCharts === 'function') {
                    window.renderDashboardCharts();
                }
            }
        } catch(e) {}
    }

    if (notify && typeof showToast === 'function') {
        if (targetTheme === 'light') {
            showToast('☀️ 화이트 테마가 적용되었습니다.');
        } else {
            showToast('🌙 다크 테마가 적용되었습니다.');
        }
    }
}

export function setTheme(theme, persist = true, notify = false) {
    if (persist) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch(e) {}
    }
    applyTheme(theme, notify);
}

export function toggleTheme(notify = true) {
    const current = getCurrentTheme();
    const next = (current === 'light') ? 'dark' : 'light';
    setTheme(next, true, notify);
    return next;
}

export function initTheme() {
    if (typeof window === 'undefined') return;
    const pref = getStoredThemePreference();
    applyTheme(pref, false);

    // Watch OS system preference changes
    try {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
            mediaQuery.addEventListener('change', () => {
                if (getStoredThemePreference() === 'system') {
                    applyTheme('system', false);
                }
            });
        }
    } catch(e) {}

    // Expose to window
    window.ThemeManager = {
        getTheme: getCurrentTheme,
        setTheme,
        toggleTheme,
        initTheme,
        applyTheme,
        getStoredThemePreference,
        getChartThemeColors
    };
    window.toggleTheme = toggleTheme;
    window.getChartThemeColors = getChartThemeColors;
}

// Auto-run on load
if (typeof window !== 'undefined') {
    initTheme();
}
