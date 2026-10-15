import { state, initHistory } from '../state.js';
import { showToast, isSystemOrDummyUser } from '../../../shared/utils.js';
import { computeAbsoluteTop10Combinations, generateExtraAddonPack } from '../generator.js';
import { fetchAllUsersPurchases, getSafeActualDraw } from '../ledger.js';
import { SafeAuth, isAdminUser } from '../../../shared/auth-mgmt.js';
import { getAllUnifiedRegisteredUsers } from '../../../shared/user-context.js';
import { computeUser70RecommendationsReview } from './review-tab.js';

let currentAlgoStartRound = 1235;
let algoDetailAccordionMap = {};
let algoAdminViewingUser = 'all';

/**
 * 알고리즘 탭 전용 3D 로또볼 및 직관 애니메이션 CSS 스타일 동적 주입
 */
function ensureAlgoAnimationStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('algoAnimationStyles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'algoAnimationStyles';
    styleEl.textContent = `
        /* 3D 로또볼 실물 입체 스타일 */
        .lotto-ball-3d {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            font-weight: 900;
            color: #ffffff;
            text-shadow: 0 1px 2px rgba(0,0,0,0.6);
            box-shadow: inset -2px -2px 5px rgba(0,0,0,0.4), inset 2px 2px 4px rgba(255,255,255,0.7), 0 2px 5px rgba(0,0,0,0.4);
            flex-shrink: 0;
            box-sizing: border-box;
        }
        .ball-yellow { background: radial-gradient(circle at 35% 35%, #fde047 0%, #eab308 60%, #ca8a04 100%); color: #422006; text-shadow: 0 1px 1px rgba(255,255,255,0.4); }
        .ball-blue { background: radial-gradient(circle at 35% 35%, #60a5fa 0%, #2563eb 60%, #1d4ed8 100%); }
        .ball-red { background: radial-gradient(circle at 35% 35%, #f87171 0%, #dc2626 60%, #991b1b 100%); }
        .ball-gray { background: radial-gradient(circle at 35% 35%, #94a3b8 0%, #475569 60%, #1e293b 100%); }
        .ball-green { background: radial-gradient(circle at 35% 35%, #4ade80 0%, #16a34a 60%, #14532d 100%); }

        /* 저울 시소 모션 (올라운더 1) */
        @keyframes algoMiniSway {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-5deg); }
            75% { transform: rotate(5deg); }
        }
        .anim-algo-sway { animation: algoMiniSway 4s ease-in-out infinite; }

        /* 이월수 비행 모션 (올라운더 2) */
        @keyframes algoMiniFly {
            0% { transform: translate(0, 0) scale(1); box-shadow: 0 0 0 rgba(251,191,36,0); }
            40% { transform: translate(45px, -18px) scale(1.25); box-shadow: 0 0 16px rgba(251,191,36,0.9); }
            80%, 100% { transform: translate(95px, 0) scale(1); }
        }
        .anim-algo-fly { animation: algoMiniFly 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }

        /* 자석 연번/단짝 결합 모션 (올라운더 2, 흐름부스터) */
        @keyframes algoMiniMagnet {
            0%, 60% { transform: translateX(12px); opacity: 0.5; }
            80%, 100% { transform: translateX(0); opacity: 1; }
        }
        .anim-algo-magnet { animation: algoMiniMagnet 2.2s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }

        /* 45개 전구 올점등 모션 (올라운더 3) */
        @keyframes algoMiniBulb {
            0%, 30% { background: #334155; color: #64748b; box-shadow: none; }
            50%, 100% { background: #10b981; color: #ffffff; box-shadow: 0 0 10px #34d399; }
        }
        .anim-algo-bulb { animation: algoMiniBulb 2s ease-in-out infinite; }

        /* 황금 코인 샤워 모션 (슈퍼잭팟) */
        @keyframes algoMiniCoin {
            0% { transform: translateY(-10px); opacity: 0; }
            50% { transform: translateY(0); opacity: 1; }
            100% { transform: translateY(0) scale(1.1); filter: drop-shadow(0 0 6px #fbbf24); }
        }
        .anim-algo-coin { animation: algoMiniCoin 1.8s ease-in-out infinite alternate; }

        /* 3구간 드롭 모션 (멀티히트) */
        @keyframes algoMiniDrop {
            0% { transform: translateY(-16px); opacity: 0; }
            60% { transform: translateY(2px); opacity: 1; }
            100% { transform: translateY(0); opacity: 1; }
        }
        .anim-algo-drop { animation: algoMiniDrop 1.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }

        /* 황금 3수 락온 펄스 (트리오마스터) */
        @keyframes algoMiniTrio {
            0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px #ec4899); }
            50% { transform: scale(1.08); filter: drop-shadow(0 0 12px #f43f5e); }
        }
        .anim-algo-trio { animation: algoMiniTrio 2.5s ease-in-out infinite; }
    `;
    document.head.appendChild(styleEl);
}

/**
 * 7대 알고리즘 정밀 정의 메타데이터 (조합 원리, 핵심 이론, 직관 애니메이션, 쉬운 요약 등)
 */
