import Stripe from "stripe";
import { factories } from "@strapi/strapi";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function calculateDiscountedPrice(product: {
  price: number;
  specialOffers?: any[];
}) {
  let discountedPrice = product.price;
  if (product.specialOffers?.length) {
    const offer = product.specialOffers[0];
    if (offer?.discountType === "percentage") {
      discountedPrice =
        product.price - product.price * (offer.discountValue / 100);
    } else if (offer?.discountType === "fixed") {
      discountedPrice = product.price - offer.discountValue;
    }
  }
  return Math.max(0, discountedPrice);
}

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
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
              populate: ["special_offers"],
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
            specialOffers: product.special_offers || [],
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
            const productId =
              item.product?.id || item.product?.documentId || item.product; // in case product is just a string

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
              product: productRecord.id,
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
