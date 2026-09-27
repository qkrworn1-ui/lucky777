import urllib.request
import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

def decode_val(v):
    if not isinstance(v, dict): return v
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'arrayValue' in v: return [decode_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k: decode_val(sub_v) for k, sub_v in v['mapValue'].get('fields', {}).items()}
    return v

url = 'https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/lotto_purchases/guest?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
fields = {k: decode_val(v) for k, v in data.get('fields', {}).items()}
snaps = fields.get('recommendationSnapshots', {})
for r in ['1235', '1236', '1237']:
    snap = snaps.get(r, {})
    print(f"=== Round {r} ===")
    print("Keys in snap:", list(snap.keys()))
    print("v4Combos[0]:", snap.get('v4Combos', [])[0] if snap.get('v4Combos') else None)
    print("v3Combos[0]:", snap.get('v3Combos', [])[0] if snap.get('v3Combos') else None)
    ep = snap.get('extraPacks', {})
    print("extraPacks keys/type:", type(ep), list(ep.keys()) if isinstance(ep, dict) else len(ep))
    if isinstance(ep, dict):
        first_k = list(ep.keys())[0]
        print(f"extraPacks[{first_k}]:", ep[first_k].keys() if isinstance(ep[first_k], dict) else type(ep[first_k]))
        if isinstance(ep[first_k], dict):
            print(f"extraPacks[{first_k}].combos length:", len(ep[first_k].get('combos', [])))
            print(f"extraPacks[{first_k}].combos[0]:", ep[first_k].get('combos', [])[0] if ep[first_k].get('combos') else None)
