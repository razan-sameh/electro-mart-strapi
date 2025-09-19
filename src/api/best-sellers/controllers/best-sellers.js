import { subDays } from "date-fns";

export async function find(ctx) {
    const db = strapi.db.connection; // Knex connection


    // last 30 days
    const startDate = subDays(new Date(), 30);

    const results = await db("order_items")
        .select("product_id")
        .sum("quantity as total_sold")
        .where("created_at", ">=", startDate)
        .groupBy("product_id")
        .orderBy("total_sold", "desc")
        .limit(10);

    // populate product details
    const products = await strapi.entityService.findMany("api::product.product", {
        filters: { id: results.map(r => r.product_id) },
        populate: ["brand", "category", "images"],
    });

    // merge product details with sales count
    const merged = results.map(r => ({
        product: products.find(p => p.id === r.product_id),
        total_sold: r.total_sold,
    }));

    return merged;
}
