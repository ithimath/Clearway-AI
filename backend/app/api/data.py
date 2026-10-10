"""Data management API router — CSV upload, preview, quality report."""

from __future__ import annotations

import io
import json
import os
import shutil
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.datasets import DatasetMeta
from app.models.events import SystemEvent

DATA_RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "raw")
DATA_PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "processed")

router = APIRouter(prefix="/api/data", tags=["data"])


@router.post("/preview")
async def preview_csv(file: UploadFile = File(...)) -> dict:
    """Return first 10 rows and detected columns without saving."""
    import pandas as pd
    content = await file.read()
    try:
        df = pd.read_csv(io.BytesIO(content), nrows=10)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {exc}") from exc

    return {
        "filename": file.filename,
        "columns": list(df.columns),
        "row_count_preview": len(df),
        "preview": df.fillna("").to_dict(orient="records"),
    }


@router.post("/import")
async def import_csv(
    file: UploadFile = File(...),
    dataset_type: str = Form(...),
    column_mapping: str = Form("{}"),
    db: Session = Depends(get_db),
) -> dict:
    """Save uploaded CSV and run ingestion pipeline."""
    from app.ingestion.cleaner import clean_dataset

    os.makedirs(DATA_RAW_DIR, exist_ok=True)
    os.makedirs(DATA_PROCESSED_DIR, exist_ok=True)

    content = await file.read()
    safe_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    raw_path = os.path.join(DATA_RAW_DIR, safe_name)
    with open(raw_path, "wb") as f:
        f.write(content)

    mapping = json.loads(column_mapping)
    report = clean_dataset(raw_path, dataset_type, mapping, DATA_PROCESSED_DIR)

    meta = DatasetMeta(
        dataset_type=dataset_type,
        original_filename=file.filename or "",
        stored_path=raw_path,
        row_count=report["row_count"],
        accepted_rows=report["accepted_rows"],
        rejected_rows=report["rejected_rows"],
        quality_report_json=json.dumps(report),
        column_mapping_json=json.dumps(mapping),
        status="imported",
    )
    db.add(meta)
    ev = SystemEvent(
        category="data",
        level="info",
        message=f"Dataset '{file.filename}' imported: {report['accepted_rows']} accepted, "
                f"{report['rejected_rows']} rejected.",
    )
    db.add(ev)
    db.commit()
    db.refresh(meta)

    return {"dataset_id": meta.id, "report": report}


@router.get("/quality/{dataset_id}")
def get_quality_report(dataset_id: int, db: Session = Depends(get_db)) -> dict:
    meta = db.query(DatasetMeta).filter(DatasetMeta.id == dataset_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {
        "id": meta.id,
        "filename": meta.original_filename,
        "dataset_type": meta.dataset_type,
        "quality_report": json.loads(meta.quality_report_json),
        "imported_at": meta.imported_at.isoformat(),
    }
