/**
 * Officials contact-provenance validation (Build task 40; SPEC part ז, ו).
 *
 * Only officially published contact details may be stored, and each must carry
 * a contact_source_document_id. Personal phones / private emails / addresses /
 * national-id are never stored. Enforced in code (this validator + its test)
 * and at the DB level (migration 0007 CHECK constraint).
 */

export interface OfficialInput {
  fullName: string;
  role: string;
  officialEmail?: string | null;
  officialPhone?: string | null;
  contactSourceDocumentId?: string | null;
  sourceDocumentId: string;
}

export class OfficialProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficialProvenanceError';
  }
}

/** Throws if any contact detail is present without a contact source document. */
export function validateOfficial(o: OfficialInput): void {
  const hasContact = Boolean(o.officialEmail) || Boolean(o.officialPhone);
  if (hasContact && !o.contactSourceDocumentId) {
    throw new OfficialProvenanceError(
      `פרטי קשר של ${o.fullName} נשמרים רק עם contact_source_document_id (מקור הפרסום הרשמי)`,
    );
  }
  if (!o.sourceDocumentId) {
    throw new OfficialProvenanceError(`לכל בעל תפקיד חייב source_document_id`);
  }
}

export function isValidOfficial(o: OfficialInput): boolean {
  try {
    validateOfficial(o);
    return true;
  } catch {
    return false;
  }
}
