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
  const [thickness] = useState(editData?.thickness || defaultThickness);
  const [numberOfPieces, setNumberOfPieces] = useState(editData?.numberOfPieces != null ? String(editData.numberOfPieces) : '');
  const [length, setLength] = useState(editData?.length != null ? String(editData.length) : '');
  const [dimWidth, setDimWidth] = useState(editData?.dimWidth != null ? String(editData.dimWidth) : '');
  const [dimHeight, setDimHeight] = useState(editData?.dimHeight != null ? String(editData.dimHeight) : '');
  const [tapered, setTapered] = useState(editData?.tapered || false);
  const [barcode, setBarcode] = useState(editData?.barcode || false);
  const [note, setNote] = useState(editData?.note || '');
  const [unitPrice, setUnitPrice] = useState(editData?.unitPrice != null ? String(editData.unitPrice) : '');
  const [saving, setSaving] = useState(false);

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
      productImage
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

              {/* Below image: product name */}
              <span className="awf-product-size">{productName}</span>
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

            {/* BARCODE checkbox (standard, offset, bends — NOT clips or manual_dp) */}
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

            {/* Finish Buttons */}
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
