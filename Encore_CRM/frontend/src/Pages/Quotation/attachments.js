import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { Row, Col, Spinner, Badge } from "react-bootstrap";
import { MyDiv, SpanTag } from "../Common/Components";
import { Dialog, DialogTitle, DialogContent, Button, DialogActions, Tooltip, IconButton } from "@mui/material";
import NoDataFound from "../Common/noDataFound";
import { MdDescription, MdDelete } from "react-icons/md";
import axios from "axios";
import swal from "sweetalert2";
import { GrDocumentTxt, GrDocumentPdf } from "react-icons/gr";
import { TbFileTypeXls } from "react-icons/tb";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function QuoteAttachments({ attachmentUpdates, CoreQuotationDetails }) {
  let { id } = useParams();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [orderDepartmentImages, setOrderDepartmentImages] = useState("");
  const [btnLoading, setBtnLoading] = useState(false);
  const handleOpenDialog = () => {
    loadOrderDepartmentImages();
    setOpenDialog(true);
    setSelectedFiles([]);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setOrderDepartmentImages();
  };

  const loadOrderDepartmentImages = async () => {
    const url = `${API_BASE_URL}fetch-quotation-payment-reciept/${id}`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setOrderDepartmentImages(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };

  const handleDeleteImage = async index => {
    const url = `${API_BASE_URL}delete-quotation-payment-reciept/${id}/${index}`;
    try {
      const response = await axios.delete(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setOpenDialog(false);
      swal.fire({
        text: response.data || "Image deleted successfully",
        icon: "success",
      });
      attachmentUpdates();
    } catch (error) {
      setOpenDialog(false);
      swal.fire({
        text: error.response.data,
        icon: "error",
      });
    }
  };

  const handleFileSelect = e => {
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setBtnLoading(true);
    const formData = new FormData();

    selectedFiles.forEach(file => {
      formData.append("documents", file);
    });

    const url = API_BASE_URL + "upload-quotation-payment-reciept/" + id;

    try {
      const res = await axios.put(url, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "multipart/form-data",
        },
      });
      if (res.status === 200 && res.data) {
        setOpenDialog(false);
        swal.fire({
          text: res.data || "Successfully Saved",
          icon: "success",
        });
        attachmentUpdates();
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (error) {
      swal.fire({
        text: error.response || "Upload failed. Please try again.",
        icon: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };

  const getFileType = url => {
    const urlWithoutQuery = url.split("?")[0];
    const extension = urlWithoutQuery.split(".").pop().toLowerCase();
    switch (extension) {
      case "png":
      case "jpeg":
      case "jpg":
      case "gif":
        return "image";
      case "pdf":
        return "pdf";
      case "doc":
      case "docx":
        return "doc";
      case "xlsx":
        return "xlsx";
      default:
        return "unknown";
    }
  };

  const renderImagesByDepartment = depImages => {
    if (depImages.length) {
      return depImages.map((depImage, index) => {
        const fileType = getFileType(depImage.url);
        return (
          <Col key={index} md={3} className="mb-3">
            <MyDiv>
              <SpanTag className="text-center">
                {fileType === "image" && <img src={depImage.url} alt={`Order ${index + 1}`} />}
                {fileType === "pdf" && <GrDocumentPdf className="DocIcon" />}
                {fileType === "doc" && <GrDocumentTxt className="DocIcon" />}
                {fileType === "xlsx" && <TbFileTypeXls className="DocIcon" />}
                {fileType === "unknown" && <span>Unknown file type for Order {index + 1}</span>}
              </SpanTag>
              {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                <Tooltip title="Delete Image">
                  <IconButton aria-label="delete" color="secondary" onClick={() => handleDeleteImage(index)}>
                    <MdDelete />
                  </IconButton>
                </Tooltip>
              ) : (
                ""
              )}
              <a href={depImage.url} download target="_blank" rel="noopener noreferrer" title="Download">
                Download
              </a>
            </MyDiv>
          </Col>
        );
      });
    }
    return null;
  };

  return (
    <React.Fragment>
      <Tooltip title="Attachments" className="ms-2">
        <IconButton
          aria-label="fingerprint"
          sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
          onClick={e => handleOpenDialog()}
        >
          <MdDescription />
        </IconButton>
      </Tooltip>
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
        <DialogTitle className="space-between">
          Attachments
          <Button onClick={handleCloseDialog} className="btn">
            X
          </Button>
        </DialogTitle>
        <DialogContent>
          <MyDiv className="documentContainer">
            <Row>{orderDepartmentImages && orderDepartmentImages?.imageUrls.length > 0 ? <>{renderImagesByDepartment(orderDepartmentImages.imageUrls)}</> : <NoDataFound />}</Row>
          </MyDiv>
        </DialogContent>
        <DialogActions className="d-flex justify-content-start flex-column">
          <Row className="dialogFooter">
            <Col md={6} className="">
              <form onSubmit={handleSubmit}>
                <MyDiv className="mb-2">
                  {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                    <>
                      <input type="file" id="document" name="document" multiple onChange={handleFileSelect} />
                      <Button className="btn primary-btn mb-1" type="submit" disabled={btnLoading || !selectedFiles.length}>
                        {btnLoading ? <Spinner animation="border" size="sm" /> : "Upload"}
                      </Button>
                    </>
                  ) : (
                    <Badge className="orderMovedToMyobBadge">Quote Converted to Order</Badge>
                  )}
                </MyDiv>
              </form>
            </Col>
            <Col md={6} className="d-flex justify-content-end"></Col>
          </Row>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
}

export default QuoteAttachments;

QuoteAttachments.propTypes = {
  attachmentUpdates: PropTypes.any,
  CoreQuotationDetails: PropTypes.any,
};
