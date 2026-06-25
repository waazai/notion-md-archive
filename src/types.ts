// Minimal internal shapes for the slice of the Notion API we consume.
// Kept lightweight on purpose — the official SDK's union types are huge and we
// only touch a handful of fields.

export interface RichText {
  type?: "text" | "mention" | "equation" | string;
  plain_text: string;
  href?: string | null;
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  equation?: { expression: string };
}

/** A Notion block, with the type-specific payload under `block[block.type]`
 *  and (after fetchBlockTree) any nested children attached as `children`. */
export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  // type-specific payload, e.g. block.paragraph, block.code, block.image ...
  [key: string]: unknown;
}

/** Lookup of original media URL -> local relative path, filled by the
 *  attachment downloader (Phase 3). When absent, original URLs are kept. */
export type MediaMap = Map<string, string>;

export interface ConvertCtx {
  mediaMap?: MediaMap;
}
