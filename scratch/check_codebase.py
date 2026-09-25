import glob
import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

mod_exports = {}
for fpath in glob.glob('src/**/*.js', recursive=True):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    export_names = re.findall(r'\bexport\s+(?:async\s+)?(?:function|const|let|class)\s+([a-zA-Z0-9_]+)', content)
    norm_path = os.path.normpath(fpath)
    mod_exports[norm_path] = set(export_names)

missing_imports = []
for fpath in glob.glob('src/**/*.js', recursive=True):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    imports = re.findall(r'import\s+\{([^}]+)\}\s+from\s+[\'"]([^\'"]+)[\'"]', content)
    for vars_str, rel_path in imports:
        resolved = os.path.normpath(os.path.join(os.path.dirname(fpath), rel_path))
        exp_set = mod_exports.get(resolved, set())
        var_names = [v.strip().split(' as ')[0].strip() for v in vars_str.split(',')]
        for v in var_names:
            if v and v not in exp_set:
                missing_imports.append((fpath, v, resolved))

print(f'Total missing imports: {len(missing_imports)}')
for m in missing_imports:
    print(f'File: {m[0]} -> imports "{m[1]}" from {m[2]} (NOT EXPORTED!)')
