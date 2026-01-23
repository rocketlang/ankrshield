module.exports = {
  apps: [
    {
      name: 'ankrshield-api',
      script: 'npx',
      args: 'tsx src/main.ts',
      cwd: '/root/ankrshield/apps/api',
      env: {
        PORT: '4250',
        DATABASE_URL: 'postgresql://ankrshield:ankrshield123@localhost:5432/ankrshield',
        REDIS_URL: 'redis://localhost:6379',
        JWT_SECRET: 'ankrshield-jwt-secret-change-in-production',
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:5250,https://ankr.digital',
      },
      error_file: '/root/.pm2/logs/ankrshield-api-error.log',
      out_file: '/root/.pm2/logs/ankrshield-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
    },
  ],
};
