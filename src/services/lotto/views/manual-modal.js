import { state } from '../state.js';
import { showToast, getDrawDateByRound, getBallColorClass } from '../../../shared/utils.js';
import { getLedger, saveToLedger, parseDonghangLotteryQrUrl, parseDonghangOnlineReceiptText, buildDonghangLotteryQrUrl } from '../ledger.js';
import { SafeAuth, getUserRealName, isAdminUser } from '../../../shared/auth-mgmt.js';
import { renderReviewTab } from './review-tab.js';
import { renderConfirmedPurchasesList } from './confirmed-tab.js';
import { crossCheckCombosWithRecommendations } from '../generator.js';
import { getAllUnifiedRegisteredUsers, DEFAULT_KNOWN_USERS } from '../../../shared/user-context.js';

let html5QrScanner = null;
let isStartingScanner = false;
let stopScanningPromise = null;
let currentScannerSessionId = 0;

// 🔒 연속 등록 안정화: 저장 중복 실행 방지 락 & 잘못된 QR 경고 반복 방지
let isSavingManualLedger = false;
let lastInvalidQrText = '';
let lastInvalidQrAt = 0;

/**
 * 🔍 동일 영수증(QR 일련번호 또는 번호 세트)이 대상 회원 장부의 같은 회차에 이미 등록되어 있는지 확인
 */
export function findAlreadyRegisteredQrReceipt(round, serial, combos, targetUserId) {
    try {
        const r = parseInt(round, 10);
        if (!r || isNaN(r)) return null;
        const ledger = getLedger(targetUserId || null) || {};
        const receipts = Array.isArray(ledger[r]) ? ledger[r] : [];
        if (receipts.length === 0) return null;

        const toKey = (list) => (Array.isArray(list) ? list : [])
            .map(c => (Array.isArray(c) ? c : (c && c.numbers) || []).slice().sort((a, b) => a - b).join(','))
            .sort()
            .join('|');

        const cleanSerial = String(serial || '').trim();
        const hasRealSerial = cleanSerial.length >= 10;
        const incomingKey = toKey(combos);

        return receipts.find(p => {
            if (!p) return false;
            const pSerial = String((p.qrMeta && p.qrMeta.qrSerial) || p.qrSerial || p.receiptId || '').trim();
            // 실물 QR 일련번호가 있으면 일련번호로만 판정 (같은 번호를 다른 용지로 2장 구매한 정상 케이스 허용)
            if (hasRealSerial) return pSerial === cleanSerial;
            return !!incomingKey && Array.isArray(p.combos) && toKey(p.combos) === incomingKey;
        }) || null;
    } catch (e) {
        console.warn('[QR Duplicate Check note]', e);
        return null;
    }
}

function getManualLedgerTargetUserId() {
    const currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : null) || 'guest').toLowerCase().trim();
    const isAdmin = (typeof isAdminUser === 'function') ? isAdminUser(currentAuthId) : (currentAuthId === 'master' || currentAuthId === 'admin');
    const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
    if (isAdmin && masterUserSelect && masterUserSelect.value) {
        return masterUserSelect.value.trim().toLowerCase();
    }
    return currentAuthId;
}

function setManualLedgerSaveButtonsDisabled(disabled) {
    const btns = [document.getElementById('btnSaveManualLedger')];
    const directWrap = document.getElementById('btnDirectConfirmReceipt');
    if (directWrap) btns.push(...directWrap.querySelectorAll('button'));
    btns.forEach(b => {
        if (!b) return;
        b.disabled = !!disabled;
        b.style.opacity = disabled ? '0.6' : '';
        b.style.pointerEvents = disabled ? 'none' : '';
    });
}

/**
 * 🔒 Forcibly release all active video streams and tracks at the OS hardware level
 */
export function forceKillAllCameraTracks() {
    try {
        const videoEls = document.querySelectorAll('video');
        videoEls.forEach(v => {
            try {
                if (v.srcObject && typeof v.srcObject.getTracks === 'function') {
                    v.srcObject.getTracks().forEach(t => {
                        try {
                            t.stop();
                        } catch(te) {}
                    });
                }
                v.srcObject = null;
                try { v.pause(); } catch(pe) {}
            } catch(ve) {}
        });
    } catch(e) {}
}

/**
 * 🛡️ Safely stop Html5Qrcode instance with hard timeout to prevent deadlocks
 */
export async function safeStopScanner(scannerInstance, timeoutMs = 350) {
    if (!scannerInstance) return;
    try {
        const stopPromise = (async () => {
            try {
                const scannerState = (typeof scannerInstance.getState === 'function') ? scannerInstance.getState() : null;
                if (scannerState === 2 || scannerState === 3 || scannerState === null) {
                    await scannerInstance.stop();
                }
            } catch(e) {}
            try {
                await scannerInstance.clear();
            } catch(e) {}
        })();

        await Promise.race([
            stopPromise,
            new Promise(res => setTimeout(res, timeoutMs))
        ]);
    } catch(err) {
        console.warn('[QR Scanner safeStop note]:', err);
    }
}

/**
 * 🧹 Cleanly rebuild qrReader DOM node to purge any zombie Html5Qrcode internal listeners
 */
export function resetQrReaderDOM() {
    try {
        const qrReader = document.getElementById('qrReader');
        if (!qrReader) return null;
        const parent = qrReader.parentNode;
        if (!parent) {
            qrReader.innerHTML = '';
            return qrReader;
        }

        const newReader = document.createElement('div');
        newReader.id = 'qrReader';
        newReader.style.cssText = qrReader.style.cssText || 'width: 100%; height: 100%;';

        // Defensively protect newReader against html5-qrcode's known removeChild(undefined) bug on stop()
        const origRemoveChild = newReader.removeChild.bind(newReader);
        newReader.removeChild = function(child) {
            if (!child || child.parentNode !== newReader) {
                return child;
            }
            return origRemoveChild(child);
        };
        newReader._removeChildProtected = true;

        parent.replaceChild(newReader, qrReader);
        return newReader;
    } catch(e) {
        const qrReader = document.getElementById('qrReader');
        if (qrReader) qrReader.innerHTML = '';
        return qrReader;
    }
}

export async function stopScanning() {
    currentScannerSessionId++;

    if (stopScanningPromise) {
        return stopScanningPromise;
    }

    stopScanningPromise = (async () => {
        isStartingScanner = false;
        const qrScannerContainer = document.getElementById('qrScannerContainer');
        const scanner = html5QrScanner;
        html5QrScanner = null;

        if (scanner) {
            await safeStopScanner(scanner, 350);
        }

        // Always guarantee all hardware camera tracks are killed
        forceKillAllCameraTracks();
        resetQrReaderDOM();

        if (qrScannerContainer) {
            qrScannerContainer.style.display = 'none';
        }
        const btnTorch = document.getElementById('btnToggleTorch');
        const btnZoom = document.getElementById('btnToggleZoom');
        if (btnTorch) btnTorch.style.display = 'none';
        if (btnZoom) btnZoom.style.display = 'none';
    })().finally(() => {
        stopScanningPromise = null;
        isStartingScanner = false;
    });

    return stopScanningPromise;
}

export function syncLedgerDateGuide(roundVal) {
    const guideEl = document.getElementById('manualLedgerDateGuide');
    if (!guideEl) return;

    // 직전 '과거 회차' 등록 시 덧씌운 주황색 스타일 초기화 (연속 등록 시 잔상 방지)
    guideEl.style.background = '';
    guideEl.style.color = '';

    const round = parseInt(roundVal);
    if (!isNaN(round) && round >= 1) {
        const dateStr = getDrawDateByRound(round);
        if (dateStr) {
            guideEl.innerHTML = `<i class="fa-regular fa-calendar-check"></i> 추첨 예정일: <strong>${dateStr} (토)</strong>`;
            guideEl.style.display = 'block';
            return;
        }
    }
    guideEl.style.display = 'none';
}

/**
 * 🧾 Renders Visual Digital Lotto Receipt Card with games A~E and ball badges
 */
