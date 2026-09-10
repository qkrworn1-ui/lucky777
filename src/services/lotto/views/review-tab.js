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
    if (typeof UserContextManager !== 'undefined' && UserContextManager.getUserJoinRound) {
        return UserContextManager.getUserJoinRound(userId);
    }
    if (typeof window !== 'undefined' && window.UserContextManager && window.UserContextManager.getUserJoinRound) {
        return window.UserContextManager.getUserJoinRound(userId);
    }
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

    // 0. Check in global memory cache
    if (typeof window !== 'undefined' && window.__userCreatedMap && window.__userCreatedMap[cleanUser]) {
        createdAt = window.__userCreatedMap[cleanUser];
    }

    // 1. Check in state.allRegisteredUsersList
    if (!createdAt && state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) {
        const uObj = state.allRegisteredUsersList.find(u => (u.id || '').toLowerCase().trim() === cleanUser);
        if (uObj) createdAt = uObj.createdAt || uObj.created_at || uObj.registeredAt || uObj.joinDate;
    }

    // 2. Check in state.allUsersPurchasesMap
    if (!createdAt && state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanUser]) {
        const pObj = state.allUsersPurchasesMap[cleanUser];
        createdAt = pObj.createdAt || pObj.created_at || pObj.registeredAt;
    }

    // 3. Check in SessionStorage & LocalStorage caches
    if (!createdAt) {
        try {
            createdAt = (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`created_${cleanUser}`)) ||
                        (typeof localStorage !== 'undefined' && localStorage.getItem(`created_${cleanUser}`)) ||
                        (typeof localStorage !== 'undefined' && localStorage.getItem(`lotto_user_created_${cleanUser}`)) ||
                        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(`lotto_user_created_${cleanUser}`));
        } catch(e) {}
    }
    if (!createdAt) {
        try {
            const rawList = localStorage.getItem('lotto_all_users_list_cache');
            if (rawList) {
                const parsedList = JSON.parse(rawList);
                if (Array.isArray(parsedList)) {
                    const found = parsedList.find(u => (u.id || '').toLowerCase().trim() === cleanUser);
                    if (found) createdAt = found.createdAt || found.created_at || found.registeredAt;
                }
            }
        } catch(e) {}
    }
    if (!createdAt) {
        try {
            const raw = localStorage.getItem('lotto_user_data') || (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('lotto_user_data'));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.id || parsed.userId || '').toLowerCase().trim() === cleanUser) {
                    createdAt = parsed.createdAt || parsed.created_at || (parsed.agreementDoc && parsed.agreementDoc.createdAt);
                }
            }
        } catch(e) {}
    }

    // 4. Check window.currentUser if matching
    if (!createdAt && typeof window !== 'undefined' && window.currentUser) {
        const cId = (window.currentUser.userId || window.currentUser.id || '').toLowerCase().trim();
        if (cId === cleanUser) {
            createdAt = window.currentUser.createdAt || window.currentUser.created_at || (window.currentUser.agreementDoc && window.currentUser.agreementDoc.createdAt);
        }
    }

    if (createdAt) {
        try {
            let dt = null;
            if (typeof createdAt === 'object' && createdAt !== null) {
                if (createdAt.seconds) {
                    dt = new Date(createdAt.seconds * 1000);
                } else if (typeof createdAt.toDate === 'function') {
                    dt = createdAt.toDate();
                } else if (createdAt._seconds) {
                    dt = new Date(createdAt._seconds * 1000);
                }
            } else if (typeof createdAt === 'number') {
                dt = new Date(createdAt < 1e11 ? createdAt * 1000 : createdAt);
            } else if (typeof createdAt === 'string') {
                const s = createdAt.trim();
                dt = new Date(s);
            }

            if (dt && !isNaN(dt.getTime())) {
                const firstCutoff = new Date('2002-12-07T20:00:00+09:00');
                const diff = dt.getTime() - firstCutoff.getTime();
                if (diff >= 0) {
                    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
                    const calcedRound = 2 + weeks;
                    return Math.max(calcedRound, 1235);
                }
            }
        } catch(e) {}
    }

    // Default starting round for 7-quant algorithm review is 1235
    return 1235;
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

    // 🔒 0순위: 회원 가입일 기준 이전 회차는 추천번호 및 당첨금 없음 (가입 전 회차 보호)
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

    // 🔒 1순위: 영구 고정 저장 기록이 존재하는지 확인!
    let snapshot = null;
    if (typeof getUserWeeklyRecommendationSnapshotSync === 'function') {
        snapshot = getUserWeeklyRecommendationSnapshotSync(cleanUser, roundNum);
    }

    let v4Combos = [];
    let v3Combos = [];
    const extraPackEvals = [];

    if (snapshot && snapshot.v4Combos && snapshot.v3Combos && snapshot.extraPacks) {
        // 🛡️ 저장 기록 원본 100% 그대로 로드 (재계산 절대 금지 - 완전 변경 불가 원칙 보장)
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
            if (vStr.includes('V4') || vStr.includes('구매 심리 분석')) {
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

        // 실구매에 등록된 추천 조합이 있다면 해당 조합을 우선 매핑하여 변경 불가 원칙 100% 보존
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
            { algoId: 'v4', algoName: 'V4.0 심리 회피 추천 (10게임)', badge: 'BEHAVIORAL QUANT', color: '#8b5cf6', combos: v4Combos },
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

        // 🔒 산출된 데이터를 저장 기록으로 메모리/로컬에 영구 잠금
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
            if ((typeof window !== 'undefined' && window.db || db) && (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0)) {
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
                const sel = e.target.value;
                if (sel === 'all_rounds') {
                    renderReviewDetail('all_rounds');
                } else {
                    const parsedNum = parseInt(sel);
                    if (!isNaN(parsedNum)) {
                        renderReviewDetail(parsedNum);
                    }
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
                return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
            });
            let userOptionsHtml = `<option value="all" ${reviewAdminViewingUser === 'all' ? 'selected' : ''}>🌐 전체 회원 추천번호 종합 성과 분석</option>`;
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
                <button type="button" id="btnOpenAdmin1235ReviewModal" onclick="window.openAdmin1235ReviewModal && window.openAdmin1235ReviewModal()" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #0f172a; border: none; padding: 5px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4); margin-left: 4px; transition: all 0.2s;">
                    <i class="fa-solid fa-crown"></i> 1235회~ 추천·당첨 모달 (카톡 공유)
                </button>
            `;
        }

        const actualRoundSel = document.getElementById('reviewRoundSelector');
        const selectedR = actualRoundSel && actualRoundSel.value ? (actualRoundSel.value === 'all_rounds' ? 'all_rounds' : parseInt(actualRoundSel.value)) : validSelectedRound;
        renderReviewDetail(selectedR);

    } catch(e) {
        console.error('[renderReviewTab] Error:', e);
    }
}

/**
 * 🔄 추천성과 분석 회차 드롭다운 옵션 동적 갱신
 * - 최상단에 가입회차~최신회차 [전체 회차 조회] 옵션 기본 제공
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

    const currentVal = selectedRound !== null ? selectedRound : (reviewRoundSelector.value || null);
    let validSelected;
    if (currentVal === 'all_rounds' || String(currentVal) === 'all_rounds') {
        validSelected = 'all_rounds';
    } else {
        const numVal = parseInt(currentVal);
        validSelected = (!isNaN(numVal) && numVal >= minReviewRound && numVal <= effectiveMax) ? numVal : effectiveMax;
    }

    let optionsHtml = `<option value="all_rounds" ${validSelected === 'all_rounds' ? 'selected' : ''} style="font-weight:800; color:#fbbf24; background:#1e293b;">📊 [전체 회차 조회] ${minReviewRound}회 ~ ${effectiveMax}회 누적 종합 성과</option>`;
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
        const r = sel && sel.value ? (sel.value === 'all_rounds' ? 'all_rounds' : parseInt(sel.value)) : latestDrawn;
        renderReviewDetail(r);
    };
}

export function selectSpecificReviewRound(roundNum) {
    const sel = document.getElementById('reviewRoundSelector');
    if (sel) {
        sel.value = String(roundNum);
    }
    renderReviewDetail(roundNum);
    setTimeout(() => {
        const c = document.getElementById('reviewMatchingContainer');
        if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
}

/**
 * 📊 1235회차부터 최신회차까지 전회차 누적 추천성과 분석 렌더링
 */
export function renderAllRoundsReviewDetail() {
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
    }
    const isAllUsers = (isAdmin && (!reviewAdminViewingUser || reviewAdminViewingUser === 'all'));
    const effectiveUserId = (isAdmin && reviewAdminViewingUser && reviewAdminViewingUser !== 'all') ? reviewAdminViewingUser : authId;

    const historyRounds = Object.keys(state.mergedHistory || {})
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

    const userJoinRound = (!isAdmin || !isAllUsers) ? getUserJoinRound(effectiveUserId) : 1235;
    const minTargetRound = Math.max(1235, userJoinRound);

    // List of drawn rounds from latest down to minTargetRound
    const validRounds = [];
    for (let rnd = latestDrawnRound; rnd >= minTargetRound; rnd--) {
        if (state.mergedHistory && state.mergedHistory[rnd] && state.mergedHistory[rnd].numbers?.length === 6) {
            validRounds.push(rnd);
        }
    }
    if (validRounds.length === 0) validRounds.push(minTargetRound);

    let dispCombos = 0;
    let dispInvest = 0;
    let dispPrize = 0;
    let dispHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let dispRoi = 0;

    let adminRoundSummaryList = [];
    let adminMemberSummaryList = [];
    let userRoundSummaryList = [];

    // 7대 알고리즘 메타데이터 및 누적 통계 객체
    const algoPacks = [
        { id: 'v4', name: 'V4.0 심리 회피 추천', badge: 'BEHAVIORAL QUANT', color: '#8b5cf6' },
        { id: 'v3', name: 'V3.0 하이브리드 정통 수학', badge: 'HYBRID MATH', color: '#3b82f6' },
        { id: 'extra_1', name: '추가1팩: 자주 나온 번호 혼합', badge: 'EXTRA 1', color: '#10b981' },
        { id: 'extra_2', name: '추가2팩: 저주기 미출 회귀', badge: 'EXTRA 2', color: '#f59e0b' },
        { id: 'extra_3', name: '추가3팩: AC 밸런스 AI 분석', badge: 'EXTRA 3', color: '#8b5cf6' },
        { id: 'extra_4', name: '추가4팩: 구간 연속 대칭', badge: 'EXTRA 4', color: '#06b6d4' },
        { id: 'extra_5', name: '추가5팩: 극한 홀짝 가중치', badge: 'EXTRA 5', color: '#ec4899' }
    ];
    const algoSummaryMap = {};
    algoPacks.forEach(p => {
        algoSummaryMap[p.id] = { ...p, hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, prize: 0, games: 0, wins: 0 };
    });

    if (isAdmin && isAllUsers) {
        // --- 1. ADMIN + ALL USERS AGGREGATION ---
        const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
        const registeredUsers = rawUsers.filter(u => {
            const uId = (u.id || '').trim().toLowerCase();
            return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
        });
        const baseList = (registeredUsers.length > 0 ? registeredUsers : [{ id: authId, name: '관리자' }]);

        const memberAggMap = {};
        baseList.forEach(u => {
            memberAggMap[u.id] = {
                userId: u.id,
                realName: u.name || (typeof getUserRealName === 'function' ? getUserRealName(u.id) : '') || u.id,
                participatedRounds: 0,
                totalGames: 0,
                hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                totalPrize: 0,
                totalWins: 0,
                totalInvest: 0,
                roi: 0,
                realPurchasedRounds: 0,
                realPurchasedGames: 0
            };
        });

        validRounds.forEach(rnd => {
            const actualDraw = state.mergedHistory ? state.mergedHistory[rnd] : null;
            const drawDate = actualDraw && (actualDraw.date || actualDraw.drwNoDate) ? (actualDraw.date || actualDraw.drwNoDate) : '';
            
            // Active users joined on or before rnd
            const activeUsersForRound = baseList.filter(u => rnd >= getUserJoinRound(u.id));
            let rGames = 0, rPrize = 0;
            let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

            activeUsersForRound.forEach(u => {
                const uRev = computeUser70RecommendationsReview(u.id, rnd);
                if (uRev.isPreJoin) return;

                rGames += uRev.totalGames;
                rPrize += uRev.totalPrize;
                rHits[1] += uRev.grandHits[1];
                rHits[2] += uRev.grandHits[2];
                rHits[3] += uRev.grandHits[3];
                rHits[4] += uRev.grandHits[4];
                rHits[5] += uRev.grandHits[5];

                // Algo cumulative
                const v4Count = (uRev.v4Combos && uRev.v4Combos.length > 0) ? uRev.v4Combos.length : (uRev.totalGames > 0 ? 10 : 0);
                algoSummaryMap['v4'].games += v4Count;
                algoSummaryMap['v4'].prize += uRev.v4Eval.totalPrize;
                algoSummaryMap['v4'].wins += uRev.v4Eval.totalWins;
                for (let k = 1; k <= 5; k++) algoSummaryMap['v4'].hits[k] += uRev.v4Eval.hits[k];

                const v3Count = (uRev.v3Combos && uRev.v3Combos.length > 0) ? uRev.v3Combos.length : (uRev.totalGames > 0 ? 10 : 0);
                algoSummaryMap['v3'].games += v3Count;
                algoSummaryMap['v3'].prize += uRev.v3Eval.totalPrize;
                algoSummaryMap['v3'].wins += uRev.v3Eval.totalWins;
                for (let k = 1; k <= 5; k++) algoSummaryMap['v3'].hits[k] += uRev.v3Eval.hits[k];

                uRev.extraPackEvals.forEach(ep => {
                    const eKey = `extra_${ep.packId}`;
                    if (algoSummaryMap[eKey]) {
                        const epCount = (ep.combos && ep.combos.length > 0) ? ep.combos.length : (uRev.totalGames > 0 ? 10 : 0);
                        algoSummaryMap[eKey].games += epCount;
                        algoSummaryMap[eKey].prize += ep.evalData.totalPrize;
                        algoSummaryMap[eKey].wins += ep.evalData.totalWins;
                        for (let k = 1; k <= 5; k++) algoSummaryMap[eKey].hits[k] += ep.evalData.hits[k];
                    }
                });

                // Member aggregate
                const mAgg = memberAggMap[u.id];
                if (mAgg) {
                    mAgg.participatedRounds++;
                    mAgg.totalGames += uRev.totalGames;
                    mAgg.totalPrize += uRev.totalPrize;
                    mAgg.totalWins += uRev.totalWins;
                    for (let k = 1; k <= 5; k++) mAgg.hits[k] += uRev.grandHits[k];
                }
            });

            const rInvest = rGames * 1000;
            const rRoi = rInvest > 0 ? (rPrize / rInvest) * 100 : 0;
            const rWins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];

            adminRoundSummaryList.push({
                roundNum: rnd,
                date: drawDate,
                memberCount: activeUsersForRound.length,
                totalGames: rGames,
                totalInvest: rInvest,
                totalPrize: rPrize,
                totalWins: rWins,
                hits: rHits,
                roi: rRoi
            });

            dispHits[1] += rHits[1];
            dispHits[2] += rHits[2];
            dispHits[3] += rHits[3];
            dispHits[4] += rHits[4];
            dispHits[5] += rHits[5];
            dispPrize += rPrize;
            dispCombos += rGames;
        });

        // Calculate member totals and real purchases
        baseList.forEach(u => {
            const mAgg = memberAggMap[u.id];
            if (mAgg) {
                mAgg.totalInvest = mAgg.totalGames * 1000;
                mAgg.roi = mAgg.totalInvest > 0 ? (mAgg.totalPrize / mAgg.totalInvest) * 100 : 0;

                const userLedger = (state.allUsersPurchasesMap && state.allUsersPurchasesMap[u.id] && state.allUsersPurchasesMap[u.id].ledger) ? state.allUsersPurchasesMap[u.id].ledger : {};
                let realPurchasedRnds = 0, realPurchasedGms = 0;
                validRounds.forEach(r => {
                    const rReceipts = userLedger[r] || [];
                    if (rReceipts.length > 0) {
                        realPurchasedRnds++;
                        realPurchasedGms += rReceipts.reduce((acc, cur) => acc + (cur && Array.isArray(cur.combos) ? cur.combos.length : 0), 0);
                    }
                });
                mAgg.realPurchasedRounds = realPurchasedRnds;
                mAgg.realPurchasedGames = realPurchasedGms;
                adminMemberSummaryList.push(mAgg);
            }
        });

        adminMemberSummaryList.sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins || b.totalGames - a.totalGames);

        dispInvest = dispCombos * 1000;
        dispRoi = dispInvest > 0 ? (dispPrize / dispInvest) * 100 : 0;

    } else {
        // --- 2. SINGLE USER AGGREGATION (Regular User or Admin viewing specific user) ---
        validRounds.forEach(rnd => {
            const actualDraw = state.mergedHistory ? state.mergedHistory[rnd] : null;
            const drawDate = actualDraw && (actualDraw.date || actualDraw.drwNoDate) ? (actualDraw.date || actualDraw.drwNoDate) : '';
            const uRev = computeUser70RecommendationsReview(effectiveUserId, rnd);

            if (uRev.isPreJoin) return;

            // Accumulate
            dispHits[1] += uRev.grandHits[1];
            dispHits[2] += uRev.grandHits[2];
            dispHits[3] += uRev.grandHits[3];
            dispHits[4] += uRev.grandHits[4];
            dispHits[5] += uRev.grandHits[5];
            dispPrize += uRev.totalPrize;
            dispCombos += uRev.totalGames;

            // Algo cumulative
            const v4Count = (uRev.v4Combos && uRev.v4Combos.length > 0) ? uRev.v4Combos.length : (uRev.totalGames > 0 ? 10 : 0);
            algoSummaryMap['v4'].games += v4Count;
            algoSummaryMap['v4'].prize += uRev.v4Eval.totalPrize;
            algoSummaryMap['v4'].wins += uRev.v4Eval.totalWins;
            for (let k = 1; k <= 5; k++) algoSummaryMap['v4'].hits[k] += uRev.v4Eval.hits[k];

            const v3Count = (uRev.v3Combos && uRev.v3Combos.length > 0) ? uRev.v3Combos.length : (uRev.totalGames > 0 ? 10 : 0);
            algoSummaryMap['v3'].games += v3Count;
            algoSummaryMap['v3'].prize += uRev.v3Eval.totalPrize;
            algoSummaryMap['v3'].wins += uRev.v3Eval.totalWins;
            for (let k = 1; k <= 5; k++) algoSummaryMap['v3'].hits[k] += uRev.v3Eval.hits[k];

            uRev.extraPackEvals.forEach(ep => {
                const eKey = `extra_${ep.packId}`;
                if (algoSummaryMap[eKey]) {
                    const epCount = (ep.combos && ep.combos.length > 0) ? ep.combos.length : (uRev.totalGames > 0 ? 10 : 0);
                    algoSummaryMap[eKey].games += epCount;
                    algoSummaryMap[eKey].prize += ep.evalData.totalPrize;
                    algoSummaryMap[eKey].wins += ep.evalData.totalWins;
                    for (let k = 1; k <= 5; k++) algoSummaryMap[eKey].hits[k] += ep.evalData.hits[k];
                }
            });

            // Check real purchases for this user in this round
            const myPurchases = (getHistoricalTop10Combinations(rnd) || []).filter(p => {
                const pUser = (p.user || p.userId || '').trim().toLowerCase();
                return pUser === effectiveUserId.trim().toLowerCase();
            });
            const realGames = myPurchases.reduce((acc, cur) => acc + (cur && Array.isArray(cur.combos) ? cur.combos.length : 0), 0);

            userRoundSummaryList.push({
                roundNum: rnd,
                date: drawDate,
                isPreJoin: uRev.isPreJoin,
                joinRound: uRev.joinRound,
                totalGames: uRev.totalGames,
                totalInvest: uRev.totalInvest,
                totalPrize: uRev.totalPrize,
                totalWins: uRev.totalWins,
                hits: uRev.grandHits,
                roi: uRev.roi,
                v4Wins: uRev.v4Eval.totalWins,
                v3Wins: uRev.v3Eval.totalWins,
                realPurchasedGames: realGames
            });
        });

        dispInvest = dispCombos * 1000;
        dispRoi = dispInvest > 0 ? (dispPrize / dispInvest) * 100 : 0;
    }

    // --- Update Top Header Metrics ---
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
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-chart-line"></i> 📊 제 1235회 ~ 제 ${latestDrawnRound}회 (${validRounds.length}개 회차) 전체 회원 추천 누적 성과 <span style="font-size: 0.8rem; color: #fbbf24; font-weight: normal; margin-left: 8px;">(총 ${adminMemberSummaryList.length}명 / ${dispCombos.toLocaleString()}게임 전체 종합)</span>`;
        } else {
            const userRealName = (typeof getUserRealName === 'function' ? getUserRealName(effectiveUserId) : '') || effectiveUserId;
            const userBadge = isAdmin ? `👤 [${effectiveUserId}] (${userRealName}) 회원` : `<i class="fa-solid fa-user-check"></i> 나의 맞춤 (${userRealName})`;
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-chart-line"></i> 📊 ${userBadge} 제 ${minTargetRound}회 ~ 제 ${latestDrawnRound}회 (${validRounds.length}개 회차) 누적 추천 성과 <span style="font-size: 0.8rem; color: #34d399; font-weight: normal; margin-left: 8px;">(총 ${dispCombos.toLocaleString()}게임 기준)</span>`;
        }
    }

    if (reviewTotalCombosLabel) {
        reviewTotalCombosLabel.textContent = isAllUsers ? `전체 누적 조합 수 (${validRounds.length}개 회차)` : `누적 추천 조합 (${validRounds.length}개 회차)`;
    }
    if (reviewTotalInvestLabel) {
        reviewTotalInvestLabel.textContent = isAllUsers ? '전체 추천 누적 구매금액' : '추천 누적 구매금액';
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
        state.reviewPrizeChartInstance = null;
    }
    const canvas = document.getElementById('reviewPrizeRatioChart') || document.getElementById('reviewPrizeChart');
    const chartWrapper = document.getElementById('reviewChartWrapper');
    if (canvas && typeof canvas.getContext === 'function' && typeof window.Chart === 'function') {
        const ctx = canvas.getContext('2d');
        const hitArr = [dispHits[1], dispHits[2], dispHits[3], dispHits[4], dispHits[5]];
        const totalWins = hitArr.reduce((a, b) => a + b, 0);
        if (chartWrapper) chartWrapper.style.display = totalWins > 0 ? 'block' : 'none';

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

    // --- Build Matching Container HTML ---
    let html = `<div style="margin-bottom: 24px; padding: 16px; background: rgba(15, 23, 42, 0.7); border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 24px rgba(0,0,0,0.3);">`;

    // 1. All-Rounds Banner
    html += `
        <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%); border: 1.5px solid rgba(251, 191, 36, 0.45); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="font-size: 1.1rem; font-weight: 900; color: #fbbf24; white-space: nowrap;">
                        <i class="fa-solid fa-chart-pie"></i> ${minTargetRound}회 ~ ${latestDrawnRound}회 전회차 누적 추천성과 분석
                    </span>
                    <span style="font-size: 0.78rem; color: #38bdf8; background: rgba(56,189,248,0.15); border: 1px solid rgba(56,189,248,0.3); padding: 2px 8px; border-radius: 12px; font-weight: 700;">
                        총 ${validRounds.length}개 회차 전체 집계
                    </span>
                    ${isAdmin ? (isAllUsers ? `<span style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">🌐 전체 회원 누적 성과 종합 모드</span>` : `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">👤 [${effectiveUserId}] 회원 전회차 누적</span>`) : `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;"><i class="fa-solid fa-user-check"></i> 나의 전회차 맞춤 추천 누적 성과</span>`}
                </div>
                <div style="font-size: 0.85rem; color: #cbd5e1;">
                    누적 당첨 총액: <strong style="color: #34d399; font-size: 1.05rem;">+${dispPrize.toLocaleString()}원</strong> <span style="font-size: 0.8rem; color: ${dispRoi >= 100 ? '#10b981' : '#fbbf24'}; font-weight: 800;">(수익률 ${dispRoi.toFixed(1)}%)</span>
                </div>
            </div>
            <div style="font-size: 0.75rem; color: #94a3b8; line-height: 1.5; background: rgba(0,0,0,0.25); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
                <i class="fa-solid fa-shield-halved" style="color: #34d399; margin-right: 4px;"></i>
                <strong>안내:</strong> ${minTargetRound}회부터 최근 회차(${latestDrawnRound}회)까지 각 회차별 확정 추천번호(70게임)와 동행복권 공식 추첨번호를 1:1 전체 대조하여 누적 적중 및 당첨 성과를 종합 분석한 리포트입니다. 특정 회차를 상세 분석하시려면 표의 <strong>[상세 분석]</strong> 버튼이나 상단 회차 선택기를 이용하세요.
            </div>
        </div>
    `;

    // Admin Back Button if viewing specific user in all_rounds mode
    if (isAdmin && !isAllUsers) {
        html += `
            <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95)); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 10px; padding: 10px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.82rem; padding: 3px 8px; border-radius: 6px; font-weight: 800;">
                        <i class="fa-solid fa-user-check"></i> 👤 [${effectiveUserId}] 회원 전회차 누적 성과 분석 중
                    </span>
                    <span style="font-size: 0.78rem; color: #cbd5e1;">
                        (총 <strong>${dispHits[1] + dispHits[2] + dispHits[3] + dispHits[4] + dispHits[5]}게임</strong> 적중 · 누적 당첨금 <strong style="color: #34d399;">+${dispPrize.toLocaleString()}원</strong>)
                    </span>
                </div>
                <button type="button" onclick="window.changeReviewAdminUser && window.changeReviewAdminUser('all')" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25)); border: 1.5px solid #f59e0b; color: #fbbf24; padding: 6px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: all 0.2s;">
                    <i class="fa-solid fa-arrow-left"></i> 전체 회원 종합 목록으로 돌아가기
                </button>
            </div>
        `;
    }

    // 2. 7대 알고리즘 랭킹 산정 (1순위: 당첨금, 2순위: 1등>2등>3등>4등>5등 건수, 3순위: 총 당첨건수)
    const rankedAlgos = [...algoPacks].map(pack => {
        const aData = algoSummaryMap[pack.id];
        const aRoi = (aData.games * 1000) > 0 ? (aData.prize / (aData.games * 1000)) * 100 : 0;
        return {
            ...pack,
            ...aData,
            roi: aRoi
        };
    }).sort((a, b) => {
        if (b.prize !== a.prize) return b.prize - a.prize;
        if (b.hits[1] !== a.hits[1]) return b.hits[1] - a.hits[1];
        if (b.hits[2] !== a.hits[2]) return b.hits[2] - a.hits[2];
        if (b.hits[3] !== a.hits[3]) return b.hits[3] - a.hits[3];
        if (b.hits[4] !== a.hits[4]) return b.hits[4] - a.hits[4];
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.hits[5] - a.hits[5];
    });

    const algoRankMap = {};
    rankedAlgos.forEach((item, idx) => {
        algoRankMap[item.id] = idx + 1;
    });

    // 7대 알고리즘별 전회차 누적 성과 카드 그리드
    let algoCardsHtml = '';
    algoPacks.forEach(pack => {
        const aData = algoSummaryMap[pack.id];
        const aRoi = (aData.games * 1000) > 0 ? (aData.prize / (aData.games * 1000)) * 100 : 0;
        const isFilterMatched = (activeReviewFilter === 'all' || activeReviewFilter === pack.id);
        const cardOpacity = isFilterMatched ? '1' : '0.45';
        const rank = algoRankMap[pack.id] || 1;

        let rankBadgeBg = 'rgba(255,255,255,0.06)';
        let rankBadgeColor = '#94a3b8';
        let rankBadgeBorder = 'rgba(255,255,255,0.15)';
        let rankIcon = '';
        if (rank === 1) {
            rankBadgeBg = 'linear-gradient(135deg, rgba(251,191,36,0.25), rgba(217,119,6,0.25))';
            rankBadgeColor = '#fbbf24';
            rankBadgeBorder = '#fbbf24';
            rankIcon = '🥇 ';
        } else if (rank === 2) {
            rankBadgeBg = 'linear-gradient(135deg, rgba(203,213,225,0.2), rgba(148,163,184,0.2))';
            rankBadgeColor = '#f1f5f9';
            rankBadgeBorder = '#cbd5e1';
            rankIcon = '🥈 ';
        } else if (rank === 3) {
            rankBadgeBg = 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(180,83,9,0.2))';
            rankBadgeColor = '#f59e0b';
            rankBadgeBorder = '#f59e0b';
            rankIcon = '🥉 ';
        }

        algoCardsHtml += `
            <div style="background: rgba(0,0,0,0.3); border: 1.5px solid ${pack.color}50; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; opacity: ${cardOpacity}; transition: all 0.2s; box-sizing: border-box; width: 100%; max-width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">
                    <div style="font-size: 0.82rem; font-weight: 800; color: ${pack.color}; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-cubes"></i> ${pack.name}
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 0.7rem; background: ${rankBadgeBg}; color: ${rankBadgeColor}; border: 1px solid ${rankBadgeBorder}; padding: 1px 7px; border-radius: 6px; font-weight: 800; white-space: nowrap;">
                            ${rankIcon}${rank}위
                        </span>
                        <span style="font-size: 0.68rem; background: ${pack.color}25; color: ${pack.color}; border: 1px solid ${pack.color}40; padding: 1px 6px; border-radius: 6px; font-weight: 700;">
                            ${pack.badge}
                        </span>
                    </div>
                </div>
                <div style="font-size: 0.74rem; color: #cbd5e1; margin-bottom: 6px; display: flex; justify-content: space-between;">
                    <span>누적 추천: <strong>${aData.games.toLocaleString()}게임</strong></span>
                    <span style="color: #38bdf8;">총 적중: <strong>${aData.wins}회</strong></span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; text-align: center; margin-bottom: 8px; font-size: 0.68rem; box-sizing: border-box;">
                    <div style="background: rgba(251,191,36,0.12); padding: 3px 1px; border-radius: 4px; color: ${aData.hits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700; white-space: nowrap;">1등: ${aData.hits[1]}</div>
                    <div style="background: rgba(248,113,113,0.12); padding: 3px 1px; border-radius: 4px; color: ${aData.hits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700; white-space: nowrap;">2등: ${aData.hits[2]}</div>
                    <div style="background: rgba(96,165,250,0.12); padding: 3px 1px; border-radius: 4px; color: ${aData.hits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700; white-space: nowrap;">3등: ${aData.hits[3]}</div>
                    <div style="background: rgba(52,211,153,0.12); padding: 3px 1px; border-radius: 4px; color: ${aData.hits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700; white-space: nowrap;">4등: ${aData.hits[4]}</div>
                    <div style="background: rgba(167,139,250,0.12); padding: 3px 1px; border-radius: 4px; color: ${aData.hits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700; white-space: nowrap;">5등: ${aData.hits[5]}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 6px; font-size: 0.74rem;">
                    <span style="color: #94a3b8;">당첨금: <strong style="color: #34d399;">+${aData.prize.toLocaleString()}원</strong></span>
                    <span style="font-weight: 700; color: ${aRoi >= 100 ? '#10b981' : (aRoi > 0 ? '#fbbf24' : '#94a3b8')};">수익률 ${aRoi.toFixed(1)}%</span>
                </div>
            </div>
        `;
    });

    html += `
        <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px 12px; margin-bottom: 20px; box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-layer-group" style="color: #38bdf8; font-size: 1rem;"></i>
                    <h4 style="margin: 0; color: #f8fafc; font-size: 0.92rem; font-weight: 800;">
                        7대 알고리즘별 전회차 (1235회 ~ ${latestDrawnRound}회) 누적 성과 요약 & 등수별 당첨 순위
                    </h4>
                </div>
                <span style="font-size: 0.74rem; color: #94a3b8;">
                    ${isAllUsers ? '전체 회원 합산 통계' : `[${effectiveUserId}] 회원 지정 통계`}
                </span>
            </div>

            <!-- 🏆 알고리즘별 종합 순위 빠른 요약 바 -->
            <div style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 14px; -webkit-overflow-scrolling: touch; width: 100%; max-width: 100%; box-sizing: border-box;">
                ${rankedAlgos.map((item, idx) => {
                    const rankNum = idx + 1;
                    let rankBg = 'rgba(255,255,255,0.05)';
                    let rankBorder = 'rgba(255,255,255,0.1)';
                    let rankTitle = `${rankNum}위`;
                    let rankColor = '#cbd5e1';
                    if (rankNum === 1) {
                        rankBg = 'rgba(251,191,36,0.15)';
                        rankBorder = '#fbbf24';
                        rankTitle = '🥇 1위';
                        rankColor = '#fbbf24';
                    } else if (rankNum === 2) {
                        rankBg = 'rgba(203,213,225,0.12)';
                        rankBorder = '#cbd5e1';
                        rankTitle = '🥈 2위';
                        rankColor = '#f1f5f9';
                    } else if (rankNum === 3) {
                        rankBg = 'rgba(245,158,11,0.12)';
                        rankBorder = '#f59e0b';
                        rankTitle = '🥉 3위';
                        rankColor = '#fbbf24';
                    }
                    const cleanName = item.name.replace(/추가(\d)팩:\s*/, '추가$1 ').replace(/ 추천 조합 세트| 알고리즘/g, '');
                    return `
                        <div style="flex: 0 0 auto; background: ${rankBg}; border: 1px solid ${rankBorder}; padding: 5px 10px; border-radius: 8px; font-size: 0.74rem; white-space: nowrap; display: flex; align-items: center; gap: 6px;">
                            <strong style="color: ${rankColor};">${rankTitle}</strong>
                            <span style="color: #e2e8f0; font-weight: 700;">${cleanName}</span>
                            <span style="color: #34d399; font-weight: 800;">+${item.prize.toLocaleString()}원</span>
                            <span style="color: #60a5fa; font-size: 0.7rem;">(${item.wins}회)</span>
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- 📊 알고리즘별 등수별(1~5등) 누적 당첨 횟수 및 순위 비교 막대 그래프 -->
            <div style="background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 8px; margin-bottom: 16px; box-sizing: border-box; width: 100%; max-width: 100%; overflow: hidden;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px; padding: 0 4px;">
                    <div style="font-size: 0.82rem; font-weight: 800; color: #fbbf24; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-chart-column" style="color: #38bdf8;"></i> 알고리즘별 등수별(1~5등) 누적 당첨 실적 막대 그래프
                    </div>
                    <div style="font-size: 0.7rem; color: #94a3b8;">
                        * 1235회~${latestDrawnRound}회 7대 알고리즘별 1등~5등 누적 적중 횟수 비교
                    </div>
                </div>
                <div style="height: 240px; position: relative; width: 100%; max-width: 100%; box-sizing: border-box;">
                    <canvas id="reviewAlgoBarChart"></canvas>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 10px; box-sizing: border-box; width: 100%; max-width: 100%;">
                ${algoCardsHtml}
            </div>
        </div>
    `;

    // 3. MAIN TABLES
    if (isAdmin && isAllUsers) {
        // --- 3-A. ADMIN: 1) Round-by-Round Breakdown Table ---
        let roundRowsHtml = '';
        adminRoundSummaryList.forEach(rItem => {
            roundRowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
                    <td style="padding: 8px 10px; font-weight: 800; color: #fbbf24; white-space: nowrap;">
                        제 ${rItem.roundNum}회
                    </td>
                    <td style="padding: 8px 10px; color: #94a3b8; font-size: 0.72rem; white-space: nowrap;">
                        ${rItem.date || '-'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #cbd5e1; font-weight: 700; white-space: nowrap;">
                        ${rItem.memberCount}명
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #f8fafc; white-space: nowrap;">
                        ${rItem.totalGames.toLocaleString()}게임
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(251,191,36,0.15); color: ${rItem.hits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">${rItem.hits[1]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(248,113,113,0.15); color: ${rItem.hits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">${rItem.hits[2]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(96,165,250,0.15); color: ${rItem.hits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">${rItem.hits[3]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(52,211,153,0.15); color: ${rItem.hits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">${rItem.hits[4]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(167,139,250,0.15); color: ${rItem.hits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">${rItem.hits[5]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: ${rItem.totalPrize > 0 ? '#34d399' : '#94a3b8'}; white-space: nowrap;">
                        +${rItem.totalPrize.toLocaleString()}원
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${rItem.roi >= 100 ? '#10b981' : (rItem.roi > 0 ? '#fbbf24' : '#64748b')}; white-space: nowrap;">
                        ${rItem.roi.toFixed(1)}%
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <button type="button" onclick="window.selectSpecificReviewRound && window.selectSpecificReviewRound(${rItem.roundNum})" style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-magnifying-glass"></i> ${rItem.roundNum}회 복기
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(59, 130, 246, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-list-ol" style="color: #60a5fa; font-size: 1.1rem;"></i>
                        <h4 style="margin: 0; color: #60a5fa; font-size: 0.95rem; font-weight: 800;">
                            [회차별 성과 현황] 1235회 ~ ${latestDrawnRound}회 회차별 추천 당첨 성과표
                        </h4>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1;">
                        총 <strong>${validRounds.length}개 회차</strong> 전체 집계
                    </div>
                </div>

                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 720px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.35); border-bottom: 1.5px solid rgba(255,255,255,0.12); font-size: 0.74rem; color: #94a3b8;">
                                <th style="padding: 8px 10px;">회차</th>
                                <th style="padding: 8px 10px;">추첨일자</th>
                                <th style="padding: 8px 10px; text-align: center;">참여회원</th>
                                <th style="padding: 8px 10px; text-align: center;">전체 추천수</th>
                                <th style="padding: 8px 10px; text-align: center; color: #fbbf24;">1등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #f87171;">2등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #60a5fa;">3등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #34d399;">4등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #a78bfa;">5등</th>
                                <th style="padding: 8px 10px; text-align: right; color: #34d399;">총 당첨금</th>
                                <th style="padding: 8px 10px; text-align: right;">수익률</th>
                                <th style="padding: 8px 10px; text-align: center;">상세 분석</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roundRowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(0,0,0,0.5); font-weight: 800; font-size: 0.8rem; border-top: 2px solid rgba(59, 130, 246, 0.5);">
                                <td colspan="3" style="padding: 10px; color: #60a5fa;">합계 (${validRounds.length}개 회차 누적)</td>
                                <td style="padding: 10px; text-align: center; color: #f8fafc;">${dispCombos.toLocaleString()}게임</td>
                                <td style="padding: 10px; text-align: center; color: #fbbf24;">${dispHits[1]}</td>
                                <td style="padding: 10px; text-align: center; color: #f87171;">${dispHits[2]}</td>
                                <td style="padding: 10px; text-align: center; color: #60a5fa;">${dispHits[3]}</td>
                                <td style="padding: 10px; text-align: center; color: #34d399;">${dispHits[4]}</td>
                                <td style="padding: 10px; text-align: center; color: #a78bfa;">${dispHits[5]}</td>
                                <td style="padding: 10px; text-align: right; color: #34d399;">+${dispPrize.toLocaleString()}원</td>
                                <td style="padding: 10px; text-align: right; color: #fbbf24;">${dispRoi.toFixed(1)}%</td>
                                <td style="padding: 10px; text-align: center; color: #64748b;">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;

        // --- 3-B. ADMIN: 2) Member-by-Member Cumulative Table ---
        let memberRowsHtml = '';
        adminMemberSummaryList.forEach((m, mIdx) => {
            memberRowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
                    <td style="padding: 8px 10px; text-align: center; font-weight: 700; color: ${mIdx < 3 ? '#fbbf24' : '#94a3b8'}; white-space: nowrap;">
                        ${mIdx + 1}
                    </td>
                    <td style="padding: 8px 10px; font-weight: 700; color: #f8fafc; white-space: nowrap;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="color: #fbbf24;"><i class="fa-solid fa-user"></i> ${m.userId}</span>
                            ${m.realPurchasedGames > 0 ? `<span style="font-size: 0.68rem; color: #34d399; background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); padding: 1px 5px; border-radius: 4px; font-weight: normal;">실구매 ${m.realPurchasedGames}게임 (${m.realPurchasedRounds}회차)</span>` : `<span style="font-size: 0.68rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 5px; border-radius: 4px; font-weight: normal;">실구매 미등록</span>`}
                        </div>
                        <div style="font-size: 0.7rem; color: #94a3b8; font-weight: normal;">${m.realName}</div>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #cbd5e1; white-space: nowrap;">
                        ${m.participatedRounds}개 회차
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #cbd5e1; white-space: nowrap;">
                        ${m.totalGames.toLocaleString()}게임
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(251,191,36,0.15); color: ${m.hits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">${m.hits[1]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(248,113,113,0.15); color: ${m.hits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">${m.hits[2]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(96,165,250,0.15); color: ${m.hits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">${m.hits[3]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(52,211,153,0.15); color: ${m.hits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">${m.hits[4]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(167,139,250,0.15); color: ${m.hits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">${m.hits[5]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: ${m.totalPrize > 0 ? '#34d399' : '#94a3b8'}; white-space: nowrap;">
                        +${m.totalPrize.toLocaleString()}원
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${m.roi >= 100 ? '#10b981' : (m.roi > 0 ? '#fbbf24' : '#64748b')}; white-space: nowrap;">
                        ${m.roi.toFixed(1)}%
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <button type="button" onclick="window.changeReviewAdminUser && window.changeReviewAdminUser('${m.userId}')" style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-magnifying-glass"></i> 회원 전회차 성과 분석
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 1.1rem;"></i>
                        <h4 style="margin: 0; color: #fbbf24; font-size: 0.95rem; font-weight: 800;">
                            [회원별 누적 성과 종합 순위] 1235회 ~ ${latestDrawnRound}회 회원별 AI 추천 적중 성과표
                        </h4>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1;">
                        총 회원 <strong>${adminMemberSummaryList.length}명</strong>
                    </div>
                </div>

                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 720px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.35); border-bottom: 1.5px solid rgba(255,255,255,0.12); font-size: 0.74rem; color: #94a3b8;">
                                <th style="padding: 8px 10px; text-align: center;">순위</th>
                                <th style="padding: 8px 10px;">회원명 (ID) / 실구매</th>
                                <th style="padding: 8px 10px; text-align: center;">참여회차</th>
                                <th style="padding: 8px 10px; text-align: center;">누적 추천게임</th>
                                <th style="padding: 8px 10px; text-align: center; color: #fbbf24;">1등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #f87171;">2등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #60a5fa;">3등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #34d399;">4등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #a78bfa;">5등</th>
                                <th style="padding: 8px 10px; text-align: right; color: #34d399;">총 당첨금</th>
                                <th style="padding: 8px 10px; text-align: right;">수익률</th>
                                <th style="padding: 8px 10px; text-align: center;">개별 분석</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${memberRowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(0,0,0,0.5); font-weight: 800; font-size: 0.8rem; border-top: 2px solid rgba(245,158,11,0.5);">
                                <td colspan="3" style="padding: 10px; color: #fbbf24;">전체 합계 (${adminMemberSummaryList.length}명)</td>
                                <td style="padding: 10px; text-align: center; color: #f8fafc;">${dispCombos.toLocaleString()}게임</td>
                                <td style="padding: 10px; text-align: center; color: #fbbf24;">${dispHits[1]}</td>
                                <td style="padding: 10px; text-align: center; color: #f87171;">${dispHits[2]}</td>
                                <td style="padding: 10px; text-align: center; color: #60a5fa;">${dispHits[3]}</td>
                                <td style="padding: 10px; text-align: center; color: #34d399;">${dispHits[4]}</td>
                                <td style="padding: 10px; text-align: center; color: #a78bfa;">${dispHits[5]}</td>
                                <td style="padding: 10px; text-align: right; color: #34d399;">+${dispPrize.toLocaleString()}원</td>
                                <td style="padding: 10px; text-align: right; color: #fbbf24;">${dispRoi.toFixed(1)}%</td>
                                <td style="padding: 10px; text-align: center; color: #64748b;">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;

    } else {
        // --- 3-C. SINGLE USER: Round-by-Round Breakdown Table ---
        let singleUserRoundRowsHtml = '';
        userRoundSummaryList.forEach(uItem => {
            singleUserRoundRowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.78rem;">
                    <td style="padding: 8px 10px; font-weight: 800; color: #fbbf24; white-space: nowrap;">
                        제 ${uItem.roundNum}회
                    </td>
                    <td style="padding: 8px 10px; color: #94a3b8; font-size: 0.72rem; white-space: nowrap;">
                        ${uItem.date || '-'}
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #cbd5e1; white-space: nowrap;">
                        ${uItem.totalGames}게임
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(251,191,36,0.15); color: ${uItem.hits[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">${uItem.hits[1]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(248,113,113,0.15); color: ${uItem.hits[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">${uItem.hits[2]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(96,165,250,0.15); color: ${uItem.hits[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">${uItem.hits[3]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(52,211,153,0.15); color: ${uItem.hits[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">${uItem.hits[4]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <span style="padding: 1px 6px; border-radius: 4px; background: rgba(167,139,250,0.15); color: ${uItem.hits[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">${uItem.hits[5]}</span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; color: #38bdf8; font-weight: 700; white-space: nowrap;">
                        ${uItem.totalWins}건
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: ${uItem.totalPrize > 0 ? '#34d399' : '#94a3b8'}; white-space: nowrap;">
                        +${uItem.totalPrize.toLocaleString()}원
                    </td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${uItem.roi >= 100 ? '#10b981' : (uItem.roi > 0 ? '#fbbf24' : '#64748b')}; white-space: nowrap;">
                        ${uItem.roi.toFixed(1)}%
                    </td>
                    <td style="padding: 8px 10px; text-align: center; white-space: nowrap;">
                        <button type="button" onclick="window.selectSpecificReviewRound && window.selectSpecificReviewRound(${uItem.roundNum})" style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; padding: 3px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
                            <i class="fa-solid fa-magnifying-glass"></i> ${uItem.roundNum}회 70게임 성과 분석
                        </button>
                    </td>
                </tr>
            `;
        });

        html += `
            <div style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(16, 185, 129, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <i class="fa-solid fa-calendar-check" style="color: #34d399; font-size: 1.1rem;"></i>
                        <h4 style="margin: 0; color: #34d399; font-size: 0.95rem; font-weight: 800;">
                            [회차별 추천 당첨 상세] 1235회 ~ ${latestDrawnRound}회 성과표
                        </h4>
                    </div>
                    <div style="font-size: 0.75rem; color: #cbd5e1;">
                        총 <strong>${validRounds.length}개 회차</strong> 누적
                    </div>
                </div>

                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 720px;">
                        <thead>
                            <tr style="background: rgba(0,0,0,0.35); border-bottom: 1.5px solid rgba(255,255,255,0.12); font-size: 0.74rem; color: #94a3b8;">
                                <th style="padding: 8px 10px;">회차</th>
                                <th style="padding: 8px 10px;">추첨일자</th>
                                <th style="padding: 8px 10px; text-align: center;">추천게임</th>
                                <th style="padding: 8px 10px; text-align: center; color: #fbbf24;">1등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #f87171;">2등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #60a5fa;">3등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #34d399;">4등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #a78bfa;">5등</th>
                                <th style="padding: 8px 10px; text-align: center; color: #38bdf8;">총적중</th>
                                <th style="padding: 8px 10px; text-align: right; color: #34d399;">당첨금</th>
                                <th style="padding: 8px 10px; text-align: right;">수익률</th>
                                <th style="padding: 8px 10px; text-align: center;">상세 분석</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${singleUserRoundRowsHtml}
                        </tbody>
                        <tfoot>
                            <tr style="background: rgba(0,0,0,0.5); font-weight: 800; font-size: 0.8rem; border-top: 2px solid rgba(16, 185, 129, 0.5);">
                                <td colspan="2" style="padding: 10px; color: #34d399;">누적 합계 (${validRounds.length}개 회차)</td>
                                <td style="padding: 10px; text-align: center; color: #f8fafc;">${dispCombos.toLocaleString()}게임</td>
                                <td style="padding: 10px; text-align: center; color: #fbbf24;">${dispHits[1]}</td>
                                <td style="padding: 10px; text-align: center; color: #f87171;">${dispHits[2]}</td>
                                <td style="padding: 10px; text-align: center; color: #60a5fa;">${dispHits[3]}</td>
                                <td style="padding: 10px; text-align: center; color: #34d399;">${dispHits[4]}</td>
                                <td style="padding: 10px; text-align: center; color: #a78bfa;">${dispHits[5]}</td>
                                <td style="padding: 10px; text-align: center; color: #38bdf8;">${dispHits[1] + dispHits[2] + dispHits[3] + dispHits[4] + dispHits[5]}건</td>
                                <td style="padding: 10px; text-align: right; color: #34d399;">+${dispPrize.toLocaleString()}원</td>
                                <td style="padding: 10px; text-align: right; color: #fbbf24;">${dispRoi.toFixed(1)}%</td>
                                <td style="padding: 10px; text-align: center; color: #64748b;">-</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    reviewMatchingContainer.innerHTML = html;

    // Render Chart.js Bar Chart for 7 Algorithms Cumulative Winning Performance
    if (state.reviewAlgoBarChartInstance) {
        state.reviewAlgoBarChartInstance.destroy();
        state.reviewAlgoBarChartInstance = null;
    }
    const canvasAlgo = document.getElementById('reviewAlgoBarChart');
    if (canvasAlgo && typeof canvasAlgo.getContext === 'function' && typeof window.Chart === 'function') {
        const ctxAlgo = canvasAlgo.getContext('2d');
        const algoLabels = [
            ['V4.0', '행동경제'],
            ['V3.0', '하이브리드'],
            ['추가1', '고주기'],
            ['추가2', '저주기'],
            ['추가3', 'ACAI 분석'],
            ['추가4', '구간대칭'],
            ['추가5', '극한홀짝']
        ];

        state.reviewAlgoBarChartInstance = new window.Chart(ctxAlgo, {
            type: 'bar',
            data: {
                labels: algoLabels,
                datasets: [
                    {
                        label: '1등',
                        data: algoPacks.map(p => algoSummaryMap[p.id].hits[1]),
                        backgroundColor: '#fbbf24',
                        stack: 'hits',
                        borderRadius: 2
                    },
                    {
                        label: '2등',
                        data: algoPacks.map(p => algoSummaryMap[p.id].hits[2]),
                        backgroundColor: '#f87171',
                        stack: 'hits',
                        borderRadius: 2
                    },
                    {
                        label: '3등',
                        data: algoPacks.map(p => algoSummaryMap[p.id].hits[3]),
                        backgroundColor: '#60a5fa',
                        stack: 'hits',
                        borderRadius: 2
                    },
                    {
                        label: '4등',
                        data: algoPacks.map(p => algoSummaryMap[p.id].hits[4]),
                        backgroundColor: '#34d399',
                        stack: 'hits',
                        borderRadius: 2
                    },
                    {
                        label: '5등',
                        data: algoPacks.map(p => algoSummaryMap[p.id].hits[5]),
                        backgroundColor: '#a78bfa',
                        stack: 'hits',
                        borderRadius: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#cbd5e1',
                            font: { size: 9, weight: 'bold' },
                            boxWidth: 8,
                            padding: 6
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: function(items) {
                                if (!items.length) return '';
                                const idx = items[0].dataIndex;
                                const pack = algoPacks[idx];
                                const rank = algoRankMap[pack.id] || (idx + 1);
                                return `[${rank}위] ${pack.name}`;
                            },
                            label: function(ctx) {
                                const val = ctx.raw || 0;
                                return `${ctx.dataset.label}: ${val}회`;
                            },
                            footer: function(items) {
                                if (!items.length) return '';
                                const idx = items[0].dataIndex;
                                const pack = algoPacks[idx];
                                const aData = algoSummaryMap[pack.id];
                                return `총 적중: ${aData.wins}회 | 누적 당첨금: +${aData.prize.toLocaleString()}원`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: { color: '#cbd5e1', font: { size: 9, weight: 'bold' }, maxRotation: 0, autoSkip: false },
                        grid: { display: false }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { color: '#94a3b8', precision: 0, font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.06)' }
                    }
                }
            }
        });
    }
}

export function renderReviewDetail(r) {
    if (r === 'all_rounds' || String(r) === 'all_rounds') {
        return renderAllRoundsReviewDetail();
    }
    const reviewMatchingContainer = document.getElementById('reviewMatchingContainer');
    if (!reviewMatchingContainer) return;

    if (state.reviewAlgoBarChartInstance) {
        state.reviewAlgoBarChartInstance.destroy();
        state.reviewAlgoBarChartInstance = null;
    }

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
            return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
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
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-trophy"></i> 제 ${roundNum}회 전체 회원 추천 종합 당첨 성과 <span style="font-size: 0.8rem; color: #fbbf24; font-weight: normal; margin-left: 8px;">(총 ${membersEvalList.length}명 / ${dispCombos.toLocaleString()}게임 전체 합산)</span>`;
        } else {
            const userBadge = isAdmin ? `👤 [${effectiveUserId}] 회원` : `<i class="fa-solid fa-user-check"></i> 나의 맞춤`;
            reviewStatsHeaderTitle.innerHTML = `<i class="fa-solid fa-trophy"></i> ${userBadge} 제 ${roundNum}회 추천 당첨 성과 <span style="font-size: 0.8rem; color: #34d399; font-weight: normal; margin-left: 8px;">(70게임 기준)</span>`;
        }
    }

    if (reviewTotalCombosLabel) {
        reviewTotalCombosLabel.textContent = isAllUsers ? `전체 추천 조합 수 (${membersEvalList.length}명)` : '추천 조합 수';
    }
    if (reviewTotalInvestLabel) {
        reviewTotalInvestLabel.textContent = isAllUsers ? '전체 추천 구매금액' : '추천 구매금액';
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
        state.reviewPrizeChartInstance = null;
    }
    const canvas = document.getElementById('reviewPrizeRatioChart') || document.getElementById('reviewPrizeChart');
    const chartWrapper = document.getElementById('reviewChartWrapper');
    if (canvas && typeof canvas.getContext === 'function' && typeof window.Chart === 'function') {
        const ctx = canvas.getContext('2d');
        const hitArr = [dispHits[1], dispHits[2], dispHits[3], dispHits[4], dispHits[5]];
        const totalWins = hitArr.reduce((a, b) => a + b, 0);
        if (chartWrapper) chartWrapper.style.display = totalWins > 0 ? 'block' : 'none';
        
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
                        ${isAdmin ? (isAllUsers ? `<span style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #60a5fa; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">🌐 전체 회원 AI 추천번호 종합 성과 분석 모드</span>` : `<span style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;">👤 [${effectiveUserId}] 회원 추천번호 성과 분석</span>`) : `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;"><i class="fa-solid fa-user-check"></i> 나의 맞춤 추천번호 성과 분석</span>`}
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
                        <strong>알고리즘 추천 성과 무결성 및 개인 맞춤 지정 원리:</strong> 본 성과 내역은 해당 회차 추첨 전 회원 고유 ID 기준으로 확정된 7개 팩(70게임) 조합과 동행복권 공식 결과를 1:1 대조한 것입니다. 회원마다 고유한 맞춤 조합이 지정되므로 회원별 당첨 결과가 서로 다르게 산출되며, 사후 변경이나 조작이 불가능한 불변 데이터입니다.
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
                        <i class="fa-solid fa-user-check"></i> 👤 [${effectiveUserId}] 회원 지정 추천번호 성과 분석 중
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
                            <i class="fa-solid fa-magnifying-glass"></i> 70게임 성과 분석
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
                    <i class="fa-solid fa-circle-info" style="color: #38bdf8;"></i> <strong>안내:</strong> 본 성과표는 회원이 실제로 로또방에서 구매한 영수증 내역이 아니며, 각 회원에게 지정된 <strong>AI 추천 70게임 조합이 공식 추첨 결과와 대조되어 몇 게임이나 적중했는지를 측정한 시뮬레이션 복기 데이터</strong>입니다.
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
                                <th style="padding: 8px 10px; text-align: center;">개별 추천 분석</th>
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
                    <strong>알림:</strong> 회원마다 고유한 70게임이 맞춤 지정되어 당첨 내역이 다릅니다. 아래 조합 카드는 관리자 계정(${effectiveUserId}) 기준 대표 예시이며, 각 회원의 개별 추천 70게임을 상세 분석하시려면 상단 표의 <strong>[70게임 성과 분석]</strong> 버튼을 클릭하세요.
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
                ${isAllUsers ? `전체 통합 7대 알고리즘 추천 70게임 성과 분석` : `[${(typeof getUserRealName === 'function' ? getUserRealName(effectiveUserId) : '') || (effectiveUserId === 'master' ? '최고관리자' : effectiveUserId)}] 회원 지정 7대 알고리즘 70게임 성과 분석`}
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
            '<i class="fa-solid fa-brain" style="color: #a78bfa;"></i> V4.0 심리 회피 추천 (추천 10게임 성과 분석)',
            `10게임 분석 완료 (적중 ${v4Eval.totalWins}회)`,
            'rgba(139, 92, 246, 0.2)',
            '#c4b5fd',
            'rgba(139, 92, 246, 0.35)',
            v4Eval
        );
    }

    if (activeReviewFilter === 'all' || activeReviewFilter === 'v3') {
        html += renderComboCardSection(
            '<i class="fa-solid fa-gears" style="color: #60a5fa;"></i> V3.0 하이브리드 정통 수학 알고리즘 (추천 10게임 성과 분석)',
            `10게임 분석 완료 (적중 ${v3Eval.totalWins}회)`,
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
                `<i class="fa-solid fa-layer-group" style="color: ${pack.color};"></i> ${pack.name} (추가 ${pack.packId}팩 10게임 성과 분석)`,
                `10게임 분석 완료 (적중 ${pack.evalData.totalWins}회)`,
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
    showToast(isAll ? '🌐 전체 회원 추천번호 종합 성과 분석 화면으로 전환되었습니다.' : (isSelf ? '👑 관리자 본인의 70게임 성과 분석로 전환되었습니다.' : `👤 [${userId}] 회원의 추천번호 70게임 성과 분석로 전환되었습니다.`));
}

// ====================================================================
// 👑 관리자 전용: 제 1235회~ 추천내역 & 당첨내역 상세 모달 및 카카오톡 공유
// ====================================================================

let _currentAdmin1235ModalRound = 'all_rounds';
let _currentAdmin1235ModalUser = 'all';
let _currentAdmin1235ModalFilter = 'all';

/**
 * 👑 1235회차별 추천 및 당첨 성과 상세 모달 열기
 */
export async function openAdmin1235ReviewModal(initialRound = null, initialUser = null) {
    if ((typeof window !== 'undefined' && window.db || db) && (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0)) {
        try {
            await fetchAllUsersPurchases();
        } catch(e) {}
    }

    let modal = document.getElementById('admin1235ReviewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin1235ReviewModal';
        modal.className = 'modal-overlay';
        modal.style.cssText = 'display: flex; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(7, 10, 20, 0.92); z-index: 100005; padding: 12px; box-sizing: border-box; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);';
        modal.innerHTML = `
            <div class="modal-card" style="background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); border: 2px solid #f59e0b; border-radius: 16px; max-width: 720px; width: 100%; color: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.9); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; font-family: 'Pretendard', sans-serif;">
                
                <!-- Modal Header -->
                <div style="background: rgba(15, 23, 42, 0.95); padding: 14px 16px; border-bottom: 1.5px solid rgba(245, 158, 11, 0.3); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 1.1rem; border: 1px solid rgba(245, 158, 11, 0.4);">
                            <i class="fa-solid fa-crown"></i>
                        </span>
                        <div>
                            <h3 style="margin: 0; color: #fbbf24; font-size: 1.05rem; font-weight: 900; letter-spacing: -0.3px;">
                                1235회~ 추천·당첨 상세 리포트
                            </h3>
                            <span style="font-size: 0.72rem; color: #94a3b8;">빅데이터 AI 추천 알고리즘 실시간 성과 분석 &amp; 대외 공유 콘솔</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                        <button type="button" onclick="window.shareAdmin1235ReviewAsImage && window.shareAdmin1235ReviewAsImage()" title="카카오톡/SNS로 이미지 전송 (친구/단톡방 선택)" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);">
                            <i class="fa-solid fa-image"></i> 이미지 공유
                        </button>
                        <button type="button" onclick="window.shareAdmin1235ReviewToKakao && window.shareAdmin1235ReviewToKakao()" title="카카오톡 친구 및 채팅방 선택 공유" style="background: #fee500; color: #191919; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(254, 229, 0, 0.35);">
                            <i class="fa-solid fa-comment"></i> 카톡 공유
                        </button>
                        <button type="button" onclick="window.downloadAdmin1235ReviewImage && window.downloadAdmin1235ReviewImage()" title="리포트 이미지 파일로 저장" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-download"></i> 저장
                        </button>
                        <button type="button" onclick="window.copyAdmin1235ReviewText && window.copyAdmin1235ReviewText()" title="텍스트 클립보드 복사" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #e2e8f0; padding: 6px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-copy"></i> 복사
                        </button>
                        <button type="button" onclick="document.getElementById('admin1235ReviewModal').style.display='none'" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; font-size: 1.2rem; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; line-height: 1;">&times;</button>
                    </div>
                </div>

                <!-- Controls: Round, Member & Pack Selector -->
                <div style="background: rgba(0, 0, 0, 0.35); padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                        <div>
                            <label style="display: block; font-size: 0.72rem; color: #94a3b8; font-weight: 700; margin-bottom: 3px;">
                                <i class="fa-solid fa-calendar-check" style="color: #60a5fa;"></i> 조회 대상 회차
                            </label>
                            <select id="admin1235ModalRoundSelect" onchange="window.onAdmin1235ModalRoundChange(this.value)" style="width: 100%; height: 34px; padding: 0 8px; background: #0f172a; border: 1px solid #334155; color: #fbbf24; border-radius: 6px; font-size: 0.8rem; font-weight: 800; outline: none;">
                                <!-- Options dynamically injected -->
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.72rem; color: #94a3b8; font-weight: 700; margin-bottom: 3px;">
                                <i class="fa-solid fa-users" style="color: #fbbf24;"></i> 조회 대상 회원
                            </label>
                            <select id="admin1235ModalUserSelect" onchange="window.onAdmin1235ModalUserChange(this.value)" style="width: 100%; height: 34px; padding: 0 8px; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; font-size: 0.8rem; font-weight: 700; outline: none;">
                                <!-- Options dynamically injected -->
                            </select>
                        </div>
                    </div>

                    <!-- Filter Pills (Visible when single user or pack filtered) -->
                    <div id="admin1235ModalFilterPills" style="display: flex; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px;">
                        <button type="button" class="admin1235-filter-btn active" data-filter="all" onclick="window.setAdmin1235ModalFilter('all')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 800; cursor: pointer; border: 1px solid #f59e0b; background: #f59e0b; color: #0f172a; white-space: nowrap;">전체 (70G)</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="v4" onclick="window.setAdmin1235ModalFilter('v4')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(139,92,246,0.4); background: rgba(139,92,246,0.15); color: #c4b5fd; white-space: nowrap;">V4.0 (10G)</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="v3" onclick="window.setAdmin1235ModalFilter('v3')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(59,130,246,0.4); background: rgba(59,130,246,0.15); color: #93c5fd; white-space: nowrap;">V3.0 (10G)</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="extra_1" onclick="window.setAdmin1235ModalFilter('extra_1')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(16,185,129,0.4); background: rgba(16,185,129,0.15); color: #6ee7b7; white-space: nowrap;">추가1팩</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="extra_2" onclick="window.setAdmin1235ModalFilter('extra_2')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(245,158,11,0.4); background: rgba(245,158,11,0.15); color: #fde047; white-space: nowrap;">추가2팩</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="extra_3" onclick="window.setAdmin1235ModalFilter('extra_3')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(139,92,246,0.4); background: rgba(139,92,246,0.15); color: #d8b4fe; white-space: nowrap;">추가3팩</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="extra_4" onclick="window.setAdmin1235ModalFilter('extra_4')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(6,182,212,0.4); background: rgba(6,182,212,0.15); color: #67e8f9; white-space: nowrap;">추가4팩</button>
                        <button type="button" class="admin1235-filter-btn" data-filter="extra_5" onclick="window.setAdmin1235ModalFilter('extra_5')" style="padding: 4px 8px; border-radius: 5px; font-size: 0.72rem; font-weight: 700; cursor: pointer; border: 1px solid rgba(236,72,153,0.4); background: rgba(236,72,153,0.15); color: #f472b6; white-space: nowrap;">추가5팩</button>
                    </div>
                </div>

                <!-- Modal Body (Scrollable Details) -->
                <div id="admin1235ModalBody" style="flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch;">
                    <!-- Content populated by renderAdmin1235ReviewModalContent -->
                </div>

                <!-- Modal Footer -->
                <div style="background: rgba(15, 23, 42, 0.95); padding: 10px 14px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div style="font-size: 0.72rem; color: #94a3b8;">
                        <i class="fa-solid fa-shield-halved" style="color: #10b981;"></i> 1235회~ 실구매 영수증 및 저장 기록 불변 무결성 검증 완료
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button type="button" onclick="window.shareAdmin1235ReviewAsImage && window.shareAdmin1235ReviewAsImage()" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 5px; box-shadow: 0 3px 10px rgba(16, 185, 129, 0.4);">
                            <i class="fa-solid fa-image"></i> 이미지 카톡/SNS 공유
                        </button>
                        <button type="button" onclick="window.shareAdmin1235ReviewToKakao && window.shareAdmin1235ReviewToKakao()" style="background: #fee500; color: #191919; border: none; padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 900; cursor: pointer; display: flex; align-items: center; gap: 5px; box-shadow: 0 3px 10px rgba(254, 229, 0, 0.35);">
                            <i class="fa-solid fa-comment"></i> 카톡 친구/방 공유
                        </button>
                        <button type="button" onclick="window.downloadAdmin1235ReviewImage && window.downloadAdmin1235ReviewImage()" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #e2e8f0; padding: 8px 12px; border-radius: 8px; font-size: 0.82rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-download"></i> 저장
                        </button>
                        <button type="button" onclick="document.getElementById('admin1235ReviewModal').style.display='none'" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #cbd5e1; padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 700; cursor: pointer;">
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Determine initial values
    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'master';
    _currentAdmin1235ModalUser = initialUser || reviewAdminViewingUser || 'all';
    
    const actualSelector = document.getElementById('reviewRoundSelector');
    _currentAdmin1235ModalRound = initialRound || (actualSelector ? actualSelector.value : 'all_rounds') || 'all_rounds';
    _currentAdmin1235ModalFilter = 'all';

    // Populate Round Options
    const roundSelect = document.getElementById('admin1235ModalRoundSelect');
    if (roundSelect) {
        const historyRounds = Object.keys(state.mergedHistory || {})
            .map(Number)
            .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
            .sort((a, b) => b - a);

        const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
        const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
            ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
            : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

        let roundOpts = `<option value="all_rounds" ${_currentAdmin1235ModalRound === 'all_rounds' ? 'selected' : ''}>📊 [전체] 1235회 ~ ${latestDrawnRound}회 누적 종합</option>`;
        for (let r = latestDrawnRound; r >= 1235; r--) {
            const draw = state.mergedHistory ? state.mergedHistory[r] : null;
            const dText = draw && (draw.date || draw.drwNoDate) ? ` (${draw.date || draw.drwNoDate})` : '';
            roundOpts += `<option value="${r}" ${String(_currentAdmin1235ModalRound) === String(r) ? 'selected' : ''}>제 ${r}회차${dText}</option>`;
        }
        roundSelect.innerHTML = roundOpts;
    }

    // Populate Member Options
    const userSelect = document.getElementById('admin1235ModalUserSelect');
    if (userSelect) {
        const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
        const registeredUsers = rawUsers.filter(u => {
            const uId = (u.id || '').trim().toLowerCase();
            return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
        });

        let userOpts = `<option value="all" ${_currentAdmin1235ModalUser === 'all' ? 'selected' : ''}>🌐 전체 회원 추천 종합 (${registeredUsers.length}명)</option>`;
        userOpts += `<option value="${rawAuth}" ${_currentAdmin1235ModalUser === rawAuth ? 'selected' : ''}>👑 관리자 본인 (${rawAuth})</option>`;
        registeredUsers.forEach(u => {
            if ((u.id || '').toLowerCase().trim() !== String(rawAuth).toLowerCase().trim()) {
                userOpts += `<option value="${u.id}" ${_currentAdmin1235ModalUser === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name || u.id})</option>`;
            }
        });
        userSelect.innerHTML = userOpts;
    }

    modal.style.display = 'flex';
    renderAdmin1235ReviewModalContent();
}

/**
 * 🔄 모달 회차 변경 이벤트
 */
window.onAdmin1235ModalRoundChange = function(val) {
    _currentAdmin1235ModalRound = val;
    renderAdmin1235ReviewModalContent();
};

/**
 * 🔄 모달 회원 변경 이벤트
 */
window.onAdmin1235ModalUserChange = function(val) {
    _currentAdmin1235ModalUser = val;
    const userSelect = document.getElementById('admin1235ModalUserSelect');
    if (userSelect) userSelect.value = val;
    renderAdmin1235ReviewModalContent();
};

/**
 * 🔄 모달에서 특정 회원 선택 바로가기
 */
window.selectAdmin1235ModalSpecificUser = function(userId) {
    window.onAdmin1235ModalUserChange(userId);
};

/**
 * 🔄 모달 알고리즘 필터 변경
 */
window.setAdmin1235ModalFilter = function(filterKey) {
    _currentAdmin1235ModalFilter = filterKey;
    const buttons = document.querySelectorAll('#admin1235ModalFilterPills .admin1235-filter-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-filter') === filterKey) {
            btn.style.background = '#f59e0b';
            btn.style.color = '#0f172a';
            btn.style.borderColor = '#f59e0b';
            btn.classList.add('active');
        } else {
            btn.style.background = 'rgba(255,255,255,0.06)';
            btn.style.color = '#cbd5e1';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
            btn.classList.remove('active');
        }
    });
    renderAdmin1235ReviewModalContent();
};

/**
 * 🎨 1235회차 모달 본문 콘텐츠 렌더링
 */
export function renderAdmin1235ReviewModalContent() {
    const body = document.getElementById('admin1235ModalBody');
    if (!body) return;

    const roundVal = _currentAdmin1235ModalRound;
    const userVal = _currentAdmin1235ModalUser || 'all';
    const filterKey = _currentAdmin1235ModalFilter || 'all';

    const historyRounds = Object.keys(state.mergedHistory || {})
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

    const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
    const registeredUsers = rawUsers.filter(u => {
        const uId = (u.id || '').trim().toLowerCase();
        return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
    });
    const baseList = (registeredUsers && registeredUsers.length > 0) ? registeredUsers : [{ id: 'master', name: '관리자' }];

    let html = '';

    if (roundVal === 'all_rounds') {
        // ==========================================
        // 1. [전체 회차 (1235~최신) 종합 리포트 모드]
        // ==========================================
        const validRounds = [];
        for (let rnd = latestDrawnRound; rnd >= 1235; rnd--) {
            if (state.mergedHistory && state.mergedHistory[rnd] && state.mergedHistory[rnd].numbers?.length === 6) {
                validRounds.push(rnd);
            }
        }
        if (validRounds.length === 0) validRounds.push(1235);

        let totalCombos = 0;
        let totalPrize = 0;
        let hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundSummaries = [];

        // Member Summary map across all rounds
        const memberAggMap = {};
        baseList.forEach(u => {
            memberAggMap[u.id] = {
                userId: u.id,
                realName: u.name || u.id,
                participatedRounds: 0,
                totalGames: 0,
                hits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                totalPrize: 0,
                totalWins: 0,
                totalInvest: 0,
                roi: 0
            };
        });

        validRounds.forEach(rnd => {
            const actualDraw = state.mergedHistory ? state.mergedHistory[rnd] : null;
            const drawDate = actualDraw && (actualDraw.date || actualDraw.drwNoDate) ? (actualDraw.date || actualDraw.drwNoDate) : '';
            const winningBalls = actualDraw && actualDraw.numbers ? actualDraw.numbers : [];
            const bonusBall = actualDraw ? actualDraw.bonus : null;

            let rGames = 0, rPrize = 0;
            let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

            if (userVal === 'all') {
                const activeUsers = baseList.filter(u => rnd >= getUserJoinRound(u.id));
                const targetUsers = activeUsers;
                targetUsers.forEach(u => {
                    const uRev = computeUser70RecommendationsReview(u.id, rnd);
                    rGames += uRev.totalGames;
                    rPrize += uRev.totalPrize;
                    for (let k = 1; k <= 5; k++) rHits[k] += uRev.grandHits[k];

                    const mAgg = memberAggMap[u.id];
                    if (mAgg) {
                        mAgg.participatedRounds++;
                        mAgg.totalGames += uRev.totalGames;
                        mAgg.totalPrize += uRev.totalPrize;
                        mAgg.totalWins += uRev.totalWins;
                        for (let k = 1; k <= 5; k++) mAgg.hits[k] += uRev.grandHits[k];
                    }
                });
            } else {
                const uRev = computeUser70RecommendationsReview(userVal, rnd);
                rGames = uRev.totalGames;
                rPrize = uRev.totalPrize;
                for (let k = 1; k <= 5; k++) rHits[k] = uRev.grandHits[k];
            }

            const rInvest = rGames * 1000;
            const rRoi = rInvest > 0 ? (rPrize / rInvest) * 100 : 0;
            const rWins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];

            totalCombos += rGames;
            totalPrize += rPrize;
            for (let k = 1; k <= 5; k++) hits[k] += rHits[k];

            roundSummaries.push({
                roundNum: rnd,
                date: drawDate,
                winningBalls,
                bonusBall,
                games: rGames,
                invest: rInvest,
                prize: rPrize,
                roi: rRoi,
                wins: rWins,
                hits: rHits
            });
        });

        const totalInvest = totalCombos * 1000;
        const totalRoi = totalInvest > 0 ? (totalPrize / totalInvest) * 100 : 0;

        const memberAggList = Object.values(memberAggMap).map(m => {
            m.totalInvest = m.totalGames * 1000;
            m.roi = m.totalInvest > 0 ? (m.totalPrize / m.totalInvest) * 100 : 0;
            return m;
        }).sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins || b.totalGames - a.totalGames);

        // KPI Summary Bar
        html += `
            <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 800; color: #fbbf24;">
                        <i class="fa-solid fa-chart-line"></i> 1235회 ~ ${latestDrawnRound}회 (${validRounds.length}개 회차) 누적 종합 성과
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px;">
                        대상: ${userVal === 'all' ? `전체 회원 (${baseList.length}명)` : userVal}
                    </span>
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px;">
                    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #94a3b8;">총 추천 게임수</div>
                        <div style="font-size: 0.95rem; font-weight: 900; color: #fff;">${totalCombos.toLocaleString()}게임</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #94a3b8;">총 추천 당첨금</div>
                        <div style="font-size: 0.95rem; font-weight: 900; color: #34d399;">+${totalPrize.toLocaleString()}원</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #94a3b8;">총 구매금 대비 환급률 (ROI)</div>
                        <div style="font-size: 0.95rem; font-weight: 900; color: #f59e0b;">${totalRoi.toFixed(1)}%</div>
                    </div>
                    <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 8px; text-align: center;">
                        <div style="font-size: 0.7rem; color: #94a3b8;">총 적중 건수</div>
                        <div style="font-size: 0.95rem; font-weight: 900; color: #60a5fa;">${(hits[1]+hits[2]+hits[3]+hits[4]+hits[5]).toLocaleString()}건</div>
                    </div>
                </div>

                <!-- Rank Chips -->
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 6px 4px; font-size: 0.72rem; font-weight: 800; text-align: center;">
                    <span style="color: #fbbf24;">1등: ${hits[1]}</span>
                    <span style="color: #f87171;">2등: ${hits[2]}</span>
                    <span style="color: #60a5fa;">3등: ${hits[3]}</span>
                    <span style="color: #34d399;">4등: ${hits[4]}</span>
                    <span style="color: #a78bfa;">5등: ${hits[5]}</span>
                </div>
            </div>
        `;

        // If 'all' users mode, display Member Ranking Table
        if (userVal === 'all' && memberAggList.length > 0) {
            html += `
                <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; margin-top: 4px;">
                    <div style="font-size: 0.82rem; font-weight: 800; color: #fbbf24; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span><i class="fa-solid fa-users"></i> 전체 회원별 1235회~ 누적 추천 성과 순위 (${memberAggList.length}명)</span>
                        <span style="font-size: 0.7rem; color: #94a3b8;">회원을 클릭하면 상세 70게임 성과 분석가 열립니다</span>
                    </div>
                    <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.76rem; text-align: center; white-space: nowrap;">
                            <thead>
                                <tr style="background: rgba(0,0,0,0.4); color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <th style="padding: 6px 4px;">순위</th>
                                    <th style="padding: 6px 6px; text-align: left;">회원 ID (이름)</th>
                                    <th style="padding: 6px 4px;">회차</th>
                                    <th style="padding: 6px 4px;">추천게임</th>
                                    <th style="padding: 6px 4px;">적중(1~5등)</th>
                                    <th style="padding: 6px 6px; text-align: right;">총 당첨금</th>
                                    <th style="padding: 6px 4px;">수익률</th>
                                    <th style="padding: 6px 4px;">조회</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            memberAggList.forEach((m, idx) => {
                const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `${idx + 1}`));
                const hitsSummary = `${m.hits[1] ? `<span style="color:#fbbf24;font-weight:900;">1등${m.hits[1]} ` : ''}${m.hits[2] ? `<span style="color:#f87171;font-weight:900;">2등${m.hits[2]} ` : ''}${m.hits[3] ? `<span style="color:#60a5fa;font-weight:900;">3등${m.hits[3]} ` : ''}${m.hits[4] ? `<span style="color:#34d399;">4등${m.hits[4]} ` : ''}${m.hits[5] ? `<span style="color:#a78bfa;">5등${m.hits[5]}` : ''}` || '<span style="color:#64748b;">0건</span>';
                const roiColor = m.roi >= 100 ? '#34d399' : (m.roi > 0 ? '#fbbf24' : '#94a3b8');

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 7px 4px; font-weight: 800; color: #fbbf24;">${rankBadge}</td>
                        <td style="padding: 7px 6px; text-align: left; font-weight: 700; color: #fff;">
                            ${m.userId} <span style="font-size: 0.68rem; color: #94a3b8;">(${m.realName})</span>
                        </td>
                        <td style="padding: 7px 4px; color: #cbd5e1;">${m.participatedRounds}회</td>
                        <td style="padding: 7px 4px; color: #cbd5e1;">${m.totalGames.toLocaleString()}G</td>
                        <td style="padding: 7px 4px; font-size: 0.72rem;">${hitsSummary}</td>
                        <td style="padding: 7px 6px; text-align: right; font-weight: 900; color: #34d399;">+${m.totalPrize.toLocaleString()}원</td>
                        <td style="padding: 7px 4px; font-weight: 800; color: ${roiColor};">${m.roi.toFixed(1)}%</td>
                        <td style="padding: 7px 4px;">
                            <button type="button" onclick="window.selectAdmin1235ModalSpecificUser('${m.userId}')" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.5); color: #fbbf24; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
                                상세보기
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // Round by Round Cards
        html += `
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: #cbd5e1; display: flex; justify-content: space-between; align-items: center;">
                    <span><i class="fa-solid fa-list-ol"></i> 회차별 상세 당첨 내역 (1235회 ~ ${latestDrawnRound}회)</span>
                    <span style="font-size: 0.7rem; color: #94a3b8;">회차 카드를 누르면 70게임 상세가 열립니다</span>
                </div>
        `;

        roundSummaries.forEach(rs => {
            const ballHtml = rs.winningBalls.map(n => {
                const hex = getBallHexColor(n);
                return `<span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:${hex}; color:#fff; font-weight:800; font-size:0.72rem; box-shadow:0 1px 4px rgba(0,0,0,0.4);">${n}</span>`;
            }).join('');
            const bonusHtml = rs.bonusBall ? `<span style="font-size:0.7rem; color:#94a3b8; margin:0 2px;">+</span><span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:${getBallHexColor(rs.bonusBall)}; color:#fff; font-weight:800; font-size:0.72rem; border:1.5px solid #fbbf24;">${rs.bonusBall}</span>` : '';

            html += `
                <div onclick="window.selectAdmin1235ModalSpecificRound(${rs.roundNum})" style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.25);" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-weight: 900; color: #fbbf24; font-size: 0.92rem;">제 ${rs.roundNum}회</span>
                            <span style="font-size: 0.72rem; color: #94a3b8;">(${rs.date})</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 0.74rem; font-weight: 800; color: #60a5fa; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); padding: 2px 6px; border-radius: 4px;">
                                적중 ${rs.wins}건
                            </span>
                            <span style="font-size: 0.88rem; font-weight: 900; color: #34d399;">
                                +${rs.prize.toLocaleString()}원
                            </span>
                            <i class="fa-solid fa-chevron-right" style="font-size: 0.72rem; color: #64748b;"></i>
                        </div>
                    </div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; background: rgba(0,0,0,0.25); padding: 5px 8px; border-radius: 6px;">
                        <div style="display: flex; align-items: center; gap: 3px;">
                            <span style="font-size: 0.68rem; color: #94a3b8; margin-right: 2px;">당첨:</span>
                            ${ballHtml}
                            ${bonusHtml}
                        </div>
                        <div style="font-size: 0.7rem; color: #cbd5e1; display: flex; gap: 6px; font-weight: 700;">
                            <span>1등:${rs.hits[1]}</span>
                            <span>2등:${rs.hits[2]}</span>
                            <span>3등:${rs.hits[3]}</span>
                            <span>4등:${rs.hits[4]}</span>
                            <span>5등:${rs.hits[5]}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;

    } else {
        // ==========================================
        // 2. [특정 단일 회차 추천 & 당첨 상세 모드]
        // ==========================================
        const targetRound = parseInt(roundVal);
        const actualDraw = state.mergedHistory ? state.mergedHistory[targetRound] : null;
        const drawDate = actualDraw && (actualDraw.date || actualDraw.drwNoDate) ? (actualDraw.date || actualDraw.drwNoDate) : '';
        const winningBalls = actualDraw && actualDraw.numbers ? actualDraw.numbers : [];
        const bonusBall = actualDraw ? actualDraw.bonus : null;
        const winningSet = new Set(winningBalls);

        // Header Draw Card
        const ballHtml = winningBalls.map(n => {
            const hex = getBallHexColor(n);
            return `<span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:${hex}; color:#fff; font-weight:900; font-size:0.8rem; box-shadow:0 2px 6px rgba(0,0,0,0.5);">${n}</span>`;
        }).join('');
        const bonusHtml = bonusBall ? `<span style="font-size:0.8rem; color:#94a3b8; margin:0 2px;">+</span><span style="display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:50%; background:${getBallHexColor(bonusBall)}; color:#fff; font-weight:900; font-size:0.8rem; border:2px solid #fbbf24; box-shadow:0 2px 6px rgba(0,0,0,0.5);">${bonusBall}</span>` : '';

        if (userVal === 'all') {
            // === ALL USERS AGGREGATION FOR SINGLE ROUND ===
            const activeUsers = baseList.filter(u => targetRound >= getUserJoinRound(u.id));
            const memberEvals = activeUsers.map(u => {
                const uRev = computeUser70RecommendationsReview(u.id, targetRound);
                return {
                    userId: u.id,
                    realName: u.name || u.id,
                    ...uRev
                };
            }).sort((a, b) => b.totalPrize - a.totalPrize || b.totalWins - a.totalWins);

            let gGames = 0, gPrize = 0;
            let gHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            memberEvals.forEach(m => {
                gGames += m.totalGames;
                gPrize += m.totalPrize;
                for (let k = 1; k <= 5; k++) gHits[k] += m.grandHits[k];
            });
            const gInvest = gGames * 1000;
            const gRoi = gInvest > 0 ? (gPrize / gInvest) * 100 : 0;

            html += `
                <div style="background: rgba(15, 23, 42, 0.9); border: 1.5px solid #f59e0b; border-radius: 12px; padding: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1rem; font-weight: 900; color: #fbbf24;">제 ${targetRound}회 공식 추첨 결과 &amp; 전체 회원 추천 종합</span>
                            <span style="font-size: 0.74rem; color: #94a3b8;">(${drawDate})</span>
                        </div>
                        <button type="button" onclick="window.selectAdmin1235ModalSpecificRound('all_rounds')" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; padding: 3px 8px; border-radius: 5px; font-size: 0.72rem; cursor: pointer;">
                            <i class="fa-solid fa-arrow-left"></i> 전체 회차 보기
                        </button>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(0,0,0,0.35); padding: 8px; border-radius: 8px; margin-bottom: 8px;">
                        ${ballHtml}
                        ${bonusHtml}
                    </div>

                    <!-- KPI Grid -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px;">
                        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: #94a3b8;">전체 추천 조합 / 참여 회원</div>
                            <div style="font-size: 0.88rem; font-weight: 800; color: #fff;">${gGames.toLocaleString()}게임 (${memberEvals.length}명)</div>
                        </div>
                        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: #94a3b8;">전체 당첨금 / 수익률</div>
                            <div style="font-size: 0.88rem; font-weight: 900; color: #34d399;">+${gPrize.toLocaleString()}원 (${gRoi.toFixed(1)}%)</div>
                        </div>
                    </div>

                    <!-- Rank Chips -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 6px 4px; font-size: 0.72rem; font-weight: 800; text-align: center;">
                        <span style="color: #fbbf24;">1등: ${gHits[1]}</span>
                        <span style="color: #f87171;">2등: ${gHits[2]}</span>
                        <span style="color: #60a5fa;">3등: ${gHits[3]}</span>
                        <span style="color: #34d399;">4등: ${gHits[4]}</span>
                        <span style="color: #a78bfa;">5등: ${gHits[5]}</span>
                    </div>
                </div>

                <!-- Member-by-Member Table for this Round -->
                <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px; margin-top: 4px;">
                    <div style="font-size: 0.82rem; font-weight: 800; color: #fbbf24; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span><i class="fa-solid fa-users"></i> 제 ${targetRound}회 회원별 추천 70게임 적중 성과표 (${memberEvals.length}명)</span>
                        <span style="font-size: 0.7rem; color: #94a3b8;">'70게임 보기'를 누르면 해당 회원의 70개 조합 상세가 열립니다</span>
                    </div>
                    <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.76rem; text-align: center; white-space: nowrap;">
                            <thead>
                                <tr style="background: rgba(0,0,0,0.4); color: #94a3b8; border-bottom: 1px solid rgba(255,255,255,0.1);">
                                    <th style="padding: 6px 4px;">순위</th>
                                    <th style="padding: 6px 6px; text-align: left;">회원 ID (이름)</th>
                                    <th style="padding: 6px 4px;">추천게임</th>
                                    <th style="padding: 6px 4px;">적중(1~5등)</th>
                                    <th style="padding: 6px 6px; text-align: right;">당첨금</th>
                                    <th style="padding: 6px 4px;">수익률</th>
                                    <th style="padding: 6px 4px;">액션</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            memberEvals.forEach((m, idx) => {
                const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `${idx + 1}`));
                const hitsSummary = `${m.grandHits[1] ? `<span style="color:#fbbf24;font-weight:900;">1등${m.grandHits[1]} ` : ''}${m.grandHits[2] ? `<span style="color:#f87171;font-weight:900;">2등${m.grandHits[2]} ` : ''}${m.grandHits[3] ? `<span style="color:#60a5fa;font-weight:900;">3등${m.grandHits[3]} ` : ''}${m.grandHits[4] ? `<span style="color:#34d399;">4등${m.grandHits[4]} ` : ''}${m.grandHits[5] ? `<span style="color:#a78bfa;">5등${m.grandHits[5]}` : ''}` || '<span style="color:#64748b;">0건</span>';
                const roiColor = m.roi >= 100 ? '#34d399' : (m.roi > 0 ? '#fbbf24' : '#94a3b8');

                html += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 7px 4px; font-weight: 800; color: #fbbf24;">${rankBadge}</td>
                        <td style="padding: 7px 6px; text-align: left; font-weight: 700; color: #fff;">
                            ${m.userId} <span style="font-size: 0.68rem; color: #94a3b8;">(${m.realName})</span>
                        </td>
                        <td style="padding: 7px 4px; color: #cbd5e1;">${m.totalGames}G</td>
                        <td style="padding: 7px 4px; font-size: 0.72rem;">${hitsSummary}</td>
                        <td style="padding: 7px 6px; text-align: right; font-weight: 900; color: #34d399;">+${m.totalPrize.toLocaleString()}원</td>
                        <td style="padding: 7px 4px; font-weight: 800; color: ${roiColor};">${m.roi.toFixed(1)}%</td>
                        <td style="padding: 7px 4px;">
                            <button type="button" onclick="window.selectAdmin1235ModalSpecificUser('${m.userId}')" style="background: rgba(245,158,11,0.2); border: 1px solid rgba(245,158,11,0.5); color: #fbbf24; padding: 2px 8px; border-radius: 4px; font-size: 0.68rem; font-weight: 800; cursor: pointer;">
                                70게임 보기
                            </button>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

        } else {
            // === SINGLE USER 70 GAMES DETAILED REVIEW ===
            const targetUser = userVal;
            const reviewData = computeUser70RecommendationsReview(targetUser, targetRound);

            html += `
                <div style="background: rgba(15, 23, 42, 0.9); border: 1.5px solid #f59e0b; border-radius: 12px; padding: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 1rem; font-weight: 900; color: #fbbf24;">👤 [${targetUser}] 제 ${targetRound}회 70게임 추천 성과</span>
                            <span style="font-size: 0.74rem; color: #94a3b8;">(${drawDate})</span>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <button type="button" onclick="window.onAdmin1235ModalUserChange('all')" style="background: rgba(245,158,11,0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 3px 8px; border-radius: 5px; font-size: 0.72rem; cursor: pointer; font-weight: 800;">
                                <i class="fa-solid fa-users"></i> 전체 회원 보기
                            </button>
                            <button type="button" onclick="window.selectAdmin1235ModalSpecificRound('all_rounds')" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; padding: 3px 8px; border-radius: 5px; font-size: 0.72rem; cursor: pointer;">
                                <i class="fa-solid fa-arrow-left"></i> 전체 회차
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(0,0,0,0.35); padding: 8px; border-radius: 8px; margin-bottom: 8px;">
                        ${ballHtml}
                        ${bonusHtml}
                    </div>

                    <!-- KPI Grid -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px;">
                        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: #94a3b8;">추천 조합 / 구매비용</div>
                            <div style="font-size: 0.88rem; font-weight: 800; color: #fff;">${reviewData.totalGames}게임 (${(reviewData.totalGames*1000).toLocaleString()}원)</div>
                        </div>
                        <div style="background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px; text-align: center;">
                            <div style="font-size: 0.7rem; color: #94a3b8;">총 당첨금 / 환급률</div>
                            <div style="font-size: 0.88rem; font-weight: 900; color: #34d399;">+${reviewData.totalPrize.toLocaleString()}원 (${reviewData.roi.toFixed(1)}%)</div>
                        </div>
                    </div>

                    <!-- Rank Chips -->
                    <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 6px 4px; font-size: 0.72rem; font-weight: 800; text-align: center;">
                        <span style="color: #fbbf24;">1등: ${reviewData.grandHits[1]}</span>
                        <span style="color: #f87171;">2등: ${reviewData.grandHits[2]}</span>
                        <span style="color: #60a5fa;">3등: ${reviewData.grandHits[3]}</span>
                        <span style="color: #34d399;">4등: ${reviewData.grandHits[4]}</span>
                        <span style="color: #a78bfa;">5등: ${reviewData.grandHits[5]}</span>
                    </div>
                </div>
            `;

            // Detailed Combos Sections (Filtered by Pack)
            const packsToRender = [];
            if (filterKey === 'all' || filterKey === 'v4') {
                packsToRender.push({
                    name: 'V4.0 심리 회피 추천 (10게임)',
                    badge: 'BEHAVIORAL QUANT',
                    color: '#8b5cf6',
                    evalData: reviewData.v4Eval
                });
            }
            if (filterKey === 'all' || filterKey === 'v3') {
                packsToRender.push({
                    name: 'V3.0 하이브리드 정통 수학 알고리즘 (10게임)',
                    badge: 'HYBRID MATH',
                    color: '#3b82f6',
                    evalData: reviewData.v3Eval
                });
            }
            (reviewData.extraPackEvals || []).forEach(ep => {
                const eKey = `extra_${ep.packId}`;
                if (filterKey === 'all' || filterKey === eKey) {
                    packsToRender.push({
                        name: ep.name || `추가팩 ${ep.packId}`,
                        badge: ep.badge || `EXTRA ${ep.packId}`,
                        color: ep.color || '#10b981',
                        evalData: ep.evalData
                    });
                }
            });

            html += `<div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">`;

            packsToRender.forEach(pack => {
                const pEval = pack.evalData;
                html += `
                    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid ${pack.color}50; border-radius: 10px; padding: 10px 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 6px; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="background: ${pack.color}25; color: ${pack.color}; border: 1px solid ${pack.color}60; font-size: 0.7rem; font-weight: 900; padding: 1px 6px; border-radius: 4px;">
                                    ${pack.badge}
                                </span>
                                <span style="font-weight: 800; font-size: 0.85rem; color: #fff;">${pack.name}</span>
                            </div>
                            <div style="font-size: 0.74rem; font-weight: 800; color: #34d399;">
                                적중 ${pEval.totalWins}건 (+${pEval.totalPrize.toLocaleString()}원)
                            </div>
                        </div>

                        <!-- Combos List -->
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                `;

                (pEval.items || []).forEach((item, cIdx) => {
                    const comboBalls = item.combo;
                    const matchCount = item.matchCount;
                    const hasBonus = item.hasBonus;
                    const rank = item.rank;
                    const prize = item.prize;

                    const ballBadges = comboBalls.map(num => {
                        const isHit = winningSet.has(num);
                        const isBonusHit = (num === bonusBall);
                        const hex = getBallHexColor(num);

                        if (isHit) {
                            return `<span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:${hex}; color:#fff; font-weight:900; font-size:0.72rem; box-shadow:0 0 6px ${hex}; border:1.5px solid #fff;">${num}</span>`;
                        } else if (isBonusHit) {
                            return `<span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:${hex}; color:#fff; font-weight:900; font-size:0.72rem; border:1.5px solid #fbbf24;">${num}</span>`;
                        } else {
                            return `<span style="display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,0.06); color:#64748b; font-weight:700; font-size:0.72rem; border:1px solid rgba(255,255,255,0.08);">${num}</span>`;
                        }
                    }).join('');

                    let rankBadge = `<span style="font-size:0.7rem; color:#64748b;">${matchCount}개 일치 (낙첨)</span>`;
                    if (rank === 1) rankBadge = `<span style="background:rgba(245,158,11,0.25); color:#fbbf24; border:1px solid #fbbf24; padding:2px 6px; border-radius:4px; font-weight:900; font-size:0.72rem;">🥇 1등 당첨 (+${prize.toLocaleString()}원)</span>`;
                    else if (rank === 2) rankBadge = `<span style="background:rgba(239,68,68,0.25); color:#f87171; border:1px solid #ef4444; padding:2px 6px; border-radius:4px; font-weight:900; font-size:0.72rem;">🥈 2등 당첨 (+${prize.toLocaleString()}원)</span>`;
                    else if (rank === 3) rankBadge = `<span style="background:rgba(59,130,246,0.25); color:#60a5fa; border:1px solid #3b82f6; padding:2px 6px; border-radius:4px; font-weight:900; font-size:0.72rem;">🥉 3등 당첨 (+${prize.toLocaleString()}원)</span>`;
                    else if (rank === 4) rankBadge = `<span style="background:rgba(16,185,129,0.25); color:#34d399; border:1px solid #10b981; padding:2px 6px; border-radius:4px; font-weight:800; font-size:0.72rem;">4등 당첨 (+50,000원)</span>`;
                    else if (rank === 5) rankBadge = `<span style="background:rgba(168,85,247,0.25); color:#c084fc; border:1px solid #a855f7; padding:2px 6px; border-radius:4px; font-weight:800; font-size:0.72rem;">5등 당첨 (+5,000원)</span>`;

                    html += `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.04); border-radius: 6px; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 0.7rem; font-weight: 800; color: #94a3b8; width: 22px;">[${String.fromCharCode(65 + cIdx)}]</span>
                                <div style="display: flex; gap: 3px;">
                                    ${ballBadges}
                                </div>
                            </div>
                            <div>
                                ${rankBadge}
                            </div>
                        </div>
                    `;
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += `</div>`;
        }
    }

    body.innerHTML = html;
}

/**
 * 🔄 특정 회차를 모달 셀렉터에서 즉시 선택
 */
window.selectAdmin1235ModalSpecificRound = function(rnd) {
    _currentAdmin1235ModalRound = String(rnd);
    const sel = document.getElementById('admin1235ModalRoundSelect');
    if (sel) sel.value = String(rnd);
    renderAdmin1235ReviewModalContent();
};

/**
 * 💬 [카카오톡 리포트 공유]
 * 1235회차별 추천 및 당첨 성과를 카카오톡(나와의 채팅방 또는 대화상대)으로 즉시 전송
 */
export async function shareAdmin1235ReviewToKakao() {
    const roundVal = _currentAdmin1235ModalRound;
    const userVal = _currentAdmin1235ModalUser || 'all';

    const historyRounds = Object.keys(state.mergedHistory || {})
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

    const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
    const registeredUsers = rawUsers.filter(u => {
        const uId = (u.id || '').trim().toLowerCase();
        return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
    });
    const baseList = (registeredUsers && registeredUsers.length > 0) ? registeredUsers : [{ id: 'master', name: '관리자' }];

    let titleText = '';
    let bodyText = '';

    if (roundVal === 'all_rounds') {
        const userJoinRound = (userVal !== 'all' && !isAdminUser(userVal)) ? getUserJoinRound(userVal) : 1235;
        const minTargetRound = Math.max(1235, userJoinRound);
        const validRounds = [];
        for (let rnd = latestDrawnRound; rnd >= minTargetRound; rnd--) {
            if (state.mergedHistory && state.mergedHistory[rnd] && state.mergedHistory[rnd].numbers?.length === 6) {
                validRounds.push(rnd);
            }
        }

        let totalCombos = 0, totalPrize = 0;
        let hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundLines = [];

        validRounds.forEach(rnd => {
            let rGames = 0, rPrize = 0;
            let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

            if (userVal === 'all') {
                const activeUsers = baseList.filter(u => rnd >= getUserJoinRound(u.id));
                const targetUsers = activeUsers;
                targetUsers.forEach(u => {
                    const uRev = computeUser70RecommendationsReview(u.id, rnd);
                    rGames += uRev.totalGames;
                    rPrize += uRev.totalPrize;
                    for (let k = 1; k <= 5; k++) rHits[k] += uRev.grandHits[k];
                });
            } else {
                const uRev = computeUser70RecommendationsReview(userVal, rnd);
                rGames = uRev.totalGames;
                rPrize = uRev.totalPrize;
                for (let k = 1; k <= 5; k++) rHits[k] = uRev.grandHits[k];
            }

            totalCombos += rGames;
            totalPrize += rPrize;
            for (let k = 1; k <= 5; k++) hits[k] += rHits[k];
            
            const wins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];
            roundLines.push(`• 제 ${rnd}회: 적중 ${wins}건 (+${rPrize.toLocaleString()}원)`);
        });

        const totalInvest = totalCombos * 1000;
        const totalRoi = totalInvest > 0 ? (totalPrize / totalInvest) * 100 : 0;

        const startRndLabel = (userVal === 'all' ? 1235 : minTargetRound);
        titleText = `🎰 [운도실력] 제 ${startRndLabel}회~${latestDrawnRound}회 로또 AI 추천·당첨 성과 종합 리포트`;
        bodyText = `[${startRndLabel}회~${latestDrawnRound}회 (${validRounds.length}개 회차) 누적 성과]
🎯 대상: ${userVal === 'all' ? `전체 회원 종합 (${baseList.length}명)` : userVal}
💰 총 당첨금: +${totalPrize.toLocaleString()}원 (ROI: ${totalRoi.toFixed(1)}%)
🏆 등수별 적중: 1등 ${hits[1]}회, 2등 ${hits[2]}회, 3등 ${hits[3]}회, 4등 ${hits[4]}회, 5등 ${hits[5]}회

[회차별 요약]
${roundLines.slice(0, 6).join('\n')}

💡 빅데이터 AI 추천 알고리즘 실시간 분석 시스템`;
    } else {
        const targetRound = parseInt(roundVal);
        const actualDraw = state.mergedHistory ? state.mergedHistory[targetRound] : null;
        const winningBalls = actualDraw && actualDraw.numbers ? actualDraw.numbers.join(', ') : '미추첨';
        const bonusBall = actualDraw ? ` + 보너스 ${actualDraw.bonus}` : '';

        let rGames = 0, rPrize = 0;
        let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        if (userVal === 'all') {
            const activeUsers = baseList.filter(u => targetRound >= getUserJoinRound(u.id));
            const targetUsers = activeUsers;
            targetUsers.forEach(u => {
                const uRev = computeUser70RecommendationsReview(u.id, targetRound);
                rGames += uRev.totalGames;
                rPrize += uRev.totalPrize;
                for (let k = 1; k <= 5; k++) rHits[k] += uRev.grandHits[k];
            });
        } else {
            const uRev = computeUser70RecommendationsReview(userVal, targetRound);
            rGames = uRev.totalGames;
            rPrize = uRev.totalPrize;
            for (let k = 1; k <= 5; k++) rHits[k] = uRev.grandHits[k];
        }

        const wins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];
        const rInvest = rGames * 1000;
        const rRoi = rInvest > 0 ? (rPrize / rInvest) * 100 : 0;

        titleText = `🎰 [운도실력] 제 ${targetRound}회 로또 AI 추천·당첨 성과 리포트`;
        bodyText = `[제 ${targetRound}회 공식 당첨번호]
• ${winningBalls}${bonusBall}

[추천 성과]
🎯 대상: ${userVal === 'all' ? `전체 회원 종합 (${baseList.length}명)` : userVal}
💰 당첨금: +${rPrize.toLocaleString()}원 (수익률: ${rRoi.toFixed(1)}%)
🏆 적중: 총 ${wins}건 (1등:${rHits[1]}, 2등:${rHits[2]}, 3등:${rHits[3]}, 4등:${rHits[4]}, 5등:${rHits[5]})

💡 7대 AI 추천 알고리즘 전체 매칭 완료`;
    }

    const fullMessage = `${titleText}\n\n${bodyText}`;

    // 1. Copy to clipboard
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullMessage);
        }
    } catch(e) {}

    const shareUrl = window.location.origin + window.location.pathname;

    // Ensure Kakao SDK initialized
    if (typeof window !== 'undefined' && window.Kakao) {
        if (!window.Kakao.isInitialized()) {
            try {
                window.Kakao.init('c40e8adc700a6f1c1e62b6aa3fa0c60a');
            } catch(e) {}
        }
    }

    // Kakao Talk Friend & Chatroom Picker Share (sendDefault)
    const kakaoShareData = {
        objectType: 'feed',
        content: {
            title: titleText,
            description: `💰 당첨금: +${rPrize.toLocaleString()}원 (${rRoi.toFixed(1)}%)\n🏆 적중: 총 ${wins}건 (1등:${rHits[1]}, 2등:${rHits[2]}, 3등:${rHits[3]}, 4등:${rHits[4]}, 5등:${rHits[5]})\n🎯 대상: ${userVal === 'all' ? `전체 회원 (${baseList.length}명)` : userVal}`,
            imageUrl: 'https://wook2100.github.io/lucky777/icons/icon-512.png',
            link: {
                mobileWebUrl: shareUrl,
                webUrl: shareUrl
            }
        },
        buttons: [
            {
                title: '📊 추천성과 분석 확인하기',
                link: {
                    mobileWebUrl: shareUrl,
                    webUrl: shareUrl
                }
            }
        ]
    };

    if (window.Kakao && window.Kakao.Share && typeof window.Kakao.Share.sendDefault === 'function') {
        window.Kakao.Share.sendDefault(kakaoShareData);
        showToast('💬 카카오톡 공유 창이 열렸습니다. 원하는 친구/대화방을 선택하세요!');
    } else if (window.Kakao && window.Kakao.Link && typeof window.Kakao.Link.sendDefault === 'function') {
        window.Kakao.Link.sendDefault(kakaoShareData);
        showToast('💬 카카오톡 공유 창이 열렸습니다. 원하는 친구/대화방을 선택하세요!');
    } else if (navigator.share) {
        try {
            await navigator.share({
                title: titleText,
                text: `${titleText}\n\n${fullMessage}`,
                url: shareUrl
            });
        } catch(e) {}
    } else {
        await copyAdmin1235ReviewText();
        alert('📋 리포트가 클립보드에 복사되었습니다!\n카카오톡 대화방에 붙여넣기(Ctrl+V)하여 다른 분들과 공유하세요.');
    }
}

/**
 * 🎨 1235회차 추천성과 분석 전용 무손실 고화질 캔버스 생성기
 * - 스크롤 제한(max-height / overflow: hidden) 및 스크롤 위치(scrollY)로 인한 상하단 잘림 현상을 100% 원천 해결
 * - 독립된 오프스크린 컨테이너에서 100% 전장(Full Height) 고해상도 렌더링
 */
async function createAdmin1235ReportCanvas() {
    const modalBody = document.getElementById('admin1235ModalBody');
    if (!modalBody) return null;

    if (typeof html2canvas !== 'function') {
        throw new Error('html2canvas 라이브러리가 로드되지 않았습니다.');
    }

    const roundVal = _currentAdmin1235ModalRound;
    const userVal = _currentAdmin1235ModalUser || 'all';
    const roundTitle = (roundVal === 'all_rounds') ? '1235회 ~ 최신 누적 종합' : `제 ${roundVal}회`;
    const userTitle = (userVal === 'all') ? '전체 회원' : userVal;

    // Create a standalone off-screen card container with unconstrained height
    const offscreenWrapper = document.createElement('div');
    offscreenWrapper.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 680px;
        max-width: 680px;
        background: linear-gradient(145deg, #0b1329 0%, #1e293b 100%);
        border: 2px solid #f59e0b;
        border-radius: 16px;
        padding: 20px;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Noto Sans KR', sans-serif;
        box-sizing: border-box;
        overflow: visible;
        height: auto;
        z-index: -9999;
    `;

    // Header Card
    const headerHtml = `
        <div style="background: rgba(15, 23, 42, 0.95); border-bottom: 1.5px solid rgba(245, 158, 11, 0.4); padding: 12px 14px; border-radius: 12px 12px 0 0; margin: -20px -20px 16px -20px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 1.2rem; border: 1.5px solid rgba(245, 158, 11, 0.5);">
                    👑
                </span>
                <div>
                    <h2 style="margin: 0; color: #fbbf24; font-size: 1.15rem; font-weight: 900; letter-spacing: -0.3px;">
                        운도실력 로또 AI AI 분석 추천성과 분석
                    </h2>
                    <div style="font-size: 0.74rem; color: #94a3b8; margin-top: 2px;">
                        ${roundTitle} 추천·당첨 성과 분석 [대상: ${userTitle}]
                    </div>
                </div>
            </div>
            <div style="text-align: right;">
                <span style="display: inline-block; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 4px;">
                    공식 검증 완료
                </span>
            </div>
        </div>
    `;

    // Footer Card
    const footerHtml = `
        <div style="margin: 16px -20px -20px -20px; padding: 12px 16px; background: rgba(15, 23, 42, 0.95); border-top: 1px solid rgba(255, 255, 255, 0.1); border-radius: 0 0 12px 12px; display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; color: #94a3b8;">
            <div>
                🛡️ 1235회~ 실구매 영수증 및 저장 기록 불변 무결성 검증
            </div>
            <div style="color: #fbbf24; font-weight: 700;">
                운도실력 777 (wook2100.github.io/lucky777)
            </div>
        </div>
    `;

    offscreenWrapper.innerHTML = headerHtml + modalBody.innerHTML + footerHtml;
    document.body.appendChild(offscreenWrapper);

    try {
        const canvas = await html2canvas(offscreenWrapper, {
            backgroundColor: '#0b1329',
            scale: 2, // 2x Retina ultra-crisp resolution
            useCORS: true,
            logging: false,
            scrollY: 0,
            scrollX: 0,
            windowWidth: 700
        });
        return canvas;
    } finally {
        if (offscreenWrapper.parentNode) {
            offscreenWrapper.parentNode.removeChild(offscreenWrapper);
        }
    }
}

/**
 * 🖼️ [리포트 이미지로 카카오톡/SNS 공유]
 * 모달 리포트를 전장(Full Height) 고화질 PNG 이미지로 변환 후, 모바일에서는 카카오톡/SNS 대화방으로 이미지 직접 전송,
 * PC에서는 클립보드 복사(Ctrl+V 붙여넣기 지원) 및 이미지 자동 저장을 실행
 */
export async function shareAdmin1235ReviewAsImage() {
    showToast('🎨 고화질 리포트 이미지를 생성하는 중입니다...');

    try {
        const canvas = await createAdmin1235ReportCanvas();
        if (!canvas) {
            alert('⚠️ 이미지 생성 도구를 불러오는 중입니다. 1~2초 후 다시 눌러주세요.');
            return;
        }

        const roundVal = _currentAdmin1235ModalRound;
        const fileName = `운도실력_1235회차_추천성과분석_${roundVal === 'all_rounds' ? '누적종합' : roundVal + '회'}.png`;

        canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], fileName, { type: 'image/png' });

            // 1. Mobile Native Share: allows sending image file directly into KakaoTalk chatroom
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: '🎰 운도실력 1235회~ 추천·당첨 성과 분석',
                        text: `🎰 [운도실력] 1235회~ 로또 AI 추천·당첨 성과 리포트 카드입니다.`
                    });
                    showToast('✅ 카카오톡 등 원하는 대화방에 이미지가 공유되었습니다!');
                    return;
                } catch(shareErr) {
                    if (shareErr.name === 'AbortError') return;
                    console.warn('[Native Share Error]', shareErr);
                }
            }

            // 2. Desktop Clipboard Copy: allows pasting (Ctrl+V) directly in KakaoTalk PC
            let clipSuccess = false;
            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    const item = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([item]);
                    clipSuccess = true;
                    showToast('🖼️ 리포트 이미지가 클립보드에 복사되었습니다! 카카오톡 채팅방에 Ctrl+V로 붙여넣으세요.');
                }
            } catch(clipErr) {
                console.warn('[Clipboard Image Copy Error]', clipErr);
            }

            // 3. Save / Download
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 1000);

            if (!clipSuccess) {
                showToast('💾 리포트 이미지가 다운로드되었습니다! 카카오톡에 첨부해 보세요.');
            }
        }, 'image/png');

    } catch(err) {
        console.error('[shareAdmin1235ReviewAsImage Error]', err);
        alert('⚠️ 이미지 생성 중 오류가 발생했습니다: ' + err.message);
    }
}

/**
 * 💾 [리포트 이미지 파일 다운로드]
 */
export async function downloadAdmin1235ReviewImage() {
    showToast('💾 이미지를 저장하는 중입니다...');
    try {
        const canvas = await createAdmin1235ReportCanvas();
        if (!canvas) {
            alert('⚠️ 이미지 생성 도구를 불러오는 중입니다. 1~2초 후 다시 눌러주세요.');
            return;
        }

        const roundVal = _currentAdmin1235ModalRound;
        const fileName = `운도실력_1235회차_추천성과분석_${roundVal === 'all_rounds' ? '누적종합' : roundVal + '회'}.png`;

        canvas.toBlob((blob) => {
            if (!blob) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (a.parentNode) a.parentNode.removeChild(a);
                URL.revokeObjectURL(a.href);
            }, 1000);
            showToast('💾 리포트 이미지가 기기에 저장되었습니다!');
        }, 'image/png');
    } catch(err) {
        alert('⚠️ 이미지 다운로드 실패: ' + err.message);
    }
}

/**
 * 📋 [리포트 텍스트 복사]
 */
export async function copyAdmin1235ReviewText() {
    const roundVal = _currentAdmin1235ModalRound;
    const userVal = _currentAdmin1235ModalUser || 'all';

    const historyRounds = Object.keys(state.mergedHistory || {})
        .map(Number)
        .filter(n => !isNaN(n) && n >= 1 && state.mergedHistory[n]?.numbers?.length === 6)
        .sort((a, b) => b - a);

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1240;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, (historyRounds[0] || fallbackLatest))
        : (historyRounds[0] || state.latestRoundNum || fallbackLatest);

    const rawUsers = state.allRegisteredUsersList || Object.keys(state.allUsersPurchasesMap || {}).map(id => ({ id, name: id }));
    const registeredUsers = rawUsers.filter(u => {
        const uId = (u.id || '').trim().toLowerCase();
        return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'pjg' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
    });
    const baseList = (registeredUsers && registeredUsers.length > 0) ? registeredUsers : [{ id: 'master', name: '관리자' }];

    let fullText = '';
    if (roundVal === 'all_rounds') {
        const userJoinRound = (userVal !== 'all' && !isAdminUser(userVal)) ? getUserJoinRound(userVal) : 1235;
        const minTargetRound = Math.max(1235, userJoinRound);
        const validRounds = [];
        for (let rnd = latestDrawnRound; rnd >= minTargetRound; rnd--) {
            if (state.mergedHistory && state.mergedHistory[rnd] && state.mergedHistory[rnd].numbers?.length === 6) {
                validRounds.push(rnd);
            }
        }
        let totalCombos = 0, totalPrize = 0;
        let hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundLines = [];

        validRounds.forEach(rnd => {
            let rGames = 0, rPrize = 0;
            let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

            if (userVal === 'all') {
                const activeUsers = baseList.filter(u => rnd >= getUserJoinRound(u.id));
                const targetUsers = activeUsers;
                targetUsers.forEach(u => {
                    const uRev = computeUser70RecommendationsReview(u.id, rnd);
                    rGames += uRev.totalGames;
                    rPrize += uRev.totalPrize;
                    for (let k = 1; k <= 5; k++) rHits[k] += uRev.grandHits[k];
                });
            } else {
                const uRev = computeUser70RecommendationsReview(userVal, rnd);
                rGames = uRev.totalGames;
                rPrize = uRev.totalPrize;
                for (let k = 1; k <= 5; k++) rHits[k] = uRev.grandHits[k];
            }

            totalCombos += rGames;
            totalPrize += rPrize;
            for (let k = 1; k <= 5; k++) hits[k] += rHits[k];
            const wins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];
            roundLines.push(`• 제 ${rnd}회: 적중 ${wins}건 (+${rPrize.toLocaleString()}원)`);
        });

        const totalInvest = totalCombos * 1000;
        const totalRoi = totalInvest > 0 ? (totalPrize / totalInvest) * 100 : 0;

        const startRndLabel = (userVal === 'all' ? 1235 : minTargetRound);
        fullText = `🎰 [운도실력] 제 ${startRndLabel}회~${latestDrawnRound}회 로또 AI 추천·당첨 성과 종합 리포트
=========================================
🎯 대상: ${userVal === 'all' ? `전체 회원 종합 (${baseList.length}명)` : userVal}
💰 총 당첨금: +${totalPrize.toLocaleString()}원 (ROI: ${totalRoi.toFixed(1)}%)
🏆 등수별 적중: 1등 ${hits[1]}회, 2등 ${hits[2]}회, 3등 ${hits[3]}회, 4등 ${hits[4]}회, 5등 ${hits[5]}회

[회차별 요약]
${roundLines.join('\n')}
=========================================
운도실력 빅데이터 AI 데이터 분석 시스템 (https://wook2100.github.io/lucky777/)`;
    } else {
        const targetRound = parseInt(roundVal);
        const actualDraw = state.mergedHistory ? state.mergedHistory[targetRound] : null;
        const winningBalls = actualDraw && actualDraw.numbers ? actualDraw.numbers.join(', ') : '미추첨';
        const bonusBall = actualDraw ? ` + 보너스 ${actualDraw.bonus}` : '';

        let rGames = 0, rPrize = 0;
        let rHits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        if (userVal === 'all') {
            const activeUsers = baseList.filter(u => targetRound >= getUserJoinRound(u.id));
            const targetUsers = activeUsers;
            targetUsers.forEach(u => {
                const uRev = computeUser70RecommendationsReview(u.id, targetRound);
                rGames += uRev.totalGames;
                rPrize += uRev.totalPrize;
                for (let k = 1; k <= 5; k++) rHits[k] += uRev.grandHits[k];
            });
        } else {
            const uRev = computeUser70RecommendationsReview(userVal, targetRound);
            rGames = uRev.totalGames;
            rPrize = uRev.totalPrize;
            for (let k = 1; k <= 5; k++) rHits[k] = uRev.grandHits[k];
        }

        const wins = rHits[1] + rHits[2] + rHits[3] + rHits[4] + rHits[5];
        const rInvest = rGames * 1000;
        const rRoi = rInvest > 0 ? (rPrize / rInvest) * 100 : 0;

        fullText = `🎰 [운도실력] 제 ${targetRound}회 로또 AI 추천·당첨 성과 리포트
=========================================
[제 ${targetRound}회 공식 당첨번호]
• ${winningBalls}${bonusBall}

[추천 성과]
🎯 대상: ${userVal === 'all' ? `전체 회원 종합 (${baseList.length}명)` : userVal}
💰 당첨금: +${rPrize.toLocaleString()}원 (수익률: ${rRoi.toFixed(1)}%)
🏆 적중: 총 ${wins}건 (1등:${rHits[1]}, 2등:${rHits[2]}, 3등:${rHits[3]}, 4등:${rHits[4]}, 5등:${rHits[5]})
=========================================
운도실력 빅데이터 AI 데이터 분석 시스템 (https://wook2100.github.io/lucky777/)`;
    }

    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullText);
            showToast('📋 리포트 텍스트가 클립보드에 복사되었습니다!');
        } else {
            prompt('리포트 텍스트를 복사하세요:', fullText);
        }
    } catch(e) {
        prompt('리포트 텍스트를 복사하세요:', fullText);
    }
}

if (typeof window !== 'undefined') {
    window.renderReviewTab = renderReviewTab;
    window.renderReviewDetail = renderReviewDetail;
    window.renderAllRoundsReviewDetail = renderAllRoundsReviewDetail;
    window.selectSpecificReviewRound = selectSpecificReviewRound;
    window.changeReviewAdminUser = changeReviewAdminUser;
    window.computeUser70RecommendationsReview = computeUser70RecommendationsReview;
    window.updateReviewRoundSelector = updateReviewRoundSelector;
    window.exportImmutableUnifiedArchive = exportImmutableUnifiedArchive;
    window.importImmutableUnifiedArchive = importImmutableUnifiedArchive;
    window.openAdmin1235ReviewModal = openAdmin1235ReviewModal;
    window.renderAdmin1235ReviewModalContent = renderAdmin1235ReviewModalContent;
    window.selectAdmin1235ModalSpecificUser = selectAdmin1235ModalSpecificUser;
    window.shareAdmin1235ReviewToKakao = shareAdmin1235ReviewToKakao;
    window.shareAdmin1235ReviewAsImage = shareAdmin1235ReviewAsImage;
    window.downloadAdmin1235ReviewImage = downloadAdmin1235ReviewImage;
    window.copyAdmin1235ReviewText = copyAdmin1235ReviewText;
}
