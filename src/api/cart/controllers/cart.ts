import { factories } from "@strapi/strapi";
import type { Cart, CartItem } from "../types";

export default factories.createCoreController(
  "api::cart.cart",
  ({ strapi }) => ({
    async getMyCart(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      let carts = (await strapi.entityService.findMany("api::cart.cart", {
        filters: { users_permissions_user: user.id },
        populate: {
          cart_items: {
            populate: {
              product: {
                populate: ["ImageURL"],
              },
              product_color: true,
            },
          },
        },
      })) as Cart[];

      let cart = Array.isArray(carts) ? carts[0] : carts;

      if (!cart) {
        cart = (await strapi.entityService.create("api::cart.cart", {
          data: {
            users_permissions_user: user.id,
          },
        })) as Cart;
      }

      return { data: cart };
    },

    async addItem(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const { productId, quantity, productColorId } = ctx.request.body;

      if (!productId || !quantity) {
        return ctx.badRequest("productId and quantity are required");
      }

      if (quantity < 1) {
        return ctx.badRequest("Quantity must be at least 1");
      }

      let carts = (await strapi.entityService.findMany("api::cart.cart", {
        filters: { users_permissions_user: user.id },
        populate: {
          cart_items: {
            populate: {
              product: {
                populate: ["ImageURL"],
              },
              product_color: true,
            },
          },
        },
      })) as Cart[];

      let cart = Array.isArray(carts) ? carts[0] : carts;

      if (!cart) {
        cart = (await strapi.entityService.create("api::cart.cart", {
          data: { users_permissions_user: user.id },
        })) as Cart;
      }
      console.log("cart in strapi", cart);

      const product = await strapi.db.query("api::product.product").findOne({
        where: { documentId: productId },
      });

      if (!product) {
        return ctx.notFound("Product not found");
      }

      if (productColorId) {
        const productColor = await strapi.db
          .query("api::product-color.product-color")
          .findOne({
            where: { documentId: productColorId },
          });

        if (!productColor) {
          return ctx.notFound("Product color not found");
        }
      }

      const filters: any = {
        cart: cart.documentId,
        product: productId,
      };

      if (productColorId) {
        filters.product_color = productColorId;
      }

      const existingItems = (await strapi.entityService.findMany(
        "api::cart-item.cart-item",
        {
          filters,
        }
      )) as CartItem[];

      const existingItem = Array.isArray(existingItems)
        ? existingItems[0]
        : existingItems;

      if (existingItem) {
        const updated = (await strapi.entityService.update(
          "api::cart-item.cart-item",
          existingItem.id,
          {
            data: { Quantity: existingItem.Quantity + quantity },
          }
        )) as CartItem;
        return { data: updated, message: "Item quantity updated" };
      } else {
        const itemData: any = {
          cart: cart.documentId,
          product: productId,
          Quantity: quantity,
        };

        if (productColorId) {
          itemData.product_color = productColorId;
        }

        const created = await strapi.entityService.create(
          "api::cart-item.cart-item",
          {
            data: {
              cart: cart.documentId, // ✅ must be numeric ID
              product: productId,
              Quantity: quantity,
              product_color: productColorId || undefined,
            },
            populate: {
              product: {
                populate: ["ImageURL"], // ✅ populate product relations
              },
              product_color: true,
            },
          }
        );

        return { data: created, message: "Item added to cart" };
      }
    },

    async updateQuantity(ctx) {
      const { id } = ctx.params; // This is the documentId: 'q5nf135arfhcg7j2608dpilc'
      const { quantity } = ctx.request.body;
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      if (!quantity || quantity < 1) {
        return ctx.badRequest("Quantity must be at least 1");
      }

      // ✅ Find by id (numeric) instead of documentId
      const cartItem = (await strapi.entityService.findMany(
        "api::cart-item.cart-item",
        {
          filters: { id }, // Use id filter
          populate: {
            cart: {
              populate: ["users_permissions_user"],
            },
            product: {
              populate: ["ImageURL"],
            },
            product_color: true,
          },
        }
      )) as CartItem[];

      const item = Array.isArray(cartItem) ? cartItem[0] : cartItem;

      if (!item) {
        return ctx.notFound("Cart item not found");
      }

      const cart = item.cart as Cart;
      const cartUserId =
        typeof cart.users_permissions_user === "object"
          ? cart.users_permissions_user?.id
          : cart.users_permissions_user;

      if (cartUserId !== user.id) {
        return ctx.unauthorized("Not your cart item");
      }

      // ✅ Use numeric id for update
      const updated = (await strapi.entityService.update(
        "api::cart-item.cart-item",
        item.id, // Use the numeric id from the found item
        {
          data: { Quantity: quantity },
          populate: {
            product: {
              populate: ["ImageURL"],
            },
            product_color: true,
          },
          // populate: ["product", "product_color"],
        }
      )) as CartItem;

      return { data: updated, message: "Quantity updated" };
    },

    async removeItem(ctx) {
      const { id } = ctx.params;
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const cartItem = (await strapi.entityService.findOne(
        "api::cart-item.cart-item",
        id,
        {
          populate: {
            cart: {
              populate: ["users_permissions_user"],
            },
          },
        }
      )) as CartItem;

      if (!cartItem) {
        return ctx.notFound("Cart item not found");
      }

      const cart = cartItem.cart as Cart;
      const cartUserId =
        typeof cart.users_permissions_user === "object"
          ? cart.users_permissions_user?.id
          : cart.users_permissions_user;

      if (cartUserId !== user.id) {
        return ctx.unauthorized("Not your cart item");
      }

      await strapi.entityService.delete("api::cart-item.cart-item", id);

      return { data: { id }, message: "Item removed from cart" };
    },

    async clearCart(ctx) {
      const user = ctx.state.user;

      if (!user) {
        return ctx.unauthorized("You must be authenticated");
      }

      const carts = (await strapi.entityService.findMany("api::cart.cart", {
        filters: { users_permissions_user: user.id },
        populate: {
          cart_items: {
            populate: {
              product: {
                populate: ["ImageURL"],
              },
              product_color: true,
            },
          },
        },
      })) as Cart[];

      const cart = Array.isArray(carts) ? carts[0] : carts;

      if (!cart) {
        return ctx.notFound("Cart not found");
      }

      if (cart.cart_items && Array.isArray(cart.cart_items)) {
        for (const item of cart.cart_items) {
          await strapi.entityService.delete(
            "api::cart-item.cart-item",
            item.id
          );
        }
      }

      return { data: { cleared: true }, message: "Cart cleared successfully" };
    },
  })
);
