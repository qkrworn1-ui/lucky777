import { getBallHexColor, getBallColorClass, getBallTextColor } from './utils.js';

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
    const textColor = getBallTextColor(n);
    const size = options.size || 'normal'; // 'mini' (22px), 'small' (26px), 'normal' (28px), 'large' (40px)
    
    let sizeStyle = '';
    if (size === 'mini') sizeStyle = 'width: 22px; height: 22px; line-height: 22px; font-size: 0.70rem;';
    else if (size === 'small') sizeStyle = 'width: 26px; height: 26px; line-height: 26px; font-size: 0.75rem;';
    else if (size === 'large') sizeStyle = 'width: 42px; height: 42px; line-height: 42px; font-size: 1.1rem;';
    else sizeStyle = 'width: 28px; height: 28px; line-height: 28px; font-size: 0.80rem;';

    let hitClass = '';
    let extraStyle = '';
    if (options.isHit) {
        hitClass = 'ball-hit';
        extraStyle = 'background: rgba(16, 185, 129, 0.22) !important; color: #34d399 !important; border: 1.5px solid #10b981 !important; font-weight: 800 !important;';
    } else if (options.isBonusHit) {
        hitClass = 'ball-bonus-hit';
        extraStyle = 'background: rgba(56, 189, 248, 0.22) !important; color: #38bdf8 !important; border: 1.5px solid #38bdf8 !important; font-weight: 800 !important;';
    } else if (options.dim) {
        extraStyle = 'opacity: 0.35 !important;';
    }

    return `<span class="ball-mono ${hitClass} lotto-ball ${colorClass} ${options.extraClass || ''}" style="${sizeStyle} color: ${textColor}; ${extraStyle} text-align: center; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-family: monospace;">${n.toString().padStart(2, '0')}</span>`;
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

/**
/**
 * ============================================================================
 * ✨ 초슬림 핀테크 모던 회원 선택 모달 (Slim Member Picker Modal - Ultra Simple)
 * ============================================================================
 */
let _activeMemberPickerCallback = null;
let _tempSelectedMemberId = 'all';
let _tempSelectedMemberName = '전체 회원 통합 보기';
let _activeMemberCustomList = null;
let _activeMemberIncludeAll = true;

