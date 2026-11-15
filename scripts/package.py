from pathlib import Path
import zipfile
root = Path(__file__).resolve().parents[1]
output = root.parent / 'ddarami-v0.1.0.zip'
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(root.rglob('*')):
        if p.is_file() and not any(x in p.parts for x in ['node_modules', '.git', '__pycache__']):
            z.write(p, Path('ddarami') / p.relative_to(root))
print(output)
