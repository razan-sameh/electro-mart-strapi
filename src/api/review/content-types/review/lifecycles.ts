import { updateProductStats } from "../../services/review-stats";

export default {
  async afterCreate(event) {
    const { result } = event;
    // Query the review again with product populated
    const reviewWithProduct = (await strapi.entityService.findOne(
      "api::review.review",
      result.id,
      { populate: ["product"] }
    )) as any; // Cast to any to access product
    const productId = reviewWithProduct?.product?.id;
    if (productId) {
      await updateProductStats(strapi, productId);
    } else {
      console.error("No product ID found");
    }
  },

  async afterUpdate(event) {
    const { result } = event;

    // Query the review again with product populated
    const reviewWithProduct = (await strapi.entityService.findOne(
      "api::review.review",
      result.id,
      { populate: ["product"] }
    )) as any;

    const productId = reviewWithProduct?.product?.id;

    if (productId) {
      await updateProductStats(strapi, productId);
    }
  },

  async afterDelete(event) {
    const { result } = event;

    // For delete, the product relation should still be available
    const productId = (result as any)?.product?.id || (result as any)?.product;

    if (productId) {
      await updateProductStats(strapi, productId);
    }
  },
};
