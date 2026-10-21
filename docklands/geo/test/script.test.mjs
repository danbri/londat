// Tests of the script preference (docklands/geo/script.js; owner, 2026-10-22: names in Latin script only, default on, no
// transliteration, "Better no labels than that"). Run: npm test (or node --test docklands/geo/test/script.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { isLatin, pickName, latinPreferred, setLatinPreferred, getScriptPreference, setScriptPreference, resetScriptPreference, stripNonLatin, scrubText, latinOut } from '../script.js';

test('isLatin: Latin with diacritics, Bosnian/Croatian letters, digits and punctuation are Latin', () => {
  for (const s of ['Sarajevo', 'Banja Luka', 'Bihać', 'Čapljina', 'Šamac', 'Đurđevik', 'Žepče', 'Ćelić', 'čćđšž ČĆĐŠŽ', 'Dž', 'Lj', 'Nj', 'León', 'Ñora', 'Straße', 'Œuvre', 'Ærø', 'São Tomé', 'Brčko', 'Kraków',
    'M-5', '1 Canada Square', 'A13 (E-route) 12.5 km', '', '  ', '42', '™ © — “quoted”', 'é (combining mark)'])
    assert.ok(isLatin(s), s);
  assert.ok(isLatin(null) && isLatin(undefined));
});
test('isLatin: Cyrillic, Greek, Arabic, Hebrew, CJK, Devanagari and mixed names are not Latin', () => {
  for (const s of ['Сарајево', 'Бања Лука', 'Београд', 'Пањак', 'Ђ', 'Αθήνα', 'Ελλάδα', 'القاهرة', 'تهران', 'ירושלים', '東京', '北京', '서울', 'दिल्ली', 'ঢাকা', 'کراچی',
    'Sarajevo (Сарајево)', 'Banja Luka / Бања Лука', 'Beogradа' /* last letter Cyrillic а */, 'Sarajevo 2 Ж'])
    assert.ok(!isLatin(s), s);
});
test('pickName: Latin preferred by default (node), the first Latin candidate, else null; all scripts when off', () => {
  resetScriptPreference();
  assert.equal(latinPreferred(), true); assert.equal(getScriptPreference(), 'latin');
  assert.equal(pickName('Сарајево', 'Sarajevo'), 'Sarajevo');
  assert.equal(pickName('Bihać', 'Бихаћ'), 'Bihać');
  assert.equal(pickName('Пањак'), null);                       // no Latin form: not shown (no transliteration)
  assert.equal(pickName('Пањак', null, '', '  '), null);
  assert.equal(pickName('Москва', 'Moskva'), 'Moskva');
  assert.equal(pickName(), null);
  setLatinPreferred(false);
  assert.equal(getScriptPreference(), 'all');
  assert.equal(pickName('Сарајево', 'Sarajevo'), 'Сарајево');
  assert.equal(pickName('Пањак'), 'Пањак');
  assert.equal(setScriptPreference('latin'), 'latin'); assert.equal(latinPreferred(), true);
  assert.equal(setScriptPreference('all'), 'all'); assert.equal(setScriptPreference(true), 'latin');
  assert.throws(() => setScriptPreference('cyrillic'), /latin/);
  resetScriptPreference();
});
test('stripNonLatin: words in other scripts are left out of a sentence and the punctuation tidied', () => {
  assert.equal(stripNonLatin('Sarajevo (Сарајево), a city.'), 'Sarajevo, a city.');
  assert.equal(stripNonLatin('A railway (Београд - Бар).'), 'A railway.');
  assert.equal(stripNonLatin('Places in view: Пањак, Ilidža, Хаџићи.'), 'Places in view: Ilidža.');
  assert.equal(stripNonLatin('Places in view: Пањак.'), 'Places in view.');
  assert.equal(stripNonLatin('Nearest place: Пале, 12 km E.'), 'Nearest place: 12 km E.');
  assert.equal(stripNonLatin('Αθήνα'), '');
  assert.equal(stripNonLatin('No other script here (Bihać, Žepče).'), 'No other script here (Bihać, Žepče).');
  for (const s of ['Sarajevo (Сарајево), Београд - Бар railway.', 'Москва, Санкт-Петербург и Казань', 'Kairo القاهرة Giza']) assert.ok(isLatin(stripNonLatin(s)), s);
  resetScriptPreference(); assert.equal(scrubText('Сарајево'), '');
  setLatinPreferred(false); assert.equal(scrubText('Сарајево'), 'Сарајево'); resetScriptPreference(); setLatinPreferred(true);
});
test('latinOut: API answers lose names in other scripts (fields removed, list items dropped), text tidied; off: unchanged', () => {
  const fn = () => 1, r = [{ name: 'Sarajevo', local_name: 'Сарајево', kind: 'city', facts: [{ label: 'Name (other script)', value: 'Сарајево' }], more: fn },
    { name: 'Пањак', kind: 'village' }, { name: 'Ilidža', alt: 'Илиџа', kind: 'town' }];
  setLatinPreferred(true);
  const o = latinOut(r);
  assert.equal(o.length, 2); assert.equal(o[0].name, 'Sarajevo'); assert.ok(!('local_name' in o[0])); assert.equal(o[0].facts[0].value, ''); assert.equal(o[0].more, fn);
  assert.ok(!('alt' in o[1])); assert.ok(isLatin(JSON.stringify(o)));
  const d = latinOut({ text: 'Large places in view: Sarajevo, Пале, Zenica.', places_in_view: [{ name: 'Пале' }, { name: 'Zenica' }], countries_in_view: ['Bosnia and Herzegovina', 'Босна и Херцеговина'], centre: { country: 'Bosnia and Herzegovina', region: 'Република Српска' } });
  assert.equal(d.text, 'Large places in view: Sarajevo, Zenica.'); assert.deepEqual(d.places_in_view, [{ name: 'Zenica' }]); assert.deepEqual(d.countries_in_view, ['Bosnia and Herzegovina']);
  assert.ok(isLatin(JSON.stringify(d)));
  assert.equal(r[1].name, 'Пањак');   // the input is not changed
  setLatinPreferred(false); assert.equal(latinOut(r), r); resetScriptPreference();
});
