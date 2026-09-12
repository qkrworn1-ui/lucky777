import os
import re
import json
import sys
import unittest

import datetime
import urllib.request

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

def sync_version_assets(auto_bump=True):
    if not os.path.exists('version.json'):
        return 'v716'
    with open('version.json', 'r', encoding='utf-8') as f:
        vdata = json.load(f)
    old_version = vdata.get('version', 'v716').strip()
    
    now_iso = datetime.datetime.now().isoformat()
    if auto_bump and '--no-bump' not in sys.argv:
        match = re.search(r'(\d+)', old_version)
        if match:
            v_int = int(match.group(1)) + 1
            version = f"v{v_int}"
        else:
            version = old_version
        vdata['version'] = version
        vdata['buildDate'] = datetime.date.today().isoformat()
        vdata['buildTimestamp'] = now_iso
        with open('version.json', 'w', encoding='utf-8') as f:
            json.dump(vdata, f, indent=2, ensure_ascii=False)
        print(f"[*] [AUTO-BUMP] Version incremented: {old_version} -> {version}")
    else:
        version = old_version
        vdata['buildTimestamp'] = now_iso
        with open('version.json', 'w', encoding='utf-8') as f:
            json.dump(vdata, f, indent=2, ensure_ascii=False)

    v_num = version.lstrip('v')
    print(f"[*] [SYNC] Synchronizing Version: {version} (v_num: {v_num})...")

    if os.path.exists('index.html'):
        with open('index.html', 'r', encoding='utf-8') as f:
            html = f.read()
        html = re.sub(r'styles\.css\?v=[a-zA-Z0-9_-]+', f'styles.css?v={v_num}', html)
        html = re.sub(r'app_v2\.js\?v=[a-zA-Z0-9_-]+', f'app_v2.js?v={v_num}', html)
        html = re.sub(r'sw\.js\?v=[a-zA-Z0-9_-]+', f'sw.js?v={v_num}', html)
        html = re.sub(r'data\.js\?v=[a-zA-Z0-9_-]+', f'data.js?v={v_num}', html)
        html = re.sub(r'New version \([^)]+\) installed!', f'New version ({version}) installed!', html)
        html = re.sub(
            r'(<span id="appVersionBadgeLanding"[^>]*>\s*<i class="fa-solid fa-code-branch"></i>\s*)(v[0-9]+)(\s*<i class="fa-solid fa-rotate"[^>]*></i>\s*</span>)',
            rf'\g<1>{version}\g<3>',
            html
        )
        html = re.sub(
            r'(<span class="app-version-badge"[^>]*>\s*)(v[0-9]+)(\s*</span>)',
            rf'\g<1>{version}\g<3>',
            html
        )
        html = re.sub(
            r'(<span class="app-version-badge"[^>]*>\s*<i class="fa-solid fa-code-branch"></i>\s*)(v[0-9]+)(\s*</span>)',
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
    "src/shared/auth-mgmt.js",
    "src/shared/user-context.js",
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

def clean_and_bundle():
    version = sync_version_assets()
    run_preflight_tests()
    print(f"[*] Starting smart bundling process for [{version}]...")
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
            
            
    # Wrap entire application execution in a try-catch to expose any hidden top-level errors
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
    verify_version_crosscheck(version)
    push_version_to_firestore(version, build_date)
    print("[*] Done!")

if __name__ == "__main__":
    clean_and_bundle()
