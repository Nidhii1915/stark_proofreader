import sys
import io
from pathlib import Path

# Add root to sys.path
root_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient
from backend.main import app
import openpyxl

client = TestClient(app)

print("Starting FastAPI endpoint tests...")

# 1. Login with passcode 'stark2026'
login_resp = client.post("/api/auth/login", json={"passcode": "stark2026"})
assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
token = login_resp.json()["token"]
headers = {"Authorization": f"Bearer {token}"}
print("1. Authentication OK, token received!")

# 2. Check /api/missing-items/status
status_resp = client.get("/api/missing-items/status", headers=headers)
assert status_resp.status_code == 200, f"Status failed: {status_resp.text}"
status_data = status_resp.json()
print("2. Status endpoint OK:", status_data["privacy"])

# 3. Create test Excel in memory
wb = openpyxl.Workbook()
ws = wb.active
ws.append([
    "Brand", "Model#", "ItemTitle", "ItemStatus", "systemid", "stockqty",
    "MissingUPC", "MissingItemDim", "MissingLongDescription", "MissingColor"
])
ws.append(["Coach", "CH-001", "Tabby Shoulder Bag", "Active", "S1", 4, True, False, True, False])
ws.append(["Coach", "CH-002", "Willow Tote", "Active", "S2", 9, False, True, False, True])
ws.append(["Coach", "CH-003", "Complete Item", "Active", "S3", 1, False, False, False, False])

excel_bio = io.BytesIO()
wb.save(excel_bio)
excel_bio.seek(0)

# 4. Post upload to /api/missing-items/process-upload
upload_resp = client.post(
    "/api/missing-items/process-upload",
    headers=headers,
    data={"brand": "Coach"},
    files={"file": ("MissingItemDataReport.xlsx", excel_bio.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
)
assert upload_resp.status_code == 200, f"Upload processing failed: {upload_resp.text}"
result = upload_resp.json()
print("3. Direct Upload & Clean OK:")
print(f"   Brand: {result['brand']}")
print(f"   Source rows: {result['source_rows']}")
print(f"   Retained rows: {result['retained_rows']}")
print(f"   Deleted rows: {result['deleted_rows']}")
print(f"   Columns: {result['columns']}")
print(f"   Preview rows: {len(result['preview_rows'])}")

assert result["source_rows"] == 3
assert result["retained_rows"] == 2
assert result["deleted_rows"] == 1
assert "ITEM HEIGHT (Inches)" in result["columns"]
assert result["columns"][0] == "Model#/SKU"
assert result["columns"][1] == "Title/Item Name"
assert result["columns"][2] == "Long Description"
assert result["columns"][3] == "UPC"

# 5. Download the file via download_url
job_id = result["job_id"]
dl_resp = client.get(f"/api/missing-items/download/{job_id}", headers=headers)
assert dl_resp.status_code == 200, f"Download failed: {dl_resp.text}"
assert len(dl_resp.content) > 1000, "Downloaded file content is too small"
print("4. Download endpoint OK, bytes received:", len(dl_resp.content))

# 6. Verify ephemeral purge: second download request should return 404 (already purged!)
dl_resp_2 = client.get(f"/api/missing-items/download/{job_id}", headers=headers)
assert dl_resp_2.status_code == 404, "Ephemeral purge failed - file still accessible after download!"
print("5. Zero-trace ephemeral auto-purge verified: 404 on re-download!")

print("\n>>> ALL API ENDPOINT INTEGRATION TESTS PASSED 100%! <<<")
