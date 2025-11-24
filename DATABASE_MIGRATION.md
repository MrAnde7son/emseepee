# Database Migration Guide

This project has been migrated from file-based storage to database storage. The system now supports both PostgreSQL and SQLite (in-memory by default).

## Features

- **Config Storage**: MCP server proxies, tool proxies, and policy rules are now stored in the database
- **Event Logging**: All gateway events are stored in the database
- **User Management**: User accounts can be stored in the database (for future authentication features)

## Database Configuration

### PostgreSQL (Production)

Set the following environment variables to use PostgreSQL:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=hakuna
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
```

### SQLite (Development/Default)

If PostgreSQL environment variables are not set, the system will automatically use an in-memory SQLite database. This is suitable for development and testing.

**Note**: In-memory SQLite databases are cleared when the server restarts. For persistent SQLite storage, you can modify `src/db/connection.ts` to use a file-based SQLite database.

## Installation

Install the new database dependencies:

```bash
npm install
```

This will install:
- `pg` - PostgreSQL client
- `better-sqlite3` - SQLite database
- `@types/pg` - TypeScript types for PostgreSQL
- `@types/better-sqlite3` - TypeScript types for SQLite

## Migration from config.json

If you have an existing `config.json` file, you can migrate it to the database:

1. **Automatic Migration**: The system will automatically migrate your `config.json` to the database on first startup if the database is empty.

2. **Manual Migration**: You can also run the migration script manually:

```bash
# Build first
npm run build

# Migrate (only if database is empty)
npm run migrate

# Force overwrite existing config in database
npm run migrate:force
```

Or directly:
```bash
node dist/db/migrate.js           # Migrate only if database is empty
node dist/db/migrate.js --force  # Force overwrite existing config
```

## How It Works

### Configuration Loading

The system now loads configuration from the database:
- On startup, if the database is empty, it will attempt to load from `config.json` and migrate it
- All configuration changes through the API are saved to the database
- The `config.json` file can still be used as a backup, but changes are stored in the database

### Event Logging

All gateway events are now stored in the database:
- Events are automatically saved when tools are executed
- The API endpoint `/api/events` retrieves events from the database
- Events are automatically cleaned up (keeps last 10,000 events)

### User Management

User management is now available through the database:
- User accounts can be created, updated, and deleted
- Password hashing is handled automatically
- Ready for integration with authentication systems

## API Changes

All API endpoints continue to work as before, but now use the database:

- `GET /api/policies` - Retrieves policies from database
- `POST /api/policies` - Saves policy to database
- `PUT /api/policies/:id` - Updates policy in database
- `DELETE /api/policies/:id` - Deletes policy from database
- `GET /api/events` - Retrieves events from database
- `POST /api/tools/:id/enable` - Updates tool configuration in database
- `POST /api/tools/:id/disable` - Updates tool configuration in database

## Backward Compatibility

The system maintains backward compatibility:
- If the database is not available, it falls back to file-based storage
- Existing `config.json` files are automatically migrated
- The file-based config loader is still available as a fallback

## Database Schema

The database includes three main tables:

1. **config** - Stores configuration (mcpServerProxies, toolsProxies, policyRules)
2. **events** - Stores gateway events
3. **users** - Stores user accounts

## Troubleshooting

### Database Connection Errors

If you see database connection errors:
1. Check that PostgreSQL is running (if using PostgreSQL)
2. Verify environment variables are set correctly
3. The system will fall back to file storage if the database is unavailable

### Migration Issues

If migration fails:
1. Check that the database schema was created successfully
2. Verify that `config.json` is valid JSON
3. Check the logs for specific error messages

## Next Steps

1. Install dependencies: `npm install`
2. Set up PostgreSQL (optional, for production)
3. Start the server: `npm start`
4. The system will automatically migrate your existing `config.json` on first run

