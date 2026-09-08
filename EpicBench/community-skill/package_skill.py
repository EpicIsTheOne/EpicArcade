"""Package only the public skill sources; credentials and local artifacts never enter."""
from pathlib import Path
import zipfile

base = Path(__file__).resolve().parent
source = base / 'epic-bench-community'
target = base / 'epic-bench-community.zip'
allowed = ['SKILL.md', 'scripts/epic_bench_community.py']
allowed += [str(p.relative_to(source)) for p in (source / 'references').glob('*.md')]
for relative in allowed:
    if not (source / relative).is_file():
        raise SystemExit('Missing public skill source: ' + relative)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in sorted(allowed):
        archive.write(source / relative, 'epic-bench-community/' + relative.replace('\\', '/'))
print('Packaged public skill: ' + str(target))
