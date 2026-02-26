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
          {/* Barcode sticker — right above drawing */}
          {entry.barcode && (() => {
            const bf = isLightbox ? 32 : 18;
            const bbw = isLightbox ? 200 : 110;
            const bbh = isLightbox ? 80 : 50;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', marginBottom: '4px' }}>
                <span style={{ fontSize: `${bf}px`, fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                <svg width={bbw} height={bbh} viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
                  {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137].map(x => (
                    <rect key={x} x={x} y="0" width={x % 12 < 3 ? 2.5 : 1} height="50" fill="#000" />
                  ))}
                </svg>
                <span style={{ fontSize: `${bf}px`, fontWeight: 900, letterSpacing: '4px', lineHeight: 1.4 }}>STICKERS</span>
              </div>
            );
          })()}
          {entry.subCategory === 'Custom Offset' ? (
            <svg viewBox="20 10 380 420" width={isLightbox ? 380 : 250} height={isLightbox ? 420 : 280} xmlns="http://www.w3.org/2000/svg">
              <polygon points="110,70 290,70 312,52 132,52" fill="#ddd" stroke="#555" strokeWidth="1.5" />
              <polygon points="165,125 290,125 312,107 187,107" fill="#bbb" stroke="#555" strokeWidth="1.5" />
              <polygon points="290,70 312,52 312,107 290,125" fill="#aaa" stroke="#555" strokeWidth="1.5" />
              <polygon points="165,125 187,107 187,267 165,285" fill="#aaa" stroke="#555" strokeWidth="1.5" />
              <polygon points="165,285 290,285 312,267 187,267" fill="#bbb" stroke="#555" strokeWidth="1.5" />
              <polygon points="290,285 312,267 312,322 290,340" fill="#aaa" stroke="#555" strokeWidth="1.5" />
              <polygon points="110,340 290,340 312,322 132,322" fill="#999" stroke="#555" strokeWidth="1.5" />
              <polygon points="110,70 290,70 290,125 110,125" fill="#ccc" stroke="#555" strokeWidth="1.5" />
              <polygon points="110,125 165,125 165,285 110,285" fill="#ccc" stroke="#555" strokeWidth="1.5" />
              <polygon points="110,285 290,285 290,340 110,340" fill="#ccc" stroke="#555" strokeWidth="1.5" />
              <text x="200" y="55" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.W ? '#d32f2f' : '#333'}>W{entry.measurements?.W ? ` = ${entry.measurements.W}` : ''}</text>
              <text x="95" y="210" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.A ? '#d32f2f' : '#333'}>A{entry.measurements?.A ? ` = ${entry.measurements.A}` : ''}</text>
              <text x="325" y="82" fontSize="13" fontWeight="bold" fill={entry.measurements?.B1 ? '#d32f2f' : '#1976d2'}>B1{entry.measurements?.B1 ? ` = ${entry.measurements.B1}` : ''}</text>
              <text x="215" y="192" fontSize="13" fontWeight="bold" fill={entry.measurements?.B2 ? '#d32f2f' : '#1976d2'}>B2{entry.measurements?.B2 ? ` = ${entry.measurements.B2}` : ''}</text>
              <text x="200" y="355" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.C ? '#d32f2f' : '#333'}>C{entry.measurements?.C ? ` = ${entry.measurements.C}` : ''}</text>
              <text x="300" y="122" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.D ? '#d32f2f' : '#e65100'}>D{entry.angleDegree?.D ? ` = ${entry.angleDegree.D}°` : ''}</text>
              <text x="95" y="365" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.E ? '#d32f2f' : '#e65100'}>E{entry.angleDegree?.E ? ` = ${entry.angleDegree.E}°` : ''}</text>
            </svg>
          ) : (entry.subCategory === 'Standard Offset' || entry.subCategory === 'Bends (Elbow/Shoes)') ? (
            /* Standard Offset / Bends — square or round SVG */
            entry.productName?.includes('x') ? (
              /* Square offset — thick 3D box pipe L-shape */
              <svg viewBox="0 0 300 400" width={isLightbox ? 300 : 150} height={isLightbox ? 330 : 165} xmlns="http://www.w3.org/2000/svg">
                <polygon points="25,55 200,55 220,39 45,39" fill="#ddd" stroke="#555" strokeWidth="1.5" />
                <polygon points="90,120 200,120 220,104 110,104" fill="#bbb" stroke="#555" strokeWidth="1.5" />
                <polygon points="200,55 220,39 220,104 200,120" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                <polygon points="90,120 110,104 110,334 90,350" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                <polygon points="25,350 90,350 110,334 45,334" fill="#999" stroke="#555" strokeWidth="1.5" />
                <polygon points="25,55 200,55 200,120 25,120" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                <polygon points="25,120 90,120 90,350 25,350" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                {entry.productName?.toLowerCase().includes('federation') && (
                  <text x="150" y="385" textAnchor="middle" fontSize="22" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                )}
              </svg>
            ) : (
              /* Round offset */
              <svg viewBox="0 0 200 220" width={isLightbox ? 280 : 160} height={isLightbox ? 300 : 170} xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="135" cy="18" rx="25" ry="10" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                <rect x="110" y="18" width="50" height="55" fill="#d5d5d5" stroke="none" />
                <line x1="110" y1="18" x2="110" y2="73" stroke="#333" strokeWidth="1.5" />
                <line x1="160" y1="18" x2="160" y2="73" stroke="#333" strokeWidth="1.5" />
                <line x1="110" y1="73" x2="65" y2="115" stroke="#333" strokeWidth="1.5" />
                <line x1="160" y1="73" x2="115" y2="115" stroke="#333" strokeWidth="1.5" />
                <ellipse cx="25" cy="135" rx="10" ry="25" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                <rect x="25" y="110" width="145" height="50" fill="#d5d5d5" stroke="none" />
                <line x1="25" y1="110" x2="170" y2="110" stroke="#333" strokeWidth="1.5" />
                <line x1="25" y1="160" x2="170" y2="160" stroke="#333" strokeWidth="1.5" />
                <ellipse cx="170" cy="135" rx="10" ry="25" fill="#ccc" stroke="#333" strokeWidth="1.5" />
                {entry.productName?.toLowerCase().includes('federation') && (
                  <text x="100" y="200" textAnchor="middle" fontSize="16" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                )}
              </svg>
            )
          ) : entry.productImage ? (
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
                    <svg viewBox="0 0 420 460" width="480" height="520" xmlns="http://www.w3.org/2000/svg">
                      <polygon points="110,70 290,70 312,52 132,52" fill="#ddd" stroke="#555" strokeWidth="1.5" />
                      <polygon points="165,125 290,125 312,107 187,107" fill="#bbb" stroke="#555" strokeWidth="1.5" />
                      <polygon points="290,70 312,52 312,107 290,125" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                      <polygon points="165,125 187,107 187,267 165,285" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                      <polygon points="165,285 290,285 312,267 187,267" fill="#bbb" stroke="#555" strokeWidth="1.5" />
                      <polygon points="290,285 312,267 312,322 290,340" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                      <polygon points="110,340 290,340 312,322 132,322" fill="#999" stroke="#555" strokeWidth="1.5" />
                      <polygon points="110,70 290,70 290,125 110,125" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                      <polygon points="110,125 165,125 165,285 110,285" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                      <polygon points="110,285 290,285 290,340 110,340" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                      <line x1="110" y1="48" x2="290" y2="48" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="110" y1="43" x2="110" y2="53" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="290" y1="43" x2="290" y2="53" stroke="#d32f2f" strokeWidth="1" />
                      <text x="200" y="42" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.W ? '#d32f2f' : '#333'}>W{entry.measurements?.W ? ` = ${entry.measurements.W}` : ''}</text>
                      <line x1="90" y1="70" x2="90" y2="340" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="85" y1="70" x2="95" y2="70" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="85" y1="340" x2="95" y2="340" stroke="#d32f2f" strokeWidth="1" />
                      <text x="42" y="210" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.A ? '#d32f2f' : '#333'}>
                        {entry.offsetType === 'adjustable' && entry.adjustableRange?.from && entry.adjustableRange?.to
                          ? `${entry.adjustableRange.from}-${entry.adjustableRange.to}mm`
                          : `A${entry.measurements?.A ? ` = ${entry.measurements.A}` : ''}`}
                      </text>
                      {entry.offsetType === 'adjustable' && entry.adjustableRange?.from && entry.adjustableRange?.to && (
                        <text x="42" y="227" textAnchor="middle" fontSize="12" fontWeight="bold" fontStyle="italic" fill="#333">Adjustable</text>
                      )}
                      <line x1="322" y1="52" x2="322" y2="107" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="317" y1="52" x2="327" y2="52" stroke="#1976d2" strokeWidth="1" />
                      <line x1="317" y1="107" x2="327" y2="107" stroke="#1976d2" strokeWidth="1" />
                      <text x="335" y="82" fontSize="13" fontWeight="bold" fill={entry.measurements?.B1 ? '#d32f2f' : '#1976d2'}>B1{entry.measurements?.B1 ? ` = ${entry.measurements.B1}` : ''}</text>
                      <line x1="200" y1="107" x2="200" y2="267" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="195" y1="107" x2="205" y2="107" stroke="#1976d2" strokeWidth="1" />
                      <line x1="195" y1="267" x2="205" y2="267" stroke="#1976d2" strokeWidth="1" />
                      <text x="215" y="192" fontSize="13" fontWeight="bold" fill={entry.measurements?.B2 ? '#d32f2f' : '#1976d2'}>B2{entry.measurements?.B2 ? ` = ${entry.measurements.B2}` : ''}</text>
                      <line x1="110" y1="358" x2="290" y2="358" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                      <line x1="110" y1="353" x2="110" y2="363" stroke="#d32f2f" strokeWidth="1" />
                      <line x1="290" y1="353" x2="290" y2="363" stroke="#d32f2f" strokeWidth="1" />
                      <text x="200" y="378" textAnchor="middle" fontSize="14" fontWeight="bold" fill={entry.measurements?.C ? '#d32f2f' : '#333'}>C{entry.measurements?.C ? ` = ${entry.measurements.C}` : ''}</text>
                      <path d="M 275,125 Q 282,113 290,107" fill="none" stroke="#e65100" strokeWidth="1.5" />
                      <text x="300" y="122" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.D ? '#d32f2f' : '#e65100'}>D{entry.angleDegree?.D ? ` = ${entry.angleDegree.D}°` : ''}</text>
                      <path d="M 125,285 Q 118,297 112,305" fill="none" stroke="#e65100" strokeWidth="1.5" />
                      <text x="85" y="400" fontSize="13" fontWeight="bold" fill={entry.angleDegree?.E ? '#d32f2f' : '#e65100'}>E{entry.angleDegree?.E ? ` = ${entry.angleDegree.E}°` : ''}</text>
                    </svg>
                  ) : (entry.subCategory === 'Standard Offset' || entry.subCategory === 'Bends (Elbow/Shoes)') ? (
                    /* Standard Offset / Bends — square or round */
                    entry.productName?.includes('x') ? (
                      /* Square offset — thick 3D box pipe L-shape */
                      <svg viewBox="0 0 300 400" width="480" height="520" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="25,55 200,55 220,39 45,39" fill="#ddd" stroke="#555" strokeWidth="1.5" />
                        <polygon points="90,120 200,120 220,104 110,104" fill="#bbb" stroke="#555" strokeWidth="1.5" />
                        <polygon points="200,55 220,39 220,104 200,120" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                        <polygon points="90,120 110,104 110,334 90,350" fill="#aaa" stroke="#555" strokeWidth="1.5" />
                        <polygon points="25,350 90,350 110,334 45,334" fill="#999" stroke="#555" strokeWidth="1.5" />
                        <polygon points="25,55 200,55 200,120 25,120" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                        <polygon points="25,120 90,120 90,350 25,350" fill="#ccc" stroke="#555" strokeWidth="1.5" />
                        {entry.productName?.toLowerCase().includes('federation') && (
                          <text x="150" y="385" textAnchor="middle" fontSize="22" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                        )}
                      </svg>
                    ) : (
                      <svg viewBox="0 0 200 220" width="440" height="470" xmlns="http://www.w3.org/2000/svg">
                        <ellipse cx="135" cy="18" rx="25" ry="10" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                        <rect x="110" y="18" width="50" height="55" fill="#d5d5d5" stroke="none" />
                        <line x1="110" y1="18" x2="110" y2="73" stroke="#333" strokeWidth="1.5" />
                        <line x1="160" y1="18" x2="160" y2="73" stroke="#333" strokeWidth="1.5" />
                        <line x1="110" y1="73" x2="65" y2="115" stroke="#333" strokeWidth="1.5" />
                        <line x1="160" y1="73" x2="115" y2="115" stroke="#333" strokeWidth="1.5" />
                        <ellipse cx="25" cy="135" rx="10" ry="25" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />
                        <rect x="25" y="110" width="145" height="50" fill="#d5d5d5" stroke="none" />
                        <line x1="25" y1="110" x2="170" y2="110" stroke="#333" strokeWidth="1.5" />
                        <line x1="25" y1="160" x2="170" y2="160" stroke="#333" strokeWidth="1.5" />
                        <ellipse cx="170" cy="135" rx="10" ry="25" fill="#ccc" stroke="#333" strokeWidth="1.5" />
                        {entry.productName?.toLowerCase().includes('federation') && (
                          <text x="100" y="200" textAnchor="middle" fontSize="16" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                        )}
                      </svg>
                    )
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
