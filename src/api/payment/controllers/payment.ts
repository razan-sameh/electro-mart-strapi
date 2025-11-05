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

    // ✅ Webhook handler
    async webhook(ctx) {
      console.log("🔔 Webhook received:", ctx.request.method, ctx.request.url);

      const sig = ctx.request.headers["stripe-signature"];
      
      // Get raw body from request
      const rawBody = (ctx.request as any).rawBody || ctx.request.body;

      if (!sig) {
        ctx.status = 400;
        ctx.body = { error: "Missing signature" };
        return;
      }

      if (!rawBody) {
        ctx.status = 400;
        ctx.body = { error: "Missing raw body" };
        return;
      }

      let event: Stripe.Event;
      try {
        // If rawBody is an object, stringify it; if it's already a string/buffer, use it
        const payload = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        
        event = stripe.webhooks.constructEvent(
          payload,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET!
        );
        console.log("✅ Webhook verified:", event.type);
      } catch (err: any) {
        console.error("⚠️ Signature verification failed:", err.message);
        ctx.status = 400;
        ctx.body = { error: `Webhook Error: ${err.message}` };
        return;
      }

      try {
        switch (event.type) {
          case "payment_intent.succeeded": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const orderId = paymentIntent.metadata?.orderId;
            console.log(`💰 Payment succeeded for order: ${orderId}`);

            if (orderId) {
              const payment = await strapi.db
                .query("api::payment.payment")
                .findOne({ where: { order: orderId } });

              if (payment) {
                await strapi.db.query("api::payment.payment").update({
                  where: { id: payment.id },
                  data: { payment_status: "succeeded" },
                });

                // Also update the order status
                await strapi.db.query("api::order.order").update({
                  where: { documentId: orderId },
                  data: { order_status: "Pending" }, // or "Processing"
                });
              }
            }
            break;
          }

          case "payment_intent.payment_failed": {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const orderId = paymentIntent.metadata?.orderId;
            console.log(`❌ Payment failed for order: ${orderId}`);

            if (orderId) {
              const payment = await strapi.db
                .query("api::payment.payment")
                .findOne({ where: { order: orderId } });

              if (payment) {
                await strapi.db.query("api::payment.payment").update({
                  where: { id: payment.id },
                  data: { payment_status: "failed" },
                });

                // Optionally update order status
                await strapi.db.query("api::order.order").update({
                  where: { documentId: orderId },
                  data: { order_status: "Cancelled" },
                });
              }
            }
            break;
          }

          default:
            console.log(`ℹ️ Unhandled event type: ${event.type}`);
        }

        ctx.status = 200;
        ctx.body = { received: true };
      } catch (err: any) {
        console.error("❌ Error processing webhook:", err.message);
        ctx.status = 500;
        ctx.body = { error: "Internal server error" };
      }
    },
  })
);