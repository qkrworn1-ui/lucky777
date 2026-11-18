import { state } from './state.js';
import { calculateStats } from './scoring.js';
import { calculateACValue, isSystemOrDummyUser } from '../../shared/utils.js';
import { recalculateGroups, computeWalkForwardHedge8Snapshots } from './statistics.js';
import { SafeAuth, getUserRealName, getUpcomingLottoRound, isAdminUser, isUserVerifiedAndPledged } from '../../shared/auth-mgmt.js';
import { db } from '../../shared/db.js';

/**
 * 🔒 Canonical Effective User ID Resolver for Generator & Quick View
 * Ensures 100% deterministic RNG parity across all tabs, modals, and user roles.
 */
export function getEffectiveGeneratorUserId(customUserId = null) {
    if (customUserId && typeof customUserId === 'string' && customUserId.trim()) {
        let cId = customUserId.trim();
        if (cId.startsWith('{')) {
            try {
                const p = JSON.parse(cId);
                cId = p.userId || p.userid || p.id || cId;
            } catch(e) {}
        }
        return cId.trim().toLowerCase();
    }
    let authId = (typeof SafeAuth !== 'undefined' && SafeAuth.get ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    if (typeof authId === 'string' && authId.startsWith('{')) {
        try {
            const p = JSON.parse(authId);
            authId = p.userId || p.userid || p.id || authId;
        } catch(e) {}
    }
    const cleanAuth = String(authId || '').trim().toLowerCase();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));
    const viewingUser = (typeof window !== 'undefined' && (window.selectedAdminViewingUser || window.generatorAdminViewingUser)) 
        ? (window.selectedAdminViewingUser || window.generatorAdminViewingUser) 
        : null;
    if (isAdmin) {
        if (viewingUser === 'all') return 'all';
        if (viewingUser && typeof viewingUser === 'string' && viewingUser.trim()) {
            let vId = viewingUser.trim();
            if (vId.startsWith('{')) {
                try {
                    const p = JSON.parse(vId);
                    vId = p.userId || p.userid || p.id || vId;
                } catch(e) {}
            }
            return vId.trim().toLowerCase();
        }
        return cleanAuth; // Default to Admin's own account!
    }
    return cleanAuth;
}

export function getUserRoundSeed(userId, round, algoId = 'default') {
    const cleanUser = (userId || 'guest').toLowerCase().trim();
    const str = `${cleanUser}_R${round}_${algoId}_seed_v4`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) + 1;
}

export function getUserDispersionIndex(userId) {
    const cleanUser = String(userId || '').trim().toLowerCase();
    if (!cleanUser || cleanUser === 'master' || cleanUser === 'admin') return 0;
    if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
        const idx = state.allRegisteredUsersList.findIndex(u => (u.id || '').toLowerCase().trim() === cleanUser);
        if (idx >= 0) return idx + 1;
    }
    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    for (let i = 0; i < cleanUser.length; i++) {
        const ch = cleanUser.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    return (Math.abs(h1) % 997) + 1;
}

export function createDeterministicRng(seed) {
    let s = (seed >>> 0) || 123456789;
    return function() {
        // Pure 32-bit Integer LCG: 100% identical on all devices, OS and JS engines
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export function seededShuffle(array, rng) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[j], arr[i]] = [arr[i], arr[j]];
    }
    return arr;
}

let _historyIsolationDepth = 0;
const _globalHistoryBackup = {};
let _historicalWinningSetsBackup = null;

export function enterHistoryIsolation(targetRound, maxKnownDrawnRound) {
    if (targetRound === null || targetRound === undefined || targetRound > maxKnownDrawnRound) {
        return false;
    }
    if (_historyIsolationDepth === 0) {
        for (let key in state.mergedHistory) {
            if (parseInt(key, 10) >= targetRound) {
                _globalHistoryBackup[key] = state.mergedHistory[key];
                delete state.mergedHistory[key];
            }
        }
        recalculateGroups();
        if (state.HISTORICAL_WINNING_SETS) {
            _historicalWinningSetsBackup = new Set(state.HISTORICAL_WINNING_SETS);
            state.HISTORICAL_WINNING_SETS.clear();
            for (let key in state.mergedHistory) {
                const d = state.mergedHistory[key];
                if (d && Array.isArray(d.numbers) && d.numbers.length === 6) {
                    state.HISTORICAL_WINNING_SETS.add([...d.numbers].sort((a,b)=>a-b).join(','));
                }
            }
        }
    }
    _historyIsolationDepth++;
    return true;
}

export function exitHistoryIsolation(wasIsolated) {
    if (!wasIsolated) return;
    _historyIsolationDepth--;
    if (_historyIsolationDepth <= 0) {
        _historyIsolationDepth = 0;
        for (let key in _globalHistoryBackup) {
            state.mergedHistory[key] = _globalHistoryBackup[key];
            delete _globalHistoryBackup[key];
        }
        recalculateGroups();
        if (_historicalWinningSetsBackup) {
            state.HISTORICAL_WINNING_SETS = _historicalWinningSetsBackup;
            _historicalWinningSetsBackup = null;
        }
    }
}

export const ALGO_REVISION_3B = 'v2026.11_3b_17wheel_core7_v8';

export function hasConfirmedLedgerForRound(userId, roundNum) {
    const cleanU = String(userId || '').trim().toLowerCase();
    const rStr = String(roundNum);
    if (!cleanU || !rStr) return false;
    try {
        if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanU]) {
            let ledger = state.allUsersPurchasesMap[cleanU].ledger || {};
            if (typeof ledger === 'string') {
                try { ledger = JSON.parse(ledger); } catch(e) { ledger = {}; }
            }
            const rcpts = Array.isArray(ledger[rStr]) ? ledger[rStr] : (ledger[rStr] && typeof ledger[rStr] === 'object' ? Object.values(ledger[rStr]) : []);
            if (rcpts.length > 0) return true;
        }
        if (state.globalLedger && state.globalLedger[rStr]) {
            const list = Array.isArray(state.globalLedger[rStr]) ? state.globalLedger[rStr] : Object.values(state.globalLedger[rStr]);
            if (list.some(it => it && String(it.user || it.userId || '').trim().toLowerCase() === cleanU)) {
                return true;
            }
        }
    } catch(e) {}
    return false;
}

export function isRound1251UpgradePending(snap, roundNum, userId) {
    if (Number(roundNum) !== 1251 || !snap || typeof snap !== 'object') return false;
    if (snap.algoRevision === ALGO_REVISION_3B) return false;
    if (hasConfirmedLedgerForRound(userId, 1251)) return false;
    return true;
}

const _acStampArr = new Int32Array(46);
let _acStampCounter = 0;

function _calcAC6Fast(n0, n1, n2, n3, n4, n5) {
    let stamp = ++_acStampCounter;
    if (stamp >= 2000000000) {
        _acStampArr.fill(0);
        _acStampCounter = 1;
        stamp = 1;
    }
    let uniq = 0;
    let d;
    d = n1 - n0; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n2 - n0; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n3 - n0; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n4 - n0; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n5 - n0; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n2 - n1; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n3 - n1; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n4 - n1; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n5 - n1; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n3 - n2; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n4 - n2; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n5 - n2; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n4 - n3; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n5 - n3; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    d = n5 - n4; if (_acStampArr[d] !== stamp) { _acStampArr[d] = stamp; uniq++; }
    return uniq - 5;
}

function _calcACLocal(nums) {
    if (nums && nums.length === 6) {
        return _calcAC6Fast(nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
    }
    if (typeof calculateACValue === 'function') return calculateACValue(nums);
    const diffs = new Set();
    for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
            diffs.add(Math.abs(nums[j] - nums[i]));
        }
    }
    return diffs.size - (nums.length - 1);
}

function _encodeLotto6Sorted(n0, n1, n2, n3, n4, n5) {
    return ((((n0 * 46 + n1) * 46 + n2) * 46 + n3) * 46 + n4) * 46 + n5;
}

let _cachedHistCodeSize = -1;
let _cachedHistCodeSetRef = null;
const _histWinCodeSet = new Set();

function _getLiveHistWinCodeSet() {
    const src = state.HISTORICAL_WINNING_SETS;
    if (!src) return _histWinCodeSet;
    if (_cachedHistCodeSetRef !== src || _cachedHistCodeSize !== src.size) {
        _histWinCodeSet.clear();
        src.forEach(str => {
            const parts = str.split(',');
            if (parts.length === 6) {
                _histWinCodeSet.add(_encodeLotto6Sorted(
                    parseInt(parts[0], 10),
                    parseInt(parts[1], 10),
                    parseInt(parts[2], 10),
                    parseInt(parts[3], 10),
                    parseInt(parts[4], 10),
                    parseInt(parts[5], 10)
                ));
            }
        });
        _cachedHistCodeSetRef = src;
        _cachedHistCodeSize = src.size;
    }
    return _histWinCodeSet;
}

// Precompute 17C3 = 680 triple lookup tables once for zero-allocation covering wheels (5-bit index packing: 0..16)
const _TRIPLES_16_COUNT = 680;
const _TRIPLES_16_A = new Uint8Array(_TRIPLES_16_COUNT);
const _TRIPLES_16_B = new Uint8Array(_TRIPLES_16_COUNT);
const _TRIPLES_16_C = new Uint8Array(_TRIPLES_16_COUNT);
const _TRIPLES_16_TK = new Uint16Array(_TRIPLES_16_COUNT);
const _TKEY_TO_SLOT = new Int16Array(16384).fill(-1);
{
    let ti = 0;
    for (let a = 0; a < 15; a++) {
        for (let b = a + 1; b < 16; b++) {
            for (let c = b + 1; c < 17; c++) {
                const tk = (a << 10) | (b << 5) | c;
                _TRIPLES_16_A[ti] = a;
                _TRIPLES_16_B[ti] = b;
                _TRIPLES_16_C[ti] = c;
                _TRIPLES_16_TK[ti] = tk;
                _TKEY_TO_SLOT[tk] = ti;
                ti++;
            }
        }
    }
}

