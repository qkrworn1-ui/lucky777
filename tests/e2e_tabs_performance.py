import unittest
import time
import os
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

PORT = 8089
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

class SilentHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT_DIR, **kwargs)
    def log_message(self, format, *args):
        pass

def start_server():
    httpd = HTTPServer(('127.0.0.1', PORT), SilentHTTPRequestHandler)
    httpd.serve_forever()

class TestTabsPerformance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server_thread = threading.Thread(target=start_server, daemon=True)
        cls.server_thread.start()
        time.sleep(0.5)

    def get_driver(self, width=1440, height=900, is_mobile=False):
        options = Options()
        options.add_argument('--headless=new')
        options.add_argument('--disable-gpu')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument(f'--window-size={width},{height}')
        if is_mobile:
            options.add_argument('--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1')
        driver = webdriver.Chrome(options=options)
        return driver

    def test_01_desktop_tab_transitions_and_toast(self):
        driver = self.get_driver(1440, 900, is_mobile=False)
        try:
            driver.get(f'http://127.0.0.1:{PORT}/index.html')
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, 'body')))

            # 1. Test Master Login Toast Auto-dismiss
            driver.execute_script("""
                localStorage.setItem('lotto_auth_user', 'master');
                localStorage.setItem('lotto_user_data', JSON.stringify({
                    id: 'master',
                    userId: 'master',
                    realName: '최고관리자',
                    isAdmin: true,
                    isPermanent: true,
                    createdAt: '2026-01-01T00:00:00Z'
                }));
                if (window.SafeAuth && window.SafeAuth.set) {
                    window.SafeAuth.set('master');
                }
                if (window.showToast) {
                    window.showToast('👑 최고관리자 계정으로 접속했습니다.', 2000);
                }
            """)

            WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, 'toast')))
            toast = driver.find_element(By.ID, 'toast')
            print("[+] Toast appeared successfully on master login.")

            # Wait for auto-dismiss
            time.sleep(2.8)
            toast_display = driver.execute_script("return window.getComputedStyle(document.getElementById('toast')).display;")
            self.assertEqual(toast_display, 'none', "Toast should auto-dismiss and have display: none")
            print("[+] Toast auto-dismiss verified (display: none).")

            # 2. Navigate to Lotto Service
            driver.execute_script("if(window.showLotto) window.showLotto();")
            WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'appContainer')))
            print("[+] Lotto Service loaded successfully.")

            # 3. Test Tab Transitions
            tabs = ['tab-generator', 'tab-algorithms', 'tab-simulation', 'tab-wheeling', 'tab-review', 'tab-confirmed-list']
            for tab_id in tabs:
                start_time = time.time()
                driver.execute_script(f"window.switchTab('{tab_id}');")
                WebDriverWait(driver, 5).until(lambda d: d.find_element(By.ID, tab_id).is_displayed())
                elapsed = (time.time() - start_time) * 1000
                print(f"  [Desktop] Switched to {tab_id} in {elapsed:.1f}ms")
                self.assertLess(elapsed, 1000, f"Tab switch to {tab_id} should be under 1000ms")

            # 4. Rapid Tab Switching Stress Test (18 switches)
            print("[*] Running Rapid Desktop Tab Switching Stress Test...")
            start_rapid = time.time()
            for _ in range(3):
                for tab_id in tabs:
                    driver.execute_script(f"window.switchTab('{tab_id}');")
                    time.sleep(0.04)
            rapid_elapsed = (time.time() - start_rapid) * 1000
            print(f"[+] Rapid tab switching (18 switches) completed in {rapid_elapsed:.1f}ms!")

        finally:
            driver.quit()

    def test_02_mobile_tab_transitions_and_review(self):
        driver = self.get_driver(390, 844, is_mobile=True)
        try:
            driver.get(f'http://127.0.0.1:{PORT}/index.html')
            WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, 'body')))

            # Login as master
            driver.execute_script("""
                localStorage.setItem('lotto_auth_user', 'master');
                localStorage.setItem('lotto_user_data', JSON.stringify({
                    id: 'master',
                    userId: 'master',
                    realName: '최고관리자',
                    isAdmin: true,
                    isPermanent: true,
                    createdAt: '2026-01-01T00:00:00Z'
                }));
                if (window.SafeAuth && window.SafeAuth.set) {
                    window.SafeAuth.set('master');
                }
                if (window.showLotto) window.showLotto();
            """)
            WebDriverWait(driver, 5).until(EC.visibility_of_element_located((By.ID, 'appContainer')))
            time.sleep(0.5)

            # Test mobile tab switching
            tabs = ['tab-generator', 'tab-algorithms', 'tab-simulation', 'tab-wheeling', 'tab-review', 'tab-confirmed-list']
            for tab_id in tabs:
                start_time = time.time()
                driver.execute_script(f"window.switchTab('{tab_id}');")
                WebDriverWait(driver, 5).until(lambda d: d.find_element(By.ID, tab_id).is_displayed())
                elapsed = (time.time() - start_time) * 1000
                print(f"  [Mobile] Switched to {tab_id} in {elapsed:.1f}ms")
                self.assertLess(elapsed, 1000, f"Mobile tab switch to {tab_id} should be under 1000ms")

            # Verify Review Tab rendering on mobile
            driver.execute_script("window.switchTab('tab-review');")
            time.sleep(0.2)
            review_container = driver.find_element(By.ID, 'reviewMatchingContainer')
            self.assertTrue(review_container.is_displayed(), "Review matching container should be visible")
            print("[+] Mobile Review Tab verified and rendered cleanly.")

        finally:
            driver.quit()

if __name__ == '__main__':
    unittest.main()
