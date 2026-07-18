import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relpath):
    """Import relpath (e.g. "fog/app.py") as a fresh top-level module
    registered under `name`, with its own directory temporarily on
    sys.path so its bare `from aggregation import aggregate`-style
    same-directory imports resolve. Restores sys.path/sys.modules
    afterwards so unrelated test files don't leak each other's same-named
    modules (fog/app.py and backend/dashboard/app.py are both literally
    named "app").
    """
    target = ROOT / relpath
    directory = str(target.parent)
    stem = target.stem

    saved_path = list(sys.path)
    saved_module = sys.modules.pop(stem, None)
    sys.path.insert(0, directory)
    try:
        module = importlib.import_module(stem)
    finally:
        sys.path[:] = saved_path
        sys.modules.pop(stem, None)
        if saved_module is not None:
            sys.modules[stem] = saved_module

    sys.modules[name] = module
    return module