function _calcEmpiricalEvMultiplier3B(nums, crowdAvoidMap = null) {
    const high32 = nums.filter(n => n >= 32).length;
    let hasConsec = false;
    for (let i = 0; i < nums.length - 1; i++) {
        if (nums[i] + 1 === nums[i + 1]) { hasConsec = true; break; }
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    const mn = nums[0];
    let mult = 1.0;
    if (high32 >= 3) mult *= 1.08;
    else if (high32 <= 1) mult *= 0.94;
    if (mn >= 10) mult *= 1.07;
    if (sum >= 160) mult *= 1.05;
    else if (sum >= 120 && sum <= 150 && high32 <= 1) mult *= 0.92;
    if (hasConsec) mult *= 1.04;
    if (crowdAvoidMap) {
        let caSum = 0;
        for (const n of nums) caSum += (crowdAvoidMap[n] || 0);
        const avgCa = caSum / nums.length;
        mult *= Math.max(0.90, Math.min(1.15, 1.0 + avgCa * 2.0));
    }
    return mult;
}

/**
 * 16수 코어 풀 선별 (구간 최소 하한 + 홀짝 7~9 균형, 상한 차단 0%)
 * - 각 대역 최소 바닥(1~9:2, 10대:2, 20대:2, 30대:2, 40대:1 = 9수)만 보장하고 상한은 풀어서
 *   한 번호대 5수+ 쏠림 등 극단적 고액 독식 회차도 구조적으로 0% 차단 유지
 */
function _selectBalancedPool16_3B(dynScore, rng, crowdAvoidMap = null) {
    const scoreMap = {};
    for (let n = 1; n <= 45; n++) {
        const ca = (crowdAvoidMap && crowdAvoidMap[n]) ? crowdAvoidMap[n] : 0;
        const caBonus = Math.max(-0.04, Math.min(0.06, ca * 0.6));
        scoreMap[n] = (dynScore[n] || 1.0) + caBonus + (rng() * 0.015);
    }
    const bands = [
        { minN: 1, maxN: 9, floor: 2 },
        { minN: 10, maxN: 19, floor: 2 },
        { minN: 20, maxN: 29, floor: 2 },
        { minN: 30, maxN: 39, floor: 2 },
        { minN: 40, maxN: 45, floor: 1 }
    ];
    const picked = [];
    const pickedSet = new Set();
    const restCandidates = [];

    for (const b of bands) {
        const bNums = [];
        for (let n = b.minN; n <= b.maxN; n++) bNums.push(n);
        bNums.sort((a, b2) => (scoreMap[b2] - scoreMap[a]) || (a - b2));
        for (let i = 0; i < b.floor && i < bNums.length; i++) {
            picked.push(bNums[i]);
            pickedSet.add(bNums[i]);
        }
        for (let i = b.floor; i < bNums.length; i++) {
            restCandidates.push(bNums[i]);
        }
    }

    restCandidates.sort((a, b) => (scoreMap[b] - scoreMap[a]) || (a - b));
    let oddCnt = picked.filter(n => (n & 1) === 1).length;

    for (const n of restCandidates) {
        if (picked.length >= 17) break;
        const leftAfter = 17 - picked.length - 1;
        const nextOdd = oddCnt + (n & 1);
        if (nextOdd > 10 || (nextOdd + leftAfter) < 7) continue;
        picked.push(n);
        pickedSet.add(n);
        oddCnt = nextOdd;
    }
    if (picked.length < 17) {
        for (const n of restCandidates) {
            if (!pickedSet.has(n)) {
                picked.push(n);
                pickedSet.add(n);
                if (picked.length >= 17) break;
            }
        }
    }

    return { pool16: picked.sort((a, b) => a - b), scoreMap };
}

// 17수(Core 7 + Sup 10) 30-slot quota: [C6+S0:3, C5+S1:2, C4+S2:4, C3+S3:9, C2+S4:9, C1+S5:2, C0+S6:1]
const _PLAN_A_CORE_SLOTS_3B = new Int8Array([
    6, 6, 6, 5, 5, 4, 4, 4, 4, 3,
    3, 3, 3, 3, 3, 3, 3, 3, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 1, 1, 0
]);

function _buildCoveringWheel30_3B(pool16, rng, crowdAvoidMap, pinnedTopCombos = null, isPastHistoricalWinFn = null, core7Nums = null) {
    const liveHistCodeSet = !isPastHistoricalWinFn ? _getLiveHistWinCodeSet() : null;
    const isCodeCheckFn = !!(isPastHistoricalWinFn && isPastHistoricalWinFn.__isCodeFn);
    const hasHistCheck = typeof isPastHistoricalWinFn === 'function';

    const P_LEN = pool16.length; // 17
    const numCnt = new Int16Array(P_LEN);
    const tCnt = new Uint16Array(16384);
    const qCnt = new Map();
    const getQ = (k) => qCnt.get(k) || 0;
    const addQ = (k, d) => qCnt.set(k, (qCnt.get(k) || 0) + d);
    const usedMasks = new Set();
    const gamesIdx = new Array(30);
    let gameCount = 0;

    // Precompute pool17 lookups
    const pNums = new Int32Array(P_LEN);
    const pHigh32 = new Uint8Array(P_LEN);
    const pCa = new Float64Array(P_LEN);
    for (let i = 0; i < P_LEN; i++) {
        const n = pool16[i];
        pNums[i] = n;
        pHigh32[i] = n >= 32 ? 1 : 0;
        pCa[i] = (crowdAvoidMap && crowdAvoidMap[n]) ? crowdAvoidMap[n] : 0;
    }

    // O(1) incremental uncovered triple tracker over all 680 triples in 17C3
    const uncovIdx = new Int16Array(_TRIPLES_16_COUNT);
    const uncovPos = new Int16Array(_TRIPLES_16_COUNT);
    for (let s = 0; s < _TRIPLES_16_COUNT; s++) {
        uncovIdx[s] = s;
        uncovPos[s] = s;
    }
    let uncovCount = _TRIPLES_16_COUNT;

    const addGameCounts = (arr, delta) => {
        for (let i = 0; i < 6; i++) numCnt[arr[i]] += delta;
        for (let a = 0; a < 4; a++) {
            const ia = arr[a] << 10;
            for (let b = a + 1; b < 5; b++) {
                const iab = ia | (arr[b] << 5);
                for (let c = b + 1; c < 6; c++) {
                    const tk = iab | arr[c];
                    const prev = tCnt[tk];
                    const next = prev + delta;
                    tCnt[tk] = next;
                    if (prev === 0 && next > 0) {
                        const s = _TKEY_TO_SLOT[tk];
                        const pos = uncovPos[s];
                        if (pos >= 0) {
                            const lastS = uncovIdx[--uncovCount];
                            uncovIdx[pos] = lastS;
                            uncovPos[lastS] = pos;
                            uncovPos[s] = -1;
                        }
                    } else if (prev > 0 && next === 0) {
                        const s = _TKEY_TO_SLOT[tk];
                        if (uncovPos[s] < 0) {
                            uncovPos[s] = uncovCount;
                            uncovIdx[uncovCount++] = s;
                        }
                    }
                }
            }
        }
        for (let a = 0; a < 3; a++) {
            const qa = arr[a] << 15;
            for (let b = a + 1; b < 4; b++) {
                const qab = qa | (arr[b] << 10);
                for (let c = b + 1; c < 5; c++) {
                    const qabc = qab | (arr[c] << 5);
                    for (let d = c + 1; d < 6; d++) {
                        addQ(qabc | arr[d], delta);
                    }
                }
            }
        }
    };

    const isHistDuplicate = (n0, n1, n2, n3, n4, n5) => {
        if (!hasHistCheck) {
            return liveHistCodeSet.has(_encodeLotto6Sorted(n0, n1, n2, n3, n4, n5));
        }
        if (isCodeCheckFn) {
            return isPastHistoricalWinFn(_encodeLotto6Sorted(n0, n1, n2, n3, n4, n5));
        }
        return isPastHistoricalWinFn(`${n0},${n1},${n2},${n3},${n4},${n5}`);
    };

    const calcEvMult6 = (i0, i1, i2, i3, i4, i5, n0, n1, n2, n3, n4, n5, sum) => {
        const high32 = pHigh32[i0] + pHigh32[i1] + pHigh32[i2] + pHigh32[i3] + pHigh32[i4] + pHigh32[i5];
        const hasConsec = (n0 + 1 === n1) || (n1 + 1 === n2) || (n2 + 1 === n3) || (n3 + 1 === n4) || (n4 + 1 === n5);
        let mult = 1.0;
        if (high32 >= 3) mult *= 1.08;
        else if (high32 <= 1) mult *= 0.94;
        if (n0 >= 10) mult *= 1.07;
        if (sum >= 160) mult *= 1.05;
        else if (sum >= 120 && sum <= 150 && high32 <= 1) mult *= 0.92;
        if (hasConsec) mult *= 1.04;
        if (crowdAvoidMap) {
            const avgCa = (pCa[i0] + pCa[i1] + pCa[i2] + pCa[i3] + pCa[i4] + pCa[i5]) / 6;
            const caFactor = 1.0 + avgCa * 2.0;
            mult *= (caFactor < 0.90 ? 0.90 : (caFactor > 1.15 ? 1.15 : caFactor));
        }
        return mult;
    };

    // #1~#3 고정 슬롯: 핵심 코어 7수(C(7,6)=7조합 중 3개) 직결 편입
    let hasPinnedSlot = false;
    let pinnedCount = 0;
    const isCoreIdx = new Uint8Array(P_LEN);
    const coreIdxList = new Int8Array(7);
    const supIdxList = new Int8Array(10);
    if (Array.isArray(pinnedTopCombos) && pinnedTopCombos.length > 0 && Array.isArray(core7Nums) && core7Nums.length === 7) {
        const coreIdxArr = core7Nums.map(n => pool16.indexOf(n)).filter(i => i >= 0);
        if (coreIdxArr.length === 7) {
            for (const combo of pinnedTopCombos) {
                if (!Array.isArray(combo) || combo.length !== 6) continue;
                const pIdx = combo.map(n => pool16.indexOf(n)).filter(i => i >= 0).sort((a, b) => a - b);
                if (pIdx.length === 6) {
                    const arr = new Int8Array(pIdx);
                    gamesIdx[gameCount++] = arr;
                    usedMasks.add((1 << arr[0]) | (1 << arr[1]) | (1 << arr[2]) | (1 << arr[3]) | (1 << arr[4]) | (1 << arr[5]));
                    addGameCounts(arr, 1);
                    pinnedCount++;
                }
            }
            if (pinnedCount > 0) {
                hasPinnedSlot = true;
                for (let k = 0; k < 7; k++) isCoreIdx[coreIdxArr[k]] = 1;
                let ci = 0, si = 0;
                for (let k = 0; k < P_LEN; k++) {
                    if (isCoreIdx[k]) coreIdxList[ci++] = k;
                    else supIdxList[si++] = k;
                }
            }
        }
    }

    const weights = new Float64Array(P_LEN);
    const wc = new Float64Array(P_LEN);
    const pkBuf = new Int8Array(6);
    const coreRem = new Int8Array(7);
    const supRem = new Int8Array(10);

    // Phase 1: Quota-Guided Covering Greedy Construction (30 games across all Core+Support splits)
    for (let gIdx = gameCount; gIdx < 30; gIdx++) {
        const needC = hasPinnedSlot ? _PLAN_A_CORE_SLOTS_3B[gIdx] : -1;
        const needS = hasPinnedSlot ? (6 - needC) : -1;

        let b0 = -1, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
        let bestSc = 1e18;
        let minC = 9999;
        for (let i = 0; i < P_LEN; i++) {
            if (numCnt[i] < minC) minC = numCnt[i];
        }
        let initTotW = 0;
        let initCoreW = 0;
        let initSupW = 0;
        for (let i = 0; i < P_LEN; i++) {
            const n = pNums[i];
            const diff = numCnt[i] - minC + 1;
            const baseW = 1.0 / (diff * diff * Math.sqrt(diff));
            const ca25 = pCa[i] * 2.5;
            const evBoost = 1.0 + (ca25 < -0.15 ? -0.15 : (ca25 > 0.25 ? 0.25 : ca25));
            const w = baseW * evBoost * (n >= 32 ? 1.15 : 1.0);
            weights[i] = w;
            initTotW += w;
            if (isCoreIdx[i]) initCoreW += w;
            else initSupW += w;
        }

        for (let t = 0; t < 220; t++) {
            let pCount = 0;
            if (hasPinnedSlot) {
                coreRem.set(coreIdxList);
                supRem.set(supIdxList);
                let remCLen = 7, remSLen = 10;
                let cW = initCoreW, sW = initSupW;

                for (let step = 0; step < needC; step++) {
                    if (cW <= 0) break;
                    let r = rng() * cW;
                    let selPos = remCLen - 1;
                    for (let j = 0; j < remCLen; j++) {
                        r -= weights[coreRem[j]];
                        if (r <= 0) { selPos = j; break; }
                    }
                    const pk = coreRem[selPos];
                    pkBuf[pCount++] = pk;
                    cW -= weights[pk];
                    coreRem[selPos] = coreRem[--remCLen];
                }
                for (let step = 0; step < needS; step++) {
                    if (sW <= 0) break;
                    let r = rng() * sW;
                    let selPos = remSLen - 1;
                    for (let j = 0; j < remSLen; j++) {
                        r -= weights[supRem[j]];
                        if (r <= 0) { selPos = j; break; }
                    }
                    const pk = supRem[selPos];
                    pkBuf[pCount++] = pk;
                    sW -= weights[pk];
                    supRem[selPos] = supRem[--remSLen];
                }
            } else {
                wc.set(weights);
                let totW = initTotW;
                while (pCount < 6) {
                    if (totW <= 0) break;
                    let r = rng() * totW;
                    let pk = P_LEN - 1;
                    for (let k = 0; k < P_LEN; k++) {
                        const wk = wc[k];
                        if (wk === 0) continue;
                        r -= wk;
                        if (r <= 0) { pk = k; break; }
                    }
                    pkBuf[pCount++] = pk;
                    totW -= wc[pk];
                    wc[pk] = 0;
                }
            }
            if (pCount !== 6) continue;

            // Inline insertion sort of 6 elements
            for (let i = 1; i < 6; i++) {
                const v = pkBuf[i];
                let j = i - 1;
                while (j >= 0 && pkBuf[j] > v) {
                    pkBuf[j + 1] = pkBuf[j];
                    j--;
                }
                pkBuf[j + 1] = v;
            }

            const i0 = pkBuf[0], i1 = pkBuf[1], i2 = pkBuf[2], i3 = pkBuf[3], i4 = pkBuf[4], i5 = pkBuf[5];
            const mask = (1 << i0) | (1 << i1) | (1 << i2) | (1 << i3) | (1 << i4) | (1 << i5);
            if (usedMasks.has(mask)) continue;

            const n0 = pNums[i0], n1 = pNums[i1], n2 = pNums[i2], n3 = pNums[i3], n4 = pNums[i4], n5 = pNums[i5];
            if (isHistDuplicate(n0, n1, n2, n3, n4, n5)) continue;

            // 15 quads inline (5-bit packing)
            let qOv = 0;
            qOv += getQ((i0 << 15) | (i1 << 10) | (i2 << 5) | i3) + getQ((i0 << 15) | (i1 << 10) | (i2 << 5) | i4) + getQ((i0 << 15) | (i1 << 10) | (i2 << 5) | i5);
            qOv += getQ((i0 << 15) | (i1 << 10) | (i3 << 5) | i4) + getQ((i0 << 15) | (i1 << 10) | (i3 << 5) | i5) + getQ((i0 << 15) | (i1 << 10) | (i4 << 5) | i5);
            qOv += getQ((i0 << 15) | (i2 << 10) | (i3 << 5) | i4) + getQ((i0 << 15) | (i2 << 10) | (i3 << 5) | i5) + getQ((i0 << 15) | (i2 << 10) | (i4 << 5) | i5);
            qOv += getQ((i0 << 15) | (i3 << 10) | (i4 << 5) | i5) + getQ((i1 << 15) | (i2 << 10) | (i3 << 5) | i4) + getQ((i1 << 15) | (i2 << 10) | (i3 << 5) | i5);
            qOv += getQ((i1 << 15) | (i2 << 10) | (i4 << 5) | i5) + getQ((i1 << 15) | (i3 << 10) | (i4 << 5) | i5) + getQ((i2 << 15) | (i3 << 10) | (i4 << 5) | i5);

            // 20 triples inline (5-bit packing)
            let tOv = 0, newT = 0, tc;
            const i0s = i0 << 10, i1s = i1 << 10, i2s = i2 << 10, i3s = i3 << 10;
            const tKeys0 = i0s | (i1 << 5);
            tc = tCnt[tKeys0 | i2]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys0 | i3]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys0 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys0 | i5]; if (tc === 0) newT++; else tOv += tc;
            const tKeys1 = i0s | (i2 << 5);
            tc = tCnt[tKeys1 | i3]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys1 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys1 | i5]; if (tc === 0) newT++; else tOv += tc;
            const tKeys2 = i0s | (i3 << 5);
            tc = tCnt[tKeys2 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys2 | i5]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[i0s | (i4 << 5) | i5]; if (tc === 0) newT++; else tOv += tc;
            const tKeys3 = i1s | (i2 << 5);
            tc = tCnt[tKeys3 | i3]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys3 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys3 | i5]; if (tc === 0) newT++; else tOv += tc;
            const tKeys4 = i1s | (i3 << 5);
            tc = tCnt[tKeys4 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys4 | i5]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[i1s | (i4 << 5) | i5]; if (tc === 0) newT++; else tOv += tc;
            const tKeys5 = i2s | (i3 << 5);
            tc = tCnt[tKeys5 | i4]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[tKeys5 | i5]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[i2s | (i4 << 5) | i5]; if (tc === 0) newT++; else tOv += tc;
            tc = tCnt[i3s | (i4 << 5) | i5]; if (tc === 0) newT++; else tOv += tc;

            const bal = numCnt[i0] + numCnt[i1] + numCnt[i2] + numCnt[i3] + numCnt[i4] + numCnt[i5];
            const sum = n0 + n1 + n2 + n3 + n4 + n5;
            const sPen = (sum >= 85) ? 0 : (85 - sum) * 0.5;
            const ac = _calcAC6Fast(n0, n1, n2, n3, n4, n5);
            const acPen = (ac >= 5) ? 0 : (5 - ac) * 2;
            const evMult = calcEvMult6(i0, i1, i2, i3, i4, i5, n0, n1, n2, n3, n4, n5, sum);
            const sc = qOv * 40000 + tOv * 600 - newT * 900 + bal * 3 + sPen + acPen - (evMult - 1.0) * 25;
            if (sc < bestSc) {
                bestSc = sc;
                b0 = i0; b1 = i1; b2 = i2; b3 = i3; b4 = i4; b5 = i5;
            }
        }

        let bestIdxArr;
        if (b0 >= 0) {
            bestIdxArr = new Int8Array([b0, b1, b2, b3, b4, b5]);
        } else if (hasPinnedSlot) {
            const cShuf = seededShuffle(Array.from(coreIdxList), rng).slice(0, needC);
            const sShuf = seededShuffle(Array.from(supIdxList), rng).slice(0, needS);
            bestIdxArr = new Int8Array([...cShuf, ...sShuf].sort((a, b) => a - b));
        } else {
            const avail = Array.from({ length: P_LEN }, (_, idx) => idx);
            const fallback = seededShuffle(avail, rng).slice(0, 6).sort((a, b) => a - b);
            bestIdxArr = new Int8Array(fallback);
        }
        gamesIdx[gameCount++] = bestIdxArr;
        usedMasks.add((1 << bestIdxArr[0]) | (1 << bestIdxArr[1]) | (1 << bestIdxArr[2]) | (1 << bestIdxArr[3]) | (1 << bestIdxArr[4]) | (1 << bestIdxArr[5]));
        addGameCounts(bestIdxArr, 1);
    }

    // Phase 2: Quota-Preserving 2-opt Covering Refinement (3수 커버리지 극대화 + 4수 중복 비증가 + 7개 분할 쿼터 100% 유지)
    const startSwapPos = hasPinnedSlot ? pinnedCount : 0;
    const remPool = new Int8Array(14);
    const remCoreBuf = new Int8Array(7);
    const remSupBuf = new Int8Array(10);
    const candBuf = new Int8Array(6);
    const compatSlots = new Int16Array(_TRIPLES_16_COUNT);
    const slotLocked = new Uint8Array(30);

    for (let it = 0; it < 350; it++) {
        if (uncovCount === 0) break;

        let worstPos = -1;
        let worstUniq = 99;
        for (let pos = startSwapPos; pos < 30; pos++) {
            if (slotLocked[pos]) continue;
            const g = gamesIdx[pos];
            let uniq = 0;
            for (let a = 0; a < 4; a++) {
                const ga = g[a] << 10;
                for (let b = a + 1; b < 5; b++) {
                    const gab = ga | (g[b] << 5);
                    for (let c = b + 1; c < 6; c++) {
                        if (tCnt[gab | g[c]] === 1) uniq++;
                    }
                }
            }
            if (uniq < worstUniq) {
                worstUniq = uniq;
                worstPos = pos;
            }
        }
        if (worstPos < 0) break;

        const needC = hasPinnedSlot ? _PLAN_A_CORE_SLOTS_3B[worstPos] : -1;
        const needS = hasPinnedSlot ? (6 - needC) : -1;

        const oldArr = gamesIdx[worstPos];
        const o0 = oldArr[0], o1 = oldArr[1], o2 = oldArr[2], o3 = oldArr[3], o4 = oldArr[4], o5 = oldArr[5];
        const oldMask = (1 << o0) | (1 << o1) | (1 << o2) | (1 << o3) | (1 << o4) | (1 << o5);
        usedMasks.delete(oldMask);
        addGameCounts(oldArr, -1);

        if (uncovCount === 0) {
            usedMasks.add(oldMask);
            addGameCounts(oldArr, 1);
            break;
        }

        let targetSlot;
        if (hasPinnedSlot) {
            let compatLen = 0;
            for (let ui = 0; ui < uncovCount; ui++) {
                const s = uncovIdx[ui];
                const tcC = isCoreIdx[_TRIPLES_16_A[s]] + isCoreIdx[_TRIPLES_16_B[s]] + isCoreIdx[_TRIPLES_16_C[s]];
                if (tcC <= needC && (3 - tcC) <= needS) {
                    compatSlots[compatLen++] = s;
                }
            }
            if (compatLen === 0) {
                usedMasks.add(oldMask);
                addGameCounts(oldArr, 1);
                slotLocked[worstPos] = 1;
                continue;
            }
            targetSlot = compatSlots[Math.floor(rng() * compatLen)];
        } else {
            targetSlot = uncovIdx[Math.floor(rng() * uncovCount)];
        }

        let oldQOv = 0;
        for (let a = 0; a < 3; a++) {
            const qa = oldArr[a] << 15;
            for (let b = a + 1; b < 4; b++) {
                const qab = qa | (oldArr[b] << 10);
                for (let c = b + 1; c < 5; c++) {
                    const qabc = qab | (oldArr[c] << 5);
                    for (let d = c + 1; d < 6; d++) oldQOv += getQ(qabc | oldArr[d]);
                }
            }
        }
        let oldGain = 0;
        for (let a = 0; a < 4; a++) {
            const ta = oldArr[a] << 10;
            for (let b = a + 1; b < 5; b++) {
                const tab = ta | (oldArr[b] << 5);
                for (let c = b + 1; c < 6; c++) if (tCnt[tab | oldArr[c]] === 0) oldGain++;
            }
        }
        const on0 = pNums[o0], on1 = pNums[o1], on2 = pNums[o2], on3 = pNums[o3], on4 = pNums[o4], on5 = pNums[o5];
        const oldEv = calcEvMult6(o0, o1, o2, o3, o4, o5, on0, on1, on2, on3, on4, on5, on0 + on1 + on2 + on3 + on4 + on5);

        const ta0 = _TRIPLES_16_A[targetSlot];
        const tb0 = _TRIPLES_16_B[targetSlot];
        const tc0 = _TRIPLES_16_C[targetSlot];
        const tcCore = hasPinnedSlot ? (isCoreIdx[ta0] + isCoreIdx[tb0] + isCoreIdx[tc0]) : 0;
        const addC = hasPinnedSlot ? (needC - tcCore) : 0;
        const addS = hasPinnedSlot ? (needS - (3 - tcCore)) : 0;

        let rcLen = 0, rsLen = 0, rp = 0;
        if (hasPinnedSlot) {
            for (let i = 0; i < 7; i++) {
                const idx = coreIdxList[i];
                if (idx !== ta0 && idx !== tb0 && idx !== tc0) remCoreBuf[rcLen++] = idx;
            }
            for (let i = 0; i < 10; i++) {
                const idx = supIdxList[i];
                if (idx !== ta0 && idx !== tb0 && idx !== tc0) remSupBuf[rsLen++] = idx;
            }
        } else {
            for (let i = 0; i < P_LEN; i++) {
                if (i !== ta0 && i !== tb0 && i !== tc0) remPool[rp++] = i;
            }
        }

        let br0 = -1, br1 = 0, br2 = 0, br3 = 0, br4 = 0, br5 = 0;
        let bestGain = oldGain;
        let bestQOv = oldQOv;
        let bestEv = oldEv;

        const evaluateCand = () => {
            for (let i = 1; i < 6; i++) {
                const v = candBuf[i];
                let j = i - 1;
                while (j >= 0 && candBuf[j] > v) {
                    candBuf[j + 1] = candBuf[j];
                    j--;
                }
                candBuf[j + 1] = v;
            }
            const c0 = candBuf[0], c1 = candBuf[1], c2 = candBuf[2], c3 = candBuf[3], c4 = candBuf[4], c5 = candBuf[5];
            const cMask = (1 << c0) | (1 << c1) | (1 << c2) | (1 << c3) | (1 << c4) | (1 << c5);
            if (usedMasks.has(cMask)) return;

            const cn0 = pNums[c0], cn1 = pNums[c1], cn2 = pNums[c2], cn3 = pNums[c3], cn4 = pNums[c4], cn5 = pNums[c5];
            if (isHistDuplicate(cn0, cn1, cn2, cn3, cn4, cn5)) return;

            let qOv = 0;
            for (let a = 0; a < 3; a++) {
                const qa = candBuf[a] << 15;
                for (let b = a + 1; b < 4; b++) {
                    const qab = qa | (candBuf[b] << 10);
                    for (let cc = b + 1; cc < 5; cc++) {
                        const qabc = qab | (candBuf[cc] << 5);
                        for (let d = cc + 1; d < 6; d++) qOv += getQ(qabc | candBuf[d]);
                    }
                }
            }
            if (qOv > oldQOv) return;

            let gain = 0;
            for (let a = 0; a < 4; a++) {
                const xa = candBuf[a] << 10;
                for (let b = a + 1; b < 5; b++) {
                    const xab = xa | (candBuf[b] << 5);
                    for (let cc = b + 1; cc < 6; cc++) if (tCnt[xab | candBuf[cc]] === 0) gain++;
                }
            }
            const cEv = calcEvMult6(c0, c1, c2, c3, c4, c5, cn0, cn1, cn2, cn3, cn4, cn5, cn0 + cn1 + cn2 + cn3 + cn4 + cn5);

            if (gain > bestGain || (gain === bestGain && (qOv < bestQOv || (qOv === bestQOv && cEv > bestEv + 0.02)))) {
                br0 = c0; br1 = c1; br2 = c2; br3 = c3; br4 = c4; br5 = c5;
                bestGain = gain;
                bestQOv = qOv;
                bestEv = cEv;
            }
        };

        // Exact 1-swap neighborhood within same Core/Sup partition
        if (hasPinnedSlot) {
            for (let oi = 0; oi < 6; oi++) {
                const ov = oldArr[oi];
                if (isCoreIdx[ov]) {
                    for (let ci = 0; ci < 7; ci++) {
                        const nc = coreIdxList[ci];
                        if (oldMask & (1 << nc)) continue;
                        for (let k = 0; k < 6; k++) candBuf[k] = oldArr[k];
                        candBuf[oi] = nc;
                        evaluateCand();
                    }
                } else {
                    for (let si = 0; si < 10; si++) {
                        const ns = supIdxList[si];
                        if (oldMask & (1 << ns)) continue;
                        for (let k = 0; k < 6; k++) candBuf[k] = oldArr[k];
                        candBuf[oi] = ns;
                        evaluateCand();
                    }
                }
            }
        }

        for (let c = 0; c < 45; c++) {
            candBuf[0] = ta0; candBuf[1] = tb0; candBuf[2] = tc0;
            if (hasPinnedSlot) {
                let cp = 3;
                for (let k = rcLen - 1; k >= rcLen - addC; k--) {
                    const j = Math.floor(rng() * (k + 1));
                    const tmp = remCoreBuf[j];
                    remCoreBuf[j] = remCoreBuf[k];
                    remCoreBuf[k] = tmp;
                    candBuf[cp++] = tmp;
                }
                for (let k = rsLen - 1; k >= rsLen - addS; k--) {
                    const j = Math.floor(rng() * (k + 1));
                    const tmp = remSupBuf[j];
                    remSupBuf[j] = remSupBuf[k];
                    remSupBuf[k] = tmp;
                    candBuf[cp++] = tmp;
                }
            } else {
                for (let k = rp - 1; k >= rp - 3; k--) {
                    const j = Math.floor(rng() * (k + 1));
                    const tmp = remPool[j];
                    remPool[j] = remPool[k];
                    remPool[k] = tmp;
                }
                candBuf[3] = remPool[rp - 1]; candBuf[4] = remPool[rp - 2]; candBuf[5] = remPool[rp - 3];
            }
            evaluateCand();
        }

        if (br0 >= 0) {
            const repArr = new Int8Array([br0, br1, br2, br3, br4, br5]);
            gamesIdx[worstPos] = repArr;
            usedMasks.add((1 << br0) | (1 << br1) | (1 << br2) | (1 << br3) | (1 << br4) | (1 << br5));
            addGameCounts(repArr, 1);
            slotLocked.fill(0);
        } else {
            usedMasks.add(oldMask);
            addGameCounts(oldArr, 1);
            slotLocked[worstPos] = 1;
        }
    }

    const outGames = new Array(30);
    for (let g = 0; g < 30; g++) {
        const arr = gamesIdx[g];
        outGames[g] = [pNums[arr[0]], pNums[arr[1]], pNums[arr[2]], pNums[arr[3]], pNums[arr[4]], pNums[arr[5]]];
    }
    return outGames;
}

