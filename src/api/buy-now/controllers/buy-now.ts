// src/api/buy-now/controllers/buy-now.ts
export default {
  async createOrUpdate(ctx) {
    try {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const { productId, colorId } = ctx.request.body;

      if (!productId || !colorId) {
        return ctx.badRequest("productId and colorId are required");
      }

      const product = await strapi.db
        .query("api::product.product")
        .findOne({ where: { id: productId } });

      if (!product) {
        return ctx.badRequest("Invalid productId");
      }

      const color = await strapi.db
        .query("api::product-color.product-color")
        .findOne({ where: { id: colorId } });

      if (!color) {
        return ctx.badRequest("Invalid colorId");
      }

      // Check if a Buy Now session exists
      let session = await strapi.db.query("api::buy-now.buy-now").findOne({
        where: { users_permissions_user: { id: user.id } },
      });
      if (session) {
        session = await strapi.db.query("api::buy-now.buy-now").update({
          where: { id: session.id },
          data: {
            product: product.id,
            product_color: color.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
          populate: ["product", "product_color", "users_permissions_user"],
        });
      } else {
        session = await strapi.db.query("api::buy-now.buy-now").create({
          data: {
            users_permissions_user: user.id,
            product: product.id,
            product_color: color.id,
            quantity: 1,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            publishedAt: new Date(),
          },
        });
        // Fetch the session again with populated relations
        session = await strapi.db.query("api::buy-now.buy-now").findOne({
          where: { id: session.id },
          populate: {
            product: {
              populate: ["ImageURL"], // ✅ populate product relations
            },
            product_color: true,
            users_permissions_user: true,
          },
        });
      }

      return ctx.send({ success: true, session });
    } catch (error) {
      console.error("❌ Error in createOrUpdate:", error);
      return ctx.internalServerError("Something went wrong");
    }
  },

  async get(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized("You must be authenticated");
    }

    const session = await strapi.db.query("api::buy-now.buy-now").findOne({
      where: { users_permissions_user: { id: user.id } },
      populate: {
        product: {
          populate: ["ImageURL"], // ✅ populate product relations
        },
        product_color: true,
        users_permissions_user: true,
      },
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      return ctx.send({ session: null });
    }

    return ctx.send({ session });
  },

  async deleteSession(ctx) {
    try {
      const user = ctx.state.user;
      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const deleted = await strapi.db.query("api::buy-now.buy-now").deleteMany({
        where: { users_permissions_user: { id: user.id } },
      });

      return ctx.send({ success: true, deleted });
    } catch (error) {
      console.error("❌ Error deleting:", error);
      return ctx.internalServerError("Something went wrong");
    }
  },
};
