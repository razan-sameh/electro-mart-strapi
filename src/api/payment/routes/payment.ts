export default {
  routes: [
    // ✅ Webhook route (no auth)
    {
      method: "POST",
      path: "/payment/webhook",
      handler: "payment.webhook",
      config: {
        auth: false, // 🔥 Stripe doesn't use JWT
      },
    },
    // ✅ Default CRUD routes (with auth)
    {
      method: "GET",
      path: "/payments",
      handler: "payment.find",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "GET",
      path: "/payments/:id",
      handler: "payment.findOne",
      config: {
        auth: {
          required: true,
        },
      },
    },
  ],
};