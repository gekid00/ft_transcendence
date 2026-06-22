// Test environment setup — provides required env vars so tests don't depend on .env files.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-ci";
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4321";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://test:testpassword@localhost:5433/transcendence_test";
