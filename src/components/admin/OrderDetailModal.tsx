'use client';
// src/components/admin/OrderDetailModal.tsx
import { useState } from 'react';
import { X, Download, FileText, Printer, Trash2, Loader2 } from 'lucide-react';
import { Order, OrderStatus } from '@/types';
import { formatCurrency, formatDate, ORDER_STATUSES } from '@/lib/utils';

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
  order,
  onClose,
  onStatusChange,
  onDownloadPdf,
  onDownloadCsv,
  onDelete,
  canEdit = true,
  isOwner = false,
  deleting = false,
}: OrderDetailModalProps) {
  const [editingItems, setEditingItems] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map(i => [i.id, i.quantity]))
  );

  const subtotal = order.items.reduce((s, i) => s + i.unit_price * (quantities[i.id] ?? i.quantity), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl animate-fade-in">
        {/* Header */}
        <div className="bg-brand-navy px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <p className="text-brand-sky text-xs uppercase tracking-wide">Order Details</p>
            <h2 className="text-white font-display text-xl font-bold">{order.order_number}</h2>
          </div>
          <div className="flex items-center gap-3">
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

        <div className="p-6 space-y-6">
          {/* Vessel info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <InfoBlock label="Company / Vessel" value={order.company_name} />
            <InfoBlock label="Contact" value={order.contact_name} />
            <InfoBlock label="Phone" value={order.phone} />
            {order.customer_email && (
              <InfoBlock label="Customer Email" value={order.customer_email} />
            )}
            {order.po_number && <InfoBlock label="PO Number" value={order.po_number} />}
            {order.eta && <InfoBlock label="Vessel ETA" value={order.eta} highlight />}
            <InfoBlock label="Ordered" value={formatDate(order.created_at)} />
          </div>

          {order.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Special Instructions</p>
              <p className="text-sm text-amber-900">{order.notes}</p>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-4">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Status</label>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <select
                  className="border border-gray-200 rounded px-3 py-1.5 text-sm font-semibold bg-white"
                  value={order.status}
                  onChange={e => onStatusChange(e.target.value as OrderStatus)}
                >
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
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-bold text-brand-navy">
                Order Items ({order.items.length} lines)
              </h3>
            </div>
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
                  {order.items.map(item => (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{item.upc || '—'}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-brand-navy text-xs">{item.description}</p>
                        <p className="text-xs text-gray-400">{item.category}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.pkg_size || '—'}</td>
                      <td className="px-3 py-2 text-center font-bold">{quantities[item.id] ?? item.quantity}</td>
                      <td className="px-3 py-2 text-right text-xs">{formatCurrency(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-bold text-xs">
                        {formatCurrency(item.unit_price * (quantities[item.id] ?? item.quantity))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-sand/30 border-t-2 border-brand-gold/30">
                    <td colSpan={5} className="px-3 py-2 font-bold text-brand-navy text-sm">
                      TOTAL ({order.items.reduce((s, i) => s + i.quantity, 0)} items)
                    </td>
                    <td className="px-3 py-2 text-right font-display text-base font-bold text-brand-navy">
                      {formatCurrency(subtotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Sinclair Foods summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5" />
              Sinclair Foods Summary
            </p>
            <div className="text-xs text-blue-800 space-y-0.5">
              <p><strong>Vessel:</strong> {order.company_name}</p>
              <p><strong>Contact:</strong> {order.contact_name} · {order.phone}</p>
              {order.eta && <p><strong>ETA:</strong> {order.eta}</p>}
              <p><strong>Total Items:</strong> {order.items.reduce((s, i) => s + i.quantity, 0)}</p>
              <p><strong>Order Total:</strong> {formatCurrency(subtotal)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-bold break-all ${highlight ? 'text-brand-gold' : 'text-brand-navy'}`}>
        {value}
      </p>
    </div>
  );
}
