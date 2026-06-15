import { Command } from 'commander';
import { client } from '../lib/api-client.js';
import { outputJson } from '../lib/output.js';
import {
  withErrorHandling,
  requireConfirmation,
  parseIdArg,
  requireAtLeastOneField,
} from '../lib/command-utils.js';
import { buildDateQuery } from '../lib/dates.js';
import type { CustomerPropertyOperation } from '../types/index.js';

export function createCustomersCommand(): Command {
  const cmd = new Command('customers').description('Customer operations');

  cmd
    .command('list')
    .description('List customers')
    .option('-m, --mailbox <id>', 'Filter by mailbox ID')
    .option('--first-name <name>', 'Filter by first name')
    .option('--last-name <name>', 'Filter by last name')
    .option('--created-since <date>', 'Show customers created after this date')
    .option('--created-before <date>', 'Show customers created before this date')
    .option('--modified-since <date>', 'Show customers modified after this date')
    .option('--modified-before <date>', 'Show customers modified before this date')
    .option('--sort-field <field>', 'Sort by field (createdAt, firstName, lastName, modifiedAt)')
    .option('--sort-order <order>', 'Sort order (asc, desc)')
    .option('--page <number>', 'Page number')
    .option('-q, --query <query>', 'Advanced search query')
    .option('--v3', 'Use the v3 cursor-paginated endpoint (spans all mailboxes; ignores --mailbox)')
    .option('--cursor <cursor>', 'v3 only: pagination cursor token from a previous page')
    .option('--all', 'v3 only: fetch all pages via cursor-walk')
    .option('--email <email>', 'v3 only: filter by email')
    .option('--max <number>', 'v3 only: cap total results when using --all')
    .action(
      withErrorHandling(
        async (options: {
          mailbox?: string;
          firstName?: string;
          lastName?: string;
          createdSince?: string;
          createdBefore?: string;
          modifiedSince?: string;
          modifiedBefore?: string;
          sortField?: string;
          sortOrder?: string;
          page?: string;
          query?: string;
          v3?: boolean;
          cursor?: string;
          all?: boolean;
          email?: string;
          max?: string;
        }) => {
          if (options.v3) {
            const v3Params = {
              firstName: options.firstName,
              lastName: options.lastName,
              email: options.email,
              createdSince: options.createdSince,
              modifiedSince: options.modifiedSince,
              query: options.query,
            };
            if (options.all) {
              const customers = await client.listAllCustomersV3(
                v3Params,
                options.max ? parseInt(options.max, 10) : undefined
              );
              outputJson({ customers });
            } else {
              const result = await client.listCustomersV3({ ...v3Params, cursor: options.cursor });
              outputJson(result);
            }
            return;
          }

          const query = buildDateQuery(
            {
              createdSince: options.createdSince,
              createdBefore: options.createdBefore,
              modifiedSince: options.modifiedSince,
              modifiedBefore: options.modifiedBefore,
            },
            options.query
          );

          const result = await client.listCustomers({
            mailbox: options.mailbox,
            firstName: options.firstName,
            lastName: options.lastName,
            sortField: options.sortField,
            sortOrder: options.sortOrder,
            page: options.page ? parseInt(options.page, 10) : undefined,
            query,
          });
          outputJson(result);
        }
      )
    );

  cmd
    .command('view')
    .description('View a customer')
    .argument('<id>', 'Customer ID')
    .action(
      withErrorHandling(async (id: string) => {
        const customer = await client.getCustomer(parseIdArg(id, 'customer'));
        outputJson(customer);
      })
    );

  cmd
    .command('create')
    .description('Create a customer')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--email <email>', 'Email address')
    .option('--phone <phone>', 'Phone number')
    .action(
      withErrorHandling(
        async (options: {
          firstName?: string;
          lastName?: string;
          email?: string;
          phone?: string;
        }) => {
          const data = {
            ...(options.firstName && { firstName: options.firstName }),
            ...(options.lastName && { lastName: options.lastName }),
            ...(options.email && { emails: [{ type: 'work', value: options.email }] }),
            ...(options.phone && { phones: [{ type: 'work', value: options.phone }] }),
          };
          requireAtLeastOneField(data, 'Customer create');
          const result = await client.createCustomer(data);
          outputJson({ message: 'Customer created', id: result.id });
        }
      )
    );

  cmd
    .command('update')
    .description('Update a customer')
    .argument('<id>', 'Customer ID')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--job-title <title>', 'Job title')
    .option('--location <location>', 'Location')
    .option('--organization <org>', 'Organization')
    .option('--background <text>', 'Background notes')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            firstName?: string;
            lastName?: string;
            jobTitle?: string;
            location?: string;
            organization?: string;
            background?: string;
          }
        ) => {
          const data = {
            ...(options.firstName && { firstName: options.firstName }),
            ...(options.lastName && { lastName: options.lastName }),
            ...(options.jobTitle && { jobTitle: options.jobTitle }),
            ...(options.location && { location: options.location }),
            ...(options.organization && { organization: options.organization }),
            ...(options.background && { background: options.background }),
          };
          requireAtLeastOneField(data, 'Customer update');
          await client.updateCustomer(parseIdArg(id, 'customer'), data);
          outputJson({ message: 'Customer updated' });
        }
      )
    );

  cmd
    .command('delete')
    .description('Delete a customer')
    .argument('<id>', 'Customer ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        requireConfirmation('customer', options.yes);
        await client.deleteCustomer(parseIdArg(id, 'customer'));
        outputJson({ message: 'Customer deleted' });
      })
    );

  // Customer Emails
  cmd
    .command('emails')
    .description('List customer emails')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const emails = await client.listCustomerEmails(parseIdArg(customerId, 'customer'));
        outputJson(emails);
      })
    );

  cmd
    .command('add-email')
    .description('Add email to customer')
    .argument('<customerId>', 'Customer ID')
    .requiredOption('--type <type>', 'Email type (home, work, other)')
    .requiredOption('--value <email>', 'Email address')
    .action(
      withErrorHandling(
        async (customerId: string, options: { type: string; value: string }) => {
          await client.createCustomerEmail(parseIdArg(customerId, 'customer'), {
            type: options.type,
            value: options.value,
          });
          outputJson({ message: 'Email added' });
        }
      )
    );

  cmd
    .command('update-email')
    .description('Update customer email')
    .argument('<customerId>', 'Customer ID')
    .argument('<emailId>', 'Email ID')
    .option('--type <type>', 'Email type (home, work, other)')
    .option('--value <email>', 'Email address')
    .action(
      withErrorHandling(
        async (
          customerId: string,
          emailId: string,
          options: { type?: string; value?: string }
        ) => {
          const data = {
            ...(options.type && { type: options.type }),
            ...(options.value && { value: options.value }),
          };
          requireAtLeastOneField(data, 'Email update');
          await client.updateCustomerEmail(
            parseIdArg(customerId, 'customer'),
            parseIdArg(emailId, 'email'),
            data
          );
          outputJson({ message: 'Email updated' });
        }
      )
    );

  cmd
    .command('delete-email')
    .description('Delete customer email')
    .argument('<customerId>', 'Customer ID')
    .argument('<emailId>', 'Email ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (customerId: string, emailId: string, options: { yes?: boolean }) => {
          requireConfirmation('email', options.yes);
          await client.deleteCustomerEmail(
            parseIdArg(customerId, 'customer'),
            parseIdArg(emailId, 'email')
          );
          outputJson({ message: 'Email deleted' });
        }
      )
    );

  // Customer Phones
  cmd
    .command('phones')
    .description('List customer phones')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const phones = await client.listCustomerPhones(parseIdArg(customerId, 'customer'));
        outputJson(phones);
      })
    );

  cmd
    .command('add-phone')
    .description('Add phone to customer')
    .argument('<customerId>', 'Customer ID')
    .requiredOption('--type <type>', 'Phone type (home, work, mobile, fax, pager, other)')
    .requiredOption('--value <phone>', 'Phone number')
    .action(
      withErrorHandling(
        async (customerId: string, options: { type: string; value: string }) => {
          await client.createCustomerPhone(parseIdArg(customerId, 'customer'), {
            type: options.type,
            value: options.value,
          });
          outputJson({ message: 'Phone added' });
        }
      )
    );

  cmd
    .command('update-phone')
    .description('Update customer phone')
    .argument('<customerId>', 'Customer ID')
    .argument('<phoneId>', 'Phone ID')
    .option('--type <type>', 'Phone type (home, work, mobile, fax, pager, other)')
    .option('--value <phone>', 'Phone number')
    .action(
      withErrorHandling(
        async (
          customerId: string,
          phoneId: string,
          options: { type?: string; value?: string }
        ) => {
          const data = {
            ...(options.type && { type: options.type }),
            ...(options.value && { value: options.value }),
          };
          requireAtLeastOneField(data, 'Phone update');
          await client.updateCustomerPhone(
            parseIdArg(customerId, 'customer'),
            parseIdArg(phoneId, 'phone'),
            data
          );
          outputJson({ message: 'Phone updated' });
        }
      )
    );

  cmd
    .command('delete-phone')
    .description('Delete customer phone')
    .argument('<customerId>', 'Customer ID')
    .argument('<phoneId>', 'Phone ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (customerId: string, phoneId: string, options: { yes?: boolean }) => {
          requireConfirmation('phone', options.yes);
          await client.deleteCustomerPhone(
            parseIdArg(customerId, 'customer'),
            parseIdArg(phoneId, 'phone')
          );
          outputJson({ message: 'Phone deleted' });
        }
      )
    );

  // Customer Chat Handles
  cmd
    .command('chats')
    .description('List customer chat handles')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const chats = await client.listCustomerChats(parseIdArg(customerId, 'customer'));
        outputJson(chats);
      })
    );

  cmd
    .command('add-chat')
    .description('Add chat handle to customer')
    .argument('<customerId>', 'Customer ID')
    .requiredOption('--type <type>', 'Chat type (e.g. aim, gtalk, msn, xmpp, skype, other)')
    .requiredOption('--value <handle>', 'Chat handle')
    .action(
      withErrorHandling(async (customerId: string, options: { type: string; value: string }) => {
        await client.createCustomerChat(parseIdArg(customerId, 'customer'), {
          type: options.type,
          value: options.value,
        });
        outputJson({ message: 'Chat handle added' });
      })
    );

  cmd
    .command('update-chat')
    .description('Update customer chat handle')
    .argument('<customerId>', 'Customer ID')
    .argument('<chatId>', 'Chat handle ID')
    .option('--type <type>', 'Chat type')
    .option('--value <handle>', 'Chat handle')
    .action(
      withErrorHandling(
        async (customerId: string, chatId: string, options: { type?: string; value?: string }) => {
          const data = {
            ...(options.type && { type: options.type }),
            ...(options.value && { value: options.value }),
          };
          requireAtLeastOneField(data, 'Chat handle update');
          await client.updateCustomerChat(
            parseIdArg(customerId, 'customer'),
            parseIdArg(chatId, 'chat handle'),
            data
          );
          outputJson({ message: 'Chat handle updated' });
        }
      )
    );

  cmd
    .command('delete-chat')
    .description('Delete customer chat handle')
    .argument('<customerId>', 'Customer ID')
    .argument('<chatId>', 'Chat handle ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (customerId: string, chatId: string, options: { yes?: boolean }) => {
        requireConfirmation('chat handle', options.yes);
        await client.deleteCustomerChat(
          parseIdArg(customerId, 'customer'),
          parseIdArg(chatId, 'chat handle')
        );
        outputJson({ message: 'Chat handle deleted' });
      })
    );

  // Customer Social Profiles
  cmd
    .command('social-profiles')
    .description('List customer social profiles')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const profiles = await client.listCustomerSocialProfiles(parseIdArg(customerId, 'customer'));
        outputJson(profiles);
      })
    );

  cmd
    .command('add-social-profile')
    .description('Add social profile to customer')
    .argument('<customerId>', 'Customer ID')
    .requiredOption('--type <type>', 'Profile type (e.g. twitter, facebook, linkedin, other)')
    .requiredOption('--value <url>', 'Profile URL or handle')
    .action(
      withErrorHandling(async (customerId: string, options: { type: string; value: string }) => {
        await client.createCustomerSocialProfile(parseIdArg(customerId, 'customer'), {
          type: options.type,
          value: options.value,
        });
        outputJson({ message: 'Social profile added' });
      })
    );

  cmd
    .command('update-social-profile')
    .description('Update customer social profile')
    .argument('<customerId>', 'Customer ID')
    .argument('<socialProfileId>', 'Social profile ID')
    .option('--type <type>', 'Profile type')
    .option('--value <url>', 'Profile URL or handle')
    .action(
      withErrorHandling(
        async (
          customerId: string,
          socialProfileId: string,
          options: { type?: string; value?: string }
        ) => {
          const data = {
            ...(options.type && { type: options.type }),
            ...(options.value && { value: options.value }),
          };
          requireAtLeastOneField(data, 'Social profile update');
          await client.updateCustomerSocialProfile(
            parseIdArg(customerId, 'customer'),
            parseIdArg(socialProfileId, 'social profile'),
            data
          );
          outputJson({ message: 'Social profile updated' });
        }
      )
    );

  cmd
    .command('delete-social-profile')
    .description('Delete customer social profile')
    .argument('<customerId>', 'Customer ID')
    .argument('<socialProfileId>', 'Social profile ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (customerId: string, socialProfileId: string, options: { yes?: boolean }) => {
          requireConfirmation('social profile', options.yes);
          await client.deleteCustomerSocialProfile(
            parseIdArg(customerId, 'customer'),
            parseIdArg(socialProfileId, 'social profile')
          );
          outputJson({ message: 'Social profile deleted' });
        }
      )
    );

  // Customer Websites
  cmd
    .command('websites')
    .description('List customer websites')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const websites = await client.listCustomerWebsites(parseIdArg(customerId, 'customer'));
        outputJson(websites);
      })
    );

  cmd
    .command('add-website')
    .description('Add website to customer')
    .argument('<customerId>', 'Customer ID')
    .requiredOption('--value <url>', 'Website URL')
    .action(
      withErrorHandling(async (customerId: string, options: { value: string }) => {
        await client.createCustomerWebsite(parseIdArg(customerId, 'customer'), {
          value: options.value,
        });
        outputJson({ message: 'Website added' });
      })
    );

  cmd
    .command('update-website')
    .description('Update customer website')
    .argument('<customerId>', 'Customer ID')
    .argument('<websiteId>', 'Website ID')
    .requiredOption('--value <url>', 'Website URL')
    .action(
      withErrorHandling(
        async (customerId: string, websiteId: string, options: { value: string }) => {
          await client.updateCustomerWebsite(
            parseIdArg(customerId, 'customer'),
            parseIdArg(websiteId, 'website'),
            { value: options.value }
          );
          outputJson({ message: 'Website updated' });
        }
      )
    );

  cmd
    .command('delete-website')
    .description('Delete customer website')
    .argument('<customerId>', 'Customer ID')
    .argument('<websiteId>', 'Website ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(
        async (customerId: string, websiteId: string, options: { yes?: boolean }) => {
          requireConfirmation('website', options.yes);
          await client.deleteCustomerWebsite(
            parseIdArg(customerId, 'customer'),
            parseIdArg(websiteId, 'website')
          );
          outputJson({ message: 'Website deleted' });
        }
      )
    );

  // Customer Address (a single address per customer)
  const parseAddressOptions = (options: {
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    lines?: string;
  }) => ({
    ...(options.city && { city: options.city }),
    ...(options.state && { state: options.state }),
    ...(options.postalCode && { postalCode: options.postalCode }),
    ...(options.country && { country: options.country }),
    ...(options.lines && { lines: options.lines.split(',').map((line) => line.trim()) }),
  });

  cmd
    .command('address')
    .description('Get a customer address')
    .argument('<customerId>', 'Customer ID')
    .action(
      withErrorHandling(async (customerId: string) => {
        const address = await client.getCustomerAddress(parseIdArg(customerId, 'customer'));
        outputJson(address);
      })
    );

  cmd
    .command('add-address')
    .description('Add an address to a customer')
    .argument('<customerId>', 'Customer ID')
    .option('--city <city>', 'City')
    .option('--state <state>', 'State')
    .option('--postal-code <code>', 'Postal code')
    .option('--country <country>', 'Country')
    .option('--lines <lines>', 'Address lines (comma-separated)')
    .action(
      withErrorHandling(
        async (
          customerId: string,
          options: {
            city?: string;
            state?: string;
            postalCode?: string;
            country?: string;
            lines?: string;
          }
        ) => {
          const data = parseAddressOptions(options);
          requireAtLeastOneField(data, 'Address');
          await client.createCustomerAddress(parseIdArg(customerId, 'customer'), data);
          outputJson({ message: 'Address added' });
        }
      )
    );

  cmd
    .command('update-address')
    .description('Update a customer address')
    .argument('<customerId>', 'Customer ID')
    .option('--city <city>', 'City')
    .option('--state <state>', 'State')
    .option('--postal-code <code>', 'Postal code')
    .option('--country <country>', 'Country')
    .option('--lines <lines>', 'Address lines (comma-separated)')
    .action(
      withErrorHandling(
        async (
          customerId: string,
          options: {
            city?: string;
            state?: string;
            postalCode?: string;
            country?: string;
            lines?: string;
          }
        ) => {
          const data = parseAddressOptions(options);
          requireAtLeastOneField(data, 'Address update');
          await client.updateCustomerAddress(parseIdArg(customerId, 'customer'), data);
          outputJson({ message: 'Address updated' });
        }
      )
    );

  cmd
    .command('delete-address')
    .description('Delete a customer address')
    .argument('<customerId>', 'Customer ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (customerId: string, options: { yes?: boolean }) => {
        requireConfirmation('address', options.yes);
        await client.deleteCustomerAddress(parseIdArg(customerId, 'customer'));
        outputJson({ message: 'Address deleted' });
      })
    );

  // Overwrite Customer (full replace — clears omitted fields)
  cmd
    .command('overwrite')
    .description('Overwrite a customer (full replace — omitted fields are cleared)')
    .argument('<id>', 'Customer ID')
    .option('--first-name <name>', 'First name')
    .option('--last-name <name>', 'Last name')
    .option('--phone <phone>', 'Phone number')
    .option('--photo-url <url>', 'Photo URL')
    .option('--job-title <title>', 'Job title')
    .option('--photo-type <type>', 'Photo type')
    .option('--background <text>', 'Background notes')
    .option('--location <location>', 'Location')
    .option('--organization <org>', 'Organization')
    .option('--organization-id <id>', 'Organization ID')
    .option('--gender <gender>', 'Gender')
    .option('--age <age>', 'Age')
    .option('-y, --yes', 'Skip confirmation (this clears omitted fields)')
    .action(
      withErrorHandling(
        async (
          id: string,
          options: {
            firstName?: string;
            lastName?: string;
            phone?: string;
            photoUrl?: string;
            jobTitle?: string;
            photoType?: string;
            background?: string;
            location?: string;
            organization?: string;
            organizationId?: string;
            gender?: string;
            age?: string;
            yes?: boolean;
          }
        ) => {
          requireConfirmation('customer (full overwrite — omitted fields are cleared)', options.yes);
          const data = {
            ...(options.firstName && { firstName: options.firstName }),
            ...(options.lastName && { lastName: options.lastName }),
            ...(options.phone && { phone: options.phone }),
            ...(options.photoUrl && { photoUrl: options.photoUrl }),
            ...(options.jobTitle && { jobTitle: options.jobTitle }),
            ...(options.photoType && { photoType: options.photoType }),
            ...(options.background && { background: options.background }),
            ...(options.location && { location: options.location }),
            ...(options.organization && { organization: options.organization }),
            ...(options.organizationId && {
              organizationId: parseIdArg(options.organizationId, 'organization'),
            }),
            ...(options.gender && { gender: options.gender }),
            ...(options.age && { age: options.age }),
          };
          requireAtLeastOneField(data, 'Customer overwrite');
          await client.overwriteCustomer(parseIdArg(id, 'customer'), data);
          outputJson({ message: 'Customer overwritten' });
        }
      )
    );

  cmd
    .command('delete-async')
    .description('Delete a customer asynchronously (GDPR erasure; returns immediately)')
    .argument('<id>', 'Customer ID')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (id: string, options: { yes?: boolean }) => {
        requireConfirmation('customer', options.yes);
        await client.deleteCustomerAsync(parseIdArg(id, 'customer'));
        outputJson({ message: 'Customer deletion queued' });
      })
    );

  // Customer Property Definitions (company-wide)
  cmd
    .command('property-definitions')
    .description('List customer property definitions')
    .action(
      withErrorHandling(async () => {
        const defs = await client.listCustomerPropertyDefinitions();
        outputJson(defs);
      })
    );

  cmd
    .command('create-property-definition')
    .description('Create a customer property definition')
    .requiredOption('--type <type>', 'Property type: number, text, url, date, or dropdown')
    .requiredOption('--slug <slug>', 'Unique slug (alphanumeric, hyphens, underscores)')
    .requiredOption('--name <name>', 'Display name')
    .option('--options <labels>', 'Dropdown options as comma-separated labels')
    .action(
      withErrorHandling(
        async (options: { type: string; slug: string; name: string; options?: string }) => {
          await client.createCustomerPropertyDefinition({
            type: options.type as 'number' | 'text' | 'url' | 'date' | 'dropdown',
            slug: options.slug,
            name: options.name,
            ...(options.options && {
              options: options.options.split(',').map((label) => ({ label: label.trim() })),
            }),
          });
          outputJson({ message: 'Property definition created' });
        }
      )
    );

  cmd
    .command('delete-property-definition')
    .description('Delete a customer property definition by slug')
    .argument('<slug>', 'Property slug')
    .option('-y, --yes', 'Skip confirmation')
    .action(
      withErrorHandling(async (slug: string, options: { yes?: boolean }) => {
        requireConfirmation('property definition', options.yes);
        await client.deleteCustomerPropertyDefinition(slug);
        outputJson({ message: 'Property definition deleted' });
      })
    );

  cmd
    .command('set-properties')
    .description("Set or remove a customer's property values (JSON Patch)")
    .argument('<customerId>', 'Customer ID')
    .option('--set <pairs>', 'slug=value pairs, comma-separated (replace)')
    .option('--remove <slugs>', 'Slugs to remove, comma-separated')
    .action(
      withErrorHandling(
        async (customerId: string, options: { set?: string; remove?: string }) => {
          const operations: CustomerPropertyOperation[] = [];
          if (options.set) {
            for (const pair of options.set.split(',')) {
              const idx = pair.indexOf('=');
              if (idx === -1) continue;
              const slug = pair.slice(0, idx).trim();
              const value = pair.slice(idx + 1).trim();
              if (slug) operations.push({ op: 'replace', path: `/${slug}`, value });
            }
          }
          if (options.remove) {
            for (const slug of options.remove.split(',')) {
              const trimmed = slug.trim();
              if (trimmed) operations.push({ op: 'remove', path: `/${trimmed}` });
            }
          }
          if (operations.length === 0) {
            throw new Error('Provide --set and/or --remove with at least one property');
          }
          await client.updateCustomerProperties(parseIdArg(customerId, 'customer'), operations);
          outputJson({ message: 'Customer properties updated' });
        }
      )
    );

  return cmd;
}
