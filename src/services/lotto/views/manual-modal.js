import { state } from '../state.js';
import { showToast, getDrawDateByRound } from '../../../shared/utils.js';
import { getLedger, saveToLedger } from '../ledger.js';
import { renderReviewTab, renderReviewDetail } from './review-tab.js';
import { renderConfirmedPurchasesList } from './confirmed-tab.js';
import { computeAbsoluteTop10Combinations, findBestRecommendationMatch, crossCheckCombosWithRecommendations } from '../generator.js';

let html5QrScanner = null;

export function stopScanning() {
    const qrScannerContainer = document.getElementById('qrScannerContainer');
    if (html5QrScanner) {
        const scanner = html5QrScanner;
        html5QrScanner = null;
        try {
            scanner.stop().then(() => {
                try { scanner.clear(); } catch(e) {}
                if (qrScannerContainer) qrScannerContainer.style.display = 'none';
            }).catch(() => {
                try { scanner.clear(); } catch(e) {}
                if (qrScannerContainer) qrScannerContainer.style.display = 'none';
            });
        } catch(e) {
            try { scanner.clear(); } catch(err) {}
            if (qrScannerContainer) qrScannerContainer.style.display = 'none';
        }
    } else {
        if (qrScannerContainer) qrScannerContainer.style.display = 'none';
    }
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

    const authId = (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';
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
    
    if (btnOpenManualLedger && manualLedgerModal) {
        btnOpenManualLedger.addEventListener('click', () => {
            const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1240);
            const roundInput = document.getElementById('manualLedgerRound');
            const combosInput = document.getElementById('manualLedgerCombos');
            const resultBox = document.getElementById('manualLedgerAiCheckResult');

            // 1) 회차 설정
            if (roundInput) {
                roundInput.value = currentRound;
                syncLedgerDateGuide(currentRound);
            }

            // 2) 번호 입력란 초기화 (잠금 상태)
            if (combosInput) {
                combosInput.value = '';
                combosInput.setAttribute('readonly', '');
                combosInput.style.background = 'rgba(5,10,20,0.7)';
                combosInput.style.borderColor = '';
                combosInput.style.color = '#94a3b8';
                combosInput.style.cursor = 'not-allowed';
                combosInput.dataset.qrScanned = '';
            }
            if (resultBox) resultBox.style.display = 'none';

            // 3) 모달 표시
            manualLedgerModal.style.display = 'flex';

            // 4) 카메라 자동 시작 (100ms 후, 모달 렌더링 완료 시점)
            setTimeout(() => {
                const btn = document.getElementById('btnOpenQrScanner');
                if (btn) btn.click();
            }, 100);
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
 * 🔒 Parse and apply Donghang Lottery QR Payload
 */
export function processLottoQrPayload(rawText) {
    if (!rawText) return false;
    const decodedText = String(rawText).trim();
    console.log(`[QR Scanner] Processing payload: ${decodedText}`);

    try {
        let vParam = null;
        if (decodedText.includes('v=')) {
            const match = decodedText.match(/[?&]?v=([^&#\s]+)/);
            if (match && match[1]) {
                vParam = match[1];
            }
        } else if (/^\d{4}[a-zA-Z]/.test(decodedText)) {
            vParam = decodedText;
        }

        if (vParam) {
            // Extract 4-digit round number (e.g., 1237, 1238, 1239, 1240)
            const roundStr = vParam.substring(0, 4);
            const round = parseInt(roundStr, 10);
            const gamesStr = vParam.substring(4);
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
                    combos.push(numbers.join(', '));
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
                const rawSerial = vParam.replace(/^\d{4}/, '').replace(/[a-zA-Z]\d{12}/g, '').trim();
                const qrSerial = rawSerial || 'TR-정상발권';

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
                
                // Haptic feedback if supported on Galaxy devices
                if (navigator.vibrate) {
                    try { navigator.vibrate([50, 70, 50]); } catch(e) {}
                }

                const currentRound = (typeof window !== 'undefined' && window.getUpcomingLottoRound) ? window.getUpcomingLottoRound() : (state.latestDrawData ? state.latestDrawData.drwNo + 1 : 1240);
                const isPastRound = round < currentRound;
                showToast(`🎉 QR 인식 성공: 제 ${round}회차 ${isPastRound ? '(과거 회차)' : '(이번 주)'} ${combos.length}게임 등록 완료!`);
                return true;
            } else {
                alert(`QR 코드에서 ${round}회차 정보는 확인되었으나, 유효한 6개 번호 조합을 파싱하지 못했습니다.`);
                return false;
            }
        } else {
            alert('동행복권 로또 QR 코드가 아닙니다. (v 파라미터가 없습니다)\n영수증 상단의 동행복권 QR 코드를 비춰주세요.');
            return false;
        }
    } catch(e) {
        console.error('[QR Parser Error]', e);
        alert('QR 코드 분석 실패: ' + e.message);
        return false;
    }
}

/**
 * 📷 Start QR Scanner with Hardware Acceleration & Macro/Zoom controls
 */
export async function startLottoQrScanner() {
    const qrScannerContainer = document.getElementById('qrScannerContainer');
    const qrReader = document.getElementById('qrReader');
    if (!qrReader) return;

    if (qrScannerContainer) {
        qrScannerContainer.style.display = 'block';
    }

    if (html5QrScanner) {
        try {
            await html5QrScanner.stop();
        } catch(e) {}
        try {
            html5QrScanner.clear();
        } catch(e) {}
        html5QrScanner = null;
    }

    qrReader.innerHTML = '';

    if (typeof Html5Qrcode === 'undefined') {
        alert('QR 스캔 라이브러리를 로드할 수 없습니다. 네트워크 연결을 확인해주세요.');
        return;
    }

    try {
        html5QrScanner = new Html5Qrcode("qrReader");

        const qrCodeSuccessCallback = (decodedText) => {
            processLottoQrPayload(decodedText);
        };

        const config = {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.max(220, Math.floor(minEdge * 0.8));
                return { width: size, height: size };
            }
        };

        await html5QrScanner.start(
            { facingMode: "environment" },
            config,
            qrCodeSuccessCallback
        );

        setupCameraCapabilities();
    } catch(err) {
        console.error('[QR Scanner Start Error]:', err);
        alert('카메라 화면을 열 수 없습니다. 카메라 접근 권한을 확인해주세요.\n\n[📸 사진촬영/갤러리] 버튼을 누르면 사진을 찍어 즉시 등록하실 수 있습니다.');
        if (qrScannerContainer) qrScannerContainer.style.display = 'none';
        if (html5QrScanner) {
            try { html5QrScanner.clear(); } catch(e) {}
            html5QrScanner = null;
        }
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

    // 2. Fallback to Html5Qrcode file scan
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
            console.warn('[Html5Qrcode file scan failed, trying canvas enhanced scan]', err);
        }
    }

    // 3. Fallback: Contrast-enhanced canvas preprocessor for crumpled/faint receipts
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
    alert('⚠️ 사진에서 로또 QR 코드를 인식하지 못했습니다.\n\n• 영수증 상단의 QR 코드가 잘리지 않고 선명하게 나오도록 다시 촬영해주세요.\n• 밝은 조명 아래에서 그림자가 지지 않도록 해주세요.');
}

/**
 * Helper to scan with canvas grayscale & contrast boost
 */
async function scanWithContrastEnhancement(file) {
    return new Promise((resolve) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
            img.onload = async () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);

                    // High contrast filter
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    const d = imgData.data;
                    for (let i = 0; i < d.length; i += 4) {
                        const gray = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
                        const enhanced = gray > 128 ? 255 : 0;
                        d[i] = enhanced;
                        d[i + 1] = enhanced;
                        d[i + 2] = enhanced;
                    }
                    ctx.putImageData(imgData, 0, 0);

                    if ('BarcodeDetector' in window) {
                        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                        const barcodes = await detector.detect(canvas);
                        if (barcodes && barcodes.length > 0) {
                            resolve(barcodes[0].rawValue);
                            return;
                        }
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

        const effectiveAuthId = originalUser || (typeof SafeAuth !== 'undefined' ? SafeAuth.get() : (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null)) || 'guest';

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
        const qrMeta = (combosEl && (combosEl.dataset.qrScanned === 'true' || qrRawUrl || qrSerial)) ? {
            qrSerial: qrSerial || 'TR-정상발권',
            qrRawUrl: qrRawUrl,
            qrScannedAt: new Date().toISOString()
        } : null;

        console.log('[handleSaveManualLedger] Saving to ledger...', { roundInput, effectiveAuthId, qrSerial });
        await saveToLedger(roundInput, newCombos, finalVersionStr, effectiveAuthId, qrMeta);

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
        showToast(`🎉 제 ${roundInput}회차 [${finalVersionStr.split(' ')[0]}] 실구매 내역이 정상 등록되었습니다.`);
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
            combosInput.dataset.qrScanned = '';
        }
        if (resultBox) resultBox.style.display = 'none';
        modal.style.display = 'flex';

        // Auto-start camera QR scanner
        setTimeout(() => {
            const btn = document.getElementById('btnOpenQrScanner');
            if (btn) btn.click();
        }, 120);
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
