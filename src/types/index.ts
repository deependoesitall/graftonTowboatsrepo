// src/types/index.ts

export interface Product {
  id: string;
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  details: string | null;
  image_url: string | null;
  location: string | null;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  tags: string[];
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

// -- Vessel / order contact info collected at checkout
export interface VesselInfo {
  company_name: string;
  po_number: string;
  contact_name: string;
  phone: string;
  email: string;
  vessel_name: string;
  vessel_type: string;
  vessel_type_other: string;
  captain_name: string;
  captain_phone: string;
  vessel_email: string;
  order_contact_name: string;
  order_contact_title: string;
  order_contact_phone: string;
  order_contact_email: string;
  terminal_name: string;
  arrival_date: string;
  arrival_time: string;
  delivery_method: 'boat' | 'van' | '';
  approach_side: 'port' | 'starboard' | 'either' | '';
  vhf_channel: string;
  secondary_terminal_name: string;
  secondary_arrival_date: string;
  secondary_arrival_time: string;
  secondary_delivery_method: 'boat' | 'van' | '';
  crew_change: boolean;
  crew_arriving: string;
  crew_departing: string;
  notes: string;
  eta: string;
}

// -- Additional services
export interface PartsPickup {
  enabled: boolean;
  pickup_location: string;
  order_number: string;
  contact_name: string;
  contact_phone: string;
}

export interface PackageDelivery {
  enabled: boolean;
  description: string;
  origin: string;
  contact_name: string;
  contact_phone: string;
}

export interface AdditionalServices {
  parts_pickup: PartsPickup;
  package_delivery: PackageDelivery;
}

// -- Orders
export interface Order {
  id: string;
  order_number: string;
  company_name: string;
  contact_name: string;
  phone: string;
  customer_email: string | null;
  po_number: string | null;
  vessel_name: string | null;
  vessel_type: string | null;
  captain_name: string | null;
  captain_phone: string | null;
  vessel_email: string | null;
  delivery_method: 'boat' | 'van' | null;
  terminal_name: string | null;
  arrival_date: string | null;
  arrival_time: string | null;
  approach_side: 'port' | 'starboard' | 'either' | null;
  vhf_channel: string | null;
  crew_change: boolean;
  crew_arriving: number | null;
  crew_departing: number | null;
  extended_info: {
    order_contact_name?: string;
    order_contact_title?: string;
    order_contact_phone?: string;
    order_contact_email?: string;
    secondary_terminal_name?: string;
    secondary_arrival_date?: string;
    secondary_arrival_time?: string;
    secondary_delivery_method?: string;
    docking_notes?: string;
  } | null;
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
  upc: string | null;
  location: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  shopping_status: 'pending' | 'shopped' | 'out_of_stock';
  actual_weight: number | null;
  actual_total: number | null;
  is_substitution: boolean;
  substitutes_item_id: string | null;
  item_type: 'grocery' | 'service';
  service_type: 'parts_pickup' | 'package_delivery' | null;
  service_details: Record<string, string> | null;
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

export const VESSEL_TYPES = [
  'Towboat',
  'Line Boat',
  'Dredge',
  'Tugboat',
  'Barge',
  'Push Boat',
  'Ferry',
  'Other',
] as const;

export type VesselType = typeof VESSEL_TYPES[number];
