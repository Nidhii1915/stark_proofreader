from __future__ import annotations

import logging
import os
import re
import shutil
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

logger = logging.getLogger("stark_excel")

# Default formatting specification matching Stark Premium vendor standards
DEFAULT_FORMATTING: dict[str, Any] = {
    "workbook": {
        "processed_sheet_name": "Sheet",
        "header": {
            "bold": True,
            "fill_hex": "000000",
            "font_hex": "FFFFFF",
            "font_name": "Arial",
            "font_size": 10,
            "horizontal": "left",
        },
        "data": {
            "font_name": "Calibri",
            "font_size": 11,
        },
        "freeze_header": True,
        "autofilter": False,
        "min_column_width": 12,
        "max_column_width": 48,
        "column_widths": {
            "Model#/SKU": 18,
            "UPC": 14,
            "Title/Item Name": 43,
            "Long Description": 18,
            "ITEM HEIGHT (Inches)": 20,
            "ITEM LENGTH (Inches)": 20,
            "ITEM WIDTH (Inches)": 20,
            "ITEM WEIGHT (lbs)": 18,
            "Image URL": 14,
            "Color": 14,
            "Country of Origin": 18,
            "MSRP": 14,
        },
    },
    "vendor": {
        "na_value": "N/A",
        "sku_header": "Model#/SKU",
        "title_header": "Title/Item Name",
        "title_source": "ItemTitle",
        "missing_item_dim_column": "MissingItemDim",
        "dimension_headers": [
            "ITEM HEIGHT (Inches)",
            "ITEM LENGTH (Inches)",
            "ITEM WIDTH (Inches)",
            "ITEM WEIGHT (lbs)",
        ],
        "flag_headers": {
            "MissingUPC": "UPC",
            "MissingLongDescription": "Long Description",
            "MissingImage": "Image URL",
            "MissingColor": "Color",
            "MissingCountryOfOrigin": "Country of Origin",
            "ZeroMSRP": "MSRP",
        },
        "column_order": [
            "Model#/SKU",
            "Title/Item Name",
            "Long Description",
            "UPC",
            "ITEM HEIGHT (Inches)",
            "ITEM LENGTH (Inches)",
            "ITEM WIDTH (Inches)",
            "ITEM WEIGHT (lbs)",
            "Image URL",
            "Color",
            "Country of Origin",
            "MSRP",
        ],
    },
    "always_keep": [
        "Brand",
        "Model#",
    ],
    "drop_columns": [
        "ItemStatus",
        "systemid",
        "stockqty",
        "expectedinventorydate",
        "MissingBiCategory",
        "MissingReplinkCategory",
        "MissingCartonData",
        "MissingFeatures",
        "MissingHarmonizedTaxCode",
    ],
    "missing_information_columns": [
        "MissingUPC",
        "MissingItemDim",
        "MissingLongDescription",
        "MissingImage",
        "MissingColor",
        "MissingCountryOfOrigin",
        "ZeroMSRP",
    ],
    "missing_positive_values": {"true", "1", "yes", "t", "y"},
    "missing_negative_values": {"false", "0", "no", "f", "n"},
}


