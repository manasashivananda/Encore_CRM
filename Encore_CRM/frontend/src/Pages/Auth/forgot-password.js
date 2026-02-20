import React, { useState } from "react";
import axios from "axios";
import swal from "sweetalert2";
import { Container, Row, Col, Spinner, Button } from "react-bootstrap";
import { HeadingFour, MyDiv } from "../Common/Components";
import TextField from "@mui/material/TextField";
import { Link, useNavigate } from "react-router-dom";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function CoreForgotPassword() {
  const navigate = useNavigate();
  const [btnLoading, setBtnLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleFormSubmit = e => {
    e.preventDefault();
    setBtnLoading(true);
    const data = { email_id: email };

    axios
      .post(`${API_BASE_URL}forgot-password`, data)
      .then(() => {
        swal.fire({
          text: "Password Reset Link Sent to your Email",
          icon: "success",
          type: "success",
        });
        navigate("/login");
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
        setBtnLoading(false);
      });
  };

  const handleEmailChange = e => {
    setEmail(e.target.value);
  };

  return (
    <Container className="LoginPage">
      <Row className="row GeneralHeading login-form justify-content-center">
        <Col md={7} className="loginContainer">
          <Row>
            <Col md={6} className="loginLeft text-center">
              <MyDiv className="loginLogo">
                <img src={require("../../Assets/images/logo.png")} alt="logo" />
              </MyDiv>
            </Col>
            <Col md={6} className="text-center loginRight">
              <form onSubmit={handleFormSubmit}>
                <HeadingFour className="card-title login-head">
                  ENCORE CRM APPLICATION
                  <br />
                  <br />
                  Forgot password
                </HeadingFour>
                <Col md={12} className="forgotField">
                  <TextField required id="email_id" className="width-100" label="Email Id" value={email} variant="standard" onChange={handleEmailChange} />
                </Col>
                <Col md={12}>
                  {btnLoading ? (
                    <Button variant="primary" disabled className="mt-4 w-100">
                      <span aria-live="polite" className="d-inline-flex align-items-center">
                        <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                        <span className="visually-hidden">Loading...</span>
                      </span>
                    </Button>
                  ) : (
                    <button type="submit" className="btn primary-btn add-cta w-100 mt-5">
                      SUBMIT
                    </button>
                  )}
                </Col>
                <Col md={12} className="text-end">
                  <Link to="/login" className="mt-4 d-block">
                    Back to Login
                  </Link>
                </Col>
              </form>
            </Col>
          </Row>
        </Col>
      </Row>
    </Container>
  );
}

export default CoreForgotPassword;
