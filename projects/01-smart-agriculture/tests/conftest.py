import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "fog"))
sys.path.insert(0, str(ROOT / "backend" / "processor"))
sys.path.insert(0, str(ROOT / "sensors"))


def load_module(name, relpath):
    spec = importlib.util.spec_from_file_location(name, ROOT / relpath)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module
