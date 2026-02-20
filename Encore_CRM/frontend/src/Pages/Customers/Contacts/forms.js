import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../../Common/staticjson";
import { HeadingFour, MyDiv, InputField } from "../../Common/Components";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormContact({ handleClose, contactInfo, customerId }) {
  const [btnLoading, setBtnLoading] = useState(false);
  let contactInfoId = contactInfo;
  const [data, setData] = useState({
    account_Contact_FName: "",
    account_Contact_Email: "",
    account_Contact_Phone: "",
    account_Contact_Status: "",
  });

  const loadSpecificContact = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-account-contact-data/` + contactInfoId;
    axios
      .get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      })
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
  }, [contactInfoId]);

  useEffect(() => {
    if (contactInfo !== undefined) {
      loadSpecificContact();
    }
  }, [contactInfo, loadSpecificContact]);

  const handleChangeWhiteSpace = e => {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  };

  const handleChange = useCallback(e => {
    const { id, value, isValid } = e;
    if (e.type === "phone" && !isValid && value) return;
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
    const url = contactInfoId
      ? API_BASE_URL + "update-specific-account-contact-data/" + contactInfoId + `/Store`
      : API_BASE_URL + "add-account-contact-data/" + customerId;
    const method = contactInfoId ? "patch" : "post";
    axios({
      method,
      url,
      data,
      headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
    })
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
            <HeadingFour className="card-title">{contactInfo ? "Edit" : "Add"} Contact</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Contact_FName"
                      label="Contact First Name"
                      value={data.account_Contact_FName}
                      variant="standard"
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <InputField
                      type="email"
                      id="account_Contact_Email"
                      label="Email ID"
                      value={data.account_Contact_Email}
                      onChange={handleChange}
                      required
                    />
                  </Col>
                  <Col md={12}>
                    <InputField
                      type="phone"
                      id="account_Contact_Phone"
                      label="Phone Number"
                      value={data.account_Contact_Phone}
                      onChange={handleChange}
                      required
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="account_Contact_Status"
                      id="account_Contact_Status"
                      variant="standard"
                      label="Status"
                      SelectProps={{ value: data.account_Contact_Status, onChange: handleFieldChange }}>
                      {cusStatus.map(contactStatus => (
                        <MenuItem key={contactStatus.value} value={contactStatus.value}>
                          {contactStatus.label}
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
export default FormContact;

FormContact.propTypes = {
  handleClose: PropTypes.any,
  contactInfo: PropTypes.any,
  customerId: PropTypes.any,
};
