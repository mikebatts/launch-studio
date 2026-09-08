"""Host-only masked setup. The value is intentionally shared with demo visitors."""
import getpass
import json
import os
from pathlib import Path
import sys
import tempfile

if not sys.stdin.isatty():
    raise SystemExit("Run this setup directly in a local terminal. Piped input is not accepted.")
value = getpass.getpass("Case-study password to share with demo visitors (hidden): ")
if not value or len(value) > 256:
    raise SystemExit("No change made. Enter between 1 and 256 characters.")
root = Path(__file__).resolve().parents[1]
directory = root / "data"
directory.mkdir(exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".portfolio-access-", dir=directory)
with os.fdopen(fd, "w") as output:
    json.dump({"password": value}, output)
os.replace(temporary, directory / "portfolio-access.json")
print("Portfolio access configured. Reopen About this build; no server restart needed.")
