"""SQLAlchemy engine, session factory, and Base for all ORM models."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite only
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


def get_db():
    """FastAPI dependency that yields a DB session and closes it on exit."""
    db = Session(engine)
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables if they do not exist yet.

    Called once at application startup.  Does NOT drop existing tables.
    """
    # Import models here so their tables are registered on Base.metadata
    import app.models  # noqa: F401  – side-effect import

    Base.metadata.create_all(bind=engine)
