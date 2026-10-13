import os

# Tests never touch the real database (data/zylo.db) and run without a model unless a test opts in.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("LLM_MODE", "offline")
# Most tests use only Zylo's own creators; the outside MCP provider (a subprocess) is switched on per test where needed.
os.environ.setdefault("ZYLO_EXTERNAL_MCP", "off")
