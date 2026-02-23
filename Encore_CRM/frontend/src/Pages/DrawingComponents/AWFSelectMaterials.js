/**
 * AWFSelectMaterials — Material selection page for AWF products
 *
 * This is the AWF equivalent of SelectMaterialsSimplified (used by Flashing).
 * Navigated to from TemplateLibrary when user double-clicks or clicks "Use It"
 * on an AWF product card.
 *
 * Flow: TemplateLibrary (AWF product) → AWFSelectMaterials → Back to Order
 *
 * Created: 20-Feb-2026
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import '../../styles/TemplateLibrary.scss';

const AWFSelectMaterials = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};

  const [orderNumber] = useState(state.orderNumber || '');
  const [customerName] = useState(state.customerName || '');
  const [orderId] = useState(state.orderId || '');
  const [previousPage] = useState(state.previousPage || 'designers');

  // AWF product data from TemplateLibrary
  const [productName] = useState(state.name || '');
  const [partClass] = useState(state.partClass || '');
  const [subCategory] = useState(state.subCategory || '');
  const [shape] = useState(state.shape || '');
  const [dimensions] = useState(state.dimensions || {});
  const [thickness] = useState(state.thickness || 0);
  const [lengthOptions] = useState(state.length_options || []);
  const [isCustom] = useState(state.is_custom || false);

  useEffect(() => {
    // Log AWF product data for debugging
    console.log('AWF Select Materials - Product:', {
      productName, partClass, subCategory, shape, dimensions, thickness, lengthOptions, isCustom
    });
  }, []);

  const handleBack = () => {
    if (orderId) {
      navigate(`/${orderNumber?.startsWith("IN") ? "orders" : "quotes"}/${orderId}/drawings/templates`, {
        state: {
          orderNumber,
          customerName,
          customerId: state.customerId,
          orderId,
          partGroup: 'AWF',
          partClass,
          previousPage,
        }
      });
    } else {
      navigate(-1);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: "'Inter', Arial, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={handleBack}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px', border: '1px solid #333', borderRadius: '6px',
            background: '#333', color: '#fff', cursor: 'pointer', fontSize: '14px'
          }}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
          AWF Select Materials
        </h2>
        {orderNumber && (
          <span style={{ color: '#888', fontSize: '14px' }}>— {orderNumber}</span>
        )}
      </div>

      <div style={{
        background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0',
        padding: '20px', maxWidth: '600px'
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '16px', color: '#d22530' }}>{productName}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px', fontSize: '14px' }}>
          <span style={{ color: '#888' }}>Part Class</span>
          <span style={{ fontWeight: 600 }}>{partClass}</span>

          {subCategory && (
            <>
              <span style={{ color: '#888' }}>Sub Category</span>
              <span style={{ fontWeight: 600 }}>{subCategory}</span>
            </>
          )}

          {shape && (
            <>
              <span style={{ color: '#888' }}>Shape</span>
              <span style={{ fontWeight: 600 }}>{shape}</span>
            </>
          )}

          {shape === 'square' && dimensions?.a && (
            <>
              <span style={{ color: '#888' }}>Size</span>
              <span style={{ fontWeight: 600 }}>{dimensions.a}{dimensions.b ? ` x ${dimensions.b}` : ''}mm</span>
            </>
          )}

          {shape === 'round' && dimensions?.diameter && (
            <>
              <span style={{ color: '#888' }}>Diameter</span>
              <span style={{ fontWeight: 600 }}>{dimensions.diameter}mm</span>
            </>
          )}

          {thickness > 0 && (
            <>
              <span style={{ color: '#888' }}>Thickness</span>
              <span style={{ fontWeight: 600 }}>{thickness}mm</span>
            </>
          )}

          {lengthOptions.length > 0 && (
            <>
              <span style={{ color: '#888' }}>Length Options</span>
              <span style={{ fontWeight: 600 }}>{lengthOptions.join(', ')}mm</span>
            </>
          )}

          {isCustom && (
            <>
              <span style={{ color: '#888' }}>Type</span>
              <span style={{ fontWeight: 600, color: '#d22530' }}>Custom</span>
            </>
          )}
        </div>

        <p style={{ marginTop: '24px', padding: '12px', background: '#f8f9fa', borderRadius: '6px', fontSize: '13px', color: '#666' }}>
          AWF material selection will be implemented here. This page is separate from the Flashing SelectMaterials flow.
        </p>
      </div>
    </div>
  );
};

export default AWFSelectMaterials;
