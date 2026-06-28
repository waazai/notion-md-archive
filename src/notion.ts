import { Client } from "@notionhq/client";
import type { NotionBlock } from "./types.js";

// Thin wrapper around the official client: a request throttle (~3 req/s to stay
// under Notion's rate limit) plus the pagination + recursion we need.

export interface NotionPage {
  id: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, any>;
}

export class Notion {
  private client: Client;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly minGapMs = 350; // ~3 req/s
  private lastAt = 0;

  constructor(token: string) {
    this.client = new Client({ auth: token });
  }

  /** Serialize + space out requests to respect the rate limit. */
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) await sleep(wait);
      this.lastAt = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Database title (subfolder name) + property schema (for capability checks). */
  async retrieveDatabase(
    databaseId: string
  ): Promise<{ name: string; properties: Record<string, any> }> {
    const db: any = await this.schedule(() =>
      this.client.databases.retrieve({ database_id: databaseId })
    );
    const name = (db.title ?? []).map((t: any) => t.plain_text).join("").trim() || "Untitled";
    return { name, properties: db.properties ?? {} };
  }

  /** Every database the integration is shared with (for the GUI picker). */
  async listDatabases(): Promise<{ id: string; name: string }[]> {
    const out: { id: string; name: string }[] = [];
    let cursor: string | undefined;
    do {
      const res: any = await this.schedule(() =>
        this.client.search({ filter: { value: "database", property: "object" }, start_cursor: cursor })
      );
      for (const r of res.results) {
        const name = (r.title ?? []).map((t: any) => t.plain_text).join("").trim() || "Untitled";
        out.push({ id: r.id, name });
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  /** All pages in a database, following pagination. */
  async queryDatabase(databaseId: string): Promise<NotionPage[]> {
    const pages: NotionPage[] = [];
    let cursor: string | undefined;
    do {
      const res: any = await this.schedule(() =>
        this.client.databases.query({ database_id: databaseId, start_cursor: cursor })
      );
      for (const p of res.results) pages.push(p as NotionPage);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return pages;
  }

  /** Block tree for a page: every block, with nested children attached. */
  async fetchBlockTree(blockId: string): Promise<NotionBlock[]> {
    const blocks = await this.listChildren(blockId);
    for (const b of blocks) {
      if (b.has_children) b.children = await this.fetchBlockTree(b.id);
    }
    return blocks;
  }

  private async listChildren(blockId: string): Promise<NotionBlock[]> {
    const out: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const res: any = await this.schedule(() =>
        this.client.blocks.children.list({ block_id: blockId, start_cursor: cursor })
      );
      for (const b of res.results) out.push(b as NotionBlock);
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return out;
  }

  /** Resolve a relation page id to its title (for tag names). */
  async pageTitle(pageId: string): Promise<string> {
    const page: any = await this.schedule(() =>
      this.client.pages.retrieve({ page_id: pageId })
    );
    const props = page.properties ?? {};
    for (const key of Object.keys(props)) {
      if (props[key]?.type === "title") {
        return (props[key].title ?? []).map((t: any) => t.plain_text).join("").trim();
      }
    }
    return pageId;
  }

  /** Write-back: set a date property to `when` (Phase 4). */
  async setDate(pageId: string, propName: string, when: Date): Promise<void> {
    await this.schedule(() =>
      this.client.pages.update({
        page_id: pageId,
        properties: { [propName]: { date: { start: when.toISOString() } } } as any,
      })
    );
  }

  /** Import: create a page in a database with the given properties. Returns its id. */
  async createPage(databaseId: string, properties: Record<string, unknown>): Promise<string> {
    const res: any = await this.schedule(() =>
      this.client.pages.create({
        parent: { database_id: databaseId },
        properties: properties as any,
      })
    );
    return res.id;
  }

  /** Import (upsert): overwrite a page's properties. */
  async updateProps(pageId: string, properties: Record<string, unknown>): Promise<void> {
    await this.schedule(() =>
      this.client.pages.update({ page_id: pageId, properties: properties as any })
    );
  }

  /** Import (upsert): delete a page's existing top-level children, so the body can
   *  be re-appended without duplicating blocks on re-import. */
  async deleteChildren(pageId: string): Promise<void> {
    const kids = await this.listChildren(pageId);
    for (const k of kids) {
      await this.schedule(() => this.client.blocks.delete({ block_id: k.id }));
    }
  }

  /** Import: append child blocks to a page, batched under Notion's 100/req limit. */
  async appendChildren(pageId: string, children: unknown[]): Promise<void> {
    for (const batch of chunk(children, 100)) {
      await this.schedule(() =>
        this.client.blocks.children.append({ block_id: pageId, children: batch as any })
      );
    }
  }
}

/** Split an array into batches of at most `size` (pure; used for the 100-child cap). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
