#!/usr/bin/env python3
"""Post-build script to create macOS .app bundle for TripleZ."""

import os
import shutil
import sys


def create_app_bundle():
    dist_dir = os.path.join(os.path.abspath('.'), 'dist')
    exe_path = os.path.join(dist_dir, 'TripleZ')
    app_path = os.path.join(dist_dir, 'TripleZ.app')

    if not os.path.exists(exe_path):
        print(f"ERROR: Executable not found at {exe_path}")
        print("Run 'pyinstaller app.spec' first.")
        sys.exit(1)

    if os.path.exists(app_path):
        shutil.rmtree(app_path)

    os.makedirs(os.path.join(app_path, 'Contents', 'MacOS'), exist_ok=True)
    os.makedirs(os.path.join(app_path, 'Contents', 'Resources'), exist_ok=True)

    shutil.copy2(exe_path, os.path.join(app_path, 'Contents', 'MacOS', 'TripleZ'))
    os.chmod(os.path.join(app_path, 'Contents', 'MacOS', 'TripleZ'), 0o755)

    info_plist = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>he</string>
    <key>CFBundleDisplayName</key>
    <string>TripleZ</string>
    <key>CFBundleExecutable</key>
    <string>TripleZ</string>
    <key>CFBundleIdentifier</key>
    <string>com.triplez.app</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>TripleZ</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.13</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>'''

    with open(os.path.join(app_path, 'Contents', 'Info.plist'), 'w') as f:
        f.write(info_plist)

    print(f"TripleZ.app created at: {app_path}")


if __name__ == "__main__":
    create_app_bundle()
