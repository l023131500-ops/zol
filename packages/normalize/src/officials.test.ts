import { describe, it, expect } from 'vitest';
import { validateOfficial, isValidOfficial, OfficialProvenanceError } from './officials';

const base = { fullName: 'ישראל ישראלי', role: 'חבר מועצה', sourceDocumentId: 'doc-1' };

describe('officials contact-provenance guard (task 40)', () => {
  it('rejects a phone without a contact source document', () => {
    expect(() => validateOfficial({ ...base, officialPhone: '03-1234567' })).toThrow(
      OfficialProvenanceError,
    );
  });

  it('rejects an email without a contact source document', () => {
    expect(isValidOfficial({ ...base, officialEmail: 'x@muni.gov.il' })).toBe(false);
  });

  it('allows contact details WITH a contact source document', () => {
    expect(
      isValidOfficial({ ...base, officialPhone: '03-1234567', contactSourceDocumentId: 'doc-2' }),
    ).toBe(true);
  });

  it('allows an official with no contact details at all', () => {
    expect(isValidOfficial(base)).toBe(true);
  });

  it('requires a source document for every official', () => {
    expect(isValidOfficial({ ...base, sourceDocumentId: '' })).toBe(false);
  });
});
