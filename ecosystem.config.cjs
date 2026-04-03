module.exports = {
  apps: [
    {
      name: 'swoop-api',
      script: 'src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        START_QUEUE_WORKER_IN_SERVER: 'false',
      },
    },
    {
      name: 'swoop-worker',
      script: 'src/workers/queueWorker.js',
      instances: 3,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_restarts: 50,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
