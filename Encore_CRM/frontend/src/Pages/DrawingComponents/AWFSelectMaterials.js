/**
 * AWFSelectMaterials — Material selection page for AWF products
 *
 * This is the AWF equivalent of SelectMaterialsSimplified (used by Flashing).
 * Navigated to from TemplateLibrary when user double-clicks or clicks "Use It"
 * on an AWF product card.
 *
 * Flow: TemplateLibrary (AWF product) → AWFSelectMaterials → Back to Order
 *
 * Form types:
 *   standard      — Standard D/P, Standard Offset (thickness 0.45, barcode)
 *   manual_dp     — Manual D/P (dimensions, length, tapered, NO barcode)
 *   clips         — Clips & Pops (thickness 0.60, NO barcode)
 *   bends         — Bends / Elbow / Shoes (dimensions, barcode)
 *   custom_offset — Custom Offset (DEFERRED — complex form)
 *
 * Created: 20-Feb-2026
 * Rewritten: 23-Feb-2026
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_BASE_URL, tokenManager } from '../../config/api.config';
import { DesignHeader } from './Header';
import { FaArrowLeft, FaPlus, FaCheck, FaCopy, FaBarcode } from 'react-icons/fa';
import { Package } from 'lucide-react';
import { Card, Button, TextField, Select, FormControl, InputLabel } from '@mui/material';
import '../../styles/AWFSelectMaterials.scss';

const AWFSelectMaterials = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION STATE (from TemplateLibrary)
  // ═══════════════════════════════════════════════════════════════
  const {
    orderNumber = '',
    customerName = '',
    customerId = '',
    customerPoNumber = '',
    orderId = '',
    name: productName = '',
    productId = '',
    productImage = null,
    partGroup = 'AWF',
    partClass = '',
    subCategory = '',
    previousPage = 'designers',
    editEntryId = null,
    editData = null,
  } = location.state || {};

  const isEditMode = !!editEntryId;

  // ═══════════════════════════════════════════════════════════════
  // FORM TYPE LOGIC
  // ═══════════════════════════════════════════════════════════════
  const formType = useMemo(() => {
    if (subCategory === 'Manual D/P') return 'manual_dp';
    if (subCategory === 'Custom Offset') return 'custom_offset';
    if (partClass === 'Clips & Pops') return 'clips';
    if (subCategory === 'Bends (Elbow/Shoes)') return 'bends';
    return 'standard'; // Standard D/P, Standard Offset
  }, [subCategory, partClass]);

  const defaultThickness = formType === 'clips' ? 0.60 : 0.45;
  const isCustomProduct = productName?.includes('---');
  const isSquareProduct = productName?.toLowerCase().includes('x');
  const showDimensions = isCustomProduct;
  const showTapered = formType === 'manual_dp';
  const showBarcode = true;

  // Standard D/P: extract length from product name (e.g., "100x50mm 1.8mtr" → "1.800")
  const standardDPLength = useMemo(() => {
    if (formType !== 'standard' || partClass !== 'Downpipe') return null;
    if (productName?.includes('1.8')) return '1.8';
    if (productName?.includes('2.4')) return '2.4';
    return null;
  }, [formType, partClass, productName]);

  // ═══════════════════════════════════════════════════════════════
  // ORDER DETAILS (for header)
  // ═══════════════════════════════════════════════════════════════
  const [orderDetails, setOrderDetails] = useState(null);

  // ═══════════════════════════════════════════════════════════════
  // MATERIAL / COLOR DROPDOWNS
  // ═══════════════════════════════════════════════════════════════
  const [availableMaterials, setAvailableMaterials] = useState([]);
  const [availableColors, setAvailableColors] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [loadingColors, setLoadingColors] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // FORM STATE
  // ═══════════════════════════════════════════════════════════════
  const [material, setMaterial] = useState(editData?.material || '');
  const [materialId, setMaterialId] = useState('');
  const [color, setColor] = useState(editData?.color || '');
  const [thickness, setThickness] = useState(editData?.thickness || defaultThickness);
  const [numberOfPieces, setNumberOfPieces] = useState(editData?.numberOfPieces != null ? String(editData.numberOfPieces) : '');
  const [length, setLength] = useState(() => {
    if (!editData?.length) return '';
    const val = String(editData.length);
    // If saved length isn't 1.800 or 2.400, it was custom
    if (val !== '1.800' && val !== '2.400' && val !== '1' && val !== '') return 'custom';
    return val;
  });
  const [customLength, setCustomLength] = useState(() => {
    if (!editData?.length) return '';
    const val = String(editData.length);
    if (val !== '1.800' && val !== '2.400' && val !== '1' && val !== '') return val;
    return '';
  });
  const [dimWidth, setDimWidth] = useState(editData?.dimWidth != null ? String(editData.dimWidth) : '');
  const [dimHeight, setDimHeight] = useState(editData?.dimHeight != null ? String(editData.dimHeight) : '');
  const [tapered, setTapered] = useState(editData?.tapered || false);
  const [taperedSmallEnd, setTaperedSmallEnd] = useState(editData?.taperedSmallEnd != null ? String(editData.taperedSmallEnd) : '');
  const [taperedBigEnd, setTaperedBigEnd] = useState(editData?.taperedBigEnd != null ? String(editData.taperedBigEnd) : '');
  const [barcode, setBarcode] = useState(editData?.barcode || false);
  const [use24Downpipe, setUse24Downpipe] = useState(editData?.use24Downpipe || false);
  const [note, setNote] = useState(editData?.note || '');
  const [unitPrice, setUnitPrice] = useState(editData?.unitPrice != null ? String(editData.unitPrice) : '');
  const [saving, setSaving] = useState(false);

  // Custom Offset state
  const [size, setSize] = useState(editData?.size || '');
  const [measW, setMeasW] = useState(editData?.measurements?.W != null ? String(editData.measurements.W) : '');
  const [measA, setMeasA] = useState(editData?.measurements?.A != null ? String(editData.measurements.A) : '');
  const [measB1, setMeasB1] = useState(editData?.measurements?.B1 != null ? String(editData.measurements.B1) : '');
  const [measB2, setMeasB2] = useState(editData?.measurements?.B2 != null ? String(editData.measurements.B2) : '');
  const [measC, setMeasC] = useState(editData?.measurements?.C != null ? String(editData.measurements.C) : '');
  const [angleD, setAngleD] = useState(editData?.angleDegree?.D != null ? String(editData.angleDegree.D) : '');
  const [angleE, setAngleE] = useState(editData?.angleDegree?.E != null ? String(editData.angleDegree.E) : '');
  const [offsetType, setOffsetType] = useState(editData?.offsetType || '');
  const [adjustableFrom, setAdjustableFrom] = useState(editData?.adjustableRange?.from != null ? String(editData.adjustableRange.from) : '');
  const [adjustableTo, setAdjustableTo] = useState(editData?.adjustableRange?.to != null ? String(editData.adjustableRange.to) : '');
  const [seamSide, setSeamSide] = useState(editData?.seamSide || '');
  const [highlightedLabel, setHighlightedLabel] = useState(null);

  // Standard Offset: C dimension varies by product
  const offsetCValue = useMemo(() => {
    if (partClass !== 'Offsets') return null;
    const name = productName?.toLowerCase() || '';
    if (name.includes('100x75') || name.includes('federation 100x75')) return use24Downpipe ? 1970 : 1370;
    if (name.includes('90')) return use24Downpipe ? 1400 : 800;
    return use24Downpipe ? 1480 : 880;
  }, [partClass, productName, use24Downpipe]);

  // Highlight a label briefly when its value changes
  const highlightField = (field) => {
    setHighlightedLabel(field);
    setTimeout(() => setHighlightedLabel(null), 1500);
  };

  // ═══════════════════════════════════════════════════════════════
  // LOAD DATA ON MOUNT
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    loadOrderDetails();
    loadMaterials();
    // Auto-set length to 1 for Clips & Pops
    if (formType === 'clips' && !isEditMode) {
      setLength('1');
    }
    // Auto-set length to 1.8 for Offsets
    if (partClass === 'Offsets' && !isEditMode) {
      setLength('1.8');
    }
    // Auto-set length from product name for Standard D/P
    if (standardDPLength && !isEditMode) {
      setLength(standardDPLength);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOrderDetails = async () => {
    try {
      const orderNumberToUse = orderNumber || localStorage.getItem('orderNumber');
      if (!orderNumberToUse) return;

      const token = tokenManager.getToken();
      const response = await axios.get(
        `${API_BASE_URL}/fetch-order-details-by-ordernumber/${orderNumberToUse}`,
        { headers: { 'x-access-token': token, 'Accept': 'application/json' } }
      );
      if (response.data) {
        setOrderDetails(response.data);
      }
    } catch (error) {
      console.error('Failed to load order details:', error);
    }
  };

  const loadMaterials = async () => {
    try {
      setLoadingMaterials(true);
      const token = tokenManager.getToken();
      const response = await axios.get(`${API_BASE_URL}/fetch-core-product-data`, {
        headers: { 'x-access-token': token, 'Accept': 'application/json' }
      });

      if (response.data?.fetchedItems && Array.isArray(response.data.fetchedItems)) {
        const materialsData = response.data.fetchedItems.map(item => ({
          name: item.core_Product_Name,
          id: item._id,
          value: item.core_Product_Name || item._id
        }));
        setAvailableMaterials(materialsData);
      }
    } catch (error) {
      console.error('Failed to load materials:', error);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const loadColors = useCallback(async (materialValue) => {
    try {
      const selectedMaterial = availableMaterials.find(m => m.value === materialValue);
      if (!selectedMaterial) return;

      setLoadingColors(true);
      setAvailableColors([]);
      const token = tokenManager.getToken();
      const response = await axios.get(
        `${API_BASE_URL}/fetch-product-color-data/${selectedMaterial.id}`,
        { headers: { 'x-access-token': token, 'Accept': 'application/json' } }
      );

      if (response.data && Array.isArray(response.data)) {
        const colorsData = response.data.map(item => ({
          name: item.product_Color || '',
          value: item.product_Color || '',
          code: item.product_Color_Code || ''
        }));
        setAvailableColors(colorsData);

        // Auto-select if only one color
        if (colorsData.length === 1) {
          setColor(colorsData[0].value);
        }
      }
    } catch (error) {
      console.error('Failed to load colors:', error);
      setAvailableColors([]);
    } finally {
      setLoadingColors(false);
    }
  }, [availableMaterials]);

  // In edit mode, load colors once materials are available
  useEffect(() => {
    if (isEditMode && editData?.material && availableMaterials.length > 0) {
      const mat = availableMaterials.find(m => m.value === editData.material);
      if (mat) {
        setMaterialId(mat.id);
        loadColors(editData.material);
      }
    }
  }, [isEditMode, editData, availableMaterials, loadColors]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════
  const handleMaterialChange = (e) => {
    const val = e.target.value;
    setMaterial(val);
    setColor('');
    setAvailableColors([]);

    const selectedMat = availableMaterials.find(m => m.value === val);
    if (selectedMat) {
      setMaterialId(selectedMat.id);
      loadColors(val);
    }
  };

  const handleColorChange = (e) => {
    setColor(e.target.value);
  };

  const handleBack = () => {
    if (orderId) {
      navigate(
        `/${orderNumber?.startsWith('IN') ? 'orders' : 'quotes'}/${orderId}/drawings/templates`,
        {
          state: {
            orderNumber,
            customerName,
            customerId,
            orderId,
            partGroup: 'AWF',
            partClass,
            previousPage,
          }
        }
      );
    } else {
      navigate(-1);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // FINISH HANDLERS — save to awf_order_entries via API
  // ═══════════════════════════════════════════════════════════════
  const saveEntry = async () => {
    const token = tokenManager.getToken();
    const payload = {
      orderNumber, customerId, customerName,
      productId, productName, partClass, subCategory,
      material, color, thickness,
      numberOfPieces: Number(numberOfPieces),
      length: length === 'custom' ? (customLength ? Number(customLength) : null) : (length ? Number(length) : null),
      dimensions: { width: dimWidth ? Number(dimWidth) : null, height: dimHeight ? Number(dimHeight) : null },
      tapered,
      taperedSmallEnd: tapered && taperedSmallEnd ? Number(taperedSmallEnd) : null,
      taperedBigEnd: tapered && taperedBigEnd ? Number(taperedBigEnd) : null,
      barcode, use24Downpipe, note,
      offsetCValue: offsetCValue || null,
      unitPrice: unitPrice ? Number(unitPrice) : 0,
      productImage,
      // Custom Offset fields
      ...(formType === 'custom_offset' && {
        size: size || null,
        measurements: {
          W: measW ? Number(measW) : null,
          A: measA ? Number(measA) : null,
          B1: measB1 ? Number(measB1) : null,
          B2: measB2 ? Number(measB2) : null,
          C: measC ? Number(measC) : null,
        },
        angleDegree: {
          D: angleD ? Number(angleD) : null,
          E: angleE ? Number(angleE) : null,
        },
        offsetType: offsetType || null,
        adjustableRange: offsetType === 'adjustable' ? {
          from: adjustableFrom ? Number(adjustableFrom) : null,
          to: adjustableTo ? Number(adjustableTo) : null,
        } : null,
        seamSide: seamSide || null,
      }),
    };
    const headers = { 'x-access-token': token };

    if (isEditMode) {
      const response = await axios.put(
        `${API_BASE_URL}/api/awf-entries/${editEntryId}`,
        payload,
        { headers }
      );
      return response.data;
    }

    const response = await axios.post(
      `${API_BASE_URL}/api/awf-entries`,
      payload,
      { headers }
    );
    return response.data;
  };

  const handleFinish = async () => {
    try {
      setSaving(true);
      await saveEntry();
      toast.success(isEditMode ? 'AWF entry updated' : 'AWF entry saved');
      const page = previousPage || (orderNumber?.startsWith('IN') ? 'orders' : 'quotes');
      navigate(`/${page}/${orderId}`, {
        state: { orderNumber, customerName, customerId, orderId, activeTab: 'AWF' }
      });
    } catch (error) {
      toast.error(isEditMode ? 'Failed to update AWF entry' : 'Failed to save AWF entry');
    } finally {
      setSaving(false);
    }
  };

  const handleFinishAndAddNew = async () => {
    try {
      setSaving(true);
      await saveEntry();
      toast.success('AWF entry saved');
      navigate(
        `/${orderNumber?.startsWith('IN') ? 'orders' : 'quotes'}/${orderId}/drawings/templates`,
        {
          state: {
            orderNumber, customerName, customerId, orderId,
            partGroup: 'AWF', partClass, previousPage
          }
        }
      );
    } catch (error) {
      toast.error('Failed to save AWF entry');
    } finally {
      setSaving(false);
    }
  };

  const handleFinishAndCopy = async () => {
    try {
      setSaving(true);
      await saveEntry();
      toast.success('AWF entry saved — form copied');
      setNumberOfPieces('');
      setLength('');
      setCustomLength('');
      setDimWidth('');
      setDimHeight('');
      setTapered(false);
      setTaperedSmallEnd('');
      setTaperedBigEnd('');
      setBarcode(false);
      setUse24Downpipe(false);
      setNote('');
      setUnitPrice('');
      // Reset custom offset fields
      if (formType === 'custom_offset') {
        setSize('');
        setMeasW(''); setMeasA(''); setMeasB1(''); setMeasB2(''); setMeasC('');
        setAngleD(''); setAngleE('');
        setOffsetType(''); setAdjustableFrom(''); setAdjustableTo('');
        setSeamSide('');
      }
    } catch (error) {
      toast.error('Failed to save AWF entry');
    } finally {
      setSaving(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="awf-select-materials">
      {/* Header */}
      <DesignHeader
        customerName={customerName}
        orderNumber={orderNumber}
        orderDetails={orderDetails}
      />

      {/* Two-column layout */}
      <div className="awf-split-layout">
        {/* LEFT — Product display */}
        <div className="awf-left-panel">
          <Card className="awf-canvas-card">
            <div className="awf-canvas-container">
              <h4 className="awf-product-title">{subCategory || (partClass === 'Clips & Pops' ? 'Clips' : partClass)}</h4>

              {partClass === 'Offsets' && formType !== 'custom_offset' ? (
                /* ═══ STANDARD OFFSET / BENDS — PNG image + C dimension overlay ═══ */
                <div className="awf-offset-drawing">
                  {barcode && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', padding: '4px 0' }}>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                      <svg width={140} height={50} viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
                        {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137].map(x => (
                          <rect key={x} x={x} y="0" width={x % 12 < 3 ? 2.5 : 1} height="50" fill="#000" />
                        ))}
                      </svg>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.4 }}>STICKERS</span>
                    </div>
                  )}
                  <svg viewBox="0 0 380 450" width="380" height="450" xmlns="http://www.w3.org/2000/svg">
                    <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />
                    {productName?.toLowerCase().includes('federation') && (
                      <text x="215" y="430" textAnchor="middle" fontSize="16" fontWeight="bold" fontStyle="italic" fill="#333">FEDERATION</text>
                    )}
                    {/* C dimension — vertical dashed line along bottom pipe only */}
                    <line x1="100" y1="230" x2="100" y2="395" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="95" y1="230" x2="105" y2="230" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="95" y1="395" x2="105" y2="395" stroke="#d32f2f" strokeWidth="1" />
                    <text x="92" y="318" textAnchor="middle" fontSize="13" fontWeight="bold"
                      fill={use24Downpipe ? '#d32f2f' : '#333'}
                      transform="rotate(-90, 92, 318)">
                      {offsetCValue}mm  C
                    </text>
                  </svg>
                  {note && (
                    <div style={{ fontSize: '18px', color: '#333', fontWeight: 'bold', textAlign: 'right', width: '100%', marginTop: '4px' }}>
                      Note: {note}
                    </div>
                  )}
                </div>
              ) : formType === 'custom_offset' ? (
                /* ═══ CUSTOM OFFSET — Dynamic SVG with user-entered dimensions ═══ */
                <div className="awf-offset-drawing">
                  {barcode && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', padding: '4px 0' }}>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                      <svg width={140} height={50} viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
                        {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137].map(x => (
                          <rect key={x} x={x} y="0" width={x % 12 < 3 ? 2.5 : 1} height="50" fill="#000" />
                        ))}
                      </svg>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.4 }}>STICKERS</span>
                    </div>
                  )}
                  <svg viewBox="0 0 380 450" width="380" height="450" xmlns="http://www.w3.org/2000/svg" overflow="visible">
                    {/* Same 3D offset image as Standard Offset */}
                    <image href="/awf-products/standard-offset-square.jpeg" x="80" y="30" width="270" height="380" preserveAspectRatio="xMidYMid meet" />

                    {/* W — horizontal dashed line across full width of upper pipe */}
                    <line x1="75" y1="40" x2="240" y2="40" stroke="#1976d2" strokeWidth="1.2" strokeDasharray="5,3" />
                    <line x1="75" y1="35" x2="75" y2="45" stroke="#1976d2" strokeWidth="1.2" />
                    <line x1="240" y1="35" x2="240" y2="45" stroke="#1976d2" strokeWidth="1.2" />
                    <text x="158" y="34" textAnchor="middle" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'W' ? '#d32f2f' : '#1976d2'}>
                      {measW ? `W=${measW}` : 'W'}
                    </text>

                    {/* B1 — vertical line on left side of top face of upper pipe */}
                    <line x1="248" y1="48" x2="248" y2="95" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
                    <line x1="243" y1="48" x2="253" y2="48" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="243" y1="95" x2="253" y2="95" stroke="#d32f2f" strokeWidth="1" />
                    <text x="241" y="70" textAnchor="end" fontSize="12" fontWeight="bold"
                      fill={highlightedLabel === 'B1' ? '#d32f2f' : '#333'}>
                      {measB1 ? `B1=${measB1}` : 'B1'}
                    </text>

                    {/* B2 — vertical line on right side face of upper pipe */}
                    <line x1="348" y1="62" x2="348" y2="125" stroke="#d32f2f" strokeWidth="1" strokeDasharray="3,2" />
                    <line x1="343" y1="62" x2="353" y2="62" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="343" y1="125" x2="353" y2="125" stroke="#d32f2f" strokeWidth="1" />
                    <text x="358" y="98" textAnchor="start" fontSize="12" fontWeight="bold"
                      fill={highlightedLabel === 'B2' ? '#d32f2f' : '#333'}>
                      {measB2 ? `B2=${measB2}` : 'B2'}
                    </text>

                    {/* A — nearly horizontal dashed line measuring diagonal connector */}
                    <line x1="85" y1="182" x2="220" y2="93" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="83" y1="177" x2="87" y2="187" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="218" y1="88" x2="222" y2="98" stroke="#d32f2f" strokeWidth="1" />
                    <text x="110" y="130" textAnchor="middle" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'A' ? '#d32f2f' : '#333'}>
                      {offsetType === 'adjustable' && adjustableFrom && adjustableTo
                        ? `A=${adjustableFrom}-${adjustableTo}`
                        : (measA ? `A=${measA}` : 'A')}
                    </text>
                    {offsetType === 'adjustable' && (
                      <text x="110" y="146" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#333">
                        Adjustable
                      </text>
                    )}

                    {/* D — arrow pointing to upper bend */}
                    <defs>
                      <marker id="arrowD" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                      </marker>
                      <marker id="arrowE" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <path d="M 0,0 L 8,3 L 0,6" fill="#e65100" />
                      </marker>
                    </defs>
                    <line x1="365" y1="150" x2="325" y2="142" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowD)" />
                    <text x="369" y="155" textAnchor="start" fontSize="12" fontWeight="bold"
                      fill={highlightedLabel === 'D' ? '#d32f2f' : '#e65100'}>
                      {angleD ? `D=${angleD}°` : 'D'}
                    </text>

                    {/* E — arrow pointing to lower bend */}
                    <line x1="215" y1="240" x2="185" y2="227" stroke="#e65100" strokeWidth="1.2" markerEnd="url(#arrowE)" />
                    <text x="219" y="255" textAnchor="start" fontSize="12" fontWeight="bold"
                      fill={highlightedLabel === 'E' ? '#d32f2f' : '#e65100'}>
                      {angleE ? `E=${angleE}°` : 'E'}
                    </text>

                    {/* C — vertical dashed line along left side of bottom pipe */}
                    <line x1="75" y1="195" x2="75" y2="380" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="70" y1="195" x2="80" y2="195" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="70" y1="380" x2="80" y2="380" stroke="#d32f2f" strokeWidth="1" />
                    <text x="67" y="293" textAnchor="middle" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'C' ? '#d32f2f' : '#333'}
                      transform="rotate(-90, 67, 293)">
                      {measC ? `C=${measC}` : 'C'}
                    </text>

                    {/* Seam Side indicator — vertical dashed line on the pipe face */}
                    {seamSide === 'top' && (
                      <line x1="126" y1="125" x2="126" y2="373" stroke="#d32f2f" strokeWidth="3" strokeDasharray="8,5" />
                    )}
                    {seamSide === 'right' && (
                      <line x1="168" y1="136" x2="168" y2="384" stroke="#1976d2" strokeWidth="3" strokeDasharray="8,5" />
                    )}
                    {seamSide === 'left' && (
                      <line x1="103" y1="136" x2="103" y2="384" stroke="#f57c00" strokeWidth="3" strokeDasharray="8,5" />
                    )}
                    {seamSide === 'bottom' && (
                      <line x1="145" y1="148" x2="145" y2="395" stroke="#388e3c" strokeWidth="3" strokeDasharray="8,5" />
                    )}
                  </svg>
                  {note && (
                    <div style={{ fontSize: '18px', color: '#333', fontWeight: 'bold', textAlign: 'right', width: '100%', marginTop: '4px' }}>
                      Note: {note}
                    </div>
                  )}
                </div>
              ) : (
                /* ═══ ALL OTHER TYPES — Static product image ═══ */
                <>
                  {barcode && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px', padding: '4px 0' }}>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.2 }}>BARCODE</span>
                      <svg width={140} height={50} viewBox="0 0 140 50" xmlns="http://www.w3.org/2000/svg">
                        {[0,3,5,7,12,14,17,19,24,26,28,33,35,38,40,42,47,49,51,56,58,61,63,68,70,72,77,79,82,84,86,91,93,95,100,102,105,107,112,114,116,121,123,126,128,133,135,137].map(x => (
                          <rect key={x} x={x} y="0" width={x % 12 < 3 ? 2.5 : 1} height="50" fill="#000" />
                        ))}
                      </svg>
                      <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '4px', lineHeight: 1.4 }}>STICKERS</span>
                    </div>
                  )}

                  <div className="awf-product-image-wrapper">
                    {productImage ? (
                      <img src={productImage} alt={productName} className="awf-product-image" />
                    ) : (
                      <div className="awf-product-placeholder">
                        <Package size={64} className="placeholder-icon" />
                      </div>
                    )}
                  </div>

                  <span className="awf-product-size">{productName}</span>
                  {note && (
                    <div style={{ fontSize: '18px', color: '#333', fontWeight: 'bold', textAlign: 'right', width: '280px', marginTop: '0px', padding: '0' }}>
                      Note: {note}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="awf-canvas-actions">
              <Button
                variant="outlined"
                startIcon={<FaArrowLeft />}
                onClick={handleBack}
              >
                Back
              </Button>
            </div>
          </Card>
        </div>

        {/* RIGHT — Form panel */}
        <div className="awf-right-panel">
          <Card className="awf-form-card">
            {formType === 'custom_offset' ? (
              /* ═══════════════════════════════════════════════════════
                 CUSTOM OFFSET FORM — different layout with measurements sidebar
                 ═══════════════════════════════════════════════════════ */
              <div className="awf-custom-offset-layout">
                {/* Left: main form fields */}
                <div className="awf-custom-offset-form">
                  {/* Material & Color */}
                  <div className="awf-form-row">
                    <FormControl fullWidth>
                      <InputLabel required>Material</InputLabel>
                      <Select native required value={material} onChange={handleMaterialChange} label="Material" disabled={loadingMaterials}>
                        <option value="" disabled hidden></option>
                        {availableMaterials.map((mat) => (
                          <option key={mat.id} value={mat.value}>{mat.name}</option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth>
                      <InputLabel required>Color</InputLabel>
                      <Select key={material} native required value={color} disabled={!material || loadingColors} label="Color" onChange={handleColorChange}>
                        <option value="" disabled hidden></option>
                        {availableColors.map((col, index) => (
                          <option key={index} value={col.value}>{col.name}{col.code ? ` (${col.code})` : ''}</option>
                        ))}
                      </Select>
                    </FormControl>
                  </div>

                  {/* Thickness — dropdown only for custom offset */}
                  <div className="awf-form-row single">
                    <FormControl fullWidth>
                      <InputLabel>Thickness</InputLabel>
                      <Select
                        native
                        value={thickness}
                        onChange={(e) => setThickness(Number(e.target.value))}
                        label="Thickness"
                      >
                        <option value={0.45}>0.45</option>
                        <option value={0.6}>0.60</option>
                      </Select>
                    </FormControl>
                  </div>

                  {/* Size — manual text input */}
                  <div className="awf-form-row single">
                    <TextField
                      label="Size"
                      type="text"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      fullWidth
                    />
                  </div>

                  {/* Number of Pieces */}
                  <div className="awf-form-row single">
                    <TextField
                      label="Number of Pieces"
                      required
                      type="text"
                      value={numberOfPieces}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setNumberOfPieces(value);
                      }}
                      inputProps={{ maxLength: 4 }}
                      fullWidth
                    />
                  </div>

                  {/* BARCODE checkbox */}
                  <div className="awf-checkbox-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={barcode}
                        onChange={(e) => setBarcode(e.target.checked)}
                      />
                      <span>BARCODE</span>
                    </label>
                  </div>

                  {/* Note */}
                  <div className="awf-form-row single">
                    <TextField
                      label="Note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="awf-form-row single">
                    <TextField
                      label="Unit Price"
                      type="text"
                      value={unitPrice}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d.]/g, '');
                        const parts = value.split('.');
                        const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                        setUnitPrice(sanitized);
                      }}
                      fullWidth
                    />
                  </div>
                </div>

                {/* Right: Measurements sidebar */}
                <div className="awf-measurements-panel">
                  <div className="awf-measurements-section">
                    <div className="awf-measurements-title">Measurements (mm)</div>
                    <div className="awf-measurement-field">
                      <label>W =</label>
                      <input type="text" value={measW} onChange={(e) => { setMeasW(e.target.value.replace(/[^\d.]/g, '')); highlightField('W'); }} />
                    </div>
                    <div className="awf-measurement-field">
                      <label>A =</label>
                      <input type="text" value={measA} onChange={(e) => { setMeasA(e.target.value.replace(/[^\d.]/g, '')); highlightField('A'); }} />
                    </div>
                    <div className="awf-measurement-field">
                      <label>B1 =</label>
                      <input type="text" value={measB1} onChange={(e) => { setMeasB1(e.target.value.replace(/[^\d.]/g, '')); highlightField('B1'); }} />
                    </div>
                    <div className="awf-measurement-field">
                      <label>B2 =</label>
                      <input type="text" value={measB2} onChange={(e) => { setMeasB2(e.target.value.replace(/[^\d.]/g, '')); highlightField('B2'); }} />
                    </div>
                    <div className="awf-measurement-field">
                      <label>C =</label>
                      <input type="text" value={measC} onChange={(e) => { setMeasC(e.target.value.replace(/[^\d.]/g, '')); highlightField('C'); }} />
                    </div>
                  </div>

                  <div className="awf-measurements-section">
                    <div className="awf-measurements-title">Angle Degree ∠</div>
                    <div className="awf-measurement-field">
                      <label>D =</label>
                      <input type="text" value={angleD} onChange={(e) => { setAngleD(e.target.value.replace(/[^\d.]/g, '')); highlightField('D'); }} />
                    </div>
                    <div className="awf-measurement-field">
                      <label>E =</label>
                      <input type="text" value={angleE} onChange={(e) => { setAngleE(e.target.value.replace(/[^\d.]/g, '')); highlightField('E'); }} />
                    </div>
                  </div>

                  <div className="awf-measurements-section">
                    <div className="awf-measurements-title">Type</div>
                    <label className="awf-radio-option">
                      <input type="radio" name="offsetType" value="fixed" checked={offsetType === 'fixed'} onChange={(e) => setOffsetType(e.target.value)} />
                      <span>Fixed</span>
                    </label>
                    <label className="awf-radio-option">
                      <input type="radio" name="offsetType" value="adjustable" checked={offsetType === 'adjustable'} onChange={(e) => setOffsetType(e.target.value)} />
                      <span>Adjustable</span>
                    </label>
                    {offsetType === 'adjustable' && (
                      <div className="awf-adjustable-range">
                        <input type="text" placeholder="from" value={adjustableFrom} onChange={(e) => setAdjustableFrom(e.target.value.replace(/[^\d.]/g, ''))} />
                        <span>to</span>
                        <input type="text" placeholder="to" value={adjustableTo} onChange={(e) => setAdjustableTo(e.target.value.replace(/[^\d.]/g, ''))} />
                        <span>mm</span>
                      </div>
                    )}
                  </div>

                  <div className="awf-measurements-section">
                    <div className="awf-measurements-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      Seam Side
                      {seamSide && (
                        <button type="button" onClick={() => setSeamSide('')}
                          style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', fontSize: '11px', padding: '0', textDecoration: 'underline' }}>
                          Reset
                        </button>
                      )}
                    </div>
                    <label className="awf-radio-option">
                      <input type="radio" name="seamSide" value="top" checked={seamSide === 'top'} onChange={(e) => setSeamSide(e.target.value)} />
                      <span>Top</span>
                    </label>
                    <label className="awf-radio-option">
                      <input type="radio" name="seamSide" value="left" checked={seamSide === 'left'} onChange={(e) => setSeamSide(e.target.value)} />
                      <span>Left Side</span>
                    </label>
                    <label className="awf-radio-option">
                      <input type="radio" name="seamSide" value="bottom" checked={seamSide === 'bottom'} onChange={(e) => setSeamSide(e.target.value)} />
                      <span>Bottom</span>
                    </label>
                    <label className="awf-radio-option">
                      <input type="radio" name="seamSide" value="right" checked={seamSide === 'right'} onChange={(e) => setSeamSide(e.target.value)} />
                      <span>Right Side</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              /* ═══════════════════════════════════════════════════════
                 STANDARD FORM — all other AWF product types
                 ═══════════════════════════════════════════════════════ */
              <>
                {/* Material & Color Selection */}
                <div className="awf-form-row">
                  <FormControl fullWidth>
                    <InputLabel required>Material</InputLabel>
                    <Select
                      native
                      required
                      value={material}
                      onChange={handleMaterialChange}
                      label="Material"
                      disabled={loadingMaterials}
                    >
                      <option value="" disabled hidden></option>
                      {availableMaterials.map((mat) => (
                        <option key={mat.id} value={mat.value}>
                          {mat.name}
                        </option>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth>
                    <InputLabel required>Color</InputLabel>
                    <Select
                      key={material}
                      native
                      required
                      value={color}
                      disabled={!material || loadingColors}
                      label="Color"
                      onChange={handleColorChange}
                    >
                      <option value="" disabled hidden></option>
                      {availableColors.map((col, index) => (
                        <option key={index} value={col.value}>
                          {col.name}{col.code ? ` (${col.code})` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </div>

                {/* Thickness — bold text display matching document */}
                <div className="awf-thickness-display">
                  <span className="awf-thickness-label">Thickness :</span>
                  <span className="awf-thickness-value">{Number(thickness).toFixed(2)}</span>
                </div>

                {/* Dimension inputs: 2 boxes (A x B) for square, 1 box for round */}
                {showDimensions && (
                  <>
                    {isSquareProduct ? (
                      <div className="awf-dimension-row">
                        <TextField
                          label="A"
                          type="text"
                          value={dimWidth}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d.]/g, '');
                            setDimWidth(value);
                          }}
                          size="small"
                        />
                        <span className="awf-dimension-separator">x</span>
                        <TextField
                          label="B"
                          type="text"
                          value={dimHeight}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d.]/g, '');
                            setDimHeight(value);
                          }}
                          size="small"
                        />
                      </div>
                    ) : (
                      <div className="awf-dimension-row">
                        <TextField
                          label="A"
                          type="text"
                          value={dimWidth}
                          onChange={(e) => {
                            const value = e.target.value.replace(/[^\d.]/g, '');
                            setDimWidth(value);
                          }}
                          size="small"
                          fullWidth
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Number of Pieces + Length */}
                {standardDPLength ? (
                  /* Standard D/P — length is readonly, determined by product selection */
                  <div className="awf-form-row">
                    <TextField
                      label="Number of Pieces"
                      required
                      type="text"
                      value={numberOfPieces}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setNumberOfPieces(value);
                      }}
                      inputProps={{ maxLength: 4 }}
                      fullWidth
                    />
                    <div className="awf-thickness-display">
                      <span className="awf-thickness-label">Length :</span>
                      <span className="awf-thickness-value">{standardDPLength}</span>
                    </div>
                  </div>
                ) : (partClass === 'Downpipe') ? (
                  <div className="awf-form-row">
                    <TextField
                      label="Number of Pieces"
                      required
                      type="text"
                      value={numberOfPieces}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setNumberOfPieces(value);
                      }}
                      inputProps={{ maxLength: 4 }}
                      fullWidth
                    />
                    {length === 'custom' ? (
                      <TextField
                        label="Length (m)"
                        type="text"
                        value={customLength}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^\d.]/g, '');
                          if (value === '') { setLength(''); setCustomLength(''); return; }
                          const parts = value.split('.');
                          setCustomLength(parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value);
                        }}
                        fullWidth
                      />
                    ) : (
                      <FormControl fullWidth>
                        <InputLabel>Length (m)</InputLabel>
                        <Select
                          native
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          label="Length (m)"
                        >
                          <option value="" disabled hidden></option>
                          <option value="1.800">1.800</option>
                          <option value="2.400">2.400</option>
                          {formType === 'manual_dp' && <option value="custom">Custom</option>}
                        </Select>
                      </FormControl>
                    )}
                  </div>
                ) : formType === 'clips' ? (
                  <div className="awf-form-row">
                    <TextField
                      label="Number of Pieces"
                      required
                      type="text"
                      value={numberOfPieces}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setNumberOfPieces(value);
                      }}
                      inputProps={{ maxLength: 4 }}
                      fullWidth
                    />
                    <div className="awf-thickness-display">
                      <span className="awf-thickness-label">Length :</span>
                      <span className="awf-thickness-value">1</span>
                    </div>
                  </div>
                ) : (
                  <div className="awf-form-row single">
                    <TextField
                      label="Number of Pieces"
                      required
                      type="text"
                      value={numberOfPieces}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '');
                        setNumberOfPieces(value);
                      }}
                      inputProps={{ maxLength: 4 }}
                      fullWidth
                    />
                  </div>
                )}

                {/* TAPERED checkbox (manual_dp only) */}
                {showTapered && (
                  <>
                    <div className="awf-checkbox-option">
                      <label>
                        <input
                          type="checkbox"
                          checked={tapered}
                          onChange={(e) => setTapered(e.target.checked)}
                        />
                        <span>TAPERED</span>
                      </label>
                    </div>
                    {tapered && (
                      <div className="awf-form-row">
                        <TextField
                          label="Small End"
                          type="text"
                          value={taperedSmallEnd}
                          onChange={(e) => setTaperedSmallEnd(e.target.value.replace(/[^\d.]/g, ''))}
                          fullWidth
                        />
                        <TextField
                          label="Big End"
                          type="text"
                          value={taperedBigEnd}
                          onChange={(e) => setTaperedBigEnd(e.target.value.replace(/[^\d.]/g, ''))}
                          fullWidth
                        />
                      </div>
                    )}
                  </>
                )}

                {/* BARCODE checkbox */}
                {showBarcode && (
                  <div className="awf-checkbox-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={barcode}
                        onChange={(e) => setBarcode(e.target.checked)}
                      />
                      <span>BARCODE</span>
                    </label>
                  </div>
                )}

                {/* Use 2.4 Downpipe checkbox — Standard Offset and Bends only */}
                {partClass === 'Offsets' && formType !== 'custom_offset' && (
                  <div className="awf-checkbox-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={use24Downpipe}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUse24Downpipe(checked);
                          setLength(checked ? '2.4' : '1.8');
                        }}
                      />
                      <span>Use 2.4 Downpipe</span>
                    </label>
                  </div>
                )}

                {/* *Note* */}
                <div className="awf-form-row single">
                  <TextField
                    label="*Note*"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                </div>

                {/* Unit Price */}
                <div className="awf-form-row single">
                  <TextField
                    label="Unit Price"
                    type="text"
                    value={unitPrice}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.]/g, '');
                      const parts = value.split('.');
                      const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                      setUnitPrice(sanitized);
                    }}
                    fullWidth
                  />
                </div>
              </>
            )}

            {/* Finish Buttons — shared by all form types */}
            <div className="awf-finish-buttons">
              <Button
                variant="contained"
                color="error"
                onClick={handleFinish}
                disabled={!material || !color || saving}
                style={{ minWidth: '150px' }}
              >
                <FaCheck style={{ marginRight: '6px' }} /> {saving ? 'Saving...' : 'Finish'}
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleFinishAndAddNew}
                disabled={!material || !color || saving}
                style={{ minWidth: '150px' }}
              >
                <FaPlus style={{ marginRight: '6px' }} /> Finish & Add New
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleFinishAndCopy}
                disabled={!material || !color || saving}
                style={{ minWidth: '150px' }}
              >
                <FaCopy style={{ marginRight: '6px' }} /> Finish & Copy
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AWFSelectMaterials;
