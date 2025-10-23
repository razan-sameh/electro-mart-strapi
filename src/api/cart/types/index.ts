export interface CartItem {
  id: number;
  documentId: string;
  Quantity: number;
  product: any;
  product_color?: any;
  cart: any;
}

export interface Cart {
  id: number;
  documentId: string;
  users_permissions_user: number | any;
  cart_items?: CartItem[];
}