export function renderDigitalReceiptCard(round, parsedCombos, check, serial) {
    const previewContainer = document.getElementById('qrScannedReceiptPreview');
    const gamesList = document.getElementById('receiptGamesList');
    const roundTag = document.getElementById('cardRoundTag');
    const dateTag = document.getElementById('cardDrawDateTag');
    const serialTag = document.getElementById('cardSerialTag');
    const totalAmountTag = document.getElementById('cardTotalAmountTag');
    const subtitleTag = document.getElementById('receiptSummarySubtitle');
    const saveBtnText = document.getElementById('btnSaveManualLedgerText');
    const qrScannerContainer = document.getElementById('qrScannerContainer');

    if (!previewContainer || !gamesList) return;

    if (!Array.isArray(parsedCombos) || parsedCombos.length === 0) {
        previewContainer.style.display = 'none';
        if (saveBtnText) saveBtnText.textContent = '실구매 등록하기';
        return;
    }

    // Hide camera viewfinder when receipt is rendered
    if (qrScannerContainer) {
        qrScannerContainer.style.display = 'none';
    }

    const drawDate = getDrawDateByRound(round);
    if (roundTag) roundTag.textContent = `제 ${round}회`;
    if (dateTag) dateTag.textContent = drawDate ? `추첨일: ${drawDate} (토)` : `추첨일: 미정`;
    
    // Format Serial
    const rawSerial = String(serial || `${String(round).padStart(4, '0')}00000014142041`);
    const formattedSerial = rawSerial.length > 8 
        ? `TR-${rawSerial.substring(0, 4)}-${rawSerial.substring(rawSerial.length - 8)}`
        : `TR-${rawSerial}`;
    if (serialTag) serialTag.textContent = formattedSerial;

    const gameLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

    const gamesHtml = parsedCombos.map((combo, idx) => {
        const letter = gameLetters[idx] || String(idx + 1);
        const matchDetail = (check && check.matchDetails) ? check.matchDetails[idx] : null;

        let badgeHtml = '';
        if (matchDetail && matchDetail.isExact) {
            if (matchDetail.matchedVersion.includes('추가') || matchDetail.matchedVersion.includes('빈틈제로') || matchDetail.matchedVersion.includes('슈퍼') || matchDetail.matchedVersion.includes('멀티') || matchDetail.matchedVersion.includes('흐름') || matchDetail.matchedVersion.includes('트리오')) {
                badgeHtml = `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #a7f3d0; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-rocket" style="font-size: 0.6rem;"></i> ${matchDetail.label}</span>`;
            } else if (matchDetail.matchedVersion.includes('올라운더') || matchDetail.matchedVersion.includes('V4.0')) {
                badgeHtml = `<span style="background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-bullseye" style="font-size: 0.6rem;"></i> ${matchDetail.label}</span>`;
            } else {
                badgeHtml = `<span style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-calculator" style="font-size: 0.6rem;"></i> ${matchDetail.label}</span>`;
            }
        } else {
            badgeHtml = `<span style="background: rgba(239, 68, 68, 0.18); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; white-space: nowrap;"><i class="fa-solid fa-pen-nib" style="font-size: 0.6rem;"></i> 수동</span>`;
        }

        const ballsHtml = combo.map(n => {
            const colorClass = (typeof getBallColorClass === 'function') ? getBallColorClass(n) : 'ball-yellow';
            return `<span class="ball-mini ${colorClass}">${n}</span>`;
        }).join('');

        return `
            <div class="receipt-game-row">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
                    <span class="receipt-game-badge">${letter}</span>
                    <div style="display: flex; gap: 4px; flex-wrap: nowrap; overflow-x: auto;">
                        ${ballsHtml}
                    </div>
                </div>
                ${badgeHtml}
            </div>
        `;
    }).join('');

    gamesList.innerHTML = gamesHtml;

    const totalAmount = parsedCombos.length * 1000;
    if (totalAmountTag) totalAmountTag.textContent = `${totalAmount.toLocaleString()} 원`;
    const combosEl = document.getElementById('manualLedgerCombos');
    const isOnline = combosEl && (combosEl.dataset.isOnlineReceipt === 'true');

    const summaryTitle = document.getElementById('receiptSummaryTitle');
    if (summaryTitle) {
        summaryTitle.innerHTML = isOnline 
            ? `<i class="fa-solid fa-globe" style="color: #38bdf8;"></i> 온라인 영수증 분석 완료!`
            : `QR 영수증 인식 완료!`;
    }

    if (subtitleTag) {
        subtitleTag.textContent = isOnline
            ? `${parsedCombos.length}개 게임 (${totalAmount.toLocaleString()}원) · 온라인 실구매 확인`
            : `${parsedCombos.length}개 게임 (${totalAmount.toLocaleString()}원) · AI 추천 일치 확인`;
    }

    let memberPrefix = '';
    const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
    const masterUserRow = document.getElementById('manualLedgerMasterUserRow');
    if (masterUserRow && masterUserRow.style.display !== 'none' && masterUserSelect && masterUserSelect.value) {
        const currentLoggedAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
        const targetUId = masterUserSelect.value.trim().toLowerCase();
        if (targetUId && targetUId !== currentLoggedAuthId) {
            const uName = (typeof getUserRealName === 'function' ? getUserRealName(targetUId) : '') || targetUId;
            memberPrefix = `[${uName}] 님 `;
        }
    }

    if (saveBtnText) {
        saveBtnText.innerHTML = isOnline
            ? `<strong>${memberPrefix}온라인 실구매 구매확정 (+${totalAmount.toLocaleString()}원)</strong>`
            : `${memberPrefix}실구매 등록하기 (+${totalAmount.toLocaleString()}원)`;
    }

    // Direct Instant Purchase Confirmation Action Button right inside the card
    let confirmBtnEl = document.getElementById('btnDirectConfirmReceipt');
    if (!confirmBtnEl && previewContainer) {
        confirmBtnEl = document.createElement('div');
        confirmBtnEl.id = 'btnDirectConfirmReceipt';
        confirmBtnEl.style.marginTop = '8px';
        previewContainer.appendChild(confirmBtnEl);
    }
    if (confirmBtnEl) {
        confirmBtnEl.innerHTML = `
            <button type="button" onclick="window.handleSaveManualLedger && window.handleSaveManualLedger()" class="btn-primary" style="width: 100%; height: 44px; background: linear-gradient(135deg, #10b981, #059669); font-weight: 800; font-size: 0.92rem; border: none; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); color: white;">
                <i class="fa-solid fa-circle-check" style="font-size: 1.05rem;"></i> ${memberPrefix}제 ${round}회 실구매 구매확정 (${totalAmount.toLocaleString()}원)
            </button>
        `;
    }

    previewContainer.style.display = 'flex';
}

/**
 * Updates the modal UI with real-time AI version detection
 */
