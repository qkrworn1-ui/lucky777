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
 * ============================================================================
 * ✨ 초슬림 핀테크 모던 회원 선택 모달 (Slim Member Picker Modal)
 * ============================================================================
 */
let _activeMemberPickerCallback = null;
let _tempSelectedMemberId = 'all';
let _tempSelectedMemberName = '전체 회원 종합';
let _currentMemberPickerCategory = 'all';

export function openSlimMemberPickerModal(options = {}) {
    const {
        onSelect = null,
        selectedUserId = 'all',
        title = '조회 대상 회원 선택',
        subtitle = '조회하거나 분석할 대상 회원을 검색 및 선택하세요.'
    } = options;

    _activeMemberPickerCallback = onSelect;
    _tempSelectedMemberId = selectedUserId || 'all';
    _currentMemberPickerCategory = 'all';

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
                            <i class="fa-solid fa-users"></i>
                        </div>
                        <div>
                            <h3 id="slimMemberPickerTitle" class="slim-picker-title">${title}</h3>
                            <div id="slimMemberPickerSubtext" class="slim-picker-subtext">${subtitle}</div>
                        </div>
                    </div>
                    <button type="button" class="slim-picker-close-btn" onclick="window.closeSlimMemberPickerModal()">&times;</button>
                </div>

                <!-- Toolbar: Search & Category Pills -->
                <div class="slim-picker-toolbar">
                    <div class="slim-picker-search-wrap">
                        <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 0.72rem; color: #64748b;"></i>
                        <input type="text" id="slimMemberSearchInput" class="slim-picker-search-input" placeholder="회원 ID, 실명, 연락처 초성 검색..." oninput="window._filterSlimMemberList && window._filterSlimMemberList()">
                    </div>
                    <div class="slim-picker-pills-row">
                        <button type="button" class="slim-picker-pill active" data-cat="all" onclick="window._setSlimMemberCategory('all', this)">전체</button>
                        <button type="button" class="slim-picker-pill" data-cat="admin" onclick="window._setSlimMemberCategory('admin', this)">👑 관리자/영구</button>
                        <button type="button" class="slim-picker-pill" data-cat="purchased" onclick="window._setSlimMemberCategory('purchased', this)">🧾 실구매인증</button>
                        <button type="button" class="slim-picker-pill" data-cat="kakao" onclick="window._setSlimMemberCategory('kakao', this)">💬 카카오연동</button>
                    </div>
                </div>

                <!-- All Users Global Card -->
                <div style="padding: 8px 14px 2px 14px; box-sizing: border-box;">
                    <div id="slimMemberItem-all" onclick="window._selectSlimMemberTemp('all', '전체 회원 종합 (AI 70게임)')" class="slim-picker-item" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%); border-color: rgba(245, 158, 11, 0.35);">
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 900; border: 1px solid rgba(245, 158, 11, 0.4); flex-shrink: 0;">
                                <i class="fa-solid fa-globe"></i>
                            </div>
                            <div style="min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 0.78rem; font-weight: 800; color: #fbbf24;">전체 회원 종합</span>
                                    <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 800;">ALL</span>
                                </div>
                                <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 1px;">모든 회원의 추천 70게임 및 실구매 당첨 종합 대조</div>
                            </div>
                        </div>
                        <div class="slim-radio-indicator" style="width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(245,158,11,0.6); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        </div>
                    </div>
                </div>

                <!-- Scrollable Item List -->
                <div id="slimMemberListContainer" class="slim-picker-list custom-scrollbar">
                    <!-- Populated dynamically -->
                </div>

                <!-- Footer -->
                <div class="slim-picker-footer">
                    <div class="slim-picker-selected-desc">
                        <span>선택: </span>
                        <strong id="slimMemberSelectedLabel" style="color: #fbbf24; font-weight: 800;">전체 회원 종합</strong>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" onclick="window.closeSlimMemberPickerModal()" style="padding: 6px 12px; border-radius: 7px; font-size: 0.75rem; font-weight: 600; color: #94a3b8; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">취소</button>
                        <button type="button" onclick="window._confirmSlimMemberSelection()" style="padding: 6px 14px; border-radius: 7px; font-size: 0.75rem; font-weight: 800; color: #0f172a; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);">
                            <i class="fa-solid fa-check"></i> 선택 확정
                        </button>
                    </div>
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
    if (typeof window.getAllUnifiedRegisteredUsers === 'function') {
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
    const cat = _currentMemberPickerCategory;

    const filtered = users.filter(u => {
        const uId = (u.id || '').toLowerCase();
        const uName = (u.name || u.realName || '').toLowerCase();
        const uPhone = (u.phone || '').replace(/[^0-9]/g, '');
        const matchQ = !query || uId.includes(query) || uName.includes(query) || uPhone.includes(query);
        if (!matchQ) return false;

        const isAdm = (typeof window.isAdminUser === 'function') ? window.isAdminUser(u.id) : (uId === 'master' || uId === 'admin');
        const isPerm = (typeof window.isPermanentUser === 'function') ? window.isPermanentUser(u.id) : false;
        const isKakao = uId.startsWith('kakao_') || !!(u.kakaoAuth && u.kakaoAuth.kakaoId);
        const hasPurchases = (window.state && window.state.ledger && Object.values(window.state.ledger).some(list => (list || []).some(p => (p.userId || '').toLowerCase() === uId)));

        if (cat === 'admin') return isAdm || isPerm;
        if (cat === 'purchased') return hasPurchases;
        if (cat === 'kakao') return isKakao;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 24px 10px; color:#64748b; font-size:0.75rem;">일치하는 회원이 없습니다.</div>`;
        return;
    }

    let html = '';
    filtered.forEach(u => {
        const uId = u.id;
        const uDisplayName = u.name || u.realName || uId;
        const isKakao = uId.startsWith('kakao_') || !!(u.kakaoAuth && u.kakaoAuth.kakaoId);
        const isAdm = (typeof window.isAdminUser === 'function') ? window.isAdminUser(uId) : (uId.toLowerCase() === 'master');
        const isPerm = (typeof window.isPermanentUser === 'function') ? window.isPermanentUser(uId) : false;
        const isSelected = String(_tempSelectedMemberId).toLowerCase() === uId.toLowerCase();

        let roleBadge = '<span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; background:rgba(255,255,255,0.06); color:#94a3b8;">일반</span>';
        if (isAdm) roleBadge = '<span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fbbf24; border:1px solid rgba(245,158,11,0.35);">👑 관리자</span>';
        else if (isPerm) roleBadge = '<span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; background:rgba(59,130,246,0.2); color:#60a5fa; border:1px solid rgba(59,130,246,0.35);">💎 영구</span>';

        let avatarHtml = `<div style="width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:800; flex-shrink:0;">${uDisplayName[0] || 'U'}</div>`;
        if (isKakao) avatarHtml = `<div style="width:28px; height:28px; border-radius:8px; background:#fee500; color:#191919; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:900; flex-shrink:0;"><i class="fa-solid fa-comment"></i></div>`;
        else if (isAdm) avatarHtml = `<div style="width:28px; height:28px; border-radius:8px; background:linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color:#0f172a; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:900; flex-shrink:0;"><i class="fa-solid fa-crown"></i></div>`;

        html += `
            <div id="slimMemberItem-${uId}" onclick="window._selectSlimMemberTemp('${uId}', '${uDisplayName} (${uId})')" class="slim-picker-item ${isSelected ? 'selected' : ''}">
                <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                    ${avatarHtml}
                    <div style="min-width:0; flex:1;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                            <span style="font-size:0.78rem; font-weight:800; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${uDisplayName}</span>
                            <span style="font-size:0.70rem; color:#94a3b8; font-family:monospace;">(${uId})</span>
                            ${roleBadge}
                        </div>
                    </div>
                </div>
                <div class="slim-radio-indicator" style="width:16px; height:16px; border-radius:50%; border:1.5px solid ${isSelected ? '#3b82f6' : 'rgba(255,255,255,0.2)'}; background:${isSelected ? '#3b82f6' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    ${isSelected ? '<span style="width:6px; height:6px; border-radius:50%; background:#fff;"></span>' : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    window._updateSlimMemberRadioStyles();
};

window._selectSlimMemberTemp = function(userId, displayName) {
    _tempSelectedMemberId = userId;
    _tempSelectedMemberName = displayName;
    const label = document.getElementById('slimMemberSelectedLabel');
    if (label) label.innerText = displayName;
    window._updateSlimMemberRadioStyles();
};

window._updateSlimMemberRadioStyles = function() {
    const allItems = document.querySelectorAll('#slimMemberPickerModal .slim-picker-item');
    allItems.forEach(item => {
        const isSelected = item.id === `slimMemberItem-${_tempSelectedMemberId}`;
        const radio = item.querySelector('.slim-radio-indicator');
        if (isSelected) {
            item.classList.add('selected');
            if (radio) {
                radio.style.borderColor = (_tempSelectedMemberId === 'all') ? '#fbbf24' : '#3b82f6';
                radio.style.background = (_tempSelectedMemberId === 'all') ? '#fbbf24' : '#3b82f6';
                radio.innerHTML = `<span style="width:6px; height:6px; border-radius:50%; background:${_tempSelectedMemberId === 'all' ? '#0f172a' : '#fff'};"></span>`;
            }
        } else {
            item.classList.remove('selected');
            if (radio) {
                radio.style.borderColor = 'rgba(255,255,255,0.2)';
                radio.style.background = 'transparent';
                radio.innerHTML = '';
            }
        }
    });
};

window._setSlimMemberCategory = function(cat, btn) {
    _currentMemberPickerCategory = cat;
    const pills = document.querySelectorAll('#slimMemberPickerModal .slim-picker-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window._renderSlimMemberList();
};

window._filterSlimMemberList = function() {
    window._renderSlimMemberList();
};

window._confirmSlimMemberSelection = function() {
    if (typeof _activeMemberPickerCallback === 'function') {
        _activeMemberPickerCallback(_tempSelectedMemberId, _tempSelectedMemberName);
    }
    window.closeSlimMemberPickerModal();
};

/**
 * ============================================================================
 * ✨ 초슬림 핀테크 모던 회차 선택 모달 (Slim Round Picker Modal)
 * ============================================================================
 */
let _activeRoundPickerCallback = null;
let _tempSelectedRoundVal = 'all_rounds';
let _tempSelectedRoundName = '전체 회차 누적 종합';
let _currentRoundPickerFilter = 'all';

export function openSlimRoundPickerModal(options = {}) {
    const {
        onSelect = null,
        selectedRound = 'all_rounds',
        title = '조회 대상 회차 선택',
        subtitle = '조회하고자 하는 공식 로또 추첨 회차를 선택하세요.',
        minRound = 1235
    } = options;

    _activeRoundPickerCallback = onSelect;
    _tempSelectedRoundVal = String(selectedRound || 'all_rounds');
    _currentRoundPickerFilter = 'all';

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
                            <i class="fa-solid fa-calendar-check"></i>
                        </div>
                        <div>
                            <h3 id="slimRoundPickerTitle" class="slim-picker-title">${title}</h3>
                            <div id="slimRoundPickerSubtext" class="slim-picker-subtext">${subtitle}</div>
                        </div>
                    </div>
                    <button type="button" class="slim-picker-close-btn" onclick="window.closeSlimRoundPickerModal()">&times;</button>
                </div>

                <!-- Toolbar: Quick Filter Chips -->
                <div class="slim-picker-toolbar">
                    <div class="slim-picker-pills-row">
                        <button type="button" class="slim-picker-pill slim-picker-pill-amber active" data-filter="all" onclick="window._setSlimRoundFilter('all', this)">전체 누적</button>
                        <button type="button" class="slim-picker-pill slim-picker-pill-amber" data-filter="latest" onclick="window._setSlimRoundFilter('latest', this)">최신 회차</button>
                        <button type="button" class="slim-picker-pill slim-picker-pill-amber" data-filter="wins" onclick="window._setSlimRoundFilter('wins', this)">🏆 당첨 회차만</button>
                    </div>
                </div>

                <!-- All Rounds Global Card -->
                <div style="padding: 8px 14px 2px 14px; box-sizing: border-box;">
                    <div id="slimRoundItem-all_rounds" onclick="window._selectSlimRoundTemp('all_rounds', '전체 회차 누적 종합 조회')" class="slim-picker-item" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.8) 100%); border-color: rgba(245, 158, 11, 0.35);">
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                            <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 900; border: 1px solid rgba(245, 158, 11, 0.4); flex-shrink: 0;">
                                <i class="fa-solid fa-chart-pie"></i>
                            </div>
                            <div style="min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="font-size: 0.78rem; font-weight: 800; color: #fbbf24;">전체 회차 누적 종합</span>
                                    <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-weight: 800;">1235회~</span>
                                </div>
                                <div style="font-size: 0.68rem; color: #94a3b8; margin-top: 1px;">전체 회차 추천 70게임 전수 적중 성과 및 통계 통합 분석</div>
                            </div>
                        </div>
                        <div class="slim-radio-indicator" style="width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid rgba(245,158,11,0.6); background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        </div>
                    </div>
                </div>

                <!-- Scrollable Round List -->
                <div id="slimRoundListContainer" class="slim-picker-list custom-scrollbar">
                    <!-- Populated dynamically -->
                </div>

                <!-- Footer -->
                <div class="slim-picker-footer">
                    <div class="slim-picker-selected-desc">
                        <span>선택: </span>
                        <strong id="slimRoundSelectedLabel" style="color: #fbbf24; font-weight: 800;">전체 회차 누적 종합</strong>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" onclick="window.closeSlimRoundPickerModal()" style="padding: 6px 12px; border-radius: 7px; font-size: 0.75rem; font-weight: 600; color: #94a3b8; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">취소</button>
                        <button type="button" onclick="window._confirmSlimRoundSelection()" style="padding: 6px 14px; border-radius: 7px; font-size: 0.75rem; font-weight: 800; color: #0f172a; background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);">
                            <i class="fa-solid fa-check"></i> 회차 적용
                        </button>
                    </div>
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

    overlay.style.display = 'flex';
    window._renderSlimRoundList(minRound);
}

export function closeSlimRoundPickerModal() {
    const overlay = document.getElementById('slimRoundPickerModal');
    if (overlay) overlay.style.display = 'none';
}

window._renderSlimRoundList = function(minRound = 1235) {
    const container = document.getElementById('slimRoundListContainer');
    if (!container) return;

    const history = (window.state && window.state.mergedHistory) ? window.state.mergedHistory : {};
    const historyRounds = Object.keys(history)
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && history[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window.getLatestDrawnRound === 'function') ? window.getLatestDrawnRound() : 1243;
    const latestRoundNum = (window.state && window.state.latestDrawData && window.state.latestDrawData.numbers?.length === 6)
        ? Math.max(window.state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || fallbackLatest);

    let roundNumbers = [];
    for (let r = latestRoundNum; r >= minRound; r--) {
        roundNumbers.push(r);
    }

    if (_currentRoundPickerFilter === 'latest') {
        roundNumbers = roundNumbers.slice(0, 1);
    }

    let html = '';
    roundNumbers.forEach(r => {
        const draw = (typeof window.getSafeActualDraw === 'function') ? window.getSafeActualDraw(r) : (history[r] || null);
        const dateStr = draw && (draw.date || draw.drwNoDate) ? ` (${draw.date || draw.drwNoDate})` : '';
        const isLatest = (r === latestRoundNum);
        const isSelected = String(_tempSelectedRoundVal) === String(r);

        let ballsHtml = '';
        if (draw && draw.numbers && draw.numbers.length === 6) {
            ballsHtml = draw.numbers.map(n => {
                const bg = getBallHexColor(n);
                const textColor = n <= 10 ? '#0f172a' : '#fff';
                return `<span class="slim-picker-ball-mini" style="background:${bg}; color:${textColor};">${n}</span>`;
            }).join('');
            if (draw.bonus) {
                const bBg = getBallHexColor(draw.bonus);
                const bTextColor = draw.bonus <= 10 ? '#0f172a' : '#fff';
                ballsHtml += `<span style="font-size:0.7rem; color:#64748b; margin:0 1px;">+</span><span class="slim-picker-ball-mini" style="background:${bBg}; color:${bTextColor}; border:1.5px solid #fbbf24;">${draw.bonus}</span>`;
            }
        } else {
            ballsHtml = `<span style="font-size:0.7rem; color:#64748b;">(추첨 대기)</span>`;
        }

        html += `
            <div id="slimRoundItem-${r}" onclick="window._selectSlimRoundTemp('${r}', '제 ${r}회${dateStr}')" class="slim-picker-item ${isSelected ? 'selected-round' : ''}">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                        <span style="font-size:0.82rem; font-weight:800; color:${isLatest ? '#fbbf24' : '#fff'};">제 ${r}회</span>
                        <span style="font-size:0.68rem; color:#94a3b8;">${dateStr}</span>
                        ${isLatest ? '<span style="font-size:0.65rem; padding:1px 5px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fbbf24; font-weight:800;">최신</span>' : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:3px; flex-wrap:wrap;">
                        ${ballsHtml}
                    </div>
                </div>
                <div class="slim-radio-indicator" style="width:16px; height:16px; border-radius:50%; border:1.5px solid ${isSelected ? '#f59e0b' : 'rgba(255,255,255,0.2)'}; background:${isSelected ? '#f59e0b' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    ${isSelected ? '<span style="width:6px; height:6px; border-radius:50%; background:#0f172a;"></span>' : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    window._updateSlimRoundRadioStyles();
};

window._selectSlimRoundTemp = function(roundVal, display) {
    _tempSelectedRoundVal = roundVal;
    _tempSelectedRoundName = display;
    const label = document.getElementById('slimRoundSelectedLabel');
    if (label) label.innerText = display;
    window._updateSlimRoundRadioStyles();
};

window._updateSlimRoundRadioStyles = function() {
    const allItems = document.querySelectorAll('#slimRoundPickerModal .slim-picker-item');
    allItems.forEach(item => {
        const isSelected = item.id === `slimRoundItem-${_tempSelectedRoundVal}`;
        const radio = item.querySelector('.slim-radio-indicator');
        if (isSelected) {
            item.classList.add('selected-round');
            if (radio) {
                radio.style.borderColor = '#f59e0b';
                radio.style.background = '#f59e0b';
                radio.innerHTML = `<span style="width:6px; height:6px; border-radius:50%; background:#0f172a;"></span>`;
            }
        } else {
            item.classList.remove('selected-round');
            if (radio) {
                radio.style.borderColor = 'rgba(255,255,255,0.2)';
                radio.style.background = 'transparent';
                radio.innerHTML = '';
            }
        }
    });
};

window._setSlimRoundFilter = function(filterKey, btn) {
    _currentRoundPickerFilter = filterKey;
    const pills = document.querySelectorAll('#slimRoundPickerModal .slim-picker-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    window._renderSlimRoundList();
};

window._confirmSlimRoundSelection = function() {
    if (typeof _activeRoundPickerCallback === 'function') {
        _activeRoundPickerCallback(_tempSelectedRoundVal, _tempSelectedRoundName);
    }
    window.closeSlimRoundPickerModal();
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

