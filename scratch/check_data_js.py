import re

with open('data.js', 'r', encoding='utf-8') as f:
    text = f.read()

for r in range(1235, 1245):
    pattern = rf"['\"]?{r}['\"]?\s*:\s*(\{{[^}}]+\}})"
    m = re.search(pattern, text)
    if m:
        print(f"{r}: {m.group(1)}")
    else:
        print(f"{r}: NOT FOUND")
