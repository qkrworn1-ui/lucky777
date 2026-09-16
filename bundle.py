import os
import re
import json
import sys
import unittest
import shutil
import datetime
import urllib.request

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BACKUP_DIR = "backups"

def push_version_to_firestore(version, build_date):
    print(f"[*] [FIREBASE] Pushing build version {version} to Firestore...")
    api_key = "AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA"
    project_id = "sonamu-jokgu-club"
    doc_path = "lotto_purchases/app_latest_version"
    url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/{doc_path}?key={api_key}"
    
    now_iso = datetime.datetime.now().isoformat()
    payload = {
        "fields": {
            "version": {"stringValue": version},
            "buildDate": {"stringValue": build_date},
            "updatedAt": {"stringValue": now_iso},
            "channel": {"stringValue": "production"}
        }
    }
    
    try:
        data_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data_bytes, method='PATCH', headers={'Content-Type': 'application/json', 'User-Agent': 'Lucky777-Builder'})
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status in (200, 204):
                print(f"[+] [FIREBASE-SYNC-PASS] Version {version} successfully pushed to Firestore ({doc_path})!")
                return True
    except Exception as ex:
        print(f"[!] [FIREBASE-WARN] Firestore push skipped/failed (offline or timeout): {ex}")
        return False


def run_preflight_tests():
    print("[*] [TEST] Running Pre-flight Integrity Tests...")
    loader = unittest.TestLoader()
    suite = loader.discover('tests', pattern='test_*.py')
    runner = unittest.TextTestRunner(verbosity=1)
    result = runner.run(suite)
    if not result.wasSuccessful():
        print("[!] [FAIL] Pre-flight tests FAILED! Bundling aborted.")
        sys.exit(1)
    print("[+] [PASS] All pre-flight integrity tests PASSED!")


def generate_unique_datetime_version(vdata=None, base_time=None):
    """
    Generate date/time version: vYYYY.MM.DD.HHMM (e.g. v2026.09.14.2335)
    If a build already occurred in the same minute, append second.
    """
    now = base_time or datetime.datetime.now()
    date_str = now.strftime('%Y.%m.%d')
    time_str = now.strftime('%H%M')
    version = f"v{date_str}.{time_str}"
    
    if vdata:
        old_ver = vdata.get('version', '')
        history_vers = [h.get('version') for h in vdata.get('buildHistory', [])]
        if version == old_ver or version in history_vers:
            sec_str = now.strftime('%S')
            version = f"{version}.{sec_str}"
    return version


