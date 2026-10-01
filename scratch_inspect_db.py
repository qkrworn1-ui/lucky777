import urllib.request
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

api_key = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
project_id = 'sonamu-jokgu-club'

def get_doc(collection, doc_id):
    url = f'https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents/{collection}/{doc_id}?key={api_key}'
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode('utf-8'))
    except Exception as e:
        print(f'Error getting {collection}/{doc_id}:', e)
        return None

# Check guest user
print('=== GUEST USER ===')
print(json.dumps(get_doc('lotto_users', 'guest'), indent=2, ensure_ascii=False))

# Check guest purchases
print('\n=== GUEST PURCHASES ===')
print(json.dumps(get_doc('lotto_purchases', 'guest'), indent=2, ensure_ascii=False))

# Check kakao_5070244665 purchases
print('\n=== KAKAO_5070244665 PURCHASES ===')
k_purch = get_doc('lotto_purchases', 'kakao_5070244665')
if k_purch:
    fields = k_purch.get('fields', {})
    ledger = fields.get('ledger', {}).get('mapValue', {}).get('fields', {})
    for r, r_val in ledger.items():
        arr = r_val.get('arrayValue', {}).get('values', [])
        print(f'--- Round {r} ({len(arr)} receipts) ---')
        for idx, item in enumerate(arr):
            m = item.get('mapValue', {}).get('fields', {})
            receipt_id = m.get('receiptId', {}).get('stringValue', '')
            version = m.get('version', {}).get('stringValue', '')
            user = m.get('user', {}).get('stringValue', '')
            combos = m.get('combos', {}).get('arrayValue', {}).get('values', [])
            qr_meta = m.get('qrMeta', {}).get('mapValue', {}).get('fields', {})
            channel = qr_meta.get('channel', {}).get('stringValue', '')
            scanned_at = qr_meta.get('qrScannedAt', {}).get('stringValue', '')
            first_combo = ''
            if combos:
                c0 = combos[0].get('mapValue', {}).get('fields', {})
                nums = [str(n.get('integerValue', '')) for n in c0.get('numbers', {}).get('arrayValue', {}).get('values', [])]
                first_combo = ' '.join(nums)
            print(f'  [{idx+1}] ID: {receipt_id} | Ver: {version} | User: {user} | Ch: {channel} | Time: {scanned_at} | C0: {first_combo}')

# Check if master purchase exists
print('\n=== MASTER PURCHASES ===')
master_purch = get_doc('lotto_purchases', 'master')
if master_purch:
    print(json.dumps(master_purch, indent=2, ensure_ascii=False))
else:
    print('Master doc not found or error')
