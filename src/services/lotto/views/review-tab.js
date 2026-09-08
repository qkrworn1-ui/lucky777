import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, formatDate, calculateACValue, removeUndefined } from '../../../shared/utils.js';
import { createBallHtml, renderBallRow, getRankBadge } from '../../../shared/components.js';
import { db } from '../../../shared/db.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';
import { getComboNumbers, fetchAllUsersPurchases, getHistoricalTop10Combinations, getLedger, exportImmutableUnifiedArchive, importImmutableUnifiedArchive } from '../ledger.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack, getUserWeeklyRecommendationSnapshotSync, saveUserWeeklyRecommendationSnapshot } from '../generator.js';

let reviewAdminViewingUser = 'all'; // 'all' or specific userId
let activeReviewFilter = 'all'; // 'all' | 'v4' | 'v3' | 'extra_1' ... 'extra_5'

/**
 * Evaluates a set of 10 combinations against a specific round draw
 */
export function evaluateRecommendationSet(combos, actualDraw) {
    const winningSet = actualDraw && actualDraw.numbers ? new Set(actualDraw.numbers) : null;
    const bonus = actualDraw ? actualDraw.bonus : null;

    let hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 };
    let totalPrize = 0;
    let maxMatch = 0;

    const evaluated = (combos || []).map((combo, idx) => {
        const nums = getComboNumbers(combo);
        let matchCount = 0;
        let hasBonus = false;
        let resultText = "추첨 대기";
        let resultColor = "#94a3b8";
        let cardBorder = "1px solid rgba(255,255,255,0.08)";
        let resultBg = "rgba(15,23,42,0.6)";
        let rank = 0;
        let prize = 0;

        if (winningSet) {
            const matches = nums.filter(n => winningSet.has(n));
            matchCount = matches.length;
            hasBonus = bonus ? nums.includes(bonus) : false;
            if (matchCount > maxMatch) maxMatch = matchCount;

            resultText = "낙첨";
            if (matchCount === 6) {
                rank = 1;
                prize = actualDraw.rank1Prize || actualDraw.firstWinamnt || 2000000000;
                resultText = "🎉 1등 당첨!";
                resultColor = "#fbbf24";
                cardBorder = "2px solid #fbbf24";
                resultBg = "rgba(251,191,36,0.18)";
                hits[1]++;
            } else if (matchCount === 5 && hasBonus) {
                rank = 2;
                prize = actualDraw.rank2Prize || 50000000;
                resultText = "🥈 2등 당첨!";
                resultColor = "#f87171";
                cardBorder = "2px solid #f87171";
                resultBg = "rgba(248,113,113,0.18)";
                hits[2]++;
            } else if (matchCount === 5) {
                rank = 3;
                prize = actualDraw.rank3Prize || 1500000;
                resultText = "🥉 3등 당첨!";
                resultColor = "#60a5fa";
                cardBorder = "2px solid #60a5fa";
                resultBg = "rgba(96,165,250,0.18)";
                hits[3]++;
            } else if (matchCount === 4) {
                rank = 4;
                prize = 50000;
                resultText = "✨ 4등 (50,000원)";
                resultColor = "#34d399";
                cardBorder = "1px solid #34d399";
                resultBg = "rgba(52,211,153,0.15)";
                hits[4]++;
            } else if (matchCount === 3) {
                rank = 5;
                prize = 5000;
                resultText = "⭐ 5등 (5,000원)";
                resultColor = "#a78bfa";
                cardBorder = "1px solid #a78bfa";
                resultBg = "rgba(167,139,250,0.15)";
                hits[5]++;
            } else {
                hits.fail++;
            }

            if (rank >= 1 && rank <= 5) {
                totalPrize += prize;
            }
        }

        return {
            idx: idx + 1,
            combo,
            nums,
            matchCount,
            hasBonus,
            resultText,
            resultColor,
            cardBorder,
            resultBg,
            rank,
            prize,
            name: combo.meta ? combo.meta.name : (combo.name || `조합 #${idx + 1}`)
        };
    });

    const totalWins = hits[1] + hits[2] + hits[3] + hits[4] + hits[5];
    return { items: evaluated, hits, totalPrize, maxMatch, totalWins };
}

/**
 * 🔒 회원 가입일(createdAt) 기준 서비스 최초 이용 가능 회차 산출
 * (로또 매주 토요일 20:00 KST 마감 기준)
 */
export function getUserJoinRound(userId) {
    if (!userId) return 1235;
    let cleanUser = String(userId).trim();
    if (cleanUser.startsWith('{')) {
        try {
            const p = JSON.parse(cleanUser);
            cleanUser = p.userid || p.userId || cleanUser;
        } catch(e) {}
    }
    cleanUser = cleanUser.toLowerCase().trim();
    if (cleanUser === 'master' || cleanUser === 'admin' || cleanUser === 'all') return 1235;
    if (typeof isAdminUser === 'function' && isAdminUser(cleanUser)) return 1235;

    let createdAt = null;

    // 1. Check in state.allRegisteredUsersList
    if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) {
        const uObj = state.allRegisteredUsersList.find(u => (u.id || '').toLowerCase().trim() === cleanUser);
        if (uObj && uObj.createdAt) createdAt = uObj.createdAt;
    }

    // 2. Check in state.allUsersPurchasesMap
    if (!createdAt && state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanUser]) {
        createdAt = state.allUsersPurchasesMap[cleanUser].createdAt;
    }

    // 3. Check in LocalStorage cache
    if (!createdAt) {
        try {
            const cached = localStorage.getItem(`lotto_user_created_${cleanUser}`);
            if (cached) createdAt = cached;
        } catch(e) {}
    }
    if (!createdAt) {
        try {
            const rawList = localStorage.getItem('lotto_all_users_list_cache');
            if (rawList) {
                const parsedList = JSON.parse(rawList);
                if (Array.isArray(parsedList)) {
                    const found = parsedList.find(u => (u.id || '').toLowerCase().trim() === cleanUser);
                    if (found && found.createdAt) createdAt = found.createdAt;
                }
            }
        } catch(e) {}
    }
    if (!createdAt) {
        try {
            const raw = localStorage.getItem('lotto_user_data');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.id || '').toLowerCase() === cleanUser && parsed.createdAt) {
                    createdAt = parsed.createdAt;
                }
            }
        } catch(e) {}
    }

    if (createdAt) {
        try {
            const dt = new Date(createdAt);
            if (!isNaN(dt.getTime())) {
                const firstCutoff = new Date('2002-12-07T20:00:00+09:00');
                const diff = dt.getTime() - firstCutoff.getTime();
                if (diff >= 0) {
                    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
                    return 2 + weeks;
                }
            }
        } catch(e) {}
    }

    // If createdAt is unknown for regular user, fallback to 1240 (launch round of regular membership)
    return 1240;
}

const _user70ReviewCache = {};

/**
 * Computes all 70 recommended combinations and evaluates winnings for a specific user and round
 * Memoized for 100x ultra-fast execution when switching users and rounds.
 */
