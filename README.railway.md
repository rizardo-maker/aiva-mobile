# Deploying to Railway

This guide explains how to deploy the AIVA Backend API to Railway.

## Prerequisites

1. A Railway account (railway.app)
2. All required environment variables (see below)

## Deployment Steps

1. Fork this repository or prepare your code for deployment
2. Create a new project on Railway
3. Connect your repository or upload your code
4. Configure the environment variables (see below)
5. Deploy!

## Environment Variables

The following environment variables need to be configured in your Railway project:

### Azure Services Configuration
- `AZURE_KEY_VAULT_URL` - Your Azure Key Vault URL
- `AZURE_TENANT_ID` - Your Azure Tenant ID
- `AZURE_CLIENT_ID` - Your Azure Client ID
- `AZURE_CLIENT_SECRET` - Your Azure Client Secret
- `MICROSOFT_REDIRECT_URI` - Microsoft OAuth redirect URI
- `AZURE_AUTHORITY_HOST` - Azure authority host (usually https://login.microsoftonline.com)
- `AZURE_APP_CONFIG_CONNECTION_STRING` - Azure App Configuration connection string
- `AZURE_AI_SEARCH_ENDPOINT` - Azure AI Search endpoint
- `AZURE_AI_SEARCH_API_KEY` - Azure AI Search API key
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT_NAME` - Azure OpenAI deployment name
- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` - Azure Document Intelligence endpoint
- `AZURE_DOCUMENT_INTELLIGENCE_KEY` - Azure Document Intelligence key
- `AZURE_STORAGE_ACCOUNT_NAME` - Azure Storage account name
- `AZURE_STORAGE_ACCOUNT_KEY` - Azure Storage account key
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Storage connection string
- `AZURE_STORAGE_CONTAINER_NAME` - Azure Storage container name

### Database Configuration
- `SQL_SERVER` - SQL Server hostname
- `SQL_DATABASE` - Database name
- `SQL_USERNAME` - Database username
- `SQL_PASSWORD` - Database password
- `SQL_ENCRYPT` - Encrypt database connections (true/false)
- `SQL_TRUST_SERVER_CERTIFICATE` - Trust server certificate (true/false)

### Security Configuration
- `JWT_SECRET` - JWT secret key (use a strong secret in production)
- `JWT_EXPIRES_IN` - JWT expiration time (e.g., 24h)
- `ADMIN_EMAILS` - Comma-separated list of admin emails

### Application Configuration
- `PORT` - Port for the application (Railway will set this automatically)
- `NODE_ENV` - Node environment (production/development)
- `BYPASS_AUTH` - Bypass authentication for testing (false in production)

### Mock Services Configuration
- `MOCK_SQL` - Mock SQL database (true/false)
- `MOCK_DATABASE` - Mock database (true/false)
- `MOCK_STORAGE` - Mock storage (true/false)
- `MOCK_APP_CONFIG` - Mock app configuration (true/false)
- `MOCK_OPENAI` - Mock OpenAI (true/false)

## Deployment Process

Railway will automatically:
1. Install dependencies using `npm ci`
2. Run the `postinstall` script which builds the TypeScript files
3. Start the application using the `start` script

The application will be available at the URL provided by Railway.

## Health Checks

Railway uses the `/health` endpoint for health checks. The application exposes this endpoint which returns a JSON response indicating the service status.

## Troubleshooting

If you encounter issues during deployment:

1. Check that all required environment variables are set
2. Verify that your Azure credentials are correct
3. Ensure your database connection details are correct
4. Check the Railway logs for error messages
5. Make sure the PORT environment variable is being used correctly