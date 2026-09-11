import os
import sys
import time
import subprocess
from datetime import datetime

WATCH_DIRS = ['src', 'tests']
WATCH_FILES = ['index.html', 'styles.css', 'version.json']

def get_file_mtimes():
    mtimes = {}
    for d in WATCH_DIRS:
        if os.path.exists(d):
            for root, _, files in os.walk(d):
                for f in files:
                    if f.endswith('.js') or f.endswith('.py') or f.endswith('.css') or f.endswith('.html'):
                        p = os.path.join(root, f)
                        try:
                            mtimes[p] = os.path.getmtime(p)
                        except OSError:
                            pass
    for f in WATCH_FILES:
        if os.path.exists(f):
            try:
                mtimes[f] = os.path.getmtime(f)
            except OSError:
                pass
    return mtimes

def main():
    print("=" * 60)
    print(" 🚀 Lucky777 무인 자동 감시 및 실시간 빌드/동기화 엔진")
    print("=" * 60)
    print("[*] src/ 및 주요 파일 변경을 실시간으로 감시 중입니다...")
    print("[*] 파일을 수정하고 저장(Ctrl+S)하면 자동으로 번들링 및 동기화됩니다.")
    print("    (종료하려면 Ctrl+C를 누르세요)\n")

    last_mtimes = get_file_mtimes()
    
    while True:
        try:
            time.sleep(1)
            current_mtimes = get_file_mtimes()
            changed_files = []
            
            for p, mtime in current_mtimes.items():
                if p not in last_mtimes or mtime > last_mtimes[p]:
                    changed_files.append(p)
            
            if changed_files:
                print(f"\n[⚡ 감지] 파일 변경됨: {', '.join(changed_files)}")
                print(f"[*] [{datetime.now().strftime('%H:%M:%S')}] 자동 번들링 및 파이어베이스 동기화 시작...")
                
                # bundle.py 실행
                res = subprocess.run([sys.executable, 'bundle.py', '--no-bump'], capture_output=True, text=True, encoding='utf-8')
                if res.returncode == 0:
                    print("[✅ 완료] 자동 번들링 및 파이어베이스 동기화 성공!")
                else:
                    print(f"[❌ 오류] 빌드 실패:\n{res.stderr or res.stdout}")
                
                last_mtimes = get_file_mtimes()
        except KeyboardInterrupt:
            print("\n[*] 감시 엔진을 종료합니다.")
            break
        except Exception as e:
            print(f"[!] 감시 루프 오류: {e}")
            time.sleep(2)

if __name__ == '__main__':
    main()
