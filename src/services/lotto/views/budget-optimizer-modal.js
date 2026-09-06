import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';
import { renderTop5Combinations, renderExtraAddonPacksSection, getUserActiveExtraPackIds, saveUserActiveExtraPackIds } from './generator-tab.js';
import { saveGlobalState } from '../state.js';
import { getComboNumbers, isUserEligibleForExtraPacks } from '../ledger.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';

let currentOptimizedResult = null;

export const ALL_PACK_DEFS = [
    { id: 'v4', type: 'engine', version: 'v4', name: 'V4.0 행동경제학 포트폴리오', shortName: 'V4.0(10)', games: 10, color: '#10b981' },
    { id: 'v3', type: 'engine', version: 'v3', name: 'V3.0 하이브리드 앙상블', shortName: 'V3.0(10)', games: 10, color: '#3b82f6' },
    { id: 'extra1', type: 'extra', packId: 1, name: '추가 1 (30게임 전수 커버리지)', shortName: '추가 1(10)', games: 10, color: '#10b981' },
    { id: 'extra2', type: 'extra', packId: 2, name: '추가 2 (초고배당 EV 독점)', shortName: '추가 2(10)', games: 10, color: '#f59e0b' },
    { id: 'extra3', type: 'extra', packId: 3, name: '추가 3 (기하학적 휠링)', shortName: '추가 3(10)', games: 10, color: '#8b5cf6' },
    { id: 'extra4', type: 'extra', packId: 4, name: '추가 4 (마르코프 & 페어)', shortName: '추가 4(10)', games: 10, color: '#06b6d4' },
    { id: 'extra5', type: 'extra', packId: 5, name: '추가 5 (골든 클러스터)', shortName: '추가 5(10)', games: 10, color: '#ec4899' }
];

export function openBudgetOptimizerModal() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (authId === 'master' || authId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(authId)));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    const isEligible = isAdmin || ((typeof isUserEligibleForExtraPacks === 'function')
        ? isUserEligibleForExtraPacks(effectiveUserId)
        : ((typeof window !== 'undefined' && typeof window.isUserEligibleForExtraPacks === 'function')
            ? window.isUserEligibleForExtraPacks(effectiveUserId)
            : false));

    if (!isEligible) {
        const wantRegister = confirm(`🔒 [실구매 인증 정회원 전용 혜택]\n\n[예산 맞춤 AI 최적팩] 및 7대 퀀트 시뮬레이션은 매주 5게임(1장 / 5,000원) 이상의 실구매 영수증(QR)을 등록하신 정회원 전용 기능입니다.\n\n(실구매 미등록 고객은 기본 2조합인 V4.0 / V3.0 추천번호 20게임이 무료 제공됩니다.)\n\n지금 실구매 복권 영수증(QR)을 등록하시겠습니까?`);
        if (wantRegister) {
            if (typeof window.openManualLedgerModal === 'function') {
                window.openManualLedgerModal();
            } else if (typeof window.switchLottoTab === 'function') {
                window.switchLottoTab('tab-confirmed-list');
            }
        }
        return;
    }

    const modal = document.getElementById('budgetOptimizerModal');
    if (!modal) return;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Auto-detect currently active/owned packs in state
    const chkV4 = document.getElementById('chkOptOwned_v4');
    const chkV3 = document.getElementById('chkOptOwned_v3');
    if (chkV4) chkV4.checked = true; // Default V4
    if (chkV3) chkV3.checked = true; // Default V3

    for (let p = 1; p <= 5; p++) {
        const chk = document.getElementById(`chkOptOwned_extra${p}`);
        if (chk) {
            chk.checked = false; // Default unchecked so user gets recommended extra packs
        }
    }

    const input = document.getElementById('txtBudgetAmount');
    if (input && (!input.value || input.value === '0')) {
        input.value = '10000'; // Default 10,000 KRW additional
    }

    const terminal = document.getElementById('optSimProcessTerminal');
    if (terminal) terminal.innerHTML = '<div style="color: #64748b; font-style: italic;">[대기 중] 보유 팩과 추가 예산을 설정하고 [시뮬레이션 시작] 버튼을 눌러주세요.</div>';
    
    const resultContainer = document.getElementById('optSimResultContainer');
    if (resultContainer) resultContainer.style.display = 'none';

    const progBar = document.getElementById('optSimProgressBar');
    if (progBar) progBar.style.width = '0%';
}

