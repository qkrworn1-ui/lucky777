import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

for doc_id, doc in all_data.items():
    print(f"Doc: {doc_id} -> {list(doc.keys())}")
    for k, v in doc.items():
        if k != 'recommendationSnapshots':
            print(f"   {k}: {type(v)} -> {str(v)[:150]}")
