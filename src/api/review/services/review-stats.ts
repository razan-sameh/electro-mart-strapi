export async function updateProductStats(strapi: any, productId: number) {
  const reviews = await strapi.db.query('api::review.review').findMany({
    where: { product: productId },
  });

  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.Rating, 0) / totalReviews
      : null;

  // Use entityService instead of db.query to ensure publishing
  await strapi.entityService.update('api::product.product', productId, {
    data: { 
      totalReviews, 
      averageRating 
    },
  });
}