/**
 * Toto/Proto Sports Fixtures Dataset (Football, Baseball, Basketball)
 * 
 * 1. Baseball Sabermetrics: Pythagenpat (R, RA, G), FIP, fWAR, Bullpen Leverage Index (LI >= 2.0), Park Factor
 * 2. Soccer Analytics: xG, PSxG (Goalkeeper shot stopping margin), xT (Expected Threat), Packing Rate
 * 3. Market Consensus: Pinnacle Sharp Closing Line Odds (for CLV Calculation)
 * 4. Managerial Dynamics & Transfer Volatility Index
 */
export const PROTO_FIXTURES = [
    // === ⚽ FOOTBALL - CURRENT ROUND (프로토 35회차) ===
    {
        id: "fb-101",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 35회차 14번 / 승무패 1번",
        protoGameNo: 14,
        toto14MatchNo: 1,
        matchTime: "2026-08-23 20:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "아스널",
        awayTeam: "첼시",
        homeRank: 2,
        awayRank: 6,
        managerInfo: {
            homeManager: {
                name: "미켈 아르테타",
                status: "ESTABLISHED",
                statusLabel: "안정적 정규 장기 집권 (전술 완성도 극상)",
                impactScore: 0.04,
                tacticalStyle: "강한 전방 압박 & 3-2-4-1 유기적 빌드업"
            },
            awayManager: {
                name: "엔조 마레스카",
                status: "TACTICAL_TRANSITION",
                statusLabel: "신규 전술 적응 과도기 (후방 빌드업 턴오버 빈발)",
                impactScore: -0.05,
                tacticalStyle: "후방 인버티드 풀백 빌드업 & 라인 전진"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "칼라피오리", pos: "수비수", impact: "+6% (수비 안정)" }],
                outflow: [],
                netScore: 0.06,
                summary: "핵심 수비수 칼라피오리 영입으로 좌측 빌드업 및 세트피스 방어력 대폭 보강"
            },
            awayTransfer: {
                inflow: [{ name: "페드루 네투", pos: "윙어", impact: "+5% (스피드 역습)" }],
                outflow: [{ name: "갤러거", pos: "중원 핵심/활동량 1위", impact: "-10% (중원 장악력 약화)" }],
                netScore: -0.05,
                summary: "중원의 심장이던 코너 갤러거 이적으로 인한 중원 압박 및 수비 전환 속도 저하"
            }
        },
        // 🔬 정밀 퀀트 프로세스 지표 (xG, PSxG, xT, Packing Rate, Pythagenpat)
        quantMetrics: {
            pythagenpat: {
                runsFor: 68,
                runsAgainst: 24,
                games: 28,
                expectedWinRate: 83.2,
                actualWinRate: 75.0,
                luckResidual: "+8.2% (득실 마진 대비 불운, 평균 회귀 반등 구간)"
            },
            soccerProcess: {
                homeXG: 2.14,
                awayXG: 1.28,
                npxGHome: 1.95,
                npxGAway: 1.05,
                homePSxGMargin: +0.45, // 다비드 라야 골키퍼 선방 마진 (초과 선방)
                awayPSxGMargin: -0.35, // 산체스 골키퍼 선방 불안 (실점 초과)
                homeXT: 1.84, // 기대 위협도 (Expected Threat)
                awayXT: 1.15,
                packingRateHome: 48.5, // 상대 수비 무력화 패킹 지수
                packingRateAway: 32.0
            }
        },
        stats: {
            homeForm: ["W", "W", "W", "D", "W"],
            awayForm: ["L", "W", "D", "W", "L"],
            homeSplit: { wins: 12, draws: 2, losses: 1, winRate: 80.0, avgGoalsFor: 2.35, avgGoalsAgainst: 0.65 },
            awaySplit: { wins: 5, draws: 3, losses: 7, winRate: 33.3, avgGoalsFor: 1.20, avgGoalsAgainst: 1.75 },
            h2h: {
                totalMatches: 10,
                homeWins: 6,
                draws: 2,
                awayWins: 2,
                homeAtHomeWins: 4,
                homeAtHomeDraws: 1,
                homeAtHomeLosses: 0,
                lastScore: "2 - 1",
                recentScores: ["2-1 (홈승)", "1-0 (홈승)", "2-2 (무)", "3-1 (홈승)", "0-1 (패)"],
                avgH2HGoals: 2.6
            },
            homeXG: 2.14,
            awayXG: 1.28,
            npxGHome: 1.95,
            npxGAway: 1.05,
            homeXGA: 0.72,
            awayXGA: 1.65,
            fieldTiltHome: 64.5,
            setPieceVulnerabilityAway: 0.85,
            homeAvgGoals: 2.2,
            awayAvgGoals: 1.4,
            restDaysHome: 4,
            restDaysAway: 3,
            eloHome: 1985,
            eloAway: 1820
        },
        betmanOdds: {
            homeWin: 1.78,
            draw: 3.65,
            awayWin: 4.10,
            handicapLine: -1.0,
            handicapHome: 3.10,
            handicapDraw: 3.55,
            handicapAway: 1.95,
            underOverLine: 2.5,
            over: 1.82,
            under: 1.90,
            // 🌐 피나클(Pinnacle) 샤프 마켓 마감 배당 (Closing Line)
            sharpMarketOdds: { home: 1.68, draw: 3.85, away: 4.60 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "토미야스", role: "수비수(백업)", status: "경미한 타박 출격 가능" }
            ],
            awayInjuries: [
                { player: "콜 팔머", role: "핵심 플레이메이커 (팀 득점 1위)", status: "결장 확정 (햄스트링)" },
                { player: "리스 제임스", role: "주전 라이트백/주장", status: "경고 누적 결장" }
            ],
            homeImpactScore: -0.02,
            awayImpactScore: -0.22,
            tacticalAnalysis: "아스널의 높은 xT(1.84)와 라야의 PSxG(+0.45) 우위. 첼시는 콜 팔머 결장과 산체스 골키퍼의 음수 선방 마진으로 수비 붕괴 위험.",
            newsSummary: "아스널의 Pythagenpat 기대 승률 83.2% 우세 및 첼시 PSxG 선방 불안. 아스널 승리 유력."
        }
    },
    {
        id: "fb-102",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 35회차 18번 / 승무패 2번",
        protoGameNo: 18,
        toto14MatchNo: 2,
        matchTime: "2026-08-23 23:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "맨체스터 시티",
        awayTeam: "토트넘",
        homeRank: 1,
        awayRank: 5,
        managerInfo: {
            homeManager: {
                name: "펩 과르디올라",
                status: "ESTABLISHED",
                statusLabel: "리그 4연패 챔피언 전술 완성",
                impactScore: 0.05,
                tacticalStyle: "하프스페이스 완벽 지배 & 핀포인트 킬패스"
            },
            awayManager: {
                name: "엔지 포스테코글루",
                status: "TACTICAL_AGGRESSIVE",
                statusLabel: "초공격적 하이 라인 전술",
                impactScore: -0.04,
                tacticalStyle: "극단적 공격형 하이 라인 & 풀백 전진"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "사비뉴", pos: "특급 윙어", impact: "+7% (측면 돌파력)" }],
                outflow: [],
                netScore: 0.07,
                summary: "사비뉴 영입으로 측면 1:1 파괴력 극대화"
            },
            awayTransfer: {
                inflow: [{ name: "도미닉 솔랑케", pos: "스트라이커", impact: "+9% (박스 안 결정력)" }],
                outflow: [],
                netScore: 0.09,
                summary: "정통 9번 솔랑케 영입으로 공격 마무리 해결"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 82,
                runsAgainst: 28,
                games: 28,
                expectedWinRate: 85.6,
                actualWinRate: 82.1,
                luckResidual: "+3.5% (화력 정상 반영)"
            },
            soccerProcess: {
                homeXG: 2.65,
                awayXG: 1.55,
                npxGHome: 2.45,
                npxGAway: 1.35,
                homePSxGMargin: +0.32,
                awayPSxGMargin: +0.05,
                homeXT: 2.15,
                awayXT: 1.45,
                packingRateHome: 54.0,
                packingRateAway: 38.0
            }
        },
        stats: {
            homeForm: ["W", "W", "W", "W", "W"],
            awayForm: ["W", "D", "W", "L", "W"],
            homeSplit: { wins: 14, draws: 1, losses: 0, winRate: 93.3, avgGoalsFor: 2.90, avgGoalsAgainst: 0.70 },
            awaySplit: { wins: 6, draws: 4, losses: 5, winRate: 40.0, avgGoalsFor: 1.65, avgGoalsAgainst: 1.55 },
            h2h: {
                totalMatches: 10,
                homeWins: 5,
                draws: 2,
                awayWins: 3,
                homeAtHomeWins: 4,
                homeAtHomeDraws: 1,
                homeAtHomeLosses: 0,
                lastScore: "3 - 2",
                recentScores: ["3-2 (홈승)", "2-0 (원정승)", "3-3 (무)", "1-0 (홈승)", "0-1 (패)"],
                avgH2HGoals: 3.4
            },
            homeXG: 2.65,
            awayXG: 1.55,
            npxGHome: 2.45,
            npxGAway: 1.35,
            homeXGA: 0.85,
            awayXGA: 1.40,
            fieldTiltHome: 68.0,
            setPieceVulnerabilityAway: 0.70,
            homeAvgGoals: 2.8,
            awayAvgGoals: 1.9,
            restDaysHome: 4,
            restDaysAway: 4,
            eloHome: 2040,
            eloAway: 1845
        },
        betmanOdds: {
            homeWin: 1.45,
            draw: 4.80,
            awayWin: 5.60,
            handicapLine: -1.5,
            handicapHome: 2.15,
            handicapAway: 1.62,
            underOverLine: 3.5,
            over: 1.98,
            under: 1.76,
            sharpMarketOdds: { home: 1.41, draw: 5.10, away: 6.50 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "로드리", role: "주전 수비형 미드필더", status: "선발 출격 가능" }
            ],
            awayInjuries: [
                { player: "미키 판더펜", role: "핵심 센터백 (스피드 수비 커버)", status: "결장 확정 (허벅지 부상)" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.14,
            tacticalAnalysis: "토트넘의 판더펜 결장으로 맨시티의 하프스페이스 침투 xT 2.15를 억제할 수 없음. 다득점 및 맨시티 핸디 승리 유력.",
            newsSummary: "맨시티 홈 14승 1무 무패. 토트넘 수비 배후 공간 붕괴 위기."
        }
    },
    {
        id: "fb-103",
        sport: "soccer",
        league: "라리가 (스페인)",
        round: "프로토 35회차 24번 / 승무패 3번",
        protoGameNo: 24,
        toto14MatchNo: 3,
        matchTime: "2026-08-24 04:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "레알 마드리드",
        awayTeam: "아틀레티코 마드리드",
        homeRank: 1,
        awayRank: 3,
        managerInfo: {
            homeManager: {
                name: "카를로 안첼로티",
                status: "ESTABLISHED",
                statusLabel: "빅매치 특화 유연한 맞춤 전술",
                impactScore: 0.04,
                tacticalStyle: "자유도 높은 4-3-3 역습 & 지공 밸런스"
            },
            awayManager: {
                name: "디에고 시메오네",
                status: "ESTABLISHED",
                statusLabel: "질식 5백 두 줄 수비 장인",
                impactScore: 0.04,
                tacticalStyle: "극단적 질식 5-4-1 텐백 & 세트피스 한방"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "음바페", pos: "월드베스트 공격수", impact: "+16% (골 결정력)" }],
                outflow: [],
                netScore: 0.16,
                summary: "킬리안 음바페 영입으로 최전방 파괴력 급상승"
            },
            awayTransfer: {
                inflow: [{ name: "훌리안 알바레스", pos: "스트라이커", impact: "+12% (활동량/골게터)" }],
                outflow: [],
                netScore: 0.12,
                summary: "맨시티에서 알바레스 전격 영입으로 그리즈만과 최강 투톱 구축"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 62,
                runsAgainst: 22,
                games: 27,
                expectedWinRate: 80.5,
                actualWinRate: 74.0,
                luckResidual: "+6.5% (수비력 지표 우수)"
            },
            soccerProcess: {
                homeXG: 1.85,
                awayXG: 1.20,
                npxGHome: 1.65,
                npxGAway: 1.10,
                homePSxGMargin: +0.65, // 쿠르투아 특급 선방 마진
                awayPSxGMargin: +0.58, // 오블락 특급 선방 마진
                homeXT: 1.55,
                awayXT: 1.10,
                packingRateHome: 42.0,
                packingRateAway: 45.0
            }
        },
        stats: {
            homeForm: ["W", "W", "D", "W", "W"],
            awayForm: ["W", "D", "W", "W", "D"],
            homeSplit: { wins: 11, draws: 3, losses: 0, winRate: 78.5, avgGoalsFor: 2.15, avgGoalsAgainst: 0.70 },
            awaySplit: { wins: 7, draws: 5, losses: 2, winRate: 50.0, avgGoalsFor: 1.40, avgGoalsAgainst: 0.85 },
            h2h: {
                totalMatches: 10,
                homeWins: 3,
                draws: 5,
                awayWins: 2,
                homeAtHomeWins: 2,
                homeAtHomeDraws: 3,
                homeAtHomeLosses: 0,
                lastScore: "1 - 1",
                recentScores: ["1-1 (무)", "1-1 (무)", "2-1 (홈승)", "1-1 (무)", "3-1 (원정패)"],
                avgH2HGoals: 2.1
            },
            homeXG: 1.85,
            awayXG: 1.20,
            npxGHome: 1.65,
            npxGAway: 1.10,
            homeXGA: 0.90,
            awayXGA: 0.85,
            fieldTiltHome: 56.0,
            homeAvgGoals: 2.0,
            awayAvgGoals: 1.3,
            restDaysHome: 5,
            restDaysAway: 5,
            eloHome: 2010,
            eloAway: 1910
        },
        betmanOdds: {
            homeWin: 1.92,
            draw: 3.40,
            awayWin: 3.75,
            handicapLine: -1.0,
            handicapHome: 3.60,
            handicapDraw: 3.40,
            handicapAway: 1.85,
            underOverLine: 2.5,
            over: 1.88,
            under: 1.84,
            sharpMarketOdds: { home: 1.94, draw: 3.35, away: 3.95 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "카마빙가", role: "중원 미드필더", status: "경미한 타박 복귀" }
            ],
            awayInjuries: [
                { player: "그리즈만", role: "에이스", status: "선발 정상 출전" }
            ],
            homeImpactScore: -0.03,
            awayImpactScore: 0.00,
            tacticalAnalysis: "쿠르투아(+0.65) vs 오블락(+0.58) 양 팀 골키퍼의 압도적 PSxG 선방력으로 2.5 언더 및 1-1 무승부 확률 최고조.",
            newsSummary: "마드리드 더비 특유의 질식 수비와 쿠르투아-오블락 선방 대결. 2.5 언더 배팅 가치 우세."
        }
    },
    {
        id: "fb-104",
        sport: "soccer",
        league: "K리그1 (대한민국)",
        round: "프로토 35회차 08번 / 승무패 4번",
        protoGameNo: 8,
        toto14MatchNo: 4,
        matchTime: "2026-08-23 19:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "울산 HD",
        awayTeam: "전북 현대",
        homeRank: 1,
        awayRank: 7,
        managerInfo: {
            homeManager: {
                name: "김판곤",
                status: "NEW_MANAGER_BOUNCE",
                statusLabel: "신임 감독 부임 버프 (+12% 동기부여)",
                impactScore: 0.12,
                tacticalStyle: "강도 높은 전방 압박 & 직선적 템포 축구"
            },
            awayManager: {
                name: "김두현",
                status: "MANAGER_PRESSURE",
                statusLabel: "연패 위기 및 경질 압박 (-7%)",
                impactScore: -0.07,
                tacticalStyle: "점유율 중심 후방 전개 (수비 전환 불안)"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "정우영", pos: "국대 3선 미드필더", impact: "+10% (중원 장악)" }],
                outflow: [],
                netScore: 0.10,
                summary: "정우영 영입으로 중원 빌드업 안정감 확보"
            },
            awayTransfer: {
                inflow: [{ name: "안드리고", pos: "공격형 미드필더", impact: "+6% (창의성)" }],
                outflow: [{ name: "이동준", pos: "핵심 윙어", impact: "-8% (군입대 이탈)" }],
                netScore: -0.02,
                summary: "측면 스피드 에이스 이동준 군입대 공백"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 48,
                runsAgainst: 26,
                games: 26,
                expectedWinRate: 72.8,
                actualWinRate: 65.4,
                luckResidual: "+7.4% (득실 마진 우수)"
            },
            soccerProcess: {
                homeXG: 1.95,
                awayXG: 1.10,
                npxGHome: 1.80,
                npxGAway: 0.95,
                homePSxGMargin: +0.28, // 조현우 특급 선방
                awayPSxGMargin: -0.42, // 전북 골키퍼진 연속 실점 불안
                homeXT: 1.62,
                awayXT: 0.95,
                packingRateHome: 46.0,
                packingRateAway: 30.0
            }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "D"],
            awayForm: ["L", "D", "W", "L", "D"],
            homeSplit: { wins: 10, draws: 2, losses: 2, winRate: 71.4, avgGoalsFor: 1.95, avgGoalsAgainst: 0.80 },
            awaySplit: { wins: 3, draws: 4, losses: 7, winRate: 21.4, avgGoalsFor: 1.05, avgGoalsAgainst: 1.60 },
            h2h: {
                totalMatches: 10,
                homeWins: 6,
                draws: 2,
                awayWins: 2,
                homeAtHomeWins: 4,
                homeAtHomeDraws: 1,
                homeAtHomeLosses: 0,
                lastScore: "1 - 0",
                recentScores: ["1-0 (홈승)", "2-2 (무)", "1-0 (홈승)", "1-0 (홈승)", "0-2 (패)"],
                avgH2HGoals: 1.9
            },
            homeXG: 1.95,
            awayXG: 1.10,
            npxGHome: 1.80,
            npxGAway: 0.95,
            homeXGA: 0.88,
            awayXGA: 1.55,
            fieldTiltHome: 61.0,
            homeAvgGoals: 1.9,
            awayAvgGoals: 1.1,
            restDaysHome: 6,
            restDaysAway: 6,
            eloHome: 1740,
            eloAway: 1590
        },
        betmanOdds: {
            homeWin: 1.72,
            draw: 3.50,
            awayWin: 4.40,
            handicapLine: -1.0,
            handicapHome: 2.95,
            handicapDraw: 3.45,
            handicapAway: 2.05,
            underOverLine: 2.5,
            over: 1.85,
            under: 1.87,
            sharpMarketOdds: { home: 1.65, draw: 3.65, away: 4.85 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "주민규", role: "주전 스트라이커", status: "정상 출전" }
            ],
            awayInjuries: [
                { player: "박진섭", role: "수비 리더/중원 핵심", status: "경고 누적 결장" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.16,
            tacticalAnalysis: "조현우의 높은 PSxG(+0.28)와 김판곤 감독의 전방 압박. 전북의 골키퍼 불안 및 박진섭 결장 누수.",
            newsSummary: "울산 홈 무패 행진 및 신임 감독 부임 효과. 울산 승리 유력."
        }
    
    },
    {
        id: "fb-105",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 35회차 25번 / 승무패 5번",
        protoGameNo: 25,
        toto14MatchNo: 5,
        matchTime: "2026-08-24 00:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "리버풀",
        awayTeam: "뉴캐슬",
        homeRank: 3,
        awayRank: 7,
        managerInfo: {
            homeManager: { name: "아르네 슬롯", status: "ESTABLISHED", statusLabel: "신임 빌드업 완성", impactScore: 0.04, tacticalStyle: "4-3-3 유기적 측면 공략" },
            awayManager: { name: "에디 하우", status: "ESTABLISHED", statusLabel: "강한 압박과 역습", impactScore: 0.02, tacticalStyle: "고강도 전방 압박" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [], outflow: [], netScore: 0.02, summary: "스쿼드 조직력 유지" },
            awayTransfer: { inflow: [], outflow: [], netScore: 0.01, summary: "주전 라인업 건재" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 74, runsAgainst: 31, games: 28, expectedWinRate: 78.5, actualWinRate: 74.0, luckResidual: "+4.5%" },
            soccerProcess: { homeXG: 2.35, awayXG: 1.20, npxGHome: 2.10, npxGAway: 1.05, homePSxGMargin: +0.25, awayPSxGMargin: -0.10, homeXT: 1.95, awayXT: 1.25, packingRateHome: 50.0, packingRateAway: 34.0 }
        },
        stats: {
            homeForm: ["W", "W", "D", "W", "W"],
            awayForm: ["D", "W", "L", "W", "D"],
            homeSplit: { wins: 12, draws: 2, losses: 1, winRate: 80.0, avgGoalsFor: 2.50, avgGoalsAgainst: 0.80 },
            awaySplit: { wins: 4, draws: 4, losses: 7, winRate: 26.7, avgGoalsFor: 1.30, avgGoalsAgainst: 1.70 },
            h2h: { totalMatches: 10, homeWins: 7, draws: 2, awayWins: 1, homeAtHomeWins: 5, homeAtHomeDraws: 0, homeAtHomeLosses: 0, lastScore: "3 - 1", recentScores: ["3-1 (홈승)", "2-0 (원정승)", "2-1 (원정승)", "4-2 (홈승)", "1-1 (무)"], avgH2HGoals: 3.1 },
            homeXG: 2.35, awayXG: 1.20, npxGHome: 2.10, npxGAway: 1.05, homeXGA: 0.80, awayXGA: 1.60, fieldTiltHome: 65.0, setPieceVulnerabilityAway: 0.75, homeAvgGoals: 2.4, awayAvgGoals: 1.5, restDaysHome: 4, restDaysAway: 3, eloHome: 1960, eloAway: 1810
        },
        betmanOdds: { homeWin: 1.55, draw: 4.20, awayWin: 4.90, handicapLine: -1.0, handicapHome: 2.45, handicapDraw: 3.60, handicapAway: 2.25, underOverLine: 3.5, over: 2.05, under: 1.68, sharpMarketOdds: { home: 1.51, draw: 4.45, away: 5.40 } },
        nlpNews: { homeInjuries: [], awayInjuries: [{ player: "트리피어", role: "주전 수비수", status: "경미한 부상" }], homeImpactScore: 0.00, awayImpactScore: -0.08, tacticalAnalysis: "안필드 홈 화력 우세", newsSummary: "리버풀 홈 압승 기대" }
    },
    {
        id: "fb-106",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 35회차 29번 / 승무패 6번",
        protoGameNo: 29,
        toto14MatchNo: 6,
        matchTime: "2026-08-24 03:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "애스턴 빌라",
        awayTeam: "브라이튼",
        homeRank: 4,
        awayRank: 8,
        managerInfo: {
            homeManager: { name: "우나이 에메리", status: "ESTABLISHED", statusLabel: "전술 디테일 극상", impactScore: 0.05, tacticalStyle: "오프사이드 트랩 & 빠른 전환" },
            awayManager: { name: "파비안 휘르첼러", status: "TACTICAL_TRANSITION", statusLabel: "신임 감독 전술 빌드업", impactScore: 0.01, tacticalStyle: "점유율 기반 공격" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "오나나", pos: "미드필더", impact: "+6%" }], outflow: [], netScore: 0.06, summary: "중원 파괴력 보강" },
            awayTransfer: { inflow: [], outflow: [], netScore: 0.00, summary: "기존 전력 유지" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 65, runsAgainst: 42, games: 28, expectedWinRate: 66.8, actualWinRate: 64.2, luckResidual: "+2.6%" },
            soccerProcess: { homeXG: 1.95, awayXG: 1.45, npxGHome: 1.80, npxGAway: 1.30, homePSxGMargin: +0.15, awayPSxGMargin: -0.05, homeXT: 1.70, awayXT: 1.35, packingRateHome: 45.0, packingRateAway: 36.0 }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "D"],
            awayForm: ["W", "D", "W", "L", "D"],
            homeSplit: { wins: 11, draws: 2, losses: 2, winRate: 73.3, avgGoalsFor: 2.20, avgGoalsAgainst: 1.00 },
            awaySplit: { wins: 5, draws: 5, losses: 5, winRate: 33.3, avgGoalsFor: 1.40, avgGoalsAgainst: 1.60 },
            h2h: { totalMatches: 10, homeWins: 6, draws: 2, awayWins: 2, homeAtHomeWins: 4, homeAtHomeDraws: 1, homeAtHomeLosses: 0, lastScore: "2 - 1", recentScores: ["2-1 (홈승)", "0-1 (원정패)", "6-1 (홈승)", "2-1 (원정승)", "2-1 (홈승)"], avgH2HGoals: 2.9 },
            homeXG: 1.95, awayXG: 1.45, npxGHome: 1.80, npxGAway: 1.30, homeXGA: 1.05, awayXGA: 1.50, fieldTiltHome: 58.0, setPieceVulnerabilityAway: 0.65, homeAvgGoals: 2.1, awayAvgGoals: 1.4, restDaysHome: 4, restDaysAway: 4, eloHome: 1880, eloAway: 1780
        },
        betmanOdds: { homeWin: 1.85, draw: 3.75, awayWin: 3.65, handicapLine: -1.0, handicapHome: 3.25, handicapDraw: 3.65, handicapAway: 1.88, underOverLine: 2.5, over: 1.68, under: 2.05, sharpMarketOdds: { home: 1.80, draw: 3.90, away: 4.05 } },
        nlpNews: { homeInjuries: [], awayInjuries: [{ player: "미토마", role: "주전 윙어", status: "선발 출전" }], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "빌라 파크 홈 강세", newsSummary: "애스턴 빌라 우세" }
    },
    {
        id: "fb-107",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 35회차 33번 / 승무패 7번",
        protoGameNo: 33,
        toto14MatchNo: 7,
        matchTime: "2026-08-24 22:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "웨스트햄",
        awayTeam: "울버햄튼",
        homeRank: 9,
        awayRank: 13,
        managerInfo: {
            homeManager: { name: "훌렌 로페테기", status: "ESTABLISHED", statusLabel: "점유율 전술 도입", impactScore: 0.03, tacticalStyle: "측면 크로스 & 박스 침투" },
            awayManager: { name: "게리 오닐", status: "ESTABLISHED", statusLabel: "역습 중심", impactScore: 0.01, tacticalStyle: "5-3-2 수비 후 역습" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "풀크루크", pos: "타깃맨", impact: "+7%" }], outflow: [], netScore: 0.07, summary: "최전방 타깃 공격수 영입" },
            awayTransfer: { inflow: [], outflow: [{ name: "네투", pos: "핵심 윙어", impact: "-10%" }], netScore: -0.10, summary: "핵심 공격수 이적으로 화력 약화" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 52, runsAgainst: 48, games: 28, expectedWinRate: 53.4, actualWinRate: 50.0, luckResidual: "+3.4%" },
            soccerProcess: { homeXG: 1.70, awayXG: 1.15, npxGHome: 1.55, npxGAway: 1.05, homePSxGMargin: +0.08, awayPSxGMargin: -0.12, homeXT: 1.55, awayXT: 1.10, packingRateHome: 42.0, packingRateAway: 30.0 }
        },
        stats: {
            homeForm: ["W", "L", "D", "W", "L"],
            awayForm: ["L", "W", "L", "D", "L"],
            homeSplit: { wins: 8, draws: 4, losses: 3, winRate: 53.3, avgGoalsFor: 1.80, avgGoalsAgainst: 1.30 },
            awaySplit: { wins: 3, draws: 3, losses: 9, winRate: 20.0, avgGoalsFor: 1.05, avgGoalsAgainst: 1.85 },
            h2h: { totalMatches: 10, homeWins: 5, draws: 1, awayWins: 4, homeAtHomeWins: 4, homeAtHomeDraws: 0, homeAtHomeLosses: 1, lastScore: "2 - 1", recentScores: ["2-1 (원정승)", "3-0 (홈승)", "0-1 (원정패)", "2-0 (홈승)", "1-0 (홈승)"], avgH2HGoals: 2.4 },
            homeXG: 1.70, awayXG: 1.15, npxGHome: 1.55, npxGAway: 1.05, homeXGA: 1.20, awayXGA: 1.75, fieldTiltHome: 56.0, setPieceVulnerabilityAway: 0.80, homeAvgGoals: 1.7, awayAvgGoals: 1.1, restDaysHome: 5, restDaysAway: 4, eloHome: 1770, eloAway: 1690
        },
        betmanOdds: { homeWin: 1.95, draw: 3.50, awayWin: 3.50, handicapLine: -1.0, handicapHome: 3.65, handicapDraw: 3.55, handicapAway: 1.76, underOverLine: 2.5, over: 1.80, under: 1.92, sharpMarketOdds: { home: 1.90, draw: 3.65, away: 3.85 } },
        nlpNews: { homeInjuries: [], awayInjuries: [{ player: "황희찬", role: "주전 공격수", status: "선발 출전" }], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "웨스트햄 홈 화력 우세", newsSummary: "웨스트햄 승리 유력" }
    },
    {
        id: "fb-108",
        sport: "soccer",
        league: "라리가 (스페인 1부)",
        round: "프로토 35회차 36번 / 승무패 8번",
        protoGameNo: 36,
        toto14MatchNo: 8,
        matchTime: "2026-08-24 01:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "바르셀로나",
        awayTeam: "세비야",
        homeRank: 2,
        awayRank: 11,
        managerInfo: {
            homeManager: { name: "한지 플릭", status: "ESTABLISHED", statusLabel: "초고강도 압박 & 라인 전진", impactScore: 0.06, tacticalStyle: "헤비메탈 압박 축구" },
            awayManager: { name: "가르시아 피미엔타", status: "TACTICAL_TRANSITION", statusLabel: "점유 축구 이식 중", impactScore: -0.02, tacticalStyle: "후방 빌드업" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "다니 올모", pos: "특급 미드필더", impact: "+9%" }], outflow: [], netScore: 0.09, summary: "다니 올모 영입으로 2선 창의성 극대화" },
            awayTransfer: { inflow: [], outflow: [{ name: "엔네시리", pos: "주전 스트라이커", impact: "-12%" }], netScore: -0.12, summary: "핵심 공격수 이적 누수" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 78, runsAgainst: 30, games: 28, expectedWinRate: 83.0, actualWinRate: 78.6, luckResidual: "+4.4%" },
            soccerProcess: { homeXG: 2.50, awayXG: 0.95, npxGHome: 2.30, npxGAway: 0.85, homePSxGMargin: +0.30, awayPSxGMargin: -0.20, homeXT: 2.10, awayXT: 1.05, packingRateHome: 52.0, packingRateAway: 28.0 }
        },
        stats: {
            homeForm: ["W", "W", "W", "W", "L"],
            awayForm: ["L", "D", "W", "L", "D"],
            homeSplit: { wins: 13, draws: 1, losses: 1, winRate: 86.7, avgGoalsFor: 2.70, avgGoalsAgainst: 0.80 },
            awaySplit: { wins: 3, draws: 4, losses: 8, winRate: 20.0, avgGoalsFor: 0.95, avgGoalsAgainst: 1.80 },
            h2h: { totalMatches: 10, homeWins: 7, draws: 2, awayWins: 1, homeAtHomeWins: 5, homeAtHomeDraws: 0, homeAtHomeLosses: 0, lastScore: "2 - 1", recentScores: ["2-1 (원정승)", "1-0 (홈승)", "3-0 (홈승)", "3-0 (원정승)", "1-0 (홈승)"], avgH2HGoals: 2.7 },
            homeXG: 2.50, awayXG: 0.95, npxGHome: 2.30, npxGAway: 0.85, homeXGA: 0.75, awayXGA: 1.85, fieldTiltHome: 70.0, setPieceVulnerabilityAway: 0.85, homeAvgGoals: 2.6, awayAvgGoals: 1.1, restDaysHome: 4, restDaysAway: 4, eloHome: 2010, eloAway: 1730
        },
        betmanOdds: { homeWin: 1.35, draw: 5.20, awayWin: 6.80, handicapLine: -1.5, handicapHome: 1.98, handicapAway: 1.74, underOverLine: 3.5, over: 1.92, under: 1.80, sharpMarketOdds: { home: 1.31, draw: 5.60, away: 8.20 } },
        nlpNews: { homeInjuries: [{ player: "야말", role: "주전 윙어", status: "선발 출전" }], awayInjuries: [], homeImpactScore: 0.03, awayImpactScore: 0.00, tacticalAnalysis: "바르셀로나 압도적 화력", newsSummary: "바르셀로나 완승 기대" }
    },
    {
        id: "fb-109",
        sport: "soccer",
        league: "라리가 (스페인 1부)",
        round: "프로토 35회차 40번 / 승무패 9번",
        protoGameNo: 40,
        toto14MatchNo: 9,
        matchTime: "2026-08-24 03:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "비야레알",
        awayTeam: "레알 소시에다드",
        homeRank: 5,
        awayRank: 6,
        managerInfo: {
            homeManager: { name: "마르셀리노", status: "ESTABLISHED", statusLabel: "견고한 4-4-2 역습", impactScore: 0.04, tacticalStyle: "두 줄 수비 & 속공" },
            awayManager: { name: "이마놀 알구아실", status: "ESTABLISHED", statusLabel: "조직력 축구", impactScore: 0.03, tacticalStyle: "중원 장악 & 압박" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "페페", pos: "윙어", impact: "+5%" }], outflow: [], netScore: 0.05, summary: "스피드 보강" },
            awayTransfer: { inflow: [], outflow: [{ name: "메리노", pos: "중원 핵심", impact: "-9%" }], netScore: -0.09, summary: "중원 핵심 미켈 메리노 이적으로 공백" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 58, runsAgainst: 46, games: 28, expectedWinRate: 59.2, actualWinRate: 57.1, luckResidual: "+2.1%" },
            soccerProcess: { homeXG: 1.65, awayXG: 1.35, npxGHome: 1.50, npxGAway: 1.25, homePSxGMargin: +0.10, awayPSxGMargin: +0.05, homeXT: 1.50, awayXT: 1.30, packingRateHome: 40.0, packingRateAway: 38.0 }
        },
        stats: {
            homeForm: ["W", "W", "D", "W", "L"],
            awayForm: ["L", "W", "D", "W", "D"],
            homeSplit: { wins: 9, draws: 3, losses: 3, winRate: 60.0, avgGoalsFor: 1.95, avgGoalsAgainst: 1.25 },
            awaySplit: { wins: 6, draws: 4, losses: 5, winRate: 40.0, avgGoalsFor: 1.25, avgGoalsAgainst: 1.20 },
            h2h: { totalMatches: 10, homeWins: 4, draws: 2, awayWins: 4, homeAtHomeWins: 2, homeAtHomeDraws: 1, homeAtHomeLosses: 2, lastScore: "3 - 1", recentScores: ["3-1 (원정승)", "0-3 (홈패)", "2-0 (홈승)", "0-1 (원정패)", "1-2 (홈패)"], avgH2HGoals: 2.6 },
            homeXG: 1.65, awayXG: 1.35, npxGHome: 1.50, npxGAway: 1.25, homeXGA: 1.25, awayXGA: 1.30, fieldTiltHome: 52.0, setPieceVulnerabilityAway: 0.70, homeAvgGoals: 1.8, awayAvgGoals: 1.3, restDaysHome: 4, restDaysAway: 4, eloHome: 1820, eloAway: 1810
        },
        betmanOdds: { homeWin: 2.25, draw: 3.35, awayWin: 2.90, handicapLine: -1.0, handicapHome: 4.45, handicapDraw: 3.90, handicapAway: 1.55, underOverLine: 2.5, over: 1.88, under: 1.84, sharpMarketOdds: { home: 2.20, draw: 3.45, away: 3.10 } },
        nlpNews: { homeInjuries: [], awayInjuries: [{ player: "오야르사발", role: "주장/공격수", status: "정상 출전" }], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "팽팽한 접전 양상", newsSummary: "홈팀 비야레알 근소 우세" }
    },
    {
        id: "fb-110",
        sport: "soccer",
        league: "라리가 (스페인 1부)",
        round: "프로토 35회차 45번 / 승무패 10번",
        protoGameNo: 45,
        toto14MatchNo: 10,
        matchTime: "2026-08-25 02:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "아틀레틱 빌바오",
        awayTeam: "레알 베티스",
        homeRank: 7,
        awayRank: 8,
        managerInfo: {
            homeManager: { name: "에르네스토 발베르데", status: "ESTABLISHED", statusLabel: "산마메스 홈 불패", impactScore: 0.05, tacticalStyle: "측면 스피드 역습" },
            awayManager: { name: "마누엘 페예그리니", status: "ESTABLISHED", statusLabel: "노련한 전술", impactScore: 0.02, tacticalStyle: "중원 패스 플레이" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "자브라", pos: "수비수", impact: "+4%" }], outflow: [], netScore: 0.04, summary: "수비진 보강" },
            awayTransfer: { inflow: [{ name: "로셀소", pos: "미드필더", impact: "+7%" }], outflow: [], netScore: 0.07, summary: "로셀소 복귀로 창의성 수혈" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 54, runsAgainst: 38, games: 28, expectedWinRate: 64.5, actualWinRate: 60.7, luckResidual: "+3.8%" },
            soccerProcess: { homeXG: 1.80, awayXG: 1.20, npxGHome: 1.65, npxGAway: 1.10, homePSxGMargin: +0.20, awayPSxGMargin: +0.00, homeXT: 1.65, awayXT: 1.20, packingRateHome: 44.0, packingRateAway: 35.0 }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "W"],
            awayForm: ["D", "W", "L", "D", "W"],
            homeSplit: { wins: 11, draws: 3, losses: 1, winRate: 73.3, avgGoalsFor: 2.10, avgGoalsAgainst: 0.90 },
            awaySplit: { wins: 4, draws: 6, losses: 5, winRate: 26.7, avgGoalsFor: 1.20, avgGoalsAgainst: 1.45 },
            h2h: { totalMatches: 10, homeWins: 6, draws: 1, awayWins: 3, homeAtHomeWins: 5, homeAtHomeDraws: 0, homeAtHomeLosses: 1, lastScore: "4 - 2", recentScores: ["4-2 (홈승)", "1-3 (원정패)", "0-1 (홈패)", "0-0 (무)", "3-2 (홈승)"], avgH2HGoals: 2.8 },
            homeXG: 1.80, awayXG: 1.20, npxGHome: 1.65, npxGAway: 1.10, homeXGA: 0.95, awayXGA: 1.55, fieldTiltHome: 60.0, setPieceVulnerabilityAway: 0.70, homeAvgGoals: 2.0, awayAvgGoals: 1.3, restDaysHome: 5, restDaysAway: 4, eloHome: 1840, eloAway: 1760
        },
        betmanOdds: { homeWin: 1.88, draw: 3.45, awayWin: 3.85, handicapLine: -1.0, handicapHome: 3.40, handicapDraw: 3.55, handicapAway: 1.83, underOverLine: 2.5, over: 1.95, under: 1.78, sharpMarketOdds: { home: 1.84, draw: 3.55, away: 4.20 } },
        nlpNews: { homeInjuries: [{ player: "니코 윌리엄스", role: "특급 윙어", status: "선발 출전 확정" }], awayInjuries: [{ player: "이스코", role: "주전 미드필더", status: "부상 결장" }], homeImpactScore: 0.05, awayImpactScore: -0.15, tacticalAnalysis: "산마메스 요새와 니코 윌리엄스의 스피드 우위", newsSummary: "빌바오 홈 승리 유력" }
    },
    {
        id: "fb-111",
        sport: "soccer",
        league: "라리가 (스페인 1부)",
        round: "프로토 35회차 48번 / 승무패 11번",
        protoGameNo: 48,
        toto14MatchNo: 11,
        matchTime: "2026-08-25 04:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "발렌시아",
        awayTeam: "헤타페",
        homeRank: 12,
        awayRank: 15,
        managerInfo: {
            homeManager: { name: "루벤 바라하", status: "ESTABLISHED", statusLabel: "홈 집중력", impactScore: 0.02, tacticalStyle: "4-4-2 콤팩트 수비" },
            awayManager: { name: "호세 보르달라스", status: "ESTABLISHED", statusLabel: "거친 수비와 파울", impactScore: 0.01, tacticalStyle: "극단적 수비 및 시간 지연" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [], outflow: [], netScore: 0.00, summary: "유스 자원 중심" },
            awayTransfer: { inflow: [], outflow: [], netScore: 0.00, summary: "수비진 고정" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 38, runsAgainst: 42, games: 28, expectedWinRate: 46.2, actualWinRate: 42.8, luckResidual: "+3.4%" },
            soccerProcess: { homeXG: 1.35, awayXG: 0.85, npxGHome: 1.25, npxGAway: 0.75, homePSxGMargin: +0.22, awayPSxGMargin: +0.10, homeXT: 1.25, awayXT: 0.85, packingRateHome: 36.0, packingRateAway: 24.0 }
        },
        stats: {
            homeForm: ["D", "W", "L", "D", "W"],
            awayForm: ["D", "D", "L", "D", "L"],
            homeSplit: { wins: 7, draws: 5, losses: 3, winRate: 46.7, avgGoalsFor: 1.30, avgGoalsAgainst: 0.90 },
            awaySplit: { wins: 1, draws: 7, losses: 7, winRate: 6.7, avgGoalsFor: 0.70, avgGoalsAgainst: 1.40 },
            h2h: { totalMatches: 10, homeWins: 5, draws: 2, awayWins: 3, homeAtHomeWins: 4, homeAtHomeDraws: 1, homeAtHomeLosses: 0, lastScore: "1 - 0", recentScores: ["1-0 (홈승)", "0-1 (원정패)", "5-1 (홈승)", "0-0 (무)", "1-0 (홈승)"], avgH2HGoals: 1.8 },
            homeXG: 1.35, awayXG: 0.85, npxGHome: 1.25, npxGAway: 0.75, homeXGA: 0.90, awayXGA: 1.40, fieldTiltHome: 55.0, setPieceVulnerabilityAway: 0.60, homeAvgGoals: 1.2, awayAvgGoals: 0.8, restDaysHome: 5, restDaysAway: 5, eloHome: 1720, eloAway: 1650
        },
        betmanOdds: { homeWin: 2.05, draw: 2.95, awayWin: 3.75, handicapLine: -1.0, handicapHome: 4.25, handicapDraw: 3.45, handicapAway: 1.62, underOverLine: 1.5, over: 1.65, under: 2.10, sharpMarketOdds: { home: 2.00, draw: 3.05, away: 4.10 } },
        nlpNews: { homeInjuries: [], awayInjuries: [], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "메스타야 홈 언더 성향 짙은 경기", newsSummary: "발렌시아 1-0 승리 또는 언더 추천" }
    },
    {
        id: "fb-112",
        sport: "soccer",
        league: "K리그1 (대한민국 1부)",
        round: "프로토 35회차 51번 / 승무패 12번",
        protoGameNo: 51,
        toto14MatchNo: 12,
        matchTime: "2026-08-24 19:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "포항 스틸러스",
        awayTeam: "FC서울",
        homeRank: 3,
        awayRank: 6,
        managerInfo: {
            homeManager: { name: "박태하", status: "ESTABLISHED", statusLabel: "스틸타카 부활", impactScore: 0.04, tacticalStyle: "유기적 숏패스 & 압박" },
            awayManager: { name: "김기동", status: "ESTABLISHED", statusLabel: "친정팀 방문", impactScore: 0.02, tacticalStyle: "공수 밸런스" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "이호재", pos: "타깃 공격수", impact: "+6%" }], outflow: [], netScore: 0.06, summary: "공격진 파괴력 유지" },
            awayTransfer: { inflow: [{ name: "린가드", pos: "플레이메이커", impact: "+8%" }], outflow: [], netScore: 0.08, summary: "린가드 폼 완벽 회복" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 44, runsAgainst: 33, games: 26, expectedWinRate: 61.2, actualWinRate: 57.7, luckResidual: "+3.5%" },
            soccerProcess: { homeXG: 1.65, awayXG: 1.40, npxGHome: 1.50, npxGAway: 1.30, homePSxGMargin: +0.12, awayPSxGMargin: +0.05, homeXT: 1.55, awayXT: 1.40, packingRateHome: 43.0, packingRateAway: 39.0 }
        },
        stats: {
            homeForm: ["W", "D", "W", "L", "W"],
            awayForm: ["W", "W", "W", "L", "D"],
            homeSplit: { wins: 7, draws: 4, losses: 2, winRate: 53.8, avgGoalsFor: 1.70, avgGoalsAgainst: 1.10 },
            awaySplit: { wins: 5, draws: 4, losses: 4, winRate: 38.5, avgGoalsFor: 1.45, avgGoalsAgainst: 1.35 },
            h2h: { totalMatches: 10, homeWins: 4, draws: 4, awayWins: 2, homeAtHomeWins: 2, homeAtHomeDraws: 3, homeAtHomeLosses: 0, lastScore: "2 - 2", recentScores: ["2-2 (무)", "4-2 (원정승)", "1-1 (홈무)", "2-2 (원정무)", "1-1 (홈무)"], avgH2HGoals: 3.1 },
            homeXG: 1.65, awayXG: 1.40, npxGHome: 1.50, npxGAway: 1.30, homeXGA: 1.15, awayXGA: 1.40, fieldTiltHome: 53.0, setPieceVulnerabilityAway: 0.65, homeAvgGoals: 1.7, awayAvgGoals: 1.5, restDaysHome: 5, restDaysAway: 5, eloHome: 1680, eloAway: 1640
        },
        betmanOdds: { homeWin: 2.15, draw: 3.25, awayWin: 3.05, handicapLine: -1.0, handicapHome: 4.30, handicapDraw: 3.80, handicapAway: 1.58, underOverLine: 2.5, over: 1.85, under: 1.87, sharpMarketOdds: { home: 2.10, draw: 3.35, away: 3.25 } },
        nlpNews: { homeInjuries: [], awayInjuries: [], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "포항 스틸야드 홈 무패 및 린가드의 창의성 맞대결", newsSummary: "무승부 또는 포항 근소 우세" }
    },
    {
        id: "fb-113",
        sport: "soccer",
        league: "K리그1 (대한민국 1부)",
        round: "프로토 35회차 55번 / 승무패 13번",
        protoGameNo: 55,
        toto14MatchNo: 13,
        matchTime: "2026-08-24 19:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "김천 상무",
        awayTeam: "강원 FC",
        homeRank: 2,
        awayRank: 4,
        managerInfo: {
            homeManager: { name: "정정용", status: "ESTABLISHED", statusLabel: "조직력 돌풍", impactScore: 0.05, tacticalStyle: "유기적 공간 침투" },
            awayManager: { name: "윤정환", status: "ESTABLISHED", statusLabel: "돌풍의 강원", impactScore: 0.05, tacticalStyle: "빠른 측면 역습" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "이동경", pos: "미드필더", impact: "+12%" }], outflow: [], netScore: 0.12, summary: "이동경 합류로 득점력 폭발" },
            awayTransfer: { inflow: [{ name: "양민혁", pos: "특급 유망주", impact: "+10%" }], outflow: [], netScore: 0.10, summary: "양민혁의 파괴적인 돌파력" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 46, runsAgainst: 32, games: 26, expectedWinRate: 64.0, actualWinRate: 61.5, luckResidual: "+2.5%" },
            soccerProcess: { homeXG: 1.85, awayXG: 1.60, npxGHome: 1.70, npxGAway: 1.50, homePSxGMargin: +0.15, awayPSxGMargin: +0.08, homeXT: 1.75, awayXT: 1.60, packingRateHome: 47.0, packingRateAway: 44.0 }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "W"],
            awayForm: ["W", "W", "W", "L", "W"],
            homeSplit: { wins: 8, draws: 3, losses: 2, winRate: 61.5, avgGoalsFor: 1.85, avgGoalsAgainst: 1.05 },
            awaySplit: { wins: 6, draws: 2, losses: 5, winRate: 46.2, avgGoalsFor: 1.65, avgGoalsAgainst: 1.45 },
            h2h: { totalMatches: 10, homeWins: 5, draws: 2, awayWins: 3, homeAtHomeWins: 3, homeAtHomeDraws: 1, homeAtHomeLosses: 1, lastScore: "3 - 2", recentScores: ["3-2 (원정승)", "1-0 (홈승)", "2-3 (원정패)", "1-0 (홈승)", "0-0 (무)"], avgH2HGoals: 2.7 },
            homeXG: 1.85, awayXG: 1.60, npxGHome: 1.70, npxGAway: 1.50, homeXGA: 1.10, awayXGA: 1.35, fieldTiltHome: 54.0, setPieceVulnerabilityAway: 0.65, homeAvgGoals: 1.8, awayAvgGoals: 1.7, restDaysHome: 5, restDaysAway: 5, eloHome: 1690, eloAway: 1670
        },
        betmanOdds: { homeWin: 2.20, draw: 3.30, awayWin: 2.95, handicapLine: -1.0, handicapHome: 4.35, handicapDraw: 3.85, handicapAway: 1.56, underOverLine: 2.5, over: 1.78, under: 1.94, sharpMarketOdds: { home: 2.15, draw: 3.40, away: 3.10 } },
        nlpNews: { homeInjuries: [], awayInjuries: [], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "이동경 vs 양민혁 에이스 맞대결 및 화력전", newsSummary: "다득점 오버 및 김천 근소 우세" }
    },
    {
        id: "fb-114",
        sport: "soccer",
        league: "K리그1 (대한민국 1부)",
        round: "프로토 35회차 58번 / 승무패 14번",
        protoGameNo: 58,
        toto14MatchNo: 14,
        matchTime: "2026-08-24 19:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "광주 FC",
        awayTeam: "수원FC",
        homeRank: 7,
        awayRank: 5,
        managerInfo: {
            homeManager: { name: "이정효", status: "ESTABLISHED", statusLabel: "정효볼 완성", impactScore: 0.06, tacticalStyle: "초공격적 포지셔닝 & 하이 프레싱" },
            awayManager: { name: "김은중", status: "ESTABLISHED", statusLabel: "실리 축구", impactScore: 0.03, tacticalStyle: "역습 & 세트피스" }
        },
        transferDynamics: {
            homeTransfer: { inflow: [{ name: "아사니", pos: "프리킥 에이스", impact: "+8%" }], outflow: [], netScore: 0.08, summary: "아사니 복귀로 세트피스 극대화" },
            awayTransfer: { inflow: [{ name: "안데르손", pos: "공격 핵심", impact: "+7%" }], outflow: [], netScore: 0.07, summary: "안데르손 리그 도움 1위 질주" }
        },
        quantMetrics: {
            pythagenpat: { runsFor: 39, runsAgainst: 36, games: 26, expectedWinRate: 53.2, actualWinRate: 50.0, luckResidual: "+3.2%" },
            soccerProcess: { homeXG: 1.75, awayXG: 1.30, npxGHome: 1.60, npxGAway: 1.20, homePSxGMargin: +0.08, awayPSxGMargin: +0.02, homeXT: 1.70, awayXT: 1.30, packingRateHome: 48.0, packingRateAway: 36.0 }
        },
        stats: {
            homeForm: ["W", "L", "W", "W", "L"],
            awayForm: ["W", "D", "W", "L", "W"],
            homeSplit: { wins: 7, draws: 1, losses: 5, winRate: 53.8, avgGoalsFor: 1.55, avgGoalsAgainst: 1.30 },
            awaySplit: { wins: 5, draws: 3, losses: 5, winRate: 38.5, avgGoalsFor: 1.35, avgGoalsAgainst: 1.45 },
            h2h: { totalMatches: 10, homeWins: 6, draws: 1, awayWins: 3, homeAtHomeWins: 4, homeAtHomeDraws: 0, homeAtHomeLosses: 1, lastScore: "1 - 2", recentScores: ["1-2 (원정패)", "1-0 (홈승)", "1-2 (원정패)", "3-0 (홈승)", "2-0 (홈승)"], avgH2HGoals: 2.3 },
            homeXG: 1.75, awayXG: 1.30, npxGHome: 1.60, npxGAway: 1.20, homeXGA: 1.15, awayXGA: 1.50, fieldTiltHome: 62.0, setPieceVulnerabilityAway: 0.75, homeAvgGoals: 1.5, awayAvgGoals: 1.4, restDaysHome: 5, restDaysAway: 5, eloHome: 1660, eloAway: 1650
        },
        betmanOdds: { homeWin: 2.00, draw: 3.35, awayWin: 3.30, handicapLine: -1.0, handicapHome: 3.90, handicapDraw: 3.70, handicapAway: 1.68, underOverLine: 2.5, over: 1.82, under: 1.90, sharpMarketOdds: { home: 1.95, draw: 3.45, away: 3.55 } },
        nlpNews: { homeInjuries: [], awayInjuries: [], homeImpactScore: 0.00, awayImpactScore: 0.00, tacticalAnalysis: "이정효 감독의 광주월드컵 홈 전방 압박 우세", newsSummary: "광주 FC 승리 유력" }
    },

    // === ⚾ BASEBALL - CURRENT ROUND (프로토 35회차) ===
    {
        id: "bb-201",
        sport: "baseball",
        league: "KBO (한국 프로야구)",
        round: "프로토 승부식 35회차 42번",
        protoGameNo: 42,
        matchTime: "2026-08-23 17:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "KIA 타이거즈",
        awayTeam: "LG 트윈스",
        homeRank: 1,
        awayRank: 2,
        managerInfo: {
            homeManager: {
                name: "이범호",
                status: "NEW_MANAGER_BOUNCE",
                statusLabel: "감독 돌풍 및 선수단 끈끈한 신뢰 (+10%)",
                impactScore: 0.10,
                tacticalStyle: "적극적 공격 야구 & 불펜 분업화"
            },
            awayManager: {
                name: "염경엽",
                status: "ESTABLISHED",
                statusLabel: "디테일 작전 야구",
                impactScore: 0.03,
                tacticalStyle: "도루/작전 극대화"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "네일", pos: "외인 1선발", impact: "+18% (ERA 2.34 특급 에이스)" }],
                outflow: [],
                netScore: 0.18,
                summary: "외인 특급 1선발 네일 영입으로 선발진 KBO 1위 도약"
            },
            awayTransfer: {
                inflow: [{ name: "에르난데스", pos: "대체 외인 투수", impact: "+8% (강속구 불펜/선발)" }],
                outflow: [],
                netScore: 0.03,
                summary: "투수진 재편 중"
            }
        },
        // 🔬 야구 전용 세이버메트릭스 & Pythagenpat & 불펜 High-LI 지표
        quantMetrics: {
            pythagenpat: {
                runsFor: 640,
                runsAgainst: 480,
                games: 110,
                dynamicExponent: 1.88, // x = (RPG 10.18)^0.287 = 1.88
                expectedWinRate: 63.5,
                actualWinRate: 67.8,
                luckResidual: "-4.3% (1점차 승부 집중력 및 불펜 우위 반영)"
            },
            sabermetrics: {
                homeStarter: { name: "네일", era: 2.34, fip: 2.65, fwar: 4.85, k9: 9.4, bb9: 2.1, hr9: 0.35, ttopRisk: "낮음 (90구 이후 피OPS 0.620)" },
                awayStarter: { name: "임찬규", era: 3.85, fip: 4.12, fwar: 2.45, k9: 6.8, bb9: 3.2, hr9: 0.85, ttopRisk: "높음 (3타순째 피OPS 0.845 급증)" },
                starterFipGap: -1.47, // 네일의 압도적 우위
                bullpenLeverage: {
                    homeCloserLI: "정해영 (High-LI 2.4 상황 피안타율 0.185, 2일 휴식 충전)",
                    awayCloserLI: "유영찬 (High-LI 2.1 상황 피안타율 0.245, 2연투 피로 누적)",
                    bullpenFatigueScoreHome: 0.95, // 피로도 낮음 (최상)
                    bullpenFatigueScoreAway: 0.78 // 피로도 높음 (불안)
                }
            }
        },
        stats: {
            homeForm: ["W", "W", "W", "L", "W"],
            awayForm: ["L", "W", "W", "L", "L"],
            homeSplit: { wins: 38, draws: 1, losses: 18, winRate: 67.8, avgRunsFor: 6.2, avgRunsAgainst: 4.1 },
            awaySplit: { wins: 28, draws: 2, losses: 26, winRate: 51.8, avgRunsFor: 4.9, avgRunsAgainst: 4.8 },
            h2h: {
                totalMatches: 13,
                homeWins: 8,
                draws: 0,
                awayWins: 5,
                homeAtHomeWins: 5,
                homeAtHomeDraws: 0,
                homeAtHomeLosses: 1,
                lastScore: "5 - 3",
                recentScores: ["5-3 (홈승)", "7-4 (홈승)", "2-5 (패)", "6-2 (홈승)", "4-3 (홈승)"],
                avgH2HRuns: 8.8
            },
            homeStarter: "네일 (ERA 2.34, FIP 2.65, 11승 2패, WHIP 1.05)",
            awayStarter: "임찬규 (ERA 3.85, FIP 4.12, 8승 5패, WHIP 1.34)",
            starterH2H: "네일 LG 상대 2경기 2승 ERA 1.38 / 임찬규 KIA 상대 3경기 1승 2패 ERA 5.14",
            parkFactor: 1.02,
            bullpenLeverageHome: "정해영/전상현 필승조 2일 휴식 (최상)",
            bullpenLeverageAway: "유영찬 2연투 피로도 누적 (주의)",
            homeTeamOPS: 0.815,
            awayTeamOPS: 0.768,
            homeBullpenERA: 3.45,
            awayBullpenERA: 4.20,
            restDaysHome: 1,
            restDaysAway: 1,
            eloHome: 1680,
            eloAway: 1610
        },
        betmanOdds: {
            homeWin: 1.62,
            awayWin: 2.25,
            handicapLine: -1.5,
            handicapHome: 2.10,
            handicapAway: 1.68,
            underOverLine: 8.5,
            over: 1.85,
            under: 1.87,
            sharpMarketOdds: { home: 1.54, away: 2.45 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "김도영", role: "30-30 MVP 타자", status: "정상 출전 (최근 5G OPS 1.150)" }
            ],
            awayInjuries: [
                { player: "오지환", role: "주전 유격수/캡틴", status: "손목 통증 결장" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.11,
            tacticalAnalysis: "네일의 fWAR(4.85) vs 임찬규(2.45) 격차 및 LG 선발 3타순째(TTOP) 피OPS 급증. KIA 불펜 High-LI 방어력 우세.",
            newsSummary: "네일의 FIP 2.65 압도적 우위 및 LG 불펜 피로도 누적. KIA 승리 유력."
        }
    },
    {
        id: "bb-202",
        sport: "baseball",
        league: "KBO (한국 프로야구)",
        round: "프로토 승부식 35회차 45번",
        protoGameNo: 45,
        matchTime: "2026-08-23 17:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "한화 이글스",
        awayTeam: "두산 베어스",
        homeRank: 6,
        awayRank: 4,
        managerInfo: {
            homeManager: {
                name: "김경문",
                status: "NEW_MANAGER_BOUNCE",
                statusLabel: "베테랑 명장 부임 효과 (+10% 투수진 쇄신)",
                impactScore: 0.10,
                tacticalStyle: "선발 야구 & 공격적 투수 교체"
            },
            awayManager: {
                name: "이승엽",
                status: "ESTABLISHED",
                statusLabel: "빅볼 중심 타선 지향",
                impactScore: 0.02,
                tacticalStyle: "장타 중심 공격"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "류현진", pos: "괴물 좌완 투수", impact: "+16% (투수진 기둥)" }],
                outflow: [],
                netScore: 0.16,
                summary: "류현진 복귀로 선발진 뎁스 쇄신"
            },
            awayTransfer: {
                inflow: [],
                outflow: [],
                netScore: 0.00,
                summary: "기존 타선 유지"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 490,
                runsAgainst: 510,
                games: 108,
                dynamicExponent: 1.84,
                expectedWinRate: 48.2,
                actualWinRate: 53.5,
                luckResidual: "-5.3% (접전 승부 불펜 선방)"
            },
            sabermetrics: {
                homeStarter: { name: "문동주", era: 2.95, fip: 3.05, fwar: 3.80, k9: 10.2, bb9: 2.6, hr9: 0.45, ttopRisk: "낮음" },
                awayStarter: { name: "곽빈", era: 3.12, fip: 3.25, fwar: 3.65, k9: 9.8, bb9: 3.1, hr9: 0.52, ttopRisk: "낮음" },
                starterFipGap: -0.20, // 팽팽한 투수전
                bullpenLeverage: {
                    homeCloserLI: "주현상 (High-LI 2.2 상황 피안타율 0.205)",
                    awayCloserLI: "김택연 (High-LI 2.5 상황 탈삼진율 34.5%)",
                    bullpenFatigueScoreHome: 0.92,
                    bullpenFatigueScoreAway: 0.90
                }
            }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "W"],
            awayForm: ["L", "L", "W", "L", "D"],
            homeSplit: { wins: 30, draws: 1, losses: 26, winRate: 53.5, avgRunsFor: 4.8, avgRunsAgainst: 4.6 },
            awaySplit: { wins: 29, draws: 2, losses: 27, winRate: 51.7, avgRunsFor: 5.1, avgRunsAgainst: 4.9 },
            h2h: {
                totalMatches: 13,
                homeWins: 6,
                draws: 0,
                awayWins: 7,
                homeAtHomeWins: 4,
                homeAtHomeDraws: 0,
                homeAtHomeLosses: 3,
                lastScore: "4 - 2",
                recentScores: ["4-2 (홈승)", "2-3 (패)", "5-1 (홈승)", "1-2 (패)", "3-0 (홈승)"],
                avgH2HRuns: 5.8
            },
            homeStarter: "문동주 (ERA 2.95, FIP 3.05, 158km 강속구, WHIP 1.12)",
            awayStarter: "곽빈 (ERA 3.12, FIP 3.25, 10승 6패, WHIP 1.18)",
            starterH2H: "문동주 두산 상대 ERA 2.45 / 곽빈 한화 상대 ERA 2.80",
            parkFactor: 0.96, // 투수 친화 대전 파크팩터
            bullpenLeverageHome: "주현상/한승혁 대기 (양호)",
            bullpenLeverageAway: "김택연 필승조 대기 (양호)",
            homeTeamOPS: 0.742,
            awayTeamOPS: 0.755,
            homeBullpenERA: 3.80,
            awayBullpenERA: 4.10,
            restDaysHome: 1,
            restDaysAway: 1,
            eloHome: 1550,
            eloAway: 1575
        },
        betmanOdds: {
            homeWin: 1.85,
            awayWin: 1.95,
            handicapLine: 1.5,
            handicapHome: 1.55,
            handicapAway: 2.35,
            underOverLine: 7.5,
            over: 1.90,
            under: 1.82,
            sharpMarketOdds: { home: 1.84, away: 1.96 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "노시환", role: "4번 타자", status: "정상 출전" }
            ],
            awayInjuries: [
                { player: "양의지", role: "포수/핵심 타자", status: "무릎 관리 지명타자 출전" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.05,
            tacticalAnalysis: "문동주 vs 곽빈 양 팀 에이스 FIP 3.0대 충돌 및 대전 파크팩터 0.96. 7.5 언더 확률 64.5%.",
            newsSummary: "양 팀 에이스 선발 충돌. 7.5 기준 언더 확률 64.2%로 최우선 배팅 가치."
        }
    },

    // === 🏀 BASKETBALL - CURRENT ROUND (프로토 35회차) ===
    {
        id: "bk-301",
        sport: "basketball",
        league: "NBA (미국 프로농구)",
        round: "프로토 승부식 35회차 65번",
        protoGameNo: 65,
        matchTime: "2026-08-24 09:30",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "보스턴 셀틱스",
        awayTeam: "밀워키 벅스",
        homeRank: 1,
        awayRank: 4,
        managerInfo: {
            homeManager: {
                name: "조 마줄라",
                status: "ESTABLISHED",
                statusLabel: "디펜딩 챔피언 현대 농구 스페이싱 완성 (+6%)",
                impactScore: 0.06,
                tacticalStyle: "5-Out 스페이싱 & 3점 폭격"
            },
            awayManager: {
                name: "닥 리버스",
                status: "TACTICAL_STRUGGLE",
                statusLabel: "수비 로테이션 불안정 (-5%)",
                impactScore: -0.05,
                tacticalStyle: "드랍백 수비 & 쿵보/릴라드 의존"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "즈루 홀리데이", pos: "특급 수비 가드", impact: "+14%" }, { name: "포르징기스", pos: "스트레치 빅맨", impact: "+12%" }],
                outflow: [],
                netScore: 0.26,
                summary: "홀리데이와 포르징기스 영입으로 무결점 슈퍼팀 완성"
            },
            awayTransfer: {
                inflow: [{ name: "데미안 릴라드", pos: "슈퍼스타 가드", impact: "+15%" }],
                outflow: [{ name: "즈루 홀리데이", pos: "수비 핵", impact: "-14%" }],
                netScore: 0.01,
                summary: "릴라드 영입으로 화력은 올랐으나 앞선 수비 실점률 급증"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 122.5,
                runsAgainst: 106.8,
                games: 60,
                expectedWinRate: 88.4,
                actualWinRate: 89.5,
                luckResidual: "+1.1% (압도적 넷레이팅 +13.3)"
            }
        },
        stats: {
            homeForm: ["W", "W", "W", "W", "L"],
            awayForm: ["W", "L", "W", "L", "W"],
            homeSplit: { wins: 34, losses: 4, winRate: 89.5, avgPtsFor: 122.5, avgPtsAgainst: 106.8 },
            awaySplit: { wins: 20, losses: 18, winRate: 52.6, avgPtsFor: 114.2, avgPtsAgainst: 115.8 },
            h2h: {
                totalMatches: 8,
                homeWins: 6,
                draws: 0,
                awayWins: 2,
                homeAtHomeWins: 4,
                homeAtHomeDraws: 0,
                homeAtHomeLosses: 0,
                lastScore: "118 - 105",
                recentScores: ["118-105 (홈승)", "122-119 (홈승)", "113-107 (원정승)", "105-115 (패)"],
                avgH2HPts: 226.5
            },
            homeORtg: 121.5,
            awayORtg: 116.8,
            homeDRtg: 108.2,
            awayDRtg: 114.5,
            homePace: 98.4,
            awayPace: 100.2,
            fourFactorsHome: { eFG: 57.8, tov: 11.2, orb: 28.5, ftr: 22.4 },
            fourFactorsAway: { eFG: 54.2, tov: 13.8, orb: 24.1, ftr: 24.8 },
            restDaysHome: 2,
            restDaysAway: 1,
            eloHome: 1820,
            eloAway: 1690
        },
        betmanOdds: {
            homeWin: 1.40,
            awayWin: 2.85,
            handicapLine: -6.5,
            handicapHome: 1.88,
            handicapAway: 1.88,
            underOverLine: 228.5,
            over: 1.85,
            under: 1.87,
            sharpMarketOdds: { home: 1.35, away: 3.20 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "제이슨 테이텀", role: "에이스 포워드", status: "정상 출전" },
                { player: "제일런 브라운", role: "올스타 가드", status: "정상 출전" }
            ],
            awayInjuries: [
                { player: "데미안 릴라드", role: "주전 가드", status: "종아리 통증 출전 시간 제한" },
                { player: "크리스 미들턴", role: "3옵션 포워드", status: "결장 확정" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.15,
            tacticalAnalysis: "보스턴의 완벽한 5-Out 외곽 3점 공세. 밀워키는 백투백 피로와 미들턴 결장으로 핸디캡 패배 위기.",
            newsSummary: "보스턴 홈 34승 4패 극강. 마줄라 감독의 스페이싱으로 보스턴 핸디 승리 유력."
        }
    },
    {
        id: "bk-302",
        sport: "basketball",
        league: "KBL (한국 프로농구)",
        round: "프로토 승부식 35회차 70번",
        protoGameNo: 70,
        matchTime: "2026-08-23 16:00",
        matchStatus: "SCHEDULED",
        finalScore: null,
        resultSummary: "경기 전 (결과 대기)",
        homeTeam: "원주 DB 프로미",
        awayTeam: "부산 KCC 이지스",
        homeRank: 2,
        awayRank: 3,
        managerInfo: {
            homeManager: {
                name: "김주성",
                status: "ESTABLISHED",
                statusLabel: "트리플 포스트 높이 전술 완성 (+8%)",
                impactScore: 0.08,
                tacticalStyle: "골밑 높이 장악 & 알바노 빠른 트랜지션"
            },
            awayManager: {
                name: "전창진",
                status: "ESTABLISHED",
                statusLabel: "모션 오펜스 & 선수 개인기 극대화",
                impactScore: 0.02,
                tacticalStyle: "아이솔레이션 및 3점 런앤건"
            }
        },
        transferDynamics: {
            homeTransfer: {
                inflow: [{ name: "치나누 오누아쿠", pos: "외인 정통 센터", impact: "+14%" }],
                outflow: [],
                netScore: 0.14,
                summary: "오누아쿠 영입으로 골밑 리바운드 및 하이로우 게임 완성"
            },
            awayTransfer: {
                inflow: [],
                outflow: [],
                netScore: 0.00,
                summary: "기존 슈퍼팀 라인업 유지 중"
            }
        },
        quantMetrics: {
            pythagenpat: {
                runsFor: 89.2,
                runsAgainst: 81.5,
                games: 45,
                expectedWinRate: 76.5,
                actualWinRate: 78.5,
                luckResidual: "-2.0% (수비 지표 우수)"
            }
        },
        stats: {
            homeForm: ["W", "W", "L", "W", "W"],
            awayForm: ["W", "L", "W", "W", "L"],
            homeSplit: { wins: 22, losses: 6, winRate: 78.5, avgPtsFor: 89.2, avgPtsAgainst: 81.5 },
            awaySplit: { wins: 14, losses: 13, winRate: 51.8, avgPtsFor: 83.5, avgPtsAgainst: 84.1 },
            h2h: {
                totalMatches: 8,
                homeWins: 5,
                draws: 0,
                awayWins: 3,
                homeAtHomeWins: 3,
                homeAtHomeDraws: 0,
                homeAtHomeLosses: 1,
                lastScore: "88 - 84",
                recentScores: ["88-84 (홈승)", "92-82 (홈승)", "78-85 (패)", "86-81 (홈승)"],
                avgH2HPts: 172.5
            },
            homeORtg: 114.2,
            awayORtg: 112.5,
            homeDRtg: 106.8,
            awayDRtg: 110.1,
            homePace: 78.5,
            awayPace: 81.0,
            fourFactorsHome: { eFG: 55.4, tov: 12.0, orb: 32.5, ftr: 20.1 },
            fourFactorsAway: { eFG: 52.8, tov: 14.2, orb: 25.4, ftr: 21.5 },
            restDaysHome: 3,
            restDaysAway: 2,
            eloHome: 1610,
            eloAway: 1540
        },
        betmanOdds: {
            homeWin: 1.65,
            awayWin: 2.20,
            handicapLine: -3.5,
            handicapHome: 1.86,
            handicapAway: 1.90,
            underOverLine: 168.5,
            over: 1.88,
            under: 1.88,
            sharpMarketOdds: { home: 1.58, away: 2.38 }
        },
        nlpNews: {
            homeInjuries: [
                { player: "이선 알바노", role: "정규리그 MVP 가드", status: "정상 출전" }
            ],
            awayInjuries: [
                { player: "최준용", role: "핵심 포워드/수비 리바운드", status: "손가락 부상 결장" }
            ],
            homeImpactScore: 0.00,
            awayImpactScore: -0.12,
            tacticalAnalysis: "DB의 높이(오누아쿠-강상재-김종규)와 알바노 픽앤롤. KCC는 최준용 결장으로 골밑 리바운드에 치명적 약점.",
            newsSummary: "원주 DB의 오누아쿠 영입 효과와 KCC 높이 약점 공략. DB 승리 유력."
        }
    },

    // === 🏁 PAST SETTLED ROUND RESULTS ===
    {
        id: "past-3401",
        sport: "soccer",
        league: "EPL (잉글랜드 프리미어리그)",
        round: "프로토 34회차 11번 / 승무패 1번 (종료)",
        protoGameNo: 11,
        pastToto14MatchNo: 1,
        matchTime: "2026-08-20 04:00",
        matchStatus: "FINISHED",
        finalScore: "2 : 1",
        resultSummary: "종료 (아스널 홈승 적중)",
        homeTeam: "아스널",
        awayTeam: "울버햄튼",
        homeRank: 2,
        awayRank: 14,
        stats: {
            homeForm: ["W", "W", "W", "W", "W"],
            awayForm: ["L", "L", "D", "W", "L"],
            homeSplit: { wins: 12, draws: 2, losses: 1, winRate: 80.0 },
            awaySplit: { wins: 3, draws: 2, losses: 10, winRate: 20.0 },
            h2h: { homeWins: 4, draws: 0, awayWins: 1, lastScore: "2 - 1" },
            homeXG: 2.30,
            awayXG: 0.85
        },
        betmanOdds: {
            homeWin: 1.32,
            draw: 4.80,
            awayWin: 8.50,
            underOverLine: 2.5,
            over: 1.75,
            under: 1.95
        },
        aiPrediction: {
            pick: "아스널 승",
            odds: 1.32,
            isHit: true,
            reason: "홈 에미레이츠 무패 행진 및 사카 멀티골 적중"
        },
        nlpNews: {
            homeInjuries: [],
            awayInjuries: [{ player: "쿠냐", role: "공격수", status: "결장" }],
            newsSummary: "울버햄튼 핵심 쿠냐 결장으로 공격 전개 불가."
        }
    },
    {
        id: "past-3402",
        sport: "baseball",
        league: "KBO (한국 프로야구)",
        round: "프로토 승부식 34회차 25번 (종료)",
        protoGameNo: 25,
        matchTime: "2026-08-20 18:30",
        matchStatus: "FINISHED",
        finalScore: "6 : 3",
        resultSummary: "종료 (KIA 홈승 적중 / 8.5 오버)",
        homeTeam: "KIA 타이거즈",
        awayTeam: "NC 다이노스",
        homeRank: 1,
        awayRank: 8,
        stats: {
            homeForm: ["W", "W", "W", "L", "W"],
            awayForm: ["L", "L", "L", "W", "L"],
            homeSplit: { wins: 38, draws: 1, losses: 18, winRate: 67.8 },
            awaySplit: { wins: 22, draws: 1, losses: 32, winRate: 40.7 },
            h2h: { homeWins: 9, draws: 0, awayWins: 4, lastScore: "6 - 3" },
            homeStarter: "양현종 (ERA 3.55)",
            awayStarter: "신민혁 (ERA 4.80)"
        },
        betmanOdds: {
            homeWin: 1.55,
            awayWin: 2.45,
            underOverLine: 8.5,
            over: 1.82,
            under: 1.90
        },
        aiPrediction: {
            pick: "KIA 승",
            odds: 1.55,
            isHit: true,
            reason: "KIA 대호 타선 폭발 및 NC 불펜 붕괴"
        },
        nlpNews: {
            homeInjuries: [],
            awayInjuries: [{ player: "손아섭", role: "외야수", status: "결장" }],
            newsSummary: "손아섭 부상 이탈로 NC 테이블세터 출루율 급락."
        }
    }
];
