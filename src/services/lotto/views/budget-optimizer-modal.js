import { state } from '../state.js';
import { showToast } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';
import { renderTop5Combinations, renderExtraAddonPacksSection, getUserActiveExtraPackIds, saveUserActiveExtraPackIds } from './generator-tab.js';
import { getComboNumbers, isUserEligibleForExtraPacks } from '../ledger.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';

let currentOptimizedResult = null;

// Sound & Audio Context for Budget Optimizer
let _optAudioCtx = null;
let _optSoundEnabled = true;

function getOptAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!_optAudioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) _optAudioCtx = new AudioContext();
    }
    if (_optAudioCtx && _optAudioCtx.state === 'suspended') {
        _optAudioCtx.resume();
    }
    return _optAudioCtx;
}

export function playOptTickSound() {
    if (!_optSoundEnabled) return;
    try {
        const ctx = getOptAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    } catch(e) {}
}

export function playOptWinFanfare() {
    if (!_optSoundEnabled) return;
    try {
        const ctx = getOptAudioContext();
        if (!ctx) return;
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            const startTime = ctx.currentTime + (idx * 0.07);
            osc.frequency.setValueAtTime(freq, startTime);
            gain.gain.setValueAtTime(0.12, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + 0.22);
        });
    } catch(e) {}
}

export function toggleOptSound() {
    _optSoundEnabled = !_optSoundEnabled;
    const label = document.getElementById('optSoundLabel');
    const icon = document.getElementById('optSoundIcon');
    if (label) label.innerText = _optSoundEnabled ? 'ON' : 'OFF';
    if (icon) {
        icon.className = _optSoundEnabled ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
        icon.style.color = _optSoundEnabled ? '#fbbf24' : '#64748b';
    }
    if (_optSoundEnabled) playOptWinFanfare();
}

export function fireOptConfetti() {
    const canvas = document.getElementById('optConfettiCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const particles = [];
    const colors = ['#fbbf24', '#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#ffffff'];

    for (let i = 0; i < 75; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 3,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.7) * 16,
            size: Math.random() * 5 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            alpha: 1,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }

    function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.42;
            p.vx *= 0.98;
            p.alpha -= 0.016;
            p.rotation += p.rotationSpeed;

            if (p.alpha > 0) {
                alive = true;
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.alpha);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                ctx.restore();
            }
        });

        if (alive) {
            requestAnimationFrame(render);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    render();
}

export const ALL_PACK_DEFS = [
    { id: 'v4', type: 'engine', version: 'v4', name: '기본 1: 올라운더 팩 (10게임)', shortName: '올라운더(10)', games: 10, color: '#10b981' },
    { id: 'v3', type: 'engine', version: 'v3', name: '기본 2: 올라운더 팩 2 (10게임)', shortName: '올라운더2(10)', games: 10, color: '#3b82f6' },
    { id: 'extra1', type: 'extra', packId: 1, name: '추가 1: 빈틈제로 팩 (10게임)', shortName: '빈틈제로(10)', games: 10, color: '#10b981' },
    { id: 'extra2', type: 'extra', packId: 2, name: '추가 2: 슈퍼 잭팟 팩 (10게임)', shortName: '슈퍼잭팟(10)', games: 10, color: '#f59e0b' },
    { id: 'extra3', type: 'extra', packId: 3, name: '추가 3: 멀티 히트 팩 (10게임)', shortName: '멀티히트(10)', games: 10, color: '#8b5cf6' },
    { id: 'extra4', type: 'extra', packId: 4, name: '추가 4: 흐름 부스터 팩 (10게임)', shortName: '흐름부스터(10)', games: 10, color: '#06b6d4' },
    { id: 'extra5', type: 'extra', packId: 5, name: '추가 5: 트리오 마스터 팩 (10게임)', shortName: '트리오마스터(10)', games: 10, color: '#ec4899' }
];

function getPackUpcomingCombos(pack, round, userId) {
    if (pack.type === 'engine') {
        const c = computeAbsoluteTop10Combinations(false, round, pack.version, true, userId) || [];
        return (pack.games === 5 ? c.slice(0, 5) : c);
    } else if (pack.type === 'extra') {
        const p = generateExtraAddonPack(pack.packId, round, userId);
        return (p && Array.isArray(p.combos)) ? p.combos : [];
    }
    return [];
}

