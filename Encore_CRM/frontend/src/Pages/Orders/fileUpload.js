import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Row, Col, Badge, Spinner } from "react-bootstrap";
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


function FileUpload({ orderUpdates }) {
  let { id } = useParams();
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [orderImages, setOrderImages] = useState("");
  const [btnLoading, setBtnLoading] = useState(false);
  const handleOpenDialog = () => {
    fetchFiles();
    setOpenDialog(true);
    setSelectedFiles([]);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setOrderImages();
  };

  const fetchFiles = useCallback(async () => {
    const url = `${API_BASE_URL}fetch-awf-docket/${id}`;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setOrderImages(res.data);
    } catch (error) {
      console.log(error);
    }
  }, [id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleDeleteImage = async index => {
    const url = `${API_BASE_URL}delete-awf-docket/${id}/${index}`;
    try {
      const response = await axios.delete(
        url,
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      setOpenDialog(false);
      swal.fire({
        text: response.data || "Image deleted successfully",
        icon: "success",
      });
      orderUpdates();
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

  const handleSubmit = e => {
    e.preventDefault();
    setBtnLoading(true);
    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append("documents", file);
    });

    const url = API_BASE_URL + "upload-awf-docket/" + id;

    axios
      .patch(url, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "multipart/form-data",
        },
      })
      .then(res => {
        if (res.status === 200) {
          setOpenDialog(false);
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
          });
          orderUpdates();
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response?.data || "An error occurred",
          icon: "error",
        });
      })
      .finally(() => {
        setBtnLoading(false);
      });
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


  const renderImages = depImages => {
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

              <Tooltip title="Delete Image">
                <IconButton aria-label="delete" color="secondary" onClick={() => handleDeleteImage(index)}>
                  <MdDelete />
                </IconButton>
              </Tooltip>

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
      <Tooltip title="Order Docket" className="ms-2 me-2">
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
           Order Docket
          <Button onClick={handleCloseDialog} className="btn">
            X
          </Button>
        </DialogTitle>
        <DialogContent>
          <MyDiv className="documentContainer">
            <Row>{orderImages && orderImages?.imageUrls.length > 0 ? <>{renderImages(orderImages.imageUrls)}</> : <NoDataFound />}</Row>
          </MyDiv>
        </DialogContent>
        <DialogActions className="d-flex justify-content-start flex-column">
          <Row className="dialogFooter">
            <Col md={6} className="">
                <form onSubmit={handleSubmit}>
                  <MyDiv className="mb-2">
                    <input type="file" id="document" name="document" onChange={handleFileSelect} />
                    <Button className="btn primary-btn mb-1" type="submit" disabled={btnLoading || !selectedFiles.length}>
                      {btnLoading ? <Spinner animation="border" size="sm" /> : "Upload"}
                    </Button>
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

export default FileUpload;

FileUpload.propTypes = {
  orderUpdates: PropTypes.any
};
