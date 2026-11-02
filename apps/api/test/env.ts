// Point the app at the test database and a test key prefix before anything reads config().
try {
  process.loadEnvFile('../../.env');
} catch {
  // CI provides the variables directly.
}
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? 'postgresql://jobsmith:jobsmith@127.0.0.1:5432/jobsmith_test';
process.env['REDIS_URL'] ??= 'redis://127.0.0.1:6379/5';
process.env['REDIS_PREFIX'] = 'jobsmith-test';
process.env['STORAGE_DIR'] = './storage-test';
process.env['JWT_SECRET'] ??= 'test-secret-test-secret-test-secret-1234';
process.env['COOKIE_SECURE'] = 'false';
process.env['MAIL_TRANSPORT'] = 'log';
process.env['DEMO_MODE'] = 'false';
process.env['SIGNUP_ENABLED'] = 'false';
process.env['APP_URL'] = 'http://localhost:8035';
process.env['LOGIN_CODES'] = 'always';
process.env['ENCRYPTION_KEY'] ??= Buffer.alloc(32, 7).toString('base64');
process.env['SPONSOR_REGISTER_URL'] = 'https://www.gov.uk/api/content/test-register';
