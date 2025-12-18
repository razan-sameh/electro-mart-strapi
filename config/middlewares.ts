export default [
  'strapi::logger',
  'strapi::errors',
  {
    name: 'strapi::security',
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'connect-src': ["'self'", 'https:'],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'media-src': ["'self'", 'data:', 'blob:', 'https:'],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: 'strapi::cors',
    config: {
      enabled: true,
      origin: [
        'http://localhost:3000',
        'https://electro-mart-psi-beryl.vercel.app', // ✅ Add your deployed Next.js URL
        'https://electro-mart-git-main-razan-samehs-projects.vercel.app',
        'https://electro-mart-1gpz3svli-razan-samehs-projects.vercel.app'
      ],
      credentials: true, // ✅ Important for cookies/JWT
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
    },
  },
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
