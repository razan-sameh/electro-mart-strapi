// src/api/buy-now/controllers/buy-now.ts
export default {
  async createOrUpdate(ctx) {
    try {
      console.log("🚀 CONTROLLER CALLED - createOrUpdate");

      const user = ctx.state.user;
      console.log("🔍 User:", user?.id);

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const { productId, colorId } = ctx.request.body;
      console.log("📦 Request body:", { productId, colorId });

      if (!productId || !colorId) {
        return ctx.badRequest("productId and colorId are required");
      }

      const product = await strapi.db
        .query("api::product.product")
        .findOne({ where: { id: productId } });
      console.log("✅ Product found:", product?.id);

      if (!product) {
        return ctx.badRequest("Invalid productId");
      }

      const color = await strapi.db
        .query("api::product-color.product-color")
        .findOne({ where: { id: colorId } });
      console.log("🎨 Color found:", color?.id);

      if (!color) {
        return ctx.badRequest("Invalid colorId");
      }

      // Check if a Buy Now session exists
      let session = await strapi.db.query("api::buy-now.buy-now").findOne({
        where: { users_permissions_user: { id: user.id } },
      });
      console.log("📋 Existing session:", session?.id || "none");

      if (session) {
        console.log("🔄 Updating existing session...");
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
        console.log("✅ Session updated:", session.id);
      } else {
        console.log("🆕 Creating new session...");

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

        console.log("✅ Session created (basic):", session.id);

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

        console.log("✅ Session with relations:", session);
      }

      return ctx.send({ success: true, session });
    } catch (error) {
      console.error("❌ Error in createOrUpdate:", error);
      return ctx.internalServerError("Something went wrong");
    }
  },

  async get(ctx) {
    console.log("🚀 CONTROLLER CALLED - get");

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

      console.log("🗑️ Deleted sessions:", deleted);
      return ctx.send({ success: true, deleted });
    } catch (error) {
      console.error("❌ Error deleting:", error);
      return ctx.internalServerError("Something went wrong");
    }
  },
};
