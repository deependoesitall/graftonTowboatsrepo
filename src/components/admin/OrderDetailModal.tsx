'use client';
// src/components/admin/OrderDetailModal.tsx
import { useState } from 'react';
import { X, Download, FileText, Printer, Trash2, Loader2, ShoppingCart, Ship, MapPin, Users, Package, Wrench, CheckCircle2, Eye } from 'lucide-react';
import { Order, OrderStatus } from '@/types';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';
import { ShoppingModeModal } from '@/components/admin/ShoppingModeModal';

interface OrderDetailModalProps {
  order: Order;
  onClose: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
  onDelete?: () => void;
  onRefresh: () => void;
  canEdit?: boolean;
  isOwner?: boolean;
  deleting?: boolean;
}

export function OrderDetailModal({
  order, onClose, onStatusChange, onDownloadPdf, onDownloadCsv,
  onDelete, onRefresh, canEdit = true, isOwner = false, deleting = false,
}: OrderDetailModalProps) {
  const [shoppingMode, setShoppingMode] = useState(false);
  const [markingFulfilled, setMarkingFulfilled] = useState(false);

  const groceryItems = order.items.filter(i => i.item_type !== 'service');
  const serviceItems = order.items.filter(i => i.item_type === 'service');
  const subtotal = groceryItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const ext = order.extended_info;

  const deliveryMethodLabel = order.delivery_method === 'boat' ? 'Boat Delivery'
    : order.delivery_method === 'van' ? 'Van Delivery' : null;
  const approachLabel = order.approach_side
    ? order.approach_side.charAt(0).toUpperCase() + order.approach_side.slice(1)
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-fade-in">

          {/* Header */}
          <div className="bg-brand-navy px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div>
              <p className="text-brand-sky text-xs uppercase tracking-wide">Order Details</p>
              <h2 className="text-white font-display text-xl font-bold">{order.order_number}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={onDownloadPdf} className="text-brand-gold hover:text-brand-amber transition-colors" title="View PDF">
                <Eye className="w-5 h-5" />
              </button>
              <button onClick={onDownloadPdf} className="text-brand-gold hover:text-brand-amber transition-colors" title="Download PDF">
                <Download className="w-5 h-5" />
              </button>
              <button onClick={onDownloadCsv} className="text-brand-gold hover:text-brand-amber transition-colors" title="Download CSV">
                <FileText className="w-5 h-5" />
              </button>
              {isOwner && onDelete && (
                <button onClick={onDelete} disabled={deleting}
                  className="text-brand-sky hover:text-red-400 transition-colors disabled:opacity-50" title="Delete Order">
                  {deleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                </button>
              )}
              <button onClick={onClose} className="text-brand-sky hover:text-white transition-colors ml-2">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-5">

            {/* Company / Billing */}
            <Section icon={<FileText className="w-3.5 h-3.5" />} title="Company &amp; Billing">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <IB label="Company" value={order.company_name} />
                <IB label="Billing Contact" value={order.contact_name} />
                <IB label="Phone" value={order.phone} />
                {order.customer_email && <IB label="Email" value={order.customer_email} />}
                {order.po_number && <IB label="PO Number" value={order.po_number} />}
                <IB label="Ordered" value={formatDate(order.created_at)} />
              </div>
            </Section>

            {/* Vessel */}
            {(order.vessel_name || order.captain_name) && (
              <Section icon={<Ship className="w-3.5 h-3.5" />} title="Vessel Information">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.vessel_name   && <IB label="Vessel Name"    value={order.vessel_name} />}
                  {order.vessel_type   && <IB label="Vessel Type"    value={order.vessel_type} />}
                  {order.captain_name  && <IB label="Captain"        value={order.captain_name} />}
                  {order.captain_phone && <IB label="Captain Phone"  value={order.captain_phone} />}
                  {order.vessel_email  && <IB label="Vessel Email"   value={order.vessel_email} />}
                </div>
                {ext?.order_contact_name && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Order Contact</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <IB label="Name" value={ext.order_contact_name} />
                      {ext.order_contact_title && <IB label="Title" value={ext.order_contact_title} />}
                      {ext.order_contact_phone && <IB label="Phone" value={ext.order_contact_phone} />}
                      {ext.order_contact_email && <IB label="Email" value={ext.order_contact_email} />}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Delivery */}
            {(order.terminal_name || order.arrival_date || order.delivery_method) && (
              <Section icon={<MapPin className="w-3.5 h-3.5" />} title="Delivery Information">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.terminal_name && <IB label="Terminal / Location" value={order.terminal_name} highlight />}
                  {order.arrival_date  && <IB label="Arrival Date"        value={order.arrival_date}  highlight />}
                  {order.arrival_time  && <IB label="Arrival Time"        value={order.arrival_time}  highlight />}
                  {deliveryMethodLabel && <IB label="Method"              value={deliveryMethodLabel} />}
                  {approachLabel       && <IB label="Approach Side"       value={approachLabel} />}
                  {order.vhf_channel   && <IB label="VHF Channel"         value={order.vhf_channel} />}
                </div>
                {ext?.secondary_terminal_name && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Secondary Delivery</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <IB label="Terminal" value={ext.secondary_terminal_name} />
                      {ext.secondary_arrival_date && <IB label="Arrival Date" value={ext.secondary_arrival_date} />}
                      {ext.secondary_arrival_time && <IB label="Arrival Time" value={ext.secondary_arrival_time} />}
                      {ext.secondary_delivery_method && (
                        <IB label="Method" value={ext.secondary_delivery_method === 'boat' ? 'Boat Delivery' : 'Van Delivery'} />
                      )}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Crew Change */}
            {order.crew_change && (
              <Section icon={<Users className="w-3.5 h-3.5" />} title="Crew Change">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {order.crew_arriving  != null && <IB label="Arriving"  value={String(order.crew_arriving)} />}
                  {order.crew_departing != null && <IB label="Departing" value={String(order.crew_departing)} />}
                </div>
              </Section>
            )}

            {/* Notes */}
            {(order.notes || order.eta) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Notes / Instructions</p>
                {order.eta   && <p className="text-sm text-amber-900"><strong>ETA:</strong> {order.eta}</p>}
                {order.notes && <p className="text-sm text-amber-900">{order.notes}</p>}
              </div>
            )}

            {/* Status + action button */}
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status</label>
              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select className="border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold bg-white"
                    value={order.status} onChange={e => onStatusChange(e.target.value as OrderStatus)}>
                    {ORDER_STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  {order.status !== 'fulfilled' && order.customer_email && (
                    <span className="text-xs text-gray-400">
                      Setting to <strong>Fulfilled</strong> sends the Order Shopped email to {order.customer_email}
                    </span>
                  )}
                </div>
              ) : (
                <span className="border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold bg-gray-50 text-gray-600">
                  {ORDER_STATUSES.find(s => s.value === order.status)?.label || order.status}
                </span>
              )}
              {canEdit && order.status !== 'fulfilled' && order.status !== 'cancelled' && (
                groceryItems.length === 0 ? (
                  <button
                    disabled={markingFulfilled}
                    onClick={async () => {
                      if (!confirm('Mark this order as fulfilled? A confirmation email will be sent to the customer.')) return;
                      setMarkingFulfilled(true);
                      await onStatusChange('fulfilled');
                      setMarkingFulfilled(false);
                    }}
                    className="ml-auto flex items-center gap-1.5 bg-brand-orange text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60">
                    {markingFulfilled ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Mark as Fulfilled
                  </button>
                ) : (
                  <button onClick={() => setShoppingMode(true)}
                    className="ml-auto flex items-center gap-1.5 bg-brand-green text-white text-xs font-bold uppercase tracking-wide px-4 py-2 rounded-lg hover:bg-brand-gmed transition-colors">
                    <ShoppingCart className="w-4 h-4" /> Enter Shopping Mode
                  </button>
                )
              )}
            </div>

            {/* Crew Change callout for service-only orders */}
            {order.crew_change && groceryItems.length === 0 && (
              <div className="flex items-start gap-4 bg-orange-50 border-2 border-brand-orange rounded-lg p-4">
                <Users className="w-6 h-6 text-brand-orange shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-brand-orange text-sm uppercase tracking-wide mb-2">Crew Change Required</p>
                  <div className="flex gap-8">
                    <div>
                      <p className="text-xs text-gray-500">Arriving</p>
                      <p className="text-2xl font-bold text-brand-navy">{order.crew_arriving ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Departing</p>
                      <p className="text-2xl font-bold text-brand-orange">{order.crew_departing ?? 0}</p>
                    </div>
                  </div>
                  {(order.terminal_name || order.arrival_date) && (
                    <p className="text-xs text-gray-500 mt-2">
                      {order.terminal_name && <span><strong>Location:</strong> {order.terminal_name}&nbsp;&nbsp;</span>}
                      {order.arrival_date  && <span><strong>Date:</strong> {order.arrival_date}{order.arrival_time ? ` at ${order.arrival_time}` : ''}</span>}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grocery Items */}
            {groceryItems.length > 0 && (
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy mb-3">
                  Grocery Items ({groceryItems.length} lines)
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Item #</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Item</th>
                        <th className="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Pack</th>
                        <th className="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase">Qty</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groceryItems.map(item => (
                        <tr key={item.id} className={item.shopping_status === 'out_of_stock' ? 'opacity-40 line-through' : ''}>
                          <td className="px-3 py-2 text-xs text-gray-400 font-mono">{item.upc || '—'}</td>
                          <td className="px-3 py-2">
                            {item.is_substitution && (
                              <span className="inline-block text-[9px] font-bold uppercase tracking-wide text-brand-orange bg-brand-orange/10 px-1 py-0.5 rounded mr-1">Sub</span>
                            )}
                            <p className="font-medium text-brand-navy text-xs inline">{item.description}</p>
                            <p className="text-xs text-gray-400">{item.category}</p>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{item.pkg_size || '—'}</td>
                          <td className="px-3 py-2 text-center font-bold">{item.quantity}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatCurrency(item.unit_price)}</td>
                          <td className="px-3 py-2 text-right font-bold text-xs">
                            {formatCurrency(item.actual_total ?? item.unit_price * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-brand-sand/30 border-t-2 border-brand-gold/30">
                        <td colSpan={5} className="px-3 py-2 font-bold text-brand-navy text-sm">
                          TOTAL ({groceryItems.reduce((s, i) => s + i.quantity, 0)} items)
                        </td>
                        <td className="px-3 py-2 text-right font-display text-base font-bold text-brand-navy">
                          {formatCurrency(subtotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Additional Services */}
            {serviceItems.length > 0 && (
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-brand-orange" /> Additional Services
                </h3>
                <div className="space-y-3">
                  {serviceItems.map(item => {
                    const d = item.service_details as Record<string, string> | null;
                    return (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {item.service_type === 'parts_pickup'
                            ? <Wrench className="w-4 h-4 text-brand-navy" />
                            : <Package className="w-4 h-4 text-brand-orange" />}
                          <span className="font-bold text-brand-navy text-sm">{item.description}</span>
                        </div>
                        {d && (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {item.service_type === 'parts_pickup' && (<>
                              {d.pickup_location && <IB label="Pickup Location" value={d.pickup_location} />}
                              {d.order_number    && <IB label="Order #"         value={d.order_number} />}
                              {d.contact_name    && <IB label="Contact"         value={d.contact_name} />}
                              {d.contact_phone   && <IB label="Phone"           value={d.contact_phone} />}
                            </>)}
                            {item.service_type === 'package_delivery' && (<>
                              {d.description  && <IB label="Description" value={d.description} />}
                              {d.origin       && <IB label="From"        value={d.origin} />}
                              {d.contact_name && <IB label="Contact"     value={d.contact_name} />}
                              {d.contact_phone && <IB label="Phone"      value={d.contact_phone} />}
                            </>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sinclair Foods Summary */}
            {groceryItems.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Sinclair Foods Summary
                </p>
                <div className="text-xs text-blue-800 space-y-0.5">
                  {order.vessel_name && <p><strong>Vessel:</strong> {order.vessel_name} {order.vessel_type ? `(${order.vessel_type})` : ''}</p>}
                  {!order.vessel_name && <p><strong>Company:</strong> {order.company_name}</p>}
                  {order.captain_name && <p><strong>Captain:</strong> {order.captain_name} {order.captain_phone ? `· ${order.captain_phone}` : ''}</p>}
                  {order.terminal_name && <p><strong>Deliver To:</strong> {order.terminal_name}</p>}
                  {(order.arrival_date || order.arrival_time) && (
                    <p><strong>Arrival:</strong> {[order.arrival_date, order.arrival_time].filter(Boolean).join(', ')}</p>
                  )}
                  {order.eta && <p><strong>ETA:</strong> {order.eta}</p>}
                  <p><strong>Total Items:</strong> {groceryItems.reduce((s, i) => s + i.quantity, 0)}</p>
                  <p><strong>Order Total:</strong> {formatCurrency(subtotal)}</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {shoppingMode && (
        <ShoppingModeModal
          order={order}
          onClose={() => { setShoppingMode(false); onRefresh(); }}
          onComplete={() => { setShoppingMode(false); onRefresh(); onClose(); }}
        />
      )}
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-brand-navy">{icon}</span>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide"
          dangerouslySetInnerHTML={{ __html: title }} />
      </div>
      {children}
    </div>
  );
}

function IB({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-bold break-all ${highlight ? 'text-brand-gold' : 'text-brand-navy'}`}>{value}</p>
    </div>
  );
}
