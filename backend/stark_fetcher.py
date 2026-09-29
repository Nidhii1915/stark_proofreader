from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from backend.excel_processor import (
    EPHEMERAL_DIR,
    process_raw_workbook,
)

logger = logging.getLogger("stark_fetcher")


@dataclass
class FetchJob:
    id: str
    brand: str
    status: str = "queued"  # queued, running, success, failed
    step: str = "Initializing"
    steps: list[str] = field(default_factory=list)
    error: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "brand": self.brand,
            "status": self.status,
            "step": self.step,
            "steps": self.steps,
            "error": self.error,
            "result": self.result,
            "created_at": datetime.fromtimestamp(self.created_at, tz=timezone.utc).isoformat(),
        }


class StarkPortalFetcher:
    def __init__(self) -> None:
        self._jobs: dict[str, FetchJob] = {}
        self._lock = threading.Lock()
        self._running_count = 0

    def get_job(self, job_id: str) -> Optional[FetchJob]:
        with self._lock:
            return self._jobs.get(job_id)

    def is_configured(self) -> bool:
        email = os.getenv("STARK_PREMIUM_EMAIL", "").strip()
        pwd = os.getenv("STARK_PREMIUM_PASSWORD", "").strip()
        cdp = os.getenv("STARK_PREMIUM_CDP_URL", "").strip()
        return bool((email and pwd) or cdp)

    def start_fetch_job(self, brand: str) -> FetchJob:
        brand = brand.strip()
        if not brand:
            raise ValueError("Brand name is required.")

        job_id = uuid.uuid4().hex[:12]
        job = FetchJob(id=job_id, brand=brand, status="queued", step="Queued in task manager")
        with self._lock:
            self._jobs[job_id] = job

        thread = threading.Thread(target=self._run_pipeline, args=(job,), daemon=True)
        thread.start()
        return job

    def _run_pipeline(self, job: FetchJob) -> None:
        def note(msg: str) -> None:
            job.step = msg
            job.steps.append(msg)
            logger.info("[%s] %s", job.id, msg)

        try:
            job.status = "running"
            note(f"Starting Missing Item automation for brand: {job.brand}")

            email = os.getenv("STARK_PREMIUM_EMAIL", "").strip()
            password = os.getenv("STARK_PREMIUM_PASSWORD", "").strip()
            cdp_url = os.getenv("STARK_PREMIUM_CDP_URL", "").strip()
            base_url = os.getenv("STARK_PREMIUM_BASE_URL", "https://us.starkpremium.com").rstrip("/")

            if not ((email and password) or cdp_url):
                raise RuntimeError(
                    "Stark Premium credentials (STARK_PREMIUM_EMAIL & STARK_PREMIUM_PASSWORD) "
                    "are not configured on the server. Please ask the administrator to configure them in environment variables, "
                    "or use the 'Direct Excel Upload' option above."
                )

            # Attempt Playwright import
            try:
                from playwright.sync_api import sync_playwright
            except ImportError:
                raise RuntimeError(
                    "Playwright library is not installed in the server environment. "
                    "Please use the 'Direct Excel Upload' option to process reports."
                )

            job_scratch = EPHEMERAL_DIR / job.id
            job_scratch.mkdir(parents=True, exist_ok=True)
            raw_download_path = job_scratch / "raw_export.xlsx"

            with sync_playwright() as p:
                browser = None
                context = None
                page = None

                if cdp_url:
                    try:
                        note(f"Connecting to attached browser session at {cdp_url}")
                        browser = p.chromium.connect_over_cdp(cdp_url)
                        context = browser.contexts[0] if browser.contexts else browser.new_context()
                        page = context.pages[0] if context.pages else context.new_page()
                    except Exception as exc:
                        logger.warning("CDP connect failed: %s. Falling back to fresh session.", exc)

                if page is None:
                    note("Launching automated browser session...")
                    try:
                        browser = p.chromium.launch(headless=True)
                        context = browser.new_context(accept_downloads=True)
                        page = context.new_page()
                    except Exception as exc:
                        raise RuntimeError(
                            f"Unable to launch Chromium on server: {exc}. "
                            "Please install Chromium binaries with 'playwright install chromium' or use Direct Excel Upload."
                        ) from exc

                try:
                    # 1. Login flow
                    login_url = f"{base_url}/login.aspx"
                    note(f"Navigating to Stark Premium login...")
                    page.goto(login_url, wait_until="domcontentloaded", timeout=45000)

                    # Check if login form is present
                    email_field = page.locator("#tbemail")
                    if email_field.is_visible(timeout=5000):
                        note("Entering credentials and signing in...")
                        email_field.fill(email)
                        page.locator("#tbpword").fill(password)
                        with page.expect_navigation(timeout=30000):
                            page.locator("#btnlogin").click()
                        note("Authenticated successfully.")
                    else:
                        note("Already authenticated in session.")

                    # 2. Open Missing Item Data Report
                    report_url = f"{base_url}/MissingItemDataReport.aspx"
                    note(f"Navigating to Missing Item Data Report...")
                    page.goto(report_url, wait_until="domcontentloaded", timeout=45000)

                    # 3. Select Brand
                    note(f"Selecting brand: {job.brand}...")
                    brand_dropdown = page.locator("#ddlbrand, #ddlBrand").first
                    brand_dropdown.wait_for(state="visible", timeout=15000)
                    try:
                        brand_dropdown.select_option(label=job.brand)
                    except Exception:
                        brand_dropdown.select_option(value=job.brand)

                    # 4. Configure Item Statuses (exclude Discontinued, Custom, Temporary Hold)
                    note("Configuring item statuses...")
                    status_boxes = page.locator("#cblitemstatus input[type='checkbox']")
                    box_count = status_boxes.count()
                    excluded_statuses = {"discontinued", "custom", "temporary hold"}

                    for i in range(box_count):
                        box = status_boxes.nth(i)
                        # Find parent or label text
                        label_text = page.evaluate("(el) => el.parentElement ? el.parentElement.textContent.trim() : ''", box.element_handle())
                        if not label_text:
                            continue
                        lowered = label_text.lower()
                        if any(ex in lowered for ex in excluded_statuses):
                            if box.is_checked():
                                box.uncheck()
                        else:
                            if not box.is_checked():
                                box.check()

                    # 5. Uncheck filter checkboxes
                    note("Unchecking 'Items with Inventory Only' and 'Items with a Missing Image'...")
                    inv_box = page.locator("#cbinventoryonly")
                    if inv_box.count() > 0 and inv_box.is_checked():
                        inv_box.uncheck()

                    img_box = page.locator("#cbimage")
                    if img_box.count() > 0 and img_box.is_checked():
                        img_box.uncheck()

                    # 6. Click Update Report
                    note("Updating report data on Stark Premium...")
                    update_btn = page.locator("#btnupdate").first
                    update_btn.click()
                    page.wait_for_load_state("networkidle", timeout=60000)

                    # 7. Click Export to Excel and capture download
                    note("Triggering Excel export...")
                    export_btn = page.locator("#btnexport").first
                    export_btn.wait_for(state="visible", timeout=30000)

                    with page.expect_download(timeout=60000) as download_info:
                        export_btn.click()

                    download = download_info.value
                    download.save_as(str(raw_download_path))
                    note("Raw export received from Stark Premium.")

                finally:
                    if browser and not cdp_url:
                        browser.close()

            # 8. Clean and format the workbook
            note("Processing, cleaning, and formatting vendor workbook...")
            result = process_raw_workbook(raw_download_path, job.brand, job.id)

            # Purge raw export to retain confidentiality
            raw_download_path.unlink(missing_ok=True)

            job.result = result
            job.status = "success"
            note(f"Completed! Kept {result['retained_rows']} of {result['source_rows']} rows. Ready for download.")

        except Exception as exc:
            job.status = "failed"
            job.error = str(exc)
            note(f"Failed: {exc}")
            logger.exception("Error during Stark Portal fetch job %s", job.id)


fetcher = StarkPortalFetcher()
