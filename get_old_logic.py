import urllib.request
url = "https://raw.githubusercontent.com/Anti-Gravity-Project/record-revenue-web/main/frontend/app.js"
try:
    with urllib.request.urlopen(url) as response:
        content = response.read().decode('utf-8')
        for i, line in enumerate(content.split('\n')):
            if "saveEdit" in line or "totalCalculated" in line or "isExpense" in line:
                print(f"{i}: {line}")
except Exception as e:
    print(e)
