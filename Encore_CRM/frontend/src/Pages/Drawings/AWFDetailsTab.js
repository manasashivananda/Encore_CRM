/**
 * AWFDetailsTab — Displays saved AWF entries for an order as a card grid.
 * Card layout matches DrawingDetailsTab (Flashing) normal card style.
 * Double-click a card to open full-screen lightbox (same as Flashing).
 *
 * Props:
 *   orderId       — order d_order_unique_id (e.g. "IN109xxx")
 *   mongoId       — order MongoDB _id
 *   onEntryDelete — callback to refresh parent after delete
 *   currentPage   — "orders" or "quotes"
 *   type          — "order" or "quote"
 *   showEditDelete — boolean, controls action visibility
 *
 * Created: 24-Feb-2026
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Spinner, Table, Button } from 'react-bootstrap';
import { MyDiv } from '../Common/Components';
import axios from 'axios';
import swal from 'sweetalert2';
import { FaTrash, FaPencilAlt, FaBarcode } from 'react-icons/fa';
import { Package } from 'lucide-react';
import { API_BASE_URL, tokenManager } from '../../config/api.config';

const AWFDetailsTab = ({ orderId, mongoId, onEntryDelete, currentPage, type, showEditDelete }) => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // ═══════════════════════════════════════════════════════════════
  // LIGHTBOX STATE
  // ═══════════════════════════════════════════════════════════════
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxIndexRef = useRef(0);

  const openLightbox = (index) => {
    setLightboxIndex(index);
    lightboxIndexRef.current = index;
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    const idx = lightboxIndexRef.current;
    setLightboxOpen(false);

    // Scroll to and highlight the card
    requestAnimationFrame(() => {
      const col = document.querySelector(`[data-awf-index="${idx}"]`);
      if (col) {
        col.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const card = col.querySelector('.card') || col;
        card.style.transition = 'box-shadow 0.3s';
        card.style.boxShadow = '0 0 10px 3px rgba(0, 123, 255, 0.5)';
        setTimeout(() => { card.style.boxShadow = ''; }, 1500);
      }
    });
  };

  const goLightboxPrev = () => {
    setLightboxIndex(prev => {
      const next = prev > 0 ? prev - 1 : entries.length - 1;
      lightboxIndexRef.current = next;
      return next;
    });
  };

  const goLightboxNext = () => {
    setLightboxIndex(prev => {
      const next = prev < entries.length - 1 ? prev + 1 : 0;
      lightboxIndexRef.current = next;
      return next;
    });
  };

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') goLightboxPrev();
      else if (e.key === 'ArrowRight') goLightboxNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, entries.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEntries = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const token = tokenManager.getToken();
      const response = await axios.get(
        `${API_BASE_URL}/api/awf-entries/${orderId}`,
        { headers: { 'x-access-token': token } }
      );
      const resData = response.data;
      let list = [];
      if (Array.isArray(resData)) {
        list = resData;
      } else if (resData && Array.isArray(resData.data)) {
        list = resData.data;
      } else if (resData && Array.isArray(resData.entries)) {
        list = resData.entries;
      }
      setEntries(list);
    } catch (error) {
      console.error('Failed to fetch AWF entries:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDelete = async (entryId) => {
    const result = await swal.fire({
      title: 'Delete AWF Entry?',
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it',
    });

    if (!result.isConfirmed) return;

    try {
      const token = tokenManager.getToken();
      await axios.delete(
        `${API_BASE_URL}/api/awf-entries/${entryId}`,
        { headers: { 'x-access-token': token } }
      );
      setEntries(prev => prev.filter(e => e._id !== entryId));
      if (onEntryDelete) onEntryDelete();
    } catch (error) {
      console.error('Failed to delete AWF entry:', error);
      swal.fire('Error', 'Failed to delete AWF entry.', 'error');
    }
  };

  const handleEdit = (entry) => {
    const page = orderId?.startsWith('IN') ? 'orders' : 'quotes';
    navigate(`/${page}/${mongoId}/awf/select-materials?productId=${entry.productId}`, {
      state: {
        orderNumber: orderId,
        customerName: entry.customerName,
        customerId: entry.customerId,
        orderId: mongoId,
        name: entry.productName,
        productId: entry.productId,
        productImage: entry.productImage,
        partGroup: 'AWF',
        partClass: entry.partClass,
        subCategory: entry.subCategory || '',
        previousPage: currentPage,
        editEntryId: entry._id,
        editData: {
          material: entry.material,
          color: entry.color,
          thickness: entry.thickness,
          numberOfPieces: entry.numberOfPieces,
          length: entry.length,
          dimWidth: entry.dimensions?.width,
          dimHeight: entry.dimensions?.height,
          tapered: entry.tapered,
          barcode: entry.barcode,
          note: entry.note,
          unitPrice: entry.unitPrice,
          // Custom Offset fields
          size: entry.size,
          measurements: entry.measurements,
          angleDegree: entry.angleDegree,
          offsetType: entry.offsetType,
          adjustableRange: entry.adjustableRange,
          seamSide: entry.seamSide,
        }
      }
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER: Card content (reused in grid cards and lightbox)
  // ═══════════════════════════════════════════════════════════════
  const renderEntryContent = (entry, isLightbox = false) => {
    const fontSize = isLightbox ? 1.8 : 1;
    return (
      <>
        {/* ── HEADER ROW: product info (left) | color (center) | qty table (right) ── */}
        <div style={{
          display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'start', gap: '5px', marginBottom: '5px', width: '100%',
        }}>
          {/* Left: Product info */}
          <div style={{ padding: '4px 8px', fontSize: `${18 * fontSize}px`, fontWeight: 'bold', border: 'none' }}>
            {entry.productName}
            <div style={{ fontSize: `${13 * fontSize}px`, fontWeight: '500', color: '#666' }}>
              {entry.partClass}{entry.subCategory ? ` / ${entry.subCategory}` : ''}
            </div>
            {entry.material && (
              <div style={{ fontSize: `${13 * fontSize}px`, fontWeight: '500', color: '#666' }}>
                Material: {entry.material}{entry.thickness != null ? ` ${entry.thickness}` : ''}
              </div>
            )}
          </div>

          {/* Center: Color name */}
          {entry.color && (
            <div style={{ textAlign: 'center', fontSize: `${32 * fontSize}px`, fontWeight: 'bold', color: '#2c3e50' }}>
              {entry.color.toUpperCase()}
            </div>
          )}

          {/* Right: Len Table */}
          <div>
            <Table size="sm" bordered className="text-center mb-0">
              <thead>
                <tr style={{ lineHeight: '1' }}>
                  <th style={{ padding: `${4 * fontSize}px ${8 * fontSize}px`, fontWeight: 'bold', fontSize: `${22 * fontSize}px` }}>Qty/Len</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ lineHeight: '1' }}>
                  <td style={{ padding: `${3 * fontSize}px ${8 * fontSize}px`, fontWeight: 'bold', fontSize: `${22 * fontSize}px` }}>
                    {entry.numberOfPieces || 0}{entry.length ? ` x ${Number(entry.length).toFixed(3)}` : ''}
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        </div>

        {/* ── BARCODE STICKER (if barcode selected) ── */}
        {entry.barcode && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: `${6 * fontSize}px 0` }}>
            <span style={{ fontSize: `${18 * fontSize}px`, fontWeight: 900, letterSpacing: '2px' }}>BARCODE</span>
            <FaBarcode size={36 * fontSize} />
            <span style={{ fontSize: `${18 * fontSize}px`, fontWeight: 900, letterSpacing: '2px' }}>STICKERS</span>
          </div>
        )}

        {/* ── PRODUCT IMAGE / CUSTOM OFFSET SVG ── */}
        <div style={{
          overflow: 'visible', width: '100%', display: 'flex', justifyContent: 'center',
          padding: `${10 * fontSize}px 0`, minHeight: `${120 * fontSize}px`, alignItems: 'center'
        }}>
          {entry.subCategory === 'Custom Offset' ? (
            <svg viewBox="0 0 420 440" width={isLightbox ? 320 : 160} height={isLightbox ? 340 : 170} xmlns="http://www.w3.org/2000/svg">
              <polygon points="120,80 280,80 310,60 150,60" fill="#e8e8e8" stroke="#333" strokeWidth="1.5" />
              <polygon points="120,80 280,80 280,120 120,120" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
              <polygon points="280,80 310,60 310,100 280,120" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
              <polygon points="120,120 170,120 170,260 120,260" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
              <polygon points="170,120 200,100 200,240 170,260" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
              <polygon points="120,120 170,120 200,100 150,100" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
              <polygon points="120,260 280,260 280,300 120,300" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
              <polygon points="280,260 310,240 310,280 280,300" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
              <polygon points="120,260 280,260 310,240 150,240" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
              <text x="200" y="40" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.W ? '#d32f2f' : '#333'}>W{entry.measurements?.W ? ` = ${entry.measurements.W}` : ''}</text>
              <text x="75" y="195" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.A ? '#d32f2f' : '#333'} transform="rotate(-90,75,195)">A{entry.measurements?.A ? ` = ${entry.measurements.A}` : ''}</text>
              <text x="325" y="82" fontSize="13" fontWeight="bold" fill={entry.measurements?.B1 ? '#d32f2f' : '#1976d2'}>B1{entry.measurements?.B1 ? ` = ${entry.measurements.B1}` : ''}</text>
              <text x="225" y="175" fontSize="13" fontWeight="bold" fill={entry.measurements?.B2 ? '#d32f2f' : '#1976d2'}>B2{entry.measurements?.B2 ? ` = ${entry.measurements.B2}` : ''}</text>
              <text x="200" y="340" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.C ? '#d32f2f' : '#333'}>C{entry.measurements?.C ? ` = ${entry.measurements.C}` : ''}</text>
              <text x="290" y="118" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.D ? '#d32f2f' : '#e65100'}>D{entry.angleDegree?.D ? ` = ${entry.angleDegree.D}°` : ''}</text>
              <text x="100" y="370" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.E ? '#d32f2f' : '#e65100'}>E{entry.angleDegree?.E ? ` = ${entry.angleDegree.E}°` : ''}</text>
            </svg>
          ) : entry.productImage ? (
            <img
              src={entry.productImage}
              alt={entry.productName}
              style={{ maxHeight: `${isLightbox ? 400 : 150}px`, maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Package size={isLightbox ? 128 : 64} style={{ color: '#ccc' }} />
          )}
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <MyDiv className="GeneralTable mt-3" style={{ border: 'none', borderBottom: 'none', overflow: 'hidden' }}>
        <div className="text-center py-5"><Spinner animation="border" /></div>
      </MyDiv>
    );
  }

  if (!entries.length) {
    return (
      <MyDiv className="GeneralTable mt-3" style={{ border: 'none', borderBottom: 'none', overflow: 'hidden' }}>
        <Card className="p-4">
          <p className="text-muted">No Data Found</p>
        </Card>
      </MyDiv>
    );
  }

  return (
    <MyDiv className="GeneralTable mt-3" style={{ border: 'none', borderBottom: 'none', overflow: 'hidden' }}>
      <Row>
        {entries.map((entry, index) => (
          <Col md={6} key={entry._id} className="mb-3" data-awf-index={index}>
            <Card
              className="p-2"
              style={{ display: 'flex', flexDirection: 'column', overflow: 'visible', minHeight: 'auto', cursor: 'pointer' }}
            >
              <div
                style={{ flex: '1', display: 'flex', flexDirection: 'column' }}
                onDoubleClick={() => openLightbox(index)}
              >
                {renderEntryContent(entry)}
              </div>

              {/* ── ACTION BUTTONS BAR ── */}
              {showEditDelete && (
                <div
                  style={{
                    display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '10px',
                    borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff',
                  }}
                >
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => handleEdit(entry)}
                  >
                    <FaPencilAlt /> Edit
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDelete(entry._id)}
                  >
                    <FaTrash /> Delete
                  </Button>
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {/* ═══════════════════════════════════════════════════════════════
          LIGHTBOX — Full-screen view (same pattern as Flashing)
          ═══════════════════════════════════════════════════════════════ */}
      {lightboxOpen && entries.length > 0 && (() => {
        const entry = entries[lightboxIndex];
        if (!entry) return null;

        return (
          <div
            style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
            onClick={closeLightbox}
          >
            {/* Content container */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                width: '100vw',
                height: '100vh',
                overflowY: 'auto',
                overflowX: 'hidden',
                padding: 0,
                position: 'relative'
              }}
            >
              {/* ── HEADER BAR (same as Flashing lightbox) ── */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.97)',
                padding: '12px 15px',
                borderBottom: '1px solid #ddd'
              }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  Material: {entry.material}
                  {entry.thickness != null ? ` ${entry.thickness}` : ''}
                  {entry.color && (
                    <span style={{ marginLeft: '20%', fontSize: '36px', color: '#2c3e50' }}>
                      {entry.color.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>

              {/* ── FLOATING: Len table + Edit/Delete (top-right) ── */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '15px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end'
              }}>
                {/* Len table */}
                <Table size="sm" bordered className="text-center mb-0" style={{ fontSize: '22px', background: '#fff' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '24px' }}>
                        Len
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 'bold', fontSize: '24px' }}>
                        {entry.numberOfPieces || 0}{entry.length ? ` x ${Number(entry.length).toFixed(3)}` : ''}
                      </td>
                    </tr>
                  </tbody>
                </Table>

                {/* Edit and Delete buttons */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '15px', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outline-primary"
                    size="lg"
                    disabled={!showEditDelete}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeLightbox();
                      handleEdit(entry);
                    }}
                  >
                    <FaPencilAlt /> Edit
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="lg"
                    disabled={!showEditDelete}
                    onClick={async (e) => {
                      e.stopPropagation();
                      // Inject z-index style so swal shows above lightbox
                      const styleId = 'swal-lightbox-zindex';
                      if (!document.getElementById(styleId)) {
                        const style = document.createElement('style');
                        style.id = styleId;
                        style.textContent = '.swal2-container { z-index: 10001 !important; }';
                        document.head.appendChild(style);
                      }

                      const result = await swal.fire({
                        title: 'Delete AWF Entry?',
                        text: 'This action cannot be undone.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonColor: '#d33',
                        cancelButtonColor: '#3085d6',
                        confirmButtonText: 'Yes, delete it',
                      });

                      if (!result.isConfirmed) return;

                      try {
                        const token = tokenManager.getToken();
                        await axios.delete(
                          `${API_BASE_URL}/api/awf-entries/${entry._id}`,
                          { headers: { 'x-access-token': token } }
                        );
                        setEntries(prev => prev.filter(e => e._id !== entry._id));
                        if (onEntryDelete) onEntryDelete();
                        // Close lightbox or go to prev entry
                        if (entries.length <= 1) {
                          setLightboxOpen(false);
                        } else if (lightboxIndex >= entries.length - 1) {
                          const newIdx = lightboxIndex - 1;
                          setLightboxIndex(newIdx);
                          lightboxIndexRef.current = newIdx;
                        }
                      } catch (error) {
                        console.error('Failed to delete AWF entry:', error);
                        swal.fire('Error', 'Failed to delete AWF entry.', 'error');
                      }
                    }}
                  >
                    <FaTrash /> Delete
                  </Button>
                </div>
              </div>

              {/* ── MAIN CONTENT: Barcode + Product Image ── */}
              <div style={{ padding: '20px 80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Product name + info */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{entry.productName}</div>
                  <div style={{ fontSize: '20px', fontWeight: '500', color: '#666' }}>
                    {entry.partClass}{entry.subCategory ? ` / ${entry.subCategory}` : ''}
                  </div>
                </div>

                {/* Barcode sticker */}
                {entry.barcode && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '10px 0' }}>
                    <span style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '2px' }}>BARCODE</span>
                    <FaBarcode size={64} />
                    <span style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '2px' }}>STICKERS</span>
                  </div>
                )}

                {/* Product image / Custom Offset SVG */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0', minHeight: '200px', alignItems: 'center' }}>
                  {entry.subCategory === 'Custom Offset' ? (
                    <svg viewBox="0 0 420 440" width="380" height="400" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="120,80 280,80 310,60 150,60" fill="#e8e8e8" stroke="#333" strokeWidth="1.5" />
                      <polygon points="120,80 280,80 280,120 120,120" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                      <polygon points="280,80 310,60 310,100 280,120" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
                      <polygon points="120,120 170,120 170,260 120,260" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                      <polygon points="170,120 200,100 200,240 170,260" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
                      <polygon points="120,120 170,120 200,100 150,100" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                      <polygon points="120,260 280,260 280,300 120,300" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                      <polygon points="280,260 310,240 310,280 280,300" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
                      <polygon points="120,260 280,260 310,240 150,240" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                      <line x1="120" y1="45" x2="280" y2="45" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="120" y1="40" x2="120" y2="50" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="280" y1="40" x2="280" y2="50" stroke="#d32f2f" strokeWidth="1" />
                      <text x="200" y="40" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.W ? '#d32f2f' : '#333'}>W{entry.measurements?.W ? ` = ${entry.measurements.W}` : ''}</text>
                      <line x1="95" y1="80" x2="95" y2="300" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="90" y1="80" x2="100" y2="80" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="90" y1="300" x2="100" y2="300" stroke="#d32f2f" strokeWidth="1" />
                      <text x="75" y="195" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.A ? '#d32f2f' : '#333'} transform="rotate(-90,75,195)">A{entry.measurements?.A ? ` = ${entry.measurements.A}` : ''}</text>
                      <line x1="295" y1="60" x2="295" y2="100" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="290" y1="60" x2="300" y2="60" stroke="#1976d2" strokeWidth="1" />
                      <line x1="290" y1="100" x2="300" y2="100" stroke="#1976d2" strokeWidth="1" />
                      <text x="325" y="82" fontSize="13" fontWeight="bold" fill={entry.measurements?.B1 ? '#d32f2f' : '#1976d2'}>B1{entry.measurements?.B1 ? ` = ${entry.measurements.B1}` : ''}</text>
                      <line x1="215" y1="100" x2="215" y2="240" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="210" y1="100" x2="220" y2="100" stroke="#1976d2" strokeWidth="1" />
                      <line x1="210" y1="240" x2="220" y2="240" stroke="#1976d2" strokeWidth="1" />
                      <text x="235" y="175" fontSize="13" fontWeight="bold" fill={entry.measurements?.B2 ? '#d32f2f' : '#1976d2'}>B2{entry.measurements?.B2 ? ` = ${entry.measurements.B2}` : ''}</text>
                      <line x1="120" y1="320" x2="280" y2="320" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="120" y1="315" x2="120" y2="325" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="280" y1="315" x2="280" y2="325" stroke="#d32f2f" strokeWidth="1" />
                      <text x="200" y="340" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.C ? '#d32f2f' : '#333'}>C{entry.measurements?.C ? ` = ${entry.measurements.C}` : ''}</text>
                      <path d="M 270,120 Q 275,108 285,100" fill="none" stroke="#e65100" strokeWidth="1.5" />
                      <text x="290" y="118" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.D ? '#d32f2f' : '#e65100'}>D{entry.angleDegree?.D ? ` = ${entry.angleDegree.D}°` : ''}</text>
                      <path d="M 130,260 Q 125,272 120,280" fill="none" stroke="#e65100" strokeWidth="1.5" />
                      <text x="100" y="370" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.E ? '#d32f2f' : '#e65100'}>E{entry.angleDegree?.E ? ` = ${entry.angleDegree.E}°` : ''}</text>
                      <text x="210" y="420" textAnchor="middle" fontSize="11" fill="#666" fontStyle="italic">* Standard angle of a downpipe offset is 80°</text>
                    </svg>
                  ) : entry.productImage ? (
                    <img
                      src={entry.productImage}
                      alt={entry.productName}
                      style={{ maxHeight: '400px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <Package size={128} style={{ color: '#ccc' }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </MyDiv>
  );
};

export default AWFDetailsTab;
