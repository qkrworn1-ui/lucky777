import os
import re

# File order based on dependency graph
FILES_TO_BUNDLE = [
    "src/shared/utils.js",
    "src/shared/crypto-utils.js",
    "src/shared/components.js",
    "src/shared/db.js",
    "src/shared/event-bus.js",
    "src/shared/auth-mgmt.js",
    "src/services/lotto/state.js",
    "src/services/lotto/ledger.js",
    "src/services/lotto/statistics.js",
    "src/services/lotto/scoring.js",
    "src/services/lotto/scraper.js",
    "src/services/lotto/generator.js",
    "src/services/lotto/views/draw-banner.js",
    "src/services/lotto/views/generator-tab.js",
    "src/services/lotto/views/review-tab.js",
    "src/services/lotto/views/algorithms-tab.js",
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
    print("[*] Starting smart bundling process...")
    bundled_content = [
        "/**\n * Lucky777 Smart Bundle\n */\n",
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
    final_output.append("try {\n")
    final_output.extend(bundled_content)
    final_output.append("\n} catch (FATAL_INIT_ERR) {")
    final_output.append("    console.error('App Init Error:', FATAL_INIT_ERR.message, FATAL_INIT_ERR.stack);")
    final_output.append("}\n")

    with open("app_v2.js", "w", encoding="utf-8") as out:
        out.write("\n".join(final_output))
    print("[*] Done!")

if __name__ == "__main__":
    clean_and_bundle()
