import urllib.request, json, sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

# Official Historical Draws from snapshot-audit-modal.js
OFFICIAL_DRAWS = {
    1235: {'numbers': [6, 14, 22, 29, 36, 41], 'bonus': 17, 'rank1Prize': 1985670000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.01'},
    1236: {'numbers': [3, 11, 18, 25, 33, 42], 'bonus': 8, 'rank1Prize': 2450320000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.08'},
    1237: {'numbers': [2, 9, 16, 27, 34, 45], 'bonus': 21, 'rank1Prize': 2180450000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.15'},
    1238: {'numbers': [2, 13, 18, 32, 38, 42], 'bonus': 22, 'rank1Prize': 1197250000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.22'},
    1239: {'numbers': [1, 3, 17, 26, 33, 42], 'bonus': 41, 'rank1Prize': 1980500000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.29'},
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'rank1Prize': 2000000000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.05'},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'rank1Prize': 1628391980, 'rank2Prize': 54279733, 'rank3Prize': 1501284, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.12'},
    1242: {'numbers': [2, 4, 10, 16, 31, 41], 'bonus': 9, 'rank1Prize': 3281029250, 'rank2Prize': 47322538, 'rank3Prize': 1535105, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.19'},
    1243: {'numbers': [9, 18, 24, 38, 43, 44], 'bonus': 35, 'rank1Prize': 2200000000, 'rank2Prize': 50000000, 'rank3Prize': 1500000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.26'}
}

API_KEY = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
PROJECT_ID = 'sonamu-jokgu-club'

def decode_firestore_val(v):
    if not isinstance(v, dict): return v
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'arrayValue' in v: return [decode_firestore_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k: decode_firestore_val(sub_v) for k, sub_v in v['mapValue'].get('fields', {}).items()}
    return v

def fetch_col(col):
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/{col}?key={API_KEY}&pageSize=100"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        d = json.loads(resp.read().decode('utf-8'))
        res = []
        for doc in d.get('documents', []):
            i = doc['name'].split('/')[-1]
            fields = {k: decode_firestore_val(v) for k, v in doc.get('fields', {}).items()}
            res.append({'id': i, 'data': fields, 'updateTime': doc.get('updateTime', '')})
        return res

pDocs = fetch_col('lotto_purchases')
uDocs = fetch_col('lotto_users')

usersMap = {}
for u in uDocs:
    if u['id'] != 'app_latest_version':
        usersMap[u['id']] = {'id': u['id'], **u['data'], 'docUpdateTime': u['updateTime']}

purchasesMap = {}
for p in pDocs:
    if p['id'] != 'app_latest_version':
        purchasesMap[p['id']] = p

allUserIds = sorted(list(set([p['id'] for p in pDocs if p['id'] != 'app_latest_version'] + [u['id'] for u in uDocs if u['id'] != 'app_latest_version'])))
if not allUserIds: allUserIds = ['master']

processedUsers = []
for uid in allUserIds:
    uMeta = usersMap.get(uid, {})
    pDoc = purchasesMap.get(uid, {})
    pData = pDoc.get('data', {})
    
    recSnaps = pData.get('recommendationSnapshots') or uMeta.get('recommendationSnapshots') or {}
    joinRound = 1235
    if uid == 'kakao_5070244665':
        joinRound = 1240
        
    processedUsers.append({
        'id': uid,
        'realName': uMeta.get('realName') or pData.get('realName') or uid,
        'joinRound': joinRound,
        'recommendationSnapshots': recSnaps
    })

def get_combo_nums(c):
    if isinstance(c, dict): return c.get('numbers') or c.get('sorted') or []
    if isinstance(c, list): return c
    return []

print(f"{'User':<20} | {'Round':<6} | {'Status':<8} | {'Prize':<12} | {'Hits':<25}")
print("-" * 80)
total_audit_prize = 0
for u in processedUsers:
    for round_num in sorted(OFFICIAL_DRAWS.keys(), reverse=True):
        isPreJoin = round_num < u['joinRound']
        snap = u['recommendationSnapshots'].get(str(round_num)) or u['recommendationSnapshots'].get(round_num)
        
        status = 'missing'
        prizeWon = 0
        hitsDesc = ''
        if isPreJoin:
            status = 'prejoin'
        elif snap:
            status = 'locked'
            combos = snap.get('combos', [])
            if not combos:
                v4 = snap.get('v4Combos', [])
                v3 = snap.get('v3Combos', [])
                extra = []
                ep = snap.get('extraPacks', {})
                if isinstance(ep, dict):
                    for k, pv in sorted(ep.items()):
                        extra.extend(pv.get('combos', []) if isinstance(pv, dict) else pv)
                elif isinstance(ep, list):
                    for pv in ep:
                        extra.extend(pv.get('combos', []) if isinstance(pv, dict) else pv)
                combos = v4 + v3 + extra
                
            draw = OFFICIAL_DRAWS[round_num]
            win_set = set(draw['numbers'])
            bonus = draw['bonus']
            wins = {1:0, 2:0, 3:0, 4:0, 5:0}
            for c in combos:
                nums = get_combo_nums(c)
                m = len(win_set.intersection(nums))
                has_b = bonus in nums
                if m == 6: wins[1] += 1; prizeWon += draw['rank1Prize']
                elif m == 5 and has_b: wins[2] += 1; prizeWon += draw['rank2Prize']
                elif m == 5: wins[3] += 1; prizeWon += draw['rank3Prize']
                elif m == 4: wins[4] += 1; prizeWon += draw['rank4Prize']
                elif m == 3: wins[5] += 1; prizeWon += draw['rank5Prize']
                
            hp = []
            for rk in range(1, 6):
                if wins[rk] > 0: hp.append(f"{rk}등 {wins[rk]}개")
            hitsDesc = ', '.join(hp) if hp else '낙첨'
            total_audit_prize += prizeWon
            
        print(f"{u['id']:<20} | {round_num:<6} | {status:<8} | {prizeWon:>10,}원 | {hitsDesc}")

print("-" * 80)
print(f"Total Snapshot Audit Prize across all: {total_audit_prize:,}원")
