"""
PyInstaller runtime hook to fix backend module imports.
Adds the src directory to sys.path so that 'from src.backend...' works.
"""
import sys
import os

if getattr(sys, 'frozen', False):
    bundle_dir = sys._MEIPASS
    src_dir = os.path.join(bundle_dir, 'src')
    if src_dir not in sys.path:
        sys.path.insert(0, src_dir)
    if bundle_dir not in sys.path:
        sys.path.insert(0, bundle_dir)
