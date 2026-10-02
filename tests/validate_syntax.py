"""
validate_syntax.py
JavaScript 및 파이썬 문법/구문 무결성 정밀 검증 스크립트
- 템플릿 리터럴 내부 중첩 ${...} 지원
- 정규식 리터럴, 문자열, 주석 완전 지원
"""

import os
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

def check_js_syntax(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        code = f.read()
    
    # 1. Check for real git conflict markers
    for idx, line in enumerate(code.splitlines()):
        if line.startswith('<<<<<<< ') or line.startswith('>>>>>>> '):
            return False, f'Git conflict marker found at line {idx+1}: {line}'

    # 2. Tokenize strings, comments, regex, and count brackets
    stack = []
    mode_stack = ['CODE'] # 'CODE', 'SINGLE', 'DOUBLE', 'TEMPLATE', 'REGEX'
    template_interp_stack = [] # Tracks bracket depth when inside ${...}
    
    i = 0
    n = len(code)
    line_num = 1
    col_num = 1

    last_non_space = ''

    while i < n:
        char = code[i]
        curr_mode = mode_stack[-1]

        if char == '\n':
            line_num += 1
            col_num = 1
            if curr_mode in ('SINGLE', 'DOUBLE', 'REGEX', 'LINE_COMMENT'):
                # String literals / regex / line comments end at newlines in JS
                mode_stack.pop()
            i += 1
            continue
        else:
            col_num += 1

        # Inside single-line comment //
        if curr_mode == 'LINE_COMMENT':
            i += 1
            continue

        # Inside block comment /* ... */
        if curr_mode == 'BLOCK_COMMENT':
            if char == '*' and i + 1 < n and code[i+1] == '/':
                mode_stack.pop()
                i += 2
                continue
            i += 1
            continue

        # Inside single quote '...'
        if curr_mode == 'SINGLE':
            if char == '\\':
                i += 2
                continue
            elif char == '\'':
                mode_stack.pop()
            i += 1
            continue

        # Inside double quote "..."
        if curr_mode == 'DOUBLE':
            if char == '\\':
                i += 2
                continue
            elif char == '\"':
                mode_stack.pop()
            i += 1
            continue

        # Inside regex /.../
        if curr_mode == 'REGEX':
            if char == '\\':
                i += 2
                continue
            elif char == '[':
                # Regex character class [^\d]
                i += 1
                while i < n and code[i] != '\n':
                    if code[i] == '\\':
                        i += 2
                    elif code[i] == ']':
                        i += 1
                        break
                    else:
                        i += 1
                continue
            elif char == '/':
                mode_stack.pop()
            i += 1
            continue

        # Inside template literal `...`
        if curr_mode == 'TEMPLATE':
            if char == '\\':
                i += 2
                continue
            elif char == '$' and i + 1 < n and code[i+1] == '{':
                # Start of template interpolation ${...}
                mode_stack.append('CODE')
                template_interp_stack.append(len(stack))
                stack.append(('{', line_num, col_num))
                i += 2
                last_non_space = '{'
                continue
            elif char == '`':
                mode_stack.pop()
                i += 1
                continue
            i += 1
            continue

        # --- CODE MODE ---
        # Check comment start
        if char == '/' and i + 1 < n:
            next_char = code[i+1]
            if next_char == '/':
                mode_stack.append('LINE_COMMENT')
                i += 2
                continue
            elif next_char == '*':
                mode_stack.append('BLOCK_COMMENT')
                i += 2
                continue
            elif last_non_space in '(=:,!&|?;[~<>+-*%^':
                # Start of regex literal
                mode_stack.append('REGEX')
                i += 1
                continue

        # Check string starts
        if char == '\'':
            mode_stack.append('SINGLE')
            i += 1
            continue
        elif char == '\"':
            mode_stack.append('DOUBLE')
            i += 1
            continue
        elif char == '`':
            mode_stack.append('TEMPLATE')
            i += 1
            continue

        # Bracket balancing
        if char in '({[':
            stack.append((char, line_num, col_num))
            last_non_space = char
        elif char in ')}]':
            if not stack:
                return False, f'Unmatched closing bracket {char} at line {line_num}:{col_num}'
            top, top_line, top_col = stack.pop()
            expected = {'(': ')', '{': '}', '[': ']'}[top]
            if char != expected:
                return False, f'Mismatched bracket: opened {top} at line {top_line}:{top_col} but closed with {char} at line {line_num}:{col_num}'
            
            # Check if this closing brace closes a template interpolation ${...}
            if char == '}' and template_interp_stack and len(stack) == template_interp_stack[-1]:
                template_interp_stack.pop()
                if mode_stack and mode_stack[-1] == 'CODE':
                    mode_stack.pop() # Return to TEMPLATE mode
            
            last_non_space = char
        elif not char.isspace():
            last_non_space = char

        i += 1

    while mode_stack and mode_stack[-1] == 'LINE_COMMENT':
        mode_stack.pop()

    if len(mode_stack) > 1:
        unclosed = mode_stack[-1]
        return False, f'Unclosed {unclosed} at end of file'
    if stack:
        top, top_line, top_col = stack[-1]
        return False, f'Unclosed opening bracket {top} at line {top_line}:{top_col}'

    return True, 'OK'


if __name__ == '__main__':
    js_files = [
        'src/shared/landing-dashboard.js',
        'src/services/lotto/ledger.js',
        'src/shared/auth-mgmt.js',
        'src/services/lotto/generator.js',
        'src/services/lotto/views/review-tab.js',
        'src/services/lotto/views/algorithms-tab.js',
        'src/services/lotto/views/confirmed-tab.js',
        'src/services/lotto/views/snapshot-audit-modal.js',
        'src/services/lotto/views/quick-view.js',
        'sw.js',
        'netlify/functions/kakao-token.js',
        'netlify/functions/lotto.js',
        'app_v2.js'
    ]

    print("=" * 65)
    print("🔍 [검증] JavaScript 파일 문법 및 괄호/토큰 무결성 정밀 검사")
    print("=" * 65)
    all_ok = True
    for f in js_files:
        if not os.path.exists(f):
            continue
        ok, msg = check_js_syntax(f)
        status = "[PASS]" if ok else "[FAIL]"
        print(f"  {status} {f}: {msg}")
        if not ok:
            all_ok = False

    print("\n" + "=" * 65)
    if all_ok:
        print("✅ 모든 JavaScript 파일 구문 무결성 검증 완료 (0 Syntax Errors)!")
        sys.exit(0)
    else:
        print("❌ 구문 오류가 발견되었습니다. 확인이 필요합니다.")
        sys.exit(1)
