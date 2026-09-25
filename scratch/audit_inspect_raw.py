import urllib.request
import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
PROJECT_ID = 'sonamu-jokgu-club'

def decode_firestore_val(v):
    if not isinstance(v, dict):
        return v
    if 'stringValue' in v:
        return v['stringValue']
    if 'integerValue' in v:
        return int(v['integerValue'])
    if 'doubleValue' in v:
        return float(v['doubleValue'])
    if 'booleanValue' in v:
        return v['booleanValue']
    if 'nullValue' in v:
        return None
    if 'arrayValue' in v:
        return [decode_firestore_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        res = {}
        for k, sub_v in v['mapValue'].get('fields', {}).items():
            res[k] = decode_firestore_val(sub_v)
        return res
    return v

def fetch_collection(col_name):
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/{col_name}?key={API_KEY}&pageSize=100"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        docs = []
        for item in data.get('documents', []):
            doc_id = item['name'].split('/')[-1]
            fields = item.get('fields', {})
            parsed = {}
            for k, v in fields.items():
                parsed[k] = decode_firestore_val(v)
            parsed['_docId'] = doc_id
            docs.append(parsed)
        return docs

purchases = fetch_collection('lotto_purchases')
for p in purchases[:3]:
    print(f"=== Doc: {p['_docId']} ===")
    ledger = p.get('ledger')
    snapshots = p.get('snapshots') or p.get('recommendationSnapshots')
    print("ledger keys:", list(ledger.keys()) if isinstance(ledger, dict) else type(ledger))
    if isinstance(ledger, dict):
        for k, v in list(ledger.items())[:2]:
            print(f"  ledger[{k}] type: {type(v)}, len: {len(v) if isinstance(v, list) else 0}")
            if isinstance(v, list) and len(v) > 0:
                print(f"    first receipt: {json.dumps(v[0], ensure_ascii=False)[:200]}")
    print("snapshots keys:", list(snapshots.keys()) if isinstance(snapshots, dict) else type(snapshots))
    if isinstance(snapshots, dict):
        for k, v in list(snapshots.items())[:2]:
            print(f"  snapshots[{k}] type: {type(v)}")
            if isinstance(v, dict):
                print(f"    keys: {list(v.keys())}")
                combos = v.get('v4Combos') or v.get('combos')
                print(f"    combos type: {type(combos)}, sample: {combos[:2] if isinstance(combos, list) else combos}")
