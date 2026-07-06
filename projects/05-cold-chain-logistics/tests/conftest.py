import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

for subdir in ("fog", "backend/processor", "sensors"):
    sys.path.insert(0, str(ROOT / subdir))


def load_module(name, relpath):
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
