import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, LabelTag, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { useParams } from "react-router-dom";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../../Common/staticjson";
import ColorPicker from "react-best-gradient-color-picker";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormColor({ handleClose, colorInfo }) {
  let { id } = useParams();
  let colorInfoId = colorInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    product_Color: "",
    product_Color_Code: "",
    product_Color_Hex_Code: "",
    product_Color_Status: "",
    product_Color_Special_Price: "0",
  });

  const loadSpecificColor = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-product-color-data/` + colorInfoId;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setData(res.data[0]);
      },
      error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      }
    );
  }, [colorInfoId]);

  useEffect(() => {
    if (colorInfo !== undefined) {
      loadSpecificColor();
    }
  }, [colorInfo, loadSpecificColor]);

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
  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = colorInfoId ? API_BASE_URL + "update-specific-product-color-data/" + colorInfoId : API_BASE_URL + "add-product-color-data/" + id;
    const method = colorInfoId ? "patch" : "post";
    axios({ method, url, data, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: res.data || "Successfully Saved",
            icon: "success",
            type: "success",
          });
          handleClose();
          setBtnLoading(false);
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
        setBtnLoading(false);
      });
  }
  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{colorInfo ? "Edit" : "Add"} Color</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="product_Color" label="Color Name" value={data.product_Color} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="product_Color_Code" label="Color Code" value={data.product_Color_Code} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <LabelTag>Pick a Color</LabelTag>
                    <ColorPicker hideControls="true" value={data.product_Color_Hex_Code} onChange={color => setData(prev => ({ ...prev, product_Color_Hex_Code: color }))} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      type="number"
                      id="product_Color_Special_Price"
                      label="Special Price %"
                      value={data.product_Color_Special_Price}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="product_Color_Status"
                      id="product_Color_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.product_Color_Status, onChange: handleFieldChange }}
                    >
                      {cusStatus.map((colorStatus, index) => (
                        <MenuItem key={index} value={colorStatus.value}>
                          {colorStatus.label}
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
export default FormColor;

FormColor.propTypes = {
  handleClose: PropTypes.any,
  colorInfo: PropTypes.any,
};
