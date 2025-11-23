# Production Deployment Checklist

**Date Created:** 2025-11-20
**Application:** Customer Quotation App with Revenue Features
**Version:** 2.0

---

## 📋 Pre-Deployment Checklist

### Environment Setup

- [ ] **Production Server Provisioned**
  - Minimum specs: 2 CPU cores, 4GB RAM, 50GB storage
  - Operating system updated with latest security patches
  - Firewall configured (ports 80, 443, 3001 open)

- [ ] **Domain & SSL**
  - Domain name registered and DNS configured
  - SSL certificate obtained and installed
  - HTTPS enforced on all routes

- [ ] **Database Setup**
  - PostgreSQL 12+ installed and configured
  - Production database created
  - Database user with appropriate permissions created
  - Database backups configured (daily automated backups)
  - Connection pooling configured

- [ ] **Environment Variables**
  - All production `.env` variables set
  - Sensitive keys rotated from development
  - Email service credentials configured (AWS SES)
  - Database connection string updated
  - JWT secrets generated
  - API keys secured

### Code & Dependencies

- [ ] **Code Review**
  - All recent changes peer-reviewed
  - No console.log or debug code in production builds
  - Error handling implemented for all critical paths
  - Input validation in place for all user inputs

- [ ] **Dependencies**
  - All npm dependencies up to date
  - No security vulnerabilities (`npm audit`)
  - Production dependencies only (devDependencies excluded from build)
  - Package-lock.json committed

- [ ] **Build Process**
  - Frontend production build successful (`npm run build`)
  - Backend code tested with production environment variables
  - No build warnings or errors
  - Bundle size optimized (< 2MB total)

### Testing

- [ ] **Functional Testing**
  - All core features tested end-to-end
  - Quote creation, editing, saving tested
  - Revenue features (financing, warranties, delivery, rebates, trade-ins) tested
  - PDF generation tested (customer and internal)
  - Email sending tested
  - Customer management tested
  - Product management tested

- [ ] **Integration Testing**
  - Database connections verified
  - Email service (AWS SES) tested
  - File uploads tested
  - API endpoints responding correctly
  - Error responses formatted correctly

- [ ] **Performance Testing**
  - Load testing completed (100+ concurrent users)
  - Database queries optimized (< 100ms average)
  - Page load times acceptable (< 2s)
  - Large quote handling tested (50+ line items)

- [ ] **Security Testing**
  - SQL injection testing passed
  - XSS vulnerability testing passed
  - CSRF protection implemented
  - Authentication & authorization tested
  - Sensitive data encrypted
  - Rate limiting configured

### Data Migration

- [ ] **Database Migration**
  - All migration scripts tested on staging
  - Backup of current production data created
  - Migration scripts executed successfully
  - Data integrity verified
  - Rollback plan tested

- [ ] **Seed Data**
  - Revenue feature reference data loaded:
    - Delivery services
    - Warranty plans
    - Financing options
    - Rebates (if any active)
  - Test customers removed
  - Production customer data imported (if applicable)
  - Product catalog loaded

---

## 🚀 Deployment Steps

### Backend Deployment

1. **Stop Current Backend** (if applicable)
   ```bash
   pm2 stop quotation-backend
   # or
   systemctl stop quotation-backend
   ```

2. **Deploy Code**
   ```bash
   cd /var/www/quotation-app/backend
   git pull origin main
   # or upload files via FTP/SCP
   ```

3. **Install Dependencies**
   ```bash
   npm ci --production
   ```

4. **Run Database Migrations**
   ```bash
   node migrate-database.js
   # or use your migration tool
   ```

5. **Set Environment Variables**
   ```bash
   # Edit .env file with production values
   nano .env
   ```

6. **Start Backend**
   ```bash
   pm2 start server.js --name quotation-backend
   # or
   systemctl start quotation-backend
   ```

7. **Verify Backend**
   ```bash
   curl http://localhost:3001/api/health
   pm2 logs quotation-backend
   ```

### Frontend Deployment

1. **Build Production Bundle**
   ```bash
   cd frontend
   npm ci
   npm run build
   ```

2. **Deploy to Web Server**
   ```bash
   # Copy build files to web server
   scp -r build/* user@server:/var/www/quotation-app/frontend/
   # or use your deployment method
   ```