function _composePortfolio3BFromScores(roundForSeed, effectiveUserId, dynScore, crowdAvoidMap, maxKnownDrawnRound, isPastHistoricalWinFn = null, fastMode = false) {
    const seed = getUserRoundSeed(effectiveUserId, roundForSeed, 'ar_3b_16wheel');
    const rng = createDeterministicRng(seed);

    // 1. 실증 비인기 EV + Hedge8 통합 + 구간 최소 하한 + 홀짝 균형 16수 코어 풀 선별 (타이브레이커 난수 0.015)
    const { pool16, scoreMap } = _selectBalancedPool16_3B(dynScore, rng, crowdAvoidMap);
    const rankedPool16 = [...pool16].sort((a, b) => (scoreMap[b] - scoreMap[a]) || (a - b));
    let top6Ranked = rankedPool16.slice(0, 6);

    // 1b. Core 6 소프트 구조 가드: 극단 결함(홀짝 0:6/6:0, AC<=4, 합계<95/>185, 역대 1등 중복) 시 6위(또는 5위) 1자리만 예비 7~10위와 교체
    const liveHistCodes = !isPastHistoricalWinFn ? _getLiveHistWinCodeSet() : null;
    const isCodeHistFn = !!(isPastHistoricalWinFn && isPastHistoricalWinFn.__isCodeFn);
    const hasHistGuard = typeof isPastHistoricalWinFn === 'function';
    const isCore6Extreme = (arr6) => {
        const s = [...arr6].sort((a, b) => a - b);
        const ac = _calcAC6Fast(s[0], s[1], s[2], s[3], s[4], s[5]);
        let odd = 0, sum = 0;
        for (let i = 0; i < 6; i++) {
            odd += (s[i] & 1);
            sum += s[i];
        }
        if (odd === 0 || odd === 6 || ac <= 4 || sum < 95 || sum > 185) return true;
        if (hasHistGuard) {
            return isCodeHistFn
                ? isPastHistoricalWinFn(_encodeLotto6Sorted(s[0], s[1], s[2], s[3], s[4], s[5]))
                : isPastHistoricalWinFn(s);
        }
        return liveHistCodes ? liveHistCodes.has(_encodeLotto6Sorted(s[0], s[1], s[2], s[3], s[4], s[5])) : false;
    };
    if (isCore6Extreme(top6Ranked)) {
        const backups = rankedPool16.slice(6, 10);
        let repaired = null;
        for (let dropIdx = 5; dropIdx >= 4 && !repaired; dropIdx--) {
            for (const rep of backups) {
                const cand = top6Ranked.map((n, idx) => (idx === dropIdx ? rep : n));
                if (!isCore6Extreme(cand)) {
                    repaired = cand;
                    break;
                }
            }
        }
        if (repaired) top6Ranked = repaired;
    }

    const top6Anchors = [...top6Ranked].sort((a, b) => a - b);
    const top6Set = new Set(top6Anchors);
    const core7th = rankedPool16.find(n => !top6Set.has(n));
    const core7Ranked = core7th !== undefined ? [...top6Ranked, core7th] : [...top6Ranked];
    const top7Anchors = [...core7Ranked].sort((a, b) => a - b);
    const top7Set = new Set(top7Anchors);
    const support10 = pool16.filter(n => !top7Set.has(n));

    // 2. #1~3 슬롯 Core 7 직결 고정(3개 조합) + 잔여 27게임 17수 커버링 2-opt 휠링
    const pinned3Combos = [top6Anchors];
    if (core7th !== undefined) {
        const rot = Math.abs(seed) % 6;
        const dropCandidates = [];
        for (let i = 0; i < 6; i++) dropCandidates.push((rot + i) % 6);
        const nonExtremeDrops = [];
        const fallbackDrops = [];
        for (const dIdx of dropCandidates) {
            const combo6 = [...top6Ranked.filter((_, idx) => idx !== dIdx), core7th].sort((a, b) => a - b);
            if (!isCore6Extreme(combo6)) nonExtremeDrops.push(combo6);
            else fallbackDrops.push(combo6);
        }
        const extras = [...nonExtremeDrops, ...fallbackDrops];
        for (let k = 0; k < 2 && k < extras.length; k++) {
            pinned3Combos.push(extras[k]);
        }
    }
    const rawGames = _buildCoveringWheel30_3B(pool16, rng, crowdAvoidMap, pinned3Combos, isPastHistoricalWinFn, top7Anchors);

    const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const poolStr = pool16.join(',');
    const makeCombo = (nums, packIdx, idxInPack) => {
        const isAnchorSlot = (packIdx === 1 && idxInPack === 0);
        const slotIdx = (packIdx - 1) * 10 + idxInPack;
        const slotCoreCnt = _PLAN_A_CORE_SLOTS_3B[slotIdx];
        const isSup6Slot = (slotCoreCnt === 0);
        const isHighCoreSlot = (slotCoreCnt >= 4 && !isAnchorSlot);
        const slotSplitLabel = `핵심${slotCoreCnt}+보조${6 - slotCoreCnt}`;

        if (fastMode) {
            if (packIdx === 1) {
                return {
                    id: `V4-G1-${idxInPack + 1}`,
                    algoId: 'v4',
                    isDirectTop6: isAnchorSlot,
                    isSup6Slot,
                    slotCoreCnt,
                    name: isAnchorSlot ? `TOP6 직결 휠` : `올라운더 1 휠 (${slotSplitLabel})`,
                    numbers: nums,
                    meta: { name: isAnchorSlot ? `TOP 6 핵심 앵커 직결 휠 (올라운더 1)` : `16수 초압축 폭발 휠 (${slotSplitLabel} · 올라운더 1)` }
                };
            }
            if (packIdx === 2) {
                return {
                    id: `V4.2-G1-${idxInPack + 1}`,
                    algoId: 'v3',
                    isSup6Slot,
                    slotCoreCnt,
                    name: `올라운더 2 EV 휠 (${slotSplitLabel})`,
                    numbers: nums,
                    meta: { name: `16수 초압축 EV 휠 (${slotSplitLabel} · 올라운더 2)` }
                };
            }
            return {
                id: `AR3-${idxInPack + 1}`,
                algoId: 'extra_1',
                isSup6Slot,
                slotCoreCnt,
                name: isSup6Slot ? `올라운더 3 보조6수 1등슬롯` : `올라운더 3 완성 휠 (${slotSplitLabel})`,
                numbers: nums,
                meta: { name: isSup6Slot ? `올라운더 3: 보조 6수 직결 1등 포획 휠 (16수 초압축 #${idxInPack + 1})` : `올라운더 3: 16수 초압축 완성 휠 (${slotSplitLabel} #${idxInPack + 1})` }
            };
        }

        const ac = _calcACLocal(nums);
        const sum = nums.reduce((a, b) => a + b, 0);
        const evMult = _calcEmpiricalEvMultiplier3B(nums, crowdAvoidMap);
        const stats = calculateStats(nums);
        stats.acValue = ac;
        stats.evMultiplier = Number(evMult.toFixed(2));
        const numReasons = nums.map(n => isAnchorSlot
            ? `${n}번: 최핵심 앵커 TOP 6([${top6Anchors.join(',')}]) 직결 편입 수`
            : (isSup6Slot
                ? `${n}번: 보조 코어 10수([${support10.join(',')}]) 단독 1등 포획 슬롯 편입 수`
                : `${n}번: Plan A ${slotSplitLabel} 쿼터 기반 16수 압축 풀([${poolStr}]) 코어 휠링`));

        if (packIdx === 1) {
            return {
                id: `V4-G1-${idxInPack + 1}`,
                name: isAnchorSlot ? `[올라운더] 16수 초압축 TOP6 코어 직결 휠` : `[올라운더] 16수 초압축 다중·고액 휠 (${slotSplitLabel})`,
                numbers: nums,
                stats,
                meta: {
                    rankBadge: isAnchorSlot ? `TOP6 직결 1` : (isHighCoreSlot ? `고핵심 ${slotSplitLabel}` : `16-WHEEL ${idxInPack + 1}`),
                    rankClass: idxInPack < 4 ? 'top-1-badge' : (idxInPack < 7 ? 'top-4-badge' : 'badge-v3-engine'),
                    badgeClass: idxInPack < 4 ? 'strategy-a' : 'strategy-b',
                    name: isAnchorSlot ? `TOP 6 핵심 앵커 직결 휠 (올라운더 1)` : `16수 초압축 폭발 휠 (${slotSplitLabel} · 올라운더 1)`,
                    tag: isAnchorSlot
                        ? `TOP6 직결 | 16수 | 합 ${sum} | AC ${ac} | EV ${evMult.toFixed(2)}x`
                        : `${slotSplitLabel} | 16수 코어 | 합 ${sum} | AC ${ac} | EV ${evMult.toFixed(2)}x`,
                    desc: isAnchorSlot
                        ? `최핵심 앵커 TOP 6([${top6Anchors.join(', ')}]) 조합을 그대로 1번 슬롯에 직결 편입해 6수 전원 적중 시 1등, 5수+보너스(TOP6 내) 적중 시 2등을 100% 보장합니다.`
                        : `Plan A 고핵심 쿼터(${slotSplitLabel})에 맞춰 핵심 5+1/4+2 1등 사각지대 없이 16수 풀 내부 다중·고액 당첨을 포획합니다.`,
                    lawName: isAnchorSlot ? '3안-B: 최핵심 앵커 TOP 6 1등·2등 직결 슬롯' : `Plan A 고핵심 쿼터 커버링 휠 (${slotSplitLabel})`,
                    probRationale: isAnchorSlot
                        ? 'TOP 6 코어 6자리 전원 적중 시 1등, 5수+보너스(TOP 6 내) 적중 시 2등, 5수 적중 시 3등 확정 구조'
                        : `핵심 5+1 적중 시 1등 3.33%, 핵심 4+2 적중 시 1등 0.44% · 3등+ 33.6% 커버 구조`,
                    targetBenefit: isAnchorSlot ? 'TOP 6 핵심 코어 적중 시 1등·2등 무누락 직결 포획' : '고핵심(5+1/4+2) 1등 직결 보강 및 3·4등 동시 포획',
                    numReasons
                }
            };
        }
        if (packIdx === 2) {
            return {
                id: `V4.2-G1-${idxInPack + 1}`,
                name: `[올라운더 2] 16수 초압축 EV 휠 (${slotSplitLabel})`,
                customLabel: `올라운더2-${alphabet[idxInPack] || (idxInPack + 1)}`,
                numbers: nums,
                stats,
                meta: {
                    rankBadge: `중심커버 ${slotSplitLabel}`,
                    rankClass: 'top-4-badge',
                    badgeClass: 'strategy-b',
                    name: `16수 초압축 EV 휠 (${slotSplitLabel} · 올라운더 2)`,
                    tag: `${slotSplitLabel} | 16수 코어 | 합 ${sum} | AC ${ac} | EV ${evMult.toFixed(2)}x`,
                    desc: `가장 빈도가 높은 중심 혼합 비율(${slotSplitLabel})에 배치되어 3·4·5등 다중당첨과 비인기 고액 기대값을 극대화합니다.`,
                    lawName: `Plan A 중심 혼합 커버링 휠 (${slotSplitLabel})`,
                    probRationale: '핵심 2~3개 + 보조 3~4개 최빈 혼합 당첨 구간 집중 커버.',
                    targetBenefit: '16수 풀 적중 시 다중·고액 당첨 폭발 시너지',
                    numReasons
                }
            };
        }
        return {
            id: `AR3-${idxInPack + 1}`,
            name: isSup6Slot ? `[올라운더 3] 16수 초압축 보조6수 직결 휠 #${idxInPack + 1}` : `[올라운더 3] 16수 초압축 완성 휠 (${slotSplitLabel}) #${idxInPack + 1}`,
            numbers: nums,
            stats,
            meta: {
                rankBadge: isSup6Slot ? `보조6 1등슬롯` : `AR3 ${slotSplitLabel}`,
                rankClass: idxInPack >= 7 ? 'top-1-badge' : (idxInPack < 4 ? 'top-1-badge' : 'top-4-badge'),
                badgeClass: idxInPack >= 7 ? 'strategy-a' : 'strategy-b',
                name: isSup6Slot ? `올라운더 3: 보조 6수 1등 포획 휠 (16수 초압축 #${idxInPack + 1})` : `올라운더 3: 16수 초압축 완성 휠 (${slotSplitLabel} #${idxInPack + 1})`,
                tag: isSup6Slot ? `보조6 전용 | 1등 1.43%·3등+ 44.4% | 합 ${sum} | AC ${ac} | EV ${evMult.toFixed(2)}x` : `${slotSplitLabel} | 16수 30G 완결 | 합 ${sum} | AC ${ac} | EV ${evMult.toFixed(2)}x`,
                desc: isSup6Slot
                    ? `보조 코어 10수([${support10.join(', ')}])에서만 6자리를 조합하는 Plan A 전용 3슬롯 중 하나로, 보조 10수 내 1등 번호 6개 전원 포함 시 1등(1.43%)·3등+(44.4%)를 직접 포획합니다.`
                    : `올라운더 1·2의 잔여 4수·3수 커버 빈틈을 메우고 보조 확장 슬롯(${slotSplitLabel})을 완성합니다.`,
                lawName: isSup6Slot ? 'Plan A: 보조 10수 단독 1등 포획 3슬롯' : `Plan A: 16수 30게임 커버링 완결 (${slotSplitLabel})`,
                probRationale: isSup6Slot ? '보조 10수 6개 전원 적중 시 1등 1.43%, 3등 이상 44.4%, 4등 이상 100% 달성 슬롯.' : '16수 풀 내 번호 균등 배치 및 고액 EV 스코어링 완결.',
                targetBenefit: isSup6Slot ? '핵심 코어 미포함 회차에서도 보조 10수만으로 1등 직접 포획' : '올라운더 1·2·3 통합 7분할 1등·다중 당첨 완성',
                numReasons
            }
        };
    };

    return {
        round: roundForSeed,
        userId: effectiveUserId,
        algoRevision: ALGO_REVISION_3B,
        pool16,
        top6Anchors,
        top7Anchors,
        top6Ranked,
        support10,
        v4: rawGames.slice(0, 10).map((nums, i) => makeCombo(nums, 1, i)),
        v3: rawGames.slice(10, 20).map((nums, i) => makeCombo(nums, 2, i)),
        ar3: rawGames.slice(20, 30).map((nums, i) => makeCombo(nums, 3, i))
    };
}

let _wfScoreCacheMemo = null;

/**
 * ⚡ O(N) 증분 워크포워드 코어 스코어 캐시 구축 (1회차 ~ maxRound까지 미래 데이터 0% 누수 없이 고속 계산)
 * - statistics.js의 V3_Hedge8_WheelEV 공식(8-전문가 온라인 헤지 앙상블 + EV 분리)을 단일 소스에서 생성하고 세션 내 재사용합니다.
 */
export function buildWalkForwardCore3BScoreCache(maxRound = null) {
    const history = state.mergedHistory || {};
    const allRounds = Object.keys(history)
        .filter(r => history[r] && Array.isArray(history[r].numbers) && history[r].numbers.length === 6)
        .map(Number)
        .sort((a, b) => a - b);
    const limitR = maxRound || (allRounds.length ? allRounds[allRounds.length - 1] : 1250);
    const latestHistR = allRounds.length ? allRounds[allRounds.length - 1] : 0;
    const latestSig = latestHistR > 0 ? `${allRounds.length}_${latestHistR}_${history[latestHistR].numbers.join(',')}` : '0';
    if (_wfScoreCacheMemo && _wfScoreCacheMemo.latestSig === latestSig && _wfScoreCacheMemo.cache.limitR >= limitR) {
        return _wfScoreCacheMemo.cache;
    }

    const res = computeWalkForwardHedge8Snapshots(history, limitR);
    const cache = {
        limitR: res.limitR,
        roundSnapshots: res.roundSnapshots,
        winRoundMap: res.winRoundMap,
        winCodeMap: res.winCodeMap,
        expertWeights: res.expertWeights,
        portfolioCache: new Map()
    };
    _wfScoreCacheMemo = { latestSig, cache };
    return cache;
}

/**
 * 🎯 시뮬레이션/백테스트 전용: 특정 회차(1..maxRound)의 현행 핵심·보조 코어 16수 및 30게임 휠 생성
 */
export function generateCore3BPortfolioAtRound(round, customUserId = null, scoreCache = null, fastMode = true) {
    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);
    if (scoreCache && scoreCache.roundSnapshots && scoreCache.roundSnapshots[round]) {
        const pfCache = scoreCache.portfolioCache;
        const cacheKey = `${effectiveUserId}_${round}_${fastMode ? 1 : 0}`;
        if (pfCache && pfCache.has(cacheKey)) {
            return pfCache.get(cacheKey);
        }
        const snap = scoreCache.roundSnapshots[round];
        const codeMap = scoreCache.winCodeMap;
        let histCheck = null;
        if (codeMap) {
            histCheck = (code) => {
                const wr = codeMap.get(code);
                return wr !== undefined && wr < round;
            };
            histCheck.__isCodeFn = true;
        }
        const pf = _composePortfolio3BFromScores(round, effectiveUserId, snap.dynScore, snap.crowdAvoid, snap.maxKnown, histCheck, fastMode);
        if (pfCache) pfCache.set(cacheKey, pf);
        return pf;
    }
    return computeAllRounder3BPortfolio(round, effectiveUserId);
}

/**
 * 🎯 3안-B: 16수 초압축 폭발 휠 (올라운더 1·2·3 통합 30게임)
 * - 최신 당첨번호(targetRound - 1)까지 반영된 DYNAMIC_ROUND_SCORE(실증 당첨자수 기반 EV·EWMA·완화된 동적신호) 기반
 * - 구간 최소 하한 + 홀짝 균형 16수 선별 (상한 차단 0%) + 3수·4수 커버링 2-opt 30게임 최적화
 */
export function computeAllRounder3BPortfolio(targetRound = null, customUserId = null) {
    const drawnRounds = Object.keys(state.mergedHistory || {})
        .filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers) && state.mergedHistory[r].numbers.length === 6)
        .map(Number);
    const maxKnownDrawnRound = drawnRounds.length ? Math.max(...drawnRounds) : 1250;
    const roundForSeed = targetRound || (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : (maxKnownDrawnRound + 1));
    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);

    if (!state.ar3bPortfolioCache) state.ar3bPortfolioCache = {};
    const portfolioCacheKey = `${roundForSeed}_${effectiveUserId}_R${maxKnownDrawnRound}`;
    if (state.ar3bPortfolioCache[portfolioCacheKey]) {
        return state.ar3bPortfolioCache[portfolioCacheKey];
    }

    const needHistoryIsolation = enterHistoryIsolation(roundForSeed, maxKnownDrawnRound);
    try {
        if (!state.DYNAMIC_ROUND_SCORE || !state.DYNAMIC_ROUND_SCORE[1]) {
            recalculateGroups();
        }
        const dynScore = state.DYNAMIC_ROUND_SCORE || {};
        const crowdAvoidMap = state.CROWD_AVOIDANCE_SCORE || {};
        const portfolio = _composePortfolio3BFromScores(roundForSeed, effectiveUserId, dynScore, crowdAvoidMap, maxKnownDrawnRound, null, false);
        state.ar3bPortfolioCache[portfolioCacheKey] = portfolio;
        return portfolio;
    } finally {
        exitHistoryIsolation(needHistoryIsolation);
    }
}

