// src/api/buy-now/routes/buy-now.ts
export default {
  routes: [
    {
      method: "POST",
      path: "/buy-now",
      handler: "buy-now.createOrUpdate",
      config: {
        auth: { public: false }, // ✅ فقط للمستخدمين المصرح لهم
      },
    },
    {
      method: "GET",
      path: "/buy-now",
      handler: "buy-now.get",
      config: {
        auth: { public: false }, // ✅ محمي
      },
    },
    {
      method: "DELETE",
      path: "/buy-now",
      handler: "buy-now.deleteSession",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
