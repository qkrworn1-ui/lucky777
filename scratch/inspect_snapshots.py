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

for col in ['lotto_purchases', 'lotto_users']:
    url = f'https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/{col}?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA&pageSize=100'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"=== {col} ({len(data.get('documents', []))} docs) ===")
            for doc in data.get('documents', []):
                doc_id = doc['name'].split('/')[-1]
                fields = {k: decode_val(v) for k, v in doc.get('fields', {}).items()}
                snaps = fields.get('recommendationSnapshots') or fields.get('snapshots')
                if snaps:
                    if isinstance(snaps, str):
                        try: snaps = json.loads(snaps)
                        except: pass
                    if isinstance(snaps, dict):
                        print(f"User {doc_id}: rounds {list(snaps.keys())}")
                        for r, sdata in snaps.items():
                            if isinstance(sdata, str):
                                try: sdata = json.loads(sdata)
                                except: pass
                            if isinstance(sdata, dict):
                                v4_len = len(sdata.get('v4Combos', [])) if isinstance(sdata.get('v4Combos'), list) else 0
                                v3_len = len(sdata.get('v3Combos', [])) if isinstance(sdata.get('v3Combos'), list) else 0
                                ep = sdata.get('extraPacks')
                                ep_type = type(ep).__name__
                                ep_len = len(ep) if isinstance(ep, (dict, list)) else 0
                                combos_len = len(sdata.get('combos', [])) if isinstance(sdata.get('combos'), list) else 0
                                print(f"   round {r}: v4={v4_len}, v3={v3_len}, extraPacks={ep_type}({ep_len}), combos={combos_len}")
    except Exception as e:
        print(col, 'err:', e)
