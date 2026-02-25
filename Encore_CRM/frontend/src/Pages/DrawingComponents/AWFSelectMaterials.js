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
  const [length, setLength] = useState(editData?.length != null ? String(editData.length) : '');
  const [dimWidth, setDimWidth] = useState(editData?.dimWidth != null ? String(editData.dimWidth) : '');
  const [dimHeight, setDimHeight] = useState(editData?.dimHeight != null ? String(editData.dimHeight) : '');
  const [tapered, setTapered] = useState(editData?.tapered || false);
  const [barcode, setBarcode] = useState(editData?.barcode || false);
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
      length: length ? Number(length) : null,
      dimensions: { width: dimWidth ? Number(dimWidth) : null, height: dimHeight ? Number(dimHeight) : null },
      tapered, barcode, note,
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
      setDimWidth('');
      setDimHeight('');
      setTapered(false);
      setBarcode(false);
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
              <h4 className="awf-product-title">{subCategory || partClass}</h4>

              {formType === 'custom_offset' ? (
                /* ═══ CUSTOM OFFSET — Interactive SVG drawing ═══ */
                <div className="awf-offset-drawing">
                  <svg viewBox="0 0 420 480" width="380" height="440" xmlns="http://www.w3.org/2000/svg">
                    {/* 3D isometric offset pipe */}
                    {/* Top face */}
                    <polygon points="120,80 280,80 310,60 150,60" fill="#e8e8e8" stroke="#333" strokeWidth="1.5" />
                    {/* Front face of top section */}
                    <polygon points="120,80 280,80 280,120 120,120" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                    {/* Right face of top section */}
                    <polygon points="280,80 310,60 310,100 280,120" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />

                    {/* Angled section - front */}
                    <polygon points="120,120 170,120 170,260 120,260" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                    {/* Angled section - right side */}
                    <polygon points="170,120 200,100 200,240 170,260" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
                    {/* Angled section - top connecting */}
                    <polygon points="120,120 170,120 200,100 150,100" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />

                    {/* Bottom section - front */}
                    <polygon points="120,260 280,260 280,300 120,300" fill="#d0d0d0" stroke="#333" strokeWidth="1.5" />
                    {/* Bottom section - right */}
                    <polygon points="280,260 310,240 310,280 280,300" fill="#b8b8b8" stroke="#333" strokeWidth="1.5" />
                    {/* Bottom section - top */}
                    <polygon points="120,260 280,260 310,240 150,240" fill="#e0e0e0" stroke="#333" strokeWidth="1.5" />

                    {/* Bottom face */}
                    <polygon points="120,300 280,300 310,280 150,280" fill="#c0c0c0" stroke="#333" strokeWidth="1.5" />

                    {/* ─── Dimension lines & labels ─── */}

                    {/* W — width across top */}
                    <line x1="120" y1="45" x2="280" y2="45" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="120" y1="40" x2="120" y2="50" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="280" y1="40" x2="280" y2="50" stroke="#d32f2f" strokeWidth="1" />
                    <text x="200" y="40" textAnchor="middle" fontSize="14" fontWeight="bold"
                      fill={highlightedLabel === 'W' ? '#d32f2f' : '#333'}>
                      W{measW ? ` = ${measW}` : ''}
                    </text>
                    {highlightedLabel === 'W' && <rect x="170" y="27" width="60" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* A — height left side (full) */}
                    <line x1="95" y1="80" x2="95" y2="300" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="90" y1="80" x2="100" y2="80" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="90" y1="300" x2="100" y2="300" stroke="#d32f2f" strokeWidth="1" />
                    <text x="75" y="195" textAnchor="middle" fontSize="14" fontWeight="bold"
                      fill={highlightedLabel === 'A' ? '#d32f2f' : '#333'}
                      transform="rotate(-90, 75, 195)">
                      A{measA ? ` = ${measA}` : ''}
                    </text>
                    {highlightedLabel === 'A' && <rect x="62" y="175" width="26" height="40" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* B1 — upper right section */}
                    <line x1="295" y1="60" x2="295" y2="100" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="290" y1="60" x2="300" y2="60" stroke="#1976d2" strokeWidth="1" />
                    <line x1="290" y1="100" x2="300" y2="100" stroke="#1976d2" strokeWidth="1" />
                    <text x="325" y="82" textAnchor="start" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'B1' ? '#d32f2f' : '#1976d2'}>
                      B1{measB1 ? ` = ${measB1}` : ''}
                    </text>
                    {highlightedLabel === 'B1' && <rect x="320" y="69" width="60" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* B2 — lower right of angled section */}
                    <line x1="215" y1="100" x2="215" y2="240" stroke="#1976d2" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="210" y1="100" x2="220" y2="100" stroke="#1976d2" strokeWidth="1" />
                    <line x1="210" y1="240" x2="220" y2="240" stroke="#1976d2" strokeWidth="1" />
                    <text x="235" y="175" textAnchor="start" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'B2' ? '#d32f2f' : '#1976d2'}>
                      B2{measB2 ? ` = ${measB2}` : ''}
                    </text>
                    {highlightedLabel === 'B2' && <rect x="230" y="162" width="65" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* C — bottom width */}
                    <line x1="120" y1="320" x2="280" y2="320" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,3" />
                    <line x1="120" y1="315" x2="120" y2="325" stroke="#d32f2f" strokeWidth="1" />
                    <line x1="280" y1="315" x2="280" y2="325" stroke="#d32f2f" strokeWidth="1" />
                    <text x="200" y="340" textAnchor="middle" fontSize="14" fontWeight="bold"
                      fill={highlightedLabel === 'C' ? '#d32f2f' : '#333'}>
                      C{measC ? ` = ${measC}` : ''}
                    </text>
                    {highlightedLabel === 'C' && <rect x="175" y="327" width="50" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* D — angle at top-right connection */}
                    <path d="M 270,120 Q 275,108 285,100" fill="none" stroke="#e65100" strokeWidth="1.5" />
                    <text x="290" y="118" textAnchor="start" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'D' ? '#d32f2f' : '#e65100'}>
                      D{angleD ? ` = ${angleD}°` : ''}
                    </text>
                    {highlightedLabel === 'D' && <rect x="285" y="105" width="60" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* E — angle at bottom connection */}
                    <path d="M 130,260 Q 125,272 120,280" fill="none" stroke="#e65100" strokeWidth="1.5" />
                    <text x="100" y="375" textAnchor="start" fontSize="13" fontWeight="bold"
                      fill={highlightedLabel === 'E' ? '#d32f2f' : '#e65100'}>
                      E{angleE ? ` = ${angleE}°` : ''}
                    </text>
                    {highlightedLabel === 'E' && <rect x="95" y="362" width="60" height="18" rx="3" fill="#ffeb3b" opacity="0.4" />}

                    {/* Note at bottom */}
                    <text x="210" y="420" textAnchor="middle" fontSize="11" fill="#666" fontStyle="italic">
                      * Standard angle of a downpipe offset is 80°
                    </text>
                  </svg>
                </div>
              ) : (
                /* ═══ OTHER TYPES — Product image / placeholder ═══ */
                <>
                  {barcode && (
                    <div className="awf-barcode-overlay">
                      <span className="awf-barcode-text">BARCODE</span>
                      <FaBarcode size={60} />
                      <span className="awf-barcode-text">STICKERS</span>
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
                    <div className="awf-measurements-title">Seam Side</div>
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
                {(partClass === 'Downpipe' || partClass === 'Offsets') ? (
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
                      </Select>
                    </FormControl>
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
                  <div className="awf-checkbox-option">
                    <label>
                      <input
                        type="checkbox"
                        checked={tapered}
                        onChange={(e) => setTapered(e.target.checked)}
                      />
                      <span>Big – Small End</span>
                    </label>
                  </div>
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
