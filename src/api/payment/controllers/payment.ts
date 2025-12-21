import Stripe from "stripe";
import { factories } from "@strapi/strapi";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default factories.createCoreController(
  "api::payment.payment",
  ({ strapi }) => ({
    // ✅ Default CRUD methods
    async find(ctx) {
      // Only allow users to see payments for their own orders
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      // We need to filter by orders that belong to the user
      // First, get user's order IDs
      const userOrders = await strapi.db.query("api::order.order").findMany({
        where: { user: { id: user.id } },
        select: ["documentId"],
      });

      const orderIds = userOrders.map((order) => order.documentId);

      if (!ctx.query.filters) {
        ctx.query.filters = {};
      }

      // Filter payments by user's orders
      const existingFilters = ctx.query.filters || {};
      ctx.query.filters = Object.assign({}, existingFilters, {
        order: { documentId: { $in: orderIds } },
      });

      const result = await super.find(ctx);
      return result;
    },

    async findOne(ctx) {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("You must be logged in");

      const { id } = ctx.params;

      // Build populate object
      const existingPopulate = ctx.query.populate || {};
      const populate = Object.assign({}, existingPopulate, {
        order: {
          populate: {
            user: true,
          },
        },
      });

      // Get the payment with order and user populated
      const entity = await strapi.entityService.findOne(
        "api::payment.payment",
        id,
        {
          populate: populate,
        }
      );

      if (!entity) {
        return ctx.notFound("Payment not found");
      }

      // Check if payment's order belongs to user
      const paymentWithOrder = entity as any;

      if (paymentWithOrder.order?.user?.id !== user.id) {
        return ctx.notFound("Payment not found");
      }

      return { data: entity };
    },
    async webhook(ctx) {
      // 1. استخرج الـ Raw Body باستخدام الـ Symbol الخاص
      const rawBody = ctx.request.body[Symbol.for("unparsedBody")];

      // 2. استخرج التوقيع من الـ Headers
      const signature = ctx.request.headers["stripe-signature"];

      // 3. استخرج الـ Endpoint Secret الخاص بالـ Webhook من إعدادات Stripe لديك
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!rawBody || !signature || !endpointSecret) {
        return ctx.badRequest(
          "Missing required data for signature verification."
        );
      }

      let event;

      try {
        // 4. استخدم Stripe SDK لبناء الحدث والتحقق من التوقيع في خطوة واحدة
        event = stripe.webhooks.constructEvent(
          rawBody, // 👈 هنا نستخدم النص الخام (raw string)
          signature,
          endpointSecret
        );
      } catch (err) {
        // إذا فشل التحقق من التوقيع (مثلاً: الختم الزمني قديم أو البيانات مُعدلة)
        console.error(`Webhook signature verification failed.`, err.message);
        return ctx.unauthorized("Webhook signature verification failed.");
      }

      // قم بتنفيذ منطق عملك هنا (مثلاً: تحديث حالة طلب في قاعدة البيانات)
      try {
        switch (event.type) {
          case "payment_intent.succeeded": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const orderId = paymentIntent.metadata?.orderId;

            if (!orderId) {
              console.error("❌ No orderId in metadata!");
              break;
            }
            
            const payment = await strapi.db
              .query("api::payment.payment")
              .findOne({
                where: { order: { id: orderId } },
                populate: { order: true },
              });

            if (!payment) {
              console.error("❌ Payment not found for order:", orderId);
              break;
            }

            // Step 2: Update the payment
            try {
              await strapi.db.query("api::payment.payment").update({
                where: { id: payment.id },
                data: { payment_status: "succeeded" },
              });
            } catch (updateErr: any) {
              console.error("❌ Error updating payment:", updateErr.message);
              console.error("   Stack:", updateErr.stack);
            }

            // Step 3: Update the order
            try {
              await strapi.db.query("api::order.order").update({
                where: { id: orderId },
                data: { order_status: "Delivered" },
              });
            } catch (updateErr: any) {
              console.error("❌ Error updating order:", updateErr.message);
              console.error("   Stack:", updateErr.stack);
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const orderId = paymentIntent.metadata?.orderId;

            if (!orderId) {
              console.error("❌ No orderId in metadata!");
              break;
            }

            const payment = await strapi.db
              .query("api::payment.payment")
              .findOne({
                where: { order: { id: orderId } },
                populate: { order: true },
              });

            if (payment) {
              try {
                await strapi.db.query("api::payment.payment").update({
                  where: { id: payment.id },
                  data: { payment_status: "failed" },
                });
              } catch (err: any) {
                console.error("❌ Error updating payment:", err.message);
              }

              try {
                await strapi.db.query("api::order.order").update({
                  where: { id: orderId },
                  data: { order_status: "Cancelled" },
                });
              } catch (err: any) {
                console.error("❌ Error updating order:", err.message);
              }
            } else {
              console.error("❌ Payment not found for order:", orderId);
            }
            break;
          }

          default:
        }

        ctx.status = 200;
        ctx.body = { received: true };
      } catch (err: any) {
        console.error("❌ Error processing webhook:", err.message);
        console.error("   Stack:", err.stack);
        ctx.status = 500;
        ctx.body = { error: "Internal server error" };
      }

      // أرسل رد 200 OK إلى Stripe
      ctx.send({ received: true });
    },
  })
);
