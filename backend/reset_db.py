import sys
import os

# add backend dir to sys.path so we can import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine
import models

# Drop all existing tables (leads, industries, etc if they exist)
models.Base.metadata.drop_all(bind=engine)

# Recreate the flat leads table
models.Base.metadata.create_all(bind=engine)

print("Tables successfully dropped and recreated as flat structure.")