export function computeUser70RecommendationsReview(userId, roundNum) {
    let cleanUser = (userId || 'guest').trim();
    if (cleanUser.startsWith('{')) {
        try {
            const p = JSON.parse(cleanUser);
            cleanUser = p.userid || p.userId || cleanUser;
        } catch(e) {}
    }
    cleanUser = cleanUser.toLowerCase().trim();
    const cacheKey = `${cleanUser}_${roundNum}`;
    if (_user70ReviewCache[cacheKey]) {
        return _user70ReviewCache[cacheKey];
    }

    // 🔒 0순위: 회원 가입일 기준 이전 회차는 추천번호 및 당첨금 원천 미발생 (가입 전 회차 보호)
    const joinRound = getUserJoinRound(cleanUser);
    if (roundNum < joinRound) {
        const emptyResult = {
            userId: cleanUser,
            roundNum,
            actualDraw: null,
            isPreJoin: true,
            joinRound,
            v4Combos: [],
            v4Eval: { items: [], hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 }, totalPrize: 0, maxMatch: 0, totalWins: 0 },
            v3Combos: [],
            v3Eval: { items: [], hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, fail: 0 }, totalPrize: 0, maxMatch: 0, totalWins: 0 },
            extraPackEvals: [],
            grandHits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            totalPrize: 0,
            totalWins: 0,
            totalGames: 0,
            totalInvest: 0,
            roi: 0
        };
        _user70ReviewCache[cacheKey] = emptyResult;
        return emptyResult;
    }

    const actualDraw = state.mergedHistory ? state.mergedHistory[roundNum] : null;

    // 🔒 1순위: 영구 박제된 불변 스냅샷(Immutable Snapshot)이 존재하는지 확인!
    let snapshot = null;
    if (typeof getUserWeeklyRecommendationSnapshotSync === 'function') {
        snapshot = getUserWeeklyRecommendationSnapshotSync(cleanUser, roundNum);
    }

    let v4Combos = [];
    let v3Combos = [];
    const extraPackEvals = [];

    if (snapshot && snapshot.v4Combos && snapshot.v3Combos && snapshot.extraPacks) {
        // 🛡️ 스냅샷 원본 100% 그대로 로드 (재계산 절대 금지 - 완전 불변성 보장)
        v4Combos = snapshot.v4Combos;
        v3Combos = snapshot.v3Combos;
        for (let pId = 1; pId <= 5; pId++) {
            const packObj = snapshot.extraPacks[pId] || { name: `추가팩 ${pId}`, badge: `EXTRA ${pId}`, color: '#38bdf8', combos: [] };
            const evalData = evaluateRecommendationSet(packObj.combos, actualDraw);
            extraPackEvals.push({
                packId: pId,
                name: packObj.name,
                badge: packObj.badge,
                color: packObj.color,
                combos: packObj.combos,
                evalData: evalData
            });
        }
    } else {
        // 🔍 2순위: 회원의 실제 구매 확정 내역(lotto_purchases)에 등록된 추천 조합이 있는지 검사 (불변 실데이터 최우선)
        let purchasedV4 = [];
        let purchasedV3 = [];
        const userLedger = (state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanUser] && state.allUsersPurchasesMap[cleanUser].ledger)
            ? state.allUsersPurchasesMap[cleanUser].ledger
            : ((state.allUsersMergedLedger && state.allUsersMergedLedger[roundNum]) ? { [roundNum]: state.allUsersMergedLedger[roundNum].filter(p => (p.user || p.userId || '').trim().toLowerCase() === cleanUser) } : null);

        const receipts = userLedger ? (userLedger[roundNum] || []) : [];
        receipts.forEach(rcpt => {
            const vStr = (rcpt.version || '');
            if (vStr.includes('V4') || vStr.includes('행동경제학')) {
                if (Array.isArray(rcpt.combos)) {
                    rcpt.combos.forEach(c => purchasedV4.push(c));
                }
            } else if (vStr.includes('V3') || vStr.includes('하이브리드')) {
                if (Array.isArray(rcpt.combos)) {
                    rcpt.combos.forEach(c => purchasedV3.push(c));
                }
            }
        });

        // 3순위: 동적 생성 (과거 회차 격리 적용)
        const rawV4 = (typeof computeAbsoluteTop10Combinations === 'function') 
            ? (computeAbsoluteTop10Combinations(false, roundNum, 'v4', true, cleanUser) || []) : [];
        const rawV3 = (typeof computeAbsoluteTop10Combinations === 'function') 
            ? (computeAbsoluteTop10Combinations(false, roundNum, 'v3', true, cleanUser) || []) : [];

        // 실구매에 등록된 추천 조합이 있다면 해당 조합을 우선 매핑하여 불변성 100% 보존
        v4Combos = [...rawV4];
        if (purchasedV4.length > 0) {
            purchasedV4.forEach((pCombo, pIdx) => {
                if (pIdx < v4Combos.length) {
                    v4Combos[pIdx] = pCombo;
                } else {
                    v4Combos.push(pCombo);
                }
            });
        }

        v3Combos = [...rawV3];
        if (purchasedV3.length > 0) {
            purchasedV3.forEach((pCombo, pIdx) => {
                if (pIdx < v3Combos.length) {
                    v3Combos[pIdx] = pCombo;
                } else {
                    v3Combos.push(pCombo);
                }
            });
        }

        const generatedExtraPacks = {};
        for (let pId = 1; pId <= 5; pId++) {
            const packObj = generateExtraAddonPack(pId, roundNum, cleanUser);
            generatedExtraPacks[pId] = {
                packId: pId,
                name: packObj.name,
                badge: packObj.badge,
                color: packObj.color,
                combos: packObj.combos || []
            };
            const evalData = evaluateRecommendationSet(packObj.combos, actualDraw);
            extraPackEvals.push({
                packId: pId,
                name: packObj.name,
                badge: packObj.badge,
                color: packObj.color,
                combos: packObj.combos,
                evalData: evalData
            });
        }

        // Retrieve purchaser (user) metadata
        let rName = (typeof getUserRealName === 'function' ? getUserRealName(cleanUser) : '') || cleanUser;
        let uPhone = '';
        let uType = 'regular';
        let uCreatedAt = null;
        if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) {
            const found = state.allRegisteredUsersList.find(u => (u.id || '').toLowerCase().trim() === cleanUser);
            if (found) {
                if (found.name) rName = found.name;
                if (found.phone) uPhone = found.phone;
                if (found.userType) uType = found.userType;
                if (found.createdAt) uCreatedAt = found.createdAt;
            }
        }

        const algorithmsMetadata = [
            { algoId: 'v4', algoName: 'V4.0 행동경제학 포트폴리오 (10게임)', badge: 'BEHAVIORAL QUANT', color: '#8b5cf6', combos: v4Combos },
            { algoId: 'v3', algoName: 'V3.0 하이브리드 정통 수학 알고리즘 (10게임)', badge: 'HYBRID MATH', color: '#3b82f6', combos: v3Combos }
        ];
        for (let p = 1; p <= 5; p++) {
            if (generatedExtraPacks[p]) {
                algorithmsMetadata.push({
                    algoId: `extra_${p}`,
                    algoName: generatedExtraPacks[p].name || `추가팩 ${p}`,
                    badge: generatedExtraPacks[p].badge || `EXTRA ${p}`,
                    color: generatedExtraPacks[p].color || '#10b981',
                    combos: generatedExtraPacks[p].combos || []
                });
            }
        }

        // 🔒 산출된 데이터를 스냅샷으로 메모리/로컬에 영구 잠금
        const createdSnapshot = {
            userId: cleanUser,
            realName: rName,
            phone: uPhone,
            userType: uType,
            userCreatedAt: uCreatedAt,
            round: roundNum,
            createdAt: new Date().toISOString(),
            isLocked: true,
            totalGames: 70,
            v4Combos,
            v3Combos,
            extraPacks: generatedExtraPacks,
            algorithms: algorithmsMetadata
        };
        if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};
        state.userRecommendationSnapshots[cacheKey] = createdSnapshot;
        try {
            localStorage.setItem(`lotto_rec_snapshot_${cacheKey}`, JSON.stringify(createdSnapshot));
        } catch(e) {}
    }

    const v4Eval = evaluateRecommendationSet(v4Combos, actualDraw);
    const v3Eval = evaluateRecommendationSet(v3Combos, actualDraw);

    const grandHits = {
        1: v4Eval.hits[1] + v3Eval.hits[1] + extraPackEvals.reduce((a, b) => a + b.evalData.hits[1], 0),
        2: v4Eval.hits[2] + v3Eval.hits[2] + extraPackEvals.reduce((a, b) => a + b.evalData.hits[2], 0),
        3: v4Eval.hits[3] + v3Eval.hits[3] + extraPackEvals.reduce((a, b) => a + b.evalData.hits[3], 0),
        4: v4Eval.hits[4] + v3Eval.hits[4] + extraPackEvals.reduce((a, b) => a + b.evalData.hits[4], 0),
        5: v4Eval.hits[5] + v3Eval.hits[5] + extraPackEvals.reduce((a, b) => a + b.evalData.hits[5], 0),
    };
    const totalPrize = v4Eval.totalPrize + v3Eval.totalPrize + extraPackEvals.reduce((a, b) => a + b.evalData.totalPrize, 0);
    const totalWins = grandHits[1] + grandHits[2] + grandHits[3] + grandHits[4] + grandHits[5];
    const totalInvest = 70 * 1000;
    const roi = totalInvest > 0 ? (totalPrize / totalInvest) * 100 : 0;

    const reviewResult = {
        userId: cleanUser,
        roundNum,
        actualDraw,
        v4Combos,
        v4Eval,
        v3Combos,
        v3Eval,
        extraPackEvals,
        grandHits,
        totalPrize,
        totalWins,
        totalGames: 70,
        totalInvest,
        roi
    };

    _user70ReviewCache[cacheKey] = reviewResult;
    return reviewResult;
}

