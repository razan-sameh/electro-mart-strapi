export default {
  routes: [
    {
      method: 'GET',
      path: '/cart/me',
      handler: 'cart.getMyCart',
      config: {
        policies: []
      }
    },
    {
      method: 'POST',
      path: '/cart/items',
      handler: 'cart.addItem',
      config: {
        policies: []
      }
    },
    {
      method: 'PUT',
      path: '/cart/items/:id',
      handler: 'cart.updateQuantity',
      config: {
        policies: []
      }
    },
    {
      method: 'DELETE',
      path: '/cart/items/:id',
      handler: 'cart.removeItem',
      config: {
        policies: []
      }
    },
    {
      method: 'DELETE',
      path: '/cart/clear',
      handler: 'cart.clearCart',
      config: {
        policies: []
      }
    }
  ]
};