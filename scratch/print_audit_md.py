import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

with open('scratch/full_snapshot_verification_report.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("### 전체 요약:")
print(f"- 총 등록 회원: {data['summary']['totalUsers']}명 (활성: {data['summary']['activeUsers']}명, 정지/미구매: {data['summary']['suspendedUsers']}명)")
print(f"- 추천번호 스냅샷 총 발급: {data['summary']['totalRecommendedGames']}게임 | 당첨금: {data['summary']['totalRecommendedPrize']:,}원 (5등: {data['summary']['recommendedRanks']['5']}개)")
print(f"- 실구매 영수증 총 등록: {data['summary']['totalPurchasedGames']}게임 (구매액: {data['summary']['totalPurchasedSpend']:,}원) | 당첨금: {data['summary']['totalPurchasedPrize']:,}원 | 평균 ROI: {data['summary']['totalPurchasedPrize']/data['summary']['totalPurchasedSpend']*100:.1f}% (5등: {data['summary']['purchasedRanks']['5']}개)\n")

print("| No | 회원명 (ID) | 상태 / 권한 | 추천 스냅샷 (게임/당첨금) | 실구매 등록 (게임/구매액/당첨금) | 실구매 ROI |")
print("|---|---|---|---|---|---|")

for idx, u in enumerate(data['users'], 1):
    uid = u['userId']
    name = u['realName']
    status = u['status']
    role = u['role']
    
    r_games = u['recommendations']['totalGames']
    r_prize = u['recommendations']['totalPrize']
    r_5th = u['recommendations']['ranks']['5']
    
    p_games = u['purchases']['totalGames']
    p_spend = u['purchases']['totalSpend']
    p_prize = u['purchases']['totalPrize']
    p_roi = u['purchases']['roi']
    p_5th = u['purchases']['ranks']['5']
    
    status_str = "정상(active)" if status == 'active' else "미구매정지"
    if role == 'admin':
        status_str += " (관리자)"
        
    r_str = f"{r_games}게임 / {r_prize:,}원 (5등 {r_5th}개)" if r_games > 0 else "-"
    p_str = f"{p_games}게임 ({p_spend:,}원) / {p_prize:,}원 (5등 {p_5th}개)" if p_games > 0 else "-"
    roi_str = f"{p_roi:.1f}%" if p_games > 0 else "-"
    
    print(f"| {idx} | **{name}** (`{uid}`) | {status_str} | {r_str} | {p_str} | **{roi_str}** |")

print("\n### 회원별 회차별 상세 내역:")
for u in data['users']:
    uid = u['userId']
    name = u['realName']
    print(f"\n#### [{name} (`{uid}`)]")
    
    # Recommendations
    if u['recommendations']['rounds']:
        print("• **추천번호 스냅샷 회차별 당첨**:")
        for r in u['recommendations']['rounds']:
            r_num = r['round']
            r_cnt = r['gameCount']
            r_prz = r['prize']
            r_5 = r['ranks']['5']
            d_str = f", 5등 {r_5}개" if r_5 > 0 else ""
            print(f"  - **제 {r_num}회차**: {r_cnt}게임 추천 -> 당첨금: **{r_prz:,}원**{d_str}")
            for w in r['winningDetails']:
                print(f"    - 🏆 {w}")
    else:
        print("• 추천번호 스냅샷: 저장된 내역 없음")
        
    # Purchases
    if u['purchases']['rounds']:
        print("• **실구매 등록 영수증 회차별 당첨**:")
        for r in u['purchases']['rounds']:
            r_num = r['round']
            r_rec = r['receiptCount']
            r_cnt = r['gameCount']
            r_spd = r['spend']
            r_prz = r['prize']
            r_roi = r['roi']
            r_5 = r['ranks']['5']
            d_str = f", 5등 {r_5}개" if r_5 > 0 else ""
            print(f"  - **제 {r_num}회차**: {r_rec}장 영수증 / {r_cnt}게임 ({r_spd:,}원) -> 당첨금: **{r_prz:,}원** (수익률: {r_roi:.1f}%){d_str}")
            for w in r['winningDetails']:
                print(f"    - 🎉 {w}")
    else:
        print("• 실구매 등록: 등록된 영수증 없음")
