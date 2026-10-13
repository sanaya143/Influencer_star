import os

# Tests never touch the real database (data/zylo.db) and run without a model unless a test opts in.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("LLM_MODE", "offline")
# Most tests use only Zylo's own creators; the outside MCP provider (a subprocess) is switched on per test where needed.
os.environ.setdefault("ZYLO_EXTERNAL_MCP", "off")
# Rate limits are tested on their own (test_security.py); everywhere else they would only slow the suite down.
os.environ.setdefault("ZYLO_RATE_LIMITS", "off")
