# Deploying Hakuna Gateway to Render

This guide walks you through deploying both the backend API and frontend dashboard to Render.

## Prerequisites

1. A [Render](https://render.com) account
2. Your code pushed to a Git repository (GitHub, GitLab, or Bitbucket)
3. Environment variables ready (JWT_SECRET, API keys, etc.)

## Quick Deploy Using render.yaml

The easiest way to deploy is using the included `render.yaml` file:

### Step 1: Connect Your Repository

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your Git repository
4. Render will automatically detect `render.yaml` and create the services

### Step 2: Configure Environment Variables

After the services are created, you need to add your environment variables:

#### Backend Service (`hakuna-backend`)

Go to the backend service → **Environment** tab and add:

- `JWT_SECRET` - A secure random string for JWT token signing (required)
- Any API keys needed for MCP servers (e.g., `GITHUB_TOKEN`, `SLACK_API_KEY`, etc.)
- `AGENT_ENV` - Environment name (e.g., `prod`, `staging`) - optional, defaults to `dev`
- `ENABLED_TOOL_CATEGORIES` - Comma-separated list of tool categories to enable - optional

#### Frontend Service (`hakuna-frontend`)

The frontend will automatically get `NEXT_PUBLIC_GATEWAY_URL` from the backend service, but you can override it if needed.

### Step 3: Deploy

Render will automatically deploy when you:
- Push changes to your repository
- Manually trigger a deploy from the dashboard
- Update environment variables (auto-deploys)

## Manual Setup (Alternative)

If you prefer to set up services manually:

### Backend Service

1. **Create a new Web Service**
   - Name: `hakuna-backend`
   - Environment: `Node`
   - Build Command: `pnpm install --frozen-lockfile && pnpm run build`
   - Start Command: `pnpm run start`
   - Root Directory: `/` (root of repository)

2. **Add Environment Variables:**
   ```
   NODE_ENV=production
   GATEWAY_API_PORT=8000
   POSTGRES_HOST=<from database>
   POSTGRES_PORT=<from database>
   POSTGRES_DATABASE=<from database>
   POSTGRES_USER=<from database>
   POSTGRES_PASSWORD=<from database>
   JWT_SECRET=<your-secret-key>
   ```

3. **Create PostgreSQL Database:**
   - Name: `hakuna-db`
   - Plan: `Free` (or `Starter`/higher for production)
   - Connect it to the backend service

### Frontend Service

1. **Create a new Web Service**
   - Name: `hakuna-frontend`
   - Environment: `Node`
   - Build Command: `cd dashboard && pnpm install --frozen-lockfile && pnpm run build`
   - Start Command: `cd dashboard && pnpm run start`
   - Root Directory: `/` (root of repository)

2. **Add Environment Variables:**
   ```
   NODE_ENV=production
   NEXT_PUBLIC_GATEWAY_URL=https://hakuna-backend.onrender.com
   ```
   (Replace with your actual backend URL)

## Database Setup

The application supports both PostgreSQL (recommended for production) and SQLite. For Render, PostgreSQL is recommended:

1. **Create PostgreSQL Database:**
   - In Render Dashboard → **New +** → **PostgreSQL**
   - Name: `hakuna-db`
   - Plan: Choose based on your needs (Free tier available)

2. **Database Migrations:**
   The application automatically runs migrations on startup. If you need to run them manually:
   ```bash
   pnpm run migrate
   ```

## Post-Deployment

### Verify Backend

1. Check the backend logs to ensure it started successfully
2. Visit `https://your-backend.onrender.com/api/providers` to verify the API is working
3. The backend should show: `[API] Gateway API server listening on http://localhost:8000`

### Verify Frontend

1. Visit your frontend URL (e.g., `https://hakuna-frontend.onrender.com`)
2. You should see the login/register page
3. Create an account and verify the dashboard loads

### Initial Setup

1. **Register a user account** through the frontend
2. **Configure providers** in the dashboard (Settings → Providers)
3. **Set up policies** as needed (Policies page)
4. **Enable tools** you want to use (Tools page)

## Environment Variables Reference

### Backend Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `JWT_SECRET` | Yes | Secret key for JWT token signing | - |
| `GATEWAY_API_PORT` | No | Port for the API server | `8000` |
| `POSTGRES_HOST` | No* | PostgreSQL host | - |
| `POSTGRES_PORT` | No* | PostgreSQL port | `5432` |
| `POSTGRES_DATABASE` | No* | PostgreSQL database name | - |
| `POSTGRES_USER` | No* | PostgreSQL user | - |
| `POSTGRES_PASSWORD` | No* | PostgreSQL password | - |
| `AGENT_ENV` | No | Environment name (prod/staging/dev) | `dev` |
| `ENABLED_TOOL_CATEGORIES` | No | Comma-separated tool categories | All enabled |

*Required if using PostgreSQL. If not set, defaults to SQLite (not recommended for production on Render).

### Frontend Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_GATEWAY_URL` | Yes | Backend API URL | `http://localhost:8000` |

## Troubleshooting

### Backend won't start

1. Check logs for database connection errors
2. Verify PostgreSQL credentials are correct
3. Ensure `JWT_SECRET` is set
4. Check that the build completed successfully

### Frontend can't connect to backend

1. Verify `NEXT_PUBLIC_GATEWAY_URL` points to your backend URL
2. Check CORS settings (backend should allow frontend origin)
3. Ensure backend is running and accessible

### Database migration errors

1. Check database connection settings
2. Verify database user has CREATE TABLE permissions
3. Review migration logs in the backend service logs

### Build failures

1. Ensure `pnpm` is available (Render should auto-detect)
2. Check that all dependencies are in `package.json`
3. Verify Node.js version (requires >= 20.9.0)

## Production Considerations

1. **Database:** Use at least `Starter` plan for PostgreSQL (Free tier has limitations)
2. **Scaling:** Both services can be scaled horizontally if needed
3. **SSL:** Render provides SSL certificates automatically
4. **Monitoring:** Set up health checks and monitoring
5. **Backups:** Configure automatic PostgreSQL backups
6. **Secrets:** Use Render's environment variable encryption for sensitive values
7. **Custom Domain:** Configure custom domains in Render dashboard

## Cost Estimate

- **Free Tier:**
  - Backend: Free (with limitations)
  - Frontend: Free (with limitations)
  - Database: Free PostgreSQL (limited to 90 days, 1GB storage)

- **Starter Tier (Recommended for Production):**
  - Backend: $7/month
  - Frontend: $7/month
  - Database: $7/month
  - **Total: ~$21/month**

## Support

For issues specific to Render deployment, check:
- [Render Documentation](https://render.com/docs)
- [Render Community](https://community.render.com)

For Hakuna Gateway issues:
- Check the [README.md](README.md)
- Review [Getting Started Guide](docs/GETTING_STARTED.md)
- Open an issue on GitHub

