import React, { useState, useRef, useEffect } from "react";
import { Row } from "react-bootstrap";
import html2canvas from "html2canvas";
import { MyDiv } from "../Common/Components";
import axios from "axios";
import { MdGetApp, MdEmail } from "react-icons/md";
import { Tooltip, IconButton, Dialog, DialogTitle, DialogContent } from "@mui/material";
import swal from "sweetalert2";
import { CiBarcode } from "react-icons/ci";
import BarcodeSection from "./barcodeSection";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function BarCodeView(CoreOrderId) {
  const [order, setOrder] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  let orderCoreId = CoreOrderId.CoreOrderId;

  const handleOpenDialog = () => {
    setOpenDialog(true);
    loadSpecificOrder();
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  useEffect(() => {
    loadSpecificOrder();
  }, []);

  const loadSpecificOrder = async () => {
    const url = API_BASE_URL + `fetch-specific-order-barcode/` + orderCoreId;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(
        res => {
          setOrder(res.data);
        },
        error => {
          swal.fire({
            text: error.response?.data || "An error occurred",
            icon: "error",
          });
        }
      );
  };

  const wrapperRefs = {
    flashing: useRef(),
    jobbing: useRef(),
    faciagutter: useRef(),
    cladding: useRef(),
    gbi: useRef(),
    roofing: useRef(),
  };

  const handleSendMail = async () => {
    const url = API_BASE_URL + `sent-barcode-designs-for-printing-manual/` + orderCoreId;
    axios.post(url, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        swal.fire({
          text: "Barcode Send to Printer Mail Id",
          icon: "success",
          type: "success",
        });
        handleCloseDialog();
      },
      error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      }
    );
    handleCloseDialog();
  };

  const handleSaveAndSendToAPI = async () => {
    const canvasWidth = 1800;
    const canvasHeight = 1200;

    const barcodeRefs = [wrapperRefs.flashing.current, wrapperRefs.jobbing.current, wrapperRefs.faciagutter.current, wrapperRefs.cladding.current, wrapperRefs.gbi.current, wrapperRefs.roofing.current];

    for (let index = 0; index < barcodeRefs.length; index++) {
      const barcodeRef = barcodeRefs[index];
      try {
        const canvas = await html2canvas(barcodeRef, {
          width: canvasWidth,
          height: canvasHeight,
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const a = document.createElement("a");
        a.href = imgData;
        a.download = `barcode_${index}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (error) {}
    }
  };

  return (
    <React.Fragment>
      <Tooltip title="BarCodes">
        <IconButton aria-label="fingerprint" color="success" className="ColoredIcon barcodeIcon" onClick={handleOpenDialog}>
          <CiBarcode />
        </IconButton>
      </Tooltip>
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="xl"
        sx={{
          "& .MuiDialog-container": {
            "& .MuiPaper-root": {
              width: "100%",
              maxWidth: "2000px",
            },
          },
        }}>
        <DialogTitle>{order[0] ? order[0].order_unique_id : ""} - Barcode</DialogTitle>
        <DialogContent>
          {order.map(item => (
            <MyDiv key={item._id}>
              <MyDiv className="barcodePrint">
                <Tooltip title="Download BarCodes">
                  <IconButton aria-label="save-and-send" color="primary" onClick={handleSaveAndSendToAPI}>
                    <MdGetApp />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Send to Printer Email">
                  <IconButton aria-label="save-and-send" color="primary" onClick={handleSendMail}>
                    <MdEmail />
                  </IconButton>
                </Tooltip>
              </MyDiv>
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
        </DialogContent>
      </Dialog>
    </React.Fragment>
  );
}

export default BarCodeView;