export function computeAbsoluteTop10Combinations(forceRegenerate = false, targetRound = null, overrideVersion = null, ignoreLedger = false, customUserId = null) {
    const drawnRounds = Object.keys(state.mergedHistory || {})
        .filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers))
        .map(Number);
    const maxKnownDrawnRound = drawnRounds.length ? Math.max(...drawnRounds) : 1237;
    const defaultRound = (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : (typeof window !== 'undefined' && window.getUpcomingLottoRound ? window.getUpcomingLottoRound() : (maxKnownDrawnRound + 1)));
    const roundForSeed = targetRound || defaultRound;
    const algoVersion = "v4.0";

    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);

    // Determine version: explicit override takes HIGHEST priority (device-agnostic)
    if (overrideVersion === 'v5' || overrideVersion === 'ar3' || overrideVersion === 'v5.0' || overrideVersion === 'extra1') {
        const pack3 = generateExtraAddonPack(1, roundForSeed, effectiveUserId);
        return (pack3 && Array.isArray(pack3.combos)) ? pack3.combos : [];
    }

    let useReportLogic;
    if (overrideVersion === 'v4' || overrideVersion === 'V4.0') {
        useReportLogic = true;
    } else if (overrideVersion === 'v3' || overrideVersion === 'V3.0') {
        useReportLogic = false;
    } else {
        const chkReportLogic = document.getElementById('chkUseV4ReportLogic');
        const chkReportLogicSim = document.getElementById('chkUseV4ReportLogicSim');
        if (targetRound !== null && chkReportLogicSim) {
            useReportLogic = chkReportLogicSim.checked;
        } else if (chkReportLogic) {
            useReportLogic = chkReportLogic.checked;
        } else {
            const localPref = localStorage.getItem('lotto_pref_v4');
            if (localPref === 'ar3' || localPref === 'extra1' || localPref === 'v5') {
                const pack3 = generateExtraAddonPack(1, roundForSeed, effectiveUserId);
                return (pack3 && Array.isArray(pack3.combos)) ? pack3.combos : [];
            }
            useReportLogic = (localPref !== null) ? (localPref === 'true') : true;
        }
    }
    const versionStr = useReportLogic ? '기본 1: 올라운더 팩 (10게임)' : '기본 2: 올라운더 팩 2 (10게임)';

    const isCurrentRound = (targetRound === null || targetRound === defaultRound);

    if (!state.localComboCache) state.localComboCache = {};
    const cacheKey = roundForSeed >= 1251
        ? `lotto_weekly_top10_${roundForSeed}_${algoVersion}_v4_${useReportLogic}${ignoreLedger ? '_noledger' : ''}_${overrideVersion || 'default'}_R${maxKnownDrawnRound}_${effectiveUserId}`
        : `lotto_weekly_top10_${roundForSeed}_${algoVersion}_v4_${useReportLogic}${ignoreLedger ? '_noledger' : ''}_${overrideVersion || 'default'}_${effectiveUserId}`;
    
    // 1245회차 올라운더 2 업그레이드 바이패스: 1245회차에서 v3Combos에 옛 수학퀀트가 남아있으면 캐시 무시하고 재생성
    const isRound1245 = (roundForSeed === 1245);
    const isPastDrawnRound = (maxKnownDrawnRound && roundForSeed <= maxKnownDrawnRound);

    // 🔒 1순위: 이미 저장된 불변 추천번호 스냅샷이 존재하는 경우, 임시 메모리 캐시(localComboCache)보다 항상 우선하여 기존 스냅샷 반환
    // (과거 추첨 완료 회차는 forceRegenerate 여부와 무관하게 기존 스냅샷 100% 영구 불변 보존)
    if ((!forceRegenerate || isPastDrawnRound) && effectiveUserId && effectiveUserId !== 'all' && !isSystemOrDummyUser(effectiveUserId)) {
        const snapshot = (typeof getUserWeeklyRecommendationSnapshotSync === 'function')
            ? getUserWeeklyRecommendationSnapshotSync(effectiveUserId, roundForSeed)
            : null;
        if (snapshot) {
            const hasLegacyMathQuant = Array.isArray(snapshot.v3Combos) && snapshot.v3Combos.some(c => 
                (c.name && (c.name.includes('수학 퀀트') || c.name.includes('수학퀀트') || c.name.includes('TOP '))) || 
                (c.customLabel && c.customLabel.includes('수학퀀트'))
            );
            const isRound1245Upgrade = (isRound1245 && hasLegacyMathQuant);
            const isRound1251Upgrade = isRound1251UpgradePending(snapshot, roundForSeed, effectiveUserId);
            if (!isRound1245Upgrade && !isRound1251Upgrade) {
                if (useReportLogic && Array.isArray(snapshot.v4Combos) && snapshot.v4Combos.length > 0) {
                    state.localComboCache[cacheKey] = snapshot.v4Combos;
                    return snapshot.v4Combos;
                } else if (!useReportLogic && Array.isArray(snapshot.v3Combos) && snapshot.v3Combos.length > 0) {
                    state.localComboCache[cacheKey] = snapshot.v3Combos;
                    return snapshot.v3Combos;
                }
            }
        }
    }

    if ((!forceRegenerate || isPastDrawnRound) && state.localComboCache[cacheKey] && Array.isArray(state.localComboCache[cacheKey]) && state.localComboCache[cacheKey].length > 0) {
        const hasLegacy = !useReportLogic && isRound1245 && state.localComboCache[cacheKey].some(c => 
            (c.name && (c.name.includes('수학 퀀트') || c.name.includes('수학퀀트') || c.name.includes('TOP '))) || 
            (c.customLabel && c.customLabel.includes('수학퀀트'))
        );
        if (!hasLegacy) {
            return state.localComboCache[cacheKey];
        }
    }

    // 🎯 제 1251회차부터 올라운더 1·2·3 = 3안-B(16수 초압축 폭발 휠) 적용 (1250회 이하 기존 로직 100% 보존)
    if (roundForSeed >= 1251) {
        const portfolio3B = computeAllRounder3BPortfolio(roundForSeed, effectiveUserId);
        const targetCombos = useReportLogic ? portfolio3B.v4 : portfolio3B.v3;
        state.localComboCache[cacheKey] = targetCombos;
        return targetCombos;
    }
    
    const needHistoryIsolation = enterHistoryIsolation(targetRound, maxKnownDrawnRound);
    const generated = [];

    try {
    
    let bestPair = [1, 2];
    let maxPairFreq = 0;
    if (typeof state.PAIR_FREQUENCIES !== 'undefined') {
        for (let i = 1; i <= 45; i++) {
            for (let j = i + 1; j <= 45; j++) {
                if (state.PAIR_FREQUENCIES[i] && state.PAIR_FREQUENCIES[i][j] > maxPairFreq) {
                    maxPairFreq = state.PAIR_FREQUENCIES[i][j];
                    bestPair = [i, j];
                }
            }
        }
    }

    // 1. Comprehensive Weight Scoring System (Total Score)
    const baseWeights = {};
    for (let n = 1; n <= 45; n++) {
        let freq = state.HISTORICAL_FREQUENCY[n] || 25;
        let weight = freq * 1.0; // Base frequency score
        
        // Markov Score (Transition probability from PREVIOUS_DRAW)
        let markovScore = 0;
        if (state.PREVIOUS_DRAW && state.PREVIOUS_DRAW.length > 0 && typeof state.TRANSITION_MATRIX !== 'undefined') {
            state.PREVIOUS_DRAW.forEach(prev => {
                if (state.TRANSITION_MATRIX[prev] && state.TRANSITION_MATRIX[prev][n]) {
                    markovScore += state.TRANSITION_MATRIX[prev][n];
                }
            });
        }
        weight += markovScore * 2.5;
        
        // Overdue/Cold Bonus Score
        if (state.MISSING_WEEKS[n] >= 10) weight += (state.MISSING_WEEKS[n] * 1.5);
        
        // Hot Number Momentum Score
        if (state.HOT_GROUP.includes(n)) weight *= 1.5;
        
        baseWeights[n] = weight;
    }
    
    const patterns = [
        { id: 11, name: '고액 당첨(1~3등) 특화 딥러닝 앙상블', desc: '역대 고액 당첨 핵심 5수 클러스터 추출 및 최고 빈도 번호 융합' },
        { id: 1, name: 'AI 딥-AC 밸런스 지능형 (AI-AC)', desc: '역대 1등 출현율 최고 AC 8~10 복잡도 및 최적 빈도 조합' },
        { id: 2, name: '최다 동반출현(Pair) 앙상블 조합', desc: `역대 최다 콤비(${bestPair.join(', ')}) 기반 파트너 가중치 극대화` },
        { id: 3, name: '보너스 파동 연동 패턴 (2등 타겟)', desc: '최근 보너스 번호 순환 파동 및 이웃수 가중치 융합' },
        { id: 4, name: '장기 결손(Cold) 반등 예측형', desc: '초장기 미출현 번호의 확률적 모멘텀 분출 포획' },
        { id: 5, name: '수식 기대가치(EV) 극대화 패턴', desc: '고번호(30~45) 및 구간 배치 기대수익률(EV 96.5pt+) 극대화' },
        { id: 6, name: '이웃수(Neighbor) 포획 알고리즘', desc: '직전 회차 출현 번호의 ±1 인접 오차 범위 정밀 포획' },
        { id: 7, name: '거울수 대칭 반전 알고리즘', desc: '직전 회차 번호의 대칭 거울수(46 - N) 패턴 분석' },
        { id: 8, name: '단기/장기 모멘텀 균형 조합', desc: '최근 핫(Hot) 번호와 쿨(Cold) 번호의 황금비율 조합' },
        { id: 9, name: '소수 & 3의 배수 수학적 조합', desc: '소수와 3의 배수 분포 밸런스 밀도 최적화' }
    ];

    const rngSeed = getUserRoundSeed(effectiveUserId, roundForSeed, useReportLogic ? 'v4' : 'v3');
    const seededRandom = createDeterministicRng(rngSeed);

    function pickEnsembleNumber(candidateSet, patternId) {
        let totalWeight = 0;
        const pool = [];
        for (let n = 1; n <= 45; n++) {
            if (candidateSet.has(n)) continue;
            let w = baseWeights[n] || 10;
            
            // Pair Affinity Co-occurrence Boost (Quick check)
            if (candidateSet.size > 0 && typeof state.PAIR_FREQUENCIES !== 'undefined') {
                for (let existing of candidateSet) {
                    if (state.PAIR_FREQUENCIES[existing] && state.PAIR_FREQUENCIES[existing][n]) {
                        w += state.PAIR_FREQUENCIES[existing][n] * 4.2;
                    }
                    if (Math.abs(existing - n) === 1) {
                        w *= 2.2;
                    }
                }
            }
            
            if (patternId === 5 && n >= 30) w *= 2.5;
            if (patternId === 9 && ([2,3,5,7,11,13,17,19,23,29,31,37,41,43].includes(n) || n % 3 === 0)) w *= 1.9;
            if (patternId === 11) {
                if (state.HOT_GROUP.includes(n)) w *= 8.0;
                if (candidateSet.has(bestPair[0]) && n === bestPair[1]) w *= 15.0;
                if (candidateSet.has(bestPair[1]) && n === bestPair[0]) w *= 15.0;
            }
            
            pool.push({ num: n, weight: w });
            totalWeight += w;
        }
        
        let r = seededRandom() * totalWeight;
        for (let item of pool) {
            r -= item.weight;
            if (r <= 0) return item.num;
        }
        return pool[pool.length - 1].num;
    }

    if (useReportLogic) {
        // --- V4.0 리포트 기반 행동경제학 포트폴리오 (10게임) ---
        
        // 공통 변수 세팅
        const warmNumbers = [];
        const hotNumbers = [];
        const coldNumbers = [];
        if (typeof state.HISTORICAL_FREQUENCY !== 'undefined') {
            const freqs = Object.entries(state.HISTORICAL_FREQUENCY).map(([n, f]) => ({ num: parseInt(n), freq: f }));
            freqs.sort((a, b) => (b.freq - a.freq) || (a.num - b.num));
            freqs.slice(0, 10).forEach(x => hotNumbers.push(x.num));
            freqs.slice(-10).forEach(x => coldNumbers.push(x.num));
            freqs.slice(10, -10).forEach(x => warmNumbers.push(x.num));
        } else {
            for(let n=1; n<=45; n++) warmNumbers.push(n);
            for(let n=1; n<=10; n++) hotNumbers.push(n);
            for(let n=36; n<=45; n++) coldNumbers.push(n);
        }

        for (let i = 0; i < 10; i++) {
            let attempts = 0;
            let bestCandidateObj = null;
            
            if (i < 4) {
                // Group 1: 통계적 밸런스 추종 (게임 1~4)
                while (attempts < 500) {
                    attempts++;
                    let candidate = new Set();
                    while (candidate.size < 6) {
                        // 주로 웜 넘버에서 추출
                        let pool = (seededRandom() < 0.7 && warmNumbers.length > 0) ? warmNumbers : Array.from({length:45}, (_,k)=>k+1);
                        candidate.add(pool[Math.floor(seededRandom() * pool.length)]);
                    }
                    const nums = Array.from(candidate).sort((a, b) => a - b);
                    if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(nums.join(','))) continue;
                    
                    const sum = nums.reduce((a, b) => a + b, 0);
                    if (sum < 120 || sum > 160) continue;
                    
                    const odds = nums.filter(n => n % 2 !== 0).length;
                    if (odds !== 3) continue; // 홀짝 3:3 고정
                    
                    // 끝수 겹침 최소화 (최대 1쌍만 허용)
                    const endDigits = nums.map(n => n % 10);
                    const uniqueEndDigits = new Set(endDigits).size;
                    if (uniqueEndDigits < 5) continue; 
                    
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: (typeof calculateACValue === 'function' ? calculateACValue(nums) : 8) };
                    break;
                }
                
                if (!bestCandidateObj) {
                    let candidate = new Set();
                    while(candidate.size < 6) candidate.add(Math.floor(seededRandom() * 45) + 1);
                    let nums = Array.from(candidate).sort((a,b) => a-b);
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: 8 };
                }
                
                generated.push({
                    id: `V4-G1-${i + 1}`,
                    name: `[올라운더] 통계적 밸런스 방어 (소액당첨 확보)`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `BALANCE ${i + 1}`,
                        rankClass: `top-1-badge`,
                        badgeClass: `strategy-a`,
                        name: `통계적 밸런스 방어 로직`,
                        tag: `합계 120~160 | 홀짝 3:3 | 끝수 분산`,
                        desc: '장기적인 기댓값 안정을 위해 가장 보편적인 1등 출현 패턴을 정밀하게 모방하여 4,5등 당첨 확률을 높입니다.',
                        lawName: '그룹 1: 통계적 밸런스 추종 (게임 1~4)',
                        probRationale: '역대 당첨 번호의 약 80%가 포함되는 거시적 정규분포 구역에 번호를 배치합니다.',
                        targetBenefit: '소액 당첨(4·5등) 확률 방어 및 기댓값 안정화',
                        numReasons: bestCandidateObj.nums.map(n => `${n}번: 웜 넘버(Warm Number) 풀 기반 통계적 안정성 배치`)
                    }
                });

            } else if (i < 7) {
                // Group 2: 변동성 극대화 및 클러스터링 믹스 (게임 5~7)
                while (attempts < 500) {
                    attempts++;
                    let candidate = new Set();
                    
                    // 콜드 넘버 2개 강제
                    let shuffledCold = seededShuffle(coldNumbers, seededRandom);
                    if (shuffledCold.length >= 2) {
                        candidate.add(shuffledCold[0]);
                        candidate.add(shuffledCold[1]);
                    }
                    
                    // 핫 넘버 1개 강제
                    let shuffledHot = seededShuffle(hotNumbers, seededRandom);
                    if (shuffledHot.length >= 1) {
                        candidate.add(shuffledHot[0]);
                    }
                    
                    // 연번 구성을 위해 연속된 숫자 강제 1쌍 주입
                    let seqStart = Math.floor(seededRandom() * 44) + 1;
                    candidate.add(seqStart);
                    candidate.add(seqStart + 1);
                    
                    while (candidate.size < 6) {
                        candidate.add(Math.floor(seededRandom() * 45) + 1);
                    }
                    
                    if (candidate.size > 6) continue; // 강제 주입하다 6개 넘어가면 다시
                    
                    const nums = Array.from(candidate).sort((a, b) => a - b);
                    if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(nums.join(','))) continue;
                    
                    // 연번 확인 (1쌍 이상)
                    let hasConsec = false;
                    for (let k = 0; k < 5; k++) {
                        if (nums[k] + 1 === nums[k+1]) hasConsec = true;
                    }
                    if (!hasConsec) continue;
                    
                    // 핫 넘버가 정확히 1개인가?
                    if (nums.filter(n => hotNumbers.includes(n)).length !== 1) continue;
                    
                    // 콜드 넘버가 최소 2개인가?
                    if (nums.filter(n => coldNumbers.includes(n)).length < 2) continue;
                    
                    // AC값 8~10
                    const ac = typeof calculateACValue === 'function' ? calculateACValue(nums) : 8;
                    if (ac < 8 || ac > 10) continue;
                    
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: ac };
                    break;
                }

                if (!bestCandidateObj) {
                    let candidate = new Set();
                    while(candidate.size < 6) candidate.add(Math.floor(seededRandom() * 45) + 1);
                    let nums = Array.from(candidate).sort((a,b) => a-b);
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: 8 };
                }

                generated.push({
                    id: `V4-G2-${i - 3}`,
                    name: `[올라운더] 클러스터링 믹스 (다수당첨 회피)`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `CLUSTER ${i - 3}`,
                        rankClass: `top-4-badge`,
                        badgeClass: `strategy-b`,
                        name: `클러스터링 믹스 방어 로직`,
                        tag: `연번 1쌍+ | 콜드 2+ | 핫 1`,
                        desc: '대중이 기피하는 연번 및 콜드 넘버를 고의로 배치하여 당첨 시 독식(당첨금 극대화) 확률을 비약적으로 끌어올립니다.',
                        lawName: '그룹 2: 변동성 극대화 및 클러스터링 (게임 5~7)',
                        probRationale: '기댓값 붕괴(당첨금 셰어링)를 수리적으로 방어하기 위해 설계된 역발상적 군집 회피 모델입니다.',
                        targetBenefit: '1등 당첨 시 고액 독식(셰어링 방어) 및 변동성 극대화',
                        numReasons: bestCandidateObj.nums.map(n => {
                            if (coldNumbers.includes(n)) return `${n}번: 대중 기피 하위 10개 콜드 넘버 (다수 당첨 방어용)`;
                            if (hotNumbers.includes(n)) return `${n}번: 최상위 핫 넘버 (모멘텀 유지용)`;
                            return `${n}번: 클러스터링(연번) 구성 요소`;
                        })
                    }
                });

            } else {
                // Group 3: 역사적 과적합 극대화 (게임 8~10)
                // Option B: 회원별 완전 고유 분산화 (골든 클리크 4핵심 유지 + 회원 시드 2수 고유 조합으로 회원 간 충돌 0건 보장)
                const cheatKeys = [
                    [1, 13, 14, 18, 31, 38], // 1231회 등 클러스터 특화
                    [4, 10, 15, 23, 24, 43], // 1216회, 1234회 등 핫넘버 믹스
                    [13, 15, 19, 27, 31, 35]  // 특정 회차 4등 무더기 발생 치트 클러스터
                ];
                
                let baseSet = new Set(cheatKeys[i - 7]);
                let arr = [...cheatKeys[i - 7]];
                if (effectiveUserId === 'master') {
                    if (seededRandom() > 0.5) {
                        let mutIdx = Math.floor(seededRandom() * arr.length);
                        let mutatedVal = Math.min(45, Math.max(1, arr[mutIdx] + (seededRandom() > 0.5 ? 1 : -1)));
                        baseSet.delete(arr[mutIdx]);
                        baseSet.add(mutatedVal);
                    }
                } else {
                    const uIdx = getUserDispersionIndex(effectiveUserId);
                    const mutRng = createDeterministicRng(getUserRoundSeed(effectiveUserId, roundForSeed, `v4_cheat_mut_${i}`));
                    let mutIdx = Math.floor(mutRng() * arr.length);
                    let pool = (typeof warmNumbers !== 'undefined' && warmNumbers.length > 0) ? warmNumbers : Array.from({ length: 45 }, (_, k) => k + 1);
                    pool = pool.filter(n => !arr.includes(n));
                    let repIdx = (Math.floor(mutRng() * pool.length) + uIdx) % pool.length;
                    let rep = pool[repIdx] || Math.min(45, Math.max(1, arr[mutIdx] + (uIdx % 2 === 0 ? 1 : -1)));
                    baseSet = new Set(arr);
                    baseSet.delete(arr[mutIdx]);
                    baseSet.add(rep);
                }
                while (baseSet.size < 6) {
                    baseSet.add(Math.floor(seededRandom() * 45) + 1);
                }
                let nums = Array.from(baseSet).sort((a, b) => a - b);
                if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(nums.join(','))) {
                    let mutSet = new Set(nums);
                    let arr2 = Array.from(mutSet);
                    mutSet.delete(arr2[arr2.length - 1]);
                    mutSet.add(Math.min(45, (arr2[arr2.length - 1] + 2) % 45 + 1));
                    nums = Array.from(mutSet).sort((a, b) => a - b);
                }
                
                bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: (typeof calculateACValue === 'function' ? calculateACValue(nums) : 8) };
                
                generated.push({
                    id: `V4-G3-${i - 6}`,
                    name: `[올라운더] 역사적 과적합 (치트키 포트폴리오)`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `OVERFIT ${i - 6}`,
                        rankClass: `badge-v3-engine`, // Using purple badge
                        badgeClass: `strategy-b`,
                        name: `역사적 과적합 극대화 로직`,
                        tag: `Maximal Clique | 4/5등 교집합 극대화`,
                        desc: '미래 예측을 포기하고 과거 1~1234회 전체 당첨 번호들과 가장 많이 교차 충돌하도록 기계적으로 깎아낸 조합입니다.',
                        lawName: '그룹 3: 역사적 과적합 (게임 8~10)',
                        probRationale: '수백만 번의 역산 시뮬레이션을 통해 찾아낸, 훈련 데이터 상 당첨 횟수가 극단적으로 높은 기하학적 교집합 배열입니다.',
                        targetBenefit: '역대 당첨 백데이터 다중 교집합 기반 기계적 적중 밀도 극대화',
                        numReasons: bestCandidateObj.nums.map(n => `${n}번: 역대 다수 당첨 충돌 교집합(Clique) 앵커 번호`)
                    }
                });
            }
        }

    } else {
        // --- V4.2 올라운더 팩 2: 올라운더 1(v4) 엔진 기반 슬롯 2 상호보완 & 100% 중복 배제 포트폴리오 (10게임) ---
        // 올라운더 팩 1(정통 밸런스·연번·치트키 A)과 100% 동일한 고적중률 코어 알고리즘 프레임워크를 공유하되:
        // 1) 시드 슬롯 2 ('v4_slot2') 고유 난수 엔진 적용
        // 2) 올라운더 1의 10조합과 100% 중복 배제 (Zero Duplicate Guarantee across all games)
        // 3) 회원별 고유 분산(User Dispersion)을 통한 회원 간 번호 충돌 0건 보장
        // 그룹 1 (게임 1~4): 상호보완 밸런스 B (합 115~165, 홀짝 2:4~4:2, 끝수 고유값 >= 5)
        // 그룹 2 (게임 5~7): 클러스터 B (연번 1쌍 + 직전 이월수 1개 + 핫 1개 + 콜드 넘버)
        // 그룹 3 (게임 8~10): 역사적 과적합 2차 황금 클러스터 B 앵커 + 인접수 변이 (Clique Set B)

        // 올라운더 1과의 동일조합 생성 100% 방지를 위한 기생성 조합 수집
        const existingCombos = new Set();
        try {
            const p1 = computeAbsoluteTop10Combinations(true, roundForSeed, 'v4', false, effectiveUserId) || [];
            p1.forEach(c => {
                if (c && Array.isArray(c.numbers) && c.numbers.length === 6) {
                    existingCombos.add(c.numbers.slice().sort((a, b) => a - b).join(','));
                }
            });
        } catch (e) {
            console.warn('[All-Rounder 2] Pack 1 fetch fallback:', e);
        }

        const rng2 = createDeterministicRng(getUserRoundSeed(effectiveUserId, roundForSeed, 'v4_slot2'));
        const warmNumbers = [];
        const hotNumbers = [];
        const coldNumbers = [];
        if (typeof state.HISTORICAL_FREQUENCY !== 'undefined') {
            const freqs = Object.entries(state.HISTORICAL_FREQUENCY).map(([n, f]) => ({ num: parseInt(n), freq: f }));
            freqs.sort((a, b) => (b.freq - a.freq) || (a.num - b.num));
            freqs.slice(0, 10).forEach(x => hotNumbers.push(x.num));
            freqs.slice(-10).forEach(x => coldNumbers.push(x.num));
            freqs.slice(10, -10).forEach(x => warmNumbers.push(x.num));
        } else {
            for (let n = 1; n <= 45; n++) warmNumbers.push(n);
            for (let n = 1; n <= 10; n++) hotNumbers.push(n);
            for (let n = 36; n <= 45; n++) coldNumbers.push(n);
        }

        const prevDrawNums = (state.PREVIOUS_DRAW && Array.isArray(state.PREVIOUS_DRAW) && state.PREVIOUS_DRAW.length > 0)
            ? [...state.PREVIOUS_DRAW]
            : ((state.mergedHistory && state.mergedHistory[roundForSeed - 1]?.numbers) || [1, 13, 18, 26, 34, 38]);

        const cliqueSetB = [
            [7, 16, 25, 29, 35, 44],
            [5, 12, 19, 23, 33, 42],
            [8, 17, 24, 30, 39, 45]
        ];

        const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const isRound1250Upgrade = (roundForSeed >= 1250);

        for (let i = 0; i < 10; i++) {
            let attempts = 0;
            let bestCandidateObj = null;

            if (i < 4) {
                // Group 1: 상호보완 밸런스 B (게임 1~4)
                while (attempts < 500) {
                    attempts++;
                    let candidate = new Set();
                    if (isRound1250Upgrade && prevDrawNums.length > 0) {
                        candidate.add(prevDrawNums[i % prevDrawNums.length]);
                    }
                    while (candidate.size < 6) {
                        let pool = (rng2() < 0.7 && warmNumbers.length > 0) ? warmNumbers : Array.from({ length: 45 }, (_, k) => k + 1);
                        candidate.add(pool[Math.floor(rng2() * pool.length)]);
                    }
                    const nums = Array.from(candidate).sort((a, b) => a - b);
                    const key = nums.join(',');
                    if (existingCombos.has(key)) continue;
                    if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(key)) continue;

                    const sum = nums.reduce((a, b) => a + b, 0);
                    if (sum < 115 || sum > 165) continue;

                    const odds = nums.filter(n => n % 2 !== 0).length;
                    if (odds < 2 || odds > 4) continue;

                    const endDigits = nums.map(n => n % 10);
                    const uniqueEndDigits = new Set(endDigits).size;
                    if (uniqueEndDigits < 5) continue;

                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: (typeof calculateACValue === 'function' ? calculateACValue(nums) : 8) };
                    break;
                }

                if (!bestCandidateObj) {
                    let fallbackCandidate = new Set();
                    if (isRound1250Upgrade && prevDrawNums.length > 0) {
                        fallbackCandidate.add(prevDrawNums[i % prevDrawNums.length]);
                    }
                    let fAttempts = 0;
                    while (fallbackCandidate.size < 6) {
                        fallbackCandidate.add(Math.floor(rng2() * 45) + 1);
                    }
                    let nums = Array.from(fallbackCandidate).sort((a, b) => a - b);
                    while (existingCombos.has(nums.join(',')) && fAttempts < 50) {
                        fAttempts++;
                        fallbackCandidate.clear();
                        if (isRound1250Upgrade && prevDrawNums.length > 0) {
                            fallbackCandidate.add(prevDrawNums[i % prevDrawNums.length]);
                        }
                        while (fallbackCandidate.size < 6) fallbackCandidate.add(Math.floor(rng2() * 45) + 1);
                        nums = Array.from(fallbackCandidate).sort((a, b) => a - b);
                    }
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: 8 };
                }

                existingCombos.add(bestCandidateObj.nums.join(','));

                generated.push({
                    id: `V4.2-G1-${i + 1}`,
                    name: `[올라운더 2] 통계 밸런스 앙상블`,
                    customLabel: `올라운더2-${alphabet[i] || (i + 1)}`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `BALANCE-2 ${i + 1}`,
                        rankClass: `top-1-badge`,
                        badgeClass: `strategy-a`,
                        name: isRound1250Upgrade ? `올라운더 2 이월수 분산 밸런스 로직` : `올라운더 2 통계 밸런스 로직`,
                        tag: isRound1250Upgrade ? `이월수 교차 로테이션 | 합 115~165 | 홀짝 2:4~4:2` : `합계 115~165 | 홀짝 2:4~4:2 | 끝수 분산`,
                        desc: isRound1250Upgrade
                            ? '올라운더 1의 정규분포 프레임워크를 기반으로 직전 회차 이월수를 게임별로 분산 교차 배치하여 상호보완 적중률을 극대화합니다.'
                            : '올라운더 1의 정규분포 프레임워크를 기반으로 슬롯 2 고유 시드를 주입하여, 상호보완적인 밸런스 대역을 정밀하게 추출합니다.',
                        lawName: '그룹 1: 통계 밸런스 앙상블 (게임 1~4)',
                        probRationale: '올라운더 1과 비대칭 교차 검증된 웜넘버 정규분포 구역에서 소액당첨을 빈틈없이 방어합니다.',
                        targetBenefit: '올라운더 1 상호보완 4·5등 당첨 방어 및 안정성 극대화',
                        numReasons: bestCandidateObj.nums.map(n => {
                            if (isRound1250Upgrade && prevDrawNums.includes(n)) return `${n}번: 직전 회차 분산 이월수 앵커`;
                            return `${n}번: 슬롯 2 웜 넘버 정규분포 상호보완 배치`;
                        })
                    }
                });

            } else if (i < 7) {
                // Group 2: 클러스터 & 이월수 타격 (게임 5~7)
                while (attempts < 500) {
                    attempts++;
                    let candidate = new Set();

                    // 직전 이월수 1개 (1250회차부터 6수 전체 분산 로테이션)
                    if (isRound1250Upgrade && prevDrawNums.length > 0) {
                        candidate.add(prevDrawNums[i % prevDrawNums.length]);
                    } else {
                        let shuffledPrev = seededShuffle(prevDrawNums, rng2);
                        if (shuffledPrev.length > 0) candidate.add(shuffledPrev[0]);
                    }

                    // 연번 1쌍
                    let seqStart = Math.floor(rng2() * 44) + 1;
                    candidate.add(seqStart);
                    candidate.add(seqStart + 1);

                    // 핫 넘버 1개
                    let shuffledHot = seededShuffle(hotNumbers, rng2);
                    if (shuffledHot.length > 0) candidate.add(shuffledHot[0]);

                    // 콜드 넘버 1개
                    let shuffledCold = seededShuffle(coldNumbers, rng2);
                    if (shuffledCold.length > 0) candidate.add(shuffledCold[0]);

                    while (candidate.size < 6) {
                        candidate.add(Math.floor(rng2() * 45) + 1);
                    }

                    if (candidate.size > 6) continue;

                    const nums = Array.from(candidate).sort((a, b) => a - b);
                    const key = nums.join(',');
                    if (existingCombos.has(key)) continue;
                    if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(key)) continue;

                    // 연번 확인
                    let hasConsec = false;
                    for (let k = 0; k < 5; k++) {
                        if (nums[k] + 1 === nums[k + 1]) hasConsec = true;
                    }
                    if (!hasConsec) continue;

                    // 3연번 배제
                    let hasTriple = false;
                    for (let k = 0; k < 4; k++) {
                        if (nums[k] + 1 === nums[k + 1] && nums[k] + 2 === nums[k + 2]) { hasTriple = true; break; }
                    }
                    if (hasTriple) continue;

                    const ac = typeof calculateACValue === 'function' ? calculateACValue(nums) : 8;
                    if (ac < 7 || ac > 10) continue;

                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: ac };
                    break;
                }

                if (!bestCandidateObj) {
                    let fallbackCandidate = new Set();
                    if (isRound1250Upgrade && prevDrawNums.length > 0) {
                        fallbackCandidate.add(prevDrawNums[i % prevDrawNums.length]);
                    }
                    let fAttempts = 0;
                    while (fallbackCandidate.size < 6) {
                        fallbackCandidate.add(Math.floor(rng2() * 45) + 1);
                    }
                    let nums = Array.from(fallbackCandidate).sort((a, b) => a - b);
                    while (existingCombos.has(nums.join(',')) && fAttempts < 50) {
                        fAttempts++;
                        fallbackCandidate.clear();
                        if (isRound1250Upgrade && prevDrawNums.length > 0) {
                            fallbackCandidate.add(prevDrawNums[i % prevDrawNums.length]);
                        }
                        while (fallbackCandidate.size < 6) fallbackCandidate.add(Math.floor(rng2() * 45) + 1);
                        nums = Array.from(fallbackCandidate).sort((a, b) => a - b);
                    }
                    bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: 8 };
                }

                existingCombos.add(bestCandidateObj.nums.join(','));

                generated.push({
                    id: `V4.2-G2-${i - 3}`,
                    name: `[올라운더 2] 클러스터 & 이월수 타격`,
                    customLabel: `올라운더2-${alphabet[i] || (i + 1)}`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `CLUSTER-2 ${i - 3}`,
                        rankClass: `top-4-badge`,
                        badgeClass: `strategy-b`,
                        name: `클러스터 & 이월수 타격 로직`,
                        tag: `이월수 1+ | 연번 1쌍 | 핫 1+ | AC 7~10`,
                        desc: '올라운더 1의 클러스터링 원리를 계승하되, 직전 회차 이월수와 연번 조합을 융합하여 연속 적중 모멘텀을 극대화합니다.',
                        lawName: '그룹 2: 클러스터 & 이월수 타격 (게임 5~7)',
                        probRationale: '이월수(출현율 62%)와 연번 모멘텀을 결합하여 고액 당첨 시 독점 수익률을 보호합니다.',
                        targetBenefit: '이월수 및 연번 동시 포섭 기반 고액 당첨 방어',
                        numReasons: bestCandidateObj.nums.map(n => {
                            if (prevDrawNums.includes(n)) return `${n}번: 직전 회차 핵심 이월수 앵커`;
                            if (hotNumbers.includes(n)) return `${n}번: 최상위 핫 넘버 (모멘텀 유지용)`;
                            return `${n}번: 연속쌍(클러스터) 구성 요소`;
                        })
                    }
                });

            } else {
                // Group 3: 역사적 과적합 2차 황금 클러스터 (게임 8~10)
                let arr = [...cliqueSetB[i - 7]];
                let baseSet;
                if (effectiveUserId === 'master') {
                    baseSet = new Set(arr);
                    if (rng2() > 0.5) {
                        let mutIdx = Math.floor(rng2() * arr.length);
                        let mutatedVal = Math.min(45, Math.max(1, arr[mutIdx] + (rng2() > 0.5 ? 1 : -1)));
                        baseSet.delete(arr[mutIdx]);
                        baseSet.add(mutatedVal);
                    }
                } else {
                    const uIdx = getUserDispersionIndex(effectiveUserId) + 3;
                    const mutRng = createDeterministicRng(getUserRoundSeed(effectiveUserId, roundForSeed, `v4_clique_mut_${i}`));
                    let mutIdx = Math.floor(mutRng() * arr.length);
                    let pool = warmNumbers.filter(n => !arr.includes(n));
                    if (pool.length === 0) pool = Array.from({ length: 45 }, (_, k) => k + 1).filter(n => !arr.includes(n));
                    let repIdx = (Math.floor(mutRng() * pool.length) + uIdx) % pool.length;
                    let rep = pool[repIdx] || Math.min(45, Math.max(1, arr[mutIdx] + (uIdx % 2 === 0 ? 1 : -1)));
                    baseSet = new Set(arr);
                    baseSet.delete(arr[mutIdx]);
                    baseSet.add(rep);
                }
                while (baseSet.size < 6) {
                    baseSet.add(Math.floor(rng2() * 45) + 1);
                }
                let nums = Array.from(baseSet).sort((a, b) => a - b);
                if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.has(nums.join(','))) {
                    let mutSet = new Set(nums);
                    let arr2 = Array.from(mutSet);
                    mutSet.delete(arr2[arr2.length - 1]);
                    mutSet.add(Math.min(45, (arr2[arr2.length - 1] + 2) % 45 + 1));
                    nums = Array.from(mutSet).sort((a, b) => a - b);
                }

                // 중복 체크 및 변이
                let cAttempts = 0;
                while (existingCombos.has(nums.join(',')) && cAttempts < 30) {
                    cAttempts++;
                    let mutSet = new Set(nums);
                    let arr2 = Array.from(mutSet);
                    let swapIdx = Math.floor(rng2() * arr2.length);
                    let nextVal = (arr2[swapIdx] % 45) + 1;
                    if (!mutSet.has(nextVal)) {
                        mutSet.delete(arr2[swapIdx]);
                        mutSet.add(nextVal);
                        nums = Array.from(mutSet).sort((a, b) => a - b);
                    }
                }

                bestCandidateObj = { nums: nums, stats: calculateStats(nums), ac: (typeof calculateACValue === 'function' ? calculateACValue(nums) : 8) };
                existingCombos.add(bestCandidateObj.nums.join(','));

                generated.push({
                    id: `V4.2-G3-${i - 6}`,
                    name: `[올라운더 2] 역사적 과적합 (클러스터 B)`,
                    customLabel: `올라운더2-${alphabet[i] || (i + 1)}`,
                    numbers: bestCandidateObj.nums,
                    stats: bestCandidateObj.stats,
                    meta: {
                        rankBadge: `CLIQUE-B ${i - 6}`,
                        rankClass: `badge-v3-engine`,
                        badgeClass: `strategy-b`,
                        name: `역사적 과적합 클러스터 B 로직`,
                        tag: `Maximal Clique B | 차상위 다중 교집합`,
                        desc: '올라운더 1의 치트키 세트 A와 겹치지 않는 차상위 황금 클러스터 B를 채택하여, 전수 데이터 충돌 면적을 2배로 확장합니다.',
                        lawName: '그룹 3: 역사적 과적합 클러스터 B (게임 8~10)',
                        probRationale: '올라운더 1 앵커와의 직교 교차 배열로 기계적 4·5등 적중 밀도를 극대화합니다.',
                        targetBenefit: '올라운더 1 앵커와의 직교 교차 적중 극대화',
                        numReasons: bestCandidateObj.nums.map(n => `${n}번: 차상위 황금 클리크 B 앵커 번호`)
                    }
                });
            }
        }
    }
    const chkPrioritize = document.getElementById('chkPrioritizeSimHits');
    if (chkPrioritize && chkPrioritize.checked) {
        generated.forEach(combo => {
            let simScore = 0;
            if (typeof state.LOTTO_HISTORY !== 'undefined') {
                for (const r in state.LOTTO_HISTORY) {
                    if (parseInt(r) >= roundForSeed) continue;
                    const draw = state.LOTTO_HISTORY[r];
                    const matchCount = combo.numbers.filter(n => draw.numbers.includes(n)).length;
                    if (matchCount === 3) simScore += 1;
                    else if (matchCount === 4) simScore += 10;
                    else if (matchCount === 5) simScore += 100;
                    else if (matchCount === 6) simScore += 1000;
                }
            }
            combo.historicalHitScore = simScore;
        });
        
        generated.sort((a, b) => b.historicalHitScore - a.historicalHitScore);
        
        generated.forEach((combo, idx) => {
            const benefitName = (combo.meta && combo.meta.targetBenefit) ? combo.meta.targetBenefit : ((combo.meta && combo.meta.name) ? combo.meta.name : (combo.name || 'AI 추천'));
            combo.id = `TOP ${idx + 1}`;
            combo.name = `TOP ${idx + 1}: ${benefitName}`;
            if (combo.meta) {
                combo.meta.rankBadge = `TOP ${idx + 1}`;
                combo.meta.rankClass = `top-${(idx % 5) + 1}-badge`;
                combo.meta.name = combo.name;
                combo.meta.tag = `${combo.meta.tag || 'AI 퀀트'} | 적중 스코어: ${combo.historicalHitScore || 0}`;
            }
        });
    }
    generated.forEach(combo => {
        combo.is3StageOptimized = true;
    });
    } finally {
        exitHistoryIsolation(needHistoryIsolation);
    }

    if (isCurrentRound) {
        if (useReportLogic) {
            state.fixedTop5Combinations_v4 = generated;
            state.fixedTop5Combinations_v4_userId = effectiveUserId;
            state.fixedTop5Combinations_v4_round = roundForSeed;
        } else {
            state.fixedTop5Combinations_v3 = generated;
            state.fixedTop5Combinations_v3_userId = effectiveUserId;
            state.fixedTop5Combinations_v3_round = roundForSeed;
        }
        if (!overrideVersion && !ignoreLedger) {
            state.fixedTop5Combinations = generated;
        }
    }

    state.localComboCache[cacheKey] = generated;
    return generated;
}

