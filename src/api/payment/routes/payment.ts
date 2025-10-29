export default {
  routes: [
    {
      method: "POST",
      path: "/payment/webhook",
      handler: "payment.webhook",
      config: {
        auth: false, // 🔥 Stripe doesn't use JWT
      },
    },
  ],
};
