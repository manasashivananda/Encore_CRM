import React, { useState } from "react";
import axios from "axios";
import { Row, Col } from "react-bootstrap";
import { MyDiv, SpanTag, StrongTag } from "../../Common/Components";
import swal from "sweetalert2";
import { IconButton, Tooltip } from "@mui/material";
import { MdOutlineAssignmentReturned } from "react-icons/md";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const CustomerPriceBulkUpload = ({ cusId, handleResponse }) => {
  const customerId = cusId;
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const handleFileUpload = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = event => {
      const fileData = event.target.result;
      setFileData(fileData);
    };
    if (file) {
      reader.readAsArrayBuffer(file);
    }
  };

  const AssignDefaultPriceForCustomer = async e => {
    e.preventDefault();
    setLoading(true);
    const url = API_BASE_URL + `assign-default-pricebook-to-customer/` + customerId;
    axios.post(url, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setLoading(false);
        handleResponse();
        swal.fire({
          text: res.data || "Successfully Assigned Default Prices for This Customer",
          icon: "success",
          type: "success",
        });
      },
      error => {
        setLoading(false);
        const errorMessage = typeof error?.response?.data === "string" ? error.response.data : error?.response?.data?.message || "Something went wrong. Please try again.";
        swal.fire({
          text: errorMessage,
          icon: "error",
        });
      }
    );
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!fileData) {
      swal.fire({
        text: "Please select a file",
        icon: "error",
        type: "error",
      });
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("documents", new Blob([fileData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "filename.xlsx");
    try {
      const response = await axios.post(API_BASE_URL + "bulk-import-customer-based-material-price/" + customerId, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.status === 200) {
        setLoading(false);
        swal.fire({
          text: response.data || "Successfully Added Default Price Matrix",
          icon: "success",
          type: "success",
        });
        setFileData(null);
        handleResponse();
        const fileInput = document.querySelector('input[type="file"]');
        if (fileInput) {
          fileInput.value = "";
        }
      }
    } catch (error) {
      setLoading(false);
      swal.fire({
        text: error.response.message,
        icon: "error",
        type: "error",
      });
    }
  };

  return (
    <MyDiv className="float-end">
      {loading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <MyDiv className="lds-ring">
              <MyDiv></MyDiv>
              <MyDiv></MyDiv>
              <MyDiv></MyDiv>
              <MyDiv></MyDiv>
            </MyDiv>
            <br />
            Price Matrix Uploading! <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
          </SpanTag>
        </MyDiv>
      ) : null}
      <Row>
        <Col md={10} className="pe-0">
          <StrongTag className="me-2 float-start"> Customer Based Price Book Upload :</StrongTag>
          <MyDiv className="w-100 d-flex align-items-center justify-content-between">
            <input type="file" className="float-start mt-1 w-50" accept=".xls,.xlsx" onChange={handleFileUpload} />
            <button className="btn primary-btn add-cta search mx-1" onClick={handleSubmit}>
              Upload File
            </button>
          </MyDiv>
        </Col>
        <Col md={2} className="d-flex align-items-center justify-content-end">
          <Tooltip title="Assign Default Price" className="me-2">
            <IconButton
              aria-label="Export To Excel"
              color="success"
              sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#bf3030", "&:hover": { backgroundColor: "#bf3030" } }}
              component="a"
              onClick={AssignDefaultPriceForCustomer}
            >
              <MdOutlineAssignmentReturned />
            </IconButton>
          </Tooltip>
        </Col>
      </Row>
    </MyDiv>
  );
};

export default CustomerPriceBulkUpload;

CustomerPriceBulkUpload.propTypes = {
  cusId: PropTypes.any,
  handleResponse: PropTypes.any,
};