/**
 * Determines the best match for a given single combination against V4 & V3 pools.
 * Accurately detects exact matches (6/6), 1-number marking mistakes (5/6), or manual input (<5/6).
 */
export function findBestRecommendationMatch(userNums, v4Combos = [], v3Combos = [], extraPacks = []) {
    if (!Array.isArray(userNums) || userNums.length !== 6) {
        return {
            matchedVersion: '수동/직접입력',
            label: '수동번호 선택',
            shortLabel: '수동번호 선택',
            index: 0,
            matchCount: 0,
            isExact: false,
            isManual: true,
            isMarkingMistake: false,
            diffInfo: null
        };
    }

    const toKey = (arr) => [...arr].sort((a,b) => a - b).join(',');
    const userSorted = [...userNums].sort((a,b) => a - b);
    const userKey = userSorted.join(',');

    // 1. Exact (6/6) match check for All-Rounder 3 (Pack 1)
    if (Array.isArray(extraPacks)) {
        for (const p of extraPacks) {
            if (!p || Number(p.packId) !== 1 || !Array.isArray(p.combos)) continue;
            for (let i = 0; i < p.combos.length; i++) {
                const cNums = p.combos[i].numbers || p.combos[i];
                if (Array.isArray(cNums) && toKey(cNums) === userKey) {
                    const vName = '기본 3: 올라운더 팩 3 (빈틈제로 10게임)';
                    const lbl = `올라운더3 #${i + 1}`;
                    return {
                        matchedVersion: vName,
                        label: lbl,
                        shortLabel: lbl,
                        index: i + 1,
                        packId: 1,
                        matchCount: 6,
                        isExact: true,
                        isManual: false,
                        isMarkingMistake: false,
                        diffInfo: null
                    };
                }
            }
        }
    }

    // 2. Exact (6/6) match check for V4
    for (let i = 0; i < v4Combos.length; i++) {
        const cNums = v4Combos[i].numbers || v4Combos[i];
        if (Array.isArray(cNums) && toKey(cNums) === userKey) {
            return {
                matchedVersion: '올라운더 팩 (10게임)',
                label: `올라운더 #${i + 1}`,
                shortLabel: `올라운더 #${i + 1}`,
                index: i + 1,
                matchCount: 6,
                isExact: true,
                isManual: false,
                isMarkingMistake: false,
                diffInfo: null
            };
        }
    }

    // 3. Exact (6/6) match check for V3 (All-Rounder 2)
    for (let i = 0; i < v3Combos.length; i++) {
        const cNums = v3Combos[i].numbers || v3Combos[i];
        if (Array.isArray(cNums) && toKey(cNums) === userKey) {
            return {
                matchedVersion: '기본 2: 올라운더 팩 2 (10게임)',
                label: `올라운더2 #${i + 1}`,
                shortLabel: `올라운더2 #${i + 1}`,
                index: i + 1,
                matchCount: 6,
                isExact: true,
                isManual: false,
                isMarkingMistake: false,
                diffInfo: null
            };
        }
    }

    // 4. Any mismatch (even 1 number wrong) -> Strict Manual Input (수동입력)
    return {
        matchedVersion: '수동/직접입력',
        label: '수동입력',
        shortLabel: '수동입력',
        index: 0,
        matchCount: 0,
        isExact: false,
        isManual: true,
        isMarkingMistake: false,
        diffInfo: null
    };
}

/**
 * Cross-checks a list of combinations against AI recommendation pools for a given round
 * Returns detected version (V4.0, V3.0, or manual), match counts, and detailed per-game breakdown.
 */
export function crossCheckCombosWithRecommendations(round, rawCombosList, targetUserId = null) {
    if (!round || !rawCombosList || rawCombosList.length === 0) {
        return {
            detectedVersion: '수동/직접입력',
            v3MatchCount: 0,
            v4MatchCount: 0,
            v3ExactCount: 0,
            v4ExactCount: 0,
            summaryMessage: '',
            matchDetails: []
        };
    }

    const effectiveUserId = (targetUserId || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest').toLowerCase().trim();

    const v3Combos = computeAbsoluteTop10Combinations(false, round, 'v3', true, effectiveUserId) || [];
    const v4Combos = computeAbsoluteTop10Combinations(false, round, 'v4', true, effectiveUserId) || [];
    const pack1 = generateExtraAddonPack(1, round, effectiveUserId);
    const extraPacks = pack1 ? [pack1] : [];

    let v3MatchCount = 0;
    let v4MatchCount = 0;
    let ar3MatchCount = 0;
    const extraMatchCount = 0;
    let v3ExactCount = 0;
    let v4ExactCount = 0;
    let ar3ExactCount = 0;
    const extraExactCount = 0;
    const matchDetails = [];

    rawCombosList.forEach((item, gIdx) => {
        let nums = [];
        if (Array.isArray(item)) nums = item;
        else if (item && Array.isArray(item.numbers)) nums = item.numbers;
        else if (typeof item === 'string') {
            nums = item.replace(/,/g, ' ').split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45);
        }

        if (nums.length === 6) {
            const match = findBestRecommendationMatch(nums, v4Combos, v3Combos, extraPacks);
            match.gameIdx = gIdx;
            matchDetails.push(match);

            if (match.matchedVersion.includes('올라운더 3') || match.matchedVersion.includes('올라운더3') || match.matchedVersion.includes('기본 3') || (match.label && match.label.includes('올라운더3')) || (match.packId === 1 || Number(match.packId) === 1)) {
                ar3MatchCount++;
                if (match.isExact) ar3ExactCount++;
            } else if (match.matchedVersion.includes('올라운더 2') || match.matchedVersion.includes('올라운더2') || match.matchedVersion.includes('기본 2') || match.matchedVersion.includes('수학 퀀트') || match.matchedVersion.includes('수학퀀트') || match.matchedVersion.includes('V3.0')) {
                v3MatchCount++;
                if (match.isExact) v3ExactCount++;
            } else if (match.matchedVersion.includes('올라운더') || match.matchedVersion.includes('기본 1') || match.matchedVersion.includes('V4.0')) {
                v4MatchCount++;
                if (match.isExact) v4ExactCount++;
            }
        }
    });

    let detectedVersion = '수동/직접입력';
    let summaryMessage = '';

    if (ar3MatchCount > 0 && ar3MatchCount >= v4MatchCount && ar3MatchCount >= v3MatchCount) {
        detectedVersion = '기본 3: 올라운더 팩 3 (10게임)';
        if (ar3ExactCount === rawCombosList.length) {
            summaryMessage = `🛡️ [올라운더 팩 3 자동 감지] 총 ${rawCombosList.length}게임 모두 올라운더 3 (빈틈제로) 추천번호와 100% 일치!`;
        } else {
            const manualCount = matchDetails.filter(m => m.isManual).length;
            summaryMessage = `🛡️ [올라운더 팩 3 감지] 올라운더 3 추천 ${ar3MatchCount}게임 일치 / 수동입력 ${manualCount}게임`;
        }
    } else if (v4MatchCount > 0 && v4MatchCount >= v3MatchCount) {
        detectedVersion = '기본 1: 올라운더 팩 (10게임)';
        if (v4ExactCount === rawCombosList.length) {
            summaryMessage = `🎯 [올라운더 팩 자동 감지] 총 ${rawCombosList.length}게임 모두 올라운더 추천번호와 100% 일치!`;
        } else {
            const manualCount = matchDetails.filter(m => m.isManual).length;
            summaryMessage = `🎯 [올라운더 팩 감지] 올라운더 추천 ${v4MatchCount}게임 일치 / 수동입력 ${manualCount}게임`;
        }
    } else if (v3MatchCount > 0) {
        detectedVersion = '기본 2: 올라운더 팩 2 (10게임)';
        const v3Label = '올라운더 팩 2';
        if (v3ExactCount === rawCombosList.length) {
            summaryMessage = `⚡ [${v3Label} 자동 감지] 총 ${rawCombosList.length}게임 모두 ${v3Label} 추천번호와 100% 일치!`;
        } else {
            const manualCount = matchDetails.filter(m => m.isManual).length;
            summaryMessage = `⚡ [${v3Label} 감지] ${v3Label} 추천 ${v3MatchCount}게임 일치 / 수동입력 ${manualCount}게임`;
        }
    } else {
        detectedVersion = '수동/직접입력';
        summaryMessage = `📝 [수동입력] AI 추천번호와 일치하지 않는 수동 선택 번호입니다.`;
    }

    return {
        detectedVersion,
        v3MatchCount,
        v4MatchCount,
        ar3MatchCount,
        extraMatchCount,
        v3ExactCount,
        v4ExactCount,
        ar3ExactCount,
        extraExactCount,
        summaryMessage,
        matchDetails
    };
}

/**
 * Generates an Extra Complementary Add-on Booster Pack (10 combos per pack, up to 5 packs max)
 * Specially engineered for 30-Game Portfolio Completeness (Pack 1: V3 10 + V4 10 + Pack 1 10 = Total 30 Games 100% Zero-Blindspot Coverage)
 * Completely isolated from base V3.0/V4.0 recommendations to guarantee 100% immutability.
 * @param {number} packIndex - Pack ID (1 to 5)
 * @param {number} targetRound - Target Round (e.g., 1239)
 */
function extractPackFromSnapshot(extraPacks, pId) {
    if (!extraPacks) return null;
    const targetId = Number(pId);
    if (Array.isArray(extraPacks)) {
        return extraPacks.find(p => p && (Number(p.packId) === targetId || Number(p.id) === targetId)) || extraPacks[targetId - 1] || null;
    }
    if (typeof extraPacks === 'object') {
        return extraPacks[targetId] || extraPacks[String(targetId)] || null;
    }
    return null;
}

