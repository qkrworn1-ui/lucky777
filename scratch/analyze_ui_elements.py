import re

with open('index.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Find all buttons and links in index.html
buttons = re.findall(r'<button\b[^>]*>', html_content, re.IGNORECASE)
links = re.findall(r'<a\b[^>]*>', html_content, re.IGNORECASE)
onclicks = re.findall(r'onclick=[\'"]([^\'"]+)[\'"]', html_content, re.IGNORECASE)

print(f"Total <button> elements: {len(buttons)}")
print(f"Total <a> elements: {len(links)}")
print(f"Total onclick attributes: {len(onclicks)}")

# Find buttons without onclick and without type=submit
no_onclick_buttons = []
for b in buttons:
    if 'onclick' not in b and 'type="submit"' not in b and 'type=\'submit\'' not in b:
        # extract id or class
        id_match = re.search(r'id=[\'"]([^\'"]+)[\'"]', b)
        class_match = re.search(r'class=[\'"]([^\'"]+)[\'"]', b)
        data_tab = re.search(r'data-tab=[\'"]([^\'"]+)[\'"]', b)
        b_id = id_match.group(1) if id_match else ''
        b_class = class_match.group(1) if class_match else ''
        b_tab = data_tab.group(1) if data_tab else ''
        no_onclick_buttons.append((b_id, b_class, b_tab, b))

print(f"\nButtons without inline onclick: {len(no_onclick_buttons)}")
for b_id, b_class, b_tab, b_raw in no_onclick_buttons:
    print(f"  ID: {b_id:<25} Class: {b_class:<30} Tab: {b_tab}")
