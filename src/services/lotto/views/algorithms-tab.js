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
        corePhilosophy: 'V3_Hedge8 8-전문가 온라인 헤지와 최근 300회 비인기 EV로 선별한 16수 코어(핵심 6 + 보조 10) 중, #1 슬롯 핵심 6수 직결 휠과 고핵심(C5+S1, C4+S2, C3+S3) 슬롯을 집중 배치해 1·2·3등 직결 포획력을 극대화하는 메인 휠링 모델',
        comboMethod: [
            {
                step: '1번 슬롯: 핵심코어 TOP 6 직결 휠 (소프트 구조 가드)',
                desc: '16수 코어 중 최상위 점수 6자리를 1번 게임에 그대로 직결합니다. 홀짝 0:6/6:0, AC<=4, 합계 95~185 이탈, 역대 1등 중복 시에만 7~10위 예비수로 1자리 교체해 핵심 6수 적중 시 1등·2등을 100% 보장합니다.'
            },
            {
                step: '2~5번 슬롯: 고핵심 1등 보강 휠 (C5+S1 · C4+S2)',
                desc: '핵심 5+보조 1 및 핵심 4+보조 2 슬롯을 배치해 핵심코어 4~5개 적중 시에도 보조 10수가 빈자리를 채워 1·3·4등으로 연결되도록 설계합니다.'
            },
            {
                step: '6~10번 슬롯: 중심 혼합 16수 2-opt 휠 (C3+S3)',
                desc: '핵심 3+보조 3 조합을 16수 미커버 3-튜플 최소화 2-opt 휠링으로 최적화해 다중·연쇄 당첨 밀도를 끌어올립니다.'
            }
        ],
        keyFeatures: [
            '핵심 6수 1번 슬롯 직결 + 소프트 구조 가드 적용',
            '고핵심(C5+S1 · C4+S2 · C3+S3) 사각지대 보강',
            '비인기 고배당 EV 기반 16수 2-opt 휠링'
        ],
        getCombos: (r, uId) => computeAbsoluteTop10Combinations(false, r, 'v4', true, uId) || []
    },
    {
        id: 'v3',
        name: '기본 2: 올라운더 팩 2 (10게임)',
        shortName: '올라운더 팩 2',
        tag: '16수 코어 최빈 혼합(C3+S3 · C2+S4) 중심 커버 & 비인기 EV 휠링 (10게임)',
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
        corePhilosophy: '16수 코어(핵심 6 + 보조 10)에서 실제 당첨 시 가장 높은 빈도로 출현하는 중심 혼합 비율(핵심 3+보조 3, 핵심 2+보조 4)을 집중 커버해 3·4·5등 연쇄 다중당첨과 비인기 기대값(EV)을 극대화하는 중심 허리 모델',
        comboMethod: [
            {
                step: '1~3번 슬롯: 중심 균형 휠 (핵심 3 + 보조 3)',
                desc: '올라운더 1과 겹치지 않는 16수 미커버 3수 조합을 우선 채우며 핵심 3수+보조 3수 혼합 당첨 구간을 정밀 커버합니다.'
            },
            {
                step: '4~10번 슬롯: 최빈 혼합 EV 휠 (핵심 2 + 보조 4)',
                desc: '16수 적중 시 경우의 수가 가장 많은 핵심 2+보조 4 구간에 7게임을 집중 배치하고, 최근 300회 1등 당첨자 수 기반 비인기 EV 가중치로 고액 기대수익을 높입니다.'
            }
        ],
        keyFeatures: [
            '16수 코어 최빈 혼합 구간(C3+S3 · C2+S4) 집중 커버',
            '올라운더 1과 중복 없는 16수 2-opt 3·4튜플 휠링',
            '최근 300회 비인기 당첨자 EV 보정 적용'
        ],
        getCombos: (r, uId) => computeAbsoluteTop10Combinations(false, r, 'v3', true, uId) || []
    },
    {
        id: 'extra1',
        name: '기본 3: 올라운더 팩 3 (10게임)',
        shortName: '올라운더 팩 3',
        tag: '16수 Hypergeometric All-7 완성 휠 + 보조 6수(C0+S6) 1등 슬롯 (10게임)',
        icon: 'fa-shield-halved',
        badge: 'ALL-7 WHEEL',
        badgeColor: '#10b981',
        bgGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(15, 23, 42, 0.85) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.45)',
        simpleBadge: '🧩 16수 7대 구간 완성',
        simpleCatch: '"16수 코어의 모든 혼합 비율(7개 구간)을 빈틈없이 완성!"',
        simpleSummary: '보조 10수가 강세인 회차(핵심 1+보조 5, 보조 6수 단독)까지 모두 담아 16수 내 1등 사각지대를 0%로 만듭니다.',
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
                    <span style="color: #cbd5e1; font-weight: 700;">🛡️ 16수 코어 Hypergeometric All-7 30게임 완성</span>
                    <span style="color: #34d399; font-weight: 900;">전 구간 커버 (0~6핵심)</span>
                </div>
            </div>
        `,
        corePhilosophy: '올라운더 1·2의 고핵심·중심 슬롯에 이어 핵심 2+보조 4(4슬롯), 핵심 1+보조 5(5슬롯), 그리고 보조 10수 단독(C0+S6) 1등 슬롯까지 채워 16수 코어 8,008조합의 모든 구간(All-7)을 완성하는 마무리 휠링 모델',
        comboMethod: [
            {
                step: '1~4번 슬롯: 중심 혼합 완성 (핵심 2 + 보조 4)',
                desc: '올라운더 2와 함께 핵심 2+보조 4 최빈 구간을 총 11슬롯으로 두텁게 커버해 4·5등 연쇄 당첨 밀도를 높입니다.'
            },
            {
                step: '5~9번 슬롯: 보조 강세 방어 (핵심 1 + 보조 5)',
                desc: '핵심코어에서 1수만 나오고 보조 10수에서 5수가 나오는 회차까지 포섭하도록 5슬롯을 배치합니다.'
            },
            {
                step: '10번 슬롯: 보조 6수 단독 1등 슬롯 (C0+S6)',
                desc: '보조 10수만으로 6수가 모두 당첨되는 회차에서도 1등 사각지대가 없도록 30번 슬롯에 보조 6수 전용 휠을 배치합니다.'
            }
        ],
        keyFeatures: [
            '16수 코어 Hypergeometric All-7(7개 구간) 100% 완성',
            '30번 슬롯 보조 6수 단독 1등 포획 구조',
            '30게임 전체 16수 2-opt 미커버 튜플 최소화'
        ],
        getCombos: (r, uId) => { const p = generateExtraAddonPack(1, r, uId); return (p && p.combos) ? p.combos : []; }
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
                        3대 올라운더 분산 추천 &amp; 실데이터 누적 당첨 실적
                    </span>
                </div>
                <h2 style="margin: 0 0 8px 0; font-size: clamp(1.15rem, 4vw, 1.45rem); font-weight: 900; color: #f8fafc; letter-spacing: -0.5px; word-break: keep-all; overflow-wrap: break-word;">
                    로또 6/45 <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">3대 올라운더 AI 알고리즘</span> 정밀 해설 &amp; 실적
                </h2>
                <p style="margin: 0; color: #94a3b8; font-size: 0.82rem; line-height: 1.5; max-width: 800px; word-break: keep-all; overflow-wrap: break-word;">
                    단순한 무작위 번호 생성이 아닙니다. 올라운더 팩(포트폴리오), 올라운더 팩 2(다이나믹 모멘텀), 올라운더 팩 3(초압축 휠링·결손반등) 3대 핵심 수리통계 모델의 조합 원리를 상세히 확인하고, 과거 회차 당첨 검증 데이터를 기반으로 한 실제 누적 적중 실적을 투명하게 확인하세요.
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
                            1. 3대 올라운더 알고리즘별 번호 조합 메커니즘
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
                            2. 추천번호 당첨 결과 기반 3대 올라운더 알고리즘 전체 회원 누적 당첨 실적 (전체 회원 통합)
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
                                제 1235회차부터 전체 회원 실제 추천번호 기반 3대 올라운더 알고리즘별 당첨 내역 (${effectiveUserId === 'all' ? '전체 회원 통합 전수 집계' : `${maskUserDisplayName(effectiveUserId, effectiveUserId)} 회원`})
                            </span>
                        </div>
                        <p style="margin: 0; font-size: 0.77rem; color: #cbd5e1; line-height: 1.45; word-break: keep-all; overflow-wrap: break-word;">
                            본 누적 당첨 내역은 <strong style="color: #34d399;">제 1235회차부터 매주 등록된 전체 회원들에게 실제로 생성·발급된 3대 올라운더 알고리즘 추천번호(각 10게임)의 영구 박제 스냅샷</strong>을 동행복권 공식 추첨 결과와 1:1로 전수 대조하여 채점한 <strong style="color: #fbbf24;">100% 실제 전수 적중 실적 데이터</strong>입니다.
                        </p>
                    </div>
                </div>

                <!-- Grand Summary KPI Card -->
                <div style="background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 14px; padding: 14px 18px; box-shadow: 0 8px 24px rgba(0,0,0,0.3); margin-bottom: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #0f172a; padding: 2px 7px; border-radius: 6px; font-size: 0.72rem; font-weight: 900; white-space: nowrap;">
                                <i class="fa-solid fa-trophy"></i> 3대 올라운더 알고리즘 통합 실적 요약
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
    showToast(userId === 'all' ? '🌐 전체 회원 3대 올라운더 알고리즘 추천 결과 종합으로 전환되었습니다.' : `👑 [${userId}] 회원의 3대 올라운더 알고리즘 추천 조합으로 전환되었습니다.`);
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
            title: '3대 올라운더 알고리즘 조회 대상 회원 선택',
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
            subtitle: '3대 올라운더 알고리즘 적중 실적의 집계 기준 시작 회차를 선택하세요 (1235회~).',
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
