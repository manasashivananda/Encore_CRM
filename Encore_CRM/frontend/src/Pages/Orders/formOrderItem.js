import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Button, Spinner } from "react-bootstrap";
import { TextField, Switch, FormControlLabel } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { useParams } from "react-router-dom";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormOrderItem({ handleClose, userInfo, CoreOrderDetails }) {
  let { id } = useParams();
  let userInfoId = userInfo ? userInfo._id : "";
  const [isSubmitDisabled, setIsSubmitDisabled] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [data, setData] = useState({
    order_item_code: "",
    order_item_description: "",
    order_item_pieces: "",
    order_item_length: "",
    order_item_price: "",
    order_item_discount: "",
  });

  useEffect(() => {
    if (userInfoId) {
      const loadSpecificOrderItem = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}fetch-specific-order-item-details/${userInfoId}`, {
            headers: {
              "x-access-token": localStorage.getItem("token"),
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          });
          setData(response.data[0]);
          if (parseFloat(response.data[0].order_item_discount) > 0) {
            setShowDiscount(true);
          }
        } catch (error) {
          swal.fire({ text: error.response?.data || "Error fetching data", icon: "error" });
        }
      };

      loadSpecificOrderItem();
    }
  }, [userInfoId]);

  const handleChange = e => {
    const { id, value } = e.target;
    setData(prevData => ({ ...prevData, [id]: value }));
  };
  const handleFocus = e => {
    if (e.target.id === "order_item_code") {
      setIsSubmitDisabled(true);
    }
  };
  const handleBlur = e => {
    if (e.target.id === "order_item_code" && data.order_item_code.trim()) {
      fetchItemPrice(data.order_item_code);
    }
  };
  const fetchItemPrice = async itemCode => {
    try {
      setIsSubmitDisabled(true);
      const response = await axios.get(`${API_BASE_URL}fetch-item-price/${itemCode}/${CoreOrderDetails.account_ID}`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setData(prevData => ({ ...prevData, order_item_price: response.data[0].price_Values, order_item_description: response.data[0].finalItemDescription }));
      setIsSubmitDisabled(false);
    } catch (error) {
      setIsSubmitDisabled(true);
      swal.fire({ text: error.response?.data.error || "Error fetching price", icon: "error" });
    }
  };

  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    const url = userInfoId ? API_BASE_URL + "update-specific-order-item-details/" + userInfoId : API_BASE_URL + "add-order-item-details/" + id;
    const method = userInfoId ? "patch" : "post";
    const updatedData = {
      ...data,
      order_item_discount: showDiscount ? data.order_item_discount : "0",
    };
    axios({ method, url, data: updatedData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
            type: "success",
          });
          handleClose();
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
            <HeadingFour className="card-title">{userInfo ? "Edit" : "Add"} Flashing Item</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField required id="order_item_code" label="ITEM Code" value={data.order_item_code} variant="standard" onChange={handleChange} onFocus={handleFocus} onBlur={handleBlur} />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="order_item_description"
                      label="ITEM Description"
                      value={data.order_item_description}
                      variant="standard"
                      onChange={handleChange}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </Col>
                  <Col md={12}>
                    <TextField
                      required
                      id="order_item_pieces"
                      label="Pieces"
                      value={data.order_item_pieces}
                      variant="standard"
                      inputProps={{
                        inputMode: "numeric",
                        pattern: "^[0-9]*$",
                      }}
                      onKeyDown={e => {
                        const invalidKeys = ["e", "E", "+", "-", "."];
                        if (invalidKeys.includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => {
                        const value = e.target.value;
                        const regex = /^[0-9]*$/;
                        if (regex.test(value) || value === "") {
                          handleChange(e);
                        }
                      }}
                    />
                  </Col>

                  <Col md={12}>
                    <TextField
                      required
                      id="order_item_length"
                      label="Length"
                      value={data.order_item_length}
                      variant="standard"
                      inputProps={{
                        inputMode: "decimal",
                        pattern: "^\\d{1,4}(\\.\\d{0,2})?$",
                      }}
                      onKeyDown={e => {
                        const invalidKeys = ["e", "E", "+", "-"];
                        if (invalidKeys.includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => {
                        const value = e.target.value;
                        const regex = /^\d{0,4}(\.\d{0,2})?$/;
                        if (regex.test(value) || value === "") {
                          handleChange(e);
                        }
                      }}
                    />
                  </Col>

                  <Col md={12}>
                    <TextField
                      required
                      id="order_item_price"
                      label="Unit Price"
                      value={data.order_item_price}
                      variant="standard"
                      inputProps={{
                        inputMode: "decimal",
                        pattern: "^\\d+(\\.\\d{0,2})?$",
                      }}
                      onKeyDown={e => {
                        const invalidKeys = ["e", "E", "+", "-"];
                        if (invalidKeys.includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => {
                        const value = e.target.value;
                        const regex = /^\d*(\.\d{0,2})?$/;
                        if (regex.test(value) || value === "") {
                          handleChange(e);
                        }
                      }}
                    />
                  </Col>

                  <Col md={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={showDiscount}
                          onChange={() => {
                            setShowDiscount(prev => {
                              const next = !prev;
                              if (!next) {
                                setData(prevData => ({ ...prevData, order_item_discount: "0" }));
                              }
                              return next;
                            });
                          }}
                          name="toggleDiscount"
                          color="primary"
                        />
                      }
                      label="Add Discount"
                    />
                  </Col>
                  {showDiscount && (
                    <Col md={12}>
                      <TextField
                        id="order_item_discount"
                        label="Discount Percentage"
                        value={data.order_item_discount}
                        variant="standard"
                        inputProps={{
                          inputMode: "decimal",
                          pattern: "^\\d+(\\.\\d{0,2})?$",
                        }}
                        onKeyDown={e => {
                          const invalidKeys = ["e", "E", "+", "-"];
                          if (invalidKeys.includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={e => {
                          let value = e.target.value;
                          const regex = /^\d*(\.\d{0,2})?$/;
                          if (regex.test(value) || value === "") {
                            const floatVal = parseFloat(value);
                            if (value === "" || (!isNaN(floatVal) && floatVal <= 100)) {
                              handleChange(e);
                            }
                          }
                        }}
                      />
                    </Col>
                  )}
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Please wait...</span>
                        </span>
                      </Button>
                    ) : (
                      <Button type="submit" className="FormBtn" disabled={isSubmitDisabled}>
                        Submit
                      </Button>
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
export default FormOrderItem;

FormOrderItem.propTypes = {
  handleClose: PropTypes.any,
  userInfo: PropTypes.any,
  CoreOrderDetails: PropTypes.any,
};
