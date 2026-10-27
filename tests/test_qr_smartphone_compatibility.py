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

if __name__ == '__main__':
    unittest.main()
