import Stripe from "stripe";
import { factories } from "@strapi/strapi";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function calculateDiscountedPrice(product) {
  let discountedPrice = product.price;
  if (product.special_offers?.length) {
    const offer = product.special_offers[0];
    if (offer?.discount_type === "percentage") {
      discountedPrice =
        product.price - product.price * (offer.discount_value / 100);
    } else if (offer?.discount_type === "fixed") {
      discountedPrice = product.price - offer.discount_value;
    }
  }
  return Math.max(0, discountedPrice);
}

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    // ✅ ADD DEFAULT CRUD METHODS
    async find(ctx) {
      // Only allow users to see their own orders
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const locale = ctx.query.locale || "en";

      // Fetch orders with full population
      const orders = await strapi.entityService.findMany("api::order.order", {
        filters: { user: { id: user.id } },
        populate: {
          payment: true,
          order_items: {
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
            },
          },
        },
      });

      // Post-process: Replace products with localized versions
      const ordersArray = Array.isArray(orders) ? orders : [orders];

      for (const order of ordersArray) {
        const orderItems = (order as any).order_items || [];
        for (const item of orderItems) {
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
                  special_offers: {
                    populate: ["localizations"],
                  },
                },
              });

            item.product = localizedProduct;
          }
        }
      }

      return {
        data: ordersArray,
        meta: {
          pagination: {
            page: 1,
            pageSize: ordersArray.length,
            pageCount: 1,
            total: ordersArray.length,
          },
        },
      };
    },

    async findOne(ctx) {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const { id } = ctx.params;
      const locale = ctx.query.locale || "en";

      // Fetch order with full population
      const entity = await strapi.entityService.findOne(
        "api::order.order",
        id,
        {
          populate: {
            user: true,
            payment: true,
            order_items: {
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
              },
            },
          },
        }
      );

      // Check if order exists and belongs to user
      if (!entity) {
        return ctx.notFound("Order not found");
      }

      // Type assertion to access user property
      const orderWithUser = entity as any;

      if (orderWithUser.user?.id !== user.id) {
        return ctx.notFound("Order not found");
      }

      // Post-process: Replace products with localized versions
      const orderItems = orderWithUser.order_items || [];
      for (const item of orderItems) {
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
                special_offers: {
                  populate: ["localizations"],
                },
              },
            });

          item.product = localizedProduct;
        }
      }

      return { data: entity };
    },
    // ----------------------
    // STEP 2: Save card (SetupIntent)
    // ----------------------
    async createSetupIntent(ctx) {
      try {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized("You must be logged in");

        // 1️⃣ Create or fetch Stripe customer
        let stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: user.id },
          });
          stripeCustomerId = customer.id;
          await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: user.id },
            data: { stripeCustomerId },
          });
        }

        // 2️⃣ Create SetupIntent
        const setupIntent = await stripe.setupIntents.create({
          customer: stripeCustomerId,
          payment_method_types: ["card"],
        });

        return { clientSecret: setupIntent.client_secret };
      } catch (err: any) {
        console.error("❌ Error creating setup intent:", err);
        ctx.response.status = 500;
        return { error: err.message };
      }
    },

    async getPaymentMethodDetails(ctx) {
      try {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized("You must be logged in");

        const { id } = ctx.params; // expects route param :id
        if (!id) return ctx.badRequest("Missing payment method id");

        const paymentMethod = await stripe.paymentMethods.retrieve(id);

        if (!paymentMethod || !paymentMethod.card) {
          return ctx.notFound("Payment method not found or not a card");
        }

        // return only safe fields
        return ctx.send({
          id: paymentMethod.id,
          brand: paymentMethod.card.brand,
          last4: paymentMethod.card.last4,
          exp_month: paymentMethod.card.exp_month,
          exp_year: paymentMethod.card.exp_year,
        });
      } catch (err: any) {
        console.error("❌ Error retrieving payment method details:", err);
        ctx.response.status = 500;
        return { error: err.message || "Internal server error" };
      }
    },
    // ----------------------
    // STEP 3: Create order + charge saved card
    // ----------------------
    async payOrder(ctx) {
      try {
        const user = ctx.state.user;
        if (!user) return ctx.unauthorized("You must be logged in");

        const { cartItems, shippingAddress, paymentMethodId } =
          ctx.request.body;
        if (!cartItems?.length || !paymentMethodId)
          return ctx.badRequest("Missing data");

        // 1️⃣ Calculate totalAmount
        let totalAmount = 0;
        for (const item of cartItems) {
          const product = await strapi.db
            .query("api::product.product")
            .findOne({
              where: { documentId: item.product.documentId },
              populate: {
                special_offers: true,
              },
            });

          if (!product) {
            console.warn(`⚠️ Product not found: ${item.product.id}`);
            continue;
          }

          const price = Number(product.Price) || 0;
          const quantity = Number(item.quantity) || 0;

          const discountedPrice = calculateDiscountedPrice({
            ...product,
            price,
            special_offers: product.special_offers || [], // 👈 use snake_case to match function
          });

          totalAmount += discountedPrice * quantity;
        }

        if (totalAmount <= 0)
          return ctx.badRequest("Total amount must be greater than 0");

        // 2️⃣ Ensure Stripe customer exists
        let stripeCustomerId = user.stripeCustomerId;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: user.email,
            metadata: { userId: user.id },
          });
          stripeCustomerId = customer.id;

          await strapi.db.query("plugin::users-permissions.user").update({
            where: { id: user.id },
            data: { stripeCustomerId },
          });
        }

        // 3️⃣ Validate and attach payment method
        const paymentMethod =
          await stripe.paymentMethods.retrieve(paymentMethodId);
        if (
          paymentMethod.customer &&
          paymentMethod.customer !== stripeCustomerId
        ) {
          throw new Error(
            `Payment method already belongs to another customer (${paymentMethod.customer}).`
          );
        }

        if (!paymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: stripeCustomerId,
          });
        }

        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        // 4️⃣ Create order safely
        let order;
        try {
          order = await strapi.entityService.create("api::order.order", {
            data: {
              TotalAmount: totalAmount,
              ShippingAddress: JSON.stringify(shippingAddress),
              order_status: "Pending",
              user: user.id,
            },
          });

          // Safety check
          if (!order || (!order.id && !order.documentId)) {
            throw new Error(
              "Order was not created properly (missing id/documentId)"
            );
          }

          // Now create order items
          for (const item of cartItems) {
            // Determine the actual product ID
            const productId = item.product?.documentId; // in case product is just a string

            if (!productId) {
              console.warn("⚠️ Missing product ID for cart item:", item);
              continue;
            }

            const productRecord = await strapi.db
              .query("api::product.product")
              .findOne({
                where: { documentId: productId }, // use documentId if that's your main identifier
              });

            if (!productRecord) {
              console.error("❌ Product not found for ID:", productId);
              continue;
            }

            const data = {
              Quantity: item.quantity,
              UnitPrice: String(Number(productRecord.Price).toFixed(2)),
              product: productRecord.documentId,
              order: order.documentId, // make sure `order` is defined
            };

            await strapi.entityService.create("api::order-item.order-item", {
              data: data,
            });
          }
        } catch (err) {
          console.error("❌ Error while creating order or items:", err);
          ctx.response.status = 500;
          return { error: err.message };
        }

        // 5️⃣ Create payment intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: "egp",
          customer: stripeCustomerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: { orderId: order.documentId },
        });

        await strapi.entityService.create("api::payment.payment", {
          data: {
            Amount: totalAmount,
            payment_status: "processing", // أول ما نعمل السجل قبل webhook
            PaymentMethod: "Card",
            order: order.documentId, // اربطه بالـ order
          },
        });
        return {
          success: paymentIntent.status === "succeeded",
          paymentIntentId: paymentIntent.id,
          orderId: order.documentId,
          amount: totalAmount,
          status: paymentIntent.status,
        };
      } catch (err: any) {
        console.error("❌ Error paying order:", err);
        ctx.response.status = 500;
        return { error: err.message || "Unexpected server error" };
      }
    },
  })
);
