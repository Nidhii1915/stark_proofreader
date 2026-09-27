import os
import uuid
import io
import json
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from docx import Document

from backend.document_processor import DocxProcessor
from backend.checker import GeminiProofreader

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

@app.get("/api/config")
async def get_config():
    """Checks whether the server has a GEMINI_API_KEY preconfigured in .env."""
    has_key = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "has_server_key": has_key,
        "default_model": "gemini-3.5-flash-lite"
    }

class KeyTestRequest(BaseModel):
    api_key: str

@app.post("/api/test-key")
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

@app.post("/api/analyze")
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

class DecisionItem(BaseModel):
    issue_id: str
    block_id: str
    accepted: bool
    original_text: str
    replacement_text: str

class ApplyRequest(BaseModel):
    session_id: str
    decisions: List[DecisionItem]

@app.post("/api/apply")
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

@app.get("/api/sample-doc")
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
