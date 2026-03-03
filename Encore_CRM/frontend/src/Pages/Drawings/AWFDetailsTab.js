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
          taperedSmallEnd: entry.taperedSmallEnd,
          taperedBigEnd: entry.taperedBigEnd,
          barcode: entry.barcode,
          use24Downpipe: entry.use24Downpipe,
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
        {/* ── HEADER ROW: thickness (left) | color (center) | qty/len table (right) ── */}
        <div style={{
          display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', gap: '5px', marginBottom: '5px', width: '100%',
        }}>
          {/* Left: Thickness */}
          <div style={{ padding: '4px 8px', fontSize: `${18 * fontSize}px`, fontWeight: 'bold' }}>
            {entry.thickness != null && <span>{entry.thickness}</span>}
          </div>

          {/* Center: Color name */}
          {entry.color && (
            <div style={{ textAlign: 'center', fontSize: `${32 * fontSize}px`, fontWeight: 'bold', color: '#2c3e50' }}>
              {entry.color.toUpperCase()}
            </div>
          )}

          {/* Right: Qty/Len Table */}
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

        {/* ── BARCODE + DRAWING + PRODUCT NAME + NOTE (grouped together) ── */}
        <div style={{
          overflow: 'visible', display: 'flex', justifyContent: 'center', alignItems: 'center',
          flex: 1, padding: 0, margin: 0
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Barcode sticker — with product illustration */}
          {entry.barcode && (() => {
            const bf = isLightbox ? 32 : 18;
            const stickerW = isLightbox ? 180 : 120;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginBottom: '0px' }}>
                <span style={{ fontSize: `${bf}px`, fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                <svg width={stickerW} height={isLightbox ? 60 : 40} viewBox="0 0 180 45" xmlns="http://www.w3.org/2000/svg">
                  {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137,140,143,145,148,153,155,158,160,165,167,170,175,177].map(x => (
                    <rect key={x} x={x} y="0" width={x % 12 < 3 ? 3 : 1.2} height="45" fill="#000" />
                  ))}
                </svg>
                <span style={{ fontSize: `${bf}px`, fontWeight: 900, letterSpacing: '4px', lineHeight: 1.0 }}>STICKERS</span>
              </div>
            );
          })()}
          {entry.subCategory === 'Custom Offset' ? (
            /* Custom Offset — PNG image + dimension overlays */
            <svg viewBox="0 0 380 450" width={isLightbox ? 360 : 400} height={isLightbox ? 420 : 470} xmlns="http://www.w3.org/2000/svg" overflow="visible">
              <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />
              {/* W */}
              <line x1="75" y1="40" x2="240" y2="40" stroke="#1976d2" strokeWidth="1.2" strokeDasharray="5,3" />
              <line x1="75" y1="35" x2="75" y2="45" stroke="#1976d2" strokeWidth="1.2" />
              <line x1="240" y1="35" x2="240" y2="45" stroke="#1976d2" strokeWidth="1.2" />
              <text x="158" y="34" textAnchor="middle" fontSize="13" fontWeight="bold"
                fill={entry.measurements?.W ? '#333' : '#1976d2'}>
                {entry.measurements?.W ? `W=${entry.measurements.W}` : 'W'}
              </text>
              {/* B1 */}
              <line x1="248" y1="48" x2="248" y2="95" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
              <line x1="243" y1="48" x2="253" y2="48" stroke="#d32f2f" strokeWidth="1" />
              <line x1="243" y1="95" x2="253" y2="95" stroke="#d32f2f" strokeWidth="1" />
              <text x="241" y="70" textAnchor="end" fontSize="12" fontWeight="bold"
                fill="#333">
                {entry.measurements?.B1 ? `B1=${entry.measurements.B1}` : 'B1'}
              </text>
              {/* B2 */}
              <line x1="348" y1="62" x2="348" y2="125" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
              <line x1="343" y1="62" x2="353" y2="62" stroke="#d32f2f" strokeWidth="1" />
              <line x1="343" y1="125" x2="353" y2="125" stroke="#d32f2f" strokeWidth="1" />
              <text x="358" y="98" textAnchor="start" fontSize="12" fontWeight="bold"
                fill="#333">
                {entry.measurements?.B2 ? `B2=${entry.measurements.B2}` : 'B2'}
              </text>
              {/* A — nearly horizontal diagonal */}
              <line x1="85" y1="182" x2="220" y2="93" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
              <line x1="83" y1="177" x2="87" y2="187" stroke="#d32f2f" strokeWidth="1" />
              <line x1="218" y1="88" x2="222" y2="98" stroke="#d32f2f" strokeWidth="1" />
              <text x="110" y="130" textAnchor="middle" fontSize="13" fontWeight="bold"
                fill="#333">
                {entry.offsetType === 'adjustable' && entry.adjustableRange?.from && entry.adjustableRange?.to
                  ? `A=${entry.adjustableRange.from}-${entry.adjustableRange.to}`
                  : (entry.measurements?.A ? `A=${entry.measurements.A}` : 'A')}
              </text>
              {entry.offsetType === 'adjustable' && (
                <text x="110" y="146" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#333">
                  Adjustable
                </text>
              )}
              {/* D — arrow pointing to upper bend */}
              <defs>
                <marker id="arrowDCard" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                </marker>
                <marker id="arrowECard" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                </marker>
              </defs>
              <line x1="365" y1="150" x2="325" y2="142" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowDCard)" />
              <text x="369" y="155" textAnchor="start" fontSize="12" fontWeight="bold"
                fill={entry.angleDegree?.D ? '#333' : '#e65100'}>
                {entry.angleDegree?.D ? `D=${entry.angleDegree.D}°` : 'D'}
              </text>
              {/* E — arrow pointing to lower bend */}
              <line x1="215" y1="240" x2="185" y2="227" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowECard)" />
              <text x="219" y="255" textAnchor="start" fontSize="12" fontWeight="bold"
                fill={entry.angleDegree?.E ? '#333' : '#e65100'}>
                {entry.angleDegree?.E ? `E=${entry.angleDegree.E}°` : 'E'}
              </text>
              {/* C */}
              <line x1="75" y1="195" x2="75" y2="380" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
              <line x1="70" y1="195" x2="80" y2="195" stroke="#d32f2f" strokeWidth="1" />
              <line x1="70" y1="380" x2="80" y2="380" stroke="#d32f2f" strokeWidth="1" />
              <text x="67" y="293" textAnchor="middle" fontSize="13" fontWeight="bold"
                fill="#333"
                transform="rotate(-90, 67, 293)">
                {entry.measurements?.C ? `C=${entry.measurements.C}` : 'C'}
              </text>
              {/* Seam Side indicator */}
              {entry.seamSide === 'top' && (
                <line x1="126" y1="125" x2="126" y2="373" stroke="#d32f2f" strokeWidth="3" strokeDasharray="8,5" />
              )}
              {entry.seamSide === 'right' && (
                <line x1="168" y1="136" x2="168" y2="384" stroke="#1976d2" strokeWidth="3" strokeDasharray="8,5" />
              )}
              {entry.seamSide === 'left' && (
                <line x1="103" y1="136" x2="103" y2="384" stroke="#f57c00" strokeWidth="3" strokeDasharray="8,5" />
              )}
              {entry.seamSide === 'bottom' && (
                <line x1="145" y1="148" x2="145" y2="395" stroke="#388e3c" strokeWidth="3" strokeDasharray="8,5" />
              )}
            </svg>
          ) : (entry.subCategory === 'Standard Offset' || entry.subCategory === 'Bends (Elbow/Shoes)') ? (
            /* Standard Offset / Bends — PNG image + C dimension overlay */
            <svg viewBox="0 0 380 450" width={isLightbox ? 360 : 210} height={isLightbox ? 420 : 245} xmlns="http://www.w3.org/2000/svg">
              <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />
              {entry.productName?.toLowerCase().includes('federation') && (
                <text x="215" y="430" textAnchor="middle" fontSize={isLightbox ? 16 : 11} fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
              )}
              <line x1="100" y1="230" x2="100" y2="395" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
              <line x1="95" y1="230" x2="105" y2="230" stroke="#d32f2f" strokeWidth="1" />
              <line x1="95" y1="395" x2="105" y2="395" stroke="#d32f2f" strokeWidth="1" />
              <text x="92" y="318" textAnchor="middle" fontSize={isLightbox ? 13 : 10} fontWeight="bold"
                fill={entry.use24Downpipe ? '#d32f2f' : '#333'}
                transform="rotate(-90, 92, 318)">
                {entry.offsetCValue || 880}mm  C
              </text>
            </svg>
          ) : entry.productImage ? (
            /* All other types — static product image */
            <img
              src={entry.productImage}
              alt={entry.productName}
              style={{ maxHeight: `${isLightbox ? 400 : 150}px`, maxWidth: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Package size={isLightbox ? 128 : 64} style={{ color: '#ccc' }} />
          )}

          {/* Product name (below drawing, centered) */}
          <div style={{ fontSize: `${15 * fontSize}px`, fontWeight: '500', color: '#666', textAlign: 'center', marginTop: '10px' }}>
            {entry.productName}
          </div>

          {/* Note (below product name, right-aligned within drawing width) */}
          {entry.note && (
            <div style={{ fontSize: `${16 * fontSize}px`, color: '#333', fontWeight: 'bold', textAlign: 'right', alignSelf: 'flex-end' }}>
              Note: {entry.note}
            </div>
          )}
          </div>
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
          <Col md={4} key={entry._id} className="mb-3" data-awf-index={index}>
            <Card
              className="p-2"
              style={{ display: 'flex', flexDirection: 'column', overflow: 'visible', minHeight: '550px', cursor: 'pointer' }}
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
              {/* ── HEADER BAR: thickness (left) | color (center) | qty/len (right) ── */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.97)',
                padding: '12px 15px',
                borderBottom: '1px solid #ddd',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                {/* Left: Thickness */}
                <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                  {entry.thickness != null && entry.thickness}
                </div>
                {/* Center: Color */}
                {entry.color && (
                  <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#2c3e50' }}>
                    {entry.color.toUpperCase()}
                  </div>
                )}
                {/* Right: Qty/Len — placeholder to balance, actual table is floating */}
                <div style={{ minWidth: '80px' }} />
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
                        Qty/Len
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

              {/* ── MAIN CONTENT: Barcode + Drawing + Product Name + Note ── */}
              <div style={{ padding: '40px 80px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Barcode sticker */}
                {entry.barcode && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', padding: '10px 0' }}>
                    <span style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                    <svg width={180} height={80} viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
                      {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137].map(x => (
                        <rect key={x} x={x} y="0" width={x % 12 < 3 ? 2.5 : 1} height="50" fill="#000" />
                      ))}
                    </svg>
                    <span style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.4 }}>STICKERS</span>
                  </div>
                )}

                {/* Product image / Offset SVGs + Product Name + Note */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0' }}>
                <div>
                  {entry.subCategory === 'Custom Offset' ? (
                    /* Custom Offset — PNG image + dimension overlays (lightbox) */
                    <svg viewBox="0 0 380 450" width="480" height="560" xmlns="http://www.w3.org/2000/svg" overflow="visible">
                      <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />
                      {/* W */}
                      <line x1="75" y1="40" x2="240" y2="40" stroke="#1976d2" strokeWidth="1.2" strokeDasharray="5,3" />
                      <line x1="75" y1="35" x2="75" y2="45" stroke="#1976d2" strokeWidth="1.2" />
                      <line x1="240" y1="35" x2="240" y2="45" stroke="#1976d2" strokeWidth="1.2" />
                      <text x="158" y="34" textAnchor="middle" fontSize="13" fontWeight="bold"
                        fill={entry.measurements?.W ? '#333' : '#1976d2'}>
                        {entry.measurements?.W ? `W=${entry.measurements.W}` : 'W'}
                      </text>
                      {/* B1 */}
                      <line x1="248" y1="48" x2="248" y2="95" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
                      <line x1="243" y1="48" x2="253" y2="48" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="243" y1="95" x2="253" y2="95" stroke="#d32f2f" strokeWidth="1" />
                      <text x="241" y="70" textAnchor="end" fontSize="12" fontWeight="bold"
                        fill="#333">
                        {entry.measurements?.B1 ? `B1=${entry.measurements.B1}` : 'B1'}
                      </text>
                      {/* B2 */}
                      <line x1="348" y1="62" x2="348" y2="125" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
                      <line x1="343" y1="62" x2="353" y2="62" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="343" y1="125" x2="353" y2="125" stroke="#d32f2f" strokeWidth="1" />
                      <text x="358" y="98" textAnchor="start" fontSize="12" fontWeight="bold"
                        fill="#333">
                        {entry.measurements?.B2 ? `B2=${entry.measurements.B2}` : 'B2'}
                      </text>
                      {/* A — nearly horizontal diagonal */}
                      <line x1="85" y1="182" x2="220" y2="93" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="83" y1="177" x2="87" y2="187" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="218" y1="88" x2="222" y2="98" stroke="#d32f2f" strokeWidth="1" />
                      <text x="110" y="130" textAnchor="middle" fontSize="13" fontWeight="bold"
                        fill="#333">
                        {entry.offsetType === 'adjustable' && entry.adjustableRange?.from && entry.adjustableRange?.to
                          ? `A=${entry.adjustableRange.from}-${entry.adjustableRange.to}`
                          : (entry.measurements?.A ? `A=${entry.measurements.A}` : 'A')}
                      </text>
                      {entry.offsetType === 'adjustable' && (
                        <text x="110" y="146" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#333">
                          Adjustable
                        </text>
                      )}
                      {/* D — arrow pointing to upper bend */}
                      <defs>
                        <marker id="arrowDLightbox" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                        </marker>
                        <marker id="arrowELightbox" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                          <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                        </marker>
                      </defs>
                      <line x1="365" y1="150" x2="325" y2="142" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowDLightbox)" />
                      <text x="369" y="155" textAnchor="start" fontSize="12" fontWeight="bold"
                        fill={entry.angleDegree?.D ? '#333' : '#e65100'}>
                        {entry.angleDegree?.D ? `D=${entry.angleDegree.D}°` : 'D'}
                      </text>
                      {/* E — arrow pointing to lower bend */}
                      <line x1="215" y1="240" x2="185" y2="227" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowELightbox)" />
                      <text x="219" y="255" textAnchor="start" fontSize="12" fontWeight="bold"
                        fill={entry.angleDegree?.E ? '#333' : '#e65100'}>
                        {entry.angleDegree?.E ? `E=${entry.angleDegree.E}°` : 'E'}
                      </text>
                      {/* C */}
                      <line x1="75" y1="195" x2="75" y2="380" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="70" y1="195" x2="80" y2="195" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="70" y1="380" x2="80" y2="380" stroke="#d32f2f" strokeWidth="1" />
                      <text x="67" y="293" textAnchor="middle" fontSize="13" fontWeight="bold"
                        fill="#333"
                        transform="rotate(-90, 67, 293)">
                        {entry.measurements?.C ? `C=${entry.measurements.C}` : 'C'}
                      </text>
                      {/* Seam Side indicator */}
                      {entry.seamSide === 'top' && (
                        <line x1="126" y1="125" x2="126" y2="373" stroke="#d32f2f" strokeWidth="3" strokeDasharray="8,5" />
                      )}
                      {entry.seamSide === 'right' && (
                        <line x1="168" y1="136" x2="168" y2="384" stroke="#1976d2" strokeWidth="3" strokeDasharray="8,5" />
                      )}
                      {entry.seamSide === 'left' && (
                        <line x1="103" y1="136" x2="103" y2="384" stroke="#f57c00" strokeWidth="3" strokeDasharray="8,5" />
                      )}
                      {entry.seamSide === 'bottom' && (
                        <line x1="145" y1="148" x2="145" y2="395" stroke="#388e3c" strokeWidth="3" strokeDasharray="8,5" />
                      )}
                    </svg>
                  ) : (entry.subCategory === 'Standard Offset' || entry.subCategory === 'Bends (Elbow/Shoes)') ? (
                    /* Standard Offset / Bends — PNG image + C dimension overlay */
                    <svg viewBox="0 0 380 450" width="480" height="560" xmlns="http://www.w3.org/2000/svg">
                      <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />
                      {entry.productName?.toLowerCase().includes('federation') && (
                        <text x="215" y="430" textAnchor="middle" fontSize="16" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                      )}
                      <line x1="65" y1="195" x2="65" y2="410" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="60" y1="195" x2="70" y2="195" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="60" y1="410" x2="70" y2="410" stroke="#d32f2f" strokeWidth="1" />
                      <text x="58" y="308" textAnchor="middle" fontSize="13" fontWeight="bold"
                        fill={entry.use24Downpipe ? '#d32f2f' : '#333'}
                        transform="rotate(-90, 58, 308)">
                        {entry.offsetCValue || 880}mm  C
                      </text>
                    </svg>
                  ) : entry.productImage ? (
                    <img
                      src={entry.productImage}
                      alt={entry.productName}
                      style={{ maxHeight: '500px', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <Package size={180} style={{ color: '#ccc' }} />
                  )}
                </div>

                {/* Product name (below drawing, centered) */}
                <div style={{ fontSize: '28px', fontWeight: '500', color: '#666', textAlign: 'center' }}>
                  {entry.productName}
                </div>

                {/* Note (below product name, right-aligned within drawing width) */}
                {entry.note && (
                  <div style={{ fontSize: '28px', color: '#333', fontWeight: 'bold', alignSelf: 'flex-end' }}>
                    Note: {entry.note}
                  </div>
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