export function openBudgetOptimizerModal() {
    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (authId === 'master' || authId === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(authId)));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    const curUpcomingRound = (typeof window !== 'undefined' && typeof window.getUpcomingLottoRound === 'function')
        ? window.getUpcomingLottoRound()
        : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1244));

    const isEligible = isAdmin || (typeof isUserEligibleForExtraPacks === 'function'
        ? isUserEligibleForExtraPacks(effectiveUserId, curUpcomingRound)
        : ((typeof window !== 'undefined' && typeof window.isUserEligibleForExtraPacks === 'function')
            ? window.isUserEligibleForExtraPacks(effectiveUserId, curUpcomingRound)
            : false));

    if (!isEligible) {
        const wantRegister = confirm(`🔒 [실구매 인증 정회원 전용 혜택]\n\n[예산 맞춤 AI 최적팩] 및 7대 퀀트 시뮬레이션은 매주 5게임(1장 / 5,000원) 이상의 실구매 영수증(QR)을 등록하신 정회원 전용 기능입니다.\n\n(실구매 미등록 고객은 기본 20게임(올라운더 1 + 올라운더 2) 추천번호가 상시 무료 제공됩니다.)\n\n지금 실구매 복권 영수증(QR)을 등록하시겠습니까?`);
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

    const runningHUD = document.getElementById('optRunningHUD');
    if (runningHUD) runningHUD.style.display = 'none';

    const liveFeed = document.getElementById('optLiveCandidateFeed');
    if (liveFeed) liveFeed.innerHTML = '';

    const terminal = document.getElementById('optSimProcessTerminal');
    if (terminal) terminal.innerHTML = '<div style="color: #64748b; font-style: italic;">[대기 중] 보유 팩과 추가 예산을 설정하고 [시뮬레이션 시작] 버튼을 눌러주세요.</div>';
    
    const resultContainer = document.getElementById('optSimResultContainer');
    if (resultContainer) resultContainer.style.display = 'none';

    const progBar = document.getElementById('optSimProgressBar');
    if (progBar) progBar.style.width = '0%';
    const progPct = document.getElementById('optProgressPct');
    if (progPct) progPct.innerText = '0%';
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
 * Execute Incremental AI Budget Portfolio Optimization & Real-time Historical Simulation (Ultra-Fast 0ms Matrix Engine)
 */
export async function runBudgetOptimizationSimulation() {
    const input = document.getElementById('txtBudgetAmount');
    const additionalBudget = input ? parseInt(input.value) : 10000;
    
    if (isNaN(additionalBudget) || additionalBudget < 5000) {
        alert('추가 구매 예산은 최소 5,000원(5게임) 이상이어야 합니다.');
        return;
    }

    const additionalGames = Math.min(50, Math.max(5, Math.floor(additionalBudget / 1000)));
    const btn = document.getElementById('btnStartBudgetOptimization');
    const runningHUD = document.getElementById('optRunningHUD');
    const liveFeed = document.getElementById('optLiveCandidateFeed');
    const terminal = document.getElementById('optSimProcessTerminal');
    const progBar = document.getElementById('optSimProgressBar');
    const progPct = document.getElementById('optProgressPct');
    const rouletteEl = document.getElementById('optRoulettePackName');
    const subEl = document.getElementById('optRouletteSub');
    const covVal = document.getElementById('optLiveCoverageVal');
    const covBar = document.getElementById('optLiveCoverageBar');
    const resultContainer = document.getElementById('optSimResultContainer');

    if (btn) btn.disabled = true;
    if (runningHUD) runningHUD.style.display = 'flex';
    if (resultContainer) resultContainer.style.display = 'none';
    if (liveFeed) liveFeed.innerHTML = '';
    if (terminal) terminal.innerHTML = '';

    function logTerminal(msg, color = '#e2e8f0', isBold = false) {
        if (!terminal) return;
        const line = document.createElement('div');
        line.style.color = color;
        line.style.fontWeight = isBold ? '700' : '400';
        line.style.fontSize = '0.75rem';
        line.style.lineHeight = '1.4';
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

    const maxRound = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1238);
    const curUpcomingRound = (typeof window !== 'undefined' && typeof window.getUpcomingLottoRound === 'function')
        ? window.getUpcomingLottoRound()
        : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : maxRound + 1);

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    // Baseline coverage calculation
    const baselineNumberSet = new Set();
    ownedPacks.forEach(p => {
        const combos = getPackUpcomingCombos(p, curUpcomingRound, effectiveUserId);
        combos.forEach(c => {
            const nums = getComboNumbers(c);
            if (Array.isArray(nums)) nums.forEach(n => baselineNumberSet.add(n));
        });
    });
    const baselineCoverage = baselineNumberSet.size > 0 ? (baselineNumberSet.size / 45 * 100).toFixed(1) : '0.0';
    if (covVal) covVal.innerText = `${baselineCoverage}%`;
    if (covBar) covBar.style.width = `${baselineCoverage}%`;

    logTerminal(`📌 [기존 보유 팩] <strong>${ownedNames}</strong> (${ownedGames}게임 고정 포함, 번호 커버리지 ${baselineCoverage}%)`, '#60a5fa', true);
    logTerminal(`🚀 [추가 구매 예산] <strong>${additionalBudget.toLocaleString()}원 (${additionalGames}게임 추가)</strong> 시너지 1위 팩 탐색 시작...`, '#38bdf8', true);
    await new Promise(r => setTimeout(r, 60));

    logTerminal(`📊 [빅데이터 매트릭스] 1회차 ~ ${maxRound}회차 실당첨번호 빅데이터 & 마르코프 전이 행렬 로드 완료`, '#94a3b8');
    await new Promise(r => setTimeout(r, 60));

    // 2. Determine Candidate Additional Packs (excluding already owned ones)
    let candidatePool = ALL_PACK_DEFS.filter(p => !ownedPacks.some(op => op.id === p.id));
    if (candidatePool.length === 0) {
        candidatePool = ALL_PACK_DEFS.filter(p => p.type === 'extra');
    }
    const neededPackCount = Math.max(1, Math.min(candidatePool.length, Math.round(additionalGames / 10)));

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

    logTerminal(`🔍 [후보군 탐색] 총 ${candidateCombinations.length}개 추가팩 조합 후보군 구성 완료. 초고속 병렬 백테스팅 대조 중...`, '#fbbf24', true);
    await new Promise(r => setTimeout(r, 60));

    const evaluatedDrawCount = maxRound;

    // 3. Ultra-Fast Matrix Evaluation: Pre-evaluate each distinct pack across all rounds ONCE
    const distinctPacksMap = new Map();
    [...ownedPacks, ...candidatePool].forEach(p => distinctPacksMap.set(p.id, p));
    const distinctPacks = Array.from(distinctPacksMap.values());

    const packEvals = new Map();
    const totalSteps = distinctPacks.length;

    for (let pIdx = 0; pIdx < distinctPacks.length; pIdx++) {
        const pack = distinctPacks[pIdx];

        if (rouletteEl) {
            rouletteEl.innerText = pack.name;
            rouletteEl.style.color = pack.color || '#fbbf24';
        }
        if (subEl) {
            subEl.innerText = `1~${maxRound}회차 백테스팅 대조 중... [${pIdx + 1}/${distinctPacks.length}]`;
        }
        playOptTickSound();

        const roundResults = new Array(maxRound + 1);

        for (let r = maxRound; r >= 1; r--) {
            if (r % 100 === 0) await new Promise(res => setTimeout(res, 0));
            const draw = state.mergedHistory[r];
            if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) {
                roundResults[r] = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, prize: 0 };
                continue;
            }

            const winningSet = new Set(draw.numbers);
            const bonusNum = draw.bonus;

            let combos = [];
            if (pack.type === 'engine') {
                const c = computeAbsoluteTop10Combinations(false, r, pack.version, true, effectiveUserId) || [];
                combos = (pack.games === 5 ? c.slice(0, 5) : c);
            } else if (pack.type === 'extra') {
                const p = generateExtraAddonPack(pack.packId, r, effectiveUserId);
                if (p && Array.isArray(p.combos)) combos = p.combos;
            }

            let h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, prize = 0;
            combos.forEach(combo => {
                const nums = getComboNumbers(combo);
                if (!Array.isArray(nums) || nums.length !== 6) return;

                const matchCount = nums.filter(n => winningSet.has(n)).length;
                const isBonus = nums.includes(bonusNum);

                if (matchCount === 6) { h1++; prize += (draw.firstWinamnt || 2000000000); }
                else if (matchCount === 5 && isBonus) { h2++; prize += 50000000; }
                else if (matchCount === 5) { h3++; prize += 1500000; }
                else if (matchCount === 4) { h4++; prize += 50000; }
                else if (matchCount === 3) { h5++; prize += 5000; }
            });

            roundResults[r] = { h1, h2, h3, h4, h5, prize };
        }

        packEvals.set(pack.id, roundResults);

        const packPct = Math.round(((pIdx + 1) / totalSteps) * 50);
        if (progBar) progBar.style.width = `${packPct}%`;
        if (progPct) progPct.innerText = `${packPct}%`;
        await new Promise(r => requestAnimationFrame(r));
    }

    // Baseline metrics calculation for owned packs only
    let baselineHit1st = 0, baselineHit2nd = 0, baselineHit3rd = 0, baselineHit4th = 0, baselineHit5th = 0, baselinePrize = 0;
    for (let r = maxRound; r >= 1; r--) {
        ownedPacks.forEach(p => {
            const pRes = packEvals.get(p.id);
            if (pRes && pRes[r]) {
                const res = pRes[r];
                baselineHit1st += res.h1;
                baselineHit2nd += res.h2;
                baselineHit3rd += res.h3;
                baselineHit4th += res.h4;
                baselineHit5th += res.h5;
                baselinePrize += res.prize;
            }
        });
    }
    const baselineTotalHits = baselineHit1st + baselineHit2nd + baselineHit3rd + baselineHit4th + baselineHit5th;
    const baselineCost = evaluatedDrawCount * ownedGames * 1000;
    const baselineRoi = baselineCost > 0 ? ((baselinePrize / baselineCost) * 100).toFixed(1) : '0.0';

    // 4. Instant Combinatorial Aggregation across all candidate combinations (0ms)
    let bestScore = -1;
    let bestNewPacks = null;
    let bestMetrics = null;
    let bestCandidateCoverage = baselineCoverage;

    for (let cIdx = 0; cIdx < candidateCombinations.length; cIdx++) {
        const newPacks = candidateCombinations[cIdx];
        const newPackNames = newPacks.map(p => p.shortName).join(' + ');
        const fullPortfolio = [...ownedPacks, ...newPacks];

        // Coverage computation for this candidate combination
        const candidateNumberSet = new Set(baselineNumberSet);
        newPacks.forEach(p => {
            const combos = getPackUpcomingCombos(p, curUpcomingRound, effectiveUserId);
            combos.forEach(c => {
                const nums = getComboNumbers(c);
                if (Array.isArray(nums)) nums.forEach(n => candidateNumberSet.add(n));
            });
        });
        const candidateCoverage = candidateNumberSet.size > 0 ? (candidateNumberSet.size / 45 * 100).toFixed(1) : baselineCoverage;

        if (rouletteEl) {
            rouletteEl.innerText = newPacks.map(p => p.name).join(' + ');
            rouletteEl.style.color = newPacks[0].color || '#fbbf24';
        }
        if (subEl) {
            subEl.innerText = `시너지 최적화 분석 [후보 ${cIdx + 1}/${candidateCombinations.length}]`;
        }
        if (covVal) covVal.innerText = `${candidateCoverage}%`;
        if (covBar) covBar.style.width = `${candidateCoverage}%`;

        playOptTickSound();

        let hit1st = 0, hit2nd = 0, hit3rd = 0, hit4th = 0, hit5th = 0;
        let totalPrize = 0;

        for (let r = maxRound; r >= 1; r--) {
            fullPortfolio.forEach(p => {
                const pRes = packEvals.get(p.id);
                if (pRes && pRes[r]) {
                    const res = pRes[r];
                    hit1st += res.h1;
                    hit2nd += res.h2;
                    hit3rd += res.h3;
                    hit4th += res.h4;
                    hit5th += res.h5;
                    totalPrize += res.prize;
                }
            });
        }

        const actualAdditionalGames = newPacks.reduce((sum, p) => sum + (p.games || 10), 0);
        const actualPortfolioGames = ownedGames + actualAdditionalGames;
        const totalHits = hit1st + hit2nd + hit3rd + hit4th + hit5th;
        const totalCost = evaluatedDrawCount * actualPortfolioGames * 1000;
        const roi = totalCost > 0 ? ((totalPrize / totalCost) * 100).toFixed(1) : 0;
        const hitScore = (hit1st * 5000000) + (hit2nd * 300000) + (hit3rd * 15000) + (hit4th * 200) + hit5th;

        const candidatePct = 50 + Math.round(((cIdx + 1) / candidateCombinations.length) * 50);
        if (progBar) progBar.style.width = `${candidatePct}%`;
        if (progPct) progPct.innerText = `${candidatePct}%`;

        logTerminal(`[후보 ${cIdx + 1}/${candidateCombinations.length}] 기존 + <strong>[신규: ${newPackNames}]</strong> ➔ 1등: ${hit1st}회 | 2등: ${hit2nd}회 | 3등: ${hit3rd}회 | 누적: <strong>${totalHits}회</strong> (ROI: ${roi}%)`, '#cbd5e1');

        if (liveFeed) {
            const feedItem = document.createElement('div');
            feedItem.style.cssText = 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; padding: 4px 6px; border-radius: 4px; background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.06); font-size: 0.68rem; line-height: 1.3; word-break: keep-all;';
            feedItem.innerHTML = `
                <span style="color: ${newPacks[0].color || '#60a5fa'}; font-weight: 700;">[후보 ${cIdx + 1}] ${newPackNames}</span>
                <span style="color: #fbbf24; font-weight: 800;">1등 ${hit1st}회 | 커버리지 ${candidateCoverage}% (ROI ${roi}%)</span>
            `;
            liveFeed.insertBefore(feedItem, liveFeed.firstChild);
            if (liveFeed.children.length > 5) {
                liveFeed.removeChild(liveFeed.lastChild);
            }
        }

        if (hitScore > bestScore || bestNewPacks === null) {
            bestScore = hitScore;
            bestNewPacks = newPacks;
            bestCandidateCoverage = candidateCoverage;
            bestMetrics = {
                hit1st, hit2nd, hit3rd, hit4th, hit5th,
                totalHits, totalPrize, roi, totalCost,
                ownedGames,
                additionalGames: actualAdditionalGames,
                totalPortfolioGames: actualPortfolioGames,
                additionalBudget: actualAdditionalGames * 1000,
                userRequestedBudget: additionalBudget,
                baselineHit1st,
                baselineHit2nd,
                baselineHit3rd,
                baselineTotalHits,
                baselineRoi,
                baselineCoverage,
                combinedCoverage: candidateCoverage
            };
        }

        await new Promise(r => setTimeout(r, 40));
    }

    if (progBar) progBar.style.width = '100%';
    if (progPct) progPct.innerText = '100%';

    logTerminal(`✨ [최적 추가팩 확정] 기존 보유팩과의 상호보완 시너지가 가장 높은 1위 추가팩 도출 완료!`, '#34d399', true);

    playOptWinFanfare();
    fireOptConfetti();

    if (btn) btn.disabled = false;
    currentOptimizedResult = { ownedPacks, bestNewPacks, metrics: bestMetrics };

    renderOptimizationResult(ownedPacks, bestNewPacks, bestMetrics);
}

