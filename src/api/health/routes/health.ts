// src/api/health/routes/health.js
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/health',
      handler: 'health.index',
    },
  ],
};