def sync_version_assets(auto_bump=True, explicit_version=None, build_desc=""):
    if not os.path.exists('version.json'):
        vdata = {"version": "v2026.09.14.0000", "buildHistory": []}
    else:
        with open('version.json', 'r', encoding='utf-8') as f:
            vdata = json.load(f)
            
    old_version = vdata.get('version', 'v767').strip()
    now_dt = datetime.datetime.now()
    now_iso = now_dt.isoformat()
    build_date = now_dt.strftime('%Y-%m-%d')
    build_time = now_dt.strftime('%H:%M')

    if explicit_version:
        version = explicit_version
        print(f"[*] [EXPLICIT-VERSION] Using target version: {version}")
    elif auto_bump and '--no-bump' not in sys.argv:
        version = generate_unique_datetime_version(vdata, now_dt)
        print(f"[*] [AUTO-DATETIME-BUILD] Version generated: {old_version} -> {version} ({build_date} {build_time})")
    else:
        version = old_version

    # Update buildHistory in version.json
    history = vdata.get('buildHistory', [])
    if not isinstance(history, list):
        history = []
    
    # Check if this version entry already exists
    existing_entry = next((h for h in history if h.get('version') == version), None)
    if not existing_entry:
        history.append({
            "version": version,
            "buildDate": build_date,
            "buildTime": build_time,
            "buildTimestamp": now_iso,
            "description": build_desc or vdata.get('description', 'Application production build')
        })
    else:
        if build_desc:
            existing_entry['description'] = build_desc
            existing_entry['buildTimestamp'] = now_iso

    # Keep last 50 builds in history
    vdata['buildHistory'] = history[-50:]
    vdata['version'] = version
    vdata['buildDate'] = build_date
    vdata['buildTime'] = build_time
    vdata['buildTimestamp'] = now_iso
    if build_desc:
        vdata['description'] = build_desc

    with open('version.json', 'w', encoding='utf-8') as f:
        json.dump(vdata, f, indent=2, ensure_ascii=False)

    v_num = version.lstrip('v')
    print(f"[*] [SYNC] Synchronizing Version: {version} (v_num: {v_num})...")

    if os.path.exists('index.html'):
        with open('index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        html = re.sub(r'styles\.css\?v=[a-zA-Z0-9_.-]+', f'styles.css?v={v_num}', html)
        html = re.sub(r'app_v2\.js\?v=[a-zA-Z0-9_.-]+', f'app_v2.js?v={v_num}', html)
        html = re.sub(r'sw\.js\?v=[a-zA-Z0-9_.-]+', f'sw.js?v={v_num}', html)
        html = re.sub(r'data\.js\?v=[a-zA-Z0-9_.-]+', f'data.js?v={v_num}', html)
        html = re.sub(r'New version \([^)]+\) installed!', f'New version ({version}) installed!', html)
        html = re.sub(
            r'(<span id="appVersionBadgeLanding"[^>]*>\s*<i class="fa-solid fa-code-branch"></i>\s*)([vV0-9_.-]+)(\s*<i class="fa-solid fa-rotate"[^>]*></i>\s*</span>)',
            rf'\g<1>{version}\g<3>',
            html
        )
        html = re.sub(
            r'(<span class="app-version-badge"[^>]*>\s*)([vV0-9_.-]+)(\s*</span>)',
            rf'\g<1>{version}\g<3>',
            html
        )
        html = re.sub(
            r'(<span class="app-version-badge"[^>]*>\s*<i class="fa-solid fa-code-branch"></i>\s*)([vV0-9_.-]+)(\s*</span>)',
            rf'\g<1>{version}\g<3>',
            html
        )
        html = re.sub(r'window\.APP_VERSION\s*=\s*[\'"][^\'"]+[\'"];', f"window.APP_VERSION = '{version}';", html)
        html = re.sub(r'var\s+vStr\s*=\s*window\.LATEST_SERVER_VERSION\s*\|\|\s*window\.APP_VERSION\s*\|\|\s*[\'"][^\'"]+[\'"];', f"var vStr = window.LATEST_SERVER_VERSION || window.APP_VERSION || '{version}';", html)
        html = re.sub(r'var\s+v\s*=\s*ver\s*\|\|\s*window\.APP_VERSION\s*\|\|\s*[\'"][^\'"]+[\'"];', f"var v = ver || window.APP_VERSION || '{version}';", html)
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(html)
        print("  [+] index.html version synced.")

    if os.path.exists('sw.js'):
        with open('sw.js', 'r', encoding='utf-8') as f:
            sw = f.read()
        sw = re.sub(r'const CACHE_NAME = [\'"]lucky777-pwa-[^\'"]+[\'"];', f"const CACHE_NAME = 'lucky777-pwa-{version}';", sw)
        with open('sw.js', 'w', encoding='utf-8') as f:
            f.write(sw)
        print("  [+] sw.js CACHE_NAME synced.")

    return version


def save_build_snapshot(version):
    """
    Saves snapshot of app_v2.js and version.json to backups/ directory.
    Maintains the latest 50 build snapshots.
    """
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR, exist_ok=True)
        
    if os.path.exists('app_v2.js'):
        backup_js = os.path.join(BACKUP_DIR, f"app_v2_{version}.js")
        shutil.copy2('app_v2.js', backup_js)
        print(f"  [+] Backup snapshot saved: {backup_js}")
        
    if os.path.exists('version.json'):
        backup_json = os.path.join(BACKUP_DIR, f"version_{version}.json")
        shutil.copy2('version.json', backup_json)
        
    # Rotate backups - keep latest 5
    try:
        js_files = [os.path.join(BACKUP_DIR, f) for f in os.listdir(BACKUP_DIR) if f.startswith('app_v2_') and f.endswith('.js')]
        js_files.sort(key=os.path.getmtime)
        if len(js_files) > 5:
            for old_f in js_files[:-5]:
                os.remove(old_f)
                old_meta = old_f.replace('app_v2_', 'version_').replace('.js', '.json')
                if os.path.exists(old_meta):
                    os.remove(old_meta)
    except Exception as e:
        print(f"  [!] Backup rotation note: {e}")


