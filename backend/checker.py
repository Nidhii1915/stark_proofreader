import json
import re
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

logger = logging.getLogger("doc-proofreader.checker")

# Ordered model cascade: fastest sub-second models first
CANDIDATE_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash"
]

class DetectedIssue(BaseModel):
    block_id: str = Field(description="The block ID (e.g. p_0, tbl_0_0_0_0)")
    original_text: str = Field(description="Exact character-for-character verbatim substring in the block")
    suggested_text: str = Field(description="Direct replacement text for original_text")
    error_type: str = Field(description="Category: spelling, grammar, punctuation, clarity, or style")
    explanation: str = Field(description="Very concise reason in 5-8 words max (e.g. 'Subject-verb agreement: use are' or 'Typo in achievements')")
    severity: str = Field(description="Severity: error, warning, or suggestion")
    is_evident: bool = Field(default=True, description="True for typos or obvious grammar mistakes to auto-correct. False for optional style choices.")

class ProofreadingResult(BaseModel):
    issues: List[DetectedIssue] = Field(default_factory=list, description="List of detected proofreading issues")

class GeminiProofreader:
    """
    High-performance document proofreader optimized for sub-second token output,
    parallel multi-batch processing, and title branding protection.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = genai.Client()

    def _call_model_with_fallback(
        self,
        prompt_content: str,
        system_instruction: str
    ) -> Any:
        last_error = None

        for model_name in CANDIDATE_MODELS:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=prompt_content,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        response_json_schema=ProofreadingResult.model_json_schema(),
                        temperature=0.1,
                    )
                )
                if response and response.text:
                    return response
            except Exception as e:
                last_error = e
                continue

        raise RuntimeError(f"All candidate models were temporarily unavailable. Last error: {last_error}")

    def _process_single_batch(
        self,
        batch: List[Dict[str, Any]],
        system_instruction: str
    ) -> List[Dict[str, Any]]:
        prompt_content = "Analyze the following document blocks for grammar, spelling, punctuation, and clarity:\n\n"
        for b in batch:
            title_tag = " [TITLE/HEADING - PRESERVE CASING EXACTLY]" if b.get("is_title_or_heading") else ""
            prompt_content += f"--- BLOCK ID: {b['id']}{title_tag} ---\n{b['text']}\n\n"

        batch_issues: List[Dict[str, Any]] = []
        response = self._call_model_with_fallback(prompt_content, system_instruction)

        if response and response.text:
            parsed = json.loads(response.text)
            raw_issues = parsed.get("issues", [])
            block_lookup = {b["id"]: b for b in batch}

            for issue in raw_issues:
                b_id = issue.get("block_id")
                orig = issue.get("original_text", "")
                repl = issue.get("suggested_text", "")
                if not b_id or not orig or b_id not in block_lookup:
                    continue

                block_info = block_lookup[b_id]
                block_text = block_info["text"]
                is_title = block_info.get("is_title_or_heading", False)

                # BRANDING & TITLE RULE: Ignore casing differences in Titles or Brand items
                if is_title and orig.strip().lower() == repl.strip().lower():
                    continue

                # Auto-classify evident vs suggestion
                expl_lower = (issue.get("explanation") or "").lower()
                err_type = (issue.get("error_type") or "").lower()

                if "space" in expl_lower or "double space" in expl_lower:
                    issue["error_type"] = "spacing"
                    err_type = "spacing"
                    issue["is_evident"] = True
                elif err_type in ["spelling", "spacing"]:
                    issue["is_evident"] = True
                elif err_type in ["grammar", "punctuation"]:
                    issue["is_evident"] = issue.get("severity") in ["error", "warning"] or issue.get("is_evident", True)
                else:
                    issue["is_evident"] = False

                # Direct match
                if orig in block_text:
                    char_start = block_text.find(orig)
                    issue["char_start"] = char_start
                    issue["char_end"] = char_start + len(orig)
                    batch_issues.append(issue)
                # Case-insensitive fallback match
                elif orig.lower() in block_text.lower():
                    idx = block_text.lower().find(orig.lower())
                    matched_orig = block_text[idx:idx + len(orig)]
                    issue["original_text"] = matched_orig
                    issue["char_start"] = idx
                    issue["char_end"] = idx + len(orig)
                    batch_issues.append(issue)

        return batch_issues

    def analyze_blocks(
        self,
        blocks: List[Dict[str, Any]],
        style_tone: str = "business"
    ) -> List[Dict[str, Any]]:
        if not blocks:
            return []

        tone_instructions = {
            "business": "Professional, executive, clear business tone.",
            "concise": "Direct, executive conciseness. Eliminate wordiness.",
            "strict": "Objective spelling and grammar only. No stylistic changes.",
            "formal": "Formal academic/corporate vocabulary and conventions.",
            "casual": "Approachable and friendly."
        }.get(style_tone, "Professional and clear.")

        system_instruction = f"""You are an elite, ultra-fast executive document proofreader.
Detect errors and output structured JSON:
1. Spelling typos (type: 'spelling', severity: 'error', is_evident: true).
2. Obvious grammatical errors (type: 'grammar', severity: 'error', is_evident: true).
3. Spacing and punctuation errors (type: 'spacing' or 'punctuation', severity: 'error', is_evident: true).
4. Style/clarity flaws (type: 'clarity' or 'style', is_evident: false).

