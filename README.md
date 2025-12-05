# Help Scout CLI

A command-line interface for Help Scout, designed for LLMs and developers.

## Installation

```bash
npm install -g @stephendolan/helpscout-cli
```

## Authentication

Help Scout uses OAuth 2.0. Create an OAuth application at [Help Scout > Your Profile > My Apps](https://secure.helpscout.net/authentication/authorizeClientApplication).

```bash
helpscout auth login --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
```

Or use environment variables:
```bash
export HELPSCOUT_APP_ID=your_app_id
export HELPSCOUT_APP_SECRET=your_app_secret
```

## Usage

### Conversations

```bash
# List conversations
helpscout conversations list
helpscout conversations list --status active
helpscout conversations list --mailbox 123 --tag urgent

# View a conversation
helpscout conversations view 456

# View conversation threads
helpscout conversations threads 456

# Add/remove tags
helpscout conversations add-tag 456 urgent
helpscout conversations remove-tag 456 urgent

# Reply to a conversation
helpscout conversations reply 456 --text "Thank you for reaching out!"

# Add a note
helpscout conversations note 456 --text "Internal note here"

# Delete a conversation
helpscout conversations delete 456
```

### Customers

```bash
# List customers
helpscout customers list
helpscout customers list --first-name John

# View a customer
helpscout customers view 789

# Create a customer
helpscout customers create --first-name John --last-name Doe --email john@example.com

# Update a customer
helpscout customers update 789 --organization "Acme Corp"

# Delete a customer
helpscout customers delete 789
```

### Tags

```bash
# List all tags
helpscout tags list

# View a tag
helpscout tags view 123
```

### Workflows

```bash
# List workflows
helpscout workflows list
helpscout workflows list --type manual

# Run a manual workflow
helpscout workflows run 123 --conversations 456,789

# Activate/deactivate
helpscout workflows activate 123
helpscout workflows deactivate 123
```

### Mailboxes

```bash
# List mailboxes
helpscout mailboxes list

# View a mailbox
helpscout mailboxes view 123

# Set default mailbox
helpscout mailboxes set-default 123
```

## Options

- `-c, --compact` - Output minified JSON (single line)
- `--help` - Show help for any command

## Output

All commands output JSON for easy parsing:

```bash
helpscout conversations list | jq '.conversations[].subject'
```

## License

MIT
