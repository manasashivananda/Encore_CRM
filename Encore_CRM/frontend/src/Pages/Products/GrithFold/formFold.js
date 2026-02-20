import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../../Common/staticjson";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormFold({ handleClose, foldInfo }) {
  let foldInfoId = foldInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    product_Fold: "",
    product_Fold_Status: "",
  });

  const loadSpecificFold = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-product-fold-data/` + foldInfoId;
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
  }, [foldInfoId]);

  useEffect(() => {
    if (foldInfo !== undefined) {
      loadSpecificFold();
    }
  }, [foldInfo, loadSpecificFold]);

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
    const url = foldInfoId ? API_BASE_URL + "update-specific-product-fold-data/" + foldInfoId : API_BASE_URL + "add-product-fold-data";
    const method = foldInfoId ? "patch" : "post";
    axios({ method, url, data, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: res.data || "Successfully Saved",
            icon: "success",
            type: "success",
            timer: 1000,
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
            <HeadingFour className="card-title">{foldInfo ? "Edit" : "Add"} Fold</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="product_Fold" label="Fold Name" value={data.product_Fold} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="product_Fold_Status"
                      id="product_Fold_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.product_Fold_Status, onChange: handleFieldChange }}
                    >
                      {cusStatus.map(foldStatus => (
                        <MenuItem key={foldStatus.value} value={foldStatus.value}>
                          {foldStatus.label}
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
export default FormFold;
