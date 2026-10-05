import { describe, expect, it } from 'vitest';
import facts from './facts.json';
import config from './site.config.json';
import { fillTemplate, siteValues, type FactsFile, type SiteValues } from './template';

describe('website template', () => {
  it('fills the head and fallback values from the facts and settings', () => {
    const { text } = siteValues(facts as unknown as FactsFile, config);
    expect(text).toMatchObject({ rows: '2,455', manufacturers: '9', siteUrl: config.siteUrl });
  });

  it('escapes values, inserts blocks, and stops at an unknown name', () => {
    const values: SiteValues = { text: { name: 'A & B <C>' }, html: { block: '<b>x</b>' } };
    expect(fillTemplate('{{name}} {{{block}}}', values)).toBe('A &amp; B &lt;C&gt; <b>x</b>');
    expect(() => fillTemplate('{{missing}}', values)).toThrow(/unknown value \{\{missing\}\}/);
    expect(() => fillTemplate('{{{missing}}}', values)).toThrow(/unknown block/);
  });
});
