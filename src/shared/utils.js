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

export function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = 'position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.95); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.4); padding: 12px 24px; border-radius: 30px; font-size: 0.9rem; font-weight: 700; z-index: 2147483647; box-shadow: 0 10px 25px rgba(0,0,0,0.8); transition: opacity 0.3s ease; pointer-events: none; text-align: center; max-width: 90vw;';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.opacity = '1';

    if (window._toastTimeout) clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 2400);
}

export async function shareLottoApp(customData = {}) {
    const shareTitle = customData.title || '운도실력 777 | AI 로또 6/45 퀀트 추천 플랫폼';
    const shareText = customData.text || '🍀 [운도실력 777] 빅데이터 & AI 퀀트 알고리즘 기반 로또 6/45 추천 서비스!\n매주 최적의 번호 조합을 확인해보세요.';
    const shareUrl = customData.url || (window.location.origin ? (window.location.origin + window.location.pathname) : window.location.href.split('#')[0]);

    // 1. 스마트폰 Web Share API 지원 시 네이티브 공유창 호출 (카카오톡, 문자메시지, 인스타그램, 페이스북, 링크복사 등)
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
                // 사용자가 공유창에서 취소 선택
                return;
            }
            console.warn('[Web Share API Error - Fallback to Clipboard]:', err);
        }
    }

    // 2. PC 또는 미지원 브라우저 클립보드 복사 Fallback
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('🔗 서비스 링크가 복사되었습니다! 카카오톡이나 메시지에 붙여넣어 공유하세요.');
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
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
window.shareLottoApp = shareLottoApp;

/**
 * Robust HTML escaping for XSS prevention in innerHTML templates
 * @param {string} str 
 * @returns {string} Sanitized string
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
}

