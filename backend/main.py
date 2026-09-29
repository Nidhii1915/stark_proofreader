import os
import re
import uuid
import io
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv
import hmac
import hashlib
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Header, Query
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from docx import Document
import openpyxl

from backend.document_processor import DocxProcessor
from backend.checker import GeminiProofreader
from backend.excel_processor import (
    process_raw_workbook,
    get_ephemeral_file,
    purge_ephemeral_job,
    cleanup_expired_ephemeral_files,
    EPHEMERAL_DIR,
)
from backend.stark_fetcher import fetcher


# Load environment variables from .env
load_dotenv()

app = FastAPI(title="DocProofreader AI", description="Interactive Microsoft Word AI Proofreader & Editor")

# Enable CORS for local network and development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Persistent session store (both in-memory and disk-backed for resilience across server reloads)
SESSIONS: Dict[str, Dict[str, Any]] = {}
SESSION_DIR = Path(__file__).resolve().parent.parent / "sessions_cache"
SESSION_DIR.mkdir(exist_ok=True)

def save_session(session_id: str, filename: str, file_bytes: bytes, blocks: list, issues: list):
    session_data = {
        "filename": filename,
        "blocks": blocks,
        "issues": issues,
        "file_bytes": file_bytes
    }
    SESSIONS[session_id] = session_data
    try:
        (SESSION_DIR / f"{session_id}.docx").write_bytes(file_bytes)
        meta = {
            "filename": filename,
            "blocks": blocks,
            "issues": issues,
        }
        (SESSION_DIR / f"{session_id}.json").write_text(json.dumps(meta), encoding="utf-8")
    except Exception as e:
        pass

def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    if session_id in SESSIONS:
        return SESSIONS[session_id]
    
    docx_file = SESSION_DIR / f"{session_id}.docx"
    json_file = SESSION_DIR / f"{session_id}.json"
    if docx_file.exists() and json_file.exists():
        try:
            meta = json.loads(json_file.read_text(encoding="utf-8"))
            file_bytes = docx_file.read_bytes()
            session_data = {
                "filename": meta.get("filename", "document.docx"),
                "blocks": meta.get("blocks", []),
                "issues": meta.get("issues", []),
                "file_bytes": file_bytes
            }
            SESSIONS[session_id] = session_data
            return session_data
        except Exception:
            pass
    return None

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
SAMPLE_DOCS_DIR = Path(__file__).resolve().parent.parent / "sample_docs"

# Serve static files for frontend
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Frontend not found</h1>", status_code=404)

# =========================================================================
# Team Passcode Security & Authentication
# =========================================================================
TEAM_PASSCODE = os.getenv("TEAM_PASSCODE", "stark2026").strip()
SECRET_AUTH_KEY = os.getenv("SECRET_AUTH_KEY", "stark-secret-salt-proofreader-2026").strip()

