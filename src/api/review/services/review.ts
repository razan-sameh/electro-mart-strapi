import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::review.review",
  ({ strapi }) => ({
    async updateProductStats(productId) {
      if (!productId) return;

      // Get all reviews for this product
      const reviews = await strapi.db.query("api::review.review").findMany({
        where: { product: productId },
        select: ["rating"],
      });

      const totalReviews = reviews.length;
      const averageRating =
        totalReviews > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
          : 0;

      // Update the product
      await strapi.db.query("api::product.product").update({
        where: { id: productId },
        data: {
          totalReviews,
          averageRating,
        },
      });
    },
  })
);
