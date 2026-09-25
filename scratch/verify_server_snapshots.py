import urllib.request
import json
import os
import sys

# Force UTF-8 stdout
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

API_KEY = 'AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
PROJECT_ID = 'sonamu-jokgu-club'

# Official Historical Draws
OFFICIAL_DRAWS = {
    1235: {'numbers': [6, 14, 22, 29, 36, 41], 'bonus': 17, 'date': '2026.08.01'},
    1236: {'numbers': [3, 11, 18, 25, 33, 42], 'bonus': 8, 'date': '2026.08.08'},
    1237: {'numbers': [2, 9, 16, 27, 34, 45], 'bonus': 21, 'date': '2026.08.15'},
    1238: {'numbers': [2, 13, 18, 32, 38, 42], 'bonus': 22, 'date': '2026.08.22'},
    1239: {'numbers': [1, 3, 17, 26, 33, 42], 'bonus': 41, 'date': '2026.08.29'},
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'date': '2026.09.05'},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'date': '2026.09.12'},
    1242: {'numbers': [5, 11, 15, 23, 28, 42], 'bonus': 17, 'date': '2026.09.19'}
}

PRIZE_MAP = {
    1: 2000000000,
    2: 50000000,
    3: 1500000,
    4: 50000,
    5: 5000
}

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
    try:
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
                parsed['_updateTime'] = item.get('updateTime')
                parsed['_createTime'] = item.get('createTime')
                docs.append(parsed)
            return docs
    except Exception as e:
        print(f"Error fetching {col_name}: {e}")
        return []

def parse_maybe_json(val):
    if isinstance(val, str):
        val = val.strip()
        if (val.startswith('{') and val.endswith('}')) or (val.startswith('[') and val.endswith(']')):
            try:
                return json.loads(val)
            except:
                return val
    return val

def clean_combo(combo):
    if isinstance(combo, dict):
        combo = combo.get('numbers') or combo.get('combo') or combo.get('sorted') or []
    if isinstance(combo, list):
        clean = []
        for x in combo:
            try:
                clean.append(int(x))
            except:
                pass
        return sorted(clean)
    if isinstance(combo, str):
        parts = combo.replace(',', ' ').split()
        clean = []
        for p in parts:
            try:
                clean.append(int(p))
            except:
                pass
        return sorted(clean)
    return []

def score_combo(combo, draw):
    c = clean_combo(combo)
    if not c or len(c) < 6 or not draw:
        return 0, 0, 0, []
    c_set = set(c)
    w_set = set(draw['numbers'])
    matched_nums = sorted(list(c_set.intersection(w_set)))
    matches = len(matched_nums)
    has_bonus = draw.get('bonus') in c_set
    
    rank = 0
    if matches == 6:
        rank = 1
    elif matches == 5 and has_bonus:
        rank = 2
    elif matches == 5:
        rank = 3
    elif matches == 4:
        rank = 4
    elif matches == 3:
        rank = 5
        
    prize = PRIZE_MAP.get(rank, 0)
    return rank, matches, prize, matched_nums

