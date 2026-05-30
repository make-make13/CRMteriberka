import re

with open('src/utils/pdfmeTemplates.ts', 'r', encoding='utf-8') as f:
    c = f.read()

# Pattern 1: single-line  st('bm_sN_body...', text, x, y, w, h, opts)
# Pattern 2: multi-line   st(\n      'bm_sN_body...',
# We need to replace the st( call that contains bm_sN_body/tail in its name argument

# Approach: find all st( blocks where the name matches bm_s\d+_(body|tail|body_part\d+)
# and replace st( with bst( at the start of that call

# Match "st(" followed optionally by whitespace/newline, then the name string
pattern = r"(\bst\()\s*\n(\s*'bm_s\d+_(?:body|tail)(?:_part\d+)?')"
replacement = r"bst(\n\2"
new_c, count = re.subn(pattern, replacement, c)

# Also handle single-line format: st('bm_s1_body', ...)
pattern2 = r"\bst\('(bm_s\d+_(?:body|tail)(?:_part\d+)?)'"
replacement2 = r"bst('\1'"
new_c, count2 = re.subn(pattern2, replacement2, new_c)

total = count + count2
with open('src/utils/pdfmeTemplates.ts', 'w', encoding='utf-8') as f:
    f.write(new_c)

print(f"Done. Replaced {total} occurrences ({count} multiline, {count2} single-line).")