export function updateManualModalCrossCheck() {
    const roundInput = document.getElementById('manualLedgerRound');
    const combosInput = document.getElementById('manualLedgerCombos');
    const versionSelect = document.getElementById('manualLedgerVersion');
    const resultBox = document.getElementById('manualLedgerAiCheckResult');
    const previewContainer = document.getElementById('qrScannedReceiptPreview');

    if (!roundInput || !combosInput || !versionSelect) return;

    const round = parseInt(roundInput.value.trim());
    const text = combosInput.value.trim();

    if (!round || isNaN(round) || !text) {
        if (resultBox) resultBox.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'none';
        return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedCombos = [];
    lines.forEach(l => {
        const nums = l.replace(/,/g, ' ').split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45);
        if (nums.length === 6) {
            parsedCombos.push(nums.sort((a,b) => a - b));
        }
    });

    if (parsedCombos.length === 0) {
        if (resultBox) resultBox.style.display = 'none';
        if (previewContainer) previewContainer.style.display = 'none';
        return;
    }

    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';
    const cleanAuth = authId.toLowerCase().trim();
    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(cleanAuth) : (cleanAuth === 'master' || cleanAuth === 'admin'));
    const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
    if (isAdmin && masterUserSelect && masterUserSelect.value) {
        authId = masterUserSelect.value.trim().toLowerCase();
    }
    const check = crossCheckCombosWithRecommendations(round, parsedCombos, authId);
    combosInput._cachedCrossCheck = {
        round: round,
        authId: authId,
        combosKey: parsedCombos.map(c => c.join(',')).join('|'),
        check: check
    };

    // Auto-select detected version in dropdown
    versionSelect.value = check.detectedVersion;

    const serial = combosInput.dataset.qrSerial || `${String(round).padStart(4, '0')}00000014142041`;
    renderDigitalReceiptCard(round, parsedCombos, check, serial);

    // Badges HTML for each game (1개라도 틀리면 수동입력)
    const pillsHtml = check.matchDetails.map((d, i) => {
        if (d.isExact) {
            if (d.matchedVersion.includes('추가') || d.matchedVersion.includes('빈틈제로') || d.matchedVersion.includes('슈퍼') || d.matchedVersion.includes('멀티') || d.matchedVersion.includes('흐름') || d.matchedVersion.includes('트리오')) {
                return `<span style="background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #a7f3d0; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-rocket" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            } else if (d.matchedVersion.includes('올라운더') || d.matchedVersion.includes('V4.0')) {
                return `<span style="background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #34d399; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-bullseye" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            } else {
                const v3Icon = 'fa-layer-group';
                return `<span style="background: rgba(59, 130, 246, 0.25); border: 1px solid #3b82f6; color: #93c5fd; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid ${v3Icon}" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            }
        } else {
            return `<span style="background: rgba(239, 68, 68, 0.2); border: 1px solid #f87171; color: #fca5a5; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;" title="수동입력"><i class="fa-solid fa-pen-to-square" style="font-size: 0.62rem;"></i> 게임 ${i+1}: 수동입력</span>`;
        }
    }).join('');

    // Render feedback notice
    if (resultBox) {
        resultBox.style.display = 'block';
        if (check.extraMatchCount > 0 && check.extraMatchCount >= check.v4MatchCount && check.extraMatchCount >= check.v3MatchCount) {
            resultBox.style.background = 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.18))';
            resultBox.style.border = '1px solid rgba(16,185,129,0.45)';
            resultBox.style.color = '#a7f3d0';
            resultBox.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-rocket" style="color: #34d399; font-size: 1.1rem;"></i>
                        <div>
                            <span style="color:#6ee7b7; font-weight:800;">🚀 AI 크로스체크: ${check.detectedVersion} 감지</span>
                            <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">
                                ${check.summaryMessage}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.1);">
                        ${pillsHtml}
                    </div>
                </div>
            `;
        } else if (check.v4MatchCount > 0 && check.v4MatchCount >= check.v3MatchCount) {
            resultBox.style.background = 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.18))';
            resultBox.style.border = '1px solid rgba(139,92,246,0.45)';
            resultBox.style.color = '#ddd6fe';
            resultBox.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-brain" style="color: #a78bfa; font-size: 1.1rem;"></i>
                        <div>
                            <span style="color:#c4b5fd; font-weight:800;">🎯 AI 크로스체크: 기본 1: 올라운더 팩 감지</span>
                            <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">
                                ${check.summaryMessage}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.1);">
                        ${pillsHtml}
                    </div>
                </div>
            `;
        } else if (check.v3MatchCount > 0) {
            resultBox.style.background = 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(217,119,6,0.18))';
            resultBox.style.border = '1px solid rgba(245,158,11,0.45)';
            resultBox.style.color = '#fef08a';
            const v3Title = '기본 2: 올라운더 팩 2';
            const v3Icon = 'fa-layer-group';
            resultBox.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid ${v3Icon}" style="color: #fbbf24; font-size: 1.1rem;"></i>
                        <div>
                            <span style="color:#fde047; font-weight:800;">⚡ AI 크로스체크: ${v3Title} 감지</span>
                            <div style="font-size:0.75rem; color:#cbd5e1; margin-top:2px;">
                                ${check.summaryMessage}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.1);">
                        ${pillsHtml}
                    </div>
                </div>
            `;
        } else if (check.isLegacyRound) {
            resultBox.style.background = 'rgba(148, 163, 184, 0.12)';
            resultBox.style.border = '1px solid rgba(148, 163, 184, 0.3)';
            resultBox.style.color = '#cbd5e1';
            resultBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-clock-rotate-left" style="color: #94a3b8; font-size: 1rem;"></i>
                    <div>
                        <span style="font-weight:700;">📝 과거 회차 직접 등록</span>
                        <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                            ${check.summaryMessage}
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultBox.style.background = 'rgba(148, 163, 184, 0.12)';
            resultBox.style.border = '1px solid rgba(148, 163, 184, 0.3)';
            resultBox.style.color = '#cbd5e1';
            resultBox.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i class="fa-solid fa-pen-nib" style="color: #94a3b8; font-size: 1rem;"></i>
                        <div>
                            <span style="font-weight:700;">📝 수동입력 구매</span>
                            <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                                ${check.summaryMessage}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.1);">
                        ${pillsHtml}
                    </div>
                </div>
            `;
        }
    }
}

// ============================================================================
// 📱 Mobile-First Multi-Modal Registration (Online Receipt & Ball Keypad)
// ============================================================================

export const ballPickerState = {
    activeGame: 'A',
    games: {
        A: [],
        B: [],
        C: [],
        D: [],
        E: []
    }
};

export function setActiveBallGame(gameLetter) {
    if (!['A', 'B', 'C', 'D', 'E'].includes(gameLetter)) return;
    ballPickerState.activeGame = gameLetter;
    renderBallPickerUI();
}

export function initBallPickerFromCombos() {
    const combosEl = document.getElementById('manualLedgerCombos');
    if (!combosEl || !combosEl.value.trim()) return;
    const lines = combosEl.value.trim().split('\n').filter(l => l.trim().length > 0);
    const letters = ['A', 'B', 'C', 'D', 'E'];
    letters.forEach((letter, idx) => {
        if (lines[idx]) {
            const nums = lines[idx].replace(/,/g, ' ').split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45);
            if (nums.length === 6) {
                ballPickerState.games[letter] = nums.sort((a,b) => a - b);
            }
        }
    });
}

export function syncBallPickerToCombos() {
    const combosEl = document.getElementById('manualLedgerCombos');
    if (!combosEl) return;
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const lines = [];
    letters.forEach(letter => {
        const nums = ballPickerState.games[letter] || [];
        if (nums.length === 6) {
            lines.push(nums.slice().sort((a,b) => a - b).join(' '));
        }
    });
    combosEl.value = lines.join('\n');
    combosEl.dataset.isOnlineReceipt = 'false';
    updateManualModalCrossCheck();
}

export function toggleBallInActiveGame(num) {
    const letter = ballPickerState.activeGame || 'A';
    let current = ballPickerState.games[letter] ? [...ballPickerState.games[letter]] : [];
    
    if (current.includes(num)) {
        current = current.filter(n => n !== num);
        ballPickerState.games[letter] = current;
        if (navigator.vibrate) try { navigator.vibrate(10); } catch(e) {}
    } else {
        if (current.length >= 6) {
            showToast(`⚠️ [${letter} 게임] 6개 번호가 이미 모두 선택되었습니다.`);
            return;
        }
        current.push(num);
        current.sort((a, b) => a - b);
        ballPickerState.games[letter] = current;
        if (navigator.vibrate) try { navigator.vibrate(10); } catch(e) {}

        if (current.length === 6) {
            if (navigator.vibrate) try { navigator.vibrate([15, 30, 15]); } catch(e) {}
            const letters = ['A', 'B', 'C', 'D', 'E'];
            const curIdx = letters.indexOf(letter);
            const nextEmpty = letters.find((l, idx) => idx > curIdx && (ballPickerState.games[l] || []).length < 6);
            if (nextEmpty) {
                ballPickerState.activeGame = nextEmpty;
                showToast(`✅ [${letter} 게임] 완성! 다음 [${nextEmpty} 게임]으로 이동`);
            }
        }
    }

    syncBallPickerToCombos();
    renderBallPickerUI();
}

export function randomFillActiveGame() {
    const letter = ballPickerState.activeGame || 'A';
    const nums = [];
    while (nums.length < 6) {
        const r = Math.floor(Math.random() * 45) + 1;
        if (!nums.includes(r)) nums.push(r);
    }
    nums.sort((a, b) => a - b);
    ballPickerState.games[letter] = nums;
    if (navigator.vibrate) try { navigator.vibrate([15, 30, 15]); } catch(e) {}

    const letters = ['A', 'B', 'C', 'D', 'E'];
    const curIdx = letters.indexOf(letter);
    const nextEmpty = letters.find((l, idx) => idx > curIdx && (ballPickerState.games[l] || []).length < 6);
    if (nextEmpty) {
        ballPickerState.activeGame = nextEmpty;
    }

    syncBallPickerToCombos();
    renderBallPickerUI();
    showToast(`🎲 [${letter} 게임] 자동 6개 번호 생성 완료`);
}

export function clearActiveGame() {
    const letter = ballPickerState.activeGame || 'A';
    ballPickerState.games[letter] = [];
    syncBallPickerToCombos();
    renderBallPickerUI();
    showToast(`🗑️ [${letter} 게임] 번호 초기화`);
}

export function clearAllGames() {
    ['A', 'B', 'C', 'D', 'E'].forEach(l => {
        ballPickerState.games[l] = [];
    });
    ballPickerState.activeGame = 'A';
    syncBallPickerToCombos();
    renderBallPickerUI();
}

export function renderBallPickerUI() {
    const chipsContainer = document.getElementById('ballGameChipsRow');
    const slotsContainer = document.getElementById('ballSlotsPreview');
    const keypadContainer = document.getElementById('ballKeypadGrid');
    const promptEl = document.getElementById('ballPickerPrompt');

    if (!chipsContainer || !slotsContainer || !keypadContainer) return;

    const letters = ['A', 'B', 'C', 'D', 'E'];
    const activeLetter = ballPickerState.activeGame || 'A';
    const activeNums = ballPickerState.games[activeLetter] || [];

    // 1. Render Chips
    chipsContainer.innerHTML = letters.map(letter => {
        const count = (ballPickerState.games[letter] || []).length;
        const isActive = (letter === activeLetter);
        const isCompleted = (count === 6);
        return `
            <div class="ball-game-chip ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" onclick="window.setActiveBallGame && window.setActiveBallGame('${letter}')">
                <span>${letter} 게임</span>
                <span class="chip-count">${count}/6</span>
            </div>
        `;
    }).join('');

    // 2. Render Slots
    let slotsHtml = '';
    for (let i = 0; i < 6; i++) {
        if (i < activeNums.length) {
            const n = activeNums[i];
            const colorClass = (typeof getBallColorClass === 'function') ? getBallColorClass(n) : 'ball-yellow';
            slotsHtml += `<span class="ball-mini ${colorClass}" style="width:30px; height:30px; font-size:0.8rem; cursor:pointer;" onclick="window.toggleBallInActiveGame && window.toggleBallInActiveGame(${n})">${n}</span>`;
        } else {
            slotsHtml += `<span class="ball-slot-item">${i + 1}</span>`;
        }
    }
    slotsContainer.innerHTML = slotsHtml;

    // 3. Update Prompt
    if (promptEl) {
        if (activeNums.length === 6) {
            promptEl.innerHTML = `<i class="fa-solid fa-check-circle" style="color: #34d399;"></i> <strong>[${activeLetter} 게임]</strong> 선택 완료 (6/6)`;
        } else {
            promptEl.innerHTML = `<i class="fa-solid fa-hand-pointer" style="color: #a78bfa;"></i> <strong>[${activeLetter} 게임]</strong> 번호 ${6 - activeNums.length}개를 더 선택하세요 (${activeNums.length}/6)`;
        }
    }

    // 4. Render 1~45 Keypad (DOM caching)
    if (keypadContainer.children.length !== 45) {
        let gridHtml = '';
        for (let num = 1; num <= 45; num++) {
            const colorClass = (typeof getBallColorClass === 'function') ? getBallColorClass(num) : 'ball-yellow';
            gridHtml += `<button type="button" class="ball-keypad-btn ${colorClass}" data-num="${num}" onclick="window.toggleBallInActiveGame && window.toggleBallInActiveGame(${num})">${num}</button>`;
        }
        keypadContainer.innerHTML = gridHtml;
    }

    // Update selected states
    Array.from(keypadContainer.children).forEach(btn => {
        const num = parseInt(btn.dataset.num, 10);
        if (activeNums.includes(num)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

export function switchManualLedgerMode(mode = 'qr') {
    const tabOnline = document.getElementById('tabBtnOnlineReceipt');
    const tabQr = document.getElementById('tabBtnQrScan');
    const tabBall = document.getElementById('tabBtnTouchBall');

    const secOnline = document.getElementById('sectionOnlineReceipt');
    const secQr = document.getElementById('qrScannerSection');
    const secBall = document.getElementById('sectionTouchBall');

    if (!tabOnline || !tabQr || !tabBall) return;

    [tabOnline, tabQr, tabBall].forEach(t => t.classList.remove('active'));

    if (secOnline) secOnline.style.display = 'none';
    if (secQr) secQr.style.display = 'none';
    if (secBall) secBall.style.display = 'none';

    if (mode === 'online') {
        tabOnline.classList.add('active');
        if (secOnline) secOnline.style.display = 'flex';
        try { localStorage.setItem('lucky777_manual_reg_mode', 'online'); } catch(e) {}
        stopScanning();
        const txtInput = document.getElementById('onlineReceiptTextInput');
        if (txtInput && !txtInput.value.trim()) {
            const combosEl = document.getElementById('manualLedgerCombos');
            if (combosEl && combosEl.value.trim()) {
                txtInput.value = combosEl.value.trim();
            }
        }
    } else if (mode === 'ball') {
        tabBall.classList.add('active');
        if (secBall) secBall.style.display = 'flex';
        try { localStorage.setItem('lucky777_manual_reg_mode', 'ball'); } catch(e) {}
        stopScanning();
        initBallPickerFromCombos();
        renderBallPickerUI();
    } else {
        // Default: 'qr' (지류 복권 실시간 QR스캔)
        tabQr.classList.add('active');
        if (secQr) secQr.style.display = 'flex';
        try { localStorage.setItem('lucky777_manual_reg_mode', 'qr'); } catch(e) {}
        setTimeout(() => {
            startLottoQrScanner();
        }, 200);
    }
}

export function handleOnlineReceiptTextChange(rawText) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) return;
    const parsed = parseDonghangOnlineReceiptText(rawText);
    
    const roundInput = document.getElementById('manualLedgerRound');
    const combosEl = document.getElementById('manualLedgerCombos');

    if (parsed && Array.isArray(parsed.combos) && parsed.combos.length > 0) {
        if (roundInput && parsed.round) {
            roundInput.value = parsed.round;
            syncLedgerDateGuide(parsed.round);
        }

        if (combosEl) {
            combosEl.value = parsed.combos.map(c => c.numbers.join(' ')).join('\n');
            combosEl.dataset.qrSerial = parsed.serial || '';
            combosEl.dataset.qrScanned = 'true';
            combosEl.dataset.isOnlineReceipt = 'true';
            combosEl.dataset.qrRound = parsed.round || '';
        }

        // Sync into ballPickerState
        ['A', 'B', 'C', 'D', 'E'].forEach((letter, idx) => {
            if (parsed.combos[idx]) {
                ballPickerState.games[letter] = [...parsed.combos[idx].numbers];
            } else {
                ballPickerState.games[letter] = [];
            }
        });

        updateManualModalCrossCheck();

        try {
            if (navigator.vibrate) navigator.vibrate([15, 30, 15]);
        } catch(e) {}

        const drawDateStr = parsed.date ? ` (구매일시: ${parsed.date})` : '';
        showToast(`🎉 온라인 영수증 인식 성공: ${parsed.round ? `제 ${parsed.round}회차 ` : ''}${parsed.combos.length}게임${drawDateStr}`);
    } else {
        // Fallback: check if raw text contains multiple 6-number lines
        const lines = rawText.trim().split('\n').filter(l => l.trim().length > 0);
        const validLines = [];
        lines.forEach(l => {
            const nums = (l.match(/\b\d{1,2}\b/g) || []).map(Number).filter(n => n >= 1 && n <= 45);
            if (nums.length >= 6) {
                const game6 = nums.slice(-6).sort((a,b) => a - b);
                if (new Set(game6).size === 6) {
                    validLines.push(game6.join(' '));
                }
            }
        });

        if (validLines.length > 0 && combosEl) {
            combosEl.value = validLines.slice(0, 5).join('\n');
            combosEl.dataset.isOnlineReceipt = 'true';
            updateManualModalCrossCheck();
            showToast(`✅ ${validLines.length}개 게임 번호가 감지되어 등록되었습니다.`);
        }
    }
}

export async function pasteFromMobileClipboard() {
    try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            showToast('⚠️ 브라우저가 클립보드 읽기를 지원하지 않습니다. 텍스트 창에 직접 붙여넣어 주세요.');
            const txt = document.getElementById('onlineReceiptTextInput');
            if (txt) txt.focus();
            return;
        }

        const text = await navigator.clipboard.readText();
        if (!text || text.trim().length === 0) {
            showToast('⚠️ 클립보드가 비어 있습니다. 동행복권 구매내역을 먼저 복사해주세요.');
            return;
        }

        const txt = document.getElementById('onlineReceiptTextInput');
        if (txt) {
            txt.value = text;
        }
        handleOnlineReceiptTextChange(text);
    } catch(err) {
        console.warn('[Clipboard Read Warn]', err);
        showToast('📋 클립보드 접근 권한이 필요합니다. 아래 입력창에 직접 붙여넣어 주세요.');
        const txt = document.getElementById('onlineReceiptTextInput');
        if (txt) txt.focus();
    }
}

/**
 * 🖼️ In-browser Canvas Preprocessing for Online Receipt Screenshots
 * - Scales up 2x if needed for crisp character recognition
 * - Inverts dark theme (#222222 Donghang ticket) to black text on white background
 * - Enhances contrast
 */
export async function preprocessReceiptImage(fileOrBlob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    // Standardize canvas width to optimal OCR range: ~1200px
                    let targetWidth = 1200;
                    let scale = targetWidth / img.width;
                    if (img.width >= 1000 && img.width <= 1400) {
                        scale = 1;
                    } else if (scale > 2.5) {
                        scale = 2.5;
                    } else if (scale < 0.5) {
                        scale = 0.5;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const data = imgData.data;

                    // Sample border corners and ticket central area to reliably detect dark theme
                    let totalBrightness = 0;
                    let sampleCount = 0;

                    const samplePoints = [
                        0,
                        4 * (canvas.width - 1),
                        4 * (canvas.width * (canvas.height - 1)),
                        4 * (canvas.width * canvas.height - 1),
                        4 * Math.floor(canvas.width / 2),
                        4 * Math.floor(canvas.width * (canvas.height - 1) + canvas.width / 2)
                    ];

                    for (let py = 0.3; py <= 0.7; py += 0.2) {
                        for (let px = 0.3; px <= 0.7; px += 0.2) {
                            const idx = 4 * Math.floor(canvas.width * Math.floor(canvas.height * py) + canvas.width * px);
                            samplePoints.push(idx);
                        }
                    }

                    samplePoints.forEach(p => {
                        if (p >= 0 && p < data.length - 3) {
                            totalBrightness += (data[p] * 0.299 + data[p+1] * 0.587 + data[p+2] * 0.114);
                            sampleCount++;
                        }
                    });
                    const avgBrightness = sampleCount > 0 ? (totalBrightness / sampleCount) : 128;
                    const isDarkBg = avgBrightness < 135;

                    for (let i = 0; i < data.length; i += 4) {
                        const r = data[i], g = data[i+1], b = data[i+2];
                        let gray = 0.299 * r + 0.587 * g + 0.114 * b;

                        // Invert if dark background (white text on dark -> dark text on white)
                        if (isDarkBg) {
                            gray = 255 - gray;
                        }

                        // Moderate contrast stretch to preserve stroke connectivity without washing out
                        let enhanced = gray;
                        if (enhanced < 120) {
                            enhanced = Math.max(0, enhanced - 25);
                        } else if (enhanced > 170) {
                            enhanced = Math.min(255, enhanced + 25);
                        }

                        data[i] = enhanced;
                        data[i+1] = enhanced;
                        data[i+2] = enhanced;
                    }

                    ctx.putImageData(imgData, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.95));
                } catch(err) {
                    console.warn('[Preprocessing fallback]', err);
                    resolve(e.target.result);
                }
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileOrBlob);
    });
}

let tesseractLoadPromise = null;
export async function ensureTesseractLoaded() {
    if (window.Tesseract && typeof window.Tesseract.createWorker === 'function') {
        return window.Tesseract;
    }
    if (tesseractLoadPromise) return tesseractLoadPromise;

    tesseractLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        script.onload = () => {
            if (window.Tesseract) resolve(window.Tesseract);
            else reject(new Error('Tesseract script loaded but object missing'));
        };
        script.onerror = () => {
            // Fallback unpkg
            const fbScript = document.createElement('script');
            fbScript.src = 'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';
            fbScript.async = true;
            fbScript.onload = () => {
                if (window.Tesseract) resolve(window.Tesseract);
                else reject(new Error('Fallback Tesseract load failed'));
            };
            fbScript.onerror = () => reject(new Error('Failed to load Tesseract.js from CDN'));
            document.head.appendChild(fbScript);
        };
        document.head.appendChild(script);
    });

    return tesseractLoadPromise;
}

export async function recognizeOnlineReceiptImage(fileOrBlob, onProgress = null) {
    if (onProgress) onProgress('📷 영수증 이미지 전처리 중...', 15);
    const processedUrl = await preprocessReceiptImage(fileOrBlob);

    if (onProgress) onProgress('⚡ AI OCR 엔진 준비 중...', 35);
    const TesseractObj = await ensureTesseractLoaded();

    if (onProgress) onProgress('🧠 복권 영수증 문자 인식 중...', 50);
    const worker = await TesseractObj.createWorker('kor+eng', 1, {
        logger: m => {
            if (m && m.status === 'recognizing text' && m.progress != null) {
                const pct = 50 + Math.round(m.progress * 45); // 50% ~ 95%
                if (onProgress) onProgress(`🧠 문자 정밀 분석 중 (${Math.round(m.progress * 100)}%)`, pct);
            }
        }
    });

    const ocrResult = await worker.recognize(processedUrl);
    await worker.terminate();

    if (onProgress) onProgress('✨ 영수증 번호 추출 완료!', 100);
    return ocrResult && ocrResult.data ? ocrResult.data.text : '';
}

export async function processOnlineScreenshotFileDirect(file) {
    if (!file) return false;

    // Ensure we are in online tab
    switchManualLedgerMode('online');

    const statusBox = document.getElementById('onlineReceiptOcrLoading');
    const statusText = document.getElementById('onlineReceiptOcrStatusText');
    const progressBar = document.getElementById('onlineReceiptOcrProgressBar');
    
    const setStatus = (msg, pct) => {
        if (statusBox) statusBox.style.display = 'flex';
        if (statusText) statusText.textContent = msg;
        if (progressBar) progressBar.style.width = `${pct}%`;
    };

    setStatus('📷 스크린샷 이미지 분석 준비 중...', 10);
    showToast('🔍 온라인 영수증 스크린샷을 분석 중입니다...');

    try {
        // Step 1: In case user chose a paper ticket photo with a QR code, check BarcodeDetector first (< 50ms)
        let qrProcessed = false;
        if ('BarcodeDetector' in window) {
            try {
                const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                const bitmap = await createImageBitmap(file);
                const barcodes = await detector.detect(bitmap);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    qrProcessed = processLottoQrPayload(barcodes[0].rawValue);
                }
            } catch(bdErr) {}
        }

        if (qrProcessed) {
            if (statusBox) statusBox.style.display = 'none';
            showToast('🎉 QR코드가 감지되어 즉시 등록되었습니다.');
            return true;
        }

        // Step 2: Run AI OCR for Online Mobile Ticket Screenshot
        const rawOcrText = await recognizeOnlineReceiptImage(file, setStatus);
        console.log('[Online Receipt OCR raw output]:', rawOcrText);

        if (!rawOcrText || rawOcrText.trim().length === 0) {
            throw new Error('이미지에서 문자를 인식하지 못했습니다.');
        }

        const parsed = parseDonghangOnlineReceiptText(rawOcrText);
        if (!parsed || !Array.isArray(parsed.combos) || parsed.combos.length === 0) {
            throw new Error('영수증의 5개 게임 번호를 찾을 수 없습니다. 선명한 티켓 화면인지 확인해주세요.');
        }

        // Populate textarea with formatted receipt
        const txtInput = document.getElementById('onlineReceiptTextInput');
        if (txtInput) {
            const formattedLines = [];
            formattedLines.push(`[동행복권 온라인 영수증]`);
            if (parsed.round) formattedLines.push(`제 ${parsed.round}회`);
            if (parsed.date) formattedLines.push(`발행일: ${parsed.date}`);
            parsed.combos.forEach(c => {
                const tName = c.type === 'manual' ? '수동' : (c.type === 'semi' ? '반자동' : '자동');
                formattedLines.push(`${c.letter} ${tName} ${c.numbers.map(n => String(n).padStart(2, '0')).join(' ')}`);
            });
            if (parsed.serial) formattedLines.push(`일련번호: ${parsed.serial}`);
            formattedLines.push(`합계: ${(parsed.combos.length * 1000).toLocaleString()}원`);
            txtInput.value = formattedLines.join('\n');
        }

        // Apply to modal fields
        const roundInput = document.getElementById('manualLedgerRound');
        const combosEl = document.getElementById('manualLedgerCombos');
        const versionSelect = document.getElementById('manualLedgerVersion');

        if (roundInput && parsed.round) {
            roundInput.value = parsed.round;
            syncLedgerDateGuide(parsed.round);
        }

        if (combosEl) {
            combosEl.value = parsed.combos.map(c => c.numbers.map(n => String(n).padStart(2, '0')).join(' ')).join('\n');
            combosEl.dataset.qrSerial = parsed.serial || '';
            combosEl.dataset.qrScanned = 'true';
            combosEl.dataset.isOnlineReceipt = 'true';
            combosEl.dataset.qrRound = parsed.round || '';
            combosEl.dataset.purchaseDate = parsed.date || '';
        }

        if (versionSelect) {
            versionSelect.value = '온라인 실구매 영수증 (5게임)';
        }

        // Sync into ballPickerState
        ['A', 'B', 'C', 'D', 'E'].forEach((letter, idx) => {
            if (parsed.combos[idx]) {
                ballPickerState.games[letter] = [...parsed.combos[idx].numbers];
            } else {
                ballPickerState.games[letter] = [];
            }
        });

        // Trigger AI cross-check and render digital receipt preview card
        updateManualModalCrossCheck();

        // Update save button to highlight purchase confirmation
        const saveBtnText = document.getElementById('btnSaveManualLedgerText');
        const btnSave = document.getElementById('btnSaveManualLedger');
        const totalWon = (parsed.combos.length * 1000).toLocaleString();
        if (saveBtnText) {
            saveBtnText.innerHTML = `<strong>실구매 구매확정 (+${totalWon}원)</strong>`;
        }
        if (btnSave) {
            btnSave.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btnSave.style.boxShadow = '0 4px 18px rgba(16, 185, 129, 0.5)';
        }

        // Haptic feedback
        try {
            if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        } catch(e) {}

        if (statusBox) {
            setStatus('✨ 영수증 불러오기 성공!', 100);
            setTimeout(() => { statusBox.style.display = 'none'; }, 2000);
        }

        showToast(`🎉 온라인 영수증 ${parsed.combos.length}게임 인식 성공! [실구매 구매확정]을 눌러 저장하세요.`);

        // Scroll to preview card
        const previewContainer = document.getElementById('qrScannedReceiptPreview');
        if (previewContainer) {
            previewContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        return true;
    } catch(err) {
        console.error('[Online Screenshot OCR Error]', err);
        if (statusBox) statusBox.style.display = 'none';
        alert(`⚠️ 온라인 영수증 스크린샷 인식 안내:\n\n${err.message || '영수증 이미지를 분석할 수 없습니다.'}\n\n💡 팁: 동행복권 모바일 [마이페이지 > 구매당첨내역 > 구매상세 (티켓 보기)] 화면을 캡처한 스크린샷인지 확인해주세요.\n또는 화면의 텍스트를 복사하여 [텍스트 붙여넣기]를 이용하실 수도 있습니다.`);
        return false;
    }
}

export async function handleOnlineScreenshotFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Reset file input value so user can pick the same file again if desired
    try { event.target.value = ''; } catch(e) {}

    await processOnlineScreenshotFileDirect(file);
}

export function setupManualLedgerModal() {
    const btnOpenManualLedger = document.getElementById('btnOpenManualLedger');
    const manualLedgerModal = document.getElementById('manualLedgerModal');
    const btnCloseManualLedgerModal = document.getElementById('closeManualLedgerModal');
    const btnSaveManualLedger = document.getElementById('btnSaveManualLedger');
    
    if (btnOpenManualLedger) {
        btnOpenManualLedger.addEventListener('click', () => {
            openManualLedgerModal();
        });
    }

    const roundInputEl = document.getElementById('manualLedgerRound');
    if (roundInputEl) {
        roundInputEl.addEventListener('input', (e) => {
            syncLedgerDateGuide(e.target.value);
            updateManualModalCrossCheck();
        });
        roundInputEl.addEventListener('change', (e) => {
            syncLedgerDateGuide(e.target.value);
            updateManualModalCrossCheck();
        });
    }

    const combosInputEl = document.getElementById('manualLedgerCombos');
    if (combosInputEl) {
        combosInputEl.addEventListener('input', updateManualModalCrossCheck);
        combosInputEl.addEventListener('change', updateManualModalCrossCheck);
    }

    const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
    if (masterUserSelect) {
        masterUserSelect.addEventListener('change', () => {
            const combosEl = document.getElementById('manualLedgerCombos');
            if (combosEl) {
                combosEl._cachedCrossCheck = null;
            }
            updateManualModalCrossCheck();
            const selectedUId = (masterUserSelect.value || '').trim().toLowerCase();
            const uName = (typeof getUserRealName === 'function' ? getUserRealName(selectedUId) : '') || selectedUId;
            showToast(`👤 대리 등록 대상 회원: [${uName}] 지정됨`);

            const saveBtnText = document.getElementById('btnSaveManualLedgerText');
            const currentLoggedAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
            const memberPrefix = (selectedUId && selectedUId !== currentLoggedAuthId) ? `[${uName}] 님 ` : '';
            const isOnline = combosEl && (combosEl.dataset.isOnlineReceipt === 'true');
            if (saveBtnText) {
                saveBtnText.innerHTML = isOnline
                    ? `<strong>${memberPrefix}온라인 실구매 구매확정</strong>`
                    : `${memberPrefix}실구매 등록하기`;
            }
        });
    }

    const onlineTextInput = document.getElementById('onlineReceiptTextInput');
    if (onlineTextInput) {
        let textDebounceTimer = null;
        onlineTextInput.addEventListener('input', (e) => {
            clearTimeout(textDebounceTimer);
            textDebounceTimer = setTimeout(() => {
                handleOnlineReceiptTextChange(e.target.value);
            }, 150);
        });
        onlineTextInput.addEventListener('paste', (e) => {
            // Check if clipboard contains an image (e.g. screenshot copied via Ctrl+V or screenshot tool)
            if (e.clipboardData && e.clipboardData.items) {
                for (let item of e.clipboardData.items) {
                    if (item.type && item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        if (file) {
                            e.preventDefault();
                            processOnlineScreenshotFileDirect(file);
                            return;
                        }
                    }
                }
            }
            setTimeout(() => {
                handleOnlineReceiptTextChange(e.target.value);
            }, 50);
        });
    }

    const secOnline = document.getElementById('sectionOnlineReceipt');
    if (secOnline) {
        secOnline.addEventListener('dragover', (e) => { e.preventDefault(); });
        secOnline.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                processOnlineScreenshotFileDirect(e.dataTransfer.files[0]);
            }
        });
    }

    const btnOpenQrScanner = document.getElementById('btnOpenQrScanner');
    const btnStopQrScanner = document.getElementById('btnStopQrScanner');
    const qrScannerContainer = document.getElementById('qrScannerContainer');

    if (btnOpenQrScanner) {
        btnOpenQrScanner.addEventListener('click', async () => {
            await stopScanning();
            await startLottoQrScanner();
        });
    }

    if (btnStopQrScanner) {
        btnStopQrScanner.addEventListener('click', async () => {
            await stopScanning();
        });
    }

    if (btnCloseManualLedgerModal && manualLedgerModal) {
        btnCloseManualLedgerModal.addEventListener('click', async () => {
            await stopScanning();
            manualLedgerModal.style.display = 'none';
        });
    }

    if (manualLedgerModal) {
        manualLedgerModal.addEventListener('click', async (e) => {
            if (e.target === manualLedgerModal) {
                await closeManualLedgerModal();
            }
        });
    }
    
    if (btnSaveManualLedger && manualLedgerModal) {
        btnSaveManualLedger.onclick = (e) => {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            handleSaveManualLedger();
        };
    }
}

let isTorchActive = false;
let currentZoomLevel = 1.0;

/**
 * 🔒 Parse and apply Donghang Lottery QR Payload (Universal across all smartphone browsers)
 */
export function processLottoQrPayload(rawText) {
    if (!rawText) return false;
    let decodedText = String(rawText).trim();
    try {
        decodedText = decodeURIComponent(decodedText);
    } catch(e) {}
    console.log(`[QR Scanner] Processing payload: ${decodedText}`);

    try {
        const parsed = parseDonghangLotteryQrUrl(decodedText);
        if (parsed && parsed.round && Array.isArray(parsed.combos) && parsed.combos.length > 0) {
            const round = parsed.round;
            const combosText = parsed.combos.map(c => c.numbers.join(', ')).join('\n');
            const serial = parsed.serial || `${String(round).padStart(4, '0')}${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
            const canonicalUrl = buildDonghangLotteryQrUrl(round, parsed.combos, serial, decodedText);

            // Automatically fill and sync round info
            const roundEl = document.getElementById('manualLedgerRound');
            if (roundEl) {
                roundEl.value = round;
                syncLedgerDateGuide(round);

                const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1240);
                if (round < currentRound) {
                    const guideEl = document.getElementById('manualLedgerDateGuide');
                    if (guideEl) {
                        guideEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> 과거 회차 등록: <strong>제 ${round}회차</strong> 영수증을 현재 장부에 추가합니다.`;
                        guideEl.style.display = 'block';
                        guideEl.style.background = 'rgba(245, 158, 11, 0.1)';
                        guideEl.style.color = '#fbbf24';
                    }
                }
            }

            // Automatically fill combinations
            const combosEl = document.getElementById('manualLedgerCombos');
            if (combosEl) {
                combosEl.removeAttribute('readonly');
                combosEl.style.background = 'rgba(16, 185, 129, 0.08)';
                combosEl.style.borderColor = '#10b981';
                combosEl.style.color = '#f1f5f9';
                combosEl.style.cursor = 'default';
                combosEl.value = combosText;
                combosEl.dataset.qrScanned = 'true';
                combosEl.dataset.qrRawUrl = canonicalUrl;
                combosEl.dataset.qrSerial = serial;
                combosEl.dataset.qrRound = String(round);
                // 지류 QR 스캔은 항상 오프라인 채널 (직전 온라인 영수증 탭 사용 흔적 제거)
                combosEl.dataset.isOnlineReceipt = 'false';
                combosEl._cachedCrossCheck = null;
                stopScanning();

                // Trigger real-time cross check immediately
                updateManualModalCrossCheck();
                
                // Haptic feedback & visual indicator
                if (navigator.vibrate) {
                    try { navigator.vibrate([50, 70, 50]); } catch(e) {}
                }

                // 🔍 연속 등록 중 동일 영수증 재스캔 감지
                const dupReceipt = findAlreadyRegisteredQrReceipt(round, serial, parsed.combos, getManualLedgerTargetUserId());
                if (dupReceipt) {
                    combosEl.dataset.qrDuplicate = 'true';
                    showToast(`⚠️ 이미 등록된 영수증입니다 (제 ${round}회차). 다음 영수증을 스캔해주세요.`, 4000);
                    return true;
                }
                delete combosEl.dataset.qrDuplicate;

                const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1240);
                const isPastRound = round < currentRound;
                showToast(`📷 QR 인식 완료: 제 ${round}회차 ${isPastRound ? '(과거 회차)' : '(이번 주)'} ${parsed.combos.length}게임 · [구매확정] 버튼을 눌러 저장하세요`);
                return true;
            } else {
                alert(`QR 코드에서 ${round}회차 정보는 확인되었으나, 유효한 6개 번호 조합을 파싱하지 못했습니다.\n\n영수증의 QR코드가 훼손되지 않았는지 확인해주세요.`);
                return false;
            }
        } else {
            // 실시간 카메라는 초당 15회 디코딩 → 같은 비로또 QR에 대해 alert가 무한 반복되지 않도록 5초 스로틀
            const now = Date.now();
            if (decodedText === lastInvalidQrText && (now - lastInvalidQrAt) < 5000) {
                return false;
            }
            lastInvalidQrText = decodedText;
            lastInvalidQrAt = now;
            showToast('⚠️ 동행복권 로또 QR 코드가 아닙니다. 영수증의 공식 QR 코드를 비춰주세요.', 3500);
            return false;
        }

    } catch(e) {
        console.error('[QR Parser Error]', e);
        alert('QR 코드 분석 실패: ' + e.message);
        return false;
    }
}

/**
 * 📷 Start QR Scanner with Universal Multi-tier Hardware/Camera Fallbacks
 */
export async function startLottoQrScanner() {
    // 1. If a stop operation is currently underway, wait for hardware release to complete (with safety timeout)
    if (stopScanningPromise) {
        try {
            await Promise.race([
                stopScanningPromise,
                new Promise(r => setTimeout(r, 400))
            ]);
        } catch(e) {}
    }

    // Force release any edge-case flag lock
    isStartingScanner = false;

    // 2. Increment session ID so any obsolete callbacks/attempts are rejected
    currentScannerSessionId++;
    const thisSessionId = currentScannerSessionId;
    isStartingScanner = true;

    try {
        const qrScannerContainer = document.getElementById('qrScannerContainer');
        const previewContainer = document.getElementById('qrScannedReceiptPreview');
        if (previewContainer) {
            previewContainer.style.display = 'none';
        }

        if (qrScannerContainer) {
            qrScannerContainer.style.display = 'block';
        }

        // Stop and completely clear any previous scanner & DOM safely
        if (html5QrScanner) {
            const prev = html5QrScanner;
            html5QrScanner = null;
            await safeStopScanner(prev, 300);
        }
        forceKillAllCameraTracks();
        resetQrReaderDOM();

        if (typeof Html5Qrcode === 'undefined') {
            alert('QR 스캔 엔진을 불러오는 중입니다. 1~2초 후 다시 시도해주세요.');
            return;
        }

        const qrCodeSuccessCallback = (decodedText) => {
            if (thisSessionId !== currentScannerSessionId) return;
            processLottoQrPayload(decodedText);
        };

        const config = {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.max(100, Math.floor(minEdge * 0.85));
                return { width: size, height: size };
            },
            aspectRatio: 1.33,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: true
            }
        };

        // Clean attempt runner: ensures each attempt gets a fresh DOM and single scanner instance
        async function attemptStart(cameraSource, retryDelay = 0) {
            if (thisSessionId !== currentScannerSessionId) return false;
            if (retryDelay > 0) {
                await new Promise(r => setTimeout(r, retryDelay));
            }
            if (thisSessionId !== currentScannerSessionId) return false;

            try {
                if (html5QrScanner) {
                    const prev = html5QrScanner;
                    html5QrScanner = null;
                    await safeStopScanner(prev, 300);
                }
                forceKillAllCameraTracks();
                resetQrReaderDOM();

                const scanner = new Html5Qrcode("qrReader", {
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                    verbose: false
                });

                await scanner.start(cameraSource, config, qrCodeSuccessCallback);

                if (thisSessionId !== currentScannerSessionId) {
                    await safeStopScanner(scanner, 300);
                    forceKillAllCameraTracks();
                    return false;
                }

                html5QrScanner = scanner;
                return true;
            } catch (err) {
                console.warn('[QR Camera Attempt Failed]:', cameraSource, err);
                forceKillAllCameraTracks();
                resetQrReaderDOM();
                return false;
            }
        }

        // Hardware driver cooldown: 200ms pause to ensure mobile camera HAL release
        await new Promise(r => setTimeout(r, 200));
        if (thisSessionId !== currentScannerSessionId) return;

        let started = false;

        // 1단계: facingMode environment (후면 카메라 기본 시도)
        started = await attemptStart({ facingMode: "environment" });

        // 1.5단계: OS 카메라 드라이버 해제 대기(300ms Backoff Cooldown) 후 재시도
        // 스마트폰에서 연속 등록 시 직전 카메라 스트림 해제가 100~300ms 지연될 수 있음
        if (!started && thisSessionId === currentScannerSessionId) {
            console.log('[QR Scanner] Retrying environment camera with 300ms driver cooldown backoff...');
            started = await attemptStart({ facingMode: "environment" }, 300);
        }

        // 2단계: 실패 시 카메라 목록 조회 후 최적 후면 카메라 ID 직접 선택
        if (!started && thisSessionId === currentScannerSessionId) {
            try {
                const cameras = await Html5Qrcode.getCameras();
                if (cameras && cameras.length > 0) {
                    let selectedCam = cameras.find(c => {
                        const lbl = (c.label || '').toLowerCase();
                        return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment') || lbl.includes('후면');
                    });
                    if (!selectedCam) {
                        selectedCam = cameras[cameras.length - 1];
                    }
                    if (selectedCam && selectedCam.id) {
                        started = await attemptStart(selectedCam.id, 200);
                    }
                }
            } catch(camListErr) {
                console.warn('[QR Scanner getCameras failed]', camListErr);
            }
        }

        // 3단계: 기본 카메라 facingMode user 시도
        if (!started && thisSessionId === currentScannerSessionId) {
            started = await attemptStart({ facingMode: "user" }, 200);
        }

        if (thisSessionId !== currentScannerSessionId) {
            return;
        }

        if (started) {
            setupCameraCapabilities();
        } else {
            await stopScanning();
            alert('📷 실시간 카메라 화면을 시작할 수 없습니다.\n\n카메라 권한이 차단되었거나 스마트폰 카메라가 다른 앱에 의해 사용 중일 수 있습니다.\n\n바로 옆의 [📸 사진촬영/갤러리] 버튼을 누르시면 사진을 찍어 100% 정상 등록하실 수 있습니다!');
        }
    } finally {
        isStartingScanner = false;
    }
}

/**
 * Check camera capabilities (torch, zoom) and show controls
 */
function setupCameraCapabilities() {
    try {
        if (!html5QrScanner) return;
        const capabilities = html5QrScanner.getRunningTrackCameraCapabilities ? html5QrScanner.getRunningTrackCameraCapabilities() : null;
        const btnTorch = document.getElementById('btnToggleTorch');
        const btnZoom = document.getElementById('btnToggleZoom');

        if (capabilities && capabilities.torchFeature && capabilities.torchFeature().isSupported()) {
            if (btnTorch) btnTorch.style.display = 'inline-flex';
        }

        if (capabilities && capabilities.zoomFeature && capabilities.zoomFeature().isSupported()) {
            if (btnZoom) btnZoom.style.display = 'inline-flex';
        }
    } catch(e) {
        console.warn('[Camera capabilities check warn]:', e);
    }
}

/**
 * 💡 Toggle Torch (Flashlight)
 */
export function toggleLottoTorch() {
    if (!html5QrScanner) return;
    try {
        const capabilities = html5QrScanner.getRunningTrackCameraCapabilities ? html5QrScanner.getRunningTrackCameraCapabilities() : null;
        if (capabilities && capabilities.torchFeature) {
            isTorchActive = !isTorchActive;
            capabilities.torchFeature().apply(isTorchActive);
            const btnTorch = document.getElementById('btnToggleTorch');
            if (btnTorch) {
                btnTorch.style.background = isTorchActive ? 'rgba(251, 191, 36, 0.85)' : 'rgba(251, 191, 36, 0.2)';
                btnTorch.style.color = isTorchActive ? '#0f172a' : '#fef08a';
                btnTorch.innerHTML = `<i class="fa-solid fa-lightbulb"></i> 플래시 ${isTorchActive ? 'ON' : 'OFF'}`;
            }
        }
    } catch(e) {
        console.warn('Torch toggle error:', e);
    }
}

/**
 * 🔍 Toggle Zoom (1.0x -> 1.5x -> 2.0x -> 1.0x)
 */
export function toggleLottoZoom() {
    if (!html5QrScanner) return;
    try {
        const capabilities = html5QrScanner.getRunningTrackCameraCapabilities ? html5QrScanner.getRunningTrackCameraCapabilities() : null;
        if (capabilities && capabilities.zoomFeature) {
            const zoomFeature = capabilities.zoomFeature();
            const minZ = zoomFeature.min() || 1.0;
            const maxZ = zoomFeature.max() || 3.0;
            
            if (currentZoomLevel === 1.0 && maxZ >= 1.5) {
                currentZoomLevel = 1.5;
            } else if (currentZoomLevel === 1.5 && maxZ >= 2.0) {
                currentZoomLevel = 2.0;
            } else {
                currentZoomLevel = 1.0;
            }
            
            zoomFeature.apply(currentZoomLevel);
            const btnZoom = document.getElementById('btnToggleZoom');
            if (btnZoom) {
                btnZoom.innerHTML = `<i class="fa-solid fa-magnifying-glass-plus"></i> ${currentZoomLevel}x 확대`;
            }
        }
    } catch(e) {
        console.warn('Zoom toggle error:', e);
    }
}

/**
 * 📸 Handle Photo / Gallery Image file selection with Multi-engine OCR decoding
 */
export async function handleLottoQrFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Stop active camera stream cleanly before file scanning to prevent canvas/DOM collision
    await stopScanning();

    showToast('🔍 영수증 사진을 정밀 분석 중입니다...');

    // 1. Try Native BarcodeDetector (Hardware Accelerated)
    if ('BarcodeDetector' in window) {
        try {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const imageBitmap = await createImageBitmap(file);
            const barcodes = await detector.detect(imageBitmap);
            if (barcodes && barcodes.length > 0) {
                const detected = barcodes[0].rawValue;
                if (processLottoQrPayload(detected)) {
                    event.target.value = '';
                    return;
                }
            }
        } catch(e) {
            console.warn('[Native BarcodeDetector file attempt failed, trying Html5Qrcode]', e);
        }
    }

    // 2. Try Html5Qrcode file scan
    if (typeof Html5Qrcode !== 'undefined') {
        try {
            const fileScanner = new Html5Qrcode("qrReader", {
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                verbose: false
            });
            const decodedText = await fileScanner.scanFile(file, true);
            if (decodedText) {
                if (processLottoQrPayload(decodedText)) {
                    event.target.value = '';
                    return;
                }
            }
        } catch(err) {
            console.warn('[Html5Qrcode file scan failed, trying downscaled canvas enhanced scan]', err);
        }
    }

    // 3. Fallback: Downscaled Multi-contrast Canvas Preprocessor
    try {
        const enhancedResult = await scanWithContrastEnhancement(file);
        if (enhancedResult && processLottoQrPayload(enhancedResult)) {
            event.target.value = '';
            return;
        }
    } catch(e) {
        console.error('[Enhanced scan error]', e);
    }

    // 4. Fallback: If no paper QR code was found, check if this is an online lottery receipt screenshot
    try {
        showToast('💡 QR코드가 없어 온라인 영수증(OCR) 자동 인식을 진행합니다...');
        const ocrSuccess = await processOnlineScreenshotFileDirect(file);
        if (ocrSuccess) {
            event.target.value = '';
            return;
        }
    } catch(ocrErr) {
        console.warn('[Online OCR fallback in handleLottoQrFile failed]', ocrErr);
    }

    event.target.value = '';
    alert('⚠️ 사진에서 로또 QR 코드 또는 온라인 영수증을 인식하지 못했습니다.\n\n• 실물 복권인 경우 영수증 상단의 QR 코드가 잘 보이도록 다시 촬영해주세요.\n• 온라인 복권인 경우 [마이페이지 > 구매상세 (티켓 보기)] 화면을 캡처한 스크린샷인지 확인해주세요.');
}

/**
 * Helper to scan with downscaling & canvas grayscale contrast boost
 */
async function scanWithContrastEnhancement(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = async () => {
                try {
                    // Downscale large camera photos (12MP ~ 48MP) to optimal max 1600px
                    const maxDim = 1600;
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = w;
                    canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);

                    // 1) Try BarcodeDetector on downscaled original
                    if ('BarcodeDetector' in window) {
                        try {
                            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                            const barcodes = await detector.detect(canvas);
                            if (barcodes && barcodes.length > 0) {
                                resolve(barcodes[0].rawValue);
                                return;
                            }
                        } catch(bErr) {}
                    }

                    // 2) Apply High Contrast Grayscale Thresholding
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const d = imgData.data;
                    for (let i = 0; i < d.length; i += 4) {
                        const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
                        const enhanced = gray > 120 ? 255 : 0;
                        d[i] = enhanced;
                        d[i + 1] = enhanced;
                        d[i + 2] = enhanced;
                    }
                    ctx.putImageData(imgData, 0, 0);

                    // 3) Try BarcodeDetector on high contrast canvas
                    if ('BarcodeDetector' in window) {
                        try {
                            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                            const barcodes = await detector.detect(canvas);
                            if (barcodes && barcodes.length > 0) {
                                resolve(barcodes[0].rawValue);
                                return;
                            }
                        } catch(bErr) {}
                    }

                    // 4) Try Html5Qrcode on canvas blob
                    if (typeof Html5Qrcode !== 'undefined' && canvas.toBlob) {
                        canvas.toBlob(async (blob) => {
                            if (blob) {
                                try {
                                    const fileScanner = new Html5Qrcode("qrReader", { verbose: false });
                                    const blobFile = new File([blob], "enhanced_qr.png", { type: "image/png" });
                                    const decodedText = await fileScanner.scanFile(blobFile, true);
                                    if (decodedText) {
                                        resolve(decodedText);
                                        return;
                                    }
                                } catch(scanErr) {}
                            }
                            resolve(null);
                        }, 'image/png');
                        return;
                    }

                    resolve(null);
                } catch(err) {
                    resolve(null);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

if (typeof window !== 'undefined') {
    window.startLottoQrScanner = startLottoQrScanner;
    window.handleLottoQrFile = handleLottoQrFile;
    window.toggleLottoTorch = toggleLottoTorch;
    window.toggleLottoZoom = toggleLottoZoom;
    window.processLottoQrPayload = processLottoQrPayload;
}

export async function handleSaveManualLedger() {
    // 🔒 0. 중복 실행 방지 (하단 버튼 + 카드 내 [구매확정] 버튼 연타 시 이중 저장 차단)
    if (isSavingManualLedger) {
        console.log('[handleSaveManualLedger] Save already in progress — ignored duplicate tap');
        return;
    }
    isSavingManualLedger = true;

    const btnSave = document.getElementById('btnSaveManualLedger');
    const origBtnHtml = btnSave ? btnSave.innerHTML : '<i class="fa-solid fa-save"></i> 실구매 등록하기';
    const manualLedgerModal = document.getElementById('manualLedgerModal');
    const isEditingExisting = !!state.editingLedgerInfo;

    // 1. Set ALL save buttons to saving state immediately (before any await)
    setManualLedgerSaveButtonsDisabled(true);
    if (btnSave) {
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 동기화 중...';
    }

    try {
        // 2. Stop camera and ensure hardware lock is released
        try { await stopScanning(); } catch(e) {}

        const roundInputEl = document.getElementById('manualLedgerRound');
        const roundInput = roundInputEl ? parseInt(roundInputEl.value.trim(), 10) : 0;
        const versionEl = document.getElementById('manualLedgerVersion');
        const versionStr = versionEl ? versionEl.value : 'QR 실구매 영수증 (5게임)';
        const combosEl = document.getElementById('manualLedgerCombos');
        const combosText = combosEl ? combosEl.value.trim() : '';
        
        if (!roundInput || isNaN(roundInput)) {
            alert('유효한 회차를 입력해주세요.');
            return;
        }
        if (!combosText) {
            alert('⚠️ 스캔된 번호 조합이 없습니다.\n\n[📷 QR 코드 다시 스캔하기] 버튼을 눌러 복권 영수증을 카메라로 비춰주세요.');
            setTimeout(() => { startLottoQrScanner(); }, 100);
            return;
        }

        // 🔒 Enforce QR Code Verification Only
        if (combosEl && combosEl.dataset.qrScanned !== 'true' && !combosEl.dataset.qrRawUrl) {
            alert('⚠️ [실구매 QR 인증 필수]\n\n로또 6/45 실구매 등록은 실물 복권 영수증의 QR코드 인식을 통해서만 등록이 가능합니다.\n\n[📷 QR 코드 다시 스캔하기] 또는 [영수증 사진 선택]을 통해 영수증을 인증해주세요.');
            await startLottoQrScanner();
            return;
        }

        const lines = combosText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
            alert('최소 1개 이상의 번호 조합을 입력해주세요.');
            return;
        }
        if (lines.length > 30) {
            alert(`한 번에 등록할 수 있는 최대 게임 수는 30줄입니다. (현재 ${lines.length}줄)`);
            return;
        }
        
        const newCombos = [];
        const parsedNumberArrays = [];

        for (let i = 0; i < lines.length; i++) {
            const numsStr = lines[i].replace(/,/g, ' ').split(/\s+/).filter(n => n !== '');
            if (numsStr.length !== 6) {
                alert(`${i+1}번째 줄에 6개의 숫자가 필요합니다. (현재 ${numsStr.length}개)`);
                return;
            }
            
            const nums = numsStr.map(Number);
            for (const n of nums) {
                if (isNaN(n) || n < 1 || n > 45) {
                    alert(`${i+1}번째 줄에 1~45 사이의 올바른 숫자를 입력해주세요.`);
                    return;
                }
            }
            
            const uniqueNums = new Set(nums);
            if (uniqueNums.size !== 6) {
                alert(`${i+1}번째 줄에 중복된 숫자가 있습니다.`);
                return;
            }
            
            nums.sort((a,b) => a - b);
            parsedNumberArrays.push(nums);
        }

        let originalUser = null;
        if (state.editingLedgerInfo) {
            const oldRound = state.editingLedgerInfo.round;
            const oldIdx = state.editingLedgerInfo.index;
            originalUser = state.editingLedgerInfo.user || null;
            const ledger = getLedger();
            if (ledger[oldRound] && ledger[oldRound][oldIdx]) {
                ledger[oldRound].splice(oldIdx, 1);
                if (ledger[oldRound].length === 0) {
                    delete ledger[oldRound];
                }
            }
            state.editingLedgerInfo = null;
        }

        const currentLoggedAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest').toLowerCase().trim();
        const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(currentLoggedAuthId) : (currentLoggedAuthId === 'master' || currentLoggedAuthId === 'admin'));
        const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
        const selectedMasterTargetUser = (isAdmin && masterUserSelect && masterUserSelect.value) 
            ? masterUserSelect.value.trim().toLowerCase() 
            : null;

        const effectiveAuthId = selectedMasterTargetUser || originalUser || currentLoggedAuthId || 'guest';

        // 🔍 연속 등록 중 이미 등록된 영수증 재저장 차단 (기존엔 조용히 중복제거되며 '정상 등록' 토스트만 노출되어 혼란 유발)
        if (!isEditingExisting) {
            const dupSerial = combosEl ? (combosEl.dataset.qrSerial || '') : '';
            const dupReceipt = findAlreadyRegisteredQrReceipt(roundInput, dupSerial, parsedNumberArrays, effectiveAuthId);
            if (dupReceipt) {
                const dupUserName = (typeof getUserRealName === 'function' ? getUserRealName(effectiveAuthId) : '') || effectiveAuthId;
                alert(`⚠️ [이미 등록된 영수증]\n\n[${dupUserName}] 회원님의 제 ${roundInput}회차 장부에 동일한 영수증이 이미 등록되어 있습니다.\n\n다음 영수증을 스캔해주세요.`);
                if (combosEl) {
                    combosEl.value = '';
                    delete combosEl.dataset.qrScanned;
                    delete combosEl.dataset.qrRawUrl;
                    delete combosEl.dataset.qrSerial;
                    delete combosEl.dataset.qrRound;
                    delete combosEl.dataset.qrDuplicate;
                    combosEl._cachedCrossCheck = null;
                }
                const resultBoxDup = document.getElementById('manualLedgerAiCheckResult');
                if (resultBoxDup) resultBoxDup.style.display = 'none';
                setTimeout(() => { startLottoQrScanner(); }, 100);
                return;
            }
        }

        // Safe cross-check (Use cached preview cross-check to avoid duplicate heavy Monte Carlo computation)
        let finalVersionStr = versionStr;
        let check = null;
        const currentCombosKey = parsedNumberArrays.map(c => c.join(',')).join('|');
        if (combosEl && combosEl._cachedCrossCheck && 
            combosEl._cachedCrossCheck.round === roundInput && 
            combosEl._cachedCrossCheck.authId === effectiveAuthId && 
            combosEl._cachedCrossCheck.combosKey === currentCombosKey) {
            check = combosEl._cachedCrossCheck.check;
            if (check && check.detectedVersion && check.detectedVersion !== '수동/직접입력') {
                finalVersionStr = check.detectedVersion;
            }
        } else {
            try {
                if (typeof crossCheckCombosWithRecommendations === 'function') {
                    check = crossCheckCombosWithRecommendations(roundInput, parsedNumberArrays, effectiveAuthId);
                    if (check && check.detectedVersion && check.detectedVersion !== '수동/직접입력') {
                        finalVersionStr = check.detectedVersion;
                    }
                }
            } catch(cErr) {
                console.warn('[CrossCheck Warning]', cErr);
            }
        }

        const isOnline = combosEl ? (combosEl.dataset.isOnlineReceipt === 'true') : false;
        if (isOnline && (!check || !check.detectedVersion || check.detectedVersion === '수동/직접입력')) {
            finalVersionStr = '온라인 실구매 영수증 (5게임)';
        }
        parsedNumberArrays.forEach((nums, idx) => {
            const matchDetail = (check && check.matchDetails) ? check.matchDetails[idx] : null;
            newCombos.push({
                numbers: nums,
                meta: { 
                    method: isOnline ? 'online' : 'manual', 
                    targetBenefit: matchDetail && matchDetail.label ? matchDetail.label : (isOnline ? '온라인 구매' : '실구매 등록'),
                    version: finalVersionStr,
                    matchedAlgoVersion: matchDetail ? matchDetail.matchedVersion : null,
                    matchedAlgoLabel: matchDetail ? matchDetail.label : null
                },
                stats: { evScore: 0, oddEvenRatio: '0:0', totalSum: 0, patternCount: 0 }
            });
        });

        const qrRawUrl = combosEl ? (combosEl.dataset.qrRawUrl || null) : null;
        const qrSerial = combosEl ? (combosEl.dataset.qrSerial || null) : null;
        const fallbackSerial = `${String(roundInput).padStart(4, '0')}${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        const finalSerial = qrSerial || fallbackSerial;
        const finalQrUrl = qrRawUrl || buildDonghangLotteryQrUrl(roundInput, newCombos, finalSerial);
        const qrMeta = (combosEl && (combosEl.dataset.qrScanned === 'true' || qrRawUrl || qrSerial || isOnline)) ? {
            qrSerial: finalSerial,
            qrRawUrl: finalQrUrl,
            qrScannedAt: new Date().toISOString(),
            originalRound: roundInput,
            channel: isOnline ? 'online' : 'offline'
        } : null;

        console.log('[handleSaveManualLedger] Saving to ledger...', { roundInput, effectiveAuthId, qrSerial: qrMeta?.qrSerial, isOnline });
        const saveSuccess = await saveToLedger(roundInput, newCombos, finalVersionStr, effectiveAuthId, qrMeta, true);
        if (saveSuccess === false) {
            showToast('⚠️ 장부 저장에 실패했습니다. 다시 시도해주세요.');
            return;
        }

        // Reset combos element dataset & content to prevent stale state in sequential registrations
        if (combosEl) {
            combosEl.value = '';
            delete combosEl.dataset.qrScanned;
            delete combosEl.dataset.qrRawUrl;
            delete combosEl.dataset.qrSerial;
            delete combosEl.dataset.qrRound;
            delete combosEl.dataset.isOnlineReceipt;
            delete combosEl.dataset.qrDuplicate;
            combosEl._cachedCrossCheck = null;
        }
        const onlineTxt = document.getElementById('onlineReceiptTextInput');
        if (onlineTxt) onlineTxt.value = '';
        clearAllGames();

        // Close modal immediately (< 5ms response time)
        if (manualLedgerModal) {
            manualLedgerModal.style.display = 'none';
        }
        const overlay = document.getElementById('manualLedgerModalOverlay');
        if (overlay) overlay.style.display = 'none';

        // Switch to confirmed list tab
        if (typeof window.switchLottoTab === 'function') {
            window.switchLottoTab('tab-confirmed-list');
        } else if (typeof switchLottoTab === 'function') {
            switchLottoTab('tab-confirmed-list');
        }

        // Render active tab immediately
        if (typeof renderConfirmedPurchasesList === 'function') {
            renderConfirmedPurchasesList();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        const targetUserName = (typeof getUserRealName === 'function' ? getUserRealName(effectiveAuthId) : '') || effectiveAuthId;
        if (effectiveAuthId !== currentLoggedAuthId) {
            showToast(`🎉 [${targetUserName}] 회원님의 제 ${roundInput}회차 [${finalVersionStr.split(' ')[0]}] 실구매 영수증이 대리 등록되었습니다.`);
        } else {
            showToast(`🎉 제 ${roundInput}회차 [${finalVersionStr.split(' ')[0]}] 실구매 내역이 정상 등록되었습니다.`);
        }

        // Defer background tab renders so current screen repaints at 60fps without hitching
        setTimeout(() => {
            if (typeof renderReviewTab === 'function') renderReviewTab();
            if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();
        }, 200);
    } catch (err) {
        console.error('[handleSaveManualLedger] Error:', err);
        alert('실구매 내역 저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
        if (btnSave) {
            btnSave.innerHTML = origBtnHtml;
        }
        setManualLedgerSaveButtonsDisabled(false);
        isSavingManualLedger = false;
    }
}

export function openManualLedgerModal() {
    const modal = document.getElementById('manualLedgerModal');
    if (modal) {
        const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) 
            ? window.getUpcomingLottoRound() 
            : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : (state.latestRoundNum ? state.latestRoundNum + 1 : 1240));
        const roundInput = document.getElementById('manualLedgerRound');
        const combosInput = document.getElementById('manualLedgerCombos');
        const resultBox = document.getElementById('manualLedgerAiCheckResult');
        if (roundInput) {
            roundInput.value = currentRound;
            syncLedgerDateGuide(currentRound);
        }
        if (combosInput) {
            combosInput.value = '';
            combosInput.setAttribute('readonly', '');
            combosInput.style.background = 'rgba(5,10,20,0.7)';
            combosInput.style.borderColor = '';
            combosInput.style.color = '#94a3b8';
            combosInput.style.cursor = 'not-allowed';
            delete combosInput.dataset.qrScanned;
            delete combosInput.dataset.qrRawUrl;
            delete combosInput.dataset.qrSerial;
            delete combosInput.dataset.qrRound;
            delete combosInput.dataset.isOnlineReceipt;
            delete combosInput.dataset.qrDuplicate;
            combosInput._cachedCrossCheck = null;
        }
        lastInvalidQrText = '';
        lastInvalidQrAt = 0;
        isStartingScanner = false;
        const previewContainer = document.getElementById('qrScannedReceiptPreview');
        if (previewContainer) {
            previewContainer.style.display = 'none';
        }
        const saveBtnText = document.getElementById('btnSaveManualLedgerText');
        if (saveBtnText) {
            saveBtnText.textContent = '실구매 등록하기';
        }
        // 👑 [Master / 관리자 전용] 대리 QR구매등록 회원 선택기 동적 렌더링
        let currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
        if (!currentAuthId && typeof window !== 'undefined') {
            try { currentAuthId = (window.sessionStorage.getItem('currentUser') || window.localStorage.getItem('currentUser') || '').toLowerCase().trim(); } catch(e) {}
        }
        if (!currentAuthId) currentAuthId = 'guest';

        const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(currentAuthId) : (currentAuthId === 'master' || currentAuthId === 'admin'));
        const masterUserRow = document.getElementById('manualLedgerMasterUserRow');
        const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');

        if (isAdmin && masterUserRow && masterUserSelect) {
            masterUserRow.style.display = 'block';
            
            // Build unique valid users list from unified users, memory, cache, and state
            const userMap = new Map();

            // 1. Try unified registered users
            if (typeof getAllUnifiedRegisteredUsers === 'function') {
                try {
                    const unified = getAllUnifiedRegisteredUsers();
                    if (Array.isArray(unified)) {
                        unified.forEach(u => {
                            const uId = (u.id || '').trim().toLowerCase();
                            if (uId && uId !== currentAuthId && !uId.startsWith('{') && !uId.startsWith('test') && !uId.startsWith('guest') && uId !== 'sample') {
                                userMap.set(uId, { id: uId, name: u.realName || u.name || '', phone: u.phone || u.phoneNumber || '' });
                            }
                        });
                    }
                } catch(e) {}
            }
            
            // 2. Try memory allRegisteredUsersList
            if (Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
                state.allRegisteredUsersList.forEach(u => {
                    const uId = (u.id || '').trim().toLowerCase();
                    if (uId && uId !== currentAuthId && !uId.startsWith('{') && !uId.startsWith('test') && !uId.startsWith('guest') && uId !== 'sample' && !userMap.has(uId)) {
                        userMap.set(uId, { id: uId, name: u.realName || u.name || '', phone: u.phone || u.phoneNumber || '' });
                    }
                });
            } else {
                // 3. Fallback to localStorage cache
                try {
                    const cached = localStorage.getItem('lotto_all_users_list_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed)) {
                            state.allRegisteredUsersList = parsed;
                            parsed.forEach(u => {
                                const uId = (u.id || '').trim().toLowerCase();
                                if (uId && uId !== currentAuthId && !uId.startsWith('{') && !uId.startsWith('test') && !uId.startsWith('guest') && uId !== 'sample' && !userMap.has(uId)) {
                                    userMap.set(uId, { id: uId, name: u.realName || u.name || '', phone: u.phone || u.phoneNumber || '' });
                                }
                            });
                        }
                    }
                } catch(e) {}
            }

            // 4. Merge state.allUsersPurchasesMap
            if (state.allUsersPurchasesMap) {
                Object.keys(state.allUsersPurchasesMap).forEach(uId => {
                    const clean = (uId || '').trim().toLowerCase();
                    if (clean && clean !== currentAuthId && !clean.startsWith('{') && !clean.startsWith('test') && !clean.startsWith('guest') && clean !== 'sample' && !userMap.has(clean)) {
                        const rName = state.allUsersPurchasesMap[clean]?.realName || (typeof getUserRealName === 'function' ? getUserRealName(clean) : '') || '';
                        userMap.set(clean, { id: clean, name: rName, phone: '' });
                    }
                });
            }

            // 5. Merge DEFAULT_KNOWN_USERS
            if (typeof DEFAULT_KNOWN_USERS !== 'undefined' && Array.isArray(DEFAULT_KNOWN_USERS)) {
                DEFAULT_KNOWN_USERS.forEach(u => {
                    const clean = (u.id || '').trim().toLowerCase();
                    if (clean && clean !== currentAuthId && !clean.startsWith('{') && !clean.startsWith('test') && !clean.startsWith('guest') && clean !== 'sample' && !userMap.has(clean)) {
                        userMap.set(clean, { id: clean, name: u.realName || u.name || '', phone: u.phone || u.phoneNumber || '' });
                    }
                });
            }

            const currentAdminTarget = (state.adminViewingTarget && state.adminViewingTarget !== 'all' && state.adminViewingTarget !== 'my') 
                ? state.adminViewingTarget.toLowerCase().trim() 
                : currentAuthId;

            const myRealName = (typeof getUserRealName === 'function' ? getUserRealName(currentAuthId) : '') || '';
            const myNameTag = (myRealName && myRealName !== currentAuthId) ? ` (${myRealName})` : '';
            const myLabel = (currentAuthId === 'master') ? '👑 Master 본인 (master)' : `👑 관리자 본인 (${currentAuthId}${myNameTag})`;
            let optionsHtml = `<option value="${currentAuthId}" ${currentAdminTarget === currentAuthId ? 'selected' : ''}>${myLabel}</option>`;
            
            Array.from(userMap.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)).forEach(u => {
                const displayName = u.name ? `${u.name}` : u.id;
                const phoneTag = u.phone ? ` / ${u.phone}` : '';
                const isSelected = (currentAdminTarget === u.id) ? 'selected' : '';
                optionsHtml += `<option value="${u.id}" ${isSelected}>👤 ${displayName} (${u.id}${phoneTag})</option>`;
            });

            masterUserSelect.innerHTML = optionsHtml;
        } else if (masterUserRow) {
            masterUserRow.style.display = 'none';
        }

        if (resultBox) resultBox.style.display = 'none';
        modal.style.display = 'flex';

        const onlineTxt = document.getElementById('onlineReceiptTextInput');
        if (onlineTxt) onlineTxt.value = '';
        clearAllGames();

        // 기본 모드는 지류 복권 QR스캔 (사용자 요청: 기본은 qr스캔)
        switchManualLedgerMode('qr');
    }
}

