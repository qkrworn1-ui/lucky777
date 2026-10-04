/**
 * 🔮 MyeongriService: 사주명리학 기반 개인 맞춤형 로또 구매 길일 & 길시 분석 엔진
 * 
 * [설계 원칙 - Zero Interference Guarantee]
 * 1. 기존 7대 알고리즘 및 번호 생성 로직과 100% 완전 분리된 독립 어드바이저 모듈입니다.
 * 2. 천문학적 만세력 일간(日干) 도출, 아극재(我剋財) 재물 오행, 칠요(七曜) 매핑, 진태양시 30분 보정 길시(吉時)를 산출합니다.
 */

// 10천간 (Heavenly Stems)
const HEAVENLY_STEMS = [
    {
        gan: '갑(甲)',
        hanja: '甲',
        name: '갑목 (甲木)',
        element: 'wood',
        elementKo: '목 (木, 나무)',
        desc: '푸른 거목(巨木)의 기운',
        nature: '진취적이고 우직하며 뻗어나가는 생명력',
        wealthElement: 'earth',
        wealthElementKo: '토 (土, 흙)',
        wealthPrinciple: '목극토(木剋土) - 대지를 개척하여 풍요로운 수확을 거두는 형국',
        primaryDay: '토요일 (土, 토 기운)',
        primaryDayShort: '토요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '화요일, 일요일 (火, 화 기운)',
        secondaryDayShort: '화·일요일',
        secondaryDayDesc: '식상생재 (목생화-화생토 행동력·활력 부여)',
        luckyColor: '골드 / 옐로우 / 브라운',
        colorHex: '#f59e0b',
        timeSlot1: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot1Desc: '토요일 마감 직전 집중 구매 길시',
        timeSlot2: '신시 (申時) 15:30 ~ 17:30',
        timeSlot2Desc: '오후 안정적 기운 집중',
        advice: '이번 주는 토요일 오후 5시 30분 이후 판매점 방문 또는 온라인 구매를 권장합니다. 노란색이나 골드 계열의 소품을 지니시면 재물운이 안정적으로 안착됩니다.'
    },
    {
        gan: '을(乙)',
        hanja: '乙',
        name: '을목 (乙木)',
        element: 'wood',
        elementKo: '목 (木, 나무)',
        desc: '유연한 초목(草木)의 기운',
        nature: '적응력이 뛰어나고 유연하며 생명력이 끈질긴 기운',
        wealthElement: 'earth',
        wealthElementKo: '토 (土, 흙)',
        wealthPrinciple: '목극토(木剋土) - 유연한 지혜로 흙에 뿌리를 내려 알짜 재물을 취함',
        primaryDay: '토요일 (土, 토 기운)',
        primaryDayShort: '토요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '화요일, 일요일 (火, 화 기운)',
        secondaryDayShort: '화·일요일',
        secondaryDayDesc: '식상생재 (유연한 발상과 기회 포착)',
        luckyColor: '브라운 / 황금색 / 카키',
        colorHex: '#d97706',
        timeSlot1: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot1Desc: '토요일 마감 직전 집중 구매 길시',
        timeSlot2: '오시 (午時) 11:30 ~ 13:30',
        timeSlot2Desc: '점심시간 활력 기운 결합',
        advice: '주말 토요일 오후 시간대에 조용하고 편안한 마음으로 구매하시는 것이 좋습니다. 브라운 톤의 패션이나 아이템이 기운의 중심을 잡아줍니다.'
    },
    {
        gan: '병(丙)',
        hanja: '丙',
        name: '병화 (丙火)',
        element: 'fire',
        elementKo: '화 (火, 불)',
        desc: '태양(太陽)의 맹렬한 기운',
        nature: '밝고 열정적이며 만물을 비추는 폭발적인 추진력',
        wealthElement: 'metal',
        wealthElementKo: '금 (金, 쇠/보석)',
        wealthPrinciple: '화극금(火剋金) - 뜨거운 열정으로 금광석을 제련하여 황금을 빚어내는 형국',
        primaryDay: '금요일 (金, 금 기운)',
        primaryDayShort: '금요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '토요일 (土, 토 기운)',
        secondaryDayShort: '토요일',
        secondaryDayDesc: '화생토-토생금 (재물 창고 형성 및 결실)',
        luckyColor: '화이트 / 실버 / 골드',
        colorHex: '#e2e8f0',
        timeSlot1: '신시 (申時) 15:30 ~ 17:30',
        timeSlot1Desc: '금 기운(申)이 왕성해지는 골든 아워',
        timeSlot2: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot2Desc: '정밀한 재물 결실의 시간대',
        advice: '금요일 퇴근길이나 토요일 오후 신시(15:30~17:30)에 복권을 장만해 보세요. 밝은 흰색이나 메탈릭 실버 악세사리가 금전운을 배가합니다.'
    },
    {
        gan: '정(丁)',
        hanja: '丁',
        name: '정화 (丁火)',
        element: 'fire',
        elementKo: '화 (火, 불)',
        desc: '따뜻한 등불(燈火)의 기운',
        nature: '은근하고 섬세하며 어둠 속에서 빛을 밝히는 통찰력',
        wealthElement: 'metal',
        wealthElementKo: '금 (金, 쇠/보석)',
        wealthPrinciple: '화극금(火剋金) - 정밀한 직관과 집중력으로 값진 보석을 조각하는 형국',
        primaryDay: '금요일 (金, 금 기운)',
        primaryDayShort: '금요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '토요일 (土, 토 기운)',
        secondaryDayShort: '토요일',
        secondaryDayDesc: '화생토 (안정적인 재물 저장고 확장)',
        luckyColor: '실버 / 화이트 / 로즈골드',
        colorHex: '#f1f5f9',
        timeSlot1: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot1Desc: '보석(酉)의 정밀한 결실 길시',
        timeSlot2: '사시 (巳時) 09:30 ~ 11:30',
        timeSlot2Desc: '오전 직관적 기운 집중 시간대',
        advice: '금요일 저녁이나 토요일 마감 직전 차분한 분위기에서 구매해 보세요. 은빛 메탈 시계나 실버 소품이 예리한 행운을 가져다줍니다.'
    },
    {
        gan: '무(戊)',
        hanja: '戊',
        name: '무토 (戊土)',
        element: 'earth',
        elementKo: '토 (土, 흙)',
        desc: '광활한 대지(大地)의 기운',
        nature: '듬직하고 포용력이 깊으며 신뢰와 안정을 중시하는 기운',
        wealthElement: 'water',
        wealthElementKo: '수 (水, 물)',
        wealthPrinciple: '토극수(土剋水) - 드넓은 대지가 거대한 강물을 가두어 댐을 이루는 형국',
        primaryDay: '수요일 (水, 수 기운)',
        primaryDayShort: '수요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '금요일 (金, 금 기운)',
        secondaryDayShort: '금요일',
        secondaryDayDesc: '토생금-금생수 (식상생재 유통 자금 촉진)',
        luckyColor: '블루 / 네이비 / 블랙',
        colorHex: '#3b82f6',
        timeSlot1: '자시 또는 해시 (야간) / 유시 17:30 ~ 19:30',
        timeSlot1Desc: '유동성 수(水) 기운 결합 길시',
        timeSlot2: '신시 (申時) 15:30 ~ 17:30',
        timeSlot2Desc: '금생수로 자금이 흘러드는 시간대',
        advice: '수요일이나 금요일 오후에 구매 계획을 세우시고 미리 번호를 준비해 보세요. 푸른색 또는 네이비 계열의 아이템이 막힌 유동성을 틔워줍니다.'
    },
    {
        gan: '기(己)',
        hanja: '己',
        name: '기토 (己土)',
        element: 'earth',
        elementKo: '토 (土, 흙)',
        desc: '비옥한 전원(田園)의 기운',
        nature: '온화하고 실속이 있으며 곡식을 길러내는 생산적인 기운',
        wealthElement: 'water',
        wealthElementKo: '수 (水, 물)',
        wealthPrinciple: '토극수(土剋水) - 기름진 땅이 촉촉한 수분을 흡수하여 알찬 결실을 맺음',
        primaryDay: '수요일 (水, 수 기운)',
        primaryDayShort: '수요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '금요일 (金, 금 기운)',
        secondaryDayShort: '금요일',
        secondaryDayDesc: '토생금 (실속 있는 재무 계획 수립)',
        luckyColor: '네이비 / 딥블루 / 그레이',
        colorHex: '#2563eb',
        timeSlot1: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot1Desc: '토요일 마감 전 최적의 결실 길시',
        timeSlot2: '오시 (午時) 11:30 ~ 13:30',
        timeSlot2Desc: '대지가 온기를 받는 낮 시간대',
        advice: '수요일 구매 또는 토요일 늦은 오후 구매가 가장 길합니다. 짙은 네이비 셔츠나 지갑을 활용하시면 실속 있는 재물운을 불러옵니다.'
    },
    {
        gan: '경(庚)',
        hanja: '庚',
        name: '경금 (庚金)',
        element: 'metal',
        elementKo: '금 (金, 쇠)',
        desc: '단단한 무쇠(鐵)의 기운',
        nature: '결단력이 확고하고 정의로우며 예리한 판단력을 지닌 기운',
        wealthElement: 'wood',
        wealthElementKo: '목 (木, 나무)',
        wealthPrinciple: '금극목(金剋木) - 예리한 도끼로 거목을 다듬어 훌륭한 재목과 보물을 만듦',
        primaryDay: '목요일, 월요일 (木, 목 기운)',
        primaryDayShort: '목·월요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '수요일 (水, 수 기운)',
        secondaryDayShort: '수요일',
        secondaryDayDesc: '금생수-수생목 (유연한 활동력 배가)',
        luckyColor: '그린 / 에메랄드 / 포레스트',
        colorHex: '#10b981',
        timeSlot1: '신시 (申時) 15:30 ~ 17:30',
        timeSlot1Desc: '본원의 힘이 결단력을 굳히는 시간',
        timeSlot2: '사시 (巳時) 09:30 ~ 11:30',
        timeSlot2Desc: '오전 맑은 직관이 열리는 시간대',
        advice: '목요일 퇴근길이나 월요일 주초에 일찌감치 구매하시는 것이 유리합니다. 초록빛이나 자연 식물 소품이 재물 횡재수를 견고히 돕습니다.'
    },
    {
        gan: '신(辛)',
        hanja: '辛',
        name: '신금 (辛金)',
        element: 'metal',
        elementKo: '금 (金, 보석)',
        desc: '정밀한 보석(珠玉)의 기운',
        nature: '섬세하고 영민하며 완벽한 완성도를 추구하는 귀한 기운',
        wealthElement: 'wood',
        wealthElementKo: '목 (木, 나무)',
        wealthPrinciple: '금극목(金剋木) - 정밀한 세공 기술로 값비싼 조각품을 완성해내는 형국',
        primaryDay: '목요일, 월요일 (木, 목 기운)',
        primaryDayShort: '목·월요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '수요일 (水, 수 기운)',
        secondaryDayShort: '수요일',
        secondaryDayDesc: '금생수 (맑은 영감과 직관 극대화)',
        luckyColor: '라이트그린 / 민트 / 에메랄드',
        colorHex: '#059669',
        timeSlot1: '유시 (酉時) 17:30 ~ 19:30',
        timeSlot1Desc: '보석의 광채가 완성되는 시간대',
        timeSlot2: '오시 (午時) 11:30 ~ 13:30',
        timeSlot2Desc: '온기가 보석을 빛내는 시간대',
        advice: '목요일 오후나 수요일에 구매 결정을 내리시면 좋습니다. 산뜻한 민트나 에메랄드 컬러의 포인트 소품이 행운의 파동을 끌어당깁니다.'
    },
    {
        gan: '임(壬)',
        hanja: '壬',
        name: '임수 (壬水)',
        element: 'water',
        elementKo: '수 (水, 물)',
        desc: '깊은 바다(大河)의 기운',
        nature: '지혜가 깊고 포용력이 크며 거대한 자금 흐름을 다루는 기운',
        wealthElement: 'fire',
        wealthElementKo: '화 (火, 불)',
        wealthPrinciple: '수극화(水剋火) - 깊고 지혜로운 바다가 폭발적인 태양의 불길을 다스리는 형국',
        primaryDay: '화요일, 일요일 (火, 화 기운)',
        primaryDayShort: '화·일요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '목요일, 월요일 (木, 목 기운)',
        secondaryDayShort: '목·월요일',
        secondaryDayDesc: '수생목-목생화 (기회 창출 및 행동화)',
        luckyColor: '레드 / 오렌지 / 와인',
        colorHex: '#ef4444',
        timeSlot1: '사시 (巳時) 09:30 ~ 11:30',
        timeSlot1Desc: '화(火) 기운이 발산되는 활력 길시',
        timeSlot2: '오시 (午時) 11:30 ~ 13:30',
        timeSlot2Desc: '태양이 남중하는 강력한 화기 시간',
        advice: '화요일 점심시간이나 일요일에 미리 번호를 구매하시는 것이 궁합상 뛰어납니다. 붉은색이나 따뜻한 오렌지 계열의 컬러가 폭발적인 횡재수를 자극합니다.'
    },
    {
        gan: '계(癸)',
        hanja: '癸',
        name: '계수 (癸水)',
        element: 'water',
        elementKo: '수 (水, 물)',
        desc: '촉촉한 이슬(雨露)의 기운',
        nature: '유연하고 감수성이 풍부하며 스며들듯 기회를 포착하는 지혜',
        wealthElement: 'fire',
        wealthElementKo: '화 (火, 불)',
        wealthPrinciple: '수극화(水剋火) - 촉촉한 이슬이 빛을 받아 영롱한 무지개를 피워내는 형국',
        primaryDay: '화요일, 일요일 (火, 화 기운)',
        primaryDayShort: '화·일요일',
        primaryDayDesc: '재물운 직접 발현 (아극재)',
        secondaryDay: '목요일, 월요일 (木, 목 기운)',
        secondaryDayShort: '목·월요일',
        secondaryDayDesc: '수생목 (새싹을 틔워 결실로 연결)',
        luckyColor: '코랄 / 핑크 / 버건디',
        colorHex: '#f43f5e',
        timeSlot1: '오시 (午時) 11:30 ~ 13:30',
        timeSlot1Desc: '따스한 태양빛과 조화를 이루는 길시',
        timeSlot2: '신시 (申時) 15:30 ~ 17:30',
        timeSlot2Desc: '금생수로 근원적 힘을 보충하는 시간',
        advice: '화요일 낮 시간대나 주말에 가벼운 마음으로 구매해 보세요. 밝은 핑크나 코랄빛의 소품이 부드러운 행운의 기운을 유도합니다.'
    }
];

