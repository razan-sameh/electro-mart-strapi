export default {
  routes: [
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
