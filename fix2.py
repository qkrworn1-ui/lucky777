import re
with open('src/services/lotto/ledger.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r\"version: 'V4\.0 \?+,\", \"version: 'V4.0 AI 예측 조합',\", text)
text = re.sub(r\"version: '\?+ 5: \?+ \?+ \?+,\", \"version: '버전 5: AI 예측 조합',\", text)
text = re.sub(r\"algoName: p\.algoName \|\| 'V4\.0 \?+,\", \"algoName: p.algoName || 'V4.0 AI 예측 조합',\", text)

with open('src/services/lotto/ledger.js', 'w', encoding='utf-8') as f:
    f.write(text)