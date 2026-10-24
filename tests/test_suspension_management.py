import os
import unittest
import subprocess
import shutil

class TestSuspensionManagement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        cls.node_bin = shutil.which('node') or r"C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe"

    def test_01_user_context_is_user_suspended(self):
        js_code = """
        import { isUserSuspended } from './src/shared/user-context.js';

        // 1. Direct userData check
        if (!isUserSuspended('test1', { status: 'suspended' })) {
            console.error('Expected test1 to be suspended');
            process.exit(1);
        }
        if (!isUserSuspended('test2', { status: 'suspended_nopurchase' })) {
            console.error('Expected test2 to be suspended_nopurchase');
            process.exit(1);
        }
        if (isUserSuspended('test3', { status: 'active' })) {
            console.error('Expected test3 to NOT be suspended');
            process.exit(1);
        }
        if (isUserSuspended('master', { status: 'suspended' })) {
            console.error('Master should never be suspended');
            process.exit(1);
        }
        console.log('SUCCESS_TEST_01');
        """
        proc = subprocess.run([self.node_bin, '--input-type=module', '-e', js_code],
                              capture_output=True, text=True, encoding='utf-8', cwd=self.root_dir)
        self.assertEqual(proc.returncode, 0, f"Node script failed: {proc.stderr}")
        self.assertIn("SUCCESS_TEST_01", proc.stdout)

    def test_02_registration_and_kakao_ban_check(self):
        js_code = """
        global.window = {
            onerror: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            state: { allRegisteredUsersList: [] },
            location: { search: '', origin: '', pathname: '', hash: '' },
            sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
            localStorage: {
                getItem: (k) => {
                    if (k === 'lotto_users_with_status_cache') {
                        return JSON.stringify([
                            { userId: 'banned_user', status: 'suspended', data: { phoneNumber: '010-1234-5678', suspensionReason: '부정 이용' } },
                            { userId: 'nopurchase_user', status: 'suspended_nopurchase', data: { phoneNumber: '010-9999-8888', suspensionReason: '미구매 정지' } },
                            { userId: 'active_user', status: 'active', data: { phoneNumber: '010-5555-4444' } }
                        ]);
                    }
                    return null;
                },
                setItem: () => {},
                removeItem: () => {}
            }
        };
        global.document = {
            cookie: '',
            addEventListener: () => {},
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ setAttribute: () => {}, style: {} }),
            head: { appendChild: () => {} },
            body: { appendChild: () => {} }
        };
        global.localStorage = global.window.localStorage;
        global.sessionStorage = global.window.sessionStorage;

        async function run() {
            const { checkIsSuspendedForRegistration } = await import('./src/shared/auth-mgmt.js');

            // Check by ID
            const resId = await checkIsSuspendedForRegistration('banned_user');
            if (!resId.isBanned) {
                console.error('banned_user should be banned');
                process.exit(1);
            }

            // Check by phone
            const resPhone = await checkIsSuspendedForRegistration('new_id_attempt', '010-1234-5678');
            if (!resPhone.isBanned) {
                console.error('Matching phone number should be blocked from re-registration');
                process.exit(1);
            }

            // Check active user
            const resActive = await checkIsSuspendedForRegistration('active_user');
            if (resActive.isBanned) {
                console.error('active_user should NOT be banned');
                process.exit(1);
            }

            // Check brand new user
            const resClean = await checkIsSuspendedForRegistration('fresh_user', '010-7777-1111');
            if (resClean.isBanned) {
                console.error('fresh_user should NOT be banned');
                process.exit(1);
            }

            console.log('SUCCESS_TEST_02');
        }

        run().catch(e => { console.error(e); process.exit(1); });
        """
        proc = subprocess.run([self.node_bin, '--input-type=module', '-e', js_code],
                              capture_output=True, text=True, encoding='utf-8', cwd=self.root_dir)
        self.assertEqual(proc.returncode, 0, f"Node script failed: {proc.stderr}")
        self.assertIn("SUCCESS_TEST_02", proc.stdout)

    def test_03_index_html_elements_present(self):
        with open('index.html', 'r', encoding='utf-8') as f:
            html = f.read()

        # Suspended filter tab with badge
        self.assertIn('btnFilterSuspended', html)
        self.assertIn('userSuspendedCountBadge', html)
        self.assertIn('정지회원', html)

        # Drawer toggle suspend action box
        self.assertIn('drawerSuspensionActionBox', html)
        self.assertIn('btnDrawerToggleSuspend', html)

if __name__ == '__main__':
    unittest.main()
