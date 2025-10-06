# Railway Deployment Checklist

## Pre-deployment Checklist

### [ ] 1. Code Preparation
- [ ] Ensure all code is committed and pushed to repository
- [ ] Verify that the application builds locally with `npm run build`
- [ ] Test the application locally with `npm start`
- [ ] Check that all required files are included (Dockerfile, railway.json, etc.)

### [ ] 2. Environment Variables
- [ ] Collect all required Azure service credentials
- [ ] Prepare production-ready JWT secret
- [ ] Verify database connection details
- [ ] Confirm all Azure service endpoints and keys

### [ ] 3. Railway Project Setup
- [ ] Create new Railway project
- [ ] Connect to GitHub repository or prepare code upload
- [ ] Configure project name and region

## Deployment Steps

### [ ] 1. Environment Configuration
- [ ] Add all environment variables to Railway dashboard:
  - [ ] Azure Key Vault settings
  - [ ] Microsoft Authentication credentials
  - [ ] Azure service connections (SQL, Storage, OpenAI, etc.)
  - [ ] Security settings (JWT secret, admin emails)
  - [ ] Database configuration
  - [ ] Application settings (BYPASS_AUTH=false, NODE_ENV=production)

### [ ] 2. Service Configuration
- [ ] Set PORT variable (Railway usually sets this automatically)
- [ ] Configure domain settings if needed
- [ ] Set up any required SSL certificates

### [ ] 3. Deploy Application
- [ ] Trigger deployment from Railway dashboard
- [ ] Monitor build logs for errors
- [ ] Verify that TypeScript compilation succeeds
- [ ] Check that container starts successfully

### [ ] 4. Post-deployment Verification
- [ ] Test health endpoint: `https://your-app.railway.app/health`
- [ ] Verify API endpoints are accessible
- [ ] Test authentication flow
- [ ] Check database connectivity
- [ ] Verify Azure service integrations

## Common Issues and Solutions

### Environment Variables
- **Issue**: Missing environment variables
- **Solution**: Double-check all variables are set in Railway dashboard

### Database Connection
- **Issue**: Cannot connect to Azure SQL Database
- **Solution**: 
  - Verify connection string format
  - Check firewall rules for Azure SQL
  - Confirm credentials are correct

### Build Failures
- **Issue**: TypeScript compilation errors
- **Solution**: 
  - Check for missing dependencies
  - Verify tsconfig.json settings
  - Ensure all TypeScript files compile locally

### Runtime Errors
- **Issue**: Application crashes on startup
- **Solution**:
  - Check Railway logs for error messages
  - Verify all required environment variables
  - Test locally with same environment configuration

## Testing Checklist

### [ ] API Endpoints
- [ ] `/health` - Should return 200 OK
- [ ] `/api` - Should return API information
- [ ] `/api/auth/login` - Should handle login requests
- [ ] `/api/chat` - Should handle chat requests (when authenticated)

### [ ] Authentication
- [ ] Login with valid credentials works
- [ ] Invalid credentials are rejected
- [ ] JWT tokens are generated correctly

### [ ] Azure Services
- [ ] Database queries work
- [ ] Blob storage operations succeed
- [ ] OpenAI requests return responses
- [ ] Key Vault secrets can be accessed

## Monitoring and Maintenance

### [ ] Health Monitoring
- [ ] Set up Railway health checks
- [ ] Configure alerting for downtime
- [ ] Monitor application logs

### [ ] Performance
- [ ] Monitor response times
- [ ] Check resource utilization
- [ ] Set up scaling policies if needed

### [ ] Security
- [ ] Regularly rotate credentials
- [ ] Monitor for security vulnerabilities
- [ ] Keep dependencies up to date

## Rollback Plan

### If Deployment Fails
1. [ ] Check Railway logs for error details
2. [ ] Verify environment variables
3. [ ] Test locally with same configuration
4. [ ] Fix issues and redeploy
5. [ ] If critical, rollback to previous deployment in Railway

## Success Criteria

### [ ] Application is Running
- [ ] Railway shows deployment as successful
- [ ] Health endpoint returns 200 OK
- [ ] Application responds to API requests

### [ ] Services are Connected
- [ ] Database operations work
- [ ] Azure services are accessible
- [ ] Authentication is functional

### [ ] Performance is Acceptable
- [ ] Response times are within acceptable limits
- [ ] No errors in application logs
- [ ] Resource usage is within limits