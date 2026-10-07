window.onerror = function(message, source, lineno, colno, error) {
    console.error('[Global JS Error]', { message, source, lineno, colno, error });
};

window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled Promise Rejection:', event.reason);
});

const BASE_DRAW_DATE = new Date(2002, 11, 7, 20, 0, 0);

export function calculateDrawRound(targetDate = new Date()) {
    const diffMs = targetDate.getTime() - BASE_DRAW_DATE.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return 1 + diffWeeks;
}

export function getDrawDateByRound(round) {
    if (!round || isNaN(round) || round < 1) return '';
    const baseMs = new Date(2002, 11, 7, 20, 0, 0).getTime();
    const targetMs = baseMs + (parseInt(round) - 1) * 7 * 24 * 60 * 60 * 1000;
    const d = new Date(targetMs);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function getNextSaturdayDate(now = new Date()) {
    const result = new Date(now);
    const day = result.getDay();
    const diff = (6 - day + 7) % 7;
    result.setDate(result.getDate() + (diff === 0 && now.getHours() >= 21 ? 7 : diff));
    result.setHours(20, 35, 0, 0);
    return result;
}

export function formatDate(date) {
    if (!date) return '-';
    let d = date;
    if (typeof date === 'string' || typeof date === 'number') {
        d = new Date(date);
    }
    if (!(d instanceof Date) || isNaN(d.getTime())) {
        return String(date);
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}. ${mm}. ${dd}`;
}

export function isSystemOrDummyUser(userId) {
    if (!userId) return true;
    let clean = String(userId).trim().toLowerCase();
    if (clean.startsWith('{')) {
        try {
            const p = JSON.parse(clean);
            clean = (p.userid || p.userId || clean).trim().toLowerCase();
        } catch(e) {}
    }
    if (!clean) return true;
    if (clean === 'all' || clean.startsWith('guest') || clean === 'app_latest_version' ||
        clean === 'dashboard_summary_latest' ||
        clean === 'global_trash' || clean === 'global_state' || clean === 'global_saved' || clean === 'extra_history' ||
        clean === 'user_alpha' || clean === 'user_beta' || clean === 'user_gamma' || clean === 'sample' || clean === 'hms' ||
        clean === 'kakao_5081608503' || clean === 'kakao_5090399860' || clean === 'kakao_5105087435' ||
        clean.startsWith('test') || clean.startsWith('{') || clean.includes('테스트')) {
        return true;
    }
    // 🔒 삭제(휴지통) 회원 검증: 삭제된 회원은 시스템/더미 처리하여 알고리즘 연산 및 상호보완 풀에서 100% 제외
    if (typeof window !== 'undefined') {
        if (window.__knownDeletedUserIds && window.__knownDeletedUserIds.has(clean)) return true;
        if (window.state) {
            if (window.state.allUsersPurchasesMap && window.state.allUsersPurchasesMap[clean]) {
                const p = window.state.allUsersPurchasesMap[clean];
                if (p.isDeleted === true || p.status === 'trash' || p.status === 'deleted') return true;
            }
            if (Array.isArray(window.state.allRegisteredUsersList)) {
                const found = window.state.allRegisteredUsersList.find(u => String((u && u.id) || '').trim().toLowerCase() === clean);
                if (found && (found.isDeleted === true || found.status === 'trash' || found.status === 'deleted')) return true;
            }
        }
    }
    try {
        if (typeof localStorage !== 'undefined') {
            const rawStatus = localStorage.getItem('lotto_users_with_status_cache');
            if (rawStatus) {
                const parsedStatus = JSON.parse(rawStatus);
                if (Array.isArray(parsedStatus)) {
                    const found = parsedStatus.find(u => String(u.userId || u.id || '').trim().toLowerCase() === clean);
                    if (found && (found.isDeleted === true || found.status === 'trash' || found.status === 'deleted' || (found.data && (found.data.isDeleted === true || found.data.status === 'trash')))) {
                        return true;
                    }
                }
            }
        }
    } catch(e) {}
    return false;
}

export function calculateACValue(nums) {
    let diffs = new Set();
    for(let i=0; i<nums.length; i++) {
        for(let j=i+1; j<nums.length; j++) {
            diffs.add(Math.abs(nums[i] - nums[j]));
        }
    }
    return diffs.size - 5;
}

export function removeUndefined(obj) {
    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefined(item));
    }
    if (obj !== null && typeof obj === 'object') {
        const clean = {};
        for (const [key, val] of Object.entries(obj)) {
            if (val !== undefined) {
                clean[key] = removeUndefined(val);
            }
        }
        return clean;
    }
    return obj;
}

export function getBallColorClass(num) {
    if (num <= 10) return 'ball-yellow';
    if (num <= 20) return 'ball-blue';
    if (num <= 30) return 'ball-red';
    if (num <= 40) return 'ball-gray';
    return 'ball-green';
}

export function getBallHexColor(num) {
    if (num <= 10) return '#f59e0b';
    if (num <= 20) return '#3b82f6';
    if (num <= 30) return '#ef4444';
    if (num <= 40) return '#8b5cf6';
    return '#10b981';
}

export function getBallTextColor(num) {
    const n = parseInt(num, 10);
    return (n <= 10) ? '#0f172a' : '#ffffff';
}

export function getNeighborMatches(numbers, PREVIOUS_DRAW) {
    const prevSet = new Set(PREVIOUS_DRAW);
    const neighbors = new Set();
    PREVIOUS_DRAW.forEach(n => {
        if (n > 1) neighbors.add(n - 1);
        if (n < 45) neighbors.add(n + 1);
    });

    const matches = numbers.filter(n => neighbors.has(n) && !prevSet.has(n));
    return matches;
}

export function hideToast(immediate = false) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    if (window._toastTimeout) { clearTimeout(window._toastTimeout); window._toastTimeout = null; }
    if (window._toastHideTimeout) { clearTimeout(window._toastHideTimeout); window._toastHideTimeout = null; }
    
    toast.style.pointerEvents = 'none';
    toast.classList.remove('toast-active');
    toast.classList.add('toast-hidden');
    toast.style.display = 'none';
    toast.style.opacity = '0';
    toast.style.visibility = 'hidden';
    toast.style.animation = 'none';
}
if (typeof window !== 'undefined') {
    window.hideToast = hideToast;
    window.showToast = showToast;
}

export function showToast(message, durationOrType = 2000) {
    if (!message) return;
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        document.body.appendChild(toast);
    }
    
    if (window._toastTimeout) { clearTimeout(window._toastTimeout); window._toastTimeout = null; }
    if (window._toastHideTimeout) { clearTimeout(window._toastHideTimeout); window._toastHideTimeout = null; }

    toast.classList.remove('toast-hidden', 'toast-active');
    toast.title = '클릭하면 닫힙니다';
    toast.onclick = function(e) {
        if (e) { e.stopPropagation(); }
        hideToast(true);
    };

    let durationMs = 2000;
    if (typeof durationOrType === 'number' && durationOrType > 0) {
        durationMs = durationOrType;
    } else if (durationOrType === 'error') {
        durationMs = 3500;
    }

    toast.innerHTML = `<span style="flex:1;">${message}</span><span style="opacity:0.75; font-size:1.25rem; line-height:1; padding-left:6px; cursor:pointer;" title="닫기">&times;</span>`;
    
    // Reset animation
    toast.style.pointerEvents = 'auto';
    toast.style.display = 'flex';
    toast.style.opacity = '';
    toast.style.visibility = '';
    toast.style.animation = 'none';
    void toast.offsetWidth; // Force reflow

    // Apply GPU-composited keyframe animation (runs independently of JS thread)
    const animSec = (durationMs / 1000).toFixed(2);
    toast.style.animation = `toastAutoDismiss ${animSec}s cubic-bezier(0.16, 1, 0.3, 1) forwards`;
    toast.classList.add('toast-active');

    // JS Fallback & State cleanup
    window._toastTimeout = setTimeout(() => {
        hideToast(true);
    }, durationMs + 80);
}

export async function shareProgramApp(customData = {}) {
    const shareTitle = customData.title || '운도실력 | 로또 통계 분석 & 건전 장부 관리';
    const shareText = customData.text || '📊 [운도실력 시스템 안내]\n동행복권 역대 공식 발표 데이터 기반의 통계 분석 및 건전한 개인 구매 이력 기록·관리 웹 플랫폼입니다.\n\n• 회차별 공식 당첨 통계 및 분석 지표 확인\n• 모바일 QR 영수증 기반 개인 구매 장부 보관\n\n※ 건전한 소액 취미 생활과 통계 분석 연구를 지향합니다.';
    const shareUrl = customData.url || (window.location.origin ? (window.location.origin + window.location.pathname) : window.location.href.split('#')[0]);

    // 1. 스마트폰 Web Share API (모바일 최우선 네이티브 공유창: 카카오톡, 문자메시지, 인스타그램, 페이스북, 링크복사 등)
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            showToast('✨ 공유가 완료되었습니다!');
            return;
        } catch (err) {
            if (err.name === 'AbortError') {
                return; // 사용자가 공유창에서 닫기/취소 선택
            }
            console.warn('[Web Share API Error - Fallback to Kakao/Clipboard]:', err);
        }
    }

    // 2. 카카오 SDK 연동 시 카카오톡 공유창 열기 시도
    if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized() && window.Kakao.Share && typeof window.Kakao.Share.sendDefault === 'function') {
        try {
            window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: shareTitle,
                    description: '동행복권 역대 공식 당첨 통계 분석 및 모바일 QR 구매 이력 기록 시스템 (건전한 소액 문화 지향)',
                    imageUrl: 'https://lucky777-lottery.web.app/icon-512.png',
                    link: {
                        mobileWebUrl: shareUrl,
                        webUrl: shareUrl
                    }
                },
                buttons: [
                    {
                        title: '서비스 안내 보기',
                        link: {
                            mobileWebUrl: shareUrl,
                            webUrl: shareUrl
                        }
                    }
                ]
            });
            showToast('💬 카카오톡 공유창이 열렸습니다!');
            return;
        } catch (kErr) {
            console.warn('[Kakao Share Fallback]:', kErr);
        }
    }

    // 3. PC 또는 미지원 브라우저 클립보드 복사 Fallback
    try {
        const fullShareContent = `${shareTitle}\n\n${shareText}\n\n🔗 접속 링크: ${shareUrl}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(fullShareContent);
            showToast('🔗 서비스 링크가 복사되었습니다! 카카오톡이나 SNS에 붙여넣어 공유하세요.');
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = fullShareContent;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('🔗 서비스 링크가 클립보드에 복사되었습니다!');
        }
    } catch (clipErr) {
        console.error('[Clipboard Fallback Error]:', clipErr);
        prompt('아래 링크를 복사하여 공유하세요:', shareUrl);
    }
}

export const shareLottoApp = shareProgramApp;
window.shareProgramApp = shareProgramApp;
window.shareLottoApp = shareProgramApp;

/**
 * 범용 클립보드 텍스트 복사 유틸리티
 * @param {string} text 
 * @param {string} successMsg 
 */
export async function copyToClipboard(text, successMsg = '클립보드에 복사되었습니다.') {
    if (!text) return;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            if (typeof showToast === 'function') showToast(successMsg);
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            if (typeof showToast === 'function') showToast(successMsg);
        }
    } catch (err) {
        console.error('[copyToClipboard error]', err);
        prompt('아래 텍스트를 복사하세요:', text);
    }
}
window.copyToClipboard = copyToClipboard;


