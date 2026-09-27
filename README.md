# DocProofreader AI 📝✨
### Intelligent Microsoft Word (.docx) Grammar, Spell & Style Proofreader

An automated, human-in-the-loop web application designed for teams to polish Word documents (`.docx`) before daily presentations and executive reporting. Powered by **Google Gemini 3.8 Flash**, it catches nuanced spelling errors, grammar mistakes, awkward phrasing, and tone inconsistencies—allowing you to inspect, accept/reject, or edit each suggestion with a single click before downloading a clean, fully formatted Word file.

---

## 🌟 Key Features

- **Human-in-the-Loop Confirmation**: You stay in control. Review suggestions card-by-card or with bulk actions (`Accept All`, `Reject All`).
- **Preserves Native Word Formatting**: Uses run-aware replacements so headings, bold, italics, tables, and typography are preserved.
- **Categorized Issue Highlighting**: Visually differentiates between **Spelling**, **Grammar**, **Punctuation**, and **Clarity / Style**.
- **Interactive Split Workspace**:
  - **Left**: Document preview with colored error highlights. Clicking an error scrolls directly to its suggestion.
  - **Right**: Suggestion cards showing original vs proposed diffs (`wrong` → `right`), explanations, and edit inputs.
- **Zero Client-Side Installation for Teammates**: Runs as a lightweight web service. Teammates open a link in Chrome, Edge, or Safari without installing Python or any extra tools.
- **Flexible API Key Configuration**: Set a shared key in `.env` for the whole team, or let team members enter their own key in the browser settings.

---

## 🚀 Quick Start (1-Click Launch)

### On Windows:
Simply double-click **`start.bat`** in this folder!

The launcher will:
1. Automatically activate the virtual environment (`venv`).
2. Show your local IP address so you can share it with teammates.
3. Automatically launch your default browser to `http://localhost:8000`.

### Via PowerShell:
```powershell
.\run.ps1
```

---

## 👥 How to Share with Teammates (LAN / Wi-Fi)

DocProofreader listens on `0.0.0.0:8000`, making it accessible to any teammate connected to the same office network or Wi-Fi.

1. Run `start.bat`.
2. Look at the terminal output to find your local IP address, for example:
   ```
   [INFO] Teammates on your local network / Wi-Fi can connect via your LAN IP:
          --> http://192.168.1.45:8000
   ```
3. Share that URL (e.g. `http://192.168.1.45:8000`) with your colleagues.
4. They can immediately open it in their browser and start proofreading their documents—**no installation required!**

---

## 🔑 Setting Up the Gemini API Key

DocProofreader uses Google's latest `gemini-3.8-flash` model. You have two easy options to configure the key:

### Option A: Shared Team Key (Recommended)
Edit the `.env` file in this directory and paste your API key:
```ini
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
```
When configured here, all teammates connecting to your server can use the tool without needing to enter their own key.

### Option B: Per-User in the Browser
1. In the web application, click the **"API Key"** button in the top right navbar.
2. Paste your Gemini API key and click **"Test Connection"** to verify.
3. Click **"Save Key"**. The key is securely saved in your browser's `localStorage`.

> **Need a free Gemini API key?** You can generate one in seconds at [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## 📖 How to Use the App

1. **Upload Document**:
   - Drag & drop your `.docx` file into the upload zone (or click **"Try with Sample Report"** to test with built-in realistic business report mistakes).
   - Choose your desired proofreading tone (*Business Professional*, *Executive & Concise*, *Strict Grammar & Spelling*, etc.).
   - Click **"Scan & Check Document"**.
2. **Review Corrections**:
   - Filter suggestions by type (*All*, *Spelling*, *Grammar*, *Punctuation*, *Clarity*).
   - Click **✓ Accept** to approve a correction (turns green).
   - Click **✗ Reject** to dismiss it.
   - Click **✎ Edit** if you want to tweak the suggested text before accepting.
   - Keyboard shortcuts: Press `A` to accept the focused card, `R` to reject.
3. **Download Updated File**:
   - Click **"Apply Corrections & Download (.docx)"** in the bottom action bar.
   - Your corrected document will immediately download as `[OriginalName]_corrected.docx` with all approved fixes applied.

---

## 📁 Project Architecture

```
doc-proofreader/
├── backend/
│   ├── main.py               # FastAPI server & REST endpoints
│   ├── document_processor.py # Run-aware docx parsing & formatting preservation
│   └── checker.py            # Gemini 3.8 Flash proofreading & structured output
├── frontend/
│   ├── index.html            # Split-screen responsive UI layout
│   ├── style.css             # Light & dark themes, badges, diff views
│   └── app.js                # Interactive client state, sync & download logic
├── sample_docs/              # Auto-generated sample business report
├── venv/                     # Python 3 virtual environment
├── start.bat                 # 1-Click Windows batch launcher
├── run.ps1                   # PowerShell launcher
├── requirements.txt          # Python dependencies
├── .env.example              # Environment variables template
└── README.md                 # Complete documentation & team guide
```
