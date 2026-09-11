import { state } from '../state.js';
import { showToast, getDrawDateByRound } from '../../../shared/utils.js';
import { getLedger, saveToLedger } from '../ledger.js';
import { SafeAuth, getUserRealName, isAdminUser } from '../../../shared/auth-mgmt.js';
import { renderReviewTab, renderReviewDetail } from './review-tab.js';
import { renderConfirmedPurchasesList } from './confirmed-tab.js';
import { computeAbsoluteTop10Combinations, findBestRecommendationMatch, crossCheckCombosWithRecommendations } from '../generator.js';

let html5QrScanner = null;
let isStartingScanner = false;

export async function stopScanning() {
    isStartingScanner = false;
    const qrScannerContainer = document.getElementById('qrScannerContainer');
    if (html5QrScanner) {
        const scanner = html5QrScanner;
        html5QrScanner = null;
        try {
            await scanner.stop();
        } catch(e) {}
        try {
            await scanner.clear();
        } catch(e) {}
    }
    const qrReader = document.getElementById('qrReader');
    if (qrReader) {
        qrReader.innerHTML = '';
    }
    if (qrScannerContainer) {
        qrScannerContainer.style.display = 'none';
    }
    const btnTorch = document.getElementById('btnToggleTorch');
    const btnZoom = document.getElementById('btnToggleZoom');
    if (btnTorch) btnTorch.style.display = 'none';
    if (btnZoom) btnZoom.style.display = 'none';
}

