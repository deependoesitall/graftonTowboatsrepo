// src/types/index.ts

export interface Product {
  id: string;
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  is_active: boolean;
  is_available: boolean;
  created_at?: string;
}

export interface CartItem {
  product_id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  vessel_info: VesselInfo;
}

export interface VesselInfo {
  company_name: string;
  contact_name: string;
  phone: string;
  po_number: string;
  notes: string;
  eta: string;
}

export interface Order {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string;
  po_number: string | null;
  notes: string | null;
  eta: string | null;
  items: OrderItem[];
  subtotal: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  uom: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export type OrderStatus = 'new' | 'in_progress' | 'fulfilled' | 'cancelled';

export interface AdminSettings {
  id: string;
  business_email: string;
  order_email_cc: string | null;
  tax_rate: number;
  tax_enabled: boolean;
  draft_orders_enabled: boolean;
  admin_password_hash: string;
  custom_fields: CustomField[];
}

export interface CustomField {
  id: string;
  label: string;
  key: string;
  type: 'text' | 'textarea' | 'date' | 'select';
  required: boolean;
  options?: string[];
  enabled: boolean;
  order: number;
}

export interface PaginationParams {
  page: number;
  per_page: number;
}

export interface ProductFilters {
  search?: string;
  category?: string;
  sub_category?: string;
}

export interface OrderFilters {
  status?: OrderStatus;
  date_from?: string;
  date_to?: string;
  search?: string;
}
