"""Tax document extraction API — streams Claude Vision analysis as SSE."""

import asyncio
import base64
import json
import re
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from anthropic import AsyncAnthropic

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="Tax Extraction API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncAnthropic()

ALLOWED_MIME = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}

SYSTEM_PROMPT = """\
You are a tax document analyst with a sharp eye and a warm personality. The user \
has uploaded a tax document (W-2, 1099-NEC, 1099-INT, 1099-DIV, or similar). Your \
job is twofold:

1. **Narrate your analysis** in a conversational, engaging way. Talk through what \
you see — the employer name, the numbers, anything interesting or unusual. Be \
specific. Use 3-6 short paragraphs. Make it feel like a knowledgeable friend is \
looking over the document with them.

2. **Extract structured data** into a JSON object wrapped in <extracted_data> tags. \
This MUST come at the very end of your response.

For W-2 documents, extract:
```json
{
  "doc_type": "W-2",
  "employer_name": "...",
  "employer_ein": "...",
  "employee_name": "...",
  "employee_ssn_last4": "...",
  "wages": 0.00,
  "fed_income_tax_withheld": 0.00,
  "social_security_wages": 0.00,
  "social_security_tax_withheld": 0.00,
  "medicare_wages": 0.00,
  "medicare_tax_withheld": 0.00,
  "state": "CA",
  "state_wages": 0.00,
  "state_income_tax_withheld": 0.00,
  "box12_codes": [{"code": "D", "amount": 0.00}],
  "confidence": 0.95
}
```

For 1099-NEC documents:
```json
{
  "doc_type": "1099-NEC",
  "payer_name": "...",
  "payer_tin": "...",
  "recipient_name": "...",
  "recipient_ssn_last4": "...",
  "nonemployee_compensation": 0.00,
  "fed_income_tax_withheld": 0.00,
  "state": "CA",
  "state_income": 0.00,
  "state_tax_withheld": 0.00,
  "confidence": 0.95
}
```

For 1099-INT documents:
```json
{
  "doc_type": "1099-INT",
  "payer_name": "...",
  "interest_income": 0.00,
  "fed_income_tax_withheld": 0.00,
  "confidence": 0.95
}
```

For 1099-DIV documents:
```json
{
  "doc_type": "1099-DIV",
  "payer_name": "...",
  "ordinary_dividends": 0.00,
  "qualified_dividends": 0.00,
  "fed_income_tax_withheld": 0.00,
  "confidence": 0.95
}
```

Set confidence between 0.0 and 1.0 based on how clearly you can read each value. \
If a field is unreadable, use null. Wrap the JSON in <extracted_data>...</extracted_data> tags.

IMPORTANT: Write your narration FIRST (multiple paragraphs), THEN the <extracted_data> block at the very end. \
Do not put any text after the closing </extracted_data> tag."""


@app.post("/extract")
async def extract(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")

    b64 = base64.standard_b64encode(data).decode()

    # Build content block based on file type
    if file.content_type == "application/pdf":
        file_block = {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": b64},
        }
    else:
        file_block = {
            "type": "image",
            "source": {"type": "base64", "media_type": file.content_type, "data": b64},
        }

    async def stream_sse():
        narrative_buffer = ""
        full_text = ""

        try:
            async with client.messages.stream(
                model="claude-sonnet-4-6-20250819",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            file_block,
                            {"type": "text", "text": "Please analyze this tax document."},
                        ],
                    }
                ],
            ) as stream:
                async for text in stream.text_stream:
                    full_text += text
                    narrative_buffer += text

                    # Emit log events on paragraph boundaries
                    while "\n\n" in narrative_buffer:
                        paragraph, narrative_buffer = narrative_buffer.split("\n\n", 1)
                        paragraph = paragraph.strip()
                        if paragraph and not paragraph.startswith("<extracted_data"):
                            yield f"event: log\ndata: {json.dumps({'text': paragraph})}\n\n"
                            await asyncio.sleep(0.05)

            # Emit any remaining narrative (before extracted_data tag)
            remaining = narrative_buffer.strip()
            if remaining:
                # Split out the extracted_data portion
                if "<extracted_data>" in remaining:
                    before_tag = remaining.split("<extracted_data>")[0].strip()
                    if before_tag:
                        yield f"event: log\ndata: {json.dumps({'text': before_tag})}\n\n"
                else:
                    yield f"event: log\ndata: {json.dumps({'text': remaining})}\n\n"

            # Parse extracted data from the full response
            match = re.search(
                r"<extracted_data>\s*(.*?)\s*</extracted_data>", full_text, re.DOTALL
            )
            if match:
                try:
                    extracted = json.loads(match.group(1))
                    yield f"event: data\ndata: {json.dumps(extracted)}\n\n"
                except json.JSONDecodeError:
                    # Try to fix common JSON issues (trailing commas, etc.)
                    raw = match.group(1).strip()
                    raw = re.sub(r",\s*([}\]])", r"\1", raw)
                    try:
                        extracted = json.loads(raw)
                        yield f"event: data\ndata: {json.dumps(extracted)}\n\n"
                    except json.JSONDecodeError as e:
                        yield f"event: error\ndata: {json.dumps({'error': f'Failed to parse extracted data: {e}'})}\n\n"
            else:
                yield f"event: error\ndata: {json.dumps({'error': 'No extracted data found in response'})}\n\n"

            yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"

        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        stream_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok", "service": "tax-extraction"}