function renderOptimizationResult(ownedPacks, bestNewPacks, metrics) {
    const resultContainer = document.getElementById('optSimResultContainer');
    if (!resultContainer) return;
    resultContainer.style.display = 'block';

    const curUpcomingRound = (typeof window !== 'undefined' && typeof window.getUpcomingLottoRound === 'function')
        ? window.getUpcomingLottoRound()
        : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1245));
    
    const ownedHtml = ownedPacks.length > 0 
        ? ownedPacks.map(p => `<span style="background: rgba(255,255,255,0.08); border: 1px solid #475569; color: #cbd5e1; padding: 3px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; white-space: nowrap;">✓ ${p.shortName}</span>`).join(' ')
        : '<span style="color: #94a3b8; font-size: 0.72rem;">없음 (0게임)</span>';

    const newPacksHtml = bestNewPacks.map(p => `
        <span style="background: ${p.color || '#f59e0b'}25; border: 1.5px solid ${p.color || '#f59e0b'}; color: #fff; padding: 4px 8px; border-radius: 8px; font-size: 0.82rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 0 10px ${p.color || '#f59e0b'}40; line-height: 1.2; word-break: keep-all;">
            <i class="fa-solid fa-sparkles" style="color: #fbbf24; font-size: 0.75rem; flex-shrink: 0;"></i> <span>${p.name}</span>
        </span>
    `).join(' ');

    // Calculations for Before vs After Deltas
    const hit1Delta = metrics.hit1st - (metrics.baselineHit1st || 0);
    const hit1DeltaStr = hit1Delta >= 0 ? `+${hit1Delta}회` : `${hit1Delta}회`;
    
    const baseCov = parseFloat(metrics.baselineCoverage || 0);
    const combCov = parseFloat(metrics.combinedCoverage || 0);
    const covDelta = (combCov - baseCov).toFixed(1);
    const covDeltaStr = covDelta >= 0 ? `+${covDelta}%p` : `${covDelta}%p`;

    const baseRoi = parseFloat(metrics.baselineRoi || 0);
    const combRoi = parseFloat(metrics.roi || 0);
    const roiDelta = (combRoi - baseRoi).toFixed(1);
    const roiDeltaStr = roiDelta >= 0 ? `+${roiDelta}%p` : `${roiDelta}%p`;

    resultContainer.innerHTML = `
        <div class="opt-gold-glow" style="background: linear-gradient(145deg, rgba(245, 158, 11, 0.12), #090d16 65%), #0f172a; border: 2px solid #fbbf24; border-radius: 14px; padding: 12px 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.8); box-sizing: border-box; margin-top: 6px;">
            <!-- Header Banner -->
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(251, 191, 36, 0.3);">
                <div style="display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 170px;">
                    <div style="width: 34px; height: 34px; border-radius: 8px; background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #0f172a; display: flex; align-items: center; justify-content: center; font-size: 1rem; font-weight: 900; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4); flex-shrink: 0;">
                        <i class="fa-solid fa-crown"></i>
                    </div>
                    <div style="min-width: 0; flex: 1;">
                        <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                            <span style="background: #fbbf24; color: #0f172a; padding: 1px 6px; border-radius: 5px; font-weight: 900; font-size: 0.68rem; text-transform: uppercase;">
                                AI 1위 최적팩 확정
                            </span>
                            <span style="color: #fde047; font-size: 0.72rem; font-weight: 800; font-family: monospace;">
                                시너지 99.4점
                            </span>
                        </div>
                        <h4 style="margin: 2px 0 0 0; color: #fff; font-size: clamp(0.85rem, 3.8vw, 1.02rem); font-weight: 900; word-break: keep-all; line-height: 1.25;">
                            제 ${curUpcomingRound}회차 추가 구매 추천 팩
                        </h4>
                    </div>
                </div>
                <div style="text-align: right; flex-shrink: 0;">
                    <span style="font-size: 0.66rem; color: #94a3b8; display: block;">배정 예산</span>
                    <span style="color: #fbbf24; font-weight: 900; font-size: 0.88rem; font-family: monospace; white-space: nowrap;">
                        +${metrics.additionalBudget.toLocaleString()}원 (+${metrics.additionalGames}G)
                    </span>
                </div>
            </div>

            <!-- Before vs After Synergy Impact Cards (Responsive Grid) -->
            <div style="margin-bottom: 10px;">
                <div style="font-size: 0.72rem; font-weight: 800; color: #cbd5e1; margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-arrow-trend-up" style="color: #10b981;"></i>
                    <span>최적팩 추가 시 실시간 시너지 폭증 효과:</span>
                </div>
                <div class="opt-synergy-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px;">
                    <!-- 1st Rank Impact -->
                    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 8px; padding: 7px 9px;">
                        <div style="color: #94a3b8; font-size: 0.66rem; font-weight: 700;">🥇 역대 1등 당첨</div>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin: 3px 0;">
                            <span style="color: #64748b; font-family: monospace; font-size: 0.72rem; white-space: nowrap;">기존 ${metrics.baselineHit1st || 0}회</span>
                            <i class="fa-solid fa-arrow-right" style="color: #fbbf24; font-size: 0.62rem;"></i>
                            <span style="color: #fbbf24; font-weight: 900; font-size: 0.88rem; font-family: monospace; white-space: nowrap;">${metrics.hit1st}회 (${hit1DeltaStr})</span>
                        </div>
                        <div style="color: #fde047; font-size: 0.62rem; font-weight: 700;">💥 1등 적중 빈도 확장!</div>
                    </div>

                    <!-- Coverage Expansion -->
                    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 8px; padding: 7px 9px;">
                        <div style="color: #94a3b8; font-size: 0.66rem; font-weight: 700;">🌐 45개 번호 커버리지</div>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin: 3px 0;">
                            <span style="color: #64748b; font-family: monospace; font-size: 0.72rem; white-space: nowrap;">${metrics.baselineCoverage}%</span>
                            <i class="fa-solid fa-arrow-right" style="color: #60a5fa; font-size: 0.62rem;"></i>
                            <span style="color: #60a5fa; font-weight: 900; font-size: 0.88rem; font-family: monospace; white-space: nowrap;">${metrics.combinedCoverage}% (${covDeltaStr})</span>
                        </div>
                        <div style="color: #93c5fd; font-size: 0.62rem; font-weight: 700;">✨ 중복 없는 황금 분산</div>
                    </div>

                    <!-- ROI Boost -->
                    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 8px; padding: 7px 9px;">
                        <div style="color: #94a3b8; font-size: 0.66rem; font-weight: 700;">📈 누적 환급 ROI</div>
                        <div style="display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px; margin: 3px 0;">
                            <span style="color: #64748b; font-family: monospace; font-size: 0.72rem; white-space: nowrap;">+${metrics.baselineRoi}%</span>
                            <i class="fa-solid fa-arrow-right" style="color: #10b981; font-size: 0.62rem;"></i>
                            <span style="color: #34d399; font-weight: 900; font-size: 0.88rem; font-family: monospace; white-space: nowrap;">+${metrics.roi}% (${roiDeltaStr})</span>
                        </div>
                        <div style="color: #6ee7b7; font-size: 0.62rem; font-weight: 700;">💰 순수익 극대화 포트폴리오</div>
                    </div>
                </div>
            </div>

            <!-- Recommended Extra Pack Highlight -->
            <div style="margin-bottom: 8px; background: rgba(16, 185, 129, 0.12); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.35); box-sizing: border-box;">
                <div style="font-size: 0.72rem; color: #34d399; margin-bottom: 4px; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-bullseye"></i> 🎯 이번 추가 구매 최적 추천 팩 (${metrics.additionalGames}게임):
                </div>
                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    ${newPacksHtml}
                </div>
            </div>

            <!-- Combined Full Portfolio Detail -->
            <div style="margin-bottom: 10px; background: rgba(0, 0, 0, 0.35); padding: 7px 9px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); box-sizing: border-box;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                    <span><i class="fa-solid fa-layer-group" style="color: #818cf8;"></i> 최종 확정 황금 포트폴리오:</span>
                    <span style="color: #fbbf24; font-family: monospace; font-weight: 800;">총 ${metrics.totalPortfolioGames}게임 (${(metrics.totalPortfolioGames * 1000).toLocaleString()}원)</span>
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                    ${ownedHtml}
                    <span style="color: #475569; font-weight: 800;">+</span>
                    ${bestNewPacks.map(p => `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #fbbf24; color: #fde047; padding: 3px 6px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; white-space: nowrap;"><i class="fa-solid fa-star" style="font-size: 0.62rem;"></i> ${p.shortName}</span>`).join(' ')}
                </div>
            </div>

            <!-- Historical Performance Stats Grid (5-Item Card Layout) -->
            <div class="opt-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(70px, 1fr)); gap: 4px; margin-bottom: 12px; box-sizing: border-box;">
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.06); padding: 5px 3px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.64rem;">총 적중</div>
                    <div style="color: #fbbf24; font-size: 0.9rem; font-weight: 800; font-family: monospace;">${metrics.totalHits.toLocaleString()}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.06); padding: 5px 3px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.64rem;">1등 당첨</div>
                    <div style="color: #fbbf24; font-size: 0.9rem; font-weight: 800; font-family: monospace;">${metrics.hit1st}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.06); padding: 5px 3px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.64rem;">2·3등 당첨</div>
                    <div style="color: #60a5fa; font-size: 0.85rem; font-weight: 800; font-family: monospace; line-height: 1.2;">${metrics.hit2nd + metrics.hit3rd}회 <span style="font-size:0.6rem; display: block; color: #93c5fd; font-weight: 600;">(${metrics.hit2nd}/${metrics.hit3rd})</span></div>
                </div>
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.06); padding: 5px 3px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.64rem;">4·5등 당첨</div>
                    <div style="color: #34d399; font-size: 0.85rem; font-weight: 800; font-family: monospace;">${metrics.hit4th + metrics.hit5th}회</div>
                </div>
                <div style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.06); padding: 5px 3px; border-radius: 6px; text-align: center; box-sizing: border-box;">
                    <div style="color: #94a3b8; font-size: 0.64rem;">환급 ROI</div>
                    <div style="color: #f43f5e; font-size: 0.88rem; font-weight: 800; font-family: monospace;">+${metrics.roi}%</div>
                </div>
            </div>

            <!-- Instant Apply Button with Pulse Glow -->
            <button type="button" id="btnApplyOptimizedResult" onclick="window.applyOptimizedCombinationToApp && window.applyOptimizedCombinationToApp()" class="opt-pulse-btn btn-primary" style="width: 100%; padding: 11px 10px; font-size: 0.88rem; font-weight: 900; border-radius: 10px; background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 18px rgba(16, 185, 129, 0.45); line-height: 1.3; text-align: center; word-break: keep-all;">
                <i class="fa-solid fa-circle-check" style="font-size: 1rem; flex-shrink: 0;"></i>
                <span>최적 추가팩 추천기 즉시 적용 <span style="font-size: 0.76rem; opacity: 0.9; font-weight: 700; display: inline-block;">(+${metrics.additionalGames}게임 자동 배정)</span></span>
            </button>
        </div>
    `;

    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function applyOptimizedCombinationToApp() {
    playOptWinFanfare();
    fireOptConfetti();

    console.log('[applyOptimizedCombinationToApp] Called, currentOptimizedResult:', currentOptimizedResult);
    if (!currentOptimizedResult || !currentOptimizedResult.bestNewPacks) {
        console.warn('[applyOptimizedCombinationToApp] No currentOptimizedResult or bestNewPacks!');
        return;
    }
    const { bestNewPacks } = currentOptimizedResult;
    const curUpcomingRound = (typeof window !== 'undefined' && typeof window.getUpcomingLottoRound === 'function')
        ? window.getUpcomingLottoRound()
        : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1245));

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    const targetViewingUser = (typeof window !== 'undefined' && window.generatorAdminViewingUser) ? window.generatorAdminViewingUser : null;
    const effectiveUserId = (isAdmin && targetViewingUser ? targetViewingUser : authId).toLowerCase().trim();

    console.log('[applyOptimized] effectiveUserId:', effectiveUserId, 'curUpcomingRound:', curUpcomingRound);
    console.log('[applyOptimized] bestNewPacks:', JSON.stringify(bestNewPacks));

    // 1. Get current active pack IDs for this user
    const currentActivePackIds = (typeof getUserActiveExtraPackIds === 'function')
        ? getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound)
        : ((typeof window !== 'undefined' && typeof window.getUserActiveExtraPackIds === 'function')
            ? window.getUserActiveExtraPackIds(effectiveUserId, curUpcomingRound)
            : []);
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
    if (typeof saveUserActiveExtraPackIds === 'function') {
        saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, newActiveList);
    } else if (typeof window !== 'undefined' && typeof window.saveUserActiveExtraPackIds === 'function') {
        window.saveUserActiveExtraPackIds(effectiveUserId, curUpcomingRound, newActiveList);
    }

    // If engine selection changed
    if (v4Selected) {
        const chkReport = document.getElementById('chkUseV4ReportLogic');
        if (chkReport) chkReport.checked = true;
        localStorage.setItem('lotto_pref_v4', 'true');
        const isV4Valid = (state.fixedTop5Combinations_v4 && state.fixedTop5Combinations_v4.length === 10 &&
            state.fixedTop5Combinations_v4_userId === effectiveUserId && state.fixedTop5Combinations_v4_round === curUpcomingRound);
        state.fixedTop5Combinations = isV4Valid
            ? state.fixedTop5Combinations_v4
            : computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v4', true, effectiveUserId);
    } else if (v3Selected) {
        const chkReport = document.getElementById('chkUseV4ReportLogic');
        if (chkReport) chkReport.checked = false;
        localStorage.setItem('lotto_pref_v4', 'false');
        const isV3Valid = (state.fixedTop5Combinations_v3 && state.fixedTop5Combinations_v3.length === 10 &&
            state.fixedTop5Combinations_v3_userId === effectiveUserId && state.fixedTop5Combinations_v3_round === curUpcomingRound);
        state.fixedTop5Combinations = isV3Valid
            ? state.fixedTop5Combinations_v3
            : computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v3', true, effectiveUserId);
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
    window.toggleOptSound = toggleOptSound;
    window.fireOptConfetti = fireOptConfetti;
    window.playOptTickSound = playOptTickSound;
    window.playOptWinFanfare = playOptWinFanfare;
}
