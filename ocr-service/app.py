from __future__ import annotations

import time
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from paddleocr import PaddleOCR

app = FastAPI(title="paddle-ocr-service")

_ocr: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        _ocr = PaddleOCR(use_angle_cls=True, lang="japan", show_log=False)
    return _ocr


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)) -> JSONResponse:
    started = time.time()

    if not file.filename:
        raise HTTPException(status_code=400, detail="filename is missing")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")

    np_arr = np.frombuffer(raw, np.uint8)
    image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="failed to decode image")

    ocr = get_ocr()
    result: Any = ocr.ocr(image, cls=True)

    lines: list[str] = []
    if isinstance(result, list) and result:
        # PaddleOCR returns nested list: [ [ [box, (text, score)], ... ] ]
        first_page = result[0] if isinstance(result[0], list) else []
        for item in first_page:
            if not isinstance(item, list) or len(item) < 2:
                continue
            text_info = item[1]
            if isinstance(text_info, tuple) and len(text_info) >= 1:
                text = str(text_info[0]).strip()
                if text:
                    lines.append(text)

    full_text = "\n".join(lines)
    elapsed_ms = int((time.time() - started) * 1000)

    return JSONResponse(
        {
            "ok": True,
            "lines": lines,
            "fullText": full_text,
            "elapsedMs": elapsed_ms,
        }
    )
