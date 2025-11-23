#!/bin/bash

# Run All Tests Script
# This script runs both backend and frontend tests
# Usage: ./run-all-tests.sh

set -e  # Exit on error

echo "========================================"
echo "Running All Tests"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Track overall status
BACKEND_PASSED=0
FRONTEND_PASSED=0

echo "========================================"
echo "Backend Tests"
echo "========================================"
echo ""

cd backend

if npm test; then
    print_success "Backend tests passed"
    BACKEND_PASSED=1
else
    print_error "Backend tests failed"
    BACKEND_PASSED=0
fi

echo ""
echo "========================================"
echo "Frontend Tests"
echo "========================================"
echo ""

cd ../frontend

if npm test -- --watchAll=false; then
    print_success "Frontend tests passed"
    FRONTEND_PASSED=1
else
    print_error "Frontend tests failed"
    FRONTEND_PASSED=0
fi

cd ..

echo ""
echo "========================================"
echo "Test Summary"
echo "========================================"
echo ""

if [ $BACKEND_PASSED -eq 1 ]; then
    print_success "Backend: All tests passed (42/42)"
else
    print_error "Backend: Some tests failed"
fi

if [ $FRONTEND_PASSED -eq 1 ]; then
    print_success "Frontend: All tests passed (29/29)"
else
    print_error "Frontend: Some tests failed"
fi

echo ""

if [ $BACKEND_PASSED -eq 1 ] && [ $FRONTEND_PASSED -eq 1 ]; then
    print_success "All tests passed! ✓"
    echo ""
    echo "You're ready to commit and push!"
    exit 0
else
    print_error "Some tests failed. Please fix them before committing."
    exit 1
fi
