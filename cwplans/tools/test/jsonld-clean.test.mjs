import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanJsonLd } from '../jsonld-clean.mjs';

const S = 'https://schema.org/';

test('valid JSON-LD with the remote schema.org context: context inlined, nothing else changed', () => {
  const r = cleanJsonLd('{"@context":"https://schema.org","@type":"Cafe","name":"A"}');
  assert.deepEqual(r.docs, [{ '@context': { '@vocab': S }, '@type': 'Cafe', name: 'A' }]);
  assert.deepEqual(r.repairs, { remote_context_schema_org_inlined: 1 });
  assert.equal(cleanJsonLd('{"@context":"http://schema.org/","@type":"Cafe"}').docs[0]['@context']['@vocab'], S);
  assert.equal(cleanJsonLd('{"@context":{"@vocab":"http://schema.org/"},"@type":"Cafe"}').docs[0]['@context']['@vocab'], S);
});

test('wrappers, comments, trailing commas, control characters', () => {
  const r = cleanJsonLd('<!--\n//<![CDATA[\n{"@context":"https://schema.org", // the context\n "@type":"Bakery", /* x */ "name":"Line\nbreak", "sameAs":["a","b",],}\n//]]>\n-->');
  assert.equal(r.error, undefined);
  assert.equal(r.docs[0].name, 'Line\nbreak');
  assert.deepEqual(r.docs[0].sameAs, ['a', 'b']);
  for (const k of ['html_comment_wrapper', 'cdata_wrapper', 'js_comment', 'trailing_comma', 'control_char_in_string']) assert.ok(r.repairs[k], k);
});

test('a URL inside a string is not a comment', () => {
  const r = cleanJsonLd('{"@context":"https://schema.org","url":"https://example.com/a",}');
  assert.equal(r.docs[0].url, 'https://example.com/a');
});

test('concatenated objects are split; @graph is unwrapped into the page graph', () => {
  const r = cleanJsonLd('{"@context":"https://schema.org","@type":"Cafe"}\n{"@context":"https://schema.org","@type":"Event"}');
  assert.equal(r.docs.length, 2); assert.ok(r.repairs.concatenated_values);
  const g = cleanJsonLd('{"@context":"https://schema.org","@id":"#x","@graph":[{"@type":"Cafe"},{"@type":"WebSite"}]}');
  assert.equal(g.docs.length, 3); assert.equal(g.docs[1]['@context']['@vocab'], S); assert.ok(g.repairs.graph_unwrapped);
});

test('HTML entities: in markup when parsing fails, in strings always; http://schema.org IRIs normalised', () => {
  const r = cleanJsonLd('{&quot;@context&quot;:&quot;https://schema.org&quot;,&quot;@type&quot;:&quot;Cafe&quot;}');
  assert.equal(r.docs[0]['@type'], 'Cafe'); assert.ok(r.repairs.html_entities_in_markup);
  const s = cleanJsonLd('{"@context":"https://schema.org","name":"Ben &amp; Jerry&#39;s","dayOfWeek":"http://schema.org/Monday"}');
  assert.equal(s.docs[0].name, "Ben & Jerry's"); assert.equal(s.docs[0].dayOfWeek, S + 'Monday');
});

test('invalid escapes and an unparseable block', () => {
  assert.equal(cleanJsonLd('{"@context":"https://schema.org","name":"Joe\\\'s"}').docs[0].name, "Joe's");
  const bad = cleanJsonLd('{"@context": "https://schema.org", "name": }');
  assert.ok(bad.error); assert.deepEqual(bad.docs, []);
  assert.deepEqual(cleanJsonLd('   ').repairs, { empty_block: 1 });
});

test('a missing comma and a missing closing brace (bigeasy.co.uk, 2026-10-03)', () => {
  const r = cleanJsonLd('{"@context":"https://schema.org","address":{"@type":"PostalAddress","addressCountry":"GB"\n\t"openingHours":"Mo-Th 12:00-22:00"\n},"name":"X"');
  assert.equal(r.error, undefined); assert.equal(r.docs[0].name, 'X'); assert.ok(r.repairs.missing_comma); assert.ok(r.repairs.unclosed_brackets);
  assert.deepEqual(cleanJsonLd('{"a":[1 2]}').error !== undefined, true);   // numbers next to numbers are not guessed
});
