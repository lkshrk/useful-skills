#!/usr/bin/env python3
"""Read-only public-source drift check; never updates WoW recommendations or credentials."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUNDLE = ROOT / 'skills/wow-spec/assets/season-data/retail/season-mn-2'


def refs(value):
    if isinstance(value, str):
        return {value} if re.fullmatch(r'(item|spell):\d+', value) else set()
    if isinstance(value, dict):
        return set().union(*(refs(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(*(refs(v) for v in value))
    return set()


def targets(bundle=None, documents=None):
    def read(name):
        return documents[name] if documents is not None else json.loads((bundle / name).read_text())
    catalog = read('catalog.json')
    index = read('index.json')
    out = {}

    def add(url, kind, spec=None):
        row = out.setdefault(url, {'kind': kind, 'spec_ids': []})
        if spec is not None and spec not in row['spec_ids']:
            row['spec_ids'].append(spec)

    for entry in index['specs']:
        setup = read(entry['file'])
        for source in setup['sources']:
            url = source['url'] if isinstance(source, dict) else source
            entity = re.search(r'(item|spell)=(\d+)', url)
            if entity and 'wowhead.com' in urlparse(url).netloc:
                add('https://nether.wowhead.com/tooltip/' + '/'.join(entity.groups()), 'tooltip', entry['spec_id'])
            elif '/tooltip/' in url and urlparse(url).netloc == 'nether.wowhead.com':
                add(url, 'tooltip', entry['spec_id'])
            else:
                add(url, 'guide', entry['spec_id'])
        for key in refs(setup):
            if key not in catalog['records']:
                raise ValueError('Unresolved catalogue reference: ' + key)
            add('https://nether.wowhead.com/tooltip/' + key.replace(':', '/'), 'tooltip', entry['spec_id'])
    add(index['roster_source'], 'roster')
    if index.get('season_source'):
        add(index['season_source'], 'seasons')
    for row in out.values():
        row['spec_ids'].sort()
    return dict(sorted(out.items()))


class GuideText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == 'h1':
            self.active = True
        if tag == 'footer':
            self.active = False
        if tag in ['script', 'style', 'noscript']:
            self.skip += 1
        if self.active and not self.skip:
            if tag in ['h1', 'h2', 'h3', 'h4', 'p', 'li', 'tr', 'br']:
                self.parts.append('\n')
            href = dict(attrs).get('href', '')
            entity = re.search(r'(item|spell)=(\d+)', href)
            if tag == 'a' and entity:
                self.parts.append(' [' + ':'.join(entity.groups()) + '] ')

    def handle_endtag(self, tag):
        if tag in ['script', 'style', 'noscript']:
            self.skip = max(0, self.skip - 1)

    def handle_data(self, text):
        if self.active and not self.skip:
            self.parts.append(text)


def fingerprint(kind, raw):
    if kind == 'guide':
        parser = GuideText()
        parser.feed(raw)
        content = ' '.join(''.join(parser.parts).split())
        content = re.sub(r'\(?\b\d+\s*(?:d|w|mo|days?|weeks?|months?|years?)\s+ago\)?', '', content, flags=re.I)
        content = ' '.join(content.split())
        if len(content) < 150 or not re.search(r'stat|consumable|enchant|talent', content, re.I):
            raise ValueError('No usable guide body; access challenge or layout change')
    else:
        data = json.loads(raw)
        if kind == 'tooltip':
            if not data.get('name') or not data.get('tooltip'):
                raise ValueError('Missing tooltip identity/body')
            # Spell links and visible numbers are meaningful; layout/icon changes are not.
            body = re.sub(r'<[^>]+>', ' ', data['tooltip'])
            content = json.dumps({'name': data['name'], 'text': ' '.join(body.split())}, sort_keys=True)
        elif kind == 'roster':
            content = json.dumps(sorted((r['specId'], r['className'], r['specName']) for r in data))
        elif kind == 'seasons':
            seasons = [{'slug': s['slug'], 'starts': s.get('starts'), 'ends': s.get('ends'),
                        'dungeons': sorted(d['slug'] for d in s.get('dungeons', []))}
                       for s in data['seasons'] if s.get('is_main_season')]
            content = json.dumps(sorted(seasons, key=lambda s: s['slug']), sort_keys=True)
        else:
            raise ValueError('Unsupported source kind')
    return hashlib.sha256(content.encode()).hexdigest()


def observe(pair):
    url, info = pair
    if urlparse(url).scheme != 'https':
        return url, {**info, 'error': 'Only HTTPS public sources supported'}
    result = subprocess.run(['curl', '-fsSL', '--max-time', '20', url], capture_output=True, text=True)
    if result.returncode:
        status = re.search(r'(?:error:|returned error:)\s*(\d{3})', result.stderr)
        return url, {**info, 'error': 'HTTP ' + status.group(1) if status else 'Retrieval failed/timeout'}
    try:
        return url, {**info, 'sha256': fingerprint(info['kind'], result.stdout)}
    except (ValueError, KeyError, TypeError) as error:
        return url, {**info, 'error': str(error)[:150]}


def capture(bundle):
    wanted = targets(bundle)
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = dict(pool.map(observe, wanted.items()))
    return {'schema_version': 1, 'captured_at': datetime.now(timezone.utc).isoformat(),
            'season': json.loads((bundle / 'index.json').read_text())['season'], 'sources': sources}


def compare(baseline, current):
    rows = []
    for url, value in current['sources'].items():
        old = baseline.get('sources', {}).get(url)
        if value.get('error'):
            status = 'unavailable'
        elif old is None or not old.get('sha256'):
            status = 'baseline-needed'
        elif value['sha256'] != old['sha256']:
            status = 'changed'
        else:
            status = 'unchanged'
        rows.append({'url': url, 'status': status,
                     'known_unavailable': status == 'unavailable' and bool(old and old.get('error') and not old.get('sha256')),
                     **value})
    for url, old in baseline.get('sources', {}).items():
        if url not in current['sources']:
            rows.append({'url': url, 'status': 'no-longer-referenced', 'spec_ids': old.get('spec_ids', [])})
    return rows


def report(rows, current):
    changed = [r for r in rows if r['status'] != 'unchanged']
    lines = ['# WoW seasonal source check', '',
             f'Season: {current["season"]} · Checked: {current["captured_at"]}', '',
             f'{len(rows) - len(changed)} unchanged sources; {len(changed)} require attention.', '',
             'This detects source drift, not whether a recommendation is now wrong. Verified setup files were not modified.', '']
    if changed:
        lines += ['| Status | Source | Affected specs | Detail |', '| --- | --- | --- | --- |']
        for row in changed:
            affected = ', '.join(str(i) for i in row['spec_ids']) or 'All / season metadata'
            detail = row.get('error', 'Review before refreshing the bundled baseline').replace('|', '/')
            if row.get('known_unavailable'):
                detail += ' (known monitoring gap; not checked)'
            lines.append(f'| {row["status"]} | {row["url"]} | {affected} | {detail} |')
    else:
        lines += ['No source changes detected. This does not replace checking unmonitored hotfix announcements.']
    return '\n'.join(lines) + '\n'


def exit_status(rows):
    if rows and all(r['status'] == 'unavailable' for r in rows):
        return 2
    if any(r['status'] == 'unavailable' and not r.get('known_unavailable') for r in rows):
        return 2
    return int(any(r['status'] not in ['unchanged', 'unavailable'] for r in rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bundle', type=Path, default=DEFAULT_BUNDLE)
    parser.add_argument('--snapshot', action='store_true', help='Print candidate fingerprints only; not verification or automatic acceptance')
    parser.add_argument('--json', action='store_true', help='Emit observations and change rows for the refresh workflow')
    args = parser.parse_args()
    path = args.bundle / 'source-watch.json'
    baseline = json.loads(path.read_text()) if path.exists() else {'sources': {}}
    current = capture(args.bundle)
    if args.snapshot:
        for url, value in current['sources'].items():
            previous = baseline.get('sources', {}).get(url, {})
            if value.get('error') and previous.get('sha256'):
                value['sha256'] = previous['sha256']
                value['hash_captured_at'] = previous.get('hash_captured_at', baseline.get('captured_at'))
        print(json.dumps(current, indent=2))
        return 0  # Failures retain any previous digest; no new digest is invented.
    rows = compare(baseline, current)
    if args.json:
        print(json.dumps({'schema_version': 1, 'current': current, 'rows': rows,
                          'requires_refresh': exit_status(rows) != 0}, indent=2))
        return 0
    print(report(rows, current), end='')
    known = sum(bool(r.get('known_unavailable')) for r in rows)
    if known:
        print(f'::warning::{known} known source-access gaps remain unchecked; see the report.', file=sys.stderr)
    return exit_status(rows)


if __name__ == '__main__':
    raise SystemExit(main())