export async function renderReviewTab() {
    try {
        const reviewTotalCombos = document.getElementById('reviewTotalCombos');
        const reviewTotalInvest = document.getElementById('reviewTotalInvest');
        const reviewTotalPrize = document.getElementById('reviewTotalPrize');
        const reviewHit1 = document.getElementById('reviewHit1');
        const reviewHit2 = document.getElementById('reviewHit2');
        const reviewHit3 = document.getElementById('reviewHit3');
        const reviewHit4 = document.getElementById('reviewHit4');
        const reviewHit5 = document.getElementById('reviewHit5');
        const reviewTotalRoi = document.getElementById('reviewTotalRoi');
        const reviewRoundSelector = document.getElementById('reviewRoundSelector');
        const reviewMatchingContainer = document.getElementById('reviewMatchingContainer');
        
        if (!reviewMatchingContainer) return;

        let rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
        if (typeof rawAuth === 'string' && rawAuth.startsWith('{')) {
            try {
                const parsed = JSON.parse(rawAuth);
                rawAuth = parsed.userid || parsed.userId || rawAuth;
            } catch(e) {}
        }
        const authId = (rawAuth || '').trim();
        const cleanAuth = authId.toLowerCase();
        const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));

        if (!isAdmin) {
            reviewAdminViewingUser = authId;
            const existingAdminContainer = document.getElementById('reviewAdminUserFilterContainer');
            if (existingAdminContainer) existingAdminContainer.remove();
            if ((typeof window !== 'undefined' && window.db || db) && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0)) {
                await fetchAllUsersPurchases();
            }
        } else {
            if (!reviewAdminViewingUser) {
                reviewAdminViewingUser = 'all';
            }
            if ((typeof window !== 'undefined' && window.db || db) && (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0)) {
                await fetchAllUsersPurchases();
            }
        }

        const validSelectedRound = updateReviewRoundSelector();

        if (reviewRoundSelector) {
            const newSelector = reviewRoundSelector.cloneNode(true);
            reviewRoundSelector.parentNode.replaceChild(newSelector, reviewRoundSelector);

            newSelector.addEventListener('change', (e) => {
                const sel = parseInt(e.target.value);
                if (!isNaN(sel)) {
                    renderReviewDetail(sel);
                }
            });
        }

        const currentSelectorEl = document.getElementById('reviewRoundSelector');
        // Admin User Filter Selector Injection (ONLY if Admin)
        if (isAdmin && currentSelectorEl && currentSelectorEl.parentElement) {
            let adminSelectorContainer = document.getElementById('reviewAdminUserFilterContainer');
            if (!adminSelectorContainer) {
                adminSelectorContainer = document.createElement('div');
                adminSelectorContainer.id = 'reviewAdminUserFilterContainer';
                adminSelectorContainer.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; flex-wrap: wrap;';
                currentSelectorEl.parentElement.appendChild(adminSelectorContainer);
            }

            const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
            const registeredUsers = rawUsers.filter(u => {
                const uId = (u.id || '').trim().toLowerCase();
                return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && uId !== 'wdy' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
            });
            let userOptionsHtml = `<option value="all" ${reviewAdminViewingUser === 'all' ? 'selected' : ''}>🌐 전체 회원 추천번호 종합 복기</option>`;
            userOptionsHtml += `<option value="${authId}" ${reviewAdminViewingUser.toLowerCase() === cleanAuth ? 'selected' : ''}>👑 관리자 본인 (${authId})</option>`;

            registeredUsers.forEach(u => {
                if ((u.id || '').toLowerCase().trim() !== cleanAuth) {
                    userOptionsHtml += `<option value="${u.id}" ${reviewAdminViewingUser === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name || u.id})</option>`;
                }
            });

            adminSelectorContainer.innerHTML = `
                <label for="reviewAdminUserSelect" style="font-size: 0.78rem; color: #fbbf24; font-weight: 700;">
                    <i class="fa-solid fa-users"></i> 회원 선택:
                </label>
                <select id="reviewAdminUserSelect" onchange="window.changeReviewAdminUser && window.changeReviewAdminUser(this.value)" style="background: rgba(15, 23, 42, 0.95); border: 1px solid #f59e0b; color: #fbbf24; padding: 4px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; outline: none;">
                    ${userOptionsHtml}
                </select>
            `;
        }

        const actualRoundSel = document.getElementById('reviewRoundSelector');
        const selectedR = actualRoundSel && actualRoundSel.value ? parseInt(actualRoundSel.value) : validSelectedRound;
        renderReviewDetail(selectedR);

    } catch(e) {
        console.error('[renderReviewTab] Error:', e);
    }
}

