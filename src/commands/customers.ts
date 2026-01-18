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
        }) => {
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
          await client.createCustomer(data);
          outputJson({ message: 'Customer created' });
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

  return cmd;
}
