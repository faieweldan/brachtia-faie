import { describe, expect, test } from 'bun:test';
import { pickForResidence } from '../src/lib/templates.functions';

const row = (id: string, doc_key: string, residence_id: string | null) => ({ id, document_templates: { doc_key, residence_id } });
const rows = [
  row('all-card', 'access_card_form', null),
  row('arc-card', 'access_card_form', 'arc'),
  row('all-a', 'schedule_a', null),
];

describe("which template a resident's pack uses", () => {
  test("their residence's own copy wins", () => {
    expect(pickForResidence(rows, 'access_card_form', 'arc')?.id).toBe('arc-card');
  });
  test('another residence gets the one for all residences', () => {
    expect(pickForResidence(rows, 'access_card_form', 'solstice')?.id).toBe('all-card');
  });
  test('no placement yet: the one for all residences', () => {
    expect(pickForResidence(rows, 'access_card_form', null)?.id).toBe('all-card');
  });
  test('only for all residences: everyone gets it', () => {
    expect(pickForResidence(rows, 'schedule_a', 'arc')?.id).toBe('all-a');
  });
  test('nothing for that document: nothing', () => {
    expect(pickForResidence(rows, 'schedule_c', 'arc')).toBeUndefined();
  });
});