export function openSlimMemberPickerModal(options = {}) {
    const {
        onSelect = null,
        selectedUserId = 'all',
        title = '조회 대상 회원 선택',
        subtitle = '회원을 탭하면 즉시 선택되어 전환됩니다.',
        includeAll = true,
        customUserList = null
    } = options;

    _activeMemberPickerCallback = onSelect;
    _tempSelectedMemberId = selectedUserId || 'all';
    _activeMemberCustomList = customUserList;
    _activeMemberIncludeAll = (includeAll !== false);

    let overlay = document.getElementById('slimMemberPickerModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'slimMemberPickerModal';
        overlay.className = 'slim-picker-overlay';
        overlay.innerHTML = `
            <div class="slim-picker-modal" onclick="event.stopPropagation()">
                <!-- Header -->
                <div class="slim-picker-header">
                    <div class="slim-picker-title-group">
                        <div class="slim-picker-icon-badge" style="background: rgba(59, 130, 246, 0.18); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35);">
                            <i class="fa-solid fa-user-check"></i>
                        </div>
                        <div>
                            <h3 id="slimMemberPickerTitle" class="slim-picker-title">${title}</h3>
                            <div id="slimMemberPickerSubtext" class="slim-picker-subtext">${subtitle}</div>
                        </div>
                    </div>
                    <button type="button" class="slim-picker-close-btn" onclick="window.closeSlimMemberPickerModal()">&times;</button>
                </div>

                <!-- Toolbar: Simple Clean Search -->
                <div class="slim-picker-toolbar" style="padding: 10px 14px 8px 14px; background: rgba(0,0,0,0.25);">
                    <div class="slim-picker-search-wrap">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.72rem; color: #64748b;"></i>
                        <input type="text" id="slimMemberSearchInput" class="slim-picker-search-input" placeholder="회원 이름 또는 ID 검색..." oninput="window._filterSlimMemberList && window._filterSlimMemberList()">
                    </div>
                </div>

                <!-- All Users Single-Line Item -->
                <div id="slimMemberAllCardWrap" style="padding: 8px 14px 2px 14px; box-sizing: border-box;">
                    <div id="slimMemberItem-all" onclick="window._pickSlimMemberAndClose('all', '전체 회원 통합 보기')" class="slim-picker-item" style="background: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.3);">
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <div style="width: 26px; height: 26px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); color: #60a5fa; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; flex-shrink: 0;">
                                <i class="fa-solid fa-users"></i>
                            </div>
                            <div style="display: flex; align-items: baseline; gap: 6px;">
                                <span style="font-size: 0.82rem; font-weight: 700; color: #60a5fa;">전체 회원 통합 보기</span>
                                <span style="font-size: 0.68rem; color: #94a3b8; font-family: monospace;">(ALL)</span>
                            </div>
                        </div>
                        <i class="fa-solid fa-angle-right" style="color: #64748b; font-size: 0.75rem;"></i>
                    </div>
                </div>

                <!-- Scrollable Item List -->
                <div id="slimMemberListContainer" class="slim-picker-list custom-scrollbar">
                    <!-- Populated dynamically -->
                </div>

                <!-- Minimal Footer -->
                <div class="slim-picker-footer" style="padding: 8px 14px; justify-content: space-between;">
                    <span style="font-size: 0.72rem; color: #94a3b8;">💡 회원을 터치하면 즉시 선택 후 창이 닫힙니다.</span>
                    <button type="button" onclick="window.closeSlimMemberPickerModal()" style="padding: 5px 12px; border-radius: 6px; font-size: 0.74rem; font-weight: 600; color: #cbd5e1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">닫기</button>
                </div>
            </div>
        `;
        overlay.onclick = (e) => { if (e.target === overlay) window.closeSlimMemberPickerModal(); };
        document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('slimMemberPickerTitle');
    if (titleEl) titleEl.innerText = title;
    const subEl = document.getElementById('slimMemberPickerSubtext');
    if (subEl) subEl.innerText = subtitle;
    const searchInp = document.getElementById('slimMemberSearchInput');
    if (searchInp) searchInp.value = '';

    const allWrap = document.getElementById('slimMemberAllCardWrap');
    if (allWrap) {
        allWrap.style.display = _activeMemberIncludeAll ? 'block' : 'none';
    }

    overlay.style.display = 'flex';
    window._renderSlimMemberList();
}

export function closeSlimMemberPickerModal() {
    const overlay = document.getElementById('slimMemberPickerModal');
    if (overlay) overlay.style.display = 'none';
}

window._renderSlimMemberList = function() {
    const container = document.getElementById('slimMemberListContainer');
    if (!container) return;

    let users = [];
    if (_activeMemberCustomList && Array.isArray(_activeMemberCustomList) && _activeMemberCustomList.length > 0) {
        users = _activeMemberCustomList;
    } else if (typeof window.getAllUnifiedRegisteredUsers === 'function') {
        users = window.getAllUnifiedRegisteredUsers();
    } else if (typeof window.__cachedUsersWithStatus === 'object' && window.__cachedUsersWithStatus) {
        users = Object.keys(window.__cachedUsersWithStatus).map(id => ({
            id,
            name: window.__cachedUsersWithStatus[id]?.realName || id
        }));
    } else {
        const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'master';
        users = [{ id: rawAuth, name: '관리자' }];
    }

    const query = (document.getElementById('slimMemberSearchInput')?.value || '').trim().toLowerCase();

    const filtered = users.filter(u => {
        const uId = (u.id || '').toLowerCase();
        const uName = (u.name || u.realName || '').toLowerCase();
        const uPhone = (u.phone || '').replace(/[^0-9]/g, '');
        return !query || uId.includes(query) || uName.includes(query) || uPhone.includes(query);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 24px 10px; color:#64748b; font-size:0.75rem;">일치하는 회원이 없습니다.</div>`;
        return;
    }

    let html = '';
    filtered.forEach(u => {
        const uId = u.id;
        const uDisplayName = u.name || u.realName || (typeof window.getUserRealName === 'function' ? window.getUserRealName(uId) : '') || uId;
        const isAdm = (typeof window.isAdminUser === 'function') ? window.isAdminUser(uId) : (uId.toLowerCase() === 'master' || uId.toLowerCase() === 'admin');
        const isSelected = String(_tempSelectedMemberId).toLowerCase() === uId.toLowerCase();

        const safeName = uDisplayName.replace(/'/g, "\\'");
        html += `
            <div id="slimMemberItem-${uId}" onclick="window._pickSlimMemberAndClose('${uId}', '${safeName}')" class="slim-picker-item ${isSelected ? 'selected' : ''}">
                <div style="display:flex; align-items:center; gap:9px; min-width:0; flex:1;">
                    <div style="width:26px; height:26px; border-radius:50%; background:${isAdm ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.06)'}; border:1px solid ${isAdm ? 'rgba(245, 158, 11, 0.4)' : 'rgba(255,255,255,0.1)'}; color:${isAdm ? '#fbbf24' : '#94a3b8'}; font-size:0.72rem; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        ${isAdm ? '<i class="fa-solid fa-crown" style="font-size:0.7rem;"></i>' : (uDisplayName[0] || 'U')}
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <span style="font-size:0.82rem; font-weight:700; color:#f8fafc;">${uDisplayName}</span>
                        <span style="font-size:0.70rem; color:#64748b; font-family:monospace;">@${uId}</span>
                        ${isAdm ? '<span style="font-size:0.62rem; padding:1px 5px; border-radius:4px; background:rgba(245,158,11,0.18); color:#fbbf24; font-weight:700;">관리자</span>' : ''}
                    </div>
                </div>
                ${isSelected ? '<i class="fa-solid fa-check" style="color:#3b82f6; font-size:0.85rem; flex-shrink:0;"></i>' : '<i class="fa-solid fa-angle-right" style="color:#64748b; font-size:0.75rem; flex-shrink:0;"></i>'}
            </div>
        `;
    });

    container.innerHTML = html;
};

window._pickSlimMemberAndClose = function(userId, displayName, rawObj) {
    _tempSelectedMemberId = userId;
    _tempSelectedMemberName = displayName;
    if (typeof _activeMemberPickerCallback === 'function') {
        const userObj = rawObj || { id: userId, name: displayName, userId: userId };
        _activeMemberPickerCallback(userObj, userId);
    }
    window.closeSlimMemberPickerModal();
};

window._selectSlimMemberTemp = function(userId, displayName) {
    window._pickSlimMemberAndClose(userId, displayName);
};

window._filterSlimMemberList = function() {
    window._renderSlimMemberList();
};

window._confirmSlimMemberSelection = function() {
    window._pickSlimMemberAndClose(_tempSelectedMemberId, _tempSelectedMemberName);
};

/**
 * ============================================================================
 * ✨ 초슬림 핀테크 모던 회차 선택 모달 (Slim Round Picker Modal - Round-Only & >= 1235)
 * ============================================================================
 */
let _activeRoundPickerCallback = null;
let _tempSelectedRoundVal = 'all_rounds';
let _tempSelectedRoundName = '전체 회차 누적 종합';
let _activeRoundIncludeAll = true;
let _activeRoundMin = 1235;
let _activeRoundMax = null;
let _activeRoundAvailableRounds = null;

export function openSlimRoundPickerModal(options = {}) {
    const {
        onSelect = null,
        selectedRound = 'all_rounds',
        title = '조회 대상 회차 선택',
        subtitle = '회차를 탭하면 즉시 적용되어 창이 닫힙니다 (1235회~).',
        minRound = 1235,
        maxRound = null,
        includeAllRounds = true,
        availableRounds = null
    } = options;

    _activeRoundPickerCallback = onSelect;
    _tempSelectedRoundVal = String(selectedRound || 'all_rounds');
    _activeRoundIncludeAll = (includeAllRounds !== false);
    _activeRoundMin = (typeof minRound === 'number' && minRound > 0) ? minRound : 1235;
    _activeRoundMax = maxRound;
    _activeRoundAvailableRounds = Array.isArray(availableRounds) ? availableRounds : null;

    let overlay = document.getElementById('slimRoundPickerModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'slimRoundPickerModal';
        overlay.className = 'slim-picker-overlay';
        overlay.innerHTML = `
            <div class="slim-picker-modal" onclick="event.stopPropagation()">
                <!-- Header -->
                <div class="slim-picker-header">
                    <div class="slim-picker-title-group">
                        <div class="slim-picker-icon-badge" style="background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.35);">
                            <i class="fa-solid fa-calendar-days"></i>
                        </div>
                        <div>
                            <h3 id="slimRoundPickerTitle" class="slim-picker-title">${title}</h3>
                            <div id="slimRoundPickerSubtext" class="slim-picker-subtext">${subtitle}</div>
                        </div>
                    </div>
                    <button type="button" class="slim-picker-close-btn" onclick="window.closeSlimRoundPickerModal()">&times;</button>
                </div>

                <!-- Toolbar: Simple Clean Search -->
                <div class="slim-picker-toolbar" style="padding: 10px 14px 8px 14px; background: rgba(0,0,0,0.25);">
                    <div class="slim-picker-search-wrap">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.72rem; color: #64748b;"></i>
                        <input type="text" id="slimRoundSearchInput" class="slim-picker-search-input" placeholder="회차 검색 (예: 1243)..." oninput="window._filterSlimRoundList && window._filterSlimRoundList()">
                    </div>
                </div>

                <!-- All Rounds Single-Line Item -->
                <div id="slimRoundAllCardWrap" style="padding: 8px 14px 2px 14px; box-sizing: border-box;">
                    <div id="slimRoundItem-all_rounds" onclick="window._pickSlimRoundAndClose('all_rounds', '전체 회차 누적 종합')" class="slim-picker-item" style="background: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.3);">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <i class="fa-solid fa-layer-group text-amber-400" style="color: #fbbf24; font-size: 0.85rem;"></i>
                            <span style="font-size: 0.84rem; font-weight: 800; color: #fbbf24;">전체 회차 누적 종합</span>
                            <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 800;">1235회~</span>
                        </div>
                        <i class="fa-solid fa-angle-right" style="color: #64748b; font-size: 0.75rem;"></i>
                    </div>
                </div>

                <!-- Scrollable Round List (Clean, Just Rounds, No Clutter) -->
                <div id="slimRoundListContainer" class="slim-picker-list custom-scrollbar">
                    <!-- Populated dynamically -->
                </div>

                <!-- Minimal Footer -->
                <div class="slim-picker-footer" style="padding: 8px 14px; justify-content: space-between;">
                    <span style="font-size: 0.72rem; color: #94a3b8;">⚡ 회차를 터치하면 즉시 적용 후 창이 닫힙니다 (1235회~).</span>
                    <button type="button" onclick="window.closeSlimRoundPickerModal()" style="padding: 5px 12px; border-radius: 6px; font-size: 0.74rem; font-weight: 600; color: #cbd5e1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">닫기</button>
                </div>
            </div>
        `;
        overlay.onclick = (e) => { if (e.target === overlay) window.closeSlimRoundPickerModal(); };
        document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('slimRoundPickerTitle');
    if (titleEl) titleEl.innerText = title;
    const subEl = document.getElementById('slimRoundPickerSubtext');
    if (subEl) subEl.innerText = subtitle;
    const searchInp = document.getElementById('slimRoundSearchInput');
    if (searchInp) searchInp.value = '';

    const allRoundWrap = document.getElementById('slimRoundAllCardWrap');
    if (allRoundWrap) {
        allRoundWrap.style.display = _activeRoundIncludeAll ? 'block' : 'none';
    }

    overlay.style.display = 'flex';
    window._renderSlimRoundList(_activeRoundMin, _activeRoundMax);
}

export function closeSlimRoundPickerModal() {
    const overlay = document.getElementById('slimRoundPickerModal');
    if (overlay) overlay.style.display = 'none';
}

window._filterSlimRoundList = function() {
    window._renderSlimRoundList(_activeRoundMin, _activeRoundMax);
};

window._renderSlimRoundList = function(minRound = null, maxRound = null) {
    const container = document.getElementById('slimRoundListContainer');
    if (!container) return;

    const history = (window.state && window.state.mergedHistory) ? window.state.mergedHistory : {};
    const historyRounds = Object.keys(history)
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && history[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window.getLatestDrawnRound === 'function') ? window.getLatestDrawnRound() : 1243;
    const latestRoundNum = maxRound || _activeRoundMax || ((window.state && window.state.latestDrawData && window.state.latestDrawData.numbers?.length === 6)
        ? Math.max(window.state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || fallbackLatest));

    const effectiveMin = Math.max(1235, (typeof minRound === 'number' && minRound > 0 ? minRound : (_activeRoundMin || 1235)));

    let roundNumbers = [];
    if (_activeRoundAvailableRounds && _activeRoundAvailableRounds.length > 0) {
        roundNumbers = _activeRoundAvailableRounds.filter(r => r >= effectiveMin);
    } else {
        for (let r = latestRoundNum; r >= effectiveMin; r--) {
            roundNumbers.push(r);
        }
    }

    const searchVal = (document.getElementById('slimRoundSearchInput')?.value || '').trim();
    if (searchVal) {
        roundNumbers = roundNumbers.filter(r => String(r).includes(searchVal));
    }

    if (roundNumbers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 24px 10px; color:#64748b; font-size:0.75rem;">선택 가능한 1235회 이후 회차가 없습니다.</div>`;
        return;
    }

    let html = '';
    roundNumbers.forEach(r => {
        const isLatest = (r === latestRoundNum);
        const isSelected = String(_tempSelectedRoundVal) === String(r);

        html += `
            <div id="slimRoundItem-${r}" onclick="window._pickSlimRoundAndClose('${r}', '제 ${r}회차')" class="slim-picker-item ${isSelected ? 'selected-round' : ''}">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.88rem; font-weight:800; color:${isLatest ? '#fbbf24' : '#f8fafc'};">제 ${r}회</span>
                    ${isLatest ? '<span style="font-size:0.65rem; padding:1px 6px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fbbf24; font-weight:800;">최신 회차</span>' : ''}
                </div>
                ${isSelected ? '<i class="fa-solid fa-check" style="color:#fbbf24; font-size:0.85rem; flex-shrink:0;"></i>' : '<i class="fa-solid fa-angle-right" style="color:#64748b; font-size:0.75rem; flex-shrink:0;"></i>'}
            </div>
        `;
    });

    container.innerHTML = html;
};

window._pickSlimRoundAndClose = function(roundVal, displayName) {
    _tempSelectedRoundVal = roundVal;
    _tempSelectedRoundName = displayName;
    if (typeof _activeRoundPickerCallback === 'function') {
        _activeRoundPickerCallback(roundVal, displayName);
    }
    window.closeSlimRoundPickerModal();
};

window._selectSlimRoundTemp = function(roundVal, display) {
    window._pickSlimRoundAndClose(roundVal, display);
};

window._confirmSlimRoundSelection = function() {
    window._pickSlimRoundAndClose(_tempSelectedRoundVal, _tempSelectedRoundName);
};

if (typeof window !== 'undefined') {
    window.openLegalModal = openLegalModal;
    window.closeLegalModal = closeLegalModal;
    window.switchLegalTab = switchLegalTab;
    window.openSlimMemberPickerModal = openSlimMemberPickerModal;
    window.closeSlimMemberPickerModal = closeSlimMemberPickerModal;
    window.openSlimRoundPickerModal = openSlimRoundPickerModal;
    window.closeSlimRoundPickerModal = closeSlimRoundPickerModal;
}

