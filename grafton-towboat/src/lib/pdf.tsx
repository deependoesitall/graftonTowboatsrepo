// src/lib/pdf.tsx
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { Order } from '@/types';
import { formatCurrency, formatDate } from './utils';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    padding: 40,
    color: '#1a1a2e',
    backgroundColor: '#FFFFFF',
  },
  header: {
    borderBottom: '3px solid #1B3A5C',
    paddingBottom: 16,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brandBlock: {
    flex: 1,
  },
  brandName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
    marginBottom: 2,
  },
  brandTagline: {
    fontSize: 9,
    color: '#1E5F8C',
    marginBottom: 4,
  },
  brandContact: {
    fontSize: 8,
    color: '#555',
    lineHeight: 1.5,
  },
  orderMeta: {
    textAlign: 'right',
  },
  orderNumber: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#C9922A',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 8,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
    borderBottom: '1px solid #ddd',
    paddingBottom: 4,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  infoCell: {
    width: '48%',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 8,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#222',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1B3A5C',
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  tableHeaderText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottom: '0.5px solid #e8e8e8',
  },
  tableRowAlt: {
    backgroundColor: '#F5F8FC',
  },
  tableCell: {
    fontSize: 9,
    color: '#333',
  },
  colCategory: { width: '15%' },
  colDescription: { width: '38%' },
  colPkg: { width: '12%' },
  colQty: { width: '8%', textAlign: 'right' },
  colPrice: { width: '12%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right' },
  categoryGroup: {
    marginBottom: 4,
  },
  categoryLabel: {
    backgroundColor: '#E8F0F8',
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalsBox: {
    marginTop: 16,
    marginLeft: 'auto',
    width: 220,
    borderTop: '2px solid #1B3A5C',
    paddingTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 10,
    color: '#555',
  },
  totalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#222',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTop: '1px solid #1B3A5C',
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#C9922A',
  },
  notesBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FFF8EC',
    border: '1px solid #E8A93C',
    borderRadius: 2,
  },
  notesLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#C9922A',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: '#444',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: '1px solid #ddd',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#999',
  },
  sinclairBox: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#F0F4F8',
    borderLeft: '3px solid #1B3A5C',
  },
  sinclairTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
    marginBottom: 2,
  },
  sinclairText: {
    fontSize: 8,
    color: '#555',
  },
});

interface OrderPDFProps {
  order: Order;
}

export function OrderPDF({ order }: OrderPDFProps) {
  // Group items by category
  const grouped = order.items.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, typeof order.items>);

  const subtotal = order.subtotal;
  const itemCount = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <Document
      title={`Order ${order.order_number} — Grafton Towboat Services`}
      author="Grafton Towboat Services"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Grafton Towboat Services</Text>
            <Text style={styles.brandTagline}>Groceries, Supplies & Crew Change When You Need It</Text>
            <Text style={styles.brandContact}>
              25 Dagget Hollow · Grafton, IL 62037{'\n'}
              Mississippi Mile Marker 218 · IL Mile Marker 0.7{'\n'}
              (618) 556-0290 · GraftonTowboatServices@gmail.com{'\n'}
              Monitor Channel 68 via Grafton Harbor
            </Text>
          </View>
          <View style={styles.orderMeta}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <Text style={styles.orderDate}>Ordered: {formatDate(order.created_at)}</Text>
            <Text style={styles.orderDate}>Status: {order.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Vessel / Contact Info */}
        <Text style={styles.sectionTitle}>Vessel &amp; Contact Information</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Company / Vessel Name</Text>
            <Text style={styles.infoValue}>{order.company_name}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Contact Person</Text>
            <Text style={styles.infoValue}>{order.contact_name}</Text>
          </View>
          <View style={styles.infoCell}>
            <Text style={styles.infoLabel}>Phone Number</Text>
            <Text style={styles.infoValue}>{order.phone}</Text>
          </View>
          {order.po_number && (
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>PO Number</Text>
              <Text style={styles.infoValue}>{order.po_number}</Text>
            </View>
          )}
          {order.eta && (
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Vessel ETA</Text>
              <Text style={styles.infoValue}>{order.eta}</Text>
            </View>
          )}
        </View>

        {/* Order Items */}
        <Text style={styles.sectionTitle}>Order Items ({itemCount} items)</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colCategory]}>Category</Text>
          <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.colPkg]}>Pack</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Line Total</Text>
        </View>

        {/* Grouped Items */}
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.categoryGroup}>
            <Text style={styles.categoryLabel}>{category}</Text>
            {items.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}
              >
                <Text style={[styles.tableCell, styles.colCategory]}>{item.category}</Text>
                <Text style={[styles.tableCell, styles.colDescription]}>{item.description}</Text>
                <Text style={[styles.tableCell, styles.colPkg]}>{item.pkg_size || '—'}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[styles.tableCell, styles.colTotal]}>{formatCurrency(item.line_total)}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal ({itemCount} items)</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(subtotal)}</Text>
          </View>
        </View>

        {/* Notes */}
        {order.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Special Instructions / Notes</Text>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        )}

        {/* Sinclair Foods Box */}
        <View style={styles.sinclairBox}>
          <Text style={styles.sinclairTitle}>For Sinclair Foods — Grafton, IL</Text>
          <Text style={styles.sinclairText}>
            This order was placed through Grafton Towboat Services digital ordering system.
            Please prepare the items above for delivery to the vessel indicated.
            Contact: (618) 556-0290
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037
          </Text>
          <Text style={styles.footerText}>
            {order.order_number} · Generated {new Date().toLocaleDateString()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