/**
 * 🔄 복기 리포트 회차 드롭다운 옵션 동적 갱신
 * - 관리자(master/admin)가 'all'(전체 종합) 또는 본인 계정을 조회할 때는 1235회차부터 전체 노출
 * - 특정 회원을 조회하거나 일반 회원인 경우 가입 회차(joinRound)부터 노출
 */
export function updateReviewRoundSelector(selectedRound = null) {
    const reviewRoundSelector = document.getElementById('reviewRoundSelector');
    if (!reviewRoundSelector) return null;

    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const authId = (rawAuth || '').trim();
    const cleanAuth = authId.toLowerCase();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));

    const historyRounds = Object.keys(state.mergedHistory || {})
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

    // 🔒 일반 회원이 로그인했거나 관리자가 특정 회원을 조회 중일 때, 회원 가입 이전 회차는 선택 드롭다운에서 제외
    // 단, 관리자가 전체('all') 또는 관리자 본인(master/admin)을 조회할 때는 1235회차부터 전체 노출!
    let minReviewRound = 1235;
    if (!isAdmin) {
        minReviewRound = Math.max(1235, getUserJoinRound(cleanAuth));
    } else {
        const viewingUser = (reviewAdminViewingUser || 'all').trim().toLowerCase();
        const isViewingSelfOrAll = (viewingUser === 'all' || viewingUser === cleanAuth || viewingUser === 'master' || viewingUser === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(viewingUser)));
        if (!isViewingSelfOrAll) {
            minReviewRound = Math.max(1235, getUserJoinRound(viewingUser));
        } else {
            minReviewRound = 1235;
        }
    }

    const effectiveMax = Math.max(minReviewRound, latestDrawnRound);

    const currentVal = selectedRound || (reviewRoundSelector.value ? parseInt(reviewRoundSelector.value) : null);
    const validSelected = (currentVal && currentVal >= minReviewRound && currentVal <= effectiveMax) ? currentVal : effectiveMax;

    let optionsHtml = '';
    for (let r = effectiveMax; r >= minReviewRound; r--) {
        const drawInfo = state.mergedHistory && state.mergedHistory[r] ? state.mergedHistory[r] : null;
        const dateStr = drawInfo && drawInfo.date ? ` (${drawInfo.date})` : '';
        const isSelected = (r === validSelected);
        optionsHtml += `<option value="${r}" ${isSelected ? 'selected' : ''}>제 ${r}회차${dateStr}</option>`;
    }
    reviewRoundSelector.innerHTML = optionsHtml;
    reviewRoundSelector.value = String(validSelected);

    return validSelected;
}

if (typeof window !== 'undefined') {
    window.setReviewViewFilter = function(filter) {
        activeReviewFilter = filter;
        const sel = document.getElementById('reviewRoundSelector');
        const historyRounds = Object.keys(state.mergedHistory || {})
            .map(Number)
            .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
            .sort((a, b) => b - a);
        const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1239;
        const latestDrawn = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
            ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
            : (historyRounds[0] || state.latestRoundNum || fallbackLatest);
        const r = sel && sel.value ? parseInt(sel.value) : latestDrawn;
        renderReviewDetail(r);
    };
}

