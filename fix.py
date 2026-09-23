# -*- coding: utf-8 -*-
import re
with open('src/services/lotto/ledger.js', 'r', encoding='utf-8') as f:
    text = f.read()
text = re.sub(r'const isGenericSerial =.*?;', 'const isGenericSerial = !serial || serial === \'TR-뫬발급\' || serial === \'TR-확인봈대\' || serial === \'TR-스마트폰 자동샜�\' || serial.startsWith(\'TR-임시\');', text)
with open('src/services/lotto/ledger.js', 'w', encoding='utf-8') as f:
    f.write(text)