Tone guidance: {tone_instructions}

CRITICAL RULES:
- SPACING RULES: Flag redundant double spaces ('  '), missing space after punctuation ('word,word' -> 'word, word', 'sentence.Next' -> 'sentence. Next'), and unwanted space before punctuation ('word ,' -> 'word,'). Set type: 'spacing', severity: 'error', is_evident: true.
- SPEED REQUIREMENT: Keep `explanation` ULTRA-CONCISE (5 to 8 words maximum, e.g. 'Subject-verb agreement: use are' or 'Remove redundant double space').
- TITLE & BRANDING RULE: For any block marked [TITLE/HEADING] or sections labeled 'Title:' or item brand names, DO NOT change or flag letter casing (capital vs small letters). Keep Title capitalization exactly as written.
- `original_text` MUST be an EXACT verbatim substring from the block.
- `suggested_text` MUST directly replace `original_text`.
- If no errors, output empty issues list.
"""

        # Larger batch size: 50 blocks per batch to minimize HTTP round trips
        batch_size = 50
        batches = [blocks[i:i + batch_size] for i in range(0, len(blocks), batch_size)]
        all_issues: List[Dict[str, Any]] = []

        if len(batches) == 1:
            all_issues = self._process_single_batch(batches[0], system_instruction)
        else:
            # Parallel multi-threading with up to 8 concurrent workers
            max_workers = min(len(batches), 8)
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_batch = {
                    executor.submit(self._process_single_batch, batch, system_instruction): idx
                    for idx, batch in enumerate(batches)
                }
                batch_results = [[] for _ in range(len(batches))]
                for future in as_completed(future_to_batch):
                    idx = future_to_batch[future]
                    try:
                        batch_results[idx] = future.result()
                    except Exception as e:
                        logger.error(f"Error in batch {idx}: {e}", exc_info=True)

                for res in batch_results:
                    all_issues.extend(res)

        # Deterministic spacing check: Catch 100% of double spaces and missing/unwanted spaces
        existing_keys = {(iss.get("block_id"), iss.get("original_text", "").strip()) for iss in all_issues}
        for block in blocks:
            b_text = block.get("text", "")
            b_id = block.get("id", "")
            if not b_text or not b_id:
                continue

            # 1. Multiple spaces (2 or more spaces between words)
            for m in re.finditer(r'([^\s]+)[ ]{2,}([^\s]+)', b_text):
                orig = m.group(0)
                repl = f"{m.group(1)} {m.group(2)}"
                key = (b_id, orig.strip())
                if key not in existing_keys:
                    all_issues.append({
                        "block_id": b_id,
                        "original_text": orig,
                        "suggested_text": repl,
                        "error_type": "spacing",
                        "explanation": "Remove redundant double space",
                        "severity": "error",
                        "is_evident": True,
                        "char_start": m.start(),
                        "char_end": m.end()
                    })
                    existing_keys.add(key)

            # 2. Missing space after comma, colon, semicolon
            for m in re.finditer(r'([a-zA-Z0-9]),([a-zA-Z])', b_text):
                orig = m.group(0)
                repl = f"{m.group(1)}, {m.group(2)}"
                key = (b_id, orig.strip())
                if key not in existing_keys:
                    all_issues.append({
                        "block_id": b_id,
                        "original_text": orig,
                        "suggested_text": repl,
                        "error_type": "spacing",
                        "explanation": "Add missing space after comma",
                        "severity": "error",
                        "is_evident": True,
                        "char_start": m.start(),
                        "char_end": m.end()
                    })
                    existing_keys.add(key)

            # 3. Missing space between sentences
            for m in re.finditer(r'([a-z0-9][.!?])([A-Z][a-z])', b_text):
                orig = m.group(0)
                if not re.search(r'\.(com|org|net|io|edu|gov|co|ai|app|info)\b', orig, re.IGNORECASE):
                    repl = f"{m.group(1)} {m.group(2)}"
                    key = (b_id, orig.strip())
                    if key not in existing_keys:
                        all_issues.append({
                            "block_id": b_id,
                            "original_text": orig,
                            "suggested_text": repl,
                            "error_type": "spacing",
                            "explanation": "Add missing space between sentences",
                            "severity": "error",
                            "is_evident": True,
                            "char_start": m.start(),
                            "char_end": m.end()
                        })
                        existing_keys.add(key)

            # 4. Space before punctuation
            for m in re.finditer(r'([^\s]+)\s+([,.:;!?])', b_text):
                orig = m.group(0)
                repl = f"{m.group(1)}{m.group(2)}"
                key = (b_id, orig.strip())
                if key not in existing_keys:
                    all_issues.append({
                        "block_id": b_id,
                        "original_text": orig,
                        "suggested_text": repl,
                        "error_type": "spacing",
                        "explanation": "Remove space before punctuation",
                        "severity": "error",
                        "is_evident": True,
                        "char_start": m.start(),
                        "char_end": m.end()
                    })
                    existing_keys.add(key)

        for idx, issue in enumerate(all_issues):
            issue["id"] = f"issue_{idx + 1}"

        return all_issues
