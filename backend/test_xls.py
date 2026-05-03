import urllib.request

req = urllib.request.Request(
    'https://www.aaii.com/files/surveys/sentiment.xls',
    headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
)
try:
    with urllib.request.urlopen(req) as response:
        content = response.read()
        if len(content) > 50000:
            with open('data/sentiment.xls', 'wb') as f:
                f.write(content)
            print("Success! Downloaded", len(content), "bytes")
        else:
            print("Blocked!")
except Exception as e:
    print("Error:", e)