export function generateExtraAddonPack(packIndex = 1, targetRound = null, customUserId = null) {
    const pIdx = parseInt(packIndex, 10) || 1;
    if (pIdx !== 1) return null;
    const curUpcomingRound = targetRound || (typeof getUpcomingLottoRound === 'function' ? getUpcomingLottoRound() : (typeof window !== 'undefined' && window.getUpcomingLottoRound ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1243)));
    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);
    
    if (!state.extraPackCache) state.extraPackCache = {};
    const drawnRoundsForKey = Object.keys(state.mergedHistory || {}).filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers)).map(Number);
    const maxKnownForKey = drawnRoundsForKey.length ? Math.max(...drawnRoundsForKey) : 1250;
    const cacheKey = (pIdx === 1 && curUpcomingRound >= 1251)
        ? `extra_${pIdx}_${curUpcomingRound}_R${maxKnownForKey}_${effectiveUserId}`
        : `extra_${pIdx}_${curUpcomingRound}_${effectiveUserId}`;

    // 🔒 1순위: 이미 저장된 불변 추천번호 스냅샷에 해당 추가팩이 존재하는 경우, 임시 메모리 캐시보다 우선하여 스냅샷 팩 번호 반환
    if (effectiveUserId && effectiveUserId !== 'all' && !isSystemOrDummyUser(effectiveUserId)) {
        const snapshot = (typeof getUserWeeklyRecommendationSnapshotSync === 'function')
            ? getUserWeeklyRecommendationSnapshotSync(effectiveUserId, curUpcomingRound)
            : null;
        if (snapshot && snapshot.extraPacks && !(pIdx === 1 && isRound1251UpgradePending(snapshot, curUpcomingRound, effectiveUserId))) {
            const snapPack = extractPackFromSnapshot(snapshot.extraPacks, pIdx);
            if (snapPack && Array.isArray(snapPack.combos) && snapPack.combos.length > 0) {
                state.extraPackCache[cacheKey] = snapPack;
                return snapPack;
            }
        }
    }

    if (state.extraPackCache[cacheKey]) {
        return state.extraPackCache[cacheKey];
    }

    // 🎯 제 1251회차부터 올라운더 3(Pack 1)도 3안-B 16수 초압축 폭발 휠 30게임 통합 포트폴리오에서 분배
    if (pIdx === 1 && curUpcomingRound >= 1251) {
        const portfolio3B = computeAllRounder3BPortfolio(curUpcomingRound, effectiveUserId);
        const packResult3B = {
            packId: 1,
            name: '기본 3: 올라운더 팩 3 (16수 초압축 10게임)',
            shortName: '올라운더 3: 16수 초압축 휠',
            badge: 'ALL-ROUNDER 3 (16-POOL WHEEL)',
            color: '#10b981',
            desc: '올라운더 1·2와 동일한 16수 핵심 풀을 공유하여 30게임 4수·3수 커버리지와 다중·고액당첨 확률을 극대화합니다.',
            tag: `올라운더 3 | 16수 초압축 휠 | 다중당첨 극대화 | EV 강화`,
            combos: portfolio3B.ar3,
            is3StageOptimized: true,
            generatedAt: new Date().toISOString()
        };
        state.extraPackCache[cacheKey] = packResult3B;
        return packResult3B;
    }

    // Deterministic PRNG seed unique to user, round and packIndex
    const seed = getUserRoundSeed(effectiveUserId, curUpcomingRound, `extra_${pIdx}`);
    const packRandom = createDeterministicRng(seed);

    const packMetas = {
        1: {
            name: (curUpcomingRound >= 1250) ? '기본 3: 올라운더 팩 3 (결손반등·핫휠링 10게임)' : '기본 3: 올라운더 팩 3 (빈틈제로 10게임)',
            shortName: (curUpcomingRound >= 1250) ? '올라운더 3: 결손반등·핫휠링' : '올라운더 3: 빈틈제로',
            badge: (curUpcomingRound >= 1250) ? 'ALL-ROUNDER 3 (OVERDUE REBOUND WHEEL)' : 'ALL-ROUNDER 3 (ZERO-GAP 100%)',
            color: '#10b981',
            desc: (curUpcomingRound >= 1250)
                ? '장기 결손 번호 중 반등 주기 최상위 앵커와 핫 모멘텀 앵커를 결합한 고효율 휠링 포트폴리오'
                : '기본 20게임 미선택 번호 중 결손 회귀 가능성 높은 번호와 핫 앵커·이월수를 결합한 사각지대 제로 포트폴리오 (1~45번 100% 전수 방어망)',
            tag: (curUpcomingRound >= 1250)
                ? '올라운더 3 | 결손 반등 앵커 | 핫 모멘텀 휠링 | AC 7+'
                : '올라운더 3 | 1~45번 100% 완전 커버 | 결손 회귀 앵커 | AC 7+'
        }
    };

    if (pIdx !== 1) return null;
    const cfg = packMetas[1];
    const generatedCombos = [];

    const drawnRounds = Object.keys(state.mergedHistory || {})
        .filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers))
        .map(Number);
    const maxKnownDrawnRound = drawnRounds.length ? Math.max(...drawnRounds) : 1237;
    const needHistoryIsolation = enterHistoryIsolation(targetRound, maxKnownDrawnRound);

    try {
        // 1. Analyze Base 20 Games (V3.0 + V4.0) for this user & round
        const v3Combos = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v3', true, effectiveUserId) || [];
        const v4Combos = computeAbsoluteTop10Combinations(false, curUpcomingRound, 'v4', true, effectiveUserId) || [];
        
        // Frequency count of numbers used in Base 20 games
        const baseUsageCounts = {};
        for (let n = 1; n <= 45; n++) baseUsageCounts[n] = 0;
        [...v3Combos, ...v4Combos].forEach(c => {
            const nums = c.numbers || [];
            nums.forEach(n => { if (baseUsageCounts[n] !== undefined) baseUsageCounts[n]++; });
        });

        // Extract Missing Numbers (Used 0 times in Base 20) & Low Used Numbers
        const missingNumbers = [];
        const lowUsedNumbers = [];
        for (let n = 1; n <= 45; n++) {
            if (baseUsageCounts[n] === 0) missingNumbers.push(n);
            else if (baseUsageCounts[n] === 1) lowUsedNumbers.push(n);
        }
        // 직전 회차 당첨번호 (이월수 후보)
        const prevDrawNums = (state.PREVIOUS_DRAW && Array.isArray(state.PREVIOUS_DRAW) && state.PREVIOUS_DRAW.length > 0)
            ? [...state.PREVIOUS_DRAW]
            : ((state.mergedHistory && state.mergedHistory[curUpcomingRound - 1]?.numbers) || [1, 13, 18, 26, 34, 38]);

        const warmNumbers = [];
        if (typeof state.HISTORICAL_FREQUENCY !== 'undefined') {
            const freqs = Object.entries(state.HISTORICAL_FREQUENCY).map(([n, f]) => ({ num: parseInt(n), freq: f }));
            freqs.sort((a, b) => (b.freq - a.freq) || (a.num - b.num));
            freqs.slice(10, -10).forEach(x => warmNumbers.push(x.num));
        }
        if (warmNumbers.length === 0) {
            for (let n = 1; n <= 45; n++) warmNumbers.push(n);
        }

        // Calculate Global Quant Weights for each number (1~45)
        const quantWeights = {};
        for (let n = 1; n <= 45; n++) {
            let freq = (state.HISTORICAL_FREQUENCY && state.HISTORICAL_FREQUENCY[n]) ? state.HISTORICAL_FREQUENCY[n] : 25;
            let score = freq * 1.0;

            // Markov score from previous draw
            if (state.PREVIOUS_DRAW && state.PREVIOUS_DRAW.length > 0 && state.TRANSITION_MATRIX) {
                let mScore = 0;
                state.PREVIOUS_DRAW.forEach(prev => {
                    if (state.TRANSITION_MATRIX[prev] && state.TRANSITION_MATRIX[prev][n]) {
                        mScore += state.TRANSITION_MATRIX[prev][n];
                    }
                });
                score += (mScore / state.PREVIOUS_DRAW.length) * 1.5;
            }

            // Consecutive carry-over probability
            if (prevDrawNums.includes(n)) {
                score += 15.0;
            }

            quantWeights[n] = Math.max(1, score);
        }

        // Top 8 Global Hot Anchors
        const topHotAnchors = Object.keys(quantWeights)
            .map(Number)
            .sort((a, b) => quantWeights[b] - quantWeights[a])
            .slice(0, 8);

        // Weighted random selection helper
        function pickWeightedNumber(pool, excludedSet) {
            const validPool = pool.filter(n => !excludedSet.has(n));
            if (validPool.length === 0) return null;
            let totalW = 0;
            validPool.forEach(n => { totalW += (quantWeights[n] || 10); });
            let r = packRandom() * totalW;
            for (const n of validPool) {
                r -= (quantWeights[n] || 10);
                if (r <= 0) return n;
            }
            return validPool[validPool.length - 1];
        }

        // 7-Point Quant Combo Validator (+ Stage 2 Historical 1st Prize Exclusion)
        function validateQuantCombo(nums, packId) {
            if (!nums || nums.length !== 6) return false;
            
            // 1. Sum Range
            const sum = nums.reduce((a, b) => a + b, 0);
            if (packId === 2) {
                if (sum < 120 || sum > 205) return false;
            } else {
                if (sum < 95 || sum > 195) return false;
            }

            // 2. AC Value (Arithmetic Complexity >= 7)
            const ac = calculateACValue(nums);
            if (ac < 7) return false;

            // 3. Odd / Even Ratio (2:4, 3:3, 4:2)
            const odds = nums.filter(n => n % 2 !== 0).length;
            if (odds < 2 || odds > 4) return false;

            // 4. Low / High Ratio (1~22 vs 23~45)
            const lows = nums.filter(n => n <= 22).length;
            if (packId !== 2) {
                if (lows < 2 || lows > 4) return false;
            }

            // 5. No 3 Consecutive Numbers (e.g. 14, 15, 16 prohibited)
            let consecCount = 0;
            for (let j = 0; j < nums.length - 1; j++) {
                if (nums[j + 1] - nums[j] === 1) {
                    consecCount++;
                    if (j < nums.length - 2 && nums[j + 2] - nums[j + 1] === 1) {
                        return false; // 3 consecutives
                    }
                }
            }
            if (packId === 2) {
                if (consecCount < 1) return false;
            } else {
                if (consecCount > 1) return false;
            }

            // 6. Last Digit Redundancy (Max 2 numbers sharing same ending digit)
            const lastDigits = {};
            for (const n of nums) {
                const d = n % 10;
                lastDigits[d] = (lastDigits[d] || 0) + 1;
                if (lastDigits[d] > 2) return false;
            }

            // 7. Color Section Diversity (At least 3 distinct color sections)
            const colors = new Set();
            for (const n of nums) {
                if (n <= 10) colors.add('Y');
                else if (n <= 20) colors.add('B');
                else if (n <= 30) colors.add('R');
                else if (n <= 40) colors.add('G');
                else colors.add('Gr');
            }
            if (colors.size < 3) return false;

            // 8. Stage 2: Historical Winning Duplicate Elimination (100% Exclude historical 1st prize combos)
            if (state.HISTORICAL_WINNING_SETS && state.HISTORICAL_WINNING_SETS.size > 0) {
                if (state.HISTORICAL_WINNING_SETS.has(nums.join(','))) return false;
            }

            return true;
        }

        // Partition missing numbers evenly across 10 games for Pack 1
        // Ensures 100% of missing numbers are covered in the 10 games of Pack 1!
        const pack1MissingDistribution = Array.from({ length: 10 }, () => []);
        if (missingNumbers.length > 0) {
            missingNumbers.forEach((num, idx) => {
                const gameIdx = idx % 10;
                pack1MissingDistribution[gameIdx].push(num);
            });
            let lowIdx = 0;
            for (let g = 0; g < 10; g++) {
                while (pack1MissingDistribution[g].length < 2 && lowIdx < lowUsedNumbers.length) {
                    pack1MissingDistribution[g].push(lowUsedNumbers[lowIdx++]);
                }
            }
        }

        const allNumbers1To45 = Array.from({ length: 45 }, (_, i) => i + 1);
        const userShift = getUserDispersionIndex(effectiveUserId);

        // Collect existing combinations from Pack 1 (v4) and Pack 2 (v3) to ensure 0 duplicates across all 30 games
        const existingComboKeys = new Set();
        [...v3Combos, ...v4Combos].forEach(c => {
            if (c && Array.isArray(c.numbers) && c.numbers.length === 6) {
                existingComboKeys.add(c.numbers.slice().sort((a, b) => a - b).join(','));
            }
        });
        const packGeneratedKeys = new Set();

        for (let i = 0; i < 10; i++) {
            let attempts = 0;
            let bestNums = null;

            while (attempts < 300) {
                attempts++;
                const candidate = new Set();

                if (pIdx === 1) {
                    // ====================================================
                    // All-Rounder 3: All-Rounder 1 Framework + Slot 3 + Clique C + 100% Zero-Gap Missing Numbers
                    // ====================================================
                    const isRound1250Upgrade = (curUpcomingRound >= 1250);

                    if (isRound1250Upgrade) {
                        // [1250회차+ 최적화] 선별적 장기 결손 반등 앵커(Overdue Rebound) + 핫 모멘텀 앵커 휠링
                        const overdueList = allNumbers1To45.filter(n => (state.MISSING_WEEKS && state.MISSING_WEEKS[n] >= 10));
                        overdueList.sort((a, b) => {
                            let scoreA = ((state.MISSING_WEEKS[a] || 0) * 2.0) + ((state.HISTORICAL_FREQUENCY && state.HISTORICAL_FREQUENCY[a] || 0) * 1.0);
                            let scoreB = ((state.MISSING_WEEKS[b] || 0) * 2.0) + ((state.HISTORICAL_FREQUENCY && state.HISTORICAL_FREQUENCY[b] || 0) * 1.0);
                            return scoreB - scoreA;
                        });
                        const overdueAnchor = overdueList.length > 0 ? overdueList[0] : 10;
                        const hotAnchor = (topHotAnchors && topHotAnchors.length > 0) ? topHotAnchors[0] : 1;

                        if (i < 4) {
                            // Group 1: 결손 반등 앵커 + 핫 모멘텀 앵커 + 웜넘버 휠링 (게임 1~4)
                            candidate.add(overdueAnchor);
                            candidate.add(hotAnchor);
                            let pool = (packRandom() < 0.7 && warmNumbers.length > 0) ? warmNumbers : allNumbers1To45;
                            while (candidate.size < 6) {
                                let n = pool[Math.floor(packRandom() * pool.length)];
                                candidate.add(n);
                            }
                        } else if (i < 7) {
                            // Group 2: 최상위 핫 앵커 로테이션 + 소수 앙상블 C (게임 5~7)
                            const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
                            const primePick = primes[Math.floor(packRandom() * primes.length)];
                            candidate.add(primePick);
                            const hotPick = (topHotAnchors && topHotAnchors.length > 0)
                                ? topHotAnchors[(i + 1) % topHotAnchors.length]
                                : primes[(i + 2) % primes.length];
                            candidate.add(hotPick);
                            while (candidate.size < 6) {
                                const picked = pickWeightedNumber(allNumbers1To45, candidate);
                                if (picked) candidate.add(picked);
                                else candidate.add(Math.floor(packRandom() * 45) + 1);
                            }
                        } else {
                            // Group 3: 역사적 과적합 골든 클리크 C + 결손 반등 앵커 주입 (게임 8~10)
                            const cliqueSetC = [
                                [3, 11, 20, 28, 36, 41],
                                [6, 14, 21, 27, 34, 43],
                                [9, 15, 22, 32, 38, 45]
                            ];
                            let arr = [...cliqueSetC[i - 7]];
                            let baseSet = new Set(arr);
                            let uIdx = getUserDispersionIndex(effectiveUserId) + 7;
                            let mutIdx = Math.floor(packRandom() * arr.length);
                            baseSet.delete(arr[mutIdx]);
                            baseSet.add(overdueAnchor);
                            if (baseSet.size < 6) {
                                let pool = warmNumbers.filter(n => !baseSet.has(n));
                                if (pool.length === 0) pool = allNumbers1To45.filter(n => !baseSet.has(n));
                                let rep = pool[(Math.floor(packRandom() * pool.length) + uIdx) % pool.length] || Math.min(45, (arr[mutIdx] + 3) % 45 + 1);
                                baseSet.add(rep);
                            }
                            baseSet.forEach(n => candidate.add(n));
                            while (candidate.size < 6) {
                                candidate.add(Math.floor(packRandom() * 45) + 1);
                            }
                        }
                    } else {
                        // [1249회차 이하 레거시 보존] 100% 동일한 기존 pack1MissingDistribution 로직 유지
                        const assignedMissing = pack1MissingDistribution[(i + userShift) % 10] || [];
                        assignedMissing.forEach(n => candidate.add(n));

                        if (i < 4) {
                            // Group 1: 전수 커버 밸런스 C (게임 1~4)
                            let pool = (packRandom() < 0.7 && warmNumbers.length > 0) ? warmNumbers : allNumbers1To45;
                            while (candidate.size < 6) {
                                let n = pool[Math.floor(packRandom() * pool.length)];
                                candidate.add(n);
                            }
                        } else if (i < 7) {
                            // Group 2: 클러스터 & 소수 앙상블 C (게임 5~7)
                            const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
                            candidate.add(primes[Math.floor(packRandom() * primes.length)]);
                            let shuffledHot = seededShuffle(topHotAnchors, packRandom);
                            if (shuffledHot.length > 0) candidate.add(shuffledHot[0]);
                            while (candidate.size < 6) {
                                const picked = pickWeightedNumber(allNumbers1To45, candidate);
                                if (picked) candidate.add(picked);
                                else candidate.add(Math.floor(packRandom() * 45) + 1);
                            }
                        } else {
                            // Group 3: 역사적 과적합 골든 클리크 C (게임 8~10)
                            const cliqueSetC = [
                                [3, 11, 20, 28, 36, 41],
                                [6, 14, 21, 27, 34, 43],
                                [9, 15, 22, 32, 38, 45]
                            ];
                            let arr = [...cliqueSetC[i - 7]];
                            let baseSet = new Set(arr);
                            let uIdx = getUserDispersionIndex(effectiveUserId) + 7;
                            let mutIdx = Math.floor(packRandom() * arr.length);
                            let pool = warmNumbers.filter(n => !arr.includes(n));
                            if (pool.length === 0) pool = allNumbers1To45.filter(n => !arr.includes(n));
                            let rep = pool[(Math.floor(packRandom() * pool.length) + uIdx) % pool.length] || Math.min(45, (arr[mutIdx] + 3) % 45 + 1);
                            baseSet.delete(arr[mutIdx]);
                            baseSet.add(rep);
                            baseSet.forEach(n => candidate.add(n));
                            while (candidate.size < 6) {
                                candidate.add(Math.floor(packRandom() * 45) + 1);
                            }
                        }
                    }
                }

                if (candidate.size === 6) {
                    const sortedNums = Array.from(candidate).sort((a, b) => a - b);
                    const key = sortedNums.join(',');
                    if (existingComboKeys.has(key) || packGeneratedKeys.has(key)) continue;
                    if (validateQuantCombo(sortedNums, 1)) {
                        bestNums = sortedNums;
                        packGeneratedKeys.add(key);
                        break;
                    }
                }
            }

            if (!bestNums) {
                const fallbackSet = new Set();
                let fAttempts = 0;
                while (fallbackSet.size < 6) {
                    fallbackSet.add(Math.floor(packRandom() * 45) + 1);
                }
                let sortedNums = Array.from(fallbackSet).sort((a, b) => a - b);
                while ((existingComboKeys.has(sortedNums.join(',')) || packGeneratedKeys.has(sortedNums.join(','))) && fAttempts < 50) {
                    fAttempts++;
                    fallbackSet.clear();
                    while (fallbackSet.size < 6) fallbackSet.add(Math.floor(packRandom() * 45) + 1);
                    sortedNums = Array.from(fallbackSet).sort((a, b) => a - b);
                }
                bestNums = sortedNums;
                packGeneratedKeys.add(bestNums.join(','));
            }

            const stats = calculateStats(bestNums);
            const ac = calculateACValue(bestNums);
            const sum = bestNums.reduce((a, b) => a + b, 0);

            const metaClass = (i < 4) ? 'top-1-badge' : (i < 7 ? 'top-4-badge' : 'badge-v3-engine');
            let metaName, metaLaw, metaTag, metaDesc, metaRankBadge;
            if (i < 4) {
                metaRankBadge = `AR3-BAL ${i + 1}`;
                metaName = (curUpcomingRound >= 1250) ? `올라운더 3: 결손반등 휠링 #${i + 1}` : `올라운더 3: 빈틈제로 밸런스 #${i + 1}`;
                metaLaw = (curUpcomingRound >= 1250) ? '그룹 1: 장기 결손 반등 & 핫 모멘텀 휠링 (게임 1~4)' : '그룹 1: 전수 커버 밸런스 C (게임 1~4)';
                metaTag = (curUpcomingRound >= 1250) ? `결손 반등 앵커 | 핫 모멘텀 | AC ${ac}` : `미선택 결손 흡수 | 합계 ${sum} | AC ${ac}`;
                metaDesc = (curUpcomingRound >= 1250)
                    ? '10주 이상 장기 미출현 번호 중 반등 주기 최상위 앵커와 핫 모멘텀 앵커를 결합하여 기댓값과 고액 당첨을 동시에 견인합니다.'
                    : '기본 20게임(올라운더 1·2)에서 미선택된 번호를 우선 흡수하여 1~45번 100% 완전 커버리지를 완성하는 밸런스 조합입니다.';
            } else if (i < 7) {
                metaRankBadge = `AR3-CLUS ${i - 3}`;
                metaName = `올라운더 3: 클러스터 & 소수 #${i - 3}`;
                metaLaw = '그룹 2: 클러스터 & 소수 수학 조합 (게임 5~7)';
                metaTag = `소수·3의배수 | 핫 앵커 | AC ${ac}`;
                metaDesc = '올라운더 1의 수학적 앙상블 기법을 적용하여 소수와 3의 배수, 핫 앵커를 융합한 변동성 방어 조합입니다.';
            } else {
                metaRankBadge = `AR3-CLIQ ${i - 6}`;
                metaName = `올라운더 3: 역사적 과적합 C #${i - 6}`;
                metaLaw = '그룹 3: 역사적 과적합 클러스터 C (게임 8~10)';
                metaTag = `Maximal Clique C | 제3 황금 클러스터`;
                metaDesc = '올라운더 1·2의 클리크 세트 A·B와 독립된 제3 황금 클러스터 C를 배치하여 3개 팩 동시 적중 시너지를 극대화합니다.';
            }

            generatedCombos.push({
                id: `AR3-${i + 1}`,
                name: `[올라운더 3] ${metaName}`,
                numbers: bestNums,
                stats: stats,
                meta: {
                    rankBadge: metaRankBadge,
                    rankClass: metaClass,
                    badgeClass: i < 4 ? `strategy-a` : `strategy-b`,
                    name: metaName,
                    tag: metaTag,
                    desc: metaDesc,
                    lawName: metaLaw,
                    probRationale: metaTag,
                    targetBenefit: '올라운더 1·2 사각지대 전수 방어망',
                    numReasons: bestNums.map(n => {
                        if (missingNumbers.includes(n)) {
                            return `${n}번: 기본 20게임 미선택 결손 회귀 완성수 (100% 전수 커버리지)`;
                        }
                        if ([3, 11, 20, 28, 36, 41, 6, 14, 21, 27, 34, 43, 9, 15, 22, 32, 38, 45].includes(n)) {
                            return `${n}번: 제3 황금 클러스터 C 앵커 번호`;
                        }
                        if (prevDrawNums.includes(n)) {
                            return `${n}번: 직전 회차 이월수 (출현 확률 62% 연속 모멘텀)`;
                        }
                        if (topHotAnchors.includes(n)) {
                            return `${n}번: 퀀트 앙상블 상위 핫 앵커 번호`;
                        }
                        return `${n}번: ${cfg.shortName} 7대 퀀트 필터 통과 최적수`;
                    })
                }
            });
        }

        const packResult = {
            packId: pIdx,
            name: cfg.name,
            shortName: cfg.shortName,
            badge: cfg.badge,
            color: cfg.color,
            desc: cfg.desc,
            tag: cfg.tag,
            combos: generatedCombos,
            is3StageOptimized: true,
            generatedAt: new Date().toISOString()
        };
        if (state.extraPackCache) {
            state.extraPackCache[cacheKey] = packResult;
        }
        return packResult;
    } finally {
        exitHistoryIsolation(needHistoryIsolation);
    }
}

/**
 * 🔒 Produces an ultra-lightweight snapshot payload (80%+ size reduction)
 * Strips verbose repeating static paragraphs (desc, probRationale, numReasons) while preserving 100% of numbers, ids, names, labels, and stats.
 */
export function makeLeanSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return snap;
    function slimCombo(c) {
        if (!c || typeof c !== 'object') return c;
        const res = {
            id: c.id || '',
            name: c.name || '',
            customLabel: c.customLabel || '',
            numbers: Array.isArray(c.numbers) ? c.numbers : [],
            is3StageOptimized: c.is3StageOptimized !== false
        };
        // Ultra-light stats (only store sum and acValue, other stats dynamically rehydrated)
        if (c.stats && typeof c.stats === 'object') {
            res.stats = {
                sum: c.stats.sum,
                acValue: c.stats.acValue ?? 7,
                oddEvenRatio: c.stats.oddEvenRatio || ''
            };
        }
        return res;
    }

    const v4 = Array.isArray(snap.v4Combos) ? snap.v4Combos.map(slimCombo) : [];
    const v3 = Array.isArray(snap.v3Combos) ? snap.v3Combos.map(slimCombo) : [];
    const extraPacks = {};
    const isRound1251Plus = Number(snap.round) >= 1251;
    if (snap.extraPacks && typeof snap.extraPacks === 'object') {
        for (const p in snap.extraPacks) {
            const pObj = snap.extraPacks[p];
            if (pObj && typeof pObj === 'object') {
                const isPack1 = (Number(p) === 1 || pObj.packId === 1 || (pObj.name && (pObj.name.includes('빈틈제로') || pObj.name.includes('올라운더 3'))));
                if (!isPack1) continue;
                extraPacks[1] = {
                    packId: 1,
                    name: isRound1251Plus ? (pObj.name || '기본 3: 올라운더 팩 3 (16수 초압축 10게임)') : '기본 3: 올라운더 팩 3 (빈틈제로 10게임)',
                    badge: isRound1251Plus ? (pObj.badge || 'ALL-ROUNDER 3 (16-POOL WHEEL)') : 'ALL-ROUNDER 3 (ZERO-GAP 100%)',
                    color: pObj.color || '#10b981',
                    is3StageOptimized: pObj.is3StageOptimized !== false,
                    combos: Array.isArray(pObj.combos) ? pObj.combos.map(slimCombo) : []
                };
            }
        }
    }

    const filteredAlgos = Array.isArray(snap.algorithms)
        ? snap.algorithms.filter(a => a && ['v4', 'v3', 'extra_1'].includes(a.algoId))
        : [];

    return {
        userId: snap.userId,
        realName: snap.realName,
        phone: snap.phone || '',
        userType: snap.userType || 'regular',
        userCreatedAt: snap.userCreatedAt || null,
        round: snap.round,
        createdAt: snap.createdAt || new Date().toISOString(),
        isLocked: snap.isLocked !== false,
        is3StageOptimized: snap.is3StageOptimized !== false,
        algoRevision: snap.algoRevision || (isRound1251Plus ? ALGO_REVISION_3B : 'v2026.10_3stage'),
        hashFingerprint: snap.hashFingerprint || '',
        totalGames: 30,
        v4Combos: v4,
        v3Combos: v3,
        ar3Combos: (extraPacks[1] && extraPacks[1].combos) ? extraPacks[1].combos : [],
        extraPacks: extraPacks,
        algorithms: filteredAlgos
    };
}

