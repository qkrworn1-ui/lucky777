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

// 12지지 (Earthly Branches)
const EARTHLY_BRANCHES = [
    { ji: '자(子)', hanja: '子', animal: '쥐', element: 'water', elementKo: '수 (水)' },
    { ji: '축(丑)', hanja: '丑', animal: '소', element: 'earth', elementKo: '토 (土)' },
    { ji: '인(寅)', hanja: '寅', animal: '호랑이', element: 'wood', elementKo: '목 (木)' },
    { ji: '묘(卯)', hanja: '卯', animal: '토끼', element: 'wood', elementKo: '목 (木)' },
    { ji: '진(辰)', hanja: '辰', animal: '용', element: 'earth', elementKo: '토 (土)' },
    { ji: '사(巳)', hanja: '巳', animal: '뱀', element: 'fire', elementKo: '화 (火)' },
    { ji: '오(午)', hanja: '午', animal: '말', element: 'fire', elementKo: '화 (火)' },
    { ji: '미(未)', hanja: '未', animal: '양', element: 'earth', elementKo: '토 (土)' },
    { ji: '신(申)', hanja: '申', animal: '원숭이', element: 'metal', elementKo: '금 (金)' },
    { ji: '유(酉)', hanja: '酉', animal: '닭', element: 'metal', elementKo: '금 (金)' },
    { ji: '술(戌)', hanja: '戌', animal: '개', element: 'earth', elementKo: '토 (土)' },
    { ji: '해(亥)', hanja: '亥', animal: '돼지', element: 'water', elementKo: '수 (水)' }
];

// 천간 오행 인덱스: 0:목, 1:화, 2:토, 3:금, 4:수
const STEM_ELEMENT_INDEX = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];

// 지지 오행 인덱스: 자(4), 축(2), 인(0), 묘(0), 진(2), 사(1), 오(1), 미(2), 신(3), 유(3), 술(2), 해(4)
const BRANCH_ELEMENT_INDEX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];

// 요일(0:일 ~ 6:토) 동양 칠요(七曜) 오행 매핑
const WEEKDAY_ELEMENT_INDEX = [1, 0, 1, 4, 0, 3, 2];
const WEEKDAY_NAMES_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

// 천을귀인(天乙貴人) 지지 매핑
const NOBLEMAN_BRANCHES = [
    [1, 7],   // 0: 갑 -> 축, 미
    [0, 8],   // 1: 을 -> 자, 신
    [11, 9],  // 2: 병 -> 해, 유
    [11, 9],  // 3: 정 -> 해, 유
    [1, 7],   // 4: 무 -> 축, 미
    [0, 8],   // 5: 기 -> 자, 신
    [1, 7],   // 6: 경 -> 축, 미
    [2, 6],   // 7: 신 -> 인, 오
    [5, 3],   // 8: 임 -> 사, 묘
    [5, 3]    // 9: 계 -> 사, 묘
];