export function syncLedgerDateGuide(roundVal) {
    const guideEl = document.getElementById('manualLedgerDateGuide');
    if (!guideEl) return;

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
 * Updates the modal UI with real-time AI version detection
 */
export function updateManualModalCrossCheck() {
    const roundInput = document.getElementById('manualLedgerRound');
    const combosInput = document.getElementById('manualLedgerCombos');
    const versionSelect = document.getElementById('manualLedgerVersion');
    const resultBox = document.getElementById('manualLedgerAiCheckResult');

    if (!roundInput || !combosInput || !versionSelect || !resultBox) return;

    const round = parseInt(roundInput.value.trim());
    const text = combosInput.value.trim();

    if (!round || isNaN(round) || !text) {
        resultBox.style.display = 'none';
        return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const parsedCombos = [];
    lines.forEach(l => {
        const nums = l.replace(/,/g, ' ').split(/\s+/).map(Number).filter(n => !isNaN(n) && n >= 1 && n <= 45);
        if (nums.length === 6) {
            parsedCombos.push(nums);
        }
    });

    if (parsedCombos.length === 0) {
        resultBox.style.display = 'none';
        return;
    }

    let authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';
    const cleanAuth = authId.toLowerCase().trim();
    const isMaster = (cleanAuth === 'master');
    const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
    if (isMaster && masterUserSelect && masterUserSelect.value) {
        authId = masterUserSelect.value.trim().toLowerCase();
    }
    const check = crossCheckCombosWithRecommendations(round, parsedCombos, authId);

    // Auto-select detected version in dropdown
    versionSelect.value = check.detectedVersion;

    // Badges HTML for each game (1개라도 틀리면 수동입력)
    const pillsHtml = check.matchDetails.map((d, i) => {
        if (d.isExact) {
            if (d.matchedVersion.includes('추가')) {
                return `<span style="background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #a7f3d0; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-rocket" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            } else if (d.matchedVersion.includes('V4.0')) {
                return `<span style="background: rgba(139, 92, 246, 0.25); border: 1px solid #a78bfa; color: #ddd6fe; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-brain" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            } else {
                return `<span style="background: rgba(245, 158, 11, 0.25); border: 1px solid #f59e0b; color: #fef08a; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;"><i class="fa-solid fa-bolt" style="font-size: 0.62rem;"></i> 게임 ${i+1}: ${d.label}</span>`;
            }
        } else {
            return `<span style="background: rgba(239, 68, 68, 0.2); border: 1px solid #f87171; color: #fca5a5; padding: 2px 7px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 3px;" title="수동입력"><i class="fa-solid fa-pen-to-square" style="font-size: 0.62rem;"></i> 게임 ${i+1}: 수동입력</span>`;
        }
    }).join('');

    // Render feedback notice
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
                        <span style="color:#c4b5fd; font-weight:800;">🧠 AI 크로스체크: V4.0 행동경제학 포트폴리오 감지</span>
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
        resultBox.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-bolt" style="color: #fbbf24; font-size: 1.1rem;"></i>
                    <div>
                        <span style="color:#fde047; font-weight:800;">⚡ AI 크로스체크: V3.0 하이브리드 알고리즘 감지</span>
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
            updateManualModalCrossCheck();
            const selectedUId = masterUserSelect.value;
            const uName = (typeof getUserRealName === 'function' ? getUserRealName(selectedUId) : '') || selectedUId;
            showToast(`👤 대리 등록 대상 회원: [${uName}] 지정됨`);
        });
    }

    const btnOpenQrScanner = document.getElementById('btnOpenQrScanner');
    const btnStopQrScanner = document.getElementById('btnStopQrScanner');
    const qrScannerContainer = document.getElementById('qrScannerContainer');

    if (btnOpenQrScanner) {
        btnOpenQrScanner.addEventListener('click', () => {
            startLottoQrScanner();
        });
    }

    if (btnStopQrScanner) {
        btnStopQrScanner.addEventListener('click', stopScanning);
    }

    if (btnCloseManualLedgerModal && manualLedgerModal) {
        btnCloseManualLedgerModal.addEventListener('click', () => {
            stopScanning();
            manualLedgerModal.style.display = 'none';
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
        let vParam = null;
        if (/v=/i.test(decodedText)) {
            const match = decodedText.match(/[?&]?v=([^&#\s\r\n"']+)/i);
            if (match && match[1]) {
                vParam = match[1].trim();
            }
        } else if (/^\d{3,4}[a-zA-Z]/.test(decodedText)) {
            vParam = decodedText;
        }

        if (vParam) {
            // Extract 3~4 digit round number (e.g., 1239, 1240)
            const roundMatch = vParam.match(/^(\d{3,4})/);
            if (!roundMatch) {
                alert('QR 코드에서 회차 정보를 확인할 수 없습니다.');
                return false;
            }
            const roundStr = roundMatch[1];
            const round = parseInt(roundStr, 10);
            const gamesStr = vParam.substring(roundStr.length);
            const gameRegex = /[a-zA-Z]\d{12}/g;
            const matches = gamesStr.match(gameRegex) || [];
            
            const combos = [];
            matches.forEach(match => {
                const numbersStr = match.substring(1);
                const numbers = [];
                for (let i = 0; i < 12; i += 2) {
                    numbers.push(parseInt(numbersStr.substring(i, i + 2), 10));
                }
                if (numbers.length === 6 && numbers.every(n => !isNaN(n) && n >= 1 && n <= 45)) {
                    const uniqueSet = new Set(numbers);
                    if (uniqueSet.size === 6) {
                        numbers.sort((a, b) => a - b);
                        combos.push(numbers.join(', '));
                    }
                }
            });
            
            // Automatically fill and sync round info
            const roundEl = document.getElementById('manualLedgerRound');
            if (!isNaN(round) && round > 0 && roundEl) {
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
            if (combos.length > 0 && combosEl) {
                const rawQrUrl = decodedText.startsWith('http') ? decodedText : `http://m.dhlottery.co.kr/qr.do?method=winQr&v=${vParam}`;
                const rawSerial = vParam.replace(/^\d{3,4}/, '').replace(/[a-zA-Z]\d{12}/g, '').trim();
                const uniqueFallbackSerial = `TR-${round}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
                const qrSerial = (rawSerial && rawSerial.length >= 4) ? rawSerial : uniqueFallbackSerial;

                combosEl.removeAttribute('readonly');
                combosEl.style.background = 'rgba(16, 185, 129, 0.08)';
                combosEl.style.borderColor = '#10b981';
                combosEl.style.color = '#f1f5f9';
                combosEl.style.cursor = 'default';
                combosEl.value = combos.join('\n');
                combosEl.dataset.qrScanned = 'true';
                combosEl.dataset.qrRawUrl = rawQrUrl;
                combosEl.dataset.qrSerial = qrSerial;
                stopScanning();

                // Trigger real-time cross check immediately
                updateManualModalCrossCheck();
                
                // Haptic feedback & visual indicator
                if (navigator.vibrate) {
                    try { navigator.vibrate([50, 70, 50]); } catch(e) {}
                }

                const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1240);
                const isPastRound = round < currentRound;
                showToast(`🎉 QR 인식 성공: 제 ${round}회차 ${isPastRound ? '(과거 회차)' : '(이번 주)'} ${combos.length}게임 등록 완료!`);
                return true;
            } else {
                alert(`QR 코드에서 ${round}회차 정보는 확인되었으나, 유효한 6개 번호 조합을 파싱하지 못했습니다.\n\n영수증의 QR코드가 훼손되지 않았는지 확인해주세요.`);
                return false;
            }
        } else {
            alert('동행복권 로또 QR 코드가 아닙니다.\n\n영수증 상단의 동행복권 공식 QR 코드를 비춰주세요.');
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
    if (isStartingScanner) {
        console.log('[QR Scanner] Scanner launch already in progress, ignoring duplicate request.');
        return;
    }
    isStartingScanner = true;

    const qrScannerContainer = document.getElementById('qrScannerContainer');
    const qrReader = document.getElementById('qrReader');
    if (!qrReader) {
        isStartingScanner = false;
        return;
    }

    if (qrScannerContainer) {
        qrScannerContainer.style.display = 'block';
    }

    // Stop and completely clear any previous scanner & DOM
    if (html5QrScanner) {
        const prev = html5QrScanner;
        html5QrScanner = null;
        try { await prev.stop(); } catch(e) {}
        try { await prev.clear(); } catch(e) {}
    }
    qrReader.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
        isStartingScanner = false;
        alert('QR 스캔 엔진을 불러오는 중입니다. 1~2초 후 다시 시도해주세요.');
        return;
    }

    const qrCodeSuccessCallback = (decodedText) => {
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
    async function attemptStart(cameraSource) {
        try {
            if (html5QrScanner) {
                const prev = html5QrScanner;
                html5QrScanner = null;
                try { await prev.stop(); } catch(e) {}
                try { await prev.clear(); } catch(e) {}
            }
            if (qrReader) qrReader.innerHTML = '';

            const scanner = new Html5Qrcode("qrReader", {
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                verbose: false
            });

            await scanner.start(cameraSource, config, qrCodeSuccessCallback);
            html5QrScanner = scanner;
            return true;
        } catch (err) {
            console.warn('[QR Camera Attempt Failed]:', cameraSource, err);
            if (html5QrScanner) {
                const prev = html5QrScanner;
                html5QrScanner = null;
                try { await prev.stop(); } catch(e) {}
                try { await prev.clear(); } catch(e) {}
            }
            if (qrReader) qrReader.innerHTML = '';
            return false;
        }
    }

    let started = false;

    // 1단계: facingMode environment (후면 카메라 기본 시도)
    started = await attemptStart({ facingMode: "environment" });

    // 2단계: 실패 시 카메라 목록 조회 후 최적 후면 카메라 ID 직접 선택
    if (!started) {
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
                    started = await attemptStart(selectedCam.id);
                }
            }
        } catch(camListErr) {
            console.warn('[QR Scanner getCameras failed]', camListErr);
        }
    }

    // 3단계: 기본 카메라 facingMode user 시도
    if (!started) {
        started = await attemptStart({ facingMode: "user" });
    }

    isStartingScanner = false;

    if (started) {
        setupCameraCapabilities();
    } else {
        await stopScanning();
        alert('📷 실시간 카메라 화면을 시작할 수 없습니다.\n\n카메라 권한이 차단되었거나 인앱 브라우저일 수 있습니다.\n\n바로 옆의 [📸 사진촬영/갤러리] 버튼을 누르시면 사진을 찍어 100% 정상 등록하실 수 있습니다!');
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

    event.target.value = '';
    alert('⚠️ 사진에서 로또 QR 코드를 인식하지 못했습니다.\n\n• 영수증 상단의 사각형 QR 코드가 화면에 크게 선명하게 나오도록 다시 촬영해주세요.\n• 밝은 조명 아래에서 그림자나 빛 반사가 생기지 않게 해주세요.');
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
    const btnSave = document.getElementById('btnSaveManualLedger');
    const origBtnHtml = btnSave ? btnSave.innerHTML : '<i class="fa-solid fa-save"></i> 실구매 등록하기';
    const manualLedgerModal = document.getElementById('manualLedgerModal');

    // 1. Stop camera immediately
    try { stopScanning(); } catch(e) {}

    // 2. Set button to saving state
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 저장 및 동기화 중...';
    }

    try {
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
            return;
        }

        // 🔒 Enforce QR Code Verification Only
        if (combosEl && combosEl.dataset.qrScanned !== 'true' && !combosEl.dataset.qrRawUrl) {
            alert('⚠️ [실구매 QR 인증 필수]\n\n로또 6/45 실구매 등록은 실물 복권 영수증의 QR코드 인식을 통해서만 등록이 가능합니다.\n\n[📷 QR 코드 다시 스캔하기] 또는 [영수증 사진 선택]을 통해 영수증을 인증해주세요.');
            startLottoQrScanner();
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
        const isMaster = (currentLoggedAuthId === 'master');
        const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');
        const selectedMasterTargetUser = (isMaster && masterUserSelect && masterUserSelect.value) 
            ? masterUserSelect.value.trim().toLowerCase() 
            : null;

        const effectiveAuthId = originalUser || selectedMasterTargetUser || currentLoggedAuthId || 'guest';

        // Safe cross-check
        let finalVersionStr = versionStr;
        let check = null;
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

        parsedNumberArrays.forEach((nums, idx) => {
            const matchDetail = (check && check.matchDetails) ? check.matchDetails[idx] : null;
            newCombos.push({
                numbers: nums,
                meta: { 
                    method: 'manual', 
                    targetBenefit: matchDetail && matchDetail.label ? matchDetail.label : '실구매 등록',
                    version: finalVersionStr,
                    matchedAlgoVersion: matchDetail ? matchDetail.matchedVersion : null,
                    matchedAlgoLabel: matchDetail ? matchDetail.label : null
                },
                stats: { evScore: 0, oddEvenRatio: '0:0', totalSum: 0, patternCount: 0 }
            });
        });

        const qrRawUrl = combosEl ? (combosEl.dataset.qrRawUrl || null) : null;
        const qrSerial = combosEl ? (combosEl.dataset.qrSerial || null) : null;
        const fallbackSerial = `TR-${roundInput}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2,6).toUpperCase()}`;
        const qrMeta = (combosEl && (combosEl.dataset.qrScanned === 'true' || qrRawUrl || qrSerial)) ? {
            qrSerial: qrSerial || fallbackSerial,
            qrRawUrl: qrRawUrl,
            qrScannedAt: new Date().toISOString()
        } : null;

        console.log('[handleSaveManualLedger] Saving to ledger...', { roundInput, effectiveAuthId, qrSerial: qrMeta?.qrSerial });
        await saveToLedger(roundInput, newCombos, finalVersionStr, effectiveAuthId, qrMeta);

        // Reset combos element dataset & content to prevent stale state in sequential registrations
        if (combosEl) {
            combosEl.value = '';
            delete combosEl.dataset.qrScanned;
            delete combosEl.dataset.qrRawUrl;
            delete combosEl.dataset.qrSerial;
        }

        // Close modal immediately regardless of return value
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

        if (typeof renderReviewTab === 'function') renderReviewTab();
        if (typeof renderConfirmedPurchasesList === 'function') renderConfirmedPurchasesList();
        if (typeof window.renderLandingDashboard === 'function') window.renderLandingDashboard();

        window.scrollTo({ top: 0, behavior: 'smooth' });
        const targetUserName = (typeof getUserRealName === 'function' ? getUserRealName(effectiveAuthId) : '') || effectiveAuthId;
        if (currentLoggedAuthId === 'master' && effectiveAuthId !== 'master') {
            showToast(`🎉 [${targetUserName}] 회원님의 제 ${roundInput}회차 [${finalVersionStr.split(' ')[0]}] 실구매 내역이 정상 대리 등록되었습니다.`);
        } else {
            showToast(`🎉 제 ${roundInput}회차 [${finalVersionStr.split(' ')[0]}] 실구매 내역이 정상 등록되었습니다.`);
        }
    } catch (err) {
        console.error('[handleSaveManualLedger] Error:', err);
        alert('실구매 내역 저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.innerHTML = origBtnHtml;
        }
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
            combosInput.placeholder = '📷 실물 복권 영수증의 QR코드를 카메라에 비추거나 사진 파일을 선택하면 번호가 자동 등록됩니다. (QR 인증 필수)';
            combosInput.dataset.qrScanned = '';
            combosInput.dataset.qrRawUrl = '';
            combosInput.dataset.qrSerial = '';
        }
        // 👑 [Master / 관리자 전용] 대리 QR구매등록 회원 선택기 동적 렌더링
        let currentAuthId = ((typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || '').toLowerCase().trim();
        if (!currentAuthId && typeof window !== 'undefined') {
            try { currentAuthId = (window.sessionStorage.getItem('currentUser') || window.localStorage.getItem('currentUser') || '').toLowerCase().trim(); } catch(e) {}
        }
        if (!currentAuthId) currentAuthId = 'guest';

        const isMaster = (currentAuthId === 'master');
        const masterUserRow = document.getElementById('manualLedgerMasterUserRow');
        const masterUserSelect = document.getElementById('manualLedgerMasterUserSelect');

        if (isMaster && masterUserRow && masterUserSelect) {
            masterUserRow.style.display = 'block';
            
            // Build unique valid users list from memory, cache, and state
            const userMap = new Map();
            
            // 1. Try memory allRegisteredUsersList
            if (Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
                state.allRegisteredUsersList.forEach(u => {
                    const uId = (u.id || '').trim().toLowerCase();
                    if (uId && uId !== currentAuthId && uId !== 'admin' && !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'guest' && uId !== 'sample') {
                        userMap.set(uId, { id: uId, name: u.name || '', phone: u.phone || '' });
                    }
                });
            } else {
                // 2. Fallback to localStorage cache
                try {
                    const cached = localStorage.getItem('lotto_all_users_list_cache');
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        if (Array.isArray(parsed)) {
                            state.allRegisteredUsersList = parsed;
                            parsed.forEach(u => {
                                const uId = (u.id || '').trim().toLowerCase();
                                if (uId && uId !== currentAuthId && uId !== 'admin' && !uId.startsWith('{') && !uId.startsWith('test_') && uId !== 'guest' && uId !== 'sample') {
                                    userMap.set(uId, { id: uId, name: u.name || '', phone: u.phone || '' });
                                }
                            });
                        }
                    }
                } catch(e) {}
            }

            // 3. Merge state.allUsersPurchasesMap
            if (state.allUsersPurchasesMap) {
                Object.keys(state.allUsersPurchasesMap).forEach(uId => {
                    const clean = (uId || '').trim().toLowerCase();
                    if (clean && clean !== currentAuthId && clean !== 'admin' && !clean.startsWith('{') && !clean.startsWith('test_') && clean !== 'guest' && clean !== 'sample' && !userMap.has(clean)) {
                        const rName = state.allUsersPurchasesMap[clean]?.realName || (typeof getUserRealName === 'function' ? getUserRealName(clean) : '') || '';
                        userMap.set(clean, { id: clean, name: rName, phone: '' });
                    }
                });
            }

            const currentAdminTarget = (state.adminViewingTarget && state.adminViewingTarget !== 'all' && state.adminViewingTarget !== 'my') 
                ? state.adminViewingTarget.toLowerCase().trim() 
                : currentAuthId;

            let optionsHtml = `<option value="${currentAuthId}" ${currentAdminTarget === currentAuthId ? 'selected' : ''}>👑 Master 본인 (master)</option>`;
            
            Array.from(userMap.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)).forEach(u => {
                const displayName = u.name ? `${u.name}` : u.id;
                const phoneTag = u.phone ? ` / ${u.phone}` : '';
                const isSelected = (currentAdminTarget === u.id) ? 'selected' : '';
                optionsHtml += `<option value="${u.id}" ${isSelected}>👤 ${u.id} (${displayName}${phoneTag})</option>`;
            });

            masterUserSelect.innerHTML = optionsHtml;
        } else if (masterUserRow) {
            masterUserRow.style.display = 'none';
        }

        if (resultBox) resultBox.style.display = 'none';
        modal.style.display = 'flex';

        // Auto-start camera QR scanner cleanly
        setTimeout(() => {
            startLottoQrScanner();
        }, 150);
    }
}

export function closeManualLedgerModal() {
    stopScanning();
    const modal = document.getElementById('manualLedgerModal');
    if (modal) modal.style.display = 'none';
}

if (typeof window !== 'undefined') {
    window.openManualLedgerModal = openManualLedgerModal;
    window.closeManualLedgerModal = closeManualLedgerModal;
    window.handleSaveManualLedger = handleSaveManualLedger;
    window.crossCheckCombosWithRecommendations = crossCheckCombosWithRecommendations;
    window.updateManualModalCrossCheck = updateManualModalCrossCheck;
}
