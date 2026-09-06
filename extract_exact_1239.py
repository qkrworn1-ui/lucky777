import io, sys, re, json

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
log_path = r'C:\Users\qkrwo\.gemini\antigravity\brain\d3efc8c9-faf6-48c2-a9d7-bad87ef3b37b\.system_generated\logs\transcript_full.jsonl'

with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    for line_idx, line in enumerate(f):
        if line_idx == 2615:
            d = json.loads(line)
            c = d.get('content', '')
            # Find the JSON part
            start = c.find('{"master":')
            if start == -1:
                start = c.find('{"ledger":')
            if start == -1:
                start = c.find('{"1239":')
            print("Start index:", start)
            print("Snippet around 1239:")
            idx1239 = c.find('"1239"')
            if idx1239 != -1:
                print(c[idx1239:idx1239+3000])