// 기준일 Anchor Date: 1900-01-31 (양력 1900년 1월 31일 = 갑진(甲辰)일)
const ANCHOR_DATE = new Date('1900-01-31T00:00:00Z');

export const MyeongriService = {
    /**
     * 생년월일 문자열(YYYY-MM-DD)을 기반으로 천간(일간) 인덱스(0~9)를 도출
     */
    calcDayGanIndex(birthDateInput) {
        if (!birthDateInput) return null;
        try {
            let dt;
            if (typeof birthDateInput === 'string') {
                const parts = birthDateInput.trim().split('-');
                if (parts.length === 3) {
                    const y = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10) - 1;
                    const d = parseInt(parts[2], 10);
                    dt = new Date(Date.UTC(y, m, d));
                } else {
                    dt = new Date(birthDateInput);
                }
            } else if (birthDateInput instanceof Date) {
                dt = new Date(Date.UTC(birthDateInput.getFullYear(), birthDateInput.getMonth(), birthDateInput.getDate()));
            }

            if (!dt || isNaN(dt.getTime())) return null;

            const diffMs = dt.getTime() - ANCHOR_DATE.getTime();
            const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
            return ((diffDays % 10) + 10) % 10;
        } catch(e) {
            console.error('[MyeongriService] calcDayGanIndex error:', e);
            return null;
        }
    },

    /**
     * 생년월일을 기반으로 종합 명리학 프로필 및 길일/길시 분석 객체 반환
     */
    calculateMyeongriProfile(birthDateStr, options = {}) {
        if (!birthDateStr) return null;
        const ganIdx = this.calcDayGanIndex(birthDateStr);
        if (ganIdx === null || ganIdx < 0 || ganIdx >= HEAVENLY_STEMS.length) {
            return null;
        }

        const stem = HEAVENLY_STEMS[ganIdx];
        const calendarType = options.calendarType || 'solar';
        const birthHour = options.birthHour || 'unknown';

        // 횡재수 점수 (92 ~ 98점 범위의 격려형 스코어)
        const dateHash = (String(birthDateStr).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + (options.currentRound || 1239)) % 7;
        const fortuneScore = 92 + dateHash;

        return {
            birthDate: birthDateStr,
            calendarType: calendarType,
            birthHour: birthHour,
            ganIndex: ganIdx,
            stem: stem,
            fortuneScore: fortuneScore,
            starRating: fortuneScore >= 96 ? '★★★★★' : '★★★★☆',
            calculatedAt: new Date().toISOString()
        };
    }
};

if (typeof window !== 'undefined') {
    window.MyeongriService = MyeongriService;
}

