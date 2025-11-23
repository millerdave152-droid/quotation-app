# Customer Quotation System Pro

![CI Status](https://github.com/millerdave152-droid/quotation-app/workflows/CI%2FCD%20Pipeline/badge.svg)

A professional quotation management system with automated testing and continuous integration.

## Features

- **Customer Management** - Track and manage customer information
- **Product Catalog** - Comprehensive product management with import/export
- **Quotation Creation** - Generate professional quotes with PDF export
- **Revenue Features** - Financing, warranties, delivery, rebates, trade-ins
- **Analytics Dashboard** - Real-time business insights
- **Payment Tracking** - Customer credit and payment management
- **Email Integration** - Send quotes directly via AWS SES
- **PWA Support** - Progressive Web App with offline capabilities

## Tech Stack

### Backend
- Node.js + Express
- PostgreSQL database
- AWS SES for email
- JWT authentication
- Comprehensive security middleware

### Frontend
- React 19
- Tailwind CSS
- jsPDF for PDF generation
- API caching layer
- Service Worker for offline support

## Testing

**71 automated tests** run on every commit:
- ✅ 42 backend tests
- ✅ 29 frontend tests

```bash
# Run all tests
npm test

# Backend tests only
cd backend && npm test

# Frontend tests only
cd frontend && npm test
```

## CI/CD Pipeline

Automated testing on every push using:
- GitHub Actions
- GitLab CI
- CircleCI

**Pipeline includes:**
- Parallel test execution (Node 18.x & 20.x)
- Code coverage reports
- Production build verification
- Security vulnerability scanning

## Quick Start

### Prerequisites
- Node.js 18.x or 20.x
- PostgreSQL 12+
- npm or yarn

### Installation

```bash
# Clone repository
git clone https://github.com/millerdave152-droid/quotation-app.git
cd quotation-app

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Configuration

Create `.env` files:

**Backend** (`backend/.env`):
```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=quotation_db
JWT_SECRET=your_jwt_secret
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
EMAIL_FROM=noreply@yourdomain.com
```

**Frontend** (`frontend/.env`):
```env
REACT_APP_API_URL=http://localhost:3001
```

### Running Locally

```bash
# Start backend (from backend directory)
cd backend
node server.js

# Start frontend (from frontend directory)
cd frontend
npm start
```

Access the application at `http://localhost:3000`

## Development

### Code Quality

```bash
# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Running Tests

```bash
# All tests with coverage
./run-all-tests.sh   # Mac/Linux
run-all-tests.bat    # Windows

# Watch mode
npm run test:watch
```

## Project Structure

```
.
├── backend/                 # Node.js backend
│   ├── __tests__/          # Backend tests
│   ├── routes/             # API routes
│   ├── middleware/         # Auth, security, validation
│   ├── services/           # Business logic
│   └── server.js           # Entry point
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API services
│   │   ├── utils/         # Utility functions
│   │   └── App.js         # Main app component
│   └── public/            # Static assets
├── .github/workflows/     # GitHub Actions
└── docs/                  # Documentation
```

## Documentation

- [CI/CD Guide](CI-CD-GUIDE.md) - Complete CI/CD setup
- [Quick Start](CI-QUICK-START.md) - Get CI running in 5 minutes
- [GitHub Setup](GITHUB-SETUP-GUIDE.md) - GitHub integration guide
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Production deployment

## API Endpoints

### Customers
- `GET /api/customers` - List all customers
- `GET /api/customers/:id` - Get customer details
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product
- `POST /api/products/import-csv` - Import products from CSV

### Quotations
- `GET /api/quotations` - List all quotations
- `GET /api/quotations/:id` - Get quotation details
- `POST /api/quotations` - Create quotation
- `PUT /api/quotations/:id` - Update quotation
- `POST /api/quotations/:id/send-email` - Email quotation

See [API Documentation](docs/API.md) for complete endpoint reference.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**CI/CD runs automatically on all PRs!**

## Testing Guidelines

- Write tests for all new features
- Maintain code coverage above 70%
- All tests must pass before merging
- Follow existing test patterns

## Security

- JWT-based authentication
- Helmet.js security headers
- Rate limiting
- Input validation and sanitization
- SQL injection protection
- XSS prevention

## Performance

- API response caching
- Database query optimization
- Lazy loading components
- Service Worker for offline functionality
- Build optimization

## License

This project is proprietary software.

## Support

For issues or questions:
- Check the [documentation](docs/)
- Review [troubleshooting guide](CI-CD-GUIDE.md#troubleshooting)
- Open an issue on GitHub

## Acknowledgments

Built with:
- [Express](https://expressjs.com/)
- [React](https://reactjs.org/)
- [PostgreSQL](https://www.postgresql.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Status:** ✅ Production Ready | **Tests:** 71/71 Passing | **Coverage:** In Progress