export async function closeManualLedgerModal() {
    await stopScanning();
    const modal = document.getElementById('manualLedgerModal');
    if (modal) modal.style.display = 'none';
    const overlay = document.getElementById('manualLedgerModalOverlay');
    if (overlay) overlay.style.display = 'none';
}

if (typeof window !== 'undefined') {
    window.openManualLedgerModal = openManualLedgerModal;
    window.closeManualLedgerModal = closeManualLedgerModal;
    window.handleSaveManualLedger = handleSaveManualLedger;
    window.crossCheckCombosWithRecommendations = crossCheckCombosWithRecommendations;
    window.updateManualModalCrossCheck = updateManualModalCrossCheck;
    window.renderDigitalReceiptCard = renderDigitalReceiptCard;
    window.startLottoQrScanner = startLottoQrScanner;
    window.stopScanning = stopScanning;
    window.stopLottoScanning = stopScanning;
    window.safeStopScanner = safeStopScanner;
    window.resetQrReaderDOM = resetQrReaderDOM;
    window.forceKillAllCameraTracks = forceKillAllCameraTracks;
    window.switchManualLedgerMode = switchManualLedgerMode;
    window.pasteFromMobileClipboard = pasteFromMobileClipboard;
    window.handleOnlineScreenshotFile = handleOnlineScreenshotFile;
    window.processOnlineScreenshotFileDirect = processOnlineScreenshotFileDirect;
    window.preprocessReceiptImage = preprocessReceiptImage;
    window.recognizeOnlineReceiptImage = recognizeOnlineReceiptImage;
    window.handleOnlineReceiptTextChange = handleOnlineReceiptTextChange;
    window.toggleBallInActiveGame = toggleBallInActiveGame;
    window.setActiveBallGame = setActiveBallGame;
    window.randomFillActiveGame = randomFillActiveGame;
    window.clearActiveGame = clearActiveGame;
    window.clearAllGames = clearAllGames;
}
