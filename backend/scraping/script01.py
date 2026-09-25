import os
import requests

# Create folder for downloaded files
os.makedirs("uk_pdfs", exist_ok=True)

# 1. Query the public UK Contracts Finder API (returns open notices)
url = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?size=10"
response = requests.get(url)
response.raise_for_status()

releases = response.json().get("releases", [])

print(f"Fetched {len(releases)} recent notices.")

# 2. Iterate through contracts and fetch PDF attachments
for release in releases:
    notice_id = release.get("id")
    tender = release.get("tender", {})
    documents = tender.get("documents", [])

    for doc in documents:
        doc_url = doc.get("url")
        doc_title = doc.get("title", "document").replace("/", "_").replace(" ", "_")

        # Check if the document link exists
        if doc_url:
            print(f"Downloading: {doc_title} -> {doc_url}")
            try:
                # Stream the file down directly
                file_res = requests.get(doc_url, stream=True, timeout=10)
                if file_res.status_code == 200:
                    filename = f"uk_pdfs/{notice_id}_{doc_title[:30]}.pdf"
                    with open(filename, "wb") as f:
                        for chunk in file_res.iter_content(chunk_size=8192):
                            f.write(chunk)
                    print(f"  Saved to {filename}")
            except Exception as e:
                print(f"  Failed download: {e}")