def get_expected_token() -> str:
    """Computes a cryptographically secure token derived from passcode + secret salt."""
    return hmac.new(
        SECRET_AUTH_KEY.encode("utf-8"),
        TEAM_PASSCODE.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

def is_valid_token(token: Optional[str]) -> bool:
    """Verifies token against expected hash using constant-time comparison."""
    if not token or not isinstance(token, str):
        return False
    return hmac.compare_digest(token.strip(), get_expected_token())

def is_valid_passcode(passcode: Optional[str]) -> bool:
    """Verifies passcode against configured TEAM_PASSCODE using constant-time comparison, with normalization."""
    if not passcode or not isinstance(passcode, str):
        return False
    p = passcode.strip()
    if hmac.compare_digest(p, TEAM_PASSCODE):
        return True
    # Normalize: lower case and strip whitespace / dashes / dots
    p_norm = re.sub(r'[\s\-_.]+', '', p).lower()
    expected_norm = re.sub(r'[\s\-_.]+', '', TEAM_PASSCODE).lower()
    return hmac.compare_digest(p_norm, expected_norm)

def is_valid_passcode_or_token(val: Optional[str]) -> bool:
    """Verifies against either the configured passcode or a valid session token."""
    if not val or not isinstance(val, str):
        return False
    v = val.strip()
    return is_valid_passcode(v) or is_valid_token(v)

async def require_team_auth(
    authorization: Optional[str] = Header(None),
    x_stark_token: Optional[str] = Header(None),
    x_team_passcode: Optional[str] = Header(None),
):
    """FastAPI dependency to protect endpoints with team authentication."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_stark_token:
        token = x_stark_token.strip()
    elif x_team_passcode:
        token = x_team_passcode.strip()

    if not is_valid_passcode_or_token(token):
        raise HTTPException(
            status_code=401,
            detail="Authentication required or session expired. Please enter the team passcode."
        )
    return True

class LoginRequest(BaseModel):
    passcode: Optional[str] = None
    password: Optional[str] = None
    token: Optional[str] = None

@app.get("/api/auth/status")
async def get_auth_status(
    authorization: Optional[str] = Header(None),
    x_stark_token: Optional[str] = Header(None),
    x_team_passcode: Optional[str] = Header(None),
):
    """Checks whether the client has an active authenticated session."""
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_stark_token:
        token = x_stark_token.strip()
    elif x_team_passcode:
        token = x_team_passcode.strip()

    return {
        "auth_required": True,
        "authenticated": is_valid_passcode_or_token(token)
    }

@app.post("/api/auth/login")
@app.post("/api/verify-passcode")
async def auth_login(
    req: Optional[LoginRequest] = None,
    code: Optional[str] = Query(None),
    passcode: Optional[str] = Query(None)
):
    """Validates the team passcode or existing session token and issues a secure session token."""
    val = ""
    if req:
        val = req.passcode or req.password or req.token or ""
    if not val:
        val = passcode or code or ""

    if is_valid_passcode_or_token(val):
        return {
            "success": True,
            "token": get_expected_token(),
            "message": "Access granted to Stark Suite."
        }
    raise HTTPException(
        status_code=401,
        detail="Incorrect team passcode. Default is stark2026."
    )

@app.get("/api/key-status")
@app.get("/api/config")
async def get_config(
    authorization: Optional[str] = Header(None),
    x_stark_token: Optional[str] = Header(None),
    x_team_passcode: Optional[str] = Header(None),
):
    raw = os.getenv("GEMINI_API_KEY", "").strip().strip("'\"")
    has_key = bool(raw and len(raw) > 20 and raw != "GEMINI_API_KEY" and not raw.startswith("your_"))
    return {
        "has_server_key": has_key,
        "server_has_key": has_key,
        "default_model": "gemini-3.5-flash-lite"
    }

class KeyTestRequest(BaseModel):
    api_key: str

@app.post("/api/test-key", dependencies=[Depends(require_team_auth)])
async def test_api_key(req: KeyTestRequest):
    """Tests if a provided Gemini API key is valid."""
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is required.")
    
    try:
        from google import genai
        client = genai.Client(api_key=key)
        for m in ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"]:
            try:
                resp = client.models.generate_content(
                    model=m,
                    contents="Say 'OK' if you can read this."
                )
                if resp and resp.text:
                    return {"valid": True, "message": f"Key is active and verified with {m}!"}
            except Exception as model_err:
                err_text = str(model_err)
                if "503" in err_text or "UNAVAILABLE" in err_text:
                    continue  # try next model
                raise model_err
        return {"valid": False, "error": "No response returned from model"}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.post("/api/analyze", dependencies=[Depends(require_team_auth)])
async def analyze_document(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(None),
    tone: Optional[str] = Form("business")
):
    """
    Uploads a .docx file, extracts text blocks, sends them to Gemini for proofreading,
    and returns detected issues along with block context.
    """
    if not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Only Microsoft Word (.docx) documents are supported.")

    # Determine effective API key
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key:
        env_key = env_key.strip().strip("'\"")
    user_key = api_key.strip().strip("'\"") if api_key and api_key.strip() else None
    effective_key = user_key or env_key
    if not effective_key:
        raise HTTPException(
            status_code=400,
            detail="No Gemini API Key provided. Please provide an API key in the UI or set GEMINI_API_KEY in the server .env file."
        )

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        doc, blocks = DocxProcessor.extract_blocks(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read .docx file: {str(e)}")

    if not blocks:
        raise HTTPException(status_code=400, detail="No readable text found in document.")

    # Analyze blocks with Gemini
    try:
        proofreader = GeminiProofreader(api_key=effective_key)
        issues = proofreader.analyze_blocks(blocks, style_tone=tone or "business")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini analysis error: {str(e)}")

    session_id = str(uuid.uuid4())
    save_session(session_id, file.filename, file_bytes, blocks, issues)

    return {
        "session_id": session_id,
        "filename": file.filename,
        "blocks": blocks,
        "issues": issues,
        "total_blocks": len(blocks),
        "total_issues": len(issues)
    }

@app.post("/api/analyze-text", dependencies=[Depends(require_team_auth)])
async def analyze_text(
    text: str = Form(...),
    api_key: Optional[str] = Form(None),
    tone: Optional[str] = Form("business")
):
    """
    Creates an in-memory Word document from direct text, extracts blocks,
    and runs Gemini proofreading. Supports Wordvice-style direct typing.
    """
    clean_text = text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    env_key = os.getenv("GEMINI_API_KEY")
    if env_key:
        env_key = env_key.strip().strip("'\"")
    user_key = api_key.strip().strip("'\"") if api_key and api_key.strip() else None
    effective_key = user_key or env_key
    if not effective_key:
        raise HTTPException(
            status_code=400,
            detail="No Gemini API Key provided. Please provide an API key in the UI or set GEMINI_API_KEY in the server .env file."
        )

    doc = Document()
    paragraphs = [p.strip() for p in clean_text.split("\n") if p.strip()]
    if not paragraphs:
        paragraphs = [clean_text]
    for p in paragraphs:
        doc.add_paragraph(p)

    out = io.BytesIO()
    doc.save(out)
    file_bytes = out.getvalue()

    doc_obj, blocks = DocxProcessor.extract_blocks(file_bytes)
    if not blocks:
        raise HTTPException(status_code=400, detail="No readable text found in input.")

    try:
        proofreader = GeminiProofreader(api_key=effective_key)
        issues = proofreader.analyze_blocks(blocks, style_tone=tone or "business")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini analysis error: {str(e)}")

    session_id = str(uuid.uuid4())
    save_session(session_id, "Document_Text.docx", file_bytes, blocks, issues)

    return {
        "session_id": session_id,
        "filename": "Document_Text.docx",
        "blocks": blocks,
        "issues": issues,
        "total_blocks": len(blocks),
        "total_issues": len(issues)
    }

class DecisionItem(BaseModel):
    issue_id: str
    block_id: str
    accepted: bool
    original_text: str
    replacement_text: str

class ApplyRequest(BaseModel):
    session_id: str
    decisions: List[DecisionItem]

@app.post("/api/apply", dependencies=[Depends(require_team_auth)])
async def apply_corrections(req: ApplyRequest):
    """
    Applies confirmed corrections to the original Word document
    and returns the updated file for download.
    """
    session = get_session(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session expired or not found. Please re-upload the document.")

    # Re-parse fresh copy of document from stored bytes to avoid mutation drift
    file_bytes = session["file_bytes"]
    doc, _ = DocxProcessor.extract_blocks(file_bytes)

    # Filter accepted decisions
    accepted = [d.model_dump() for d in req.decisions if d.accepted]

    try:
        output_bytes = DocxProcessor.apply_corrections(doc, accepted)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply corrections: {str(e)}")

    orig_filename = session["filename"]
    base_name, ext = os.path.splitext(orig_filename)
    new_filename = f"{base_name}_corrected{ext}"

    return StreamingResponse(
        io.BytesIO(output_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="{new_filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

@app.get("/api/sample-doc", dependencies=[Depends(require_team_auth)])
async def get_sample_document():
    """Generates and returns a sample .docx document containing typical business report mistakes."""
    doc = Document()
    doc.add_heading("Title: Stark Premium Strategic & Performance Review", level=0)
    
    doc.add_paragraph("This report summarize the operational achievemnts  and financial metrics for Q3 2026.Our team has work hard to deliver results across all major client accounts,without delay.")
    
    doc.add_heading("Key Milestones and Outcomes", level=1)
    doc.add_paragraph("There is several  key factors that contributed to our sucess. First, the new software "
                      "infastructure was deployed without any major delays .Second, our customer retention rate "
                      "have increased significantly due to pro-active client communication.")
    
    doc.add_paragraph("However, their was a unexpected drop in enterprise sales during August due to seasonal "
                      "fluctuations and budget constraint among prospective clients.")
    
    doc.add_heading("Financial Summary", level=1)
    table = doc.add_table(rows=1, cols=3)
    hdr_cells = table.rows[0].cells
    hdr_cells[0].text = "Department"
    hdr_cells[1].text = "Budget Allocated"
    hdr_cells[2].text = "Remarks"
    
    row1 = table.add_row().cells
    row1[0].text = "Engineering & Product"
    row1[1].text = "$1,200,000"
    row1[2].text = "Deliverd all roadmap items on scedule."
    
    row2 = table.add_row().cells
    row2[0].text = "Marketing & Sales"
    row2[1].text = "$850,000"
    row2[2].text = "Lead generation were higher then expected."

    doc.add_heading("Recommendations for Q4", level=1)
    doc.add_paragraph("In order to ensure that we meet our year end target, its critical that all department heads "
                      "collaborate closely. We should also prioritize automated proofreading to avoid embarrassing "
                      "typos in executive presenations and proposals.")

    bio = io.BytesIO()
    doc.save(bio)
    bio.seek(0)

    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": 'attachment; filename="Sample_Business_Report.docx"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

# =========================================================================
# Stark Premium Missing Item Info Endpoints (Confidential & Ephemeral)
# =========================================================================

COMMON_BRANDS = [
    "Marc Jacobs", "Michael Kors", "Kate Spade", "Coach", "Tory Burch",
    "Calvin Klein", "Tommy Hilfiger", "Ralph Lauren", "Guess", "Fossil",
    "Ray-Ban", "Oakley", "Prada", "Gucci", "Versace", "Burberry"
]

class FetchBrandRequest(BaseModel):
    brand: str

@app.get("/api/missing-items/status", dependencies=[Depends(require_team_auth)])
async def get_missing_items_status():
    """Returns portal configuration status and brand recommendations without exposing credentials."""
    cleanup_expired_ephemeral_files()
    is_configured = fetcher.is_configured()
    return {
        "portal_configured": is_configured,
        "brands": COMMON_BRANDS,
        "privacy": "Zero-Trace Ephemeral Processing active. Workbooks auto-purged on download.",
        "message": "Automated Portal Fetch is ready." if is_configured else "Portal credentials not configured on server. Direct Excel Upload is available."
    }

@app.get("/api/missing-items/sample", dependencies=[Depends(require_team_auth)])
async def get_sample_missing_items():
    """Generates a sample raw Stark Premium export, cleans it according to vendor rules, and returns preview."""
    cleanup_expired_ephemeral_files()
    job_id = f"sample_{uuid.uuid4().hex[:8]}"
    job_dir = EPHEMERAL_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_raw = job_dir / "sample_raw_export.xlsx"

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    headers = [
        "Brand", "Model#", "ItemTitle", "ItemStatus", "systemid", "stockqty",
        "expectedinventorydate", "MissingUPC", "MissingItemDim", "MissingLongDescription",
        "MissingImage", "MissingColor", "MissingCountryOfOrigin", "ZeroMSRP", "MissingBiCategory"
    ]
    ws.append(headers)
    ws.append(["Marc Jacobs", "MJ-101", "The Snapshot Crossbody Bag", "Active", "SYS101", 14, "2026-10-15", True, False, True, False, False, False, False, "CAT1"])
    ws.append(["Marc Jacobs", "MJ-102", "The Leather Tote Bag Medium", "Active", "SYS102", 8, "2026-10-18", False, True, False, False, True, False, False, "CAT2"])
    ws.append(["Marc Jacobs", "MJ-103", "The J Marc Shoulder Bag", "Active", "SYS103", 20, "", True, True, False, False, False, True, False, ""])
    ws.append(["Marc Jacobs", "MJ-104", "The Jacquard Small Tote Bag", "Active", "SYS104", 5, "", False, False, True, False, False, False, False, ""])
    ws.append(["Marc Jacobs", "MJ-105", "Standard Card Case (Complete Item)", "Active", "SYS105", 35, "", False, False, False, False, False, False, False, ""])
    wb.save(str(temp_raw))

    result = process_raw_workbook(temp_raw, "Marc Jacobs", job_id)
    temp_raw.unlink(missing_ok=True)

    return {
        "success": True,
        "job_id": job_id,
        "brand": "Marc Jacobs",
        "send_filename": result["send_filename"],
        "source_rows": result["source_rows"],
        "retained_rows": result["retained_rows"],
        "deleted_rows": result["deleted_rows"],
        "columns": result["columns"],
        "preview_rows": result["preview_rows"],
        "download_url": f"/api/missing-items/download/{job_id}",
    }

@app.post("/api/missing-items/process-upload", dependencies=[Depends(require_team_auth)])
async def process_missing_items_upload(
    file: UploadFile = File(...),
    brand: str = Form("Brand")
):
    """Direct drag-and-drop processing: Cleans raw Stark export into vendor workbook in 1 second."""
    cleanup_expired_ephemeral_files()
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files (.xlsx, .xls) are supported.")

    brand_clean = brand.strip() or "Brand"
    job_id = uuid.uuid4().hex[:12]
    job_dir = EPHEMERAL_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    temp_raw_path = job_dir / f"raw_upload_{file.filename}"
    try:
        content = await file.read()
        temp_raw_path.write_bytes(content)

        result = process_raw_workbook(temp_raw_path, brand_clean, job_id)
        # Purge uploaded raw file immediately for confidentiality
        temp_raw_path.unlink(missing_ok=True)

        return {
            "success": True,
            "job_id": job_id,
            "brand": brand_clean,
            "send_filename": result["send_filename"],
            "source_rows": result["source_rows"],
            "retained_rows": result["retained_rows"],
            "deleted_rows": result["deleted_rows"],
            "columns": result["columns"],
            "preview_rows": result["preview_rows"],
            "download_url": f"/api/missing-items/download/{job_id}",
        }
    except Exception as exc:
        temp_raw_path.unlink(missing_ok=True)
        purge_ephemeral_job(job_id)
        raise HTTPException(status_code=500, detail=f"Failed to process Excel workbook: {str(exc)}")

@app.post("/api/missing-items/fetch", dependencies=[Depends(require_team_auth)])
async def start_missing_items_fetch(req: FetchBrandRequest):
    """Starts background Playwright portal automation to fetch, clean, and format report."""
    cleanup_expired_ephemeral_files()
    brand = req.brand.strip()
    if not brand:
        raise HTTPException(status_code=400, detail="Brand name is required.")

    job = fetcher.start_fetch_job(brand)
    return {
        "job_id": job.id,
        "brand": job.brand,
        "status": job.status,
        "step": job.step,
    }

@app.get("/api/missing-items/jobs/{job_id}", dependencies=[Depends(require_team_auth)])
async def get_missing_items_job(job_id: str):
    """Polls background portal fetch job progress and results."""
    cleanup_expired_ephemeral_files()
    job = fetcher.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    res = job.to_dict()
    if job.status == "success" and job.result:
        res["download_url"] = f"/api/missing-items/download/{job_id}"
    return res

@app.get("/api/missing-items/download/{job_id}", dependencies=[Depends(require_team_auth)])
async def download_missing_items_file(job_id: str):
    """Streams the formatted vendor workbook and triggers ephemeral auto-purge."""
    path = get_ephemeral_file(job_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Workbook expired or already purged from memory.")

    filename = path.name

    def file_iterator(file_path: Path):
        try:
            with open(file_path, "rb") as f:
                while chunk := f.read(65536):
                    yield chunk
        finally:
            # Ephemeral purge after serving
            purge_ephemeral_job(job_id)

    return StreamingResponse(
        file_iterator(path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
            "Cache-Control": "no-store, no-cache, must-revalidate",
        }
    )

