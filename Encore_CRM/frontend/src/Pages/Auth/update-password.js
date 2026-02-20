import React from "react";
import { Col, Row, Container } from "react-bootstrap";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import swal from "sweetalert2";
import Form from "react-bootstrap/Form";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";
import CryptoJS from "crypto-js";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const SECRET_KEY = process.env.REACT_APP_SECRET_KEY;

function CoreUpdatePassword() {
  const navigate = useNavigate();
  const { id } = useParams();

  const validationSchema = Yup.object().shape({
    newPassword: Yup.string().required("New Password is required").min(6, "Password must be at least 6 characters"),
    confirmPassword: Yup.string()
      .required("Confirm Password is required")
      .oneOf([Yup.ref("newPassword")], "Passwords must match"),
  });

  const formOptions = { resolver: yupResolver(validationSchema) };
  const { register, handleSubmit, reset, formState } = useForm(formOptions);
  const { errors } = formState;

  const onSubmit = async data => {
    try {
      const encryptedConfirmPassword = CryptoJS.AES.encrypt(data.confirmPassword, SECRET_KEY).toString();
      const encryptedNewPassword = CryptoJS.AES.encrypt(data.newPassword, SECRET_KEY).toString();

      const requestData = {
        securityToken: id,
        confirmPassword: encryptedConfirmPassword,
        newPassword: encryptedNewPassword,
      };

      const response = await axios.post(`${API_BASE_URL}update-forgot-password`, requestData);

      if (response.status === 200) {
        swal.fire({
          text: "Successfully Updated, Please login again",
          icon: "success",
        });
        navigate("/");
      }
    } catch (error) {
      swal.fire({
        text: error.response?.data || "An error occurred",
        icon: "error",
      });
    }
    reset();
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
            <Col md={6} className="text-center loginRight updatePasswordPage">
              <form onSubmit={handleSubmit(onSubmit)}>
                <HeadingFour className="card-title login-head">
                  ENCORE CRM APPLICATION
                  <br />
                  <br />
                  Update Password
                </HeadingFour>

                {/* Hidden Security Token */}
                <input type="hidden" {...register("securityToken")} value={id} />

                <Row className="mb-4">
                  <Col md={12}>
                    <Form.Control type="password" placeholder="New Password" {...register("newPassword")} className={`${errors.newPassword ? "is-invalid" : ""}`} />
                    <div className="invalid-feedback">{errors.newPassword?.message}</div>
                  </Col>
                </Row>

                <Row className="mb-4">
                  <Col md={12}>
                    <Form.Control type="password" placeholder="Confirm Password" {...register("confirmPassword")} className={`${errors.confirmPassword ? "is-invalid" : ""}`} />
                    <div className="invalid-feedback">{errors.confirmPassword?.message}</div>
                  </Col>
                </Row>

                <Row className="mb-4">
                  <Col md={12}>
                    <MyDiv>
                      <button type="submit" className="btn primary-btn add-cta mt-2 mb-3">
                        Update Password
                      </button>
                      &nbsp;
                      <button type="button" onClick={() => reset()} className="btn secondary-btn add-cta mt-2 mb-3">
                        Reset
                      </button>
                    </MyDiv>
                  </Col>
                </Row>

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

export default CoreUpdatePassword;
