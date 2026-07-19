import os
import sys

ROOT = os.path.dirname(os.path.dirname(__file__))
for sub in ("sensors", "fog", "backend/processor", "backend/dashboard"):
    candidate = os.path.join(ROOT, sub)
    if candidate not in sys.path:
        sys.path.insert(0, candidate)
