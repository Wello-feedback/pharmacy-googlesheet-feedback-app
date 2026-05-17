import sqlite3, json, requests

DB_PATH = r'c:\Users\Sandeep\Desktop\feedback\backend\feedback.db'
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw318fXXX7UyCiTRb2Ucrn4ulvyiPqWFliBAc1laygM7XAoqTm8Lh-yFeDQ1bzmeODLCg/exec'

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

# Migrate Branches
print('Migrating branches...')
branches = conn.execute('SELECT code, name FROM branches').fetchall()
for b in branches:
    payload = {'code': b['code'], 'name': b['name']}
    res = requests.post(APPS_SCRIPT_URL + '?action=addBranch', data=json.dumps(payload), headers={'Content-Type': 'text/plain'})
    print(f"Branch {b['code']}: {res.json()}")

# Migrate Feedbacks
print('Migrating feedback...')
feedbacks = conn.execute('SELECT * FROM feedback').fetchall()
for f in feedbacks:
    tags = f['improvement_tags']
    try: tags = json.loads(tags)
    except: tags = []
    
    payload = {
        'branch_code': f['branch_code'],
        'customer_name': f['customer_name'],
        'customer_mobile': f['customer_mobile'],
        'rating': f['rating'],
        'improvement_tags': tags,
        'comments': f['comments'],
        'latitude': f['latitude'],
        'longitude': f['longitude']
    }
    res = requests.post(APPS_SCRIPT_URL + '?action=addFeedback', data=json.dumps(payload), headers={'Content-Type': 'text/plain'})
    print(f"Feedback {f['id']}: {res.json()}")

print('Done!')
