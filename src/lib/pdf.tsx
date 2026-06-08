// src/lib/pdf.tsx
import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
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
  brandBlock: { flex: 1 },
  brandName: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#1B3A5C', marginBottom: 2 },
  brandTagline: { fontSize: 9, color: '#1E5F8C', marginBottom: 4 },
  brandContact: { fontSize: 8, color: '#555', lineHeight: 1.5 },
  orderMeta: { textAlign: 'right' },
  orderNumber: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#C9922A', marginBottom: 4 },
  orderDate: { fontSize: 8, color: '#666', marginBottom: 2 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#1B3A5C',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
    borderBottom: '1px solid #ddd',
    paddingBottom: 3,
  },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  infoCell: { width: '50%', paddingRight: 10, marginBottom: 8 },
  infoLabel: { fontSize: 8, color: '#888', marginBottom: 2 },
  infoValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1B3A5C' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1B3A5C',
    padding: 6,
    marginBottom: 0,
  },
  tableHeaderText: { fontSize: 8, color: '#fff', fontFamily: 'Helvetica-Bold' },
  categoryGroup: { marginBottom: 4 },
  categoryLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#1E5F8C',
    backgroundColor: '#EBF4FF',
    padding: '3 6',
    marginBottom: 0,
  },
  tableRow: { flexDirection: 'row', padding: '5 6', borderBottom: '1px solid #eee' },
  tableRowAlt: { backgroundColor: '#F9FAFB' },
  tableCell: { fontSize: 9, color: '#333' },
  colCategory: { width: '14%' },
  colDescription: { width: '32%' },
  colPkg: { width: '16%' },
  colQty: { width: '8%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  totalsBox: {
    marginTop: 10,
    marginLeft: 'auto',
    width: '40%',
    borderTop: '2px solid #1B3A5C',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', padding: '4 6' },
  totalLabel: { fontSize: 9, color: '#555' },
  totalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#333' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: '6 6',
    backgroundColor: '#F5E6C8',
    borderTop: '1px solid #C9922A',
  },
  grandTotalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1B3A5C' },
  grandTotalValue: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#C9922A' },
  notesBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FFF8EC',
    border: '1px solid #E8A93C',
  },
  notesLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#C9922A', marginBottom: 4 },
  notesText: { fontSize: 9, color: '#444', lineHeight: 1.5 },
  sinclairBox: {
    marginTop: 16,
    padding: 10,
    border: '2px solid #1B3A5C',
    backgroundColor: '#F0F4F8',
  },
  sinclairTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1B3A5C', marginBottom: 4 },
  sinclairText: { fontSize: 9, color: '#444', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center' },
  footerText: { fontSize: 8, color: '#999', marginBottom: 2 },
});

interface OrderPDFProps {
  order: Order;
}

export function OrderPDFDocument({ order }: OrderPDFProps) {
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
      title={'Order ' + order.order_number + ' - Grafton Towboat Services'}
      author="Grafton Towboat Services"
    >
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Grafton Towboat Services</Text>
            <Text style={styles.brandTagline}>Groceries, Supplies & Crew Change</Text>
            <Text style={styles.brandContact}>
              {'25 Dagget Hollow · Grafton, IL 62037\n'}
              {'Mississippi Mile Marker 218\n'}
              {'(618) 556-0290 · GraftonTowboatServices@gmail.com\n'}
              {'Monitor Channel 68 via Grafton Harbor'}
            </Text>
          </View>
          <View style={styles.orderMeta}>
            <Text style={styles.orderNumber}>{order.order_number}</Text>
            <Text style={styles.orderDate}>{'Ordered: ' + formatDate(order.created_at)}</Text>
            <Text style={styles.orderDate}>{'Status: ' + order.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Vessel / Contact Info */}
        <Text style={styles.sectionTitle}>Vessel & Contact Information</Text>
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
          {order.po_number ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>PO Number</Text>
              <Text style={styles.infoValue}>{order.po_number}</Text>
            </View>
          ) : null}
          {order.eta ? (
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Vessel ETA</Text>
              <Text style={styles.infoValue}>{order.eta}</Text>
            </View>
          ) : null}
        </View>

        {/* Order Items */}
        <Text style={styles.sectionTitle}>{'Order Items (' + String(itemCount) + ' items)'}</Text>

        {/* Table Header */}
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.colCategory]}>Category</Text>
          <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.colPkg]}>Pack</Text>
          <Text style={[styles.tableHeaderText, styles.colQty]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.colPrice]}>Unit Price</Text>
          <Text style={[styles.tableHeaderText, styles.colTotal]}>Total</Text>
        </View>

        {/* Grouped Items */}
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category} style={styles.categoryGroup}>
            <Text style={styles.categoryLabel}>{category}</Text>
            {items.map((item, idx) => (
              <View
                key={item.id}
                style={idx % 2 === 1 ? [styles.tableRow, styles.tableRowAlt] : styles.tableRow}
              >
                <Text style={[styles.tableCell, styles.colCategory]}>{item.category}</Text>
                <Text style={[styles.tableCell, styles.colDescription]}>{item.description}</Text>
                <Text style={[styles.tableCell, styles.colPkg]}>{item.pkg_size ? item.pkg_size : '-'}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{String(item.quantity)}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[styles.tableCell, styles.colTotal]}>{formatCurrency(item.line_total)}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{'Subtotal (' + String(itemCount) + ' items)'}</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>TOTAL</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(subtotal)}</Text>
          </View>
        </View>

        {/* Notes */}
        {order.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Special Instructions / Notes</Text>
            <Text style={styles.notesText}>{order.notes}</Text>
          </View>
        ) : null}

        {/* Sinclair Foods Box */}
        <View style={styles.sinclairBox}>
          <Text style={styles.sinclairTitle}>For Sinclair Foods — Grafton, IL</Text>
          <Text style={styles.sinclairText}>
            {'This order was placed through Grafton Towboat Services digital ordering system.\n'}
            {'Please prepare the items above for delivery to the vessel indicated.\n'}
            {'Contact: (618) 556-0290'}
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Grafton Towboat Services · 25 Dagget Hollow, Grafton, IL 62037
          </Text>
          <Text style={styles.footerText}>
            {order.order_number + ' · Generated ' + new Date().toLocaleDateString()}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
