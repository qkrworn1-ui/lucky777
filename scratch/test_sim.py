import json
import os
import re

# Let's inspect what happens in calculate7AlgorithmsPerformance for different users
# Load history from data.js or LOTTO_HISTORY
with open('data.js', 'r', encoding='utf-8') as f:
    data_content = f.read()

# Extract LOTTO_HISTORY
m = re.search(r'const LOTTO_HISTORY\s*=\s*(\{.*?\});', data_content, re.DOTALL)
if m:
    # It's JS object, let's parse keys and numbers
    print("Found LOTTO_HISTORY in data.js")
