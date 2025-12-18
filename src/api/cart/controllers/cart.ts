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

      const locale = ctx.query.locale || "en";

      let carts = (await strapi.entityService.findMany("api::cart.cart", {
        filters: { users_permissions_user: user.id },
        populate: {
          cart_items: {
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
              // product_color: true,
              product_color: {
                populate: ["localizations"], // ✅ أضف دي
              },
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

      for (const item of cart.cart_items || []) {
        const product = item.product;

        if (product?.locale === locale) {
          continue;
        }

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
                product_colors: {
                  populate: ["localizations"], // include color localizations too
                },
                special_offers: {
                  populate: ["localizations"],
                },
              },
            });

          item.product = localizedProduct;

          const color = item.product_color;
          if (color?.locale !== locale) {
            const localizedColor = color?.localizations?.find(
              (loc: any) => loc.locale === locale
            );
            if (localizedColor) {
              const localizedProductColor = await strapi.db
                .query("api::product-color.product-color")
                .findOne({
                  where: { id: localizedColor.id },
                  populate: ["localizations"],
                });
              item.product_color = localizedProductColor;
            }
          }
        } else {
          item.product = product;
        }
      }

      return { data: cart };
    },
    async addItem(ctx) {
      try {
        const user = ctx.state.user;

        if (!user) {
          return ctx.unauthorized("You must be authenticated");
        }

        const { productId, quantity, productColorId } = ctx.request.body;

        console.log("📦 Add to cart request:", {
          productId,
          quantity,
          productColorId,
          userId: user.id,
        });

        if (!productId || !quantity) {
          return ctx.badRequest("productId and quantity are required");
        }

        if (quantity < 1) {
          return ctx.badRequest("Quantity must be at least 1");
        }

        // Find user's cart
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

        console.log("🛒 Cart found:", cart ? `Yes (ID: ${cart.id})` : "No");

        // Create cart if doesn't exist
        if (!cart) {
          cart = (await strapi.entityService.create("api::cart.cart", {
            data: { users_permissions_user: user.id },
          })) as Cart;
          console.log("✅ New cart created:", cart.id);
        }

        // ✅ Get numeric IDs from documentIds
        const product = await strapi.db.query("api::product.product").findOne({
          where: { id: productId },
        });

        if (!product) {
          console.error("❌ Product not found:", productId);
          return ctx.notFound("Product not found");
        }

        console.log("✅ Product found:", {
          documentId: productId,
          numericId: product.id,
        });

        let productColorNumericId = null;

        // Verify color if provided
        if (productColorId) {
          const productColor = await strapi.db
            .query("api::product-color.product-color")
            .findOne({
              where: { id: productColorId },
            });

          if (!productColor) {
            console.error("❌ Product color not found:", productColorId);
            return ctx.notFound("Product color not found");
          }

          productColorNumericId = productColor.id;
          console.log("✅ Product color found:", {
            documentId: productColorId,
            numericId: productColorNumericId,
          });
        }

        // ✅ Check if item already exists - USE NUMERIC IDs for filtering
        const filters: any = {
          cart: cart.id, // numeric ID
          product: product.id, // ✅ FIXED: Use numeric ID, not documentId
        };

        if (productColorNumericId) {
          filters.product_color = productColorNumericId; // ✅ FIXED: Use numeric ID
        }

        console.log("🔍 Checking for existing item with filters:", filters);

        const existingItems = (await strapi.entityService.findMany(
          "api::cart-item.cart-item",
          {
            filters,
            populate: {
              product: {
                populate: ["ImageURL"],
              },
              product_color: true,
            },
          }
        )) as CartItem[];

        const existingItem = Array.isArray(existingItems)
          ? existingItems[0]
          : existingItems;

        if (existingItem) {
          console.log("🔄 Updating existing item:", existingItem.id);

          // Update quantity
          const updated = await strapi.entityService.update(
            "api::cart-item.cart-item",
            existingItem.id,
            {
              data: { Quantity: existingItem.Quantity + quantity },
              populate: {
                product: {
                  populate: ["ImageURL"],
                },
                product_color: true,
              },
            }
          );

          console.log("✅ Item quantity updated");
          return ctx.send({ data: updated, message: "Item quantity updated" });
        } else {
          console.log("🆕 Creating new cart item");

          // ✅ Create new cart item - Use numeric IDs for relations
          const itemData: any = {
            cart: cart.id, // numeric ID
            product: product.id, // ✅ FIXED: Use numeric ID
            Quantity: quantity,
          };

          if (productColorNumericId) {
            itemData.product_color = productColorNumericId; // ✅ FIXED: Use numeric ID
          }

          console.log("📝 Creating with data:", itemData);

          const created = await strapi.entityService.create(
            "api::cart-item.cart-item",
            {
              data: itemData,
              populate: {
                product: {
                  populate: ["ImageURL"],
                },
                product_color: true,
              },
            }
          );

          console.log("✅ Cart item created:", created.id);
          return ctx.send({ data: created, message: "Item added to cart" });
        }
      } catch (error: any) {
        console.error("❌ Error in addItem:");
        console.error("  Message:", error.message);
        console.error("  Stack:", error.stack);

        return ctx.internalServerError("Failed to add item to cart", {
          error: error.message,
          details: error.toString(),
        });
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