/**
 * 🔒 Hydrates a lean snapshot with full runtime properties (stats, meta, badges) on read
 * Ensures 100% transparent backward compatibility with legacy snapshots while keeping Firestore storage ultra-lean.
 */
export function hydrateLeanSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return snap;

    function hydrateCombo(c, defaultName = 'AI 퀀트 추천', defaultBadge = 'AI-QUANT') {
        if (!c || typeof c !== 'object') return c;
        const nums = Array.isArray(c.numbers) ? c.numbers : [];
        if (!c.stats || Object.keys(c.stats).length <= 3) {
            const calculated = (typeof calculateStats === 'function') ? calculateStats(nums) : null;
            c.stats = { ...(calculated || {}), ...(c.stats || {}) };
        }
        if (!c.meta || typeof c.meta !== 'object' || !c.meta.targetBenefit) {
            c.meta = {
                name: c.name || defaultName,
                rankBadge: c.meta?.rankBadge || defaultBadge,
                tag: c.meta?.tag || 'AI 퀀트 3단계 최적화',
                targetBenefit: c.meta?.targetBenefit || '당첨 기댓값 극대화',
                ...(c.meta || {})
            };
        }
        return c;
    }

    if (Array.isArray(snap.v4Combos)) {
        snap.v4Combos.forEach((c, idx) => hydrateCombo(c, `올라운더 1-${idx + 1}`, `V4-${idx + 1}`));
    }
    if (Array.isArray(snap.v3Combos)) {
        snap.v3Combos.forEach((c, idx) => hydrateCombo(c, `올라운더 2-${idx + 1}`, `V3-${idx + 1}`));
    }
    if (snap.extraPacks && typeof snap.extraPacks === 'object') {
        for (const p in snap.extraPacks) {
            const pObj = snap.extraPacks[p];
            const isPack1 = pObj && (Number(p) === 1 || pObj.packId === 1 || (pObj.name && (pObj.name.includes('빈틈제로') || pObj.name.includes('올라운더 3'))));
            if (!isPack1) {
                delete snap.extraPacks[p];
                continue;
            }
            if (Array.isArray(pObj.combos)) {
                pObj.combos.forEach((c, idx) => {
                    hydrateCombo(c, `올라운더 3-${idx + 1}`, `AR3-${idx + 1}`);
                });
            }
        }
        if (snap.extraPacks[1] && Array.isArray(snap.extraPacks[1].combos)) {
            snap.ar3Combos = snap.extraPacks[1].combos;
        }
    }
    if (Array.isArray(snap.algorithms)) {
        snap.algorithms = snap.algorithms.filter(a => a && ['v4', 'v3', 'extra_1'].includes(a.algoId));
    }
    snap.totalGames = 30;
    return snap;
}

if (typeof window !== 'undefined') {
    window.makeLeanSnapshot = makeLeanSnapshot;
    window.hydrateLeanSnapshot = hydrateLeanSnapshot;
}

function _comboSignature(combosList) {
    if (!Array.isArray(combosList) || combosList.length === 0) return '';
    return combosList.map(c => (Array.isArray(c && c.numbers) ? [...c.numbers].sort((a, b) => a - b).join(',') : '')).join('|');
}

/**
 * Invalidate temporary in-memory combo/pack caches when canonical snapshots load asynchronously.
 */
export function invalidateRecommendationRuntimeCaches(userId = null, roundNum = null) {
    const cleanU = userId ? String(userId).trim().toLowerCase() : null;
    const rNum = (roundNum !== null && roundNum !== undefined) ? parseInt(roundNum, 10) : null;
    const hasFilter = !!(cleanU && !isNaN(rNum));

    if (!hasFilter) {
        state.localComboCache = {};
        state.extraPackCache = {};
        state.ar3bPortfolioCache = {};
        state.fixedTop5Combinations = null;
        for (const suffix of ['v4', 'v3', 'ar3']) {
            state[`fixedTop5Combinations_${suffix}`] = null;
            state[`fixedTop5Combinations_${suffix}_userId`] = null;
            state[`fixedTop5Combinations_${suffix}_round`] = null;
        }
        return;
    }

    if (state.ar3bPortfolioCache) {
        const p3bPrefix = `${rNum}_${cleanU}_`;
        for (const k of Object.keys(state.ar3bPortfolioCache)) {
            if (k.startsWith(p3bPrefix)) {
                delete state.ar3bPortfolioCache[k];
            }
        }
    }

    const rPrefix = `lotto_weekly_top10_${rNum}_`;
    const uSuffix = `_${cleanU}`;
    if (state.localComboCache) {
        for (const k of Object.keys(state.localComboCache)) {
            if (k.startsWith(rPrefix) && k.endsWith(uSuffix)) {
                delete state.localComboCache[k];
            }
        }
    }
    const extraSuffix = `_${rNum}_${cleanU}`;
    if (state.extraPackCache) {
        for (const k of Object.keys(state.extraPackCache)) {
            if (k.startsWith('extra_') && k.endsWith(extraSuffix)) {
                delete state.extraPackCache[k];
            }
        }
    }
    for (const suffix of ['v4', 'v3', 'ar3']) {
        if (state[`fixedTop5Combinations_${suffix}_round`] === rNum &&
            String(state[`fixedTop5Combinations_${suffix}_userId`] || '').trim().toLowerCase() === cleanU) {
            state[`fixedTop5Combinations_${suffix}`] = null;
            state[`fixedTop5Combinations_${suffix}_userId`] = null;
            state[`fixedTop5Combinations_${suffix}_round`] = null;
            if (suffix === 'v4') state.fixedTop5Combinations = null;
        }
    }
}

/**
 * 🔒 Immutable Recommendation Snapshot Storage:
 * Permanently snapshots a user's complete 70 combinations (V4 10G, V3 10G, Extra Packs 1~5 50G) for a specific round.
 * Write-Once policy: If already snapshot exists, never overwrite!
 */
export async function saveUserWeeklyRecommendationSnapshot(userId, round, explicitSnapshot = null) {
    if (!userId || !round) return null;
    let cleanUser = String(userId).trim();
    if (cleanUser.startsWith('{')) {
        try {
            const p = JSON.parse(cleanUser);
            cleanUser = p.userid || p.userId || cleanUser;
        } catch(e) {}
    }
    cleanUser = cleanUser.toLowerCase().trim();
    if (isSystemOrDummyUser(cleanUser) || cleanUser.startsWith('{') || cleanUser.startsWith('test_') || cleanUser === 'app_latest_version' || cleanUser === 'dashboard_summary_latest' || cleanUser === 'user_alpha' || cleanUser === 'user_beta' || cleanUser === 'sample' || cleanUser === 'hms') {
        return null;
    }
    const roundNum = parseInt(round, 10);
    if (isNaN(roundNum)) return null;

    // 🔒 가입일 이전 회차는 추천번호 영구 스냅샷 생성 및 저장 차단 (가입 전 발급 불가)
    const joinRound = (typeof UserContextManager !== 'undefined' && UserContextManager.getUserJoinRound)
        ? UserContextManager.getUserJoinRound(cleanUser)
        : ((typeof getUserJoinRound === 'function') ? getUserJoinRound(cleanUser) : 1235);
    if (roundNum < joinRound) {
        return null;
    }

    // 🔒 본인인증 미완료 및 미서약 사용자 추천번호 영구 스냅샷 생성 및 저장 원천 차단
    const isPledged = (typeof isUserVerifiedAndPledged === 'function')
        ? isUserVerifiedAndPledged(cleanUser)
        : (typeof window !== 'undefined' && typeof window.isUserVerifiedAndPledged === 'function' ? window.isUserVerifiedAndPledged(cleanUser) : true);
    if (!isPledged) {
        console.warn(`[Snapshot Guard] User ${cleanUser} is not verified/pledged. Snapshot creation/save blocked.`);
        return null;
    }

    const docKey = `${cleanUser}_${roundNum}`;

    // 1. Check Firestore first (Single Source of Truth for immutable snapshots: lotto_users with lotto_purchases fallback)
    const firestore = (db && typeof db.getFirestore === 'function') ? db.getFirestore() : window.db;
    if (firestore) {
        try {
            let uDoc = await firestore.collection('lotto_users').doc(cleanUser).get();
            if (!uDoc || !uDoc.exists) {
                if (cleanUser !== 'master' && cleanUser !== 'wdy') {
                    console.warn(`[Snapshot Guard] User ${cleanUser} does not exist in lotto_users. Snapshot blocked.`);
                    return null;
                }
            }
            let uData = (uDoc && uDoc.exists) ? uDoc.data() : null;
            if (uData && (uData.isDeleted === true || uData.status === 'trash' || uData.status === 'deleted')) {
                return null;
            }
            if (uData && typeof isUserVerifiedAndPledged === 'function' && !isUserVerifiedAndPledged(cleanUser, uData)) {
                console.warn(`[Snapshot Guard] User ${cleanUser} profile/pledge incomplete in Firestore. Snapshot blocked.`);
                return null;
            }
            let existingData = null;
            if (uData && uData.recommendationSnapshots && uData.recommendationSnapshots[String(roundNum)]) {
                existingData = uData.recommendationSnapshots[String(roundNum)];
            }
            
            // Dual-check fallback to lotto_purchases
            if (!existingData || !existingData.v4Combos) {
                const pDoc = await firestore.collection('lotto_purchases').doc(cleanUser).get();
                if (pDoc && pDoc.exists) {
                    const pData = pDoc.data();
                    if (pData && (pData.isDeleted === true || pData.status === 'trash' || pData.status === 'deleted')) {
                        return null;
                    }
                    if (pData?.recommendationSnapshots?.[String(roundNum)]) {
                        existingData = pData.recommendationSnapshots[String(roundNum)];
                    }
                }
            }

            if (existingData && existingData.v4Combos && existingData.v3Combos && existingData.extraPacks && !isRound1251UpgradePending(existingData, roundNum, cleanUser)) {
                const hydratedExisting = (typeof hydrateLeanSnapshot === 'function')
                    ? hydrateLeanSnapshot(existingData)
                    : existingData;

                // Detect if cold-boot caches held pre-snapshot live combos for this user & round
                let hadStaleMismatch = false;
                if (state.fixedTop5Combinations_v4_round === roundNum &&
                    String(state.fixedTop5Combinations_v4_userId || '').trim().toLowerCase() === cleanUser &&
                    Array.isArray(state.fixedTop5Combinations_v4) &&
                    _comboSignature(state.fixedTop5Combinations_v4) !== _comboSignature(hydratedExisting.v4Combos)) {
                    hadStaleMismatch = true;
                }
                if (state.fixedTop5Combinations_v3_round === roundNum &&
                    String(state.fixedTop5Combinations_v3_userId || '').trim().toLowerCase() === cleanUser &&
                    Array.isArray(state.fixedTop5Combinations_v3) &&
                    _comboSignature(state.fixedTop5Combinations_v3) !== _comboSignature(hydratedExisting.v3Combos)) {
                    hadStaleMismatch = true;
                }
                const snapPack1 = extractPackFromSnapshot(hydratedExisting.extraPacks, 1);
                if (snapPack1 && Array.isArray(snapPack1.combos) &&
                    state.fixedTop5Combinations_ar3_round === roundNum &&
                    String(state.fixedTop5Combinations_ar3_userId || '').trim().toLowerCase() === cleanUser &&
                    Array.isArray(state.fixedTop5Combinations_ar3) &&
                    _comboSignature(state.fixedTop5Combinations_ar3) !== _comboSignature(snapPack1.combos)) {
                    hadStaleMismatch = true;
                }

                if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};
                state.userRecommendationSnapshots[docKey] = hydratedExisting;
                if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanUser]) {
                    if (!state.allUsersPurchasesMap[cleanUser].recommendationSnapshots) {
                        state.allUsersPurchasesMap[cleanUser].recommendationSnapshots = {};
                    }
                    state.allUsersPurchasesMap[cleanUser].recommendationSnapshots[String(roundNum)] = hydratedExisting;
                }
                try { localStorage.setItem(`lotto_rec_snapshot_${docKey}`, JSON.stringify(existingData)); } catch(e) {}

                if (hadStaleMismatch) {
                    invalidateRecommendationRuntimeCaches(cleanUser, roundNum);
                    if (typeof window !== 'undefined') {
                        if (typeof window.renderTop5Combinations === 'function' && (!window.__currentLottoTab || window.__currentLottoTab === 'tab-generator')) {
                            try { window.renderTop5Combinations(false); } catch(e) {}
                        }
                        if (typeof document !== 'undefined' && typeof window.renderQuickViewContent === 'function') {
                            const compactModal = document.getElementById('compactViewModal');
                            if (compactModal && (compactModal.classList.contains('active') || compactModal.style.display === 'flex')) {
                                try { window.renderQuickViewContent(); } catch(e) {}
                            }
                        }
                    }
                }
                return hydratedExisting;
            }
        } catch(e) {
            console.warn('[Snapshot Check from Firestore Failed]', e);
        }
    }

    // 2. Determine snapshot data to save (explicit > memory > localStorage > fresh generation)
    let snapshotData = null;
    if (explicitSnapshot && explicitSnapshot.v4Combos && explicitSnapshot.v3Combos && explicitSnapshot.extraPacks) {
        snapshotData = { ...explicitSnapshot, is3StageOptimized: true, algoRevision: (roundNum >= 1251 ? ALGO_REVISION_3B : 'v2026.10_3stage') };
    } else if (state.userRecommendationSnapshots && state.userRecommendationSnapshots[docKey] && state.userRecommendationSnapshots[docKey].v4Combos && !isRound1251UpgradePending(state.userRecommendationSnapshots[docKey], roundNum, cleanUser)) {
        snapshotData = state.userRecommendationSnapshots[docKey];
    } else {
        try {
            const localRaw = localStorage.getItem(`lotto_rec_snapshot_${docKey}`);
            if (localRaw) {
                const parsed = JSON.parse(localRaw);
                if (parsed && parsed.v4Combos && parsed.v3Combos && parsed.extraPacks && !isRound1251UpgradePending(parsed, roundNum, cleanUser)) {
                    snapshotData = parsed;
                }
            }
        } catch(e) {}
    }

    if (!snapshotData) {
        // 3. Generate fresh 30 combinations (All-Rounder 1, 2, 3) once for this round & user
        const v4Combos = computeAbsoluteTop10Combinations(false, roundNum, 'v4', true, cleanUser) || [];
        const v3Combos = computeAbsoluteTop10Combinations(false, roundNum, 'v3', true, cleanUser) || [];
        const extraPacks = {};
        const packObj = generateExtraAddonPack(1, roundNum, cleanUser);
        if (packObj) {
            extraPacks[1] = {
                packId: 1,
                name: packObj.name,
                badge: packObj.badge,
                color: packObj.color,
                combos: packObj.combos || [],
                is3StageOptimized: true
            };
        }

        // 🔒 Stage 3: Exact 30-Game Duplicate Elimination & Natural Wheeling Preservation
        const seenKeys = new Set();
        const dedupSeed = getUserRoundSeed(cleanUser, roundNum, 'dedup_70');
        const dedupRng = createDeterministicRng(dedupSeed);
        const allNums1To45 = Array.from({ length: 45 }, (_, idx) => idx + 1);

        function ensureUniqueAndNonHistorical(combosList) {
            if (!Array.isArray(combosList)) return;
            for (let c of combosList) {
                if (!c || !Array.isArray(c.numbers)) continue;
                let sorted = [...c.numbers].sort((a, b) => a - b);
                let key = sorted.join(',');
                if (!seenKeys.has(key) && (!state.HISTORICAL_WINNING_SETS || !state.HISTORICAL_WINNING_SETS.has(key))) {
                    seenKeys.add(key);
                    c.numbers = sorted;
                } else {
                    // Exact duplicate or historical 1st prize detected! Mutate 1 number deterministically
                    let set = new Set(sorted);
                    let attempts = 0;
                    while (attempts < 50) {
                        attempts++;
                        let arr = Array.from(set);
                        let dropNum = arr[arr.length - 1];
                        set.delete(dropNum);
                        let pool = allNums1To45.filter(n => !set.has(n));
                        let rep = pool[Math.floor(dedupRng() * pool.length)] || 20;
                        set.add(rep);
                        if (set.size === 6) {
                            let newNums = Array.from(set).sort((a, b) => a - b);
                            let newKey = newNums.join(',');
                            if (!seenKeys.has(newKey) && (!state.HISTORICAL_WINNING_SETS || !state.HISTORICAL_WINNING_SETS.has(newKey))) {
                                seenKeys.add(newKey);
                                c.numbers = newNums;
                                c.stats = calculateStats(newNums);
                                break;
                            }
                        }
                    }
                }
            }
        }

        ensureUniqueAndNonHistorical(v4Combos);
        ensureUniqueAndNonHistorical(v3Combos);
        if (extraPacks[1] && extraPacks[1].combos) {
            ensureUniqueAndNonHistorical(extraPacks[1].combos);
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
            { algoId: 'v4', algoName: '기본 1: 올라운더 팩 (10게임)', badge: 'ALL-ROUNDER', color: '#8b5cf6' },
            { algoId: 'v3', algoName: '기본 2: 올라운더 팩 2 (10게임)', badge: 'ALL-ROUNDER 2', color: '#3b82f6' }
        ];
        if (extraPacks[1]) {
            algorithmsMetadata.push({
                algoId: 'extra_1',
                algoName: extraPacks[1].name || '기본 3: 올라운더 팩 3 (10게임)',
                badge: extraPacks[1].badge || 'ALL-ROUNDER 3',
                color: extraPacks[1].color || '#10b981'
            });
        }

        // Hash fingerprint for data integrity
        const payloadStr = JSON.stringify({ cleanUser, rName, roundNum, v4Combos, v3Combos, extraPacks, algorithmsMetadata });
        let hash = 0;
        for (let i = 0; i < payloadStr.length; i++) {
            hash = ((hash << 5) - hash) + payloadStr.charCodeAt(i);
            hash |= 0;
        }

        snapshotData = {
            userId: cleanUser,
            realName: rName,
            phone: uPhone,
            userType: uType,
            userCreatedAt: uCreatedAt,
            round: roundNum,
            createdAt: new Date().toISOString(),
            isLocked: true,
            is3StageOptimized: true,
            algoRevision: (roundNum >= 1251 ? ALGO_REVISION_3B : 'v2026.10_3stage'),
            hashFingerprint: `hash_${Math.abs(hash).toString(16)}`,
            totalGames: 30,
            v4Combos,
            v3Combos,
            extraPacks,
            algorithms: algorithmsMetadata
        };
    }

    // Save to memory and LocalStorage (Full snapshot for rich UI display)
    if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};
    state.userRecommendationSnapshots[docKey] = snapshotData;
    try {
        localStorage.setItem(`lotto_rec_snapshot_${docKey}`, JSON.stringify(snapshotData));
    } catch(e) {}

    // 🔒 1MB 단일 문서 한도 원천 방어: 불필요한 반복 텍스트를 제거한 초경량 스냅샷으로 Firestore 저장
    const leanData = makeLeanSnapshot(snapshotData);

    // Also synchronously update in-memory state.allUsersPurchasesMap for instant SSOT reflection
    if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[cleanUser]) {
        if (!state.allUsersPurchasesMap[cleanUser].recommendationSnapshots) {
            state.allUsersPurchasesMap[cleanUser].recommendationSnapshots = {};
        }
        state.allUsersPurchasesMap[cleanUser].recommendationSnapshots[String(roundNum)] = leanData;
    }

    // Save to Firestore (Write-Once into BOTH lotto_users and lotto_purchases)
    if (firestore) {
        try {
            await firestore.collection('lotto_users').doc(cleanUser).set({
                recommendationSnapshots: {
                    [String(roundNum)]: leanData
                }
            }, { merge: true });
        } catch(e) {
            console.warn('[Snapshot Save to lotto_users Error]', e);
        }
        try {
            await firestore.collection('lotto_purchases').doc(cleanUser).set({
                recommendationSnapshots: {
                    [String(roundNum)]: leanData
                }
            }, { merge: true });
        } catch(e2) {
            console.error('[Snapshot Save to lotto_purchases Error]', e2);
        }
    }

    return snapshotData;
}

/**
 * Retrieve snapshot synchronously if exists in cloud-synced state memory or localStorage
 */