export function closeBudgetOptimizerModal() {
    const modal = document.getElementById('budgetOptimizerModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

export function clearOwnedPacksSelection() {
    ALL_PACK_DEFS.forEach(p => {
        const chk = document.getElementById(`chkOptOwned_${p.id}`);
        if (chk) chk.checked = false;
    });
}

export function setBudgetAmount(amount) {
    const input = document.getElementById('txtBudgetAmount');
    if (input) {
        input.value = amount;
        document.querySelectorAll('.budget-chip-btn').forEach(btn => {
            if (parseInt(btn.getAttribute('data-amount')) === amount) {
                btn.classList.add('active-budget-chip');
            } else {
                btn.classList.remove('active-budget-chip');
            }
        });
    }
}

/**
 * Execute Incremental AI Budget Portfolio Optimization & Real-time Historical Simulation
 */
export async function runBudgetOptimizationSimulation() {
    const input = document.getElementById('txtBudgetAmount');
    const additionalBudget = input ? parseInt(input.value) : 10000;
    
    if (isNaN(additionalBudget) || additionalBudget < 5000) {
        alert('추가 투자 금액은 최소 5,000원(5게임) 이상이어야 합니다.');
        return;
    }

    const additionalGames = Math.min(50, Math.max(5, Math.floor(additionalBudget / 1000)));
    const btn = document.getElementById('btnStartBudgetOptimization');
    const terminal = document.getElementById('optSimProcessTerminal');
    const progBar = document.getElementById('optSimProgressBar');
    const resultContainer = document.getElementById('optSimResultContainer');

    if (btn) btn.disabled = true;
    if (resultContainer) resultContainer.style.display = 'none';
    if (terminal) terminal.innerHTML = '';

    function logTerminal(msg, color = '#e2e8f0', isBold = false) {
        if (!terminal) return;
        const line = document.createElement('div');
        line.style.color = color;
        line.style.fontWeight = isBold ? '700' : '400';
        line.style.fontSize = '0.82rem';
        line.style.lineHeight = '1.5';
        line.innerHTML = msg;
        terminal.appendChild(line);
        terminal.scrollTop = terminal.scrollHeight;
    }

    // 1. Gather Owned Packs
    const ownedPacks = [];
    ALL_PACK_DEFS.forEach(p => {
        const chk = document.getElementById(`chkOptOwned_${p.id}`);
        if (chk && chk.checked) {
            ownedPacks.push(p);
        }
    });

    const ownedNames = ownedPacks.length > 0 ? ownedPacks.map(p => p.shortName).join(' + ') : '없음 (0게임)';
    const ownedGames = ownedPacks.reduce((sum, p) => sum + p.games, 0);

    logTerminal(`📌 [기존 보유 팩] <strong>${ownedNames}</strong> (${ownedGames}게임 고정 포함)`, '#60a5fa', true);
    logTerminal(`🚀 [추가 구매 예산] <strong>${additionalBudget.toLocaleString()}원 (${additionalGames}게임 추가)</strong> 시너지 1위 팩 탐색 시작...`, '#38bdf8', true);
    await new Promise(r => setTimeout(r, 120));

    const maxRound = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1238);
    logTerminal(`📊 [데이터] 1회차 ~ ${maxRound}회차 실당첨번호 빅데이터 및 마르코프 전이 행렬 로드 완료`, '#94a3b8');
    await new Promise(r => setTimeout(r, 150));

    // 2. Determine Candidate Additional Packs (excluding already owned ones)
    let candidatePool = ALL_PACK_DEFS.filter(p => !ownedPacks.some(op => op.id === p.id));
    if (candidatePool.length === 0) {
        // Fallback: If all packs are checked as owned, re-evaluate extra packs 1~5
        candidatePool = ALL_PACK_DEFS.filter(p => p.type === 'extra');
    }
    const neededPackCount = Math.max(1, Math.floor(additionalGames / 10));

    function getCombinations(arr, k) {
        const results = [];
        function combine(start, current) {
            if (current.length === k) {
                results.push([...current]);
                return;
            }
            for (let i = start; i < arr.length; i++) {
                current.push(arr[i]);
                combine(i + 1, current);
                current.pop();
            }
        }
        combine(0, []);
        return results;
    }

    let candidateCombinations = [];
    if (candidatePool.length >= neededPackCount) {
        candidateCombinations = getCombinations(candidatePool, neededPackCount);
    } else {
        candidateCombinations = [candidatePool];
    }

    if (candidateCombinations.length === 0) {
        candidateCombinations = [ALL_PACK_DEFS.slice(0, 1)];
    }

    logTerminal(`🔍 [후보군 탐색] 총 ${candidateCombinations.length}개 추가팩 조합 후보군 구성 완료. 1~${maxRound}회 리얼 백테스팅 대조 중...`, '#fbbf24', true);
    await new Promise(r => setTimeout(r, 150));

    let bestScore = -1;
    let bestNewPacks = null;
    let bestMetrics = null;

    const evaluatedDrawCount = maxRound;
    const totalPortfolioGames = ownedGames + additionalGames;

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    for (let cIdx = 0; cIdx < candidateCombinations.length; cIdx++) {
        const newPacks = candidateCombinations[cIdx];
        const newPackNames = newPacks.map(p => p.shortName).join(' + ');
        const fullPortfolio = [...ownedPacks, ...newPacks];

        let hit1st = 0, hit2nd = 0, hit3rd = 0, hit4th = 0, hit5th = 0;
        let totalPrize = 0;

        for (let r = maxRound; r >= 1; r--) {
            const draw = state.mergedHistory[r];
            if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) continue;
            
            const winningSet = new Set(draw.numbers);
            const bonusNum = draw.bonus;

            const roundCombos = [];
            fullPortfolio.forEach(item => {
                if (item.type === 'engine') {
                    const c = computeAbsoluteTop10Combinations(false, r, item.version, true, effectiveUserId) || [];
                    roundCombos.push(...(item.games === 5 ? c.slice(0, 5) : c));
                } else if (item.type === 'extra') {
                    const p = generateExtraAddonPack(item.packId, r, effectiveUserId);
                    if (p && Array.isArray(p.combos)) roundCombos.push(...p.combos);
                }
            });

            roundCombos.forEach(combo => {
                const nums = getComboNumbers(combo);
                if (!Array.isArray(nums) || nums.length !== 6) return;

                const matchCount = nums.filter(n => winningSet.has(n)).length;
                const isBonus = nums.includes(bonusNum);

                if (matchCount === 6) { hit1st++; totalPrize += (draw.firstWinamnt || 2000000000); }
                else if (matchCount === 5 && isBonus) { hit2nd++; totalPrize += 50000000; }
                else if (matchCount === 5) { hit3rd++; totalPrize += 1500000; }
                else if (matchCount === 4) { hit4th++; totalPrize += 50000; }
                else if (matchCount === 3) { hit5th++; totalPrize += 5000; }
            });
        }

        const totalHits = hit1st + hit2nd + hit3rd + hit4th + hit5th;
        const totalCost = evaluatedDrawCount * totalPortfolioGames * 1000;
        const roi = totalCost > 0 ? ((totalPrize / totalCost) * 100).toFixed(1) : 0;
        
        const hitScore = (hit1st * 5000000) + (hit2nd * 300000) + (hit3rd * 15000) + (hit4th * 200) + hit5th;

        const pct = Math.round(((cIdx + 1) / candidateCombinations.length) * 100);
        if (progBar) progBar.style.width = pct + '%';

        logTerminal(`[후보 ${cIdx + 1}/${candidateCombinations.length}] 기존 + <strong>[신규: ${newPackNames}]</strong> ➔ 1등: ${hit1st}회 | 2등: ${hit2nd}회 | 3등: ${hit3rd}회 | 누적: <strong>${totalHits}회</strong> (ROI: ${roi}%)`, '#cbd5e1');
        await new Promise(r => setTimeout(r, 60));

        if (hitScore > bestScore || bestNewPacks === null) {
            bestScore = hitScore;
            bestNewPacks = newPacks;
            bestMetrics = {
                hit1st, hit2nd, hit3rd, hit4th, hit5th,
                totalHits, totalPrize, roi, totalCost,
                ownedGames, additionalGames, totalPortfolioGames, additionalBudget
            };
        }
    }

    logTerminal(`✨ [최적 추가팩 확정] 기존 보유팩과의 상호보완 시너지가 가장 높은 1위 추가팩 도출 완료!`, '#34d399', true);

    if (btn) btn.disabled = false;
    currentOptimizedResult = { ownedPacks, bestNewPacks, metrics: bestMetrics };

    renderOptimizationResult(ownedPacks, bestNewPacks, bestMetrics);
}

