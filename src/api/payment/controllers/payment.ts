import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default {
  async webhook(ctx) {
    console.log("🔔 Webhook received:", ctx.request.method, ctx.request.url);

    const sig = ctx.request.headers["stripe-signature"];
    const rawBody = ctx.request.rawBody;

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
      event = stripe.webhooks.constructEvent(
        rawBody,
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
};
