"""PyInstaller build script for ifc-tool.

Produces a single-file executable with target-triple naming
for Tauri sidecar compatibility.

Usage:
    python build.py
    → dist/ifc-tool-x86_64-pc-windows-msvc.exe
"""

from __future__ import annotations

import platform
import shutil
import subprocess
import sys
from pathlib import Path

# Target triple mapping
_TARGET_TRIPLES: dict[tuple[str, str], str] = {
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Windows", "x86"): "i686-pc-windows-msvc",
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
    ("Linux", "aarch64"): "aarch64-unknown-linux-gnu",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Darwin", "arm64"): "aarch64-apple-darwin",
}

# Hidden imports that PyInstaller can't detect automatically
_HIDDEN_IMPORTS: list[str] = [
    "ifcopenshell.geom",
    "ifcopenshell.util.element",
    "ifcopenshell.util.unit",
    "ifcopenshell.util.placement",
    "numpy",
    "pydantic",
]

# Tauri sidecar destination
_TAURI_BINARIES_DIR = Path(__file__).parent.parent.parent / "src-tauri" / "binaries"


def get_target_triple() -> str:
    """Detect the current platform's target triple."""
    system = platform.system()
    machine = platform.machine()
    key = (system, machine)
    triple = _TARGET_TRIPLES.get(key)
    if triple is None:
        print(f"WARNING: Unknown platform {system}/{machine}, using generic name")
        return f"{machine}-{system.lower()}"
    return triple


def build() -> Path:
    """Run PyInstaller and return the path to the built executable."""
    target_triple = get_target_triple()
    exe_name = f"ifc-tool-{target_triple}"

    print(f"Building ifc-tool for {target_triple}...")

    hidden_import_args: list[str] = []
    for imp in _HIDDEN_IMPORTS:
        hidden_import_args.extend(["--hidden-import", imp])

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onefile",
        "--name",
        exe_name,
        "--distpath",
        "dist",
        "--workpath",
        "build",
        "--specpath",
        "build",
        "--clean",
        *hidden_import_args,
        "ifc_tool/__main__.py",
    ]

    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=Path(__file__).parent)

    if result.returncode != 0:
        print("ERROR: PyInstaller build failed")
        sys.exit(1)

    # Determine output path
    dist_dir = Path(__file__).parent / "dist"
    suffix = ".exe" if platform.system() == "Windows" else ""
    exe_path = dist_dir / f"{exe_name}{suffix}"

    if not exe_path.exists():
        print(f"ERROR: Expected output not found: {exe_path}")
        sys.exit(1)

    print(f"Built: {exe_path} ({exe_path.stat().st_size / 1024 / 1024:.1f} MB)")

    # Copy to Tauri binaries directory
    _TAURI_BINARIES_DIR.mkdir(parents=True, exist_ok=True)
    dest = _TAURI_BINARIES_DIR / f"{exe_name}{suffix}"
    shutil.copy2(exe_path, dest)
    print(f"Copied to: {dest}")

    return exe_path


if __name__ == "__main__":
    build()
