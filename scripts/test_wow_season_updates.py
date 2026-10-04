import unittest

from check_wow_season_updates import compare, exit_status, fingerprint, refs, report


class UpdateChecks(unittest.TestCase):
    def test_noise_does_not_change_guide_digest(self):
        body = '<h1>Guide</h1><p>Stat priority and consumables are explained in this maintained guide. ' + 'Useful guidance. ' * 15 + '</p>'
        self.assertEqual(fingerprint('guide', '<nav>noise</nav>' + body + '<footer>old</footer>'),
                         fingerprint('guide', '<nav>new</nav>' + body + '<script>random()</script><footer>new</footer>'))
        self.assertEqual(fingerprint('guide', body + '<p>Last modified 4 days ago</p>'),
                         fingerprint('guide', body + '<p>Last modified 11 days ago</p>'))

    def test_changed_advice_and_identity_links_are_detected(self):
        body = '<h1>Stats</h1><p>' + 'Useful stat guidance. ' * 15 + '</p>'
        self.assertNotEqual(fingerprint('guide', body + '<p>Haste first</p>'),
                            fingerprint('guide', body + '<p>Mastery first</p>'))
        self.assertNotEqual(fingerprint('guide', body + '<a href="https://www.wowhead.com/item=1">Gem</a>'),
                            fingerprint('guide', body + '<a href="https://www.wowhead.com/item=2">Gem</a>'))

    def test_access_challenge_is_not_a_valid_snapshot(self):
        with self.assertRaises(ValueError):
            fingerprint('guide', '<h1>Just a moment</h1><p>Please sign in</p>')

    def test_tooltip_change_and_cosmetic_noise(self):
        a = '{"name":"Gem","tooltip":"<b>+16 Haste</b>","icon":"old"}'
        b = '{"name":"Gem","tooltip":"<span>+16 Haste</span>","icon":"new"}'
        self.assertEqual(fingerprint('tooltip', a), fingerprint('tooltip', b))
        self.assertNotEqual(fingerprint('tooltip', a), fingerprint('tooltip', b.replace('+16', '+17')))

    def test_failures_never_count_as_unchanged(self):
        old = {'sources': {'u': {'sha256': 'a', 'spec_ids': [265]}}}
        now = {'sources': {'u': {'error': 'HTTP 403', 'spec_ids': [265]}}}
        self.assertEqual(compare(old, now)[0]['status'], 'unavailable')
        self.assertEqual(old['sources']['u']['sha256'], 'a')

    def test_new_and_changed_sources_need_review(self):
        old = {'sources': {'u': {'sha256': 'a'}, 'gone': {}}}
        now = {'sources': {'u': {'sha256': 'b'}, 'new': {'sha256': 'c'}}}
        self.assertEqual([r['status'] for r in compare(old, now)], ['changed', 'baseline-needed', 'no-longer-referenced'])

    def test_known_access_gap_stays_visible_without_constant_failure(self):
        old = {'sources': {'ok': {'sha256': 'a'}, 'blocked': {'error': 'HTTP 403'}}}
        now = {'sources': {'ok': {'sha256': 'a'}, 'blocked': {'error': 'HTTP 403'}}}
        rows = compare(old, now)
        self.assertEqual(rows[1]['status'], 'unavailable')
        self.assertTrue(rows[1]['known_unavailable'])
        self.assertEqual(exit_status(rows), 0)
        old['sources']['blocked']['sha256'] = 'last-good'
        self.assertEqual(exit_status(compare(old, now)), 2)
        self.assertEqual(exit_status([{'status': 'unavailable', 'known_unavailable': True}]), 2)

    def test_affected_specs_report_and_recursive_refs(self):
        self.assertEqual(refs({'a': ['item:1', {'override': 'spell:2'}]}), {'item:1', 'spell:2'})
        text = report([{'url': 'https://example.test', 'status': 'changed', 'spec_ids': [265]}],
                      {'season': 'season-test', 'captured_at': '2026-10-04'})
        self.assertIn('265', text)
        self.assertIn('were not modified', text)


if __name__ == '__main__':
    unittest.main()