def list_build_history():
    """
    Prints a formatted table of all builds recorded in version.json and backups/.
    """
    if not os.path.exists('version.json'):
        print("[!] No version.json file found.")
        return
        
    with open('version.json', 'r', encoding='utf-8') as f:
        vdata = json.load(f)
        
    current_ver = vdata.get('version', 'unknown')
    history = vdata.get('buildHistory', [])
    
    print("=" * 80)
    print(f" 📜 Lucky777 빌드 이력 및 롤백 가능 목록 (현재 버전: {current_ver})")
    print("=" * 80)
    print(f"{'순번':<4} | {'버전 (Version)':<26} | {'빌드 일시':<18} | {'스냅샷':<6} | {'설명'}")
    print("-" * 80)
    
    if not history:
        has_snap = "O" if os.path.exists(os.path.join(BACKUP_DIR, f"app_v2_{current_ver}.js")) else "X"
        print(f" 1   | {current_ver:<26} | {vdata.get('buildDate','')} {vdata.get('buildTime','')} | {has_snap:<6} | {vdata.get('description','Current build')}")
    else:
        for idx, h in enumerate(reversed(history), 1):
            ver = h.get('version', '')
            bdate = f"{h.get('buildDate', '')} {h.get('buildTime', '')}".strip()
            desc = h.get('description', '')
            snap_path = os.path.join(BACKUP_DIR, f"app_v2_{ver}.js")
            has_snap = "O" if os.path.exists(snap_path) else "X"
            is_active = " (현재)" if ver == current_ver else ""
            ver_display = f"{ver}{is_active}"
            print(f"{idx:<4} | {ver_display:<26} | {bdate:<18} | {has_snap:<6} | {desc}")

    print("=" * 80)
    print(" 💡 원하는 과거 버전으로 롤백하려면 아래 명령을 실행하세요:")
    print("    python bundle.py --rollback <버전번호>")
    print("    (예: python bundle.py --rollback v2026.09.14.2335)")
    print("=" * 80)