function renderOptimizationResult(ownedPacks, bestNewPacks, metrics) {
    const resultContainer = document.getElementById('optSimResultContainer');
    if (!resultContainer) return;
    resultContainer.style.display = 'block';

    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);
    
    const ownedHtml = ownedPacks.length > 0 
        ? ownedPacks.map(p => `<span style="background: rgba(255,255,255,0.08); border: 1px solid #475569; color: #cbd5e1; padding: 3px 6px; border-radius: 5px; font-size: 0.72rem; white-space: nowrap;">✓ ${p.shortName}</span>`).join(' ')
        : '<span style="color: #94a3b8; font-size: 0.72rem;">없음</span>';

    const newPacksHtml = bestNewPacks.map(p => `
        <span style="background: ${p.color}25; border: 1.5px solid ${p.color}; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px ${p.color}35; line-height: 1.2;">
            <i class="fa-solid fa-star" style="color: #fbbf24; font-size: 0.75rem;"></i> ${p.name}
        </span>
    `).join(' ');

    resultContainer.innerHTML = `
        <div style="background: linear-gradient(145deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.95)); border: 1.5px solid #10b981; border-radius: 12px; padding: 14px; box-shadow: 0 8px 25px rgba(16, 185, 129, 0.2); box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
                    <span style="background: #10b981; color: #0f172a; padding: 2px 7px; border-radius: 10px; font-weight: 800; font-size: 0.72rem; flex-shrink: 0;">
                        🏆 추천
                    </span>
                    <h4 style="margin: 0; color: #fff; font-size: 0.98rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        제 ${curUpcomingRound}회차 추가 구매 (${metrics.additionalBudget.toLocaleString()}원 / ${metrics.additionalGames}게임)
                    </h4>
                </div>
                <div style="color: #fbbf24; font-weight: 800; font-size: 0.8rem;">
                    시너지 1위 확정
                </div>
            </div>

            <!-- Existing Owned Section -->
            <div style="margin-bottom: 8px; background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); box-sizing: border-box;">
                <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 4px; font-weight: 700;">
                    <i class="fa-solid fa-check-double"></i> 기존 보유 팩 (${metrics.ownedGames}게임 고정):
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    ${ownedHtml}
                </div>
            </div>

            <!-- Recommended New Extra Pack Section -->
            <div style="margin-bottom: 10px; background: rgba(16,185,129,0.15); padding: 10px 10px; border-radius: 8px; border: 1px solid rgba(16,185,129,0.4); box-sizing: border-box;">
                <div style="font-size: 0.76rem; color: #34d399; margin-bottom: 5px; font-weight: 800;">
                    <i class="fa-solid fa-bullseye"></i> 🎯 이번 추가 구매 최적 추천 팩 (${metrics.additionalGames}게임):
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                    ${newPacksHtml}
                </div>
            </div>

            <!-- Historical Performance Stats Grid (Responsive 5-Item Card Layout) -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 5px; margin-bottom: 12px; box-sizing: border-box;">
                <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.68rem;">총 적중</div>
                    <div style="color: #fbbf24; font-size: 0.95rem; font-weight: 800;">${metrics.totalHits.toLocaleString()}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.68rem;">1등 당첨</div>
                    <div style="color: #fbbf24; font-size: 0.95rem; font-weight: 800;">${metrics.hit1st}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.68rem;">2·3등 당첨</div>
                    <div style="color: #60a5fa; font-size: 0.95rem; font-weight: 800;">${metrics.hit2nd + metrics.hit3rd}회 <span style="font-size:0.65rem;">(${metrics.hit2nd}/${metrics.hit3rd})</span></div>
                </div>
                <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.68rem;">4·5등 당첨</div>
                    <div style="color: #34d399; font-size: 0.95rem; font-weight: 800;">${metrics.hit4th + metrics.hit5th}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.06); padding: 6px 4px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.68rem;">환급 ROI</div>
                    <div style="color: #f43f5e; font-size: 0.95rem; font-weight: 800;">${metrics.roi}%</div>
                </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                <button type="button" onclick="window.applyOptimizedCombinationToApp && window.applyOptimizedCombinationToApp()" class="btn-primary" style="width: 100%; padding: 11px 16px; font-size: 0.9rem; font-weight: 800; border-radius: 8px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 3px 12px rgba(16, 185, 129, 0.35);">
                    <i class="fa-solid fa-circle-arrow-down"></i> 최적 추가팩 추천기 즉시 적용
                </button>
            </div>
        </div>
    `;

    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function applyOptimizedCombinationToApp() {
    console.log('[applyOptimizedCombinationToApp] Called, currentOptimizedResult:', currentOptimizedResult);
    if (!currentOptimizedResult || !currentOptimizedResult.bestNewPacks) {
        console.warn('[applyOptimizedCombinationToApp] No currentOptimizedResult or bestNewPacks!');
        return;
    }
    const { bestNewPacks } = currentOptimizedResult;
    const curUpcomingRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    console.log('[applyOptimized] effectiveUserId:', effectiveUserId, 'curUpcomingRound:', curUpcomingRound);
    console.log('[applyOptimized] bestNewPacks:', JSON.stringify(bestNewPacks));

    // 1. Get current active pack IDs for this user
    const currentActivePackIds = (typeof window.getUserActiveExtraPackIds === 'function')
        ? window.getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound)
        : [];
    const activePackSet = new Set(currentActivePackIds);

    // 2. Add newly recommended extra packs
    let v4Selected = false;
    let v3Selected = false;

    bestNewPacks.forEach(p => {
        if (p.type === 'extra') {
            activePackSet.add(p.packId);
        } else if (p.type === 'engine') {
            if (p.version === 'v4') v4Selected = true;
            if (p.version === 'v3') v3Selected = true;
        }
    });

    const newActiveList = Array.from(activePackSet).sort((a,b) => a - b);
    console.log('[applyOptimized] Saving newActiveList:', newActiveList);

    // Save to user extra pack store
    if (typeof window.saveUserActiveExtraPackIds === 'function') {
        window.saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, newActiveList);
    }

    // If engine selection changed
    if (v4Selected) {
        const chkReport = document.getElementById('chkUseV4ReportLogic');
        if (chkReport) chkReport.checked = true;
        localStorage.setItem('lotto_pref_v4', 'true');
        state.fixedTop5Combinations = state.fixedTop5Combinations_v4 || computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v4', true, effectiveUserId);
    } else if (v3Selected) {
        const chkReport = document.getElementById('chkUseV4ReportLogic');
        if (chkReport) chkReport.checked = false;
        localStorage.setItem('lotto_pref_v4', 'false');
        state.fixedTop5Combinations = state.fixedTop5Combinations_v3 || computeAbsoluteTop10Combinations(true, curUpcomingRound, 'v3', true, effectiveUserId);
    }

    // 3. Close modal
    closeBudgetOptimizerModal();

    // 4. Update UI in generator tab
    setTimeout(() => {
        if (typeof renderTop5Combinations === 'function') renderTop5Combinations(false);
        if (typeof renderExtraAddonPacksSection === 'function') renderExtraAddonPacksSection();
        if (typeof updateTop7AlgoUI === 'function') updateTop7AlgoUI();
    }, 200);

    const addedNames = bestNewPacks.map(p => p.name).join(', ');
    showToast(`🎉 [${addedNames}]이(가) [${effectiveUserId}] 님의 추천기에 즉시 반영되었습니다!`);
}

if (typeof window !== 'undefined') {
    window.openBudgetOptimizerModal = openBudgetOptimizerModal;
    window.closeBudgetOptimizerModal = closeBudgetOptimizerModal;
    window.clearOwnedPacksSelection = clearOwnedPacksSelection;
    window.setBudgetAmount = setBudgetAmount;
    window.runBudgetOptimizationSimulation = runBudgetOptimizationSimulation;
    window.applyOptimizedCombinationToApp = applyOptimizedCombinationToApp;
}
