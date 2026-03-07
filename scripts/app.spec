# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for TripleZ
Builds a standalone executable with embedded Next.js frontend.

Run from project root:  pyinstaller scripts/app.spec
"""

import os
import sys
from PyInstaller.utils.hooks import collect_submodules

scripts_dir = os.path.dirname(os.path.abspath(SPECPATH if 'SPECPATH' in dir() else __file__))
project_root = os.path.abspath(os.path.join(scripts_dir, '..'))

main_path = os.path.join(scripts_dir, 'main.py')
if not os.path.exists(main_path):
    print("ERROR: scripts/main.py not found!")
    sys.exit(1)

# Collect pre-built Next.js frontend (static export in out/)
frontend_out = os.path.join(project_root, 'src', 'frontend', 'out')

frontend_files = []
if os.path.exists(frontend_out):
    for root, dirs, files in os.walk(frontend_out):
        for f in files:
            fp = os.path.join(root, f)
            rel = os.path.relpath(root, project_root)
            frontend_files.append((fp, rel))
    print(f"[OK] Collected {len(frontend_files)} frontend files")
else:
    print("WARNING: Frontend static export not found. Run 'cd src/frontend && npm run build' first.")

# Collect backend modules
backend_modules = collect_submodules('src.backend')

hidden_imports = [
    'src.backend',
    'src.backend.main',
    'src.backend.routers',
    'src.backend.routers.admin',
    'src.backend.routers.auth',
    'src.backend.routers.assignment',
    'src.backend.routers.personnel',
    'src.backend.routers.rooms',
    'src.backend.routers.settings',
    'src.backend.services',
    'src.backend.store',
    'fastapi',
    'uvicorn',
    'pydantic',
    'pandas',
    'starlette',
    'json',
    'threading',
    'webbrowser',
    'time',
]
hidden_imports.extend(backend_modules)

print(f"[OK] Added {len(hidden_imports)} hidden imports")

runtime_hook_path = os.path.join(scripts_dir, 'pyi_rth_backend.py')
if not os.path.exists(runtime_hook_path):
    print(f"ERROR: Runtime hook not found: {runtime_hook_path}")
    sys.exit(1)

a = Analysis(
    [main_path],
    pathex=[project_root],
    binaries=[],
    datas=frontend_files,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[runtime_hook_path],
    excludes=['matplotlib', 'tkinter', 'PyQt5', 'pytest'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

is_windows = sys.platform == 'win32'
is_macos = sys.platform == 'darwin'

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TripleZ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

print("\n" + "=" * 60)
print("PyInstaller spec configured for TripleZ")
if is_macos:
    print("Run: pyinstaller scripts/app.spec && python3 scripts/create_app_bundle.py")
elif is_windows:
    print("Run: pyinstaller scripts/app.spec")
    print("Output: dist/TripleZ.exe")
print("=" * 60 + "\n")
