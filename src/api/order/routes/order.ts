export default {
  routes: [
    // ✅ Default CRUD routes (find and findOne)
    {
      method: "GET",
      path: "/orders",
      handler: "order.find",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "GET",
      path: "/orders/:id",
      handler: "order.findOne",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "POST",
      path: "/orders/create-setup-intent",
      handler: "order.createSetupIntent",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "GET",
      path: "/orders/payment-method/:id",
      handler: "order.getPaymentMethodDetails",
      config: {
        auth: {
          required: true,
        },
      },
    },
    {
      method: "POST",
      path: "/orders/pay-order",
      handler: "order.payOrder",
      config: {
        auth: {
          required: true,
        },
      },
    },
  ],
};