3. **Configure Web Server** (Nginx example)
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$server_name$request_uri;
   }

   server {
       listen 443 ssl;
       server_name yourdomain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       root /var/www/quotation-app/frontend;
       index index.html;

       location / {
           try_files $uri /index.html;
       }

       location /api {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

4. **Restart Web Server**
   ```bash
   sudo systemctl restart nginx
   # or
   sudo service nginx restart
   ```

5. **Verify Frontend**
   - Open https://yourdomain.com in browser
   - Check console for errors
   - Test login and basic navigation

---

## ✅ Post-Deployment Verification

### Smoke Tests

- [ ] **Application Access**
  - Application loads at production URL
  - HTTPS enforced
  - No console errors in browser
  - Login page accessible

- [ ] **Authentication**
  - User can log in
  - Session persists correctly
  - Logout works
  - Password reset works (if applicable)

- [ ] **Core Functionality**
  - Create new quote
  - Add products to quote
  - Add revenue features (financing, warranties, etc.)
  - Save quote
  - View saved quote
  - Generate PDF
  - Send email

- [ ] **Revenue Features**
  - Financing calculator works
  - Warranty selector displays options
  - Delivery calculator works
  - Rebates display correctly
  - Trade-in estimator works
  - Analytics dashboard loads

- [ ] **Backend APIs**
  - All API endpoints responding
  - Database connections stable
  - Email sending works
  - File uploads work

### Monitoring Setup

- [ ] **Application Monitoring**
  - PM2 monitoring configured
  - Process auto-restart enabled
  - Log rotation configured
  - Error tracking configured (e.g., Sentry)

- [ ] **Server Monitoring**
  - CPU usage monitoring
  - Memory usage monitoring
  - Disk space monitoring
  - Network monitoring
  - Alerts configured for high resource usage

- [ ] **Database Monitoring**
  - Connection pool monitoring
  - Query performance monitoring
  - Slow query logging enabled
  - Database backup verification

- [ ] **Log Management**
  - Application logs centralized
  - Log retention policy configured (30+ days)
  - Log search capability available
  - Error logs monitored

### Performance Verification

- [ ] **Response Times**
  - API response times < 500ms
  - Page load times < 2s
  - PDF generation < 3s
  - Database queries < 100ms average

- [ ] **Resource Usage**
  - CPU usage < 50% under normal load
  - Memory usage stable (no leaks)
  - Disk I/O acceptable
  - Network bandwidth sufficient

---

## 📱 Communication & Training

### Stakeholder Communication

- [ ] **Deployment Notification**
  - Stakeholders notified of deployment schedule
  - Downtime window communicated (if any)
  - Success notification sent after deployment
  - Known issues communicated

- [ ] **User Communication**
  - Users notified of new features
  - Release notes shared
  - Support contact information provided
  - Training sessions scheduled

### Training & Documentation

- [ ] **User Training**
  - Training materials prepared
  - Training sessions conducted
  - Q&A session held
  - Training videos recorded (if applicable)

- [ ] **Technical Documentation**
  - API documentation updated
  - Deployment process documented
  - Troubleshooting guide created
  - Architecture diagrams updated

---

## 🔄 Rollback Plan

In case of critical issues, follow this rollback procedure:

1. **Immediate Actions**
   ```bash
   # Stop current version
   pm2 stop quotation-backend

   # Restore previous version
   cd /var/www/quotation-app/backend
   git checkout previous-stable-tag

   # Restart
   pm2 start quotation-backend
   ```

2. **Database Rollback** (if needed)
   ```bash
   # Restore from backup
   psql quotation_db < backup-before-deployment.sql
   ```

3. **Communication**
   - Notify stakeholders of rollback
   - Document issue that caused rollback
   - Plan corrective actions

---

## 🛡️ Security Checklist

- [ ] **Access Control**
  - SSH key-based authentication only
  - Sudo access restricted
  - Database accessed only from application server
  - Firewalls configured correctly

- [ ] **Data Protection**
  - Passwords hashed with bcrypt
  - Sensitive data encrypted at rest
  - SSL/TLS for data in transit
  - Database backups encrypted

- [ ] **Application Security**
  - CORS configured correctly
  - Rate limiting enabled
  - Input sanitization implemented
  - SQL injection prevention verified
  - XSS protection enabled

- [ ] **Compliance**
  - Privacy policy updated
  - Terms of service updated
  - GDPR compliance (if applicable)
  - Data retention policies defined

---

## 📊 Success Metrics

Define and monitor these metrics post-deployment:

- **Uptime**: Target 99.9%
- **Response Time**: < 500ms average
- **Error Rate**: < 0.1%
- **Revenue Feature Adoption**: Track % of quotes with features
- **User Satisfaction**: Collect feedback
- **Support Tickets**: Monitor volume and resolution time

---

## 🚨 Emergency Contacts

**Technical Team:**
- DevOps Lead: [Name] - [Phone] - [Email]
- Backend Developer: [Name] - [Phone] - [Email]
- Frontend Developer: [Name] - [Phone] - [Email]
- Database Admin: [Name] - [Phone] - [Email]

**Business Stakeholders:**
- Product Owner: [Name] - [Phone] - [Email]
- Sales Manager: [Name] - [Phone] - [Email]

**External Services:**
- AWS Support: [Account ID]
- Domain Registrar: [Account Info]
- SSL Provider: [Account Info]

---

## 📝 Deployment Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Developer | | | |
| QA Lead | | | |
| DevOps | | | |
| Product Owner | | | |

---

**Deployment Completed:** [ ] Yes [ ] No
**Rollback Required:** [ ] Yes [ ] No
**Notes:**

---

_This checklist should be completed for every production deployment. Keep a copy of completed checklists for audit purposes._
