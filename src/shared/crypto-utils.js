// ==========================================
// Web Crypto API Based Security Utilities
// ==========================================

/**
 * Hash password using Web Crypto API SHA-256 with unique Salt per user
 * @param {string} password 
 * @param {string} userId 
 * @returns {Promise<string>} Hex-encoded SHA-256 hash
 */
export async function hashPassword(password, userId) {
    if (!password) return '';
    const cleanId = (userId || 'global_user').trim().toLowerCase();
    const salt = `undo_skill_secure_salt_${cleanId}_2026_v2`;
    
    // Check if crypto.subtle is available (HTTPS / localhost / modern browsers)
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password + salt);
            const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            console.warn('[Crypto] subtle.digest fallback to standard hash:', e);
        }
    }
    
    // Pure JS SHA-256 fallback if subtle is unavailable in non-secure context
    return fallbackSha256(password + salt);
}

/**
 * Validate password complexity & strength
 * Rules: 8~32 chars, must contain letter, number, and special character
 * @param {string} password 
 * @returns {{ isValid: boolean, score: number, message: string, color: string }}
 */
export function checkPasswordStrength(password) {
    if (!password || password.length === 0) {
        return { isValid: false, score: 0, message: '비밀번호를 입력해주세요.', color: '#94a3b8' };
    }
    
    let score = 0;
    const hasMinLength = password.length >= 8;
    const hasMaxLength = password.length <= 32;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~\x60]/.test(password);

    if (hasMinLength && hasMaxLength) score += 1;
    if (hasLetter) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;
    if (password.length >= 10) score += 1;

    const isValid = hasMinLength && hasMaxLength && hasLetter && hasNumber && hasSpecial;

    if (!hasMinLength) {
        return { isValid: false, score: 1, message: '최소 8자 이상 입력해주세요.', color: '#ef4444' };
    }
    if (!hasLetter || !hasNumber || !hasSpecial) {
        return { isValid: false, score: 2, message: '영문, 숫자, 특수문자를 모두 포함해야 합니다.', color: '#f59e0b' };
    }
    if (score >= 4) {
        return { isValid: true, score: 4, message: '안전하고 강력한 비밀번호입니다.', color: '#10b981' };
    }
    return { isValid: true, score: 3, message: '사용 가능한 적정 수준의 비밀번호입니다.', color: '#3b82f6' };
}

/**
 * Format raw string into Korean mobile phone format (010-XXXX-XXXX)
 * @param {string} val 
 * @returns {string} Formatted phone string
 */
export function formatPhoneNumber(val) {
    if (!val) return '';
    const digits = val.replace(/[^0-9]/g, '').slice(0, 11);
    if (digits.length <= 3) {
        return digits;
    } else if (digits.length <= 7) {
        return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    } else {
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }
}

/**
 * Generate cryptographically secure 6-digit OTP code
 * @returns {string} 6-digit number string
 */
export function generateOtpCode() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
        const array = new Uint32Array(1);
        window.crypto.getRandomValues(array);
        const code = (array[0] % 900000) + 100000;
        return code.toString();
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Standalone pure JS SHA-256 fallback (Non-blocking, zero external dependencies)
 */
function fallbackSha256(str) {
    if (!str) return '';
    var s = '';
    try {
        s = unescape(encodeURIComponent(String(str)));
    } catch(e) {
        s = String(str);
    }

    function rightRotate(value, amount) {
        return (value >>> amount) | (value << (32 - amount));
    }

    var maxWord = Math.pow(2, 32);
    var i, j;
    var result = '';
    var words = [];
    var asciiBitLength = s.length * 8;
    var hash = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    var k = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    s += '\x80';
    while (s.length % 64 !== 56) s += '\x00';
    for (i = 0; i < s.length; i++) {
        j = s.charCodeAt(i);
        words[i >> 2] |= (j & 255) << ((3 - i % 4) * 8);
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength | 0);

    for (j = 0; j < words.length;) {
        var w = words.slice(j, j += 16);
        var oldHash = hash.slice(0);

        for (i = 0; i < 64; i++) {
            var w15 = w[i - 15], w2 = w[i - 2];
            var a = hash[0], e = hash[4];
            var temp1 = hash[7]
                + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
                + ((e & hash[5]) ^ ((~e) & hash[6]))
                + k[i]
                + (w[i] = (i < 16) ? (w[i] || 0) : (
                    w[i - 16]
                    + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
                    + w[i - 7]
                    + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
                ) | 0);
            var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
                + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

            hash = [(temp1 + temp2) | 0].concat(hash);
            hash[4] = (hash[4] + temp1) | 0;
            hash.pop();
        }

        for (i = 0; i < 8; i++) {
            hash[i] = (hash[i] + oldHash[i]) | 0;
        }
    }

    for (i = 0; i < 8; i++) {
        for (var i3 = 3; i3 >= 0; i3--) {
            var b = (hash[i] >> (8 * i3)) & 255;
            result += (b < 16 ? '0' : '') + b.toString(16);
        }
    }
    return result;
}

/**
 * Synchronous SHA-256 hash
 * @param {string} text 
 * @returns {string} Hex SHA-256 string
 */
export function sha256Sync(text) {
    if (!text) return '';
    try {
        return fallbackSha256(String(text));
    } catch(e) {
        return '0000000000000000000000000000000000000000000000000000000000000000';
    }
}

/**
 * Generate Unified Legal Cryptographic Proof Certificate for Agreement & Real Purchases
 * @param {object} docData 
 * @param {object} winningAuditData 
 * @returns {{ auditId: string, sealHash: string, timestamp: string }}
 */
export function generateAgreementProofCertificate(docData, winningAuditData) {
    const uId = (docData?.userId || 'guest').trim().toLowerCase();
    const agreedDate = docData?.agreedDateFormatted || docData?.createdAt || new Date().toISOString();
    const sigLen = (docData?.signatureDataUrl || '').length;
    const winsCount = winningAuditData?.totalWinningCombos || 0;
    const totalPrize = winningAuditData?.totalPrize || 0;
    const winningRoundsStr = (winningAuditData?.winningItems || []).map(item => `${item.roundNum}-${item.rank}-${item.prize}`).join('|');

    const rawPayload = `AGREEMENT_PROOF::USER=${uId}::AGREED=${agreedDate}::SIG_LEN=${sigLen}::WINS=${winsCount}::PRIZE=${totalPrize}::ROUNDS=${winningRoundsStr}::SALT=undo_skill_legal_audit_2026`;
    const sealHash = sha256Sync(rawPayload);
    const auditId = `AUDIT-LOTTO-${uId.toUpperCase()}-${sealHash.slice(0, 8).toUpperCase()}`;

    return {
        auditId,
        sealHash,
        timestamp: new Date().toISOString(),
        rawPayload
    };
}
