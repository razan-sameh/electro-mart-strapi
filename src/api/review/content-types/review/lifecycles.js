export default {
  async afterCreate(event) {
    const { result } = event;
    if (result?.product?.id) {
      await strapi.service('api::review.review').updateProductStats(result.product.id);
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    if (result?.product?.id) {
      await strapi.service('api::review.review').updateProductStats(result.product.id);
    }
  },

  async afterDelete(event) {
    const { result } = event;
    if (result?.product?.id) {
      await strapi.service('api::review.review').updateProductStats(result.product.id);
    }
  },
};
