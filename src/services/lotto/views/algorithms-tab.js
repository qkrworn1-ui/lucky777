import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, showToast, calculateACValue } from '../../../shared/utils.js';
import { createBallHtml } from '../../../shared/components.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';
import { getComboNumbers, fetchAllUsersPurchases } from '../ledger.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';
import { computeUser70RecommendationsReview, getUserJoinRound } from './review-tab.js';

let currentAlgoStartRound = 1235;
let algoDetailAccordionMap = {};
let algoAdminViewingUser = 'all';

/**
 * 7대 알고리즘 정밀 정의 메타데이터 (조합 원리, 핵심 이론, 번호 구성 방식, 타겟 등)
 */
export const SEVEN_ALGORITHMS_INFO = [
    {
        id: 'v4',
        name: 'V4.0 행동경제학 포트폴리오',
        shortName: 'V4.0 행동경제학',
        tag: '마킹 심리 회피 · 밸런스 방어 · 치트키 과적합 융합 (10게임)',
        icon: 'fa-brain',
        badge: 'V4.0 BEHAVIORAL',
        badgeColor: '#a78bfa',
        bgGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(167, 139, 250, 0.45)',
        corePhilosophy: '대중의 번호 마킹 편향(생일·연속·기하학 패턴)을 역이용하여 당첨 시 독점 수령금을 극대화하고, 통계적 안정망으로 4·5등 당첨을 방어하는 포트폴리오 모델',
        comboMethod: [
            {
                step: '그룹 1: 통계적 밸런스 추종 (게임 1~4)',
                desc: '역대 1등 출현율 80% 구간인 웜 넘버(Warm Numbers) 중심 추출. 합계 120~160, 홀짝 3:3 균형, 끝수 고유값 5개 이상 강제 분산으로 4·5등 소액 당첨 확률을 탄탄하게 방어합니다.'
            },
            {
                step: '그룹 2: 변동성 극대화 및 군집 회피 (게임 5~7)',
                desc: '대중이 기피하는 장기 결손 콜드 넘버 2개 이상 + 최상위 핫 넘버 1개 + 2연번(연속 번호 1쌍)을 강제 주입하고 AC값 8~10을 유지하여, 1등 당첨 시 당첨금을 n분의 1로 나누지 않고 독식하도록 설계합니다.'
            },
            {
                step: '그룹 3: 역사적 과적합 극대화 (게임 8~10)',
                desc: '역대 1,234회 전수 당첨 데이터와 가장 많이 교차 충돌하는 다중 교집합(Maximal Clique) 앵커 3개 조합을 기반으로 ±1 인접수 변형을 가미하여 기계적 적중 밀도를 극대화합니다.'
            }
        ],
        keyFeatures: [
            '10게임 상호보완형 포트폴리오 설계',
            '4·5등 고정 배당 방어 + 1등 독식 당첨금 타겟',
            '마킹 심리 역발상 군집 회피 로직'
        ],
        getCombos: (r, uId) => computeAbsoluteTop10Combinations(false, r, 'v4', true, uId) || []
    },
    {
        id: 'v3',
        name: 'V3.0 하이브리드 정통 수학 알고리즘',
        shortName: 'V3.0 하이브리드',
        tag: '마르코프 전이행렬 · 누적 빈도 · Pair 궁합 · EV 극대화 (10게임)',
        icon: 'fa-gears',
        badge: 'V3.0 HYBRID MATH',
        badgeColor: '#60a5fa',
        bgGradient: 'linear-gradient(135deg, rgba(96, 165, 250, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(96, 165, 250, 0.45)',
        corePhilosophy: '동행복권 1회부터의 역대 누적 빈도, 직전 회차 마르코프 전이 확률, 2수 동반출현 빈도, 기대가치(EV)를 종합 연산하여 개별 게임의 적중 확률을 극대화한 정통 수학 통계 모델',
        comboMethod: [
            {
                step: '전반 5게임 (공격형 앙상블: 게임 1~5)',
                desc: '① 고액 당첨 딥러닝 앙상블(역대 고액 당첨 핵심 5수 클러스터 융합), ② AI-AC 밸런스(AC 8~10 복잡도), ③ 최다 동반출현 Pair(역대 최고 콤비 쌍 강제 주입), ④ 보너스 파동 연동(최근 20회 보너스 순환), ⑤ 장기 결손 Cold 반등을 시드로 개별 기대치를 극대화합니다.'
            },
            {
                step: '후반 5게임 (커버리지 방어형: 게임 6~10)',
                desc: '⑥ 고번호(30~45) EV 극대화, ⑦ 직전 회차 ±1 이웃수 포획, ⑧ 직전 회차 거울수(46-N) 대칭 반전, ⑨ HOT/COLD 황금비율 모멘텀, ⑩ 소수(Prime) & 3의 배수 수학적 밀도 균형으로 전방위 그물망 방어선을 구축합니다.'
            }
        ],
        keyFeatures: [
            '10가지 정통 통계 지표별 개별 특화 조합',
            '마르코프 1차 전이 행렬 가중치 반영',
            '기대가치(EV) 96.5pt 이상 정밀 필터링'
        ],
        getCombos: (r, uId) => computeAbsoluteTop10Combinations(false, r, 'v3', true, uId) || []
    },
    {
        id: 'extra1',
        name: '추가 1: 30게임 완성형 100% 전수 커버리지팩',
        shortName: '추가 1: 전수 커버리지',
        tag: '기본 20게임 누락 번호 100% 포섭 + 핫 앵커 직교 결합 (10게임)',
        icon: 'fa-shield-halved',
        badge: '추가 1 KEYSTONE 100%',
        badgeColor: '#10b981',
        bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.45)',
        corePhilosophy: 'V3.0(10게임) + V4.0(10게임)의 20게임에서 한 번도 선택되지 않은 0회 출현 사각지대 번호를 100% 추출하여 결합함으로써, 30게임 구매 시 1~45번 모든 번호가 단 하나도 누락되지 않도록 완성하는 무결점 커버리지 모델',
        comboMethod: [
            {
                step: '누락 번호 전수 분할 (Missing Partition)',
                desc: '기본 20게임 분석 결과 사용되지 않은 번호(약 12~18개)를 10게임에 1~2개씩 균등하게 강제 배치합니다.'
            },
            {
                step: '상위 8대 핫 앵커 직교 결합',
                desc: '역대 빈도 + 마르코프 점수가 가장 높은 상위 8개 핫 번호를 앵커로 직교 교차 결합하여 안정적인 당첨 축을 형성합니다.'
            },
            {
                step: '7대 퀀트 필터 통과',
                desc: '합계(95~195), AC값 7이상, 홀짝(2:4~4:2), 저고(2:4~4:2), 3연번 배제, 끝수 중복 제한(최대 2개), 색상 3구간 이상을 만족하는 조합만 최종 채택합니다.'
            }
        ],
        keyFeatures: [
            '1~45번 모든 번호 100% 전수 커버리지 달성',
            '사각지대 0% 무결점 30게임 포트폴리오 완성',
            '핫 앵커 직교 결합으로 적중 안정성 확보'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(1, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra2',
        name: '추가 2: 초고배당 EV 독점 수령팩',
        shortName: '추가 2: 초고배당 EV',
        tag: '30~45번대 고번호 집중 + 2연번 강제 주입 당첨금 극대화 (10게임)',
        icon: 'fa-sack-dollar',
        badge: '추가 2 HIGH EV MONOPOLY',
        badgeColor: '#f59e0b',
        bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(245, 158, 11, 0.45)',
        corePhilosophy: '대부분의 구매자가 생일(1~31) 및 저번호대를 선호한다는 점에 착안, 30~45번대 고번호와 2연번을 고의로 다수 배치하여 1등 당첨 시 당첨자 수가 급감하고 1인당 수령금이 30~50억 이상으로 폭등하도록 설계한 초고배당 특화 모델',
        comboMethod: [
            {
                step: '고번호(30~45) 대역 4개 이상 집중 배치',
                desc: '조합당 30~45번 번호를 최소 4개 이상 강제 배정하여 일반 구매자들의 선택 구간과 완벽히 차별화합니다.'
            },
            {
                step: '고번호 2연번(연속 2개 번호) 의도적 삽입',
                desc: '대중이 무의식적으로 기피하는 30번대 연속 번호(예: 33-34, 38-39 등) 1쌍을 필수로 포함합니다.'
            },
            {
                step: '합계 125~220 특화 퀀트 필터링',
                desc: '고번호 중심 조합의 특성에 맞추어 총합 범위를 125~220으로 상향 보정하고 AC값 7 이상을 엄격히 검증합니다.'
            }
        ],
        keyFeatures: [
            '1등 당첨 시 1인 독점 수령금(Super Jackpot) 극대화',
            '생일수(1~31) 배제로 대중과의 당첨금 셰어링 원천 차단',
            '고번호 2연번 집중 타격 전략'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(2, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra3',
        name: '추가 3: 기하학적 휠링 하모닉팩',
        shortName: '추가 3: 기하학 휠링',
        tag: '45각형 5구간 대칭 분산 휠링 · 3~4등 다중 적중 방어망 (10게임)',
        icon: 'fa-dharmachakra',
        badge: '추가 3 HARMONIC WHEELING',
        badgeColor: '#8b5cf6',
        bgGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(139, 92, 246, 0.45)',
        corePhilosophy: '로또 번호 45개를 기하학적 5개 구역으로 균등 분할하고, 각 구역에서 번호를 대칭 추출하여 결합하는 휠링 시스템(Wheeling Matrix). 특정 구간 쏠림을 원천 차단하여 3등(150만원), 4등(5만원) 복수 다중 적중 확률을 극대화한 구조적 모델',
        comboMethod: [
            {
                step: '45개 번호 5대 하모닉 구역 분할',
                desc: '1구역(1~9), 2구역(10~18), 3구역(19~27), 4구역(28~36), 5구역(37~45)으로 9개씩 정밀 분할합니다.'
            },
            {
                step: '5개 구역별 1개씩 필수 대칭 추출 (5수 기본틀)',
                desc: '각 5개 구역에서 퀀트 가중치가 가장 높은 번호를 정확히 1개씩 선별하여 5개 번호를 기본 대칭 축으로 구성합니다.'
            },
            {
                step: '6번째 보충수 및 휠링 회전 결합',
                desc: '남은 1개 번호를 전체 풀에서 퀀트 가중치 기반으로 주입하여 10개 게임에 걸쳐 회전식(Wheeling) 매트릭스로 배치합니다.'
            }
        ],
        keyFeatures: [
            '5개 전 구역 균등 분산으로 특정 구간 편중 0%',
            '3~4등 복수 다중 당첨(Multi-Hit) 확률 최적화',
            '기하학적 휠링 매트릭스 알고리즘 적용'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(3, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra4',
        name: '추가 4: 마르코프 2차 전이 & 페어 부스터팩',
        shortName: '추가 4: 마르코프&페어',
        tag: '직전 회차 전이 확률 + 역대 최다 동반출현 Pair 집중 타격 (10게임)',
        icon: 'fa-bolt',
        badge: '추가 4 MARKOV & PAIR',
        badgeColor: '#06b6d4',
        bgGradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(6, 182, 212, 0.45)',
        corePhilosophy: '로또 추첨의 강력한 연속성을 포착하기 위해 직전 회차 당첨 번호로부터의 마르코프 1/2차 전이 확률과 역대 1,200여 회차 중 가장 높은 빈도로 함께 출현한 2수 페어(Co-occurrence Pair)를 결합한 모멘텀 집중 타격 모델',
        comboMethod: [
            {
                step: '직전 회차 번호 1수 순환 시드 주입',
                desc: '직전 회차 6개 당첨번호 중 마르코프 전이 계수가 가장 높은 번호를 게임별 앵커로 주입합니다.'
            },
            {
                step: '역대 최고 궁합 동반출현(Pair) 파트너 결합',
                desc: '주입된 앵커 번호와 역대 데이터상 가장 많이 동반 출현한 최강 파트너 번호를 자동으로 매칭하여 2수 세트를 완성합니다.'
            },
            {
                step: '통계 가중치 기반 4수 보충 및 퀀트 검증',
                desc: '나머지 4개 번호를 누적 빈도 및 마르코프 전이 가중치 풀에서 추출하고 7대 퀀트 필터를 적용합니다.'
            }
        ],
        keyFeatures: [
            '직전 회차 흐름의 강한 연속성(Momentum) 추종',
            '역대 최다 동반 출현 2수 페어 듀오 집중 결합',
            '2등 및 3등 중고액 당첨 정밀 타격'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(4, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra5',
        name: '추가 5: 골든 클러스터 올인팩',
        shortName: '추가 5: 골든 클러스터',
        tag: '역대 최다 동시 출현 3수 고정틀(Golden Trios) 마스터 조합 (10게임)',
        icon: 'fa-crown',
        badge: '추가 5 GOLDEN CLIQUE',
        badgeColor: '#ec4899',
        bgGradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(236, 72, 153, 0.45)',
        corePhilosophy: '역대 1,200여 회의 전수 데이터 중 3개 번호가 동시에 출현한 빈도가 통계적으로 가장 높은 상위 10대 "황금 트리오(Golden Trios)"를 각 게임의 3수 고정틀로 채택하고, 나머지 3수를 퀀트 최적화하여 3수가 적중되는 즉시 5등(3수)→4등(4수)→3등(5수)→1등으로 이어지는 연쇄 당첨 폭발력을 노리는 마스터 모델',
        comboMethod: [
            {
                step: '10대 황금 3수 클러스터 고정틀 배치',
                desc: '[1, 13, 38], [11, 29, 36], [4, 17, 43], [7, 16, 44], [10, 23, 37], [2, 18, 42], [5, 14, 31], [8, 20, 39], [3, 19, 35], [12, 26, 45] 등 역대 최다 동시 출현 3수를 게임별 고정 앵커로 주입합니다.'
            },
            {
                step: '3수 고정틀 기반 퀀트 가중치 3수 융합',
                desc: '고정 3수와 궁합도가 높은 번호 3개를 전체 퀀트 가중치 풀에서 추출하여 6수 완성.'
            },
            {
                step: '7대 퀀트 필터 통과 조합 최종 확정',
                desc: '합계, AC값, 홀짝, 저고, 색상 분포 밸런스를 검증하여 최종 조합을 확정합니다.'
            }
        ],
        keyFeatures: [
            '역대 최다 동시 출현 3수 고정틀 10세트 전면 채택',
            '3수 적중 시 연쇄 고액 당첨으로 이어지는 폭발력',
            '최대 클리크(Maximal Clique) 수리 모델 기반'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(5, r, uId); return (p && p.combos) ? p.combos : []; }
    }
];

function formatPrizeCompact(prize) {
    if (prize >= 100000000) {
        const eok = prize / 100000000;
        return eok >= 10 ? `${Math.round(eok).toLocaleString()}억원` : `${eok.toFixed(1)}억원`;
    }
    if (prize >= 10000) {
        return `${Math.round(prize / 10000).toLocaleString()}만원`;
    }
    return `${prize.toLocaleString()}원`;
}

/**
 * 개인정보 보호를 위한 회원 실명 및 ID 마스킹 (실명 연상 방지: 김** / w** 형식)
 */
export function maskUserDisplayName(name, userId) {
    let cleanName = (name || '').trim();
    let cleanId = (userId || '').trim();

    let maskedName = '';
    if (cleanName) {
        // 실명 연상 방지: 첫 글자(성씨) + '**' (예: 김철수 -> 김**, 우대용 -> 우**, 홍길동 -> 홍**)
        maskedName = cleanName[0] + '**';
    }

    let maskedId = '';
    if (cleanId) {
        if (cleanId.length <= 2) {
            maskedId = cleanId[0] + '*';
        } else if (cleanId.length === 3) {
            maskedId = cleanId[0] + '**';
        } else {
            maskedId = cleanId.slice(0, 2) + '**';
        }
    }

    if (maskedName && maskedId && maskedName.toLowerCase() !== maskedId.toLowerCase()) {
        return `${maskedName} (${maskedId})`;
    }
    return maskedName || maskedId || '회원**';
}

/**
 * 7대 알고리즘의 복기 데이터 통계 계산 (지정 회차부터 최신 회차까지 - 전체 회원 기본 통합)
 */
export function calculate7AlgorithmsPerformance(fromRound = 1235, targetUserId = 'all') {
    const history = state.mergedHistory || {};
    const drawnRounds = Object.keys(history)
        .map(Number)
        .filter(r => !isNaN(r) && r >= fromRound && history[r] && Array.isArray(history[r].numbers) && history[r].numbers.length === 6)
        .sort((a, b) => a - b);

    const maxRound = drawnRounds.length > 0 ? Math.max(...drawnRounds) : fromRound;

    const rawUser = targetUserId || 'all';
    const cleanUser = String(rawUser).toLowerCase().trim();
    const isAll = (cleanUser === 'all');
    const isAdmin = (cleanUser === 'master' || cleanUser === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanUser)));
    const userJoinRound = (!isAdmin && !isAll) ? getUserJoinRound(cleanUser) : 1235;

    let grandTotalGames = 0;
    let grandTotalInvest = 0;
    let grandTotalPrize = 0;
    const grandRankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    const algoStats = SEVEN_ALGORITHMS_INFO.map(algo => {
        let totalGames = 0;
        let totalInvest = 0;
        let totalPrize = 0;
        const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundDetails = [];

        drawnRounds.forEach(round => {
            const draw = history[round];
            if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) return;

            const winningSet = new Set(draw.numbers);
            const bonus = draw.bonus;

            // If single regular user and before join round, skip completely
            if (!isAll && !isAdmin && round < userJoinRound) {
                return;
            }

            let roundPrize = 0;
            const roundHits = [];
            let roundCombosCount = 0;

            if (isAll) {
                // Aggregate across all active registered users for this round
                let baseList = [];
                if (state.allRegisteredUsersList && Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
                    baseList = [...state.allRegisteredUsersList];
                }
                if (state.allUsersPurchasesMap && typeof state.allUsersPurchasesMap === 'object') {
                    Object.keys(state.allUsersPurchasesMap).forEach(uId => {
                        if (!baseList.some(u => (u.id || '').toLowerCase().trim() === uId.toLowerCase().trim())) {
                            const pObj = state.allUsersPurchasesMap[uId];
                            baseList.push({ id: uId, name: pObj.realName || uId, createdAt: pObj.createdAt || null });
                        }
                    });
                }
                if (state.userRecommendationSnapshots && typeof state.userRecommendationSnapshots === 'object') {
                    Object.keys(state.userRecommendationSnapshots).forEach(k => {
                        const snap = state.userRecommendationSnapshots[k];
                        if (snap && snap.userId) {
                            const uId = snap.userId.toLowerCase().trim();
                            if (!baseList.some(u => (u.id || '').toLowerCase().trim() === uId)) {
                                baseList.push({ id: uId, name: snap.realName || uId, createdAt: snap.userCreatedAt || null });
                            }
                        }
                    });
                }
                baseList = baseList.filter(u => {
                    const uId = (u.id || '').trim().toLowerCase();
                    return !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'user_alpha' && uId !== 'user_beta' && uId !== 'sample' && uId !== 'hms' && u.isDeleted !== true && u.status !== 'trash' && u.status !== 'deleted';
                });
                if (baseList.length === 0) {
                    baseList = [{ id: 'master', name: '관리자' }];
                }
                const activeUsers = baseList.filter(u => round >= getUserJoinRound(u.id));

                activeUsers.forEach(u => {
                    const rev = computeUser70RecommendationsReview(u.id, round);
                    if (!rev || rev.isPreJoin) return;

                    let evalData = null;
                    let combos = [];
                    if (algo.id === 'v4') {
                        evalData = rev.v4Eval;
                        combos = rev.v4Combos || [];
                    } else if (algo.id === 'v3') {
                        evalData = rev.v3Eval;
                        combos = rev.v3Combos || [];
                    } else if (algo.id.startsWith('extra')) {
                        const pId = parseInt(algo.id.replace('extra', ''), 10);
                        const pack = (rev.extraPackEvals || []).find(p => p.packId === pId);
                        evalData = pack ? pack.evalData : null;
                        combos = pack ? pack.combos || [] : [];
                    }

                    if (!evalData) return;

                    roundCombosCount += combos.length;
                    totalGames += combos.length;
                    totalInvest += combos.length * 1000;
                    grandTotalGames += combos.length;
                    grandTotalInvest += combos.length * 1000;

                    for (let rk = 1; rk <= 5; rk++) {
                        const count = evalData.hits[rk] || 0;
                        rankCounts[rk] += count;
                        grandRankCounts[rk] += count;
                    }
                    totalPrize += evalData.totalPrize;
                    roundPrize += evalData.totalPrize;
                    grandTotalPrize += evalData.totalPrize;

                    (evalData.items || []).filter(item => item.rank >= 1 && item.rank <= 5).forEach(item => {
                        const itemMatches = item.nums ? item.nums.filter(n => winningSet.has(n)) : [];
                        roundHits.push({
                            user: u.id,
                            userName: u.name || u.id,
                            gameIdx: item.idx,
                            comboName: item.name || `${algo.shortName} #${item.idx}`,
                            nums: item.nums,
                            matchedNums: itemMatches,
                            hasBonus: item.hasBonus,
                            rank: item.rank,
                            rankLabel: `${item.rank}등`,
                            prize: item.prize
                        });
                    });
                });
            } else {
                // Single target user (strictly based on computeUser70RecommendationsReview / snapshots)
                const rev = computeUser70RecommendationsReview(cleanUser, round);
                if (rev && !rev.isPreJoin) {
                    let evalData = null;
                    let combos = [];
                    if (algo.id === 'v4') {
                        evalData = rev.v4Eval;
                        combos = rev.v4Combos || [];
                    } else if (algo.id === 'v3') {
                        evalData = rev.v3Eval;
                        combos = rev.v3Combos || [];
                    } else if (algo.id.startsWith('extra')) {
                        const pId = parseInt(algo.id.replace('extra', ''), 10);
                        const pack = (rev.extraPackEvals || []).find(p => p.packId === pId);
                        evalData = pack ? pack.evalData : null;
                        combos = pack ? pack.combos || [] : [];
                    }

                    if (evalData) {
                        roundCombosCount = combos.length;
                        totalGames += combos.length;
                        totalInvest += combos.length * 1000;
                        grandTotalGames += combos.length;
                        grandTotalInvest += combos.length * 1000;

                        for (let rk = 1; rk <= 5; rk++) {
                            const count = evalData.hits[rk] || 0;
                            rankCounts[rk] += count;
                            grandRankCounts[rk] += count;
                        }
                        totalPrize += evalData.totalPrize;
                        roundPrize += evalData.totalPrize;
                        grandTotalPrize += evalData.totalPrize;

                        (evalData.items || []).filter(item => item.rank >= 1 && item.rank <= 5).forEach(item => {
                            const itemMatches = item.nums ? item.nums.filter(n => winningSet.has(n)) : [];
                            roundHits.push({
                                user: cleanUser,
                                gameIdx: item.idx,
                                comboName: item.name || `${algo.shortName} #${item.idx}`,
                                nums: item.nums,
                                matchedNums: itemMatches,
                                hasBonus: item.hasBonus,
                                rank: item.rank,
                                rankLabel: `${item.rank}등`,
                                prize: item.prize
                            });
                        });
                    }
                }
            }

            roundDetails.push({
                round: round,
                date: draw.date || '',
                drawNumbers: draw.numbers,
                bonus: bonus,
                combosCount: roundCombosCount,
                hitCount: roundHits.length,
                roundPrize: roundPrize,
                hits: roundHits
            });
        });

        const totalWins = rankCounts[1] + rankCounts[2] + rankCounts[3] + rankCounts[4] + rankCounts[5];
        const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : '0.0';
        const roi = totalInvest > 0 ? (((totalPrize - totalInvest) / totalInvest) * 100).toFixed(1) : '0.0';

        let topRank = null;
        for (let k = 1; k <= 5; k++) {
            if (rankCounts[k] > 0) {
                topRank = k;
                break;
            }
        }

        return {
            ...algo,
            totalGames,
            totalInvest,
            totalPrize,
            profit: totalPrize - totalInvest,
            roi: parseFloat(roi),
            rankCounts,
            totalWins,
            winRate,
            topRank,
            roundDetails: roundDetails.reverse() // 최신 회차가 상단에 오도록 정렬
        };
    });

    const grandTotalWins = grandRankCounts[1] + grandRankCounts[2] + grandRankCounts[3] + grandRankCounts[4] + grandRankCounts[5];
    const grandWinRate = grandTotalGames > 0 ? ((grandTotalWins / grandTotalGames) * 100).toFixed(1) : '0.0';
    const grandRoi = grandTotalInvest > 0 ? (((grandTotalPrize - grandTotalInvest) / grandTotalInvest) * 100).toFixed(1) : '0.0';

    return {
        fromRound,
        maxRound,
        totalRoundsCount: drawnRounds.length,
        grandTotalGames,
        grandTotalInvest,
        grandTotalPrize,
        grandProfit: grandTotalPrize - grandTotalInvest,
        grandRoi: parseFloat(grandRoi),
        grandRankCounts,
        grandTotalWins,
        grandWinRate,
        results: algoStats
    };
}

/**
 * 알고리즘 소개 & 실적 탭 전체 렌더링
 */
export async function renderAlgorithmsTab(fromRound = null) {
    const container = document.getElementById('tab-algorithms');
    if (!container) return;

    if (fromRound !== null) {
        currentAlgoStartRound = parseInt(fromRound, 10);
    }

    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const authId = (rawAuth || '').trim();
    const cleanAuth = authId.toLowerCase();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));

    // Ensure users and purchase ledger are loaded
    if ((typeof window !== 'undefined' && window.db || db) && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0)) {
        try {
            await fetchAllUsersPurchases();
        } catch(e) {}
    }

    // Default target user is 'all' (전체 회원 통합 당첨 실적)
    const effectiveUserId = (isAdmin && algoAdminViewingUser) ? algoAdminViewingUser : 'all';

    const perfData = calculate7AlgorithmsPerformance(currentAlgoStartRound, effectiveUserId);
    const { fromRound: startR, maxRound, totalRoundsCount, grandTotalInvest, grandTotalPrize, grandProfit, grandRoi, grandRankCounts, grandTotalWins, grandWinRate, results } = perfData;

    // Upcoming round for real-time recommendation preview
    const nextRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    // Admin User Selector HTML
    let adminUserSelectHtml = '';
    if (isAdmin) {
        let userOptions = `<option value="all" ${effectiveUserId === 'all' ? 'selected' : ''}>🌐 전체 회원 추천번호 종합 당첨 결과</option>`;
        userOptions += `<option value="${authId}" ${effectiveUserId === authId ? 'selected' : ''}>👑 관리자 본인 (${authId})</option>`;
        
        // Fetch or use cached user list
        if (!state.allRegisteredUsersList && window.db) {
            try {
                const uSnap = await window.db.collection('lotto_users').get();
                state.allRegisteredUsersList = [];
                uSnap.forEach(d => {
                    const uData = d.data();
                    const isPerm = !!(uData.isPermanent === true || uData.isPermanent === 'true' || uData.userType === 'permanent' || uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin');
                    if (typeof window !== 'undefined' && typeof window.setIsPermanentCache === 'function') {
                        window.setIsPermanentCache(d.id, isPerm);
                    }
                    state.allRegisteredUsersList.push({
                        id: d.id,
                        name: uData.realName || d.id,
                        phone: uData.phoneNumber || '',
                        isAdmin: !!(uData.isAdmin === true || uData.role === 'admin' || d.id === 'master' || d.id === 'admin'),
                        isPermanent: isPerm,
                        userType: uData.userType || (isPerm ? 'permanent' : 'regular'),
                        createdAt: uData.createdAt || null
                    });
                });
            } catch(e) {}
        }

        const userList = state.allRegisteredUsersList || [];
        userList.forEach(u => {
            if ((u.id || '').toLowerCase().trim() !== cleanAuth) {
                userOptions += `<option value="${u.id}" ${effectiveUserId === u.id ? 'selected' : ''}>👤 ${u.id} (${u.name}${u.phone ? ` / ${u.phone}` : ''})</option>`;
            }
        });

        adminUserSelectHtml = `
            <div class="algo-admin-bar" style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 10px 14px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; max-width: 100%; box-sizing: border-box; overflow: hidden;">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 220px;">
                    <i class="fa-solid fa-crown" style="color: #fbbf24; font-size: 1.1rem; flex-shrink: 0;"></i>
                    <div style="min-width: 0;">
                        <strong style="color: #fbbf24; font-size: 0.85rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">[관리자 전용] 회원별 7대 알고리즘 추천번호 당첨 결과 조회기</strong>
                        <div style="font-size: 0.73rem; color: #cbd5e1; word-break: break-all;">선택한 회원의 영구 박제 스냅샷 및 7대 알고리즘 누적 적중 실적 동기화 확인</div>
                    </div>
                </div>
                <div class="algo-admin-select-wrapper" style="display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1 1 auto; max-width: 100%; box-sizing: border-box;">
                    <label for="algoAdminUserSelect" style="font-size: 0.78rem; color: #fbbf24; font-weight: 700; white-space: nowrap; flex-shrink: 0;">조회 대상:</label>
                    <select id="algoAdminUserSelect" onchange="window.changeAlgoAdminViewingUser && window.changeAlgoAdminViewingUser(this.value)" style="background: #0f172a; border: 1px solid #f59e0b; color: #fff; padding: 5px 8px; border-radius: 6px; font-size: 0.78rem; font-weight: 700; cursor: pointer; outline: none; max-width: 100%; min-width: 0; flex: 1; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; box-sizing: border-box;">
                        ${userOptions}
                    </select>
                </div>
            </div>
        `;
    }

    // 1. 알고리즘 소개 섹션 카드 HTML 생성
    const algoIntroCardsHtml = SEVEN_ALGORITHMS_INFO.map((algo, idx) => {
        const methodsHtml = algo.comboMethod.map(m => `
            <div style="background: rgba(0, 0, 0, 0.25); border-left: 3px solid ${algo.badgeColor}; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px;">
                <div style="font-size: 0.8rem; font-weight: 800; color: ${algo.badgeColor}; margin-bottom: 3px;">
                    <i class="fa-solid fa-check-circle" style="font-size: 0.72rem;"></i> ${m.step}
                </div>
                <div style="font-size: 0.75rem; color: #cbd5e1; line-height: 1.45;">
                    ${m.desc}
                </div>
            </div>
        `).join('');

        const featuresHtml = algo.keyFeatures.map(f => `
            <span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 3px 8px; font-size: 0.72rem; color: #94a3b8;">
                <i class="fa-solid fa-sparkles" style="color: ${algo.badgeColor}; font-size: 0.65rem;"></i> ${f}
            </span>
        `).join('');

        return `
            <div class="algo-spec-card" style="background: ${algo.bgGradient}; border: 1.5px solid ${algo.borderColor}; border-radius: 14px; padding: 16px 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 10px; transition: transform 0.2s ease;">
                <!-- Header Row -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: ${algo.badgeColor}25; border: 1px solid ${algo.badgeColor}; display: flex; align-items: center; justify-content: center; color: ${algo.badgeColor}; font-size: 1.1rem; flex-shrink: 0;">
                            <i class="fa-solid ${algo.icon}"></i>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 0.7rem; font-weight: 800; color: ${algo.badgeColor}; background: ${algo.badgeColor}15; border: 1px solid ${algo.badgeColor}40; padding: 1px 6px; border-radius: 6px;">
                                    알고리즘 #${idx + 1}
                                </span>
                                <span style="font-size: 0.72rem; font-weight: 800; color: #f8fafc; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 6px;">
                                    ${algo.badge}
                                </span>
                            </div>
                            <h3 style="margin: 3px 0 0 0; color: #f8fafc; font-size: 1.05rem; font-weight: 900;">
                                ${algo.name}
                            </h3>
                        </div>
                    </div>
                </div>

                <!-- Philosophy / Tag -->
                <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 12px;">
                    <div style="font-size: 0.72rem; color: #94a3b8; margin-bottom: 2px;">
                        <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> <strong>조합 철학 &amp; 핵심 이론</strong>
                    </div>
                    <p style="margin: 0; font-size: 0.77rem; color: #e2e8f0; line-height: 1.45;">
                        ${algo.corePhilosophy}
                    </p>
                </div>

                <!-- Step-by-Step Combo Method -->
                <div>
                    <div style="font-size: 0.75rem; font-weight: 800; color: #f8fafc; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-cubes-stacked" style="color: ${algo.badgeColor};"></i> 번호 조합 및 추출 메커니즘
                    </div>
                    ${methodsHtml}
                </div>

                <!-- Features Tags -->
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                    ${featuresHtml}
                </div>
            </div>
        `;
    }).join('');

    // 2. 실데이터 복기 리포트 실적 카드 HTML 생성 (통합 통계 요약)
    const algoPerfCardsHtml = results.map((algo, idx) => {
        let topRankBadge = '';
        if (algo.topRank === 1) topRankBadge = `<span style="background: rgba(251,191,36,0.25); border: 1px solid #fbbf24; color: #fbbf24; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥇 1등 적중 실적</span>`;
        else if (algo.topRank === 2) topRankBadge = `<span style="background: rgba(248,113,113,0.25); border: 1px solid #f87171; color: #f87171; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥈 2등 적중 실적</span>`;
        else if (algo.topRank === 3) topRankBadge = `<span style="background: rgba(96,165,250,0.25); border: 1px solid #60a5fa; color: #60a5fa; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">🥉 3등 적중 실적</span>`;
        else if (algo.topRank === 4) topRankBadge = `<span style="background: rgba(52,211,153,0.25); border: 1px solid #34d399; color: #34d399; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">✨ 4등 적중 실적</span>`;
        else if (algo.topRank === 5) topRankBadge = `<span style="background: rgba(167,139,250,0.25); border: 1px solid #a78bfa; color: #a78bfa; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem; font-weight: 800;">⭐ 5등 적중 실적</span>`;
        else topRankBadge = `<span style="background: rgba(255,255,255,0.06); color: #94a3b8; padding: 2px 7px; border-radius: 10px; font-size: 0.72rem;">추첨 추적 중</span>`;

        return `
            <div style="background: ${algo.bgGradient}; border: 1.5px solid ${algo.borderColor}; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.25);">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 6px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;">
                            <span style="background: ${algo.badgeColor}25; border: 1px solid ${algo.badgeColor}; color: ${algo.badgeColor}; padding: 2px 7px; border-radius: 12px; font-size: 0.7rem; font-weight: 800;">
                                <i class="fa-solid ${algo.icon}"></i> ${algo.badge}
                            </span>
                            ${topRankBadge}
                        </div>
                        <h4 style="margin: 0; color: #f8fafc; font-size: 0.95rem; font-weight: 900;">
                            ${algo.name}
                        </h4>
                        <p style="margin: 2px 0 0 0; color: #94a3b8; font-size: 0.73rem; line-height: 1.35;">
                            ${algo.tag}
                        </p>
                    </div>
                </div>

                <!-- KPI Metric Grid -->
                <div style="background: rgba(0,0,0,0.35); border-radius: 8px; padding: 8px 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; text-align: center;">
                    <div>
                        <span style="font-size: 0.68rem; color: #94a3b8; display: block;">누적 당첨금</span>
                        <strong style="font-size: 0.92rem; color: #34d399;">+${algo.totalPrize.toLocaleString()}원</strong>
                    </div>
                    <div>
                        <span style="font-size: 0.68rem; color: #94a3b8; display: block;">적중 건수 (적중률)</span>
                        <strong style="font-size: 0.92rem; color: #fbbf24;">${algo.totalWins}회 <span style="font-size:0.72rem; color:#fde047;">(${algo.winRate}%)</span></strong>
                    </div>
                    <div>
                        <span style="font-size: 0.68rem; color: #94a3b8; display: block;">수익률 (ROI)</span>
                        <strong style="font-size: 0.92rem; color: ${algo.roi >= 0 ? '#34d399' : '#f87171'};">${algo.roi > 0 ? '+' : ''}${algo.roi}%</strong>
                    </div>
                </div>

                <!-- Rank Breakdown Mini Badges -->
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px; font-size: 0.72rem; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 6px 8px;">
                    <span style="color: ${algo.rankCounts[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700;">1등: <strong>${algo.rankCounts[1]}회</strong></span>
                    <span style="color: ${algo.rankCounts[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700;">2등: <strong>${algo.rankCounts[2]}회</strong></span>
                    <span style="color: ${algo.rankCounts[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700;">3등: <strong>${algo.rankCounts[3]}회</strong></span>
                    <span style="color: ${algo.rankCounts[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700;">4등: <strong>${algo.rankCounts[4]}회</strong></span>
                    <span style="color: ${algo.rankCounts[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700;">5등: <strong>${algo.rankCounts[5]}회</strong></span>
                </div>
            </div>
        `;
    }).join('');

    // 3. 전체 탭 HTML 결합
    const html = `
        <div class="algorithms-intro-container" style="display: flex; flex-direction: column; gap: 20px;">
            
            <!-- Hero Header Banner -->
            <div class="algo-hero-banner" style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(99, 102, 241, 0.35); border-radius: 16px; padding: 20px 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); position: relative; overflow: hidden;">
                <div style="position: absolute; right: -20px; top: -20px; font-size: 8rem; color: rgba(99, 102, 241, 0.05); pointer-events: none;">
                    <i class="fa-solid fa-cubes-stacked"></i>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.5px;">
                        <i class="fa-solid fa-brain"></i> QUANT &amp; AI ENGINE
                    </span>
                    <span style="color: var(--accent-gold); font-size: 0.8rem; font-weight: 700;">
                        7대 알고리즘 분산 추천 &amp; 실데이터 누적 당첨 실적
                    </span>
                </div>
                <h2 style="margin: 0 0 8px 0; font-size: 1.45rem; font-weight: 900; color: #f8fafc; letter-spacing: -0.5px;">
                    로또 6/45 <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">7대 AI 알고리즘</span> 정밀 해설 &amp; 실적
                </h2>
                <p style="margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.5; max-width: 800px;">
                    단순한 무작위 번호 생성이 아닙니다. 행동경제학적 마킹 심리 회피, 마르코프 전이 확률, 직교 전수 커버리지, 휠링 하모닉 등 7가지 수리통계 모델의 조합 원리를 상세히 확인하고, 과거 회차 당첨 검증 데이터를 기반으로 한 실제 누적 적중 실적을 투명하게 확인하세요.
                </p>
            </div>

            <!-- Admin User Selector Bar (Admin only) -->
            ${adminUserSelectHtml}

            <!-- SECTION 1: 7대 알고리즘 조합 원리 상세 해설 -->
            <section class="algo-guide-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 4px; height: 18px; background: #6366f1; border-radius: 2px; display: inline-block;"></span>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 900; color: #f8fafc;">
                            1. 7대 알고리즘별 번호 조합 메커니즘
                        </h3>
                    </div>
                    <span style="font-size: 0.75rem; color: #94a3b8;">
                        <i class="fa-solid fa-circle-info" style="color: #60a5fa;"></i> 알고리즘별 10게임 맞춤형 조합 원리
                    </span>
                </div>

                <!-- 7 Algorithms Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px;">
                    ${algoIntroCardsHtml}
                </div>
            </section>

            <!-- SECTION 2: 추천번호 당첨 결과 기반 실데이터 누적 실적 대시보드 -->
            <section class="algo-performance-section" style="margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="width: 4px; height: 18px; background: #fbbf24; border-radius: 2px; display: inline-block;"></span>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 900; color: #f8fafc;">
                            2. 추천번호 당첨 결과 기반 7대 알고리즘 전체 회원 누적 당첨 실적 (전체 회원 통합)
                        </h3>
                    </div>
                    
                    <!-- 회차 범위 셀렉터 -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <label for="algoReviewStartRoundSelect" style="font-size: 0.75rem; color: #94a3b8; font-weight: 700;">집계 시작 회차:</label>
                        <select id="algoReviewStartRoundSelect" onchange="window.changeAlgoReviewStartRound && window.changeAlgoReviewStartRound(this.value)" style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(255,255,255,0.15); color: #fbbf24; padding: 4px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                            <option value="1235" ${currentAlgoStartRound === 1235 ? 'selected' : ''}>제 1235회부터 누적 (실제 발급 이력)</option>
                            <option value="1230" ${currentAlgoStartRound === 1230 ? 'selected' : ''}>제 1230회부터 누적</option>
                            <option value="1220" ${currentAlgoStartRound === 1220 ? 'selected' : ''}>제 1220회부터 누적</option>
                            <option value="1200" ${currentAlgoStartRound === 1200 ? 'selected' : ''}>제 1200회부터 누적</option>
                            <option value="1" ${currentAlgoStartRound === 1 ? 'selected' : ''}>제 1회부터 전체 전수 누적</option>
                        </select>
                    </div>
                </div>

                <!-- 🌟 1235회차 실제 추천번호 당첨내역 강조 공지 배너 -->
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%); border: 1.5px solid rgba(16, 185, 129, 0.45); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.15);">
                    <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; display: flex; align-items: center; justify-content: center; color: #34d399; font-size: 1.25rem; flex-shrink: 0;">
                        <i class="fa-solid fa-certificate"></i>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="background: #10b981; color: #0f172a; font-size: 0.7rem; font-weight: 900; padding: 2px 7px; border-radius: 6px; letter-spacing: 0.3px;">
                                100% 무결점 실데이터 검증
                            </span>
                            <span style="font-size: 0.85rem; font-weight: 800; color: #f8fafc;">
                                제 1235회차부터 전체 회원 실제 추천번호 기반 7대 알고리즘별 당첨 내역 (${effectiveUserId === 'all' ? '전체 회원 통합 전수 집계' : `${maskUserDisplayName(effectiveUserId, effectiveUserId)} 회원`})
                            </span>
                        </div>
                        <p style="margin: 0; font-size: 0.77rem; color: #cbd5e1; line-height: 1.45;">
                            본 누적 당첨 내역은 <strong style="color: #34d399;">제 1235회차부터 매주 등록된 전체 회원들에게 실제로 생성·발급된 7대 알고리즘 추천번호(각 10게임)의 영구 박제 스냅샷</strong>을 동행복권 공식 추첨 결과와 1:1로 전수 대조하여 채점한 <strong style="color: #fbbf24;">100% 실제 전수 적중 실적 데이터</strong>입니다.
                        </p>
                    </div>
                </div>

                <!-- Grand Summary KPI Card -->
                <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 14px; padding: 14px 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #0f172a; padding: 2px 7px; border-radius: 6px; font-size: 0.72rem; font-weight: 900;">
                                <i class="fa-solid fa-trophy"></i> 7대 알고리즘 통합 실적 요약
                            </span>
                            <span style="font-size: 0.8rem; font-weight: 800; color: #f8fafc;">
                                제 ${startR}~${maxRound}회 (${totalRoundsCount}회차 실제 추천번호 전수 집계)
                            </span>
                        </div>
                    </div>

                    <!-- KPI Metrics 4-Column Grid -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; text-align: center;">
                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">누적 총 당첨금</span>
                            <strong style="font-size: 1.1rem; color: #34d399; font-weight: 900;">+${grandTotalPrize.toLocaleString()}원</strong>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">총 적중 횟수 (적중률)</span>
                            <strong style="font-size: 1.1rem; color: #fbbf24; font-weight: 900;">${grandTotalWins}회 <span style="font-size:0.75rem; color:#fde047;">(${grandWinRate}%)</span></strong>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">통합 수익률 (ROI)</span>
                            <strong style="font-size: 1.1rem; color: ${grandRoi >= 0 ? '#34d399' : '#f87171'}; font-weight: 900;">${grandRoi > 0 ? '+' : ''}${grandRoi}%</strong>
                        </div>
                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">1~5등 등급별 적중</span>
                            <div style="display: flex; gap: 3px; justify-content: center; flex-wrap: wrap; margin-top: 3px;">
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(251,191,36,0.25); color: #fbbf24; font-weight: 800;">1등:${grandRankCounts[1]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(248,113,113,0.25); color: #f87171; font-weight: 800;">2등:${grandRankCounts[2]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(96,165,250,0.25); color: #60a5fa; font-weight: 800;">3등:${grandRankCounts[3]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(52,211,153,0.25); color: #34d399; font-weight: 800;">4등:${grandRankCounts[4]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(167,139,250,0.25); color: #a78bfa; font-weight: 800;">5등:${grandRankCounts[5]}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 7 Algorithms Performance Cards Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px;">
                    ${algoPerfCardsHtml}
                </div>
            </section>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * 관리자 전용 알고리즘 탭 조회 회원 변경
 */
export function changeAlgoAdminViewingUser(userId) {
    algoAdminViewingUser = userId;
    renderAlgorithmsTab();
    showToast(`👑 [${userId}] 회원의 7대 알고리즘 추천 조합으로 전환되었습니다.`);
}

/**
 * 특정 알고리즘의 회차별 아코디언 토글
 */
export function toggleAlgoDetailAccordion(algoId) {
    algoDetailAccordionMap[algoId] = !algoDetailAccordionMap[algoId];
    renderAlgorithmsTab();
}

/**
 * 모든 알고리즘의 회차별 아코디언 전체 펼치기/접기
 */
export function toggleAllAlgoDetailAccordions(expand = true) {
    ['v4', 'v3', 'extra1', 'extra2', 'extra3', 'extra4', 'extra5'].forEach(id => {
        algoDetailAccordionMap[id] = !!expand;
    });
    renderAlgorithmsTab();
}

/**
 * 집계 시작 회차 변경
 */
export function changeAlgoReviewStartRound(roundVal) {
    const r = parseInt(roundVal, 10);
    if (!isNaN(r)) {
        currentAlgoStartRound = r;
        renderAlgorithmsTab(r);
        showToast(`제 ${r}회차부터의 실적으로 재집계되었습니다.`);
    }
}

if (typeof window !== 'undefined') {
    window.renderAlgorithmsTab = renderAlgorithmsTab;
    window.changeAlgoAdminViewingUser = changeAlgoAdminViewingUser;
    window.toggleAlgoDetailAccordion = toggleAlgoDetailAccordion;
    window.toggleAllAlgoDetailAccordions = toggleAllAlgoDetailAccordions;
    window.changeAlgoReviewStartRound = changeAlgoReviewStartRound;
}
