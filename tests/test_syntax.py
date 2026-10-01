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
            'sw.js',
            'netlify/functions/kakao-token.js',
            'netlify/functions/lotto.js',
            'app_v2.js'
        ]
        for f in js_files:
            if os.path.exists(f):
                ok, msg = check_js_syntax(f)
                self.assertTrue(ok, f"Syntax error in {f}: {msg}")

if __name__ == '__main__':
    unittest.main()
