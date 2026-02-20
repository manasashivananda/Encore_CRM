import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCustomItemCode({ handleClose, customItemInfo, customerId }) {
  let customItemInfoId = customItemInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    custom_Product_Code: "",
    custom_Product_Description: "",
    custom_Product_Class: "",
    custom_Product_Price: "",
    custom_Product_UOM: "",
  });

  const loadSpecificCustomItem = useCallback(async () => {
    const url = customerId ? `${API_BASE_URL}fetch-specific-custom-product-data-customer-based/${customItemInfoId}` : `${API_BASE_URL}fetch-specific-custom-product-data/${customItemInfoId}`;

    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setData(res.data[0]);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
      });
    }
  }, [customerId, customItemInfoId]);

  useEffect(() => {
    if (customItemInfo !== undefined && customItemInfo) {
      loadSpecificCustomItem();
    }
  }, [customItemInfo, loadSpecificCustomItem]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = customItemInfoId
      ? customerId
        ? API_BASE_URL + "update-specific-custom-product-data-customer-based/" + customItemInfoId
        : API_BASE_URL + "update-specific-custom-product-data/" + customItemInfoId
      : API_BASE_URL + "add-custom-product-data";
    const method = customItemInfoId ? "patch" : "post";
    axios({ method, url, data, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
            type: "success",
          });
          handleClose();
          setBtnLoading(false);
        }
      })
      .catch(error => {
        setBtnLoading(false);
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      });
  }
  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{customItemInfo ? "Edit" : "Add"} CustomItem</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required disabled id="custom_Product_Code" label="Item Code" value={data.custom_Product_Code} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      disabled
                      id="custom_Product_Description"
                      label="Item Description"
                      value={data.custom_Product_Description}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField required disabled id="custom_Product_Class" label="Item Class" value={data.custom_Product_Class} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required disabled id="custom_Product_UOM" label="UOM" value={data.custom_Product_UOM} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="custom_Product_Price" label="Item Price" value={data.custom_Product_Price} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Loading...</span>
                        </span>
                      </Button>
                    ) : (
                      <button type="submit" className="FormBtn">
                        Submit
                      </button>
                    )}
                  </Col>
                </Row>
              </form>
            </MyDiv>
          </Card.Body>
        </Card>
      </MyDiv>
    </MyDiv>
  );
}
export default FormCustomItemCode;
