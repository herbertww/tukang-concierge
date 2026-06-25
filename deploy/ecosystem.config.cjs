// PM2 process config for Tukang on ECS.
// Start with:  pm2 start deploy/ecosystem.config.cjs
// cwd is the project root so dotenv finds .env and sql.js finds tukang.db.

module.exports = {
  apps: [
    {
      name: "tukang",
      script: "dist/index.js",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork", // sql.js is single-process; do NOT cluster.
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
