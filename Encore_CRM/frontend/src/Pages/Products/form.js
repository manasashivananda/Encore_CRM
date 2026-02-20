import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../Common/staticjson";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormProduct({ handleClose, productInfo }) {
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    core_Product_Name: "",
    core_Product_Ref_Id: "",
    core_Product_Thickness: "",
    core_Product_Status: "",
  });

  const loadSpecificProduct = useCallback(async () => {
    try {
      const url = API_BASE_URL + `fetch-specific-core-product-data/` + productInfo;
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setData(response.data[0]);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  }, [productInfo]);

  useEffect(() => {
    if (productInfo !== undefined) {
      loadSpecificProduct();
    }
  }, [loadSpecificProduct, productInfo]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };

  const submit = async e => {
    e.preventDefault();
    setBtnLoading(true);

    try {
      const url = productInfo ? API_BASE_URL + "update-specific-core-product-data/" + productInfo : API_BASE_URL + "add-core-product-data";
      const method = productInfo ? "patch" : "post";
      const res = await axios({
        method,
        url,
        data,
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      });
      swal.fire({
        text: res.data || "Successfully Saved",
        icon: "success",
        type: "success",
        timer: 1000,
      });

      handleClose();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Something went wrong",
        icon: "error",
        type: "error",
      });
    } finally {
      setBtnLoading(false);
    }
  };

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{productInfo ? "Edit" : "Add"} Material</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={submit}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="core_Product_Name" label="Material Name" value={data.core_Product_Name} variant="standard" onChange={handleChangeWhiteSpace} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="core_Product_Ref_Id" label="Ref ID" value={data.core_Product_Ref_Id} variant="standard" onChange={handleChangeWhiteSpace} />
                  </Col>
                  <Col md={12}>
                    <TextField id="core_Product_Thickness" label="Thickness" value={data.core_Product_Thickness} variant="standard" onChange={handleChangeWhiteSpace} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="core_Product_Status"
                      id="core_Product_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.core_Product_Status, onChange: handleFieldChange }}
                    >
                      {cusStatus.map(productStatus => (
                        <MenuItem key={productStatus.value} value={productStatus.value}>
                          {productStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Please wait...</span>
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

export default FormProduct;