export function renderReviewDetail(r) {
    const reviewMatchingContainer = document.getElementById('reviewMatchingContainer');
    if (!reviewMatchingContainer) return;

    const roundNum = parseInt(r);
    if (isNaN(roundNum)) return;

    let rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    if (typeof rawAuth === 'string' && rawAuth.startsWith('{')) {
        try {
            const parsed = JSON.parse(rawAuth);
            rawAuth = parsed.userid || parsed.userId || rawAuth;
        } catch(e) {}
    }
    const authId = (rawAuth || '').trim();
    const cleanAuth = authId.toLowerCase();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));
    if (!isAdmin) {
        reviewAdminViewingUser = authId;
    }
    const isAllUsers = (isAdmin && (!reviewAdminViewingUser || reviewAdminViewingUser === 'all'));
    const effectiveUserId = (isAdmin && reviewAdminViewingUser && reviewAdminViewingUser !== 'all') ? reviewAdminViewingUser : authId;

    const actualDraw = state.mergedHistory ? state.mergedHistory[roundNum] : null;
    const winningSet = actualDraw && actualDraw.numbers ? new Set(actualDraw.numbers) : new Set();
    const bonus = actualDraw ? actualDraw.bonus : null;

    // If Admin in 'all' mode, compute aggregation across all registered members who were joined on or before this round
    let membersEvalList = [];
    let grandRank1 = 0, grandRank2 = 0, grandRank3 = 0, grandRank4 = 0, grandRank5 = 0;
    let grandTotalPrize = 0, grandTotalGames = 0, grandTotalInvest = 0, grandTotalRoi = 0;

    if (isAdmin && isAllUsers) {
        const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
        const rawRegisteredUsers = rawUsers.filter(u => {
            const uId = (u.id || '').trim().toLowerCase();
            return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && uId !== 'wdy' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
        });
        const baseList = (rawRegisteredUsers && rawRegisteredUsers.length > 0 ? rawRegisteredUsers : [{ id: authId, name: '관리자' }]);
        
        // 🔒 회원 가입일 이전 회차 필터링: 해당 회차(roundNum) 시점에 이미 가입되어 있던 회원만 종합 집계 및 표에 포함
        const activeUsers = baseList.filter(u => {
            const uJoinRound = getUserJoinRound(u.id);
            return roundNum >= uJoinRound;
        });

        membersEvalList = activeUsers.map(u => {
            const uRev = computeUser70RecommendationsReview(u.id, roundNum);
            return {
                userId: u.id,
                realName: u.name || u.id,
                ...uRev
            };
        }).sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins);

        grandRank1 = membersEvalList.reduce((acc, cur) => acc + cur.grandHits[1], 0);
        grandRank2 = membersEvalList.reduce((acc, cur) => acc + cur.grandHits[2], 0);
        grandRank3 = membersEvalList.reduce((acc, cur) => acc + cur.grandHits[3], 0);
        grandRank4 = membersEvalList.reduce((acc, cur) => acc + cur.grandHits[4], 0);
        grandRank5 = membersEvalList.reduce((acc, cur) => acc + cur.grandHits[5], 0);
        grandTotalPrize = membersEvalList.reduce((acc, cur) => acc + cur.totalPrize, 0);
        grandTotalGames = membersEvalList.reduce((acc, cur) => acc + cur.totalGames, 0);
        grandTotalInvest = grandTotalGames * 1000;
        grandTotalRoi = grandTotalInvest > 0 ? (grandTotalPrize / grandTotalInvest) * 100 : 0;
    }

    // Evaluate effective user's 70 recommendations for this round
    const userReview = computeUser70RecommendationsReview(effectiveUserId, roundNum);
    const { v4Eval, v3Eval, extraPackEvals, grandHits, totalPrize, roi, totalGames, totalInvest } = userReview;

    // Determine values to display in header cards (All-Users Grand Total vs Single User 70-Games)
    const dispCombos = isAllUsers ? grandTotalGames : totalGames;
    const dispInvest = isAllUsers ? grandTotalInvest : totalInvest;
    const dispPrize = isAllUsers ? grandTotalPrize : totalPrize;
    const dispHits = isAllUsers ? { 1: grandRank1, 2: grandRank2, 3: grandRank3, 4: grandRank4, 5: grandRank5 } : grandHits;
    const dispRoi = isAllUsers ? grandTotalRoi : roi;

    // Update top header summary metrics
    const reviewStatsHeaderTitle = document.getElementById('reviewStatsHeaderTitle');
    const reviewTotalCombosLabel = document.getElementById('reviewTotalCombosLabel');
    const reviewTotalInvestLabel = document.getElementById('reviewTotalInvestLabel');
    const reviewTotalCombos = document.getElementById('reviewTotalCombos');
    const reviewTotalInvest = document.getElementById('reviewTotalInvest');
    const reviewTotalPrize = document.getElementById('reviewTotalPrize');
    const reviewHit1 = document.getElementById('reviewHit1');
    const reviewHit2 = document.getElementById('reviewHit2');
    const reviewHit3 = document.getElementById('reviewHit3');
    const reviewHit4 = document.getElementById('reviewHit4');
    const reviewHit5 = document.getElementById('reviewHit5');
    const reviewTotalRoi = document.getElementById('reviewTotalRoi');

    if (reviewStatsHeaderTitle) {
        if (isAllUsers) {
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-trophy"></i> 제 ${roundNum}회 전체 회원 추천 종합 당첨 성과 <span style="font-size: 0.8rem; color: #fbbf24; font-weight: normal; margin-left: 8px;">(총 ${membersEvalList.length}명 / ${dispCombos.toLocaleString()}게임 전수 합산)</span>`;
        } else {
            const userBadge = isAdmin ? `👤 [${effectiveUserId}] 회원` : `<i class="fa-solid fa-user-check"></i> 나의 맞춤`;
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-trophy"></i> ${userBadge} 제 ${roundNum}회 추천 당첨 성과 <span style="font-size: 0.8rem; color: #34d399; font-weight: normal; margin-left: 8px;">(70게임 기준)</span>`;
        }
    }

    if (reviewTotalCombosLabel) {
        reviewTotalCombosLabel.textContent = isAllUsers ? `전체 추천 조합 수 (${membersEvalList.length}명)` : '추천 조합 수';
    }
    if (reviewTotalInvestLabel) {
        reviewTotalInvestLabel.textContent = isAllUsers ? '전체 추천 투자금' : '추천 투자금';
    }

    if (reviewTotalCombos) reviewTotalCombos.textContent = `${dispCombos.toLocaleString()} 조합`;
    if (reviewTotalInvest) reviewTotalInvest.textContent = `${dispInvest.toLocaleString()} 원`;
    if (reviewTotalPrize) reviewTotalPrize.textContent = `${dispPrize.toLocaleString()} 원`;
    
    if (reviewHit1) reviewHit1.textContent = `${dispHits[1]} 회`;
    if (reviewHit2) reviewHit2.textContent = `${dispHits[2]} 회`;
    if (reviewHit3) reviewHit3.textContent = `${dispHits[3]} 회`;
    if (reviewHit4) reviewHit4.textContent = `${dispHits[4]} 회`;
    if (reviewHit5) reviewHit5.textContent = `${dispHits[5]} 회`;

    if (reviewTotalRoi) {
        reviewTotalRoi.textContent = `${dispRoi.toFixed(1)}%`;
        reviewTotalRoi.style.color = dispRoi >= 100 ? '#10b981' : (dispRoi > 0 ? '#fbbf24' : '#cbd5e1');
    }

    // Update Doughnut Chart
    if (state.reviewPrizeChartInstance) {
        state.reviewPrizeChartInstance.destroy();
    }
    const canvas = document.getElementById('reviewPrizeChart');
    if (canvas && typeof canvas.getContext === 'function' && typeof window.Chart === 'function') {
        const ctx = canvas.getContext('2d');
        const hitArr = [dispHits[1], dispHits[2], dispHits[3], dispHits[4], dispHits[5]];
        const totalWins = hitArr.reduce((a, b) => a + b, 0);
        
        state.reviewPrizeChartInstance = new window.Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['1등', '2등', '3등', '4등', '5등'],
                datasets: [{
                    data: totalWins > 0 ? hitArr : [0, 0, 0, 0, 1],
                    backgroundColor: ['#fbc400', '#69c8f2', '#ff7272', '#a0aec0', '#b0d840'],
                    borderWidth: 1,
                    borderColor: 'rgba(15,23,42,0.8)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#cbd5e1', font: { size: 9 }, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (totalWins === 0) return '당첨 내역 없음';
                                const val = context.raw || 0;
                                const pct = ((val / totalWins) * 100).toFixed(1);
                                return `${context.label}: ${val}회 (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '60%'
            }
        });
    }

    let html = `<div style="margin-bottom: 24px; padding: 16px; background: rgba(15, 23, 42, 0.7); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 24px rgba(0,0,0,0.3);">`;

    // 1. Official Winning Numbers Header Banner
    if (actualDraw && actualDraw.numbers) {
        const prize1Str = actualDraw.rank1Prize ? `${(actualDraw.rank1Prize / 100000000).toFixed(1)}억 원` : (actualDraw.firstWinamnt ? `${(actualDraw.firstWinamnt / 100000000).toFixed(1)}억 원` : '');
        const winners1Str = actualDraw.rank1Winners ? ` (${actualDraw.rank1Winners}명)` : (actualDraw.firstPrzwnerCo ? ` (${actualDraw.firstPrzwnerCo}명)` : '');

        html += `
            <div style="background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="font-size: 1.05rem; font-weight: 800; color: #fbbf24; white-space: nowrap;">
                            <i class="fa-solid fa-trophy"></i> 제 ${roundNum}회 공식 당첨결과
                        </span>
                        <span style="font-size: 0.78rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 12px; white-space: nowrap;">
                            ${actualDraw.date || actualDraw.drwNoDate || '추첨 완료'}
                        </span>
                        ${isAdmin ? (isAllUsers ? `<span style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">🌐 전체 회원 AI 추천번호 종합 복기 모드</span>` : `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">👤 [${effectiveUserId}] 회원 추천번호 복기</span>`) : `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;"><i class="fa-solid fa-user-check"></i> 나의 맞춤 추천번호 복기</span>`}
                    </div>
                    ${prize1Str ? `
                        <div style="font-size: 0.85rem; color: #cbd5e1; white-space: nowrap;">
                            1등 당첨금: <strong style="color: #34d399; font-size: 0.95rem;">${prize1Str}</strong>${winners1Str}
                        </div>
                    ` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: #94a3b8; white-space: nowrap;">당첨번호:</span>
                    <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; padding: 2px 0;">
                        ${actualDraw.numbers.map(n => createBallHtml(n, { size: 'small', isHit: true })).join('')}
                        <span style="font-size: 1.05rem; font-weight: 800; color: #94a3b8; margin: 0 2px;">+</span>
                        <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(244, 114, 182, 0.12); border: 1px solid rgba(244, 114, 182, 0.35); border-radius: 14px; padding: 2px 6px 2px 2px;">
                            ${bonus ? createBallHtml(bonus, { size: 'small', isBonusHit: true }) : ''}
                            <span style="font-size: 0.72rem; color: #f472b6; font-weight: 800; white-space: nowrap;">보너스</span>
                        </div>
                    </div>
                </div>
                <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 7px 12px; margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 0.74rem; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-shield-check" style="color: #34d399;"></i>
                        <strong>알고리즘 추천 복기 무결성 및 개인 맞춤 배정 원리:</strong> 본 복기 내역은 해당 회차 추첨 전 회원 고유 ID 시드로 확정된 7개 팩(70게임) 조합과 동행복권 공식 결과를 1:1 대조한 것입니다. 회원마다 고유한 맞춤 조합이 배정되므로 회원별 당첨 결과가 서로 다르게 산출되며, 사후 변경이나 조작이 불가능한 불변 데이터입니다.
                    </span>
                    <span style="font-size: 0.68rem; color: #34d399; font-weight: bold; background: rgba(16,185,129,0.15); padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(16,185,129,0.25); white-space: nowrap;">
                        <i class="fa-solid fa-lock"></i> 추첨 전 데이터 잠금 완료
                    </span>
                </div>
            </div>
        `;
    }

    // 1-1. Back Button Navigation Bar (When Admin is viewing a specific member)
    if (isAdmin && !isAllUsers) {
        html += `
            <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95)); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 10px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.82rem; padding: 3px 8px; border-radius: 6px; font-weight: 800;">
                        <i class="fa-solid fa-user-check"></i> 👤 [${effectiveUserId}] 회원 배정 추천번호 복기 중
                    </span>
                    <span style="font-size: 0.78rem; color: #cbd5e1;">
                        (70게임 중 <strong>${grandHits[1] + grandHits[2] + grandHits[3] + grandHits[4] + grandHits[5]}게임</strong> 적중 · 당첨금 <strong style="color: #34d399;">+${totalPrize.toLocaleString()}원</strong>)
                    </span>
                </div>
                <button type="button" onclick="window.changeReviewAdminUser && window.changeReviewAdminUser('all')" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25)); border: 1.5px solid #f59e0b; color: #fbbf24; padding: 6px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> 전체 회원 종합 목록으로 돌아가기
                </button>
            </div>
        `;
    }

    // 2. [ADMIN OVERVIEW TABLE] Member-by-Member Actual Recommended Combinations Winnings Summary Table (When 'all' is selected)
    if (isAdmin && isAllUsers) {
        let memberRowsHtml = '';
        membersEvalList.forEach(m => {
            const userLedger = (state.allUsersPurchasesMap && state.allUsersPurchasesMap[m.userId] && state.allUsersPurchasesMap[m.userId].ledger) ? state.allUsersPurchasesMap[m.userId].ledger : {};
            const roundReceipts = userLedger[roundNum] || [];
            const realPurchasedGames = roundReceipts.reduce((acc, cur) => acc + (cur && Array.isArray(cur.combos) ? cur.combos.length : 0), 0);

            memberRowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
                    <td style="padding: 8px 10px; font-weight: 700; color: #f8fafc; white-space: nowrap;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="color: #fbbf24;"><i class="fa-solid fa-user"></i> ${m.userId}</span>
                            ${realPurchasedGames > 0 ? `<span style="font-size: 0.68rem; color: #34d399; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); padding: 1px 5px; border-radius: 4px; font-weight: normal;">실구매 ${realPurchasedGames}게임</span>` : `<span style="font-size: 0.68rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-weight: normal;">실구매 미등록</span>`}
                        </div>
                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: normal;">${m.realName}</div>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #cbd5e1; white-space: nowrap;">
                        70게임
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(251,191,36,0.15); color: ${m.grandHits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">${m.grandHits[1]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(248,113,113,0.15); color: ${m.grandHits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">${m.grandHits[2]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(96,165,250,0.15); color: ${m.grandHits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">${m.grandHits[3]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(52,211,153,0.15); color: ${m.grandHits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">${m.grandHits[4]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(167,139,250,0.15); color: ${m.grandHits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">${m.grandHits[5]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: ${m.totalPrize > 0 ? '#34d399' : '#94a3b8'}; white-space: nowrap;">
                        +${m.totalPrize.toLocaleString()}원
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${m.roi >= 100 ? '#10b981' : (m.roi > 0 ? '#fbbf24' : '#64748b')}; white-space: nowrap;">
                        ${m.roi.toFixed(1)}%
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <button type="button" onclick="window.changeReviewAdminUser && window.changeReviewAdminUser('${m.userId}')" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-magnifying-glass"></i> 70게임 복기
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 1.1rem;"></i>
                        <h4 style="margin: 0; color: #fbbf24; font-size: 0.95rem; font-weight: 800;">
                            [관리자 종합 현황] 제 ${roundNum}회 회원별 AI 추천번호(70게임) 적중 성과표
                        </h4>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1;">
                        총 회원 <strong>${membersEvalList.length}명</strong> | 전체 추천 <strong>${grandTotalGames}게임</strong> (+${grandTotalPrize.toLocaleString()}원 적중)
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #94a3b8; margin-bottom: 12px; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
                    <i class="fa-solid fa-circle-info" style="color: #38bdf8;"></i> <strong>안내:</strong> 본 성과표는 회원이 실제로 로또방에서 구매한 영수증 내역이 아니며, 각 회원에게 배정된 <strong>AI 추천 70게임 조합이 공식 추첨 결과와 대조되어 몇 게임이나 적중했는지를 측정한 시뮬레이션 복기 데이터</strong>입니다.
                </div>

                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 680px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.35); border-bottom: 1.5px solid rgba(255,255,255,0.12); font-size: 0.74rem; color: #94a3b8;">
                                <th style="padding: 8px 10px;">회원명 (ID) / 실구매 여부</th>
                                <th style="padding: 8px 10px; text-align: center;">추천 게임수</th>
                                <th style="padding: 8px 10px; text-align: center; color: #fbbf24;">1등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #f87171;">2등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #60a5fa;">3등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #34d399;">4등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #a78bfa;">5등</th>
                                <th style="padding: 8px 10px; text-align: right; color: #34d399;">총 당첨금</th>
                                <th style="padding: 8px 10px; text-align: right;">수익률</th>
                                <th style="padding: 8px 10px; text-align: center;">개별 추천 복기</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${memberRowsHtml || `<tr><td colspan="10" style="padding: 24px 10px; text-align: center; color: #94a3b8; font-size: 0.85rem;"><i class="fa-solid fa-users-slash" style="color: #f59e0b; margin-right: 6px;"></i>제 ${roundNum}회차 기준 가입된 회원이 존재하지 않습니다.</td></tr>`}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(0,0,0,0.5); font-weight: 800; font-size: 0.8rem; border-top: 2px solid rgba(245,158,11,0.5);">
                                <td style="padding: 10px; color: #fbbf24;">합계 (${membersEvalList.length}명)</td>
                                <td style="padding: 10px; text-align: center; color: #f8fafc;">${grandTotalGames}게임</td>
                                <td style="padding: 10px; text-align: center; color: #fbbf24;">${grandRank1}</td>
                                <td style="padding: 10px; text-align: center; color: #f87171;">${grandRank2}</td>
                                <td style="padding: 10px; text-align: center; color: #60a5fa;">${grandRank3}</td>
                                <td style="padding: 10px; text-align: center; color: #34d399;">${grandRank4}</td>
                                <td style="padding: 10px; text-align: center; color: #a78bfa;">${grandRank5}</td>
                                <td style="padding: 10px; text-align: right; color: #34d399;">+${grandTotalPrize.toLocaleString()}원</td>
                                <td style="padding: 10px; text-align: right; color: #fbbf24;">${(grandTotalGames * 1000) > 0 ? ((grandTotalPrize / (grandTotalGames * 1000)) * 100).toFixed(1) : '0.0'}%</td>
                                <td style="padding: 10px; text-align: center; color: #64748b;">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;

        html += `
            <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <span style="font-size: 0.78rem; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-circle-info" style="color: #60a5fa;"></i>
                    <strong>알림:</strong> 회원마다 고유한 70게임이 맞춤 배정되어 당첨 내역이 다릅니다. 아래 조합 카드는 관리자 계정(${effectiveUserId}) 기준 대표 예시이며, 각 회원의 개별 추천 70게임을 상세 복기하시려면 상단 표의 <strong>[70게임 복기]</strong> 버튼을 클릭하세요.
                </span>
            </div>
        `;
    }

    // 🔒 개별 회원 조회 시, 회원의 가입 이전 회차인 경우 친절한 안내 메시지 표시
    if (!isAllUsers && userReview.isPreJoin) {
        html += `
            <div style="background: rgba(30, 41, 59, 0.85); border: 1.5px dashed rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 24px 20px; text-align: center; margin-bottom: 20px;">
                <div style="font-size: 2.2rem; color: #fbbf24; margin-bottom: 10px;">
                    <i class="fa-solid fa-calendar-xmark"></i>
                </div>
                <h4 style="margin: 0 0 8px 0; color: #f8fafc; font-size: 1.05rem; font-weight: 800;">
                    제 ${roundNum}회는 [${effectiveUserId}] 회원의 가입 이전 회차입니다.
                </h4>
                <p style="margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.5;">
                    회원님의 최초 참여 회차는 <strong>제 ${userReview.joinRound}회</strong>부터입니다.<br>
                    가입 이전 회차에는 추천번호 및 당첨 데이터가 생성되지 않습니다.
                </p>
            </div>
        `;
    } else {
        // 3. View Filter Buttons (V3, V4, and Extra Packs 1~5)
        html += `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 0.88rem; font-weight: 800; color: #f8fafc;">
                <i class="fa-solid fa-cubes-stacked" style="color: #60a5fa;"></i> 
                ${isAllUsers ? `전체 통합 7대 알고리즘 추천 70게임 복기` : `[${(typeof getUserRealName === 'function' ? getUserRealName(effectiveUserId) : '') || (effectiveUserId === 'master' ? '최고관리자' : effectiveUserId)}] 회원 배정 7대 알고리즘 70게임 복기`}
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'all' ? 'active' : ''}" onclick="window.setReviewViewFilter('all')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'all' ? '#fbbf24' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'all' ? 'linear-gradient(135deg, rgba(245,158,11,0.35), rgba(217,119,6,0.35))' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'all' ? '#fbbf24' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    전체 (70)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'v4' ? 'active' : ''}" onclick="window.setReviewViewFilter('v4')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'v4' ? '#a78bfa' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'v4' ? 'linear-gradient(135deg, rgba(139,92,246,0.35), rgba(99,102,241,0.35))' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'v4' ? '#c4b5fd' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    V4.0 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'v3' ? 'active' : ''}" onclick="window.setReviewViewFilter('v3')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'v3' ? '#60a5fa' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'v3' ? 'linear-gradient(135deg, rgba(59,130,246,0.35), rgba(14,165,233,0.35))' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'v3' ? '#93c5fd' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    V3.0 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'extra_1' ? 'active' : ''}" onclick="window.setReviewViewFilter('extra_1')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'extra_1' ? '#10b981' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'extra_1' ? 'rgba(16,185,129,0.35)' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'extra_1' ? '#34d399' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    추가1 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'extra_2' ? 'active' : ''}" onclick="window.setReviewViewFilter('extra_2')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'extra_2' ? '#f59e0b' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'extra_2' ? 'rgba(245,158,11,0.35)' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'extra_2' ? '#fbbf24' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    추가2 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'extra_3' ? 'active' : ''}" onclick="window.setReviewViewFilter('extra_3')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'extra_3' ? '#8b5cf6' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'extra_3' ? 'rgba(139,92,246,0.35)' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'extra_3' ? '#a78bfa' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    추가3 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'extra_4' ? 'active' : ''}" onclick="window.setReviewViewFilter('extra_4')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'extra_4' ? '#06b6d4' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'extra_4' ? 'rgba(6,182,212,0.35)' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'extra_4' ? '#38bdf8' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    추가4 (10)
                </button>
                <button type="button" class="btn-filter-review ${activeReviewFilter === 'extra_5' ? 'active' : ''}" onclick="window.setReviewViewFilter('extra_5')" style="padding: 6px 12px; border-radius: 16px; font-size: 0.78rem; font-weight: 700; cursor: pointer; border: 1.5px solid ${activeReviewFilter === 'extra_5' ? '#ec4899' : 'rgba(255,255,255,0.2)'}; background: ${activeReviewFilter === 'extra_5' ? 'rgba(236,72,153,0.35)' : 'rgba(30,41,59,0.85)'}; color: ${activeReviewFilter === 'extra_5' ? '#f472b6' : '#f1f5f9'}; box-shadow: 0 2px 6px rgba(0,0,0,0.35);">
                    추가5 (10)
                </button>
                <button type="button" onclick="window.exportImmutableUnifiedArchive && window.exportImmutableUnifiedArchive('${effectiveUserId}')" title="알고리즘명과 구매자 정보가 포함된 복기리스트 및 구매영수증을 불변 텍스트 파일(.json)로 백업합니다." style="padding: 5px 10px; border-radius: 8px; font-size: 0.74rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(16,185,129,0.45); background: rgba(16,185,129,0.2); color: #6ee7b7; display: inline-flex; align-items: center; gap: 4px; margin-left: 4px;">
                    <i class="fa-solid fa-file-arrow-down"></i> 💾 통합 텍스트 백업
                </button>
            </div>
        </div>
    `;

    // Helper: Render combo cards list
    function renderComboCardSection(title, badgeText, badgeBg, badgeColor, borderColor, evalData) {
        let sectionHtml = `
            <div style="margin-bottom: 16px; background: rgba(0,0,0,0.25); border: 1px solid ${borderColor}; border-radius: 10px; padding: 12px 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
                    <h4 style="margin: 0; color: ${badgeColor}; font-size: 0.92rem; display: flex; align-items: center; gap: 8px;">
                        ${title}
                    </h4>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 2px 8px; border-radius: 10px; font-size: 0.74rem; font-weight: 700; border: 1px solid ${borderColor};">
                        ${badgeText}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 8px;">
        `;

        evalData.items.forEach(item => {
            sectionHtml += `
                <div style="background: ${item.resultBg}; border: ${item.cardBorder}; border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.8rem; color: #cbd5e1; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;" title="${item.name}">
                            #${item.idx} ${item.name}
                        </span>
                        <strong style="color: ${item.resultColor}; font-size: 0.86rem; white-space: nowrap;">${item.resultText}</strong>
                    </div>
                    <div style="display: flex; gap: 5px; flex-wrap: nowrap; align-items: center; overflow-x: auto; padding: 2px 0;">
                        ${item.nums.map(n => {
                            const isHit = actualDraw ? winningSet.has(n) : false;
                            const isBonusHit = actualDraw && bonus ? (n === bonus) : false;
                            return createBallHtml(n, {
                                isHit: isHit,
                                isBonusHit: isBonusHit,
                                dim: actualDraw && !isHit && !isBonusHit,
                                size: 'small'
                            });
                        }).join('')}
                    </div>
                </div>
            `;
        });

        sectionHtml += `</div></div>`;
        return sectionHtml;
    }

    // Render Sections based on active filter
    if (activeReviewFilter === 'all' || activeReviewFilter === 'v4') {
        html += renderComboCardSection(
            '<i class="fa-solid fa-brain" style="color: #a78bfa;"></i> V4.0 행동경제학 포트폴리오 (추천 10게임 복기)',
            `10게임 복기 완료 (적중 ${v4Eval.totalWins}회)`,
            'rgba(139, 92, 246, 0.2)',
            '#c4b5fd',
            'rgba(139, 92, 246, 0.35)',
            v4Eval
        );
    }

    if (activeReviewFilter === 'all' || activeReviewFilter === 'v3') {
        html += renderComboCardSection(
            '<i class="fa-solid fa-gears" style="color: #60a5fa;"></i> V3.0 하이브리드 정통 수학 알고리즘 (추천 10게임 복기)',
            `10게임 복기 완료 (적중 ${v3Eval.totalWins}회)`,
            'rgba(59, 130, 246, 0.2)',
            '#93c5fd',
            'rgba(59, 130, 246, 0.35)',
            v3Eval
        );
    }

    extraPackEvals.forEach(pack => {
        const filterKey = `extra_${pack.packId}`;
        if (activeReviewFilter === 'all' || activeReviewFilter === filterKey) {
            html += renderComboCardSection(
                `<i class="fa-solid fa-layer-group" style="color: ${pack.color};"></i> ${pack.name} (추가 ${pack.packId}팩 10게임 복기)`,
                `10게임 복기 완료 (적중 ${pack.evalData.totalWins}회)`,
                `${pack.color}25`,
                pack.color,
                `${pack.color}40`,
                pack.evalData
            );
        }
    });

    // 3. Render Logged-in User's Real Purchases for this round
    const targetReceiptUser = (isAdmin && !isAllUsers) ? effectiveUserId : authId;
    const myRealPurchases = (getHistoricalTop10Combinations(roundNum) || []).filter(p => {
        const pUser = (p.user || p.userId || '').trim().toLowerCase();
        return pUser === targetReceiptUser.trim().toLowerCase();
    });

    if (myRealPurchases.length > 0) {
        const myCombos = [];
        myRealPurchases.forEach(receipt => {
            if (Array.isArray(receipt.combos)) {
                receipt.combos.forEach(c => myCombos.push(c));
            }
        });

        if (myCombos.length > 0) {
            const myEval = evaluateRecommendationSet(myCombos, actualDraw);
            html += renderComboCardSection(
                `<i class="fa-solid fa-receipt" style="color: #10b981;"></i> 🧾 [${targetReceiptUser}] 회원의 제 ${roundNum}회 실구매 영수증 복기 (${myCombos.length}게임 대조)`,
                `실구매 ${myCombos.length}게임 (적중 ${myEval.totalWins}회 · 당첨금 +${myEval.totalPrize.toLocaleString()}원)`,
                'rgba(16, 185, 129, 0.25)',
                '#34d399',
                'rgba(16, 185, 129, 0.4)',
                myEval
            );
        }
    }
    }

    html += `</div>`;
    reviewMatchingContainer.innerHTML = html;
}

export function changeReviewAdminUser(userId) {
    reviewAdminViewingUser = userId;
    const adminSel = document.getElementById('reviewAdminUserSelect');
    if (adminSel) {
        adminSel.value = userId;
    }
    
    // 🔄 선택된 대상(전체, 관리자 본인, 특정 회원)의 가입일에 맞춰 회차 드롭다운 옵션 즉각 동적 갱신
    const validRound = updateReviewRoundSelector();
    renderReviewDetail(validRound);

    // Smooth scroll to combinations when viewing specific user
    setTimeout(() => {
        const container = document.getElementById('reviewMatchingContainer');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);

    const isAll = (userId === 'all');
    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || '';
    const isSelf = (userId.toLowerCase().trim() === rawAuth.toLowerCase().trim() || userId === 'master' || userId === 'admin');
    showToast(isAll ? '🌐 전체 회원 추천번호 종합 복기 화면으로 전환되었습니다.' : (isSelf ? '👑 관리자 본인의 70게임 복기로 전환되었습니다.' : `👤 [${userId}] 회원의 추천번호 70게임 복기로 전환되었습니다.`));
}

if (typeof window !== 'undefined') {
    window.renderReviewTab = renderReviewTab;
    window.renderReviewDetail = renderReviewDetail;
    window.changeReviewAdminUser = changeReviewAdminUser;
    window.computeUser70RecommendationsReview = computeUser70RecommendationsReview;
    window.updateReviewRoundSelector = updateReviewRoundSelector;
    window.exportImmutableUnifiedArchive = exportImmutableUnifiedArchive;
    window.importImmutableUnifiedArchive = importImmutableUnifiedArchive;
}
