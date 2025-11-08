export interface WishlistItem {
  id: number;
  documentId: string;
  product: any;
  product_color?: any;
  wishlist: any;
}

export interface Wishlist {
  id: number;
  documentId: string;
  users_permissions_user: number | any;
  wishlist_items?: WishlistItem[];
}
