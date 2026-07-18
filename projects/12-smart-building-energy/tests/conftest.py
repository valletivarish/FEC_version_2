import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relpath):
    """Import relpath as a fresh top-level module under `name`, with its directory temporarily on sys.path so bare same-directory imports resolve, restoring sys.path/sys.modules afterwards so same-named modules don't leak between tests."""
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
