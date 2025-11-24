import { factories } from "@strapi/strapi";

export default factories.createCoreController(
  "api::review.review",
  ({ strapi }) => ({
    // ✅ Create review (requires authentication)
    async create(ctx) {
      const body = ctx.request.body.data || ctx.request.body;
      const { product: productId, Comment, Rating } = body;

      const product = await strapi.db.query("api::product.product").findOne({
        where: { documentId: productId },
      });

      if (!product) {
        return ctx.badRequest("Product not found");
      }

     const review = await strapi.entityService.create("api::review.review", {
        data: {
          Comment,
          Rating,
          product: product.id,
          user: ctx.state.user?.id,
        },
        populate: ["user", "product"],
      });

      return review;
    },
  })
);
