import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, MyDiv, InputField } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../Common/staticjson";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCustomer({ handleClose, customerInfo }) {
  const [btnLoading, setBtnLoading] = useState(false);
  let customerInfoId = customerInfo;
  const [data, setData] = useState({
    account_Name: "",
    account_Address_Email: "",
    account_Address_Phone: "",
    account_Address_line_one: "",
    account_Address_Country: "",
    account_Address_State: "",
    account_Address_City: "",
    account_Address_PostalCode: "",
    account_StoreAddress: "",
    account_Status: "",
  });

  useEffect(() => {
    if (customerInfo !== undefined) {
      const loadSpecificCustomer = async () => {
        const url = `${API_BASE_URL}fetch-specific-account-data/${customerInfoId}`;
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
      };

      loadSpecificCustomer();
    }
  }, [customerInfo, customerInfoId]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };
  const handleChange = useCallback(e => {
    const { id, value, isValid } = e;
    if (e.type === "phone" && !isValid && value) return; // Ignore invalid phone numbers
    setData(prev => ({ ...prev, [id]: value }));
  }, []);
  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };
  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = customerInfoId
      ? API_BASE_URL + "update-specific-account-data/" + customerInfoId
      : API_BASE_URL + "add-account-data";
    const method = customerInfoId ? "patch" : "post";
    axios({
      method,
      url,
      data,
      headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
    })
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
            <HeadingFour className="card-title">{customerInfo ? "Edit" : "Add"} Customers</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Name"
                      label="Customer Name"
                      value={data.account_Name}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_Email"
                      label="Customer Email"
                      value={data.account_Address_Email}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <InputField
                      type="phone"
                      id="account_Address_Phone"
                      label="Phone Number"
                      value={data.account_Address_Phone}
                      onChange={handleChange}
                      required
                    />

                    {/* <PhoneNumberInput
                      id="account_Address_Phone"
                      label="Customer Phone"
                      value={data.account_Address_Phone}
                      onChange={e => handlePhoneChange(e)}
                    /> */}
                  </Col>
                  <Col md={12}>
                    <TextField
                      id="account_StoreAddress"
                      label="Store Name"
                      value={data.account_StoreAddress}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_line_one"
                      label="Address Line One"
                      value={data.account_Address_line_one}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_Country"
                      label="Country Code"
                      value={data.account_Address_Country}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_State"
                      label="State Code"
                      value={data.account_Address_State}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_City"
                      label="City"
                      value={data.account_Address_City}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Address_PostalCode"
                      label="Postal Code"
                      type="number"
                      value={data.account_Address_PostalCode}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>

                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="account_Status"
                      id="account_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.account_Status, onChange: handleFieldChange }}>
                      {cusStatus.map(customerStatus => (
                        <MenuItem key={customerStatus.value} value={customerStatus.value}>
                          {customerStatus.label}
                        </MenuItem>
                      ))}
                    </TextField>
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
export default FormCustomer;
