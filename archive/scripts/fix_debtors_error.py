import re
file_path = "frontend/app.js"
with open(file_path, 'r') as f:
    content = f.read()

# I will comment out the old renderDebtors logic so it doesn't throw errors
pattern = re.compile(r'function renderDebtors\(\) \{.*?\}', re.DOTALL)
def replacer(match):
    s = match.group(0)
    # just put a try catch or return early
    if "if (!tbody) return;" not in s:
        s = s.replace("const tbody = document.getElementById('debtor-list-body');", "const tbody = document.getElementById('debtor-list-body');\n    if (!tbody) return;")
    return s

content = pattern.sub(replacer, content)

with open(file_path, 'w') as f:
    f.write(content)
print("Fixed renderDebtors.")
