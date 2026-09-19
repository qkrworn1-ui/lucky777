import json
import urllib.request
import sys

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = "AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA"
PROJECT_ID = "sonamu-jokgu-club"

url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/lotto_purchases?key={API_KEY}&pageSize=300"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})

def decode_val(v):
    if not isinstance(v, dict):
        return v
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'arrayValue' in v:
        return [decode_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k: decode_val(val) for k, val in v['mapValue'].get('fields', {}).items()}
    return v

with urllib.request.urlopen(req, timeout=15) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    docs = data.get('documents', [])
    print(f"Total docs: {len(docs)}\n")
    
    all_data = {}
    for doc in docs:
        doc_id = doc.get('name', '').split('/')[-1]
        fields = doc.get('fields', {})
        decoded = {k: decode_val(v) for k, v in fields.items()}
        all_data[doc_id] = decoded
        print(f"Doc ID: {doc_id} -> Keys: {list(decoded.keys())}")
        if 'purchases' in decoded:
            purchases = decoded['purchases']
            if isinstance(purchases, str):
                try:
                    purchases = json.loads(purchases)
                except:
                    pass
            if isinstance(purchases, list):
                print(f"  -> purchases array length: {len(purchases)}")
                for p in purchases:
                    print(f"     Round: {p.get('round')}, Games: {len(p.get('combos', []))}, ReceiptID: {p.get('receiptId')}, Locked: {p.get('isLocked')}")
            elif isinstance(purchases, dict):
                print(f"  -> purchases dict keys: {list(purchases.keys())}")

with open("scratch/all_purchases_dump.json", "w", encoding="utf-8") as out:
    json.dump(all_data, out, indent=2, ensure_ascii=False)
print("\n[+] Dump saved to scratch/all_purchases_dump.json")
