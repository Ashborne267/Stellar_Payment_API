function validateEnvironmentVariables() {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STELLAR_NETWORK',
    'DATABASE_URL',
    'REDIS_URL',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   - ${key}`);
    });
    console.error('\nCreate your local env file before starting the API:');
    console.error('   cp .env.example .env');
    console.error('Then fill in the required values in backend/.env.');
    console.error('Setup guide: README.md#quick-start-backend');
    process.exit(1);
  }

  const validNetworks = ['testnet', 'public'];
  if (!validNetworks.includes(process.env.STELLAR_NETWORK)) {
    console.error(`❌ Invalid STELLAR_NETWORK: ${process.env.STELLAR_NETWORK}`);
    console.error(`Valid options: ${validNetworks.join(', ')}`);
    process.exit(1);
  }

  const optionalPositiveIntegers = [
    'CREATE_PAYMENT_RATE_LIMIT_MAX',
    'CREATE_PAYMENT_RATE_LIMIT_WINDOW_MS',
    'LOG_RETENTION_DAYS',
    'LOG_PURGE_BATCH_SIZE',
    'LOG_PURGE_MAX_DURATION_MS',
  ];

  for (const key of optionalPositiveIntegers) {
    const value = process.env[key];

    if (!value) {
      continue;
    }

    const parsedValue = Number.parseInt(value, 10);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      console.error(`❌ Invalid ${key}: ${value}`);
      console.error(`${key} must be a positive integer.`);
      process.exit(1);
    }
  }

  if (!process.env.RESEND_API_KEY) {
  console.warn("⚠️  RESEND_API_KEY is not set — receipt emails will be disabled.");
}

  console.log('✅ Environment variables validated');
}

export { validateEnvironmentVariables };
