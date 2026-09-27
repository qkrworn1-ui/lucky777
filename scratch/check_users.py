import sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

with open('src/shared/user-context.js', 'r', encoding='utf-8') as f:
    text = f.read()

print("UserContextManager lines:")
for idx, line in enumerate(text.splitlines()[:80], 1):
    print(f"{idx}: {line}")
