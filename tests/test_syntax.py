import unittest
import os
import sys

from tests.validate_syntax import check_js_syntax

class TestSyntaxIntegrity(unittest.TestCase):
    def test_syntax_all_js_files(self):
        js_files = [
            'src/shared/landing-dashboard.js',
            'src/services/lotto/ledger.js',
            'src/shared/auth-mgmt.js',
            'src/services/lotto/generator.js',
            'src/services/lotto/views/review-tab.js',
            'src/services/lotto/views/algorithms-tab.js',
            'src/services/lotto/views/confirmed-tab.js',
            'src/services/lotto/views/snapshot-audit-modal.js',
            'src/services/lotto/views/quick-view.js',
            'sw.js',
            'netlify/functions/kakao-token.js',
            'netlify/functions/lotto.js',
            'app_v2.js'
        ]
        for f in js_files:
            if os.path.exists(f):
                ok, msg = check_js_syntax(f)
                self.assertTrue(ok, f"Syntax error in {f}: {msg}")

    def test_node_syntax_check(self):
        import shutil, subprocess
        node_bin = shutil.which('node')
        if not node_bin:
            adobe_node = r'C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe'
            if os.path.exists(adobe_node):
                node_bin = adobe_node
        if node_bin and os.path.exists('app_v2.js'):
            res = subprocess.run([node_bin, '--check', 'app_v2.js'], capture_output=True, text=True)
            self.assertEqual(res.returncode, 0, f"Node syntax check failed on app_v2.js: {res.stderr or res.stdout}")

if __name__ == '__main__':
    unittest.main()
