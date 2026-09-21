import re

with open('app_v2.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

print(f"app_v2.js size: {len(app_js)} bytes")

# Let's inspect calculate7AlgorithmsPerformance in app_v2.js
calc_match = re.search(r'function calculate7AlgorithmsPerformance\b.*?\n\}', app_js)
if calc_match:
    print("Found calculate7AlgorithmsPerformance in app_v2.js")

# Let's check renderAlgorithmsTab in app_v2.js
rend_algo = re.search(r'async function renderAlgorithmsTab\b.*?\n\}', app_js)
if rend_algo:
    print("Found renderAlgorithmsTab in app_v2.js")

# Let's check renderConfirmedPurchasesList in app_v2.js
rend_conf = re.search(r'async function renderConfirmedPurchasesList\b.*?\n\}', app_js)
if rend_conf:
    print("Found renderConfirmedPurchasesList in app_v2.js")
