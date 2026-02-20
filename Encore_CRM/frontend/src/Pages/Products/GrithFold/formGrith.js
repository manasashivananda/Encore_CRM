import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { HeadingFour, MyDiv } from "../../Common/Components";
import { cusStatus } from "../../Common/staticjson";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormGirth({ handleClose, girthInfo }) {
  let girthInfoId = girthInfo;
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState({
    product_Girth: "",
    product_Girth_Status: "",
  });

  const loadSpecificGrith = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-product-girth-data/` + girthInfoId;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })

      .then(
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
  }, [girthInfoId]);

  useEffect(() => {
    if (girthInfo !== undefined) {
      loadSpecificGrith();
    }
  }, [girthInfo, loadSpecificGrith]);

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
    const url = girthInfoId ? API_BASE_URL + "update-specific-product-girth-data/" + girthInfoId : API_BASE_URL + "add-product-girth-data";
    const method = girthInfoId ? "patch" : "post";
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
            <HeadingFour className="card-title">{girthInfo ? "Edit" : "Add"} Girth</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="product_Girth" label="Girth Name" value={data.product_Girth} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="product_Girth_Status"
                      id="product_Girth_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.product_Girth_Status, onChange: handleFieldChange }}
                    >
                      {cusStatus.map(girthStatus => (
                        <MenuItem key={girthStatus.value} value={girthStatus.value}>
                          {girthStatus.label}
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
export default FormGirth;
