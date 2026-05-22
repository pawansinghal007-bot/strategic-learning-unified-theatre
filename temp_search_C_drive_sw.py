import os
from pathlib import Path
root = Path(r'C:\SW Development')
exts = {'.js','.jsx','.ts','.tsx','.json','.md','.ps1','.txt','.html','.py','.cjs','.mjs'}
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in {'.git','node_modules'}]
    for fname in filenames:
        if Path(fname).suffix.lower() not in exts: continue
        path = Path(dirpath) / fname
        try:
            text = path.read_text(encoding='utf-8')
        except Exception:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if 'vscode-rotator' in line:
                print(f'{path}:{lineno}:{line.strip()}')
