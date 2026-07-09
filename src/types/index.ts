// src/types/index.ts

// Crew change is a tri-state: 'maybe' means the crew isn't sure yet —
// no required counts, just an optional note.
export type CrewChange = 'yes' | 'no' | 'maybe';

export interface Product {
  id: string;
  category: string;
  sub_category: string;
  upc: string | null;
  description: string;
  details: string | null;
  image_url: string | null;
  location: string | null;
  /** Sinclair's walkpath stop number for this location (from Freshop). */
  location_seq: number | null;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  tags: string[];
  is_active: boolean;
  is_available: boolean;
  billed_by_weight: boolean;
  created_at?: string;
}

// Who pays for a cart/order line: the vessel's company account (invoiced
// monthly) or an individual crew member cash-on-delivery.
export type PaidBy = 'vessel' | 'cod';
export type CodPaymentMethod = 'cash' | 'venmo' | 'credit_card';

export interface CartItem {
  product_id: string;
  description: string;
  category: string;
  pkg_size: string | null;
  uom: string | null;
  price: number;
  quantity: number;
  /** Optional for backwards compatibility with carts saved before this field existed. */
  billed_by_weight?: boolean;
  /** Product image snapshot — carries through to checkout review & order history. */
  image_url?: string | null;
  /** Defaults to 'vessel' for carts saved before the COD rework. */
  paid_by?: PaidBy;
  /** Crew member name — required when paid_by === 'cod'. */
  cod_name?: string;
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
  crew_change: CrewChange;
  crew_change_notes: string;
  crew_arriving: string;
  crew_departing: string;
  /** Legacy free-text COD notes — replaced by per-line paid_by; kept for old saved carts. */
  personal_cod_notes: string;
  // COD settlement (only relevant when the cart has COD lines)
  cod_payment_method: CodPaymentMethod | '';
  cod_preferred_phone: string;
  cod_contact_time: string;
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

// "Other" third-party pickup — handled by Sinclair's (lives on the Sinclair's
// catalog tab, not Additional Services). E.g. a small Walmart online order.
// Supports multiple entries (Jen: no limit needed).
export interface OtherPickupItem {
  url: string;
  notes: string; // size, color, quantity, etc.
}
export interface OtherPickup {
  enabled: boolean;
  items: OtherPickupItem[];
}

export interface AdditionalServices {
  parts_pickup: PartsPickup;
  package_delivery: PackageDelivery;
  other_pickup: OtherPickup;
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
  crew_change: CrewChange;
  crew_change_notes: string | null;
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
    personal_cod_notes?: string;
  } | null;
  notes: string | null;
  eta: string | null;
  // COD settlement (null when the order has no COD lines)
  cod_payment_method: CodPaymentMethod | null;
  cod_preferred_phone: string | null;
  cod_contact_time: string | null;
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
  /** Sinclair's walkpath stop number — snapshot at order time (may be null on old orders). */
  location_seq: number | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  shopping_status: 'pending' | 'shopped' | 'out_of_stock';
  actual_weight: number | null;
  actual_total: number | null;
  is_substitution: boolean;
  substitutes_item_id: string | null;
  item_type: 'grocery' | 'service';
  service_type: 'parts_pickup' | 'package_delivery' | 'other_pickup' | null;
  service_details: Record<string, string> | null;
  paid_by: PaidBy;
  cod_name: string | null;
  image_url: string | null;
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
