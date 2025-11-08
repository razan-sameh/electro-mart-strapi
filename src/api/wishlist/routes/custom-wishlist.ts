export default {
  routes: [
    {
      method: 'GET',
      path: '/wishlist/me',
      handler: 'wishlist.getMyWishlist',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/wishlist/items',
      handler: 'wishlist.addItem',
      config: {
        policies: [],
      },
    },
    {
      method: 'DELETE',
      path: '/wishlist/items/:id',
      handler: 'wishlist.removeItem',
      config: {
        policies: [],
      },
    },
    {
      method: 'DELETE',
      path: '/wishlist/clear',
      handler: 'wishlist.clearWishlist',
      config: {
        policies: [],
      },
    },
  ],
};
