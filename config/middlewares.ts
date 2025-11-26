export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  {
    name: "strapi::body",
    config: {
      includeUnparsed: true, // 👈 تفعيل هذا الخيار هو المفتاح
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
