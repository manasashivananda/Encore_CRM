import React from 'react';
import { useParams, useLocation } from 'react-router-dom';
import DrawingCanvas from './DrawingCanvas';
import '../../styles/DrawingToolPage.module.scss';
import { startTransition } from 'react';

const DrawingToolPage = () => {
  const { order_unique_id } = useParams();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const templateId = queryParams.get('templateId');

  return (
    <div className="drawing-full-page">
    
      <DrawingCanvas orderId={order_unique_id} templateId={templateId} />
    </div>
  );
};

export default DrawingToolPage;
