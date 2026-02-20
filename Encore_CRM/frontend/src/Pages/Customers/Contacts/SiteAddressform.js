import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { HeadingFour, MyDiv } from "../../Common/Components";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormSiteAddress({ handleClose, addressInfo, customerId }) {
  const [btnLoading, setBtnLoading] = useState(false);
  let addressInfoId = addressInfo;
  const [data, setData] = useState({
    account_Site_Address_line_one: "",
    account_Site_City: "",
    account_Site_Postalcode: "",
    account_Site_Country: "",
    account_Site_State: "",
    // account_Site_Notes: "",
    account_Site_Details: ""
  });

  const loadSpecificContact = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-account-address-data/` + addressInfoId;
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
  }, [addressInfoId]);

  useEffect(() => {
    if (addressInfo !== undefined) {
      loadSpecificContact();
    }
  }, [addressInfo, loadSpecificContact]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = addressInfoId ? API_BASE_URL + "update-specific-account-address-data/" + addressInfoId : API_BASE_URL + "add-account-address-data/" + customerId;
    const method = addressInfoId ? "patch" : "post";
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
            <HeadingFour className="card-title">{addressInfo ? "Edit" : "Add"} Address</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Site_Address_line_one"
                      label="Address Line"
                      value={data.account_Site_Address_line_one}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField required id="account_Site_City" label="City" value={data.account_Site_City} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Site_Postalcode"
                      label="Postal Code"
                      type="number"
                      value={data.account_Site_Postalcode}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField required id="account_Site_Country" label="Country" value={data.account_Site_Country} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  <Col md={12}>
                    <TextField required id="account_Site_State" label="State" value={data.account_Site_State} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col>
                  {/* <Col md={12}>
                    <TextField id="account_Site_Notes" label="Notes" value={data.account_Site_Notes} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                  </Col> */}
                  <Col md={12}>
                    <TextField id="account_Site_Details" label="Site Info" value={data.account_Site_Details} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
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
export default FormSiteAddress;

FormSiteAddress.propTypes = {
  handleClose: PropTypes.any,
  addressInfo: PropTypes.any,
  customerId: PropTypes.any,
};
