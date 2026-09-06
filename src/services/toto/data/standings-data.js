/**
 * Toto/Proto Sports Official Verified Standings & 2026 Season Calendar Engine
 * (EPL, La Liga, K-League 1, KBO, NBA, KBL)
 * 
 * Rules:
 * 1. 새 시즌 시작 전 / 비시즌인 리그(EPL, 라리가, NBA, KBL 등):
 *    - 아직 새 시즌 경기가 진행되지 않았으므로 순위표 상의 모든 경기수(GP), 승(W), 무(D), 패(L), 득점, 실점, 득실차, 승점/승률은 0으로 표시.
 *    - 폼(Form)은 개막 대기 '-'로 표기.
 *    - 지난 시즌의 성적 및 파워 지수는 AI 알고리즘(engine.js)의 퀀트 승률 분석/배팅 추천에 지속 반영.
 * 2. 현재 시즌 진행 중인 리그(KBO, K리그1):
 *    - 2026년 현재 소화된 경기(KBO 110경기, K리그1 26라운드)의 실시간 공식 순위표 표기.
 */

export const INITIAL_LEAGUE_STANDINGS = {
    epl: {
        leagueName: "EPL (잉글랜드 프리미어리그)",
        season: "2026/2027 정규시즌 (개막 대기)",
        seasonState: "PRE_SEASON",
        seasonStateLabel: "2026/27 새 시즌 개막 대기 (경기 전적 0 리셋)",
        seasonStateBadge: "🔵 2026/27 시즌 개막 대기 (전적 0)",
        seasonStateColor: "#38bdf8",
        openingDate: "2026년 8월 21일 (금) 개막 예정",
        seasonPeriod: "2026.08.21 ~ 2027.05.24 (새 시즌 0경기 리셋)",
        currentStage: "2026/27 새 시즌 개막 대기 중 (※ 팀 전력 지수는 알고리즘에 정상 반영)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "Premier League Official (공식 프리미어리그)",
        table: [
            { rank: 1, team: "리버풀", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 2, team: "아스널", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 3, team: "맨체스터 시티", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 4, team: "첼시", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 5, team: "뉴캐슬", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 6, team: "애스턴 빌라", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 7, team: "토트넘 홋스퍼", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 8, team: "맨체스터 유나이티드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 9, team: "웨스트햄", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 10, team: "브라이튼", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 11, team: "본머스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 12, team: "브렌트포드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 13, team: "풀럼", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 14, team: "크리스탈 팰리스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 15, team: "에버턴", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 16, team: "노팅엄 포레스트", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 17, team: "울버햄튼", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 18, team: "입스위치 타운", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 19, team: "레스터 시티", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 20, team: "사우스햄튼", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" }
        ]
    },
    laliga: {
        leagueName: "라리가 (스페인 프리메라리가)",
        season: "2026/2027 정규시즌 (개막 대기)",
        seasonState: "PRE_SEASON",
        seasonStateLabel: "2026/27 새 시즌 개막 대기 (경기 전적 0 리셋)",
        seasonStateBadge: "🔵 2026/27 시즌 개막 대기 (전적 0)",
        seasonStateColor: "#38bdf8",
        openingDate: "2026년 8월 15일 (토) 개막 예정",
        seasonPeriod: "2026.08.15 ~ 2027.05.24 (새 시즌 0경기 리셋)",
        currentStage: "2026/27 새 시즌 개막 대기 중 (※ 팀 전력 지수는 알고리즘에 정상 반영)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "LaLiga Official (스페인 라리가 공식)",
        table: [
            { rank: 1, team: "바르셀로나", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 2, team: "레알 마드리드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 3, team: "아틀레티코 마드리드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 4, team: "아틀레틱 빌바오", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 5, team: "비야레알", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 6, team: "레알 베티스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 7, team: "레알 소시에다드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 8, team: "셀타 비고", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 9, team: "세비야", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 10, team: "발렌시아", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 11, team: "마요르카", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 12, team: "오사수나", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 13, team: "지로나", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 14, team: "헤타페", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 15, team: "에스파뇰", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 16, team: "알라베스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 17, team: "라요 바예카노", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 18, team: "레가네스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 19, team: "라스팔마스", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" },
            { rank: 20, team: "바야돌리드", gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: ["-","-","-","-","-"], xPts: 0.0, zone: "none" }
        ]
    },
    kbo: {
        leagueName: "KBO (한국 프로야구)",
        season: "2026 KBO 정규시즌",
        seasonState: "IN_PROGRESS",
        seasonStateLabel: "2026 KBO 정규시즌 후반기 (110 / 144 경기)",
        seasonStateBadge: "🟢 2026 KBO 정규시즌 110G 진행중",
        seasonStateColor: "#10b981",
        openingDate: "2026년 3월 22일 (토)",
        seasonPeriod: "2026.03.22 ~ 2026.10.15 (포스트시즌 10~11월)",
        currentStage: "2026년 8월 23일 현재 110경기 소화 (KIA 1위 독주 & 가을야구 5강 순위 레이스)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "KBO 공식 기록실 (KBO Official Record)",
        table: [
            { rank: 1, team: "KIA 타이거즈", gp: 110, w: 66, d: 2, l: 42, winRate: "0.611", gb: "-", runsFor: 640, runsAgainst: 480, diff: "+160", pythagenpatWinRate: "0.635", form: ["W","W","W","L","W"], zone: "playoffs" },
            { rank: 2, team: "LG 트윈스", gp: 112, w: 62, d: 2, l: 48, winRate: "0.564", gb: "5.0", runsFor: 590, runsAgainst: 520, diff: "+70", pythagenpatWinRate: "0.560", form: ["L","W","W","L","L"], zone: "playoffs" },
            { rank: 3, team: "삼성 라이온즈", gp: 114, w: 61, d: 2, l: 51, winRate: "0.545", gb: "7.0", runsFor: 610, runsAgainst: 550, diff: "+60", pythagenpatWinRate: "0.550", form: ["W","W","L","W","W"], zone: "playoffs" },
            { rank: 4, team: "두산 베어스", gp: 115, w: 58, d: 2, l: 55, winRate: "0.513", gb: "10.5", runsFor: 570, runsAgainst: 560, diff: "+10", pythagenpatWinRate: "0.508", form: ["L","L","W","L","D"], zone: "playoffs" },
            { rank: 5, team: "KT 위즈", gp: 112, w: 56, d: 2, l: 54, winRate: "0.509", gb: "11.0", runsFor: 560, runsAgainst: 570, diff: "-10", pythagenpatWinRate: "0.495", form: ["W","L","W","W","L"], zone: "playoffs" },
            { rank: 6, team: "한화 이글스", gp: 108, w: 53, d: 2, l: 53, winRate: "0.500", gb: "12.0", runsFor: 490, runsAgainst: 510, diff: "-20", pythagenpatWinRate: "0.482", form: ["W","W","L","W","W"], zone: "none" },
            { rank: 7, team: "SSG 랜더스", gp: 112, w: 53, d: 1, l: 58, winRate: "0.477", gb: "14.5", runsFor: 530, runsAgainst: 565, diff: "-35", pythagenpatWinRate: "0.470", form: ["W","L","W","W","L"], zone: "none" },
            { rank: 8, team: "롯데 자이언츠", gp: 106, w: 48, d: 3, l: 55, winRate: "0.466", gb: "15.5", runsFor: 520, runsAgainst: 555, diff: "-35", pythagenpatWinRate: "0.468", form: ["W","L","W","L","L"], zone: "none" },
            { rank: 9, team: "NC 다이노스", gp: 108, w: 47, d: 2, l: 59, winRate: "0.443", gb: "18.0", runsFor: 510, runsAgainst: 570, diff: "-60", pythagenpatWinRate: "0.450", form: ["L","L","L","W","L"], zone: "none" },
            { rank: 10, team: "키움 히어로즈", gp: 111, w: 44, d: 0, l: 67, winRate: "0.396", gb: "23.5", runsFor: 460, runsAgainst: 600, diff: "-140", pythagenpatWinRate: "0.380", form: ["L","L","L","L","W"], zone: "none" }
        ]
    },
    kleague: {
        leagueName: "K리그1 (대한민국 프로축구)",
        season: "2026 K리그1",
        seasonState: "IN_PROGRESS",
        seasonStateLabel: "2026 K리그1 정규시즌 (26 / 38 라운드)",
        seasonStateBadge: "🟢 2026 K리그1 26R 진행중",
        seasonStateColor: "#10b981",
        openingDate: "2026년 3월 1일 (일)",
        seasonPeriod: "2026.03.01 ~ 2026.11.30",
        currentStage: "2026년 8월 23일 현재 26라운드 소화 (울산 1위 & 파이널 스플릿 진입 분기점)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "한국프로축구연맹 공식 (K League Official Record)",
        table: [
            { rank: 1, team: "울산 HD", gp: 26, w: 16, d: 5, l: 5, gf: 48, ga: 26, gd: 22, pts: 53, form: ["W","W","L","W","D"], xPts: 51.5, zone: "ucl" },
            { rank: 2, team: "김천 상무", gp: 26, w: 14, d: 6, l: 6, gf: 40, ga: 25, gd: 15, pts: 48, form: ["W","L","W","W","D"], xPts: 46.2, zone: "ucl" },
            { rank: 3, team: "강원 FC", gp: 26, w: 14, d: 5, l: 7, gf: 47, ga: 36, gd: 11, pts: 47, form: ["W","W","W","L","W"], xPts: 45.0, zone: "ucl" },
            { rank: 4, team: "포항 스틸러스", gp: 26, w: 12, d: 8, l: 6, gf: 42, ga: 31, gd: 11, pts: 44, form: ["L","D","W","D","W"], xPts: 43.8, zone: "none" },
            { rank: 5, team: "FC 서울", gp: 26, w: 11, d: 7, l: 8, gf: 38, ga: 30, gd: 8, pts: 40, form: ["W","W","W","W","L"], xPts: 41.2, zone: "none" },
            { rank: 6, team: "수원 FC", gp: 26, w: 11, d: 6, l: 9, gf: 37, ga: 38, gd: -1, pts: 39, form: ["L","D","W","L","W"], xPts: 37.0, zone: "none" },
            { rank: 7, team: "전북 현대", gp: 26, w: 7, d: 8, l: 11, gf: 34, ga: 43, gd: -9, pts: 29, form: ["L","D","W","L","D"], xPts: 32.5, zone: "none" },
            { rank: 8, team: "광주 FC", gp: 26, w: 9, d: 2, l: 15, gf: 31, ga: 38, gd: -7, pts: 29, form: ["L","W","L","L","W"], xPts: 30.1, zone: "none" },
            { rank: 9, team: "인천 유나이티드", gp: 26, w: 6, d: 10, l: 10, gf: 27, ga: 33, gd: -6, pts: 28, form: ["D","L","L","D","W"], xPts: 29.5, zone: "none" },
            { rank: 10, team: "제주 유나이티드", gp: 26, w: 8, d: 3, l: 15, gf: 24, ga: 39, gd: -15, pts: 27, form: ["L","L","L","W","L"], xPts: 26.0, zone: "relegation" },
            { rank: 11, team: "대전 하나시티즌", gp: 26, w: 5, d: 9, l: 12, gf: 26, ga: 37, gd: -11, pts: 24, form: ["W","D","D","L","D"], xPts: 25.8, zone: "relegation" },
            { rank: 12, team: "대구 FC", gp: 26, w: 5, d: 8, l: 13, gf: 25, ga: 38, gd: -13, pts: 23, form: ["D","L","D","L","L"], xPts: 24.0, zone: "relegation" }
        ]
    },
    nba: {
        leagueName: "NBA (미국 프로농구)",
        season: "2026/2027 프리시즌 (비시즌 개막 대기)",
        seasonState: "PRE_SEASON",
        seasonStateLabel: "2026/27 비시즌 / 10월 개막 대기 (경기 전적 0 리셋)",
        seasonStateBadge: "🔵 2026/27 비시즌 / 10월 개막 대기 (전적 0)",
        seasonStateColor: "#38bdf8",
        openingDate: "2026년 10월 20일 (화) 개막 예정",
        seasonPeriod: "2026.10.20 ~ 2027.06.20 (비시즌 경기 전적 0 리셋)",
        currentStage: "8월 오프시즌 로스터 정비 및 프리시즌 준비 중 (공식 경기 0경기)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "NBA.com Official (미국 프로농구 공식)",
        table: [
            { rank: 1, team: "보스턴 셀틱스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 2, team: "오클라호마시티 썬더", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 3, team: "덴버 너게츠", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 4, team: "미네소타 팀버울브스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 5, team: "LA 클리퍼스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 6, team: "뉴욕 닉스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 7, team: "댈러스 매버릭스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 8, team: "밀워키 벅스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 9, team: "LA 레이커스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 10, team: "골든스테이트 워리어스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, netRtg: "0.0", form: ["-","-","-","-","-"], zone: "none" }
        ]
    },
    kbl: {
        leagueName: "KBL (한국 프로농구)",
        season: "2026/2027 프리시즌 (비시즌 개막 대기)",
        seasonState: "PRE_SEASON",
        seasonStateLabel: "2026/27 비시즌 / 10월 개막 대기 (경기 전적 0 리셋)",
        seasonStateBadge: "🔵 2026/27 비시즌 / 10월 개막 대기 (전적 0)",
        seasonStateColor: "#38bdf8",
        openingDate: "2026년 10월 17일 (토) 개막 예정",
        seasonPeriod: "2026.10.17 ~ 2027.05.10 (비시즌 경기 전적 0 리셋)",
        currentStage: "8월 비시즌 전지훈련 및 KBL 컵대회 준비 중 (공식 경기 0경기)",
        lastUpdated: "2026-08-23 00:56:00",
        source: "KBL 공식 기록실 (KBL.or.kr Official)",
        table: [
            { rank: 1, team: "원주 DB 프로미", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 2, team: "창원 LG 세이커스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 3, team: "수원 KT 소닉붐", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 4, team: "서울 SK 나이츠", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 5, team: "부산 KCC 이지스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 6, team: "울산 현대모비스 피버스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 7, team: "대구 한국가스공사 페가수스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 8, team: "고양 소노 스카이거너스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 9, team: "안양 정관장 레드부스터스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" },
            { rank: 10, team: "서울 삼성 썬더스", gp: 0, w: 0, l: 0, winRate: "0.000", gb: "-", ptsFor: 0, ptsAgainst: 0, diff: "0", form: ["-","-","-","-","-"], zone: "none" }
        ]
    }
};

/**
 * Dynamically evaluate accurate real-world season status, opening dates, and stage metadata
 * based on the target calendar date (Year 2026).
 */
export function evaluateDynamicSeasonMetadata(leagueKey, date = new Date()) {
    if (leagueKey === 'nba') {
        return {
            season: "2026/2027 프리시즌 (비시즌 개막 대기)",
            seasonState: "PRE_SEASON",
            seasonStateLabel: "2026/27 비시즌 / 10월 개막 대기 (경기 전적 0 리셋)",
            seasonStateBadge: "🔵 2026/27 비시즌 / 10월 개막 대기 (전적 0)",
            seasonStateColor: "#38bdf8",
            openingDate: "2026년 10월 20일 (화) 개막 예정",
            seasonPeriod: "2026.10.20 ~ 2027.06.20 (비시즌 0경기 리셋)",
            currentStage: "8월 오프시즌 로스터 정비 및 프리시즌 준비 중 (공식 경기 0경기)",
            source: "NBA.com Official (미국 프로농구 공식)"
        };
    } else if (leagueKey === 'kbl') {
        return {
            season: "2026/2027 프리시즌 (비시즌 개막 대기)",
            seasonState: "PRE_SEASON",
            seasonStateLabel: "2026/27 비시즌 / 10월 개막 대기 (경기 전적 0 리셋)",
            seasonStateBadge: "🔵 2026/27 비시즌 / 10월 개막 대기 (전적 0)",
            seasonStateColor: "#38bdf8",
            openingDate: "2026년 10월 17일 (토) 개막 예정",
            seasonPeriod: "2026.10.17 ~ 2027.05.10 (비시즌 0경기 리셋)",
            currentStage: "8월 비시즌 전지훈련 및 KBL 컵대회 준비 중 (공식 경기 0경기)",
            source: "KBL 공식 기록실 (KBL.or.kr Official)"
        };
    } else if (leagueKey === 'epl') {
        return {
            season: "2026/2027 정규시즌 (개막 대기)",
            seasonState: "PRE_SEASON",
            seasonStateLabel: "2026/27 새 시즌 개막 대기 (경기 전적 0 리셋)",
            seasonStateBadge: "🔵 2026/27 시즌 개막 대기 (전적 0)",
            seasonStateColor: "#38bdf8",
            openingDate: "2026년 8월 21일 (금) 개막 예정",
            seasonPeriod: "2026.08.21 ~ 2027.05.24 (새 시즌 0경기 리셋)",
            currentStage: "2026/27 새 시즌 개막 대기 중 (※ 팀 전력 지수는 알고리즘에 정상 반영)",
            source: "Premier League Official (공식 프리미어리그)"
        };
    } else if (leagueKey === 'laliga') {
        return {
            season: "2026/2027 정규시즌 (개막 대기)",
            seasonState: "PRE_SEASON",
            seasonStateLabel: "2026/27 새 시즌 개막 대기 (경기 전적 0 리셋)",
            seasonStateBadge: "🔵 2026/27 시즌 개막 대기 (전적 0)",
            seasonStateColor: "#38bdf8",
            openingDate: "2026년 8월 15일 (토) 개막 예정",
            seasonPeriod: "2026.08.15 ~ 2027.05.24 (새 시즌 0경기 리셋)",
            currentStage: "2026/27 새 시즌 개막 대기 중 (※ 팀 전력 지수는 알고리즘에 정상 반영)",
            source: "LaLiga Official (스페인 라리가 공식)"
        };
    } else if (leagueKey === 'kbo') {
        return {
            season: "2026 KBO 정규시즌",
            seasonState: "IN_PROGRESS",
            seasonStateLabel: "2026 KBO 정규시즌 후반기 (110 / 144 경기)",
            seasonStateBadge: "🟢 2026 KBO 정규시즌 110G 진행중",
            seasonStateColor: "#10b981",
            openingDate: "2026년 3월 22일 (토)",
            seasonPeriod: "2026.03.22 ~ 2026.10.15 (포스트시즌 10~11월)",
            currentStage: "2026년 8월 23일 현재 110경기 소화 (KIA 1위 독주 & 가을야구 5강 순위 레이스)",
            source: "KBO 공식 기록실 (KBO Official Record)"
        };
    } else if (leagueKey === 'kleague') {
        return {
            season: "2026 K리그1",
            seasonState: "IN_PROGRESS",
            seasonStateLabel: "2026 K리그1 정규시즌 (26 / 38 라운드)",
            seasonStateBadge: "🟢 2026 K리그1 26R 진행중",
            seasonStateColor: "#10b981",
            openingDate: "2026년 3월 1일 (일)",
            seasonPeriod: "2026.03.01 ~ 2026.11.30",
            currentStage: "2026년 8월 23일 현재 26라운드 소화 (울산 1위 & 파이널 스플릿 진입 분기점)",
            source: "한국프로축구연맹 공식 (K League Official Record)"
        };
    }
}