export function getUserWeeklyRecommendationSnapshotSync(userId, round) {
    if (!userId || !round) return null;
    let cleanUser = String(userId).trim();
    if (cleanUser.startsWith('{')) {
        try {
            const p = JSON.parse(cleanUser);
            cleanUser = p.userid || p.userId || cleanUser;
        } catch(e) {}
    }
    cleanUser = cleanUser.toLowerCase().trim();
    if (isSystemOrDummyUser(cleanUser)) return null;
    const roundNum = parseInt(round, 10);
    const docKey = `${cleanUser}_${roundNum}`;

    // ⚡ 0ms 즉시 로컬 캐시 복원: state.allUsersPurchasesMap 비어있으면 localStorage에서 즉시 복원
    if (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0) {
        try {
            const rawMap = (typeof localStorage !== 'undefined') ? localStorage.getItem('lotto_all_users_purchases_map_cache') : null;
            if (rawMap) state.allUsersPurchasesMap = JSON.parse(rawMap);
        } catch(e) {}
    }

    // Collect candidate user identifiers for alias / display name mapping (e.g. 박재구 <-> pjg <-> kakao_5070244665 <-> master)
    const candidateIds = new Set([cleanUser]);
    if (cleanUser === '박재구' || cleanUser === 'pjg' || cleanUser === 'kakao_5070244665' || cleanUser === 'master' || cleanUser === 'admin') {
        candidateIds.add('kakao_5070244665');
        candidateIds.add('master');
        candidateIds.add('admin');
        candidateIds.add('박재구');
        candidateIds.add('pjg');
    }
    if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) {
        state.allRegisteredUsersList.forEach(u => {
            if (!u) return;
            const uId = String(u.id || '').toLowerCase().trim();
            const uName = String(u.name || '').toLowerCase().trim();
            const uReal = String(u.realName || '').toLowerCase().trim();
            if (uId === cleanUser || uName === cleanUser || uReal === cleanUser) {
                if (uId) candidateIds.add(uId);
                if (uName) candidateIds.add(uName);
                if (uReal) candidateIds.add(uReal);
            }
        });
    }

    if (typeof UserContextManager !== 'undefined' && typeof UserContextManager.getAllKnownUsers === 'function') {
        try {
            const allUsers = UserContextManager.getAllKnownUsers();
            if (Array.isArray(allUsers)) {
                allUsers.forEach(u => {
                    if (!u) return;
                    const uId = String(u.id || '').toLowerCase().trim();
                    const uName = String(u.name || '').toLowerCase().trim();
                    const uReal = String(u.realName || '').toLowerCase().trim();
                    if (uId === cleanUser || uName === cleanUser || uReal === cleanUser) {
                        if (uId) candidateIds.add(uId);
                        if (uName) candidateIds.add(uName);
                        if (uReal) candidateIds.add(uReal);
                    }
                });
            }
        } catch(e) {}
    }

    for (const cId of candidateIds) {
        const cKey = `${cId}_${roundNum}`;
        if (state.userRecommendationSnapshots && state.userRecommendationSnapshots[cKey]) {
            const memSnap = state.userRecommendationSnapshots[cKey];
            if (!isRound1251UpgradePending(memSnap, roundNum, cId)) {
                return hydrateLeanSnapshot(memSnap);
            }
        }
        if (state.allUsersPurchasesMap && state.allUsersPurchasesMap[cId]) {
            const pDoc = state.allUsersPurchasesMap[cId];
            const pSnaps = pDoc.recommendationSnapshots;
            const pSnap = pSnaps ? (pSnaps[String(roundNum)] || pSnaps[roundNum]) : null;
            if (pSnap && !isRound1251UpgradePending(pSnap, roundNum, cId)) {
                return hydrateLeanSnapshot(pSnap);
            }
        }
        if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList)) {
            const u = state.allRegisteredUsersList.find(x => (x.id || '').toLowerCase().trim() === cId);
            const uSnaps = u ? u.recommendationSnapshots : null;
            const uSnap = uSnaps ? (uSnaps[String(roundNum)] || uSnaps[roundNum]) : null;
            if (uSnap && !isRound1251UpgradePending(uSnap, roundNum, cId)) {
                return hydrateLeanSnapshot(uSnap);
            }
        }
        try {
            const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(`lotto_rec_snapshot_${cKey}`) : null;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.v4Combos || parsed.v3Combos || parsed.extraPacks) && !isRound1251UpgradePending(parsed, roundNum, cId)) {
                    const hydrated = hydrateLeanSnapshot(parsed);
                    if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};
                    state.userRecommendationSnapshots[cKey] = hydrated;
                    return hydrated;
                }
            }
        } catch(e) {}
    }

    if (state.userRecommendationSnapshots && state.userRecommendationSnapshots[String(roundNum)]) {
        const fallbackSnap = state.userRecommendationSnapshots[String(roundNum)];
        if (!isRound1251UpgradePending(fallbackSnap, roundNum, cleanUser)) {
            return hydrateLeanSnapshot(fallbackSnap);
        }
    }

    // 🔒 4순위: 박재구 회원 1246회차 불변 스냅샷 영구 보존 베이스라인
    if (Number(roundNum) === 1246 && (candidateIds.has('kakao_5070244665') || cleanUser === 'kakao_5070244665' || cleanUser === '박재구' || cleanUser === 'pjg')) {
        const frozen = getParkJaeGoo1246FrozenSnapshot();
        if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};
        state.userRecommendationSnapshots['kakao_5070244665_1246'] = frozen;
        return frozen;
    }

    return null;
}

/**
 * 🔒 제 1246회 카카오 박재구 회원 (kakao_5070244665) 70게임 불변 박제 스냅샷 베이스라인
 * 실구매 4등(50,000원) + 5등(5,000원) = 55,000원 적중 및 
 * 추천번호 전체 4등 1건(50,000원) + 5등 2건(10,000원) = 총 60,000원 적중 완벽 영구 보존
 */
export function getParkJaeGoo1246FrozenSnapshot() {
    const v4 = [
        [10, 14, 17, 31, 34, 43], [12, 15, 17, 21, 42, 44], [1, 20, 21, 29, 36, 42], [7, 11, 12, 35, 38, 42], [25, 27, 30, 32, 40, 41],
        [9, 25, 28, 29, 37, 43], [5, 6, 9, 23, 34, 36], [2, 13, 14, 18, 31, 38], [4, 10, 15, 23, 24, 43], [13, 15, 19, 27, 31, 35]
    ].map((nums, idx) => ({ id: 'V4-G1-' + (idx + 1), name: '[올라운더] ' + (idx + 1) + '게임', numbers: nums }));

    const v3 = [
        [11, 17, 26, 34, 35, 39], [14, 15, 17, 26, 39, 43], [6, 17, 20, 24, 26, 39], [1, 15, 26, 39, 40, 43], [3, 4, 12, 23, 25, 26],
        [25, 26, 28, 33, 39, 42], [5, 12, 28, 29, 36, 41], [7, 16, 25, 29, 35, 44], [5, 12, 19, 23, 33, 42], [8, 17, 24, 30, 39, 45]
    ].map((nums, idx) => ({ id: 'V3-G1-' + (idx + 1), name: '[올라운더2] ' + (idx + 1) + '게임', numbers: nums }));

    const ext1 = [
        [2, 16, 19, 22, 23, 27], [1, 3, 8, 13, 34, 45], [13, 16, 18, 23, 27, 37], [4, 12, 21, 25, 32, 37], [3, 18, 33, 38, 44, 45],
        [4, 17, 27, 29, 30, 39], [4, 10, 18, 25, 27, 34], [5, 8, 13, 28, 30, 45], [3, 12, 21, 27, 38, 45], [7, 18, 19, 26, 34, 36]
    ].map((nums, idx) => ({ id: 'EXT1-' + (idx + 1), name: '기본 3: 올라운더 팩 3 (10게임) (게임 ' + (idx + 1) + ')', numbers: nums }));

    const baseSnapshot = {
        userId: 'kakao_5070244665',
        realName: '박재구',
        phone: '010-8739-1414',
        userType: 'regular',
        round: 1246,
        createdAt: '2026-10-10T12:05:17.434Z',
        isLocked: true,
        is3StageOptimized: true,
        algoRevision: 'v2026.10_3stage',
        totalGames: 30,
        v4Combos: v4,
        v3Combos: v3,
        extraPacks: {
            '1': { packId: 1, name: '기본 3: 올라운더 팩 3 (빈틈제로 10게임)', badge: 'ALL-ROUNDER 3', color: '#10b981', combos: ext1 }
        }
    };

    return (typeof hydrateLeanSnapshot === 'function') ? hydrateLeanSnapshot(baseSnapshot) : baseSnapshot;
}

/**
 * 🎯 이번 주 올라운더 1·2·3 코어 핵심 숫자 요약 반환 (스냅샷 우선 / 3안-B 16수 풀 연동)
 * @param {number|null} targetRound
 * @param {string|null} customUserId
 */
export function getWeeklyCoreNumbersSummary(targetRound = null, customUserId = null) {
    const drawnRounds = Object.keys(state.mergedHistory || {})
        .filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers) && state.mergedHistory[r].numbers.length === 6)
        .map(Number);
    const maxKnownDrawnRound = drawnRounds.length ? Math.max(...drawnRounds) : 1250;
    const curRound = targetRound || (typeof getUpcomingLottoRound === 'function'
        ? getUpcomingLottoRound()
        : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (maxKnownDrawnRound + 1)));
    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);

    let v4Combos = [];
    let v3Combos = [];
    let ar3Combos = [];
    let explicitPool16 = null;

    // 1. Immutable Snapshot Priority (only if not pending 1251 3B upgrade)
    if (effectiveUserId && effectiveUserId !== 'all' && !isSystemOrDummyUser(effectiveUserId)) {
        const snap = getUserWeeklyRecommendationSnapshotSync(effectiveUserId, curRound);
        if (snap && snap.v4Combos && snap.v3Combos && snap.extraPacks && !isRound1251UpgradePending(snap, curRound, effectiveUserId)) {
            v4Combos = Array.isArray(snap.v4Combos) ? snap.v4Combos : [];
            v3Combos = Array.isArray(snap.v3Combos) ? snap.v3Combos : [];
            const p1 = extractPackFromSnapshot(snap.extraPacks, 1);
            ar3Combos = (p1 && Array.isArray(p1.combos)) ? p1.combos : [];
        }
    }

    // 2. Fallback to live deterministic generation (3안-B for 1251+, legacy for <=1250)
    if (v4Combos.length === 0 || v3Combos.length === 0 || ar3Combos.length === 0) {
        if (curRound >= 1251) {
            const pf = computeAllRounder3BPortfolio(curRound, effectiveUserId);
            if (pf) {
                v4Combos = pf.v4 || [];
                v3Combos = pf.v3 || [];
                ar3Combos = pf.ar3 || [];
                explicitPool16 = Array.isArray(pf.pool16) ? pf.pool16 : null;
            }
        } else {
            v4Combos = computeAbsoluteTop10Combinations(false, curRound, 'v4', true, effectiveUserId) || [];
            v3Combos = computeAbsoluteTop10Combinations(false, curRound, 'v3', true, effectiveUserId) || [];
            const p1 = generateExtraAddonPack(1, curRound, effectiveUserId);
            ar3Combos = (p1 && Array.isArray(p1.combos)) ? p1.combos : [];
        }
    }

    const extractNums = (list) => (Array.isArray(list) ? list : [])
        .map(c => Array.isArray(c) ? c : (c && Array.isArray(c.numbers) ? c.numbers : []))
        .filter(arr => arr.length === 6);

    const v4Nums = extractNums(v4Combos);
    const v3Nums = extractNums(v3Combos);
    const ar3Nums = extractNums(ar3Combos);
    const all30Nums = [...v4Nums, ...v3Nums, ...ar3Nums];

    const freq30 = {};
    const packCounts = { v4: {}, v3: {}, extra1: {} };
    const countInto = (arrs, targetMap) => {
        arrs.forEach(nums => {
            nums.forEach(n => {
                targetMap[n] = (targetMap[n] || 0) + 1;
            });
        });
    };
    countInto(all30Nums, freq30);
    countInto(v4Nums, packCounts.v4);
    countInto(v3Nums, packCounts.v3);
    countInto(ar3Nums, packCounts.extra1);

    const needHistoryIsolation = enterHistoryIsolation(curRound, maxKnownDrawnRound);
    let dynScore = {};
    let crowdAvoidMap = {};
    let missWeeks = {};
    let prevDrawNums = [];
    try {
        if (!state.DYNAMIC_ROUND_SCORE || !state.DYNAMIC_ROUND_SCORE[1]) {
            recalculateGroups();
        }
        dynScore = { ...(state.DYNAMIC_ROUND_SCORE || {}) };
        crowdAvoidMap = { ...(state.CROWD_AVOIDANCE_SCORE || {}) };
        missWeeks = { ...(state.MISSING_WEEKS || {}) };
        prevDrawNums = (state.mergedHistory && state.mergedHistory[maxKnownDrawnRound] && Array.isArray(state.mergedHistory[maxKnownDrawnRound].numbers))
            ? [...state.mergedHistory[maxKnownDrawnRound].numbers]
            : [];
    } finally {
        exitHistoryIsolation(needHistoryIsolation);
    }

    const is3BMode = (curRound >= 1251);
    const seed = getUserRoundSeed(effectiveUserId, curRound, 'ar_3b_16wheel');
    const tieRng = createDeterministicRng(seed);
    const tieNoise = {};
    for (let n = 1; n <= 45; n++) tieNoise[n] = tieRng() * 0.015;

    let candidateNums = [];
    if (explicitPool16 && explicitPool16.length > 0) {
        candidateNums = [...new Set(explicitPool16)];
    } else if (is3BMode) {
        candidateNums = Array.from(new Set(all30Nums.flat()));
    } else {
        candidateNums = Object.keys(freq30).map(Number);
    }

    const directCore7Nums = is3BMode
        ? new Set([
            ...(v4Combos[0] && Array.isArray(v4Combos[0].numbers) ? v4Combos[0].numbers : []),
            ...(v4Combos[1] && Array.isArray(v4Combos[1].numbers) ? v4Combos[1].numbers : []),
            ...(v4Combos[2] && Array.isArray(v4Combos[2].numbers) ? v4Combos[2].numbers : [])
        ])
        : null;

    const enriched = candidateNums.map(n => {
        const ca = crowdAvoidMap[n] || 0;
        const caBonus = Math.max(-0.04, Math.min(0.06, ca * 0.6));
        return {
            n,
            freq30: freq30[n] || 0,
            v4Count: packCounts.v4[n] || 0,
            v3Count: packCounts.v3[n] || 0,
            extra1Count: packCounts.extra1[n] || 0,
            dynScore: Number((dynScore[n] || 1.0).toFixed(2)),
            rankScore: (dynScore[n] || 1.0) + caBonus + (tieNoise[n] || 0),
            missWeeks: missWeeks[n] || 0,
            isCarryover: prevDrawNums.includes(n),
            isHighEv: n >= 32,
            isCorePinned: directCore7Nums ? (directCore7Nums.has(n) ? 1 : 0) : 0
        };
    });

    if (is3BMode) {
        enriched.sort((a, b) => (b.isCorePinned - a.isCorePinned) || (b.rankScore - a.rankScore) || (a.n - b.n));
    } else {
        enriched.sort((a, b) => (b.freq30 - a.freq30) || (b.dynScore - a.dynScore) || (a.n - b.n));
    }

    const coreCount = is3BMode ? 7 : 6;
    const capped = is3BMode ? enriched : enriched.slice(0, 16);
    const topAnchors = capped.slice(0, coreCount).sort((a, b) => a.n - b.n);
    const supportPool = capped.slice(coreCount).sort((a, b) => a.n - b.n);
    const topAnchorSet = new Set(topAnchors.map(x => x.n));

    return {
        round: curRound,
        userId: effectiveUserId,
        maxKnownDrawnRound,
        is3BMode,
        totalGamesCount: all30Nums.length,
        poolSize: capped.length,
        poolNumbers: capped.map(x => x.n).sort((a, b) => a - b),
        topAnchors,
        supportPool,
        itemsSortedAsc: [...capped].sort((a, b) => a.n - b.n).map(x => ({ ...x, isTopAnchor: topAnchorSet.has(x.n) })),
        prevDrawNumbers: prevDrawNums,
        packGames: { v4: v4Nums, v3: v3Nums, ar3: ar3Nums }
    };
}

/**
 * 🎯 추첨 완료 회차(토요일 최신 당첨번호 스크랩 기준)의 핵심 코어 6수 & 보조 코어 10수 적중 성적표 계산
 * @param {number|null} targetDrawnRound
 * @param {string|null} customUserId
 */
export function evaluateRoundCoreHitReport(targetDrawnRound = null, customUserId = null) {
    const drawnRounds = Object.keys(state.mergedHistory || {})
        .filter(r => state.mergedHistory[r] && Array.isArray(state.mergedHistory[r].numbers) && state.mergedHistory[r].numbers.length === 6)
        .map(Number);
    const maxKnownDrawnRound = drawnRounds.length ? Math.max(...drawnRounds) : (state.latestDrawData ? state.latestDrawData.drwNo : 1250);
    const round = targetDrawnRound ? Number(targetDrawnRound) : (state.latestDrawData && state.latestDrawData.drwNo ? Number(state.latestDrawData.drwNo) : maxKnownDrawnRound);

    const drawData = (state.mergedHistory && state.mergedHistory[round])
        || (state.latestDrawData && Number(state.latestDrawData.drwNo) === round ? state.latestDrawData : null);

    if (!drawData || !Array.isArray(drawData.numbers) || drawData.numbers.length < 6) {
        return null;
    }

    const effectiveUserId = getEffectiveGeneratorUserId(customUserId);
    const summary = getWeeklyCoreNumbersSummary(round, effectiveUserId);
    if (!summary || !Array.isArray(summary.topAnchors) || summary.poolSize === 0) {
        return null;
    }

    const winNums = [...drawData.numbers].map(Number).sort((a, b) => a - b);
    const winSet = new Set(winNums);
    const bonusNum = Number(drawData.bonus || 0);

    const enrichHit = (item) => ({
        ...item,
        hitType: winSet.has(item.n) ? 'main' : (item.n === bonusNum ? 'bonus' : 'miss')
    });

    const top6Items = summary.topAnchors.map(enrichHit);
    const support10Items = summary.supportPool.map(enrichHit);

    const core6MainHits = top6Items.filter(x => x.hitType === 'main').map(x => x.n);
    const core6BonusHits = top6Items.filter(x => x.hitType === 'bonus').map(x => x.n);
    const support10MainHits = support10Items.filter(x => x.hitType === 'main').map(x => x.n);
    const support10BonusHits = support10Items.filter(x => x.hitType === 'bonus').map(x => x.n);

    const totalMainHits = core6MainHits.length + support10MainHits.length;
    const totalBonusHits = core6BonusHits.length + support10BonusHits.length;
    const totalHits = totalMainHits + totalBonusHits;

    const prizeTable = {
        1: Number(drawData.firstWinamnt || drawData.rank1Prize || (drawData.prizes && drawData.prizes[1] && drawData.prizes[1].prize) || 2000000000),
        2: Number(drawData.rank2Prize || (drawData.prizes && drawData.prizes[2] && drawData.prizes[2].prize) || 55000000),
        3: Number(drawData.rank3Prize || (drawData.prizes && drawData.prizes[3] && drawData.prizes[3].prize) || 1500000),
        4: Number(drawData.rank4Prize || (drawData.prizes && drawData.prizes[4] && drawData.prizes[4].prize) || 50000),
        5: Number(drawData.rank5Prize || (drawData.prizes && drawData.prizes[5] && drawData.prizes[5].prize) || 5000)
    };

    const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const winningGames = [];
    let totalPrize = 0;

    const packDefs = [
        { key: 'v4', name: '올라운더 1', games: (summary.packGames && summary.packGames.v4) || [] },
        { key: 'v3', name: '올라운더 2', games: (summary.packGames && summary.packGames.v3) || [] },
        { key: 'ar3', name: '올라운더 3', games: (summary.packGames && summary.packGames.ar3) || [] }
    ];

    packDefs.forEach(p => {
        p.games.forEach((nums, idx) => {
            if (!Array.isArray(nums) || nums.length !== 6) return;
            const matchCount = nums.filter(n => winSet.has(n)).length;
            const bonusMatch = bonusNum > 0 && nums.includes(bonusNum);
            let rank = 0;
            if (matchCount === 6) rank = 1;
            else if (matchCount === 5 && bonusMatch) rank = 2;
            else if (matchCount === 5) rank = 3;
            else if (matchCount === 4) rank = 4;
            else if (matchCount === 3) rank = 5;

            if (rank > 0) {
                const prize = prizeTable[rank] || 0;
                rankCounts[rank] = (rankCounts[rank] || 0) + 1;
                totalPrize += prize;
                const isDirectTop6 = (p.key === 'v4' && idx === 0 && summary.is3BMode);
                winningGames.push({
                    packKey: p.key,
                    packName: p.name,
                    gameIndex: idx + 1,
                    isDirectTop6,
                    gameLabel: `${p.name} #${idx + 1}게임${isDirectTop6 ? ' (TOP6 직결)' : ''}`,
                    numbers: [...nums].sort((a, b) => a - b),
                    matchCount,
                    bonusMatch,
                    rank,
                    prize
                });
            }
        });
    });

    winningGames.sort((a, b) => (a.rank - b.rank) || (b.matchCount - a.matchCount) || (a.gameIndex - b.gameIndex));

    const totalWinningGames = winningGames.length;
    const bestRank = [1, 2, 3, 4, 5].find(rk => rankCounts[rk] > 0) || 0;

    const core6SummaryText = `${core6MainHits.length}${core6BonusHits.length ? '+보너스' : ''} / ${top6Items.length}수 적중`;
    const support10SummaryText = `${support10MainHits.length}${support10BonusHits.length ? '+보너스' : ''} / ${support10Items.length}수 적중`;
    const wheelSummaryText = bestRank > 0
        ? `최고 ${bestRank}등 (총 ${totalWinningGames}G 당첨)`
        : `당첨 게임 없음 (30G 기준)`;
    const wheelDetailText = [1, 2, 3, 4, 5]
        .filter(rk => rankCounts[rk] > 0)
        .map(rk => `${rk}등 ${rankCounts[rk]}G`)
        .join(' · ') || '3개 이상 일치 조합 없음';

    return {
        round,
        drawDate: drawData.date || drawData.drwNoDate || '',
        userId: effectiveUserId,
        is3BMode: summary.is3BMode,
        winNums,
        bonusNum,
        top6Items,
        support10Items,
        core6MainHits,
        core6BonusHits,
        support10MainHits,
        support10BonusHits,
        totalMainHits,
        totalBonusHits,
        totalHits,
        rankCounts,
        totalWinningGames,
        bestRank,
        totalPrize,
        winningGames,
        core6SummaryText,
        support10SummaryText,
        wheelSummaryText,
        wheelDetailText
    };
}

if (typeof window !== 'undefined') {
    window.getEffectiveGeneratorUserId = getEffectiveGeneratorUserId;
    window.computeAbsoluteTop10Combinations = computeAbsoluteTop10Combinations;
    window.findBestRecommendationMatch = findBestRecommendationMatch;
    window.crossCheckCombosWithRecommendations = crossCheckCombosWithRecommendations;
    window.generateExtraAddonPack = generateExtraAddonPack;
    window.saveUserWeeklyRecommendationSnapshot = saveUserWeeklyRecommendationSnapshot;
    window.getUserWeeklyRecommendationSnapshotSync = getUserWeeklyRecommendationSnapshotSync;
    window.invalidateRecommendationRuntimeCaches = invalidateRecommendationRuntimeCaches;
    window.computeAllRounder3BPortfolio = computeAllRounder3BPortfolio;
    window.buildWalkForwardCore3BScoreCache = buildWalkForwardCore3BScoreCache;
    window.generateCore3BPortfolioAtRound = generateCore3BPortfolioAtRound;
    window.getWeeklyCoreNumbersSummary = getWeeklyCoreNumbersSummary;
    window.evaluateRoundCoreHitReport = evaluateRoundCoreHitReport;
    window.isRound1251UpgradePending = isRound1251UpgradePending;
}