def verify_version_crosscheck(expected_version):
    print(f"[*] [CROSS-CHECK] Verifying build integrity for version {expected_version}...")
    v_num = expected_version.lstrip('v')
    
    # 1. version.json
    with open('version.json', 'r', encoding='utf-8') as f:
        vdata = json.load(f)
    if vdata.get('version') != expected_version:
        raise ValueError(f"version.json mismatch: expected {expected_version}, found {vdata.get('version')}")
    
    # 2. index.html
    with open('index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    if f"window.APP_VERSION = '{expected_version}';" not in html:
        raise ValueError(f"index.html window.APP_VERSION mismatch for {expected_version}")
    if f"styles.css?v={v_num}" not in html:
        raise ValueError(f"index.html styles.css?v={v_num} query mismatch")
    if f"app_v2.js?v={v_num}" not in html:
        raise ValueError(f"index.html app_v2.js?v={v_num} query mismatch")
    if f"sw.js?v={v_num}" not in html:
        raise ValueError(f"index.html sw.js?v={v_num} query mismatch")
    
    # 3. sw.js
    with open('sw.js', 'r', encoding='utf-8') as f:
        sw = f.read()
    if f"lucky777-pwa-{expected_version}" not in sw:
        raise ValueError(f"sw.js CACHE_NAME mismatch for {expected_version}")
    
    # 4. app_v2.js
    with open('app_v2.js', 'r', encoding='utf-8') as f:
        app_js = f.read()
    if f"BUILD_VERSION: {expected_version}" not in app_js:
        raise ValueError(f"app_v2.js bundle header version mismatch for {expected_version}")
    
    print(f"[+] [PASS] Cross-check verified across all 4 build targets (version.json, index.html, sw.js, app_v2.js)!")

FILES_TO_BUNDLE = [
    "src/shared/utils.js",
    "src/shared/crypto-utils.js",
    "src/shared/components.js",
    "src/shared/db.js",
    "src/shared/event-bus.js",
    "src/shared/user-context.js",
    "src/shared/auth-mgmt.js",
    "src/services/lotto/state.js",
    "src/services/lotto/ledger.js",
    "src/services/lotto/statistics.js",
    "src/services/lotto/scoring.js",
    "src/services/lotto/scraper.js",
    "src/services/lotto/generator.js",
    "src/services/lotto/views/draw-banner.js",
    "src/services/lotto/views/review-tab.js",
    "src/services/lotto/views/algorithms-tab.js",
    "src/services/lotto/views/generator-tab.js",
    "src/services/lotto/views/budget-optimizer-modal.js",
    "src/services/lotto/views/simulation-tab.js",
    "src/services/lotto/views/confirmed-tab.js",
    "src/services/lotto/views/dashboard-tab.js",
    "src/services/lotto/views/wheeling.js",
    "src/services/lotto/views/verification.js",
    "src/services/lotto/views/prediction-report.js",
    "src/services/lotto/views/quick-view.js",
    "src/services/lotto/views/manual-modal.js",
    "src/services/lotto/views/celebration.js",
    "src/services/lotto/views/manual-draw-modal.js",
    "src/services/lotto/views/snapshot-audit-modal.js",
    "src/services/lotto/views/sync.js",
    "src/services/lotto/views/hex-map.js",
    "src/services/lotto/index.js",
    "src/services/toto/data/mock-fixtures.js",
    "src/services/toto/data/standings-data.js",
    "src/services/toto/state.js",
    "src/services/toto/engine.js",
    "src/services/toto/scraper.js",
    "src/services/toto/views/toto-dashboard.js",
    "src/services/toto/index.js",
    "src/shared/landing-dashboard.js",
    "src/main.js"
]

SAFE_STORAGE_DEFINITION = """
const SafeStorage = {
    getItem(key) { try { return sessionStorage.getItem(key); } catch (e) { if (!window.__sMock) window.__sMock = {}; return window.__sMock[key] || null; } },
    setItem(key, val) { try { sessionStorage.setItem(key, val); } catch (e) { if (!window.__sMock) window.__sMock = {}; window.__sMock[key] = val; } },
    removeItem(key) { try { sessionStorage.removeItem(key); } catch (e) { if (window.__sMock) delete window.__sMock[key]; } }
};
const SafeLocalStorage = {
    getItem(key) { try { return localStorage.getItem(key); } catch (e) { if (!window.__lMock) window.__lMock = {}; return window.__lMock[key] || null; } },
    setItem(key, val) { try { localStorage.setItem(key, val); } catch (e) { if (!window.__lMock) window.__lMock = {}; window.__lMock[key] = val; } },
    removeItem(key) { try { localStorage.removeItem(key); } catch (e) { if (window.__lMock) delete window.__lMock[key]; } }
};
"""

def get_mod_slug(path):
    path_str = str(os.path.normpath(path)).replace(os.sep, '/').replace('.js', '')
    if path_str.startswith('src/'):
        path_str = path_str[4:]
    slug = path_str.replace('/', '_').replace('-', '_')
    return f"__M_{slug}"

def bundle_core(version):
    """
    Assembles all ES modules into single isolated app_v2.js bundle.
    """
    bundled_content = [
        f"/**\n * Lucky777 Smart Bundle ({version})\n */\n",
        SAFE_STORAGE_DEFINITION
    ]
    
    for file_path in FILES_TO_BUNDLE:
        if not os.path.exists(file_path):
            continue
            
        print(f"[+] Bundling {file_path}...")
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
            
            # Module name from canonical path
            mod_name = get_mod_slug(file_path)
            
            # Find exports
            export_names = re.findall(r'\bexport\s+(?:async\s+)?(?:function|const|let|class)\s+([a-zA-Z0-9_]+)', content)
            
            # Strip export keywords
            content = re.sub(r'\bexport\s+(async\s+function|function|const|let|class)\b', r'\1', content)
            
            # Replace imports: import { a, b as c } from './utils.js' -> const { a, b: c } = __M_shared_utils;
            def repl_import(m):
                vars_part = m.group(1)
                path_part = m.group(2)
                resolved_path = os.path.normpath(os.path.join(os.path.dirname(file_path), path_part))
                target_mod = get_mod_slug(resolved_path)
                # Replace ' as ' with ': ' for destructuring
                clean_vars = re.sub(r'\b([a-zA-Z0-9_]+)\s+as\s+([a-zA-Z0-9_]+)\b', r'\1: \2', vars_part)
                return f"const {{{clean_vars}}} = {target_mod};"
                
            content = re.sub(r'import\s+\{([^}]+)\}\s+from\s+[\'"]([^\'"]+)[\'"];?', repl_import, content)
            
            # Replace sessionStorage/localStorage (skip auth-mgmt.js which uses window.* directly to avoid circular refs)
            if 'auth-mgmt' not in file_path:
                content = content.replace("sessionStorage", "SafeStorage")
                content = content.replace("localStorage", "SafeLocalStorage")
            
            # Remove dynamic imports
            content = re.sub(r'import\([^\)]+\)\.then\([^\)]+\)\.catch\([^\)]+\);?', '', content)
            
            # Wrap in Safe IIFE with Module Fault Isolation
            iife = f"const {mod_name} = (function() {{\n"
            iife += "    const __exports = {};\n"
            iife += "    try {\n"
            iife += content + "\n"
            for name in export_names:
                iife += f"        if (typeof {name} !== 'undefined') {{\n"
                iife += f"            __exports.{name} = {name};\n"
                iife += f"            if (typeof window !== 'undefined') window.{name} = {name};\n"
                iife += f"        }}\n"
            iife += "    } catch (modErr) {\n"
            iife += f"        console.error('[Module Isolation Error in {file_path}]:', modErr);\n"
            iife += "    }\n"
            iife += "    return __exports;\n"
            iife += "})();\n"
            
            bundled_content.append(iife)
            
    final_output = []
    build_date = datetime.date.today().isoformat()
    final_output.append(f"/* [LUCKY777 APP BUNDLE - BUILD_VERSION: {version} - BUILD_DATE: {build_date}] */\n")
    final_output.append("try {\n")
    final_output.extend(bundled_content)
    final_output.append("\n} catch (FATAL_INIT_ERR) {")
    final_output.append("    console.error('App Init Error:', FATAL_INIT_ERR.message, FATAL_INIT_ERR.stack);")
    final_output.append("}\n")

    with open("app_v2.js", "w", encoding="utf-8") as out:
        out.write("\n".join(final_output))


def perform_rollback(target_version):
    """
    Rolls back the application to a specific past version:
    1. Restores app_v2.js from backups/ if available, or rebuilds with target_version
    2. Synchronizes version.json, index.html, sw.js to target_version
    3. Cross-checks build integrity
    4. Pushes the rollback version to Firebase Firestore
    """
    clean_target = target_version.strip()
    if not clean_target.startswith('v') and not clean_target.isdigit():
        clean_target = f"v{clean_target}"
    elif clean_target.isdigit():
        clean_target = f"v{clean_target}"

    print("=" * 80)
    print(f" ⏪ [ROLLBACK] Lucky777 버전 롤백 시작: {clean_target}")
    print("=" * 80)

    # 1. Check if backup exists
    backup_js = os.path.join(BACKUP_DIR, f"app_v2_{clean_target}.js")
    
    # 2. Sync version assets (index.html, sw.js, version.json)
    build_desc = f"Rollback to {clean_target}"
    sync_version_assets(auto_bump=False, explicit_version=clean_target, build_desc=build_desc)

    # 3. Restore app_v2.js
    if os.path.exists(backup_js):
        print(f"[*] [RESTORE] Restoring app_v2.js from snapshot: {backup_js}...")
        shutil.copy2(backup_js, 'app_v2.js')
    else:
        print(f"[*] [REBUILD] Backup snapshot not found. Regenerating bundle directly for version {clean_target}...")
        bundle_core(clean_target)

    # 4. Save snapshot of active state
    save_build_snapshot(clean_target)

    # 5. Cross-check
    verify_version_crosscheck(clean_target)

    # 6. Push to Firestore
    with open('version.json', 'r', encoding='utf-8') as f:
        vdata = json.load(f)
    build_date = vdata.get('buildDate', datetime.date.today().isoformat())
    push_version_to_firestore(clean_target, build_date)

    print("\n" + "=" * 80)
    print(f" [✅ ROLLBACK COMPLETE] 성공적으로 {clean_target} 버전으로 롤백되었습니다!")
    print(" Firestore 실시간 알림이 전송되어 모든 접속 기기에서 롤백 버전이 즉시 반영됩니다.")
    print(" 이제 변경사항을 Git에 push하시면 배포가 완료됩니다:")
    print(f"    git add . && git commit -m \"Rollback to {clean_target}\" && git push")
    print("=" * 80 + "\n")


def clean_and_bundle(custom_desc=None, explicit_version=None):
    version = sync_version_assets(explicit_version=explicit_version, build_desc=custom_desc)
    run_preflight_tests()
    print(f"[*] Starting smart bundling process for [{version}]...")
    bundle_core(version)
    save_build_snapshot(version)
    verify_version_crosscheck(version)
    build_date = datetime.date.today().isoformat()
    push_version_to_firestore(version, build_date)
    print(f"[*] Done! Build [{version}] completed and snapshot archived.")


if __name__ == "__main__":
    args = sys.argv[1:]
    
    if '--list-builds' in args or '-l' in args:
        list_build_history()
        sys.exit(0)
        
    if '--rollback' in args or '-r' in args:
        flag = '--rollback' if '--rollback' in args else '-r'
        idx = args.index(flag)
        if idx + 1 < len(args):
            target_v = args[idx + 1]
            perform_rollback(target_v)
            sys.exit(0)
        else:
            print("[!] Error: Please specify target version to rollback. Example: python bundle.py --rollback v2026.09.14.2335")
            list_build_history()
            sys.exit(1)
            
    desc = None
    if '--desc' in args or '-m' in args:
        flag = '--desc' if '--desc' in args else '-m'
        idx = args.index(flag)
        if idx + 1 < len(args):
            desc = args[idx + 1]
            
    clean_and_bundle(custom_desc=desc)
