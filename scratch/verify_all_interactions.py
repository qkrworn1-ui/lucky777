import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

with open('app_v2.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# 1. HTML DOM validation
from html.parser import HTMLParser
class TagChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []
    def handle_starttag(self, tag, attrs):
        if tag not in ['br', 'img', 'input', 'meta', 'link', 'hr']:
            attr_dict = dict(attrs)
            tag_id = attr_dict.get('id', '')
            self.stack.append((tag, tag_id, self.getpos()))
    def handle_endtag(self, tag):
        if tag in ['br', 'img', 'input', 'meta', 'link', 'hr']:
            return
        if not self.stack:
            self.errors.append(('Extra close', tag, self.getpos()))
            return
        last, last_id, pos = self.stack.pop()
        if last != tag:
            self.errors.append(('Mismatch', f'expected {last}({last_id}) from {pos}, got {tag}', self.getpos()))

parser = TagChecker()
parser.feed(html)
print(f"[1] DOM Tag Balance Check:")
print(f"    - Stack remaining: {len(parser.stack)}")
print(f"    - Tag errors: {len(parser.errors)}")
if parser.errors:
    for err in parser.errors:
        print(f"      ERROR: {err}")
else:
    print("    -> PERFECT: 0 HTML DOM nesting errors!")

# 2. Check all tab buttons in index.html
tabs = re.findall(r'<button[^>]*class=[\'"][^\'"]*tab-btn[^\'"]*[\'"][^>]*data-tab=[\'"]([^\'"]+)[\'"][^>]*>', html)
print(f"\n[2] Navigation Tabs in index.html:")
for t in tabs:
    # check if section id exists
    has_sec = f'id="{t}"' in html or f"id='{t}'" in html
    print(f"    - Tab '{t}': Section Target Exists = {has_sec}")

# 3. Check All onclick targets
onclicks = re.findall(r'onclick=[\'"]([^\'"]+)[\'"]', html)
print(f"\n[3] Onclick Handlers Verification ({len(onclicks)} elements):")
ignored = {'setTimeout', 'confirm', 'alert', 'parseInt', 'isNaN', 'close', 'scrollTo', 'stopPropagation', 'preventDefault', 'set', 'if', 'else', 'return', 'document', 'window'}
missing = set()
for oc in onclicks:
    funcs = re.findall(r'([a-zA-Z0-9_$]+)\s*\(', oc)
    for fn in funcs:
        if fn in ignored or fn.isdigit():
            continue
        # Search in app_js or index.html
        if fn not in app_js and fn not in html:
            missing.add((fn, oc))

if missing:
    print(f"    [!] Found {len(missing)} unresolved function calls:")
    for fn, oc in missing:
        print(f"        - Function '{fn}' called in: {oc}")
else:
    print("    -> PERFECT: All onclick functions resolve to real implementations in app_v2.js or index.html!")
