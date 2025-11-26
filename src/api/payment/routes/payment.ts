export default {
  routes: [
    {
      method: "POST",
      path: "/payment/webhook",
      handler: "api::payment.payment.webhook",
      config: {
        auth: false, // 🔥 Stripe doesn't use JWT
      },
    },
    {
      method: "GET",
      path: "/payments",
      handler: "api::payment.payment.find",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "GET",
      path: "/payments/:id",
      handler: "api::payment.payment.findOne",
      config: {
        auth: {
          required: true,
        },
      },
    },
  ],
};