export const SEVEN_ALGORITHMS_INFO = [
    {
        id: 'v4',
        name: '기본 1: 올라운더 팩 (10게임)',
        shortName: '올라운더 팩',
        tag: '안정 방어 & 대박 포트폴리오 · 올인원 균형 융합 (10게임)',
        icon: 'fa-brain',
        badge: 'ALL-ROUNDER',
        badgeColor: '#a78bfa',
        bgGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(167, 139, 250, 0.45)',
        simpleBadge: '⚖️ 완벽한 3:3 균형',
        simpleCatch: '"홀수 3개 + 짝수 3개로 완벽한 수평 맞추기!"',
        simpleSummary: '홀수만 몰리거나 짝수만 몰리지 않게 딱 반반(3:3)으로 균형을 맞춰 가장 안정적으로 당첨을 방어합니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(167, 139, 250, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #c4b5fd; margin-bottom: 8px;">
                    "홀수 3개 + 짝수 3개로 완벽한 수평 맞추기!"
                </div>
                <div style="height: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                    <!-- Balance Beam -->
                    <div class="anim-algo-sway" style="width: 200px; height: 5px; background: linear-gradient(90deg, #f43f5e 0%, #818cf8 50%, #38bdf8 100%); border-radius: 999px; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
                        <!-- Center Pin -->
                        <div style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; background: #ffffff; border-radius: 50%; border: 2px solid #6366f1; z-index: 10;"></div>
                        <!-- Left Basket (Odd 3) -->
                        <div style="position: absolute; left: -8px; top: 8px; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 1.5px; height: 12px; background: #64748b;"></div>
                            <div style="background: rgba(225, 29, 72, 0.25); border: 1.5px solid #f43f5e; border-radius: 8px; padding: 3px 5px; display: flex; gap: 3px; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
                                <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">7</span>
                                <span class="lotto-ball-3d ball-blue" style="width: 20px; height: 20px; font-size: 10px;">15</span>
                                <span class="lotto-ball-3d ball-gray" style="width: 20px; height: 20px; font-size: 10px;">31</span>
                            </div>
                            <span style="font-size: 9px; font-weight: 900; color: #fb7185; margin-top: 2px;">홀수 3개</span>
                        </div>
                        <!-- Right Basket (Even 3) -->
                        <div style="position: absolute; right: -8px; top: 8px; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 1.5px; height: 12px; background: #64748b;"></div>
                            <div style="background: rgba(14, 165, 233, 0.25); border: 1.5px solid #38bdf8; border-radius: 8px; padding: 3px 5px; display: flex; gap: 3px; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
                                <span class="lotto-ball-3d ball-blue" style="width: 20px; height: 20px; font-size: 10px;">16</span>
                                <span class="lotto-ball-3d ball-gray" style="width: 20px; height: 20px; font-size: 10px;">32</span>
                                <span class="lotto-ball-3d ball-green" style="width: 20px; height: 20px; font-size: 10px;">44</span>
                            </div>
                            <span style="font-size: 9px; font-weight: 900; color: #7dd3fc; margin-top: 2px;">짝수 3개</span>
                        </div>
                    </div>
                    <!-- Stand -->
                    <div style="width: 3px; height: 20px; background: #475569; margin-top: 2px;"></div>
                    <div style="width: 44px; height: 5px; background: #334155; border-radius: 3px 3px 0 0;"></div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">✨ 역대 1등 80%가 나오는 황금 비율</span>
                    <span style="color: #34d399; font-weight: 900;">수평 밸런스 100%</span>
                </div>
            </div>
        `,
        corePhilosophy: '대중의 번호 마킹 편향(생일·연속·기하학 패턴)을 역이용하여 당첨 시 독점 수령금을 극대화하고, 통계적 안정망으로 4·5등 당첨을 방어하는 올라운더 균형 포트폴리오 모델',
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
        name: '기본 2: 올라운더 팩 2 (10게임)',
        shortName: '올라운더 팩 2',
        tag: '마르코프 2차 모멘텀 · 고번호 연번 · 직전 이월수 집중 타격 (10게임)',
        icon: 'fa-cubes-stacked',
        badge: 'ALL-ROUNDER 2',
        badgeColor: '#3b82f6',
        bgGradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(59, 130, 246, 0.45)',
        simpleBadge: '🚀 지난주 공 이어받기',
        simpleCatch: '"지난주 나온 공 하나가 슈웅 날아와 찰칵 결합!"',
        simpleSummary: '로또 10번 중 6번은 지난주 번호가 또 나옵니다. 그 흐름을 잡고 연속된 쌍둥이 번호를 붙여 연속 당첨을 노립니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(59, 130, 246, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #93c5fd; margin-bottom: 8px;">
                    "지난주 나온 공 하나가 슈웅 날아와 찰칵 결합!"
                </div>
                <div style="height: 72px; display: flex; align-items: center; justify-content: space-between; padding: 0 8px; position: relative;">
                    <!-- Last Week Box -->
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 9px; font-weight: 900; color: #94a3b8; margin-bottom: 3px;">지난주 당첨</span>
                        <div style="background: rgba(15, 23, 42, 0.9); border: 1.5px solid #475569; border-radius: 10px; padding: 4px 6px; display: flex; gap: 4px; position: relative;">
                            <span class="lotto-ball-3d ball-blue" style="width: 22px; height: 22px; font-size: 11px; position: relative;">
                                18
                                <span class="lotto-ball-3d ball-blue anim-algo-fly" style="width: 22px; height: 22px; font-size: 11px; position: absolute; inset: 0; pointer-events: none;">18</span>
                            </span>
                            <span class="lotto-ball-3d ball-gray" style="width: 22px; height: 22px; font-size: 11px; opacity: 0.35;">26</span>
                        </div>
                    </div>
                    <!-- Trajectory Arrow -->
                    <div style="flex: 1; margin: 0 10px; display: flex; flex-direction: column; align-items: center; position: relative;">
                        <span style="font-size: 9px; font-weight: 900; color: #fbbf24;">슝~ 날아서 착탄!</span>
                        <div style="width: 100%; height: 3px; background: linear-gradient(90deg, #3b82f6 0%, #fbbf24 50%, #10b981 100%); border-radius: 999px; margin: 3px 0;"></div>
                        <span style="font-size: 8px; color: #94a3b8;">이월 확률 62%</span>
                    </div>
                    <!-- This Week Slot & Twin Consecutive Balls -->
                    <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 9px; font-weight: 900; color: #fbbf24; margin-bottom: 3px;">이번주 추천</span>
                        <div style="background: rgba(30, 58, 138, 0.35); border: 1.5px solid #38bdf8; border-radius: 10px; padding: 4px 6px; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 12px rgba(56, 189, 248, 0.2);">
                            <div style="width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed #fbbf24; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5);">
                                <span style="font-size: 10px; font-weight: 900; color: #fbbf24;">18</span>
                            </div>
                            <div class="anim-algo-magnet" style="display: flex; align-items: center; gap: 2px;">
                                <span class="lotto-ball-3d ball-gray" style="width: 22px; height: 22px; font-size: 11px;">34</span>
                                <span style="font-size: 9px; color: #fbbf24; font-weight: 900;">🔗</span>
                                <span class="lotto-ball-3d ball-gray" style="width: 22px; height: 22px; font-size: 11px;">35</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">🎯 지난주 번호 재출현 + [34-35] 쌍둥이 연번</span>
                    <span style="color: #60a5fa; font-weight: 900;">모멘텀 적중</span>
                </div>
            </div>
        `,
        corePhilosophy: '올라운더 팩 1(정통 밸런스·저번호 연번)과 완벽히 상호보완 작용하도록 설계된 자매 모델. 마르코프 2차 전이 모멘텀, 23~45번대 고번호 연번, 직전 회차 이월수 및 차상위 황금 클리크 앵커를 결합한 다이나믹 모멘텀 포트폴리오',
        comboMethod: [
            {
                step: '그룹 1: 다이나믹 모멘텀 밸런스 (게임 1~4)',
                desc: '올라운더 1의 3:3 대칭을 보완하여, 실제 추첨에서 자주 발생하는 4:2 / 2:4 비대칭 홀짝 파동과 합계 130~170 중·고번호 모멘텀 대역을 정밀하게 추출합니다. 끝수 고유값 5개 이상 강제 분산으로 기초 당첨률을 극대화합니다.'
            },
            {
                step: '그룹 2: 고번호 연번 & 이월수 집중 타격 (게임 5~7)',
                desc: '올라운더 1과 차별화된 23~45번대 고번호 연속쌍(2연번) 1쌍과 직전 회차 당첨번호 중 마르코프 계수 최고 이월수 1~2개를 필수 결합하고, AC값 8~10을 유지하여 연속 당첨 모멘텀을 극대화합니다.'
            },
            {
                step: '그룹 3: 역사적 과적합 2차 황금 클러스터 (게임 8~10)',
                desc: '역대 1,244회 전수 당첨 데이터 중 올라운더 1 앵커와 겹치지 않는 차상위 다중 교집합(Maximal Clique B) 앵커 3개 세트를 기반으로 ±1 인접수 변형을 가미하여 기계적 적중 밀도를 2배로 확장합니다.'
            }
        ],
        keyFeatures: [
            '올라운더 1과의 완벽한 직교(Orthogonal) 상호보완 설계',
            '이월수(출현율 62%) 및 고번호(23~45) 연번 필수 결합',
            '비대칭 홀짝 파동(4:2/2:4) 및 합계 130~170 정밀 타격'
        ],
        getCombos: (r, uId) => computeAbsoluteTop10Combinations(false, r, 'v3', true, uId) || []
    },
    {
        id: 'extra1',
        name: '기본 3: 올라운더 팩 3 (10게임)',
        shortName: '올라운더 팩 3',
        tag: '기본 20게임 누락 번호 100% 포섭 + 핫 앵커 & 이월수 결합 (10게임)',
        icon: 'fa-shield-halved',
        badge: 'ZERO-GAP 100%',
        badgeColor: '#10b981',
        bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.45)',
        simpleBadge: '🧩 빠진 번호 0개 (빈틈제로)',
        simpleCatch: '"1번부터 45번까지 전구 45개를 100% 싹 다 켜기!"',
        simpleSummary: '내가 안 산 번호에서 1등이 나오는 억울함을 막기 위해, 1번부터 45번까지 모든 번호를 빠짐없이 싹 다 챙깁니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #6ee7b7; margin-bottom: 8px;">
                    "1번부터 45번까지 전구 45개를 100% 싹 다 켜기!"
                </div>
                <div style="height: 72px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                    <div style="width: 100%; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 6px 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem; font-weight: 700; margin-bottom: 5px;">
                            <span style="color: #94a3b8;">1·2팩 미출현 번호: <strong style="color: #f43f5e;">[4][6][22]</strong></span>
                            <span style="color: #34d399; font-weight: 900;">💡 100% 올점등 완료!</span>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 3px;">
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">1</span>
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">2</span>
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">3</span>
                            <span class="lotto-ball-3d anim-algo-bulb" style="width: 22px; height: 22px; font-size: 10px; border: 1.5px solid #ffffff;">4</span>
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">5</span>
                            <span class="lotto-ball-3d anim-algo-bulb" style="width: 22px; height: 22px; font-size: 10px; border: 1.5px solid #ffffff;">6</span>
                            <span style="color: #64748b; font-size: 10px; font-weight: 900;">···</span>
                            <span class="lotto-ball-3d anim-algo-bulb" style="width: 22px; height: 22px; font-size: 10px; border: 1.5px solid #ffffff;">22</span>
                            <span style="color: #64748b; font-size: 10px; font-weight: 900;">···</span>
                            <span class="lotto-ball-3d ball-green" style="width: 20px; height: 20px; font-size: 10px;">45</span>
                        </div>
                        <div style="width: 100%; height: 5px; background: rgba(0,0,0,0.6); border-radius: 999px; margin-top: 6px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #10b981 0%, #34d399 50%, #2dd4bf 100%);"></div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">🛡️ 30게임 구매 시 1~45번 중 누락 0개</span>
                    <span style="color: #34d399; font-weight: 900;">100% 완전 방어 (Zero-Gap)</span>
                </div>
            </div>
        `,
        corePhilosophy: '기본 20게임(올라운더 1 10G + 올라운더 2 10G)에서 한 번도 선택되지 않은 사각지대 번호 중 장기 결손 회귀 가능성이 높은 번호를 선별하고, 핫 앵커 및 직전 회차 이월수(출현율 62%)를 융합하여 30게임 구매 시 전수 포섭과 적중 안정성을 동시에 완성하는 빈틈없는 전수 커버리지 모델',
        comboMethod: [
            {
                step: '누락 번호 전수 분할 (Missing Partition)',
                desc: '기본 20게임 미선택 번호 중 결손 기간(10주 이상) 회귀 가능성이 높은 번호를 우선 선별하여 10게임에 1~2개씩 균등하게 강제 배치합니다.'
            },
            {
                step: '상위 핫 앵커 & 직전 이월수 결합',
                desc: '역대 빈도+마르코프 최상위 핫 앵커 및 직전 회차 이월수(출현율 62%)를 융합하여 적중 안정망을 구축합니다.'
            },
            {
                step: '7대 퀀트 필터 통과',
                desc: '합계(95~195), AC값 7이상, 홀짝(2:4~4:2), 저고(2:4~4:2), 3연번 배제, 끝수 중복 제한(최대 2개), 색상 3구간 이상을 만족하는 조합만 최종 채택합니다.'
            }
        ],
        keyFeatures: [
            '1~45번 모든 번호 100% 전수 커버리지 달성',
            '사각지대 0% 무결점 30게임 포트폴리오 완성',
            '핫 앵커 & 직전 이월수 결합으로 적중 안정성 확보'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(1, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra2',
        name: '추가 2: 슈퍼 잭팟 팩 (10게임)',
        shortName: '추가 2: 슈퍼 잭팟',
        tag: '25~45번대 고번호 집중 + 2연번 강제 주입 당첨금 극대화 (10게임)',
        icon: 'fa-sack-dollar',
        badge: 'SUPER JACKPOT',
        badgeColor: '#f59e0b',
        bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(245, 158, 11, 0.45)',
        simpleBadge: '💰 혼자서 40억 독식!',
        simpleCatch: '"사람들 몰리는 생일 번호 피해서 당첨금 독차지!"',
        simpleSummary: '남들이 가족 생일(1~31) 찍을 때, 아무도 안 찍는 큰 번호(25~45)를 찍어 1등 당첨금을 나눠 갖지 않고 혼자 독차지합니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #fde68a; margin-bottom: 8px;">
                    "사람들 몰리는 생일 번호 피해서 당첨금 독차지!"
                </div>
                <div style="height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 8px; position: relative;">
                    <!-- Birthday Zone (Crowded) -->
                    <div style="flex: 1; background: rgba(15, 23, 42, 0.9); border: 1px solid #475569; border-radius: 10px; padding: 5px 6px; text-align: center; opacity: 0.7;">
                        <span style="font-size: 9px; font-weight: 900; color: #fb7185; display: block;">1~31번 (생일수)</span>
                        <div style="font-size: 11px; margin: 2px 0;">👥 👥 👥</div>
                        <span style="font-size: 9px; color: #94a3b8; text-decoration: line-through; display: block;">14명 쪼개짐 (15억)</span>
                    </div>
                    <!-- Right Arrow -->
                    <div style="font-size: 12px; font-weight: 900; color: #fbbf24;">▶</div>
                    <!-- High Number Jackpot Zone (Monopoly) -->
                    <div style="flex: 1; background: linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(15, 23, 42, 0.9) 100%); border: 1.5px solid #fbbf24; border-radius: 10px; padding: 5px 6px; text-align: center; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);">
                        <span style="font-size: 9px; font-weight: 900; color: #fbbf24; display: block;">25~45번 (고번호)</span>
                        <div class="anim-algo-coin" style="font-size: 12px; margin: 2px 0;">👑 💰 💰</div>
                        <span style="font-size: 10px; font-weight: 900; color: #fde047; display: block;">단독 독식 48억 폭등!</span>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">👑 생일 번호(1~31) 배제</span>
                    <span style="color: #fbbf24; font-weight: 900;">당첨금 2.5배 싹쓸이</span>
                </div>
            </div>
        `,
        corePhilosophy: '대부분의 구매자가 생일(1~31) 및 저번호대를 선호한다는 점에 착안, 25~45번대 고번호 3개와 2연번, 이월수(60%)를 집중 배치하여 1등 당첨 시 당첨자 수가 급감하고 1인당 수령금이 30~50억 이상으로 폭등하도록 설계한 슈퍼 잭팟 초고배당 특화 모델',
        comboMethod: [
            {
                step: '고번호(25~45) 대역 3개 이상 집중 배치',
                desc: '조합당 25~45번 번호를 최소 3개 이상 배정하여 일반 구매자들의 생일 중심 선택 구간(1~31)과 완벽히 차별화합니다.'
            },
            {
                step: '고번호 2연번 및 직전 이월수 의도적 삽입',
                desc: '대중이 무의식적으로 기피하는 2연번 1쌍과 직전 회차 이월수(60% 확률)를 반영합니다.'
            },
            {
                step: '합계 120~205 특화 퀀트 필터링',
                desc: '고번호 중심 조합의 특성에 맞추어 총합 범위를 120~205로 상향 보정하고 AC값 7 이상을 엄격히 검증합니다.'
            }
        ],
        keyFeatures: [
            '1등 당첨 시 1인 독점 수령금(Super Jackpot) 극대화',
            '생일수(1~31) 배제로 대중과의 당첨금 셰어링 원천 차단',
            '고번호 2연번 & 이월수 집중 타격 전략'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(2, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra3',
        name: '추가 3: 멀티 히트 팩 (10게임)',
        shortName: '추가 3: 멀티 히트',
        tag: '3구간(1~15, 16~30, 31~45) 2-2-2 자연 군집 휠링 · 3~5등 다중 적중 방어망 (10게임)',
        icon: 'fa-dharmachakra',
        badge: 'MULTI-HIT WHEEL',
        badgeColor: '#8b5cf6',
        bgGradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(139, 92, 246, 0.45)',
        simpleBadge: '🎡 3개 구역 2-2-2 조화',
        simpleCatch: '"앞쪽 2개, 중간 2개, 뒤쪽 2개씩 골고루 쏙쏙!"',
        simpleSummary: '한쪽 번호대에 쏠리지 않도록 저(1~15)·중(16~30)·고(31~45) 3개 구역에서 2개씩 공평하게 뽑아 3·4·5등 여러 개를 한 번에 맞춥니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(139, 92, 246, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #c4b5fd; margin-bottom: 8px;">
                    "앞쪽 2개, 중간 2개, 뒤쪽 2개씩 골고루 쏙쏙!"
                </div>
                <div style="height: 72px; display: flex; align-items: center; justify-content: space-around; position: relative;">
                    <!-- 3 Zone Baskets -->
                    <div class="anim-algo-drop" style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 9px; font-weight: 900; color: #fde047; margin-bottom: 2px;">1~15구역</span>
                        <div style="background: rgba(234, 179, 8, 0.2); border: 1px solid #eab308; border-radius: 8px; padding: 3px 5px; display: flex; gap: 3px;">
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">3</span>
                            <span class="lotto-ball-3d ball-yellow" style="width: 20px; height: 20px; font-size: 10px;">11</span>
                        </div>
                        <span style="font-size: 9px; font-weight: 900; color: #fde047; margin-top: 2px;">2개 쏙!</span>
                    </div>
                    <span style="font-size: 11px; font-weight: 900; color: #64748b;">+</span>
                    <div class="anim-algo-drop" style="display: flex; flex-direction: column; align-items: center; animation-delay: 0.2s;">
                        <span style="font-size: 9px; font-weight: 900; color: #60a5fa; margin-bottom: 2px;">16~30구역</span>
                        <div style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 8px; padding: 3px 5px; display: flex; gap: 3px;">
                            <span class="lotto-ball-3d ball-blue" style="width: 20px; height: 20px; font-size: 10px;">19</span>
                            <span class="lotto-ball-3d ball-red" style="width: 20px; height: 20px; font-size: 10px;">28</span>
                        </div>
                        <span style="font-size: 9px; font-weight: 900; color: #60a5fa; margin-top: 2px;">2개 쏙!</span>
                    </div>
                    <span style="font-size: 11px; font-weight: 900; color: #64748b;">+</span>
                    <div class="anim-algo-drop" style="display: flex; flex-direction: column; align-items: center; animation-delay: 0.4s;">
                        <span style="font-size: 9px; font-weight: 900; color: #f43f5e; margin-bottom: 2px;">31~45구역</span>
                        <div style="background: rgba(244, 63, 94, 0.2); border: 1px solid #f43f5e; border-radius: 8px; padding: 3px 5px; display: flex; gap: 3px;">
                            <span class="lotto-ball-3d ball-gray" style="width: 20px; height: 20px; font-size: 10px;">36</span>
                            <span class="lotto-ball-3d ball-green" style="width: 20px; height: 20px; font-size: 10px;">42</span>
                        </div>
                        <span style="font-size: 9px; font-weight: 900; color: #f43f5e; margin-top: 2px;">2개 쏙!</span>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">🎡 3개 구역 2-2-2 균등 분산</span>
                    <span style="color: #a78bfa; font-weight: 900;">3·4·5등 복수 다중 당첨 최적화</span>
                </div>
            </div>
        `,
        corePhilosophy: '로또 번호 45개를 1~15, 16~30, 31~45의 3대 자연 구역으로 분할하고, 각 구역에서 번호를 2개씩 균형 추출(2-2-2)하여 결합하는 자연 군집 휠링 시스템(Harmonic Clustering Wheel). 특정 구간 쏠림을 원천 차단하여 3등(150만원), 4등(5만원), 5등(5천원) 복수 다중 적중 확률을 극대화한 멀티 히트 구조적 모델',
        comboMethod: [
            {
                step: '45개 번호 3대 자연 하모닉 구역 분할',
                desc: '1구역(1~15 저번호), 2구역(16~30 중번호), 3구역(31~45 고번호)으로 15개씩 자연 대역 분할합니다.'
            },
            {
                step: '3개 구역별 2개씩 2-2-2 균형 추출',
                desc: '각 구역에서 퀀트 가중치 기반 번호를 2개씩 균형 있게 선별하여 2-2-2 대칭 군집을 형성합니다.'
            },
            {
                step: '휠링 회전 결합 및 7대 퀀트 필터 통과',
                desc: '10개 게임에 걸쳐 회전식(Wheeling) 매트릭스로 배치하고 역대 1등 기출 배제 및 7대 퀀트 필터를 검증합니다.'
            }
        ],
        keyFeatures: [
            '3개 대역 2-2-2 균등 분산으로 특정 구간 편중 0%',
            '3·4·5등 복수 다중 당첨(Multi-Hit) 확률 최적화',
            '자연 군집 휠링 매트릭스 알고리즘 적용'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(3, r, uId); return (p && p.combos) ? p.combos : []; }
    },
    {
        id: 'extra4',
        name: '추가 4: 흐름 부스터 팩 (10게임)',
        shortName: '추가 4: 흐름 부스터',
        tag: '직전 회차 전이 확률 + 역대 최다 동반출현 Pair 집중 타격 (10게임)',
        icon: 'fa-bolt',
        badge: 'FLOW BOOSTER',
        badgeColor: '#06b6d4',
        bgGradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(6, 182, 212, 0.45)',
        simpleBadge: '⚡ 최강 2수 듀오 결합',
        simpleCatch: '"역사상 가장 자주 같이 나온 영혼의 단짝 2수 결합!"',
        simpleSummary: '역대 1,200회 추첨 중 가장 많이 손잡고 나온 \'최강 단짝 번호 2개\'를 필수 결합하여 당첨 흐름을 가속합니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(6, 182, 212, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #67e8f9; margin-bottom: 8px;">
                    "역사상 가장 자주 같이 나온 영혼의 단짝 2수 결합!"
                </div>
                <div style="height: 72px; display: flex; align-items: center; justify-content: center; gap: 14px; position: relative;">
                    <div class="anim-algo-magnet" style="display: flex; align-items: center; gap: 6px;">
                        <span class="lotto-ball-3d ball-blue" style="width: 26px; height: 26px; font-size: 12px;">11</span>
                        <div style="font-size: 16px; color: #fde047; font-weight: 900; text-shadow: 0 0 8px #f59e0b;">⚡</div>
                        <span class="lotto-ball-3d ball-red" style="width: 26px; height: 26px; font-size: 12px;">29</span>
                    </div>
                    <div style="background: rgba(6, 182, 212, 0.15); border: 1px solid #06b6d4; border-radius: 8px; padding: 4px 8px; font-size: 0.72rem; color: #e0f2fe; text-align: left;">
                        <div style="font-weight: 900; color: #67e8f9;">동반 출현 1위 콤비</div>
                        <div style="font-size: 9px; color: #94a3b8;">역대 최다 동시 출현 39회</div>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">⚡ 역대 최강 2수 듀오 결합</span>
                    <span style="color: #22d3ee; font-weight: 900;">2·3등 중고액 적중 정밀 타격</span>
                </div>
            </div>
        `,
        corePhilosophy: '로또 추첨의 강력한 연속성을 포착하기 위해 직전 회차 당첨 번호로부터의 마르코프 1/2차 전이 확률과 역대 1,200여 회차 중 가장 높은 빈도로 함께 출현한 2수 페어(Co-occurrence Pair)를 결합한 흐름 부스터 모멘텀 타격 모델',
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
        name: '추가 5: 트리오 마스터 팩 (10게임)',
        shortName: '추가 5: 트리오 마스터',
        tag: '역대 최다 동시 출현 3수 고정틀(Golden Trios) 마스터 조합 (10게임)',
        icon: 'fa-crown',
        badge: 'TRIO MASTER',
        badgeColor: '#ec4899',
        bgGradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(236, 72, 153, 0.45)',
        simpleBadge: '🔺 황금 3수 클러스터',
        simpleCatch: '"역대 가장 많이 같이 당첨된 황금 3형제 번호 고정!"',
        simpleSummary: '역대 데이터상 3개가 동시에 나온 횟수가 가장 많은 3수 황금틀을 고정하고, 3수가 맞는 즉시 1등까지 연쇄 폭발을 노립니다.',
        renderMiniMotion: () => `
            <div class="algo-mini-stage" style="background: rgba(10, 15, 29, 0.95); border: 1.5px solid rgba(236, 72, 153, 0.35); border-radius: 12px; padding: 10px 12px; margin: 4px 0 8px 0; overflow: hidden; position: relative;">
                <div style="text-align: center; font-size: 0.76rem; font-weight: 900; color: #f472b6; margin-bottom: 8px;">
                    "역대 가장 많이 같이 당첨된 황금 3형제 번호 고정!"
                </div>
                <div style="height: 72px; display: flex; align-items: center; justify-content: center; position: relative;">
                    <!-- Golden Triangle Cluster -->
                    <div class="anim-algo-trio" style="display: flex; flex-direction: column; align-items: center;">
                        <!-- Top Vertex -->
                        <span class="lotto-ball-3d ball-yellow" style="width: 22px; height: 22px; font-size: 11px; margin-bottom: 3px;">1</span>
                        <!-- Bottom Pair -->
                        <div style="display: flex; gap: 14px;">
                            <span class="lotto-ball-3d ball-blue" style="width: 22px; height: 22px; font-size: 11px;">13</span>
                            <span class="lotto-ball-3d ball-gray" style="width: 22px; height: 22px; font-size: 11px;">38</span>
                        </div>
                    </div>
                    <div style="position: absolute; right: 14px; background: rgba(236, 72, 153, 0.15); border: 1px solid #ec4899; border-radius: 8px; padding: 4px 8px; font-size: 0.70rem; color: #fce7f3; text-align: left;">
                        <div style="font-weight: 900; color: #f472b6;">황금 삼각 락온</div>
                        <div style="font-size: 8px; color: #94a3b8;">3수 적중 시 1등 연쇄 폭발</div>
                    </div>
                </div>
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center; font-size: 0.70rem;">
                    <span style="color: #cbd5e1; font-weight: 700;">🔺 상위 10대 황금 3수 클러스터 고정</span>
                    <span style="color: #f472b6; font-weight: 900;">3수 적중 시 연쇄 고액 당첨</span>
                </div>
            </div>
        `,
        corePhilosophy: '역대 1,200여 회의 전수 데이터 중 3개 번호가 동시에 출현한 빈도가 통계적으로 가장 높은 상위 10대 "황금 트리오(Golden Trios)"를 각 게임의 3수 고정틀로 채택하고, 나머지 3수를 퀀트 최적화하여 3수가 적중되는 즉시 5등(3수)→4등(4수)→3등(5수)→1등으로 이어지는 연쇄 당첨 폭발력을 노리는 트리오 마스터 모델',
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

const _algoPerfCache = new Map();

/**
 * In-memory cache reset for 7 algorithms performance calculations
 */
export function clearAlgoPerfCache() {
    _algoPerfCache.clear();
    try {
        const keysToRemove = [];
        for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith('algo_perf_v2_')) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => sessionStorage.removeItem(k));
    } catch(e) {}
}
if (typeof window !== 'undefined') {
    window.clearAlgoPerfCache = clearAlgoPerfCache;
}

/**
 * 7대 알고리즘의 복기 데이터 통계 계산 (지정 회차부터 최신 회차까지 - 서버 스냅샷 기반 정확한 전수 집계)
 */
export async function calculate7AlgorithmsPerformance(fromRound = 1235, targetUserId = 'all') {
    if (!state.mergedHistory || Object.keys(state.mergedHistory).length === 0) {
        if (typeof initHistory === 'function') initHistory();
        else if (typeof LOTTO_HISTORY !== 'undefined') state.mergedHistory = { ...LOTTO_HISTORY, ...(state.lottoExtraHistory || {}) };
    }
    const history = state.mergedHistory || {};

    const rawUser = targetUserId || 'all';
    const cleanUser = String(rawUser).toLowerCase().trim();
    const isAll = (cleanUser === 'all');

    // 🔒 서버 스냅샷 및 전체 회원 목록 동기화 확인
    if (typeof fetchAllUsersPurchases === 'function' && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0)) {
        try {
            await fetchAllUsersPurchases();
        } catch(e) {}
    }

    const baseList = isAll ? getAllUnifiedRegisteredUsers() : [];

    const fallbackLatest = (typeof window !== 'undefined' && window.getLatestDrawnRound) ? window.getLatestDrawnRound() : 1243;
    const latestDrawnRound = (state.latestDrawData && state.latestDrawData.numbers?.length === 6)
        ? Math.max(state.latestDrawData.drwNo, fallbackLatest)
        : (state.latestRoundNum || fallbackLatest);

    const drawnRounds = [];
    for (let r = fromRound; r <= Math.max(fromRound, latestDrawnRound); r++) {
        const d = (typeof getSafeActualDraw === 'function') ? (getSafeActualDraw(r) || history[r]) : history[r];
        if (d && Array.isArray(d.numbers) && d.numbers.length === 6) {
            drawnRounds.push(r);
        }
    }
    const maxRound = drawnRounds.length > 0 ? Math.max(...drawnRounds) : fromRound;

    // 전수 검증 대상 사용자 ID 수집 (전체 등록 회원 목록과 100% 동기화 - SSOT 단일 기준 적용)
    const allUserIdsSet = new Set();
    if (isAll) {
        baseList.forEach(u => {
            if (u && u.id && !isSystemOrDummyUser(u.id) && u.isDeleted !== true && u.status !== 'trash') {
                allUserIdsSet.add(String(u.id).toLowerCase().trim());
            }
        });
    } else {
        allUserIdsSet.add(cleanUser);
    }

    const candidateUsers = Array.from(allUserIdsSet);

    const cacheKey = `${fromRound}_${cleanUser}_${maxRound}_${drawnRounds.length}_${candidateUsers.length}`;
    if (_algoPerfCache.has(cacheKey)) {
        return _algoPerfCache.get(cacheKey);
    }

    try {
        const sessionCached = sessionStorage.getItem(`algo_perf_v2_${cacheKey}`);
        if (sessionCached) {
            const parsed = JSON.parse(sessionCached);
            if (parsed && typeof parsed === 'object' && parsed.fromRound === fromRound && parsed.maxRound === maxRound) {
                _algoPerfCache.set(cacheKey, parsed);
                return parsed;
            }
        }
    } catch(e) {}

    // High-Speed Pre-cache: compute reviews once per (user, round)
    const reviewsCache = new Map();
    for (const round of drawnRounds) {
        for (const uId of candidateUsers) {
            const key = `${uId}_${round}`;
            if (!reviewsCache.has(key)) {
                reviewsCache.set(key, computeUser70RecommendationsReview(uId, round));
            }
        }
    }

    // 7대 알고리즘별 실데이터 누적 실적 및 당첨금 전수 계산
    const algoStats = SEVEN_ALGORITHMS_INFO.map(algo => {
        let totalGames = 0;
        let totalInvest = 0;
        let totalPrize = 0;
        const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const roundDetails = [];

        drawnRounds.forEach(round => {
            const draw = (typeof getSafeActualDraw === 'function') ? (getSafeActualDraw(round) || history[round]) : history[round];
            if (!draw || !Array.isArray(draw.numbers) || draw.numbers.length !== 6) return;

            const winningSet = new Set(draw.numbers);
            const bonus = draw.bonus;

            let roundPrize = 0;
            const roundHits = [];
            let roundCombosCount = 0;

            candidateUsers.forEach(uId => {
                const rev = reviewsCache.get(`${uId}_${round}`) || computeUser70RecommendationsReview(uId, round);
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
                    const pack = (rev.extraPackEvals || []).find(p => p && Number(p.packId) === pId);
                    evalData = pack ? pack.evalData : null;
                    combos = pack ? (pack.combos || []) : [];
                }

                if (!evalData) return;
                const gameCount = (Array.isArray(combos) && combos.length > 0) ? combos.length : ((evalData.items && evalData.items.length > 0) ? evalData.items.length : 10);
                if (gameCount <= 0 && (!evalData.totalPrize || evalData.totalPrize <= 0)) return;

                roundCombosCount += gameCount;
                totalGames += gameCount;
                totalInvest += gameCount * 1000;

                for (let rk = 1; rk <= 5; rk++) {
                    const count = (evalData.hits && evalData.hits[rk]) || 0;
                    rankCounts[rk] += count;
                }
                totalPrize += (evalData.totalPrize || 0);
                roundPrize += (evalData.totalPrize || 0);

                (evalData.items || []).filter(item => item.rank >= 1 && item.rank <= 5).forEach(item => {
                    const itemMatches = item.nums ? item.nums.filter(n => winningSet.has(n)) : [];
                    roundHits.push({
                        user: uId,
                        userName: uId,
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

            roundDetails.push({
                round,
                date: (draw && (draw.date || draw.drwNoDate)) ? (draw.date || draw.drwNoDate) : '',
                drawNumbers: draw ? draw.numbers : [],
                bonus: draw ? draw.bonus : null,
                totalGames: roundCombosCount,
                prize: roundPrize,
                roundPrize: roundPrize,
                hits: roundHits,
                hitCount: roundHits.length
            });
        });

        const winCount = rankCounts[1] + rankCounts[2] + rankCounts[3] + rankCounts[4] + rankCounts[5];
        const winRate = totalGames > 0 ? ((winCount / totalGames) * 100).toFixed(1) : '0.0';
        const roi = totalInvest > 0 ? (((totalPrize - totalInvest) / totalInvest) * 100).toFixed(1) : '0.0';

        let topRank = null;
        if (rankCounts[1] > 0) topRank = 1;
        else if (rankCounts[2] > 0) topRank = 2;
        else if (rankCounts[3] > 0) topRank = 3;
        else if (rankCounts[4] > 0) topRank = 4;
        else if (rankCounts[5] > 0) topRank = 5;

        return {
            ...algo,
            totalGames,
            totalInvest,
            totalPrize,
            rankCounts,
            totalWins: winCount,
            winRate,
            roi,
            topRank,
            roundDetails
        };
    });

    const grandTotalGames = algoStats.reduce((sum, a) => sum + (a.totalGames || 0), 0);
    const grandTotalInvest = algoStats.reduce((sum, a) => sum + (a.totalInvest || 0), 0);
    const grandTotalPrize = algoStats.reduce((sum, a) => sum + (a.totalPrize || 0), 0);
    const grandRankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let rk = 1; rk <= 5; rk++) {
        grandRankCounts[rk] = algoStats.reduce((sum, a) => sum + ((a.rankCounts && a.rankCounts[rk]) || 0), 0);
    }
    const grandTotalWins = grandRankCounts[1] + grandRankCounts[2] + grandRankCounts[3] + grandRankCounts[4] + grandRankCounts[5];
    const grandProfit = grandTotalPrize - grandTotalInvest;
    const grandRoi = grandTotalInvest > 0 ? ((grandProfit / grandTotalInvest) * 100).toFixed(1) : '0.0';
    const grandWinRate = grandTotalGames > 0 ? ((grandTotalWins / grandTotalGames) * 100).toFixed(1) : '0.0';

    const perfResult = {
        fromRound,
        maxRound,
        totalRoundsCount: drawnRounds.length,
        grandTotalGames,
        grandTotalInvest,
        grandTotalPrize,
        grandProfit,
        grandRoi,
        grandRankCounts,
        grandTotalWins,
        grandWinRate,
        results: algoStats
    };

    _algoPerfCache.set(cacheKey, perfResult);
    try {
        sessionStorage.setItem(`algo_perf_v2_${cacheKey}`, JSON.stringify(perfResult));
    } catch(e) {}
    return perfResult;
}

/**
 * 알고리즘 소개 & 실적 탭 전체 렌더링
 */
export async function renderAlgorithmsTab(fromRound = null) {
    const container = document.getElementById('tab-algorithms');
    if (!container || (!container.classList.contains('active') && container.style.display === 'none')) return;

    ensureAlgoAnimationStyles();

    if (fromRound !== null) {
        currentAlgoStartRound = parseInt(fromRound, 10);
    }

    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const authId = (rawAuth || '').trim();
    const cleanAuth = authId.toLowerCase();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));

    // Ensure users list from cache if available
    if (!state.allRegisteredUsersList || state.allRegisteredUsersList.length === 0) {
        try {
            const raw = localStorage.getItem('lotto_all_users_list_cache');
            if (raw) state.allRegisteredUsersList = JSON.parse(raw);
        } catch(e) {}
    }

    // Trigger non-blocking background fetch if db exists and map is missing
    if ((typeof window !== 'undefined' && window.db) && (!state.allUsersPurchasesMap || Object.keys(state.allUsersPurchasesMap).length === 0)) {
        fetchAllUsersPurchases().then(() => {
            const currentTab = document.getElementById('tab-algorithms');
            if (currentTab && currentTab.classList.contains('active')) {
                renderAlgorithmsTab();
            }
        }).catch(e => console.warn('[AlgorithmsTab background fetch error]', e));
    }

    // Default target user is 'all' for full overview, or specific viewingUser if chosen
    const viewingUser = (typeof window !== 'undefined' && window.algoAdminViewingUser) ? window.algoAdminViewingUser : (algoAdminViewingUser || 'all');
    const effectiveUserId = (isAdmin && viewingUser && viewingUser !== 'all') 
        ? viewingUser 
        : (isAdmin && algoAdminViewingUser === 'all' ? 'all' : (authId || 'master'));

    let perfData;
    try {
        perfData = await calculate7AlgorithmsPerformance(currentAlgoStartRound, effectiveUserId);
    } catch(err) {
        console.error('[calculate7AlgorithmsPerformance error]', err);
        perfData = {
            fromRound: currentAlgoStartRound,
            maxRound: currentAlgoStartRound,
            totalRoundsCount: 0,
            grandTotalInvest: 0,
            grandTotalPrize: 0,
            grandProfit: 0,
            grandRoi: 0,
            grandRankCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
            grandTotalWins: 0,
            grandWinRate: '0.0',
            results: SEVEN_ALGORITHMS_INFO.map(a => ({
                ...a,
                totalGames: 0,
                totalInvest: 0,
                totalPrize: 0,
                rankCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                totalWins: 0,
                winRate: '0.0',
                roi: 0,
                topRank: null,
                roundDetails: []
            }))
        };
    }
    const { fromRound: startR, maxRound, totalRoundsCount, grandTotalInvest, grandTotalPrize, grandProfit, grandRoi, grandRankCounts, grandTotalWins, grandWinRate, results } = perfData;

    // Upcoming round for real-time recommendation preview
    const nextRound = state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1239);

    // Admin User Selector HTML
    let adminUserSelectHtml = '';
    if (isAdmin) {
        let userOptions = `<option value="all" ${effectiveUserId === 'all' ? 'selected' : ''}>🌐 전체 회원 추천번호 종합 당첨 결과 (기본)</option>`;
        userOptions += `<option value="${authId}" ${effectiveUserId === authId ? 'selected' : ''}>👑 관리자 본인 (${authId})</option>`;
        
        const userList = getAllUnifiedRegisteredUsers();
        userList.forEach(u => {
            const uClean = (u.id || '').toLowerCase().trim();
            if (uClean !== cleanAuth) {
                const uDisplayName = u.name || u.realName || u.id;
                userOptions += `<option value="${u.id}" ${effectiveUserId.toLowerCase() === uClean ? 'selected' : ''}>👤 ${u.id} (${uDisplayName}${u.phone ? ` / ${u.phone}` : ''})</option>`;
            }
        });

        let algoUserLabel = '🌐 전체 회원 종합 (기본)';
        if (effectiveUserId === authId) {
            algoUserLabel = `👑 관리자 본인 (${authId})`;
        } else if (effectiveUserId !== 'all') {
            const foundU = userList.find(u => (u.id || '').toLowerCase().trim() === effectiveUserId.toLowerCase());
            algoUserLabel = foundU ? `👤 ${(foundU.name || foundU.realName || foundU.id)} (${foundU.id})` : `👤 ${effectiveUserId}`;
        }

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
                    <label style="font-size: 0.78rem; color: #fbbf24; font-weight: 700; white-space: nowrap; flex-shrink: 0;"><i class="fa-solid fa-users"></i> 조회 대상:</label>
                    <button type="button" id="btnAlgoUserTrigger" class="slim-picker-trigger slim-picker-trigger-amber" onclick="window.openSlimMemberPickerForAlgo && window.openSlimMemberPickerForAlgo()" style="flex: 1; min-width: 0;">
                        <i class="fa-solid fa-user-check" style="color: #fbbf24; font-size: 0.75rem; flex-shrink: 0;"></i>
                        <span id="algoUserDisplayLabel" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; font-weight: 700;">${algoUserLabel}</span>
                        <i class="fa-solid fa-chevron-down" style="font-size: 0.65rem; color: #94a3b8; margin-left: auto; flex-shrink: 0;"></i>
                    </button>
                    <select id="algoAdminUserSelect" onchange="window.changeAlgoAdminViewingUser && window.changeAlgoAdminViewingUser(this.value)" style="display: none;">
                        ${userOptions}
                    </select>
                </div>
            </div>
        `;
    }

    // 1. 알고리즘 소개 섹션 카드 HTML 생성 (접은 화면 초직관 애니메이션 + 세부 메커니즘 토글 확장)
    const algoIntroCardsHtml = SEVEN_ALGORITHMS_INFO.map((algo, idx) => {
        const isDetailOpen = !!algoDetailAccordionMap[algo.id];

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
            <div class="algo-spec-card" style="background: ${algo.bgGradient}; border: 1.5px solid ${algo.borderColor}; border-radius: 14px; padding: 14px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); display: flex; flex-direction: column; gap: 8px; transition: transform 0.2s ease;">
                <!-- Header Row -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 34px; height: 34px; border-radius: 9px; background: ${algo.badgeColor}25; border: 1px solid ${algo.badgeColor}; display: flex; align-items: center; justify-content: center; color: ${algo.badgeColor}; font-size: 1.05rem; flex-shrink: 0;">
                            <i class="fa-solid ${algo.icon}"></i>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 0.68rem; font-weight: 800; color: ${algo.badgeColor}; background: ${algo.badgeColor}15; border: 1px solid ${algo.badgeColor}40; padding: 1px 6px; border-radius: 5px;">
                                    알고리즘 #${idx + 1}
                                </span>
                                <span style="font-size: 0.70rem; font-weight: 800; color: #f8fafc; background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 5px;">
                                    ${algo.badge}
                                </span>
                            </div>
                            <h3 style="margin: 2px 0 0 0; color: #f8fafc; font-size: 0.98rem; font-weight: 900;">
                                ${algo.name}
                            </h3>
                        </div>
                    </div>
                    <span style="font-size: 0.70rem; font-weight: 800; color: ${algo.badgeColor}; background: ${algo.badgeColor}18; border: 1px solid ${algo.badgeColor}40; padding: 2px 8px; border-radius: 12px; white-space: nowrap;">
                        ${algo.simpleBadge || algo.badge}
                    </span>
                </div>

                <!-- ★ 접은 화면 초직관 애니메이션 무대 (글자 없이 1초 만에 이해) -->
                ${algo.renderMiniMotion ? algo.renderMiniMotion() : ''}

                <!-- 1줄 직관 쉬운 요약 -->
                <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px 10px; border-left: 3px solid ${algo.badgeColor};">
                    <p style="margin: 0; font-size: 0.75rem; color: #e2e8f0; line-height: 1.42;">
                        ${algo.simpleSummary || algo.corePhilosophy}
                    </p>
                </div>

                <!-- Features Tags (기본 특징 태그) -->
                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    ${featuresHtml}
                </div>

                <!-- Step-by-Step Combo Method & Core Philosophy (상세 메커니즘 - 기본 접힘 / 토글 시 확장) -->
                <div id="algoDetail_${algo.id}" class="algo-detail-body" style="display: ${isDetailOpen ? 'block' : 'none'}; border-top: 1px dashed rgba(255,255,255,0.12); padding-top: 10px; margin-top: 2px;">
                    <!-- 학술적 조합 철학 원문 -->
                    <div style="background: rgba(0,0,0,0.25); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;">
                        <div style="font-size: 0.70rem; color: #94a3b8; margin-bottom: 2px;">
                            <i class="fa-solid fa-lightbulb" style="color: #fbbf24;"></i> <strong>학술적 조합 철학 &amp; 퀀트 이론</strong>
                        </div>
                        <p style="margin: 0; font-size: 0.73rem; color: #cbd5e1; line-height: 1.42;">
                            ${algo.corePhilosophy}
                        </p>
                    </div>

                    <div style="font-size: 0.74rem; font-weight: 800; color: #f8fafc; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-cubes-stacked" style="color: ${algo.badgeColor};"></i> 세부 번호 조합 및 추출 메커니즘
                    </div>
                    ${methodsHtml}
                </div>

                <!-- 접기/펼치기 토글 버튼 -->
                <div style="margin-top: 2px; display: flex; justify-content: flex-end;">
                    <button type="button" id="algoDetailBtn_${algo.id}" class="btn-toggle-algo-detail ${isDetailOpen ? 'active' : ''}" onclick="window.toggleAlgoSpecDetail && window.toggleAlgoSpecDetail('${algo.id}')" style="background: ${isDetailOpen ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${isDetailOpen ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.15)'}; color: #cbd5e1; border-radius: 7px; padding: 4px 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s ease;">
                        <span id="algoDetailText_${algo.id}" class="algo-detail-text">${isDetailOpen ? '세부 공식 및 수학적 메커니즘 접기' : '자세한 조합 공식 및 메커니즘 펼치기'}</span>
                        <i id="algoDetailIcon_${algo.id}" class="algo-detail-icon fa-solid ${isDetailOpen ? 'fa-chevron-up' : 'fa-chevron-down'}" style="font-size: 0.68rem; color: ${algo.badgeColor};"></i>
                    </button>
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
                <div class="algo-perf-metrics-grid" style="background: rgba(0,0,0,0.35); border-radius: 8px; padding: 8px 12px; text-align: center;">
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
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 4px; font-size: clamp(0.65rem, 1.8vw, 0.72rem); background: rgba(255,255,255,0.03); border-radius: 6px; padding: 6px 8px; flex-wrap: wrap;">
                    <span style="color: ${algo.rankCounts[1] > 0 ? '#fbbf24' : '#64748b'}; font-weight: 700; white-space: nowrap;">1등: <strong>${algo.rankCounts[1]}회</strong></span>
                    <span style="color: ${algo.rankCounts[2] > 0 ? '#f87171' : '#64748b'}; font-weight: 700; white-space: nowrap;">2등: <strong>${algo.rankCounts[2]}회</strong></span>
                    <span style="color: ${algo.rankCounts[3] > 0 ? '#60a5fa' : '#64748b'}; font-weight: 700; white-space: nowrap;">3등: <strong>${algo.rankCounts[3]}회</strong></span>
                    <span style="color: ${algo.rankCounts[4] > 0 ? '#34d399' : '#64748b'}; font-weight: 700; white-space: nowrap;">4등: <strong>${algo.rankCounts[4]}회</strong></span>
                    <span style="color: ${algo.rankCounts[5] > 0 ? '#a78bfa' : '#64748b'}; font-weight: 700; white-space: nowrap;">5등: <strong>${algo.rankCounts[5]}회</strong></span>
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
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                    <span style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 3px 10px; border-radius: 8px; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.5px;">
                        <i class="fa-solid fa-brain"></i> QUANT &amp; AI ENGINE
                    </span>
                    <span style="color: var(--accent-gold); font-size: 0.8rem; font-weight: 700; word-break: keep-all;">
                        7대 알고리즘 분산 추천 &amp; 실데이터 누적 당첨 실적
                    </span>
                </div>
                <h2 style="margin: 0 0 8px 0; font-size: clamp(1.15rem, 4vw, 1.45rem); font-weight: 900; color: #f8fafc; letter-spacing: -0.5px; word-break: keep-all; overflow-wrap: break-word;">
                    로또 6/45 <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">7대 AI 알고리즘</span> 정밀 해설 &amp; 실적
                </h2>
                <p style="margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.5; max-width: 800px; word-break: keep-all; overflow-wrap: break-word;">
                    단순한 무작위 번호 생성이 아닙니다. 올라운더 팩(포트폴리오), 올라운더 팩 2(다이나믹 모멘텀), 빈틈제로 팩(전수 커버리지), 슈퍼 잭팟(고배당), 멀티 히트(휠링) 등 7가지 수리통계 모델의 조합 원리를 상세히 확인하고, 과거 회차 당첨 검증 데이터를 기반으로 한 실제 누적 적중 실적을 투명하게 확인하세요.
                </p>
            </div>

            <!-- Admin User Selector Bar (Admin only) -->
            ${adminUserSelectHtml}

            <!-- SECTION 1: 7대 알고리즘 조합 원리 상세 해설 (기본설명 모드 & 접기/펼치기) -->
            <section class="algo-guide-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto; cursor: pointer;" onclick="window.toggleAlgoGuideSection && window.toggleAlgoGuideSection()" title="클릭 시 7대 알고리즘 설명 섹션 전체 접기/펼치기">
                        <span style="width: 4px; height: 18px; background: #6366f1; border-radius: 2px; display: inline-block; flex-shrink: 0;"></span>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 900; color: #f8fafc; word-break: keep-all; overflow-wrap: break-word;">
                            1. 7대 알고리즘별 번호 조합 메커니즘
                        </h3>
                        <span style="font-size: 0.70rem; color: #a5b4fc; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); padding: 1px 7px; border-radius: 4px; font-weight: 700; white-space: nowrap;">
                            기본설명 모드
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <button type="button" onclick="window.toggleAllAlgoSpecDetails && window.toggleAllAlgoSpecDetails()" id="btnToggleAllAlgoSpecs" style="background: rgba(99, 102, 241, 0.15); border: 1px solid rgba(99, 102, 241, 0.35); color: #c7d2fe; padding: 4px 10px; border-radius: 6px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s ease;">
                            <i id="iconToggleAllAlgoSpecs" class="fa-solid fa-angles-down" style="color: #818cf8;"></i>
                            <span id="textToggleAllAlgoSpecs">세부 설명 전체 펼치기</span>
                        </button>
                        <button type="button" onclick="window.toggleAlgoGuideSection && window.toggleAlgoGuideSection()" id="btnToggleAlgoGuideSection" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: #94a3b8; padding: 4px 9px; border-radius: 6px; font-size: 0.74rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: all 0.2s ease;">
                            <span id="algoGuideToggleText">섹션 접기</span>
                            <i id="algoGuideChevron" class="fa-solid fa-chevron-up"></i>
                        </button>
                    </div>
                </div>

                <!-- 7 Algorithms Grid (기본 설명 카드 그리드) -->
                <div id="algoIntroGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 14px;">
                    ${algoIntroCardsHtml}
                </div>
            </section>

            <!-- SECTION 2: 추천번호 당첨 결과 기반 실데이터 누적 실적 대시보드 -->
            <section class="algo-performance-section" style="margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 auto;">
                        <span style="width: 4px; height: 18px; background: #fbbf24; border-radius: 2px; display: inline-block; flex-shrink: 0;"></span>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 900; color: #f8fafc; word-break: keep-all; overflow-wrap: break-word;">
                            2. 추천번호 당첨 결과 기반 7대 알고리즘 전체 회원 누적 당첨 실적 (전체 회원 통합)
                        </h3>
                    </div>
                    
                    <!-- 회차 범위 셀렉터 -->
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <label style="font-size: 0.75rem; color: #94a3b8; font-weight: 700; white-space: nowrap;">집계 시작 회차:</label>
                        <button type="button" id="btnAlgoRoundTrigger" class="slim-picker-trigger slim-picker-trigger-amber" onclick="window.openSlimRoundPickerForAlgo && window.openSlimRoundPickerForAlgo()" style="min-width: 140px;">
                            <i class="fa-solid fa-calendar-check" style="color: #fbbf24; font-size: 0.75rem;"></i>
                            <span id="algoRoundDisplayLabel" style="font-size: 0.76rem; font-weight: 700; color: #fbbf24;">${currentAlgoStartRound === 1 ? '제 1회부터 전체 전수' : `제 ${currentAlgoStartRound}회부터 누적`}</span>
                            <i class="fa-solid fa-chevron-down" style="font-size: 0.65rem; color: #94a3b8; margin-left: auto;"></i>
                        </button>
                        <select id="algoReviewStartRoundSelect" onchange="window.changeAlgoReviewStartRound && window.changeAlgoReviewStartRound(this.value)" style="display: none;">
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
                            <span style="background: #10b981; color: #0f172a; font-size: 0.7rem; font-weight: 900; padding: 2px 7px; border-radius: 6px; letter-spacing: 0.3px; white-space: nowrap;">
                                100% 무결점 실데이터 검증
                            </span>
                            <span style="font-size: 0.85rem; font-weight: 800; color: #f8fafc; word-break: keep-all;">
                                제 1235회차부터 전체 회원 실제 추천번호 기반 7대 알고리즘별 당첨 내역 (${effectiveUserId === 'all' ? '전체 회원 통합 전수 집계' : `${maskUserDisplayName(effectiveUserId, effectiveUserId)} 회원`})
                            </span>
                        </div>
                        <p style="margin: 0; font-size: 0.77rem; color: #cbd5e1; line-height: 1.45; word-break: keep-all; overflow-wrap: break-word;">
                            본 누적 당첨 내역은 <strong style="color: #34d399;">제 1235회차부터 매주 등록된 전체 회원들에게 실제로 생성·발급된 7대 알고리즘 추천번호(각 10게임)의 영구 박제 스냅샷</strong>을 동행복권 공식 추첨 결과와 1:1로 전수 대조하여 채점한 <strong style="color: #fbbf24;">100% 실제 전수 적중 실적 데이터</strong>입니다.
                        </p>
                    </div>
                </div>

                <!-- Grand Summary KPI Card -->
                <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 14px; padding: 14px 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #0f172a; padding: 2px 7px; border-radius: 6px; font-size: 0.72rem; font-weight: 900; white-space: nowrap;">
                                <i class="fa-solid fa-trophy"></i> 7대 알고리즘 통합 실적 요약
                            </span>
                            <span style="font-size: 0.8rem; font-weight: 800; color: #f8fafc; word-break: keep-all;">
                                제 ${startR}~${maxRound}회 (${totalRoundsCount}회차 실제 추천번호 전수 집계)
                            </span>
                        </div>
                    </div>

                    <!-- KPI Metrics 4-Column Grid -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; text-align: center;">
                        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 8px;">
                            <span style="font-size: 0.7rem; color: #94a3b8; display: block;">누적 총 당첨금</span>
                            <strong style="font-size: 1.1rem; color: #34d399; font-weight: 900;">+${(grandTotalPrize || 0).toLocaleString()}원</strong>
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
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(251,191,36,0.25); color: #fbbf24; font-weight: 800; white-space: nowrap;">1등:${grandRankCounts[1]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(248,113,113,0.25); color: #f87171; font-weight: 800; white-space: nowrap;">2등:${grandRankCounts[2]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(96,165,250,0.25); color: #60a5fa; font-weight: 800; white-space: nowrap;">3등:${grandRankCounts[3]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(52,211,153,0.25); color: #34d399; font-weight: 800; white-space: nowrap;">4등:${grandRankCounts[4]}</span>
                                <span style="font-size: 0.68rem; padding: 1px 4px; border-radius: 4px; background: rgba(167,139,250,0.25); color: #a78bfa; font-weight: 800; white-space: nowrap;">5등:${grandRankCounts[5]}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 7 Algorithms Performance Cards Grid -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px;">
                    ${algoPerfCardsHtml}
                </div>
            </section>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * 관리자 전용 알고리즘 탭 조회 회원 초기화 (관리자 본인 복귀)
 */
export function resetAlgoAdminViewingUser(authId = null) {
    algoAdminViewingUser = authId || 'all';
    if (typeof window !== 'undefined') {
        window.algoAdminViewingUser = authId || 'all';
    }
}

/**
 * 관리자 전용 알고리즘 탭 조회 회원 변경
 */
export function changeAlgoAdminViewingUser(userId) {
    algoAdminViewingUser = userId;
    if (typeof window !== 'undefined') {
        window.algoAdminViewingUser = userId;
    }
    renderAlgorithmsTab();
    const reportModal = document.getElementById('predictionReportModal');
    if (reportModal && (reportModal.classList.contains('active') || reportModal.style.display === 'flex')) {
        if (typeof window !== 'undefined' && typeof window.generatePredictionReport === 'function') {
            window.generatePredictionReport();
        }
    }
    showToast(userId === 'all' ? '🌐 전체 회원 7대 알고리즘 추천 결과 종합으로 전환되었습니다.' : `👑 [${userId}] 회원의 7대 알고리즘 추천 조합으로 전환되었습니다.`);
}

/**
 * 개별 알고리즘 카드의 세부 메커니즘 접기/펼치기 토글
 */
export function toggleAlgoSpecDetail(algoId) {
    const detailEl = document.getElementById(`algoDetail_${algoId}`);
    const textEl = document.getElementById(`algoDetailText_${algoId}`);
    const iconEl = document.getElementById(`algoDetailIcon_${algoId}`);
    const btnEl = document.getElementById(`algoDetailBtn_${algoId}`);
    if (!detailEl) return;

    const isExpanded = detailEl.style.display !== 'none';
    if (isExpanded) {
        detailEl.style.display = 'none';
        if (textEl) textEl.textContent = '자세한 조합 공식 및 메커니즘 펼치기';
        if (iconEl) {
            iconEl.classList.remove('fa-chevron-up');
            iconEl.classList.add('fa-chevron-down');
        }
        if (btnEl) {
            btnEl.style.background = 'rgba(255,255,255,0.06)';
            btnEl.style.borderColor = 'rgba(255,255,255,0.15)';
            btnEl.classList.remove('active');
        }
        algoDetailAccordionMap[algoId] = false;
    } else {
        detailEl.style.display = 'block';
        if (textEl) textEl.textContent = '세부 공식 및 수학적 메커니즘 접기';
        if (iconEl) {
            iconEl.classList.remove('fa-chevron-down');
            iconEl.classList.add('fa-chevron-up');
        }
        if (btnEl) {
            btnEl.style.background = 'rgba(99,102,241,0.2)';
            btnEl.style.borderColor = 'rgba(99,102,241,0.4)';
            btnEl.classList.add('active');
        }
        algoDetailAccordionMap[algoId] = true;
    }
}

/**
 * 7대 알고리즘 세부 메커니즘 전체 펼치기/접기
 */
export function toggleAllAlgoSpecDetails() {
    const allDetailEls = document.querySelectorAll('.algo-detail-body');
    const mainBtnText = document.getElementById('textToggleAllAlgoSpecs');
    const mainBtnIcon = document.getElementById('iconToggleAllAlgoSpecs');

    let anyClosed = false;
    allDetailEls.forEach(el => {
        if (el.style.display === 'none') anyClosed = true;
    });

    SEVEN_ALGORITHMS_INFO.forEach(a => {
        algoDetailAccordionMap[a.id] = anyClosed;
        const detailEl = document.getElementById(`algoDetail_${a.id}`);
        const textEl = document.getElementById(`algoDetailText_${a.id}`);
        const iconEl = document.getElementById(`algoDetailIcon_${a.id}`);
        const btnEl = document.getElementById(`algoDetailBtn_${a.id}`);
        if (detailEl) {
            detailEl.style.display = anyClosed ? 'block' : 'none';
        }
        if (textEl) {
            textEl.textContent = anyClosed ? '세부 공식 및 수학적 메커니즘 접기' : '자세한 조합 공식 및 메커니즘 펼치기';
        }
        if (iconEl) {
            iconEl.className = anyClosed ? 'algo-detail-icon fa-solid fa-chevron-up' : 'algo-detail-icon fa-solid fa-chevron-down';
        }
        if (btnEl) {
            btnEl.style.background = anyClosed ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)';
            btnEl.style.borderColor = anyClosed ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.15)';
            if (anyClosed) btnEl.classList.add('active');
            else btnEl.classList.remove('active');
        }
    });

    if (mainBtnText) mainBtnText.textContent = anyClosed ? '세부 공식 전체 접기' : '세부 공식 전체 펼치기';
    if (mainBtnIcon) mainBtnIcon.className = anyClosed ? 'fa-solid fa-angles-up' : 'fa-solid fa-angles-down';
}

/**
 * 1번 섹션(7대 알고리즘 소개 그리드) 전체 접기/펼치기
 */
export function toggleAlgoGuideSection() {
    const gridEl = document.getElementById('algoIntroGrid');
    const chevronEl = document.getElementById('algoGuideChevron');
    const textEl = document.getElementById('algoGuideToggleText');
    if (!gridEl) return;

    const isHidden = gridEl.style.display === 'none';
    if (isHidden) {
        gridEl.style.display = 'grid';
        if (chevronEl) {
            chevronEl.className = 'fa-solid fa-chevron-up';
        }
        if (textEl) textEl.textContent = '섹션 접기';
    } else {
        gridEl.style.display = 'none';
        if (chevronEl) {
            chevronEl.className = 'fa-solid fa-chevron-down';
        }
        if (textEl) textEl.textContent = '섹션 펼치기';
    }
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

export function openSlimMemberPickerForAlgo() {
    const rawAuth = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window !== 'undefined' && window.SafeAuth ? window.SafeAuth.get() : null)) || 'guest';
    const cleanAuth = String(rawAuth || '').toLowerCase().trim();
    const isAdmin = (cleanAuth === 'master' || cleanAuth === 'admin' || (typeof isAdminUser === 'function' && isAdminUser(cleanAuth)));
    if (!isAdmin) return;

    if (typeof window.openSlimMemberPickerModal === 'function') {
        const curUser = (typeof algoAdminViewingUser !== 'undefined' && algoAdminViewingUser) || rawAuth || 'all';
        window.openSlimMemberPickerModal({
            title: '7대 알고리즘 조회 대상 회원 선택',
            subtitle: '누적 추천 및 당첨 실적을 확인할 회원을 검색 및 선택하세요.',
            selectedUserId: curUser,
            includeAll: true,
            onSelect: (user) => {
                const uId = (typeof user === 'string') ? user : (user.id || user.userId || 'all');
                if (window.changeAlgoAdminViewingUser) {
                    window.changeAlgoAdminViewingUser(uId);
                }
            }
        });
    }
}

export function openSlimRoundPickerForAlgo() {
    if (typeof window.openSlimRoundPickerModal === 'function') {
        const maxR = state.latestRoundNum || (state.latestDrawData ? state.latestDrawData.drwNo : 1243);
        window.openSlimRoundPickerModal({
            title: '알고리즘 누적 집계 시작 회차 선택',
            subtitle: '7대 알고리즘 적중 실적의 집계 기준 시작 회차를 선택하세요 (1235회~).',
            selectedRound: currentAlgoStartRound || 1235,
            minRound: 1235,
            maxRound: maxR,
            includeAllRounds: false,
            onSelect: (roundNum) => {
                const r = parseInt(roundNum);
                if (window.changeAlgoReviewStartRound) {
                    window.changeAlgoReviewStartRound(r);
                }
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.renderAlgorithmsTab = renderAlgorithmsTab;
    window.openSlimMemberPickerForAlgo = openSlimMemberPickerForAlgo;
    window.openSlimRoundPickerForAlgo = openSlimRoundPickerForAlgo;
    window.changeAlgoAdminViewingUser = changeAlgoAdminViewingUser;
    window.resetAlgoAdminViewingUser = resetAlgoAdminViewingUser;
    window.toggleAlgoSpecDetail = toggleAlgoSpecDetail;
    window.toggleAllAlgoSpecDetails = toggleAllAlgoSpecDetails;
    window.toggleAlgoGuideSection = toggleAlgoGuideSection;
    window.toggleAlgoDetailAccordion = toggleAlgoDetailAccordion;
    window.toggleAllAlgoDetailAccordions = toggleAllAlgoDetailAccordions;
    window.changeAlgoReviewStartRound = changeAlgoReviewStartRound;
}
