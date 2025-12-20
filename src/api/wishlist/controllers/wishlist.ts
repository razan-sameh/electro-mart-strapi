import { factories } from "@strapi/strapi";
import type { Wishlist, WishlistItem } from "../types";

export default factories.createCoreController(
  "api::wishlist.wishlist",
  ({ strapi }) => ({
    // GET /wishlist/me - Get user's wishlist
    async getMyWishlist(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const locale = ctx.query.locale || "en";

      let wishlists = (await strapi.entityService.findMany(
        "api::wishlist.wishlist",
        {
          filters: { users_permissions_user: user.id },
          populate: {
            wishlist_items: {
              populate: {
                product: {
                  populate: {
                    localizations: true,
                    ImageURL: true,
                    brand: true,
                    special_offers: {
                      populate: ["localizations"],
                    },
                  },
                },
                product_color: {
                  populate: {
                    localizations: true, // populate localizations for color
                  },
                },
              },
            },
          },
        }
      )) as Wishlist[];

      let wishlist = Array.isArray(wishlists) ? wishlists[0] : wishlists;

      if (!wishlist) {
        wishlist = (await strapi.entityService.create(
          "api::wishlist.wishlist",
          { data: { users_permissions_user: user.id } }
        )) as Wishlist;
      }

      // ✅ Replace with localized versions
      const wishlistItems = wishlist.wishlist_items || [];
      for (const item of wishlistItems) {
        // Product localization
        const product = item.product;
        if (product?.locale !== locale) {
          const localized = product?.localizations?.find(
            (loc: any) => loc.locale === locale
          );
          if (localized) {
            const localizedProduct = await strapi.db
              .query("api::product.product")
              .findOne({
                where: { id: localized.id },
                populate: {
                  localizations: true,
                  ImageURL: true,
                  brand: true,
                  special_offers: { populate: ["localizations"] },
                },
              });
            item.product = localizedProduct;
          }
        }

        // Product color localization
        const color = item.product_color;
        if (color?.locale !== locale) {
          const localizedColor = color?.localizations?.find(
            (loc: any) => loc.locale === locale
          );
          if (localizedColor) {
            const localizedColorRecord = await strapi.db
              .query("api::product-color.product-color")
              .findOne({
                where: { id: localizedColor.id },
                populate: { localizations: true },
              });
            item.product_color = localizedColorRecord;
          }
        }
      }

      return { data: wishlist };
    },

    // POST /wishlist/items - Add item to wishlist
    async addItem(ctx) {
      const user = ctx.state.user;

      if (!user) return ctx.unauthorized("You must be authenticated");

      const { productId, productColorId } = ctx.request.body;
      console.log("productId", { productId: productId });
      console.log("productColorId", { productColorId: productColorId });

      if (!productId) return ctx.badRequest("productId is required");

      // Get or create wishlist
      let wishlists = (await strapi.entityService.findMany(
        "api::wishlist.wishlist",
        {
          filters: { users_permissions_user: user.id },
          populate: { wishlist_items: true },
        }
      )) as Wishlist[];

      let wishlist = Array.isArray(wishlists) ? wishlists[0] : wishlists;
      if (!wishlist) {
        wishlist = (await strapi.entityService.create(
          "api::wishlist.wishlist",
          { data: { users_permissions_user: user.id } }
        )) as Wishlist;
      }

      // Check if product exists
      const product = await strapi.db.query("api::product.product").findOne({
        where: { id: productId },
      });
      console.log("product", { product: product });

      if (!product) return ctx.notFound("Product not found");

      if (productColorId) {
        const productColor = await strapi.db
          .query("api::product-color.product-color")
          .findOne({ where: { id: productColorId } });

        if (!productColor) return ctx.notFound("Product color not found");
      }

      // Check for existing wishlist item
      const filters: any = { wishlist: wishlist.id, product: productId };
      if (productColorId) filters.product_color = productColorId;

      const existingItems = (await strapi.entityService.findMany(
        "api::wishlist-item.wishlist-item",
        { filters }
      )) as WishlistItem[];

      const existingItem = Array.isArray(existingItems)
        ? existingItems[0]
        : existingItems;

      if (existingItem) {
        return { data: existingItem, message: "Item already in wishlist" };
      }
      console.log("wishlist", { wishlist: wishlist });

      const created = await strapi.entityService.create(
        "api::wishlist-item.wishlist-item",
        {
          data: {
            wishlist: wishlist.id,
            product: productId,
            product_color: productColorId,
          },
          populate: {
            product: { populate: ["ImageURL"] },
            product_color: true,
          },
        }
      );

      return { data: created, message: "Item added to wishlist" };
    },

    // DELETE /wishlist/items/:id - Remove item
    async removeItem(ctx) {
      const { id } = ctx.params;
      const user = ctx.state.user;

      if (!user) return ctx.unauthorized("You must be authenticated");

      const wishlistItem = (await strapi.entityService.findOne(
        "api::wishlist-item.wishlist-item",
        id,
        { populate: { wishlist: { populate: ["users_permissions_user"] } } }
      )) as WishlistItem;

      if (!wishlistItem) return ctx.notFound("Wishlist item not found");

      const wishlist = wishlistItem.wishlist as Wishlist;
      const wishlistUserId =
        typeof wishlist.users_permissions_user === "object"
          ? wishlist.users_permissions_user?.id
          : wishlist.users_permissions_user;

      if (wishlistUserId !== user.id)
        return ctx.unauthorized("Not your wishlist item");

      await strapi.entityService.delete("api::wishlist-item.wishlist-item", id);

      return { data: { id }, message: "Item removed from wishlist" };
    },

    // DELETE /wishlist - Clear entire wishlist
    async clearWishlist(ctx) {
      const user = ctx.state.user;

      if (!user) return ctx.unauthorized("You must be authenticated");

      const wishlists = (await strapi.entityService.findMany(
        "api::wishlist.wishlist",
        {
          filters: { users_permissions_user: user.id },
          populate: { wishlist_items: true },
        }
      )) as Wishlist[];

      const wishlist = Array.isArray(wishlists) ? wishlists[0] : wishlists;
      if (!wishlist) return ctx.notFound("Wishlist not found");

      if (wishlist.wishlist_items && Array.isArray(wishlist.wishlist_items)) {
        for (const item of wishlist.wishlist_items) {
          await strapi.entityService.delete(
            "api::wishlist-item.wishlist-item",
            item.id
          );
        }
      }

      return { data: { cleared: true }, message: "Wishlist cleared" };
    },
  })
);
