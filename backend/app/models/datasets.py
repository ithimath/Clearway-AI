"""ORM model for imported dataset metadata."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DatasetMeta(Base):
    """Metadata for an uploaded / imported dataset file."""

    __tablename__ = "dataset_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Type: timetable | delays | custom
    dataset_type: Mapped[str] = mapped_column(String(20), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(200), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    accepted_rows: Mapped[int] = mapped_column(Integer, default=0)
    rejected_rows: Mapped[int] = mapped_column(Integer, default=0)
    # JSON quality report
    quality_report_json: Mapped[str] = mapped_column(Text, default="{}")
    # JSON column mapping applied
    column_mapping_json: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