def _stringify(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    text = str(value).strip()
    if text.lower() in {"nan", "none", "nat"}:
        return ""
    return text


def is_blank(value: object) -> bool:
    return _stringify(value) == ""


def is_missing_information(value: object, positive_values: set[str], negative_values: set[str]) -> bool:
    """Blank/empty means information is NOT missing.
    True, 1, or equivalent positive value means information IS missing.
    """
    if isinstance(value, bool):
        return value is True
    if isinstance(value, (int, float)):
        if float(value) == 1:
            return True
        if float(value) == 0:
            return False
    text = _stringify(value).lower()
    if text == "":
        return False
    if text in negative_values:
        return False
    if text in positive_values:
        return True
    return False


@dataclass
class CleanupResult:
    retained_rows_data: list[dict[str, Any]]
    source_rows: int
    retained_rows: int
    deleted_rows: int
    dropped_columns: list[str]
    empty_dropped_columns: list[str]


def cleanup_report(
    raw_headers: list[str],
    raw_rows: list[dict[str, Any]],
    formatting: dict[str, Any] | None = None,
) -> CleanupResult:
    fmt = formatting or DEFAULT_FORMATTING
    source_rows = len(raw_rows)

    drop_columns = [col for col in fmt.get("drop_columns", []) if col in raw_headers]
    active_headers = [c for c in raw_headers if c not in drop_columns]

    missing_info_columns = [
        col for col in fmt.get("missing_information_columns", []) if col in active_headers
    ]
    positive = fmt.get("missing_positive_values", {"true", "1", "yes"})
    negative = fmt.get("missing_negative_values", {"false", "0", "no"})

    # Filter rows: Keep row if at least one missing information column is True/1
    retained: list[dict[str, Any]] = []
    for row in raw_rows:
        has_any_missing = False
        for col in missing_info_columns:
            val = row.get(col)
            if is_missing_information(val, positive, negative):
                has_any_missing = True
                break
        if has_any_missing:
            retained.append(row)

    # Drop any missing flag column where NO retained row is missing
    empty_dropped: list[str] = []
    always_keep = set(fmt.get("always_keep", []))
    title_source = fmt.get("vendor", {}).get("title_source", "ItemTitle")
    always_keep.add(title_source)

    for col in list(active_headers):
        if col in always_keep:
            continue
        looks_like_missing = (
            col in missing_info_columns or col.startswith("Missing") or col == "ZeroMSRP"
        )
        if looks_like_missing:
            any_row_missing = any(
                is_missing_information(r.get(col), positive, negative) for r in retained
            )
            if not any_row_missing:
                empty_dropped.append(col)

    return CleanupResult(
        retained_rows_data=retained,
        source_rows=source_rows,
        retained_rows=len(retained),
        deleted_rows=source_rows - len(retained),
        dropped_columns=drop_columns,
        empty_dropped_columns=empty_dropped,
    )


def to_vendor_data(
    retained_rows: list[dict[str, Any]],
    formatting: dict[str, Any] | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Convert cleaned row records into vendor-facing fill-in template:
    Missing values are left BLANK for vendor to fill. Non-missing values are 'N/A'.
    Rows with all N/A fill-in values are dropped.
    """
    fmt = formatting or DEFAULT_FORMATTING
    vendor_cfg = fmt.get("vendor", {})
    na_token = str(vendor_cfg.get("na_value", "N/A"))
    positive = fmt.get("missing_positive_values", {"true", "1", "yes"})
    negative = fmt.get("missing_negative_values", {"false", "0", "no"})

    sku_header = vendor_cfg.get("sku_header", "Model#/SKU")
    title_header = vendor_cfg.get("title_header", "Title/Item Name")
    title_source = vendor_cfg.get("title_source", "ItemTitle")
    dim_source = vendor_cfg.get("missing_item_dim_column", "MissingItemDim")
    dim_headers = list(vendor_cfg.get("dimension_headers", [
        "ITEM HEIGHT (Inches)",
        "ITEM LENGTH (Inches)",
        "ITEM WIDTH (Inches)",
        "ITEM WEIGHT (lbs)",
    ]))
    flag_headers = dict(vendor_cfg.get("flag_headers", {}))

    # Check if dimensions are missing in any row
    include_dims = any(
        is_missing_information(r.get(dim_source), positive, negative)
        for r in retained_rows
    )

    # Check if titles exist
    has_titles = any(not is_blank(r.get(title_source)) for r in retained_rows)

    def _flag_val(raw_val: Any) -> str:
        return "" if is_missing_information(raw_val, positive, negative) else na_token

    vendor_rows: list[dict[str, Any]] = []

    for r in retained_rows:
        model_val = r.get("Model#") or r.get("Model#/SKU") or r.get("Model") or ""
        v_row: dict[str, Any] = {
            sku_header: str(model_val).strip()
        }

        if has_titles:
            v_row[title_header] = str(r.get(title_source) or "").strip()

        # Long description (always present when titles are available)
        long_hdr = flag_headers.get("MissingLongDescription", "Long Description")
        if has_titles:
            if "MissingLongDescription" in r:
                v_row[long_hdr] = _flag_val(r.get("MissingLongDescription"))
            else:
                v_row[long_hdr] = na_token

        # UPC
        upc_hdr = flag_headers.get("MissingUPC", "UPC")
        if "MissingUPC" in r:
            v_row[upc_hdr] = _flag_val(r.get("MissingUPC"))

        # Dimensions
        if include_dims:
            dim_val = _flag_val(r.get(dim_source))
            for dh in dim_headers:
                v_row[dh] = dim_val

        # Image URL
        img_hdr = flag_headers.get("MissingImage", "Image URL")
        if "MissingImage" in r:
            v_row[img_hdr] = _flag_val(r.get("MissingImage"))

        # Additional flags
        for src in ["MissingColor", "MissingCountryOfOrigin", "ZeroMSRP"]:
            if src in r and src in flag_headers:
                v_row[flag_headers[src]] = _flag_val(r.get(src))

        # Check if all fill-in cells are N/A (nothing missing)
        fill_vals = [v for k, v in v_row.items() if k not in {sku_header, title_header}]
        has_needed_fill = any(v == "" for v in fill_vals)
        if has_needed_fill or not fill_vals:
            vendor_rows.append(v_row)

    # Determine standard column order
    desired_order = vendor_cfg.get("column_order", [])
    present_cols = set()
    for row in vendor_rows:
        present_cols.update(row.keys())

    final_columns = [c for c in desired_order if c in present_cols]
    leftovers = [c for c in present_cols if c not in final_columns]
    final_columns.extend(leftovers)

    return final_columns, vendor_rows


def write_formatted_workbook(
    headers: list[str],
    rows: list[dict[str, Any]],
    output_path: Path,
    formatting: dict[str, Any] | None = None,
) -> None:
    """Format workbook with Stark Executive styles:
    - Arial 10pt Bold White on Solid Black header
    - Calibri 11pt data
    - Auto column widths
    - Top row freeze
    """
    fmt = formatting or DEFAULT_FORMATTING
    wb_cfg = fmt.get("workbook", {})
    hdr_cfg = wb_cfg.get("header", {})
    data_cfg = wb_cfg.get("data", {})

    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = wb_cfg.get("processed_sheet_name", "Sheet")

    header_font = Font(
        name=hdr_cfg.get("font_name", "Arial"),
        size=hdr_cfg.get("font_size", 10),
        bold=hdr_cfg.get("bold", True),
        color=hdr_cfg.get("font_hex", "FFFFFF"),
    )
    fill_hex = hdr_cfg.get("fill_hex", "000000")
    header_fill = PatternFill(start_color=fill_hex, end_color=fill_hex, fill_type="solid")
    header_alignment = Alignment(horizontal=hdr_cfg.get("horizontal", "left"), vertical="center")

    data_font = Font(
        name=data_cfg.get("font_name", "Calibri"),
        size=data_cfg.get("font_size", 11),
    )
    data_alignment = Alignment(horizontal="left", vertical="center")

    # 1. Write headers
    ws.append(headers)
    ws.row_dimensions[1].height = 24

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = header_alignment

    # 2. Write data
    for r in rows:
        row_cells = [r.get(h, "") for h in headers]
        ws.append(row_cells)

    for row_idx in range(2, ws.max_row + 1):
        ws.row_dimensions[row_idx].height = 20
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = data_font
            cell.alignment = data_alignment

    # 3. Freeze top row
    if wb_cfg.get("freeze_header", True):
        ws.freeze_panes = "A2"

    # 4. Column widths
    explicit_widths = wb_cfg.get("column_widths", {})
    min_w = wb_cfg.get("min_column_width", 12)
    max_w = wb_cfg.get("max_column_width", 48)

    for col_idx, col_name in enumerate(headers, start=1):
        col_letter = get_column_letter(col_idx)
        if col_name in explicit_widths:
            ws.column_dimensions[col_letter].width = explicit_widths[col_name]
        else:
            max_len = len(str(col_name))
            for row_idx in range(2, min(ws.max_row + 1, 50)):
                val = ws.cell(row=row_idx, column=col_idx).value
                if val is not None:
                    max_len = max(max_len, len(str(val)))
            ws.column_dimensions[col_letter].width = max(min_w, min(max_len + 4, max_w))

    wb.save(str(output_path))
    logger.info("Saved formatted vendor workbook to %s", output_path)


# Ephemeral storage manager: auto-purges files after download or TTL expiration
EPHEMERAL_DIR = Path(__file__).resolve().parent.parent / "ephemeral_workbooks"
EPHEMERAL_DIR.mkdir(parents=True, exist_ok=True)

_ephemeral_registry: dict[str, dict[str, Any]] = {}
_registry_lock = threading.Lock()


def register_ephemeral_job(job_id: str, file_path: Path, ttl_seconds: int = 900) -> None:
    with _registry_lock:
        _ephemeral_registry[job_id] = {
            "path": file_path,
            "created_at": time.time(),
            "ttl": ttl_seconds,
            "download_count": 0,
        }


def get_ephemeral_file(job_id: str) -> Optional[Path]:
    with _registry_lock:
        entry = _ephemeral_registry.get(job_id)
        if not entry:
            return None
        entry["download_count"] += 1
        path = entry["path"]
        if isinstance(path, Path) and path.exists():
            return path
        return None


def purge_ephemeral_job(job_id: str) -> None:
    with _registry_lock:
        entry = _ephemeral_registry.pop(job_id, None)
        if entry:
            path = entry["path"]
            try:
                if isinstance(path, Path) and path.exists():
                    parent_job_dir = path.parent
                    if parent_job_dir != EPHEMERAL_DIR and parent_job_dir.name == job_id:
                        shutil.rmtree(parent_job_dir, ignore_errors=True)
                    else:
                        path.unlink(missing_ok=True)
            except Exception as e:
                logger.warning("Error purging ephemeral file %s: %s", path, e)


def cleanup_expired_ephemeral_files() -> int:
    now = time.time()
    expired_ids = []
    with _registry_lock:
        for j_id, meta in list(_ephemeral_registry.items()):
            if now - meta["created_at"] > meta["ttl"]:
                expired_ids.append(j_id)

    purged_count = 0
    for j_id in expired_ids:
        purge_ephemeral_job(j_id)
        purged_count += 1
    return purged_count


def safe_brand_name(brand: str) -> str:
    cleaned = re.sub(r"[^\w\s-]", "", brand).strip()
    return re.sub(r"[\s-]+", "_", cleaned) or "Brand"


def process_raw_workbook(
    raw_path: Path,
    brand: str,
    job_id: str,
) -> dict[str, Any]:
    """Execute end-to-end cleaning, vendor conversion, formatting, and preview generation using openpyxl."""
    wb = openpyxl.load_workbook(str(raw_path), data_only=True)
    ws = wb.active

    # Extract headers from row 1
    raw_headers: list[str] = []
    for col_idx in range(1, ws.max_column + 1):
        cell_val = ws.cell(row=1, column=col_idx).value
        raw_headers.append(str(cell_val).strip() if cell_val is not None else f"Column_{col_idx}")

    # Extract data rows as list of dicts
    raw_rows: list[dict[str, Any]] = []
    for row_idx in range(2, ws.max_row + 1):
        row_dict = {}
        for col_idx, header in enumerate(raw_headers, start=1):
            row_dict[header] = ws.cell(row=row_idx, column=col_idx).value
        raw_rows.append(row_dict)

    # 1. Clean report & filter rows
    cleanup_res = cleanup_report(raw_headers, raw_rows)

    # 2. Build vendor template
    vendor_columns, vendor_rows = to_vendor_data(cleanup_res.retained_rows_data)

    # 3. Save formatted vendor workbook
    brand_slug = safe_brand_name(brand)
    send_filename = f"{brand_slug}_Missing_Item_Send_File.xlsx"

    job_dir = EPHEMERAL_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    send_path = job_dir / send_filename

    write_formatted_workbook(vendor_columns, vendor_rows, send_path)
    register_ephemeral_job(job_id, send_path, ttl_seconds=900)

    # Generate preview rows (first 10 rows formatted cleanly for frontend table)
    preview_rows = vendor_rows[:10]

    return {
        "job_id": job_id,
        "brand": brand,
        "send_filename": send_filename,
        "source_rows": cleanup_res.source_rows,
        "retained_rows": len(vendor_rows),
        "deleted_rows": int(cleanup_res.source_rows - len(vendor_rows)),
        "columns": vendor_columns,
        "preview_rows": preview_rows,
        "dropped_columns": cleanup_res.dropped_columns,
        "empty_dropped_columns": cleanup_res.empty_dropped_columns,
    }