const STEM_NAMES_SHORT = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const STEM_NAMES_HANJA = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCH_NAMES_SHORT = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];
const BRANCH_NAMES_HANJA = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 진태양시 30분 보정 적용 12시진 시간대 정의 (표준시 기준)
const TWELVE_HOURS = [
    { jiIdx: 0, name: '자시 (子時)', range: '23:30 ~ 01:30' },
    { jiIdx: 1, name: '축시 (丑時)', range: '01:30 ~ 03:30' },
    { jiIdx: 2, name: '인시 (寅時)', range: '03:30 ~ 05:30' },
    { jiIdx: 3, name: '묘시 (卯時)', range: '05:30 ~ 07:30' },
    { jiIdx: 4, name: '진시 (辰時)', range: '07:30 ~ 09:30' },
    { jiIdx: 5, name: '사시 (巳時)', range: '09:30 ~ 11:30' },
    { jiIdx: 6, name: '오시 (午時)', range: '11:30 ~ 13:30' },
    { jiIdx: 7, name: '미시 (未時)', range: '13:30 ~ 15:30' },
    { jiIdx: 8, name: '신시 (申時)', range: '15:30 ~ 17:30' },
    { jiIdx: 9, name: '유시 (酉時)', range: '17:30 ~ 19:30' },
    { jiIdx: 10, name: '술시 (戌時)', range: '19:30 ~ 21:30' },
    { jiIdx: 11, name: '해시 (亥時)', range: '21:30 ~ 23:30' }
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
     * 특정 회차(targetRound)의 주간 7일(일~토)을 사주명리학(십신·천을귀인·천간합·칠요)으로 정밀 채점하여
     * 해당 회차에 특화된 1·2순위 추천 요일, 진태양시 보정 길시(시두법), 및 맞춤 조언을 동적으로 도출
     */
    analyzeRoundFortune(ganIdx, targetRound = 1245) {
        if (ganIdx === null || ganIdx === undefined || ganIdx < 0 || ganIdx >= HEAVENLY_STEMS.length) {
            return null;
        }

        const stem = HEAVENLY_STEMS[ganIdx];
        const uElem = STEM_ELEMENT_INDEX[ganIdx];
        const uPol = ganIdx % 2; // 0: 양, 1: 음
        const wElem = (uElem + 2) % 5; // 재성 (아극재)
        const oElem = (uElem + 1) % 5; // 식상 (아생자)
        const nobleBranches = NOBLEMAN_BRANCHES[ganIdx] || [];

        // 회차 추첨일(토요일) 및 구매 기간(일~토) 산출
        // 로또 1회 추첨일: 2002년 12월 7일 (토)
        const roundDrawDate = new Date(Date.UTC(2002, 11, 7 + (targetRound - 1) * 7));

        const daysScored = [];
        for (let k = 0; k < 7; k++) {
            // k=0: 일요일 (추첨 6일 전), ..., k=6: 토요일 (추첨 당일)
            const curDate = new Date(roundDrawDate.getTime() - (6 - k) * 86400000);
            const diffDays = Math.floor((curDate.getTime() - ANCHOR_DATE.getTime()) / 86400000);
            const dayGan = ((diffDays % 10) + 10) % 10;
            const dayJi = (((diffDays + 4) % 12) + 12) % 12;
            const wDay = curDate.getUTCDay(); // 0:일 ~ 6:토
            const wDayElem = WEEKDAY_ELEMENT_INDEX[wDay];

            let score = 50;
            const reasons = [];

            const dStemElem = STEM_ELEMENT_INDEX[dayGan];
            const dStemPol = dayGan % 2;
            const dJiElem = BRANCH_ELEMENT_INDEX[dayJi];

            // 1) 천간 십신 판별
            if (dStemElem === wElem) {
                if (dStemPol === uPol) {
                    score += 45;
                    reasons.push('천간 편재(偏財) 횡재수 감응');
                } else {
                    score += 38;
                    reasons.push('천간 정재(正財) 안정 재물운');
                }
            } else if (dStemElem === oElem) {
                score += 32;
                reasons.push('천간 식상생재(食傷生財) 발복');
            } else if (dStemElem === uElem) {
                score += 15;
                reasons.push('본원 비견·겁재 조력');
            } else {
                score += 10;
            }

            // 2) 천을귀인(天乙貴人)
            if (nobleBranches.includes(dayJi)) {
                score += 26;
                reasons.push(`천을귀인(${BRANCH_NAMES_SHORT[dayJi]}) 길조`);
            }

            // 3) 지지 재성/식상
            if (dJiElem === wElem) {
                score += 28;
                reasons.push('지지 재성(財星) 결실');
            } else if (dJiElem === oElem) {
                score += 20;
                reasons.push('지지 식상(食傷) 생조');
            }

            // 4) 천간합(天干合)
            if ((ganIdx + 5) % 10 === dayGan) {
                score += 18;
                reasons.push('천간합(天干合) 상생화합');
            }

            // 5) 동양 칠요(七曜) 공명
            if (wDayElem === wElem) {
                score += 16;
                reasons.push('칠요(七曜) 재물 오행 합치');
            } else if (wDayElem === oElem) {
                score += 10;
                reasons.push('칠요(七曜) 식상 오행 조화');
            }

            // 주말 가중치(금·토 발권 편의)
            if (wDay === 6) score += 4;
            else if (wDay === 5) score += 2;

            const m = curDate.getUTCMonth() + 1;
            const d = curDate.getUTCDate();
            const dateStr = `${m < 10 ? '0' + m : m}.${d < 10 ? '0' + d : d}`;
            const iljinKo = `${STEM_NAMES_SHORT[dayGan]}${BRANCH_NAMES_SHORT[dayJi]}일 (${STEM_NAMES_HANJA[dayGan]}${BRANCH_NAMES_HANJA[dayJi]}日)`;
            const iljinShort = `${STEM_NAMES_SHORT[dayGan]}${BRANCH_NAMES_SHORT[dayJi]}일`;

            daysScored.push({
                curDate,
                month: m,
                date: d,
                dateStr,
                weekdayIdx: wDay,
                weekdayKo: WEEKDAY_NAMES_KO[wDay],
                dayGan,
                dayJi,
                iljinKo,
                iljinShort,
                score,
                reasons
            });
        }

        // 높은 점수 순으로 정렬
        daysScored.sort((a, b) => b.score - a.score);

        const top1 = daysScored[0];
        const top2 = daysScored[1];

        // 1순위 및 2순위 요일 정보 포맷
        const primaryDay = `${top1.weekdayKo} (${top1.dateStr}, ${top1.iljinShort})`;
        const primaryDayShort = `${top1.weekdayKo} (${top1.dateStr})`;
        const primaryDayDesc = top1.reasons.slice(0, 2).join(' 및 ') || '재물운 왕성 길일';

        const secondaryDay = `${top2.weekdayKo} (${top2.dateStr}, ${top2.iljinShort})`;
        const secondaryDayShort = `${top2.weekdayKo} (${top2.dateStr})`;
        const secondaryDayDesc = top2.reasons.slice(0, 2).join(' 및 ') || '보조 안정 재물일';

        // 1순위 추천일 기준 시두법(오서둔법) 시간대(길시) 동적 도출
        // 시작 자시 천간: ((일간 % 5) * 2) % 10
        const startHourGan = ((top1.dayGan % 5) * 2) % 10;
        const isSaturday = top1.weekdayIdx === 6;

        const hoursScored = [];
        for (let j = 0; j < 12; j++) {
            const hDef = TWELVE_HOURS[j];
            // 로또 발권 가능 시간: 06:00 ~ 24:00 (묘시~해시)
            if (j < 3) continue; // 자시, 축시, 인시 제외
            if (isSaturday && j > 9) continue; // 토요일은 술시(마감 20:00 한정) 또는 유시까지

            const hGan = (startHourGan + j) % 10;
            const hJi = j;
            const hStemElem = STEM_ELEMENT_INDEX[hGan];
            const hStemPol = hGan % 2;
            const hJiElem = BRANCH_ELEMENT_INDEX[hJi];

            let hScore = 40;
            const hReasons = [];

            // 시진 천간 십신
            if (hStemElem === wElem) {
                if (hStemPol === uPol) {
                    hScore += 35;
                    hReasons.push('시진 편재(偏財) 횡재수');
                } else {
                    hScore += 28;
                    hReasons.push('시진 정재(正財) 재물운');
                }
            } else if (hStemElem === oElem) {
                hScore += 24;
                hReasons.push('식상생재 행동 촉진');
            }

            // 시진 지지 귀인 및 재성
            if (nobleBranches.includes(hJi)) {
                hScore += 25;
                hReasons.push(`천을귀인(${BRANCH_NAMES_SHORT[hJi]}) 시진`);
            }
            if (hJiElem === wElem) {
                hScore += 20;
                hReasons.push('지지 재성 결실');
            } else if (hJiElem === oElem) {
                hScore += 15;
                hReasons.push('지지 식상 조화');
            }

            // 천간합 시진
            if ((ganIdx + 5) % 10 === hGan) {
                hScore += 16;
                hReasons.push('천간합 시간대');
            }

            // 구매 선호 시간대 가중치 (오후 골든타임 15:30~19:30 및 점심 11:30~13:30)
            if (hJi === 8 || hJi === 9) hScore += 8; // 신시, 유시
            else if (hJi === 6) hScore += 5; // 오시

            hoursScored.push({
                jiIdx: j,
                name: hDef.name,
                range: hDef.range,
                score: hScore,
                reasons: hReasons
            });
        }

        hoursScored.sort((a, b) => b.score - a.score);

        const h1 = hoursScored[0] || TWELVE_HOURS[8];
        const h2 = hoursScored[1] || TWELVE_HOURS[9];

        const timeSlot1 = `${h1.name} ${h1.range}`;
        const timeSlot1Desc = h1.reasons.slice(0, 2).join(' · ') || '최적의 재물 집중 길시';
        const timeSlot2 = `${h2.name} ${h2.range}`;
        const timeSlot2Desc = h2.reasons.slice(0, 2).join(' · ') || '보조 안정 재물 길시';

        // 맞춤형 역학 조언 (Dynamic Advice)
        const advice = `제 ${targetRound}회차는 ${top1.month}월 ${top1.date}일 ${top1.weekdayKo}(${top1.iljinShort})에 ${top1.reasons[0] || '최상의 재물운'} 흐름이 가장 왕성합니다. ${h1.name.split(' ')[0]} ${h1.range} 시간대를 활용하여 구매하시면 본원(${stem.name})의 기운과 상응하여 최적의 횡재 파동을 이끌어낼 수 있습니다.`;

        // 횡재수 점수 (92 ~ 98점 범위의 활력형 스코어)
        const fortuneScore = 92 + (top1.score % 7);
        const starRating = fortuneScore >= 96 ? '★★★★★' : '★★★★☆';

        return {
            targetRound,
            primaryDay,
            primaryDayShort,
            primaryDayDesc,
            secondaryDay,
            secondaryDayShort,
            secondaryDayDesc,
            timeSlot1,
            timeSlot1Desc,
            timeSlot2,
            timeSlot2Desc,
            advice,
            fortuneScore,
            starRating,
            daysScored
        };
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
        const targetRound = options.currentRound || ((typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : 1245);

        // 회차별 동적 사주 명리학 분석 (해당 회차 주간 7일 및 시두법 길시)
        const dynamic = this.analyzeRoundFortune(ganIdx, targetRound);

        return {
            birthDate: birthDateStr,
            calendarType: calendarType,
            birthHour: birthHour,
            ganIndex: ganIdx,
            targetRound: targetRound,
            stem: Object.assign({}, stem, {
                primaryDay: dynamic ? dynamic.primaryDay : stem.primaryDay,
                primaryDayShort: dynamic ? dynamic.primaryDayShort : stem.primaryDayShort,
                primaryDayDesc: dynamic ? dynamic.primaryDayDesc : stem.primaryDayDesc,
                secondaryDay: dynamic ? dynamic.secondaryDay : stem.secondaryDay,
                secondaryDayShort: dynamic ? dynamic.secondaryDayShort : stem.secondaryDayShort,
                secondaryDayDesc: dynamic ? dynamic.secondaryDayDesc : stem.secondaryDayDesc,
                timeSlot1: dynamic ? dynamic.timeSlot1 : stem.timeSlot1,
                timeSlot1Desc: dynamic ? dynamic.timeSlot1Desc : stem.timeSlot1Desc,
                timeSlot2: dynamic ? dynamic.timeSlot2 : stem.timeSlot2,
                timeSlot2Desc: dynamic ? dynamic.timeSlot2Desc : stem.timeSlot2Desc,
                advice: dynamic ? dynamic.advice : stem.advice,
                luckyRoundDays: dynamic ? dynamic.daysScored : []
            }),
            fortuneScore: dynamic ? dynamic.fortuneScore : (92 + ((ganIdx + targetRound) % 7)),
            starRating: (dynamic && dynamic.fortuneScore >= 96) ? '★★★★★' : '★★★★☆',
            dynamicAnalysis: dynamic,
            calculatedAt: new Date().toISOString()
        };
    }
};

if (typeof window !== 'undefined') {
    window.MyeongriService = MyeongriService;
}

