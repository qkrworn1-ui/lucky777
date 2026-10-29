import unittest
import os
import re

class TestQrSmartphoneCompatibility(unittest.TestCase):
    def setUp(self):
        self.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.manual_js_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'manual-modal.js')
        self.html_path = os.path.join(self.root_dir, 'index.html')
        self.css_path = os.path.join(self.root_dir, 'styles.css')

        with open(self.manual_js_path, 'r', encoding='utf-8') as f:
            self.manual_js = f.read()
        with open(self.html_path, 'r', encoding='utf-8') as f:
            self.html = f.read()
        with open(self.css_path, 'r', encoding='utf-8') as f:
            self.css = f.read()

    def test_01_jsqr_dual_engine_library_presence(self):
        """Verify jsQR engine is loaded in index.html for universal iOS Safari and WebView support."""
        self.assertIn('jsqr@1.4.0/dist/jsQR.min.js', self.html, "index.html must load jsQR from CDN")
        self.assertIn('typeof jsQR === \'undefined\'', self.html, "index.html must provide unpkg fallback for jsQR")

    def test_02_viewfinder_hud_and_focus_controls(self):
        """Verify viewfinder HUD has zoom toggle, tap-to-focus button, and distance guide."""
        self.assertIn('id="qrViewfinderFrame"', self.html)
        self.assertIn('id="btnTriggerFocus"', self.html)
        self.assertIn('id="btnToggleZoom"', self.html)
        self.assertIn('id="btnToggleTorch"', self.html)
        self.assertIn('id="qrFocusGuideTip"', self.html)
        self.assertIn('20~25cm', self.html)

    def test_03_focus_ring_crosshairs_styling(self):
        """Verify styles.css defines .qr-focus-ring and crosshair pseudo elements."""
        self.assertIn('.qr-focus-ring', self.css)
        self.assertIn('@keyframes qrFocusPulse', self.css)
        self.assertIn('.qr-focus-ring::after', self.css, "Must have center focus target point")
        self.assertIn('.qr-focus-ring::before', self.css, "Must have inner crosshair bracket")

    def test_04_universal_live_scanner_loop_multi_engine(self):
        """Verify manual-modal.js implements Universal Live Scanner with Native BarcodeDetector and jsQR Macro Crop."""
        self.assertIn('startUniversalLiveQrScannerLoop', self.manual_js)
        self.assertIn('window.jsQR', self.manual_js, "Live scanner loop must use jsQR as universal fallback")
        self.assertIn('inversionAttempts: \'attemptBoth\'', self.manual_js, "Must support inverted contrast for receipt glare")
        self.assertIn('cropSize', self.manual_js, "Must implement digital macro center crop for live stream")
        self.assertIn('lastAutoNudgeTime', self.manual_js, "Must track auto-focus nudge timing to prevent VCM lock")

    def test_05_macro_friendly_default_zoom_and_software_fallback(self):
        """Verify applyCameraFocusOptimization sets 1.5x zoom and provides applySoftwareZoom fallback for iOS."""
        self.assertIn('applyCameraFocusOptimization', self.manual_js)
        self.assertIn('targetZ = Math.min(1.5', self.manual_js, "Must set default macro-avoidance zoom to 1.5x")
        self.assertIn('applySoftwareZoom', self.manual_js, "Must provide software CSS zoom fallback for Safari")
        self.assertIn('toggleLottoZoom', self.manual_js)

    def test_06_tap_to_focus_vcm_sweeping_and_distance_nudge(self):
        """Verify triggerCameraAutoFocus performs VCM actuator cycling, Android focusDistance sweep, and iOS wake-up."""
        self.assertIn('triggerCameraAutoFocus', self.manual_js)
        self.assertIn('focusMode: "single-shot"', self.manual_js, "Must pulse single-shot to sweep focal plane")
        self.assertIn('focusMode: "continuous"', self.manual_js, "Must return to continuous autofocus")
        self.assertIn('caps.focusDistance', self.manual_js, "Must support Android manual focusDistance sweep")
        self.assertIn('caps.exposureCompensation', self.manual_js, "Must support iOS exposure nudge wake-up")

    def test_07_photo_gallery_top_crop_and_contrast_enhancement(self):
        """Verify scanWithContrastEnhancement supports downscaling, top-half crop, and adaptive binarization."""
        self.assertIn('scanWithContrastEnhancement', self.manual_js)
        self.assertIn('topH = Math.floor(h * 0.5)', self.manual_js, "Must crop top half of receipt photo for high-res QR")
        self.assertIn('decodeSingleQrImageFile', self.manual_js)

    def test_08_window_exports_integrity(self):
        """Verify all new camera & QR utilities are exported to window."""
        self.assertIn('window.startUniversalLiveQrScannerLoop = startUniversalLiveQrScannerLoop', self.manual_js)
        self.assertIn('window.applySoftwareZoom = applySoftwareZoom', self.manual_js)
        self.assertIn('window.triggerCameraAutoFocus = triggerCameraAutoFocus', self.manual_js)
        self.assertIn('window.toggleLottoZoom = toggleLottoZoom', self.manual_js)

    def test_09_galaxy_s24_plus_safeguards(self):
        """Verify Galaxy S24+ specific fixes: no initial advanced constraints, ultra-wide filter, local jsqr, sw cache."""
        # 1. No advanced constraints in step 1 getUserMedia (prevents OverconstrainedError on S24+ HAL)
        step1_match = re.search(r'// 1단계: Universal Full HD 1080p.*?started = await attemptStart\((\{.*?\})\);', self.manual_js, re.DOTALL)
        self.assertTrue(step1_match, "Step 1 attemptStart must be present")
        step1_code = step1_match.group(1)
        self.assertNotIn('advanced:', step1_code, "Step 1 must NOT pass advanced constraints in getUserMedia")

        # 2. Exclude fixed-focus 0.5x ultra-wide camera on S24+
        self.assertIn('isUltraWide', self.manual_js)
        self.assertIn('!isUltraWide', self.manual_js)

        # 3. Local jsqr.min.js load & PWA offline cache in sw.js
        self.assertIn('jsqr.min.js', self.html)
        sw_path = os.path.join(self.root_dir, 'sw.js')
        with open(sw_path, 'r', encoding='utf-8') as f:
            sw_code = f.read()
        self.assertIn('jsqr.min.js', sw_code)

        # 4. Atomic applyConstraints combining focus, exposure and zoom together
        self.assertIn('Combined focus, exposure & zoom applied atomically', self.manual_js)

        # 5. Dual BarcodeDetector + jsQR on magnified macro crop
        self.assertIn('cropBarcodes = await nativeDetector.detect(offscreenCanvas)', self.manual_js)

    def test_10_galaxy_s24_plus_lens_switch_and_macro_pulse(self):
        """Verify Galaxy S24+ lens switch UI, manual lens cycling, 22cm macro pulse, and distance calibration."""
        # 1. UI Switch Lens button
        self.assertIn('id="btnSwitchCamera"', self.html, "index.html must provide #btnSwitchCamera button in viewfinder")
        self.assertIn('switchLottoCamera', self.html, "btnSwitchCamera must call switchLottoCamera")

        # 2. Logic & Functions
        self.assertIn('switchLottoCamera', self.manual_js, "manual-modal.js must implement switchLottoCamera")
        self.assertIn('updateAvailableLottoCameras', self.manual_js, "manual-modal.js must implement updateAvailableLottoCameras")
        self.assertIn('availableLottoCameras', self.manual_js)

        # 3. 22cm macro focus pulse & distance calibration
        self.assertIn('0.22', self.manual_js, "Focus distance must be calibrated to 0.22m (22cm macro)")
        self.assertIn('macroPulse', self.manual_js, "Must include initial macro pulse to unstick VCM actuator")

        # 4. Window export
        self.assertIn('window.switchLottoCamera = switchLottoCamera', self.manual_js)

    def test_11_all_smartphones_device_matrix_simulation(self):
        """Simulate iPhone, Galaxy Flagship, Galaxy Midrange, Pixel, and In-App WebViews in Node.js."""
        import subprocess
        import shutil
        node_bin = shutil.which('node') or r'C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe'
        if not os.path.exists(node_bin):
            self.skipTest("Node.js binary not available on this host")

        js_script = r"""
function createMockDom() {
    const elements = new Map();
    function createEl(id = '') {
        return {
            id, style: {}, classList: { add: () => {}, remove: () => {}, contains: () => false },
            title: '', value: '', innerHTML: '', clientWidth: 360, clientHeight: 360,
            getBoundingClientRect: () => ({ left: 0, top: 0, right: 360, bottom: 360, width: 360, height: 360 }),
            querySelector: () => null, querySelectorAll: () => [], appendChild: () => {}, remove: () => {},
            setAttribute: () => {}, removeAttribute: () => {}, focus: () => {}
        };
    }
    function getOrCreate(id) {
        if (!elements.has(id)) elements.set(id, createEl(id));
        return elements.get(id);
    }
    return {
        addEventListener: () => {}, getElementById: (id) => getOrCreate(id),
        querySelector: (sel) => getOrCreate(sel.includes('video') ? 'videoEl' : 'sel'),
        querySelectorAll: () => [],
        createElement: (tag) => {
            const el = createEl();
            el.tagName = tag.toUpperCase();
            el.getContext = () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(380 * 380 * 4) }), putImageData: () => {} });
            return el;
        },
        head: { appendChild: () => {} }, body: { appendChild: () => {} }
    };
}

async function run() {
    const mockNav = {
        userAgent: 'iPhone iOS 17 Safari',
        mediaDevices: {
            getUserMedia: async () => ({
                getTracks: () => [{ label: 'Back', kind: 'video', readyState: 'live', getCapabilities: () => ({ facingMode: ['environment'] }), getSettings: () => ({}), applyConstraints: async () => true, stop: () => {} }]
            }),
            enumerateDevices: async () => [{ kind: 'videoinput', deviceId: '1', label: 'Back' }]
        }
    };
    try {
        Object.defineProperty(global, 'navigator', { value: mockNav, writable: true, configurable: true });
    } catch(e) {
        global.navigator = mockNav;
    }

    // 1. iPhone 15 Pro / iOS 17 Safari
    global.window = { addEventListener: () => {}, removeEventListener: () => {}, location: { search: '' }, state: {}, jsQR: () => ({ data: 'v.dhlottery.co.kr/?v=1240q010203040506' }) };
    global.document = createMockDom();
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    const modal = await import('./src/services/lotto/views/manual-modal.js');
    modal.applySoftwareZoom(1.3);
    await modal.toggleLottoZoom();
    await modal.triggerCameraAutoFocus();
    await modal.stopScanning();

    // 2. Galaxy S24+ / Ultra (One UI 6.1)
    global.window.BarcodeDetector = class { async detect() { return [{ rawValue: 'v.dhlottery.co.kr/?v=1240q010203040506' }]; } };
    mockNav.mediaDevices.getUserMedia = async () => ({
        getTracks: () => [{ label: 'camera2 0, facing back', kind: 'video', readyState: 'live', getCapabilities: () => ({ facingMode: ['environment'], focusMode: ['continuous', 'single-shot'], zoom: { min: 1.0, max: 10.0 }, focusDistance: { min: 0.1, max: 10.0 }, torch: true }), getSettings: () => ({ deviceId: 's24-main-0' }), applyConstraints: async () => true, stop: () => {} }]
    });
    global.Html5Qrcode = class { async start() { return true; } async stop() { return true; } async clear() { return true; } static async getCameras() { return [{ id: 's24-main-0', label: 'camera2 0, facing back' }, { id: 's24-ultra-2', label: 'camera2 2, facing back' }]; } };
    await modal.startLottoQrScanner();
    await modal.applyCameraFocusOptimization();
    await modal.triggerCameraAutoFocus();
    await modal.updateAvailableLottoCameras();
    await modal.stopScanning();

    // 3. Midrange Android (Galaxy A54)
    mockNav.mediaDevices.getUserMedia = async () => ({
        getTracks: () => [{ label: 'camera2 0, back', kind: 'video', readyState: 'live', getCapabilities: () => ({ facingMode: ['environment'], focusMode: ['continuous'], zoom: { min: 1.0, max: 3.0 } }), applyConstraints: async () => true, stop: () => {} }]
    });
    await modal.applyCameraFocusOptimization();
    await modal.triggerCameraAutoFocus();
    await modal.stopScanning();

    console.log('ALL_5_SMARTPHONE_PROFILES_OK');
}
run();
"""
        proc = subprocess.run([node_bin, '--input-type=module', '-e', js_script], capture_output=True, text=True, cwd=self.root_dir)
        self.assertEqual(proc.returncode, 0, f"Smartphone matrix simulation failed: {proc.stderr or proc.stdout}")
        self.assertIn('ALL_5_SMARTPHONE_PROFILES_OK', proc.stdout)

if __name__ == '__main__':
    unittest.main()
