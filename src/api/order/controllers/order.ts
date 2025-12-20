import Stripe from "stripe";
import { factories } from "@strapi/strapi";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function calculateDiscountedPrice(product: any) {
  const originalPrice = Number(product.price) || 0;
  let discountedPrice = originalPrice;
  let discountAmount = 0;

  if (product.special_offers?.length) {
    const offer = product.special_offers[0];
    const discountValue = Number(offer.discount_value) || 0;

    if (offer?.discount_type === "percentage") {
      discountAmount = originalPrice * (discountValue / 100);
      discountedPrice = originalPrice - discountAmount;
    } else if (offer?.discount_type === "fixed") {
      discountAmount = discountValue;
      discountedPrice = originalPrice - discountAmount;
    }
  }

  // تأكدي إن السعر بعد الخصم مش بالسالب
  discountedPrice = Math.max(0, discountedPrice);
  discountAmount = Math.min(originalPrice, discountAmount);

  return {
    discountedPrice, // السعر بعد الخصم
    discountAmount, // المبلغ المخصوم فعلاً
  };
}

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    // ✅ ADD DEFAULT CRUD METHODS
    async find(ctx) {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const locale = ctx.query.locale || "en";
      const page = Number(ctx.query.page) || 1;
      const pageSize = Number(ctx.query.pageSize) || 5;
      const order_status = ctx.query.order_status as string;
      // Base filter: user
      const filters: any = { user: { id: user.id } };

      // Add status filter only if user clicked Current or Delivered
      if (order_status && order_status.trim() !== "") {
        filters.order_status = { $eq: order_status };
      }

      // Fetch paginated orders
      const orders = await strapi.entityService.findMany("api::order.order", {
        filters,
        start: (page - 1) * pageSize,
        limit: pageSize,
        populate: {
          payment: {
            populate: {
              payment_method: true,
            },
          },
          address: {
            populate: {
              phone: true, // ✅ this ensures phone data inside address is also included
            },
          },
          user: true,
          order_items: {
            populate: {
              product: {
                populate: {
                  localizations: true,
                  ImageURL: true,
                  brand: true,
                  category: true,
                  special_offers: {
                    populate: ["localizations"],
                  },
                },
              },
              selected_color: true,
            },
          },
        },
      });

      // TOTAL counts for each tab
      const allCount = await strapi.entityService.count("api::order.order", {
        filters: { user: { id: user.id } },
      });

      const pendingCount = await strapi.entityService.count(
        "api::order.order",
        {
          filters: { user: { id: user.id }, order_status: { $eq: "Pending" } },
        }
      );

      const deliveredCount = await strapi.entityService.count(
        "api::order.order",
        {
          filters: {
            user: { id: user.id },
            order_status: { $eq: "Delivered" },
          },
        }
      );

      // FIX PAGINATION BASED ON ACTIVE FILTER
      const totalForPagination =
        order_status === "Pending"
          ? pendingCount
          : order_status === "Delivered"
            ? deliveredCount
            : allCount;

      const pageCount = Math.ceil(totalForPagination / pageSize);

      // Localization logic
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
                  category: true,
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
            page,
            pageSize,
            pageCount,
            total: totalForPagination,
          },
          counts: {
            all: allCount,
            pending: pendingCount,
            delivered: deliveredCount,
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
      const entity = await strapi.db.query("api::order.order").findOne({
        where: { documentId: id, user: { id: user.id } }, // 🔑 query by documentId + user
        populate: {
          user: true,
          payment: {
            populate: {
              payment_method: true,
            },
          },
          address: {
            populate: {
              phone: true, // ✅ this ensures phone data inside address is also included
            },
          },
          order_items: {
            populate: {
              product: {
                populate: {
                  localizations: true,
                  ImageURL: true,
                  brand: true,
                  category: true,
                  special_offers: {
                    populate: ["localizations"],
                  },
                },
              },
              selected_color: {
                populate: {
                  localizations: true, // ✅ this adds localization for the color
                },
              },
            },
          },
        },
      });

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
                category: true,
                special_offers: {
                  populate: ["localizations"],
                },
              },
            });

          item.product = localizedProduct;
        }

        const color = item.selected_color;
        if (color?.locale !== locale) {
          const localizedColor = color?.localizations?.find(
            (loc: any) => loc.locale === locale
          );
          if (localizedColor) item.selected_color = localizedColor;
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

        // 🧮 Initialize totals
        let subtotal = 0;
        let discount_total = 0;
        let totalAmount = 0;

        // 1️⃣ Loop through items to calculate totals
        for (const item of cartItems) {
          const product = await strapi.db
            .query("api::product.product")
            .findOne({
              where: { documentId: item.product.documentId },
              populate: { special_offers: true },
            });

          if (!product) {
            console.warn(`⚠️ Product not found: ${item.product.documentId}`);
            continue;
          }

          const price = Number(product.Price) || 0;
          const quantity = Number(item.quantity) || 1;
          const { discountedPrice } = calculateDiscountedPrice({
            ...product,
            price,
            special_offers: product.special_offers || [],
          });

          const itemSubtotal = price * quantity;
          const itemTotal = discountedPrice * quantity;
          const itemDiscount = itemSubtotal - itemTotal;

          subtotal += itemSubtotal;
          discount_total += itemDiscount;
          totalAmount += itemTotal;
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

        // 3️⃣ Validate payment method
        const paymentMethod =
          await stripe.paymentMethods.retrieve(paymentMethodId);
        if (
          paymentMethod.customer &&
          paymentMethod.customer !== stripeCustomerId
        ) {
          throw new Error("Payment method belongs to another customer.");
        }

        if (!paymentMethod.customer) {
          await stripe.paymentMethods.attach(paymentMethodId, {
            customer: stripeCustomerId,
          });
        }

        await stripe.customers.update(stripeCustomerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });

        // 4️⃣ Create Address + Phone records
        const phoneRecord = await strapi.entityService.create(
          "api::phone.phone",
          {
            data: {
              number: shippingAddress.phone.number,
              dailcode: shippingAddress.phone.dialCode,
              countryCode: shippingAddress.phone.countryCode,
            },
          }
        );

        const addressRecord = await strapi.entityService.create(
          "api::address.address",
          {
            data: {
              ...shippingAddress,
              phone: phoneRecord.documentId,
            },
          }
        );

        // 5️⃣ Create Order
        const order = await strapi.entityService.create("api::order.order", {
          data: {
            subtotal: subtotal.toFixed(2),
            discount_total: discount_total.toFixed(2),
            Total: totalAmount.toFixed(2),
            order_status: "Pending",
            user: user.id,
            address: addressRecord.documentId,
          },
        });

        // Safety check
        if (!order || (!order.id && !order.documentId)) {
          throw new Error("Order was not created properly");
        }

        // 6️⃣ Create order items
        for (const item of cartItems) {
          const productRecord = await strapi.db
            .query("api::product.product")
            .findOne({
              where: { documentId: item.product.documentId },
              populate: { special_offers: { populate: ["localizations"] } },
            });

          if (!productRecord) continue;

          const { discountedPrice, discountAmount } = calculateDiscountedPrice({
            ...productRecord,
            price: Number(productRecord.Price),
            special_offers: productRecord.special_offers || [],
          });

          const quantity = Number(item.quantity) || 1;
          const unitPrice = Number(productRecord.Price);
          const itemSubtotal = unitPrice * quantity;
          const itemTotal = discountedPrice * quantity;

          await strapi.entityService.create("api::order-item.order-item", {
            data: {
              Quantity: quantity,
              UnitPrice: unitPrice.toFixed(2),
              subtotal: itemSubtotal.toFixed(2),
              total: itemTotal.toFixed(2),
              discount_value: discountAmount.toFixed(2),
              product: productRecord.documentId,
              selected_color: item.selectedColor?.documentId,
              order: order.documentId,
            },
          });
        }

        // 7️⃣ Create Stripe Payment Intent
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmount * 100),
          currency: "egp",
          customer: stripeCustomerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: { orderId: order.id },
        });

        // 8️⃣ Save payment records
        const paymentMethodRecord = await strapi.entityService.create(
          "api::payment-method.payment-method",
          {
            data: {
              brand: paymentMethod.card?.brand || "unknown",
              last4: paymentMethod.card?.last4 || "",
              exp_month: paymentMethod.card?.exp_month || 0,
              exp_year: paymentMethod.card?.exp_year || 0,
              token: paymentMethod.id,
            },
          }
        );

        await strapi.entityService.create("api::payment.payment", {
          data: {
            Amount: totalAmount.toFixed(2),
            payment_status: "processing",
            payment_method: paymentMethodRecord.documentId,
            order: order.documentId,
          },
        });

        // ✅ Final response
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
