import sys
from pathlib import Path
import openpyxl

# Add root to sys.path
root_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(root_dir))

from backend.excel_processor import (
    process_raw_workbook,
    get_ephemeral_file,
    purge_ephemeral_job,
)

print("Imports successful!")

# Create a test Excel workbook using openpyxl matching Stark Premium export structure
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Sheet1"

headers = [
    "Brand", "Model#", "ItemTitle", "ItemStatus", "systemid", "stockqty",
    "expectedinventorydate", "MissingUPC", "MissingItemDim", "MissingLongDescription",
    "MissingImage", "MissingColor", "MissingCountryOfOrigin", "ZeroMSRP", "MissingBiCategory"
]
ws.append(headers)

# Row 1: Snapshot Crossbody (missing UPC & Long Description) -> KEEP
ws.append(["Marc Jacobs", "MJ-101", "Snapshot Crossbody", "Active", "SYS1", 10, "2026-10-01", True, False, True, False, False, False, False, "DropMe"])
# Row 2: The Tote Bag (missing ItemDim & Color) -> KEEP
ws.append(["Marc Jacobs", "MJ-102", "The Tote Bag Large", "Active", "SYS2", 5, "", False, True, False, False, True, False, False, ""])
# Row 3: Snapshot Camera Bag (missing UPC via '1') -> KEEP
ws.append(["Marc Jacobs", "MJ-103", "Snapshot Camera Bag", "Active", "SYS3", 0, "", 1, 0, 0, 0, 0, 0, 0, ""])
# Row 4: Complete Item (nothing missing) -> SHOULD BE DROPPED!
ws.append(["Marc Jacobs", "MJ-104", "Complete Item", "Active", "SYS4", 12, "", 0, 0, 0, 0, 0, 0, 0, ""])

test_raw_path = root_dir / "test_raw_stark.xlsx"
wb.save(str(test_raw_path))
print("Created test raw Excel workbook with openpyxl:", test_raw_path)

# Test process_raw_workbook
job_id = "testjob123"
result = process_raw_workbook(test_raw_path, "Marc Jacobs", job_id)
print("\nProcessing result:")
print(f"  Source rows: {result['source_rows']}")
print(f"  Retained rows: {result['retained_rows']}")
print(f"  Deleted rows: {result['deleted_rows']}")
print(f"  Columns: {result['columns']}")
print(f"  Preview rows count: {len(result['preview_rows'])}")

# Check output file
send_file = get_ephemeral_file(job_id)
print(f"  Generated file exists: {send_file and send_file.exists()}")

# Verify vendor rules
# 1. Row 4 had zero missing items -> should be dropped!
assert result['source_rows'] == 4, f"Expected 4 source rows, got {result['source_rows']}"
assert result['retained_rows'] == 3, f"Expected 3 retained rows, got {result['retained_rows']}"
assert result['deleted_rows'] == 1, f"Expected 1 deleted row, got {result['deleted_rows']}"

# 2. Dimensions expanded because MJ-102 had MissingItemDim=True
assert "ITEM HEIGHT (Inches)" in result['columns']
assert "ITEM LENGTH (Inches)" in result['columns']
assert "ITEM WIDTH (Inches)" in result['columns']
assert "ITEM WEIGHT (lbs)" in result['columns']

# 3. Model#/SKU is first column, Title/Item Name is second, Long Description is third, UPC is fourth
assert result['columns'][0] == "Model#/SKU"
assert result['columns'][1] == "Title/Item Name"
assert result['columns'][2] == "Long Description"
assert result['columns'][3] == "UPC"

# 4. Clean up test files
if test_raw_path.exists():
    test_raw_path.unlink()
purge_ephemeral_job(job_id)
print("Ephemeral purge verified!")
print("\n>>> ALL MISSING ITEM INFO VERIFICATION TESTS PASSED SUCCESSFULLY! <<<")
