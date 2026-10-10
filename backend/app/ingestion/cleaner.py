"""CSV ingestion and data cleaning pipeline."""

from __future__ import annotations

import os
from typing import Any

import pandas as pd


def clean_dataset(
    raw_path: str,
    dataset_type: str,
    column_mapping: dict[str, str],
    output_dir: str,
) -> dict[str, Any]:
    """Clean an uploaded CSV and write the processed version.

    Args:
        raw_path:       Absolute path to the original CSV.
        dataset_type:   'timetable' | 'delays' | 'custom'.
        column_mapping: Maps canonical names → actual CSV column names.
        output_dir:     Directory to write cleaned CSV.

    Returns:
        Quality report dict.
    """
    try:
        df = pd.read_csv(raw_path)
    except Exception as exc:
        return {
            "row_count": 0,
            "accepted_rows": 0,
            "rejected_rows": 0,
            "errors": [f"Could not read CSV: {exc}"],
            "warnings": [],
            "rejected_details": [],
        }

    row_count = len(df)
    errors: list[str] = []
    warnings: list[str] = []
    rejected: list[dict] = []

    # Apply column mapping (rename columns per mapping)
    if column_mapping:
        rename = {v: k for k, v in column_mapping.items() if v in df.columns}
        df = df.rename(columns=rename)

    # Check for duplicates
    dup_mask = df.duplicated()
    dup_count = int(dup_mask.sum())
    if dup_count:
        warnings.append(f"{dup_count} duplicate rows found and removed.")
        df = df[~dup_mask]

    # Check for missing values in required columns per type
    required = _required_columns(dataset_type)
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        errors.append(f"Missing required columns: {missing_cols}. Check column mapping.")

    # Row-level validation
    valid_mask = pd.Series([True] * len(df), index=df.index)
    for idx, row in df.iterrows():
        row_errors = _validate_row(row, dataset_type, required)
        if row_errors:
            valid_mask[idx] = False
            rejected.append({"row": int(idx) + 2, "reasons": row_errors})  # +2 for header

    df_clean = df[valid_mask].copy()
    accepted = len(df_clean)
    rejected_count = len(df) - accepted

    if missing_cols:
        accepted = 0
        rejected_count = len(df)
    else:
        # Write cleaned file
        os.makedirs(output_dir, exist_ok=True)
        base = os.path.basename(raw_path)
        out_path = os.path.join(output_dir, f"clean_{base}")
        df_clean.to_csv(out_path, index=False)

    return {
        "row_count": row_count,
        "accepted_rows": accepted,
        "rejected_rows": rejected_count,
        "errors": errors,
        "warnings": warnings,
        "rejected_details": rejected[:50],  # cap for response size
        "provenance": "SOURCE",
    }


def _required_columns(dataset_type: str) -> list[str]:
    if dataset_type == "timetable":
        return ["train_number", "station_code", "stop_sequence"]
    if dataset_type == "delays":
        return ["train_number", "station_code"]
    return []


def _validate_row(row: pd.Series, dataset_type: str, required: list[str]) -> list[str]:
    errs = []
    for col in required:
        if col in row and (pd.isna(row[col]) or str(row[col]).strip() == ""):
            errs.append(f"Missing value in column '{col}'")
    if dataset_type == "timetable":
        for time_col in ["planned_arrival_min", "planned_departure_min"]:
            if time_col in row and not pd.isna(row[time_col]):
                try:
                    val = float(row[time_col])
                    if val < 0 or val > 2880:
                        errs.append(f"Invalid time value in '{time_col}': {val}")
                except (TypeError, ValueError):
                    errs.append(f"Non-numeric value in '{time_col}': {row[time_col]}")
    return errs
