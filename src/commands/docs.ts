import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/command-utils.js';

// Help Scout Docs (knowledge base) lives on a separate API (docsapi.helpscout.net)
// authenticated with a standalone Docs API key. Docs IDs are opaque 24-char
// strings, so they are passed through as-is (not parsed to numbers like Mailbox IDs).
export function createDocsCommand(): Command {
  const cmd = new Command('docs').description('Help Scout Docs (knowledge base) operations');

  // --- Collections ---
  const collections = new Command('collections').description('Docs collection operations');
  collections
    .command('list')
    .description('List Docs collections')
    .option('--site <id>', 'Filter by Docs site ID')
    .option('--visibility <visibility>', 'Filter by visibility (public, private)')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (options: { site?: string; visibility?: string; page?: string }) => {
        const result = await client.listDocsCollections({
          siteId: options.site,
          visibility: options.visibility,
          page: options.page ? parseInt(options.page, 10) : undefined,
        });
        outputJson(result);
      })
    );
  collections
    .command('view')
    .description('View a Docs collection')
    .argument('<id>', 'Collection ID')
    .action(
      withErrorHandling(async (id: string) => {
        outputJson(await client.getDocsCollection(id));
      })
    );
  collections
    .command('create')
    .description('Create a Docs collection (name must be unique across the account)')
    .requiredOption('--site <id>', 'Docs site ID the collection belongs to')
    .requiredOption('--name <name>', 'Collection name (must be unique per account)')
    .option('--visibility <visibility>', 'Visibility (public, private)')
    .option('--order <number>', 'Display order')
    .option('--description <text>', 'Description')
    .action(
      withErrorHandling(
        async (options: {
          site: string;
          name: string;
          visibility?: string;
          order?: string;
          description?: string;
        }) => {
          outputJson(
            await client.createDocsCollection({
              siteId: options.site,
              name: options.name,
              visibility: options.visibility,
              order: options.order ? parseInt(options.order, 10) : undefined,
              description: options.description,
            })
          );
        }
      )
    );
  collections
    .command('update')
    .description('Update a Docs collection (pass the fields to set; full-vs-merge is unverified)')
    .argument('<id>', 'Collection ID')
    .option('--name <name>', 'Collection name (must be unique per account)')
    .option('--visibility <visibility>', 'Visibility (public, private)')
    .option('--order <number>', 'Display order')
    .option('--description <text>', 'Description')
    .option('--site <id>', 'Move the collection to a different Docs site ID')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            name?: string;
            visibility?: string;
            order?: string;
            description?: string;
            site?: string;
          }
        ) => {
          outputJson(
            await client.updateDocsCollection(id, {
              name: options.name,
              visibility: options.visibility,
              order: options.order ? parseInt(options.order, 10) : undefined,
              description: options.description,
              siteId: options.site,
            })
          );
        }
      )
    );
  collections
    .command('delete')
    .description('Delete a Docs collection (also removes its categories and articles)')
    .argument('<id>', 'Collection ID')
    .option('--yes', 'Confirm the deletion (required)')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        if (!options.yes) {
          outputJson({
            error:
              'Refusing to delete without --yes (this removes the collection, its categories, and its articles)',
          });
          return;
        }
        await client.deleteDocsCollection(id);
        outputJson({ success: true, id, message: 'Collection deleted' });
      })
    );
  cmd.addCommand(collections);

  // --- Categories ---
  const categories = new Command('categories').description('Docs category operations');
  categories
    .command('list')
    .description('List categories in a collection')
    .argument('<collectionId>', 'Collection ID')
    .option('--page <number>', 'Page number')
    .option('--sort <field>', 'Sort field (order, name, articleCount, createdAt, updatedAt)')
    .option('--order <direction>', 'Sort order (asc, desc)')
    .action(
      withErrorHandling(
        async (
          collectionId: string,
          options: { page?: string; sort?: string; order?: string }
        ) => {
          const result = await client.listDocsCategories(collectionId, {
            page: options.page ? parseInt(options.page, 10) : undefined,
            sort: options.sort,
            order: options.order,
          });
          outputJson(result);
        }
      )
    );
  categories
    .command('create')
    .description('Create a category in a collection (name must be unique within the collection)')
    .requiredOption('--collection <id>', 'Collection ID the category belongs to')
    .requiredOption('--name <name>', 'Category name (must be unique within the collection)')
    .option('--slug <slug>', 'SEO-friendly URL slug')
    .option('--visibility <visibility>', 'Visibility (public, private)')
    .option('--order <number>', 'Display order')
    .option('--default-sort <field>', 'Default article sort (popularity, name)')
    .action(
      withErrorHandling(
        async (options: {
          collection: string;
          name: string;
          slug?: string;
          visibility?: string;
          order?: string;
          defaultSort?: string;
        }) => {
          outputJson(
            await client.createDocsCategory({
              collectionId: options.collection,
              name: options.name,
              slug: options.slug,
              visibility: options.visibility,
              order: options.order ? parseInt(options.order, 10) : undefined,
              defaultSort: options.defaultSort,
            })
          );
        }
      )
    );
  categories
    .command('update')
    .description('Update a category (requires --collection; full-vs-merge is unverified)')
    .argument('<id>', 'Category ID')
    .requiredOption('--collection <id>', 'Collection ID the category belongs to')
    .option('--name <name>', 'Category name (must be unique within the collection)')
    .option('--slug <slug>', 'SEO-friendly URL slug')
    .option('--visibility <visibility>', 'Visibility (public, private)')
    .option('--order <number>', 'Display order')
    .option('--default-sort <field>', 'Default article sort (popularity, name)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            collection: string;
            name?: string;
            slug?: string;
            visibility?: string;
            order?: string;
            defaultSort?: string;
          }
        ) => {
          outputJson(
            await client.updateDocsCategory(id, options.collection, {
              name: options.name,
              slug: options.slug,
              visibility: options.visibility,
              order: options.order ? parseInt(options.order, 10) : undefined,
              defaultSort: options.defaultSort,
            })
          );
        }
      )
    );
  categories
    .command('delete')
    .description('Delete a Docs category')
    .argument('<id>', 'Category ID')
    .option('--yes', 'Confirm the deletion (required)')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        if (!options.yes) {
          outputJson({ error: 'Refusing to delete without --yes' });
          return;
        }
        await client.deleteDocsCategory(id);
        outputJson({ success: true, id, message: 'Category deleted' });
      })
    );
  categories
    .command('reorder')
    .description('Reorder categories within a collection')
    .argument('<collectionId>', 'Collection ID')
    .requiredOption(
      '--order <ids>',
      'Comma-separated category IDs in the desired order (first = position 1)'
    )
    .action(
      withErrorHandling(async (collectionId: string, options: { order: string }) => {
        const ids = options.order
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length === 0) {
          outputJson({ error: '--order must list at least one category ID' });
          return;
        }
        const ordered = ids.map((id, index) => ({ id, order: index + 1 }));
        await client.reorderDocsCategories(collectionId, ordered);
        outputJson({
          success: true,
          collectionId,
          count: ordered.length,
          message: 'Categories reordered',
        });
      })
    );
  cmd.addCommand(categories);

  // --- Articles ---
  const articles = new Command('articles').description('Docs article operations');
  articles
    .command('list')
    .description('List articles in a collection or category (pass one of --collection / --category)')
    .option('--collection <id>', 'Collection ID')
    .option('--category <id>', 'Category ID')
    .option('--status <status>', 'Filter by status (all, published, notpublished)')
    .option('--sort <field>', 'Sort field (number, status, name, popularity, createdAt, updatedAt)')
    .option('--order <direction>', 'Sort order (asc, desc)')
    .option('--page <number>', 'Page number')
    .option('--page-size <number>', 'Results per page (max 100)')
    .action(
      withErrorHandling(
        async (options: {
          collection?: string;
          category?: string;
          status?: string;
          sort?: string;
          order?: string;
          page?: string;
          pageSize?: string;
        }) => {
          if (!options.collection && !options.category) {
            outputJson({ error: 'One of --collection or --category is required' });
            return;
          }
          const result = await client.listDocsArticles({
            collectionId: options.collection,
            categoryId: options.category,
            status: options.status,
            sort: options.sort,
            order: options.order,
            page: options.page ? parseInt(options.page, 10) : undefined,
            pageSize: options.pageSize ? parseInt(options.pageSize, 10) : undefined,
          });
          outputJson(result);
        }
      )
    );
  articles
    .command('view')
    .description('View a Docs article (includes full body text)')
    .argument('<idOrNumber>', 'Article ID or number')
    .option('--draft', 'Return the latest draft content instead of the published version')
    .action(
      withErrorHandling(async (idOrNumber: string, options: { draft?: boolean }) => {
        outputJson(await client.getDocsArticle(idOrNumber, { draft: options.draft }));
      })
    );
  articles
    .command('search')
    .description('Search Docs articles')
    .argument('<query>', 'Search query')
    .option('--collection <id>', 'Limit to a collection ID')
    .option('--site <id>', 'Limit to a Docs site ID')
    .option('--status <status>', 'Filter by status (published, notpublished)')
    .option('--visibility <visibility>', 'Filter by visibility (public, private)')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(
        async (
          query: string,
          options: {
            collection?: string;
            site?: string;
            status?: string;
            visibility?: string;
            page?: string;
          }
        ) => {
          const result = await client.searchDocsArticles({
            query,
            collectionId: options.collection,
            siteId: options.site,
            status: options.status,
            visibility: options.visibility,
            page: options.page ? parseInt(options.page, 10) : undefined,
          });
          outputJson(result);
        }
      )
    );
  articles
    .command('related')
    .description('List articles related to an article')
    .argument('<articleId>', 'Article ID')
    .option('--page <number>', 'Page number')
    .action(
      withErrorHandling(async (articleId: string, options: { page?: string }) => {
        const result = await client.listRelatedDocsArticles(articleId, {
          page: options.page ? parseInt(options.page, 10) : undefined,
        });
        outputJson(result);
      })
    );
  articles
    .command('create')
    .description('Create a Docs article (defaults to notpublished — pass --publish to publish)')
    .requiredOption('--collection <id>', 'Collection ID the article belongs to')
    .requiredOption('--name <name>', 'Article name (must be unique within the collection)')
    .option('--text <html>', 'Article body (plain text or HTML)')
    .option('--text-file <path>', 'Read the article body from a file instead of --text')
    .option('--slug <slug>', 'SEO slug (auto-generated from name if omitted)')
    .option('--publish', 'Publish immediately (default is notpublished)')
    .option('--status <status>', 'Explicit status: published or notpublished')
    .option('--category <id...>', 'Category ID(s) to associate (repeatable)')
    .option('--related <id...>', 'Related article ID(s) (repeatable)')
    .option('--keyword <kw...>', 'Keyword(s) (repeatable)')
    .action(
      withErrorHandling(
        async (options: {
          collection: string;
          name: string;
          text?: string;
          textFile?: string;
          slug?: string;
          publish?: boolean;
          status?: string;
          category?: string[];
          related?: string[];
          keyword?: string[];
        }) => {
          const text =
            options.textFile !== undefined
              ? await readFile(options.textFile, 'utf8')
              : options.text;
          if (text === undefined) {
            outputJson({ error: 'One of --text or --text-file is required' });
            return;
          }
          // Publish only when explicitly asked; never default to published.
          const status: 'published' | 'notpublished' = options.status
            ? (options.status as 'published' | 'notpublished')
            : options.publish
              ? 'published'
              : 'notpublished';
          outputJson(
            await client.createDocsArticle({
              collectionId: options.collection,
              name: options.name,
              text,
              slug: options.slug,
              status,
              categories: options.category,
              related: options.related,
              keywords: options.keyword,
            })
          );
        }
      )
    );
  articles
    .command('update')
    .description('Update a Docs article (partial merge — only the flags you pass change)')
    .argument('<id>', 'Article ID')
    .option('--name <name>', 'New article name')
    .option('--text <html>', 'New article body (plain text or HTML)')
    .option('--text-file <path>', 'Read the new article body from a file')
    .option('--slug <slug>', 'New SEO slug')
    .option('--publish', 'Set status to published')
    .option('--unpublish', 'Set status to notpublished')
    .option('--status <status>', 'Explicit status: published or notpublished')
    .option('--category <id...>', 'Replace category association(s) (repeatable)')
    .option('--related <id...>', 'Replace related article ID(s) (repeatable)')
    .option('--keyword <kw...>', 'Replace keyword(s) (repeatable)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            name?: string;
            text?: string;
            textFile?: string;
            slug?: string;
            publish?: boolean;
            unpublish?: boolean;
            status?: string;
            category?: string[];
            related?: string[];
            keyword?: string[];
          }
        ) => {
          const text =
            options.textFile !== undefined
              ? await readFile(options.textFile, 'utf8')
              : options.text;
          let status: 'published' | 'notpublished' | undefined;
          if (options.status) {
            status = options.status as 'published' | 'notpublished';
          } else if (options.publish) {
            status = 'published';
          } else if (options.unpublish) {
            status = 'notpublished';
          }
          // Send only the fields the user actually provided (partial merge).
          const body: {
            name?: string;
            text?: string;
            slug?: string;
            status?: 'published' | 'notpublished';
            categories?: string[];
            related?: string[];
            keywords?: string[];
          } = {};
          if (options.name !== undefined) body.name = options.name;
          if (text !== undefined) body.text = text;
          if (options.slug !== undefined) body.slug = options.slug;
          if (status !== undefined) body.status = status;
          if (options.category !== undefined) body.categories = options.category;
          if (options.related !== undefined) body.related = options.related;
          if (options.keyword !== undefined) body.keywords = options.keyword;
          if (Object.keys(body).length === 0) {
            outputJson({ error: 'Nothing to update — pass at least one field flag' });
            return;
          }
          outputJson(await client.updateDocsArticle(id, body));
        }
      )
    );
  articles
    .command('delete')
    .description('Delete a Docs article (permanent)')
    .argument('<id>', 'Article ID')
    .option('--yes', 'Confirm the deletion (required)')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        if (!options.yes) {
          outputJson({ error: 'Refusing to delete without --yes (deletion is permanent)' });
          return;
        }
        await client.deleteDocsArticle(id);
        outputJson({ success: true, id, message: 'Article deleted' });
      })
    );
  articles
    .command('save-draft')
    .description("Save (create/update) an article's draft without changing the published version")
    .argument('<id>', 'Article ID')
    .option('--text <html>', 'Draft body (plain text or HTML)')
    .option('--text-file <path>', 'Read the draft body from a file')
    .action(
      withErrorHandling(async (id: string, options: { text?: string; textFile?: string }) => {
        const text =
          options.textFile !== undefined ? await readFile(options.textFile, 'utf8') : options.text;
        if (text === undefined) {
          outputJson({ error: 'One of --text or --text-file is required' });
          return;
        }
        await client.saveDocsArticleDraft(id, text);
        outputJson({ success: true, id, message: 'Draft saved' });
      })
    );
  articles
    .command('delete-draft')
    .description("Discard an article's draft (the published version is untouched)")
    .argument('<id>', 'Article ID')
    .option('--yes', 'Confirm discarding the draft (required)')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        if (!options.yes) {
          outputJson({ error: 'Refusing to discard the draft without --yes' });
          return;
        }
        await client.deleteDocsArticleDraft(id);
        outputJson({ success: true, id, message: 'Draft discarded' });
      })
    );
  cmd.addCommand(articles);

  // --- Tree (discovery) ---
  cmd
    .command('tree')
    .description('Show the collection → category hierarchy in one call (ids, numbers, slugs)')
    .argument('[collectionId]', 'Optional collection ID or number to scope the tree to one collection')
    .option('--site <id>', 'Filter by Docs site ID')
    .option('--visibility <visibility>', 'Filter by visibility (public, private)')
    .option('--full', 'Return full collection/category objects instead of the trimmed discovery view')
    .action(
      withErrorHandling(
        async (
          collectionId: string | undefined,
          options: { site?: string; visibility?: string; full?: boolean }
        ) => {
          const { collections } = await client.getDocsTree({
            collectionId,
            siteId: options.site,
            visibility: options.visibility,
          });
          if (options.full) {
            outputJson({ collections });
            return;
          }
          outputJson({
            collections: collections.map((c) => ({
              id: c.id,
              number: c.number,
              slug: c.slug,
              name: c.name,
              articleCount: c.articleCount,
              categories: c.categories.map((cat) => ({
                id: cat.id,
                number: cat.number,
                slug: cat.slug,
                name: cat.name,
                articleCount: cat.articleCount,
              })),
            })),
          });
        }
      )
    );

  return cmd;
}
