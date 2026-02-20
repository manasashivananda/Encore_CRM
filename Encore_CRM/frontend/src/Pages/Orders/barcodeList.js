import React, { useState, useRef, useEffect } from "react";
import { Row } from "react-bootstrap";
import html2canvas from "html2canvas";
import { MyDiv } from "../Common/Components";
import BarcodeSection from "./barcodeSection";
import axios from "axios";
import swal from "sweetalert2";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function BarCodeList({ orderId, BarcodeSuccessInfo }) {
  const [barCodeList, setBarcodeList] = useState([]);
  const wrapperRefs = {
    flashing: useRef(),
    jobbing: useRef(),
    faciagutter: useRef(),
    cladding: useRef(),
    gbi: useRef(),
    roofing: useRef(),
  };

  let savedOrderId = orderId;
  useEffect(() => {
    if (savedOrderId?.id && savedOrderId?.department) {
      loadSpecificBarcodeList();
    }
  }, [orderId?.updatedAt]);

  const loadSpecificBarcodeList = async () => {
    const url = API_BASE_URL + `fetch-specific-order-barcode/${orderId.id}`;
    try {
      const response = await fetch(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      if (data[0] && data[0].order_barcode_checker === false) {
        setBarcodeList(data);
      }
    } catch (error) {
      BarcodeSuccessInfo();
      swal.fire({
        text: error.response?.data || "An error occurred",
        icon: "error",
      });
    }
  };

  useEffect(() => {
    if (Array.isArray(barCodeList) && barCodeList.length !== 0) {
      if (orderId) {
        handleSaveAndSendToAPI();
      }
    }
  }, [barCodeList]);

  const handleSaveAndSendToAPI = async () => {
    const canvasWidth = 1800;
    const canvasHeight = 1200;
    const opt = {
      scale: 4,
    };

    const formData = new FormData();
    let barcodeRefs;

    if (orderId.department === "F") {
      barcodeRefs = [wrapperRefs.flashing.current];
    } else if (orderId.department === "J") {
      barcodeRefs = [wrapperRefs.jobbing.current];
    } else if (orderId.department === "FG") {
      barcodeRefs = [wrapperRefs.faciagutter.current];
    } else if (orderId.department === "CL") {
      barcodeRefs = [wrapperRefs.cladding.current];
    } else if (orderId.department === "GBI") {
      barcodeRefs = [wrapperRefs.gbi.current];
    } else if (orderId.department === "ROOF") {
      barcodeRefs = [wrapperRefs.roofing.current];
    }

    for (let index = 0; index < barcodeRefs.length; index++) {
      const barcodeRef = barcodeRefs[index];
      try {
        const canvas = await html2canvas(barcodeRef, opt);
        const resizedCanvas = document.createElement("canvas");
        resizedCanvas.width = canvasWidth;
        resizedCanvas.height = canvasHeight;
        const ctx = resizedCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, 0, canvasWidth, canvasHeight);
        const blob = await new Promise(resolve => resizedCanvas.toBlob(resolve, "image/jpeg", 0.9));
        formData.append("documents", blob, `barcode_${index}.jpg`);
      } catch (error) {
        console.log(error);
      }
    }

    const apiEndpoint = `${API_BASE_URL}sent-barcode-designs-for-printing/${orderId.id}/${orderId.department}`;
    try {
      await axios.post(apiEndpoint, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
        },
      });
      swal.fire({
        text: "Processed Successfully",
        icon: "success",
        type: "success",
        timer: 1000,
      });
      BarcodeSuccessInfo();
      savedOrderId = "";
    } catch (error) {
      BarcodeSuccessInfo();
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  };

  return (
    <React.Fragment>
      {barCodeList.map(item => (
        <MyDiv key={item._id}>
          <Row>
            {item.Order_Flashing_Count !== 0 && <BarcodeSection item={item} department="Flashing" barcodeRef={wrapperRefs.flashing} />}
            {item.Order_Jobbing_Count !== 0 && <BarcodeSection item={item} department="Jobbing" barcodeRef={wrapperRefs.jobbing} />}
            {item.Order_Faciagutter_Count !== 0 && <BarcodeSection item={item} department="Facia Gutter" barcodeRef={wrapperRefs.faciagutter} />}
            {item.Order_Cladding_Count !== 0 && <BarcodeSection item={item} department="Cladding" barcodeRef={wrapperRefs.cladding} />}
            {item.Order_GBI_Count !== 0 && <BarcodeSection item={item} department="GBI" barcodeRef={wrapperRefs.gbi} />}
            {item.Order_Roofing_Count !== 0 && <BarcodeSection item={item} department="Roofing" barcodeRef={wrapperRefs.roofing} />}
          </Row>
        </MyDiv>
      ))}
    </React.Fragment>
  );
}

export default BarCodeList;

BarCodeList.propTypes = {
  orderId: PropTypes.any,
  BarcodeSuccessInfo: PropTypes.any,
};
