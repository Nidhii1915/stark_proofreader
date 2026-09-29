# 📝 Stark Proofreader – Team Quick-Start Guide

Welcome to **Stark Proofreader**! This guide will help you quickly start proofreading Word documents (`.docx`) and text with AI precision while preserving 100% of your fonts, headings, tables, and document layout.

---

## 🔗 1. Access the Application

- **Live URL**: [https://stark-proofreader.onrender.com](https://stark-proofreader.onrender.com)
- **Supported Browsers**: Chrome, Edge, Safari, Firefox (No installation required)

---

## 🔒 2. Team Login Passcode

When you first open the link, enter the team passcode:

```text
stark2026
```

> **Note**: Your browser remembers your session, so you won't need to re-enter the passcode every time.

---

## 🔑 3. Google Gemini API Key

The application uses Google Gemini AI for intelligent grammar, spelling, and phrasing checks.

### Option A: The server already has an API key
If the top bar displays **`● Gemini Ready`** in green, you are good to go! No further setup is required.

### Option B: Providing your own free API key (takes 30 seconds)
If the badge says **`Need API Key`**:
1. Open [Google AI Studio](https://aistudio.google.com/app/apikey) in your browser.
2. Sign in with your Google account and click **Create API Key** (it is 100% free).
3. Copy the key (starts with `AIzaSy...`).
4. In Stark Proofreader, click **🔑 Gemini AI Key** on the left sidebar.
5. Paste your key and click **Test & Save**.

---

## 🚀 4. How to Proofread (Step-by-Step)

### Step 1: Upload or Paste
In the **Left Panel**:
- **Option 1 (Word Document)**: Drag & drop any `.docx` file into the box or click **"Choose a Word document"**.
- **Option 2 (Direct Text)**: Type or paste paragraphs directly into the text box.
- *Quick Test*: You can also click **"Try Sample Report"** at the top right to test a ready-made document.

### Step 2: Choose Your Settings (Top Toolbar)
- **Language**: Choose `English (US)`, `English (UK)`, `English (Canada)`, or `English (Australia)`.
- **Mode**:
  - `Light`: Catches only obvious typos and misspellings (no phrasing changes).
  - `Standard` *(Recommended)*: Automatically fixes obvious typos & evident errors; highlights grammar and punctuation issues for your review.
  - `Intensive`: Deep executive polish for flow, tone, and readability.
  - `Concise`: Eliminates wordiness and tightens sentences for direct executive reading.
- **Document Type**: Select `General & Business`, `Academic & Research`, `Technical & Strict`, or `Executive`.

### Step 3: Run the Proofreader
- Click the **`Proofread Document`** button at the bottom of the left pane.
- Gemini AI will scan your document in just a few seconds.

---

## 🧐 5. Reviewing Suggestions (Dual-Pane View)

Once analyzed, the screen switches to the interactive dual-pane review mode:

### In the Left Panel (Document Preview):
- Your document is shown with its original headings and paragraphs.
- Errors are underlined with subtle wavy lines:
  - **Red line**: Spelling & typos
  - **Blue line**: Grammar
  - **Amber line**: Spacing & punctuation
  - **Purple line**: Clarity & style
- **Click any underline** to open the instant in-context correction box right on top of the text!

### In the Right Panel (Suggestions List):
- **Filter Tabs**: Click `Needs Review`, `Auto-Corrected`, `Spelling`, `Grammar`, etc., to filter suggestions.
- **Each Suggestion Card shows**:
  - The original text with ~~strikethrough~~.
  - The suggested replacement in crisp blue text.
  - An explanation of why the change is recommended.
  - Quick buttons:
    - **`✓ Accept`**: Applies the suggestion.
    - **`✗ Reject`**: Discards the suggestion and keeps your original text.
    - **`Edit`**: Lets you customize the replacement text.
- **Auto-Synced Changes**: If a typo appears multiple times across your document (e.g. `🔁 3x`), accepting it updates all instances across the entire file automatically!

---

## 📥 6. Downloading Your Clean Document

1. When you are happy with the review, click the **`Download Clean Document`** button in the top toolbar.
2. Your new `.docx` file will be generated and downloaded with all your approved changes applied, while keeping 100% of your original fonts, bold/italics, tables, and formatting intact!

---

## ⌨️ 7. Keyboard Shortcuts (For Fast Review)

| Key | Action |
| :--- | :--- |
| **`Right Arrow`** / **`Down Arrow`** | Jump to **Next** suggestion |
| **`Left Arrow`** / **`Up Arrow`** | Jump to **Previous** suggestion |
| **`A`** | **Accept** current suggestion & advance |
| **`R`** or **`X`** | **Reject** current suggestion & advance |
| **`Esc`** | Close popup box |

---

## 💡 Quick Tips for the Team
- **Clear & New Document**: Click the trash icon (`🧹`) at the bottom of the left pane anytime to clear the workspace and start a new document.
- **Theme Toggle**: Click **Toggle Theme** at the bottom of the sidebar to switch between Clean Light Mode and Dark Mode.
- **Privacy & Security**: Documents are processed in-memory for proofreading and are never shared or stored permanently.

---

## 📊 8. Missing Item Info Generator (Stark Operations)

The unified **Stark Suite** includes the **Missing Item Info Generator** for operations and vendor management.

### How to Access:
Click **`Missing Item Info`** in the left sidebar navigation.

### Confidentiality Guarantee:
- **🔒 Zero-Trace Ephemeral Processing**: Uploaded reports and generated vendor workbooks are stored in temporary memory and **auto-purged immediately upon download** (or after 15 minutes TTL). No sensitive item or vendor data is retained on the server.
- **🛡️ Server-Side Credentials**: Stark Premium portal login credentials are encrypted on the server. Team members **never** need to see, enter, or share login passwords.

### Two Ways to Generate Vendor Files:

#### Option A: Automated Portal Fetch
1. In the **Automated Portal Fetch** tab, select or type the exact **Brand Name** (e.g., `Marc Jacobs`, `Michael Kors`, `Coach`).
2. Click **Generate Vendor Send File**.
3. Watch the live step-by-step progress as the server logs in, navigates to `MissingItemDataReport.aspx`, unchecks inventory/image constraints, downloads the export, and formats the vendor file.
4. Click **Download Vendor Excel (.xlsx)**.

#### Option B: Direct Raw Excel Upload (Fastest & 100% Reliable)
If you already downloaded `MissingItemDataReport.xlsx` from Stark Premium:
1. Switch to the **Direct Excel Upload** tab.
2. (Optional) Enter the brand name.
3. Drag & drop the `.xlsx` file into the box.
4. Click **Clean & Format Vendor Workbook**.
5. Within **1 second**, view the live data preview and statistics, and download your standardized vendor file!

### Vendor Standards Enforced Automatically:
- ✅ **Model#/SKU** and **Title/Item Name** are kept intact.
- ✅ Internal database columns (`systemid`, `stockqty`, `expectedinventorydate`, etc.) are stripped.
- ✅ **UPC** is positioned in **Column D** (with Long Description in Column C).
- ✅ Item dimensions are expanded to 4 separate columns (`HEIGHT`, `LENGTH`, `WIDTH`, `WEIGHT`).
- ✅ Missing fields are left **blank** for the brand to fill; non-missing fields are marked **`N/A`**.
- ✅ Rows with zero missing fields are automatically dropped.
- ✅ Formatted with Stark Executive styling (Arial 10pt bold white on black header, frozen top row, calibrated column widths).

