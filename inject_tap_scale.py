import re

with open('public/work-tracker/ui.js', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
new_lines = []

for line in lines:
    if '<button' in line and 'wt-tap-scale' not in line and 'onpointerdown=' not in line:
        def add_class(match):
            tag = match.group(0)
            if 'class="' in tag:
                return re.sub(r'class="([^"]*)"', r'class="\1 wt-tap-scale"', tag, count=1)
            elif "class='" in tag:
                return re.sub(r"class='([^']*)'", r"class='\1 wt-tap-scale'", tag, count=1)
            else:
                return tag.replace('<button', '<button class="wt-tap-scale"', 1)
        line = re.sub(r'<button\b[^>]*>', add_class, line)
    new_lines.append(line)

with open('public/work-tracker/ui.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines))

print("Listo")
