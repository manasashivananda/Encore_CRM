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
import { API_BASE_URL, tokenManager } from '../../config/api.config';
import { DesignHeader } from './Header';
import { FaArrowLeft, FaPlus, FaCheck, FaCopy } from 'react-icons/fa';
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
  } = location.state || {};

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
  const showDimensions = formType === 'manual_dp' || formType === 'bends';
  const showTapered = formType === 'manual_dp';
  const showBarcode = formType !== 'clips' && formType !== 'manual_dp';

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
  const [material, setMaterial] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [color, setColor] = useState('');
  const [thickness] = useState(defaultThickness);
  const [numberOfPieces, setNumberOfPieces] = useState('');
  const [length, setLength] = useState('');
  const [dimWidth, setDimWidth] = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [tapered, setTapered] = useState(false);
  const [barcode, setBarcode] = useState(false);
  const [note, setNote] = useState('');
  const [unitPrice, setUnitPrice] = useState('');

  // ═══════════════════════════════════════════════════════════════
  // LOAD DATA ON MOUNT
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    loadOrderDetails();
    loadMaterials();
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
  // FINISH HANDLERS (display only — no API calls yet)
  // ═══════════════════════════════════════════════════════════════
  const getFormData = () => ({
    orderNumber,
    customerId,
    customerName,
    productId,
    productName,
    partClass,
    subCategory,
    material,
    color,
    thickness,
    numberOfPieces: Number(numberOfPieces),
    length: length ? Number(length) : null,
    dimensions: { width: dimWidth ? Number(dimWidth) : null, height: dimHeight ? Number(dimHeight) : null },
    tapered,
    barcode,
    note,
    unitPrice: unitPrice ? Number(unitPrice) : 0,
  });

  const handleFinish = () => {
    console.log('AWF FINISH — form data:', getFormData());
  };

  const handleFinishAndAddNew = () => {
    console.log('AWF FINISH & ADD NEW — form data:', getFormData());
  };

  const handleFinishAndCopy = () => {
    console.log('AWF FINISH & COPY — form data:', getFormData());
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

              {productImage ? (
                <img src={productImage} alt={productName} className="awf-product-image" />
              ) : (
                <div className="awf-product-placeholder">
                  <Package size={64} className="placeholder-icon" />
                </div>
              )}

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
              <span className="awf-thickness-value">{thickness}</span>
            </div>

            {/* Dimension inputs with "x" separator (manual_dp, bends) */}
            {showDimensions && (
              <>
                <div className="awf-dimension-row">
                  <TextField
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
                    type="text"
                    value={dimHeight}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.]/g, '');
                      setDimHeight(value);
                    }}
                    size="small"
                  />
                </div>
                <span className="awf-add-quantity">+ Add Quantity</span>
              </>
            )}

            {/* Number of Pieces + Length(m) — side by side for manual_dp */}
            {formType === 'manual_dp' ? (
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
                <TextField
                  label="Length (m)"
                  type="text"
                  value={length}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.]/g, '');
                    const parts = value.split('.');
                    const sanitized = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : value;
                    setLength(sanitized);
                  }}
                  fullWidth
                />
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
                  <span>TAPERED</span>
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
                disabled={!material || !color}
                style={{ minWidth: '150px' }}
              >
                <FaCheck style={{ marginRight: '6px' }} /> Finish
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleFinishAndAddNew}
                disabled={!material || !color}
                style={{ minWidth: '150px' }}
              >
                <FaPlus style={{ marginRight: '6px' }} /> Finish & Add New
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleFinishAndCopy}
                disabled={!material || !color}
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
