from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database import Base

class Lead(Base):
    """
    Flat leads table with no foreign keys.
    """
    __tablename__ = "leads"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    name            = Column(String(255))
    title           = Column(String(255))
    company_name    = Column(String(255))
    about_company   = Column(Text)
    email           = Column(String(255), index=True)
    phone           = Column(String(255))
    linkedin_url    = Column(String(500))
    
    industry        = Column(Text)
    country         = Column(String(255))
    state           = Column(String(255))
    city            = Column(String(255))
    company_size    = Column(String(255))
    
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
