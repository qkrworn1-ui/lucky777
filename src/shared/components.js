import { getBallHexColor, getBallColorClass } from './utils.js';

/**
 * Universal Lotto Ball HTML generator
 * @param {number|string} num - Ball number
 * @param {Object} options - { isHit, isBonusHit, size, extraClass, dim }
 */
export function createBallHtml(num, options = {}) {
    const n = parseInt(num, 10);
    if (isNaN(n)) return '';

    const bg = getBallHexColor(n);
    const colorClass = getBallColorClass(n);
    const size = options.size || 'normal'; // 'mini' (22px), 'small' (26px), 'normal' (34px), 'large' (40px)
    
    let sizeStyle = '';
    if (size === 'mini') sizeStyle = 'width: 22px; height: 22px; line-height: 22px; font-size: 0.72rem;';
    else if (size === 'small') sizeStyle = 'width: 26px; height: 26px; line-height: 26px; font-size: 0.75rem;';
    else if (size === 'large') sizeStyle = 'width: 42px; height: 42px; line-height: 42px; font-size: 1.1rem;';

    let borderStyle = '';
    if (options.isHit) {
        borderStyle = 'border: 2px solid #fbbf24; font-weight: 800; transform: scale(1.05); box-shadow: 0 0 6px rgba(251,191,36,0.6);';
    } else if (options.isBonusHit) {
        borderStyle = 'border: 2px solid #69c8f2; font-weight: 800; transform: scale(1.05); box-shadow: 0 0 6px rgba(105,200,242,0.6);';
    } else if (options.dim) {
        borderStyle = 'opacity: 0.4;';
    }

    return `<span class="lotto-ball ${colorClass} ${options.extraClass || ''}" style="background: ${bg}; ${sizeStyle} ${borderStyle} text-align: center; border-radius: 50%; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: bold;">${n}</span>`;
}

/**
 * Render an entire set of 6 numbers (+ optional bonus)
 */
export function renderBallRow(numbers, bonus = null, options = {}) {
    if (!Array.isArray(numbers)) return '';
    
    const winningSet = options.winningSet || (options.actualDraw ? new Set(options.actualDraw.numbers) : null);
    const actualBonus = options.actualBonus || (options.actualDraw ? options.actualDraw.bonus : null);

    const balls = numbers.map(n => {
        const isHit = winningSet ? winningSet.has(n) : false;
        const dim = winningSet && !isHit;
        return createBallHtml(n, { ...options, isHit, dim });
    }).join('');

    let bonusHtml = '';
    if (bonus !== null && bonus !== undefined) {
        const isBonusHit = (actualBonus !== null && bonus === actualBonus);
        const dim = actualBonus !== null && !isBonusHit;
        bonusHtml = `
            <span style="font-weight: 800; font-size: 0.8rem; color: #94a3b8; margin: 0 2px;">+</span>
            ${createBallHtml(bonus, { ...options, isBonusHit, dim })}
        `;
    }

    return `<div class="balls-row" style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">${balls}${bonusHtml}</div>`;
}

/**
 * Universal rank badge helper
 */
export function getRankBadge(rank, count = 1) {
    const r = parseInt(rank, 10);
    const rankConfig = {
        1: { name: '1등', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.4)' },
        2: { name: '2등', color: '#69c8f2', bg: 'rgba(105, 200, 242, 0.15)', border: 'rgba(105, 200, 242, 0.4)' },
        3: { name: '3등', color: '#ff7272', bg: 'rgba(255, 114, 114, 0.15)', border: 'rgba(255, 114, 114, 0.4)' },
        4: { name: '4등', color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.4)' },
        5: { name: '5등', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.4)' }
    };

    const cfg = rankConfig[r];
    if (!cfg) return `<span style="color: #94a3b8; font-size: 0.75rem;">낙첨</span>`;

    const countText = count > 1 ? ` ${count}개` : '';
    return `<span style="background: ${cfg.bg}; border: 1px solid ${cfg.border}; color: ${cfg.color}; font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 10px;">${cfg.name}${countText} 당첨</span>`;
}

/**
 * Universal Modal Controller
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.classList.add('active');
    modal.classList.remove('hidden');
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('active');
    modal.classList.add('hidden');
}

/**
 * Enterprise Legal Disclaimer & Terms Modal Controller
 */
export function openLegalModal(tabKey = 'disclaimer') {
    const modal = document.getElementById('legalComplianceModal');
    if (modal) {
        modal.style.display = 'flex';
        switchLegalTab(tabKey);
    }
}

export function closeLegalModal() {
    const modal = document.getElementById('legalComplianceModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

export function switchLegalTab(tabKey) {
    const tabs = document.querySelectorAll('.legal-tab-btn');
    tabs.forEach(btn => {
        if (btn.dataset.tab === tabKey) {
            btn.classList.add('active');
            btn.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25))';
            btn.style.borderColor = '#fbbf24';
            btn.style.color = '#fbbf24';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.borderColor = 'rgba(255,255,255,0.12)';
            btn.style.color = '#94a3b8';
        }
    });

    const sections = document.querySelectorAll('.legal-section');
    sections.forEach(sec => {
        if (sec.id === `legalSection-${tabKey}`) {
            sec.style.display = 'block';
        } else {
            sec.style.display = 'none';
        }
    });
}

if (typeof window !== 'undefined') {
    window.openLegalModal = openLegalModal;
    window.closeLegalModal = closeLegalModal;
    window.switchLegalTab = switchLegalTab;
}
