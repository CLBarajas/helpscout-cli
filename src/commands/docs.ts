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
  cmd.addCommand(articles);

  return cmd;
}
