import urllib.request
import urllib.parse
import json

BASE_URL = 'http://127.0.0.1:8000/api'

def test_draft_endpoint():
    # 1. Login (change username/password to your test user credentials if different)
    print("Logging in...")
    login_data = urllib.parse.urlencode({
        'username': 'Ben',  # Replace with a real user
        'password': 'asdf' # Replace with a real password
    }).encode('utf-8')
    
    # We might need CSRF depending on how it's setup, but the login view seems to not require it strictly for JSON if we send standard requests, wait, let's use json.
    login_data_json = json.dumps({
        'username': 'Ben',
        'password': 'asdf'
    }).encode('utf-8')
    
    req = urllib.request.Request(f"{BASE_URL}/login/", data=login_data_json, headers={'Content-Type': 'application/json'})
    
    try:
        response = urllib.request.urlopen(req)
        # Assuming the backend uses session cookies (the views use login(request, user))
        cookies = response.headers.get('Set-Cookie')
        print("Logged in successfully!")
    except Exception as e:
        print("Login failed. Make sure you have a test user created, or create one first.")
        print(e)
        return

    # 2. Get the draft for a known ocid. 
    # You can change 'ocds-active' to a real OCID from your database.
    ocid = "ocds-b5fd17-911c27ac-1124-4f95-a5a9-b6b715003404" 
    print(f"Fetching draft for {ocid}...")
    
    draft_req = urllib.request.Request(f"{BASE_URL}/tenders/{ocid}/draft/")
    if cookies:
        draft_req.add_header('Cookie', cookies)
        
    try:
        draft_response = urllib.request.urlopen(draft_req)
        content = draft_response.read().decode('utf-8')
        
        filename = f"test_draft_{ocid}.md"
        with open(filename, "w") as f:
            f.write(content)
            
        print(f"Success! Draft saved to {filename}")
        print("\n--- Draft Content Preview ---")
        print(content[:500] + "...\n-----------------------------")
        
    except Exception as e:
        print(f"Failed to fetch draft: {e}")

if __name__ == '__main__':
    test_draft_endpoint()
