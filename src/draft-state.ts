import {
  DOCUMENT_IDS,
  type DocumentId,
  type Field,
  type Fields,
} from "../shared/types";
export type LocalDraft = {
  fields: Fields;
  baseRevision: number;
  baseFields: Fields;
};
export type LocalDrafts = Partial<Record<DocumentId, LocalDraft>>;
const fields: Field[] = ["subject", "headline", "body", "dateLine", "cta"];
/** The operator reviews collisions; untouched fields take the newest saved copy. */
export function prepareMerge(draft: LocalDraft, current: Fields): Fields {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      draft.fields[field] !== draft.baseFields[field]
        ? draft.fields[field]
        : current[field],
    ]),
  ) as Fields;
}
function validFields(value: unknown): value is Fields {
  return (
    !!value &&
    typeof value === "object" &&
    fields.every((field) => typeof (value as Fields)[field] === "string")
  );
}
/** Browser storage is untrusted and may belong to an interrupted older build. */
export function restoreDraftCache(raw: string | null): LocalDrafts {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !data.drafts || typeof data.drafts !== "object")
      return {};
    const restored: LocalDrafts = {};
    for (const id of DOCUMENT_IDS) {
      const draft = data.drafts[id];
      if (
        draft &&
        Number.isSafeInteger(draft.baseRevision) &&
        draft.baseRevision > 0 &&
        validFields(draft.fields) &&
        validFields(draft.baseFields)
      )
        restored[id] = {
          fields: draft.fields,
          baseFields: draft.baseFields,
          baseRevision: draft.baseRevision,
        };
    }
    return restored;
  } catch {
    return {};
  }
}
