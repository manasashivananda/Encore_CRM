import React, { useState } from "react";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { HeadingFour, MyDiv } from "../../Common/Components";
import PropTypes from "prop-types";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCustomerFeedback({ handleClose, feedbackData, customerId }) {
  const [btnLoading, setBtnLoading] = useState(false);
  const [data, setData] = useState(
    feedbackData || {
      feedback_text: "",
    }
  );

  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.value,
    }));
  };

  function submit(e) {
    e.preventDefault();

    setBtnLoading(true);
    const url = feedbackData
      ? API_BASE_URL + "update-customer-feedback/" + feedbackData._id
      : API_BASE_URL + "add-customer-feedback/" + customerId;
    const method = feedbackData ? "patch" : "post";
    
    axios({
      method,
      url,
      data,
      headers: { 
        "x-access-token": localStorage.getItem("token"), 
        Accept: "application/json", 
        "Content-Type": "application/json" 
      },
    })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: res.data || "Feedback saved successfully",
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
          text: error.response?.data || "An error occurred",
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
            <HeadingFour className="card-title">
              {feedbackData ? "Edit" : "Add"} Feedback
            </HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField
                      required
                      fullWidth
                      multiline
                      rows={8}
                      id="feedback_text"
                      name="feedback_text"
                      label="Feedback"
                      value={data.feedback_text}
                      variant="standard"
                      onChange={handleFieldChange}
                      placeholder="Enter customer feedback here..."
                    />
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

export default FormCustomerFeedback;

FormCustomerFeedback.propTypes = {
  handleClose: PropTypes.func.isRequired,
  feedbackData: PropTypes.object,
  customerId: PropTypes.any.isRequired,
};