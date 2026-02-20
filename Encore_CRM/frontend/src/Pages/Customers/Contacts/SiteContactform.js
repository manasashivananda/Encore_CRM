import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, Checkbox } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { cusStatus } from "../../Common/staticjson";
import { HeadingFour, MyDiv } from "../../Common/Components";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const RolePermission = JSON.parse(localStorage.getItem("role"));

function FormSiteContact({ handleClose, contactInfo, customerId }) {
  const [btnLoading, setBtnLoading] = useState(false);
  let contactInfoId = contactInfo;
  const [data, setData] = useState({
    account_Contact_FName: "",
    account_Contact_Phone: "",
    account_Contact_Status: "",
    account_Contact_Verified: false,
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

    const contactRaw = data.account_Contact_Phone.replace(/\s/g, "");
    if (contactRaw && contactRaw !== "0" && !/^(03|04)\d{8}$/.test(contactRaw)){
      swal.fire({
        title: "Validation Error",
        text: "Please enter a valid Attention Contact number (10 digits starting with 0 or 03 or 04).",
        icon: "warning",
      });
      return;
    }

    setBtnLoading(true);
    const url = contactInfoId
      ? API_BASE_URL + "update-specific-account-contact-data/" + contactInfoId + `/Site`
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
            <HeadingFour className="card-title">{contactInfo ? "Edit" : "Add"} Site Contact</HeadingFour>
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
                      onKeyDown={(e) => {
                        // Allow control keys
                        if (
                          e.key === "Backspace" ||
                          e.key === "Delete" ||
                          e.key === "ArrowLeft" ||
                          e.key === "ArrowRight" ||
                          e.key === "Tab"
                        ) {
                          return;
                        }

                        // Block special characters (allow only letters, numbers, space)
                        if (!/^[a-zA-Z ]$/.test(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => handleChangeWhiteSpace(e)}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="account_Contact_Phone"
                      name="account_Contact_Phone"
                      label="Phone Number"
                      value={data.account_Contact_Phone}
                      variant="standard"
                      sx={{ width: 220 }}
                      inputProps={{
                        inputMode: "numeric",
                        pattern: "[0-9 ]*",
                        maxLength: 12,
                      }}
                      error={
                        !!data.account_Contact_Phone &&
                        data.account_Contact_Phone !== "0" &&
                        !/^(03|04)\d{8}$/.test(
                          data.account_Contact_Phone.replace(/\s/g, "")
                        )
                      }
                      onChange={e => {
                        let raw = e.target.value.replace(/\D/g, ""); // Strip non-digits

                        let formatted = "";

                        // Only allow 10 digits starting with 0
                        if (raw.length > 10) raw = raw.slice(0, 10);

                        if (/^0\d{0,9}$/.test(raw)) {
                          // Mobile format: 04XX XXX XXX or Landline: 0X XXXX XXXX
                          if (/^04/.test(raw)) {
                            if (raw.length <= 4) {
                              formatted = raw;
                            } else if (raw.length <= 7) {
                              formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`;
                            } else if (raw.length <= 10) {
                              formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
                            }
                          } else if (/^0[2378]/.test(raw)) {
                            if (raw.length <= 2) {
                              formatted = raw;
                            } else if (raw.length <= 6) {
                              formatted = `${raw.slice(0, 2)} ${raw.slice(2)}`;
                            } else if (raw.length <= 10) {
                              formatted = `${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6, 10)}`;
                            }
                          } else {
                            formatted = raw;
                          }
                        } else {
                          formatted = raw;
                        }

                        setData(prev => ({
                          ...prev,
                          account_Contact_Phone: formatted
                        }));
                      }}
                      onKeyDown={e => {
                        const invalidKeys = ["e", "E", "+", "-", ".", ","];
                        if (invalidKeys.includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
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
                  {RolePermission && RolePermission?.VerifyCustomerContact?.edit === "1" ? (
                    <Col md={12}>
                      <Checkbox
                        name="account_Contact_Verified"
                        checked={data.account_Contact_Verified || false}
                        onChange={handleFieldChange}
                      />
                      Verify Contact
                    </Col>
                  ) : null}
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
export default FormSiteContact;

FormSiteContact.propTypes = {
  handleClose: PropTypes.any,
  contactInfo: PropTypes.any,
  customerId: PropTypes.any,
};
