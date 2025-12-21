// src/api/health/controllers/health.js
module.exports = {
  async index(ctx: { send: (arg0: { status: string; }) => void; }) {
    ctx.send({ status: 'ok' });
  },
};