def main():
    print("================================================================================")
    print("   📊 로또 6/45 사용자별 서버 스냅샷 & 실구매 당첨이력 정밀 전수 검증 리포트")
    print("================================================================================\n")
    
    users = fetch_collection('lotto_users')
    purchases = fetch_collection('lotto_purchases')
    
    user_map = {}
    for u in users:
        u_id = (u.get('userId') or u['_docId']).strip().lower()
        user_map[u_id] = u

    # Build purchase documents map
    purchase_docs_map = {}
    for p in purchases:
        p_id = (p.get('userId') or p['_docId']).strip().lower()
        purchase_docs_map[p_id] = p

    all_user_ids = sorted(list(set(list(user_map.keys()) + list(purchase_docs_map.keys()))))
    
    # Filter out system docs
    user_ids = [uid for uid in all_user_ids if uid not in ['app_latest_version']]
    
    grand_stats = {
        'totalUsers': len(user_ids),
        'activeUsers': 0,
        'suspendedUsers': 0,
        'totalPurchasedGames': 0,
        'totalPurchasedSpend': 0,
        'totalPurchasedPrize': 0,
        'purchasedRanks': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        'totalRecommendedGames': 0,
        'totalRecommendedPrize': 0,
        'recommendedRanks': {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    }

    user_full_reports = []

    for idx, u_id in enumerate(user_ids, 1):
        u_info = user_map.get(u_id, {})
        p_doc = purchase_docs_map.get(u_id, {})
        
        real_name = u_info.get('realName') or p_doc.get('realName') or p_doc.get('name') or u_id
        phone = u_info.get('phoneNumber') or p_doc.get('phoneNumber') or '-'
        role = u_info.get('role', 'user')
        is_admin = (role == 'admin') or u_info.get('isAdmin') is True or u_id in ['master', 'admin']
        status = u_info.get('status', 'active')
        created_at = u_info.get('createdAt') or p_doc.get('createdAt') or '-'
        is_permanent = u_info.get('isPermanent') or is_admin
        
        if status == 'active':
            grand_stats['activeUsers'] += 1
        else:
            grand_stats['suspendedUsers'] += 1
            
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"[{idx}/{len(user_ids)}] 👤 회원 ID: {u_id} | 이름: {real_name} | 상태: {status} | 권한: {'👑 관리자' if is_admin else ('💎 영구회원' if is_permanent else '일반회원')}")
        print(f"    연락처: {phone} | 가입일: {created_at} | 최종 수정: {p_doc.get('_updateTime', '-')}")
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        
        # Raw ledger & snapshots
        raw_ledger = parse_maybe_json(p_doc.get('ledger', {}))
        if not isinstance(raw_ledger, dict):
            raw_ledger = {}
            
        raw_snapshots = parse_maybe_json(p_doc.get('snapshots', {}) or p_doc.get('recommendationSnapshots', {}))
        if not isinstance(raw_snapshots, dict):
            raw_snapshots = {}

        # -------------------------------------------------------------
        # 1. RECOMMENDATION SNAPSHOT EVALUATION (추천번호 서버 스냅샷 검증)
        # -------------------------------------------------------------
        user_recom_games = 0
        user_recom_prize = 0
        user_recom_ranks = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        recom_round_details = []

        print(f"\n  🎯 [1] 추천번호 서버 스냅샷 당첨 이력 (Recommendation Snapshots):")
        if not raw_snapshots:
            print(f"     ℹ️ 저장된 추천번호 스냅샷 없음")
        else:
            sorted_snap_keys = sorted(
                raw_snapshots.keys(), 
                key=lambda k: int(k.split('_')[-1]) if '_' in str(k) and str(k).split('_')[-1].isdigit() else (int(k) if str(k).isdigit() else 0),
                reverse=True
            )
            for sk in sorted_snap_keys:
                sdata = parse_maybe_json(raw_snapshots[sk])
                if not isinstance(sdata, dict):
                    continue
                r_num = sdata.get('round') or (int(sk.split('_')[-1]) if '_' in str(sk) and str(sk).split('_')[-1].isdigit() else (int(sk) if str(sk).isdigit() else 0))
                combos = sdata.get('v4Combos') or sdata.get('combos') or []
                snap_created = sdata.get('createdAt') or sdata.get('snapshotCreatedAt') or '-'
                
                draw = OFFICIAL_DRAWS.get(r_num)
                draw_str = f"당첨 {draw['numbers']} + {draw['bonus']}" if draw else "추첨 예정/대기"
                
                r_prize = 0
                r_ranks = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
                winning_combos_detail = []
                
                for c_idx, c in enumerate(combos, 1):
                    user_recom_games += 1
                    grand_stats['totalRecommendedGames'] += 1
                    if draw:
                        rank, match, prize, m_nums = score_combo(c, draw)
                        if rank > 0:
                            r_ranks[rank] += 1
                            r_prize += prize
                            user_recom_ranks[rank] += 1
                            user_recom_prize += prize
                            grand_stats['recommendedRanks'][rank] += 1
                            grand_stats['totalRecommendedPrize'] += prize
                            winning_combos_detail.append(f"게임 #{c_idx} ({clean_combo(c)}) -> {rank}등 당첨 ({prize:,}원, 일치: {m_nums})")

                r_rank_summary = ", ".join([f"{rk}등: {cnt}개" for rk, cnt in r_ranks.items() if cnt > 0]) or "당첨 없음"
                print(f"     • 제 {r_num}회차 [{sk}]: {len(combos)}게임 추천 (생성: {snap_created})")
                print(f"       -> 결과: 총 당첨금 {r_prize:,}원 ({r_rank_summary}) | [{draw_str}]")
                for w_item in winning_combos_detail:
                    print(f"          🏆 {w_item}")
                    
                recom_round_details.append({
                    'round': r_num,
                    'key': sk,
                    'gameCount': len(combos),
                    'createdAt': snap_created,
                    'prize': r_prize,
                    'ranks': r_ranks,
                    'winningDetails': winning_combos_detail
                })

            print(f"     ----------------------------------------------------------------------")
            print(f"     👉 추천 스냅샷 누적: {user_recom_games}게임 추천 | 총 당첨금: {user_recom_prize:,}원")
            print(f"        당첨 집계: 1등({user_recom_ranks[1]}), 2등({user_recom_ranks[2]}), 3등({user_recom_ranks[3]}), 4등({user_recom_ranks[4]}), 5등({user_recom_ranks[5]})")

        # -------------------------------------------------------------
        # 2. CONFIRMED PURCHASE EVALUATION (실구매 구매확정 당첨 검증)
        # -------------------------------------------------------------
        user_purch_games = 0
        user_purch_spend = 0
        user_purch_prize = 0
        user_purch_ranks = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        purch_round_details = []

        print(f"\n  📦 [2] 실구매 등록(영수증) 당첨 이력 (Confirmed Purchases):")
        if not raw_ledger:
            print(f"     ℹ️ 등록된 실구매 영수증 내역 없음")
        else:
            sorted_ledger_keys = sorted(
                raw_ledger.keys(), 
                key=lambda k: int(k) if str(k).isdigit() else 0,
                reverse=True
            )
            for rk in sorted_ledger_keys:
                r_num = int(rk) if str(rk).isdigit() else 0
                receipts = raw_ledger[rk]
                if not isinstance(receipts, list):
                    continue
                    
                draw = OFFICIAL_DRAWS.get(r_num)
                draw_str = f"당첨 {draw['numbers']} + {draw['bonus']}" if draw else "추첨 예정/대기"
                
                r_games = 0
                r_prize = 0
                r_ranks = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
                winning_purch_detail = []
                
                for rec_idx, rec in enumerate(receipts, 1):
                    rec_id = rec.get('id') or rec.get('receiptId') or f"REC-{rec_idx}"
                    rec_time = rec.get('date') or rec.get('regDate') or rec.get('createdAt') or '-'
                    combos = rec.get('combos', [])
                    for c_idx, c in enumerate(combos, 1):
                        r_games += 1
                        user_purch_games += 1
                        user_purch_spend += 1000
                        grand_stats['totalPurchasedGames'] += 1
                        grand_stats['totalPurchasedSpend'] += 1000
                        
                        if draw:
                            rank, match, prize, m_nums = score_combo(c, draw)
                            if rank > 0:
                                r_ranks[rank] += 1
                                r_prize += prize
                                user_purch_ranks[rank] += 1
                                user_purch_prize += prize
                                grand_stats['purchasedRanks'][rank] += 1
                                grand_stats['totalPurchasedPrize'] += prize
                                winning_purch_detail.append(f"영수증 [{rec_id}] 게임 #{c_idx} ({clean_combo(c)}) -> {rank}등 당첨 ({prize:,}원, 일치: {m_nums})")

                r_rank_summary = ", ".join([f"{rnk}등: {cnt}개" for rnk, cnt in r_ranks.items() if cnt > 0]) or "당첨 없음"
                r_spend = r_games * 1000
                r_roi = (r_prize / r_spend * 100) if r_spend > 0 else 0
                print(f"     • 제 {r_num}회차: {len(receipts)}장 영수증 / {r_games}게임 구매 ({r_spend:,}원) (등록: {rec_time})")
                print(f"       -> 결과: 당첨금 {r_prize:,}원 (수익률 {r_roi:.1f}%, {r_rank_summary}) | [{draw_str}]")
                for w_item in winning_purch_detail:
                    print(f"          🎉 {w_item}")
                    
                purch_round_details.append({
                    'round': r_num,
                    'receiptCount': len(receipts),
                    'gameCount': r_games,
                    'spend': r_spend,
                    'prize': r_prize,
                    'roi': r_roi,
                    'ranks': r_ranks,
                    'winningDetails': winning_purch_detail
                })

            user_roi = (user_purch_prize / user_purch_spend * 100) if user_purch_spend > 0 else 0
            print(f"     ----------------------------------------------------------------------")
            print(f"     👉 실구매 누적: {user_purch_games}게임 (총 구매액: {user_purch_spend:,}원) | 총 당첨금: {user_purch_prize:,}원 | 누적 ROI: {user_roi:.1f}%")
            print(f"        당첨 집계: 1등({user_purch_ranks[1]}), 2등({user_purch_ranks[2]}), 3등({user_purch_ranks[3]}), 4등({user_purch_ranks[4]}), 5등({user_purch_ranks[5]})")

        user_full_reports.append({
            'userId': u_id,
            'realName': real_name,
            'role': role,
            'status': status,
            'phone': phone,
            'recommendations': {
                'totalGames': user_recom_games,
                'totalPrize': user_recom_prize,
                'ranks': user_recom_ranks,
                'rounds': recom_round_details
            },
            'purchases': {
                'totalGames': user_purch_games,
                'totalSpend': user_purch_spend,
                'totalPrize': user_purch_prize,
                'roi': user_roi if user_purch_spend > 0 else 0,
                'ranks': user_purch_ranks,
                'rounds': purch_round_details
            }
        })
        print()

    # -------------------------------------------------------------
    # 3. GRAND TOTAL SUMMARY (전체 종합 요약)
    # -------------------------------------------------------------
    grand_purch_roi = (grand_stats['totalPurchasedPrize'] / grand_stats['totalPurchasedSpend'] * 100) if grand_stats['totalPurchasedSpend'] > 0 else 0
    print("================================================================================")
    print("   🏆 전체 사용자 종합 통계 및 서버 스냅샷 무결성 진단 결과")
    print("================================================================================")
    print(f"• 전체 등록 회원 수: {grand_stats['totalUsers']}명 (활성: {grand_stats['activeUsers']}명, 정지/미구매: {grand_stats['suspendedUsers']}명)")
    print(f"\n[1] 추천번호 서버 스냅샷 전체 집계:")
    print(f"  - 총 추천 발급 게임 수: {grand_stats['totalRecommendedGames']}게임")
    print(f"  - 총 추천 당첨금 합계: {grand_stats['totalRecommendedPrize']:,}원")
    print(f"  - 등수별 당첨: 1등({grand_stats['recommendedRanks'][1]}), 2등({grand_stats['recommendedRanks'][2]}), 3등({grand_stats['recommendedRanks'][3]}), 4등({grand_stats['recommendedRanks'][4]}), 5등({grand_stats['recommendedRanks'][5]})")
    
    print(f"\n[2] 실구매(구매확정 영수증) 전체 집계:")
    print(f"  - 총 실구매 인증 게임 수: {grand_stats['totalPurchasedGames']}게임 (총 구매액: {grand_stats['totalPurchasedSpend']:,}원)")
    print(f"  - 총 실구매 당첨금 수령액: {grand_stats['totalPurchasedPrize']:,}원")
    print(f"  - 전체 실구매 평균 ROI: {grand_purch_roi:.1f}%")
    print(f"  - 등수별 당첨: 1등({grand_stats['purchasedRanks'][1]}), 2등({grand_stats['purchasedRanks'][2]}), 3등({grand_stats['purchasedRanks'][3]}), 4등({grand_stats['purchasedRanks'][4]}), 5등({grand_stats['purchasedRanks'][5]})")
    
    with open('scratch/full_snapshot_verification_report.json', 'w', encoding='utf-8') as f:
        json.dump({'summary': grand_stats, 'users': user_full_reports}, f, indent=2, ensure_ascii=False)
    print("\n✅ 전체 사용자별 상세 검증 리포트가 scratch/full_snapshot_verification_report.json 에 안전하게 저장되었습니다.")

if __name__ == '__main__':
    main()
